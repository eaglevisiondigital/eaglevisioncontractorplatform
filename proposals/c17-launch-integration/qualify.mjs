// Five protected files remain UNAPPLIED. Every execution uses disposable source.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = 'proposals/c17-launch-integration';
const base = '892bf5127af2268e6066a20d259a808b5b893cec';
const evidenceHash =
  '22b3fe6c7dc79addd65b631fcd7388988c0a869ac8e87e0f9e18b48ebdf39dcf';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['--no-replace-objects', ...a]);
export async function preflight({
  evidence = readFileSync(directory + '/evidence.json'),
  patch = readFileSync(directory + '/promotion.patch'),
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  assert.equal(
    sha(evidence),
    evidenceHash,
    'Exact finite integration evidence required',
  );
  const record = JSON.parse(evidence);
  assert.equal(record.baseline, base);
  assert.equal(record.protectedPromotionAuthorized, false);
  assert.equal(record.operationalReady, false);
  assert.equal(
    sha(patch),
    record.promotionPatch,
    'Exact five-file promotion patch required',
  );
  const captured = new Map();
  for (const f of record.companions) {
    const info = stat(f.path);
    assert(
      info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o644,
      'Regular finite companion required',
    );
    const bytes = read(f.path);
    assert.equal(sha(bytes), f.sha256, 'Exact finite companion bytes required');
    captured.set(f.path, Buffer.from(bytes));
  }
  const helper = captured.get(directory + '/retained-fixture.mjs');
  const module = await import(
    'data:text/javascript;base64,' + helper.toString('base64')
  );
  module.verifyLineage();
  assert.deepEqual(
    record.files.map((f) => [f.path, f.before, f.after]),
    module.rows,
  );
  const canonicalMode = module.verifyContext(process.cwd(), read, stat);
  // Checks the complete retained static checker dependency closure before import.
  await module.retainedFixture('launch');
  for (const f of record.companions.filter((f) =>
    f.path.startsWith('tests/'),
  )) {
    const old = git('show', base + ':' + f.path),
      current = captured.get(f.path);
    assert.deepEqual(
      current.subarray(current.indexOf('it(')),
      old.subarray(old.indexOf('it(')),
      'All original assertion bodies required',
    );
  }
  return { record, patch, canonicalMode, captured };
}
function run(root, env, args, allowFailure = false) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  assert.equal(r.signal, null, 'Normal bounded test completion required');
  if (allowFailure)
    assert([0, 1].includes(r.status), 'Exact test exit required');
  else assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
  return r;
}
export async function qualify(options = {}) {
  const mode = options.mode ?? 'controls';
  assert(
    [
      'controls',
      'retained',
      'retained-launch',
      'retained-checker',
      'full-c17',
      'historical-timeouts',
    ].includes(mode),
    'Exact finite mode required',
  );
  const { record, patch, canonicalMode, captured } = await preflight(options);
  const root = mkdtempSync(join(tmpdir(), 'propel-c17-launch-'));
  const env = {
    PATH: process.env.PATH,
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_SYSTEM: devNull,
  };
  try {
    execFileSync(
      'git',
      ['clone', '--quiet', '--shared', '--no-checkout', process.cwd(), root],
      { env },
    );
    execFileSync('git', ['checkout', '--quiet', '--detach', base], {
      cwd: root,
      env,
    });
    execFileSync('git', ['apply', '--check', '-'], {
      cwd: root,
      env,
      input: patch,
    });
    execFileSync('git', ['apply', '-'], { cwd: root, env, input: patch });
    assert.deepEqual(
      execFileSync('git', ['diff', '--name-only'], { cwd: root, env })
        .toString()
        .trim()
        .split('\n')
        .concat(
          execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
            cwd: root,
            env,
          })
            .toString()
            .trim()
            .split('\n'),
        )
        .filter(Boolean)
        .sort(),
      record.files.map((f) => f.path).sort(),
      'Only five approved protected endpoint files change',
    );
    for (const f of record.files) {
      const info = lstatSync(join(root, f.path));
      assert(
        info.isFile() &&
          !info.isSymbolicLink() &&
          (info.mode & 0o777) === 0o644,
      );
      assert.equal(sha(readFileSync(join(root, f.path))), f.after);
    }
    for (const f of record.companions) {
      const target = join(root, f.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, captured.get(f.path), { mode: 0o644 });
      assert.equal(sha(readFileSync(target)), f.sha256);
    }
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    run(root, env, ['scripts/check-cycle17-integrity.mjs']);
    let passed;
    if (mode === 'controls') {
      for (const [file, count] of [
        ['tests/v1-c17-inventory-source.test.mjs', 31],
        ['tests/v1-c17-field-closeout-source.test.mjs', 17],
      ]) {
        const r = run(root, env, ['--test', '--test-reporter=tap', file]);
        for (const line of [
          `# tests ${count}`,
          `# pass ${count}`,
          '# fail 0',
          '# skipped 0',
        ])
          assert(r.stdout.split('\n').includes(line), line);
      }
      passed = 48;
    } else if (mode.startsWith('retained')) {
      const files =
        mode === 'retained-launch'
          ? ['tests/c17-current-launch-preparation.test.ts']
          : mode === 'retained-checker'
            ? ['tests/c17-current-checker-proposal.test.ts']
            : [
                'tests/c17-current-launch-preparation.test.ts',
                'tests/c17-current-checker-proposal.test.ts',
              ];
      const count =
        mode === 'retained-launch' ? 5 : mode === 'retained-checker' ? 2 : 7;
      const out = join(root, 'retained-results.json');
      run(root, env, [
        'node_modules/vitest/vitest.mjs',
        'run',
        ...files,
        '--configLoader',
        'runner',
        '--maxWorkers=1',
        '--reporter=json',
        '--outputFile=' + out,
      ]);
      const r = JSON.parse(readFileSync(out));
      assert.equal(r.numPassedTests, count);
      assert.equal(r.numFailedTests, 0);
      assert.equal(r.numPendingTests, 0);
      passed = count;
    } else {
      const out = join(root, 'source-results.json');
      const files =
        mode === 'full-c17'
          ? ['tests/cycle17-integration.test.ts']
          : [
              'tests/cycle18-independent-integration-review.test.ts',
              'tests/cycle33-owner-refresh-access-continuity.test.ts',
              'tests/cycle33-v1-finance-owner-integration.test.ts',
            ];
      const args = [
        'node_modules/vitest/vitest.mjs',
        'run',
        ...files,
        '--configLoader',
        'runner',
        '--maxWorkers=1',
        '--reporter=json',
        '--outputFile=' + out,
      ];
      if (mode === 'historical-timeouts')
        args.push(
          '-t',
          'finance: invoked (callback lease|source admission) drift|brand 0: copied handles, another job|same-property other jobs, copied handles and another company|brand 2: exact recorded material and approved unposted time|brand 2: later canonical forecast',
        );
      run(root, env, args, mode === 'historical-timeouts');
      const r = JSON.parse(readFileSync(out));
      if (mode === 'historical-timeouts' && r.numFailedTests) {
        const cases = r.testResults
          .flatMap((s) => s.assertionResults)
          .filter((t) => t.status === 'failed')
          .map((t) => ({
            name: t.fullName,
            duration: t.duration,
            messages: t.failureMessages,
          }));
        throw Error(
          'Original budget diagnostics: ' +
            JSON.stringify({
              passed: r.numPassedTests,
              failed: r.numFailedTests,
              cases,
            }),
        );
      }
      assert.equal(r.numFailedTests, 0);
      assert.equal(r.numPassedTests, mode === 'full-c17' ? 45 : 8);
      if (mode === 'full-c17') assert.equal(r.numPendingTests, 0);
      passed = r.numPassedTests;
    }
    for (const f of record.files)
      assert.equal(sha(readFileSync(join(root, f.path))), f.after);
    const after = await preflight(options);
    assert.equal(
      after.canonicalMode,
      canonicalMode,
      'No source mode change during qualification',
    );
    return {
      mode,
      passed,
      failed: 0,
      canonicalMode,
      canonicalChanged: false,
      protectedPromotionAuthorized: false,
      operationalReady: false,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(process.argv.length <= 3, 'One finite mode required');
  console.log(
    JSON.stringify(await qualify({ mode: process.argv[2] ?? 'controls' })),
  );
}
