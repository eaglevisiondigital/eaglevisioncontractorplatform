// Offline test-fixture qualification only; never imported by the application.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { devNull, tmpdir } from 'node:os';
export const parent = '5bf90478a853e34cfdb18cc6ed3a2b1c7ace25d5';
export const tree = '7a86790dfb4164503348eefe0fdc5dd6f4f683a6';
export const target = 'tests/cycle27-source-lineage.test.ts';
const directory = 'proposals/c27-output-fixture-correction/';
const beforeSha =
  'fa5190cda8ec498565a830022bc2c20bf79a3a1e01823d2d5453bb80d3e47fe5';
const afterSha =
  '1df4852d4c78ea2d62beaabd49ee4771842ef1d586dfb0b0977c8d7319a90913';
const patchSha =
  'f9497b081cea32fa1df00df1a4f4e8830ce149f21f16e9ff23afac6aac070af9';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const oid = (bytes) =>
  createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
const fail = () => {
  throw Error('Exact unapplied C27 output fixture proposal required');
};
export function inspectPacket({ read = readFileSync } = {}) {
  const original = Buffer.from(read(directory + 'original-tests.txt'));
  const payload = Buffer.from(read(directory + 'source-tests.proposed.txt'));
  const patch = Buffer.from(read(directory + 'output-paths.patch'));
  if (
    hash(original) !== beforeSha ||
    hash(payload) !== afterSha ||
    hash(patch) !== patchSha
  )
    fail();
  return Object.freeze({
    classification: 'UNAPPLIED_TEST_OUTPUT_PATHS_ONLY',
    parent,
    tree,
    target,
    beforeSha256: beforeSha,
    afterSha256: afterSha,
    patchSha256: patchSha,
    admissionAuthorized: false,
    payload,
  });
}
const gitEnvironment = Object.freeze({
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_COUNT: '0',
  GIT_ATTR_NOSYSTEM: '1',
  GIT_ALLOW_PROTOCOL: 'file',
  GIT_NO_LAZY_FETCH: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
});
function childEnvironment(extra = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith('GIT_') &&
          !key.startsWith('GCM_') &&
          !['NODE_OPTIONS', 'NODE_PATH'].includes(key),
      ),
    ),
    ...gitEnvironment,
    CI: 'false',
    GITHUB_ACTIONS: 'false',
    ...extra,
  };
}
function git(cwd, ...args) {
  return execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.hooksPath=' + devNull,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'credential.helper=',
      ...args,
    ],
    { cwd, env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
export function createImage({ proposed = false } = {}) {
  const packet = inspectPacket();
  const source = process.cwd();
  if (
    git(source, 'rev-parse', parent + '^{tree}')
      .toString()
      .trim() !== tree
  )
    fail();
  const image = mkdtempSync(join(realpathSync(tmpdir()), 'c27-output-image-'));
  try {
    git(
      source,
      'clone',
      '--shared',
      '--no-hardlinks',
      '--no-checkout',
      source,
      image,
    );
    git(image, 'switch', '--detach', parent);
    if (hash(readFileSync(join(image, target))) !== beforeSha) fail();
    if (proposed) writeFileSync(join(image, target), packet.payload);
    symlinkSync(
      realpathSync(resolve('node_modules')),
      join(image, 'node_modules'),
      'dir',
    );
    return {
      image,
      proposed,
      remove: () => rmSync(image, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(image, { recursive: true, force: true });
    throw error;
  }
}
export function probeGuard(image) {
  const wrapper =
    'proposals/ui-invoice-composition-fixture-compatibility/current-fixture.mjs';
  const script = `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const bytes=readFileSync('${wrapper}');if(createHash('sha256').update(bytes).digest('hex')!=='f6fba0d22b3c32a090607329659343cae1f7d53c1c124b565d736ce3e65d0973')throw Error('Pinned actual528 fixture required');const m=await import('data:text/javascript;base64,'+bytes.toString('base64'));try{const q=await m.qualifyInvoiceGuardProposal();console.log(JSON.stringify({status:'PASS',context:m.verifyCurrentPhysicalFrame().context,sourceAuthor:q.check().sourceAuthor,admissionAuthorized:q.admissionAuthorized}));}catch(error){console.log(JSON.stringify({status:'DENIED',message:error.message,admissionAuthorized:false}));}`;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: image, env: childEnvironment(), encoding: 'utf8' },
  );
  if (result.status !== 0) throw Error(result.stderr.slice(0, 500));
  return JSON.parse(result.stdout);
}
export function inspectImage(image) {
  const rows = new Map(
    git(image, 'ls-tree', '-rz', parent)
      .toString()
      .split('\0')
      .filter(Boolean)
      .map((row) => {
        const [meta, path] = row.split('\t');
        const [mode, type, object] = meta.split(' ');
        if (type !== 'blob') fail();
        return [path, { mode: mode === '100644' ? 0o644 : 0o755, oid: object }];
      }),
  );
  const bodyMismatches = [],
    modeMismatches = [],
    unknown = [];
  const directories = new Set();
  for (const [path, row] of rows) {
    for (let dir = dirname(path); dir !== '.'; dir = dirname(dir))
      directories.add(dir);
    const file = join(image, path);
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink()) fail();
    if ((info.mode & 0o777) !== row.mode) modeMismatches.push(path);
    if (oid(readFileSync(file)) !== row.oid) bodyMismatches.push(path);
  }
  const excluded = new Set([
    '.git',
    'node_modules',
    'dist',
    'coverage',
    'test-results',
    'playwright-report',
  ]);
  const walk = (prefix = '') => {
    for (const name of readdirSync(join(image, prefix))) {
      const path = prefix ? prefix + '/' + name : name;
      if (!prefix && excluded.has(name)) continue;
      const info = lstatSync(join(image, path));
      if (!rows.has(path) && !directories.has(path)) unknown.push(path);
      if (info.isDirectory() && !info.isSymbolicLink()) walk(path);
    }
  };
  walk();
  return {
    sourceFiles: rows.size,
    bodyMismatches,
    modeMismatches,
    unknown,
    artifactsRootPresent: readdirSync(image).includes('artifacts'),
  };
}
export function runC27(
  image,
  { onlyTwo = false, unsafeTemporaryRoot = false } = {},
) {
  const outputRoot = mkdtempSync(
    join(realpathSync(tmpdir()), 'c27-output-report-'),
  );
  const report = join(outputRoot, 'result.json');
  const args = [join(image, 'node_modules/vitest/vitest.mjs'), 'run', target];
  if (onlyTwo)
    args.push(
      '-t',
      '^(warm immutable Git facts never cache mutable files or source admission|raw object facts ignore replacement refs and shallow traversal in a disposable repository)$',
    );
  args.push('--reporter=json', '--outputFile=' + report);
  const result = spawnSync(process.execPath, args, {
    cwd: image,
    encoding: 'utf8',
    env: childEnvironment(unsafeTemporaryRoot ? { TMPDIR: image } : {}),
    maxBuffer: 8 * 1024 * 1024,
  });
  const data = JSON.parse(readFileSync(report, 'utf8'));
  return {
    exit: result.status,
    total: data.numTotalTests,
    passed: data.numPassedTests,
    failed: data.numFailedTests,
    skipped: data.numPendingTests,
    report,
    failureMessages: data.testResults.flatMap((file) =>
      (file.assertionResults ?? []).flatMap(
        (result) => result.failureMessages ?? [],
      ),
    ),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
export function createDirtyArtifacts(image) {
  mkdirSync(join(image, 'artifacts/cycle27'), { recursive: true });
}
export function changePermission(image) {
  chmodSync(join(image, 'README.md'), 0o664);
}
