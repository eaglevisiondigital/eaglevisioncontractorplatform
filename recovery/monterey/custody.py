"""Authenticated encrypted file-message custody; no network, login or key reader.

Keys are per-run random 256-bit secrets supplied in memory by approved OS custody.
AES-GCM and HKDF are provided by hash-pinned cryptography, never custom ciphers.
"""
import base64
import fcntl
import hashlib
import hmac
import json
import os
import re
import stat
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from p1_recovery import Stop


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def b64(value):
    return base64.b64encode(value).decode()


class Cipher:
    def __init__(self, key, operation, target, run):
        if len(key) != 32 or str(uuid.UUID(run)) != run:
            raise Stop("Per-run custody key and identifier required")
        self.binding = {"operation": operation, "target": target, "run": run, "protocol": "propel-p1-custody-v1"}
        material = HKDF(algorithm=hashes.SHA256(), length=64,
                        salt=hashlib.sha256(canonical(self.binding)).digest(),
                        info=b"propel-p1-custody-v1").derive(key)
        self._aes = AESGCM(material[:32])
        self._mac = material[32:]

    def __repr__(self):
        return "Cipher(per_run_keys_redacted)"

    def seal(self, value, purpose):
        nonce = os.urandom(12)
        aad = canonical({**self.binding, "purpose": purpose})
        return b64(nonce + self._aes.encrypt(nonce, canonical(value), aad))

    def open(self, packet, purpose):
        try:
            if not isinstance(packet, str) or len(packet) > 65536:
                raise ValueError()
            raw = base64.b64decode(packet, validate=True)
            if len(raw) < 29:
                raise ValueError()
            return json.loads(self._aes.decrypt(raw[:12], raw[12:], canonical({**self.binding, "purpose": purpose})))
        except Exception:
            raise Stop("Authenticated custody envelope invalid") from None

    def ack(self, value):
        return {"receipt": value, "mac": hmac.new(self._mac, canonical({**self.binding, "receipt": value}), hashlib.sha256).hexdigest()}

    def verify_ack(self, ack, expected):
        if (not isinstance(ack, dict) or set(ack) != {"receipt", "mac"}
                or ack["receipt"] != expected or not isinstance(ack["mac"], str)
                or not hmac.compare_digest(self.ack(expected)["mac"], ack["mac"])):
            raise Stop("Positive backup acknowledgment required")


class Vault:
    """Second-device encrypted append-only log, fsynced before acknowledgments.

    Each transaction holds a cross-process flock. Corruption/truncation of a record
    fails closed. Whole-store rollback cannot be solved by encryption: retain an
    independently witnessed receipt/head and never restore/reuse an old run/key.
    """
    def __init__(self, root, cipher):
        self.root, self.cipher = Path(root), cipher
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.root.is_symlink() or self.root.stat().st_mode & 0o077:
            raise Stop("Private independent custody directory required")
        self.path = self.root / "custody.encrypted.jsonl"
        self.lock = threading.Lock()

    def __repr__(self):
        return "Vault(encrypted_independent_custody)"

    def transact(self, change):
        with self.lock:
            fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX)
                s = os.fstat(fd)
                if not stat.S_ISREG(s.st_mode) or s.st_mode & 0o077 or s.st_size > 4194304:
                    raise Stop("Unsafe custody store")
                with os.fdopen(fd, "r+b", closefd=False) as out:
                    data = out.read()
                    if data and not data.endswith(b"\n"):
                        raise Stop("Interrupted custody write; no acknowledgment")
                    values, previous = [], "0" * 64
                    for line in data.splitlines():
                        item = self.cipher.open(line.decode(), "journal")
                        if item["sequence"] != len(values) + 1 or item["previous"] != previous:
                            raise Stop("Custody chain mismatch")
                        values.append(item["value"])
                        previous = hashlib.sha256(line).hexdigest()
                    value, result = change(values)
                    if value is not None:
                        packet = self.cipher.seal({"sequence": len(values) + 1, "previous": previous, "value": value}, "journal").encode()
                        out.seek(0, os.SEEK_END)
                        out.write(packet + b"\n")
                        out.flush()
                        os.fsync(fd)
                        directory = os.open(self.root, os.O_RDONLY)
                        try:
                            os.fsync(directory)
                        finally:
                            os.close(directory)
                    return result
            except Exception:
                raise Stop("Independent custody unavailable; no acknowledgment") from None
            finally:
                os.close(fd)

    def entries(self):
        return self.transact(lambda values: (None, values))


