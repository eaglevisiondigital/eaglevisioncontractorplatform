// Source qualification only: canonical protected files are never written.
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
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = 'proposals/payment-launch-integration';
const baseline = '394d7fc1bbc6d6a27440e881bc3e9bf3d76befa6';
const sourceAuthor = '96b654ee16c229653cb1c046c579af77573b045a';
const admissionAuthor = '323c7b6b1b5f7d5c1eb83421adedcbef291bb770';
const evidenceHash =
  '1fbae26d0f6783d3f7126f85e145ef2c06bb6fe7055a76d2ba37be75591bb281';
const patchHash =
  '35dca7d772e9db104a5e2ee4b6de6d7a3438d519eabe1e113f44c55dcb755bbc';
const negativeHash =
  'a9857464716feb8deb7e63d0592dd6a99bb5f21b919825faa8bf5b0207abeace';
const env = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 12 * 1024 * 1024,
  });
function regular(path, read = readFileSync, stat = lstatSync) {
  let prefix = '';
  for (const part of resolve(path).split('/').filter(Boolean)) {
    prefix += '/' + part;
    assert(!stat(prefix).isSymbolicLink(), 'No symbolic source path');
  }
  const info = stat(path);
  assert(
    info.isFile() && (info.mode & 0o777) === 0o644,
    'Exact regular source mode required',
  );
  return read(path);
}
const delta = (commit) =>
  git(
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '--no-renames',
    '-r',
    commit,
  )
    .toString()
    .trim()
    .split('\n')
    .sort();
