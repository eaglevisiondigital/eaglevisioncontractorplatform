import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readOwnerCostEvidence } from '../../src/components/workflows/owner-cost-evidence';
import { readIntelligenceWorkflowAttempt } from '../../src/lib/workflows/intelligence-workflow';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  return prepareLocalJourney(sampleCompanies[index], {
    enabled: true,
    confirmed: true,
  });
}
it.each([0, 1, 2])(
  'brand %i: exposes the original job cost gaps without posting or consuming a Copilot attempt',
  async (brand) => {
    const j = await fixture(brand);
    const priorAttempt = readIntelligenceWorkflowAttempt(
      j.estimates,
      j.target,
      j.gate,
    );
    const before = JSON.stringify({
      source: j.estimates.readSyntheticPrototypeSources(j.target),
      property: j.property.read(j.company.id),
      release: j.release.read('staff'),
    });
    const source = await readOwnerCostEvidence(j);
    const cost = await source.reader.read(source.scope, j.target.actor_id);
    expect(cost.scope.jobId).toBe(j.target.job_id);
    expect(cost.scope.issuedVersionId).toBe(j.target.version_id);
    expect(cost.scope.customerId).toBe(j.target.customer_id);
    expect(cost.status).toBe('UNKNOWN');
    expect(cost.totals).toBeNull();
    expect(cost.coverage).toBeNull();
    expect(cost.reasons.length).toBeGreaterThan(0);
    expect(cost.authority).toContain(
      'No final profit, settlement, payroll or provider authority.',
    );
    expect(
      readIntelligenceWorkflowAttempt(j.estimates, j.target, j.gate),
    ).toEqual(priorAttempt);
    expect(
      JSON.stringify({
        source: j.estimates.readSyntheticPrototypeSources(j.target),
        property: j.property.read(j.company.id),
        release: j.release.read('staff'),
      }),
    ).toBe(before);
  },
);
it.each([
  'organizationId',
  'jobId',
  'issuedVersionId',
  'customerId',
  'propertyId',
] as const)(
  'denies substituting %s on the retained financial reader',
  async (key) => {
    const j = await fixture();
    const s = await readOwnerCostEvidence(j);
    await expect(
      s.reader.read({ ...s.scope, [key]: 'another-source' }, j.target.actor_id),
    ).rejects.toThrow();
  },
);
it('withholds the original reader after scope withdrawal, including a pending read', async () => {
  const j = await fixture();
  const s = await readOwnerCostEvidence(j);
  const history = j.estimates.history.bind(j.estimates);
  vi.spyOn(j.estimates, 'history').mockImplementation(async (...args) => {
    const value = await history(...args);
    j.gate.confirmed = false;
    return value;
  });
  await expect(s.reader.read(s.scope, j.target.actor_id)).rejects.toThrow();
  await expect(s.reader.read(s.scope, j.target.actor_id)).rejects.toThrow();
});
it('denies current owner revocation and a different actor, without widening to another job', async () => {
  const j = await fixture();
  const s = await readOwnerCostEvidence(j);
  await expect(
    s.reader.read(s.scope, j.company.id + '-field'),
  ).rejects.toThrow();
  const members = j.operations.syntheticMemberships.bind(j.operations);
  vi.spyOn(j.operations, 'syntheticMemberships').mockImplementation((org) =>
    members(org).map((m) =>
      m.user_id === j.target.actor_id ? { ...m, active: false } : m,
    ),
  );
  await expect(s.reader.read(s.scope, j.target.actor_id)).rejects.toThrow();
  await expect(readOwnerCostEvidence(j)).rejects.toThrow();
});
it('requires the original plan/job relationship instead of searching for another job', async () => {
  const j = await fixture();
  const s = await readOwnerCostEvidence(j);
  const state = j.property.read(j.company.id);
  state.plans.find((p) => p.id === j.plan_id)!.job_id = null;
  vi.spyOn(j.property, 'read').mockReturnValue(state);
  await expect(s.reader.read(s.scope, j.target.actor_id)).rejects.toThrow();
  await expect(readOwnerCostEvidence(j)).rejects.toThrow();
});
it('does not enable completion review or replace the issued job baseline with a draft', async () => {
  const j = await fixture();
  const draft = await j.estimates.revise(j.company.id, j.issued);
  const s = await readOwnerCostEvidence(j);
  expect(s.scope.issuedVersionId).not.toBe(draft.version.id);
  await expect(
    s.reader.readCompletion(s.scope, j.target.actor_id),
  ).rejects.toThrow();
});
