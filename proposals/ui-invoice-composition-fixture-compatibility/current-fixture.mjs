// Test fixture only. Exact physical endpoints precede all historical projection.
import { readFileSync, lstatSync, realpathSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';

const directory = 'proposals/ui-invoice-composition-fixture-compatibility/';
const historicalDirectory =
  'proposals/ui-invoice-native-fixture-compatibility/';
const target = 'tests/invoice-guard-admission-proposal.test.ts';
const qualifier = 'proposals/invoice-guard-admission/qualify.mjs';
const manifestSeal =
  'ccfd9a4a7addd81837c92e17fe2ba5dad8e2702ba18e21c081e25490bd4b24be';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const oid = (bytes) =>
  createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
const fail = () => {
  throw Error('Exact sealed invoice guard proposal required');
};
const source = process.cwd();
const selfPath = resolve(directory + 'current-fixture.mjs');
const dataPrefix = 'data:text/javascript;base64,';
const selfBytes = import.meta.url.startsWith(dataPrefix)
  ? Buffer.from(import.meta.url.slice(dataPrefix.length), 'base64')
  : readFileSync(selfPath);
const selfSeal = sha(selfBytes);
const ownFiles = new Set([
  'README.md',
  'source.json',
  'physical-frame.json',
  'current-fixture.mjs',
  'original-tests.txt',
  'source-tests.proposed.txt',
  'fixture.patch',
  'controls.test.mjs',
  'ui-identity.json',
  'ui-integration.patch',
]);
const manifestBytes = readFileSync(directory + 'physical-frame.json');
if (sha(manifestBytes) !== manifestSeal) fail();
const manifest = JSON.parse(manifestBytes);
const original = readFileSync(directory + 'original-tests.txt');
if (oid(original) !== manifest.rows[target].oid) fail();
export function proposedTestBytes() {
  return Buffer.from(
    original
      .toString()
      .replace(
        'proposals/ui-invoice-native-fixture-compatibility/current-fixture.mjs',
        directory + 'current-fixture.mjs',
      )
      .replace(manifest.approved520.wrapperSha256, selfSeal),
  );
}

function regular(path, mode) {
  for (let p = source; ; p = dirname(p)) {
    const info = lstatSync(p);
    if (info.isSymbolicLink() || !info.isDirectory()) fail();
    if (dirname(p) === p) break;
  }
  let current = source;
  for (const part of path.split('/')) {
    current = join(current, part);
    const info = lstatSync(current);
    if (
      info.isSymbolicLink() ||
      (current !== join(source, path) && !info.isDirectory())
    )
      fail();
  }
  const info = lstatSync(current);
  if (!info.isFile() || (info.mode & 0o777) !== mode) fail();
  return readFileSync(current);
}
if (
  realpathSync(source) !== source ||
  (!import.meta.url.startsWith(dataPrefix) &&
    fileURLToPath(import.meta.url) !== selfPath)
)
  fail();
const rootIdentity = lstatSync(source);
function sameRoot() {
  const now = lstatSync(source);
  if (
    realpathSync(source) !== source ||
    now.dev !== rootIdentity.dev ||
    now.ino !== rootIdentity.ino
  )
    fail();
}
function checkOwn() {
  sameRoot();
  if (
    sha(regular(directory + 'current-fixture.mjs', 0o644)) !== selfSeal ||
    sha(regular(directory + 'physical-frame.json', 0o644)) !== manifestSeal ||
    oid(regular(directory + 'original-tests.txt', 0o644)) !==
      manifest.rows[target].oid
  )
    fail();
  if (
    sha(regular(directory + 'ui-identity.json', 0o644)) !==
      manifest.uiPacket.identitySha256 ||
    sha(regular(directory + 'ui-integration.patch', 0o644)) !==
      manifest.uiPacket.patchSha256
  )
    fail();
  for (const [path, pin] of Object.entries(manifest.uiPaths))
    if (
      sha(regular(directory + 'ui-after/' + path + '.txt', 0o644)) !==
      pin.after.sha256
    )
      fail();
  for (const [path, pin] of Object.entries(manifest.nativeAuthor.paths))
    if (
      sha(
        regular(historicalDirectory + 'native-after/' + path + '.txt', 0o644),
      ) !== pin.afterSha256
    )
      fail();
  for (const [path, pin] of Object.entries(manifest.overlays))
    if (
      sha(regular(historicalDirectory + 'historical/' + path, 0o644)) !==
      pin.sha256
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
function nativeGit(...args) {
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
    { env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .toString()
    .trim();
}
function verifyNativeAuthor() {
  try {
    const author = manifest.nativeAuthor;
    if (
      nativeGit('show', '--no-patch', '--format=%P', author.commit) !==
        author.parent ||
      nativeGit('rev-parse', author.commit + '^{tree}') !== author.tree ||
      nativeGit(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '-r',
        author.commit,
      ) !== author.delta
    )
      fail();
    for (const [path, pin] of Object.entries(author.paths)) {
      if (
        nativeGit('ls-tree', author.commit, '--', path) !==
        `100644 blob ${pin.afterOid}\t${path}`
      )
        fail();
    }
  } catch {
    fail();
  }
}
let capturedContext;
export function verifyCurrentPhysicalFrame() {
  checkOwn();
  const physical = new Map();
  const allPaths = new Set(Object.keys(manifest.rows));
  for (const context of Object.values(manifest.contexts))
    for (const path of Object.keys(context.overrides)) allPaths.add(path);
  for (const path of allPaths) {
    try {
      const bytes = regular(path, manifest.rows[path]?.mode ?? 0o644);
      physical.set(
        path,
        path === target && bytes.equals(proposedTestBytes())
          ? manifest.rows[target].oid
          : oid(bytes),
      );
    } catch {
      if (Object.hasOwn(manifest.rows, path)) fail();
    }
  }
  const matches = [];
  for (const [name, context] of Object.entries(manifest.contexts)) {
    const rows = { ...manifest.rows, ...context.overrides };
    if (physical.size !== Object.keys(rows).length) continue;
    if (
      Object.entries(rows).every(
        ([path, row]) => physical.get(path) === row.oid,
      )
    )
      matches.push(name);
  }
  if (
    matches.length !== 1 ||
    (capturedContext && capturedContext !== matches[0])
  )
    fail();
  verifyNativeAuthor();
  const rows = { ...manifest.rows, ...manifest.contexts[matches[0]].overrides };
  // Unknown source companions cannot enter the historical fixture unnoticed.
  const files = new Set(Object.keys(rows));
  const dirs = new Set();
  for (const path of files)
    for (let d = dirname(path); d !== '.'; d = dirname(d)) dirs.add(d);
  const walk = (prefix) => {
    for (const name of readdirSync(prefix || '.')) {
      const path = prefix ? prefix + '/' + name : name;
      if (
        !prefix &&
        [
          '.git',
          'node_modules',
          'dist',
          'coverage',
          'test-results',
          'playwright-report',
        ].includes(name)
      )
        continue;
      if (path === directory.slice(0, -1)) continue;
      const info = lstatSync(path);
      if (info.isSymbolicLink()) fail();
      if (info.isDirectory()) {
        if (!dirs.has(path)) fail();
        walk(path);
      } else if (!info.isFile() || !files.has(path)) fail();
    }
  };
  walk('');
  const fixtureFiles = new Set([
    ...ownFiles,
    ...Object.keys(manifest.uiPaths).map((path) => 'ui-after/' + path + '.txt'),
  ]);
  const fixtureDirs = new Set();
  for (const path of fixtureFiles)
    for (let d = dirname(path); d !== '.'; d = dirname(d)) fixtureDirs.add(d);
  const walkFixture = (prefix = '') => {
    for (const name of readdirSync(directory + prefix)) {
      const path = prefix + name;
      const info = lstatSync(directory + path);
      if (info.isSymbolicLink()) fail();
      if (info.isDirectory()) {
        if (!fixtureDirs.has(path)) fail();
        walkFixture(path + '/');
      } else if (!info.isFile() || !fixtureFiles.has(path)) fail();
    }
  };
  walkFixture();
  checkOwn();
  return Object.freeze({
    context: matches[0],
    commit: manifest.contexts[matches[0]].commit,
    files: files.size,
    admissionAuthorized: false,
  });
}
export async function qualifyInvoiceGuardProposal({
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  const frame = verifyCurrentPhysicalFrame();
  capturedContext = frame.context;
  const context = {
    ...manifest.rows,
    ...manifest.contexts[frame.context].overrides,
  };
  // Current endpoint bodies are checked first. The same seven existing sealed historical
  // fixture bodies are NEVER replacements for absent or changed current source.
  const historicalRead = (path, encoding) => {
    const bytes = read(path, encoding);
    const key = relative(
      source,
      path instanceof URL ? fileURLToPath(path) : resolve(String(path)),
    );
    if (!Object.hasOwn(manifest.overlays, key)) return bytes;
    if (oid(Buffer.from(bytes)) !== context[key].oid) fail();
    const historical = regular(
      historicalDirectory + 'historical/' + key,
      0o644,
    );
    if (sha(historical) !== manifest.overlays[key].sha256) fail();
    return encoding
      ? historical.toString(
          typeof encoding === 'string' ? encoding : encoding.encoding,
        )
      : Buffer.from(historical);
  };
  const canonicalBytes = regular(qualifier, 0o644);
  if (oid(canonicalBytes) !== context[qualifier].oid) fail();
  const current = await import(dataPrefix + canonicalBytes.toString('base64'));
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
      return (...readArgs) => checked(reader, readArgs);
    },
  });
  return Object.freeze({ ...q, helper, check: () => checked(q.check, []) });
}
