/** Read-only frozen-source scheduling diagnostic; never original coverage admission. */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resourceSnapshot,
  classifyErrors,
} from './cycle33-foundation-reporter.mjs';
import { nativeFailureEvidence } from './cycle33-foundation-evidence.mjs';

const driver = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(driver, 'artifacts/cycle33-deadline-diagnostic');
const manifestPath = 'scripts/cycle33-foundation-deadline-cohort.json';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = () => {
  throw Error('Incomplete or changed isolated deadline diagnostic');
};
const git = (cwd, args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
export const scope =
  'ALTERNATIVE_ORCHESTRATION_DIAGNOSTIC_NOT_ORIGINAL4WORKER_PASS';
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const cohort = freeze(json(resolve(driver, manifestPath)));
const driverPaths = [
  manifestPath,
  'scripts/cycle33-foundation-deadline-diagnostic.mjs',
  'scripts/cycle33-foundation-reporter.mjs',
  'scripts/cycle33-foundation-evidence.mjs',
  '.github/workflows/cycle33-isolated-deadline-diagnostic.yml',
  'tests/cycle33-foundation-deadline-diagnostic.test.ts',
  'docs/program/CYCLE33_FOUNDATION_DEADLINE_DIAGNOSTIC.md',
  'package.json',
  'package-lock.json',
];
function write(name, value) {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
}
function clean(cwd) {
  if (
    spawnSync(
      'git',
      ['--no-replace-objects', 'diff', '--quiet', 'HEAD', '--'],
      { cwd },
    ).status !== 0
  )
    fail();
}
export function captureBinding(subject) {
  clean(driver);
  clean(subject);
  if (git(subject, ['ls-files', '--others', '--exclude-standard'])) fail();
  const source = git(subject, ['rev-parse', 'HEAD']);
  const tree = git(subject, ['rev-parse', 'HEAD^{tree}']);
  if (source !== cohort.source || tree !== cohort.tree) fail();
  const files = {
    ...cohort.source_files,
    ...Object.fromEntries(
      cohort.files.map((f) => [f.file, f.original_file_sha256]),
    ),
  };
  for (const [p, hash] of Object.entries(files))
    if (sha(readFileSync(resolve(subject, p))) !== hash) fail();
  return {
    subject: { source, tree, tracked_clean: true, files },
    driver: {
      source: git(driver, ['rev-parse', 'HEAD']),
      tree: git(driver, ['rev-parse', 'HEAD^{tree}']),
      tracked_clean: true,
      files: Object.fromEntries(
        driverPaths.map((p) => [p, sha(readFileSync(resolve(driver, p)))]),
      ),
    },
    cohort_sha256: sha(readFileSync(resolve(driver, manifestPath))),
  };
}
export function requireBinding(value, expected) {
  if (
    !same(value, expected) ||
    value?.subject?.source !== cohort.source ||
    value?.subject?.tree !== cohort.tree ||
    value?.subject?.tracked_clean !== true ||
    value?.driver?.tracked_clean !== true
  )
    fail();
}
const identity = ({
  id,
  fullName,
  jsonName,
  mode,
  timeout,
  retry,
  repeat,
}) => ({ id, fullName, jsonName, mode, timeout, retry, repeat });
const sorted = (a) =>
  [...a].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function exactRows(actual, expected) {
  if (
    !Array.isArray(actual) ||
    new Set(actual.map((r) => r.id)).size !== actual.length ||
    !same(sorted(actual.map(identity)), sorted(expected.map(identity)))
  )
    fail();
}
export function validateCollection(actual) {
  const expected = cohort.files.flatMap((f) =>
    f.cases.map((c) => ({ file: f.file, name: c.fullName })),
  );
  if (!Array.isArray(actual) || !same(sorted(actual), sorted(expected))) fail();
  return expected.length;
}
function validSample(s) {
  const number = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return (
    s &&
    number(s.at_ms) &&
    Number.isInteger(s.cpu_count) &&
    s.cpu_count > 0 &&
    Array.isArray(s.load) &&
    s.load.length === 3 &&
    s.load.every(number) &&
    number(s.memory_free) &&
    number(s.memory_total) &&
    s.memory_total > 0 &&
    (s.processes === null ||
      (Number.isInteger(s.processes) && s.processes >= 0)) &&
    (s.resident_bytes === null || number(s.resident_bytes)) &&
    s.sampled_process_limit === 1024 &&
    [true, false, null].includes(s.resident_sample_truncated) &&
    number(s.observer_cpu?.user) &&
    number(s.observer_cpu?.system) &&
    ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'].every((key) =>
      number(s.observer_memory?.[key]),
    )
  );
}
export function validateDiagnostic(
  plan,
  report,
  raw,
  currentBinding,
  subject = process.cwd(),
) {
  if (
    plan?.scope !== scope ||
    plan?.original_coverage_admitted !== false ||
    plan?.case_count !== 233 ||
    plan?.file_count !== 7
  )
    fail();
  validateCollection(plan.collected);
  requireBinding(plan.binding, currentBinding);
  requireBinding(report?.binding, currentBinding);
  requireBinding(report?.binding_after, currentBinding);
  if (
    !same(report?.config, {
      testTimeout: 30000,
      hookTimeout: 30000,
      maxWorkers: 1,
      retry: 0,
      shard: { index: 1, count: 1 },
    }) ||
    !['passed', 'failed'].includes(report.reason) ||
    report.errors !== 0
  )
    fail();
  if (
    !Array.isArray(report.modules) ||
    report.modules.length !== 7 ||
    new Set(report.modules.map((m) => m.file)).size !== 7
  )
    fail();
  const results = [];
  for (const f of cohort.files) {
    const m = report.modules.find((m) => m.file === f.file);
    if (!m || m.ended !== true || m.errors !== 0) fail();
    exactRows(m.collected, f.cases);
    exactRows(m.results, f.cases);
    for (const c of m.results) {
      if (
        !['passed', 'failed'].includes(c.status) ||
        !Number.isFinite(c.duration_ms) ||
        c.duration_ms < 0 ||
        !Number.isInteger(c.errors) ||
        c.errors < 0 ||
        !Array.isArray(c.error_evidence) ||
        c.error_evidence.length !== c.errors ||
        (c.status === 'passed' && c.errors !== 0)
      )
        fail();
      results.push({ file: f.file, name: c.jsonName, status: c.status });
    }
  }
  const failed = results.filter((r) => r.status === 'failed').length;
  if (
    raw?.success !== (failed === 0) ||
    report.reason !== (failed ? 'failed' : 'passed') ||
    raw.numTotalTests !== 233 ||
    raw.numPassedTests !== 233 - failed ||
    raw.numFailedTests !== failed ||
    raw.numPendingTests !== 0 ||
    raw.numTodoTests !== 0 ||
    !Array.isArray(raw.testResults) ||
    raw.testResults.length !== 7
  )
    fail();
  const jsonResults = raw.testResults.flatMap((m) => {
    const file = relative(subject, m.name).replaceAll('\\', '/');
    if (
      !cohort.files.some((f) => f.file === file) ||
      !Array.isArray(m.assertionResults)
    )
      fail();
    return m.assertionResults.map((a) => {
      if (
        !Array.isArray(a.failureMessages) ||
        (a.status === 'passed' && a.failureMessages.length)
      )
        fail();
      return { file, name: a.fullName, status: a.status };
    });
  });
  if (
    !same(sorted(jsonResults), sorted(results)) ||
    !Array.isArray(report.samples) ||
    report.samples.length !== 16 ||
    report.samples.some((s) => !validSample(s))
  )
    fail();
  return {
    scope,
    verdict: failed
      ? 'COMPLETE_DIAGNOSTIC_WITH_RECORDED_FAILURES'
      : 'COMPLETE_DIAGNOSTIC_CASE_PASS',
    source: cohort.source,
    tree: cohort.tree,
    files: 7,
    total: 233,
    passed: 233 - failed,
    failed,
    original_coverage_admitted: false,
    original_max_workers: 4,
    actual_max_workers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
    retry: 0,
  };
}
function row(t, fallback) {
  const names = [t.name];
  let p = t.parent;
  while (p.type !== 'module') {
    names.unshift(p.name);
    p = p.parent;
  }
  const d = t.diagnostic();
  const errors = t.result().errors ?? [];
  return {
    id: t.id,
    fullName: t.fullName,
    jsonName: names.join(' '),
    mode: t.options.mode ?? 'run',
    timeout: t.options.timeout ?? fallback,
    retry: d?.retryCount ?? 0,
    repeat: d?.repeatCount ?? 0,
    status: t.result().state,
    errors: errors.length,
    error_evidence: classifyErrors(errors),
    duration_ms: d?.duration ?? null,
  };
}
export default class IsolatedDeadlineReporter {
  onInit(ctx) {
    this.ctx = ctx;
    this.data = {
      schema: 'cycle33-isolated-deadline-observations-v1',
      binding: captureBinding(process.cwd()),
      binding_after: null,
      reason: 'NOT_TERMINAL',
      errors: null,
      config: {
        testTimeout: ctx.config.testTimeout,
        hookTimeout: ctx.config.hookTimeout,
        maxWorkers: ctx.config.maxWorkers,
        retry: ctx.config.retry ?? 0,
        shard: ctx.config.shard,
      },
      modules: [],
      samples: [resourceSnapshot()],
    };
    this.save();
  }
  save() {
    write('observations.json', this.data);
  }
  onTestModuleCollected(m) {
    this.data.modules.push({
      file: relative(process.cwd(), m.moduleId).replaceAll('\\', '/'),
      collected: [...m.children.allTests()].map((t) =>
        row(t, this.ctx.config.testTimeout),
      ),
      results: [],
      ended: false,
      errors: null,
    });
    this.data.samples.push(resourceSnapshot());
    this.save();
  }
  onTestModuleEnd(m) {
    const record = this.data.modules.find(
      (r) =>
        r.file === relative(process.cwd(), m.moduleId).replaceAll('\\', '/'),
    );
    if (!record) fail();
    record.results = [...m.children.allTests()].map((t) =>
      row(t, this.ctx.config.testTimeout),
    );
    record.ended = true;
    record.errors = m.errors().length;
    this.data.samples.push(resourceSnapshot());
    this.save();
  }
  onTestRunEnd(modules, errors, reason) {
    this.data.reason = reason;
    this.data.errors = errors.length;
    this.data.binding_after = captureBinding(process.cwd());
    this.data.samples.push(resourceSnapshot());
    this.save();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, subjectArg] = process.argv.slice(2);
  const subject = resolve(subjectArg ?? '.');
  if (command === 'plan') {
    const binding = captureBinding(subject);
    const result = spawnSync(
      process.execPath,
      [
        resolve(subject, 'node_modules/vitest/vitest.mjs'),
        'list',
        ...cohort.files.map((f) => f.file),
        '--no-staticParse',
        '--json',
      ],
      { cwd: subject, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    if (result.status !== 0 || result.error || result.signal) {
      write('collection-failure.json', nativeFailureEvidence(result));
      fail();
    }
    const raw = JSON.parse(result.stdout);
    const collected = raw.map((c) => ({
      file: relative(subject, c.file).replaceAll('\\', '/'),
      name: c.name,
    }));
    validateCollection(collected);
    requireBinding(captureBinding(subject), binding);
    write('plan.json', {
      scope,
      original_coverage_admitted: false,
      binding,
      file_count: 7,
      case_count: 233,
      collected,
    });
  } else if (command === 'validate') {
    let summary;
    try {
      summary = validateDiagnostic(
        json(resolve(output, 'plan.json')),
        json(resolve(output, 'observations.json')),
        json(resolve(output, 'results.json')),
        captureBinding(subject),
        subject,
      );
    } catch {
      write('summary.json', {
        scope,
        verdict: 'INCOMPLETE_OR_CHANGED_DIAGNOSTIC',
        original_coverage_admitted: false,
      });
      throw Error('Incomplete or changed isolated deadline diagnostic');
    }
    write('summary.json', summary);
    if (summary.failed) process.exitCode = 1;
  } else fail();
}
