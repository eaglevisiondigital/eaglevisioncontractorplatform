import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { industryEstimate } from '../src/domain/estimating/fixtures';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { PropertyRepository } from '../src/lib/property';
import {
  readFieldWorkflow,
  verifyFieldWorkflow,
  openFieldWorkflowReport,
  fieldWorkflowEnabled,
} from '../src/lib/workflows/field-workflow';
import type { PrototypeTarget } from '../src/lib/program/prototype-source';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0, published = true) {
  const company = sampleCompanies[index],
    org = company.id,
    ops = new Operations(true),
    estimates = new Phase3Repository(ops),
    repo = new PropertyRepository(ops, estimates);
  await repo.initialize(company);
  const context = repo.read(org).contexts[0],
    payload = industryEstimate(company, context.customer_id);
  payload.location_id = context.location_id;
  payload.expires_on = '2099-12-31';
  payload.tax_policy_id = (await estimates.taxes(org))[0].id;
  payload.internal_notes = 'PRIVATE supplier and payroll detail';
  const draft = await estimates.create(company, payload),
    issued = await estimates.issue(org, draft),
    job = await estimates.approveJob(org, issued);
  const worker = (await estimates.workforce(org)).workers.find(
    (w) => w.user_id === org + '-field',
  )!;
  await estimates.assignJob(org, job, worker.user_id!, true);
  await repo.refreshContexts(org);
  const actual = repo
    .read(org)
    .contexts.find(
      (c) => c.job_id === job && c.location_id === context.location_id,
    )!;
  const plan = repo.createPlan(org, actual, 'Field journey inspection');
  let visit = repo.addVisit(org, plan.id, '2026-12-07', 'after');
  repo.saveVisit(org, visit, {
    summary: 'Recorded synthetic after-stage review',
    internal_notes: 'PRIVATE staffing and supplier detail',
    checklist: [
      {
        id: crypto.randomUUID(),
        label: 'Condition documented',
        required: true,
        completed: true,
      },
    ],
    findings: [
      {
        id: crypto.randomUUID(),
        category: 'Exterior',
        location: 'Joint',
        description: 'Weathering was documented.',
        recommendation: 'Review a maintenance assessment.',
        severity: 'moderate',
        customer_visible: true,
      },
      {
        id: crypto.randomUUID(),
        category: 'Office',
        location: 'Private',
        description: 'PRIVATE payroll margin',
        recommendation: 'PRIVATE staff assessment',
        severity: 'low',
        customer_visible: false,
      },
    ],
  });
  visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
  let report: ReturnType<PropertyRepository['publish']> | null = null;
  if (published) {
    repo.submit(org, visit);
    visit = repo.read(org).visits.find((v) => v.id === visit.id)!;
    report = repo.publish(org, visit);
  }
  const target: PrototypeTarget = {
    organization_id: org,
    actor_id: org + '-owner',
    customer_id: context.customer_id,
    location_id: context.location_id,
    estimate_id: issued.estimate.id,
    version_id: issued.version.id,
    job_id: job,
  };
  return {
    company,
    org,
    ops,
    estimates,
    repo,
    target,
    issued,
    worker,
    visit,
    report,
    input: { day: '2026-12-07', timezone: 'America/Chicago' },
    gate: { enabled: true, confirmed: true },
  };
}
const read = (f: Awaited<ReturnType<typeof fixture>>) =>
  readFieldWorkflow(f.repo, f.target, f.input, f.gate);
