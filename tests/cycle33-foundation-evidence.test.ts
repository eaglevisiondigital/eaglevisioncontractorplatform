import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
const evidence = await import(
  new URL('../scripts/cycle33-foundation-evidence.mjs', import.meta.url).href
);
const fixtureBinding = {
  source: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  files: { lock: 'c'.repeat(64) },
};
function application() {
  const collected = [
    {
      id: 'one',
      fullName: 'same original label',
      jsonName: 'same original label',
      mode: 'run',
      timeout: 30000,
    },
    {
      id: 'two',
      fullName: 'same original label',
      jsonName: 'same original label',
      mode: 'run',
      timeout: 30000,
    },
    {
      id: 'three',
      fullName: 'declared native skip',
      jsonName: 'declared native skip',
      mode: 'skip',
      timeout: 30000,
    },
  ];
  const plan = {
    kind: 'application',
    index: 1,
    count: 8,
    binding: fixtureBinding,
    selected: ['tests/example.test.ts'],
  };
  const report = {
    reason: 'passed',
    errors: 0,
    binding: fixtureBinding,
    config: {
      testTimeout: 30000,
      hookTimeout: 30000,
      maxWorkers: 4,
      retry: 0,
      shard: { index: 1, count: 8 },
    },
    modules: [
      {
        file: 'tests/example.test.ts',
        ended: true,
        errors: 0,
        collected,
        results: collected.map((c) => ({
          ...c,
          status: c.mode === 'run' ? 'passed' : 'skipped',
          retry: 0,
          repeat: 0,
          errors: 0,
        })),
      },
    ],
  };
  const raw = {
    success: true,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    numTotalTests: 3,
    numPassedTests: 2,
    numPendingTests: 1,
    numTodoTests: 0,
    testResults: [
      {
        name: process.cwd() + '/tests/example.test.ts',
        assertionResults: collected.map((c) => ({
          fullName: c.jsonName,
          status: c.mode === 'run' ? 'passed' : 'skipped',
          failureMessages: [],
        })),
      },
    ],
  };
  return { plan, report, raw };
}
function browser() {
  const c = {
    id: 'native-id\0desktop',
    file: 'source.spec.ts',
    line: 12,
    title: 'original case',
    project: 'desktop',
    timeout: 30000,
    runtime_timeout: 30000,
    expectedStatus: 'passed',
  };
  return {
    plan: { kind: 'browser', index: 1, count: 3, selected: [c] },
    report: {
      config: { shard: { current: 1, total: 3 } },
      stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
      errors: [],
      suites: [
        {
          specs: [
            {
              id: 'native-id',
              file: c.file,
              line: c.line,
              title: c.title,
              tests: [
                {
                  projectName: c.project,
                  timeout: c.timeout,
                  expectedStatus: c.expectedStatus,
                  status: 'expected',
                  results: [{ status: 'passed', retry: 0, errors: [] }],
                },
              ],
            },
          ],
          suites: [],
        },
      ],
    },
  };
}
function combined() {
  const files = Array.from(
      { length: 8 },
      (_, i) => `tests/original-${i}.test.ts`,
    ),
    cases = Array.from({ length: 3 }, (_, i) => ({ id: `browser-${i}` }));
  return {
    jobs: {
      preflight: 'success',
      application: 'success',
      browser: 'success',
    },
    reports: ['application', 'browser'].flatMap((kind) =>
      Array.from({ length: kind === 'application' ? 8 : 3 }, (_, i) => ({
        kind,
        index: i + 1,
        count: kind === 'application' ? 8 : 3,
        verdict: 'EXACT_SHARD_COMPLETE',
        binding: fixtureBinding,
        application_files: { 'tests/a.test.ts': 'd'.repeat(64) },
        browser_files: { 'tests/browser/a.spec.ts': 'e'.repeat(64) },
        full: kind === 'application' ? files : cases,
        selected: kind === 'application' ? [files[i]] : [cases[i]],
        ids: [kind + i],
        passed: 1,
        declared_skipped: 0,
      })),
    ),
  };
}
describe('Foundation exact native coverage admission', () => {
  it('retains finite collection failure fields and actual output hashes without raw text', () => {
    const stdout = JSON.stringify({
      errors: [{ name: 'Error', message: 'fatal: invalid object name' }],
    });
    const d = evidence.nativeFailureEvidence({
      status: 1,
      stdout,
      stderr: 'original stderr',
    });
    expect(d).toMatchObject({
      child_exit: 1,
      parsed_json: true,
      native_error_count: 1,
      known_error_tags: ['MISSING_GIT_OBJECT'],
      raw_stdout_or_stderr_retained: false,
      argv_or_environment_retained: false,
    });
    expect(d.stdout_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(d.stdout_bytes).toBe(Buffer.byteLength(stdout));
    expect(JSON.stringify(d)).not.toContain('original stderr');
  });
  it('hashes credential-shaped collection errors and unrecognized classes', () => {
    const d = evidence.nativeFailureEvidence({
      status: 1,
      stdout: JSON.stringify({
        errors: [
          {
            name: 'PrivateCredentialClass',
            message: 'https://name:password@example.invalid/private',
            stack: 'secret environment',
          },
        ],
      }),
      stderr: 'hidden-value',
    });
    expect(d.native_errors[0].class).toBe('UNKNOWN');
    expect(JSON.stringify(d)).not.toMatch(
      /password|example|secret|PrivateCredentialClass|hidden-value/,
    );
  });
  it('bounds collection errors to32 without omitting the original count', () => {
    const d = evidence.nativeFailureEvidence({
      status: 1,
      stdout: JSON.stringify({
        errors: Array.from({ length: 40 }, () => ({
          name: 'Error',
          message: 'fixture',
        })),
      }),
      stderr: '',
    });
    expect(d.native_error_count).toBe(40);
    expect(d.native_errors).toHaveLength(32);
    expect(d.native_errors_truncated).toBe(true);
  });
  it('keeps non-JSON failure output hashed and unclassified', () => {
    const d = evidence.nativeFailureEvidence({
      status: null,
      signal: 'SIGTERM',
      stdout: 'not-json',
      stderr: 'some output',
      error: { code: 'UNKNOWN_PRIVATE_CODE' },
    });
    expect(d).toMatchObject({
      child_exit: null,
      child_signal: 'SIGTERM',
      child_error_code: null,
      parsed_json: false,
      native_error_count: 0,
      native_errors: [],
    });
    expect(JSON.stringify(d)).not.toContain('UNKNOWN_PRIVATE_CODE');
  });
  it('distinguishes a recorded buffer-limit condition without broad raw fallback', () => {
    const d = evidence.nativeFailureEvidence({
      status: null,
      stdout: 'partial',
      stderr: '',
      error: { code: 'ENOBUFS' },
    });
    expect(d.child_error_code).toBe('ENOBUFS');
    expect(d.raw_stdout_or_stderr_retained).toBe(false);
  });
  it('restores full history only in the additive browser job before guarded collection', () => {
    const workflow = readFileSync(
      '.github/workflows/cycle33-foundation-runtime.yml',
      'utf8',
    );
    const browser = workflow.slice(
      workflow.indexOf('  browser:'),
      workflow.indexOf('  # This separately named'),
    );
    expect(browser).toMatch(
      /actions\/checkout@v4\n\s+with:\n\s+fetch-depth: 0/,
    );
    expect(browser.indexOf('fetch-depth: 0')).toBeLessThan(
      browser.indexOf(' plan browser '),
    );
    expect(workflow.match(/fetch-depth: 0/g)).toHaveLength(1);
  });

  it('records only explicit native timeout and finite assertion classifications', async () => {
    const { classifyErrors } = await import(
      new URL('../scripts/cycle33-foundation-reporter.mjs', import.meta.url)
        .href
    );
    expect(
      classifyErrors([
        { name: 'Error', message: 'Test timed out in 30000ms.' },
      ])[0],
    ).toMatchObject({
      classification: 'EXPLICIT_TEST_TIMEOUT',
      timeout_ms: 30000,
    });
    expect(
      classifyErrors([
        { name: 'AssertionError', message: 'Synthetic mismatch' },
      ])[0].classification,
    ).toBe('ASSERTION_FAILURE');
  });
  it('never forwards unknown error names, messages or credential-shaped text', async () => {
    const { classifyErrors } = await import(
      new URL('../scripts/cycle33-foundation-reporter.mjs', import.meta.url)
        .href
    );
    const result = classifyErrors([
      {
        name: 'secret-name',
        message: 'https://name:password@example.invalid/private',
      },
    ]);
    expect(result[0]).toMatchObject({
      class: 'UNCLASSIFIED',
      classification: 'OTHER_RECORDED_ERROR',
      timeout_ms: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret-name|password|example|private|https/,
    );
    expect(result[0].message_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('admits the complete original command chain and rejects silent command drift', () => {
    const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts
      .check;
    expect(() => evidence.requireCheckScript(script)).not.toThrow();
    expect(() =>
      evidence.requireCheckScript(
        script.replace('npm run features:check && ', ''),
      ),
    ).toThrow();
  });
  it('refuses an incomplete native shard union', () => {
    expect(() => evidence.requireUnion([['a']], ['a', 'b'])).toThrow();
  });
  it('rejects overlap even when the resulting set would cover every file', () => {
    expect(() =>
      evidence.requireUnion([['a'], ['a', 'b']], ['a', 'b']),
    ).toThrow();
  });
  it('accepts an exact independent partition', () => {
    expect(evidence.requireUnion([['b'], ['a']], ['a', 'b'])).toBe(2);
  });
  it('preserves duplicate original fullNames as separate native IDs and declared skips separately', () => {
    const f = application();
    expect(evidence.validateApplication(f.plan, f.report, f.raw)).toMatchObject(
      { passed: 2, declared_skipped: 1 },
    );
  });
  it('retains native todo distinctly from skip and pass', () => {
    const f = application();
    f.report.modules[0].collected[2].mode = 'todo';
    f.report.modules[0].results[2].mode = 'todo';
    f.raw.testResults[0].assertionResults[2].status = 'todo';
    f.raw.numPendingTests = 0;
    f.raw.numTodoTests = 1;
    expect(
      evidence.validateApplication(f.plan, f.report, f.raw).declared_skipped,
    ).toBe(1);
  });
  it.each(['interrupted', 'failed', 'NOT_TERMINAL'])(
    'denies %s application outcome',
    (reason) => {
      const f = application();
      f.report.reason = reason;
      expect(() =>
        evidence.validateApplication(f.plan, f.report, f.raw),
      ).toThrow();
    },
  );
  it('refuses a truthy non-boolean raw success marker', () => {
    const f = application();
    Object.assign(f.raw, { success: 'true' });
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it('refuses a truthy non-boolean module completion marker', () => {
    const f = application();
    Object.assign(f.report.modules[0], { ended: 'true' });
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it('denies a lost dynamic native case even if the raw summary is green', () => {
    const f = application();
    f.report.modules[0].results.pop();
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it('denies a duplicate native ID despite matching names and counts', () => {
    const f = application();
    f.report.modules[0].collected[1].id = 'one';
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it('denies a dynamically skipped original run case', () => {
    const f = application();
    f.report.modules[0].results[0].status = 'skipped';
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it('denies skipped case promotion to pass', () => {
    const f = application();
    f.report.modules[0].results[2].status = 'passed';
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it.each(['retry', 'repeat', 'errors'])(
    'denies observed application %s',
    (field) => {
      const f = application();
      Object.assign(f.report.modules[0].results[0], { [field]: 1 });
      expect(() =>
        evidence.validateApplication(f.plan, f.report, f.raw),
      ).toThrow();
    },
  );
  it.each(['testTimeout', 'hookTimeout', 'maxWorkers'])(
    'denies changed original %s',
    (field) => {
      const f = application();
      Object.assign(f.report.config, { [field]: 99 });
      expect(() =>
        evidence.validateApplication(f.plan, f.report, f.raw),
      ).toThrow();
    },
  );
  it('denies changed case timeout between collection and outcome', () => {
    const f = application();
    f.report.modules[0].results[0].timeout = 60000;
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it('denies a dropped duplicate-name raw assertion', () => {
    const f = application();
    f.raw.testResults[0].assertionResults.pop();
    expect(() =>
      evidence.validateApplication(f.plan, f.report, f.raw),
    ).toThrow();
  });
  it('accepts only the hash-bound original repair body runtime override while retaining list budget', () => {
    const f = browser(),
      title =
        'all companies review exact published evidence, prepare one repair draft, edit scope and navigate both directions';
    Object.assign(f.plan.selected[0], {
      file: 'repair-draft.spec.ts',
      title,
      runtime_timeout: 90000,
    });
    Object.assign(f.report.suites[0].specs[0], {
      file: 'repair-draft.spec.ts',
      title,
    });
    f.report.suites[0].specs[0].tests[0].timeout = 90000;
    expect(evidence.validateBrowser(f.plan, f.report).passed).toBe(1);
    expect(f.plan.selected[0].timeout).toBe(30000);
  });
  it('rejects an increased runtime budget for an unknown original title', () => {
    const f = browser();
    f.report.suites[0].specs[0].tests[0].timeout = 90000;
    expect(() => evidence.validateBrowser(f.plan, f.report)).toThrow();
  });
  it('refuses a fabricated larger runtime budget in plan evidence for an unknown title', () => {
    const f = browser();
    f.plan.selected[0].runtime_timeout = 90000;
    f.report.suites[0].specs[0].tests[0].timeout = 90000;
    expect(() => evidence.validateBrowser(f.plan, f.report)).toThrow();
  });
  it('rejects a substituted original budget registry without evaluating it', () => {
    const bytes = readFileSync('scripts/reconcile-cycle29-parent-browser.mjs');
    expect(() =>
      evidence.parseOriginalBodyBudgets(
        Buffer.concat([bytes, Buffer.from('\n// changed')]),
      ),
    ).toThrow();
  });
  it('rejects missing or changed collected browser body hashes before coverage admission', () => {
    const path = 'tests/browser/fixture.spec.ts';
    const hashes = { [path]: '0'.repeat(64) };
    expect(() =>
      evidence.requireSourceFiles(hashes, [path], () =>
        Buffer.from('changed original body'),
      ),
    ).toThrow();
    expect(() =>
      evidence.requireSourceFiles({}, [path], () =>
        Buffer.from('original body'),
      ),
    ).toThrow();
  });
  it('rejects a mismatched original browser source binding across complete shards', () => {
    const f = combined();
    f.reports[1].browser_files = { 'tests/browser/a.spec.ts': 'f'.repeat(64) };
    expect(() => evidence.validateCombined(f.reports, f.jobs)).toThrow();
  });
  it('rejects changed original test bytes under an otherwise exact known override', () => {
    const row = {
      file: 'repair-draft.spec.ts',
      title:
        'all companies review exact published evidence, prepare one repair draft, edit scope and navigate both directions',
    };
    const read = (path: string) =>
      path.startsWith('scripts/')
        ? readFileSync(path)
        : Buffer.from('substituted body');
    expect(() => evidence.originalRuntimeTimeout(row, 30000, read)).toThrow();
  });
  it('admits only exact original finite brand suffixes for body overrides', () => {
    const title =
      'task lineage and financial requirements follow recorded canonical changes / ';
    expect(
      evidence.originalRuntimeTimeout(
        {
          file: 'cycle23-source-consistency.spec.ts',
          title: title + 'roofing-example',
        },
        30000,
      ),
    ).toBe(150000);
    expect(
      evidence.originalRuntimeTimeout(
        {
          file: 'cycle23-source-consistency.spec.ts',
          title: title + 'foreign-brand',
        },
        30000,
      ),
    ).toBe(30000);
  });
  it('admits original browser case identity, budget and single result', () => {
    const f = browser();
    expect(evidence.validateBrowser(f.plan, f.report).passed).toBe(1);
  });
  it.each(['timeout', 'projectName'])('denies changed browser %s', (field) => {
    const f = browser();
    Object.assign(f.report.suites[0].specs[0].tests[0], {
      [field]: field === 'timeout' ? 90000 : 'foreign',
    });
    expect(() => evidence.validateBrowser(f.plan, f.report)).toThrow();
  });
  it('denies a browser retry after eventual pass', () => {
    const f = browser();
    f.report.suites[0].specs[0].tests[0].results[0].retry = 1;
    expect(() => evidence.validateBrowser(f.plan, f.report)).toThrow();
  });
  it('denies a missing browser shard case', () => {
    const f = browser();
    f.report.suites[0].specs = [];
    expect(() => evidence.validateBrowser(f.plan, f.report)).toThrow();
  });
  it('admits all eleven native shards only with every actual supplement dependency successful', () => {
    const f = combined();
    expect(evidence.validateCombined(f.reports, f.jobs).verdict).toBe(
      'COMPLETE_CURRENT_SOURCE_ORIGINAL_VERIFY_SCOPE_SUPPLEMENT',
    );
  });
  it.each(['cancelled', 'failure', 'skipped', 'pending'])(
    'refuses %s required job',
    (status) => {
      const f = combined();
      f.jobs.preflight = status;
      expect(() => evidence.validateCombined(f.reports, f.jobs)).toThrow();
    },
  );
  it('refuses an absent browser result', () => {
    const f = combined();
    expect(() =>
      evidence.validateCombined(f.reports, {
        preflight: 'success',
        application: 'success',
      }),
    ).toThrow();
  });
  it('refuses a lost shard artifact', () => {
    const f = combined();
    f.reports.pop();
    expect(() => evidence.validateCombined(f.reports, f.jobs)).toThrow();
  });
  it('refuses repeated shard indices', () => {
    const f = combined();
    f.reports[1].index = 1;
    expect(() => evidence.validateCombined(f.reports, f.jobs)).toThrow();
  });
  it('refuses another source SHA or lock binding', () => {
    const f = combined();
    f.reports[1].binding = { ...fixtureBinding, source: 'e'.repeat(40) };
    expect(() => evidence.validateCombined(f.reports, f.jobs)).toThrow();
  });
  it('refuses a foreign extra artifact', () => {
    const f = combined();
    f.reports.push({ ...f.reports[0], kind: 'foreign' });
    expect(() => evidence.validateCombined(f.reports, f.jobs)).toThrow();
  });
  it('uses installed native Vitest partitioning, not a hand-authored filter', async () => {
    const { BaseSequencer } = await import('vitest/node');
    const specs = Array.from({ length: 355 }, (_, i) => ({
      moduleId: process.cwd() + '/tests/fixture-' + i + '.test.ts',
    }));
    const pieces = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        new BaseSequencer({
          config: { root: process.cwd(), shard: { index: i + 1, count: 8 } },
        } as never).shard(specs as never),
      ),
    );
    expect(
      evidence.requireUnion(
        pieces.map((p) => p.map((s) => s.moduleId)),
        specs.map((s) => s.moduleId),
      ),
    ).toBe(355);
  });
  it('keeps original postgres17 bytes and every original npm check component and budget', () => {
    const frozen = readFileSync('.github/workflows/ci.yml', 'utf8');
    const current = readFileSync(
      '.github/workflows/cycle33-foundation-runtime.yml',
      'utf8',
    );
    const original = execFileSync(
      'git',
      [
        'show',
        '0597bb3330f22d69f68a67098e950693e0648172:.github/workflows/ci.yml',
      ],
      { encoding: 'utf8' },
    );
    expect(frozen).toBe(original);
    expect(current).not.toContain('  postgres17:');
    expect(current).toContain('needs: [preflight, application, browser]');
    expect(current).toContain('fail-fast: false');
    expect(current).not.toMatch(
      /--(?:testTimeout|hookTimeout|retry|maxWorkers|exclude|testNamePattern)|timeout-minutes: (?:4[6-9]|[5-9]\d)/,
    );
    for (const script of evidence.checkCommands.filter(
      (s: string) => s !== 'test',
    ))
      expect(current).toContain('npm run ' + script);
    expect(current).toContain('npx vitest run --shard=${{ matrix.shard }}/8');
    expect(current).toContain(
      'npx playwright test --shard=${{ matrix.shard }}/3',
    );
  });
});
