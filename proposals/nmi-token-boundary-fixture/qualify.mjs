// Offline fixture-source qualification only; no source admission or live transport.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { resolve, join, dirname, parse } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
export const parent = '38bc1bce05075fc0e858554947e195d8dded3c4a';
export const target = 'tests/nmi-two-merchant-token-boundary.test.ts';
export const before =
  'e61ccf5a059bdf5116387176d1afcbf1b0d596f47c7091e72ea42c800def4fff';
export const after =
  '784666767e8938875300e0c37759f4cc745861218033a9c4e01bdeda86abea47';
export const patchHash =
  'd67d40d9ba916bf776c3415ab0ecf2ff8de709f84cc356861c719e6144d13db0';
const evidenceHash =
  'ee856868d63802c761ecbe3bad7f3ca89c5b8346f6119b75f989afc93776b151';
const directory = 'proposals/nmi-token-boundary-fixture/';
const sourceParent = '53a4705b72b584228b33988d1eae586ef10b44eb';
const source = 'server/payments/sandbox.ts';
const sourceBefore =
  '828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb';
const sourceAfter =
  '0c6bc1aa8e78ed7f6d86128e79055630cb41ec5281ed32a0bf7bbdc616a8ccc6';
const sourcePatch =
  '73d4d530e4a560838477641e2c4298edee03fd4368645437ca9f113ab32ac294';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const env = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const runGit = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    env,
    stdio: 'pipe',
    maxBuffer: 64 * 1024 * 1024,
  });
