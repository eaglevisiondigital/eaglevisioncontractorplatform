// Source composition laboratory only. No database, provider or operational adapter.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { devNull } from 'node:os';

const directory = 'proposals/commercial-issuance-launch-integration';
const base = '7f464e6c7be280c4134eee4a031a737ed79d2b5a';
const author = 'e22fe5ebc5a942bbf5bbc5348e16e9bde21d2db5';
const baseTree = 'edd0f3ff75eb7b584dab80ddd64dc3e54fc7b630';
const authorTree = '66261e5ce8bca0542bd5a2053fb2f3033d461f0e';
const candidateTree = 'f255ae9f0665d55fee94387340d84032f1fa25b8';
const compatibilityHash =
  '4716d3c6c4b5593743ec830e91f9a554d0e9f671e393a75a6cb12fe782712071';
const compatibilityPatch =
  'd809634e7847fc7870de94fa16437fe7f9413bf62794024dd2229b3fb6f49885';
const evidenceHash =
  '0e44b79b16d1c0d125ecd5bf2ad36cbd7cfa9368d378caf75ddc5ce5980a495d';
const patchHash =
  '56b27b8c3dc7510ddab41e47a4e7ad8ba1ad37d785052957bdde33186eeffa1f';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const objectHash = (type, bytes) =>
  createHash('sha1')
    .update(Buffer.from(type + ' ' + bytes.length + '\0'))
    .update(bytes)
    .digest('hex');
