// Finite test-source closure only; no operational admission or runtime fallback.
import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devNull } from 'node:os';
const folder = 'proposals/dashboard-context-fixture-compatibility/';
const manifestSeal =
  'ea0e7eae62ad6a3fbce5a9634b363c77e2228399021a2bfec22f6772053fef6e';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const oid = (kind, bytes) =>
  createHash('sha1')
    .update(kind + ' ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
const fail = () => {
  throw Error('Exact joint dashboard/invoice context required');
};
const source = process.cwd(),
  self = resolve(folder + 'current-fixture.mjs');
const prefix = 'data:text/javascript;base64,';
const selfBytes = import.meta.url.startsWith(prefix)
  ? Buffer.from(import.meta.url.slice(prefix.length), 'base64')
  : readFileSync(self);
const selfSeal = sha(selfBytes),
  rootIdentity = lstatSync(source);
if (
  realpathSync(source) !== source ||
  (!import.meta.url.startsWith(prefix) &&
    fileURLToPath(import.meta.url) !== self)
)
  fail();
function sameRoot() {
  if (process.cwd() !== source || realpathSync(source) !== source) fail();
  const now = lstatSync(source);
  if (
    !now.isDirectory() ||
    now.isSymbolicLink() ||
    now.dev !== rootIdentity.dev ||
    now.ino !== rootIdentity.ino
  )
    fail();
  for (let p = source; ; p = dirname(p)) {
    const info = lstatSync(p);
    if (!info.isDirectory() || info.isSymbolicLink()) fail();
    if (dirname(p) === p) break;
  }
}
function unchanged(a, b) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.mode === b.mode &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs
  );
}
function regular(path, mode = 0o644) {
  sameRoot();
  let current = source;
  const parts = path.split('/');
  if (parts.some((x) => !x || x === '.' || x === '..')) fail();
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const info = lstatSync(current);
    if (
      info.isSymbolicLink() ||
      (index < parts.length - 1 && !info.isDirectory())
    )
      fail();
  }
  const first = lstatSync(current);
  if (!first.isFile() || (first.mode & 0o7777) !== mode) fail();
  const bytes = readFileSync(current);
  if (!unchanged(first, lstatSync(current))) fail();
  return bytes;
}
const manifestBytes = regular(folder + 'manifest.json');
if (sha(manifestBytes) !== manifestSeal) fail();
const manifest = JSON.parse(manifestBytes);
const originals = Object.fromEntries(
  Object.entries(manifest.targets).map(([name, pin]) => {
    const bytes = regular(folder + name + '.original.txt');
    if (sha(bytes) !== pin.sha256 || oid('blob', bytes) !== pin.oid) fail();
    return [name, bytes];
  }),
);
export function proposedTestBytes(name) {
  const pin = manifest.targets[name];
  if (!pin) fail();
  const text = originals[name].toString();
  const oldPath = pin.oldFolder + 'current-fixture.mjs';
  if (
    text.split(oldPath).length !== 2 ||
    text.split(pin.oldHelper).length !== 2
  )
    fail();
  return Buffer.from(
    text
      .replace(oldPath, folder + 'current-fixture.mjs')
      .replace(pin.oldHelper, selfSeal),
  );
}
function currentTestBytes(name) {
  const bytes = Buffer.from(
    proposedTestBytes(name)
      .toString()
      .replace(selfSeal, manifest.currentHelperSHA256),
  );
  if (sha(bytes) !== manifest.targets[name].currentSHA256) fail();
  return bytes;
}
export function proposedPatchBytes(name) {
  const before = currentTestBytes(name).toString().split('\n'),
    after = proposedTestBytes(name).toString().split('\n');
  if (
    !before ||
    before.pop() !== '' ||
    after.pop() !== '' ||
    before.length !== after.length
  )
    fail();
  const changes = before.flatMap((x, i) => (x === after[i] ? [] : [i]));
  if (changes.length !== 1) fail();
  const first = changes[0] - 3,
    last = changes[0] + 4;
  if (first < 0 || last > before.length) fail();
  const lines = [];
  for (let i = first; i < last; i++) {
    if (before[i] === after[i]) lines.push(' ' + before[i]);
    else lines.push('-' + before[i], '+' + after[i]);
  }
  const target = manifest.targets[name].path;
  return Buffer.from(
    `diff --git a/${target} b/${target}\nindex ${oid('blob', currentTestBytes(name))}..${oid('blob', proposedTestBytes(name))} 100644\n--- a/${target}\n+++ b/${target}\n@@ -${first + 1},${last - first} +${first + 1},${last - first} @@\n${lines.join('\n')}\n`,
  );
}
const ownFiles = new Set([
  'README.md',
  'manifest.json',
  'current-fixture.mjs',
  'dashboard.original.txt',
  'invoice.original.txt',
  'dashboard.proposed.txt',
  'invoice.proposed.txt',
  'dashboard.patch',
  'invoice-held.patch',
  'controls.test.mjs',
]);
function checkOwn() {
  const names = readdirSync(folder);
  if (names.length !== ownFiles.size || names.some((x) => !ownFiles.has(x)))
    fail();
  for (const name of names) regular(folder + name);
  if (
    !regular(folder + 'current-fixture.mjs').equals(selfBytes) ||
    sha(regular(folder + 'manifest.json')) !== manifestSeal
  )
    fail();
  for (const [name, pin] of Object.entries(manifest.ownCompanions))
    if (sha(regular(folder + name, pin.mode)) !== pin.sha256) fail();
  for (const name of Object.keys(manifest.targets))
    if (
      !regular(folder + name + '.original.txt').equals(originals[name]) ||
      !regular(folder + name + '.proposed.txt').equals(
        proposedTestBytes(name),
      ) ||
      !regular(
        folder + (name === 'invoice' ? 'invoice-held' : 'dashboard') + '.patch',
      ).equals(proposedPatchBytes(name))
    )
      fail();
}
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
function gitBytes(...args) {
  try {
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
        'credential.helper=',
        ...args,
      ],
      { cwd: source, env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    fail();
  }
}
function git(...args) {
  return gitBytes(...args)
    .toString()
    .trim();
}
function authors() {
  try {
    for (const author of manifest.authors) {
      if (
        git('cat-file', 'commit', author.commit) !== author.raw.trim() ||
        git('show', '--no-patch', '--format=%P', author.commit) !==
          author.parent ||
        git('rev-parse', author.commit + '^{tree}') !== author.tree ||
        git(
          'diff-tree',
          '--no-commit-id',
          '--name-status',
          '-r',
          author.commit,
        ) !== author.delta
      )
        fail();
    }
    const native = manifest.nativeAuthor;
    if (
      git('show', '--no-patch', '--format=%P', native.commit) !==
        native.parent ||
      git('rev-parse', native.commit + '^{tree}') !== native.tree ||
      git(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '-r',
        native.commit,
      ) !== native.delta
    )
      fail();
    for (const [path, pin] of Object.entries(native.paths))
      if (
        git('ls-tree', native.commit, '--', path) !==
        `100644 blob ${pin.afterOid}\t${path}`
      )
        fail();
    const old = manifest.c27HistoricalProof;
    if (
      git('ls-tree', old.historicalCommit, '--', old.path) !==
      `100644 blob ${old.historicalOid}\t${old.path}`
    )
      fail();
  } catch {
    fail();
  }
}
const artifacts = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);
let capturedPhase;
export function verifyCurrentPhysicalFrame() {
  checkOwn();
  let files = 0;
  const phases = [];
  function walk(directory, path = '') {
    const first = lstatSync(directory);
    if (!first.isDirectory() || first.isSymbolicLink()) fail();
    const rows = [];
    for (const name of readdirSync(directory)) {
      const key = path ? path + '/' + name : name;
      if ((!path && artifacts.has(name)) || key === folder.slice(0, -1))
        continue;
      const current = join(directory, name),
        info = lstatSync(current);
      if (info.isSymbolicLink()) fail();
      if (info.isDirectory())
        rows.push({
          name,
          directory: true,
          mode: '40000',
          hash: walk(current, key),
        });
      else {
        if (!info.isFile() || ![0o644, 0o755].includes(info.mode & 0o7777))
          fail();
        let bytes = readFileSync(current);
        if (!unchanged(info, lstatSync(current))) fail();
        for (const [id, pin] of Object.entries(manifest.targets))
          if (key === pin.path) {
            if (bytes.equals(currentTestBytes(id))) phases.push('before');
            else if (bytes.equals(proposedTestBytes(id))) phases.push('after');
            else fail();
            bytes = originals[id];
          }
        const forward = manifest.fixtureMetadataForwards.find(
          (row) => row.path === key && row.phased,
        );
        if (forward) {
          const digest = sha(bytes);
          if (digest === forward.beforeSHA256) phases.push('before');
          else if (digest === forward.afterSHA256) phases.push('after');
          else fail();
          bytes = gitBytes('show', manifest.base + ':' + key);
          if (
            sha(bytes) !== forward.beforeSHA256 ||
            oid('blob', bytes) !== forward.beforeOid
          )
            fail();
        }
        rows.push({
          name,
          directory: false,
          mode: info.mode & 0o111 ? '100755' : '100644',
          hash: oid('blob', bytes),
        });
        files++;
      }
    }
    rows.sort((a, b) =>
      Buffer.compare(
        Buffer.from(a.name + (a.directory ? '/' : '')),
        Buffer.from(b.name + (b.directory ? '/' : '')),
      ),
    );
    const last = lstatSync(directory);
    if (
      first.dev !== last.dev ||
      first.ino !== last.ino ||
      first.mode !== last.mode ||
      first.mtimeMs !== last.mtimeMs
    )
      fail();
    return oid(
      'tree',
      Buffer.concat(
        rows.map((row) =>
          Buffer.concat([
            Buffer.from(row.mode + ' ' + row.name + '\0'),
            Buffer.from(row.hash, 'hex'),
          ]),
        ),
      ),
    );
  }
  const tree = walk(source);
  if (
    tree !== manifest.tree ||
    files !== manifest.files ||
    phases.length !== 5 ||
    phases.some((phase) => phase !== phases[0]) ||
    (capturedPhase && capturedPhase !== phases[0])
  )
    fail();
  capturedPhase ??= phases[0];
  if (sha(regular('src/components/forms.tsx')) !== manifest.currentFormsSHA256)
    fail();
  authors();
  checkOwn();
  return Object.freeze({
    base: manifest.base,
    tree,
    files,
    phase: phases[0],
    admissionAuthorized: false,
    integrationAuthorized: false,
  });
}
const dashboardReads = new Set([
  'src/components/CompanyOperations.tsx',
  'src/lib/operations.ts',
  'src/App.tsx',
  'src/components/IntakeQueue.tsx',
  'src/components/forms-state.ts',
  'src/components/forms.tsx',
  'docs/program/CYCLE4_PROTECTED_SOURCE.json',
]);
export function dashboardSource(path) {
  if (typeof path !== 'string' || !dashboardReads.has(path)) fail();
  verifyCurrentPhysicalFrame();
  const actual = regular(path);
  let result = actual;
  if (path === 'src/components/forms.tsx') {
    result = regular(manifest.historicalFormsPath);
    if (sha(result) !== manifest.historicalFormsSHA256) fail();
  }
  verifyCurrentPhysicalFrame();
  return result.toString('utf8');
}
export async function qualifyInvoiceGuardProposal({
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  verifyCurrentPhysicalFrame();
  const historicalRead = (path, encoding) => {
    const bytes = read(path, encoding),
      key = relative(
        source,
        path instanceof URL ? fileURLToPath(path) : resolve(String(path)),
      );
    // SEPARATE, UNAPPROVED SCOPE AMENDMENT: one TEST source body only.
    // Actual execution still reads f282 from disk. No runtime/SQL/expiry port.
    const p1 = manifest.p1TestHistoricalScopeAmendment;
    if (key === p1.path) {
      verifyCurrentPhysicalFrame();
      if (
        sha(Buffer.from(bytes)) !== p1.currentSHA256 ||
        oid('blob', Buffer.from(bytes)) !== p1.currentOid
      )
        fail();
      const actual = regular(p1.path, p1.mode);
      if (
        sha(actual) !== p1.currentSHA256 ||
        !actual.equals(Buffer.from(bytes))
      )
        fail();
      if (
        git('ls-tree', p1.historicalParent, '--', p1.path) !==
        `100644 blob ${p1.historicalOid}\t${p1.path}`
      )
        fail();
      const historical = gitBytes('show', p1.historicalParent + ':' + p1.path);
      if (
        sha(historical) !== p1.historicalSHA256 ||
        oid('blob', historical) !== p1.historicalOid
      )
        fail();
      if (!regular(p1.path, p1.mode).equals(actual)) fail();
      return encoding
        ? historical.toString(
            typeof encoding === 'string' ? encoding : encoding.encoding,
          )
        : Buffer.from(historical);
    }
    const metadataForward = manifest.fixtureMetadataForwards.find(
      (row) => row.path === key,
    );
    if (metadataForward) {
      // Internal immutable-qualifier reads are bounded by the public pre/post
      // full source proof. Each projected body/mode is independently fresh.
      const expected =
        metadataForward.phased && capturedPhase === 'before'
          ? metadataForward.beforeSHA256
          : metadataForward.afterSHA256;
      const actual = regular(key, metadataForward.mode);
      if (sha(actual) !== expected || !actual.equals(Buffer.from(bytes)))
        fail();
      if (
        git('ls-tree', metadataForward.historicalRef, '--', key) !==
        `100644 blob ${metadataForward.historicalOid}\t${key}`
      )
        fail();
      const historical = gitBytes(
        'show',
        metadataForward.historicalRef + ':' + key,
      );
      if (
        sha(historical) !== metadataForward.historicalSHA256 ||
        oid('blob', historical) !== metadataForward.historicalOid ||
        !regular(key, metadataForward.mode).equals(actual)
      )
        fail();
      return encoding
        ? historical.toString(
            typeof encoding === 'string' ? encoding : encoding.encoding,
          )
        : Buffer.from(historical);
    }
    if (!Object.hasOwn(manifest.overlays, key)) return bytes;
    if (oid('blob', Buffer.from(bytes)) !== manifest.currentOverlayOids[key])
      fail();
    const historical = regular(
      'proposals/ui-invoice-native-fixture-compatibility/historical/' + key,
    );
    if (sha(historical) !== manifest.overlays[key].sha256) fail();
    return encoding
      ? historical.toString(
          typeof encoding === 'string' ? encoding : encoding.encoding,
        )
      : Buffer.from(historical);
  };
  const bytes = regular('proposals/invoice-guard-admission/qualify.mjs');
  if (oid('blob', bytes) !== manifest.qualifierOid) fail();
  const current = await import(prefix + bytes.toString('base64'));
  verifyCurrentPhysicalFrame();
  const q = await current.qualifyInvoiceGuardProposal({
    read: historicalRead,
    stat,
  });
  verifyCurrentPhysicalFrame();
  const checked = (fn, args) => {
    verifyCurrentPhysicalFrame();
    const result = fn(...args);
    verifyCurrentPhysicalFrame();
    return result;
  };
  const helper = Object.freeze({
    verifyInvoiceGuardFrame: (...args) =>
      checked(q.helper.verifyInvoiceGuardFrame, args),
    admitInvoiceCallerSource: (...args) =>
      checked(q.helper.admitInvoiceCallerSource, args),
    createGuardHistoricalRead: (...args) => {
      const reader = checked(q.helper.createGuardHistoricalRead, args);
      return (...reads) => checked(reader, reads);
    },
  });
  const knownReadPaths = new Set(
    gitBytes('ls-tree', '-rz', manifest.base)
      .toString()
      .split('\0')
      .filter(Boolean)
      .map((row) => row.slice(row.indexOf('\t') + 1)),
  );
  const readCurrent = (path, ...args) => {
    const key = relative(
      source,
      path instanceof URL ? fileURLToPath(path) : resolve(String(path)),
    );
    if (!knownReadPaths.has(key)) fail();
    return manifest.fixtureMetadataForwards.some((row) => row.path === key)
      ? checked(q.readCurrent, [path, ...args])
      : q.readCurrent(path, ...args);
  };
  return Object.freeze({
    ...q,
    readCurrent,
    helper,
    check: () => checked(q.check, []),
  });
}
