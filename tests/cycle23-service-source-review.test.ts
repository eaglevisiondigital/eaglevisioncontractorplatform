import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import type { PropertyState } from '../src/lib/property';
import { ServiceSourceReview } from '../src/components/workflows/ServiceSourceReview';
import {
  assertPropertyServiceContinuity,
  handoffPropertyServiceJob,
} from '../src/lib/workflows/property-service-continuity';
import {
  readServiceSourceReview,
  assertServiceSourceReview,
  readServiceSourceLineage,
  inspectServiceSourceReport,
  reconcileServiceSourceReview,
  type ServiceSourceReviewInput,
} from '../src/lib/workflows/service-source-review';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    org = sources.company.id,
    job = entry.target.job_id!,
    input = { job_id: job, staff_context_confirmed: true };
  return { sources, gate, entry, org, job, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function loaded(brand = 0) {
  const f = await fixture(brand);
  return {
    ...f,
    view: await readServiceSourceReview(f.sources, f.input, f.gate),
  };
}
function sameProperty(f: Fixture) {
  return f.sources.entries.filter(
    (e) =>
      e.target.organization_id === f.org &&
      e.target.customer_id === f.entry.target.customer_id &&
      e.target.location_id === f.entry.target.location_id,
  );
}
function publish(f: Fixture) {
  const repo = f.sources.property;
  let visit = repo.read(f.org).visits.find((v) => v.id === f.entry.visit_id)!;
  repo.revise(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Native source-linked published sibling',
    internal_notes: 'PRIVATE_INTERNAL_STAFF_ONLY',
  });
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.submit(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  return repo.publish(f.org, visit);
}
function corrupt(f: Fixture, change: (state: PropertyState) => void) {
  const read = f.sources.property.read.bind(f.sources.property),
    portal = f.sources.property.portal.bind(f.sources.property);
  let changed = true;
  vi.spyOn(f.sources.property, 'read').mockImplementation((org) => {
    const state = read(org);
    if (changed) change(state);
    return state;
  });
  vi.spyOn(f.sources.property, 'portal').mockImplementation((org, customer) => {
    const result = portal(org, customer),
      state = read(org);
    if (changed) change(state);
    return {
      ...result,
      reports: state.reports.filter((r) => r.customer_id === customer),
    };
  });
  return () => {
    changed = false;
  };
}
function revoke(f: Fixture) {
  const memberships = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  let active = false;
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      memberships(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active } : m,
      ),
  );
  return () => {
    active = true;
  };
}
function race(change: () => void) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let observed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (!observed) {
      observed = true;
      change();
    }
    return result;
  });
  return () => expect(observed).toBe(true);
}
function privacy(value: unknown) {
  if (Array.isArray(value)) value.forEach(privacy);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(
        /^(actor_id|user_id|worker_id|employee_id|assigned_to|payroll.*|wage.*|deduction.*|rate.*|cost.*|margin.*|internal_notes|private.*)$/i,
      );
      privacy(child);
    }
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand} shows the actual original request and separates staff context from a missing request-job FK`, async () => {
    const f = await loaded(brand),
      lineage = readServiceSourceLineage(f.view),
      actual = f.sources.operations.syntheticIntakeRequest(
        f.org,
        f.entry.target.customer_id,
        f.entry.target.location_id,
        f.entry.intake_request_id,
      );
    expect(lineage.request).toEqual({
      id: actual.id,
      summary: actual.summary,
      status: actual.status,
    });
    expect(lineage.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(lineage.request_context).toBe('EXPLICIT_STAFF_SELECTED_CONTEXT');
    expect(lineage.scope.job_id).toBe(f.job);
    expect(lineage.scope.issued_version_id).toBe(f.entry.target.version_id);
    expect(Object.keys(f.view).sort()).toEqual(['context', 'property']);
    expect(Object.isFrozen(f.view)).toBe(true);
  });
  it(`brand ${brand} report drill-down follows exact native report-visit-plan-job and issued-version foreign keys`, async () => {
    const f = await loaded(brand),
      lineage = readServiceSourceLineage(f.view),
      state = f.sources.property.read(f.org);
    expect(lineage.reports.length).toBeGreaterThan(0);
    for (const row of lineage.reports) {
      const report = state.reports.filter(
        (r) =>
          r.id === row.reference.report_id &&
          r.version === row.reference.published_version,
      );
      expect(report).toHaveLength(1);
      expect(report[0].visit_id).toBe(row.visit_id);
      const visit = state.visits.filter((v) => v.id === row.visit_id);
      expect(visit).toHaveLength(1);
      expect(visit[0].plan_id).toBe(row.plan_id);
      const plan = state.plans.filter((p) => p.id === row.plan_id);
      expect(plan).toHaveLength(1);
      expect(plan[0]).toMatchObject({
        job_id: f.job,
        customer_id: f.entry.target.customer_id,
        location_id: f.entry.target.location_id,
      });
      expect(row.relationship).toBe('EXACT_RECORDED_REPORT_VISIT_PLAN_JOB');
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(lineage.issued_job_link).toBe('EXACT_RECORDED_ISSUED_JOB_BASELINE');
  });
  it(`brand ${brand} delegates original completion requirements without claiming physical completion or acceptance`, async () => {
    const f = await loaded(brand),
      lineage = readServiceSourceLineage(f.view),
      detail = await inspectServiceSourceReport(
        f.view,
        lineage.reports[0].reference,
      );
    expect(detail.report.reference).toEqual(lineage.reports[0].reference);
    expect(detail.completion?.job.reference).toMatchObject({
      job_id: f.job,
      issued_version_id: f.entry.target.version_id,
    });
    expect(detail.completion?.coverage).toMatchObject({
      line_to_finding_links: 'NOT_RECORDED',
      media: 'UNAVAILABLE',
      history_completeness: 'UNKNOWN',
    });
    expect(detail.completion?.interpretation).toMatchObject({
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      delivery: 'NOT_SENT',
      repair_status: 'NOT_INFERRED',
    });
    expect(lineage.required_proof.map((p) => p.kind)).toEqual([
      'SCOPE_VERIFICATION',
      'PHYSICAL_COMPLETION',
      'CUSTOMER_ACCEPTANCE',
      'WARRANTY',
    ]);
    expect(lineage.required_proof.every((p) => p.status === 'UNKNOWN')).toBe(
      true,
    );
    expect(lineage.required_proof).toBe(
      f.view.context.customer_safe.required_proof,
    );
  });
  it(`brand ${brand} retains unchanged C22 same-property handoff with authoritative joins`, async () => {
    const f = await loaded(brand),
      expected = sameProperty(f),
      sibling = expected.find((e) => e.target.job_id !== f.job)!;
    expect(f.view.property.jobs.map((j) => j.context.job_id)).toEqual(
      expected.map((e) => e.target.job_id),
    );
    const callback = vi.fn();
    handoffPropertyServiceJob(
      f.view.property,
      sibling.target.job_id!,
      callback,
      { current: callback, generation: 0 },
    );
    expect(callback).toHaveBeenCalledExactlyOnceWith(
      sibling.target.job_id,
      'completion',
    );
    const other = await readServiceSourceReview(
      f.sources,
      { job_id: sibling.target.job_id!, staff_context_confirmed: true },
      f.gate,
    );
    expect(readServiceSourceLineage(other).scope.job_id).toBe(
      sibling.target.job_id,
    );
    expect(readServiceSourceLineage(f.view).scope.job_id).toBe(f.job);
  });
  it(`brand ${brand} publication appends a version without rewriting the original report or changing its job`, async () => {
    const f = await loaded(brand),
      old = JSON.stringify(f.view.property.jobs),
      added = publish(f);
    expect(reconcileServiceSourceReview(f.view).status).toBe('UNKNOWN');
    assertPropertyServiceContinuity(f.view.property);
    expect(JSON.stringify(f.view.property.jobs)).toBe(old);
    const next = await readServiceSourceReview(f.sources, f.input, f.gate),
      lineage = readServiceSourceLineage(next);
    expect(lineage.reports.map((r) => r.reference.published_version)).toEqual([
      1, 2,
    ]);
    expect(lineage.reports[0].reference.report_id).toBe(f.entry.report_id);
    expect(lineage.reports[1].reference.report_id).toBe(added.id);
    expect(lineage.reports[0].version.status).toBe(
      'OLDER_AVAILABLE_PUBLISHED_VERSION',
    );
    const oldDetail = await inspectServiceSourceReport(
        next,
        lineage.reports[0].reference,
      ),
      newDetail = await inspectServiceSourceReport(
        next,
        lineage.reports[1].reference,
      );
    expect(oldDetail.report.reference.published_version).toBe(1);
    expect(newDetail.report.reference.published_version).toBe(2);
    expect(oldDetail.completion?.job.reference.job_id).toBe(
      newDetail.completion?.job.reference.job_id,
    );
  });
  it(`brand ${brand} actual request status change stales the source review without publishing an update`, async () => {
    const f = await loaded(brand),
      old = JSON.stringify(f.view.property.jobs),
      request = f.view.context.request;
    await f.sources.operations.assignIntake(
      f.org,
      request.id,
      null,
      'contacted',
    );
    expect(reconcileServiceSourceReview(f.view)).toEqual({
      status: 'UNKNOWN',
      replay: false,
      replacement: null,
    });
    expect(JSON.stringify(f.view.context.request)).toBe(
      JSON.stringify(request),
    );
    expect(JSON.stringify(f.view.property.jobs)).toBe(old);
    const next = await readServiceSourceReview(f.sources, f.input, f.gate);
    expect(readServiceSourceLineage(next).request.status).toBe('contacted');
    expect(JSON.stringify(next.property.jobs)).toBe(old);
    expect(reconcileServiceSourceReview(f.view).status).toBe('UNKNOWN');
  });
  it(`brand ${brand} private task and draft changes never appear as published customer evidence`, async () => {
    const f = await loaded(brand),
      before = JSON.stringify(f.view.property.jobs),
      draft = f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
    f.sources.property.saveVisit(f.org, draft, {
      ...draft.content,
      summary: 'PRIVATE_DRAFT_CHANGE',
      internal_notes: 'PRIVATE_SUPPLIER_MARGIN',
    });
    expect(reconcileServiceSourceReview(f.view).status).toBe('UNKNOWN');
    const fresh = await readServiceSourceReview(f.sources, f.input, f.gate),
      lineage = readServiceSourceLineage(fresh);
    expect(JSON.stringify(fresh.property.jobs)).toBe(before);
    expect(JSON.stringify(lineage)).not.toContain('PRIVATE_');
    privacy(lineage);
    privacy(
      await inspectServiceSourceReport(fresh, lineage.reports[0].reference),
    );
  });
  it(`brand ${brand} read-only reviews create no contract, estimate, invoice, ledger, job or publication side effects`, async () => {
    const f = await fixture(brand),
      release = JSON.stringify(f.entry.release.read('staff')),
      jobs = JSON.stringify(await f.sources.estimates.jobs(f.org)),
      property = JSON.stringify(f.sources.property.read(f.org)),
      commands = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.operations, 'assignIntake'),
      ];
    const view = await readServiceSourceReview(f.sources, f.input, f.gate);
    await inspectServiceSourceReport(
      view,
      readServiceSourceLineage(view).reports[0].reference,
    );
    expect(JSON.stringify(f.entry.release.read('staff'))).toBe(release);
    expect(JSON.stringify(await f.sources.estimates.jobs(f.org))).toBe(jobs);
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(property);
    commands.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
  it(`brand ${brand} original UNKNOWN custody survives revoked membership restoration`, async () => {
    const f = await loaded(brand),
      restore = revoke(f);
    expect(() => assertServiceSourceReview(f.view)).toThrow();
    restore();
    expect(reconcileServiceSourceReview(f.view)).toEqual({
      status: 'UNKNOWN',
      replay: false,
      replacement: null,
    });
    await expect(
      inspectServiceSourceReport(
        f.view,
        f.view.property.jobs[0].history.reports[0].reference,
      ),
    ).rejects.toThrow();
  });
  it(`brand ${brand} concurrent source reviews preserve independently selected same-property jobs`, async () => {
    const f = await fixture(brand),
      ids = sameProperty(f).map((e) => e.target.job_id!);
    const views = await Promise.all(
      ids.map((job_id) =>
        readServiceSourceReview(
          f.sources,
          { job_id, staff_context_confirmed: true },
          f.gate,
        ),
      ),
    );
    expect(views.map((v) => readServiceSourceLineage(v).scope.job_id)).toEqual(
      ids,
    );
    expect(
      new Set(
        views.map(
          (v) => readServiceSourceLineage(v).reports[0].reference.report_id,
        ),
      ).size,
    ).toBe(ids.length);
  });
}
it.each([
  'organization',
  'customer',
  'property',
  'job',
  'issued-version',
  'request',
] as const)(
  'foreign %s selector does not confer source access (case %#)',
  async (kind) => {
    const f = await fixture(),
      other = f.sources.entries.find(
        (e) => e.target.customer_id !== f.entry.target.customer_id,
      )!,
      target = { ...f.entry.target };
    if (kind === 'organization') target.organization_id = sampleCompanies[1].id;
    if (kind === 'customer') target.customer_id = other.target.customer_id;
    if (kind === 'property') target.location_id = other.target.location_id;
    if (kind === 'job') target.job_id = other.target.job_id;
    if (kind === 'issued-version') target.version_id = other.target.version_id;
    const entry = {
      ...f.entry,
      target,
      ...(kind === 'request'
        ? { intake_request_id: other.intake_request_id }
        : {}),
    };
    await expect(
      readServiceSourceReview(
        { ...f.sources, entries: [entry] },
        { job_id: target.job_id!, staff_context_confirmed: true },
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it.each([
  'missing-report',
  'duplicate-report',
  'missing-visit',
  'unlinked-plan',
  'foreign-plan-job',
] as const)(
  'missing or ambiguous %s never becomes a property/date/text association (case %#)',
  async (kind) => {
    const f = await loaded(),
      restore = corrupt(f, (s) => {
        const report = s.reports.find((r) => r.id === f.entry.report_id)!;
        if (kind === 'missing-report')
          s.reports = s.reports.filter((r) => r.id !== f.entry.report_id);
        if (kind === 'duplicate-report') s.reports.push({ ...report });
        if (kind === 'missing-visit')
          s.visits = s.visits.filter((v) => v.id !== f.entry.visit_id);
        if (kind === 'unlinked-plan')
          s.plans.find((p) => p.id === f.entry.plan_id)!.job_id = null;
        if (kind === 'foreign-plan-job')
          s.plans.find((p) => p.id === f.entry.plan_id)!.job_id = sameProperty(
            f,
          ).find((e) => e.target.job_id !== f.job)!.target.job_id!;
      });
    expect(() => readServiceSourceLineage(f.view)).toThrow();
    restore();
    expect(reconcileServiceSourceReview(f.view).status).toBe('UNKNOWN');
  },
);
it('same-property other-job report and a cloned reference cannot replace an exact original report', async () => {
  const f = await loaded(),
    own = readServiceSourceLineage(f.view).reports[0].reference,
    foreign = f.view.property.jobs.find((j) => j.context.job_id !== f.job)!
      .history.reports[0].reference;
  await expect(inspectServiceSourceReport(f.view, foreign)).rejects.toThrow();
  await expect(
    inspectServiceSourceReport(f.view, { ...own }),
  ).rejects.toThrow();
  expect(
    (await inspectServiceSourceReport(f.view, own)).completion?.job.reference
      .job_id,
  ).toBe(f.job);
});
it('different authorized customer/property handles cannot be mixed into one source review', async () => {
  const f = await loaded(),
    otherJob = f.sources.entries.find(
      (e) => e.target.customer_id !== f.entry.target.customer_id,
    )!.target.job_id!,
    other = await readServiceSourceReview(
      f.sources,
      { job_id: otherJob, staff_context_confirmed: true },
      f.gate,
    );
  expect(() =>
    assertServiceSourceReview({
      context: f.view.context,
      property: other.property,
    }),
  ).toThrow();
  expect(() => assertServiceSourceReview(structuredClone(f.view))).toThrow();
});
it('shuffled entry order retains request and published lineage by exact IDs', async () => {
  const f = await fixture();
  f.sources.entries = [...f.sources.entries].reverse();
  const view = await readServiceSourceReview(f.sources, f.input, f.gate),
    lineage = readServiceSourceLineage(view);
  expect(lineage.request.id).toBe(f.entry.intake_request_id);
  expect(lineage.scope.job_id).toBe(f.job);
  expect(lineage.reports[0].reference.report_id).toBe(f.entry.report_id);
  expect(view.property.jobs.map((j) => j.context.job_id)).toEqual(
    sameProperty(f).map((e) => e.target.job_id),
  );
});
it.each(['gate', 'job-selection', 'native-request', 'membership'] as const)(
  'concurrent %s change during an actual async source read denies a mixed result (case %#)',
  async (kind) => {
    const f = await fixture(),
      observed = race(() => {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'job-selection')
          f.input.job_id = f.sources.entries.find(
            (e) => e.target.job_id !== f.job,
          )!.target.job_id!;
        if (kind === 'native-request')
          void f.sources.operations.assignIntake(
            f.org,
            f.entry.intake_request_id,
            null,
            'contacted',
          );
        if (kind === 'membership') revoke(f);
      });
    await expect(
      readServiceSourceReview(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    observed();
  },
);
it('withdrawal during exact report inspection preserves original UNKNOWN without reconciliation replay', async () => {
  const f = await loaded(),
    ref = readServiceSourceLineage(f.view).reports[0].reference,
    observed = race(() => {
      f.gate.confirmed = false;
    });
  await expect(inspectServiceSourceReport(f.view, ref)).rejects.toThrow();
  observed();
  f.gate.confirmed = true;
  expect(reconcileServiceSourceReview(f.view).status).toBe('UNKNOWN');
});
it.each([false, undefined] as const)(
  'explicit staff context confirmation %s is required before source reads (case %#)',
  async (confirmed) => {
    const f = await fixture();
    await expect(
      readServiceSourceReview(
        f.sources,
        {
          job_id: f.job,
          staff_context_confirmed: confirmed,
        } as ServiceSourceReviewInput,
        f.gate,
      ),
    ).rejects.toThrow(/context/);
  },
);
it('OFF admission does not execute source or input accessors', async () => {
  let touched = false;
  const bad = Object.defineProperty({}, 'job_id', {
    get: () => {
      touched = true;
      throw Error('Getter');
    },
  }) as ServiceSourceReviewInput;
  await expect(
    readServiceSourceReview({} as OperatingSources, bad),
  ).rejects.toThrow(/OFF/);
  expect(touched).toBe(false);
});
it.each(['default-off', 'foreign-host', 'https', 'production'] as const)(
  'component remains OFF for %s before accessing sources (case %#)',
  (kind) => {
    if (kind === 'foreign-host')
      vi.stubGlobal('window', {
        location: { hostname: 'example.test', protocol: 'http:' },
      });
    if (kind === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const html = renderToStaticMarkup(
      createElement(ServiceSourceReview, {
        sources: {} as OperatingSources,
        enabled: kind !== 'default-off',
      }),
    );
    expect(html).toContain('Service source review is OFF');
    expect(html).not.toContain('Review exact request');
  },
);
