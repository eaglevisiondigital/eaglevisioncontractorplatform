import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { receptionistSalesSource } from '../../src/components/workflows/receptionist-sales-source';
afterEach(() => vi.restoreAllMocks());
const fixture = (i = 0) =>
  prepareLocalJourney(sampleCompanies[i], { enabled: true, confirmed: true });
it.each([0, 1, 2])(
  'brand %i: exact existing lead and no assignment or business writes',
  async (i) => {
    const j = await fixture(i);
    const assign = vi
      .spyOn(j.operations, 'assignIntake')
      .mockRejectedValue(Error('HELD'));
    const before = JSON.stringify(j.release.read('staff'));
    const source = await receptionistSalesSource(j);
    expect(source.lead.id).toBe(j.intake_request_id);
    expect(source.lead.customer_id).toBe(j.target.customer_id);
    expect(source.lead.location_id).toBe(j.target.location_id);
    source.check();
    expect(assign).not.toHaveBeenCalled();
    expect(JSON.stringify(j.release.read('staff'))).toBe(before);
  },
);
it('denies withdrawn source admission and retained evidence', async () => {
  const j = await fixture();
  const result = await receptionistSalesSource(j);
  j.gate.confirmed = false;
  expect(() => result.check()).toThrow();
  await expect(receptionistSalesSource(j)).rejects.toThrow();
});
it('denies current membership revocation', async () => {
  const j = await fixture();
  const result = await receptionistSalesSource(j);
  const members = j.operations.syntheticMemberships.bind(j.operations);
  vi.spyOn(j.operations, 'syntheticMemberships').mockImplementation((org) =>
    members(org).map((m) => ({ ...m, active: false })),
  );
  expect(() => result.check()).toThrow();
});
it.each(['customer_id', 'location_id', 'organization_id', 'actor_id'] as const)(
  'denies foreign %s',
  async (key) => {
    const j = await fixture();
    j.target[key] = crypto.randomUUID();
    await expect(receptionistSalesSource(j)).rejects.toThrow();
  },
);
it('missing exact lead never substitutes another intake', async () => {
  const j = await fixture();
  j.intake_request_id = crypto.randomUUID();
  await expect(receptionistSalesSource(j)).rejects.toThrow();
});
it('revocation during asynchronous source hashing withholds result', async () => {
  const j = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    j.gate.confirmed = false;
    return digest(...args);
  });
  await expect(receptionistSalesSource(j)).rejects.toThrow();
});
it('changed recorded intake invalidates retained details', async () => {
  const j = await fixture();
  const result = await receptionistSalesSource(j);
  const read = j.operations.syntheticIntakeRequest.bind(j.operations);
  vi.spyOn(j.operations, 'syntheticIntakeRequest').mockImplementation(
    (...args) => ({ ...read(...args), summary: 'Changed recorded needs' }),
  );
  expect(() => result.check()).toThrow();
});
