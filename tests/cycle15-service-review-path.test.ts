import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Phase3Repository } from '../src/lib/phase3';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { ServiceReviewPath } from '../src/components/workflows/ServiceReviewPath';
import {
  readServiceReviewRequests,
  selectServiceReviewContext,
  assertServiceReviewRequestsCurrent,
  openServiceReviewPath,
  assertServiceReviewPathCurrent,
  openServiceReviewReport,
  openServiceReviewFinding,
  returnServiceReviewRequest,
  selectServiceReviewJob,
  inspectServiceReviewPath,
} from '../src/lib/workflows/service-review-path';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    view = await readServiceReviewRequests(sources, gate),
    selected = selectServiceReviewContext(
      view,
      sources.entries[0].target.job_id!,
    )!,
    input = { ...selected, staff_context_confirmed: true };
  return { sources, gate, view, input };
}
async function opened(index = 0) {
  const f = await fixture(index),
    path = await openServiceReviewPath(f.view, f.input);
  return { ...f, path };
}
function digestChange(mode: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (!fired && body.mode === mode) {
      fired = true;
      await change();
    }
    return value;
  });
  return () => expect(fired).toBe(true);
}
it.each(
  [0, 1, 2].flatMap((brand) =>
    [0, 1, 2, 3].map((entryIndex) => [brand, entryIndex] as const),
  ),
)(
  'brand %i job context %i follows actual request/explicit context/original report/finding/Passport and returns exact selection without effects',
  async (index, entryIndex) => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(sampleCompanies[index], gate),
      before = sources.property.read(sources.company.id),
      releases = sources.entries.map((e) => e.release.read('staff')),
      writers = [
        vi.spyOn(sources.estimates, 'create'),
        vi.spyOn(sources.estimates, 'save'),
        vi.spyOn(sources.estimates, 'issue'),
        vi.spyOn(sources.estimates, 'approveJob'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      ids = vi.spyOn(crypto, 'randomUUID'),
      view = await readServiceReviewRequests(sources, gate);
    expect(view).toMatchObject({
      available_requests: 3,
      available_job_contexts: 4,
      request_job_relationship:
        'UNKNOWN_NO_RECORDED_FK_IN_CURRENT_SOURCE_CONTRACT',
    });
    const jobId = sources.entries[entryIndex].target.job_id!,
      groups = view.requests.filter((r) =>
        r.jobs.some((j) => j.job_id === jobId),
      );
    expect(groups).toHaveLength(1);
    const group = groups[0],
      jobs = group.jobs.filter((j) => j.job_id === jobId);
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    const input = {
        request_id: group.request.id,
        job_id: job.job_id,
        staff_context_confirmed: true,
      },
      path = await openServiceReviewPath(view, input);
    expect(path.request.id).toBe(group.request.id);
    expect(path.context).toMatchObject({
      relationship: 'EXPLICIT_STAFF_SELECTED_CONTEXT',
      recorded_request_job_link: 'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    });
    expect(path.recorded_job_scope).toMatchObject({
      job_id: job.job_id,
      issued_version_id: job.issued_version_id,
      meaning: 'EXACT_RECORDED_ISSUED_JOB_BASELINE',
    });
    expect(path.customer_safe.timeline.snapshot.format).toBe(
      'synthetic-property-passport-timeline-v1',
    );
    for (const doc of path.customer_safe.documentation) {
      const report = await openServiceReviewReport(path, doc.report.reference);
      expect(report).toEqual(doc.report);
      const finding = await openServiceReviewFinding(
        path,
        report.observations[0].reference,
      );
      expect(finding.finding).toEqual(report.observations[0]);
    }
    expect(returnServiceReviewRequest(path)).toEqual({
      view,
      selection: { request_id: group.request.id, job_id: job.job_id },
    });
    expect(returnServiceReviewRequest(path).view).toBe(view);
    expect(selectServiceReviewJob(path)).toBe(job.job_id);
    expect(path.customer_safe).toMatchObject({
      physical_completion: 'UNKNOWN',
      customer_acceptance: 'UNKNOWN',
      warranty: 'UNKNOWN',
      history_completeness: 'UNKNOWN',
    });
    expect(Object.isFrozen(path.customer_safe.documentation)).toBe(true);
    expect(sources.property.read(sources.company.id)).toEqual(before);
    expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
      releases,
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it('two staff-selected contexts on one request/property never become an inferred request/job FK', async () => {
  const { view } = await fixture(),
    group = view.requests.find((r) => r.jobs.length === 2)!;
  expect(group).toBeDefined();
  const [a, b] = await Promise.all(
    group.jobs.map((j) =>
      openServiceReviewPath(view, {
        request_id: group.request.id,
        job_id: j.job_id,
        staff_context_confirmed: true,
      }),
    ),
  );
  expect(a.customer_safe.property.location_id).toBe(
    b.customer_safe.property.location_id,
  );
  expect(a.customer_safe.scope.issued_version_id).not.toBe(
    b.customer_safe.scope.issued_version_id,
  );
  expect(a.context.recorded_request_job_link).toMatch(/UNKNOWN/);
  expect(
    a.customer_safe.documentation.map((d) => d.selected_job_association).sort(),
  ).toEqual(['EXACT_RECORDED_JOB_LINK', 'UNKNOWN']);
}, 60_000);
it.each([
  'foreign-request',
  'unrelated-job',
  'missing-confirmation',
  'getter',
  'extra',
] as const)('rejects %s before opening a selected context', async (kind) => {
  const { view, input } = await fixture(),
    called = vi.fn(() => true),
    bad = { ...input };
  if (kind === 'foreign-request') bad.request_id = 'foreign';
  if (kind === 'unrelated-job')
    bad.job_id = view.requests.find(
      (r) => r.request.id !== input.request_id,
    )!.jobs[0].job_id;
  if (kind === 'missing-confirmation') bad.staff_context_confirmed = false;
  if (kind === 'getter')
    Object.defineProperty(bad, 'staff_context_confirmed', {
      enumerable: true,
      get: called,
    });
  if (kind === 'extra') Object.assign(bad, { toJSON: called });
  await expect(openServiceReviewPath(view, bad)).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
it.each(['foreign', 'empty', 'coercion', 'copy-view'] as const)(
  'selected job hint %s cannot broaden source access or fall back',
  async (kind) => {
    const { view } = await fixture(),
      called = vi.fn(() => '');
    if (kind === 'foreign')
      expect(() => selectServiceReviewContext(view, 'foreign')).toThrow();
    if (kind === 'empty')
      expect(() => selectServiceReviewContext(view, '')).toThrow();
    if (kind === 'coercion')
      expect(() =>
        selectServiceReviewContext(view, {
          toString: called,
        } as unknown as string),
      ).toThrow();
    if (kind === 'copy-view')
      expect(() =>
        selectServiceReviewContext(
          JSON.parse(JSON.stringify(view)),
          view.requests[0].jobs[0].job_id,
        ),
      ).toThrow(/retained/);
    expect(called).not.toHaveBeenCalled();
  },
);
it.each(['company', 'member', 'model', 'repository', 'root', 'gate'] as const)(
  'withdrawn %s hides request/path/navigation and retained return',
  async (kind) => {
    const f = await opened(),
      e = f.sources.entries[0];
    if (kind === 'company')
      await f.sources.operations.configure(
        f.sources.company.id,
        'suspended',
        'starter',
        {},
        e.target.actor_id,
      );
    if (kind === 'member') {
      await f.sources.operations.configure(
        f.sources.company.id,
        'active',
        'starter',
        {},
        f.sources.company.id + '-backup-owner',
      );
      await f.sources.operations.revokeOwner(
        f.sources.company.id,
        e.target.actor_id,
      );
    }
    if (kind === 'model') {
      const model = new CustomerPortalPreviewModel(
        f.sources.company,
        f.sources.property,
      );
      model.admitLocalJourney(e.target, f.gate);
      e.customerModel = model;
    }
    if (kind === 'repository')
      f.sources.estimates = new Phase3Repository(f.sources.operations);
    if (kind === 'root') f.sources.entries = [...f.sources.entries];
    if (kind === 'gate') f.gate.confirmed = false;
    expect(() => assertServiceReviewRequestsCurrent(f.view)).toThrow();
    expect(() => assertServiceReviewPathCurrent(f.path)).toThrow();
    expect(() => returnServiceReviewRequest(f.path)).toThrow();
    expect(() => selectServiceReviewJob(f.path)).toThrow();
    expect(inspectServiceReviewPath(f.path).status).toBe('UNKNOWN');
  },
);
it.each([
  'request',
  'job',
  'confirmation',
  'gate',
  'source',
  'company',
] as const)(
  'final path hash rechecks %s and restoration cannot revive UNKNOWN',
  async (kind) => {
    const f = await fixture(),
      reached = digestChange('LOCAL_EXACT_SERVICE_REVIEW_PATH', async () => {
        if (kind === 'request') f.input.request_id = 'foreign';
        if (kind === 'job') f.input.job_id = 'foreign';
        if (kind === 'confirmation') f.input.staff_context_confirmed = false;
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'source')
          await f.sources.estimates.revise(
            f.sources.company.id,
            f.sources.entries[0].issued,
          );
        if (kind === 'company')
          await f.sources.operations.configure(
            f.sources.company.id,
            'suspended',
            'starter',
            {},
            f.sources.entries[0].target.actor_id,
          );
      });
    await expect(openServiceReviewPath(f.view, f.input)).rejects.toThrow();
    reached();
  },
);
it('withdrawing and restoring staff context never reopens retained path authority', async () => {
  const f = await opened();
  f.input.staff_context_confirmed = false;
  expect(inspectServiceReviewPath(f.path).status).toBe('UNKNOWN');
  f.input.staff_context_confirmed = true;
  expect(() => returnServiceReviewRequest(f.path)).toThrow(/UNKNOWN/);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'published_version',
  'kind',
] as const)(
  'wrong report %s cannot select another original version',
  async (key) => {
    const { path } = await opened(),
      ref = { ...path.customer_safe.documentation[0].report.reference };
    Object.assign(ref, { [key]: key === 'published_version' ? 99 : 'foreign' });
    await expect(openServiceReviewReport(path, ref)).rejects.toThrow();
  },
);
it.each(['finding_id', 'source_index', 'published_version'] as const)(
  'wrong finding %s cannot use fuzzy correspondence',
  async (key) => {
    const { path } = await opened(),
      ref = {
        ...path.customer_safe.documentation[0].report.observations[0].reference,
      };
    Object.assign(ref, { [key]: key === 'finding_id' ? 'foreign' : 99 });
    await expect(openServiceReviewFinding(path, ref)).rejects.toThrow();
  },
);
it.each([
  'missing-report',
  'wrong-version',
  'duplicate-plan',
  'wrong-property',
] as const)(
  'missing or ambiguous %s never supplies replacement documentation',
  async (kind) => {
    const f = await fixture();
    if (kind === 'missing-report') f.sources.entries[0].report_id = 'missing';
    if (kind === 'wrong-version') f.sources.entries[0].published_version = 99;
    if (kind === 'wrong-property')
      f.sources.entries[0].target.location_id =
        f.sources.entries[1].target.location_id;
    if (kind === 'duplicate-plan') {
      const read = f.sources.property.read.bind(f.sources.property);
      vi.spyOn(f.sources.property, 'read').mockImplementation((org) => {
        const state = read(org);
        return {
          ...state,
          plans: [
            ...state.plans,
            structuredClone(
              state.plans.find((p) => p.id === f.sources.entries[0].plan_id)!,
            ),
          ],
        };
      });
    }
    await expect(
      readServiceReviewRequests(f.sources, f.gate),
    ).rejects.toThrow();
  },
);
it('unpublished later visit cannot replace an immutable original report/version or imply completion', async () => {
  const f = await opened(),
    old = JSON.stringify(f.path),
    doc = f.path.customer_safe.documentation[0],
    e = f.sources.entries[0],
    visit = f.sources.property.addVisit(
      f.sources.company.id,
      e.plan_id,
      '2027-01-11',
      'after',
    );
  f.sources.property.saveVisit(f.sources.company.id, visit, {
    summary: 'Unpublished changed observation',
    internal_notes: 'PRIVATE',
    checklist: [],
    findings: [],
  });
  expect(inspectServiceReviewPath(f.path).status).toBe('UNKNOWN');
  expect(JSON.stringify(f.path)).toBe(old);
  const next = await readServiceReviewRequests(f.sources, f.gate),
    path = await openServiceReviewPath(next, f.input),
    report = await openServiceReviewReport(path, doc.report.reference);
  expect(report).toEqual(doc.report);
  expect(path.customer_safe.physical_completion).toBe('UNKNOWN');
  expect(
    path.customer_safe.documentation.some(
      (d) => d.report.summary === 'Unpublished changed observation',
    ),
  ).toBe(false);
});
it('lost report ACK is terminal and cannot reset through retained return', async () => {
  const { path } = await opened();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('lost read ACK'),
  );
  await expect(
    openServiceReviewReport(
      path,
      path.customer_safe.documentation[0].report.reference,
    ),
  ).rejects.toThrow();
  expect(inspectServiceReviewPath(path)).toEqual({
    status: 'UNKNOWN',
    replay: false,
    replacement: null,
  });
  expect(() => returnServiceReviewRequest(path)).toThrow();
});
it('customer-safe body excludes staff, costs, rates, supplier, workforce and unrelated customers', async () => {
  const { sources, path } = await opened(),
    text = JSON.stringify(path.customer_safe);
  for (const term of [
    'PRIVATE',
    'unit_cost_minor',
    'hourly_rate_minor',
    'supplier_cost',
    'internal_notes',
    'actor_id',
    'worker_id',
    'payroll',
    sources.entries[0].receipt_id,
    sources.entries[0].offer_id,
    sources.entries[1].target.customer_id,
    sources.entries[1].report_id,
  ])
    expect(text).not.toContain(term);
});
it('source and report getters/serializers are denied without invoking them', async () => {
  const f = await opened(),
    called = vi.fn(() => '');
  await expect(
    readServiceReviewRequests(
      Object.defineProperty({ ...f.sources }, 'company', {
        enumerable: true,
        get: called,
      }),
      f.gate,
    ),
  ).rejects.toThrow();
  await expect(
    openServiceReviewReport(
      f.path,
      Object.defineProperty(
        { ...f.path.customer_safe.documentation[0].report.reference },
        'published_version',
        { enumerable: true, get: called },
      ),
    ),
  ).rejects.toThrow();
  Object.assign(f.sources.entries[0].issued, { toJSON: called });
  await expect(readServiceReviewRequests(f.sources, f.gate)).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
it('default OFF precedes source getters and source serialization', async () => {
  const called = vi.fn(() => {
      throw Error('must not run');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: called,
    }) as OperatingSources;
  await expect(readServiceReviewRequests(sources)).rejects.toThrow(/OFF/);
  expect(
    renderToStaticMarkup(createElement(ServiceReviewPath, { sources })),
  ).toContain('Service review path is off');
  expect(called).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote', 'disabled'] as const)(
  'UI %s denies before source access',
  (kind) => {
    vi.stubGlobal('window', {
      location: {
        hostname: kind === 'remote' ? 'example.invalid' : '127.0.0.1',
        protocol: kind === 'https' ? 'https:' : 'http:',
      },
    });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const called = vi.fn(() => {
        throw Error('must not run');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: called,
      }) as OperatingSources;
    expect(
      renderToStaticMarkup(
        createElement(ServiceReviewPath, {
          sources,
          enabled: kind !== 'disabled',
        }),
      ),
    ).toContain('Service review path is off');
    expect(called).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i admitted UI loads readonly requests without automatic path/confirmation/report',
  async (index) => {
    const { sources } = await fixture(index);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(ServiceReviewPath, {
        sources,
        enabled: true,
        selectedJobId: sources.entries[0].target.job_id!,
      }),
    );
    expect(html).toContain('aria-label="Service review path"');
    expect(html).toContain('Loading exact service evidence');
    expect(html).not.toContain('Original published report');
    expect(html).not.toContain(sources.entries[0].receipt_id);
  },
);
