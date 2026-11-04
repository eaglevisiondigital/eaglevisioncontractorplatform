import { expect, it } from 'vitest';
const { reconcileParentBrowser } = await import(
  new URL('../scripts/reconcile-cycle29-parent-browser.mjs', import.meta.url)
    .href
);
function artifacts() {
  const specs = Array.from({ length: 399 }, (_, n) => ({
    file: 'original.spec.ts',
    line: n + 1,
    column: 1,
    title: `original ${n}`,
    tests: [
      {
        projectId: 'desktop',
        timeout: 30000,
        expectedStatus: 'passed',
        status: 'expected',
        results: [{ retry: 0, status: 'passed', duration: 1 }],
      },
    ],
  }));
  return [1, 2, 3, 4].map((shard) => {
    const rows = specs.filter((_, n) => n % 4 === shard - 1);
    return {
      source: {
        source_commit: '5f74b8ff5385560330cb94717c17338ed0c10f44',
        config_sha256:
          'd15e9c4d8f4984878a5cf60bb50e853a1c4fbc9b3de98f380850cd375e553078',
        shard,
        shards: 4,
        scope: 'ORIGINAL_BROWSER_ONLY_NOT_FOUNDATION_PASS',
      },
      list: { specs: structuredClone(specs), errors: [] as unknown[] },
      results: {
        specs: rows,
        config: { workers: 2, shard: { current: shard, total: 4 } },
        errors: [],
        stats: { expected: rows.length, unexpected: 0, skipped: 0, flaky: 0 },
      },
    };
  });
}
it('closes only all399 exact disjoint completed original attempts, never Foundation', () => {
  expect(reconcileParentBrowser(artifacts())).toMatchObject({
    collected: 399,
    passed: 399,
    all_four_passed: true,
    foundation_pass: false,
  });
});
it('retains a failed original assertion even when the full collection completed', () => {
  const a = artifacts(),
    r = a[0].results;
  r.specs[0].tests[0].status = 'unexpected';
  r.specs[0].tests[0].results[0].status = 'timedOut';
  r.stats.expected--;
  r.stats.unexpected++;
  expect(reconcileParentBrowser(a)).toMatchObject({
    passed: 398,
    failed: 1,
    all_four_passed: false,
    outcome: 'ORIGINAL_FAILURES_RETAINED_COVERAGE_NOT_CLOSED',
  });
});
it.each([
  'missing_artifact',
  'wrong_source',
  'wrong_config',
  'wrong_shard',
  'missing_case',
  'duplicate_case',
  'changed_inventory',
  'retry',
  'skip',
  'summary',
  'global_error',
  'collection_error',
  'budget',
  'missing_budget',
  'expectation',
  'runner',
])('rejects incomplete or contradictory evidence: %s', (mode) => {
  const a = artifacts(),
    r = a[0].results;
  if (mode === 'missing_artifact') a.pop();
  if (mode === 'wrong_source') a[0].source.source_commit = 'a'.repeat(40);
  if (mode === 'wrong_config') a[0].source.config_sha256 = 'b'.repeat(64);
  if (mode === 'wrong_shard') a[0].source.shard = 2;
  if (mode === 'missing_case') {
    r.specs.pop();
    r.stats.expected--;
  }
  if (mode === 'duplicate_case') r.specs.push(r.specs[0]);
  if (mode === 'changed_inventory') a[0].list.specs = a[0].list.specs.slice(1);
  if (mode === 'retry') r.specs[0].tests[0].results[0].retry = 1;
  if (mode === 'skip') r.specs[0].tests[0].results[0].status = 'skipped';
  if (mode === 'summary') r.stats.expected--;
  if (mode === 'global_error')
    (r.errors as unknown[]).push({ message: 'interrupted' });
  if (mode === 'collection_error')
    a[0].list.errors.push({ message: 'collection failed' });
  if (mode === 'missing_budget') {
    a[0].list.specs[0].tests[0].timeout = 0;
    r.specs[0].tests[0].timeout = 0;
  }
  if (mode === 'budget') r.specs[0].tests[0].timeout = 90000;
  if (mode === 'expectation') r.specs[0].tests[0].expectedStatus = 'failed';
  if (mode === 'runner') r.config.workers = 3;
  expect(() => reconcileParentBrowser(a)).toThrow();
});
