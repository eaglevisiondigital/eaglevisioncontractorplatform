// Finite source-author proposal proof only. Never installs or promotes source.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { resolve } from 'node:path';
const base = '7e25b50537fe66c19f5041e64bd2e59effc544c4';
const source = '1940dc3bf82142a50ba8d2ccd3b39890f36d0dd1';
const folder = 'proposals/commercial-capacity-admission/';
const seals = Object.freeze({
  'source.json':
    '5521ef38d293fe6a6b97e64455040c068d67803109bb9972bf139f702e832a46',
  'source-author.patch':
    '0322ff6a47e7ba0c6a3823f902a2d7dddcc51bb053c739098cd363c815c00dc6',
  'guard.proposed.mjs':
    'bf4afa37cbe1fcf35c54a735c2ffb270934bc1c4ddee9f1228a58ea7393324bc',
});
const expectedDelta = [
  'proposals/commercial-payment-capacity/README.md',
  'proposals/commercial-payment-capacity/capacity.proposed.sql',
  'proposals/commercial-payment-capacity/qualification.ts',
  'proposals/commercial-payment-capacity/reviewed-drafts.sql',
  'proposals/commercial-payment-capacity/reviewed-issuance.sql',
  'proposals/commercial-payment-capacity/source.json',
  'tests/commercial-payment-capacity-source.test.ts',
  'tests/database/commercial-payment-capacity-proposal.test.ts',
]
  .map((p) => 'A\t' + p)
  .join('\n');
