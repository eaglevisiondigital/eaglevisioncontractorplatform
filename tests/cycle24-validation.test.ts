import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
type Pin = { path: string; sha256: string; blob: string };
type Manifest = Record<string, unknown> & {
  packages: { head_commit: string; owned_files: Pin[] }[];
  runtime_files: Pin[];
};
interface Ports {
  read: (path: string) => Buffer;
  git: (commit: string, path: string) => Buffer;
  parent: (commit: string) => string;
  delta: (commit: string) => string;
  requireIndependent?: boolean;
}
const checker: {
  validateCycle24Manifest: (m: unknown, p: Ports) => unknown;
  validateCycle24ApplicationReport: (r: unknown) => unknown;
  cycle24ApplicationSuites: () => Record<string, number>;
  assertCycle24ExecutionCommit: (commit: string) => void;
  validateCycle24CriticalSources: (p: Pick<Ports, 'read' | 'git'>) => unknown;
} = await import(new URL('../scripts/check-cycle24.mjs', import.meta.url).href);
const cache = new Map<string, Buffer>();
function cached(key: string, fn: () => Buffer) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key)!;
}
const ports: Ports = {
  read: (p) => cached(p, () => readFileSync(p)),
  git: (c, p) =>
    cached(`${c}:${p}`, () => execFileSync('git', ['show', `${c}:${p}`])),
  parent: (c) =>
    cached(`parent:${c}`, () =>
      execFileSync('git', ['show', '--no-patch', '--format=%P', c]),
    )
      .toString()
      .trim(),
  delta: (c) =>
    cached(`delta:${c}`, () =>
      execFileSync('git', [
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '--no-renames',
        '-r',
        c,
      ]),
    )
      .toString()
      .trim()
      .split('\n')
      .sort()
      .join('\n'),
};
const fresh = () =>
  JSON.parse(
    readFileSync('docs/program/CYCLE24_SOURCE_MANIFEST.json', 'utf8'),
  ) as Manifest;
it('admits only six exact bounded published sources and their declared frozen capture scope', () => {
  expect(checker.validateCycle24Manifest(fresh(), ports)).toMatchObject({
    packages: 6,
    retained_author_files: 523,
    operational_ready: false,
    restore_adapter: false,
  });
});
it.each([
  ['parent_commit', '0'.repeat(40)],
  ['coordination_draft_pr', 1],
  ['operational_ready', true],
  ['restore_adapter', true],
  ['customer_request_native_cas', true],
  ['customer_request_durable_receipt', true],
  ['maintenance_plan_cancellation', 'SUPPORTED'],
  ['physical_recovery', 'PASS'],
])('rejects forged authority/source field %s', (key, value) => {
  const m = fresh();
  m[key] = value;
  expect(() => checker.validateCycle24Manifest(m, ports)).toThrow();
});
it('rejects an omitted independent source package', () => {
  const m = fresh();
  m.packages.pop();
  expect(() => checker.validateCycle24Manifest(m, ports)).toThrow();
});
it('rejects substitution of a newer unreviewed author head', () => {
  const m = fresh();
  m.packages[0].head_commit = '1'.repeat(40);
  expect(() => checker.validateCycle24Manifest(m, ports)).toThrow();
});
it('rejects a private or unrequested file without reading that path', () => {
  const m = fresh();
  m.packages[0].owned_files[0].path = '/private/unrequested';
  const read = (p: string) => {
    if (p === '/private/unrequested') throw Error('Private read attempted');
    return ports.read(p);
  };
  expect(() => checker.validateCycle24Manifest(m, { ...ports, read })).toThrow(
    'source',
  );
});
it('rejects a replaced current source even when the declared hash is forged', () => {
  const m = fresh();
  m.packages[0].owned_files[0].sha256 = '0'.repeat(64);
  expect(() => checker.validateCycle24Manifest(m, ports)).toThrow();
});
it('rejects a changed prior source manifest rather than blessing new hashes', () => {
  expect(() =>
    checker.validateCycle24Manifest(fresh(), {
      ...ports,
      read: (p) =>
        p === 'docs/program/CYCLE23_SOURCE_MANIFEST.json'
          ? Buffer.from('{}')
          : ports.read(p),
    }),
  ).toThrow('Prior');
});
it('rejects a modified original shared command owner', () => {
  expect(() =>
    checker.validateCycle24Manifest(fresh(), {
      ...ports,
      read: (p) =>
        p === 'src/lib/workflows/saved-revision-exercise.ts'
          ? Buffer.from('replacement custody')
          : ports.read(p),
    }),
  ).toThrow();
});
it('rejects an omitted runtime source binding', () => {
  const m = fresh();
  m.runtime_files.pop();
  expect(() => checker.validateCycle24Manifest(m, ports)).toThrow();
});
it('pending independent evidence cannot be accepted as completed review', () => {
  const m = fresh();
  Object.assign(m, {
    independent_status: 'PENDING',
    independent_review_commit: null,
    independent_files: [],
    independent_cases: 0,
  });
  expect(() =>
    checker.validateCycle24Manifest(m, { ...ports, requireIndependent: true }),
  ).toThrow();
});
it('a fabricated successful application total cannot replace actual assertion results', () => {
  expect(() =>
    checker.validateCycle24ApplicationReport({
      success: true,
      numFailedTests: 0,
      numPendingTests: 0,
      numTotalTests: 999,
      numPassedTests: 999,
      testResults: [],
    }),
  ).toThrow();
});
function reportFixture() {
  const testResults = Object.entries(checker.cycle24ApplicationSuites()).map(
    ([name, count]) => ({
      name,
      status: 'passed',
      assertionResults: Array.from({ length: count }, (_, i) => ({
        fullName: `${name}: fixture assertion ${i}`,
        status: 'passed',
      })),
    }),
  );
  const count = testResults.reduce((n, s) => n + s.assertionResults.length, 0);
  return {
    success: true,
    numFailedTests: 0,
    numPendingTests: 0,
    numTotalTests: count,
    numPassedTests: count,
    testResults,
  };
}
it.each(['', '   '])('rejects blank assertion identity %j', (name) => {
  const r = reportFixture();
  r.testResults[0].assertionResults[0].fullName = name;
  expect(() => checker.validateCycle24ApplicationReport(r)).toThrow('unique');
});
it('rejects repeated assertion identity across different suites', () => {
  const r = reportFixture();
  r.testResults[1].assertionResults[0].fullName =
    r.testResults[0].assertionResults[0].fullName;
  expect(() => checker.validateCycle24ApplicationReport(r)).toThrow('unique');
});
it('requires an execution commit rather than its same-content Git tree', () => {
  const commit = '7a90da23c0a701001c79b605d94d2894cd9cc5a6';
  const tree = execFileSync('git', ['rev-parse', `${commit}^{tree}`], {
    encoding: 'utf8',
  }).trim();
  expect(() => checker.assertCycle24ExecutionCommit(commit)).not.toThrow();
  expect(() => checker.assertCycle24ExecutionCommit(tree)).toThrow('commit');
});
it('binds critical shared runtimes and entry points beyond the scoped capture inventory', () => {
  expect(checker.validateCycle24CriticalSources(ports)).toEqual({
    critical_sources: 5,
  });
  expect(() =>
    checker.validateCycle24CriticalSources({
      ...ports,
      read: (p) =>
        p === 'src/lib/workflows/saved-revision-runtime.ts'
          ? Buffer.from('substituted critical source')
          : ports.read(p),
    }),
  ).toThrow('Critical');
});
