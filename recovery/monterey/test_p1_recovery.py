"""Disposable fixtures and mock ports only. Never connect to Supabase or read secrets."""
import base64
import ast
import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path

from p1_recovery import Capsule, Commands, OneShot, Recovery, Stop, load_capsule

NOW = 1800000000

def uid():
    return str(uuid.uuid4())

def token(user, sid, **changes):
    claims = {"sub": user, "session_id": sid, "role": "authenticated", "aal": "aal1",
              "iss": "https://" + "a" * 20 + ".supabase.co/auth/v1", "exp": NOW + 3600}
    claims.update(changes)
    encode = lambda x: base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip("=")
    return encode({"alg": "fixture-only"}) + "." + encode(claims) + ".UNSIGNED_FIXTURE_ONLY"

def package(root):
    root.mkdir(mode=0o700)
    companies = []
    for i in range(1, 4):
        org = uid()
        actors = {}
        for role in ["owner", "estimator", "assigned-field", "unassigned-field", "revoked-staff", "customer"]:
            actors[role] = {"alias": "pilot-" + str(i) + "-" + role, "user_id": uid(), "organization_id": org}
        companies.append({"organization_id": org, "actorBindings": actors})
    files = {"p1-plan.private.json": json.dumps({"companies": companies}).encode(),
             "deactivate-features.proposed.sql": b"-- disposable fixture: exact three controls only\n",
             "activate-features.proposed.sql": b"NOT_COPIED", "p2-separate-review.private.json": b"NOT_COPIED"}
    op = {"targetProjectRef": "a" * 20, "maximumWindowSeconds": 1800, "fixtureSteps": 75,
          "assertionRpcProbes": 69, "domainRows": 57, "featureRows": 3, "customerMappings": 0,
          "reportLeases": 0, "providers": False, "media": False, "deployment": False,
          "files": [{"file": k, "sha256": hashlib.sha256(v).hexdigest()} for k, v in files.items()]}
    raw = json.dumps(op).encode()
    for name, data in {**{k: files[k] for k in list(files)[:2]}, "operation.private.json": raw}.items():
        (root / name).write_bytes(data)
        (root / name).chmod(0o600)
    return load_capsule(root, hashlib.sha256(raw).hexdigest())

