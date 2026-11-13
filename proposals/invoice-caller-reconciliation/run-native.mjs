// Reuse the reviewed disposable PG17 harness; change ONLY its exact test selection.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const original = readFileSync(
  'scripts/test-customer-requests-native.mjs',
  'utf8',
);
assert.equal(
  createHash('sha256').update(original).digest('hex'),
  'fe1b5ad702033676d33b689b74d4d5a2ba925aaadaa177bb0f21b11e53a6efbd',
);
const selection = `process.argv.includes('--broker')
        ? 'tests/database/customer-broker.test.ts'
        : 'tests/database/customer-requests.test.ts'`;
assert.equal(
  original.split(selection).length,
  2,
  'Exact existing harness selection required',
);
const scratch = mkdtempSync(join(tmpdir(), 'propel-invoice-harness-'));
try {
  const file = join(scratch, 'native.mjs');
  writeFileSync(
    file,
    original.replace(
      selection,
      "'tests/database/commercial-invoice-caller-proposal.test.ts'",
    ),
    { mode: 0o600 },
  );
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error('Disposable native proposal verification failed');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
