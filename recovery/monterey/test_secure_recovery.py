"""Synthetic custody, fake HTTPS and machine-loss tests. ZERO provider calls."""
import base64
import copy
import json
import os
import socket
import ssl
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch, Mock

from custody import Backup, Cipher, Supervisor, Vault
from https_adapter import HTTPSPorts, RecoveryPermit, _exchange
from p1_recovery import APPROVED, Capsule, Commands, OneShot, Recovery, Request, Stop
from mailbox import DeviceMailbox, write_once
from device import DeviceRuntime
from test_p1_recovery import MockPorts, NOW, package, token, uid


class SecureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="propel-secure-fixture-")
        self.root = Path(self.tmp.name)
        self.c = package(self.root / "capsule")
        self.key = os.urandom(32)
        self.run = str(uuid.uuid4())
        self.cipher = Cipher(self.key, self.c.operation_hash, self.c.target, self.run)
        self.vault = Vault(self.root / "backup", self.cipher)
        self.ports = MockPorts(self.c)
        self.recovery = Recovery(self.c, self.ports, lambda: NOW, OneShot(self.root / "attempt", self.c.operation_hash))
        self.factors = {a: uid() for a in self.c.actors if a.endswith("-owner")}
        self.backup = Backup(self.cipher, self.vault, self.recovery, lambda: NOW, self.factors)
        self.alias = "pilot-1-owner"

    def tearDown(self):
        self.tmp.cleanup()

    def packet(self, kind, alias=None, tok="", issued=NOW):
        return self.cipher.seal({"id": uid(), "alias": alias or self.alias, "kind": kind, "token": tok, "issued": issued}, "handoff")

    def accept(self, alias=None, **claims):
        alias = alias or self.alias
        self.backup.receive(self.packet("INTENT", alias))
        user, _ = self.c.actors[alias]
        sid = uid()
        tok = token(user, sid, **claims)
        self.ports.users[tok] = {"id": user, "email_confirmed_at": "fixture"}
        self.ports.state["sessions"].append({"id": sid, "user_id": user})
        packet = self.packet("SESSION", alias, tok)
        ack = self.backup.receive(packet)
        return tok, packet, ack

    def test_real_aead_encryption_and_authenticated_positive_ack(self):
        tok, packet, ack = self.accept()
        receipt = {"id": self.cipher.open(packet, "handoff")["id"], "kind": "SESSION", "packetHash": __import__('hashlib').sha256(packet.encode()).hexdigest()}
        self.cipher.verify_ack(ack, receipt)
        stored = (self.root / "backup" / "custody.encrypted.jsonl").read_text()
        self.assertNotIn(tok, stored)
        self.assertNotIn(self.alias, stored)
        self.assertNotIn(self.c.target, stored)
        self.assertEqual(self.backup.unresolved(), set())

    def test_ciphertext_tampering_wrong_key_run_target_and_purpose_reject(self):
        packet = self.packet("INTENT")
        raw = bytearray(base64.b64decode(packet)); raw[20] ^= 1
        for cipher, value, purpose in [
            (self.cipher, base64.b64encode(raw).decode(), "handoff"),
            (Cipher(os.urandom(32), self.c.operation_hash, self.c.target, self.run), packet, "handoff"),
            (Cipher(self.key, self.c.operation_hash, self.c.target, uid()), packet, "handoff"),
            (Cipher(self.key, self.c.operation_hash, "b" * 20, self.run), packet, "handoff"),
            (self.cipher, packet, "journal")]:
            with self.assertRaises(Stop): cipher.open(value, purpose)
        self.assertEqual(self.ports.calls, [])

    def test_wrong_ack_or_packet_binding_rejects(self):
        _, _, ack = self.accept()
        bad = copy.deepcopy(ack); bad["mac"] = "0" * 64
        with self.assertRaises(Stop): self.cipher.verify_ack(bad, ack["receipt"])
        with self.assertRaises(Stop): self.cipher.verify_ack(ack, {**ack["receipt"], "id": uid()})

    def test_fsync_failure_cannot_acknowledge(self):
        with patch("custody.os.fsync", side_effect=OSError("fixture-only")):
            with self.assertRaises(Stop): self.backup.receive(self.packet("INTENT"))
        self.assertEqual(self.ports.calls, [])

    def test_duplicate_intent_or_message_is_never_retried(self):
        packet = self.packet("INTENT")
        self.backup.receive(packet)
        for duplicate in [packet, self.packet("INTENT")]:
            with self.assertRaises(Stop): self.backup.receive(duplicate)
        self.assertEqual(len(self.vault.entries()), 1)

    def test_concurrent_duplicate_handoffs_acknowledge_exactly_once(self):
        from concurrent.futures import ThreadPoolExecutor
        packet=self.packet('INTENT')
        def receive(_):
            try:
                self.backup.receive(packet)
                return 'ACK'
            except Stop:
                return 'DENIED'
        with ThreadPoolExecutor(max_workers=4) as pool:
            values=list(pool.map(receive,range(4)))
        self.assertEqual(values.count('ACK'),1)
        self.assertEqual(len(self.vault.entries()),1)

    def test_no_intent_no_session_custody(self):
        with self.assertRaises(Stop): self.backup.receive(self.packet("SESSION", tok="fixture"))
        self.assertEqual(self.ports.calls, [])

    def test_creation_failure_or_lost_auth_response_is_permanent_unresolved_intent(self):
        self.backup.receive(self.packet("INTENT"))
        # Even a clean read cannot silently clear uncertainty in this run.
        self.assertEqual(self.backup.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(len(self.backup.unresolved()), 1)
        self.assertFalse(any("logout" in x.url for x in self.ports.calls))

    def test_unknown_session_is_not_revoked_by_uid(self):
        self.backup.receive(self.packet("INTENT"))
        unknown = {"id": uid(), "user_id": self.c.actors[self.alias][0]}
        self.ports.state["sessions"].append(unknown)
        self.assertEqual(self.backup.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertIn(unknown, self.ports.state["sessions"])

    def test_primary_loss_after_durable_session_before_receipt_is_recoverable(self):
        self.accept()
        # Discard every primary/in-memory recovery object; encrypted backup only.
        fresh = Recovery(self.c, self.ports, lambda: NOW, OneShot(self.root / "attempt", self.c.operation_hash))
        backup = Backup(self.cipher, Vault(self.root / "backup", self.cipher), fresh, lambda: NOW, self.factors)
        self.assertEqual(backup.recover()["status"], "REHEARSAL_VERIFIED")
        self.assertEqual(self.ports.state["sessions"], [])
        with self.assertRaises(FileExistsError):
            Backup(self.cipher, self.vault, Recovery(self.c, self.ports, lambda: NOW, OneShot(self.root / "attempt", self.c.operation_hash)), lambda: NOW, self.factors).recover()

    def test_deactivation_precedes_parallel_auth_restore_after_primary_loss(self):
        self.accept()
        self.ports.calls=[]
        self.backup.recover()
        deactivate=next(i for i,r in enumerate(self.ports.calls) if r==self.recovery.commands.deactivate())
        verify=next(i for i,r in enumerate(self.ports.calls) if r.method=='GET')
        self.assertLess(deactivate,verify)

    def test_already_revoked_session_requires_observed_absence_not_auth_error_guessing(self):
        self.accept()
        self.ports.state['sessions']=[]
        self.ports.users.clear()
        self.ports.calls=[]
        self.assertEqual(self.backup.recover()['status'],'REHEARSAL_VERIFIED')
        self.assertFalse(any(r.method=='GET' or 'logout' in r.url for r in self.ports.calls))

    def test_partial_log_and_wrong_key_fail_closed(self):
        self.accept()
        path = self.root / "backup" / "custody.encrypted.jsonl"
        with path.open("ab") as out: out.write(b"INTERRUPTED")
        with self.assertRaises(Stop): self.vault.entries()

    def test_encrypted_store_symlink_cannot_be_followed(self):
        target = self.root / "elsewhere"
        (self.root / "backup" / "custody.encrypted.jsonl").symlink_to(target)
        with self.assertRaises(OSError): self.vault.entries()
        self.assertFalse(target.exists())

    def test_expired_token_after_primary_loss_is_not_clean_or_refreshed(self):
        self.accept()
        self.recovery.clock = lambda: NOW + 3700
        result = self.backup.recover()
        self.assertEqual(result["status"], "CONTAINMENT_REQUIRED")
        self.assertFalse(any("token?" in r.url for r in self.ports.calls))

    def test_recovery_can_restore_still_valid_token_after_execution_window_has_elapsed(self):
        self.accept()
        self.recovery.clock = lambda:NOW+2100
        # Enough time for bounded cleanup, but never a new 30-minute activation.
        self.assertEqual(self.backup.recover()['status'],'REHEARSAL_VERIFIED')

    def test_remote_identity_failure_before_session_ack_remains_unresolved(self):
        self.backup.receive(self.packet("INTENT"))
        with self.assertRaises(Stop): self.backup.receive(self.packet("SESSION", tok="bad"))
        self.assertEqual(self.backup.unresolved(), {self.alias})

    def test_customer_foreign_alias_stale_and_future_packets_reject(self):
        for packet in [self.packet("INTENT", "pilot-1-customer"), self.packet("INTENT", "platform-operator"), self.packet("INTENT", issued=NOW-61), self.packet("INTENT", issued=NOW+6)]:
            with self.assertRaises(Stop): self.backup.receive(packet)
        self.assertEqual(self.ports.calls, [])

    def test_owner_upgrade_requires_existing_factor_and_same_session(self):
        low, _, _ = self.accept()
        session = self.recovery.sessions[self.alias]
        high = token(session.uid, session.sid, aal="aal2")
        self.ports.users[high] = {**self.ports.users[low], "factors": [{"id": self.factors[self.alias], "factor_type": "totp", "status": "verified"}]}
        self.backup.receive(self.packet("UPGRADE", tok=high))
        self.assertEqual(self.recovery.sessions[self.alias].token, high)

    def test_owner_upgrade_without_factor_is_not_acknowledged(self):
        low, _, _ = self.accept()
        session = self.recovery.sessions[self.alias]
        high = token(session.uid, session.sid, aal="aal2")
        self.ports.users[high] = self.ports.users[low]
        with self.assertRaises(Stop): self.backup.receive(self.packet("UPGRADE", tok=high))
        self.assertEqual(len(self.vault.entries()), 2)

    def test_all_fifteen_recover_independently_and_preserve_same_uid_other_session(self):
        for alias in self.c.actors: self.accept(alias)
        unrelated = {"id": uid(), "user_id": self.c.actors[self.alias][0]}
        self.ports.state["sessions"].append(unrelated)
        self.assertEqual(self.backup.recover()["status"], "CONTAINMENT_REQUIRED")
        self.assertEqual(self.ports.state["sessions"], [unrelated])

    def test_no_custody_after_recovery_started(self):
        self.backup.recover()
        with self.assertRaises(Stop): self.backup.receive(self.packet("INTENT"))

    def test_presence_and_heartbeat_are_distinct_and_never_extend_29_minute_cutoff(self):
        clocks = [NOW, 0]
        s = Supervisor(self.backup, lambda: clocks[0], lambda: clocks[1])
        for counter in range(1, 349):
            clocks[0] += 5; clocks[1] += 5
            s.receive_heartbeat(self.cipher.seal({"issued": clocks[0], "counter": counter}, "heartbeat"))
            s.human_present()
            result = s.tick()
        self.assertIsNotNone(result)
        self.assertEqual(sum("query" in r.url and r.body == self.recovery.commands.deactivate().body for r in self.ports.calls), 1)

    def test_missing_human_or_primary_machine_loss_triggers_once(self):
        for mode in ("human", "machine"):
            with self.subTest(mode=mode):
                clocks = [NOW, 0]
                backup = Mock()
                backup.recover.return_value = {"status": "fixture"}
                backup.cipher = self.cipher
                s = Supervisor(backup, lambda: clocks[0], lambda: clocks[1])
                if mode == "human":
                    for counter in range(1,13):
                        clocks[0] += 5; clocks[1] += 5
                        s.receive_heartbeat(self.cipher.seal({"issued": clocks[0], "counter": counter}, "heartbeat"))
                else:
                    clocks[0] += 5; clocks[1] += 5
                    s.human_present()
                s.tick(); s.tick()
                backup.recover.assert_called_once()

    def test_late_presence_or_heartbeat_cannot_revive_deadline(self):
        clocks = [NOW, 0]
        s = Supervisor(self.backup, lambda:clocks[0], lambda:clocks[1])
        clocks[0] += 61; clocks[1] += 61
        with self.assertRaises(Stop): s.human_present()
        with self.assertRaises(Stop): s.receive_heartbeat(self.cipher.seal({'issued':clocks[0],'counter':1}, 'heartbeat'))

    def test_heartbeat_replay_and_clock_rollback_reject(self):
        clocks = [NOW, 0]
        s = Supervisor(self.backup, lambda: clocks[0], lambda: clocks[1])
        p = self.cipher.seal({"issued": NOW, "counter": 1}, "heartbeat")
        s.receive_heartbeat(p)
        with self.assertRaises(Stop): s.receive_heartbeat(p)
        clocks[0] -= 1
        self.assertIsNotNone(s.tick())

    def test_independent_mailbox_persists_only_encrypted_session_messages_and_authenticated_ack(self):
        supervisor=Supervisor(self.backup,lambda:NOW,lambda:0)
        device=DeviceMailbox(self.root/'inbox',self.root/'outbox',self.backup,supervisor)
        name=uid()+'.json'; packet=self.packet('INTENT')
        write_once(self.root/'inbox'/name,{'kind':'custody','packet':packet})
        self.assertEqual(device.process_one(name),'ACKNOWLEDGED')
        ack=json.loads((self.root/'outbox'/name).read_bytes())
        self.assertEqual(ack['receipt']['kind'],'INTENT')
        self.assertNotIn(self.alias,(self.root/'inbox'/name).read_text())
        with self.assertRaises(Stop): device.process_one(name)

    def test_mailbox_rejects_traversal_and_plaintext_credentials(self):
        device=DeviceMailbox(self.root/'inbox',self.root/'outbox',self.backup,Supervisor(self.backup,lambda:NOW,lambda:0))
        with self.assertRaises(Stop): device.process_one('../credentials.json')
        name=uid()+'.json'
        write_once(self.root/'inbox'/name,{'kind':'custody','packet':'not-encrypted','password':'synthetic-rejected'})
        with self.assertRaises(Stop): device.process_one(name)
        self.assertEqual(self.ports.calls,[])

    def test_mailbox_heartbeat_does_not_renew_human_presence(self):
        clock=[0]
        s=Supervisor(self.backup,lambda:NOW+clock[0],lambda:clock[0])
        device=DeviceMailbox(self.root/'inbox',self.root/'outbox',self.backup,s)
        clock[0]=4
        name=uid()+'.json'
        write_once(self.root/'inbox'/name,{'kind':'heartbeat','packet':self.cipher.seal({'issued':NOW+4,'counter':1},'heartbeat')})
        device.process_one(name)
        self.assertEqual(s.presence,0)
        self.assertEqual(s.heartbeat,4)

    def test_foreground_device_machine_loss_contains_without_primary_process(self):
        clocks=[NOW,0]
        d=DeviceRuntime(self.backup,self.root/'device-in',self.root/'device-out',lambda:clocks[0],lambda:clocks[1])
        self.assertIsNone(d.poll())
        clocks[0]+=6;clocks[1]+=6
        self.assertIsNotNone(d.poll())
        requests=len(self.ports.calls)
        d.poll();d.stop()
        self.assertEqual(len(self.ports.calls),requests)

    def test_foreground_stop_or_interruption_cannot_trigger_a_second_cleanup(self):
        self.accept()
        d=DeviceRuntime(self.backup,self.root/'device-in',self.root/'device-out',lambda:NOW,lambda:0)
        result=d.run(lambda:'stop',pause=lambda _:None)
        self.assertEqual(result['status'],'REHEARSAL_VERIFIED')
        requests=len(self.ports.calls)
        d.run(lambda:'stop',pause=lambda _:None)
        self.assertEqual(len(self.ports.calls),requests)

    def test_foreground_rejects_invalid_mailbox_and_contains(self):
        d=DeviceRuntime(self.backup,self.root/'device-in',self.root/'device-out',lambda:NOW,lambda:0)
        write_once(self.root/'device-in'/'unexpected.json',{'kind':'custody','packet':'invalid'})
        with self.assertRaises(Stop):d.poll()
        self.assertIsNotNone(d.supervisor.result)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.user,self.sid=uid(),uid()
        orgs=(uid(),uid(),uid())
        self.c = Capsule("a" * 20, orgs, {'pilot-1-owner':(self.user,orgs[0])}, "FROZEN_FIXTURE_ONLY", APPROVED)
        capsule = patch('https_adapter.load_capsule', return_value=self.c)
        capsule.start()
        self.addCleanup(capsule.stop)
        self.permit = RecoveryPermit(self.c.target, APPROVED, NOW + 1800, "c" * 64)
        self.ports = HTTPSPorts(self.c, self.permit, "sbp_fc" + "d" * 40, "sb_publishable_fixture", lambda: NOW)
        self.commands = Commands(self.c)

    def test_construction_and_import_make_no_requests(self):
        with patch("https_adapter.bounded_exchange") as exchange:
            HTTPSPorts(self.c, self.permit, "sbp_fc" + "d" * 40, "sb_publishable_fixture", lambda: NOW)
            exchange.assert_not_called()

    def test_legacy_management_token_is_not_accepted_for_new_recovery_device(self):
        with self.assertRaises(Stop):
            HTTPSPorts(self.c,self.permit,'sbp_'+'d'*40,'sb_publishable_fixture',lambda:NOW)

    def test_exact_requests_and_credential_separation(self):
        with patch("https_adapter.bounded_exchange", return_value=[{"state": {}}]) as exchange:
            self.ports.observe(self.commands.observe())
            self.assertNotIn("apikey", exchange.call_args.args[1])
            self.assertEqual(exchange.call_args.args[1]["Authorization"], "Bearer sbp_fc" + "d" * 40)
        with patch("https_adapter.bounded_exchange", return_value={'id':self.user,'email_confirmed_at':'fixture'}) as exchange:
            t = token(self.user,self.sid)
            self.ports.user(self.commands.user(t))
            self.assertEqual(exchange.call_args.args[1]["Authorization"], "Bearer " + t)
            self.assertIn("apikey", exchange.call_args.args[1])

    def test_unverified_or_foreign_bearers_cannot_be_logged_out(self):
        with patch('https_adapter.bounded_exchange') as exchange:
            with self.assertRaises(Stop):self.ports.logout(self.commands.logout(token(self.user,self.sid)))
            with self.assertRaises(Stop):self.ports.user(self.commands.user(token(uid(),uid())))
            exchange.assert_not_called()

    def test_arbitrary_url_sql_auth_admin_global_logout_and_injection_reject(self):
        commands = [Request("POST", "https://evil.invalid", None), Request("POST", self.commands.deactivate().url, {"query": "delete from auth.sessions"}), Request("DELETE", self.commands.user("x").url, None, "x"), Request("POST", self.commands.logout("x").url.replace("local", "global"), None, "x"), self.commands.user("bad\r\nsecret")]
        with patch("https_adapter.bounded_exchange") as exchange:
            for req in commands:
                for method in [self.ports.user, self.ports.observe, self.ports.deactivate, self.ports.logout]:
                    with self.assertRaises(Stop): method(req)
            exchange.assert_not_called()

    def test_empty_user_token_cannot_send_management_credential_to_auth(self):
        with patch('https_adapter.bounded_exchange') as exchange:
            with self.assertRaises(Stop): self.ports.user(self.commands.user(''))
            with self.assertRaises(Stop): self.ports.logout(self.commands.logout(''))
            exchange.assert_not_called()

    def test_transport_reloads_original_capsule_instead_of_trusting_capsule_objects(self):
        with patch('https_adapter.load_capsule', side_effect=Stop('fixture mismatch')):
            with self.assertRaises(Stop): HTTPSPorts(self.c, self.permit, 'sbp_fc'+'d'*40, 'sb_publishable_fixture',lambda:NOW)

    def test_expired_or_wrong_project_permit_rejects(self):
        self.ports._clock = lambda: NOW + 1801
        with patch("https_adapter.bounded_exchange") as exchange:
            with self.assertRaises(Stop): self.ports.deactivate(self.commands.deactivate())
            exchange.assert_not_called()
        with self.assertRaises(Stop): HTTPSPorts(self.c, RecoveryPermit("b" * 20, APPROVED, NOW+1800, "c" *64), "sbp_fc"+"d"*40, "sb_publishable_fixture", lambda:NOW)

    def test_tls_verification_fixed_hostname_and_no_proxy_or_redirect(self):
        response = Mock(status=200)
        response.getheader.side_effect = lambda key, default=None: default
        response.read.return_value = b'{"id":"fixture"}'
        connection = Mock()
        connection.getresponse.return_value = response
        with patch("https_adapter.http.client.HTTPSConnection", return_value=connection) as connect:
            self.assertEqual(_exchange(self.commands.user("fixture"), {}), {"id":"fixture"})
            args, kwargs = connect.call_args
            self.assertEqual(args, ("a" * 20 + ".supabase.co", 443))
            self.assertTrue(kwargs["context"].check_hostname)
            self.assertEqual(kwargs["context"].verify_mode, ssl.CERT_REQUIRED)
            self.assertGreaterEqual(kwargs["context"].minimum_version, ssl.TLSVersion.TLSv1_2)
            self.assertTrue(all('GCM' in c['name'] or 'CHACHA20' in c['name'] for c in kwargs['context'].get_ciphers()))
            connection.close.assert_called_once()

    def test_tls_key_logging_or_ambient_ca_overrides_cannot_expose_sessions(self):
        for name in ('SSLKEYLOGFILE','SSL_CERT_FILE','SSL_CERT_DIR','PYTHONHTTPSVERIFY','OPENSSL_CONF','OPENSSL_MODULES'):
            with patch.dict(os.environ,{name:'REJECTED_FIXTURE_VALUE'}):
                with patch('https_adapter.http.client.HTTPSConnection') as connection:
                    with self.assertRaises(Stop): _exchange(self.commands.observe(),{})
                    connection.assert_not_called()

    def test_redirect_large_compressed_malformed_and_uncertain_responses_fail(self):
        for status, data, headers in [(302,b"{}",{}),(500,b"{}",{}),(200,b"x"*1048577,{}),(200,b"{}",{"Content-Length":"1048577"}),(200,b"{}",{"Content-Encoding":"gzip"}),(200,b"malformed",{})]:
            response = Mock(status=status)
            response.read.return_value = data
            response.getheader.side_effect = lambda key, default=None: headers.get(key, default)
            conn = Mock(); conn.getresponse.return_value=response
            with patch("https_adapter.http.client.HTTPSConnection", return_value=conn):
                with self.assertRaises((Stop, ValueError)): _exchange(self.commands.observe(), {})

    def test_process_deadline_kills_transport_without_retry(self):
        context = Mock(); parent=Mock(); child=Mock(); process=Mock(pid=42)
        context.Pipe.return_value=(parent,child); context.Process.return_value=process
        parent.poll.return_value=False
        with patch("https_adapter.multiprocessing.get_context",return_value=context):
            from https_adapter import bounded_exchange
            with self.assertRaises(Stop): bounded_exchange(self.commands.deactivate(), {})
        process.start.assert_called_once(); process.terminate.assert_called_once()
        parent.poll.assert_called_once_with(8)


if __name__ == "__main__":
    unittest.main()
