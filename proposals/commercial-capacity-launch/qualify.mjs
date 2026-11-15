// Finite build/test composition only; no installation, adapter or execution authority.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { resolve } from 'node:path';
const base = '7e25b50537fe66c19f5041e64bd2e59effc544c4';
const author = '565819daffa58d8df25d67be05430b009007d958';
const folder = 'proposals/commercial-capacity-launch/';
const seals = Object.freeze({
  'source.json':
    'cb13351e629917b5b70c7393c385c2bfbc24b83d25644955e0fd4436c91b9d31',
  'integration.patch':
    'fd2e9fa7ec268d3e3c622fb878f9e2e8d2757e8f169ee5ed2cdc0d1ace76f6e3',
  'launch-source.proposed.ts':
    '1313056843759220f9d728844e6d14d4514c524f46dd47fb500763849baec157',
});
const fail = () =>
  Error('Exact finite commercial capacity composition required');
const digest = (b) => createHash('sha256').update(b).digest('hex');
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
      '-c',
      'credential.helper=',
      ...args,
    ],
    {
      cwd: root,
      input,
      env: {
        PATH: '/usr/bin:/bin',
        TMPDIR: realpathSync(tmpdir()),
        LANG: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: devNull,
        GIT_CONFIG_COUNT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_NO_LAZY_FETCH: '1',
        GIT_ALLOW_PROTOCOL: '',
        GIT_TERMINAL_PROMPT: '0',
        GIT_ATTR_NOSYSTEM: '1',
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

export function qualifyCapacityComposition(
  root,
  { read = readFileSync, stat = lstatSync } = {},
) {
  root = resolve(root);
  const capture = (path, mode = '100644') => {
    let current = '/';
    const parts = resolve(root, path).split('/').filter(Boolean);
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
  const files = sealed();
  const manifest = JSON.parse(files['source.json'].toString());
  if (
    git(root, 'rev-parse', `${base}^{tree}`).toString().trim() !==
      'f255ae9f0665d55fee94387340d84032f1fa25b8' ||
    git(root, 'rev-parse', `${author}^`).toString().trim() !== base ||
    git(root, 'rev-parse', `${author}^{tree}`).toString().trim() !==
      '749e1e1d02fc2480e5dc39c5c55a39ed52ac5ca8'
  )
    throw fail();
  if (
    git(
      root,
      'diff-tree',
      '--no-commit-id',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--name-status',
      '-r',
      author,
    )
      .toString()
      .trim() !==
      'A\tscripts/check-commercial-capacity.mjs\nA\tserver/payments/commercial-capacity.proposed.sql' ||
    digest(
      git(
        root,
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        base,
        author,
      ),
    ) !== '0322ff6a47e7ba0c6a3823f902a2d7dddcc51bb053c739098cd363c815c00dc6'
  )
    throw fail();
  verifyObjects(root, [base, author]);
  const baseline = tree(root, base),
    source = tree(root, author);
  if (baseline.length !== 2438 || source.length !== 2440) throw fail();
  const verifyCurrent = () => {
    for (const e of source) {
      const b = capture(e.path, e.mode);
      if (
        createHash('sha1')
          .update(`blob ${b.length}\0`)
          .update(b)
          .digest('hex') !== e.blob
      )
        throw fail();
    }
  };
  verifyCurrent();
  const payloads = [
    {
      path: 'scripts/check-commercial-capacity.mjs',
      bytes: capture('scripts/check-commercial-capacity.mjs'),
    },
    {
      path: 'server/payments/commercial-capacity.proposed.sql',
      bytes: capture('server/payments/commercial-capacity.proposed.sql'),
    },
    {
      path: 'tests/commercial-capacity-launch.test.ts',
      bytes: files['launch-source.proposed.ts'],
    },
  ];
  let patch = '';
  for (const { path, bytes } of payloads) {
    if (baseline.some((e) => e.path === path)) throw fail();
    const spec = manifest.files.find((e) => e.path === path);
    if (
      !spec ||
      spec.mode !== '100644' ||
      spec.sha256 !== digest(bytes) ||
      !bytes.toString().endsWith('\n')
    )
      throw fail();
    const blob = createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex'),
      lines = bytes.toString().slice(0, -1).split('\n');
    patch +=
      `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..${blob.slice(0, 7)}\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n` +
      lines.map((l) => '+' + l + '\n').join('');
  }
  if (!Buffer.from(patch).equals(files['integration.patch'])) throw fail();
  // Capture actual canonical source, not copied invoice/guard fixtures. Native
  // qualification receives only these already-sealed immutable SQL strings.
  const boundSql = (path) => {
    const expected = source.find((entry) => entry.path === path);
    if (!expected) throw fail();
    const bytes = capture(path, expected.mode);
    if (
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex') !== expected.blob
    )
      throw fail();
    return bytes.toString();
  };
  const material = Object.freeze({
    installationAuthorized: false,
    financialExecutionAuthorized: false,
    bootstrapSql: boundSql('tests/database/bootstrap.sql'),
    draftSql: boundSql('server/invoices/commercial-drafts.proposed.sql'),
    issuanceSql: boundSql(
      'proposals/commercial-invoice-issuance/issuance.proposed.sql',
    ),
    capacitySql: boundSql('server/payments/commercial-capacity.proposed.sql'),
    migrations: Object.freeze(
      source
        .filter((e) => e.path.startsWith('supabase/migrations/'))
        .map((e) =>
          Object.freeze({
            path: e.path,
            sql: boundSql(e.path),
          }),
        ),
    ),
  });
  if (material.migrations.length !== 14) throw fail();
  sealed();
  verifyCurrent();
  return Object.freeze({
    classification: 'UNAPPLIED_THREE_ADDITION_LAUNCH_COMPOSITION',
    base,
    sourceAuthor: author,
    baseEntries: 2438,
    sourceAuthorEntries: 2440,
    proposedEntries: 2441,
    additions: 3,
    patchSha256: seals['integration.patch'],
    installationAuthorized: false,
    launchPromotionAuthorized: false,
    financialExecutionAuthorized: false,
    material,
  });
}
