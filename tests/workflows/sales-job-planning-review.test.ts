import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readFieldSchedule } from '../../src/lib/field-scheduling';
import { readSalesJobPlanning } from '../../src/components/workflows/sales-job-planning-review';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  return prepareLocalJourney(sampleCompanies[index], {
    enabled: true,
    confirmed: true,
  });
}
it.each([0, 1, 2])(
  'brand %i: reads the issued job baseline and switches exact recorded visits without writing',
  async (brand) => {
    const j = await fixture(brand);
    const before = JSON.stringify({
      property: j.property.read(j.company.id),
      release: j.release.read('staff'),
      issued: j.issued,
      job: j.estimates.syntheticJob(j.company.id, j.target.job_id!),
    });
    const view = await readSalesJobPlanning(j);
    expect(view.scope.jobId).toBe(j.target.job_id);
    expect(view.scope.estimateId).toBe(j.target.estimate_id);
    expect(view.scope.issuedVersionId).toBe(j.target.version_id);
    expect(view.reference.visit_id).toBe(j.scheduled_visit_id);
    const publishedVisit = readFieldSchedule(
      j.property,
      j.company.id,
      j.target.actor_id,
    ).rows.find((r) => r.source.visit_id === j.visit_id)!;
    const next = await readSalesJobPlanning(j, publishedVisit.source);
    expect(next.scope).toEqual(view.scope);
    expect(next.reference.visit_id).toBe(j.visit_id);
    expect(next.row.status).toBe('published');
    view.check();
    expect(
      JSON.stringify({
        property: j.property.read(j.company.id),
        release: j.release.read('staff'),
        issued: j.issued,
        job: j.estimates.syntheticJob(j.company.id, j.target.job_id!),
      }),
    ).toBe(before);
  },
);
it('denies foreign company/customer/property/plan and stale visit references without substituting a source', async () => {
  const j = await fixture();
  const view = await readSalesJobPlanning(j);
  for (const patch of [
    { organization_id: sampleCompanies[1].id },
    { customer_id: 'another-customer' },
    { location_id: 'another-property' },
    { plan_id: 'another-plan' },
    { plan_revision: view.reference.plan_revision + 1 },
    { visit_id: 'missing-visit' },
    { visit_revision: view.reference.visit_revision + 1 },
  ])
    await expect(
      readSalesJobPlanning(j, { ...view.reference, ...patch }),
    ).rejects.toThrow();
});
it.each(['job_id', 'estimate_id', 'version_id'] as const)(
  'does not infer a missing or substituted %s relationship',
  async (key) => {
    const j = await fixture();
    j.target[key] = 'missing-original-source';
    await expect(readSalesJobPlanning(j)).rejects.toThrow();
  },
);
it('withholds retained evidence after the plan changes and does not silently advance revisions', async () => {
  const j = await fixture();
  const view = await readSalesJobPlanning(j);
  const state = j.property.read(j.company.id);
  state.plans.find((p) => p.id === j.plan_id)!.revision++;
  vi.spyOn(j.property, 'read').mockReturnValue(state);
  expect(view.check).toThrow();
  await expect(readSalesJobPlanning(j, view.reference)).rejects.toThrow();
});
it('denies an asynchronous read when confirmation is withdrawn before it completes', async () => {
  const j = await fixture();
  const original = j.estimates.jobs.bind(j.estimates);
  vi.spyOn(j.estimates, 'jobs').mockImplementation(async (...args) => {
    const value = await original(...args);
    j.gate.confirmed = false;
    return value;
  });
  await expect(readSalesJobPlanning(j)).rejects.toThrow();
});
it('requires current authorization for both retained evidence and a new read', async () => {
  const j = await fixture();
  const view = await readSalesJobPlanning(j);
  const memberships = j.operations.syntheticMemberships.bind(j.operations);
  vi.spyOn(j.operations, 'syntheticMemberships').mockImplementation((org) =>
    memberships(org).map((member) =>
      member.user_id === j.target.actor_id
        ? { ...member, active: false }
        : member,
    ),
  );
  expect(view.check).toThrow();
  await expect(readSalesJobPlanning(j)).rejects.toThrow();
});
it('a newer draft never replaces the original issued job scope', async () => {
  const j = await fixture();
  const draft = await j.estimates.revise(j.company.id, j.issued);
  expect(draft.version.status).toBe('draft');
  expect(draft.version.id).not.toBe(j.target.version_id);
  const view = await readSalesJobPlanning(j);
  expect(view.scope.issuedVersionId).toBe(j.target.version_id);
  expect(view.scope.issuedVersionId).not.toBe(draft.version.id);
});
it('revocation while the canonical job reader awaits denies the resulting handoff', async () => {
  const j = await fixture();
  const memberships = j.operations.syntheticMemberships.bind(j.operations);
  const jobs = j.estimates.jobs.bind(j.estimates);
  let revoked = false;
  vi.spyOn(j.operations, 'syntheticMemberships').mockImplementation((org) =>
    memberships(org).map((member) =>
      member.user_id === j.target.actor_id && revoked
        ? { ...member, active: false }
        : member,
    ),
  );
  vi.spyOn(j.estimates, 'jobs').mockImplementation(async (...args) => {
    const value = await jobs(...args);
    revoked = true;
    return value;
  });
  await expect(readSalesJobPlanning(j)).rejects.toThrow();
});
it.each(['enabled', 'confirmed'] as const)(
  'is default-deny when %s is false',
  async (key) => {
    const j = await fixture();
    j.gate[key] = false;
    await expect(readSalesJobPlanning(j)).rejects.toThrow();
  },
);
