// Test-source fixture only. Current physical source must qualify before projection.
import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const folder = 'proposals/dashboard-forms-fixture-compatibility/';
const manifestSeal =
  '31fdfdeee445f3923111c8fb8a38255f48533efcfbeb72086e27d1e461f1ed09';
const source = process.cwd();
const self = resolve(source, folder + 'current-fixture.mjs');
const dataPrefix = 'data:text/javascript;base64,';
const selfBytes = import.meta.url.startsWith(dataPrefix)
  ? Buffer.from(import.meta.url.slice(dataPrefix.length), 'base64')
  : readFileSync(self);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const oid = (kind, bytes) =>
  createHash('sha1')
    .update(kind + ' ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
const fail = () => {
  throw Error('Exact approved dashboard/forms source fixture required');
};
if (
  realpathSync(source) !== source ||
  (!import.meta.url.startsWith(dataPrefix) &&
    fileURLToPath(import.meta.url) !== self)
)
  fail();
const rootIdentity = lstatSync(source),
  selfSeal = sha(selfBytes);
function sameRoot() {
  const current = lstatSync(source);
  if (
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    realpathSync(source) !== source ||
    current.dev !== rootIdentity.dev ||
    current.ino !== rootIdentity.ino
  )
    fail();
  for (let parent = source; ; parent = dirname(parent)) {
    const info = lstatSync(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) fail();
    if (dirname(parent) === parent) break;
  }
}
function regular(path) {
  sameRoot();
  let current = source;
  const segments = path.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..')) fail();
  for (const [index, part] of segments.entries()) {
    current = join(current, part);
    const info = lstatSync(current);
    if (
      info.isSymbolicLink() ||
      (index < segments.length - 1 && !info.isDirectory())
    )
      fail();
  }
  const first = lstatSync(current);
  if (!first.isFile() || (first.mode & 0o7777) !== 0o644) fail();
  const bytes = readFileSync(current),
    last = lstatSync(current);
  if (
    first.dev !== last.dev ||
    first.ino !== last.ino ||
    first.mode !== last.mode ||
    first.size !== last.size ||
    first.mtimeMs !== last.mtimeMs
  )
    fail();
  return bytes;
}
const manifestBytes = regular(folder + 'manifest.json');
if (sha(manifestBytes) !== manifestSeal) fail();
const manifest = JSON.parse(manifestBytes);
if (
  oid('commit', Buffer.from(manifest.parentRawCommit)) !== manifest.parent ||
  !manifest.parentRawCommit.startsWith('tree ' + manifest.tree + '\n')
)
  fail();
const original = regular(folder + 'original-tests.txt');
const historical = regular(folder + 'historical-forms.ts.txt');
if (
  sha(original) !== manifest.originalTestSHA256 ||
  sha(historical) !== manifest.historicalFormsSHA256
)
  fail();
const oldReader =
  "const source = (path: string) => readFileSync(path, 'utf8');";
function adapter() {
  return `const { dashboardSource: source } = (await import(\n  await (async () => {\n    const bytes = readFileSync(\n      '${folder}current-fixture.mjs',\n    );\n    if (\n      createHash('sha256').update(bytes).digest('hex') !==\n      '${selfSeal}'\n    )\n      throw Error('Exact approved dashboard/forms source fixture required');\n    return 'data:text/javascript;base64,' + bytes.toString('base64');\n  })()\n)) as { dashboardSource(path: string): string };`;
}
export function proposedTestBytes() {
  const text = original.toString();
  if (text.split(oldReader).length !== 2) fail();
  return Buffer.from(text.replace(oldReader, adapter()));
}
export function proposedPatchBytes() {
  const lines = original.toString().split('\n');
  if (lines.pop() !== '') fail();
  const index = lines.indexOf(oldReader),
    start = index - 3,
    end = index + 4;
  if (index < 3 || end > lines.length) fail();
  const replacement = adapter().split('\n');
  const context = [
    ...lines.slice(start, index).map((line) => ' ' + line),
    '-' + oldReader,
    ...replacement.map((line) => '+' + line),
    ...lines.slice(index + 1, end).map((line) => ' ' + line),
  ];
  return Buffer.from(
    `diff --git a/${manifest.target} b/${manifest.target}\nindex ${oid('blob', original)}..${oid('blob', proposedTestBytes())} 100644\n--- a/${manifest.target}\n+++ b/${manifest.target}\n@@ -${start + 1},${end - start} +${start + 1},${end - start - 1 + replacement.length} @@\n${context.join('\n')}\n`,
  );
}
const ownFiles = new Set([
  'README.md',
  'manifest.json',
  'current-fixture.mjs',
  'original-tests.txt',
  'historical-forms.ts.txt',
  'source-tests.proposed.txt',
  'fixture.patch',
  'controls.test.mjs',
]);
function checkOwn() {
  if (
    !regular(folder + 'current-fixture.mjs').equals(selfBytes) ||
    sha(regular(folder + 'manifest.json')) !== manifestSeal ||
    !regular(folder + 'original-tests.txt').equals(original) ||
    !regular(folder + 'historical-forms.ts.txt').equals(historical)
  )
    fail();
  if (
    !regular(folder + 'source-tests.proposed.txt').equals(
      proposedTestBytes(),
    ) ||
    !regular(folder + 'fixture.patch').equals(proposedPatchBytes())
  )
    fail();
  for (const [path, pin] of Object.entries(manifest.packetFiles))
    if (sha(regular(folder + path)) !== pin) fail();
  const names = readdirSync(join(source, folder));
  if (
    names.length !== ownFiles.size ||
    names.some((name) => !ownFiles.has(name))
  )
    fail();
  for (const name of names) regular(folder + name);
}
const artifacts = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
]);
let capturedHeader;
export function verifyCurrentDashboardFrame() {
  checkOwn();
  let count = 0,
    header;
  function walk(directory, prefix = '') {
    const first = lstatSync(directory),
      rows = [];
    if (!first.isDirectory() || first.isSymbolicLink()) fail();
    for (const name of readdirSync(directory)) {
      const key = prefix ? prefix + '/' + name : name;
      if ((!prefix && artifacts.has(name)) || key === folder.slice(0, -1))
        continue;
      const path = join(directory, name),
        info = lstatSync(path);
      if (info.isSymbolicLink()) fail();
      if (info.isDirectory())
        rows.push({
          name,
          directory: true,
          mode: '40000',
          hash: walk(path, key),
        });
      else {
        if (!info.isFile() || ![0o644, 0o755].includes(info.mode & 0o7777))
          fail();
        let bytes = readFileSync(path);
        const last = lstatSync(path);
        if (
          info.dev !== last.dev ||
          info.ino !== last.ino ||
          info.mode !== last.mode ||
          info.size !== last.size ||
          info.mtimeMs !== last.mtimeMs
        )
          fail();
        if (key === manifest.target) {
          if (bytes.equals(original)) header = 'original';
          else if (bytes.equals(proposedTestBytes())) header = 'proposed';
          else fail();
          bytes = original;
        }
        rows.push({
          name,
          directory: false,
          mode: info.mode & 0o111 ? '100755' : '100644',
          hash: oid('blob', bytes),
        });
        count++;
      }
    }
    rows.sort((a, b) =>
      Buffer.compare(
        Buffer.from(a.name + (a.directory ? '/' : '')),
        Buffer.from(b.name + (b.directory ? '/' : '')),
      ),
    );
    const final = lstatSync(directory);
    if (first.dev !== final.dev || first.ino !== final.ino) fail();
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
    count !== manifest.files ||
    !header ||
    (capturedHeader && header !== capturedHeader)
  )
    fail();
  capturedHeader ??= header;
  if (sha(regular('src/components/forms.tsx')) !== manifest.currentFormsSHA256)
    fail();
  checkOwn();
  return Object.freeze({
    parent: manifest.parent,
    tree,
    files: count,
    header,
    currentFormsSHA256: manifest.currentFormsSHA256,
    sourceAdmissionAuthorized: false,
  });
}
const reads = new Set([
  'src/components/CompanyOperations.tsx',
  'src/lib/operations.ts',
  'src/App.tsx',
  'src/components/IntakeQueue.tsx',
  'src/components/forms-state.ts',
  'src/components/forms.tsx',
  'docs/program/CYCLE4_PROTECTED_SOURCE.json',
]);
export function dashboardSource(path) {
  if (typeof path !== 'string' || !reads.has(path)) fail();
  verifyCurrentDashboardFrame();
  const actual = regular(path);
  const result =
    path === 'src/components/forms.tsx'
      ? historical.toString('utf8')
      : actual.toString('utf8');
  verifyCurrentDashboardFrame();
  return result;
}
