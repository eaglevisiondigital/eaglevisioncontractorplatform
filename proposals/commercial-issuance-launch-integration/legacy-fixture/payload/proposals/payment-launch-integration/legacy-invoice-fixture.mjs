// Historical test read port only. Exact live payment source is verified separately.
import assert from 'node:assert/strict';
import { readFileSync as nodeReadFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';
// Authenticate the approved guard fixture before evaluating its captured bytes.
const guardFixturePath =
  'proposals/invoice-guard-admission/fixture-adapter.mjs';
let guardFixturePrefix = '';
for (const part of guardFixturePath.split('/')) {
  guardFixturePrefix = guardFixturePrefix
    ? guardFixturePrefix + '/' + part
    : part;
  const info = lstatSync(guardFixturePrefix);
  if (
    info.isSymbolicLink() ||
    (guardFixturePrefix !== guardFixturePath && !info.isDirectory())
  )
    throw Error('Reviewed invoice guard fixture required');
}
const guardFixtureInfo = lstatSync(guardFixturePath);
if (!guardFixtureInfo.isFile() || (guardFixtureInfo.mode & 0o777) !== 0o644)
  throw Error('Reviewed invoice guard fixture required');
const guardFixtureBytes = nodeReadFileSync(guardFixturePath);
if (
  createHash('sha256').update(guardFixtureBytes).digest('hex') !==
  '6c6a5758d3a3219b4fac88e5dbbeb2e24f6182bf73c8eba3f7bc5c44c8cd61bc'
)
  throw Error('Reviewed invoice guard fixture required before import');
const { createHistoricalRead } = await import(
  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')
);
// This historical read requires the actual approved guard frame on every read.
const readFileSync = createHistoricalRead(nodeReadFileSync);

const adapter = 'proposals/payment-response-admission/fixture-adapter.mjs';
const adapterHash =
  '78c5bfe95bfe6e546267c52216fbad52aff57933826f24fbbf59f70f1a60a222';
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
verifyPaymentFrame({ read: readFileSync });
export function historicalInvoiceRead(path, ...args) {
  if (!Object.hasOwn(originals, path)) return readFileSync(path, ...args);
  verifiedAdapter();
  verifyPaymentFrame({ read: readFileSync });
  const bytes = execFileSync(
    'git',
    [
      '--no-replace-objects',
      '--no-pager',
      '-c',
      'core.hooksPath=' + devNull,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.attributesFile=' + devNull,
      '-c',
      'credential.helper=',
      '-c',
      'diff.external=',
      'show',
      '--no-ext-diff',
      '--no-textconv',
      '--no-color',
      baseline + ':' + path,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: devNull,
        GIT_CONFIG_GLOBAL: devNull,
        GIT_CONFIG_COUNT: '0',
        GIT_ATTR_NOSYSTEM: '1',
        GIT_ALLOW_PROTOCOL: '',
        GIT_NO_LAZY_FETCH: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
      },
    },
  );
  assert.equal(
    sha(bytes),
    originals[path],
    'Exact original invoice fixture required',
  );
  verifyPaymentFrame({ read: readFileSync });
  const encoding = typeof args[0] === 'string' ? args[0] : args[0]?.encoding;
  return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
}
