import { expect, it } from 'vitest';
import { prepareP1, featureSql, digest } from '../server/property/p1-readiness';
import { p1Evidence, p1Now } from './helpers/property-p1-fixture';
it('freezes75 fixture steps/57 domain rows and separates all72 scenario statuses', () => {
  const e = p1Evidence(),
    p = prepareP1(e, 'p1-local-review', p1Now);
  expect(p.positiveSteps).toBe(75);
  expect(p.domainRecords).toBe(57);
  expect(p.companies.flatMap((c) => c.steps)).toHaveLength(75);
  expect(p.stageCounts).toEqual({ P1: 60, P2: 9, P3: 3 });
  expect(p.tracking).toEqual({ PASS: 0, FAIL: 0, BLOCKED: 24, 'NOT RUN': 48 });
  expect(p.scenarios).toHaveLength(72);
  expect(p.hostedExecutor).toBe(false);
  expect(p.customerMappingsProposed).toBe(0);
  expect(p.reportLeasesProposed).toBe(0);
  expect(digest(prepareP1(e, 'p1-local-review', p1Now))).toBe(digest(p));
});
it('freezes exact markup modes, unknown shipping and immutable revenue/baseline expectations', () => {
  const p = prepareP1(p1Evidence(), 'p1-local-review', p1Now);
  expect(p.companies.map((c) => c.expected.supplemental_selling_minor)).toEqual(
    [11251, 11251, 10001],
  );
  for (const c of p.companies) {
    expect(c.originalRevenueMinor).toBe(306280);
    expect(c.expected.customer_receivable_delta_minor).toBe(0);
    expect(c.expected.synthetic_actual_cost_delta_minor).toBe(10001);
    expect(c.comparison.mixed?.total_minor).toBe(12000);
    expect(c.comparison.vendors[3].total_minor).toBeNull();
    expect(c.probes).toHaveLength(23);
    expect(c.idempotency.perStepDigests).toHaveLength(25);
  }
});
it.each([
  'sessions',
  'featureRows',
  'mappings',
  'reportLeases',
  'activePlatformGrants',
  'releaseGrants',
  'providerWorkloads',
] as const)('rejects unexpected active control %s', (key) => {
  const e = p1Evidence();
  e[key] = 1;
  expect(() => prepareP1(e, 'p1-local-review', p1Now)).toThrow('baseline');
});
it.each([
  'revision',
  'duplicate',
  'foreign customer',
  'actor tenant',
  'revoked actor',
  'mapping',
  'expired quote',
  'wrong company',
  'missing row evidence',
] as const)('rejects %s instead of authorizing another fixture', (kind) => {
  const e = p1Evidence();
  if (kind === 'revision') e.resources[0].job_revision++;
  if (kind === 'duplicate') e.resources[0].duplicate_run_expenses++;
  if (kind === 'foreign customer')
    e.resources[0].customer_id = e.bindings[1].customer_id;
  if (kind === 'actor tenant')
    e.actors[0].organization_id = e.bindings[1].organization_id;
  if (kind === 'revoked actor') e.actors[4].active_membership = true;
  if (kind === 'mapping') e.actors[5].active_customer_mapping = true;
  if (kind === 'expired quote')
    e.bindings[0].quote_expires_at = '2026-10-17T16:01:00Z';
  if (kind === 'wrong company') e.resources[0].company = 'Another company';
  if (kind === 'missing row evidence') e.originalRows = [];
  expect(() => prepareP1(e, 'p1-local-review', p1Now)).toThrow();
});
it('requires current evidence without minting or changing authentication', () => {
  const e = p1Evidence();
  expect(() => prepareP1(e, 'p1-local-review', p1Now + 600001)).toThrow(
    'Fresh',
  );
  expect(() => prepareP1(e, 'p1-local-review', p1Now - 1)).toThrow('Fresh');
});
it('feature proposal only inserts three exact controls and deactivation preserves evidence', () => {
  const p = prepareP1(p1Evidence(), 'p1-local-review', p1Now),
    sql = featureSql(p);
  expect(sql.activation).toContain('get diagnostics n=row_count;if n<>3');
  expect(sql.activation).not.toMatch(
    /grant |create role|release_test_users\s*\(/i,
  );
  expect(sql.cleanup).toContain('set enabled=false');
  expect(sql.cleanup).not.toMatch(/delete from|truncate|set enabled=true/i);
  expect(p.p2.leases).toHaveLength(3);
  expect(p.p2.leases.every((l) => l.ttlSeconds === 900 && !l.renewable)).toBe(
    true,
  );
  expect(p.p2.financialReleaseGrants).toBe(0);
});
it('private resource ordering cannot change the tenant/material binding', () => {
  const e = p1Evidence();
  const a = prepareP1(e, 'p1-local-review', p1Now);
  e.resources.reverse();
  expect(digest(prepareP1(e, 'p1-local-review', p1Now))).toBe(digest(a));
});
it('requires unique composite row identities and preserves nonselected job revision guards', () => {
  const e = p1Evidence();
  e.originalRows.push({ ...e.originalRows[0] });
  expect(() => prepareP1(e, 'p1-local-review', p1Now)).toThrow('row');
  e.originalRows.pop();
  e.originalRows.push(
    {
      table_name: 'public.estimate_lines',
      row_key: '{"id":"same-logical-line","version_id":"one"}',
      stable_digest: 'a'.repeat(32),
      full_digest: 'b'.repeat(32),
      original_revision: null,
    },
    {
      table_name: 'public.estimate_lines',
      row_key: '{"id":"same-logical-line","version_id":"two"}',
      stable_digest: 'a'.repeat(32),
      full_digest: 'b'.repeat(32),
      original_revision: null,
    },
  );
  expect(prepareP1(e, 'p1-local-review', p1Now).originalRowCount).toBe(5);
});
