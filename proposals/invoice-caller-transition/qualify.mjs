// Explicitly UNAPPLIED three-file source proposal; no operational acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  lstatSync,
  existsSync,
  writeFileSync,
  mkdtempSync,
  symlinkSync,
  realpathSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, dirname } from 'node:path';
const paymentFrameGuard =
  'bf366bff56157c0b94c174c91d8a9fbc76cb95e836d9387a2d61104e44fc873a';
const paymentAdapterPath =
  'proposals/payment-response-admission/fixture-adapter.mjs';
let paymentFixture;
if (existsSync(paymentAdapterPath)) {
  let prefix = '';
  for (const segment of paymentAdapterPath.split('/')) {
    prefix = prefix ? prefix + '/' + segment : segment;
    assert(
      !lstatSync(prefix).isSymbolicLink(),
      'Reviewed payment fixture required',
    );
  }
  const info = lstatSync(paymentAdapterPath);
  assert(
    info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o644,
    'Reviewed payment fixture required',
  );
  const bytes = readFileSync(paymentAdapterPath);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '4ccab151297b44da76057199cb3cabfcd2c73c3e20ed6761c27737db16468203',
    'Reviewed payment fixture required',
  );
  paymentFixture = await import(
    'data:text/javascript;base64,' + bytes.toString('base64')
  );
}