const fail = () =>
  Error('Exact unapplied commercial capacity admission required');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function git(root, ...args) {
  const input = Buffer.isBuffer(args.at(-1)) ? args.pop() : undefined;
  // Whitelist environment, ignore replacement objects, disable config execution
  // paths. Only object plumbing below is allowed; no diff/textconv/filter/helper.
  return execFileSync(
    '/usr/bin/git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-c',
      `core.hooksPath=${devNull}`,
      '-c',
      `core.attributesFile=${devNull}`,
      '-c',
      'core.pager=cat',
      ...args,
    ],
    {
      cwd: root,
      input,
      env: {
        PATH: '/usr/bin:/bin',
        TMPDIR: '/private/tmp',
        LANG: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: devNull,
        GIT_CONFIG_COUNT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
      },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 5000,
    },
  );
}
function tree(root, commit) {
  return git(root, 'ls-tree', '-rz', commit)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      const [mode, type, blob] = meta.split(' ');
      if (
        type !== 'blob' ||
        !['100644', '100755'].includes(mode) ||
        !path ||
        path.startsWith('/') ||
        path.split('/').some((x) => !x || x === '.' || x === '..')
      )
        throw fail();
      return { mode, path, blob };
    });
}
function verifyObjects(root, commits) {
  const ids = new Set(commits);
  for (const commit of commits) {
    ids.add(git(root, 'rev-parse', `${commit}^{tree}`).toString().trim());
    for (const line of git(root, 'ls-tree', '-rtz', commit)
      .toString()
      .split('\0')
      .filter(Boolean))
      ids.add(line.split('\t')[0].split(' ')[2]);
  }
  const ordered = [...ids];
  const batch = git(
    root,
    'cat-file',
    '--batch',
    Buffer.from(ordered.join('\n') + '\n'),
  );
  let offset = 0;
  for (const expected of ordered) {
    const newline = batch.indexOf(10, offset);
    if (newline < 0) throw fail();
    const [id, type, sizeText] = batch
      .subarray(offset, newline)
      .toString()
      .split(' ');
    const size = Number(sizeText);
    if (
      id !== expected ||
      !['tree', 'blob', 'commit'].includes(type) ||
      !Number.isSafeInteger(size) ||
      size < 0
    )
      throw fail();
    const bytes = batch.subarray(newline + 1, newline + 1 + size);
    if (
      bytes.length !== size ||
      batch[newline + 1 + size] !== 10 ||
      createHash('sha1')
        .update(`${type} ${size}\0`)
        .update(bytes)
        .digest('hex') !== id
    )
      throw fail();
    offset = newline + size + 2;
  }
  if (offset !== batch.length) throw fail();
}
/** Reads source only. Injectable filesystem readers are test fixtures, never authority. */
export function qualifyCapacityAdmission(
  root,
  { read = readFileSync, stat = lstatSync } = {},
) {
  root = resolve(root);
  const capture = (path, mode = '100644') => {
    const parts = resolve(root, path).split('/').filter(Boolean);
    let current = '/';
    for (let i = 0; i < parts.length; i++) {
      current = resolve(current, parts[i]);
      const s = stat(current);
      if (
        s.isSymbolicLink() ||
        (i < parts.length - 1
          ? !s.isDirectory()
          : !s.isFile() || (s.mode & 0o777) !== parseInt(mode.slice(-3), 8))
      )
        throw fail();
    }
    return Buffer.from(read(resolve(root, path)));
  };
  const sealed = () =>
    Object.fromEntries(
      Object.entries(seals).map(([path, hash]) => {
        const bytes = capture(folder + path);
        if (digest(bytes) !== hash) throw fail();
        return [path, bytes];
      }),
    );
  const files = sealed(); // Literal outer seals before decoding or evaluating payload.
  const manifest = JSON.parse(files['source.json'].toString('utf8'));
  if (
    git(root, 'rev-parse', `${base}^{tree}`).toString().trim() !==
      'f255ae9f0665d55fee94387340d84032f1fa25b8' ||
    git(root, 'rev-parse', `${source}^{tree}`).toString().trim() !==
      '80bf990d7319887ed63a51bfbe93fcacce950439' ||
    git(root, 'rev-parse', `${source}^`).toString().trim() !==
      '300eb070ecfa88fab7d22152893c90a8ec399b9f'
  )
    throw fail();
  if (
    git(
      root,
      'diff-tree',
      '--no-commit-id',
      '--no-ext-diff',
      '--no-textconv',
      '--name-status',
      '-r',
      source,
    )
      .toString()
      .trim() !== expectedDelta
  )
    throw fail();
  verifyObjects(root, [
    base,
    source,
    '300eb070ecfa88fab7d22152893c90a8ec399b9f',
  ]);
  const baseline = tree(root, base);
  const proposal = tree(root, source);
  if (baseline.length !== 2438 || proposal.length !== 2435) throw fail();
  // Verify the entire current #470 source frame, including all historical guards.
  // Qualifier and package additions are not admitted as launch changes by this test.
  const verifyCurrent = () => {
    for (const entry of proposal) {
      const bytes = capture(entry.path, entry.mode);
      const blob = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex');
      if (blob !== entry.blob) throw fail();
    }
  };
  verifyCurrent();
  const payloads = [
    {
      path: 'scripts/check-commercial-capacity.mjs',
      bytes: files['guard.proposed.mjs'],
    },
    {
      path: 'server/payments/commercial-capacity.proposed.sql',
      bytes: capture(
        'proposals/commercial-payment-capacity/capacity.proposed.sql',
      ),
    },
  ];
  let patch = '';
  for (const { path, bytes } of payloads) {
    if (baseline.some((x) => x.path === path)) throw fail();
    const endpoint = manifest.endpoints.find((e) => e.path === path);
    if (
      !endpoint ||
      endpoint.mode !== '100644' ||
      endpoint.sha256 !== digest(bytes) ||
      !bytes.toString().endsWith('\n')
    )
      throw fail();
    const blob = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    const lines = bytes.toString('utf8').slice(0, -1).split('\n');
    patch +=
      `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..${blob.slice(0, 7)}\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n` +
      lines.map((line) => '+' + line + '\n').join('');
  }
  if (!Buffer.from(patch).equals(files['source-author.patch'])) throw fail();
  const draft = git(
    root,
    'show',
    `${base}:server/invoices/commercial-drafts.proposed.sql`,
  );
  const issuance = git(
    root,
    'show',
    `${base}:proposals/commercial-invoice-issuance/issuance.proposed.sql`,
  );
  if (
    !draft.equals(
      capture('proposals/commercial-payment-capacity/reviewed-drafts.sql'),
    ) ||
    !issuance.equals(
      capture('proposals/commercial-payment-capacity/reviewed-issuance.sql'),
    )
  )
    throw fail();
  sealed();
  verifyCurrent();
  return Object.freeze({
    classification: 'UNAPPLIED_SOURCE_AUTHOR_ONLY',
    base,
    source,
    baseEntries: baseline.length,
    preservedEntries: baseline.length,
    additions: 2,
    patchSha256: seals['source-author.patch'],
    installationAuthorized: false,
    launchPromotionAuthorized: false,
    financialExecutionAuthorized: false,
  });
}
