"""Focused setup fail-closed tests; subprocess installer is stubbed, never contacts PyPI."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import verify_package as verify

ROOT = Path(__file__).parent


class SetupTests(unittest.TestCase):
    def test_exact_transitive_versions_and_native_cipher_are_checked(self):
        with patch.object(verify, "version", side_effect=lambda n: verify.DEPENDENCIES[n]):
            verify.check_dependencies()

    def test_old_or_partial_environment_rejects(self):
        for bad in ("cryptography", "cffi", "pycparser"):
            with patch.object(verify, "version", side_effect=lambda n: "0.0.0" if n == bad else verify.DEPENDENCIES[n]):
                with self.assertRaises(SystemExit):
                    verify.check_dependencies()

    def test_native_cipher_failure_rejects_metadata_only_success(self):
        with patch.object(verify, "version", side_effect=lambda n: verify.DEPENDENCIES[n]), patch(
                "cryptography.hazmat.primitives.ciphers.aead.AESGCM", side_effect=ImportError()):
            with self.assertRaises(SystemExit):
                verify.check_dependencies()

    def setup_run(self, pip_exit=0, dependency_exit=0):
        with tempfile.TemporaryDirectory(prefix="propel-synthetic-setup-") as temp:
            root=Path(temp)
            (root/"Setup.command").write_bytes((ROOT/"Setup.command").read_bytes())
            python=root/"fake-python"
            python.write_text('#!/bin/sh\nif [ "$1" = "-m" ] && [ "$2" = "venv" ]; then\nmkdir -p .venv/bin\ncp venv-python .venv/bin/python\nfi\nexit 0\n')
            python.chmod(0o700)
            venv=root/"venv-python"
            venv.write_text('#!/bin/sh\nprintf "%s\\n" "$@" >> calls.txt\nif [ "$1" = "-m" ]; then exit '+str(pip_exit)+'; fi\nexit '+str(dependency_exit)+'\n')
            venv.chmod(0o700)
            result=subprocess.run(['/bin/bash','Setup.command'],cwd=root,input=str(python)+'\n\n',capture_output=True,text=True,timeout=10)
            return result,(root/'calls.txt').read_text()

    def test_pip_failure_never_prints_setup_complete(self):
        result,calls=self.setup_run(pip_exit=42)
        self.assertEqual(result.returncode,42)
        self.assertNotIn('SETUP COMPLETE',result.stdout)
        self.assertNotIn('--dependencies',calls)

    def test_post_install_mismatch_never_prints_setup_complete(self):
        result,calls=self.setup_run(dependency_exit=43)
        self.assertEqual(result.returncode,43)
        self.assertNotIn('SETUP COMPLETE',result.stdout)
        self.assertIn('--dependencies',calls)

    def test_setup_uses_only_separate_pinned_binary_lock(self):
        result,calls=self.setup_run()
        self.assertEqual(result.returncode,0)
        self.assertIn('SETUP COMPLETE',result.stdout)
        for flag in ('--require-hashes','--only-binary=:all:','--force-reinstall','--no-deps','--isolated','rehearsal-requirements.lock'):
            self.assertIn(flag,calls.splitlines())
        self.assertNotIn('requirements.lock',calls.splitlines())

    def test_all_launchers_refuse_unverified_dependencies(self):
        for name in ('Primary.command','Backup.command','Recover.command'):
            content=(ROOT/name).read_text()
            self.assertIn('set -eu',content)
            self.assertLess(content.index('verify_package.py --dependencies'),content.index('exec .venv/bin/python'))


if __name__ == '__main__':
    unittest.main()
