import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import type { PropertyState } from '../src/lib/property';
import { PropertyServiceContinuity } from '../src/components/workflows/PropertyServiceContinuity';
import { readPublishedServiceHistory } from '../src/lib/workflows/published-service-navigation';
import {
  readPropertyServiceContinuity,
  assertPropertyServiceContinuity,
  inspectPropertyServiceJob,
  readPropertyServiceVersionStatus,
  refreshPropertyServiceContinuity,
  readPropertyServiceRequirements,
  handoffPropertyServiceJob,
  type PropertyServiceJobCallback,
} from '../src/lib/workflows/property-service-continuity';
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
    entry = sources.entries[0];
  return {
    sources,
    gate,
    entry,
    job: entry.target.job_id!,
    org: sources.company.id,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function loaded(brand = 0) {
  const f = await fixture(brand);
  return {
    ...f,
    view: await readPropertyServiceContinuity(f.sources, f.job, f.gate),
  };
}
function publish(f: Fixture, index = 0) {
  const repo = f.sources.property,
    entry = f.sources.entries[index];
  let visit = repo.read(f.org).visits.find((v) => v.id === entry.visit_id)!;
  repo.revise(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Actual native published sibling',
    internal_notes: 'PRIVATE_INTERNAL_SUPPLIER',
  });
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.submit(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  return repo.publish(f.org, visit);
}
function corrupt(f: Fixture, change: (s: PropertyState) => void) {
  const original = f.sources.property.read.bind(f.sources.property),
    portal = f.sources.property.portal.bind(f.sources.property);
  let active = true;
  vi.spyOn(f.sources.property, 'read').mockImplementation((org) => {
    const state = original(org);
    if (active) change(state);
    return state;
  });
  vi.spyOn(f.sources.property, 'portal').mockImplementation((org, customer) => {
    const result = portal(org, customer),
      state = original(org);
    if (active) change(state);
    return {
      ...result,
      reports: state.reports.filter((r) => r.customer_id === customer),
    };
  });
  return () => {
    active = false;
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
function digestRace(change: () => void) {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let observed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await original(...args);
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
        /^(actor_id|worker_id|payroll.*|cost.*|margin.*|rate.*|internal_notes|private.*)$/i,
      );
      privacy(child);
    }
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand} reuses original histories for two exact same-property jobs`, async () => {
    const f = await loaded(brand),
      expected = [f.sources.entries[0], f.sources.entries[3]];
    expect(f.view.jobs.map((j) => j.context.job_id)).toEqual(
      expected.map((e) => e.target.job_id),
    );
    expect(
      f.view.jobs.map((j) => j.history.reports[0].reference.report_id),
    ).toEqual(expected.map((e) => e.report_id));
    for (const row of f.view.jobs)
      expect(row.context).toMatchObject({
        organization_id: f.org,
        customer_id: f.entry.target.customer_id,
        location_id: f.entry.target.location_id,
      });
    expect(f.view.history_completeness).toBe('UNKNOWN');
    expect(f.view.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    privacy(f.view);
  });
  it(`brand ${brand} unrelated authorized property is excluded with no fallback handoff`, async () => {
    const f = await loaded(brand),
      other = f.sources.entries[1].target.job_id!;
    expect(() => inspectPropertyServiceJob(f.view, other)).toThrow(
      /same-property/,
    );
    const callback = vi.fn();
    expect(() =>
      handoffPropertyServiceJob(f.view, other, callback, {
        current: callback,
        generation: 0,
      }),
    ).toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
  it(`brand ${brand} selects another exact property job through original host only`, async () => {
    const f = await loaded(brand),
      id = f.sources.entries[3].target.job_id!,
      callback = vi.fn(),
      lease = { current: callback, generation: 0 };
    expect(handoffPropertyServiceJob(f.view, id, callback, lease)).toBe(id);
    expect(callback).toHaveBeenCalledExactlyOnceWith(id, 'completion');
    const next = await readPropertyServiceContinuity(f.sources, id, f.gate);
    expect(next.selected_job_id).toBe(id);
    expect(next.jobs).toHaveLength(2);
  });
  it(`brand ${brand} original report remains selected when an actual sibling version is published`, async () => {
    const f = await loaded(brand),
      old = JSON.stringify(f.view.jobs[0].history.reports),
      sibling = publish(f);
    expect(
      readPropertyServiceVersionStatus(f.view, f.job)
        .selected_published_version,
    ).toBe(1);
    const next = await refreshPropertyServiceContinuity(f.view),
      state = readPropertyServiceVersionStatus(next, f.job);
    expect(state).toMatchObject({
      selected_report_id: f.entry.report_id,
      selected_published_version: 1,
      latest_available_sibling_version: 2,
      status: 'OLDER_AVAILABLE_PUBLISHED_VERSION',
      available_sibling_versions: [1, 2],
    });
    expect(JSON.stringify(f.view.jobs[0].history.reports)).toBe(old);
    const row = inspectPropertyServiceJob(next, f.job),
      exact = row.history.reports.find(
        (r) => r.reference.report_id === sibling.id,
      )!;
    expect(
      readPropertyServiceVersionStatus(next, f.job, exact.reference),
    ).toMatchObject({
      selected_report_id: sibling.id,
      selected_published_version: 2,
      status: 'LATEST_IN_LOADED_PUBLISHED_SIBLINGS',
    });
    expect(() =>
      readPropertyServiceVersionStatus(next, f.job, { ...exact.reference }),
    ).toThrow(/retained/);
  });
  it(`brand ${brand} same property different job version cannot substitute for selected visit`, async () => {
    const f = await loaded(brand);
    publish(f, 3);
    const next = await refreshPropertyServiceContinuity(f.view),
      a = readPropertyServiceVersionStatus(next, f.job),
      b = readPropertyServiceVersionStatus(
        next,
        f.sources.entries[3].target.job_id!,
      );
    expect(a.available_sibling_versions).toEqual([1]);
    expect(b.available_sibling_versions).toEqual([1, 2]);
    const foreignReference = next.jobs[1].history.reports[0].reference;
    expect(() =>
      readPropertyServiceVersionStatus(next, f.job, foreignReference),
    ).toThrow();
  });
  it(`brand ${brand} mutable private task and plan changes never become published updates`, async () => {
    const f = await loaded(brand),
      before = JSON.stringify(f.view.jobs),
      repo = f.sources.property,
      plan = repo.read(f.org).plans.find((p) => p.id === f.entry.plan_id)!;
    repo.savePlan(f.org, { ...plan, name: 'PRIVATE corrected plan' });
    const draft = repo
      .read(f.org)
      .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
    repo.saveVisit(f.org, draft, {
      ...draft.content,
      summary: 'PRIVATE future draft',
    });
    const id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
      job_id: f.job,
      overhead_center: null,
      task: 'PRIVATE recorded labor',
      kind: 'work',
      started_at: '2026-02-03T14:00:00Z',
      ended_at: '2026-02-03T15:00:00Z',
      billable: true,
      corrects_id: null,
    });
    expect(typeof id).toBe('string');
    assertPropertyServiceContinuity(f.view);
    const next = await refreshPropertyServiceContinuity(f.view);
    expect(JSON.stringify(next.jobs)).toBe(before);
    expect(JSON.stringify(next)).not.toContain('PRIVATE');
  });
  it(`brand ${brand} exact original completion requirements retain every unverified boundary`, async () => {
    const f = await loaded(brand),
      review = await readPropertyServiceRequirements(f.view, f.job);
    expect(review.job.reference.job_id).toBe(f.job);
    expect(review.report.reference.report_id).toBe(f.entry.report_id);
    expect(review.coverage).toMatchObject({
      history_completeness: 'UNKNOWN',
      media: 'UNAVAILABLE',
      line_to_finding_links: 'NOT_RECORDED',
    });
    expect(review.interpretation).toEqual({
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
      repair_status: 'NOT_INFERRED',
      delivery: 'NOT_SENT',
      authority: 'DOCUMENTATION_ONLY',
    });
    privacy(review);
  });
  it(`brand ${brand} no completion preparation or financial side effects occur on read and refresh`, async () => {
    const f = await loaded(brand),
      release = JSON.stringify(f.entry.release.read('staff')),
      jobs = JSON.stringify(await f.sources.estimates.jobs(f.org)),
      prepare = vi.spyOn(f.sources.estimates, 'create');
    await readPropertyServiceRequirements(f.view, f.job);
    await refreshPropertyServiceContinuity(f.view);
    expect(JSON.stringify(f.entry.release.read('staff'))).toBe(release);
    expect(JSON.stringify(await f.sources.estimates.jobs(f.org))).toBe(jobs);
    expect(prepare).not.toHaveBeenCalled();
  });
  it(`brand ${brand} revoked staff withholds retained property jobs and callback`, async () => {
    const f = await loaded(brand);
    revoke(f);
    const callback = vi.fn();
    expect(() => assertPropertyServiceContinuity(f.view)).toThrow();
    expect(() =>
      handoffPropertyServiceJob(f.view, f.job, callback, {
        current: callback,
        generation: 0,
      }),
    ).toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
  it(`brand ${brand} source change during original async read yields UNKNOWN not mixed jobs`, async () => {
    const f = await fixture(brand),
      observed = digestRace(() => {
        f.gate.confirmed = false;
      });
    await expect(
      readPropertyServiceContinuity(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    observed();
  });
}
it.each(['customer', 'location', 'job'] as const)(
  'foreign %s identity cannot be substituted (case %#)',
  async (kind) => {
    const f = await fixture(),
      other = f.sources.entries[1],
      target = { ...f.entry.target };
    if (kind === 'customer') target.customer_id = other.target.customer_id;
    if (kind === 'location') target.location_id = other.target.location_id;
    if (kind === 'job') target.job_id = other.target.job_id;
    const sources = { ...f.sources, entries: [{ ...f.entry, target }] };
    await expect(
      readPropertyServiceContinuity(sources, target.job_id!, f.gate),
    ).rejects.toThrow();
  },
);
it.each([
  'report-removed',
  'report-rewritten',
  'plan-job-rebound',
  'duplicate-report',
] as const)(
  'historical %s is denied and original UNKNOWN survives restoration (case %#)',
  async (kind) => {
    const f = await loaded(),
      restore = corrupt(f, (s) => {
        const r = s.reports.find((r) => r.id === f.entry.report_id)!;
        if (kind === 'report-removed')
          s.reports = s.reports.filter(
            (report) => report.id !== f.entry.report_id,
          );
        if (kind === 'report-rewritten')
          r.summary = 'Tampered published description';
        if (kind === 'plan-job-rebound')
          s.plans.find((p) => p.id === f.entry.plan_id)!.job_id =
            f.sources.entries[3].target.job_id!;
        if (kind === 'duplicate-report') s.reports.push({ ...r });
      });
    expect(() => assertPropertyServiceContinuity(f.view)).toThrow();
    restore();
    await expect(
      readPublishedServiceHistory(f.sources, f.job, f.gate),
    ).rejects.toThrow(/UNKNOWN/);
  },
);
it.each(['duplicate-entry', 'missing-entry', 'foreign-root'] as const)(
  'source container %s denies a retained view (case %#)',
  async (kind) => {
    const f = await loaded();
    if (kind === 'duplicate-entry')
      f.sources.entries = [...f.sources.entries, f.entry];
    if (kind === 'missing-entry')
      f.sources.entries = f.sources.entries.slice(1);
    if (kind === 'foreign-root')
      f.sources.operations = (await fixture(1)).sources.operations;
    expect(() => assertPropertyServiceContinuity(f.view)).toThrow();
  },
);
it('callback replacement before dispatch never selects another job', async () => {
  const f = await loaded(),
    callback = vi.fn(),
    replacement = vi.fn();
  expect(() =>
    handoffPropertyServiceJob(f.view, f.job, callback, {
      current: replacement,
      generation: 1,
    }),
  ).toThrow();
  expect(callback).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled();
});
it('callback generation change after dispatch is UNKNOWN with no automatic replay', async () => {
  const f = await loaded();
  const lease: PropertyServiceJobCallback = {
      current: undefined,
      generation: 0,
    },
    callback = vi.fn(() => {
      lease.generation++;
    });
  lease.current = callback;
  expect(() =>
    handoffPropertyServiceJob(f.view, f.job, callback, lease),
  ).toThrow(/UNKNOWN/);
  expect(callback).toHaveBeenCalledTimes(1);
});
it('asynchronous callback acknowledgment is withheld rather than treated as original host success', async () => {
  const f = await loaded(),
    callback = vi.fn(async () => undefined);
  expect(() =>
    handoffPropertyServiceJob(f.view, f.job, callback, {
      current: callback,
      generation: 0,
    }),
  ).toThrow(/UNKNOWN/);
  expect(callback).toHaveBeenCalledTimes(1);
});
it('concurrent read-only inspections preserve exact independent selected reports', async () => {
  const f = await fixture(),
    ids = [f.job, f.sources.entries[3].target.job_id!],
    views = await Promise.all(
      ids.map((id) => readPropertyServiceContinuity(f.sources, id, f.gate)),
    );
  expect(views.map((v) => v.selected_job_id)).toEqual(ids);
  expect(views[0].jobs.map((j) => j.context)).toEqual(
    views[1].jobs.map((j) => j.context),
  );
});
it('expired gate is checked before hostile source getters', async () => {
  let touched = false;
  const sources = Object.defineProperty({}, 'entries', {
    get: () => {
      touched = true;
      throw Error('Getter executed');
    },
  }) as OperatingSources;
  await expect(
    readPropertyServiceContinuity(sources, 'invalid'),
  ).rejects.toThrow(/OFF/);
  expect(touched).toBe(false);
});
it.each(['evil.example', 'localhost'] as const)(
  'default-OFF or non-loopback component does not expose source at %s (case %#)',
  async (hostname) => {
    vi.stubGlobal('window', { location: { hostname, protocol: 'http:' } });
    const html = renderToStaticMarkup(
      createElement(PropertyServiceContinuity, {
        sources: {} as OperatingSources,
        enabled: hostname === 'evil.example',
      }),
    );
    expect(html).toContain('continuity is OFF');
    expect(html).not.toContain('Published service navigator');
  },
);
it('shuffled original source order preserves exact property joins without positional assumptions', async () => {
  const f = await fixture();
  f.sources.entries = [
    f.sources.entries[2],
    f.sources.entries[3],
    f.sources.entries[1],
    f.sources.entries[0],
  ];
  const view = await readPropertyServiceContinuity(f.sources, f.job, f.gate);
  expect(view.jobs.map((j) => j.context.job_id)).toEqual([
    f.sources.entries[1].target.job_id,
    f.sources.entries[3].target.job_id,
  ]);
  expect(
    view.jobs.every(
      (j) =>
        j.context.location_id === f.entry.target.location_id &&
        j.context.customer_id === f.entry.target.customer_id,
    ),
  ).toBe(true);
});
it('same property ID with a foreign customer selector cannot grant another job history', async () => {
  const f = await fixture(),
    sibling = f.sources.entries[3],
    other = f.sources.entries[1];
  f.sources.entries = [
    f.entry,
    {
      ...sibling,
      target: { ...sibling.target, customer_id: other.target.customer_id },
    },
  ];
  await expect(
    readPropertyServiceContinuity(f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it('same customer with an unrelated property ID cannot grant a sibling report', async () => {
  const f = await fixture(),
    sibling = f.sources.entries[3],
    other = f.sources.entries[1];
  f.sources.entries = [
    f.entry,
    {
      ...sibling,
      target: { ...sibling.target, location_id: other.target.location_id },
    },
  ];
  await expect(
    readPropertyServiceContinuity(f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it('missing canonical plan-to-job relation remains UNKNOWN instead of merging report text', async () => {
  const f = await fixture();
  corrupt(f, (s) => {
    s.plans.find((p) => p.id === f.entry.plan_id)!.job_id = null;
  });
  await expect(
    readPropertyServiceContinuity(f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it('forged structural view does not establish property access', async () => {
  const f = await loaded();
  expect(() => assertPropertyServiceContinuity({ ...f.view })).toThrow(
    /Original/,
  );
});
it('revocation during original completion read withholds a late result', async () => {
  const f = await loaded(),
    observed = digestRace(() => {
      f.gate.confirmed = false;
    });
  await expect(
    readPropertyServiceRequirements(f.view, f.job),
  ).rejects.toThrow();
  observed();
});
it('published append during a combined async read is denied until separately read with exact fresh sources', async () => {
  const f = await fixture(),
    observed = digestRace(() => {
      publish(f);
    });
  await expect(
    readPropertyServiceContinuity(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  observed();
});
it('unrecorded intake request linkage remains UNKNOWN across two valid same-property jobs', async () => {
  const f = await loaded();
  expect(f.view.jobs).toHaveLength(2);
  for (const row of f.view.jobs)
    expect(row.history.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
  expect(f.view.jobs[0].context.job_id).not.toBe(f.view.jobs[1].context.job_id);
});
