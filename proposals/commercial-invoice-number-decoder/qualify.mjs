// Offline source proposal qualification; no Auth, connection or installer.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { resolve } from 'node:path';
const parent = 'e9782d5f9e2422609a993dfe8f836053793620cf';
const folder = 'proposals/commercial-invoice-number-decoder/';
const target = 'proposals/commercial-invoice-issuance/presentation.ts';
const seals = Object.freeze({
  'source.json':
    'c98d87241bfd4be083a9b7758ade4b45860971c7d154cbebd034b441b72cc6bd',
  'source-author.patch':
    '41327ce1d4f8fed550a9ecc7f2a9cbd211be89f482b8d61c0f2a2b64ff133b8a',
  'presentation.proposed.ts':
    'a63a605af3b1e03a0169828340f4938a50031a6f131404054da60e2db610ea6b',
  'customer-author.patch':
    'b2a78a766d58e8991a6dce4b8a44149f975ae63f6ca0622c10bb7fe4cd6a136a',
  'customer-read.proposed.txt':
    'e546c945bf3f4993a5a5e4a62703e8e8f6b0b7473cc31a237be2050c863ee8ef',
});
const fail = () => Error('Exact unapplied invoice-number decoder required');
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

export function captureNumberDecoder(
  root,
  { read = readFileSync, stat = lstatSync } = {},
) {
  root = resolve(root);
  const capture = (path, mode = '100644') => {
    let prefix = '/';
    const parts = resolve(root, path).split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      prefix = resolve(prefix, parts[i]);
      const s = stat(prefix);
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
        const b = capture(folder + path);
        if (digest(b) !== hash) throw fail();
        return [path, b];
      }),
    );
  const files = sealed();
  const manifest = JSON.parse(files['source.json'].toString());
  if (
    git(root, 'rev-parse', `${parent}^`).toString().trim() !==
      '62edc056bfd2ee64a0ddf5df15aa4bd99acb519f' ||
    git(root, 'rev-parse', `${parent}^{tree}`).toString().trim() !==
      '16349f6d1a1af41079de248b44496c9519844a30'
  )
    throw fail();
  verifyObjects(root, [parent, '56b10d2d9c8b86815054d4d5f931f33990ed88eb']);
  const source = tree(root, parent);
  if (source.length !== 2455) throw fail();
  const bound = (path) => {
    const e = source.find((x) => x.path === path);
    if (!e) throw fail();
    const b = capture(e.path, e.mode);
    if (
      createHash('sha1')
        .update(`blob ${b.length}\0`)
        .update(b)
        .digest('hex') !== e.blob
    )
      throw fail();
    return b;
  };
  const verify = () => {
    for (const e of source) bound(e.path);
  };
  verify();
  if (
    digest(bound(target)) !== manifest.beforeSha256 ||
    digest(files['presentation.proposed.ts']) !== manifest.afterSha256 ||
    manifest.target !== target ||
    manifest.mode !== '100644' ||
    manifest.sourceAuthorCommit !== null ||
    manifest.launchIntegrationAuthorized ||
    manifest.installationAuthorized ||
    manifest.operationalNumberingAuthorized
  )
    throw fail();
  const customerParent = '56b10d2d9c8b86815054d4d5f931f33990ed88eb';
  if (
    git(root, 'rev-parse', `${customerParent}^{tree}`).toString().trim() !==
    'ccfbe5eba58e001e4ab6666c7d1d8b440ffd2760'
  )
    throw fail();
  const originalCustomer = git(
    root,
    'show',
    `${customerParent}:src/components/invoices/commercial-customer-read.ts`,
  );
  if (
    digest(originalCustomer) !== manifest.customerCompatibility.beforeSha256 ||
    digest(files['customer-read.proposed.txt']) !==
      manifest.customerCompatibility.afterSha256 ||
    digest(files['customer-author.patch']) !==
      manifest.customerCompatibility.patchSha256
  )
    throw fail();
  const material = Object.freeze({
    originalCustomer: originalCustomer.toString(),
    bootstrapSql: bound('tests/database/bootstrap.sql').toString(),
    draftSql: bound(
      'server/invoices/commercial-drafts.proposed.sql',
    ).toString(),
    issuanceSql: bound(
      'proposals/commercial-invoice-issuance/issuance.proposed.sql',
    ).toString(),
    namespaceSql: bound(
      'proposals/commercial-invoice-numbering/numbering.proposed.sql',
    ).toString(),
    yearSql: bound(
      'proposals/commercial-invoice-year-numbering/numbering.proposed.sql',
    ).toString(),
    connectionSources: Object.freeze(
      [
        'server/invoices/commercial-caller-connection.ts',
        'server/invoices/commercial-draft-client.ts',
        'server/invoices/commercial-drafts.proposed.sql',
        'proposals/commercial-invoice-issuance/issuance.proposed.sql',
        'proposals/commercial-invoice-issuance/presentation.ts',
        'server/customer/broker-auth.ts',
        'src/lib/customer-connected.ts',
      ].map((path) => Object.freeze({ path, source: bound(path).toString() })),
    ),
    connectionGuard: bound(
      'proposals/commercial-invoice-connection/source.ts',
    ).toString(),
    originalPresenter: bound(target).toString(),
    migrations: Object.freeze(
      source
        .filter((e) => e.path.startsWith('supabase/migrations/'))
        .map((e) =>
          Object.freeze({ path: e.path, sql: bound(e.path).toString() }),
        ),
    ),
  });
  if (material.migrations.length !== 14) throw fail();
  sealed();
  verify();
  return Object.freeze({
    classification: 'UNAPPLIED_NUMBER_DECODER_ONLY',
    parent,
    parentEntries: 2455,
    target,
    source: files['presentation.proposed.ts'].toString(),
    customerSource: files['customer-read.proposed.txt'].toString(),
    customerPatch: files['customer-author.patch'].toString(),
    customerParent,
    patch: files['source-author.patch'].toString(),
    patchSha256: seals['source-author.patch'],
    sourceAuthor: null,
    connectionAdmission: 'HELD',
    installationAuthorized: false,
    operationalReady: false,
    material,
  });
}
