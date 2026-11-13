// Historical test read port only. Exact live payment source is verified separately.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const adapter = 'proposals/payment-response-admission/fixture-adapter.mjs';
const adapterHash =
  '4ccab151297b44da76057199cb3cabfcd2c73c3e20ed6761c27737db16468203';
const baseline = '394d7fc1bbc6d6a27440e881bc3e9bf3d76befa6';
const originals = {
  'scripts/invoice-caller-source-admission.mjs':
    '2a6ffb692443a7830df021e9a8cce048ac4388947e03a27af4286b4e26ee9a25',
  'tests/invoice-caller-migration-source.test.ts':
    '4879c0b0f3da8bc2e5d981faae43fe443c317ffcd400b654fc550f0605149a08',
  'tests/launch-invoice-payment-source.test.ts':
    '9ed3efe744bdb9003d3d8459e62dd5fe9479475768df6cb58dc4d8257ef37b00',
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
function verifiedAdapter() {
  let prefix = '';
  for (const part of adapter.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    assert(!lstatSync(prefix).isSymbolicLink());
  }
  const info = lstatSync(adapter);
  assert(
    info.isFile() && (info.mode & 0o777) === 0o644,
    'Exact historical read adapter mode required',
  );
  const bytes = readFileSync(adapter);
  assert.equal(
    sha(bytes),
    adapterHash,
    'Exact historical read adapter required before import',
  );
  return bytes;
}
const { verifyPaymentFrame } = await import(
  'data:text/javascript;base64,' + verifiedAdapter().toString('base64')
);
verifyPaymentFrame();
export function historicalInvoiceRead(path, ...args) {
  if (!Object.hasOwn(originals, path)) return readFileSync(path, ...args);
  verifiedAdapter();
  verifyPaymentFrame();
  const bytes = execFileSync(
    'git',
    ['--no-replace-objects', 'show', baseline + ':' + path],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  assert.equal(
    sha(bytes),
    originals[path],
    'Exact original invoice fixture required',
  );
  verifyPaymentFrame();
  const encoding = typeof args[0] === 'string' ? args[0] : args[0]?.encoding;
  return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
}