class Backup:
    """No signing in. INTENT is durably acknowledged BEFORE external sign-in.

    A lost response leaves an unresolved intent. It blocks readiness and clean
    recovery permanently for that run; UID-only revocation/retry is never invented.
    """
    def __init__(self, cipher, vault, recovery, clock, expected_factors):
        self.cipher, self.vault, self.recovery, self.clock = cipher, vault, recovery, clock
        owners = {a for a in recovery.c.actors if a.endswith("-owner")}
        if set(expected_factors) != owners:
            raise Stop("Exact three existing owner factor bindings required")
        self.factors = dict(expected_factors)
        self.lock = threading.RLock()

    def receive(self, packet):
        with self.lock:
            return self._receive(packet)

    def _receive(self, packet):
        message = self.cipher.open(packet, "handoff")
        required = {"id", "alias", "kind", "issued", "token"}
        if (not isinstance(message, dict) or set(message) != required
                or message["alias"] not in self.recovery.c.actors
                or not isinstance(message["id"], str) or not re.fullmatch(r"[a-f0-9-]{36}", message["id"])
                or type(message["issued"]) is not int or not self.clock() - 60 <= message["issued"] <= self.clock() + 5
                or message["kind"] not in ("INTENT", "SESSION", "UPGRADE")
                or not isinstance(message["token"], str) or len(message["token"]) > 16384):
            raise Stop("Custody message outside reviewed scope")
        receipt = {"id": message["id"], "kind": message["kind"], "packetHash": hashlib.sha256(packet.encode()).hexdigest()}
        def commit(values):
            if self.recovery.attempted:
                raise Stop("Recovery already started")
            if any(x["id"] == message["id"] for x in values):
                raise Stop("Duplicate custody message; no automatic retry")
            prior = [x for x in values if x["alias"] == message["alias"]]
            if message["kind"] == "INTENT":
                if prior or message["token"]:
                    raise Stop("Exactly one creation intent per alias")
            else:
                expected = ["INTENT"] if message["kind"] == "SESSION" else ["INTENT", "SESSION"]
                if [x["kind"] for x in prior] != expected:
                    raise Stop("Creation intent or custody prerequisite absent")
                self.recovery.accept(message["alias"], message["token"])
                if message["kind"] == "UPGRADE":
                    # getUser was authenticated by Recovery.accept; enforce the
                    # existing TOTP factor independently, not user_metadata.
                    user = self.recovery.ports.user(self.recovery.commands.user(message["token"]))
                    claims = json.loads(base64.urlsafe_b64decode(message["token"].split('.')[1] + '==='))
                    if (message["alias"] not in self.factors or claims.get("aal") != "aal2"
                            or not any(f.get("id") == self.factors[message["alias"]]
                                       and f.get("factor_type") == "totp" and f.get("status") == "verified"
                                       for f in user.get("factors", []))):
                        raise Stop("Genuine existing-factor AAL2 required")
            return message, self.cipher.ack(receipt)
        # Return only AFTER encrypted record+directory fsync. A crash/remote Auth
        # failure before this point yields no receipt and must stop the primary.
        return self.vault.transact(commit)

    def restore(self, before=None):
        """Restart using only second-device encrypted custody, never primary files."""
        latest = {}
        for entry in self.vault.entries():
            if entry["kind"] in ("SESSION", "UPGRADE"):
                latest[entry["alias"]] = entry["token"]
        def verify(item):
            alias, token = item
            try:
                if before is not None:
                    # A previously authenticated, encrypted token may already be
                    # revoked by the primary's negative probe/cleanup. Absence
                    # must be observed, never inferred from a failed Auth call.
                    claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
                    pair=(claims['session_id'],self.recovery.c.actors[alias][0])
                    if pair not in {(s['id'],s['user_id']) for s in before['sessions']}:
                        return alias, 'ALREADY_ABSENT'
                return alias, self.recovery.verified_session(alias, token, cleanup_only=True)
            except Exception:
                return alias, None
        # One parallel bounded Auth batch, never15 serial eight-second waits.
        with ThreadPoolExecutor(max_workers=15) as pool:
            verified = list(pool.map(verify, latest.items()))
        for alias, session in verified:
            if session == 'ALREADY_ABSENT':
                self.recovery.sessions.pop(alias,None)
            elif session is not None:
                self.recovery.sessions[alias] = session
        if any(session is None for _, session in verified):
            raise Stop("Some independent custody could not be authenticated")

    def unresolved(self):
        values = self.vault.entries()
        return {x["alias"] for x in values if x["kind"] == "INTENT"} - {x["alias"] for x in values if x["kind"] == "SESSION"}

    def recover(self):
        with self.lock:
            return self._recover()

    def _recover(self):
        # Exact feature deactivation precedes any restore/Auth wait. No retry.
        result = self.recovery.recover(prepare_sessions=self.restore)
        try:
            unresolved=self.unresolved()
        except Exception:
            unresolved=True
        if unresolved:
            result["status"] = "CONTAINMENT_REQUIRED"
        return result


class Supervisor:
    """Second-device safety loop contract; no automatic human-presence renewal.

    A future approved device process calls tick at least once/second. The primary
    sends authenticated heartbeat messages, not a shared-disk process signal.
    All signals use per-run AEAD, fresh timestamps and strictly increasing counters.
    """
    def __init__(self, backup, wall, monotonic):
        self.backup, self.wall, self.monotonic = backup, wall, monotonic
        self.start_wall, self.start_mono = wall(), monotonic()
        self.presence = self.heartbeat = self.start_mono
        self.counter = 0
        self.result = None

    def human_present(self):
        # Only an actual recovery operator's action may call this method.
        if self.result is not None or self.monotonic() - self.presence >= 60:
            self.tick()
            raise Stop("Human-presence deadline already expired")
        self.presence = self.monotonic()

    def receive_heartbeat(self, packet):
        if self.result is not None or self.monotonic() - self.heartbeat > 5:
            self.tick()
            raise Stop("Independent heartbeat deadline already expired")
        value = self.backup.cipher.open(packet, "heartbeat")
        if (set(value) != {"counter", "issued"} or type(value["counter"]) is not int
                or value["counter"] <= self.counter or type(value["issued"]) is not int
                or not self.wall() - 5 <= value["issued"] <= self.wall() + 2):
            raise Stop("Fresh authenticated recovery heartbeat required")
        self.counter, self.heartbeat = value["counter"], self.monotonic()

    def tick(self):
        now, mono = self.wall(), self.monotonic()
        if self.result is None and (now < self.start_wall or mono < self.start_mono
                or now - self.start_wall >= 1740 or mono - self.start_mono >= 1740
                or mono - self.presence >= 60 or mono - self.heartbeat >= 5):
            # Latch before invoking recovery; even an exception cannot retry it.
            self.result = {'status':'CONTAINMENT_REQUIRED','hostedVerification':False,'automaticRetries':0}
            try:
                self.result = self.backup.recover()
            except BaseException:
                pass
        return self.result
