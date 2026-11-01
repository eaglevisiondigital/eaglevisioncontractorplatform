import { expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import {
  MaintenanceScheduleHandoff,
  maintenanceScheduleHandoffEnabled,
  type HandoffSelection,
} from '../src/lib/maintenance-schedule-handoff';
async function fixture(index = 0, actorKind = 'owner') {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-' + actorKind,
    operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  await prepareMaintenanceExamples(repo, org, org + '-owner');
  const service = new MaintenanceScheduleHandoff(repo, org, actor),
    candidate = service.candidates()[0],
    plan = candidate.plans[0];
  const input: HandoffSelection = {
    source: candidate.source,
    plan_id: plan.id,
    plan_revision: plan.revision,
    date: '2026-11-27',
  };
  return { company, org, actor, operations, repo, service, candidate, input };
}
it.each([0, 1, 2])(
  'actual company %s source review -> explicit existing draft -> exact read-only evidence',
  async (index) => {
    const f = await fixture(index),
      before = f.repo.read(f.org),
      jobs = await f.repo.estimates.jobs(f.org),
      portal = f.repo.portal(f.org, f.candidate.source.customer_id);
    const review = f.service.review(f.input);
    const result = await f.service.prepare(review, f.input, true);
    expect(result.status).toBe('prepared');
    expect(result.visit?.source).toMatchObject({
      organization_id: f.org,
      customer_id: f.input.source.customer_id,
      location_id: f.input.source.location_id,
      plan_id: f.input.plan_id,
      plan_revision: f.input.plan_revision,
      visit_revision: 1,
    });
    expect(result.visit?.status).toBe('draft');
    expect(result.visit?.reports).toEqual([]);
    const draft = f.repo
      .read(f.org)
      .visits.find((v) => v.id === result.visit!.source.visit_id)!;
    expect(draft.content.findings).toEqual([]);
    expect(draft.content.internal_notes).toBe('');
    expect(draft.content.checklist.every((c) => !c.completed)).toBe(true);
    expect(f.repo.read(f.org).reports).toEqual(before.reports);
    expect(f.repo.read(f.org).plans).toEqual(before.plans);
    expect(await f.repo.estimates.jobs(f.org)).toEqual(jobs);
    expect(f.repo.portal(f.org, f.candidate.source.customer_id)).toEqual(
      portal,
    );
    expect(f.repo.read(f.org).visits).toHaveLength(before.visits.length + 1);
    expect(f.service.reconcile(f.input.source)).toEqual(result);
    const exact = f.service.inspectExisting(f.input.source);
    expect(exact.report).toEqual(f.candidate.report);
    expect(exact.finding_id).toBe(f.input.source.finding_id);
    expect(JSON.stringify({ review, result, exact })).not.toMatch(
      /internal_notes|unit_cost|supplier|margin|payroll|INTERNAL/,
    );
  },
);
it('review alone and unchecked/forged/dirty confirmation cause no mutation or retained attempt', async () => {
  const f = await fixture(),
    before = f.repo.read(f.org),
    review = f.service.review(f.input);
  await expect(f.service.prepare(review, f.input, false)).rejects.toThrow(
    'Confirm',
  );
  await expect(
    f.service.prepare(structuredClone(review), f.input, true),
  ).rejects.toThrow('Confirm');
  await expect(
    f.service.prepare(review, { ...f.input, date: '2026-11-28' }, true),
  ).rejects.toThrow('Confirm');
  expect(f.service.retained(f.input.source)).toBeNull();
  expect(f.repo.read(f.org)).toEqual(before);
});
it('mutating a returned review cannot mutate source or create a draft', async () => {
  const f = await fixture(),
    review = f.service.review(f.input);
  review.candidate.report.summary = 'Tampered snapshot';
  await expect(f.service.prepare(review, f.input, true)).rejects.toThrow(
    'Confirm',
  );
  expect(
    f.repo.read(f.org).reports.find((r) => r.id === f.input.source.report_id)
      ?.summary,
  ).not.toBe('Tampered snapshot');
});
it.each([
  'record',
  'selected plan',
  'origin plan',
  'origin visit',
  'property context',
] as const)('rejects stale %s before the command is invoked', async (kind) => {
  const f = await fixture(),
    review = f.service.review(f.input),
    spy = vi.spyOn(f.repo, 'scheduleMaintenance');
  const state = f.repo.read(f.org),
    originVisit = state.visits.find(
      (v) => v.id === f.candidate.report.visit_id,
    )!,
    originPlan = state.plans.find((p) => p.id === originVisit.plan_id)!;
  if (kind === 'record') {
    const item = f.repo.maintenance(f.org, f.actor).items[0];
    await f.repo.saveMaintenance(
      f.org,
      f.actor,
      item.source,
      item.record.revision,
      {
        priority: 'high',
        assignee_id: null,
        follow_up_on: '',
        review: 'pending',
        note: '',
      },
    );
  }
  if (kind === 'selected plan')
    f.repo.savePlan(f.org, {
      ...state.plans.find((p) => p.id === f.input.plan_id)!,
      name: 'Current edited selected plan',
    });
  if (kind === 'origin plan')
    f.repo.savePlan(f.org, {
      ...originPlan,
      name: 'Current edited source plan',
    });
  if (kind === 'origin visit') f.repo.revise(f.org, originVisit);
  if (kind === 'property context') {
    const location = (
      await f.operations.listLocations(f.org, f.input.source.customer_id)
    ).find((l) => l.id === f.input.source.location_id)!;
    await f.operations.saveLocation(
      f.org,
      f.input.source.customer_id,
      { ...location, address_line1: 'Changed current property label' },
      location.id,
    );
    await f.repo.refreshContexts(f.org);
  }
  await expect(f.service.prepare(review, f.input, true)).rejects.toThrow(
    /changed|unavailable/,
  );
  expect(spy).not.toHaveBeenCalled();
  expect(f.service.retained(f.input.source)).toBeNull();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'report_version',
  'finding_id',
] as const)('rejects wrong exact source %s', async (field) => {
  const f = await fixture(),
    source = {
      ...f.input.source,
      [field]: field === 'report_version' ? 999 : 'foreign',
    };
  expect(() => f.service.review({ ...f.input, source })).toThrow();
});
it('foreign property plan, invalid dates and already occupied dates cannot pass review', async () => {
  const f = await fixture(),
    other = f.service
      .candidates()
      .find((c) => c.source.location_id !== f.input.source.location_id)!;
  expect(() =>
    f.service.review({
      ...f.input,
      plan_id: other.plans[0].id,
      plan_revision: other.plans[0].revision,
    }),
  ).toThrow();
  expect(() => f.service.review({ ...f.input, date: '2026-02-30' })).toThrow();
  f.repo.addVisit(f.org, f.input.plan_id, f.input.date);
  expect(() => f.service.review(f.input)).toThrow('already exists');
});
it.each(['sample-construction-owner', 'sample-property-field', 'unknown'])(
  'foreign or ineligible actor %s cannot review or inspect',
  async (actor) => {
    const f = await fixture(),
      service = new MaintenanceScheduleHandoff(f.repo, f.org, actor);
    expect(() => service.candidates()).toThrow();
    expect(() => service.review(f.input)).toThrow();
    expect(() => service.inspectExisting(f.input.source)).toThrow();
  },
);
it('revoked reviewer cannot dispatch after review or reconcile a retained outcome', async () => {
  const f = await fixture(0, 'estimator'),
    review = f.service.review(f.input),
    spy = vi.spyOn(f.repo, 'scheduleMaintenance');
  await f.operations.manageMember(f.org, f.actor, false, 'staff', 'estimator');
  await expect(f.service.prepare(review, f.input, true)).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
  expect(() => f.service.reconcile(f.input.source)).toThrow();
});
it('two concurrent reviewers commit only one existing inspection draft and cannot rebind date or service', async () => {
  const f = await fixture(),
    one = f.service.review(f.input),
    two = new MaintenanceScheduleHandoff(f.repo, f.org, f.actor),
    second = two.review(f.input),
    spy = vi.spyOn(f.repo, 'scheduleMaintenance'),
    before = f.repo.read(f.org).visits.length;
  const outcomes = await Promise.allSettled([
    f.service.prepare(one, f.input, true),
    two.prepare(second, f.input, true),
  ]);
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(f.repo.read(f.org).visits).toHaveLength(before + 1);
  expect(() => two.review({ ...f.input, date: '2026-11-28' })).toThrow(
    'already retained',
  );
});
it.each([
  'before mutation',
  'after mutation',
  'wrong acknowledgment',
  'contradictory acknowledgment',
] as const)(
  'lost result %s remains UNKNOWN until exact read-only reconciliation',
  async (mode) => {
    const f = await fixture(),
      review = f.service.review(f.input),
      original = f.repo.scheduleMaintenance.bind(f.repo),
      before = f.repo.read(f.org).visits.length;
    const spy = vi
      .spyOn(f.repo, 'scheduleMaintenance')
      .mockImplementation(async (...args) => {
        if (mode === 'before mutation') throw Error('lost');
        const visit = await original(...args);
        if (mode === 'after mutation') throw Error('lost ack');
        return mode === 'contradictory acknowledgment'
          ? { ...visit, visited_on: '2026-11-29' }
          : { ...visit, id: 'wrong-ack' };
      });
    const result = await f.service.prepare(review, f.input, true);
    expect(result.status).toBe('unknown');
    expect(result.visit).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(() =>
      new MaintenanceScheduleHandoff(f.repo, f.org, f.actor).review({
        ...f.input,
        date: '2026-11-28',
      }),
    ).toThrow('already retained');
    expect(f.service.reconcile(f.input.source).status).toBe(
      mode === 'before mutation' ? 'unknown' : 'prepared',
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(f.repo.read(f.org).visits).toHaveLength(
      before + (mode === 'before mutation' ? 0 : 1),
    );
  },
);
it('a newer publication cannot bypass an UNKNOWN source attempt', async () => {
  const f = await fixture(),
    review = f.service.review(f.input);
  vi.spyOn(f.repo, 'scheduleMaintenance').mockRejectedValueOnce(
    Error('lost before result'),
  );
  expect((await f.service.prepare(review, f.input, true)).status).toBe(
    'unknown',
  );
  let visit = f.repo
    .read(f.org)
    .visits.find((v) => v.id === f.candidate.report.visit_id)!;
  f.repo.revise(f.org, visit);
  visit = f.repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  f.repo.submit(f.org, visit);
  visit = f.repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  const newer = f.repo.publish(f.org, visit);
  const source = {
    ...f.input.source,
    report_id: newer.id,
    report_version: newer.version,
  };
  expect(() =>
    f.service.review({ ...f.input, source, date: '2026-11-28' }),
  ).toThrow('already retained');
});
it('later draft edits make reconciliation uncertain without rewriting the original outcome', async () => {
  const f = await fixture(),
    result = await f.service.prepare(f.service.review(f.input), f.input, true),
    snapshot = structuredClone(result),
    visit = f.repo
      .read(f.org)
      .visits.find((v) => v.id === result.visit!.source.visit_id)!;
  f.repo.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Edited subsequent private draft',
  });
  expect(f.service.reconcile(f.input.source).status).toBe('unknown');
  expect(result).toEqual(snapshot);
  expect(() => f.service.review({ ...f.input, date: '2026-11-28' })).toThrow(
    'already retained',
  );
});
it('revoked existing responsibility blocks the reviewed scheduling target before mutation', async () => {
  const f = await fixture(),
    item = f.repo.maintenance(f.org, f.actor).items[0];
  await f.repo.saveMaintenance(
    f.org,
    f.actor,
    item.source,
    item.record.revision,
    {
      priority: 'normal',
      assignee_id: f.org + '-field',
      follow_up_on: '',
      review: 'pending',
      note: '',
    },
  );
  const review = f.service.review(f.input),
    spy = vi.spyOn(f.repo, 'scheduleMaintenance');
  await f.operations.manageMember(
    f.org,
    f.org + '-field',
    false,
    'staff',
    'field_staff',
  );
  await expect(f.service.prepare(review, f.input, true)).rejects.toThrow(
    'responsible staff',
  );
  expect(spy).not.toHaveBeenCalled();
});
it('already linked or staff-reviewed maintenance must use existing review workflow', async () => {
  const f = await fixture(),
    item = f.repo.maintenance(f.org, f.actor).items[0];
  await f.repo.saveMaintenance(f.org, f.actor, item.source, 0, {
    priority: 'normal',
    assignee_id: null,
    follow_up_on: '',
    review: 'reviewed',
    note: '',
  });
  expect(() => f.service.review(f.input)).toThrow('Reopen');
});
it('connected mode rejects before an operational adapter and second flag defaults off', () => {
  const service = new MaintenanceScheduleHandoff(
    new PropertyRepository(new Operations(false)),
    'org',
    'actor',
  );
  expect(() => service.candidates()).toThrow();
  for (const input of [
    {
      development: false,
      flag: 'true',
      hostname: '127.0.0.1',
      protocol: 'http:',
    },
    {
      development: true,
      flag: undefined,
      hostname: '127.0.0.1',
      protocol: 'http:',
    },
    {
      development: true,
      flag: 'true',
      hostname: 'example.com',
      protocol: 'http:',
    },
  ])
    expect(maintenanceScheduleHandoffEnabled(input)).toBe(false);
});
