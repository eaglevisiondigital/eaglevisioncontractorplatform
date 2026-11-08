import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import {
  openFieldSource,
  readFieldSchedule,
} from '../src/lib/field-scheduling';
import {
  fieldServiceDocumentation,
  fieldVisitCostScope,
  fieldVisitMarginReader,
} from '../src/components/field/field-service-review';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  const original = readFieldSchedule(repo, org, actor).rows[0];
  await prepareMaintenanceExamples(repo, org, actor);
  const row = readFieldSchedule(repo, org, actor).rows.find(
    (r) => r.reports.length,
  )!;
  return { company, org, actor, operations, repo, original, row };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: original Passport projection retains exact published evidence and excludes staff fields`, async () => {
    const f = await fixture(brand),
      before = JSON.stringify(f.repo.read(f.org));
    const selected = openFieldSource(
      f.repo,
      f.org,
      f.actor,
      f.row.source,
      f.row.reports[0],
    );
    Object.assign(selected.published!, {
      internal_notes: 'PRIVATE',
      payroll: 9000,
    });
    const reports = fieldServiceDocumentation(
      f.repo,
      f.org,
      f.actor,
      selected,
    )!;
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe(f.row.reports[0].id);
    expect(reports[0].snapshot.checklist.length).toBeGreaterThan(0);
    expect(JSON.stringify(reports)).not.toMatch(
      /PRIVATE|payroll|internal_notes|cost_minor/,
    );
    expect(JSON.stringify(f.repo.read(f.org))).toBe(before);
    expect(
      fieldServiceDocumentation(
        f.repo,
        f.org,
        f.actor,
        openFieldSource(f.repo, f.org, f.actor, f.original.source),
      ),
    ).toBeNull();
  });
  it(`brand ${brand}: exact plan job handoff preserves UNKNOWN baseline property and original financial coverage`, async () => {
    const f = await fixture(brand),
      before = JSON.stringify(f.repo.read(f.org));
    const scope = await fieldVisitCostScope(
      f.repo,
      f.org,
      f.actor,
      f.original.source,
    );
    expect(scope?.jobId).toBe(f.repo.read(f.org).plans[0].job_id);
    expect(scope?.customerId).toBe(f.original.source.customer_id);
    expect(scope?.propertyId).toBeNull();
    const reader = fieldVisitMarginReader(
      f.repo,
      f.org,
      f.actor,
      f.original.source,
      scope!,
    );
    const result = await reader.read(scope!, f.actor);
    expect(result.status).toBe('PARTIAL');
    expect(result.coverage?.unpostedApprovedTime).toBeGreaterThan(0);
    expect(result.scope).toEqual(scope);
    expect(JSON.stringify(f.repo.read(f.org))).toBe(before);
    await expect(
      reader.read(
        { ...scope!, propertyId: f.original.source.location_id },
        f.actor,
      ),
    ).rejects.toThrow(/Original/);
    await expect(reader.read(scope!, f.org + '-field')).rejects.toThrow();
  });
  it(`brand ${brand}: foreign and stale documentation/cost targets are denied`, async () => {
    const f = await fixture(brand);
    const selected = openFieldSource(
      f.repo,
      f.org,
      f.actor,
      f.row.source,
      f.row.reports[0],
    );
    expect(() =>
      fieldServiceDocumentation(f.repo, f.org, f.actor, {
        ...selected,
        row: {
          ...selected.row,
          source: { ...f.row.source, visit_revision: 100 },
        },
      }),
    ).toThrow();
    expect(() =>
      fieldServiceDocumentation(
        f.repo,
        sampleCompanies[(brand + 1) % 3].id,
        f.actor,
        selected,
      ),
    ).toThrow();
    await expect(
      fieldVisitCostScope(f.repo, f.org, f.actor, {
        ...f.original.source,
        plan_revision: 100,
      }),
    ).rejects.toThrow();
    await expect(
      fieldVisitCostScope(f.repo, f.org, 'unknown', f.original.source),
    ).rejects.toThrow();
  });
}
it('withholds missing job relationships instead of guessing by customer/property', async () => {
  const f = await fixture(),
    state = f.repo.read(f.org);
  state.plans = state.plans.map((p) =>
    p.id === f.original.source.plan_id ? { ...p, job_id: null } : p,
  );
  state.contexts = [...state.contexts, { ...state.contexts[0], job_id: null }];
  vi.spyOn(f.repo, 'read').mockReturnValue(state);
  expect(
    await fieldVisitCostScope(f.repo, f.org, f.actor, f.original.source),
  ).toBeNull();
});
it('denies a visit revision changing while the financial reader awaits unchanged job sources', async () => {
  const f = await fixture();
  const scope = (await fieldVisitCostScope(
    f.repo,
    f.org,
    f.actor,
    f.original.source,
  ))!;
  const reader = fieldVisitMarginReader(
    f.repo,
    f.org,
    f.actor,
    f.original.source,
    scope,
  );
  const history = f.repo.estimates.history.bind(f.repo.estimates);
  let changed = false;
  vi.spyOn(f.repo.estimates, 'history').mockImplementation(async (...args) => {
    const value = await history(...args);
    if (!changed) {
      changed = true;
      const visit = f.repo
        .read(f.org)
        .visits.find((v) => v.id === f.original.source.visit_id)!;
      f.repo.saveVisit(f.org, visit, {
        ...visit.content,
        summary: 'Changed while financial read pending',
      });
    }
    return value;
  });
  await expect(reader.read(scope, f.actor)).rejects.toThrow(/source changed/i);
});
it('current revocation during cost navigation denies before any cost pane can be admitted', async () => {
  const f = await fixture(),
    actor = f.org + '-estimator';
  await f.operations.manageMember(
    f.org,
    actor,
    true,
    'admin',
    'office_manager',
  );
  const jobs = f.repo.estimates.jobs.bind(f.repo.estimates);
  let changed = false;
  vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const value = await jobs(...args);
    if (!changed) {
      changed = true;
      await f.operations.manageMember(
        f.org,
        actor,
        false,
        'admin',
        'office_manager',
      );
    }
    return value;
  });
  await expect(
    fieldVisitCostScope(f.repo, f.org, actor, f.original.source),
  ).rejects.toThrow();
});

it('a property-bound issued baseline stays exact and incomplete new-job costs stay UNKNOWN', async () => {
  const f = await fixture(),
    estimates = f.repo.estimates;
  const first = (await estimates.list(f.org))[0];
  const original = await estimates.get(f.org, first.id);
  const draft = await estimates.create(f.company, {
    ...original.version.payload,
    location_id: f.original.source.location_id,
  });
  const issued = await estimates.issue(f.org, draft);
  const jobId = await estimates.approveJob(f.org, issued);
  await f.repo.refreshContexts(f.org);
  const context = f.repo
    .read(f.org)
    .contexts.find(
      (c) =>
        c.job_id === jobId && c.location_id === f.original.source.location_id,
    )!;
  const plan = f.repo.createPlan(f.org, context, 'Canonical bound visit');
  const visit = f.repo.addVisit(f.org, plan.id, '2026-11-21');
  const ref = readFieldSchedule(f.repo, f.org, f.actor).rows.find(
    (r) => r.source.visit_id === visit.id,
  )!.source;
  const scope = (await fieldVisitCostScope(f.repo, f.org, f.actor, ref))!;
  expect(scope.jobId).toBe(jobId);
  expect(scope.propertyId).toBe(context.location_id);
  expect(scope.issuedVersionId).toBe(issued.version.id);
  const result = await fieldVisitMarginReader(
    f.repo,
    f.org,
    f.actor,
    ref,
    scope,
  ).read(scope, f.actor);
  expect(result.status).toBe('UNKNOWN');
  expect(result.totals).toBeNull();
});
it('originating published documentation keeps its original visit instead of substituting the follow-up', async () => {
  const f = await fixture();
  const item = f.repo.maintenance(f.org, f.actor).items[0];
  const record = await f.repo.saveMaintenance(
    f.org,
    f.actor,
    item.source,
    item.record.revision,
    {
      priority: 'normal',
      assignee_id: null,
      follow_up_on: '2026-11-22',
      review: 'pending',
      note: 'PRIVATE',
    },
  );
  const plan = f.repo.read(f.org).plans.find((p) => p.id === item.plan_id)!;
  const visit = await f.repo.scheduleMaintenance(
    f.org,
    f.actor,
    item.source,
    record.revision,
    { id: plan.id, revision: plan.revision },
    '2026-11-22',
  );
  const row = readFieldSchedule(f.repo, f.org, f.actor).rows.find(
    (r) => r.source.visit_id === visit.id,
  )!;
  const selected = {
    row,
    published: item.report,
    finding_id: item.source.finding_id,
  };
  const reports = fieldServiceDocumentation(f.repo, f.org, f.actor, selected)!;
  expect(reports[0].id).toBe(item.report.id);
  expect(reports[0].snapshot.visited_on).toBe(item.report.visited_on);
  expect(reports[0].snapshot.visited_on).not.toBe(row.date);
  expect(() =>
    fieldServiceDocumentation(f.repo, f.org, f.actor, {
      ...selected,
      finding_id: 'missing',
    }),
  ).toThrow(/UNKNOWN/);
});
