// Historical test read port only. Exact live payment source is verified separately.
import assert from 'node:assert/strict';
import {
  readFileSync as nodeReadFileSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';
// Derive the adapter forward from the reviewed producer; never accept a new hash
// merely because it is present in the checkout. No runtime contract is replaced.
const guardRoot = process.cwd();
const guardRootInfo = lstatSync(guardRoot);
const guardFixturePath =
  'proposals/invoice-guard-admission/fixture-adapter.mjs';
const guardHelperPath = 'scripts/invoice-caller-source-admission.mjs';
const guardForwardAuthor = 'd162372c321039f49c1d168bbde8c041b872c182';
const guardForwardParent = '89d925d621192e0fbf2b7019bcd2f70cc65585c4';
const guardBeforeAdapter =
  '6c6a5758d3a3219b4fac88e5dbbeb2e24f6182bf73c8eba3f7bc5c44c8cd61bc';
const guardBeforeHelper =
  '1d3438c34656e732c0352dab02477ea449ed4e4abd92714156c3ec62ff75e70a';
const guardCurrentHelper =
  'cf28a441f146c5e4d398eb0ea0b78a999dd0f744e19424c46f3e95de74229438';
const guardDigest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const guardFail = () => {
  throw Error('Reviewed invoice guard fixture required before import');
};
const guardGitEnvironment = Object.freeze({
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
});
const guardGit = (...args) =>
  execFileSync(
    '/usr/bin/git',
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
      'diff.external=',
      '-c',
      'credential.helper=',
      ...args,
    ],
    {
      cwd: guardRoot,
      env: guardGitEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
function guardRegular(path) {
  const rootNow = lstatSync(guardRoot);
  if (
    process.cwd() !== guardRoot ||
    realpathSync(guardRoot) !== guardRoot ||
    !rootNow.isDirectory() ||
    rootNow.isSymbolicLink() ||
    rootNow.dev !== guardRootInfo.dev ||
    rootNow.ino !== guardRootInfo.ino
  )
    guardFail();
  let prefix = '';
  for (const part of path.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    const info = lstatSync(prefix);
    if (info.isSymbolicLink() || (prefix !== path && !info.isDirectory()))
      guardFail();
  }
  const first = lstatSync(path);
  if (!first.isFile() || (first.mode & 0o7777) !== 0o644) guardFail();
  const bytes = nodeReadFileSync(path),
    last = lstatSync(path);
  if (
    first.dev !== last.dev ||
    first.ino !== last.ino ||
    first.mode !== last.mode ||
    first.size !== last.size ||
    first.mtimeMs !== last.mtimeMs
  )
    guardFail();
  return bytes;
}
function guardEndpoint(commit, path) {
  const row = guardGit('ls-tree', commit, '--', path).toString().trim();
  if (!/^100644 blob [a-f0-9]{40}\t/.test(row) || row.split('\t')[1] !== path)
    guardFail();
  return guardGit('show', commit + ':' + path);
}
if (
  guardGit('show', '--no-patch', '--format=%P', guardForwardAuthor)
    .toString()
    .trim() !== guardForwardParent
)
  guardFail();
const priorGuardAdapter = guardEndpoint(guardForwardParent, guardFixturePath),
  authoredGuardAdapter = guardEndpoint(guardForwardAuthor, guardFixturePath);
const priorGuardText = priorGuardAdapter.toString();
if (
  guardDigest(priorGuardAdapter) !== guardBeforeAdapter ||
  priorGuardText.split(guardBeforeHelper).length !== 2 ||
  !Buffer.from(
    priorGuardText.replace(guardBeforeHelper, guardCurrentHelper),
  ).equals(authoredGuardAdapter)
)
  guardFail();
if (
  guardDigest(guardEndpoint(guardForwardParent, guardHelperPath)) !==
    guardBeforeHelper ||
  guardDigest(guardEndpoint(guardForwardAuthor, guardHelperPath)) !==
    guardCurrentHelper
)
  guardFail();
function verifyCurrentGuardAdapter() {
  const adapter = guardRegular(guardFixturePath),
    helper = guardRegular(guardHelperPath);
  if (
    !adapter.equals(authoredGuardAdapter) ||
    guardDigest(helper) !== guardCurrentHelper
  )
    guardFail();
  return adapter;
}
const guardFixtureBytes = verifyCurrentGuardAdapter();
const { createHistoricalRead } = await import(
  'data:text/javascript;base64,' + guardFixtureBytes.toString('base64')
);
// The approved export still enforces the live FHG/phase before and during every
// named historical read; the two current producer files are also checked fresh.
const liveGuardRead = createHistoricalRead(nodeReadFileSync);
const readFileSync = (...args) => {
  verifyCurrentGuardAdapter();
  const result = liveGuardRead(...args);
  verifyCurrentGuardAdapter();
  return result;
};

// The existing payment-frame metadata port is closed over these original calls.
// Only its TWO reviewed immutable patch renderings receive a fixed abbreviation.
const nmiMetadataPairs = [
  [
    '38bc1bce05075fc0e858554947e195d8dded3c4a',
    '53a4705b72b584228b33988d1eae586ef10b44eb',
    'server/payments/sandbox.ts',
  ],
  [
    '95b0bb301610e589090e5611427809a29a23790a',
    '38bc1bce05075fc0e858554947e195d8dded3c4a',
    'tests/nmi-two-merchant-token-boundary.test.ts',
  ],
];
const paymentMetadataAuthor = '96b654ee16c229653cb1c046c579af77573b045a';
const paymentMetadataParent = '892bf5127af2268e6066a20d259a808b5b893cec';
const paymentMetadataPaths = [
  'server/payments/refunds.ts',
  'server/payments/response-json.ts',
  'server/payments/sandbox.ts',
];
const paymentMetadataCalls = new Set();
const nmiPatchCalls = new Set();
const metadataKey = (values) => JSON.stringify(values);
for (const [author, parent, path] of nmiMetadataPairs) {
  paymentMetadataCalls.add(
    metadataKey(['show', '--no-patch', '--format=%P', author]),
  );
  paymentMetadataCalls.add(
    metadataKey([
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      author,
    ]),
  );
  for (const ref of [parent, author])
    for (const command of ['show', 'ls-tree'])
      paymentMetadataCalls.add(
        metadataKey(
          command === 'show'
            ? ['show', ref + ':' + path]
            : ['ls-tree', ref, '--', path],
        ),
      );
  nmiPatchCalls.add(
    metadataKey([
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-color',
      parent,
      author,
      '--',
      path,
    ]),
  );
}
for (const [ref, path] of [
  [nmiMetadataPairs[1][0], nmiMetadataPairs[0][2]],
  [nmiMetadataPairs[0][0], nmiMetadataPairs[1][2]],
])
  paymentMetadataCalls.add(metadataKey(['show', ref + ':' + path]));
paymentMetadataCalls.add(
  metadataKey(['show', '--no-patch', '--format=%P', paymentMetadataAuthor]),
);
paymentMetadataCalls.add(
  metadataKey([
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '--no-renames',
    '-r',
    paymentMetadataAuthor,
  ]),
);
for (const path of paymentMetadataPaths) {
  paymentMetadataCalls.add(
    metadataKey(['show', paymentMetadataAuthor + ':' + path]),
  );
  paymentMetadataCalls.add(
    metadataKey(['ls-tree', paymentMetadataAuthor, '--', path]),
  );
  paymentMetadataCalls.add(
    metadataKey(['ls-tree', paymentMetadataParent, '--', path]),
  );
  if (path !== 'server/payments/response-json.ts')
    paymentMetadataCalls.add(
      metadataKey(['show', paymentMetadataParent + ':' + path]),
    );
}
function reviewedPaymentGit(command, ...args) {
  if (
    typeof command !== 'string' ||
    args.some((arg) => typeof arg !== 'string')
  )
    guardFail();
  const key = metadataKey([command, ...args]);
  if (nmiPatchCalls.has(key))
    return guardGit(
      command,
      ...args.slice(0, 3),
      '--abbrev=7',
      ...args.slice(3),
    );
  if (!paymentMetadataCalls.has(key)) guardFail();
  return guardGit(command, ...args);
}

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
verifyPaymentFrame({ read: readFileSync, git: reviewedPaymentGit });
export function historicalInvoiceRead(path, ...args) {
  if (!Object.hasOwn(originals, path)) return readFileSync(path, ...args);
  verifiedAdapter();
  verifyPaymentFrame({ read: readFileSync, git: reviewedPaymentGit });
  const bytes = execFileSync(
    '/usr/bin/git',
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
  verifyPaymentFrame({ read: readFileSync, git: reviewedPaymentGit });
  const encoding = typeof args[0] === 'string' ? args[0] : args[0]?.encoding;
  return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
}
