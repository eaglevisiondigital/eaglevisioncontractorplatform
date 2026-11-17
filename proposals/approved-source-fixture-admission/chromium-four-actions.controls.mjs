import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const oldPath = new URL(
  '../../scripts/cycle30-chromium-dependencies.mjs',
  import.meta.url,
);
const before = readFileSync(oldPath, 'utf8');
const proposal = JSON.parse(
  readFileSync(
    new URL('./chromium-four-actions.proposal.json', import.meta.url),
    'utf8',
  ),
);
const after = proposal.afterBody;
const hash = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(
  hash(before),
  '531b1f3b43e38975a456a8421fc7135991b89313e22e0f87daa5ecc673bf659f',
);
assert.equal(
  hash(after),
  'e2b034cfbdf1e7b3b44e8f2eb3b51ffabec5341097ed9cb1d2307a65f36ba762',
);
assert.equal(
  hash(proposal.unifiedPatch),
  '5399256c239142a5b84ec2ef601ef18414e6a2c8dc51038b520ebafae00d27a3',
);
assert.equal(proposal.parent, '27e5b5fd1ac6566d1f56db33e139ca8d7a12121e');
// Main command entry cannot match this data URL. Only pure exports are exercised.
const original = await import(
  'data:text/javascript;base64,' + Buffer.from(before).toString('base64')
);
const proposed = await import(
  'data:text/javascript;base64,' + Buffer.from(after).toString('base64')
);
const literal =
  "      'libgbm1',\n      'libgl1-mesa-dri',\n      'libglx-mesa0',\n      'mesa-libgallium',\n";
const azure =
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n';
const direct =
  'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-backports\nComponents: main universe restricted multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg';
test('reverse only four package literals reproduces every original byte', () => {
  assert.equal(after.split(literal).length, 2);
  assert.equal(after.replace(literal, ''), before);
});
test('original update command and signed source options stay exact', () => {
  assert.deepEqual(
    proposed.dependencyCommands()[0],
    original.dependencyCommands()[0],
  );
  assert.deepEqual(
    proposed.dependencyCommands()[1].slice(0, 8),
    original.dependencyCommands()[1].slice(0, 8),
  );
});
test('only exact four observed actions are added before original nine fonts', () => {
  const current = original.dependencyCommands()[1],
    next = proposed.dependencyCommands()[1];
  assert.deepEqual(proposed.fonts, original.fonts);
  assert.equal(proposed.fonts.length, 9);
  assert.equal(next.length, current.length + 4);
  assert.deepEqual(next.slice(-13, -9), [
    'libgbm1',
    'libgl1-mesa-dri',
    'libglx-mesa0',
    'mesa-libgallium',
  ]);
  assert.deepEqual([...next.slice(0, -13), ...next.slice(-9)], current);
});
test('existing exact reviewed Azure mirror triple remains accepted', () =>
  assert.equal(proposed.validateUbuntuMirrors(azure), true));
test('observed AWS mirror remains denied despite official source match', () =>
  assert.throws(() =>
    proposed.validateUbuntuMirrors(
      azure.replace('azure.archive', 'us-east-2.ec2.archive'),
    ),
  ));
test('unknown mirror origin remains denied', () =>
  assert.throws(() =>
    proposed.validateUbuntuMirrors(
      azure.replace('azure.archive.ubuntu.com', 'attacker.invalid'),
    ),
  ));
test('mirror priority substitution remains denied', () =>
  assert.throws(() =>
    proposed.validateUbuntuMirrors(azure.replace('priority:1', 'priority:2')),
  ));
test('duplicate mirror remains denied', () =>
  assert.throws(() =>
    proposed.validateUbuntuMirrors(
      azure.replace(
        'https://security.ubuntu.com/ubuntu/\tpriority:3',
        'https://archive.ubuntu.com/ubuntu/\tpriority:2',
      ),
    ),
  ));
test('additional mirror remains denied', () =>
  assert.throws(() =>
    proposed.validateUbuntuMirrors(
      azure + 'https://attacker.invalid/\tpriority:4\n',
    ),
  ));
test('original exact signed Ubuntu24 source remains accepted', () =>
  assert.equal(proposed.validateUbuntuSources(direct), true));
test('signature key substitution remains denied', () =>
  assert.throws(() =>
    proposed.validateUbuntuSources(
      direct.replace(
        '/usr/share/keyrings/ubuntu-archive-keyring.gpg',
        '/tmp/key',
      ),
    ),
  ));
test('trust bypass field remains denied', () =>
  assert.throws(() =>
    proposed.validateUbuntuSources(direct + '\nTrusted: yes'),
  ));
test('wrong suite and duplicate source remain denied', () => {
  assert.throws(() =>
    proposed.validateUbuntuSources(
      direct.replace('noble noble-updates noble-backports', 'resolute'),
    ),
  );
  assert.throws(() =>
    proposed.validateUbuntuSources(
      direct + '\nURIs: https://attacker.invalid/',
    ),
  );
});
