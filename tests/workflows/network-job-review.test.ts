import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readNetworkJobReview } from '../../src/components/workflows/network-job-review';
afterEach(() => vi.restoreAllMocks());
const fixture = (i = 0) =>
  prepareLocalJourney(sampleCompanies[i], { enabled: true, confirmed: true });
it.each([0, 1, 2])(
  'brand %i exact scope without invented partner profiles',
  async (i) => {
    const j = await fixture(i);
    const before = JSON.stringify(
      j.estimates.readSyntheticPrototypeSources(j.target),
    );
    const v = await readNetworkJobReview(j);
    v.check();
    expect(v.profiles).toHaveLength(0);
    expect(v.work.work.scope.jobId).toBe(j.target.job_id);
    expect(
      v.requirements.every((l) => ['labor', 'service'].includes(l.kind)),
    ).toBe(true);
    expect(
      JSON.stringify(j.estimates.readSyntheticPrototypeSources(j.target)),
    ).toBe(before);
  },
);
it('original recorded contractor profile is allowlisted, never a capability assertion', async () => {
  const j = await fixture();
  const workforce = await j.estimates.workforce(j.company.id);
  const worker = workforce.workers[0];
  const rate = workforce.rates.find((r) => r.worker_id === worker.id)!;
  const { id: rateId, worker_id: workerId, ...inputRate } = rate;
  void rateId;
  void workerId;
  await j.estimates.saveWorker(
    j.company.id,
    {
      user_id: worker.user_id,
      display_name: 'Recorded internal contractor',
      worker_type: 'contractor_1099',
      cost_source: 'invoice',
      active: true,
    },
    inputRate,
    worker.id,
  );
  const v = await readNetworkJobReview(j);
  expect(v.profiles[0].id).toBe(worker.id);
  expect(Object.keys(v.profiles[0]).sort()).toEqual([
    'active',
    'display_name',
    'id',
    'organization_id',
    'worker_type',
  ]);
});
it('revocation stays held after restoration', async () => {
  const j = await fixture();
  const v = await readNetworkJobReview(j);
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
] as const)('foreign %s denied', async (key) => {
  const j = await fixture();
  j.target[key] = crypto.randomUUID();
  await expect(readNetworkJobReview(j)).rejects.toThrow();
});
it('async gate withdrawal denies source', async () => {
  const j = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    j.gate.enabled = false;
    return digest(...args);
  });
  await expect(readNetworkJobReview(j)).rejects.toThrow();
});
it('profile changes invalidate retained source', async () => {
  const j = await fixture();
  const v = await readNetworkJobReview(j);
  const original = j.estimates.readSyntheticPrototypeSources.bind(j.estimates);
  vi.spyOn(j.estimates, 'readSyntheticPrototypeSources').mockImplementation(
    (t) => {
      const s = original(t);
      s.workforce.workers[0].display_name = 'Changed';
      return s;
    },
  );
  expect(() => v.check()).toThrow();
});
