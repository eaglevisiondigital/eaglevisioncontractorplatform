// Finite development source proof only. No runtime/provider/launch authority.
import { createHash } from 'node:crypto';
import { devNull } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
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
const git = (command, ...args) => {
  if (!['show', 'diff', 'diff-tree', 'ls-tree'].includes(command))
    throw Error('Exact finite Git metadata command required');
  const format =
    command === 'ls-tree'
      ? []
      : ['--no-ext-diff', '--no-textconv', '--no-color'];
  return execFileSync(
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
      command,
      ...format,
      ...args,
    ],
    {
      env: gitEnvironment,
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
