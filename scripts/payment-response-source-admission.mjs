// Finite development source proof only. No runtime/provider/launch authority.
import { createHash } from 'node:crypto';
import { devNull } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const author = '96b654ee16c229653cb1c046c579af77573b045a';
const parent = '892bf5127af2268e6066a20d259a808b5b893cec';
const files = {
  'server/payments/refunds.ts': [
    '78f74ab633f3ba192d447ffb1b77f8d027c38df49ea0fd6f06b9fb65df2490a5',
    '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
  ],
  'server/payments/response-json.ts': [
    null,
    '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
  ],
  'server/payments/sandbox.ts': [
    '89dc2b03f273ee00c73e8342fcf9e8db6d78d5f898bde96ccff94e69fc0276cc',
    '828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb',
  ],
};
const delta =
  'M\tserver/payments/refunds.ts\nA\tserver/payments/response-json.ts\nM\tserver/payments/sandbox.ts';
const hash = (b) => createHash('sha256').update(b).digest('hex');
// Default metadata reads never inherit executable Git/config helpers or credentials.
const gitEnvironment = Object.freeze({
  PATH: '/usr/bin:/bin',
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
const git = (command, ...args) => {
  if (!['show', 'diff', 'diff-tree', 'ls-tree'].includes(command))
    throw Error('Exact finite Git metadata command required');
  const originalNmiDiff =
    command === 'diff' &&
    nmiAuthors.some(([commit, parent, path]) => {
      const exact = [
        '--no-ext-diff',
        '--no-textconv',
        '--no-color',
        parent,
        commit,
        '--',
        path,
      ];
      return (
        args.length === exact.length &&
        exact.every((value, index) => args[index] === value)
      );
    });
  const format =
    command === 'ls-tree'
      ? []
      : [
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          ...(originalNmiDiff ? ['--abbrev=7'] : []),
        ];
  return execFileSync(
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
      command,
      ...format,
      ...args,
    ],
    {
      cwd: reconciliationRoot,
      env: { ...gitEnvironment },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
};
const nmiSource = 'server/payments/sandbox.ts';
const nmiFixture = 'tests/nmi-two-merchant-token-boundary.test.ts';
const nmiBefore =
  '828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb';
const nmiAfter =
  '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6';
const fixtureBefore =
  'e61ccf5a059bdf5116387176d1afcbf1b0d596f47c7091e72ea42c800def4fff';
const fixtureAfter =
  '784666767e8938875300e0c37759f4cc745861218033a9c4e01bdeda86abea47';
const nmiAuthors = [
  [
    '38bc1bce05075fc0e858554947e195d8dded3c4a',
    '53a4705b72b584228b33988d1eae586ef10b44eb',
    nmiSource,
    nmiBefore,
    nmiAfter,
    '73d4d530e4a560838477641e2c4298edee03fd4368645437ca9f113ab32ac294',
  ],
  [
    '95b0bb301610e589090e5611427809a29a23790a',
    '38bc1bce05075fc0e858554947e195d8dded3c4a',
    nmiFixture,
    fixtureBefore,
    fixtureAfter,
    'd67d40d9ba916bf776c3415ab0ecf2ff8de709f84cc356861c719e6144d13db0',
  ],
];
// Build-only exact source proof. No merchant, provider or execution authority.
export function verifyNmiOrderReferenceFrame({
  readCurrent = readFileSync,
  readOriginal = (commit, p) => git('show', `${commit}:${p}`),
  metadata = git,
  stat = lstatSync,
} = {}) {
  const fail = () => {
    throw Error('Exact authored NMI source and fixture pair required');
  };
  const check = () => {
    for (const [p, digest] of [
      [nmiSource, nmiAfter],
      [nmiFixture, fixtureAfter],
    ]) {
      let prefix = '';
      for (const part of p.split('/')) {
        prefix = prefix ? prefix + '/' + part : part;
        if (stat(prefix).isSymbolicLink()) fail();
      }
      const info = stat(p);
      if (
        !info.isFile() ||
        (info.mode & 0o777) !== 0o644 ||
        hash(readCurrent(p)) !== digest
      )
        fail();
    }
  };
  check();
  for (const [commit, parent, p, before, after, patch] of nmiAuthors) {
    if (
      metadata('show', '--no-patch', '--format=%P', commit)
        .toString()
        .trim() !== parent
    )
      fail();
    if (
      metadata(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        commit,
      )
        .toString()
        .trim() !== `M\t${p}`
    )
      fail();
    for (const [c, digest] of [
      [parent, before],
      [commit, after],
    ]) {
      const tree = metadata('ls-tree', c, '--', p).toString().trim();
      if (
        !/^100644 blob [a-f0-9]{40}\t/.test(tree) ||
        tree.split('\t')[1] !== p ||
        hash(readOriginal(c, p)) !== digest
      )
        fail();
    }
    if (
      hash(
        metadata(
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          parent,
          commit,
          '--',
          p,
        ),
      ) !== patch
    )
      fail();
  }
  if (
    hash(readOriginal(nmiAuthors[1][0], nmiSource)) !== nmiAfter ||
    hash(readOriginal(nmiAuthors[0][0], nmiFixture)) !== fixtureBefore
  )
    fail();
  check();
  return true;
}
export function admitPaymentResponseSource(
  path,
  current,
  expected,
  {
    readCurrent = readFileSync,
    readOriginal = (commit, p) => git('show', `${commit}:${p}`),
    metadata = git,
    stat = lstatSync,
  } = {},
) {
  if (path === reconciliationPath)
    return admitReconciliationSource(current, expected, {
      readCurrent,
      readOriginal,
      metadata,
      stat,
    });
  if (
    path !== nmiFixture &&
    (!Object.hasOwn(files, path) || files[path][0] === null)
  )
    return false;
  const fail = () => {
    throw Error('Exact finite payment response source required');
  };
  const checkCurrent = (p, after) => {
    let prefix = '';
    for (const part of p.split('/')) {
      prefix = prefix ? prefix + '/' + part : part;
      if (stat(prefix).isSymbolicLink()) fail();
    }
    const info = stat(p);
    if (!info.isFile() || (info.mode & 0o777) !== 0o644) fail();
    const fresh = readCurrent(p);
    if (
      hash(fresh) !== (p === nmiSource ? nmiAfter : after) ||
      (p === path && !Buffer.from(current).equals(fresh))
    )
      fail();
  };
  if (expected !== (path === nmiFixture ? fixtureBefore : files[path][0]))
    fail();
  verifyNmiOrderReferenceFrame({ readCurrent, readOriginal, metadata, stat });
  if (path === nmiFixture && !Buffer.from(current).equals(readCurrent(path)))
    fail();
  if (
    metadata('show', '--no-patch', '--format=%P', author).toString().trim() !==
    parent
  )
    fail();
  if (
    metadata(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      author,
    )
      .toString()
      .trim() !== delta
  )
    fail();
  for (const [p, [before, after]] of Object.entries(files)) {
    const tree = metadata('ls-tree', author, '--', p).toString().trim();
    if (!/^100644 blob [a-f0-9]{40}\t/.test(tree) || tree.split('\t')[1] !== p)
      fail();
    const oldTree = metadata('ls-tree', parent, '--', p).toString().trim();
    if (before === null) {
      if (oldTree !== '') fail();
    } else if (
      !/^100644 blob [a-f0-9]{40}\t/.test(oldTree) ||
      oldTree.split('\t')[1] !== p ||
      hash(readOriginal(parent, p)) !== before
    )
      fail();
    if (hash(readOriginal(author, p)) !== after) fail();
    checkCurrent(p, after);
  }
  verifyNmiOrderReferenceFrame({ readCurrent, readOriginal, metadata, stat });
  // A later lineage/read check may withdraw an earlier source; check the full bundle again.
  for (const [p, [, after]] of Object.entries(files)) checkCurrent(p, after);
  return true;
}

// Reconciliation author stage only. The invoice FHG and launch seals stay held.
const reconciliationAuthor = '9c2747b9ec369c3c28458cf144deb967bf00d179';
const reconciliationParent = '3f0c6b53747e60765cdc7faf1308b57ce730676f';
const reconciliationTree = 'd144b6837ffac95ef53c5031809c886a8eec1fc9';
const reconciliationPath = 'server/payments/reconciliation.ts';
const reconciliationBefore =
  '94f339aa679c0b7fa0880fef035b921608b0717614c3705620f06eed07f9c0b0';
const reconciliationAfter =
  '90f8763430b0c208c1741c00224ea2b51db68f5c7c3a6c447b06856013744746';
const reconciliationHelper = 'scripts/payment-response-source-admission.mjs';
const reconciliationAck = 'scripts/check-payment-ack-admission.mjs';
const reconciliationRoot = resolve(process.cwd());
const reconciliationRootIdentity = lstatSync(reconciliationRoot);
const reconciliationExecuting = import.meta.url.startsWith(
  'data:text/javascript;base64,',
)
  ? Buffer.from(
      import.meta.url.slice('data:text/javascript;base64,'.length),
      'base64',
    )
  : readFileSync(fileURLToPath(import.meta.url));
const reconciliationFail = () => {
  throw Error('Exact reconciliation author source required');
};
const ackHistoryPairs = new Set(
  [
    ['38bc1bce05075fc0e858554947e195d8dded3c4a', 'server/payments/sandbox.ts'],
    [
      '38bc1bce05075fc0e858554947e195d8dded3c4a',
      'tests/nmi-two-merchant-token-boundary.test.ts',
    ],
    [
      '3f0c6b53747e60765cdc7faf1308b57ce730676f',
      'server/payments/reconciliation.ts',
    ],
    [
      '4a54d390bd37024a10469b9f6cdcab6d38724a49',
      'server/payments/control-store.ts',
    ],
    [
      '4a54d390bd37024a10469b9f6cdcab6d38724a49',
      'server/payments/postgres-store.ts',
    ],
    [
      '4a54d390bd37024a10469b9f6cdcab6d38724a49',
      'server/payments/reconciliation.ts',
    ],
    ['4a54d390bd37024a10469b9f6cdcab6d38724a49', 'server/payments/refunds.ts'],
    ['4a54d390bd37024a10469b9f6cdcab6d38724a49', 'server/payments/sandbox.ts'],
    ['4a54d390bd37024a10469b9f6cdcab6d38724a49', 'server/providers/control.ts'],
    ['4a54d390bd37024a10469b9f6cdcab6d38724a49', 'server/providers/safety.ts'],
    [
      '4a54d390bd37024a10469b9f6cdcab6d38724a49',
      'tests/fixtures/first-launch-merchants.ts',
    ],
    ['53a4705b72b584228b33988d1eae586ef10b44eb', 'server/payments/sandbox.ts'],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'docs/FEATURE_SOURCE_INVENTORY.json',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'docs/MAINTENANCE_COMMAND_AUTHORITY_VALIDATION.json',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'docs/MAINTENANCE_SECURITY_VALIDATION.json',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'docs/program/CYCLE4_PROTECTED_SOURCE.json',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'proposals/payment-outcome-ack/README.md',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'proposals/payment-outcome-ack/acceptance.test.ts',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'proposals/payment-outcome-ack/manifest.json',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'proposals/payment-outcome-ack/proposed.patch',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'proposals/payment-outcome-ack/verify.mjs',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'server/payments/control-store.ts',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'server/payments/postgres-store.ts',
    ],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'server/payments/reconciliation.ts',
    ],
    ['5aa7927932323be0f67a908923a9c7ffa92d5d2e', 'server/payments/refunds.ts'],
    ['5aa7927932323be0f67a908923a9c7ffa92d5d2e', 'server/payments/sandbox.ts'],
    ['5aa7927932323be0f67a908923a9c7ffa92d5d2e', 'server/providers/control.ts'],
    ['5aa7927932323be0f67a908923a9c7ffa92d5d2e', 'server/providers/safety.ts'],
    [
      '5aa7927932323be0f67a908923a9c7ffa92d5d2e',
      'tests/fixtures/first-launch-merchants.ts',
    ],
    ['892bf5127af2268e6066a20d259a808b5b893cec', 'server/payments/refunds.ts'],
    ['892bf5127af2268e6066a20d259a808b5b893cec', 'server/payments/sandbox.ts'],
    ['95b0bb301610e589090e5611427809a29a23790a', 'server/payments/sandbox.ts'],
    [
      '95b0bb301610e589090e5611427809a29a23790a',
      'tests/nmi-two-merchant-token-boundary.test.ts',
    ],
    ['96b654ee16c229653cb1c046c579af77573b045a', 'server/payments/refunds.ts'],
    [
      '96b654ee16c229653cb1c046c579af77573b045a',
      'server/payments/response-json.ts',
    ],
    ['96b654ee16c229653cb1c046c579af77573b045a', 'server/payments/sandbox.ts'],
    [
      '9c2747b9ec369c3c28458cf144deb967bf00d179',
      'scripts/check-payment-ack-admission.mjs',
    ],
    [
      '9c2747b9ec369c3c28458cf144deb967bf00d179',
      'scripts/payment-response-source-admission.mjs',
    ],
    [
      '9c2747b9ec369c3c28458cf144deb967bf00d179',
      'server/payments/reconciliation.ts',
    ],
  ].map(([commit, path]) => commit + ':' + path),
);
export function readAckHistory(commit, path, root = process.cwd()) {
  if (
    ![2, 3].includes(arguments.length) ||
    typeof commit !== 'string' ||
    typeof path !== 'string' ||
    typeof root !== 'string' ||
    resolve(root) !== reconciliationRoot ||
    !ackHistoryPairs.has(commit + ':' + path)
  )
    reconciliationFail();
  return git('show', commit + ':' + path);
}
function replaceReconciliationOnce(text, before, after) {
  if (text.split(before).length !== 2) reconciliationFail();
  return text.replace(before, after);
}
function reconciliationAckOriginal(bytes) {
  let text = bytes.toString('utf8');
  text = replaceReconciliationOnce(
    text,
    hash(reconciliationExecuting),
    '74c672d6725876285c8bd2ee844aec88c183b56b12181a0373c874e02cf26510',
  );
  text = replaceReconciliationOnce(
    text,
    'const { admitPaymentResponseSource, readAckHistory } = await import(',
    'const { admitPaymentResponseSource } = await import(',
  );
  text = replaceReconciliationOnce(
    text,
    '  const historical = (commit, path) => readAckHistory(commit, path, root);',
    "  const historical = (commit, path) =>\n    execFileSync('git', ['--no-replace-objects', 'show', `${commit}:${path}`], {\n      cwd: root,\n      stdio: ['ignore', 'pipe', 'pipe'],\n    });",
  );
  text = replaceReconciliationOnce(
    text,
    "      (source.path === 'server/payments/reconciliation.ts' ||\n        hash(current(source.path)) !== expected) &&",
    '      hash(current(source.path)) !== expected &&',
  );
  text = replaceReconciliationOnce(
    text,
    "  if (\n    !admitPaymentResponseSource(\n      'server/payments/reconciliation.ts',\n      current('server/payments/reconciliation.ts'),\n      '94f339aa679c0b7fa0880fef035b921608b0717614c3705620f06eed07f9c0b0',\n      { readCurrent: current, readOriginal: historical },\n    )\n  )\n    throw Error('Unreviewed current source: server/payments/reconciliation.ts');\n",
    '',
  );
  text = replaceReconciliationOnce(
    text,
    "import { readFileSync, lstatSync } from 'node:fs';\n",
    "import { readFileSync, lstatSync } from 'node:fs';\n" +
      "import { execFileSync } from 'node:child_process';\n",
  );
  return Buffer.from(text);
}
function reconciliationRegular(path, mode, readCurrent, stat) {
  if (
    process.cwd() !== reconciliationRoot ||
    realpathSync(reconciliationRoot) !== reconciliationRoot
  )
    reconciliationFail();
  const root = stat(reconciliationRoot);
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.dev !== reconciliationRootIdentity.dev ||
    root.ino !== reconciliationRootIdentity.ino
  )
    reconciliationFail();
  for (let p = reconciliationRoot; ; p = dirname(p)) {
    const st = stat(p);
    if (!st.isDirectory() || st.isSymbolicLink()) reconciliationFail();
    if (dirname(p) === p) break;
  }
  let prefix = reconciliationRoot;
  for (const part of path.split('/')) {
    if (!part || part === '.' || part === '..') reconciliationFail();
    prefix = join(prefix, part);
    const info = stat(prefix);
    if (
      info.isSymbolicLink() ||
      (prefix !== join(reconciliationRoot, path) && !info.isDirectory())
    )
      reconciliationFail();
  }
  const first = stat(prefix);
  if (!first.isFile() || (first.mode & 0o7777) !== mode) reconciliationFail();
  const bytes = Buffer.from(readCurrent(path));
  const last = stat(prefix);
  if (
    first.dev !== last.dev ||
    first.ino !== last.ino ||
    first.mode !== last.mode ||
    first.size !== last.size ||
    first.mtimeMs !== last.mtimeMs
  )
    reconciliationFail();
  return bytes;
}
function admitReconciliationSource(
  current,
  expected,
  { readCurrent, readOriginal, metadata, stat },
) {
  if (
    expected !== reconciliationBefore ||
    hash(current) !== reconciliationAfter
  )
    reconciliationFail();
  const immutable = (ref, path, digest) => {
    const bytes = Buffer.from(readOriginal(ref, path));
    if (hash(bytes) !== digest) reconciliationFail();
    return bytes;
  };
  const proof = () => {
    if (
      metadata('show', '--no-patch', '--format=%P', reconciliationAuthor)
        .toString()
        .trim() !== reconciliationParent ||
      metadata('show', '--no-patch', '--format=%T', reconciliationAuthor)
        .toString()
        .trim() !== reconciliationTree ||
      metadata(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        reconciliationAuthor,
      )
        .toString()
        .trim() !==
        'M\t' + reconciliationPath
    )
      reconciliationFail();
    for (const [ref, digest] of [
      [reconciliationParent, reconciliationBefore],
      [reconciliationAuthor, reconciliationAfter],
    ]) {
      const entry = metadata('ls-tree', ref, '--', reconciliationPath)
        .toString()
        .trim();
      if (
        !/^100644 blob [a-f0-9]{40}\t/.test(entry) ||
        entry.split('\t')[1] !== reconciliationPath
      )
        reconciliationFail();
      const bytes = immutable(ref, reconciliationPath, digest);
      const oid = createHash('sha1')
        .update('blob ' + bytes.length + '\0')
        .update(bytes)
        .digest('hex');
      if (entry !== '100644 blob ' + oid + '\t' + reconciliationPath)
        reconciliationFail();
    }
    const helperBefore = immutable(
      reconciliationAuthor,
      reconciliationHelper,
      '74c672d6725876285c8bd2ee844aec88c183b56b12181a0373c874e02cf26510',
    );
    const ackBefore = immutable(
      reconciliationAuthor,
      reconciliationAck,
      'b1f297fc3d62cfe77a9ed9912a1a6f896a14a70cf796da2e1f24d5e5c0441ed9',
    );
    let count = 0;
    const gitOid = (kind, bytes) =>
      createHash('sha1')
        .update(kind + ' ' + bytes.length + '\0')
        .update(bytes)
        .digest('hex');
    const walk = (directory, path = '') => {
      const first = stat(directory);
      if (!first.isDirectory() || first.isSymbolicLink()) reconciliationFail();
      const rows = [];
      for (const name of readdirSync(directory).sort()) {
        if (!path && ['.git', 'node_modules'].includes(name)) continue;
        const key = path ? path + '/' + name : name,
          absolute = join(directory, name),
          info = stat(absolute);
        if (info.isSymbolicLink()) reconciliationFail();
        if (info.isDirectory()) {
          rows.push({
            name,
            directory: true,
            mode: '40000',
            oid: walk(absolute, key),
          });
          continue;
        }
        if (!info.isFile() || ![0o644, 0o755].includes(info.mode & 0o7777))
          reconciliationFail();
        let bytes = reconciliationRegular(
          key,
          info.mode & 0o7777,
          readCurrent,
          stat,
        );
        if (key === reconciliationPath && !bytes.equals(Buffer.from(current)))
          reconciliationFail();
        if (key === reconciliationHelper) {
          if (!bytes.equals(reconciliationExecuting)) reconciliationFail();
          bytes = helperBefore;
        } else if (key === reconciliationAck) {
          if (!reconciliationAckOriginal(bytes).equals(ackBefore))
            reconciliationFail();
          bytes = ackBefore;
        }
        rows.push({
          name,
          directory: false,
          mode: info.mode & 0o111 ? '100755' : '100644',
          oid: gitOid('blob', bytes),
        });
        count++;
      }
      rows.sort((a, b) =>
        Buffer.compare(
          Buffer.from(a.name + (a.directory ? '/' : '')),
          Buffer.from(b.name + (b.directory ? '/' : '')),
        ),
      );
      const last = stat(directory);
      if (
        first.dev !== last.dev ||
        first.ino !== last.ino ||
        first.mode !== last.mode ||
        first.mtimeMs !== last.mtimeMs
      )
        reconciliationFail();
      return gitOid(
        'tree',
        Buffer.concat(
          rows.map((row) =>
            Buffer.concat([
              Buffer.from(row.mode + ' ' + row.name + '\0'),
              Buffer.from(row.oid, 'hex'),
            ]),
          ),
        ),
      );
    };
    if (walk(reconciliationRoot) !== reconciliationTree || count !== 2568)
      reconciliationFail();
    const fresh = reconciliationRegular(
      reconciliationPath,
      0o644,
      readCurrent,
      stat,
    );
    if (
      hash(fresh) !== reconciliationAfter ||
      !fresh.equals(Buffer.from(current))
    )
      reconciliationFail();
  };
  proof();
  return true;
}
