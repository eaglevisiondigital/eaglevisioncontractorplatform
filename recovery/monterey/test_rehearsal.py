"""New launcher/real local socket regressions; never physical-device PASS evidence."""
import ast
import base64
import copy
import hashlib
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import rehearsal as app
from custody import Cipher
from mailbox import write_once
from p1_recovery import Stop


class RehearsalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.c = app.new_config("backup")
        self.lab = app.Lab(self.root, self.c)

    def tearDown(self):
        self.tmp.cleanup()

    def send(self, kind, value, purpose="handoff"):
        return app.handle(self.lab, {"id": str(uuid.uuid4()), "kind": kind,
                                   "packet": self.lab.cipher.seal(value, purpose)})

    def pair(self):
        challenge = {"nonce": str(uuid.uuid4()), "mode": app.MODE}
        reply = self.send("pair", challenge, "pair")
        self.assertEqual(self.lab.cipher.open(reply["packet"], "paired"), challenge)

    def fill(self):
        self.pair()
        for alias in app.capsule(self.c["run"]).actors:
            for kind in ("INTENT", "SESSION", "UPGRADE") if alias.endswith("owner") else ("INTENT", "SESSION"):
                msg = {"id": str(uuid.uuid4()), "alias": alias, "kind": kind,
                       "issued": int(time.time()), "token": "" if kind == "INTENT" else app.make_token(self.c, alias)}
                start = time.monotonic()
                self.send("custody", msg)
                self.assertLess(time.monotonic() - start, 2)

    def test_full_durable_custody_restarts_with_backup_files_only(self):
        self.fill()
        self.assertEqual(len(self.lab.backup.vault.entries()), 33)
        restarted = app.Lab(self.root, self.c)
        result = restarted.finish("SINGLE_HOST_RESTART_SIMULATION")
        self.assertEqual(result["status"], "REHEARSAL_VERIFIED")
        self.assertEqual(result["syntheticFeaturesActive"], 0)
        self.assertEqual(result["syntheticSessionsRemaining"], 0)
        self.assertTrue(result["unrelatedSyntheticSessionPreserved"])
        self.assertEqual(result["financialActions"], 0)
        self.assertFalse(result["hostedVerification"])

    def test_pairing_card_requires_fresh_key_and_synthetic_marker(self):
        self.assertEqual(app.parse_card(app.pairing_card(self.c))["run"], self.c["run"])
        for change in ({"created": int(time.time())-181}, {"mode": "LIVE"}, {"key": "bad"}):
            with self.assertRaises(Stop):
                app.parse_card(app.pairing_card({**self.c, **change}))

    def test_fingerprint_binds_run_key_but_agrees_between_roles(self):
        self.assertEqual(app.fingerprint(self.c), app.fingerprint({**self.c, "role": "primary"}))
        self.assertNotEqual(app.fingerprint(self.c), app.fingerprint(app.new_config("backup")))

    def test_no_public_dns_loopback_or_wildcard_listener_cli(self):
        for value in ("0.0.0.0", "127.0.0.1", "8.8.8.8", "169.254.1.1", "example.com", "https://localhost", "::1"):
            with self.assertRaises((Stop, ValueError)):
                app.address(value)
        self.assertEqual(app.address("172.20.10.2"), "172.20.10.2")

    def test_wrong_run_wrong_key_and_tampered_pairing_never_start(self):
        msg = {"nonce": str(uuid.uuid4()), "mode": app.MODE}
        for cipher in (Cipher(os.urandom(32), app.OPERATION, app.TARGET, self.c["run"]),
                       Cipher(base64.b64decode(self.c["key"]), app.OPERATION, app.TARGET, str(uuid.uuid4()))):
            with self.assertRaises(Stop):
                app.handle(self.lab, {"id": str(uuid.uuid4()), "kind": "pair", "packet": cipher.seal(msg, "pair")})
        self.assertIsNone(self.lab.runtime)

    def test_duplicate_pairing_is_durably_rejected(self):
        self.pair()
        with self.assertRaises(FileExistsError):
            self.pair()
        with self.assertRaises(FileExistsError):
            app.Lab(self.root, self.c).begin()

    def test_duplicate_custody_is_rejected_even_after_restart(self):
        self.pair()
        msg = {"id": str(uuid.uuid4()), "alias": "pilot-1-owner", "kind": "INTENT", "issued": int(time.time()), "token": ""}
        self.send("custody", msg)
        with self.assertRaises(Stop):
            app.Lab(self.root, self.c).backup.receive(self.lab.cipher.seal(msg, "handoff"))

    def test_tampered_ciphertext_is_denied(self):
        self.pair()
        raw = bytearray(base64.b64decode(self.lab.cipher.seal({}, "handoff"))); raw[-1] ^= 1
        with self.assertRaises(Stop):
            app.handle(self.lab, {"id": str(uuid.uuid4()), "kind": "custody", "packet": base64.b64encode(raw).decode()})

    def test_missing_creation_response_remains_unresolved_no_uid_revoke(self):
        self.pair()
        self.send("custody", {"id": str(uuid.uuid4()), "alias": "pilot-1-owner", "kind": "INTENT", "issued": int(time.time()), "token": ""})
        result = self.lab.finish("MISSING_RESPONSE")
        self.assertEqual(result["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(result["unresolvedIntents"], 1)
        self.assertEqual(result["syntheticSessionsRemaining"], 15)
        self.assertEqual(result["automaticRetries"], 0)

    def test_expired_or_real_looking_tokens_are_denied(self):
        self.pair()
        self.send("custody", {"id": str(uuid.uuid4()), "alias": "pilot-1-owner", "kind": "INTENT", "issued": int(time.time()), "token": ""})
        for tok in (app.make_token(self.c, "pilot-1-owner", True), "eyJhbGciOiJIUzI1NiJ9.e30.real-like"):
            with self.assertRaises(Stop):
                self.send("custody", {"id": str(uuid.uuid4()), "alias": "pilot-1-owner", "kind": "SESSION", "issued": int(time.time()), "token": tok})

    def test_fsync_failure_cannot_return_receipt(self):
        self.pair()
        with patch("custody.os.fsync", side_effect=OSError()):
            with self.assertRaises((Stop, OSError)):
                self.send("custody", {"id": str(uuid.uuid4()), "alias": "pilot-1-owner", "kind": "INTENT", "issued": int(time.time()), "token": ""})

    def test_heartbeat_presence_and_window_are_independent(self):
        self.fill()
        s = self.lab.runtime.supervisor
        now = time.monotonic()
        s.monotonic = lambda: now
        s.presence = now-60
        s.heartbeat = now
        self.assertEqual(s.tick()["status"], "REHEARSAL_VERIFIED")
        with self.assertRaises(Stop):
            s.human_present()

    def test_long_supervision_does_not_exhaust_custody_mailbox(self):
        self.pair()
        for counter in range(1, 1750):
            self.send("heartbeat", {"counter":counter,"issued":int(time.time())}, "heartbeat")
        self.assertEqual(list(self.lab.runtime.mailbox.inbox.iterdir()), [])
        self.assertEqual(self.lab.runtime.supervisor.counter, 1749)
        # Counter replay is rejected, never treated as presence or new heartbeat.
        with self.assertRaises(Stop):
            self.send("heartbeat", {"counter":1749,"issued":int(time.time())}, "heartbeat")

    def test_recovery_attempt_cannot_replay_without_report(self):
        self.fill()
        self.lab.backup.recover()
        before = self.lab.ports.observe(None)
        with self.assertRaises(FileExistsError):
            app.Lab(self.root, self.c).backup.recover()
        self.assertEqual(self.lab.ports.observe(None), before)

    def test_active_device_lock_blocks_independent_recovery_process(self):
        with app.run_lock(self.root):
            with self.assertRaises(BlockingIOError):
                with app.run_lock(self.root):
                    self.fail("Second process lock acquired")

    def test_safe_report_has_no_key_token_or_pairing_card(self):
        self.fill()
        text = json.dumps(self.lab.finish("SINGLE_HOST_SIMULATION"))
        for value in (self.c["key"], app.pairing_card(self.c), app.make_token(self.c, "pilot-1-owner")):
            self.assertNotIn(value, text)

    def test_real_socket_pairing_and_encrypted_roundtrip(self):
        # Local socket evidence only; no claim that a second physical Mac ran.
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0)); listener.listen(1)
            port = listener.getsockname()[1]
            seen = []
            def server():
                with listener.accept()[0] as conn:
                    request = app.read_frame(conn); seen.append(request)
                    conn.sendall(app.canonical(app.handle(self.lab, request)) + b"\n")
            thread = threading.Thread(target=server); thread.start()
            challenge = {"nonce": str(uuid.uuid4()), "mode": app.MODE}
            with patch.object(app, "PORT", port):
                reply = app.rpc(self.lab.cipher, "127.0.0.1", "pair", self.lab.cipher.seal(challenge, "pair"), True)
            thread.join(3)
            self.assertEqual(reply, challenge)
            self.assertNotIn(challenge["nonce"], json.dumps(seen))

    def test_primary_process_killed_then_backup_recovers_without_primary_directory(self):
        # Actual SIGKILL and sockets on ONE host; never physical-device evidence.
        listener = socket.socket(); listener.bind(("127.0.0.1", 0)); listener.listen(4)
        listener.settimeout(0.1)
        port = listener.getsockname()[1]
        stopped = threading.Event()
        errors = []
        def server():
            while not stopped.is_set():
                try:
                    conn, _ = listener.accept()
                except socket.timeout:
                    continue
                try:
                    with conn:
                        conn.sendall(app.canonical(app.handle(self.lab, app.read_frame(conn))) + b"\n")
                except Exception as err:
                    errors.append(type(err).__name__)
        thread = threading.Thread(target=server)
        thread.start()
        primary_root = self.root / "primary-separate-process"
        primary_root.mkdir(mode=0o700)
        write_once(primary_root / "config.json", {**self.c, "role": "primary"})
        code = ("import rehearsal as a,json,sys;from pathlib import Path;"
                "r=Path(sys.argv[1]);c=json.loads((r/'config.json').read_text());"
                "a.PORT=int(sys.argv[2]);a.primary(r,'127.0.0.1',c,allow_loopback=True)")
        proc = subprocess.Popen([sys.executable, "-B", "-c", code, str(primary_root), str(port)],
                                cwd=Path(app.__file__).parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline=time.monotonic()+8
            def receipts():
                return app.Vault(primary_root / "receipts", self.lab.cipher).entries()
            while time.monotonic()<deadline and sum(v.get("state")=="DURABLE_ACK_VERIFIED" for v in receipts())<33:
                time.sleep(0.02)
            self.assertEqual(len(self.lab.backup.vault.entries()), 33)
            self.assertEqual(sum(v.get("state")=="DURABLE_ACK_VERIFIED" for v in receipts()), 33)
            proc.kill(); proc.wait(timeout=3)
            self.assertLess(proc.returncode, 0)
            stopped.set(); thread.join(3)
            self.assertFalse(errors)
            import shutil
            shutil.rmtree(primary_root)
            # Restore a NEW backup instance from its own data after primary loss.
            result = app.Lab(self.root, self.c).finish("SINGLE_HOST_SIGKILL_SIMULATION")
            self.assertEqual(result["status"], "REHEARSAL_VERIFIED")
            self.assertFalse(result["hostedVerification"])
        finally:
            if proc.poll() is None: proc.kill(); proc.wait(timeout=3)
            proc.communicate(timeout=3)
            stopped.set(); thread.join(3); listener.close()

    def test_socket_eof_and_oversize_fail_closed(self):
        for data in (b"", b"x"*70001+b"\n"):
            a,b=socket.socketpair()
            with a,b:
                thread=threading.Thread(target=lambda: (b.sendall(data), b.shutdown(socket.SHUT_WR)))
                thread.start()
                with self.assertRaises((Stop, ValueError)):
                    app.read_frame(a)
                thread.join(3)

    def test_no_hosted_adapter_capsule_secret_reader_or_auto_presence(self):
        tree=ast.parse(Path(app.__file__).read_text())
        modules=[]
        for node in ast.walk(tree):
            if isinstance(node, ast.Import): modules.extend(x.name for x in node.names)
            if isinstance(node, ast.ImportFrom): modules.append(node.module)
        self.assertFalse(set(modules) & {"https_adapter", "requests", "urllib", "subprocess", "keyring"})
        cli=subprocess.run([sys.executable,"-B",app.__file__,"primary","--peer","127.0.0.1"],capture_output=True)
        self.assertEqual(cli.returncode,2)
        self.assertNotIn(b"Traceback",cli.stderr)

    def test_distribution_is_exact_public_inventory_and_reproducible(self):
        root=Path(app.__file__).resolve().parents[2]
        result=subprocess.run([sys.executable,"-B",str(root/"scripts/package-rehearsal.py"),"--check"],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        import zipfile
        with zipfile.ZipFile(root/"recovery/distribution/propel-synthetic-rehearsal.zip") as archive:
            names=archive.namelist()
            self.assertFalse(any("https_adapter" in n or ".private" in n or n.endswith(".sql") for n in names))
            manifest=json.loads(archive.read("Propel-Synthetic-Rehearsal/MANIFEST.json"))
            for name, digest in manifest.items():
                self.assertEqual(hashlib.sha256(archive.read("Propel-Synthetic-Rehearsal/"+name)).hexdigest(),digest)


if __name__ == "__main__":
    unittest.main()
