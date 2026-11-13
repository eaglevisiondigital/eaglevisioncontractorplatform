// Two fixed original case titles, controlled synthetic inputs, no canonical edits.
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
  lstatSync,
} from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyInputs, currentContext, classifyFrame } from './qualify.mjs';
const cases = {
  'c25-concurrent': {
    path: 'tests/cycle25-service-evidence-continuity.test.ts',
    title:
      'brand 2: concurrent read-only report actions share original state and never consume request attempt',
    total: 31,
  },
  'c28-sibling': {
    path: 'tests/cycle28-request-provenance.test.ts',
    title:
      'brand 0: a real same-property sibling job report cannot substitute for the original issued-job report',
    total: 19,
  },
};
const envBase = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_GLOBAL: devNull,
};
const git = (...a) =>
  execFileSync('git', ['--no-replace-objects', ...a], {
    env: envBase,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const hash = (b) => createHash('sha256').update(b).digest('hex');
export function selectCase(name) {
  assert(
    typeof name === 'string' && Object.hasOwn(cases, name),
    'Exact one of two measurement cases required',
  );
  return cases[name];
}
export function verifyMeasurementSetup({
  read = readFileSync,
  stat = lstatSync,
} = {}) {
  const path = 'proposals/performance424-context/inputs.fixture.ts';
  let prefix = '';
  for (const part of path.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    assert(
      !stat(prefix).isSymbolicLink(),
      'Reviewed measurement setup required',
    );
  }
  const info = stat(path);
  assert(
    info.isFile() && (info.mode & 0o777) === 0o644,
    'Reviewed measurement setup required',
  );
  const bytes = Buffer.from(read(path));
  assert.equal(
    hash(bytes),
    'aa0ffd16effa462d57db44179589cc5ec59d7ea0e6d6675124b930dbc338d599',
    'Reviewed measurement setup required',
  );
  return bytes;
}
export function measure(name) {
  const sourceFrame = classifyFrame();
  const selected = selectCase(name),
    reviewed = verifyInputs(),
    setup = verifyMeasurementSetup();
  const originalCase = git(
    'show',
    currentContext.context + ':' + selected.path,
  );
  assert.deepEqual(readFileSync(selected.path), originalCase);
  const config = Buffer.from(
    "import base from './vite.config';\nexport default {...base,test:{...base.test,setupFiles:['./tests/performance424-inputs.setup.ts']}};\n",
  );
  const reports = [];
  for (const variant of ['before', 'after']) {
    const root = mkdtempSync(join(tmpdir(), 'propel-performance424-measure-'));
    try {
      const archive = join(root, 'source.tar');
      git(
        'archive',
        '--format=tar',
        '--output',
        archive,
        currentContext.context,
      );
      execFileSync('tar', ['-xf', archive, '-C', root], { env: envBase });
      if (variant === 'after') {
        writeFileSync(
          join(root, currentContext.optimizationPath),
          reviewed.authored,
        );
        for (const p of ['helper', 'cycle9', 'cycle24'])
          execFileSync('git', ['apply', '-'], {
            cwd: root,
            env: envBase,
            input: reviewed.patches[p],
            stdio: 'pipe',
          });
      }
      assert.equal(
        hash(readFileSync(join(root, currentContext.optimizationPath))),
        variant === 'before'
          ? currentContext.originalSha256
          : currentContext.authoredSha256,
      );
      assert.deepEqual(readFileSync(join(root, selected.path)), originalCase);
      writeFileSync(join(root, 'tests/performance424-inputs.setup.ts'), setup);
      writeFileSync(join(root, 'performance424.config.ts'), config);
      symlinkSync(
        realpathSync('node_modules'),
        join(root, 'node_modules'),
        'dir',
      );
      const output = join(root, 'result.json'),
        proof = join(root, 'inputs.json');
      const env = {
        ...envBase,
        GIT_DIR: git('rev-parse', '--absolute-git-dir').toString().trim(),
        GIT_WORK_TREE: root,
        PROPEL_INPUT_PROOF: proof,
      };
      const pattern =
        '^' + selected.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
      execFileSync(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          selected.path,
          '--config',
          'performance424.config.ts',
          '--configLoader',
          'runner',
          '--maxWorkers=1',
          '-t',
          pattern,
          '--reporter=json',
          '--outputFile=' + output,
        ],
        {
          cwd: root,
          env,
          stdio: 'pipe',
          maxBuffer: 2 * 1024 * 1024,
          timeout: 45000,
          killSignal: 'SIGKILL',
        },
      );
      const result = JSON.parse(readFileSync(output, 'utf8'));
      assert.equal(result.numPassedTests, 1);
      assert.equal(result.numFailedTests, 0);
      assert.equal(result.numPendingTests, selected.total - 1);
      assert.equal(result.numTotalTests, selected.total);
      const test = result.testResults
        .flatMap((s) => s.assertionResults)
        .filter((t) => t.status === 'passed');
      assert.equal(test.length, 1);
      assert.equal(test[0].fullName, selected.title);
      const input = JSON.parse(readFileSync(proof, 'utf8'));
      assert.equal(input.outputCaptures, 1);
      assert(input.uuidCount > 0);
      reports.push({
        variant,
        passed: 1,
        failed: 0,
        filtered: selected.total - 1,
        durationMs: test[0].duration,
        runtimeSha256:
          variant === 'before'
            ? currentContext.originalSha256
            : currentContext.authoredSha256,
        input,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(
    reports[0].input,
    reports[1].input,
    'Identical UUID stream/count, sample Date and output identities required',
  );
  assert.deepEqual(readFileSync(selected.path), originalCase);
  const terminal = classifyFrame();
  assert.equal(terminal.kind, sourceFrame.kind);
  for (const [p, b] of sourceFrame.snapshots)
    assert.deepEqual(terminal.snapshots.get(p), b);
  return {
    classification:
      'CONTROLLED_SYNTHETIC_COMPARISON_NOT_OPERATIONAL_CLOCK_OR_HOST_CAUSE',
    context: currentContext.context,
    scenario: name,
    casePath: selected.path,
    title: selected.title,
    caseSha256: hash(originalCase),
    setupSha256: hash(setup),
    configSha256: hash(config),
    originalCaseBudgetMs: 30000,
    subprocessOuterWallMs: 45000,
    maxWorkers: 1,
    reports,
    canonicalChanges: false,
    limits: [
      'One local before/after pair per title is not a portable or statistical performance guarantee.',
      'Only Date is fixed; performance and test timeout timers remain real.',
      'Original case bodies and assertions are unchanged; controlled clock is not expiry or hosted Auth acceptance.',
      'The previously accepted3045 differential/security cases are reused, not rerun.',
    ],
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(measure(process.argv[2]), null, 2));
