// Only the ten exact original #424 hosted timeout cases; natural inputs and budgets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, devNull } from 'node:os';
import { pathToFileURL } from 'node:url';
import { verifyInputs, currentContext, classifyFrame } from './qualify.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const environment = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export function targetCases(
  bytes = readFileSync('proposals/performance424-context/hosted-ten.json'),
) {
  assert.equal(
    hash(bytes),
    'eb1e789835253c3369eb89ee27ed776d3a9611f863c0f81a3d377fe1ef961e8b',
    'Exact captured hosted ten required',
  );
  const target = JSON.parse(bytes);
  assert.equal(target.source, currentContext.context);
  assert.equal(target.run, 43498092270);
  assert.equal(target.originalTimeoutMs, 30000);
  assert.equal(target.failures.length, 10);
  return target;
}
export function regressionPlan() {
  const target = targetCases();
  const expected = target.failures.map((t) =>
    [t.describe, t.title].filter(Boolean).join(' '),
  );
  assert.equal(new Set(expected).size, 10);
  const files = [...new Set(target.failures.map((t) => t.file))];
  const pattern =
    '^(?:' +
    target.failures
      .map((t) => [t.describe, t.title].filter(Boolean).join(' > '))
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
    ')$';

  return { expected, files, pattern };
}
export function regress() {
  const target = targetCases(),
    reviewed = verifyInputs(),
    frame = classifyFrame();
  const { expected, files, pattern } = regressionPlan();
  const sourceHashes = Object.fromEntries(
    files.map((p) => [p, hash(git('show', currentContext.context + ':' + p))]),
  );
  const root = mkdtempSync(join(tmpdir(), 'propel-performance424-ten-'));
  try {
    const archive = join(root, 'source.tar');
    git('archive', '--format=tar', '--output', archive, currentContext.context);
    execFileSync('tar', ['-xf', archive, '-C', root], { env: environment });
    writeFileSync(
      join(root, currentContext.optimizationPath),
      reviewed.authored,
    );
    for (const name of ['helper', 'cycle9', 'cycle24'])
      execFileSync('git', ['apply', '-'], {
        cwd: root,
        env: environment,
        input: reviewed.patches[name],
        stdio: 'pipe',
      });
    for (const p of files)
      assert.equal(hash(readFileSync(join(root, p))), sourceHashes[p]);
    const configHash = hash(
      git('show', currentContext.context + ':vite.config.ts'),
    );
    assert.equal(hash(readFileSync(join(root, 'vite.config.ts'))), configHash);
    symlinkSync(
      realpathSync('node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    const output = join(root, 'report.json');
    const env = {
      ...environment,
      GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
      GIT_WORK_TREE: root,
    };
    let error;
    try {
      execFileSync(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          ...files,
          '-t',
          pattern,
          '--configLoader',
          'runner',
          '--reporter=json',
          '--outputFile=' + output,
        ],
        {
          cwd: root,
          env,
          stdio: 'pipe',
          maxBuffer: 2 * 1024 * 1024,
          timeout: 180000,
          killSignal: 'SIGKILL',
        },
      );
    } catch (e) {
      error = e;
    }
    const report = JSON.parse(readFileSync(output, 'utf8'));
    const cases = report.testResults
      .flatMap((s) => s.assertionResults)
      .filter((t) => t.status !== 'pending');
    const active = cases.filter(
      (t) => t.status === 'passed' || t.status === 'failed',
    );
    assert.deepEqual(
      active.map((t) => t.fullName).sort(),
      expected.toSorted(),
      'Exact ten original cases required',
    );
    const outcome = {
      context: currentContext.context,
      sourceAuthor: currentContext.optimizationAuthor,
      hostedRun: target.run,
      targetSha256: hash(
        readFileSync('proposals/performance424-context/hosted-ten.json'),
      ),
      sourceHashes,
      configHash,
      noAddedClockOrUUIDControl: true,
      maxWorkers: 'ORIGINAL_CONFIG_4',
      originalTestAndHookBudgetMs: 30000,
      subprocessGroupWallMs: 180000,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      filteredOrDeclaredSkipped: report.numPendingTests,
      cases: active.map((t) => ({
        name: t.fullName,
        status: t.status,
        durationMs: t.duration,
        error:
          t.status === 'failed'
            ? t.failureMessages.map((m) => m.slice(0, 1000))
            : undefined,
      })),
      canonicalChanges: false,
      hostedCauseOrClosure: false,
    };
    if (error || report.numFailedTests || report.numPassedTests !== 10)
      throw Error(
        'Exact natural-input regression FAILED: ' + JSON.stringify(outcome),
      );
    return outcome;
  } finally {
    try {
      const terminal = classifyFrame();
      assert.equal(terminal.kind, frame.kind);
      for (const [p, b] of frame.snapshots)
        assert.deepEqual(terminal.snapshots.get(p), b);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(regress(), null, 2));
