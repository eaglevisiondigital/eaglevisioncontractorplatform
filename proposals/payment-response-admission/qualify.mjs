// Offline qualification only. Applies patch to a disposable archive, never this tree.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  lstatSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const expected = {
  classification: 'UNAPPLIED_FINITE_PAYMENT_RESPONSE_ADMISSION',
  parent: '276fbe4357a5ccc3593374e4cd359a10e8ae1bf6',
  sourceAuthor: '96b654ee16c229653cb1c046c579af77573b045a',
  sourceParent: '892bf5127af2268e6066a20d259a808b5b893cec',
  sourcePatchSha256:
    '148b8ec3fac6919ebe9cc237cdf1dac971cff4e54d5c9762262934a3d9335d9d',
  patchSha256:
    '2b6a428e1d93fcebf4f3277581ee48652fcaa7860db0a2d6cf397f2d3cf358b6',
  files: [
    {
      path: 'proposals/invoice-caller-transition/qualify.mjs',
      beforeSha256:
        'f3d39097db9eeef99b177149e0bbcdfb56d3646f90edd85f26f1890ed456c410',
      proposedSha256:
        '1c102cb6982ab1042e93a5d6454e765fb9a37cf5b930d1226465ccf2a5756a1d',
    },
    {
      path: 'proposals/invoice-checker-qualification/baseline.mjs',
      beforeSha256:
        '0d0c05afad3a034c2760203b3615c8a675e3ba38cb7536802e1f6ae3acfef47d',
      proposedSha256:
        'c27591939af63a33312e6293ebd90469eac202b0a0237275338fb0be08e012ad',
    },
    {
      path: 'proposals/payment-response-admission/fixture-adapter.mjs',
      beforeSha256: null,
      proposedSha256:
        '4ccab151297b44da76057199cb3cabfcd2c73c3e20ed6761c27737db16468203',
    },
    {
      path: 'scripts/check-payment-ack-admission.mjs',
      beforeSha256:
        '56ef1c979baeb9645ffbf256cc10d7a8cf2904fdaedbe66f9707979b985480a0',
      proposedSha256:
        'b936bbd53def10eb7604b840ebe56262073001f30f0191247307eb54940a67ad',
    },
    {
      path: 'scripts/invoice-caller-source-admission.mjs',
      beforeSha256:
        '2a6ffb692443a7830df021e9a8cce048ac4388947e03a27af4286b4e26ee9a25',
      proposedSha256:
        'af67c7836222779cd8322c08b3d5a72816760abc345a9d45cab97f85beacd133',
    },
    {
      path: 'scripts/payment-response-source-admission.mjs',
      beforeSha256: null,
      proposedSha256:
        'aa8871b0fa334bfd2ffdb36c314650e51e56ceea41a983e13c0b42a60084dfcd',
    },
    {
      path: 'tests/invoice-caller-migration-source.test.ts',
      beforeSha256:
        '4879c0b0f3da8bc2e5d981faae43fe443c317ffcd400b654fc550f0605149a08',
      proposedSha256:
        '6b803d33d5c8b9ca02abcbce59b8796f9691b44a82c97290974ea9a4a2892d69',
    },
    {
      path: 'tests/launch-invoice-payment-source.test.ts',
      beforeSha256:
        '9ed3efe744bdb9003d3d8459e62dd5fe9479475768df6cb58dc4d8257ef37b00',
      proposedSha256:
        'bf366bff56157c0b94c174c91d8a9fbc76cb95e836d9387a2d61104e44fc873a',
    },
  ],
  canonicalSourceChanged: false,
  admissionAuthorized: false,
  release: 'NOT_READY_NOT_AUTHORIZED',
};
const directory = 'proposals/payment-response-admission';
const negativeHash =
  'a9857464716feb8deb7e63d0592dd6a99bb5f21b919825faa8bf5b0207abeace';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const baseEnv = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env: baseEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const regular = (p) => {
  let prefix = '';
  for (const segment of p.split('/')) {
    prefix = prefix ? prefix + '/' + segment : segment;
    assert(!lstatSync(prefix).isSymbolicLink(), 'No symbolic source path');
  }
  assert(lstatSync(p).isFile(), 'Exact regular file required');
  return readFileSync(p);
};
const livePaths = expected.files.filter((f) => f.beforeSha256 !== null);
export function qualify({
  mode = 'positive',
  patch = regular(directory + '/admission.patch'),
  evidence = JSON.parse(regular(directory + '/evidence.json')),
} = {}) {
  assert.deepEqual(
    evidence,
    expected,
    'Exact finite admission record required',
  );
  assert.equal(
    hash(patch),
    expected.patchSha256,
    'Exact finite admission patch required',
  );
  assert(
    [
      'positive',
      'all',
      'ack',
      'fixture',
      'combined',
      'negatives',
      'unknown-adapter',
      'coordinated-fixture-rebind',
      'unknown-helper',
      'coordinated-rebind',
      'unknown-G',
      'unknown-F',
      'unknown-H',
      'unknown-decoder',
      'symlink-helper',
    ].includes(mode),
  );
  const untouched = livePaths.map((f) => [f.path, regular(f.path)]);
  for (const f of expected.files) {
    if (f.beforeSha256 === null) {
      assert.equal(
        git('ls-tree', expected.parent, '--', f.path).toString().trim(),
        '',
      );
      assert.throws(() => lstatSync(f.path), { code: 'ENOENT' });
    } else {
      assert.equal(hash(regular(f.path)), f.beforeSha256);
      assert.equal(
        hash(git('show', expected.parent + ':' + f.path)),
        f.beforeSha256,
      );
    }
  }
  assert.equal(
    hash(
      git(
        'show',
        'a580c47dc0ca029560bc869cd23f39c6b810b9a7:proposals/payment-response-integrity/correction.patch',
      ),
    ),
    expected.sourcePatchSha256,
    'Exact approved source patch required',
  );
  const negative = regular(directory + '/negative.fixture.mjs');
  assert.equal(hash(negative), negativeHash);
  const root = mkdtempSync(join(tmpdir(), 'propel-payment-admission-'));
  const env = { ...baseEnv, GIT_CEILING_DIRECTORIES: root };
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, expected.parent);
    execFileSync('tar', ['-xf', archive, '-C', root], { env });
    execFileSync('git', ['apply', '-'], {
      cwd: root,
      env,
      input: patch,
      stdio: 'pipe',
    });
    const sourcePaths = [
      'server/payments/refunds.ts',
      'server/payments/response-json.ts',
      'server/payments/sandbox.ts',
    ];
    for (const p of sourcePaths)
      writeFileSync(
        join(root, p),
        git('show', expected.sourceAuthor + ':' + p),
        { mode: 0o644 },
      );
    const fixedSources = Object.fromEntries(
      sourcePaths.map((p) => [p, hash(readFileSync(join(root, p)))]),
    );
    assert.deepEqual(Object.values(fixedSources), [
      '267912113acc418387beb86826b06c2689bac9f9a00589a0cd5fc6df1aa4158e',
      '3d361bd32f9cc2ff82b9d4c1ad29ca0218199c11bc903a59ec5a644dd139c970',
      '828b355608e2fee5433dc2c29c3094e40c92c444409331e1b67183ed09e19feb',
    ]);
    function preImport() {
      for (const f of expected.files) {
        const p = join(root, f.path);
        assert(lstatSync(p).isFile() && !lstatSync(p).isSymbolicLink());
        assert.equal(lstatSync(p).mode & 0o777, 0o644);
        assert.equal(
          hash(readFileSync(p)),
          f.proposedSha256,
          'Reviewed candidate required before import',
        );
      }
      for (const [p, digest] of Object.entries(fixedSources))
        assert.equal(
          hash(readFileSync(join(root, p))),
          digest,
          'Exact runtime source before import',
        );
    }
    preImport();
    const module = join(root, 'scripts/payment-response-source-admission.mjs');
    if (mode === 'unknown-helper' || mode === 'coordinated-rebind') {
      const changed = Buffer.from("throw Error('UNREVIEWED_HELPER_EXECUTED');");
      writeFileSync(module, changed);
      if (mode === 'coordinated-rebind')
        for (const p of [
          'tests/launch-invoice-payment-source.test.ts',
          'scripts/check-payment-ack-admission.mjs',
        ]) {
          const f = join(root, p);
          writeFileSync(
            f,
            readFileSync(f, 'utf8').replace(
              expected.files.find(
                (x) =>
                  x.path === 'scripts/payment-response-source-admission.mjs',
              ).proposedSha256,
              hash(changed),
            ),
          );
        }
    }
    for (const [m, p] of Object.entries({
      'unknown-G': 'tests/launch-invoice-payment-source.test.ts',
      'unknown-F': 'tests/invoice-caller-migration-source.test.ts',
      'unknown-H': 'scripts/invoice-caller-source-admission.mjs',
      'unknown-decoder': 'server/payments/response-json.ts',
    }))
      if (mode === m) writeFileSync(join(root, p), Buffer.from('UNKNOWN'));
    if (mode === 'unknown-adapter' || mode === 'coordinated-fixture-rebind') {
      const p = join(
        root,
        'proposals/payment-response-admission/fixture-adapter.mjs',
      );
      const changed = Buffer.from("throw Error('UNKNOWN_ADAPTER_EXECUTED');");
      writeFileSync(p, changed);
      if (mode === 'coordinated-fixture-rebind')
        for (const loader of [
          'proposals/invoice-checker-qualification/baseline.mjs',
          'proposals/invoice-caller-transition/qualify.mjs',
        ]) {
          const f = join(root, loader);
          writeFileSync(
            f,
            readFileSync(f, 'utf8').replace(
              expected.files.find(
                (x) =>
                  x.path ===
                  'proposals/payment-response-admission/fixture-adapter.mjs',
              ).proposedSha256,
              hash(changed),
            ),
          );
        }
    }
    if (mode === 'symlink-helper') {
      rmSync(module);
      symlinkSync(
        join(root, 'scripts/check-payment-ack-admission.mjs'),
        module,
      );
    }
    if (
      !['positive', 'all', 'ack', 'fixture', 'combined', 'negatives'].includes(
        mode,
      )
    ) {
      assert.throws(preImport);
      return {
        mode,
        status: 'DENIED_BEFORE_IMPORT',
        canonicalSourceChanged: false,
      };
    }
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    const childEnv = {
      ...env,
      GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
      GIT_WORK_TREE: root,
    };
    if (mode === 'negatives') {
      const dest = join(root, directory, 'negative.fixture.mjs');
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, negative);
      const output = execFileSync(
        process.execPath,
        ['--test', '--test-reporter=tap', dest],
        { cwd: root, env: childEnv, stdio: 'pipe' },
      ).toString();
      assert.match(output, /# pass 25/);
      assert.match(output, /# fail 0/);
      return { mode, status: 'PASS', cases: 25, canonicalSourceChanged: false };
    }
    const reportPath = join(root, 'report.json');
    let failure;
    try {
      execFileSync(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          ...(mode === 'ack'
            ? ['tests/payment-ack-source-admission.test.ts']
            : mode === 'fixture'
              ? ['tests/invoice-caller-migration-source.test.ts']
              : mode === 'combined'
                ? ['tests/launch-invoice-payment-source.test.ts']
                : [
                    'tests/payment-ack-source-admission.test.ts',
                    'tests/invoice-caller-migration-source.test.ts',
                    'tests/launch-invoice-payment-source.test.ts',
                  ]),
          ...(mode === 'all'
            ? [
                'tests/invoice-caller-admission-proposal.test.ts',
                'tests/invoice-checker-qualification-baseline.test.ts',
                'tests/invoice-caller-transition-proposal.test.ts',
              ]
            : []),
          '--configLoader',
          'runner',
          '--maxWorkers=1',
          '--reporter=json',
          '--outputFile=' + reportPath,
        ],
        {
          cwd: root,
          env: childEnv,
          stdio: 'pipe',
          maxBuffer: 12 * 1024 * 1024,
        },
      );
    } catch (e) {
      failure = e;
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    if (failure)
      throw Error(
        'Source qualification failed: ' +
          JSON.stringify(
            report.testResults.flatMap((s) =>
              s.assertionResults
                .filter((t) => t.status === 'failed')
                .map((t) => ({
                  name: t.fullName,
                  message: t.failureMessages.map((v) => v.slice(0, 1000)),
                })),
            ),
          ),
      );
    const count =
      mode === 'all'
        ? 80
        : mode === 'ack'
          ? 16
          : mode === 'fixture'
            ? 13
            : mode === 'combined'
              ? 8
              : 37;
    assert.equal(report.numTotalTests, count);
    assert.equal(report.numPassedTests, count);
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
    const cli = JSON.parse(
      execFileSync(
        process.execPath,
        ['scripts/check-payment-ack-admission.mjs'],
        { cwd: root, env: childEnv, stdio: 'pipe' },
      ),
    );
    assert.equal(cli.classification, 'DEVELOPMENT_SOURCE_ONLY');
    assert.equal(cli.operationalAcceptance, 'NOT_RUN');
    return {
      mode,
      status: 'PASS',
      cases: count,
      cli: 'PASS',
      canonicalSourceChanged: false,
      admissionAuthorized: false,
    };
  } finally {
    for (const [p, b] of untouched) assert.deepEqual(regular(p), b);
    rmSync(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(qualify({ mode: process.argv[2] ?? 'positive' })));
