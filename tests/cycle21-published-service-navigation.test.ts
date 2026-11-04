import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import type { PropertyState } from '../src/lib/property';
import { PublishedServiceNavigator } from '../src/components/workflows/PublishedServiceNavigator';
import {
  readPublishedServiceHistory,
  refreshPublishedServiceHistory,
  assertPublishedServiceHistory,
  publishedServiceContext,
  filterPublishedServiceHistory,
  inspectPublishedServiceReport,
  inspectPublishedServiceFinding,
  publishedServiceReportPage,
  readPublishedServiceRequirements,
  continuePublishedServiceReview,
  type PublishedServiceCallback,
} from '../src/lib/workflows/published-service-navigation';
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
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!;
  return { gate, all, entry, sources, job, org: sources.company.id };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function loaded(brand = 0) {
  const f = await fixture(brand);
  return {
    ...f,
    view: await readPublishedServiceHistory(f.sources, f.job, f.gate),
  };
}
function publish(f: Fixture) {
  const repo = f.sources.property;
  let visit = repo.read(f.org).visits.find((v) => v.id === f.entry.visit_id)!;
  repo.revise(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Explicit original-engine published sibling version',
    internal_notes: 'PRIVATE_SUPPLIER_AND_WORKFORCE',
  });
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  repo.submit(f.org, visit);
  visit = repo.read(f.org).visits.find((v) => v.id === visit.id)!;
  return repo.publish(f.org, visit);
}
function corrupt(f: Fixture, change: (s: PropertyState) => void) {
  let active = true;
  const repo = f.sources.property,
    read = repo.read.bind(repo),
    portal = repo.portal.bind(repo);
  vi.spyOn(repo, 'read').mockImplementation((org) => {
    const s = read(org);
    if (active) change(s);
    return s;
  });
  vi.spyOn(repo, 'portal').mockImplementation((org, customer) => {
    const result = portal(org, customer),
      s = read(org);
    if (active) change(s);
    return {
      ...result,
      reports: s.reports.filter((r) => r.customer_id === customer),
    };
  });
  return () => {
    active = false;
  };
}
function revoke(f: Fixture) {
  let active = false;
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active } : m,
      ),
  );
  return () => {
    active = true;
  };
}
function digestRace(
  change: () => void,
  matches = (s: string) => s.includes('"kind":"customer"'),
) {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let seen = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (!seen && matches(new TextDecoder().decode(args[1] as Uint8Array))) {
      seen = true;
      change();
    }
    return result;
  });
  return () => expect(seen).toBe(true);
}
function privacy(value: unknown) {
  if (Array.isArray(value)) value.forEach(privacy);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(
        /^(actor_id|user_id|worker_id|employee_id|staff.*|payroll.*|wage.*|deduction.*|rate.*|cost.*|private.*|internal_notes)$/i,
      );
      privacy(child);
    }
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand} reads the original exact-job safe published history and context`, async () => {
    const f = await loaded(brand),
      c = publishedServiceContext(f.view);
    expect(c).toEqual({
      organization_id: f.org,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.job,
      estimate_id: f.entry.target.estimate_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(f.view.reports).toHaveLength(1);
    expect(f.view.reports[0].reference.report_id).toBe(f.entry.report_id);
    expect(f.view.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(f.view.history_completeness).toBe('UNKNOWN');
    privacy(f.view);
    privacy(c);
  });
  it(`brand ${brand} opens exact original Passport report/finding and reuses report DTO shape`, async () => {
    const f = await loaded(brand),
      r = inspectPublishedServiceReport(f.view, f.view.reports[0].reference),
      o = r.report.observations[0],
      finding = inspectPublishedServiceFinding(f.view, o.reference),
      page = publishedServiceReportPage(f.view, r.reference);
    expect(r).toBe(f.view.reports[0]);
    expect(finding).toBe(o);
    expect(page[0]).toMatchObject({
      id: r.reference.report_id,
      version: 1,
      snapshot: {
        summary: r.report.summary,
        findings: [{ id: o.reference.finding_id, description: o.observation }],
        media: [],
      },
    });
    privacy(page);
  });
  it(`brand ${brand} genuine plan correction leaves the immutable published history unchanged`, async () => {
    const f = await loaded(brand),
      before = JSON.stringify(f.view.reports),
      repo = f.sources.property,
      plan = repo.read(f.org).plans.find((p) => p.id === f.entry.plan_id)!;
    repo.savePlan(f.org, { ...plan, name: plan.name + ' saved correction' });
    expect(repo.read(f.org).plans.find((p) => p.id === plan.id)!.revision).toBe(
      plan.revision + 1,
    );
    assertPublishedServiceHistory(f.view);
    expect(
      JSON.stringify((await refreshPublishedServiceHistory(f.view)).reports),
    ).toBe(before);
  });
  it(`brand ${brand} genuine private draft save never becomes published history`, async () => {
    const f = await loaded(brand),
      before = JSON.stringify(f.view.reports),
      repo = f.sources.property,
      draft = repo
        .read(f.org)
        .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
    repo.saveVisit(f.org, draft, {
      ...draft.content,
      summary: 'PRIVATE_DRAFT_SUMMARY',
      internal_notes: 'PRIVATE_RATES_AND_SUPPLIERS',
    });
    expect(
      repo.read(f.org).visits.find((v) => v.id === draft.id)!.revision,
    ).toBe(draft.revision + 1);
    assertPublishedServiceHistory(f.view);
    const next = await refreshPublishedServiceHistory(f.view);
    expect(JSON.stringify(next.reports)).toBe(before);
    expect(JSON.stringify(next)).not.toContain('PRIVATE_');
  });
  it(`brand ${brand} genuine task correction changes original time records only`, async () => {
    const f = await loaded(brand),
      before = JSON.stringify(f.view.reports),
      repo = f.sources.estimates;
    const input = {
      job_id: f.job,
      overhead_center: null,
      task: 'PRIVATE original task',
      kind: 'work' as const,
      started_at: '2026-02-03T14:00:00.000Z',
      ended_at: '2026-02-03T15:00:00.000Z',
      billable: true,
      corrects_id: null,
    };
    const id = await repo.recordTime(f.org, f.entry.worker_id, input);
    if (typeof id !== 'string') throw Error('Original time acknowledgment');
    const correction = await repo.recordTime(f.org, f.entry.worker_id, {
      ...input,
      task: 'PRIVATE corrected task',
      corrects_id: id,
    });
    expect(typeof correction).toBe('string');
    expect(correction).not.toBe(id);
    assertPublishedServiceHistory(f.view);
    const next = await refreshPublishedServiceHistory(f.view);
    expect(JSON.stringify(next.reports)).toBe(before);
    expect(JSON.stringify(next)).not.toContain('PRIVATE');
  });
  it(`brand ${brand} appended published version is explicitly selected and old exact content remains reachable`, async () => {
    const f = await loaded(brand),
      original = inspectPublishedServiceReport(
        f.view,
        f.view.reports[0].reference,
      ),
      bytes = JSON.stringify(original),
      nextReport = publish(f);
    expect(nextReport.id).not.toBe(original.reference.report_id);
    expect(nextReport.version).toBe(2);
    assertPublishedServiceHistory(f.view);
    expect(f.view.reports).toHaveLength(1);
    const next = await refreshPublishedServiceHistory(f.view);
    expect(next.reports).toHaveLength(2);
    const old = next.reports.find(
      (r) => r.reference.report_id === original.reference.report_id,
    )!;
    expect(
      JSON.stringify(inspectPublishedServiceReport(next, old.reference)),
    ).toBe(bytes);
    const current = next.reports.find(
      (r) => r.reference.report_id === nextReport.id,
    )!;
    expect(
      inspectPublishedServiceReport(next, current.reference).reference
        .published_version,
    ).toBe(2);
    expect(JSON.stringify(f.view.reports[0])).toBe(bytes);
  });
  it(`brand ${brand} original completion requirement drilldown remains unverified without effects`, async () => {
    const f = await loaded(brand),
      writes = [
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
      ];
    const review = await readPublishedServiceRequirements(
      f.view,
      f.view.reports[0].reference,
    );
    expect(review.job.reference.job_id).toBe(f.job);
    expect(review.report.reference.report_id).toBe(f.entry.report_id);
    expect(review.interpretation).toMatchObject({
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
      delivery: 'NOT_SENT',
      authority: 'DOCUMENTATION_ONLY',
    });
    expect(review.coverage.line_to_finding_links).toBe('NOT_RECORDED');
    expect(
      review.job.lines.every(
        (l) => l.documentation_match === 'NOT_ESTABLISHED',
      ),
    ).toBe(true);
    privacy(review);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });
  it(`brand ${brand} observed revoked member remains terminal after restoration and fresh wrapper`, async () => {
    const f = await loaded(brand),
      restore = revoke(f);
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
    restore();
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
    await expect(
      readPublishedServiceHistory({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow('UNKNOWN');
  });
  it(`brand ${brand} final asynchronous read fence denies revoked membership`, async () => {
    const f = await fixture(brand);
    const seen = digestRace(() => {
      revoke(f);
    });
    await expect(
      readPublishedServiceHistory(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    seen();
  });
}
it('same-property sibling job documentation is never grafted or selected by reference', async () => {
  const f = await loaded(),
    sibling = f.all.entries[3];
  expect(sibling.target.location_id).toBe(f.entry.target.location_id);
  expect(sibling.target.job_id).not.toBe(f.job);
  const other = await readPublishedServiceHistory(
    { ...f.all, entries: [sibling] },
    sibling.target.job_id!,
    f.gate,
  );
  expect(
    f.view.reports.some((r) => r.reference.report_id === sibling.report_id),
  ).toBe(false);
  expect(() =>
    inspectPublishedServiceReport(f.view, other.reports[0].reference),
  ).toThrow();
  expect(() =>
    inspectPublishedServiceFinding(
      f.view,
      other.reports[0].report.observations[0].reference,
    ),
  ).toThrow();
});
it.each(['property', 'job', 'tenant'] as const)(
  'observed wrong %s lineage remains UNKNOWN after source restoration',
  async (kind) => {
    const f = await loaded(),
      restore = corrupt(f, (s) => {
        const p = s.plans.find((p) => p.id === f.entry.plan_id)!;
        if (kind === 'property')
          p.location_id = f.all.entries[1].target.location_id;
        if (kind === 'job') p.job_id = f.all.entries[3].target.job_id;
        if (kind === 'tenant') p.organization_id = 'sample-roofing';
      });
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
    restore();
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
    await expect(
      readPublishedServiceHistory({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each(['missing', 'rewritten', 'duplicate'] as const)(
  'historical %s report denies and cannot revive after restoration',
  async (kind) => {
    const f = await loaded(),
      restore = corrupt(f, (s) => {
        const r = s.reports.find((r) => r.id === f.entry.report_id)!;
        if (kind === 'missing')
          s.reports = s.reports.filter((r) => r.id !== f.entry.report_id);
        if (kind === 'rewritten') r.summary += ' rewritten';
        if (kind === 'duplicate') s.reports.push({ ...r });
      });
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
    restore();
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
  },
);
it.each(['gap', 'ambiguous'] as const)(
  'actual appended reports with %s historical versions cannot be admitted',
  async (kind) => {
    const f = await fixture(),
      next = publish(f);
    corrupt(f, (s) => {
      if (kind === 'gap')
        s.reports = s.reports.filter((r) => r.id !== f.entry.report_id);
      else s.reports.find((r) => r.id === next.id)!.version = 1;
    });
    await expect(
      readPublishedServiceHistory(f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i foreign company and wrong job hints never fall back to another prepared record',
  async (brand) => {
    const f = await fixture(brand),
      foreign = await fixture((brand + 1) % 3);
    await expect(
      readPublishedServiceHistory(foreign.sources, f.job, foreign.gate),
    ).rejects.toThrow();
    await expect(
      readPublishedServiceHistory(
        f.sources,
        f.all.entries[1].target.job_id!,
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it('literal combined filters preserve same finding severity and exact original references', async () => {
  const f = await loaded();
  const filtered = filterPublishedServiceHistory(f.view, {
    query: 'WEATHERED',
    phase: 'after',
    severity: 'moderate',
  });
  expect(filtered).toHaveLength(1);
  expect(filtered[0]).toBe(f.view.reports[0]);
  expect(
    filterPublishedServiceHistory(f.view, {
      query: '.*',
      phase: '',
      severity: '',
    }),
  ).toHaveLength(0);
  expect(
    filterPublishedServiceHistory(f.view, {
      query: 'weathered',
      phase: 'before',
      severity: 'moderate',
    }),
  ).toHaveLength(0);
  expect(
    filterPublishedServiceHistory(f.view, {
      query: '',
      phase: 'after',
      severity: 'urgent',
    }),
  ).toHaveLength(0);
});
it.each(['phase', 'severity', 'query'] as const)(
  'invalid %s filter does not coerce or substitute a source',
  async (field) => {
    const f = await loaded(),
      input = {
        query: '',
        phase: '',
        severity: '',
        [field]: field === 'query' ? 'x'.repeat(101) : 'invented',
      };
    expect(() => filterPublishedServiceHistory(f.view, input)).toThrow();
    assertPublishedServiceHistory(f.view);
  },
);
it('forged report and finding clones are denied without executing getters', async () => {
  const f = await loaded(),
    r = f.view.reports[0],
    getter = vi.fn(() => r.reference.report_id);
  expect(() =>
    inspectPublishedServiceReport(f.view, { ...r.reference }),
  ).toThrow();
  expect(() =>
    inspectPublishedServiceFinding(f.view, {
      ...r.report.observations[0].reference,
    }),
  ).toThrow();
  const fake = Object.defineProperty({}, 'report_id', { get: getter });
  expect(() =>
    inspectPublishedServiceReport(f.view, fake as typeof r.reference),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('published append during the read is rejected at the final source fence', async () => {
  const f = await fixture(),
    seen = digestRace(() => publish(f));
  await expect(
    readPublishedServiceHistory(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  seen();
  await expect(
    readPublishedServiceHistory({ ...f.sources }, f.job, f.gate),
  ).rejects.toThrow('UNKNOWN');
});
it('completion read cannot expose a result after final digest revocation', async () => {
  const f = await loaded(),
    seen = digestRace(
      () => {
        revoke(f);
      },
      (s) =>
        s.includes('"mode":"LOCAL_CUSTOMER_COMPLETION_DOCUMENTATION_REVIEW"'),
    );
  await expect(
    readPublishedServiceRequirements(f.view, f.view.reports[0].reference),
  ).rejects.toThrow();
  seen();
});
it('canonical pending ownership excludes a second independently read view until the exact callback finishes', async () => {
  const f = await loaded(),
    other = await readPublishedServiceHistory({ ...f.sources }, f.job, f.gate),
    a = inspectPublishedServiceReport(f.view, f.view.reports[0].reference),
    b = inspectPublishedServiceReport(other, other.reports[0].reference);
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((r) => {
      entered = r;
    }),
    deferred = new Promise<void>((r) => {
      release = r;
    });
  const callback = vi.fn(async () => {
      entered();
      await deferred;
    }),
    live = { current: callback, generation: 0 };
  const first = continuePublishedServiceReview(f.view, a, callback, live);
  await started;
  await expect(
    continuePublishedServiceReview(other, b, callback, live),
  ).rejects.toThrow('pending');
  expect(callback).toHaveBeenCalledTimes(1);
  release();
  await expect(first).resolves.toMatchObject({
    status: 'LOCAL_REVIEW_NAVIGATION_ONLY',
    job_id: f.job,
  });
});
it('known callback withdrawal before dispatch releases only its own pending claim', async () => {
  const f = await loaded(),
    r = inspectPublishedServiceReport(f.view, f.view.reports[0].reference),
    callback = vi.fn(),
    live: PublishedServiceCallback = { current: callback, generation: 0 };
  const first = continuePublishedServiceReview(f.view, r, callback, live);
  live.current = undefined;
  live.generation++;
  await expect(first).rejects.toThrow(/callback/i);
  expect(callback).not.toHaveBeenCalled();
  const fresh = await readPublishedServiceHistory(
      { ...f.sources },
      f.job,
      f.gate,
    ),
    exact = inspectPublishedServiceReport(fresh, fresh.reports[0].reference);
  live.current = callback;
  live.generation++;
  await expect(
    continuePublishedServiceReview(fresh, exact, callback, live),
  ).resolves.toMatchObject({ job_id: f.job });
  expect(callback).toHaveBeenCalledWith(f.job, 'maintenance');
});
it.each(['throw', 'reject', 'replace', 'revoke'] as const)(
  'invoked %s callback retains canonical UNKNOWN across new wrappers',
  async (mode) => {
    const f = await loaded(),
      r = inspectPublishedServiceReport(f.view, f.view.reports[0].reference);
    const live: PublishedServiceCallback = {
      current: undefined,
      generation: 0,
    };
    const callback = vi.fn(async () => {
      if (mode === 'throw') throw Error('Ambiguous host navigation');
      await Promise.resolve();
      if (mode === 'reject') throw Error('Lost acknowledgment');
      if (mode === 'replace') {
        live.current = vi.fn();
        live.generation++;
      }
      if (mode === 'revoke') revoke(f);
    });
    live.current = callback;
    await expect(
      continuePublishedServiceReview(f.view, r, callback, live),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    await expect(
      readPublishedServiceHistory({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each([
  { enabled: false, confirmed: false },
  { enabled: true, confirmed: false },
])(
  'OFF admission enabled=$enabled confirmed=$confirmed precedes poisoned source getters',
  async (gate) => {
    const getter = vi.fn(() => {
        throw Error('Source getter executed');
      }),
      poison = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources;
    await expect(
      readPublishedServiceHistory(poison, 'job', gate),
    ).rejects.toThrow('OFF');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([
  ['https:', '127.0.0.1'],
  ['http:', 'localhost.invalid'],
  ['http:', '127.0.0.1.invalid'],
])(
  'nonliteral local admission %s %s is denied before sources',
  async (protocol, hostname) => {
    vi.stubGlobal('window', { location: { protocol, hostname } });
    const getter = vi.fn(),
      poison = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources;
    await expect(
      readPublishedServiceHistory(poison, 'job', {
        enabled: true,
        confirmed: true,
      }),
    ).rejects.toThrow('OFF');
    expect(getter).not.toHaveBeenCalled();
  },
);
it('default-OFF React consumer renders no poisoned source data or action', () => {
  const getter = vi.fn(() => {
      throw Error('source');
    }),
    poison = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources;
  const html = renderToStaticMarkup(
    createElement(PublishedServiceNavigator, { sources: poison }),
  );
  expect(html).toContain('Published service navigation is OFF');
  expect(html).not.toContain('Read exact published history');
  expect(getter).not.toHaveBeenCalled();
});

it('existing literal IPv6 HTTP admission remains supported', async () => {
  const f = await fixture();
  vi.stubGlobal('window', {
    location: { hostname: '[::1]', protocol: 'http:' },
  });
  expect(
    (await readPublishedServiceHistory(f.sources, f.job, f.gate)).reports,
  ).toHaveLength(1);
});
it('callback removal and restoration across its await cannot hide generation withdrawal', async () => {
  const f = await loaded(),
    report = inspectPublishedServiceReport(f.view, f.view.reports[0].reference);
  const live: PublishedServiceCallback = { current: undefined, generation: 0 };
  const callback = vi.fn(async () => {
    live.current = undefined;
    live.generation++;
    await Promise.resolve();
    live.current = callback;
    live.generation++;
  });
  live.current = callback;
  await expect(
    continuePublishedServiceReview(f.view, report, callback, live),
  ).rejects.toThrow();
  await expect(
    readPublishedServiceHistory({ ...f.sources }, f.job, f.gate),
  ).rejects.toThrow('UNKNOWN');
});
it('malicious enabled source, admission and filter getters are never executed', async () => {
  const getter = vi.fn(() => {
    throw Error('Executable field');
  });
  const poison = Object.defineProperty({}, 'company', {
    get: getter,
  }) as OperatingSources;
  await expect(
    readPublishedServiceHistory(poison, 'job', {
      enabled: true,
      confirmed: true,
    }),
  ).rejects.toThrow();
  const gate = Object.defineProperty({ enabled: true }, 'confirmed', {
    get: getter,
  });
  await expect(
    readPublishedServiceHistory(
      poison,
      'job',
      gate as { enabled: boolean; confirmed: boolean },
    ),
  ).rejects.toThrow();
  const f = await loaded();
  const input = Object.defineProperty({ phase: '', severity: '' }, 'query', {
    get: getter,
  });
  expect(() =>
    filterPublishedServiceHistory(
      f.view,
      input as { query: string; phase: string; severity: string },
    ),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('toJSON and job coercion hooks cannot create a source selection', async () => {
  const f = await fixture(),
    execute = vi.fn(() => f.job);
  const badJob = { toString: execute, toJSON: execute };
  await expect(
    readPublishedServiceHistory(f.sources, badJob as unknown as string, f.gate),
  ).rejects.toThrow();
  await expect(
    readPublishedServiceHistory(
      { ...f.sources, toJSON: execute } as OperatingSources,
      f.job,
      f.gate,
    ),
  ).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});

it('completion requirements resolve the explicitly selected newly published version without replacing the old report', async () => {
  const f = await loaded(),
    original = f.view.reports[0],
    before = JSON.stringify(original),
    added = publish(f),
    next = await refreshPublishedServiceHistory(f.view);
  const current = next.reports.find((r) => r.reference.report_id === added.id)!;
  const review = await readPublishedServiceRequirements(
    next,
    current.reference,
  );
  expect(review.report.reference.report_id).toBe(added.id);
  expect(review.report.reference.published_version).toBe(2);
  expect(review.job.reference.job_id).toBe(f.job);
  expect(
    JSON.stringify(
      inspectPublishedServiceReport(
        next,
        next.reports.find(
          (r) => r.reference.report_id === original.reference.report_id,
        )!.reference,
      ),
    ),
  ).toBe(before);
});
it.each(['issued-version', 'root-handle', 'model'] as const)(
  'observed %s identity substitution remains terminal after exact restoration',
  async (kind) => {
    const f = await loaded(),
      version = f.entry.target.version_id,
      entries = f.sources.entries,
      model = f.entry.customerModel;
    if (kind === 'issued-version')
      f.entry.target.version_id = f.all.entries[1].target.version_id;
    if (kind === 'root-handle') f.sources.entries = [...entries];
    if (kind === 'model')
      f.entry.customerModel = f.all.entries[3].customerModel;
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
    f.entry.target.version_id = version;
    f.sources.entries = entries;
    f.entry.customerModel = model;
    expect(() => assertPublishedServiceHistory(f.view)).toThrow();
    await expect(
      readPublishedServiceHistory({ ...f.sources }, f.job, f.gate),
    ).rejects.toThrow('UNKNOWN');
  },
);