it.each([0, 1, 2])(
  'company %s follows actual job, crew, day and published report without effects',
  async (index) => {
    const f = await fixture(index),
      state = f.repo.read(f.org),
      jobs = await f.estimates.jobs(f.org),
      history = await f.estimates.history(f.org, f.target.estimate_id);
    const writers = [
      vi.spyOn(f.repo, 'saveVisit'),
      vi.spyOn(f.repo, 'publish'),
      vi.spyOn(f.repo, 'addVisit'),
      vi.spyOn(f.estimates, 'assignJob'),
      vi.spyOn(f.estimates, 'recordTime'),
      vi.spyOn(f.estimates, 'issue'),
      vi.spyOn(f.estimates, 'approveJob'),
    ];
    const view = await read(f);
    expect(view.source).toMatchObject({
      organization_id: f.org,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
      job_id: f.target.job_id,
      estimate_id: f.target.estimate_id,
      issued_version_id: f.target.version_id,
    });
    expect(view.day).toMatchObject({
      day: f.input.day,
      actual_availability: 'UNKNOWN',
      capacity: 'UNKNOWN',
      proposed_hours: 'NOT_SUPPLIED',
    });
    expect(
      view.day.crew[0].events.find((e) => e.visit_id === f.visit.id),
    ).toMatchObject({
      timing: 'TIME_UNKNOWN',
      kind: 'DATE_ONLY_VISIT',
      date: f.input.day,
    });
    expect(view.job.crew.map((w) => w.worker_id)).toContain(f.worker.id);
    expect(view.published_reports).toHaveLength(1);
    expect(view.published_reports[0]).toMatchObject({
      report_id: f.report!.id,
      published_version: f.report!.version,
      visit_id: f.visit.id,
      job_id: f.target.job_id,
    });
    expect(view.published_reports[0].snapshot.findings).toHaveLength(1);
    const detail = await openFieldWorkflowReport(view, {
      report_id: f.report!.id,
      published_version: f.report!.version,
    });
    expect(detail.handoff).toEqual({
      organization_id: f.org,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
      job_id: f.target.job_id,
      estimate_id: f.target.estimate_id,
      issued_version_id: f.target.version_id,
      issued_version_number: f.issued.version.version_number,
      report_id: f.report!.id,
      published_version: f.report!.version,
    });
    expect(detail.authority).toBe('NAVIGATION_ONLY');
    expect(
      Object.values(view.authority).every((value) => value === false),
    ).toBe(true);
    expect(view.physical_completion).toBe('UNVERIFIED');
    expect(Object.isFrozen(view.published_reports[0].snapshot)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /PRIVATE|internal_notes|unit_cost|supplier|payroll|margin|rates|deductions/,
    );
    expect(writers.every((writer) => writer.mock.calls.length === 0)).toBe(
      true,
    );
    expect(f.repo.read(f.org)).toEqual(state);
    expect(await f.estimates.jobs(f.org)).toEqual(jobs);
    expect(await f.estimates.history(f.org, f.target.estimate_id)).toEqual(
      history,
    );
    expect(await verifyFieldWorkflow(view)).toEqual({
      status: 'CURRENT',
      replacement: null,
    });
  },
);
it('draft visits are not published reports and empty days do not imply availability', async () => {
  const f = await fixture(0, false);
  f.input.day = '2026-12-31';
  const view = await read(f);
  expect(view.published_reports).toEqual([]);
  expect(view.day.crew[0].events).toEqual([]);
  expect(view.day.actual_availability).toBe('UNKNOWN');
});
it('zero crew relationships keep capacity UNKNOWN instead of assigning someone', async () => {
  const f = await fixture();
  await f.estimates.assignJob(
    f.org,
    f.target.job_id!,
    f.worker.user_id!,
    false,
  );
  const view = await read(f);
  expect(view.job.crew).toEqual([]);
  expect(view.day.crew).toEqual([]);
  expect(view.day.capacity).toBe('UNKNOWN');
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('is default off before source reads: %s', async (gate) => {
  const f = await fixture(),
    source = vi.spyOn(f.estimates, 'readSyntheticPrototypeSources');
  await expect(
    readFieldWorkflow(f.repo, f.target, f.input, gate),
  ).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
});
it('rejects connected repositories before any operational source read', async () => {
  const f = await fixture(),
    repo = new PropertyRepository(new Operations(false)),
    readSource = vi.spyOn(repo.estimates, 'readSyntheticPrototypeSources');
  await expect(
    readFieldWorkflow(repo, f.target, f.input, f.gate),
  ).rejects.toThrow();
  expect(readSource).not.toHaveBeenCalled();
});
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const)('denies foreign exact %s', async (key) => {
  const f = await fixture();
  f.target[key] = 'foreign';
  await expect(read(f)).rejects.toThrow();
});
it('requires a real job, not a null or inferred job association', async () => {
  const f = await fixture();
  f.target.job_id = null;
  await expect(read(f)).rejects.toThrow();
});
it.each(['field', 'estimator'])(
  'does not promote %s access into owner workflow authority',
  async (role) => {
    const f = await fixture();
    f.target.actor_id = f.org + '-' + role;
    await expect(read(f)).rejects.toThrow();
  },
);
it('denies actual administrative revocation and retains UNKNOWN', async () => {
  const f = await fixture(),
    actor = f.org + '-estimator';
  await f.ops.manageMember(f.org, actor, true, 'admin', 'office_manager');
  f.target.actor_id = actor;
  const view = await read(f);
  await f.ops.manageMember(f.org, actor, false, 'admin', 'office_manager');
  expect(await verifyFieldWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
  await expect(
    openFieldWorkflowReport(view, {
      report_id: f.report!.id,
      published_version: f.report!.version,
    }),
  ).rejects.toThrow();
});
it('never substitutes newest, wrong-version, unrelated or cloned report evidence', async () => {
  const f = await fixture(),
    view = await read(f);
  for (const reference of [
    { report_id: f.report!.id, published_version: f.report!.version + 1 },
    { report_id: 'unrelated', published_version: 1 },
  ])
    await expect(openFieldWorkflowReport(view, reference)).rejects.toThrow(
      'displayed',
    );
  await expect(
    openFieldWorkflowReport(structuredClone(view), {
      report_id: f.report!.id,
      published_version: f.report!.version,
    }),
  ).rejects.toThrow('retained');
});
it('does not silently reassociate an unrelated existing job report', async () => {
  const f = await fixture(),
    other = f.repo.read(f.org).visits.find((v) => v.id !== f.visit.id)!;
  f.repo.saveVisit(f.org, other, {
    ...other.content,
    checklist: other.content.checklist.map((c) => ({ ...c, completed: true })),
  });
  let visit = f.repo.read(f.org).visits.find((v) => v.id === other.id)!;
  f.repo.submit(f.org, visit);
  visit = f.repo.read(f.org).visits.find((v) => v.id === other.id)!;
  const unrelated = f.repo.publish(f.org, visit);
  const view = await read(f);
  expect(view.published_reports.map((r) => r.report_id)).not.toContain(
    unrelated.id,
  );
  await expect(
    openFieldWorkflowReport(view, {
      report_id: unrelated.id,
      published_version: unrelated.version,
    }),
  ).rejects.toThrow('displayed');
});
it('retains old published bytes and blocks stale navigation after a visit is reopened', async () => {
  const f = await fixture(),
    view = await read(f),
    before = JSON.stringify(view);
  const visit = f.repo.read(f.org).visits.find((v) => v.id === f.visit.id)!;
  f.repo.revise(f.org, visit);
  expect(await verifyFieldWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
  expect(JSON.stringify(view)).toBe(before);
});
it.each(['2026-02-30', 'invalid'])('denies invalid day %s', async (day) => {
  const f = await fixture();
  f.input.day = day;
  await expect(read(f)).rejects.toThrow();
});
it('denies malformed time zone, target getters and extra report fields without invoking them', async () => {
  const f = await fixture();
  f.input.timezone = 'invalid/zone';
  await expect(read(f)).rejects.toThrow();
  f.input.timezone = 'America/Chicago';
  const getter = vi.fn(() => f.target.customer_id);
  Object.defineProperty(f.target, 'customer_id', { get: getter });
  await expect(read(f)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each(['target', 'day', 'confirmation'])(
  'blocks changed live %s across an actual awaited read',
  async (kind) => {
    const f = await fixture(),
      original = f.estimates.workforce.bind(f.estimates);
    let once = true;
    vi.spyOn(f.estimates, 'workforce').mockImplementation(async (org) => {
      const value = await original(org);
      if (once) {
        once = false;
        if (kind === 'target') f.target.location_id = 'foreign-property';
        else if (kind === 'day') f.input.day = '2026-12-08';
        else f.gate.confirmed = false;
      }
      return value;
    });
    await expect(read(f)).rejects.toThrow();
  },
);
it('catches an actual job revision edit during the final verification hash', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 3) {
      const job = f.estimates.syntheticJob(f.org, f.target.job_id!)!;
      await f.estimates.projection(f.org, job, {
        ...job.projection,
        costs_complete: !job.projection.costs_complete,
      });
    }
    return value;
  });
  await expect(read(f)).rejects.toThrow();
  expect(calls).toBe(3);
});
it('catches an actual report/visit change during the final hash', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 3) {
      const visit = f.repo.read(f.org).visits.find((v) => v.id === f.visit.id)!;
      f.repo.revise(f.org, visit);
    }
    return value;
  });
  await expect(read(f)).rejects.toThrow('visit or plan changed');
});
it('blocks report navigation after an actual final-await crew change without replay', async () => {
  const f = await fixture(),
    view = await read(f),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    await f.estimates.assignJob(
      f.org,
      f.target.job_id!,
      f.worker.user_id!,
      false,
    );
    return value;
  });
  await expect(
    openFieldWorkflowReport(view, {
      report_id: f.report!.id,
      published_version: f.report!.version,
    }),
  ).rejects.toThrow('UNKNOWN');
});
it('retains UNKNOWN after a missing read and never creates a replacement record', async () => {
  const f = await fixture(),
    view = await read(f);
  vi.spyOn(f.estimates, 'readSyntheticPrototypeSources').mockImplementation(
    () => {
      throw Error('uncertain');
    },
  );
  expect(await verifyFieldWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
  expect(await verifyFieldWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
  });
});
it('gates the separate local presentation with exact DEV flag and literal loopback', () => {
  const valid = {
    development: true,
    flag: 'true',
    hostname: '127.0.0.1',
    protocol: 'http:',
  };
  expect(fieldWorkflowEnabled(valid)).toBe(true);
  for (const patch of [
    { development: false },
    { flag: undefined },
    { flag: 'TRUE' },
    { hostname: '127.0.0.1.example.com' },
    { protocol: 'file:' },
  ])
    expect(fieldWorkflowEnabled({ ...valid, ...patch })).toBe(false);
});
