// UNAPPLIED build-source admission qualification; no operational/provider authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  mkdtempSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve, parse, relative, sep } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
export const parent = '95b0bb301610e589090e5611427809a29a23790a';
const base = 'proposals/nmi-order-reference-admission/';
const patchHash =
  '4043acd54d25ef46dd3447e5f80d5423a24e10c0dd4d944a354685475f01e220';
const recordHash =
  '0e3bb6206473263458cc256f2a0fd4158b1a1495dc6d41f35f8b63fbfdb3bddd';
const helper = 'scripts/payment-response-source-admission.mjs';
const env = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_COUNT: '0',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
  GIT_ALLOW_PROTOCOL: 'file',
};
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) =>
  execFileSync(
    'git',
    ['--no-replace-objects', '-c', 'core.hooksPath=' + devNull, ...args],
    { env, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 },
  );
function regular(path, mode = 0o644) {
  const full = resolve(path);
  let ancestor = dirname(full);
  while (ancestor !== parse(ancestor).root) {
    assert(!lstatSync(ancestor).isSymbolicLink(), 'Symlink ancestor forbidden');
    ancestor = dirname(ancestor);
  }
  const info = lstatSync(full);
  assert(
    info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === mode,
    'Exact regular source required',
  );
  return readFileSync(full);
}
let original;
function originals() {
  if (original) return original;
  const rows = git('ls-tree', '-rz', parent)
    .subarray(0, -1)
    .toString()
    .split('\0');
  const objects = rows.map((row) => row.split('\t')[0].split(' ')[2]);
  const bytes = execFileSync(
    'git',
    ['--no-replace-objects', 'cat-file', '--batch'],
    {
      env,
      input: objects.join('\n') + '\n',
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  let offset = 0;
  original = new Map();
  for (const [i, row] of rows.entries()) {
    const [meta, path] = row.split('\t');
    const mode = meta.split(' ')[0];
    assert(['100644', '100755'].includes(mode));
    const end = bytes.indexOf(10, offset),
      header = bytes.subarray(offset, end).toString().split(' '),
      size = Number(header[2]);
    assert.equal(header[0], objects[i]);
    assert.equal(header[1], 'blob');
    original.set(path, {
      mode: mode === '100755' ? 0o755 : 0o644,
      bytes: Buffer.from(bytes.subarray(end + 1, end + size + 1)),
    });
    offset = end + size + 2;
  }
  return original;
}
export function packet(read = regular) {
  const patch = read(base + 'admission.patch'),
    record = read(base + 'evidence.json');
  assert.equal(sha(patch), patchHash, 'Exact finite admission patch required');
  assert.equal(
    sha(record),
    recordHash,
    'Exact real-author admission record required',
  );
  return { patch, record: JSON.parse(record) };
}
export function canonicalFrame(read = regular) {
  for (const [path, prior] of originals())
    assert.equal(
      sha(read(path, prior.mode)),
      sha(prior.bytes),
      'Unknown canonical source: ' + path,
    );
  return true;
}
export function checkArchive(root) {
  const { record } = packet();
  const proposed = new Map(record.files.map((file) => [file.path, file]));
  for (const [path, prior] of originals()) {
    const next = proposed.get(path);
    if (next) {
      assert.equal(sha(prior.bytes), next.beforeSha256);
      assert.equal(next.mode, '100644');
    }
    assert.equal(
      sha(regular(join(root, path), prior.mode)),
      next?.proposedSha256 ?? sha(prior.bytes),
      'Unknown proposed frame: ' + path,
    );
  }
  assert.equal(proposed.size, 10);
  return true;
}
export function prepareArchive() {
  canonicalFrame();
  const { patch } = packet();
  const root = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-nmi-admission-'),
  );
  try {
    git('clone', '--quiet', '--shared', '--no-checkout', process.cwd(), root);
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.hooksPath=' + devNull,
        'checkout',
        '--quiet',
        '--detach',
        parent,
      ],
      { cwd: root, env, stdio: 'pipe' },
    );
    for (const args of [
      ['apply', '--check', '--whitespace=error', '-'],
      ['apply', '--whitespace=error', '-'],
    ])
      execFileSync('git', args, {
        cwd: root,
        env,
        input: patch,
        stdio: 'pipe',
      });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    checkArchive(root);
    canonicalFrame();
    return root;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
export async function proposedPorts(root) {
  checkArchive(root);
  const bytes = regular(join(root, helper));
  const code = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
  const ports = {
    readCurrent: (path) => regular(join(root, path)),
    readOriginal: (commit, path) => git('show', `${commit}:${path}`),
    metadata: git,
    stat: (path) => lstatSync(join(root, path)),
  };
  checkArchive(root);
  return { ...code, ports };
}
export function ackCli(root) {
  checkArchive(root);
  const result = spawnSync(
    process.execPath,
    ['scripts/check-payment-ack-admission.mjs'],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.classification, 'DEVELOPMENT_SOURCE_ONLY');
  assert.equal(report.operationalAcceptance, 'NOT_RUN');
  assert.equal(report.historicalSources, 8);
  assert.equal(report.unchangedHistoricalPins, 4);
  checkArchive(root);
  return report;
}
export function originalAckDenial() {
  canonicalFrame();
  const result = spawnSync(
    process.execPath,
    ['scripts/check-payment-ack-admission.mjs'],
    { env, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert(
    result.stderr.includes('Exact finite payment response source required'),
  );
  canonicalFrame();
  return true;
}
export const endpointFiles = [
  'tests/payment-ack-source-admission.test.ts',
  'tests/launch-invoice-payment-source.test.ts',
  'tests/invoice-caller-migration-source.test.ts',
  'tests/launch-caller-payment-integration.test.ts',
  'tests/invoice-checker-qualification-baseline.test.ts',
  'tests/invoice-caller-transition-proposal.test.ts',
];
export function runEndpoints(root) {
  checkArchive(root);
  const resultPath = join(root, 'endpoints.json');
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...endpointFiles,
      '--maxWorkers=1',
      '--reporter=json',
      '--outputFile=' + resultPath,
    ],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 },
  );
  assert.ifError(result.error);
  const report = JSON.parse(readFileSync(resultPath, 'utf8'));
  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.success, true);
  assert.equal(report.numTotalTests, 72);
  assert.equal(report.numPassedTests, 72);
  assert.equal(report.numFailedTests, 0);
  assert.equal(report.numPendingTests, 0);
  assert.equal(report.numTodoTests, 0);
  assert.equal(report.testResults.length, 6);
  assert.deepEqual(
    report.testResults
      .map((suite) =>
        relative(root, resolve(root, suite.name)).split(sep).join('/'),
      )
      .sort(),
    [...endpointFiles].sort(),
    'All six exact original endpoint identities required',
  );
  for (const suite of report.testResults) {
    assert.equal(suite.status, 'passed');
    assert(suite.assertionResults.every((test) => test.status === 'passed'));
  }
  assert.equal(
    report.testResults.reduce(
      (total, suite) => total + suite.assertionResults.length,
      0,
    ),
    72,
  );
  checkArchive(root);
  return {
    passed: report.numPassedTests,
    failed: 0,
    skipped: 0,
    files: endpointFiles.length,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.deepEqual(
    process.argv.slice(2),
    ['--endpoints'],
    'Only exact endpoint qualification supported',
  );
  const root = prepareArchive();
  try {
    console.log(
      JSON.stringify(
        {
          parent,
          originalAckDenied: originalAckDenial(),
          proposedAck: ackCli(root),
          endpoints: runEndpoints(root),
          applicationAuthorized: false,
          integrationAuthorized: false,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      checkArchive(root);
      canonicalFrame();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
