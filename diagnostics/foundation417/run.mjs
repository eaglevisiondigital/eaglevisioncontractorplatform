// Explicit local diagnostic: no default tests, DB, provider calls or source mutation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeProfile } from './profile.mjs';
export const source = '394d7fc1bbc6d6a27440e881bc3e9bf3d76befa6';
export const scenarios = ['c25-concurrent', 'c28-sibling'];
const hash = (b) => createHash('sha256').update(b).digest('hex');
const environment = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export function validateScenario(value) {
  assert(
    scenarios.includes(value),
    'Exact bounded diagnostic scenario required',
  );
  return value;
}
export function run(scenario) {
  validateScenario(scenario);
  const fixture = readFileSync('diagnostics/foundation417/scenario.fixture.ts');
  const root = mkdtempSync(join(tmpdir(), 'propel-foundation417-trace-'));
  const before = {};
  const paths = [
    'src/lib/workflows/operating-center-runtime.ts',
    'src/lib/workflows/service-request-actions.ts',
    'src/lib/workflows/service-source-review.ts',
    'src/lib/workflows/saved-revision-exercise.ts',
    'src/lib/phase3.ts',
    'src/lib/property.ts',
    'src/lib/operations.ts',
    'tests/cycle25-service-evidence-continuity.test.ts',
    'tests/cycle28-request-provenance.test.ts',
    'vite.config.ts',
    'package.json',
    'package-lock.json',
  ];
  for (const path of paths) {
    before[path] = readFileSync(path);
    assert.deepEqual(
      before[path],
      git('show', source + ':' + path),
      'Exact original diagnostic source required',
    );
  }
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, source);
    execFileSync('tar', ['-xf', archive, '-C', root], { env: environment });
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    writeFileSync(
      join(root, 'tests/foundation417-phase-profile.test.ts'),
      fixture,
    );
    const output = join(root, 'profile.json'),
      reportPath = join(root, 'result.json');
    const childEnv = {
      ...environment,
      GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
      GIT_WORK_TREE: root,
      PROPEL_DIAG_CASE: scenario,
      PROPEL_DIAG_OUTPUT: output,
    };
    execFileSync(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        'tests/foundation417-phase-profile.test.ts',
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
        maxBuffer: 2 * 1024 * 1024,
        timeout: 45000,
        killSignal: 'SIGKILL',
      },
    );
    const result = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(result.numPassedTests, 1);
    assert.equal(result.numFailedTests, 0);
    assert.equal(result.numPendingTests, 0);
    const observed = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(observed.scenario, scenario);
    return {
      classification: 'LOCAL_INSTRUMENTED_EXACT_SOURCE_TRACE',
      source,
      scenario,
      fixtureSha256: hash(fixture),
      sourceHashes: Object.fromEntries(paths.map((p) => [p, hash(before[p])])),
      node: process.version,
      passed: 1,
      failed: 0,
      skipped: 0,
      budgetMs: 30000,
      outerWallLimitMs: 45000,
      maxWorkers: 1,
      phases: observed.phases,
      counters: observed.counters,
      profile: summarizeProfile(observed.profile),
      limits: [
        'Instrumentation wraps only exported capture/check calls; intra-module calls are not counted.',
        'CPU profile inclusive sampled times overlap and cannot be added.',
        'One selected local worker is not hosted shard concurrency or proof of Ubuntu timeout cause.',
        'No #387/#389/#391 optimization or admission is applied; all protected bytes remain original.',
        'No source/authority cache, DB, provider, credential or release activity.',
      ],
    };
  } finally {
    for (const p of paths) assert.deepEqual(readFileSync(p), before[p]);
    rmSync(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(run(process.argv[2]), null, 2));
