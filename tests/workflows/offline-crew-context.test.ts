import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readOfflineCrewContext } from '../../src/components/workflows/offline-crew-context';
afterEach(() => vi.restoreAllMocks());
const fixture = (i = 0) =>
  prepareLocalJourney(sampleCompanies[i], { enabled: true, confirmed: true });
it.each([0, 1, 2])(
  'brand %i exact recorded work without commands',
  async (i) => {
    const j = await fixture(i);
    const before = JSON.stringify(
      j.estimates.readSyntheticPrototypeSources(j.target),
    );
    const v = await readOfflineCrewContext(j);
    v.check();
    expect(v.reference.job_id).toBe(j.target.job_id);
    expect(v.reference.issued_version_id).toBe(j.target.version_id);
    expect(v.work.reference.visit_id).toBe(j.scheduled_visit_id);
    expect(v.source.operational_ready).toBe(false);
    expect(v.source.prior_attempt).toBe('NO_ATTEMPT_OBSERVED_IN_THIS_ADAPTER');
    expect(
      JSON.stringify(j.estimates.readSyntheticPrototypeSources(j.target)),
    ).toBe(before);
  },
);
it('withdrawal withholds retained private work', async () => {
  const j = await fixture();
  const v = await readOfflineCrewContext(j);
  j.gate.confirmed = false;
  expect(() => v.check()).toThrow();
  j.gate.confirmed = true;
  expect(() => v.check()).toThrow();
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
  await expect(readOfflineCrewContext(j)).rejects.toThrow();
});
it('revocation during async reads denies result', async () => {
  const j = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    j.gate.enabled = false;
    return digest(...args);
  });
  await expect(readOfflineCrewContext(j)).rejects.toThrow();
});
it('current membership revocation denies retained source', async () => {
  const j = await fixture();
  const v = await readOfflineCrewContext(j);
  const members = j.operations.syntheticMemberships.bind(j.operations);
  vi.spyOn(j.operations, 'syntheticMemberships').mockImplementation((org) =>
    members(org).map((m) => ({ ...m, active: false })),
  );
  expect(() => v.check()).toThrow();
});