const directory = 'proposals/invoice-caller-transition';
const expected = {
  classification: 'UNAPPLIED_FINITE_CHECKER_TRANSITION_AMENDMENT',
  parent: '82c3ffd11499f9addbb92d6d5d7d1deb7e34d64c',
  patchSha256:
    'eb38c3fb88478d7773c590f86bae04ce5f3a87dfefc894e9e33051d66a35978a',
  files: [
    {
      path: 'tests/invoice-caller-migration-source.test.ts',
      beforeSha256:
        'b1131c5c7d80dc2fb3d28a3e7d20540c60d420f3d8ba76a7b61eb091fee24678',
      proposedSha256:
        '4879c0b0f3da8bc2e5d981faae43fe443c317ffcd400b654fc550f0605149a08',
    },
    {
      path: 'scripts/invoice-caller-source-admission.mjs',
      beforeSha256:
        'e83139e1af82743bf9993fac2fb55c4d50e359e9681fd16d1a12001a41432dbf',
      proposedSha256:
        '2a6ffb692443a7830df021e9a8cce048ac4388947e03a27af4286b4e26ee9a25',
    },
    {
      path: 'tests/launch-invoice-payment-source.test.ts',
      beforeSha256:
        '52f0e7e62b74c0fff9b295cd855eac4419340097eee37237330a9fcf17ddb3b8',
      proposedSha256:
        '9ed3efe744bdb9003d3d8459e62dd5fe9479475768df6cb58dc4d8257ef37b00',
    },
  ],
  canonicalSourceChanged: false,
  admissionAuthorized: false,
  hashOrder: 'F13 -> Hhelper -> Gguard; F contains no proposed H/G literals',
  release: 'NOT_READY_NOT_AUTHORIZED',
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['--no-replace-objects', ...a]);
const qualificationFiles = [
  [
    'proposals/invoice-caller-admission/qualify.mjs',
    '96a933b122c4b698300e18d1f0b7c6970b0a21a368c3d3bfd58a5b2b49e5bd9b',
  ],
  [
    'proposals/invoice-checker-qualification/baseline.mjs',
    '0d0c05afad3a034c2760203b3615c8a675e3ba38cb7536802e1f6ae3acfef47d',
  ],
  [
    'tests/invoice-checker-qualification-baseline.test.ts',
    'b77ca2c3b7c3c74ab67820eaa9f5b37b67492ff7ca1d85b61837ff79bd2084ce',
  ],
  [
    'tests/invoice-caller-transition-proposal.test.ts',
    '60bbd74a7d3a1ba63dc4c7f4d0eb6e61dd5ca00ed8ecdeaf1635abae12b25b68',
  ],
];
qualificationFiles.push([
  'tests/invoice-caller-admission-proposal.test.ts',
  '5e5297339ece57d2f25371e2963463a202f336266a583092fe2ca1f3089743a7',
]);
const selfBytes = readFileSync(new URL(import.meta.url));
export function qualify({
  includeQualification = false,
  patch = readFileSync(join(directory, 'amendment.patch')),
  evidence = JSON.parse(readFileSync(join(directory, 'evidence.json'), 'utf8')),
  mode = 'positive',
} = {}) {
  assert.deepEqual(
    evidence,
    expected,
    'Exact unapplied transition proposal required',
  );
  assert.equal(
    hash(patch),
    expected.patchSha256,
    'Exact transition patch required',
  );
  assert(
    [
      'positive',
      'unknown-13',
      'unknown-source',
      'helper-mutation',
      'helper-rebind',
    ].includes(mode),
    'Exact qualification mode required',
  );
  assert(
    includeQualification === false || mode === 'positive',
    'Aggregate qualification is positive-only',
  );
  const snapshots = expected.files.map((file) => readFileSync(file.path));
  const approvedFrame = snapshots.every(
    (bytes, i) => hash(bytes) === expected.files[i].beforeSha256,
  );
  const proposedTestFrame = snapshots.every(
    (bytes, i) => hash(bytes) === expected.files[i].proposedSha256,
  );
  assert(
    approvedFrame ||
      proposedTestFrame ||
      (hash(snapshots[2]) === paymentFrameGuard &&
        paymentFixture?.verifyPaymentFrame() === true),
    'Exact approved or proposed qualification frame required',
  );
  const before = new Map();
  for (const [i, file] of expected.files.entries()) {
    assert.equal(
      hash(git('show', `${expected.parent}:${file.path}`)),
      file.beforeSha256,
      'Exact original checker source required',
    );
    before.set(file.path, snapshots[i]);
  }
  const root = mkdtempSync(join(tmpdir(), 'propel-invoice-transition-'));
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
    if (includeQualification) {
      for (const [path, pin] of qualificationFiles) {
        let bytes = readFileSync(path);
        if (
          path === 'proposals/invoice-checker-qualification/baseline.mjs' &&
          hash(bytes) ===
            'c27591939af63a33312e6293ebd90469eac202b0a0237275338fb0be08e012ad'
        ) {
          assert(paymentFixture, 'Reviewed payment fixture required');
          paymentFixture.verifyPaymentFrame();
          bytes = git(
            'show',
            '276fbe4357a5ccc3593374e4cd359a10e8ae1bf6:' + path,
          );
        }
        assert.equal(
          hash(bytes),
          pin,
          'Exact qualification companion required',
        );
        const destination = join(root, path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
      for (const name of ['amendment.patch', 'evidence.json']) {
        const destination = join(root, directory, name);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, readFileSync(join(directory, name)));
      }
      writeFileSync(join(root, directory, 'qualify.mjs'), selfBytes);
    }
    const test = expected.files[0].path,
      helper = expected.files[1].path,
      guard = expected.files[2].path;
    if (mode === 'unknown-13')
      writeFileSync(
        join(root, test),
        Buffer.concat([
          readFileSync(join(root, test)),
          Buffer.from('\n// UNKNOWN EDIT'),
        ]),
      );
    if (mode === 'unknown-source') {
      const p = join(root, 'server/invoices/commercial-draft-client.ts');
      writeFileSync(
        p,
        Buffer.concat([readFileSync(p), Buffer.from('\n// UNKNOWN EDIT')]),
      );
    }
    if (mode === 'helper-mutation')
      writeFileSync(
        join(root, helper),
        "throw Error('UNKNOWN_HELPER_EXECUTED');",
      );
    if (mode === 'helper-rebind') {
      const bytes = Buffer.from(
        'export const admitInvoiceCallerSource=()=>true;',
      );
      writeFileSync(join(root, helper), bytes);
      const source = readFileSync(join(root, guard), 'utf8');
      assert.equal(source.split(expected.files[1].proposedSha256).length, 2);
      writeFileSync(
        join(root, guard),
        source.replace(expected.files[1].proposedSha256, hash(bytes)),
      );
    }
    const result = join(root, 'result.json');
    let failed = false;
    try {
      execFileSync(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          guard,
          test,
          ...(includeQualification
            ? [
                'tests/invoice-caller-admission-proposal.test.ts',
                'tests/invoice-checker-qualification-baseline.test.ts',
                'tests/invoice-caller-transition-proposal.test.ts',
              ]
            : []),
          '--reporter=json',
          '--outputFile=' + result,
        ],
        {
          cwd: root,
          env: {
            ...env,
            GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
            GIT_WORK_TREE: root,
          },
          stdio: 'pipe',
          maxBuffer: 12 * 1024 * 1024,
        },
      );
    } catch (error) {
      if (!Number.isInteger(error.status)) throw error;
      failed = true;
    }
    const report = JSON.parse(readFileSync(result, 'utf8'));
    if (mode === 'positive') {
      if (failed) {
        const failures = report.testResults.flatMap((suite) => {
          const cases = suite.assertionResults
            .filter((test) => test.status === 'failed')
            .map((test) => ({
              name: test.fullName,
              messages: test.failureMessages.map((message) =>
                message.slice(0, 1800),
              ),
            }));
          return cases.length
            ? cases
            : suite.status === 'failed'
              ? [
                  {
                    name: suite.name,
                    messages: [String(suite.message).slice(0, 1800)],
                  },
                ]
              : [];
        });
        throw Error(
          'Qualified cases failed: ' +
            JSON.stringify({
              passed: report.numPassedTests,
              failed: report.numFailedTests,
              failures,
            }),
        );
      }
      assert.equal(report.numTotalTests, includeQualification ? 64 : 21);
      assert.equal(report.numPassedTests, includeQualification ? 64 : 21);
      assert.equal(report.numFailedTests, 0);
      assert.equal(report.numPendingTests, 0);
    } else {
      assert(failed, 'Unknown transition evidence must deny');
      const first = report.testResults
        .flatMap((s) => s.assertionResults)
        .find((t) =>
          t.fullName.startsWith('loads historical proposal bytes only beside'),
        );
      assert.equal(
        first?.status,
        'failed',
        'Current transition proof must reject the tampering',
      );
      if (mode === 'helper-mutation')
        assert(
          JSON.stringify(report).includes(
            'Reviewed invoice caller helper required',
          ),
        );
    }
    for (const [path, bytes] of before)
      assert.deepEqual(readFileSync(path), bytes);
    return {
      mode,
      status: mode === 'positive' ? 'PASS' : 'DENIED',
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      canonicalSourceChanged: false,
      admissionAuthorized: false,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
