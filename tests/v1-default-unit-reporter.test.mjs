// Constructed reporter controls only; these are not application test results.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  closeSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Reporter, {
  caseEvidence,
  errorEvidence,
  openUnitEvidence,
} from '../scripts/v1-default-unit-reporter.mjs';

function fixture(state = 'pending', errors) {
  return {
    id: 'literal-id',
    module: { moduleId: '/source/tests/example.test.ts' },
    fullName: 'original suite > original case',
    location: { line: 20, column: 3 },
    options: { mode: 'run', timeout: 30000, retry: 0 },
    result: () => ({ state, errors }),
    diagnostic: () => ({ duration: 10, retryCount: 0, flaky: false }),
  };
}
function observer() {
  const records = [];
  return {
    records,
    reporter: new Reporter({ root: '/source', sink: (r) => records.push(r) }),
  };
}
test('failed case retains original identity, budget and stack immediately', () => {
  const { reporter, records } = observer();
  const err = {
    name: 'AssertionError',
    message: 'exact failure',
    stack: 'original stack',
  };
  reporter.onTestCaseResult(fixture('failed', [err]));
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, 'case_result');
  assert.equal(records[0].case.result.state, 'failed');
  assert.equal(records[0].case.result.errors[0].stack, err.stack);
  assert.equal(records[0].case.full_name, 'original suite > original case');
  assert.equal(records[0].case.options.timeout, 30000);
  assert.equal(reporter.finished, false);
});
for (const state of ['passed', 'failed', 'pending', 'skipped'])
  test(`records ${state} without promoting or normalizing its result`, () => {
    assert.equal(caseEvidence(fixture(state), '/source').result.state, state);
  });
test('ready event is retained when execution never supplies an outcome', () => {
  const { reporter, records } = observer();
  reporter.onTestCaseReady(fixture());
  assert.equal(records.length, 1);
  assert.equal(records[0].case.result.state, 'pending');
  assert.equal(reporter.finished, false);
});
test('event ordering and observer-only resource samples remain explicit', () => {
  const { reporter, records } = observer();
  reporter.onTestCaseReady(fixture());
  reporter.onTestCaseResult(fixture('passed'));
  assert.deepEqual(
    records.map((r) => r.sequence),
    [0, 1],
  );
  assert.ok(records[0].observer.memory_bytes.rss > 0);
  assert.equal(records[0].observer.pid, process.pid);
});
test('module collection retains literal pending and skipped cases', () => {
  const { reporter, records } = observer();
  reporter.onTestModuleCollected({
    moduleId: '/source/tests/example.test.ts',
    children: { allTests: () => [fixture(), fixture('skipped')] },
    errors: () => [],
  });
  assert.deepEqual(
    records[0].cases.map((t) => t.result.state),
    ['pending', 'skipped'],
  );
});
test('collection errors are preserved before any case execution', () => {
  const { reporter, records } = observer();
  reporter.onTestModuleCollected({
    moduleId: '/source/tests/example.test.ts',
    children: { allTests: () => [] },
    errors: () => [new SyntaxError('original collection error')],
  });
  assert.equal(records[0].errors[0].message, 'original collection error');
});
test('interrupted final reason and unhandled failures stay separate', () => {
  const { reporter, records } = observer();
  reporter.onTestRunEnd([], [new Error('unhandled')], 'interrupted');
  assert.equal(records[0].reason, 'interrupted');
  assert.equal(records[0].unhandled_errors[0].message, 'unhandled');
  assert.equal(
    records[0].classification,
    'ACTUAL_FINAL_OBSERVATION_NOT_AUTOMATIC_PASS',
  );
});
test('duplicate final observation is denied without replacing the first', () => {
  const { reporter, records } = observer();
  reporter.onTestRunEnd([], [], 'passed');
  assert.throws(() => reporter.onTestRunEnd([], [], 'passed'), /Duplicate/);
  assert.equal(records.length, 1);
});
test('error serialization handles non-Error values without discarding them', () => {
  assert.equal(errorEvidence('raw failure').message, 'raw failure');
  assert.equal(
    errorEvidence({ message: 'failure', code: 'ERR_EXACT' }).code,
    'ERR_EXACT',
  );
});
test('new evidence file cannot overwrite a previous partial run', () => {
  const root = mkdtempSync(join(tmpdir(), 'propel-unit-evidence-'));
  closeSync(openUnitEvidence(root));
  assert.throws(() => openUnitEvidence(root), /EEXIST/);
  assert.equal(
    readFileSync(
      join(
        root,
        'artifacts/cycle33/v1-field-intake/default-unit/events.ndjson',
      ),
    ).length,
    0,
  );
});
test('artifact directory symlink cannot redirect reporter writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'propel-unit-evidence-link-'));
  const other = mkdtempSync(join(tmpdir(), 'propel-unit-evidence-outside-'));
  mkdirSync(join(other, 'target'));
  symlinkSync(join(other, 'target'), join(root, 'artifacts'));
  assert.throws(() => openUnitEvidence(root), /Regular local/);
});

test('omitted configured retry records the pinned effective default separately', () => {
  const records = [];
  const reporter = new Reporter({ sink: (r) => records.push(r) });
  reporter.onInit({
    config: {
      root: process.cwd(),
      testTimeout: 30000,
      hookTimeout: 30000,
      maxWorkers: 4,
    },
  });
  assert.equal(records[0].config.retry, 0);
  assert.equal(records[0].config.configured_retry, null);
  assert.equal(records[0].config.retry_origin, 'PINNED_VITEST_5_0_5_DEFAULT');
  assert.equal(records.length, 1);
});
