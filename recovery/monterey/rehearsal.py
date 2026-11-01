"""Two physical computers, synthetic data only. No hosted adapter or capsule input.

Direct private-IPv4 TCP carries existing AES-GCM envelopes, not plaintext custody.
There is deliberately no TLS/relay/account dependency in this disposable lab.
The pairing card is a random synthetic per-run key, never a service credential.
"""
import argparse
import base64
import copy
import fcntl
import getpass
import hashlib
import ipaddress
import json
import os
import select
import socket
import sys
import threading
import time
import uuid
from pathlib import Path
from contextlib import contextmanager

from custody import Backup, Cipher, Vault, canonical
from device import DeviceRuntime
from mailbox import private_directory, write_once
from p1_recovery import Capsule, OneShot, Recovery, Stop, private_bytes

PORT = 4187
MODE = "SYNTHETIC_ONLY_NOT_HOSTED_EVIDENCE"
OPERATION = hashlib.sha256(b"propel-two-device-synthetic-rehearsal-v1").hexdigest()
TARGET = "a" * 20
ROLES = ("owner", "estimator", "assigned-field", "unassigned-field", "revoked-staff")


def address(text, allow_loopback=False):
    ip = ipaddress.IPv4Address(text)
    private = any(ip in ipaddress.IPv4Network(n) for n in
                  ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
    if not private and not (allow_loopback and ip.is_loopback):
        raise Stop("Use a literal private LAN IPv4 address; no DNS, public host or tunnel")
    return str(ip)


def identity(run, name):
    return str(uuid.uuid5(uuid.UUID(run), "synthetic-only:" + name))


def capsule(run):
    orgs = tuple(identity(run, "company-" + str(i)) for i in range(1, 4))
    actors = {f"pilot-{i}-{role}": (identity(run, f"user-{i}-{role}"), orgs[i-1])
              for i in range(1, 4) for role in ROLES}
    return Capsule(TARGET, orgs, actors, "-- SYNTHETIC ONLY: no executable SQL", OPERATION)


def new_config(role):
    return {"mode": MODE, "role": role, "run": str(uuid.uuid4()),
            "created": int(time.time()), "key": base64.b64encode(os.urandom(32)).decode()}


def validate_config(c):
    if (set(c) != {"mode", "role", "run", "created", "key"} or c["mode"] != MODE
            or c["role"] not in ("backup", "primary") or type(c["created"]) is not int
            or str(uuid.UUID(c["run"])) != c["run"]
            or len(base64.b64decode(c["key"], validate=True)) != 32):
        raise Stop("Only a generated synthetic pairing card is accepted")
    return c


def cipher_for(c):
    validate_config(c)
    return Cipher(base64.b64decode(c["key"]), OPERATION, TARGET, c["run"])


def pairing_card(c):
    return base64.urlsafe_b64encode(canonical({**c, "role": "primary"})).decode()


def parse_card(card):
    if len(card) > 1024:
        raise Stop("Pairing card invalid")
    try:
        c = validate_config(json.loads(base64.b64decode(card, altchars=b"-_", validate=True)))
        if c["role"] != "primary" or not 0 <= time.time() - c["created"] < 180:
            raise Stop("Pairing card expired; no run was exercised")
        return c
    except Exception:
        raise Stop("Synthetic pairing card invalid or expired") from None


def fingerprint(c):
    return hashlib.sha256(canonical({k: v for k, v in c.items() if k != "role"})).hexdigest()[:24]


def make_token(c, alias, expired=False):
    uid = capsule(c["run"]).actors[alias][0]
    claims = {"sub": uid, "session_id": identity(c["run"], alias), "role": "authenticated",
              "aal": "aal2" if alias.endswith("owner") else "aal1",
              "iss": "https://" + TARGET + ".supabase.co/auth/v1", "exp": c["created"] - 1 if expired else c["created"] + 3600,
              "syntheticOnly": True}
    enc = lambda x: base64.urlsafe_b64encode(canonical(x)).decode().rstrip("=")
    sig = cipher_for(c).ack(claims)["mac"]
    return enc({"alg": "SYNTHETIC-HMAC-ONLY"}) + "." + enc(claims) + "." + sig


class SyntheticPorts:
    """Durable local simulated service. Request descriptions NEVER leave the device."""
    def __init__(self, root, c, cipher):
        self.c, self.cipher = c, cipher
        self.cap = capsule(c["run"])
        self.world = Vault(root / "synthetic-world", cipher)
        self.lock = threading.RLock()
        initial = {"features": [{"organization_id": x, "enabled": True} for x in self.cap.organizations],
                   "sessions": [{"id": identity(c["run"], a), "user_id": u}
                                for a, (u, _) in self.cap.actors.items()] +
                               [{"id": identity(c["run"], "unrelated-session"),
                                 "user_id": identity(c["run"], "unrelated-user")}],
                   "unrelated_features": ["a" * 32], "identity_factor_digest": "b" * 64}
        self.world.transact(lambda vs: (initial if not vs else None, None))

    def change(self, fn):
        with self.lock:
            def update(vs):
                state = copy.deepcopy(vs[-1])
                fn(state)
                return state, None
            self.world.transact(update)

    def observe(self, _req):
        return self.world.entries()[-1]

    def user(self, req):
        try:
            head, body, sig = req.token.split(".")
            if json.loads(base64.urlsafe_b64decode(head + "===")) != {"alg": "SYNTHETIC-HMAC-ONLY"}:
                raise ValueError()
            claims = json.loads(base64.urlsafe_b64decode(body + "==="))
            self.cipher.verify_ack({"receipt": claims, "mac": sig}, claims)
            alias = next(a for a, (u, _) in self.cap.actors.items() if u == claims["sub"])
            if (not claims.get("syntheticOnly") or claims["session_id"] != identity(self.c["run"], alias)
                    or not any(s["id"] == claims["session_id"] for s in self.observe(None)["sessions"])):
                raise ValueError()
            return {"id": claims["sub"], "email_confirmed_at": "SYNTHETIC",
                    "factors": [{"id": identity(self.c["run"], alias + "factor"),
                                 "factor_type": "totp", "status": "verified"}]}
        except Exception:
            raise Stop("Synthetic session rejected; no real Auth supported") from None

    def deactivate(self, _req):
        self.change(lambda s: [f.update(enabled=False) for f in s["features"]])

    def logout(self, req):
        user = self.user(req)
        sid = json.loads(base64.urlsafe_b64decode(req.token.split(".")[1] + "==="))["session_id"]
        self.change(lambda s: s.update(sessions=[x for x in s["sessions"]
                                               if (x["id"], x["user_id"]) != (sid, user["id"])]))


class Lab:
    def __init__(self, root, config):
        self.root, self.config = Path(root), validate_config(config)
        self.manual_renewals = 0
        self.cipher = cipher_for(config)
        self.ports = SyntheticPorts(self.root, config, self.cipher)
        cap = capsule(config["run"])
        r = Recovery(cap, self.ports, time.time, OneShot(self.root / "attempt", OPERATION))
        self.backup = Backup(self.cipher, Vault(self.root / "custody", self.cipher), r, time.time,
                             {a: identity(config["run"], a + "factor")
                              for a in cap.actors if a.endswith("owner")})
        self.runtime = None

    def begin(self):
        if time.time() - self.config["created"] >= 180:
            raise Stop("Pairing expired")
        OneShot(self.root / "paired", OPERATION).reserve()
        self.runtime = DeviceRuntime(self.backup, self.root / "inbox", self.root / "outbox")

    def finish(self, reason):
        if (self.root / "result.json").exists():
            return json.loads(private_bytes(self.root / "result.json"))
        result = self.runtime.stop() if self.runtime else self.backup.recover()
        state = self.ports.observe(None)
        report = {"mode": MODE, "run": self.config["run"], "reason": reason, **result,
                  "completedEpochSeconds": int(time.time()),
                  "elapsedSecondsSinceCard": round(time.time() - self.config["created"], 1),
                  "manualRenewalsObservedByThisProcess": self.manual_renewals,
                  "syntheticFeaturesActive": sum(f["enabled"] for f in state["features"]),
                  "syntheticSessionsRemaining": len(state["sessions"]) - 1,
                  "unrelatedSyntheticSessionPreserved": any(
                      s["id"] == identity(self.config["run"], "unrelated-session") for s in state["sessions"]),
                  "unresolvedIntents": len(self.backup.unresolved()), "financialActions": 0,
                  "physicalDeviceEvidence": "OWNER_OBSERVATION_REQUIRED_NOT_AUTOMATIC_PASS"}
        write_once(self.root / "result.json", report)
        return report


def read_frame(sock):
    sock.settimeout(2)
    data = b""
    deadline = time.monotonic() + 2
    while not data.endswith(b"\n"):
        if time.monotonic() > deadline or len(data) > 70000:
            raise Stop("Bounded message exceeded")
        chunk = sock.recv(4096)
        if not chunk:
            raise Stop("Uncertain transport response; never retry")
        data += chunk
    value = json.loads(data)
    if not isinstance(value, dict):
        raise Stop("Invalid frame")
    return value


def exchange(peer, value, allow_loopback=False):
    address(peer, allow_loopback)
    # Fixed numeric host/port, no HTTP/proxy/redirect/DNS or arbitrary URL.
    with socket.create_connection((peer, PORT), timeout=2) as sock:
        sock.sendall(canonical(value) + b"\n")
        return read_frame(sock)


def handle(lab, request):
    if set(request) != {"kind", "packet", "id"} or str(uuid.UUID(request["id"])) != request["id"]:
        raise Stop("Invalid synthetic frame")
    kind, packet = request["kind"], request["packet"]
    if not isinstance(packet, str) or len(packet) > 65536:
        raise Stop("Invalid packet")
    if kind == "pair":
        challenge = lab.cipher.open(packet, "pair")
        if (set(challenge) != {"nonce", "mode"} or challenge["mode"] != MODE
                or str(uuid.UUID(challenge["nonce"])) != challenge["nonce"]):
            raise Stop("Peer authentication failed")
        lab.begin()
        return {"packet": lab.cipher.seal(challenge, "paired")}
    if lab.runtime is None or lab.runtime.poll() is not None:
        raise Stop("Stopped or unpaired run; no continuation")
    if kind not in ("custody", "heartbeat"):
        raise Stop("No arbitrary commands")
    if kind == "heartbeat":
        # Fresh-counter supervision is volatile; don't fill the durable 512-file
        # custody mailbox with 1,740 periodic signals during a 29-minute run.
        lab.runtime.supervisor.receive_heartbeat(packet)
        return {"packet": lab.cipher.seal({"heartbeat": request["id"]}, "response")}
    write_once(lab.runtime.mailbox.inbox / (request["id"] + ".json"), {"kind": kind, "packet": packet})
    lab.runtime.mailbox.process_one(request["id"] + ".json")
    lab.runtime.seen.add(request["id"] + ".json")
    ack = json.loads(private_bytes(lab.runtime.mailbox.outbox / (request["id"] + ".json")))
    return {"packet": lab.cipher.seal(ack, "response")}


def rpc(cipher, peer, kind, packet, allow_loopback=False):
    request_id = str(uuid.uuid4())
    value = exchange(peer, {"id": request_id, "kind": kind, "packet": packet}, allow_loopback)
    if set(value) != {"packet"}:
        raise Stop("Peer returned no authenticated receipt; outcome UNKNOWN")
    reply = cipher.open(value["packet"], "paired" if kind == "pair" else "response")
    if kind == "heartbeat" and reply != {"heartbeat": request_id}:
        raise Stop("Heartbeat receipt mismatch")
    return reply


def operator_action():
    if select.select([sys.stdin], [], [], 0)[0]:
        value = sys.stdin.readline()
        if not value or value.strip().lower() == "stop":
            return "stop"
        if value.strip().lower() == "present":
            return "present"
    return None


@contextmanager
def run_lock(root):
    fd = os.open(root / "device.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def serve(lab, listen):
    # No SO_REUSEPORT; only one foreground listener. Never auto-start or daemonize.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.settimeout(0.2)
        server.bind((address(listen), PORT))
        server.listen(4)
        print("BACKUP WAITING — pairing expires in 3 minutes. Type present every 30 seconds after pairing.", flush=True)
        pairing_started = time.monotonic()
        try:
            while True:
                action = operator_action()
                if action == "stop":
                    return lab.finish("MANUAL_STOP")
                if lab.runtime:
                    if action == "present":
                        lab.runtime.supervisor.human_present()
                        lab.manual_renewals += 1
                        print("MANUAL PRESENCE RECEIVED", flush=True)
                    if lab.runtime.poll() is not None:
                        return lab.finish("HEARTBEAT_PRESENCE_OR_WINDOW_EXPIRED")
                elif time.time() - lab.config["created"] > 180 or time.monotonic() - pairing_started > 180:
                    raise Stop("Pairing expired")
                try:
                    conn, _ = server.accept()
                except socket.timeout:
                    continue
                with conn:
                    try:
                        response = handle(lab, read_frame(conn))
                        conn.sendall(canonical(response) + b"\n")
                        if lab.runtime and lab.runtime.supervisor.counter == 0:
                            print("PAIRED / MESSAGE AUTHENTICATED", flush=True)
                    except Exception:
                        if lab.runtime:
                            return lab.finish("REJECTED_OR_UNCERTAIN_MESSAGE")
                        print("UNPAIRED MESSAGE REJECTED", flush=True)
        except BaseException:
            return lab.finish("INTERRUPTED_OR_EXPIRED")


def primary(root, peer, c, scenario="loss", allow_loopback=False):
    cipher = cipher_for(c)
    OneShot(root / "attempt", OPERATION).reserve()
    log = Vault(root / "receipts", cipher)
    def record(value):
        log.transact(lambda _: (value, None))
    challenge = {"nonce": str(uuid.uuid4()), "mode": MODE}
    record({"state": "PAIR_ATTEMPTED"})
    reply = rpc(cipher, peer, "pair", cipher.seal(challenge, "pair"), allow_loopback)
    if reply != challenge:
        raise Stop("Pairing acknowledgment invalid")
    record({"state": "PAIRED"})
    print("PAIRED — authenticated peer. No hosted access.", flush=True)
    failed = threading.Event()
    def heartbeat():
        counter = 0
        try:
            while not failed.wait(1):
                counter += 1
                rpc(cipher, peer, "heartbeat", cipher.seal({"counter": counter, "issued": int(time.time())}, "heartbeat"), allow_loopback)
        except Exception:
            failed.set()
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    latencies = []
    try:
        for alias in capsule(c["run"]).actors:
            for kind in (("INTENT", "SESSION", "UPGRADE") if alias.endswith("owner") else ("INTENT", "SESSION")):
                if failed.is_set():
                    raise Stop("Heartbeat uncertain; no continuation")
                message = {"id": str(uuid.uuid4()), "alias": alias, "kind": kind,
                           "issued": int(time.time()), "token": "" if kind == "INTENT" else make_token(c, alias, scenario == "expired")}
                packet = cipher.seal(message, "handoff")
                record({"state": "ATTEMPTED_NO_RETRY", "id": message["id"], "kind": kind})
                start = time.monotonic()
                if scenario == "lost-ack" and kind == "SESSION":
                    with socket.create_connection((address(peer, allow_loopback), PORT), timeout=2) as sock:
                        sock.sendall(canonical({"id": str(uuid.uuid4()), "kind": "custody", "packet": packet}) + b"\n")
                    record({"state": "UNKNOWN_ACK_NOT_READ_NO_RETRY"})
                    raise Stop("Deliberately lost synthetic ACK; never retry")
                if scenario == "tamper":
                    damaged = bytearray(base64.b64decode(packet)); damaged[-1] ^= 1
                    packet = base64.b64encode(damaged).decode()
                if scenario == "wrong-run":
                    packet = Cipher(base64.b64decode(c["key"]), OPERATION, TARGET, str(uuid.uuid4())).seal(message, "handoff")
                ack = rpc(cipher, peer, "custody", packet, allow_loopback)
                if time.monotonic() - start >= 9 or failed.is_set():
                    raise Stop("Late or uncertain ACK; no continuation")
                cipher.verify_ack(ack, {"id": message["id"], "kind": kind,
                                      "packetHash": hashlib.sha256(packet.encode()).hexdigest()})
                record({"state": "DURABLE_ACK_VERIFIED", "kind": kind,
                        "elapsedMs": round((time.monotonic() - start) * 1000)})
                latencies.append(round((time.monotonic() - start) * 1000))
                if scenario == "duplicate":
                    # Explicit synthetic adversarial probe, never an uncertain-write retry.
                    rpc(cipher, peer, "custody", packet, allow_loopback)
                    raise Stop("Duplicate unexpectedly accepted")
                if scenario == "incomplete":
                    raise Stop("Synthetic creation response lost after INTENT; no session guessing")
        print("33 DURABLE ACKS VERIFIED / 15 SYNTHETIC SESSIONS / 3 SYNTHETIC UPGRADES", flush=True)
        write_once(root / "primary-ready.json", {"mode": MODE, "run": c["run"], "durableAcks": len(latencies),
                                                 "maximumAckMs": max(latencies), "hostedVerification": False})
        print("Maximum authenticated ACK latency:", max(latencies), "ms", flush=True)
        print("READY FOR PRIMARY LOSS: keep backup open; type present there. Turn OFF primary Wi-Fi, then close this sender.", flush=True)
        while not failed.wait(0.2):
            pass
        raise Stop("Transport stopped; outcome requires backup-only report. No retry.")
    except BaseException:
        record({"state": "STOPPED_UNKNOWN_OR_INTERRUPTED_NO_RETRY"})
        raise
    finally:
        failed.set()
        thread.join(timeout=3)


def main():
    parser = argparse.ArgumentParser(description="Synthetic two-Mac rehearsal ONLY; no hosted mode")
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("backup"); b.add_argument("--listen", required=True)
    p = sub.add_parser("primary"); p.add_argument("--peer", required=True)
    p.add_argument("--scenario", choices=("loss", "tamper", "wrong-run", "duplicate", "lost-ack", "incomplete", "expired"), default="loss")
    r = sub.add_parser("recover"); r.add_argument("run_directory", type=Path)
    i = sub.add_parser("report"); i.add_argument("run_directory", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.command in ("backup", "primary"):
            if not sys.stdin.isatty():
                raise Stop("Foreground human terminal required; no piped presence or pairing")
            address(args.listen if args.command == "backup" else args.peer)
            c = new_config("backup") if args.command == "backup" else parse_card(getpass.getpass("Paste SYNTHETIC pairing card (hidden): "))
            root = Path.home() / "Propel-Synthetic-Rehearsal" / c["role"] / c["run"]
            if root.exists():
                raise Stop("Run already exists; no replay. Retain evidence.")
            private_directory(root)
            write_once(root / "synthetic-config.json", c)
            print("SYNTHETIC ONLY. No credentials, private P1 capsules, MFA or hosted calls.")
            print("Run directory:", root)
            if args.command == "backup":
                print("Synthetic pairing card (copy only to other Mac; keep out of reports):\n" + pairing_card(c))
            print("Compare fingerprint on BOTH physical screens:", fingerprint(c))
            if input("Type PAIR after visually comparing both screens: ").strip() != "PAIR":
                raise Stop("Operator pairing not confirmed")
            if args.command == "backup":
                with run_lock(root):
                    result = serve(Lab(root, c), args.listen)
                print(json.dumps(result, indent=2))
            else:
                primary(root, args.peer, c, args.scenario)
        else:
            root = args.run_directory.resolve()
            c = validate_config(json.loads(private_bytes(root / "synthetic-config.json")))
            if c["role"] != "backup":
                raise Stop("Use only the secondary computer's own backup directory")
            if args.command == "report":
                print(private_bytes(root / "result.json").decode())
            else:
                if (root / "attempt" / "recovery-attempt.json").exists():
                    raise Stop("Recovery already attempted; report only, never replay")
                with run_lock(root):
                    print(json.dumps(Lab(root, c).finish("BACKUP_RESTART_LOCAL_ONLY"), indent=2))
    except BaseException:
        print("STOP / UNKNOWN: no automatic retry. Inspect secondary report; preserve this run directory.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
