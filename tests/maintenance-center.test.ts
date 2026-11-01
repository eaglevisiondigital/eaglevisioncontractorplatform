import { expect, it, vi } from 'vitest';
import { PropertyRepository } from '../src/lib/property';
import { Operations } from '../src/lib/operations';
import { sampleCompanies } from '../src/domain/platform';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import {
  filterMaintenance,
  emptyMaintenanceFilters,
  type MaintenanceEdit,
} from '../src/domain/property/maintenance';
import { projectPublishedHistory } from '../src/domain/property/report-page';
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  await prepareMaintenanceExamples(repo, org, actor);
  return {
    company,
    org,
    actor,
    operations,
    repo,
    row: repo.maintenance(org, actor).items[0],
  };
}
const edit = (extra: Partial<MaintenanceEdit> = {}): MaintenanceEdit => ({
  priority: 'high',
  assignee_id: null,
  follow_up_on: '2026-11-20',
  review: 'pending',
  note: '',
  ...extra,
});
it.each([0, 1, 2])(
  'reuses exact company %s CRM/report/plan/job sources, memberships and conservative recurrence',
  async (index) => {
    const { repo, org, actor } = await fixture(index),
      s = repo.read(org),
      q = repo.maintenance(org, actor);
    expect(q.items).toHaveLength(3);
    expect(new Set(q.items.map((r) => r.source.location_id)).size).toBe(2);
    expect(q.items.filter((r) => r.recurring)).toHaveLength(2);
    expect(q.members.map((m) => m.user_id)).toEqual(
      (await repo.operations.listMembers(org)).map((m) => m.user_id),
    );
    for (const row of q.items) {
      const report = s.reports.find((r) => r.id === row.source.report_id)!;
      expect(row.source).toMatchObject({
        organization_id: org,
        customer_id: report.customer_id,
        location_id: report.location_id,
        report_version: report.version,
      });
      expect(report.findings).toContainEqual(row.finding);
      expect(row.repair_status).toBe('undetermined');
      expect(row.record).toMatchObject({
        revision: 0,
        priority: 'normal',
        review: 'pending',
        assignee_id: null,
      });
    }
    await prepareMaintenanceExamples(repo, org, actor);
    expect(repo.read(org).reports).toEqual(s.reports);
  },
);
it('manual CAS edits append private notes, never alter published evidence, jobs, issued history or customer projections', async () => {
  const { repo, org, actor, row } = await fixture();
  const s = repo.read(org),
    before = repo.portal(org, row.source.customer_id),
    jobs = await repo.estimates.jobs(org),
    history = await repo.estimates.history(org, s.bundle.estimate.id);
  const saved = await repo.saveMaintenance(
    org,
    actor,
    row.source,
    0,
    edit({
      assignee_id: org + '-field',
      note: 'PRIVATE TRIAGE: supplier margin and workforce coordination',
    }),
  );
  expect(saved.revision).toBe(1);
  expect(saved.notes[0]).toMatchObject({
    author_id: actor,
    text: 'PRIVATE TRIAGE: supplier margin and workforce coordination',
  });
  expect(
    repo.maintenance(org, actor).items.find((i) => i.key === row.key)?.record,
  ).toEqual(saved);
  saved.notes[0].text = 'tampered returned copy';
  expect(
    repo.maintenance(org, actor).items.find((i) => i.key === row.key)?.record
      .notes[0].text,
  ).toContain('PRIVATE TRIAGE');
  expect(repo.read(org).reports).toEqual(s.reports);
  expect(repo.portal(org, row.source.customer_id)).toEqual(before);
  expect(
    JSON.stringify(
      projectPublishedHistory(
        s.reports.filter((r) => r.location_id === row.source.location_id),
        row.source,
      ),
    ),
  ).not.toMatch(/PRIVATE TRIAGE|supplier margin|workforce/);
  expect(await repo.estimates.jobs(org)).toEqual(jobs);
  expect(await repo.estimates.history(org, s.bundle.estimate.id)).toEqual(
    history,
  );
});
it('two concurrent stale edits commit once, reject replay and cannot duplicate a note', async () => {
  const { repo, org, actor, row } = await fixture();
  const results = await Promise.allSettled([
    repo.saveMaintenance(
      org,
      actor,
      row.source,
      0,
      edit({ note: 'Review this exact observation' }),
    ),
    repo.saveMaintenance(
      org,
      actor,
      row.source,
      0,
      edit({ note: 'Review this exact observation' }),
    ),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expect(
    repo.saveMaintenance(
      org,
      actor,
      row.source,
      1,
      edit({ note: 'Review this exact observation' }),
    ),
  ).rejects.toThrow('already recorded');
  expect(
    repo.maintenance(org, actor).items.find((i) => i.key === row.key)?.record
      .notes,
  ).toHaveLength(1);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'finding_id',
] as const)(
  'rejects forged source %s before a record or visit changes',
  async (key) => {
    const { repo, org, actor, row } = await fixture(),
      before = repo.read(org);
    const source = { ...row.source, [key]: crypto.randomUUID() };
    await expect(
      repo.saveMaintenance(org, actor, source, 0, edit()),
    ).rejects.toThrow('unavailable');
    await expect(
      repo.scheduleMaintenance(
        org,
        actor,
        source,
        0,
        repo.read(org).plans[0],
        '2026-11-20',
      ),
    ).rejects.toThrow();
    expect(repo.read(org)).toEqual(before);
    expect(
      repo.maintenance(org, actor).items.every((r) => r.record.revision === 0),
    ).toBe(true);
  },
);
it('rejects stale report versions, foreign actors/company rows and unavailable connected use', async () => {
  const { repo, org, actor, row } = await fixture();
  await repo.initialize(sampleCompanies[1]);
  await expect(
    repo.saveMaintenance(
      org,
      actor,
      { ...row.source, report_version: row.source.report_version + 1 },
      0,
      edit(),
    ),
  ).rejects.toThrow();
  expect(() => repo.maintenance(org, sampleCompanies[1].id + '-owner')).toThrow(
    'reviewer',
  );
  await expect(
    repo.saveMaintenance(
      sampleCompanies[1].id,
      sampleCompanies[1].id + '-owner',
      row.source,
      0,
      edit(),
    ),
  ).rejects.toThrow();
  const live = new Operations(false),
    members = vi.spyOn(live, 'listMembers');
  expect(() => new PropertyRepository(live).maintenance(org, actor)).toThrow(
    'unavailable',
  );
  expect(members).not.toHaveBeenCalled();
});
it('current membership revocation/role and inactive/foreign assignees fail closed at each command', async () => {
  const { repo, operations, org, actor, row } = await fixture();
  for (const assignee_id of ['foreign-user', sampleCompanies[1].id + '-field'])
    await expect(
      repo.saveMaintenance(org, actor, row.source, 0, edit({ assignee_id })),
    ).rejects.toThrow();
  await operations.manageMember(
    org,
    org + '-field',
    false,
    'staff',
    'field_staff',
  );
  await expect(
    repo.saveMaintenance(
      org,
      actor,
      row.source,
      0,
      edit({ assignee_id: org + '-field' }),
    ),
  ).rejects.toThrow();
  expect(() => repo.maintenance(org, org + '-field')).toThrow('reviewer');
  await operations.manageMember(
    org,
    org + '-estimator',
    false,
    'staff',
    'estimator',
  );
  await expect(
    repo.saveMaintenance(org, org + '-estimator', row.source, 0, edit()),
  ).rejects.toThrow('reviewer');
  await expect(
    repo.scheduleMaintenance(
      org,
      org + '-estimator',
      row.source,
      0,
      repo.read(org).plans[0],
      '2026-11-20',
    ),
  ).rejects.toThrow('reviewer');
});
it('a valid estimator can triage and assign current field staff without new memberships or job assignments', async () => {
  const { repo, operations, org, row } = await fixture(),
    before = await operations.listMembers(org);
  await repo.saveMaintenance(
    org,
    org + '-estimator',
    row.source,
    0,
    edit({ assignee_id: org + '-field' }),
  );
  expect(await operations.listMembers(org)).toEqual(before);
  expect(repo.maintenance(org, org + '-estimator').admin).toBe(false);
});
it('prepares exactly one existing inspection draft, with blank findings and no publishing/dispatch/repair inference', async () => {
  const { repo, org, actor, row } = await fixture(),
    before = repo.read(org),
    plan = before.plans.find((p) => p.id === row.plan_id)!;
  const pair = await Promise.allSettled([
    repo.scheduleMaintenance(org, actor, row.source, 0, plan, '2026-11-20'),
    repo.scheduleMaintenance(org, actor, row.source, 0, plan, '2026-11-20'),
  ]);
  expect(pair.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const after = repo.read(org),
    queue = repo.maintenance(org, actor).items.find((i) => i.key === row.key)!;
  expect(after.reports).toEqual(before.reports);
  expect(after.visits).toHaveLength(before.visits.length + 1);
  expect(
    after.visits.find((v) => v.id === queue.record.scheduled_visit_id),
  ).toMatchObject({
    status: 'draft',
    plan_id: row.plan_id,
    content: { findings: [], internal_notes: '' },
  });
  expect(queue).toMatchObject({
    status: 'scheduled',
    scheduled_on: '2026-11-20',
    repair_status: 'undetermined',
  });
  await expect(
    repo.scheduleMaintenance(org, actor, row.source, 1, plan, '2026-11-21'),
  ).rejects.toThrow('already exists');
});
it('same-plan/date duplicate across separate findings and foreign-property/stale plan scheduling create nothing', async () => {
  const { repo, org, actor, row } = await fixture(),
    plan = repo.read(org).plans.find((p) => p.id === row.plan_id)!,
    other = repo
      .maintenance(org, actor)
      .items.find((i) => i.plan_id === row.plan_id && i.key !== row.key)!;
  const before = repo.read(org);
  const foreign = before.plans.find(
    (p) => p.location_id !== row.source.location_id,
  )!;
  for (const bad of [foreign, { ...plan, revision: 0 }])
    await expect(
      repo.scheduleMaintenance(org, actor, row.source, 0, bad, '2026-11-20'),
    ).rejects.toThrow();
  await expect(
    repo.scheduleMaintenance(org, actor, row.source, 0, plan, '2026-02-30'),
  ).rejects.toThrow();
  expect(repo.read(org)).toEqual(before);
  repo.savePlan(org, { ...plan, name: 'Explicit revised plan' });
  await expect(
    repo.scheduleMaintenance(org, actor, row.source, 0, plan, '2026-11-20'),
  ).rejects.toThrow('changed');
  const current = repo.read(org).plans.find((p) => p.id === plan.id)!;
  await repo.scheduleMaintenance(
    org,
    actor,
    row.source,
    0,
    current,
    '2026-11-20',
  );
  await expect(
    repo.scheduleMaintenance(
      org,
      actor,
      other.source,
      0,
      current,
      '2026-11-20',
    ),
  ).rejects.toThrow('already scheduled');
  expect(
    repo.maintenance(org, actor).items.find((i) => i.key === other.key)?.status,
  ).toBe('pending');
});
it('reviewed is manual staff review, remains undetermined after later omission and requires explicit reopening before scheduling', async () => {
  const { repo, org, actor, row } = await fixture();
  await repo.saveMaintenance(
    org,
    actor,
    row.source,
    0,
    edit({ review: 'reviewed' }),
  );
  const plan = repo.read(org).plans.find((p) => p.id === row.plan_id)!;
  await expect(
    repo.scheduleMaintenance(org, actor, row.source, 1, plan, '2026-12-01'),
  ).rejects.toThrow('Reopen');
  const v = repo.addVisit(org, plan.id, '2026-12-01');
  repo.saveVisit(org, v, {
    ...v.content,
    checklist: v.content.checklist.map((c) => ({ ...c, completed: true })),
  });
  repo.submit(
    org,
    repo.read(org).visits.find((x) => x.id === v.id)!,
  );
  repo.publish(
    org,
    repo.read(org).visits.find((x) => x.id === v.id)!,
  );
  const found = repo
    .maintenance(org, actor)
    .items.find((i) => i.key === row.key)!;
  expect(found).toMatchObject({
    status: 'reviewed',
    repair_status: 'undetermined',
  });
  await repo.saveMaintenance(
    org,
    actor,
    row.source,
    1,
    edit({ review: 'pending' }),
  );
  expect(
    repo.maintenance(org, actor).items.find((i) => i.key === row.key)?.status,
  ).toBe('pending');
});
it.each([
  { priority: 'resolved' },
  { review: 'completed' },
  { follow_up_on: '2026-02-30' },
  { note: 'x'.repeat(2001) },
  { assignee_id: undefined },
  { extra: true },
])('rejects malformed or unauthorized review transition %j', async (bad) => {
  const { repo, org, actor, row } = await fixture();
  await expect(
    repo.saveMaintenance(org, actor, row.source, 0, {
      ...edit(),
      ...bad,
    } as MaintenanceEdit),
  ).rejects.toThrow();
});
it('filters combined property/priority/responsibility/follow-up/status accurately and rejects invalid ranges', async () => {
  const { repo, org, actor, row } = await fixture();
  await repo.saveMaintenance(
    org,
    actor,
    row.source,
    0,
    edit({ assignee_id: org + '-field' }),
  );
  const items = repo.maintenance(org, actor).items;
  expect(
    filterMaintenance(items, {
      ...emptyMaintenanceFilters,
      property: row.source.location_id,
      priority: 'high',
      responsibility: org + '-field',
      from: '2026-11-20',
      to: '2026-11-20',
      status: 'pending',
      attention: 'recurring',
    }).map((i) => i.key),
  ).toEqual([row.key]);
  expect(
    filterMaintenance(items, {
      ...emptyMaintenanceFilters,
      responsibility: 'unassigned',
    }),
  ).toHaveLength(2);
  expect(() =>
    filterMaintenance(items, {
      ...emptyMaintenanceFilters,
      from: '2026-12-01',
      to: '2026-11-01',
    }),
  ).toThrow();
});
it('exact linked job/issued baseline reads preserve original records and recheck membership after awaited reads', async () => {
  const { repo, org, actor, row, operations } = await fixture(),
    before = repo.read(org);
  const work = await repo.maintenanceWork(org, actor, row.source);
  expect(work.job_id).toBe(row.job_id);
  expect(work.bundle.version.status).toBe('issued');
  expect(repo.read(org)).toEqual(before);
  const original = repo.estimates.sourceEstimate.bind(repo.estimates);
  vi.spyOn(repo.estimates, 'sourceEstimate').mockImplementation(
    async (...args) => {
      const result = await original(...args);
      await operations.manageMember(
        org,
        org + '-estimator',
        false,
        'staff',
        'estimator',
      );
      return result;
    },
  );
  await expect(
    repo.maintenanceWork(org, org + '-estimator', row.source),
  ).rejects.toThrow('reviewer');
});
it('similar text and ambiguous identifiers never join triage records or establish recurrence', async () => {
  const { repo, org, actor } = await fixture(),
    s = repo.read(org),
    plan = s.plans[0];
  for (const date of ['2026-12-03', '2026-12-10']) {
    const v = repo.addVisit(org, plan.id, date);
    repo.saveVisit(org, v, {
      ...v.content,
      summary: 'Synthetic ambiguous observation',
      checklist: v.content.checklist.map((c) => ({ ...c, completed: true })),
      findings: [
        {
          id: 'generic',
          category: 'Maintenance',
          location: 'Drain',
          severity: 'low',
          description: 'Same wording',
          recommendation: 'Inspect',
          customer_visible: true,
        },
      ],
    });
    repo.submit(
      org,
      repo.read(org).visits.find((x) => x.id === v.id)!,
    );
    repo.publish(
      org,
      repo.read(org).visits.find((x) => x.id === v.id)!,
    );
  }
  const rows = repo
    .maintenance(org, actor)
    .items.filter((i) => i.finding.id === 'generic');
  expect(rows).toHaveLength(2);
  expect(rows.every((i) => !i.recurring)).toBe(true);
  expect(rows[0].key).not.toBe(rows[1].key);
});
it('linked estimate identity/status/property contamination rejects rather than opening another scope', async () => {
  const { repo, org, actor, row } = await fixture();
  const work = await repo.maintenanceWork(org, actor, row.source);
  for (const corrupt of [
    (b: typeof work.bundle) => {
      b.version.id = crypto.randomUUID();
    },
    (b: typeof work.bundle) => {
      b.version.status = 'draft';
    },
    (b: typeof work.bundle) => {
      b.version.payload.customer_id = crypto.randomUUID();
    },
    (b: typeof work.bundle) => {
      b.version.payload.location_id = crypto.randomUUID();
    },
    (b: typeof work.bundle) => {
      b.estimate.organization_id = 'foreign';
    },
  ]) {
    const bad = structuredClone(work.bundle);
    corrupt(bad);
    const spy = vi
      .spyOn(repo.estimates, 'sourceEstimate')
      .mockResolvedValue(bad);
    await expect(repo.maintenanceWork(org, actor, row.source)).rejects.toThrow(
      'another property',
    );
    spy.mockRestore();
  }
});
it('linked-work permissions reflect current admin rights after awaited reads', async () => {
  const { repo, operations, org, row } = await fixture(),
    actor = org + '-estimator';
  await operations.manageMember(org, actor, true, 'admin', 'office_manager');
  const original = repo.estimates.sourceEstimate.bind(repo.estimates);
  vi.spyOn(repo.estimates, 'sourceEstimate').mockImplementation(
    async (...args) => {
      const result = await original(...args);
      await operations.manageMember(org, actor, true, 'staff', 'estimator');
      return result;
    },
  );
  expect((await repo.maintenanceWork(org, actor, row.source)).admin).toBe(
    false,
  );
});