export function preflight({
  evidence = regular(directory + '/evidence.json'),
  patch = regular(directory + '/integration.patch'),
  read = readFileSync,
  stat = lstatSync,
  root,
} = {}) {
  assert.equal(
    sha(evidence),
    evidenceHash,
    'Exact integration evidence required',
  );
  assert.equal(
    sha(patch),
    patchHash,
    'Exact thirteen-file integration patch required',
  );
  const record = JSON.parse(evidence);
  assert.equal(record.baseline, baseline);
  assert.equal(record.admissionAuthor, admissionAuthor);
  assert.equal(record.protectedPromotionAuthorized, false);
  assert.equal(record.operationalReady, false);
  assert.equal(
    git('show', '-s', '--format=%P', baseline).toString().trim(),
    '276fbe4357a5ccc3593374e4cd359a10e8ae1bf6',
  );
  assert.equal(
    git('show', '-s', '--format=%P', admissionAuthor).toString().trim(),
    sourceAuthor,
  );
  assert.equal(
    git('show', '-s', '--format=%P', sourceAuthor).toString().trim(),
    '892bf5127af2268e6066a20d259a808b5b893cec',
  );
  assert.deepEqual(
    [...delta(sourceAuthor), ...delta(admissionAuthor)].sort(),
    record.files.map((f) => f.path),
  );
  assert.equal(
    sha(
      git(
        'show',
        'a580c47dc0ca029560bc869cd23f39c6b810b9a7:proposals/payment-response-integrity/correction.patch',
      ),
    ),
    record.sourcePatchSha256,
  );
  assert.equal(
    sha(
      git(
        'show',
        'df39638b99c1683e23de6f4a8433e6eb25cd4bb2:proposals/payment-response-admission/admission.patch',
      ),
    ),
    record.admissionPatchSha256,
  );
  for (const f of record.files) {
    const original = git('ls-tree', baseline, '--', f.path).toString().trim();
    if (f.before === null) {
      assert.equal(original, '');
    } else {
      assert.equal(original.split(' ')[0], '100644');
      assert.equal(sha(git('show', baseline + ':' + f.path)), f.before);
    }
    assert.equal(
      git('ls-tree', admissionAuthor, '--', f.path).toString().split(' ')[0],
      '100644',
    );
    assert.equal(sha(git('show', admissionAuthor + ':' + f.path)), f.after);
  }
  for (const f of record.companions) {
    if (f.before === null) {
      assert.equal(git('ls-tree', baseline, '--', f.path).length, 0);
    } else {
      assert.equal(sha(git('show', baseline + ':' + f.path)), f.before);
    }
  }
  assert.equal(
    sha(
      git(
        'show',
        'df39638b99c1683e23de6f4a8433e6eb25cd4bb2:proposals/payment-response-admission/negative.fixture.mjs',
      ),
    ),
    negativeHash,
  );
  const targets = [...record.files, ...record.companions];
  const observe = () =>
    targets.map((f) => {
      try {
        return sha(regular(root ? join(root, f.path) : f.path, read, stat));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    });
  const seen = observe();
  const before = targets.every((f, i) => f.before === seen[i]);
  const after = targets.every((f, i) => f.after === seen[i]);
  assert(
    before || after,
    'Exact complete before or integrated payment bundle required',
  );
  assert.deepEqual(
    observe(),
    seen,
    'Fresh stable complete payment context required',
  );
  return { record, patch, canonicalMode: before ? 'before' : 'integrated' };
}
function child(root, args) {
  return execFileSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 12 * 1024 * 1024,
  }).toString();
}
export function verifyCandidate(
  root,
  record,
  { read = readFileSync, stat = lstatSync } = {},
) {
  assert.equal(
    sha(Buffer.from(JSON.stringify(record, null, 2) + '\n')),
    evidenceHash,
    'Exact candidate record required',
  );
  const targets = [...record.files, ...record.companions];
  const expected = targets.map((f) => f.path).sort();
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', baseline],
    { cwd: root, env },
  )
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  const added = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd: root, env },
  )
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.deepEqual(
    [...changed, ...added].sort(),
    expected,
    'Only thirteen exact source changes permitted',
  );
  for (const f of targets)
    assert.equal(
      sha(regular(join(root, f.path), read, stat)),
      f.after,
      'Exact candidate before execution required',
    );
  // A later read may withdraw an earlier endpoint. Recheck the entire finite tuple.
  for (const f of targets)
    assert.equal(
      sha(regular(join(root, f.path), read, stat)),
      f.after,
      'Fresh complete candidate required',
    );
  // Verify every other tracked byte against the original launch, not a rebound manifest.
  assert.equal(
    execFileSync(
      'git',
      [
        'diff',
        '--name-only',
        '--no-renames',
        baseline,
        '--',
        ...targets.map((f) => ':(exclude)' + f.path),
      ],
      { cwd: root, env },
    )
      .toString()
      .trim(),
    '',
    'All unrelated launch source must remain unchanged',
  );
  return true;
}
export function withCandidate(callback, options = {}) {
  const { record, patch, canonicalMode } = preflight(options);
  const root = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-payment-launch-'),
  );
  try {
    execFileSync(
      'git',
      ['clone', '--quiet', '--shared', '--no-checkout', process.cwd(), root],
      { env },
    );
    execFileSync('git', ['checkout', '--quiet', '--detach', baseline], {
      cwd: root,
      env,
    });
    execFileSync('git', ['apply', '--check', '-'], {
      cwd: root,
      env,
      input: patch,
    });
    execFileSync('git', ['apply', '-'], { cwd: root, env, input: patch });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    verifyCandidate(root, record);
    const result = callback(root, record);
    verifyCandidate(root, record);
    assert.equal(
      preflight(options).canonicalMode,
      canonicalMode,
      'Stable exact canonical mode required',
    );
    return result;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
export function qualify({ mode = 'guards', ...options } = {}) {
  assert(
    ['guards', 'source', 'c17', 'negatives', 'payments'].includes(mode),
    'Finite integration mode required',
  );
  return withCandidate((root, record) => {
    let cases = 0;
    verifyCandidate(root, record);
    const ack = JSON.parse(
      child(root, ['scripts/check-payment-ack-admission.mjs']),
    );
    assert.equal(ack.classification, 'DEVELOPMENT_SOURCE_ONLY');
    assert.equal(ack.operationalAcceptance, 'NOT_RUN');
    child(root, ['scripts/check-cycle17-integrity.mjs']);
    if (mode === 'negatives') {
      // Run the exact reviewed25 controls at their original relative import location.
      const file = join(
        root,
        'proposals/payment-response-admission/negative.fixture.mjs',
      );
      try {
        writeFileSync(
          file,
          git(
            'show',
            'df39638b99c1683e23de6f4a8433e6eb25cd4bb2:proposals/payment-response-admission/negative.fixture.mjs',
          ),
          {
            mode: 0o644,
            flag: 'wx',
          },
        );
        const out = child(root, ['--test', '--test-reporter=tap', file]);
        assert.match(out, /# pass 25/);
        assert.match(out, /# fail 0/);
        assert.match(out, /# skipped 0/);
        cases = 25;
      } finally {
        rmSync(file, { force: true });
      }
    }
    if (['source', 'c17', 'payments'].includes(mode)) {
      const files =
        mode === 'payments'
          ? [
              'tests/launch-caller-payment-integration.test.ts',
              'tests/payments-outcome-ack.test.ts',
              'tests/payments-refunds.test.ts',
              'tests/payment-token-reference.test.ts',
              'tests/payments-webhook-ack.test.ts',
              'tests/provider-webhooks.test.ts',
              'tests/payments-sandbox.test.ts',
              'tests/payments-webhook-composition.test.ts',
            ]
          : mode === 'source'
            ? [
                'tests/payment-ack-source-admission.test.ts',
                'tests/invoice-caller-migration-source.test.ts',
                'tests/launch-invoice-payment-source.test.ts',
                'tests/invoice-caller-admission-proposal.test.ts',
                'tests/invoice-checker-qualification-baseline.test.ts',
                'tests/invoice-caller-transition-proposal.test.ts',
              ]
            : [
                'tests/cycle33-c17-closeout-source-admission.test.ts',
                'tests/c17-current-closeout-consumer.test.ts',
              ];
      const report = join(
        tmpdir(),
        'propel-payment-integration-' + process.pid + '.json',
      );
      try {
        child(root, [
          'node_modules/vitest/vitest.mjs',
          'run',
          ...files,
          '--configLoader',
          'runner',
          '--maxWorkers=1',
          '--reporter=json',
          '--outputFile=' + report,
        ]);
        const r = JSON.parse(readFileSync(report));
        cases = mode === 'payments' ? 139 : mode === 'source' ? 80 : 33;
        assert.equal(r.numTotalTests, cases);
        assert.equal(r.numPassedTests, cases);
        assert.equal(r.numFailedTests, 0);
        assert.equal(r.numPendingTests, 0);
      } finally {
        rmSync(report, { force: true });
      }
    }
    return {
      mode,
      status: 'PASS',
      cases,
      ack: 'PASS',
      c17: 'PASS',
      canonicalSourceChanged: false,
      protectedPromotionAuthorized: false,
      operationalReady: false,
    };
  }, options);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(qualify({ mode: process.argv[2] ?? 'guards' })));
