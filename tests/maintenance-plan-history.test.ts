import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import { MaintenanceScheduleHandoff } from '../src/lib/maintenance-schedule-handoff';
import { maintenancePlanHistory } from '../src/components/field/maintenance-plan-history';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  await prepareMaintenanceExamples(repo, org, actor);
  const service = new MaintenanceScheduleHandoff(repo, org, actor),
    candidate = service.candidates()[0];
  const state = repo.read(org),
    sourcePlan = state.plans.find(
      (p) =>
        p.id ===
        state.visits.find((v) => v.id === candidate.report.visit_id)!.plan_id,
    )!;
  const recurringPlan = state.plans.find(
    (p) =>
      p.location_id === candidate.source.location_id && p.cadence === 'monthly',
  )!;
  return {
    company,
    org,
    actor,
    operations,
    repo,
    service,
    candidate,
    sourcePlan,
    recurringPlan,
  };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: current recurring plan and same-property published history stay distinct and read-only`, async () => {
    const f = await fixture(brand),
      before = JSON.stringify(f.repo.read(f.org)),
      jobs = await f.repo.estimates.jobs(f.org);
    const write = vi.spyOn(f.repo, 'scheduleMaintenance');
    const view = maintenancePlanHistory(
      f.repo,
      f.org,
      f.actor,
      f.candidate.source,
      f.candidate.record.revision,
      f.recurringPlan,
    );
    expect(view.plan.id).toBe(f.recurringPlan.id);
    expect(view.plan.cadence).toBe('monthly');
    expect(view.visits).toHaveLength(1);
    expect(view.reports).toEqual([]);
    expect(view.withoutPublishedEvidence).toBe(1);
    expect(view.propertyReports).toHaveLength(2);
    expect(view.propertyVisits).toHaveLength(3);
    expect(
      view.propertyVisits.every(
        (v) =>
          v.source.organization_id === f.org &&
          v.source.customer_id === f.candidate.source.customer_id &&
          v.source.location_id === f.candidate.source.location_id,
      ),
    ).toBe(true);
    expect(
      view.propertyReports.map((r) => r.snapshot.visited_on).sort(),
    ).toEqual(['2026-11-06', '2026-11-13']);
    expect(JSON.stringify(view.propertyReports)).not.toMatch(
      /INTERNAL|internal_notes|supplier|payroll|cost_minor/,
    );
    const selected = maintenancePlanHistory(
      f.repo,
      f.org,
      f.actor,
      f.candidate.source,
      f.candidate.record.revision,
      f.sourcePlan,
    );
    expect(selected.visits).toHaveLength(2);
    expect(selected.reports).toHaveLength(2);
    expect(JSON.stringify(f.repo.read(f.org))).toBe(before);
    expect(await f.repo.estimates.jobs(f.org)).toEqual(jobs);
    expect(write).not.toHaveBeenCalled();
    expect(f.service.retained(f.candidate.source)).toBeNull();
  });
  it(`brand ${brand}: changed plan revision requires an explicit current selection`, async () => {
    const f = await fixture(brand),
      old = f.recurringPlan;
    f.repo.savePlan(f.org, { ...old, cadence: 'weekly', interval_days: 7 });
    expect(() =>
      maintenancePlanHistory(
        f.repo,
        f.org,
        f.actor,
        f.candidate.source,
        f.candidate.record.revision,
        old,
      ),
    ).toThrow(/plan changed/);
    const current = f.repo.read(f.org).plans.find((p) => p.id === old.id)!;
    const view = maintenancePlanHistory(
      f.repo,
      f.org,
      f.actor,
      f.candidate.source,
      f.candidate.record.revision,
      current,
    );
    expect(view.plan.revision).toBe(old.revision + 1);
    expect(view.plan.cadence).toBe('weekly');
    expect(view.reports).toEqual([]);
  });
  it(`brand ${brand}: denies foreign property/company, stale maintenance and executable source substitutions`, async () => {
    const f = await fixture(brand),
      foreign = f.repo
        .read(f.org)
        .plans.find((p) => p.location_id !== f.candidate.source.location_id)!;
    expect(() =>
      maintenancePlanHistory(
        f.repo,
        f.org,
        f.actor,
        f.candidate.source,
        f.candidate.record.revision,
        foreign,
      ),
    ).toThrow(/unavailable/);
    expect(() =>
      maintenancePlanHistory(
        f.repo,
        f.org,
        f.actor,
        { ...f.candidate.source, organization_id: 'foreign' },
        f.candidate.record.revision,
        f.recurringPlan,
      ),
    ).toThrow();
    expect(() =>
      maintenancePlanHistory(
        f.repo,
        f.org,
        f.actor,
        f.candidate.source,
        f.candidate.record.revision + 1,
        f.recurringPlan,
      ),
    ).toThrow(/source changed/);
    let invoked = false;
    const source = { ...f.candidate.source };
    Object.defineProperty(source, 'finding_id', {
      get() {
        invoked = true;
        return 'other';
      },
    });
    expect(() =>
      maintenancePlanHistory(
        f.repo,
        f.org,
        f.actor,
        source,
        f.candidate.record.revision,
        f.recurringPlan,
      ),
    ).toThrow(/Exact/);
    expect(invoked).toBe(false);
  });
}
it('an existing plan without visits has no fabricated service or report evidence', async () => {
  const f = await fixture(),
    context = f.repo
      .read(f.org)
      .contexts.find((c) => c.location_id === f.candidate.source.location_id)!;
  const plan = f.repo.createPlan(f.org, context, 'Synthetic unvisited plan');
  const view = maintenancePlanHistory(
    f.repo,
    f.org,
    f.actor,
    f.candidate.source,
    f.candidate.record.revision,
    plan,
  );
  expect(view.visits).toEqual([]);
  expect(view.reports).toEqual([]);
  expect(view.propertyReports).toHaveLength(2);
});
it('current staff revocation denies the history read', async () => {
  const f = await fixture(),
    actor = f.org + '-estimator';
  await f.operations.manageMember(
    f.org,
    actor,
    true,
    'admin',
    'office_manager',
  );
  expect(
    maintenancePlanHistory(
      f.repo,
      f.org,
      actor,
      f.candidate.source,
      f.candidate.record.revision,
      f.recurringPlan,
    ).plan.id,
  ).toBe(f.recurringPlan.id);
  await f.operations.manageMember(
    f.org,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect(() =>
    maintenancePlanHistory(
      f.repo,
      f.org,
      actor,
      f.candidate.source,
      f.candidate.record.revision,
      f.recurringPlan,
    ),
  ).toThrow();
});
it('saved maintenance changes invalidate the retained record revision without creating a draft', async () => {
  const f = await fixture();
  await f.repo.saveMaintenance(
    f.org,
    f.actor,
    f.candidate.source,
    f.candidate.record.revision,
    {
      priority: 'normal',
      assignee_id: null,
      follow_up_on: '2026-11-29',
      review: 'pending',
      note: 'Staff review only',
    },
  );
  expect(() =>
    maintenancePlanHistory(
      f.repo,
      f.org,
      f.actor,
      f.candidate.source,
      f.candidate.record.revision,
      f.recurringPlan,
    ),
  ).toThrow(/source changed/);
  expect(f.service.retained(f.candidate.source)).toBeNull();
});
