"""Disposable cross-language peer. Mock Auth only, never real transport/credentials."""
import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'recovery' / 'monterey'))
from custody import Backup, Cipher, Vault
from p1_recovery import APPROVED, Capsule, OneShot, Recovery

value = json.load(sys.stdin)
if value['target'] != 'a' * 20 or value['operation'] == APPROVED:
    raise SystemExit('Disposable peer only')
c = Capsule(value['target'], tuple(value['organizations']), value['actors'], 'FIXTURE_ONLY', value['operation'])
cipher = Cipher(base64.b64decode(value['key']), c.operation_hash, c.target, value['run'])

class Ports:
    def user(self, request):
        claims = json.loads(base64.urlsafe_b64decode(request.token.split('.')[1] + '==='))
        alias = next(a for a in c.actors if c.actors[a][0] == claims['sub'])
        return {'id': claims['sub'], 'email_confirmed_at': 'fixture', 'factors': [
            {'id': 'fixture-factor-' + alias, 'factor_type': 'totp', 'status': 'verified'}]}

vault = Vault(value['root'], cipher)
recovery = Recovery(c, Ports(), lambda: value['now'], OneShot(Path(value['root']) / 'attempt', c.operation_hash))
backup = Backup(cipher, vault, recovery, lambda: value['now'], {a: 'fixture-factor-' + a for a in c.actors if a.endswith('-owner')})
backup.restore()
print(json.dumps(backup.receive(value['packet'])))
