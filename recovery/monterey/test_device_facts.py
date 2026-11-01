"""Intake helper regressions; mocked OS commands, not actual second-device proof."""
import ast
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import device_facts


class DeviceFactsTests(unittest.TestCase):
    def mac(self, status="FileVault is On.", version="26.7.1"):
        stack = [patch("device_facts.platform.system", return_value="Darwin"),
                 patch("device_facts.platform.mac_ver", return_value=(version, (), "arm64")),
                 patch("device_facts.platform.machine", return_value="arm64"),
                 patch("device_facts.fixed_read", side_effect=["MacFixture,1", "FIXTURE_BUILD", status])]
        for item in stack:
            item.start(); self.addCleanup(item.stop)
        return device_facts.collect()

    def test_intake_never_promotes_reported_filevault_to_independent_readiness(self):
        value=self.mac()
        self.assertEqual(value["bootVolumeEncryption"],"FILEVAULT_ON_BOOT_VOLUME_ONLY")
        self.assertEqual(value["physicalIndependence"],"NOT_VERIFIED")
        self.assertEqual(value["readiness"],"INTAKE_ONLY_NOT_APPROVAL_OR_PASS")
        self.assertEqual(value["rehearsal"],"NOT_RUN")

    def test_monterey_is_explicitly_prohibited_for_privileged_custody(self):
        self.assertEqual(self.mac(version="12.7.6")["montereyCredentialCustody"],"PROHIBITED")

    def test_incomplete_encryption_or_unknown_status_is_not_pass(self):
        for text,expected in [("FileVault is Off.","FILEVAULT_OFF"),("Encryption in progress: 90%", "TRANSITION_INCOMPLETE"),(None,"NOT_VERIFIED")]:
            with patch("device_facts.platform.system",return_value="Darwin"), patch("device_facts.fixed_read",side_effect=["fixture","fixture",text]):
                self.assertEqual(device_facts.collect()["bootVolumeEncryption"],expected)

    def test_other_os_needs_review_and_does_not_run_mac_commands(self):
        with patch("device_facts.platform.system",return_value="Linux"),patch("device_facts.fixed_read") as command:
            value=device_facts.collect()
            self.assertEqual(value['bootVolumeEncryption'],'NOT_VERIFIED')
            self.assertEqual(value['osSupport'],'REQUIRES_CURRENT_VENDOR_AND_MODEL_REVIEW')
            command.assert_not_called()

    def test_fixed_reads_are_bounded_noninteractive_and_do_not_inherit_credentials(self):
        with patch("device_facts.subprocess.run",return_value=Mock(returncode=0,stdout=b"fixture")) as run:
            self.assertEqual(device_facts.fixed_read(["/usr/bin/sw_vers","-buildVersion"]),"fixture")
            options=run.call_args.kwargs
            self.assertEqual(options['timeout'],3)
            self.assertEqual(options['stdin'],subprocess.DEVNULL)
            self.assertEqual(set(options['env']),{'PATH','LANG','LC_ALL'})
            self.assertNotIn('shell',options)

    def test_errors_are_sanitized_and_do_not_prompt_for_sudo_or_keychain(self):
        with patch("device_facts.subprocess.run",side_effect=subprocess.TimeoutExpired('fixture',3)):
            self.assertIsNone(device_facts.fixed_read(["/usr/bin/fdesetup","status"]))
        with patch("device_facts.subprocess.run",return_value=Mock(returncode=1,stdout=b'PRIVATE_ERROR')):
            self.assertIsNone(device_facts.fixed_read(["/usr/bin/fdesetup","status"]))

    def test_unknown_execution_or_credential_arguments_are_rejected(self):
        script=Path(__file__).with_name('device_facts.py')
        value=subprocess.run([sys.executable,'-B',str(script),'--execute'],capture_output=True,text=True)
        self.assertNotEqual(value.returncode,0)
        self.assertNotIn('Traceback',value.stderr)
        self.assertNotIn('hardwareModel',value.stdout)

    def test_source_reads_no_hostname_serial_password_keychain_or_network(self):
        source=Path(device_facts.__file__).read_text()
        tree=ast.parse(source)
        allowed={'argparse','json','platform','ssl','subprocess','datetime'}
        for node in ast.walk(tree):
            if isinstance(node,ast.Import):self.assertTrue(all(i.name in allowed for i in node.names))
            if isinstance(node,ast.ImportFrom):self.assertIn(node.module,allowed)
        for marker in ('gethostname(', 'IOPlatformSerialNumber', 'find-generic-password', 'https://', 'shell=True'):
            self.assertNotIn(marker,source)
        self.assertNotIn('serial',json.dumps(self.mac()).lower())


if __name__ == '__main__':
    unittest.main()
