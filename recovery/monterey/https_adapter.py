"""Fixed recovery HTTPS transport. Import/construct never makes a network request.

No CLI, credential reader, sign-in, refresh, arbitrary URL/SQL, proxy or retry.
The caller must supply a separately reviewed, time-bounded recovery permit.
"""
import http.client
import base64
import json
import multiprocessing
import os
import re
import ssl
import time
import threading
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from p1_recovery import APPROVED, Commands, Stop, load_capsule

MAX_BYTES = 1048576
DEADLINE = 8


@dataclass(frozen=True, repr=False)
class RecoveryPermit:
    target: str
    operation: str
    expires: int
    review: str = field(repr=False)


def _exchange(request, headers):
    """One direct TLS connection; response bodies never enter errors or logs."""
    if any(os.environ.get(name) for name in ('SSLKEYLOGFILE','SSL_CERT_FILE','SSL_CERT_DIR','PYTHONHTTPSVERIFY','OPENSSL_CONF','OPENSSL_MODULES')):
        raise Stop('Unapproved TLS environment; no connection attempted')
    url = urlsplit(request.url)
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.set_ciphers("ECDHE+AESGCM:ECDHE+CHACHA20")
    connection = http.client.HTTPSConnection(url.hostname, 443, timeout=DEADLINE, context=context)
    try:
        body = None if request.body is None else json.dumps(request.body).encode()
        connection.request(request.method, url.path + ("?" + url.query if url.query else ""), body, headers)
        response = connection.getresponse()
        # No redirect following, compression, cookie jar or environmental proxies.
        if response.getheader("Content-Encoding", "identity") != "identity":
            raise Stop("Encoded recovery response rejected")
        length = response.getheader("Content-Length")
        if length is not None and (not length.isdigit() or int(length) > MAX_BYTES):
            raise Stop("Recovery response exceeds bound")
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES or not 200 <= response.status < 300:
            raise Stop("Recovery response unconfirmed")
        return None if response.status == 204 else json.loads(data)
    finally:
        connection.close()


def _child(pipe):
    # Spawn, not fork. Secrets arrive through a private inherited IPC handle,
    # never command arguments/environment/files. Parent bounds DNS/TLS/body time.
    try:
        request, headers = pipe.recv()
        pipe.send((True, _exchange(request, headers)))
    except BaseException:
        pipe.send((False, None))
    finally:
        pipe.close()


def bounded_exchange(request, headers):
    context = multiprocessing.get_context("spawn")
    parent, child = context.Pipe()
    process = context.Process(target=_child, args=(child,), daemon=True)
    try:
        process.start()
        child.close()
        parent.send((request, headers))
        if not parent.poll(DEADLINE):
            raise Stop("Recovery outcome UNKNOWN; no automatic retry")
        ok, value = parent.recv()
        if not ok:
            raise Stop("Recovery outcome unconfirmed; no automatic retry")
        return value
    except BaseException:
        raise Stop("Recovery outcome unconfirmed; no automatic retry") from None
    finally:
        parent.close()
        child.close()
        if process.pid:
            if process.is_alive():
                process.terminate()
            process.join(0.2)
            if process.is_alive():
                process.kill()
                process.join(0.2)


class HTTPSPorts:
    """Application allowlist is not a server-scoped management token.

    Credentials are injected only in memory after separate approval. Tests replace
    bounded_exchange; no real transport request is made by the local test suite.
    """
    def __init__(self, capsule_directory, permit, management_token, publishable_key, clock=time.time):
        # Re-read the exact original hash-bound capsule, never trust a caller's
        # hand-constructed Capsule/SQL even if it claims the approved hash.
        capsule = load_capsule(capsule_directory)
        if (capsule.operation_hash != APPROVED or permit.operation != APPROVED
                or permit.target != capsule.target or not re.fullmatch(r"[a-f0-9]{64}", permit.review)
                or type(permit.expires) is not int or not clock() < permit.expires <= clock() + 3600
                or not re.fullmatch(r"sbp_fc[A-Za-z0-9_-]{20,2048}", management_token)
                or not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", publishable_key)):
            raise Stop("Exact separately reviewed recovery permit and custody required")
        self.commands = Commands(capsule)
        self.capsule = capsule
        self._permit = permit
        self._management = management_token
        self._key = publishable_key
        self._clock = clock
        self._start = time.monotonic()
        self._duration = permit.expires - clock()
        self._verified = {}
        self._lock = threading.Lock()

    def __repr__(self):
        return "HTTPSPorts(credentials_redacted, fixed_recovery_only)"

    def _send(self, request, expected):
        if request != expected:
            raise Stop("Request outside frozen recovery allowlist")
        if self._clock() >= self._permit.expires or time.monotonic() - self._start >= self._duration:
            raise Stop("Recovery permit expired; containment remains required")
        headers = {"Accept": "application/json", "Content-Type": "application/json", "Accept-Encoding": "identity"}
        if request.token:
            if not re.fullmatch(r"[A-Za-z0-9_.-]{16,16384}", request.token):
                raise Stop("Invalid bearer framing")
            headers.update({"Authorization": "Bearer " + request.token, "apikey": self._key})
        else:
            headers["Authorization"] = "Bearer " + self._management
        return bounded_exchange(request, headers)

    def user(self, request):
        if not request.token:
            raise Stop("Exact user bearer required")
        try:
            part=request.token.split('.')[1]
            claims=json.loads(base64.urlsafe_b64decode(part+'='*(-len(part)%4)))
            if (claims.get('sub') not in {a[0] for a in self.capsule.actors.values()}
                    or claims.get('iss') != 'https://'+self.capsule.target+'.supabase.co/auth/v1'
                    or claims.get('role') != 'authenticated' or type(claims.get('exp')) is not int
                    or claims['exp'] <= self._clock()
                    or not re.fullmatch(r'[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}',claims.get('session_id',''))):
                raise Stop('Exact session binding required')
            result=self._send(request, self.commands.user(request.token))
            if (not isinstance(result,dict) or result.get('id') != claims['sub']
                    or not result.get('email_confirmed_at') or result.get('is_anonymous')):
                raise Stop('Authenticated staff binding required')
            with self._lock:
                self._verified[request.token]=claims['exp']
            return result
        except Exception:
            raise Stop('Exact authenticated recovery session unconfirmed') from None

    def observe(self, request):
        result = self._send(request, self.commands.observe())
        if not isinstance(result, list) or len(result) != 1 or set(result[0]) != {"state"}:
            raise Stop("Fixed observation unconfirmed")
        return result[0]["state"]

    def deactivate(self, request):
        self._send(request, self.commands.deactivate())

    def logout(self, request):
        if not request.token:
            raise Stop("Exact session bearer required")
        with self._lock:
            if self._verified.get(request.token,0) <= self._clock():
                raise Stop('Fresh authenticated custody required before exact logout')
        self._send(request, self.commands.logout(request.token))