const deny = () => {
  throw Error('Exact unapplied issuance integration required');
};
const environment = Object.freeze({
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
const gitOptions = [
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
];
const immutable = new Map();
function git(command, ...args) {
  if (!['show', 'ls-tree', 'rev-parse', 'archive'].includes(command)) deny();
  if (command === 'rev-parse' && args[0] === '--git-path')
    return execFileSync('git', [...gitOptions, command, ...args], {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
  const key = JSON.stringify([command, ...args]);
  if (!immutable.has(key))
    immutable.set(
      key,
      execFileSync(
        'git',
        [
          ...gitOptions,
          command,
          ...(command === 'show'
            ? ['--no-ext-diff', '--no-textconv', '--no-color']
            : []),
          ...args,
        ],
        {
          env: environment,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 128 * 1024 * 1024,
          timeout: 5000,
        },
      ),
    );
  return Buffer.from(immutable.get(key));
}
function safePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((p) => !p || p === '.' || p === '..' || p === '.git')
  )
    deny();
  return path;
}
function treeDigest(entries) {
  const root = new Map();
  for (const row of entries) {
    let node = root;
    const parts = row.path.split('/');
    for (const part of parts.slice(0, -1)) {
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part);
      if (!(node instanceof Map)) deny();
    }
    if (node.has(parts.at(-1))) deny();
    node.set(parts.at(-1), row);
  }
  const hash = (node) => {
    const sorted = [...node].sort(([a, av], [b, bv]) =>
      Buffer.compare(
        Buffer.from(a + (av instanceof Map ? '/' : '')),
        Buffer.from(b + (bv instanceof Map ? '/' : '')),
      ),
    );
    const bytes = Buffer.concat(
      sorted.map(([name, v]) =>
        Buffer.concat([
          Buffer.from(
            (v instanceof Map ? '40000' : v.mode) + ' ' + name + '\0',
          ),
          Buffer.from(v instanceof Map ? hash(v) : v.oid, 'hex'),
        ]),
      ),
    );
    return objectHash('tree', bytes);
  };
  return hash(root);
}
function gitTree(commit, expected, metadata) {
  if (
    metadata('rev-parse', commit + '^{tree}')
      .toString()
      .trim() !== expected
  )
    deny();
  const rows = metadata('ls-tree', '-rz', commit)
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length !== 2) deny();
      const [mode, type, oid] = parts[0].split(' ');
      if (
        !['100644', '100755'].includes(mode) ||
        type !== 'blob' ||
        !/^[a-f0-9]{40}$/.test(oid)
      )
        deny();
      return { path: safePath(parts[1]), mode, oid };
    });
  if (treeDigest(rows) !== expected) deny();
  return rows;
}
function regular(path, mode, stat) {
  let prefix = '';
  for (const part of safePath(path).split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    const s = stat(prefix);
    if (s.isSymbolicLink() || (prefix !== path && !s.isDirectory())) deny();
  }
  const s = stat(path);
  if (!s.isFile() || (s.mode & 0o777) !== parseInt(mode.slice(-3), 8)) deny();
}
function absent(path, stat) {
  let prefix = '';
  for (const part of safePath(path).split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    try {
      const s = stat(prefix);
      if (s.isSymbolicLink()) deny();
      if (prefix === path) deny();
      if (!s.isDirectory()) deny();
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
  }
  deny();
}
function checkBytes(path, hash, read, stat) {
  regular(path, '100644', stat);
  const b = Buffer.from(read(path));
  if (digest(b) !== hash) deny();
  regular(path, '100644', stat);
  return b;
}
function checkTree(rows, read, stat) {
  for (const row of rows) {
    regular(row.path, row.mode, stat);
    if (objectHash('blob', Buffer.from(read(row.path))) !== row.oid) deny();
    regular(row.path, row.mode, stat);
  }
}
export function inspectIssuanceIntegration({
  read = readFileSync,
  stat = lstatSync,
  metadata = git,
} = {}) {
  const evidence = JSON.parse(
    checkBytes(directory + '/evidence.json', evidenceHash, read, stat),
  );
  const patch = checkBytes(
    directory + '/integration.patch',
    patchHash,
    read,
    stat,
  );
  if (
    evidence.base !== base ||
    evidence.author !== author ||
    evidence.patchSha256 !== patchHash ||
    evidence.protectedIntegrationAuthorized !== false ||
    evidence.files.length !== 40
  )
    deny();
  const before = gitTree(base, baseTree, metadata),
    reviewedAfter = gitTree(author, authorTree, metadata);
  if (
    before.length !== 2410 ||
    reviewedAfter.length !== 2438 ||
    evidence.candidateTree !== candidateTree
  )
    deny();
  const compatibilityBytes = checkBytes(
    directory + '/legacy-fixture/source-author.patch',
    compatibilityPatch,
    read,
    stat,
  );
  const compatibility = JSON.parse(
    checkBytes(
      directory + '/legacy-fixture/source-author.json',
      compatibilityHash,
      read,
      stat,
    ),
  );
  if (
    compatibility.base !== author ||
    compatibility.futureSourceAuthor !== null ||
    compatibility.files.length !== 3 ||
    compatibility.patchSha256 !== compatibilityPatch
  )
    deny();
  const checkCompatibility = () => {
    checkBytes(
      directory + '/legacy-fixture/source-author.json',
      compatibilityHash,
      read,
      stat,
    );
    checkBytes(
      directory + '/legacy-fixture/source-author.patch',
      compatibilityPatch,
      read,
      stat,
    );
    for (const row of compatibility.files)
      checkBytes(
        directory + '/legacy-fixture/payload/' + row.path,
        row.afterSha256,
        read,
        stat,
      );
  };
  checkCompatibility();
  const old = new Map(before.map((x) => [x.path, x])),
    next = new Map(reviewedAfter.map((x) => [x.path, x])),
    overlays = new Map();
  for (const row of compatibility.files) {
    const original = metadata('show', author + ':' + row.path);
    if (
      row.mode !== '100644' ||
      next.get(row.path)?.mode !== '100644' ||
      digest(original) !== row.beforeSha256 ||
      objectHash('blob', original) !== next.get(row.path)?.oid
    )
      deny();
    const bytes = checkBytes(
      directory + '/legacy-fixture/payload/' + row.path,
      row.afterSha256,
      read,
      stat,
    );
    next.set(row.path, {
      path: row.path,
      mode: '100644',
      oid: objectHash('blob', bytes),
    });
    overlays.set(row.path, bytes);
  }
  const after = [...next.values()];
  if (treeDigest(after) !== candidateTree) deny();
  let previous = author;
  for (const row of evidence.lineage) {
    if (
      row.commit !== previous ||
      metadata('show', '--no-patch', '--format=%P', row.commit)
        .toString()
        .trim() !== row.parent
    )
      deny();
    previous = row.parent;
  }
  if (previous !== base) deny();
  const actual = [...new Set([...old.keys(), ...next.keys()])]
    .filter(
      (path) =>
        JSON.stringify(old.get(path)) !== JSON.stringify(next.get(path)),
    )
    .sort();
  if (
    JSON.stringify(actual) !== JSON.stringify(evidence.files.map((x) => x.path))
  )
    deny();
  for (const row of evidence.files) {
    const b = old.get(row.path),
      a = next.get(row.path);
    if (
      !a ||
      a.mode !== row.afterMode ||
      a.mode !== '100644' ||
      row.status !== (b ? 'M' : 'A') ||
      row.beforeMode !== (b?.mode ?? null)
    )
      deny();
    if (b) {
      const bytes = metadata('show', base + ':' + row.path);
      if (
        objectHash('blob', bytes) !== b.oid ||
        digest(bytes) !== row.beforeSha256
      )
        deny();
    } else absent(row.path, stat);
    const bytes =
      overlays.get(row.path) ?? metadata('show', author + ':' + row.path);
    if (
      objectHash('blob', bytes) !== a.oid ||
      digest(bytes) !== row.afterSha256
    )
      deny();
  }
  checkTree(before, read, stat);
  // History ports are untrusted evidence. Recheck current package/source afterwards.
  checkBytes(directory + '/evidence.json', evidenceHash, read, stat);
  checkBytes(directory + '/integration.patch', patchHash, read, stat);
  checkTree(before, read, stat);
  checkCompatibility();
  for (const row of evidence.files)
    if (row.status === 'A') absent(row.path, stat);
  checkTree(before, read, stat);
  return Object.freeze({
    classification: 'UNAPPLIED_SOURCE_INTEGRATION_PROPOSAL',
    base,
    author,
    baseTree,
    authorTree,
    candidateTree,
    compatibilityPatch,
    futureCompatibilityAuthor: null,
    patchSha256: patchHash,
    files: evidence.files.length,
    added: 28,
    modified: 12,
    unchangedBaseEntries: 2398,
    protectedIntegrationAuthorized: false,
    sqlInstallation: 'NOT_RUN',
    release: 'NO_GO',
    before,
    after,
    reviewedAfter,
    compatibilityBytes,
    patch,
  });
}
function stagedGit(cwd, args) {
  return execFileSync('git', [...gitOptions, ...args], {
    cwd,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 128 * 1024 * 1024,
    timeout: 5000,
  });
}
/** Disposable source qualification only. The callback is a local test harness;
 * no connection factory, SQL installer, hosted authority or commit is provided. */
export async function withDisposableIssuanceIntegration(action, ports = {}) {
  if (typeof action !== 'function') deny();
  const captured = inspectIssuanceIntegration(ports);
  const root = mkdtempSync('/private/tmp/propel-issuance-integration-');
  const source = join(root, 'source');
  const integrationFile = join(root, 'integration.patch'),
    compatibilityFile = join(root, 'source-author.patch'),
    archiveFile = join(root, 'source.tar');
  writeFileSync(integrationFile, captured.patch, { mode: 0o600, flag: 'wx' });
  writeFileSync(compatibilityFile, captured.compatibilityBytes, {
    mode: 0o600,
    flag: 'wx',
  });
  const verifyPatchFiles = () => {
    for (const [path, hash] of [
      [integrationFile, patchHash],
      [compatibilityFile, compatibilityPatch],
    ]) {
      const info = lstatSync(path);
      if (
        info.isSymbolicLink() ||
        !info.isFile() ||
        (info.mode & 0o777) !== 0o600 ||
        digest(readFileSync(path)) !== hash
      )
        deny();
    }
  };
  mkdirSync(source, { mode: 0o700 });
  const identities = [root, source].map((path) => ({
    path,
    info: lstatSync(path),
  }));
  const assertIsolation = () => {
    for (const { path, info } of identities) {
      const current = lstatSync(path);
      if (
        current.isSymbolicLink() ||
        !current.isDirectory() ||
        (current.mode & 0o777) !== 0o700 ||
        current.dev !== info.dev ||
        current.ino !== info.ino
      )
        deny();
    }
  };
  const read = (path) => readFileSync(join(source, path));
  const stat = (path) => lstatSync(join(source, path));
  let metadataPin;
  const snapshotMetadata = () => {
    assertIsolation();
    const entries = [];
    const visit = (path) => {
      const absolute = join(source, '.git', path),
        info = lstatSync(absolute);
      if (info.isSymbolicLink()) deny();
      if (info.isDirectory()) {
        entries.push([path, 'directory', info.mode & 0o777]);
        for (const name of readdirSync(absolute).sort())
          visit(path ? path + '/' + name : name);
      } else if (info.isFile())
        entries.push([path, digest(readFileSync(absolute)), info.mode & 0o777]);
      else deny();
    };
    visit('');
    return JSON.stringify(entries);
  };
  const expectedPaths = new Map(captured.after.map((row) => [row.path, row]));
  const expectedDirectories = new Set();
  for (const row of captured.after) {
    const parts = row.path.split('/');
    for (let i = 1; i < parts.length; i++)
      expectedDirectories.add(parts.slice(0, i).join('/'));
  }
  const dependencies = realpathSync('node_modules');
  const verifyExtras = () => {
    const visit = (path) => {
      for (const name of readdirSync(join(source, path))) {
        const p = path ? path + '/' + name : name;
        if (p === '.git') continue;
        if (p === 'node_modules') {
          if (
            !lstatSync(join(source, p)).isSymbolicLink() ||
            realpathSync(join(source, p)) !== dependencies
          )
            deny();
          continue;
        }
        const info = lstatSync(join(source, p));
        if (info.isSymbolicLink()) deny();
        if (info.isDirectory()) {
          if (!expectedDirectories.has(p)) deny();
          visit(p);
        } else if (!info.isFile() || !expectedPaths.has(p)) deny();
      }
    };
    visit('');
  };
  const verify = () => {
    assertIsolation();
    verifyPatchFiles();
    inspectIssuanceIntegration(ports);
    if (snapshotMetadata() !== metadataPin) deny();
    checkTree(captured.after, read, stat);
    verifyExtras();
    if (snapshotMetadata() !== metadataPin) deny();
    // No staged Git command or executable source is evaluated after the callback.
    return Object.freeze({
      tree: candidateTree,
      tracked: 2438,
      classification: 'DISPOSABLE_SOURCE_ONLY',
      operationalAcceptance: 'NOT_RUN',
      sourceAuthorPatchVerified: true,
    });
  };
  let outcome, failure, cleanupFailure;
  let failed = false;
  try {
    const archive = git('archive', '--format=tar', base);
    writeFileSync(archiveFile, archive, { mode: 0o600, flag: 'wx' });
    execFileSync('tar', ['-xf', archiveFile, '-C', source], {
      env: environment,
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 128 * 1024 * 1024,
      timeout: 5000,
    });
    checkTree(captured.before, read, stat);
    const empty = join(root, 'empty-template');
    mkdirSync(empty);
    stagedGit(source, ['init', '--quiet', '--template=' + empty]);
    const objectDirectory = resolve(
      git('rev-parse', '--git-path', 'objects').toString().trim(),
    );
    writeFileSync(
      join(source, '.git/objects/info/alternates'),
      objectDirectory + '\n',
      { mode: 0o600 },
    );
    writeFileSync(join(source, '.git/HEAD'), base + '\n', { mode: 0o600 });
    stagedGit(source, ['read-tree', base]);
    stagedGit(source, ['update-index', '--refresh']);
    execFileSync(
      'git',
      [
        ...gitOptions,
        'apply',
        '--check',
        '--index',
        '--whitespace=warn',
        integrationFile,
      ],
      {
        cwd: source,
        env: environment,
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 5000,
      },
    );
    // Supply only the captured, sealed bytes; no patch path can change after review.
    execFileSync(
      'git',
      [...gitOptions, 'apply', '--index', '--whitespace=warn', integrationFile],
      {
        cwd: source,
        env: environment,
        stdio: ['ignore', 'ignore', 'pipe'],
        maxBuffer: 128 * 1024 * 1024,
        timeout: 5000,
      },
    );
    checkTree(captured.after, read, stat);
    if (stagedGit(source, ['write-tree']).toString().trim() !== candidateTree)
      deny();
    // Prove the separate source-author artifact applies exactly to reviewed460.
    // All edits below occur only in this disposable source checkout, never SQL.
    for (const args of [
      [
        'apply',
        '--reverse',
        '--check',
        '--index',
        '--whitespace=warn',
        compatibilityFile,
      ],
      ['apply', '--reverse', '--index', '--whitespace=warn', compatibilityFile],
    ])
      execFileSync('git', [...gitOptions, ...args], {
        cwd: source,
        env: environment,
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 5000,
      });
    checkTree(captured.reviewedAfter, read, stat);
    if (stagedGit(source, ['write-tree']).toString().trim() !== authorTree)
      deny();
    execFileSync(
      'git',
      [
        ...gitOptions,
        'apply',
        '--index',
        '--whitespace=warn',
        compatibilityFile,
      ],
      {
        cwd: source,
        env: environment,
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 5000,
      },
    );
    checkTree(captured.after, read, stat);
    if (stagedGit(source, ['write-tree']).toString().trim() !== candidateTree)
      deny();
    metadataPin = snapshotMetadata();
    symlinkSync(dependencies, join(source, 'node_modules'), 'dir');
    verify();
    outcome = await action(
      Object.freeze({
        directory: source,
        verify,
        base,
        author,
        tree: candidateTree,
      }),
    );
    verify();
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      const current = lstatSync(root),
        expected = identities[0].info;
      if (
        current.isDirectory() &&
        !current.isSymbolicLink() &&
        current.dev === expected.dev &&
        current.ino === expected.ino
      )
        rmSync(root, { recursive: true, force: true });
      else {
        if (current.isSymbolicLink()) rmSync(root);
        cleanupFailure = Error(
          'Disposable root identity changed; cleanup remains unresolved',
        );
      }
    } catch (error) {
      cleanupFailure = Error('Disposable root cleanup remains unresolved', {
        cause: error,
      });
    }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (failed) throw failure;
  return outcome;
}
