import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type FilePin = { path: string; sha256: string; blob: string };
type Author = readonly [string, string, string, string, string, number, number];
interface Ports {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  requireIndependent?: boolean;
}
const checker: {
  cycle22Parent: string;
  cycle22Branch: string;
  cycle22Authors: readonly Author[];
  cycle22Independent: { commit: string | null; cases: number | null };
  cycle22ValidationCases: number;
  cycle22PackagePaths: (module: string, component: string) => string[];
  validateCycle22Manifest: (manifest: unknown, ports?: Ports) => unknown;
  cycle22ApplicationSuites: (manifest: unknown) => Record<string, number>;
  validateCycle22ApplicationReport: (
    report: unknown,
    expected: Record<string, number>,
    cwd?: string,
  ) => unknown;
  validateCycle22Results: (report: unknown, manifest: unknown) => unknown;
} = await import(new URL('../scripts/check-cycle22.mjs', import.meta.url).href);
const browser: {
  validateCycle22Browser: (
    report: unknown,
    mode: string,
    options?: { collection: boolean },
  ) => unknown;
  cycle22Browser: {
    file: string;
    projects: string[];
    brands: string[];
    scenarios: string[];
    production: string;
  };
} = await import(
  new URL('../scripts/collect-cycle22-browser.mjs', import.meta.url).href
);
const readCache = new Map<string, Buffer>(),
  gitCache = new Map<string, Buffer>();
const ports: Ports = {
  read: (path) => {
    if (!readCache.has(path)) readCache.set(path, readFileSync(path));
    return readCache.get(path)!;
  },
  git: (commit, path) => {
    const key = commit + ':' + path;
    if (!gitCache.has(key))
      gitCache.set(key, execFileSync('git', ['show', key]));
    return gitCache.get(key)!;
  },
};
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const blob = (bytes: Buffer) =>
  createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
