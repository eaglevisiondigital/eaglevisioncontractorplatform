// Applies the proposed source guard only in a disposable archive. No admission.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  mkdtempSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join } from 'node:path';
const directory = 'proposals/invoice-caller-admission';
const expected = {
  classification: 'UNAPPLIED_FINITE_INVOICE_CALLER_ADMISSION',
  parent: '6063aea60588975bbe88c8ccf8b1d864721b7082',
  sourceAuthor: '8f498f2c657608c64d40a3527be13b47a189b7b7',
  patchSha256:
    '8b1b5198edc5700a53a802fa943a764584916cbc0a1802c6bb446c627f35c187',
  files: [
    {
      path: 'tests/launch-invoice-payment-source.test.ts',
      beforeSha256:
        '2167d4705c9de49c8d8bbecff0e3dc639ceacbc62c508181c42a1e1ac6a22370',
      proposedSha256:
        '52f0e7e62b74c0fff9b295cd855eac4419340097eee37237330a9fcf17ddb3b8',
    },
    {
      path: 'scripts/invoice-caller-source-admission.mjs',
      beforeSha256: null,
      proposedSha256:
        'e83139e1af82743bf9993fac2fb55c4d50e359e9681fd16d1a12001a41432dbf',
    },
  ],
  canonicalGuardChanged: false,
  admissionAuthorized: false,
  release: 'NOT_READY_NOT_AUTHORIZED',
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['--no-replace-objects', ...a]);
export function qualify({
  patch = readFileSync(join(directory, 'admission.patch')),
  evidence = JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8')),
  mode = 'positive',
} = {}) {
  assert.deepEqual(
    evidence,
    expected,
    'Exact unapplied invoice admission proposal required',
  );
  assert.equal(
    hash(patch),
    expected.patchSha256,
    'Exact invoice admission patch required',
  );
  assert(
    ['positive', 'helper-mutation', 'record-rebind'].includes(mode),
    'Exact qualification mode required',
  );
  const guard = expected.files[0].path,
    helper = expected.files[1].path;
  const before = readFileSync(guard);
  assert.equal(
    hash(before),
    expected.files[0].beforeSha256,
    'Canonical guard must remain unchanged',
  );
  assert.deepEqual(before, git('show', `${expected.parent}:${guard}`));
  assert.throws(
    () => lstatSync(helper),
    (e) => e.code === 'ENOENT',
    'Canonical helper must remain absent',
  );
  assert.equal(
    hash(readFileSync(join(directory, 'helper.mjs'))),
    expected.files[1].proposedSha256,
  );
  const root = mkdtempSync(join(tmpdir(), 'propel-invoice-admission-'));
  const env = {
    PATH: process.env.PATH,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: devNull,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CEILING_DIRECTORIES: root,
  };
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, expected.parent);
    execFileSync('tar', ['-xf', archive, '-C', root]);
    execFileSync('git', ['apply', '-'], {
      cwd: root,
      env,
      input: patch,
      stdio: 'pipe',
    });
    for (const file of expected.files)
      assert.equal(
        hash(readFileSync(join(root, file.path))),
        file.proposedSha256,
      );
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    if (mode === 'helper-mutation')
      writeFileSync(
        join(root, helper),
        "throw Error('UNREVIEWED_HELPER_EXECUTED');",
      );
    if (mode === 'record-rebind') {
      const path = 'server/invoices/commercial-draft-client.ts';
      const bytes = Buffer.concat([
        readFileSync(join(root, path)),
        Buffer.from('\n// UNKNOWN EDIT'),
      ]);
      writeFileSync(join(root, path), bytes);
      const record = 'docs/LAUNCH_INVOICE_PAYMENT_COMPOSITION.json';
      const json = JSON.parse(readFileSync(join(root, record), 'utf8'));
      const source = json.sources.find((s) => s.path === path);
      source.currentSha256 = hash(bytes);
      source.originSha256 = hash(bytes);
      source.originCommit = expected.sourceAuthor;
      writeFileSync(join(root, record), JSON.stringify(json));
    }
    const result = join(root, 'result.json');
    const args = [
      'node_modules/vitest/vitest.mjs',
      'run',
      guard,
      '--reporter=json',
      '--outputFile=' + result,
    ];
    if (mode === 'record-rebind')
      args.push('-t', 'binds the combined sources to exact author objects');
    let failed = false;
    try {
      execFileSync(process.execPath, args, {
        cwd: root,
        env: {
          ...env,
          GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
          GIT_WORK_TREE: root,
        },
        stdio: 'pipe',
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (error) {
      if (!Number.isInteger(error.status)) throw error;
      failed = true;
    }
    const report = JSON.parse(readFileSync(result, 'utf8'));
    if (mode === 'positive') {
      assert.equal(failed, false, 'Actual patched source guard must pass');
      assert.equal(report.numTotalTests, 8);
      assert.equal(report.numPassedTests, 8);
      assert.equal(report.numFailedTests, 0);
      assert.equal(report.numPendingTests, 0);
    } else {
      assert(failed, 'Negative qualification must fail closed');
      const error = JSON.stringify(report);
      assert(
        error.includes(
          mode === 'helper-mutation'
            ? 'Reviewed invoice caller helper required'
            : 'Exact finite invoice caller source required',
        ),
      );
      assert(
        !error.includes('Error: UNREVIEWED_HELPER_EXECUTED'),
        'Unknown helper must not execute',
      );
    }
    assert.deepEqual(readFileSync(guard), before);
    return {
      mode,
      status: mode === 'positive' ? 'PASS' : 'DENIED',
      guardCases: mode === 'positive' ? 8 : null,
      canonicalGuardChanged: false,
      admissionAuthorized: false,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
