import { expect, it } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { prepareMaintenanceExamples } from '../src/lib/maintenance-examples';
import {
  blankFieldFilters,
  fieldSchedulingPreviewEnabled,
  filterFieldSchedule,
  openFieldOrigin,
  openFieldSource,
  readFieldSchedule,
} from '../src/lib/field-scheduling';
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner',
    operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  await repo.refreshContexts(org);
  await prepareMaintenanceExamples(repo, org, actor);
  return { company, org, actor, operations, repo };
}
async function followup() {
  const f = await fixture(),
    item = f.repo.maintenance(f.org, f.actor).items[0];
  const record = await f.repo.saveMaintenance(
    f.org,
    f.actor,
    item.source,
    item.record.revision,
    {
      priority: 'normal',
      assignee_id: f.org + '-field',
      follow_up_on: '2026-11-20',
      review: 'pending',
      note: 'PRIVATE staff note never projected',
    },
  );
  const plan = f.repo.read(f.org).plans.find((p) => p.id === item.plan_id)!;
  const visit = await f.repo.scheduleMaintenance(
    f.org,
    f.actor,
    item.source,
    record.revision,
    { id: plan.id, revision: plan.revision },
    '2026-11-20',
  );
  return { ...f, item, visit, plan };
}
it.each([0, 1, 2])(
  'projects existing company %s visits and exact report/property identities without mutation',
  async (index) => {
    const { repo, org, actor } = await fixture(index),
      before = repo.read(org),
      jobs = await repo.estimates.jobs(org);
    const schedule = readFieldSchedule(repo, org, actor);
    expect(schedule.rows).toHaveLength(4);
    expect(new Set(schedule.rows.map((r) => r.source.location_id)).size).toBe(
      2,
    );
    expect(schedule.rows.every((r) => r.source.organization_id === org)).toBe(
      true,
    );
    expect(schedule.rows.map((r) => r.date)).toEqual(
      [...schedule.rows.map((r) => r.date)].sort(),
    );
    const published = schedule.rows.find((r) => r.reports.length)!;
    const opened = openFieldSource(
      repo,
      org,
      actor,
      published.source,
      published.reports[0],
    );
    expect(opened.published).toEqual(
      before.reports.find((r) => r.id === published.reports[0].id),
    );
    expect(repo.read(org)).toEqual(before);
    expect(await repo.estimates.jobs(org)).toEqual(jobs);
    expect(JSON.stringify(schedule)).not.toMatch(
      /internal_notes|supplier|margin|unit_cost|payroll|PRIVATE/,
    );
  },
);
it('only actual scheduled maintenance record supplies responsibility and exact original finding', async () => {
  const { repo, org, actor, item, visit } = await followup(),
    row = readFieldSchedule(repo, org, actor).rows.find(
      (r) => r.source.visit_id === visit.id,
    )!;
  expect(row.status).toBe('draft');
  expect(row.reports).toEqual([]);
  expect(row.responsibility).toMatchObject([{ id: org + '-field' }]);
  expect(row.follow_up_sources).toEqual([item.source]);
  const origin = openFieldOrigin(repo, org, actor, row.source, item.source);
  expect(origin.published).toEqual(item.report);
  expect(origin.finding_id).toBe(item.source.finding_id);
  expect(JSON.stringify(row)).not.toMatch(
    /PRIVATE staff|repair_status|completed|approved|dispatch/,
  );
});
it('combines inclusive date, property, responsibility and status filters with accurate counts', async () => {
  const { repo, org, actor, visit } = await followup(),
    rows = readFieldSchedule(repo, org, actor).rows;
  const match = rows.find((r) => r.source.visit_id === visit.id)!;
  expect(
    filterFieldSchedule(rows, {
      ...blankFieldFilters,
      from: '2026-11-20',
      to: '2026-11-20',
      property: match.source.location_id,
      responsibility: org + '-field',
      status: 'draft',
    }),
  ).toEqual([match]);
  expect(
    filterFieldSchedule(rows, {
      ...blankFieldFilters,
      responsibility: 'unassigned',
    }),
  ).toHaveLength(4);
  expect(
    filterFieldSchedule(rows, { ...blankFieldFilters, property: 'foreign' }),
  ).toEqual([]);
  expect(
    filterFieldSchedule(rows, { ...blankFieldFilters, to: '2026-01-01' }),
  ).toEqual([]);
  expect(filterFieldSchedule([], blankFieldFilters)).toEqual([]);
});
it.each([
  { from: '2026-02-30' },
  { from: '2026-12-01', to: '2026-01-01' },
  { status: 'completed' },
])('rejects invalid or inferred filter %j', (extra) => {
  expect(() =>
    filterFieldSchedule([], { ...blankFieldFilters, ...extra }),
  ).toThrow();
});
it('foreign, inactive and ineligible field actors cannot read or open schedule evidence', async () => {
  const { repo, org, actor, operations } = await fixture(),
    source = readFieldSchedule(repo, org, actor).rows[0].source;
  expect(() =>
    readFieldSchedule(repo, org, 'sample-construction-owner'),
  ).toThrow();
  expect(() => readFieldSchedule(repo, org, org + '-field')).toThrow();
  await operations.manageMember(
    org,
    org + '-estimator',
    false,
    'staff',
    'estimator',
  );
  expect(() =>
    openFieldSource(repo, org, org + '-estimator', source),
  ).toThrow();
});
it('revoked responsibility remains uncertain and is not mislabeled unassigned', async () => {
  const { repo, org, actor, operations, visit } = await followup();
  await operations.manageMember(
    org,
    org + '-field',
    false,
    'staff',
    'field_worker',
  );
  const row = readFieldSchedule(repo, org, actor).rows.find(
    (r) => r.source.visit_id === visit.id,
  )!;
  expect(row.responsibility).toEqual([]);
  expect(row.responsibility_uncertain).toBe(true);
  expect(
    filterFieldSchedule([row], {
      ...blankFieldFilters,
      responsibility: 'unassigned',
    }),
  ).toEqual([]);
});
it('exact source rejects stale visit/plan revision and incorrect property/report/version/finding', async () => {
  const { repo, org, actor, item, visit, plan } = await followup(),
    row = readFieldSchedule(repo, org, actor).rows.find(
      (r) => r.source.visit_id === visit.id,
    )!;
  expect(() =>
    openFieldSource(repo, org, actor, {
      ...row.source,
      location_id: 'foreign',
    }),
  ).toThrow();
  expect(() =>
    openFieldSource(repo, org, actor, row.source, {
      id: item.report.id,
      version: 999,
    }),
  ).toThrow();
  expect(() =>
    openFieldOrigin(repo, org, actor, row.source, {
      ...item.source,
      finding_id: 'foreign',
    }),
  ).toThrow();
  repo.saveVisit(org, visit, {
    ...visit.content,
    summary: 'Changed current draft',
  });
  expect(() => openFieldSource(repo, org, actor, row.source)).toThrow(
    'changed',
  );
  const current = readFieldSchedule(repo, org, actor).rows.find(
    (r) => r.source.visit_id === visit.id,
  )!;
  repo.savePlan(org, { ...plan, name: 'Updated plan' });
  expect(() => openFieldSource(repo, org, actor, current.source)).toThrow(
    'changed',
  );
});
it('report snapshots remain immutable after later draft revision and never imply repair', async () => {
  const { repo, org, actor } = await fixture(),
    row = readFieldSchedule(repo, org, actor).rows.find(
      (r) => r.reports.length,
    )!;
  const before = openFieldSource(
    repo,
    org,
    actor,
    row.source,
    row.reports[0],
  ).published!;
  repo.revise(
    org,
    repo.read(org).visits.find((v) => v.id === row.source.visit_id)!,
  );
  const current = readFieldSchedule(repo, org, actor).rows.find(
    (r) => r.source.visit_id === row.source.visit_id,
  )!;
  expect(
    openFieldSource(repo, org, actor, current.source, row.reports[0]).published,
  ).toEqual(before);
  expect(current.status).toBe('draft');
  expect(before.findings.length).toBeGreaterThan(0);
});
it('separate initialized companies cannot substitute their report or visit references', async () => {
  const { repo, org, actor } = await fixture();
  await repo.initialize(sampleCompanies[1]);
  await repo.refreshContexts(sampleCompanies[1].id);
  const foreign = readFieldSchedule(
    repo,
    sampleCompanies[1].id,
    sampleCompanies[1].id + '-owner',
  ).rows[0];
  expect(() => openFieldSource(repo, org, actor, foreign.source)).toThrow();
  expect(
    readFieldSchedule(repo, org, actor).rows.every(
      (r) => r.source.organization_id === org,
    ),
  ).toBe(true);
});
it('connected repository fails before a membership or remote adapter can run', () => {
  const repo = new PropertyRepository(new Operations(false));
  expect(() => readFieldSchedule(repo, 'foreign', 'actor')).toThrow(
    /connected activation/,
  );
});
it.each([
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
    protocol: 'https:',
  },
  {
    development: true,
    flag: 'true',
    hostname: '127.0.0.1.example.com',
    protocol: 'http:',
  },
  { development: true, flag: 'true', hostname: '127.0.0.1', protocol: 'file:' },
])('preview defaults off or denies nonlocal context %j', (input) =>
  expect(fieldSchedulingPreviewEnabled(input)).toBe(false),
);
it('preview explicitly enables only development + exact flag + loopback', () => {
  expect(
    fieldSchedulingPreviewEnabled({
      development: true,
      flag: 'true',
      hostname: '127.0.0.1',
      protocol: 'http:',
    }),
  ).toBe(true);
});