function fixture() {
  return {
    schema: 'propel-cycle22-sources-v1',
    parent_commit: checker.cycle22Parent,
    coordination_branch: checker.cycle22Branch,
    coordination_draft_pr: 149,
    release: 'NOT_READY_NOT_AUTHORIZED',
    independent_status: 'PENDING',
    independent_review_commit: null as string | null,
    independent_files: [] as FilePin[],
    packages: checker.cycle22Authors.map(
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
        parent_commit: checker.cycle22Parent,
        base_branch: checker.cycle22Branch,
        status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
        owned_files: checker
          .cycle22PackagePaths(module, component)
          .map((path) => {
            const bytes = ports.git(head_commit, path);
            return { path, sha256: digest(bytes), blob: blob(bytes) };
          }),
      }),
    ),
    combined_evidence: {
      author_cases: 183,
      coordinator_cases: 9 + checker.cycle22ValidationCases,
      independent_cases: checker.cycle22Independent.cases ?? 0,
      application_cases: 0,
      application_suites: {} as Record<string, number>,
    },
  };
}
function completeFixture() {
  const m = fixture();
  m.independent_status = 'CLEAR_LOCAL_SYNTHETIC_ONLY';
  m.independent_review_commit = checker.cycle22Independent.commit;
  if (checker.cycle22Independent.commit)
    m.independent_files = [
      'tests/cycle22-independent-integration-review.test.ts',
      'docs/program/CYCLE22_INDEPENDENT_REVIEW.json',
    ].map((path) => {
      const bytes = ports.git(checker.cycle22Independent.commit!, path);
      return { path, sha256: digest(bytes), blob: blob(bytes) };
    });
  m.combined_evidence.application_suites = {
    ...Object.fromEntries(
      checker.cycle22Authors.map((p) => [
        `tests/cycle22-${p[0]}.test.ts`,
        p[6],
      ]),
    ),
    'tests/cycle22-workbench-selection.test.ts': 9,
    'tests/cycle22-validation.test.ts': checker.cycle22ValidationCases,
    'tests/cycle22-independent-integration-review.test.ts':
      checker.cycle22Independent.cases ?? 0,
  };
  m.combined_evidence.application_cases = Object.values(
    m.combined_evidence.application_suites,
  ).reduce((a, b) => a + b, 0);
  return m;
}
function application(
  expected: Record<string, number> = {
    'tests/cycle22-fixture-one.test.ts': 2,
    'tests/cycle22-fixture-two.test.ts': 1,
  },
) {
  const total = Object.values(expected).reduce((a, b) => a + b, 0);
  return {
    success: true,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numPassedTestSuites: Object.keys(expected).length,
    numTotalTestSuites: Object.keys(expected).length,
    numPassedTests: total,
    numTotalTests: total,
    testResults: Object.entries(expected).map(([path, count]) => ({
      name: resolve(path),
      status: 'passed',
      assertionResults: Array.from({ length: count }, (_, i) => ({
        fullName: `${path} explicit validator fixture ${i}`,
        status: 'passed',
        failureMessages: [] as string[],
        duration: 1,
      })),
    })),
  };
}
function browserFixture(mode = 'development', collection = false) {
  const b = browser.cycle22Browser,
    titles =
      mode === 'development'
        ? b.scenarios.flatMap((s) => b.brands.map((brand) => `${s} / ${brand}`))
        : [b.production];
  return {
    errors: [] as unknown[],
    config: {
      rootDir: process.cwd(),
      fullyParallel: false,
      workers: 1,
      webServer: {
        url: `http://127.0.0.1:${mode === 'development' ? 4422 : 4432}`,
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
describe('Cycle22 exact published source and actual result validation', () => {
  it('validates all25 published author files and473 retained paths while review is honestly pending', () => {
    expect(checker.validateCycle22Manifest(fixture())).toMatchObject({
      author_files: 25,
      retained_author_files: 473,
      independent_status: 'PENDING',
      independent_files: 0,
    });
    expect(checker.validateCycle22Manifest(fixture(), ports)).toMatchObject({
      author_files: 25,
      retained_author_files: 473,
      independent_status: 'PENDING',
      independent_files: 0,
    });
  });
  it.each([
    'parent',
    'branch',
    'main-pr',
    'head',
    'author-pr',
    'owner',
    'stack',
    'count',
    'path',
    'hash',
    'blob',
    'duplicate',
  ] as const)('rejects exact source binding mutation %s', (mode) => {
    const m = fixture(),
      p = m.packages[0];
    if (mode === 'parent') m.parent_commit = '1'.repeat(40);
    if (mode === 'branch') m.coordination_branch = 'codex/foreign';
    if (mode === 'main-pr') m.coordination_draft_pr = 143;
    if (mode === 'head') p.head_commit = '1'.repeat(40);
    if (mode === 'author-pr') p.draft_pr = 150;
    if (mode === 'owner') p.owner = '/root/foreign';
    if (mode === 'stack') p.base_branch = 'main';
    if (mode === 'count') p.focused_new_tests = 1;
    if (mode === 'path') p.owned_files[0].path = '../private';
    if (mode === 'hash') p.owned_files[0].sha256 = '0'.repeat(64);
    if (mode === 'blob') p.owned_files[0].blob = '0'.repeat(40);
    if (mode === 'duplicate') p.owned_files[1] = p.owned_files[0];
    expect(() => checker.validateCycle22Manifest(m, ports)).toThrow();
  });
  it('working bytes cannot replace published author bytes even with recomputed declared hash and blob', () => {
    const m = fixture(),
      path = m.packages[0].owned_files[0].path,
      bytes = Buffer.from('replacement source');
    m.packages[0].owned_files[0] = {
      path,
      sha256: digest(bytes),
      blob: blob(bytes),
    };
    expect(() =>
      checker.validateCycle22Manifest(m, {
        ...ports,
        read: (p) => (p === path ? bytes : ports.read(p)),
      }),
    ).toThrow();
  });
  it('retained protected source drift is rejected by the unchanged earlier chain', () => {
    const prior = JSON.parse(
        readFileSync('docs/program/CYCLE4_PROTECTED_SOURCE.json', 'utf8'),
      ),
      path = prior.files[0].path;
    expect(() =>
      checker.validateCycle22Manifest(fixture(), {
        ...ports,
        read: (p) =>
          p === path ? Buffer.from('changed protected') : ports.read(p),
      }),
    ).toThrow();
  });
  it('pending review cannot pass CLI-grade source acceptance', () => {
    expect(() =>
      checker.validateCycle22Manifest(fixture(), {
        ...ports,
        requireIndependent: true,
      }),
    ).toThrow();
  });
  it('published independent evidence is required before complete source acceptance', () => {
    const m = completeFixture();
    if (checker.cycle22Independent.commit === null)
      expect(() =>
        checker.validateCycle22Manifest(m, {
          ...ports,
          requireIndependent: true,
        }),
      ).toThrow();
    else
      expect(
        checker.validateCycle22Manifest(m, {
          ...ports,
          requireIndependent: true,
        }),
      ).toMatchObject({
        independent_files: 2,
        independent_status: 'CLEAR_LOCAL_SYNTHETIC_ONLY',
      });
  });
  it('independent review bytes cannot be replaced with recomputed self-declared hashes', () => {
    const m = completeFixture(),
      path = 'tests/cycle22-independent-integration-review.test.ts',
      bytes = Buffer.from('forged independent review');
    m.independent_files = m.independent_files.map((file) =>
      file.path === path
        ? { path, sha256: digest(bytes), blob: blob(bytes) }
        : file,
    );
    expect(() =>
      checker.validateCycle22Manifest(m, {
        ...ports,
        read: (p) => (p === path ? bytes : ports.read(p)),
      }),
    ).toThrow();
  });
  it.each([
    'zero-commit',
    'other-commit',
    'partial-files',
    'pending-files',
  ] as const)('cannot manufacture independent acceptance: %s', (mode) => {
    const m = completeFixture();
    if (mode === 'zero-commit') m.independent_review_commit = '0'.repeat(40);
    if (mode === 'other-commit') m.independent_review_commit = '1'.repeat(40);
    if (mode === 'partial-files') m.independent_files = [];
    if (mode === 'pending-files') {
      m.independent_status = 'PENDING';
      m.independent_review_commit = '1'.repeat(40);
    }
    expect(() => checker.validateCycle22Manifest(m, ports)).toThrow();
  });
  it('accepts every explicit synthetic assertion without promoting fixture evidence to source acceptance', () => {
    const expected = {
      'tests/cycle22-fixture-one.test.ts': 2,
      'tests/cycle22-fixture-two.test.ts': 1,
    };
    expect(
      checker.validateCycle22ApplicationReport(application(expected), expected),
    ).toEqual({ passed: 3, suites: 2, authority: 'LOCAL_TEST_EVIDENCE_ONLY' });
  });
  it.each([
    'failed',
    'pending',
    'todo',
    'missing',
    'extra',
    'duplicate-name',
    'blank-name',
    'failure-message',
    'nan-duration',
    'negative-duration',
    'summary',
    'wrong-file',
    'suite-failed',
    'suite-pending',
    'assertion-count',
  ] as const)('rejects misleading actual assertion evidence %s', (mode) => {
    const r = application(),
      file = r.testResults[0],
      item = file.assertionResults[0];
    if (mode === 'failed') item.status = 'failed';
    if (mode === 'pending') item.status = 'pending';
    if (mode === 'todo') r.numTodoTests = 1;
    if (mode === 'missing') r.testResults.pop();
    if (mode === 'extra') r.testResults.push(file);
    if (mode === 'duplicate-name')
      file.assertionResults[1].fullName = item.fullName;
    if (mode === 'blank-name') item.fullName = ' ';
    if (mode === 'failure-message') item.failureMessages.push('failure');
    if (mode === 'nan-duration') item.duration = NaN;
    if (mode === 'negative-duration') item.duration = -1;
    if (mode === 'summary') r.numPassedTests++;
    if (mode === 'wrong-file') file.name = resolve('tests/foreign.test.ts');
    if (mode === 'suite-failed') file.status = 'failed';
    if (mode === 'suite-pending') r.numPendingTestSuites = 1;
    if (mode === 'assertion-count') file.assertionResults.pop();
    expect(() =>
      checker.validateCycle22ApplicationReport(r, {
        'tests/cycle22-fixture-one.test.ts': 2,
        'tests/cycle22-fixture-two.test.ts': 1,
      }),
    ).toThrow();
  });
  it.each([
    'tests/cycle22-task-custody-review.test.ts',
    'tests/cycle22-validation.test.ts',
    'tests/cycle22-independent-integration-review.test.ts',
  ])(
    'a reduced positive suite count cannot redefine source-required coverage: %s',
    (path) => {
      const m = completeFixture();
      m.combined_evidence.application_suites[path] = 1;
      expect(() => checker.cycle22ApplicationSuites(m)).toThrow();
    },
  );
  it('PENDING cannot supply an accepted aggregate application result', () => {
    expect(() =>
      checker.validateCycle22Results(application(), fixture()),
    ).toThrow();
  });
  it('complete application acceptance is pinned to the actual published independent inventory', () => {
    const m = completeFixture(),
      report = application(m.combined_evidence.application_suites);
    if (checker.cycle22Independent.commit === null)
      expect(() => checker.validateCycle22Results(report, m)).toThrow();
    else
      expect(checker.validateCycle22Results(report, m)).toMatchObject({
        passed: m.combined_evidence.application_cases,
        suites: 8,
      });
  });
  it('duplicate full names across different suite files cannot pass a matching rollup', () => {
    const r = application();
    r.testResults[1].assertionResults[0].fullName =
      r.testResults[0].assertionResults[0].fullName;
    expect(() =>
      checker.validateCycle22ApplicationReport(r, {
        'tests/cycle22-fixture-one.test.ts': 2,
        'tests/cycle22-fixture-two.test.ts': 1,
      }),
    ).toThrow();
  });
  it('an empty or foreign generic inventory cannot validate assertions', () => {
    expect(() =>
      checker.validateCycle22ApplicationReport(application(), {}),
    ).toThrow();
    expect(() =>
      checker.validateCycle22ApplicationReport(application(), {
        'tests/foreign.test.ts': 3,
      }),
    ).toThrow();
  });
  it('actual browser report validation requires exact27DEV and3OFF matrix entries', () => {
    expect(
      browser.validateCycle22Browser(browserFixture(), 'development'),
    ).toMatchObject({ cases: 27, kind: 'ACTUAL_BROWSER_PASS' });
    expect(
      browser.validateCycle22Browser(
        browserFixture('production'),
        'production',
      ),
    ).toMatchObject({ cases: 3 });
  });
  it('browser collection cannot pass as actual execution', () => {
    const r = browserFixture('development', true);
    expect(
      browser.validateCycle22Browser(r, 'development', { collection: true }),
    ).toMatchObject({ kind: 'COLLECTION_ONLY_NOT_PASS' });
    expect(() => browser.validateCycle22Browser(r, 'development')).toThrow();
  });
  it.each([
    'missing-brand',
    'duplicate',
    'skip',
    'retry',
    'flaky',
    'wrong-file',
    'remote',
    'reuse',
    'expected-failure',
    'missing-attempt',
  ] as const)('rejects incomplete browser matrix %s', (mode) => {
    const r = browserFixture(),
      spec = r.suites[0].specs[0],
      test = spec.tests[0];
    if (mode === 'missing-brand') r.suites[0].specs.pop();
    if (mode === 'duplicate') spec.tests[1].projectName = test.projectName;
    if (mode === 'skip') test.results[0].status = 'skipped';
    if (mode === 'retry') test.results[0].retry = 1;
    if (mode === 'flaky') r.stats.flaky = 1;
    if (mode === 'wrong-file') spec.file = 'tests/browser/foreign.spec.ts';
    if (mode === 'remote') r.config.webServer.url = 'https://external.invalid';
    if (mode === 'reuse') r.config.webServer.reuseExistingServer = true;
    if (mode === 'expected-failure') test.expectedStatus = 'failed';
    if (mode === 'missing-attempt') test.results = [];
    expect(() => browser.validateCycle22Browser(r, 'development')).toThrow();
  });
  it('workflow checks full-history exact sources and local bounded tests without protected baselines or execution', () => {
    const text = readFileSync(
      '.github/workflows/cycle22-integration.yml',
      'utf8',
    );
    expect(text).toContain('fetch-depth: 0');
    expect(text).toContain("node-version: '24'");
    expect(text).toContain(
      'node scripts/check-cycle22.mjs --require-independent',
    );
    expect(text).toContain('tests/cycle22*.test.ts');
    expect(text).toContain('--complete');
    expect(text).not.toMatch(
      /workflow_dispatch|test:recovery|test:maintenance-native|supabase db|netlify deploy|gh pr merge/,
    );
  });
});
