// Historical inventory fixture only; current closeout source stays independently live.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const path = 'tests/cycle17-integration.test.ts';
export async function makeRetainedInventory() {
  const bytes = readFileSync('proposals/c17-launch-integration/qualify.mjs');
  assert.equal(
    sha(bytes),
    '26e3f8efc619e126cec684106d4683e8131ac37826173a0dfcd42a78711c22c2',
    'Reviewed C17 qualifier required before import',
  );
  const qualifier = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
  const proof = await qualifier.preflight();
  assert.equal(
    proof.canonicalMode,
    'integrated',
    'Exact admitted closeout required',
  );
  const originals = execFileSync('git', [
    '--no-replace-objects',
    'show',
    'bd8f150c1a347fd172cf5922d67e2664af59f14b:' + path,
  ]);
  assert.equal(
    sha(originals),
    'f9d7a16d29cebb66070aabbd85ccdc10c09bce2eadeb2e70c525e0749a0a0089',
  );
  const lineagePath = 'scripts/cycle25-source-lineage.mjs';
  const lineage = execFileSync('git', [
    '--no-replace-objects',
    'show',
    '276fbe4357a5ccc3593374e4cd359a10e8ae1bf6:' + lineagePath,
  ]);
  assert.equal(
    sha(readFileSync(lineagePath)),
    sha(lineage),
    'Reviewed lineage helper required',
  );
  const fresh = () => {
    const lineageInfo = lstatSync(lineagePath);
    assert(
      lineageInfo.isFile() &&
        !lineageInfo.isSymbolicLink() &&
        (lineageInfo.mode & 0o777) === 0o644,
      'Fresh regular lineage helper required',
    );
    assert.equal(
      sha(readFileSync(lineagePath)),
      sha(lineage),
      'Fresh lineage helper required',
    );
    for (const f of proof.record.files) {
      const info = lstatSync(f.path);
      assert(
        info.isFile() &&
          !info.isSymbolicLink() &&
          (info.mode & 0o777) === 0o644,
        'Regular admitted closeout required',
      );
      assert.equal(
        sha(readFileSync(f.path)),
        f.after,
        'Fresh complete admitted closeout required',
      );
    }
  };
  return {
    wrap(actual) {
      fresh();
      const read = (p) => {
        fresh();
        return p === path
          ? Buffer.from(originals)
          : actual.cycle25SourcePorts.read(p);
      };
      return {
        ...actual,
        cycle25SourcePorts: { ...actual.cycle25SourcePorts, read },
        admitCycle33V1C17Compatibility(file, current, ports = {}) {
          fresh();
          return actual.admitCycle33V1C17Compatibility(file, current, {
            read,
            ...ports,
          });
        },
      };
    },
  };
}
