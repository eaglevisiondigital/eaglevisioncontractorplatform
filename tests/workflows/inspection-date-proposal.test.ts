import { expect, it } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { PropertyRepository } from '../../src/lib/property';
import { sampleCompanies } from '../../src/domain/platform';
import type { InspectionPlan } from '../../src/domain/property/inspections';
import { inspectionDateProposal } from '../../src/components/property/inspection-date-proposal';
async function fixture() {
  const ops = new Operations(true),
    repo = new PropertyRepository(ops),
    company = sampleCompanies[0],
    org = company.id;
  await repo.initialize(company);
  const original = repo.read(org).plans[0];
  repo.savePlan(org, {
    ...original,
    cadence: 'weekly',
    starts_on: '2026-10-16',
  });
  const plan = repo.read(org).plans[0],
    other = repo.createPlan(
      org,
      repo.read(org).contexts[0],
      'Fictional other plan',
    );
  repo.addVisit(org, other.id, '2026-10-20');
  repo.addVisit(org, other.id, '2026-10-27');
  return { repo, org, plan, other };
}
it('unrelated exact-company plans cannot advance this plan date or change any source', async () => {
  const f = await fixture(),
    before = f.repo.read(f.org);
  expect(inspectionDateProposal(f.org, f.plan, before.visits)).toBe(
    '2026-10-23',
  );
  expect(f.repo.read(f.org)).toEqual(before);
});
it('a gap is proposed before a later occupied date, with no inferred overdue/availability state', async () => {
  const f = await fixture();
  f.repo.addVisit(f.org, f.plan.id, '2026-10-30');
  expect(inspectionDateProposal(f.org, f.plan, f.repo.read(f.org).visits)).toBe(
    '2026-10-23',
  );
});
it('explicit original writer schedules/reopens one exact draft and rejects repeating the occupied proposal', async () => {
  const f = await fixture(),
    date = inspectionDateProposal(f.org, f.plan, f.repo.read(f.org).visits)!;
  const visit = f.repo.addVisit(f.org, f.plan.id, date);
  expect(f.repo.read(f.org).visits.find((v) => v.id === visit.id)).toEqual(
    visit,
  );
  expect(visit).toMatchObject({
    organization_id: f.org,
    plan_id: f.plan.id,
    visited_on: '2026-10-23',
    status: 'draft',
  });
  expect(() => f.repo.addVisit(f.org, f.plan.id, date)).toThrow();
  expect(inspectionDateProposal(f.org, f.plan, f.repo.read(f.org).visits)).toBe(
    '2026-10-30',
  );
});
it.each([
  ['custom', 5, '2026-01-01', '2026-01-06'],
  ['monthly', 14, '2026-01-31', '2026-02-28'],
] as const)(
  'reuses original %s anchored recurrence',
  async (cadence, interval_days, starts_on, next) => {
    const f = await fixture(),
      plan = { ...f.plan, cadence, interval_days, starts_on };
    const visits = [{ ...f.repo.read(f.org).visits[0], visited_on: starts_on }];
    expect(inspectionDateProposal(f.org, plan, visits)).toBe(next);
  },
);
it('occupied once-only source produces no invented recurrence or replacement date', async () => {
  const f = await fixture();
  expect(
    inspectionDateProposal(
      f.org,
      { ...f.plan, cadence: 'once' },
      f.repo.read(f.org).visits,
    ),
  ).toBeNull();
});
it.each([
  'duplicate-date',
  'duplicate-id',
  'invalid-date',
  'foreign',
  'invalid-status',
] as const)(
  'contradictory %s history remains UNKNOWN with no mutation',
  async (mode) => {
    const f = await fixture(),
      before = f.repo.read(f.org),
      visits = structuredClone(before.visits);
    if (mode === 'duplicate-date')
      visits.push({ ...visits[0], id: 'different-id' });
    if (mode === 'duplicate-id')
      visits.push({ ...visits[0], visited_on: '2026-10-23' });
    if (mode === 'invalid-date') visits[0].visited_on = '2026-02-30';
    if (mode === 'foreign') visits[0].organization_id = sampleCompanies[1].id;
    if (mode === 'invalid-status') visits[0].status = 'unverified' as never;
    expect(() => inspectionDateProposal(f.org, f.plan, visits)).toThrow(
      /UNKNOWN/,
    );
    expect(f.repo.read(f.org)).toEqual(before);
  },
);
it('missing/wrong current plan source cannot become a date proposal', async () => {
  const f = await fixture();
  for (const plan of [
    undefined,
    { ...f.plan, organization_id: sampleCompanies[1].id },
  ] as InspectionPlan[])
    expect(() =>
      inspectionDateProposal(f.org, plan, f.repo.read(f.org).visits),
    ).toThrow(/UNKNOWN/);
});
it('off-cadence explicit dates are occupied facts, not permission to shift the saved cadence', async () => {
  const f = await fixture();
  f.repo.addVisit(f.org, f.plan.id, '2026-10-21');
  expect(inspectionDateProposal(f.org, f.plan, f.repo.read(f.org).visits)).toBe(
    '2026-10-23',
  );
});
it('saving a changed plan still uses original CAS and proposes from the actual reopened source', async () => {
  const f = await fixture(),
    stale = structuredClone(f.plan);
  f.repo.savePlan(f.org, { ...f.plan, cadence: 'monthly' });
  expect(() =>
    f.repo.savePlan(f.org, { ...stale, name: 'Stale overwrite' }),
  ).toThrow();
  const current = f.repo.read(f.org).plans.find((p) => p.id === f.plan.id)!;
  expect(
    inspectionDateProposal(f.org, current, f.repo.read(f.org).visits),
  ).toBe('2026-11-16');
});
