import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { emptyHistoryFilters } from '../../src/domain/property/history-search';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readStormPropertyHistory } from '../../src/components/workflows/storm-property-history';
afterEach(() => vi.restoreAllMocks());
const fixture = (i = 0) =>
  prepareLocalJourney(sampleCompanies[i], { enabled: true, confirmed: true });
it.each([0, 1, 2])(
  'brand %i: exact published property evidence and no incident creation',
  async (i) => {
    const j = await fixture(i);
    const before = JSON.stringify(j.property.read(j.company.id));
    const v = await readStormPropertyHistory(j);
    const result = v.search({ ...emptyHistoryFilters });
    expect(
      result.reports.some(
        (r) => r.id === j.report_id && r.version === j.published_version,
      ),
    ).toBe(true);
    expect(v.work.scope.jobId).toBe(j.target.job_id);
    expect(v.requirements.kind).toBe('storm_network');
    expect(v.requirements.operational_ready).toBe(false);
    expect(
      v.search({ ...emptyHistoryFilters, query: 'no matching phrase' }).reports,
    ).toHaveLength(0);
    expect(JSON.stringify(j.property.read(j.company.id))).toBe(before);
  },
);
it('withdrawal is held even after confirmation is restored', async () => {
  const j = await fixture();
  const v = await readStormPropertyHistory(j);
  j.gate.confirmed = false;
  expect(() => v.check()).toThrow();
  j.gate.confirmed = true;
  expect(() => v.search({ ...emptyHistoryFilters })).toThrow();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'version_id',
] as const)('denies foreign %s', async (key) => {
  const j = await fixture();
  j.target[key] = crypto.randomUUID();
  await expect(readStormPropertyHistory(j)).rejects.toThrow();
});
it('revocation during async read denies history', async () => {
  const j = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    j.gate.enabled = false;
    return digest(...args);
  });
  await expect(readStormPropertyHistory(j)).rejects.toThrow();
});
it('current staff revocation withholds retained reports', async () => {
  const j = await fixture();
  const v = await readStormPropertyHistory(j);
  const members = j.operations.syntheticMemberships.bind(j.operations);
  vi.spyOn(j.operations, 'syntheticMemberships').mockImplementation((org) =>
    members(org).map((m) => ({ ...m, active: false })),
  );
  expect(() => v.search({ ...emptyHistoryFilters })).toThrow();
});