export function verifySourceAuthor(git = runGit) {
  assert.equal(
    git('show', '--no-patch', '--format=%P', parent).toString().trim(),
    sourceParent,
    'Exact approved source-author parent required',
  );
  assert.equal(
    git(
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '--no-renames',
      '-r',
      parent,
    )
      .toString()
      .trim(),
    `M\t${source}`,
    'Exact one-file source author required',
  );
  for (const [commit, path, hash] of [
    [sourceParent, source, sourceBefore],
    [parent, source, sourceAfter],
    [parent, target, before],
    ['1199a062ab846989f01fc60fec4d2b51da64835d', target, before],
  ]) {
    const tree = git('ls-tree', commit, '--', path).toString().trim();
    assert.match(tree, /^100644 blob [a-f0-9]{40}\t/);
    assert.equal(tree.split('\t')[1], path);
    assert.equal(sha(git('show', `${commit}:${path}`)), hash);
  }
  assert.equal(
    sha(git('diff', sourceParent, parent, '--', source)),
    sourcePatch,
  );
  return true;
}
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
let immutable;
function originals() {
  if (immutable) return immutable;
  verifySourceAuthor();
  const rows = runGit('ls-tree', '-r', parent).toString().trim().split('\n');
  const blobs = execFileSync(
    'git',
    ['--no-replace-objects', 'cat-file', '--batch'],
    {
      env,
      input:
        rows.map((row) => row.split(' ')[2].split('\t')[0]).join('\n') + '\n',
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  immutable = new Map();
  let offset = 0;
  for (const row of rows) {
    const [meta, path] = row.split('\t');
    const mode = meta.split(' ')[0];
    assert(['100644', '100755'].includes(mode));
    const end = blobs.indexOf(10, offset);
    const size = Number(blobs.subarray(offset, end).toString().split(' ')[2]);
    immutable.set(path, {
      mode: mode === '100755' ? 0o755 : 0o644,
      bytes: Buffer.from(blobs.subarray(end + 1, end + size + 1)),
    });
    offset = end + size + 2;
  }
  return immutable;
}
export function frame(read = regular) {
  let mode;
  for (const [path, original] of originals()) {
    const actual = sha(read(path, original.mode));
    if (path === target) {
      assert(
        [before, after].includes(actual),
        'Exact fixture before/after required',
      );
      mode = actual === before ? 'before' : 'after';
    } else
      assert.equal(
        actual,
        sha(original.bytes),
        'Unknown current source: ' + path,
      );
  }
  return mode;
}
export function packet(read = regular) {
  const patch = read(directory + 'correction.patch');
  assert.equal(sha(patch), patchHash, 'Exact one-file fixture patch required');
  assert.equal(
    sha(read(directory + 'evidence.json')),
    evidenceHash,
    'Exact unapplied fixture-source evidence required',
  );
  return patch;
}
export function proposedBytes() {
  const old = originals().get(target).bytes;
  assert.equal(sha(old), before);
  const prior = `    expect(JSON.parse(String(options?.body))).toMatchObject({
      payment_details: { payment_token: s.token.value },
      order_id: s.intent.idempotencyKey,
    });`;
  const proposed = `    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      payment_details: { payment_token: s.token.value },
      order_details: { order_id: s.intent.idempotencyKey },
    });
    expect(body).not.toHaveProperty('order_id');`;
  assert.equal(old.toString().split(prior).length, 2);
  const next = Buffer.from(old.toString().replace(prior, proposed));
  assert.equal(sha(next), after);
  return next;
}
export const regressions = [
  'tests/payments-sandbox.test.ts',
  'tests/payment-token-reference.test.ts',
  target,
  'tests/payments-outcome-ack.test.ts',
  'tests/payments-refunds.test.ts',
  'tests/payments-webhook-wire-integrity.test.ts',
  'tests/payments-webhook-ack.test.ts',
  'tests/payments-webhook-composition.test.ts',
];
const pair = [
  'fictional launch 0 composes exact token/customer/merchant scope into restricted capture without private token in SQL',
  'fictional launch 1 composes exact token/customer/merchant scope into restricted capture without private token in SQL',
];
function runTests(root, name, files, selected = false) {
  const reportPath = join(root, name + '.json');
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...files,
      ...(selected
        ? [
            '-t',
            '^fictional launch [01] composes exact token/customer/merchant scope into restricted capture without private token in SQL$',
          ]
        : []),
      '--maxWorkers=1',
      '--reporter=json',
      '--outputFile=' + reportPath,
    ],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 },
  );
  assert.ifError(result.error);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const cases = report.testResults.flatMap((suite) => suite.assertionResults);
  return { result, report, cases };
}
export function qualify({ fullRegressions = false } = {}) {
  assert.equal(typeof fullRegressions, 'boolean');
  const current = frame();
  const patch = packet();
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'propel-nmi-fixture-'));
  try {
    const archive = join(root, 'source.tar');
    runGit('archive', '--format=tar', '--output', archive, parent);
    execFileSync('tar', ['-xf', archive, '-C', root], { env, stdio: 'pipe' });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    const negative = runTests(root, 'original-two', [target], true);
    assert.equal(negative.result.status, 1);
    assert.equal(negative.report.numFailedTests, 2);
    assert.equal(negative.report.numPassedTests, 0);
    assert.deepEqual(
      negative.cases
        .filter((test) => test.status === 'failed')
        .map((test) => test.fullName),
      pair,
    );
    for (const test of negative.cases.filter(
      (test) => test.status === 'failed',
    ))
      assert(
        test.failureMessages.join('\n').includes('to match object'),
        'Expected original body-shape failure',
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
    assert.deepEqual(readFileSync(join(root, target)), proposedBytes());
    const positive = runTests(root, 'corrected-two', [target], true);
    assert.equal(positive.result.status, 0, JSON.stringify(positive.report));
    assert.equal(positive.report.numFailedTests, 0);
    assert.equal(positive.report.numPassedTests, 2);
    assert.deepEqual(
      positive.cases
        .filter((test) => test.status === 'passed')
        .map((test) => test.fullName),
      pair,
    );
    assert.deepEqual(
      positive.cases.map((test) => test.fullName),
      negative.cases.map((test) => test.fullName),
    );
    assert.equal(
      positive.report.numPendingTests,
      negative.report.numPendingTests,
    );
    const gitEnv = {
      ...env,
      GIT_DIR: runGit('rev-parse', '--absolute-git-dir').toString().trim(),
      GIT_WORK_TREE: root,
    };
    const guard = spawnSync(
      process.execPath,
      ['scripts/check-payment-ack-admission.mjs'],
      { cwd: root, env: gitEnv, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    assert.ifError(guard.error);
    assert.equal(guard.status, 1, 'Original G8 must deny unadmitted source');
    assert(
      guard.stderr.includes('Exact finite payment response source required'),
    );
    let originalRegressions;
    if (fullRegressions) {
      const all = runTests(root, 'original149', regressions);
      assert.equal(all.result.status, 0, JSON.stringify(all.report));
      assert.equal(all.report.numTotalTests, 149);
      assert.equal(all.report.numPassedTests, 149);
      assert.equal(all.report.numFailedTests, 0);
      assert.equal(all.report.numPendingTests, 0);
      originalRegressions = { files: 8, passed: 149, failed: 0, skipped: 0 };
    }
    for (const [path, original] of originals())
      assert.equal(
        sha(regular(join(root, path), original.mode)),
        path === target ? after : sha(original.bytes),
        'Unexpected archive source change: ' + path,
      );
    return {
      parent,
      target,
      patchHash,
      originalTwo: { failed: 2, passed: 0 },
      correctedTwo: { failed: 0, passed: 2 },
      originalRegressions,
      unchangedOtherParentFiles: originals().size - 1,
      originalG8: 'EXPECTED_DENIAL',
      applicationAuthorized: false,
      sourceAdmissionAuthorized: false,
    };
  } finally {
    try {
      assert.equal(frame(), current);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(
    process.argv.slice(2).every((argument) => argument === '--regressions'),
    'Unknown qualifier option',
  );
  console.log(
    JSON.stringify(
      qualify({ fullRegressions: process.argv.includes('--regressions') }),
      null,
      2,
    ),
  );
}
