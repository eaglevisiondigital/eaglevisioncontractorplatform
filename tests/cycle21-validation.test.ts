import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const checkerPath = new URL('../scripts/check-cycle21.mjs', import.meta.url)
  .href;
type Author = readonly [string, string, string, string, string, number, number];
interface Ports {
  read: (path: string) => string | Buffer;
  git: (commit: string, path: string) => Buffer;
}
const checker: {
  cycle21Authors: readonly Author[];
  cycle21Parent: string;
  cycle21Support: string;
  cycle21PackagePaths: (module: string, component: string) => string[];
  validateCycle21Manifest: (value: unknown, ports?: Ports) => unknown;
  validateCycle21Results: (report: unknown, manifest: unknown) => unknown;
  validateCycle21Browser: (
    report: unknown,
    mode: string,
    options?: { collection: boolean },
  ) => unknown;
  cycle21Browser: {
    projects: string[];
    brands: string[];
    scenarios: string[];
    off: string;
    file: string;
  };
} = await import(checkerPath);
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const blob = (bytes: Buffer) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
const git = (commit: string, path: string) =>
  execFileSync('git', ['show', `${commit}:${path}`]);
const reviewer = '1234567890123456789012345678901234567890';
const reviewFiles = new Map([
  [
    'tests/cycle21-independent-integration-review.test.ts',
    Buffer.from('synthetic validator fixture; not independent acceptance\n'),
  ],
  [
    'docs/program/CYCLE21_INDEPENDENT_REVIEW.json',
    Buffer.from('{"fixture":true}\n'),
  ],
]);
const ports: Ports = {
  read: (path) => reviewFiles.get(path) ?? readFileSync(path),
  git: (commit, path) =>
    commit === reviewer ? reviewFiles.get(path)! : git(commit, path),
};
function fixture(clear = false) {
  const packages = checker.cycle21Authors.map(
    ([
      module,
      component,
      owner,
      branch,
      head_commit,
      draft_pr,
      focused_new_tests,
    ]) => ({
      module,
      component,
      owner,
      branch,
      head_commit,
      draft_pr,
      focused_new_tests,
      parent_commit: checker.cycle21Support,
      base_branch: 'codex/program-cycle-twenty-one',
      status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
      owned_files: checker
        .cycle21PackagePaths(module, component)
        .map((path) => {
          const bytes = git(head_commit, path);
          return { path, sha256: digest(bytes), blob: blob(bytes) };
        }),
    }),
  );
  const suites: Record<string, number> = {
    'tests/cycle21-canonical-corrections.test.ts': 31,
    ...Object.fromEntries(
      checker.cycle21Authors.map((p) => [
        `tests/cycle21-${p[0]}.test.ts`,
        p[6],
      ]),
    ),
    'tests/cycle21-preview-preparation.test.ts': 10,
    'tests/cycle21-validation.test.ts': 46,
    'tests/cycle21-independent-integration-review.test.ts': 41,
  };
  return {
    schema: 'propel-cycle21-sources-v1',
    parent_commit: checker.cycle21Parent,
    support_commit: checker.cycle21Support,
    coordination_branch: 'codex/program-cycle-twenty-one',
    coordination_draft_pr: 143,
    release: 'NOT_READY_NOT_AUTHORIZED',
    independent_status: clear ? 'CLEAR_LOCAL_SYNTHETIC_ONLY' : 'PENDING',
    independent_review_commit: clear ? reviewer : null,
    independent_files: clear
      ? [...reviewFiles].map(([path, bytes]) => ({
          path,
          sha256: digest(bytes),
          blob: blob(bytes),
        }))
      : [],
    packages,
    combined_evidence: {
      author_cases: 210,
      coordinator_cases: 87,
      independent_cases: 41,
      application_cases: Object.values(suites).reduce((a, b) => a + b, 0),
      application_suites: suites,
    },
  };
}
function app() {
  const manifest = fixture(true),
    suites = manifest.combined_evidence.application_suites;
  const report = {
    success: true,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numPassedTestSuites: Object.keys(suites).length,
    numTotalTestSuites: Object.keys(suites).length,
    numPassedTests: manifest.combined_evidence.application_cases,
    numTotalTests: manifest.combined_evidence.application_cases,
    testResults: Object.entries(suites).map(([path, count]) => ({
      name: resolve(path),
      status: 'passed',
      assertionResults: Array.from({ length: count }, (_, i) => ({
        fullName: `${path} actual validator fixture ${i}`,
        status: 'passed',
        failureMessages: [] as string[],
        duration: 1,
      })),
    })),
  };
  return { manifest, report };
}
function browser(mode = 'development', collection = false) {
  const b = checker.cycle21Browser,
    titles =
      mode === 'development'
        ? b.scenarios.flatMap((s) => b.brands.map((brand) => `${s} / ${brand}`))
        : [b.off];
  return {
    errors: [] as unknown[],
    config: {
      rootDir: process.cwd(),
      fullyParallel: false,
      webServer: {
        url: `http://127.0.0.1:${mode === 'development' ? 4421 : 4431}`,
        reuseExistingServer: false,
      },
      projects: b.projects.map((name) => ({ name, retries: 0, repeatEach: 1 })),
    },
    stats: { expected: titles.length * 3, skipped: 0, unexpected: 0, flaky: 0 },
    suites: [
      {
        specs: titles.map((title) => ({
          title,
          file: b.file,
          ok: true,
          tests: b.projects.map((projectName) => ({
            projectName,
            expectedStatus: 'passed',
            annotations: [] as unknown[],
            status: 'expected',
            results: collection
              ? []
              : [{ status: 'passed', retry: 0, errors: [] as unknown[] }],
          })),
        })),
        suites: [],
      },
    ],
  };
}
describe('Cycle21 source and validation evidence guards', () => {
  it('accepts actual25 published author blobs while independent review remains honestly pending', () => {
    expect(checker.validateCycle21Manifest(fixture(), ports)).toMatchObject({
      author_files: 25,
      retained_author_files: 448,
      independent_files: 0,
    });
  });
  it.each([
    'parent',
    'support',
    'branch',
    'head',
    'pr',
    'owner',
    'base',
    'count',
    'path',
    'sha',
    'blob',
    'duplicate',
  ] as const)('denies forged exact author binding %s', (mode) => {
    const m = fixture(),
      p = m.packages[0];
    if (mode === 'parent') m.parent_commit = reviewer;
    if (mode === 'support') m.support_commit = reviewer;
    if (mode === 'branch') p.branch = 'codex/foreign';
    if (mode === 'head') p.head_commit = reviewer;
    if (mode === 'pr') p.draft_pr = 145;
    if (mode === 'owner') p.owner = '/root/unknown';
    if (mode === 'base') p.base_branch = 'main';
    if (mode === 'count') p.focused_new_tests = 0;
    if (mode === 'path') p.owned_files[0].path = '../private';
    if (mode === 'sha') p.owned_files[0].sha256 = '0'.repeat(64);
    if (mode === 'blob') p.owned_files[0].blob = '0'.repeat(40);
    if (mode === 'duplicate') p.owned_files[1] = p.owned_files[0];
    expect(() => checker.validateCycle21Manifest(m, ports)).toThrow();
  });
  it('rejects source drift even when the declared blob/hash are recomputed', () => {
    const m = fixture(),
      path = m.packages[0].owned_files[0].path,
      bytes = Buffer.from('forged replacement');
    m.packages[0].owned_files[0] = {
      path,
      sha256: digest(bytes),
      blob: blob(bytes),
    };
    expect(() =>
      checker.validateCycle21Manifest(m, {
        ...ports,
        read: (p) => (p === path ? bytes : ports.read(p)),
      }),
    ).toThrow();
  });
  it('cannot label missing or partial independent files accepted', () => {
    const m = fixture(true);
    m.independent_files.pop();
    expect(() => checker.validateCycle21Manifest(m, ports)).toThrow();
    const pending = fixture();
    pending.independent_review_commit = reviewer;
    expect(() => checker.validateCycle21Manifest(pending, ports)).toThrow();
  });
  it('validates every actual assertion rather than trusting a passed count', () => {
    const { manifest, report } = app();
    expect(checker.validateCycle21Results(report, manifest)).toMatchObject({
      passed: manifest.combined_evidence.application_cases,
      suites: 9,
    });
  });
  it.each([
    'failed',
    'pending',
    'todo',
    'missing',
    'extra',
    'duplicate',
    'empty',
    'failure-message',
    'nan-duration',
    'summary',
    'zero-count',
    'wrong-file',
  ] as const)('rejects misleading application evidence %s', (mode) => {
    const { manifest, report } = app(),
      file = report.testResults[0],
      item = file.assertionResults[0];
    if (mode === 'failed') item.status = 'failed';
    if (mode === 'pending') item.status = 'pending';
    if (mode === 'todo') report.numTodoTests = 1;
    if (mode === 'missing') report.testResults.pop();
    if (mode === 'extra') report.testResults.push(file);
    if (mode === 'duplicate') file.assertionResults[1].fullName = item.fullName;
    if (mode === 'empty') item.fullName = ' ';
    if (mode === 'failure-message') item.failureMessages.push('hidden failure');
    if (mode === 'nan-duration') item.duration = NaN;
    if (mode === 'summary') report.numPassedTests++;
    if (mode === 'zero-count')
      manifest.combined_evidence.application_suites[
        'tests/cycle21-independent-integration-review.test.ts'
      ] = 0;
    if (mode === 'wrong-file') file.name = resolve('tests/unrelated.test.ts');
    expect(() => checker.validateCycle21Results(report, manifest)).toThrow();
  });
  it.each([
    'tests/cycle21-validation.test.ts',
    'tests/cycle21-independent-integration-review.test.ts',
  ])(
    'rejects reduced positive suite coverage even with a matching fake rollup: %s',
    (path) => {
      const { manifest, report } = app();
      const file = report.testResults.find(
        (row) => row.name === resolve(path),
      )!;
      const removed = file.assertionResults.length - 1;
      file.assertionResults = file.assertionResults.slice(0, 1);
      manifest.combined_evidence.application_suites[path] = 1;
      manifest.combined_evidence.application_cases -= removed;
      report.numTotalTests -= removed;
      report.numPassedTests -= removed;
      expect(() => checker.validateCycle21Results(report, manifest)).toThrow();
    },
  );
  it('does not accept aggregate application evidence while independent review is pending', () => {
    const { manifest, report } = app();
    manifest.independent_status = 'PENDING';
    expect(() => checker.validateCycle21Results(report, manifest)).toThrow();
  });
  it('validates27 actualdevelopment cases and3 productionOFF cases across exact layouts/brands', () => {
    expect(
      checker.validateCycle21Browser(browser(), 'development'),
    ).toMatchObject({ cases: 27, kind: 'ACTUAL_BROWSER_PASS' });
    expect(
      checker.validateCycle21Browser(browser('production'), 'production'),
    ).toMatchObject({ cases: 3 });
  });
  it('collection remains explicitly separate from actual browser PASS', () => {
    const value = browser('development', true);
    expect(
      checker.validateCycle21Browser(value, 'development', {
        collection: true,
      }),
    ).toMatchObject({ kind: 'COLLECTION_ONLY_NOT_PASS' });
    expect(() =>
      checker.validateCycle21Browser(value, 'development'),
    ).toThrow();
  });
  it.each([
    'skip',
    'retry',
    'flaky',
    'failure',
    'duplicate',
    'missing-brand',
    'wrong-project',
    'wrong-file',
    'expected-failure',
    'error',
    'remote',
    'reuse',
    'missing-attempt',
  ] as const)('rejects incomplete or unsafe browser evidence %s', (mode) => {
    const r = browser(),
      spec = r.suites[0].specs[0],
      test = spec.tests[0];
    if (mode === 'skip') test.results[0].status = 'skipped';
    if (mode === 'retry') test.results[0].retry = 1;
    if (mode === 'flaky') r.stats.flaky = 1;
    if (mode === 'failure') spec.ok = false;
    if (mode === 'duplicate') spec.tests[1].projectName = test.projectName;
    if (mode === 'missing-brand') r.suites[0].specs.pop();
    if (mode === 'wrong-project') test.projectName = 'unknown';
    if (mode === 'wrong-file') spec.file = 'tests/browser/other.spec.ts';
    if (mode === 'expected-failure') test.expectedStatus = 'failed';
    if (mode === 'error') r.errors.push({ message: 'global browser error' });
    if (mode === 'remote') r.config.webServer.url = 'https://external.invalid';
    if (mode === 'reuse') r.config.webServer.reuseExistingServer = true;
    if (mode === 'missing-attempt') test.results = [];
    expect(() => checker.validateCycle21Browser(r, 'development')).toThrow();
  });
});
