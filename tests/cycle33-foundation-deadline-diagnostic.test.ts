import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const e = await import(
  new URL(
    '../scripts/cycle33-foundation-deadline-diagnostic.mjs',
    import.meta.url,
  ).href
);
type Case = {
  id: string;
  fullName: string;
  jsonName: string;
  mode: string;
  timeout: number;
  retry: number;
  repeat: number;
};
type File = { file: string; cases: Case[] };
const files = e.cohort.files as File[];
function fixture() {
  const binding = {
    subject: {
      source: e.cohort.source,
      tree: e.cohort.tree,
      tracked_clean: true,
    },
    driver: {
      source: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      tracked_clean: true,
    },
  };
  const plan = {
    scope: e.scope,
    original_coverage_admitted: false,
    binding,
    file_count: 7,
    case_count: 233,
    collected: files.flatMap((f) =>
      f.cases.map((c) => ({ file: f.file, name: c.fullName })),
    ),
  };
  const report = {
    binding: structuredClone(binding),
    binding_after: structuredClone(binding),
    reason: 'passed',
    errors: 0,
    config: {
      testTimeout: 30000,
      hookTimeout: 30000,
      maxWorkers: 1,
      retry: 0,
      shard: { index: 1, count: 1 },
    },
    samples: Array.from({ length: 16 }, (_, at_ms) => ({
      at_ms,
      cpu_count: 2,
      load: [1, 1, 1],
      memory_free: 1,
      memory_total: 2,
      processes: 3,
      resident_bytes: 4,
      sampled_process_limit: 1024,
      resident_sample_truncated: false,
      observer_cpu: { user: 1, system: 1 },
      observer_memory: {
        rss: 1,
        heapTotal: 1,
        heapUsed: 1,
        external: 1,
        arrayBuffers: 1,
      },
    })),
    modules: files.map((f) => ({
      file: f.file,
      ended: true,
      errors: 0,
      collected: structuredClone(f.cases),
      results: f.cases.map((c) => ({
        ...c,
        status: 'passed',
        errors: 0,
        error_evidence: [] as Record<string, unknown>[],
        duration_ms: 1,
      })),
    })),
  };
  const raw = {
    success: true,
    numTotalTests: 233,
    numPassedTests: 233,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: files.map((f) => ({
      name: process.cwd() + '/' + f.file,
      assertionResults: f.cases.map((c) => ({
        fullName: c.jsonName,
        status: 'passed',
        failureMessages: [] as string[],
      })),
    })),
  };
  return { binding, plan, report, raw };
}
function validate(f: ReturnType<typeof fixture>) {
  return e.validateDiagnostic(f.plan, f.report, f.raw, f.binding);
}
describe('isolated deadline diagnostic evidence parser fixtures, not original test execution', () => {
  it('requires the original233-case seven-file collection and explicitly denies original coverage promotion', () => {
    const f = fixture();
    expect(validate(f)).toMatchObject({
      total: 233,
      passed: 233,
      original_coverage_admitted: false,
      original_max_workers: 4,
      actual_max_workers: 1,
    });
  });
  it('records complete failures distinctly without relabeling them PASS', () => {
    const f = fixture();
    f.report.reason = 'failed';
    const c = f.report.modules[0].results[0];
    c.status = 'failed';
    c.errors = 1;
    c.error_evidence = [{ classification: 'EXPLICIT_TEST_TIMEOUT' }];
    f.raw.success = false;
    f.raw.numPassedTests--;
    f.raw.numFailedTests++;
    f.raw.testResults[0].assertionResults[0].status = 'failed';
    f.raw.testResults[0].assertionResults[0].failureMessages = [
      'parser fixture',
    ];
    expect(validate(f)).toMatchObject({
      verdict: 'COMPLETE_DIAGNOSTIC_WITH_RECORDED_FAILURES',
      failed: 1,
      original_coverage_admitted: false,
    });
  });
  for (const [name, mutate] of [
    [
      'missing whole file',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules.pop();
      },
    ],
    [
      'duplicate original file',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[1] = f.report.modules[0];
      },
    ],
    [
      'foreign file',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].file = 'tests/foreign.test.ts';
      },
    ],
    [
      'missing case',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].results.pop();
      },
    ],
    [
      'duplicate native ID',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].results[1].id = f.report.modules[0].results[0].id;
      },
    ],
    [
      'changed source identity',
      (f: ReturnType<typeof fixture>) => {
        f.report.binding.subject.source = 'c'.repeat(40);
      },
    ],
    [
      'changed transitive subject tree',
      (f: ReturnType<typeof fixture>) => {
        f.report.binding_after.subject.tree = 'c'.repeat(40);
      },
    ],
    [
      'dirty subject',
      (f: ReturnType<typeof fixture>) => {
        f.report.binding_after.subject.tracked_clean = false;
      },
    ],
    [
      'driver substitution',
      (f: ReturnType<typeof fixture>) => {
        f.report.binding_after.driver.source = 'c'.repeat(40);
      },
    ],
    [
      'changed test budget',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].results[0].timeout = 60000;
      },
    ],
    [
      'changed hook budget',
      (f: ReturnType<typeof fixture>) => {
        f.report.config.hookTimeout = 60000;
      },
    ],
    [
      'different actual worker count',
      (f: ReturnType<typeof fixture>) => {
        f.report.config.maxWorkers = 4;
      },
    ],
    [
      'retry',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].results[0].retry = 1;
      },
    ],
    [
      'repeat',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].results[0].repeat = 1;
      },
    ],
    [
      'new skip',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].results[0].mode = 'skip';
      },
    ],
    [
      'cancelled run',
      (f: ReturnType<typeof fixture>) => {
        f.report.reason = 'interrupted';
      },
    ],
    [
      'unfinished module',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].ended = false;
      },
    ],
    [
      'truthy module end marker',
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.report.modules[0], { ended: 'true' });
      },
    ],
    [
      'nonterminal result',
      (f: ReturnType<typeof fixture>) => {
        f.report.modules[0].results[0].status = 'pending';
      },
    ],
    [
      'raw JSON omission',
      (f: ReturnType<typeof fixture>) => {
        f.raw.testResults.pop();
      },
    ],
    [
      'raw JSON case substitution',
      (f: ReturnType<typeof fixture>) => {
        f.raw.testResults[0].assertionResults[0].fullName = 'foreign';
      },
    ],
    [
      'truthy raw success',
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.raw, { success: 'true' });
      },
    ],
    [
      'raw skipped count',
      (f: ReturnType<typeof fixture>) => {
        f.raw.numPendingTests = 1;
      },
    ],
    [
      'missing plan collection',
      (f: ReturnType<typeof fixture>) => {
        f.plan.collected.pop();
      },
    ],
    [
      'missing resource observation',
      (f: ReturnType<typeof fixture>) => {
        f.report.samples.pop();
      },
    ],
    [
      'invalid resource observation',
      (f: ReturnType<typeof fixture>) => {
        f.report.samples[0].memory_free = -1;
      },
    ],
    [
      'original coverage promotion',
      (f: ReturnType<typeof fixture>) => {
        f.plan.original_coverage_admitted = true;
      },
    ],
  ] as const)
    it(`denies ${name}`, () => {
      const f = fixture();
      mutate(f);
      expect(() => validate(f)).toThrow();
    });
  it('freezes original source, file and case pins recursively', () => {
    expect(Object.isFrozen(e.cohort)).toBe(true);
    expect(Object.isFrozen(e.cohort.files[0].cases[0])).toBe(true);
    expect(() => {
      e.cohort.source = 'c'.repeat(40);
    }).toThrow();
    expect(() => {
      e.cohort.files[0].cases[0].timeout = 60000;
    }).toThrow();
  });
  it('compares full dynamic collection including multiplicity', () => {
    const rows = files.flatMap((f) =>
      f.cases.map((c) => ({ file: f.file, name: c.fullName })),
    );
    expect(e.validateCollection(rows)).toBe(233);
    rows[1] = rows[0];
    expect(() => e.validateCollection(rows)).toThrow();
  });
  it('preserves the original workflow and config while selecting whole files in the separate diagnostic', () => {
    const workflow = readFileSync(
      '.github/workflows/cycle33-isolated-deadline-diagnostic.yml',
      'utf8',
    );
    for (const f of e.cohort.files) expect(workflow).toContain(f.file);
    expect(workflow).toContain('ref: ' + e.cohort.source);
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('timeout-minutes: 45');
    expect(workflow).toContain('--maxWorkers=1 --shard=1/1');
    expect(workflow).not.toMatch(
      /testNamePattern|--retry|--testTimeout|--hookTimeout|continue-on-error/,
    );
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('maxWorkers: 4');
  });
});