class MockPorts:
    def __init__(self, capsule):
        self.c = capsule
        self.cmd = Commands(capsule)
        self.state = {"features": [{"organization_id": x, "enabled": True} for x in capsule.organizations],
                      "unrelated_features": ["a" * 32], "sessions": [], "identity_factor_digest": "b" * 64}
        self.users = {}
        self.calls = []
        self.fail_deactivate = False
        self.unknown_deactivate = False
        self.fail_logout = set()
        self.fail_observe = set()
        self.observations = 0
        self.change_unrelated = False
        self.delete_features = False
        self.max_parallel = 0
        self.running = 0
        self.lock = threading.Lock()

    def user(self, req):
        self.calls.append(req)
        if req.token not in self.users:
            raise Stop("Fixture authentication denied")
        return self.users[req.token]

    def observe(self, req):
        assert req == self.cmd.observe()
        self.calls.append(req)
        self.observations += 1
        if self.observations in self.fail_observe:
            raise TimeoutError("fixture-only")
        return copy.deepcopy(self.state)

    def deactivate(self, req):
        assert req == self.cmd.deactivate()
        self.calls.append(req)
        if self.fail_deactivate:
            raise TimeoutError("fixture-only")
        for f in self.state["features"]:
            f["enabled"] = False
        if self.change_unrelated:
            self.state["unrelated_features"] = ["c" * 32]
        if self.delete_features:
            self.state["features"] = []
        if self.unknown_deactivate:
            raise TimeoutError("fixture commit then lost response")

    def logout(self, req):
        assert req.url.endswith("/auth/v1/logout?scope=local") and req.method == "POST"
        with self.lock:
            self.calls.append(req)
            self.running += 1
            self.max_parallel = max(self.max_parallel, self.running)
        try:
            time.sleep(0.01)
            if req.token in self.fail_logout:
                raise TimeoutError("fixture-only")
            part = req.token.split(".")[1]
            c = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
            with self.lock:
                self.state["sessions"] = [s for s in self.state["sessions"] if s["id"] != c["session_id"]]
        finally:
            with self.lock:
                self.running -= 1

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="propel-recovery-")
        self.root = Path(self.temp.name)
        self.c = package(self.root / "capsule")
        self.p = MockPorts(self.c)
        self.r = Recovery(self.c, self.p, lambda: NOW, OneShot(self.root / "journal", self.c.operation_hash))

    def tearDown(self):
        self.temp.cleanup()

    def handoff(self, alias=None, **changes):
        alias = alias or next(iter(self.c.actors))
        user = self.c.actors[alias][0]
        sid = uid()
        t = token(user, sid, **changes)
        self.p.users[t] = {"id": user, "email_confirmed_at": "fixture", "is_anonymous": False}
        self.p.state["sessions"].append({"id": sid, "user_id": user})
        self.r.accept(alias, t)
        return t

    def test_independent_partial_recovery_preserves_unrelated_controls_and_sessions(self):
        self.handoff()
        unrelated = {"id": uid(), "user_id": uid()}
        self.p.state["sessions"].append(unrelated)
        result = self.r.recover()
        self.assertEqual(result["status"], "REHEARSAL_VERIFIED")
        self.assertFalse(result["hostedVerification"])
        self.assertEqual(self.p.state["sessions"], [unrelated])
        self.assertEqual(self.p.state["unrelated_features"], ["a" * 32])

    def test_all_fifteen_sessions_revoke_in_parallel_without_primary_tokens_or_journal(self):
        for alias in self.c.actors:
            self.handoff(alias)
        self.assertEqual(self.r.recover()["status"], "REHEARSAL_VERIFIED")
        self.assertGreater(self.p.max_parallel, 1)
        self.assertEqual(self.p.state["sessions"], [])

    def test_same_user_unexercised_session_is_not_revoked(self):
        self.handoff()
        foreign = {"id": uid(), "user_id": next(iter(self.c.actors.values()))[0]}
        self.p.state["sessions"].append(foreign)
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(self.p.state["sessions"], [foreign])

    def test_absent_features_are_partial_safe(self):
        self.p.state["features"] = []
        self.assertEqual(self.r.recover()["status"], "REHEARSAL_VERIFIED")

    def test_database_failure_still_revokes_sessions(self):
        self.handoff()
        self.p.fail_deactivate = True
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(self.p.state["sessions"], [])

    def test_uncertain_commit_is_not_promoted_even_after_clean_observation(self):
        self.p.unknown_deactivate = True
        result = self.r.recover()
        self.assertEqual(result["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(result["deactivation"], "UNKNOWN")
        with self.assertRaises(Stop):
            self.r.recover()

    def test_one_logout_failure_does_not_suppress_others(self):
        values = [self.handoff(a) for a in list(self.c.actors)[:3]]
        self.p.fail_logout.add(values[0])
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(len(self.p.state["sessions"]), 1)

    def test_lost_initial_observation_still_contains_but_does_not_claim_verification(self):
        self.handoff()
        self.p.fail_observe.add(1)
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(self.p.state["sessions"], [])

    def test_lost_final_observation_is_not_success(self):
        self.p.fail_observe.add(2)
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")

    def test_unrelated_control_change_is_not_accepted(self):
        self.p.change_unrelated = True
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")

    def test_feature_deletion_is_not_mistaken_for_deactivation(self):
        self.p.delete_features = True
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")

    def test_bad_auth_claims_or_near_expiry_are_rejected(self):
        for changes in ({"exp": NOW + 1859}, {"exp": True}, {"iss": "https://evil.invalid"},
                        {"role": "service_role"}, {"sub": uid()}, {"session_id": "bad"}, {"aal": "bogus"}):
            with self.subTest(changes=changes):
                with self.assertRaises(Stop):
                    self.handoff(**changes)

    def test_unverified_token_is_not_trusted_from_claims(self):
        t = token(next(iter(self.c.actors.values()))[0], uid())
        with self.assertRaises(Stop):
            self.r.accept(next(iter(self.c.actors)), t)

    def test_nonrostered_platform_and_customer_cannot_enter_custody(self):
        for alias in ("platform-operator", "pilot-1-customer", "pilot-4-owner"):
            with self.assertRaises(Stop):
                self.r.accept(alias, "fixture")

    def test_owner_upgrade_preserves_exact_session(self):
        alias = next(iter(self.c.actors))
        t = self.handoff(alias)
        s = self.r.sessions[alias]
        high = token(s.uid, s.sid, aal="aal2")
        self.p.users[high] = self.p.users[t]
        self.r.accept(alias, high)
        self.assertEqual(self.r.sessions[alias].token, high)
        with self.assertRaises(Stop):
            self.handoff(alias)

    def test_secrets_never_enter_repr_or_durable_journal(self):
        t = self.handoff()
        result = self.r.recover()
        printed = repr(self.c) + repr(self.r.commands.logout(t)) + repr(result) + repr(self.r.sessions)
        self.assertNotIn(t, printed)
        self.assertNotIn(self.c.target, printed)
        text = (self.root / "journal" / "recovery-attempt.json").read_text()
        self.assertNotIn(t, text)
        self.assertNotIn(next(iter(self.c.actors.values()))[0], text)

    def test_restart_cannot_replay_durable_attempt(self):
        self.r.recover()
        next_run = Recovery(self.c, self.p, lambda: NOW, OneShot(self.root / "journal", self.c.operation_hash))
        calls = len(self.p.calls)
        with self.assertRaises(FileExistsError):
            next_run.recover()
        self.assertEqual(len(self.p.calls), calls)

    def test_two_recovery_processes_cannot_reserve_same_attempt(self):
        # Real child processes, separate interpreters, one independently owned journal.
        root = str(self.root / "race")
        code = "from p1_recovery import OneShot; import sys;\ntry: OneShot(sys.argv[1],sys.argv[2]).reserve();print('RESERVED')\nexcept FileExistsError: print('BLOCKED')"
        a = [subprocess.Popen([sys.executable, "-B", "-c", code, root, self.c.operation_hash], stdout=subprocess.PIPE, cwd=Path(__file__).parent) for _ in range(2)]
        self.assertEqual(sorted(p.communicate(timeout=10)[0].decode().strip() for p in a), ["BLOCKED", "RESERVED"])

    def test_unsafe_or_symlinked_capsule_is_rejected(self):
        link = self.root / "link"
        link.symlink_to(self.root / "capsule", target_is_directory=True)
        with self.assertRaises(Stop):
            load_capsule(link, self.c.operation_hash)
        (self.root / "capsule" / "p1-plan.private.json").chmod(0o644)
        with self.assertRaises(Stop):
            load_capsule(self.root / "capsule", self.c.operation_hash)

    def test_wrong_hash_or_artifact_mutation_is_rejected(self):
        with self.assertRaises(Stop):
            load_capsule(self.root / "capsule")
        (self.root / "capsule" / "deactivate-features.proposed.sql").write_text("changed")
        with self.assertRaises(Stop):
            load_capsule(self.root / "capsule", self.c.operation_hash)

    def test_durable_journal_failure_prevents_all_recovery_requests(self):
        (self.root / "journal" / "recovery-attempt.json").symlink_to(self.root / "elsewhere")
        with self.assertRaises(FileExistsError):
            self.r.recover()
        self.assertEqual(self.p.calls, [])

    def test_no_hosted_cli_or_secret_arguments(self):
        p = subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("p1_recovery.py")), "--recover"], capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertNotIn("Traceback", p.stderr)
        help_result = subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("p1_recovery.py")), "--help"], capture_output=True, text=True)
        self.assertIn("no hosted mode", help_result.stdout)

    def test_verified_roster_cannot_be_mutated(self):
        with self.assertRaises(TypeError):
            self.c.actors["platform-operator"] = (uid(), uid())

    def test_operator_interrupt_during_deactivation_still_attempts_session_cleanup(self):
        self.handoff()
        def interrupted(_req):
            raise KeyboardInterrupt()
        self.p.deactivate = interrupted
        self.assertEqual(self.r.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(self.p.state["sessions"], [])
        with self.assertRaises(Stop):
            self.r.recover()

    def test_preparation_utility_has_no_network_secret_reader_or_dynamic_execution(self):
        tree = ast.parse(Path(__file__).with_name("p1_recovery.py").read_text())
        allowed = {"argparse", "base64", "hashlib", "json", "os", "re", "stat", "threading",
                   "dataclasses", "pathlib", "concurrent.futures", "types"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                self.assertTrue(all(x.name in allowed for x in node.names))
            if isinstance(node, ast.ImportFrom):
                self.assertIn(node.module, allowed)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                self.assertNotIn(node.func.id, {"eval", "exec", "__import__"})

if __name__ == "__main__":
    unittest.main()
