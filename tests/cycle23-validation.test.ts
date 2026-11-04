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
  parent?: (commit: string) => string;
  delta?: (commit: string) => string;
}
const checker: {
  cycle23Parent: string;
  cycle23Branch: string;
  cycle23Authors: readonly Author[];
  cycle23Independent: { commit: string | null; cases: number | null };
  cycle23ValidationCases: number;
  cycle23Corrections: Record<
    string,
    { original: string; commit: string; modified: readonly string[] }
  >;
  cycle23PackagePaths: (module: string, component: string) => string[];
  validateCycle23Manifest: (manifest: unknown, ports?: Ports) => unknown;
  cycle23ApplicationSuites: (manifest: unknown) => Record<string, number>;
  validateCycle23ApplicationReport: (
    report: unknown,
    expected: Record<string, number>,
    cwd?: string,
  ) => unknown;
  validateCycle23Results: (report: unknown, manifest: unknown) => unknown;
} = await import(new URL('../scripts/check-cycle23.mjs', import.meta.url).href);
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
    schema: 'propel-cycle23-sources-v1',
    parent_commit: checker.cycle23Parent,
    coordination_branch: checker.cycle23Branch,
    coordination_draft_pr: 155,
    release: 'NOT_READY_NOT_AUTHORIZED',
    independent_status: 'PENDING',
    independent_review_commit: null as string | null,
    independent_files: [] as FilePin[],
    packages: checker.cycle23Authors.map(
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
        original_author_commit:
          checker.cycle23Corrections[module]?.original ?? head_commit,
        draft_pr,
        focused_new_tests,
        parent_commit: checker.cycle23Parent,
        base_branch: checker.cycle23Branch,
        status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
        owned_files: checker
          .cycle23PackagePaths(module, component)
          .map((path) => {
            const bytes = ports.git(head_commit, path);
            return { path, sha256: digest(bytes), blob: blob(bytes) };
          }),
      }),
    ),
    combined_evidence: {
      author_cases: checker.cycle23Authors.reduce((n, p) => n + p[6], 0),
      coordinator_cases: checker.cycle23ValidationCases,
      independent_cases: checker.cycle23Independent.cases ?? 0,
      application_cases: 0,
      application_suites: {} as Record<string, number>,
    },
  };
}
function completeFixture() {
  const m = fixture();
  m.independent_status = 'CLEAR_LOCAL_SYNTHETIC_ONLY';
  m.independent_review_commit = checker.cycle23Independent.commit;
  if (checker.cycle23Independent.commit)
    m.independent_files = [
      'tests/cycle23-independent-integration-review.test.ts',
      'docs/program/CYCLE23_INDEPENDENT_REVIEW.json',
    ].map((path) => {
      const bytes = ports.git(checker.cycle23Independent.commit!, path);
      return { path, sha256: digest(bytes), blob: blob(bytes) };
    });
  m.combined_evidence.application_suites = {
    ...Object.fromEntries(
      checker.cycle23Authors.map((p) => [
        `tests/cycle23-${p[0]}.test.ts`,
        p[6],
      ]),
    ),
    'tests/cycle23-validation.test.ts': checker.cycle23ValidationCases,
    'tests/cycle23-independent-integration-review.test.ts':
      checker.cycle23Independent.cases ?? 0,
  };
  m.combined_evidence.application_cases = Object.values(
    m.combined_evidence.application_suites,
  ).reduce((a, b) => a + b, 0);
  return m;
}
function application(
  expected: Record<string, number> = {
    'tests/cycle23-fixture-one.test.ts': 2,
    'tests/cycle23-fixture-two.test.ts': 1,
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
describe('Cycle23 exact published source and actual result validation', () => {
  it('validates all25 published author files and498 retained paths while review is honestly pending', () => {
    expect(checker.validateCycle23Manifest(fixture())).toMatchObject({
      author_files: 25,
      retained_author_files: 498,
      independent_status: 'PENDING',
      independent_files: 0,
    });
    expect(checker.validateCycle23Manifest(fixture(), ports)).toMatchObject({
      author_files: 25,
      retained_author_files: 498,
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
    expect(() => checker.validateCycle23Manifest(m, ports)).toThrow();
  });
  it('exact native parent and only the published presentation-only forward correction are required', () => {
    expect(() =>
      checker.validateCycle23Manifest(fixture(), {
        ...ports,
        parent: () => '0'.repeat(40),
      }),
    ).toThrow();
    for (const [module, correction] of Object.entries(
      checker.cycle23Corrections,
    )) {
      const index = checker.cycle23Authors.findIndex((p) => p[0] === module);
      const reader = checker.cycle23PackagePaths(
        module,
        checker.cycle23Authors[index][1],
      )[0];
      const parent = (commit: string) =>
        execFileSync('git', ['show', '--no-patch', '--format=%P', commit], {
          encoding: 'utf8',
        }).trim();
      const expected =
        correction.modified.map((path) => `M\t${path}`).join('\n') + '\n';
      for (const mode of [
        'wrong-original',
        'wrong-forward-parent',
        'wrong-original-parent',
        'extra-path',
        'wrong-status',
        'changed-reader',
      ] as const) {
        const m = fixture();
        if (mode === 'wrong-original')
          m.packages[index].original_author_commit = '0'.repeat(40);
        expect(() =>
          checker.validateCycle23Manifest(m, {
            ...ports,
            parent: (commit) =>
              mode === 'wrong-forward-parent' && commit === correction.commit
                ? '0'.repeat(40)
                : mode === 'wrong-original-parent' &&
                    commit === correction.original
                  ? '0'.repeat(40)
                  : parent(commit),
            delta: (commit) =>
              commit === correction.commit
                ? mode === 'extra-path'
                  ? expected + 'M\tsrc/lib/phase3.ts\n'
                  : mode === 'wrong-status'
                    ? expected.replace('M\t', 'A\t')
                    : expected
                : execFileSync(
                    'git',
                    [
                      'diff-tree',
                      '--no-commit-id',
                      '--name-status',
                      '--no-renames',
                      '-r',
                      commit,
                    ],
                    { encoding: 'utf8' },
                  ),
            git: (commit, path) =>
              mode === 'changed-reader' &&
              commit === correction.original &&
              path === reader
                ? Buffer.from('changed reader')
                : ports.git(commit, path),
          }),
        ).toThrow();
      }
    }
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
      checker.validateCycle23Manifest(m, {
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
      checker.validateCycle23Manifest(fixture(), {
        ...ports,
        read: (p) =>
          p === path ? Buffer.from('changed protected') : ports.read(p),
      }),
    ).toThrow();
  });
  it('pending review cannot pass CLI-grade source acceptance', () => {
    expect(() =>
      checker.validateCycle23Manifest(fixture(), {
        ...ports,
        requireIndependent: true,
      }),
    ).toThrow();
  });
  it('published independent evidence is required before complete source acceptance', () => {
    const m = completeFixture();
    if (checker.cycle23Independent.commit === null)
      expect(() =>
        checker.validateCycle23Manifest(m, {
          ...ports,
          requireIndependent: true,
        }),
      ).toThrow();
    else
      expect(
        checker.validateCycle23Manifest(m, {
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
      path = 'tests/cycle23-independent-integration-review.test.ts',
      bytes = Buffer.from('forged independent review');
    m.independent_files = m.independent_files.map((file) =>
      file.path === path
        ? { path, sha256: digest(bytes), blob: blob(bytes) }
        : file,
    );
    expect(() =>
      checker.validateCycle23Manifest(m, {
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
    expect(() => checker.validateCycle23Manifest(m, ports)).toThrow();
  });
  it('accepts every explicit synthetic assertion without promoting fixture evidence to source acceptance', () => {
    const expected = {
      'tests/cycle23-fixture-one.test.ts': 2,
      'tests/cycle23-fixture-two.test.ts': 1,
    };
    expect(
      checker.validateCycle23ApplicationReport(application(expected), expected),
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
      checker.validateCycle23ApplicationReport(r, {
        'tests/cycle23-fixture-one.test.ts': 2,
        'tests/cycle23-fixture-two.test.ts': 1,
      }),
    ).toThrow();
  });
  it.each([
    'tests/cycle23-task-revision-consistency.test.ts',
    'tests/cycle23-validation.test.ts',
    'tests/cycle23-independent-integration-review.test.ts',
  ])(
    'a reduced positive suite count cannot redefine source-required coverage: %s',
    (path) => {
      const m = completeFixture();
      m.combined_evidence.application_suites[path] = 1;
      expect(() => checker.cycle23ApplicationSuites(m)).toThrow();
    },
  );
  it('PENDING cannot supply an accepted aggregate application result', () => {
    expect(() =>
      checker.validateCycle23Results(application(), fixture()),
    ).toThrow();
  });
  it('complete application acceptance is pinned to the actual published independent inventory', () => {
    const m = completeFixture(),
      report = application(m.combined_evidence.application_suites);
    if (checker.cycle23Independent.commit === null)
      expect(() => checker.validateCycle23Results(report, m)).toThrow();
    else
      expect(checker.validateCycle23Results(report, m)).toMatchObject({
        passed: m.combined_evidence.application_cases,
        suites: 7,
      });
  });
  it('duplicate full names across different suite files cannot pass a matching rollup', () => {
    const r = application();
    r.testResults[1].assertionResults[0].fullName =
      r.testResults[0].assertionResults[0].fullName;
    expect(() =>
      checker.validateCycle23ApplicationReport(r, {
        'tests/cycle23-fixture-one.test.ts': 2,
        'tests/cycle23-fixture-two.test.ts': 1,
      }),
    ).toThrow();
  });
  it('an empty or foreign generic inventory cannot validate assertions', () => {
    expect(() =>
      checker.validateCycle23ApplicationReport(application(), {}),
    ).toThrow();
    expect(() =>
      checker.validateCycle23ApplicationReport(application(), {
        'tests/foreign.test.ts': 3,
      }),
    ).toThrow();
  });
  it('workflow checks full-history exact sources and local bounded tests without protected baselines or execution', () => {
    const text = readFileSync(
      '.github/workflows/cycle23-integration.yml',
      'utf8',
    );
    expect(text).toContain('fetch-depth: 0');
    expect(text).toContain("node-version: '24'");
    expect(text).toContain(
      'node scripts/check-cycle23.mjs --require-independent',
    );
    expect(text).toContain('tests/cycle23*.test.ts');
    expect(text).toContain(
      'playwright.cycle23.config.ts --list --reporter=json > artifacts/cycle23/browser-development-collection.json',
    );
    expect(text).toContain(
      'playwright.cycle23-off.config.ts --list --reporter=json > artifacts/cycle23/browser-production-collection.json',
    );
    expect(text).toContain(
      'tests/program/playwright.cycle23-repair-day.config.ts --workers=1',
    );
    expect(text).toContain('artifacts/cycle23/repair-clock/');
    expect(text).toContain('--complete');
    expect(text).not.toMatch(
      /workflow_dispatch|test:recovery|test:maintenance-native|supabase db|netlify deploy|gh pr merge/,
    );
  });
});
