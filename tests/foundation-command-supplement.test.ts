import { expect, it } from 'vitest';
type Report = ReturnType<typeof fixture>['report'];
const verifier: {
  validateDefaultBrowserReports: (
    c: Report,
    a: Report,
    i: string[],
    s: string,
    h: string,
  ) => Record<string, unknown>;
} = await import(
  new URL('../scripts/foundation-command-supplement.mjs', import.meta.url).href
);
const subject = '523afd4ef17d5502b6e0e39a4df86bdaa7bba23b',
  controller = 'a'.repeat(40);
function fixture() {
  const names = [
    'desktop',
    'tablet',
    'mobile',
    'desktop-journey',
    'tablet-journey',
    'mobile-journey',
  ];
  const inventory = Array.from(
    { length: 32 },
    (_, i) =>
      `tests/browser/${i === 0 ? 'cycle6-journey' : `fixture-${i}`}.spec.ts`,
  );
  const suites = inventory.map((path, i) => ({
    file: path.slice(14),
    specs: [
      {
        ok: true,
        line: 1,
        column: 1,
        title: `original fixture ${i}`,
        tests: names
          .filter((n) => n.endsWith('-journey') === (i === 0))
          .map((projectName) => ({
            projectName,
            timeout: 30000,
            expectedStatus: 'passed',
            status: 'expected',
            results: [
              {
                status: 'passed',
                retry: 0,
                duration: 4,
                errors: [] as unknown[],
              },
            ],
          })),
      },
    ],
  }));
  const report = {
    config: {
      projects: names.map((name) => ({
        name,
        timeout: 30000,
        retries: 0,
        repeatEach: 1,
      })),
      workers: 2,
      metadata: {
        gitCommit: { hash: subject },
        ci: { commitHash: controller },
      },
    },
    suites,
    errors: [] as unknown[],
    stats: { expected: 96, skipped: 0, unexpected: 0, flaky: 0 },
  };
  return { report, inventory };
}
it('accepts original declared subject/controller scopes without whole-Foundation acceptance', () => {
  const { report, inventory } = fixture();
  expect(
    verifier.validateDefaultBrowserReports(
      report,
      structuredClone(report),
      inventory,
      subject,
      controller,
    ),
  ).toEqual({
    collected: 96,
    passed: 96,
    declared_skipped: 0,
    declared_expected_failures: 0,
    source_files: 32,
    full_foundation_pass: false,
    operational_acceptance: false,
  });
});
it('retains an original declared skip separately, never as a passed assertion', () => {
  const { report, inventory } = fixture(),
    actual = structuredClone(report);
  report.suites[0].specs[0].tests[0].expectedStatus = 'skipped';
  const t = actual.suites[0].specs[0].tests[0];
  t.expectedStatus = 'skipped';
  t.status = 'skipped';
  t.results[0].status = 'skipped';
  actual.stats.expected = 95;
  actual.stats.skipped = 1;
  expect(
    verifier.validateDefaultBrowserReports(
      report,
      actual,
      inventory,
      subject,
      controller,
    ),
  ).toMatchObject({
    passed: 95,
    declared_skipped: 1,
    full_foundation_pass: false,
  });
});
it('preserves a literal original runtime override absent from list-only execution', () => {
  const { report, inventory } = fixture(),
    actual = structuredClone(report);
  for (const r of [report, actual]) {
    r.suites[1].file = 'contractor-phase-b.spec.ts';
    r.suites[1].specs[0].line = 89;
  }
  inventory[1] = 'tests/browser/contractor-phase-b.spec.ts';
  for (const t of actual.suites[1].specs[0].tests) t.timeout = 120000;
  expect(
    verifier.validateDefaultBrowserReports(
      report,
      actual,
      inventory,
      subject,
      controller,
    ),
  ).toMatchObject({ passed: 96, full_foundation_pass: false });
});
it('does not apply an original override to a different declaration position', () => {
  const { report, inventory } = fixture(),
    actual = structuredClone(report);
  for (const r of [report, actual]) {
    r.suites[1].file = 'contractor-phase-b.spec.ts';
    r.suites[1].specs[0].line = 90;
  }
  inventory[1] = 'tests/browser/contractor-phase-b.spec.ts';
  for (const t of actual.suites[1].specs[0].tests) t.timeout = 120000;
  expect(() =>
    verifier.validateDefaultBrowserReports(
      report,
      actual,
      inventory,
      subject,
      controller,
    ),
  ).toThrow();
});
for (const mode of [
  'missing-case',
  'duplicate',
  'foreign-file',
  'different-title',
  'different-project',
  'changed-budget',
  'project-budget',
  'retry',
  'failure',
  'unplanned-skip',
  'wrong-subject',
  'wrong-controller',
  'null-counter',
  'workers',
  'suite-error',
  'flaky',
  'missing-timeout',
  'missing-identity',
  'false-spec-ok',
  'collection-error',
] as const) {
  it(`rejects ${mode} without changing source assertions`, () => {
    const { report, inventory } = fixture(),
      actual = structuredClone(report),
      t = actual.suites[0].specs[0].tests[0];
    if (mode === 'missing-case') actual.suites[0].specs[0].tests.pop();
    if (mode === 'duplicate')
      actual.suites.push(structuredClone(actual.suites[0]));
    if (mode === 'foreign-file') actual.suites[0].file = '../private.spec.ts';
    if (mode === 'different-title')
      actual.suites[0].specs[0].title = 'substituted';
    if (mode === 'different-project') t.projectName = 'outside';
    if (mode === 'changed-budget') t.timeout = 60000;
    if (mode === 'project-budget') actual.config.projects[0].timeout = 60000;
    if (mode === 'retry') t.results[0].retry = 1;
    if (mode === 'failure') t.results[0].status = 'failed';
    if (mode === 'unplanned-skip') t.expectedStatus = 'skipped';
    if (mode === 'wrong-subject')
      actual.config.metadata.gitCommit.hash = controller;
    if (mode === 'wrong-controller')
      actual.config.metadata.ci.commitHash = subject;
    if (mode === 'null-counter')
      Object.assign(actual.stats, { unexpected: null });
    if (mode === 'workers') actual.config.workers = 1;
    if (mode === 'suite-error') actual.errors.push({ message: 'failed' });
    if (mode === 'flaky') actual.stats.flaky = 1;
    if (mode === 'missing-timeout')
      for (const r of [report, actual])
        Object.assign(r.suites[0].specs[0].tests[0], { timeout: undefined });
    if (mode === 'missing-identity')
      for (const r of [report, actual])
        Object.assign(r.suites[0].specs[0], { line: undefined });
    if (mode === 'false-spec-ok') actual.suites[0].specs[0].ok = false;
    if (mode === 'collection-error')
      report.errors.push({ message: 'collection failed' });
    expect(() =>
      verifier.validateDefaultBrowserReports(
        report,
        actual,
        inventory,
        subject,
        controller,
      ),
    ).toThrow();
  });
}
it('a declared skip cannot conceal an actual failed/retried/error result', () => {
  for (const bad of ['failed', 'retry', 'error']) {
    const { report, inventory } = fixture(),
      actual = structuredClone(report);
    report.suites[0].specs[0].tests[0].expectedStatus = 'skipped';
    const t = actual.suites[0].specs[0].tests[0];
    t.expectedStatus = 'skipped';
    t.status = 'skipped';
    t.results[0].status = 'skipped';
    actual.stats.expected = 95;
    actual.stats.skipped = 1;
    if (bad === 'failed') t.results[0].status = 'failed';
    if (bad === 'retry') t.results[0].retry = 1;
    if (bad === 'error') t.results[0].errors.push({ message: 'error' });
    expect(() =>
      verifier.validateDefaultBrowserReports(
        report,
        actual,
        inventory,
        subject,
        controller,
      ),
    ).toThrow();
  }
});
it('error collections require actual arrays, not length-like impostors', () => {
  for (const replacement of ['', { length: 0 }])
    for (const side of ['collection', 'actual']) {
      const { report, inventory } = fixture(),
        actual = structuredClone(report);
      Object.assign(side === 'collection' ? report : actual, {
        errors: replacement,
      });
      expect(() =>
        verifier.validateDefaultBrowserReports(
          report,
          actual,
          inventory,
          subject,
          controller,
        ),
      ).toThrow();
    }
});
