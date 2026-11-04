import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const api: {
  validateCycle25Readiness: (
    r: Record<string, unknown>,
    ports?: { git?: (c: string, p: string) => Buffer },
  ) => unknown;
  validateCycle25ApplicationReport: (
    r: unknown,
    s: Record<string, number>,
  ) => unknown;
} = await import(new URL('../scripts/check-cycle25.mjs', import.meta.url).href);
const record = () =>
  JSON.parse(
    readFileSync('docs/program/CYCLE25_OPERATIONAL_READINESS.json', 'utf8'),
  );
it('validates actual original source bytes and all unaccepted operation dependencies', () => {
  expect(api.validateCycle25Readiness(record())).toMatchObject({
    operations: 8,
    original_dependencies: 19,
    source_references: 16,
    operational_ready: false,
    restore_adapter: false,
    physical_recovery: 'UNVERIFIED_NOT_RUN',
  });
});
it.each([
  'operational_ready',
  'implementation_authorized',
  'schema_authorized',
  'genuine_auth_verified',
])('denies inferred %s authority', (key) => {
  const r = record();
  r[key] = true;
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it.each([
  'hosted_acceptance',
  'operational_receipts',
  'external_rollback_fence',
  'matched_backup_set',
  'RPO',
  'RTO',
])('denies unproven %s evidence', (key) => {
  const r = record();
  r[key] = 'PASS';
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('denies a missing original dependency', () => {
  const r = record();
  r.previous_register.original_requirements.pop();
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('denies duplicate operation families', () => {
  const r = record();
  r.operations[1] = r.operations[0];
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('denies an operational owner or adapter accepted through the document', () => {
  const r = record();
  r.operations[0].adapter_authorized = true;
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('does not turn read-only publication evidence into mutation authority', () => {
  const r = record();
  r.operations[3].operation_kind = 'MUTATION_FUTURE';
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('denies unknown source paths before attempting their Git read', () => {
  const r = record();
  r.source_evidence[0].path = '.staging/private.json';
  const reads: string[] = [];
  expect(() =>
    api.validateCycle25Readiness(r, {
      git: (_c, p) => {
        reads.push(p);
        return readFileSync(p);
      },
    }),
  ).toThrow();
  expect(reads).not.toContain('.staging/private.json');
});
it('denies modified original source evidence', () => {
  const r = record();
  r.source_evidence[0].sha256 = '0'.repeat(64);
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('requires all receipt and antirollback matching requirements', () => {
  const r = record();
  r.recovery_requirements.pop();
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('does not infer physical recovery from availability or historical offline tests', () => {
  const r = record();
  r.physical_recovery.status = 'PASS';
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
it('preserves the original approval sequence', () => {
  const r = record();
  r.preserved_sequence[1] = 'installed';
  expect(() => api.validateCycle25Readiness(r)).toThrow();
});
const sample = () => ({
  success: true,
  numFailedTests: 0,
  numPendingTests: 0,
  numTotalTests: 1,
  numPassedTests: 1,
  testResults: [
    {
      name: process.cwd() + '/tests/exact.test.ts',
      status: 'passed',
      assertionResults: [{ fullName: 'actual case', status: 'passed' }],
    },
  ],
});
it('accepts actual complete uniquely named report cases', () => {
  expect(
    api.validateCycle25ApplicationReport(sample(), {
      'tests/exact.test.ts': 1,
    }),
  ).toMatchObject({ cases: 1, business_authority: false });
});
it.each(['pending', 'skipped', 'failed'])(
  'denies %s report assertions',
  (status) => {
    const r = sample();
    r.testResults[0].assertionResults[0].status = status;
    expect(() =>
      api.validateCycle25ApplicationReport(r, { 'tests/exact.test.ts': 1 }),
    ).toThrow();
  },
);
it('denies omitted and duplicated suites', () => {
  const r = sample();
  r.testResults.push(r.testResults[0]);
  expect(() =>
    api.validateCycle25ApplicationReport(r, { 'tests/exact.test.ts': 1 }),
  ).toThrow();
  expect(() =>
    api.validateCycle25ApplicationReport(sample(), {
      'tests/exact.test.ts': 1,
      'tests/omitted.test.ts': 1,
    }),
  ).toThrow();
});

it.each([3, 4])(
  'retains the exact remaining Auth/recovery and financial/provider sequence entry %d',
  (index) => {
    const r = record();
    r.preserved_sequence[index] = 'accepted';
    expect(() => api.validateCycle25Readiness(r)).toThrow();
  },
);
