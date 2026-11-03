import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import { ServiceCompletionGuide } from '../src/components/workflows/ServiceCompletionGuide';
import {
  readServiceCompletionGuide,
  assertServiceCompletionGuideCurrent,
  selectServiceCompletionContext,
  filterServiceCompletionRequests,
  emptyServiceCompletionFilters,
  openServiceCompletionContext,
  assertServiceCompletionContextCurrent,
  openServiceCompletionReport,
  assertServiceCompletionEvidenceCurrent,
  openServiceCompletionFinding,
  returnServiceCompletionSelection,
  selectServiceCompletionJob,
  inspectServiceCompletionContext,
} from '../src/lib/workflows/service-completion-guide';
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
async function fixture(brand = 0, entryIndex = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[entryIndex],
    view = await readServiceCompletionGuide(sources, gate),
    selected = selectServiceCompletionContext(view, entry.target.job_id!)!,
    input = { ...selected, staff_context_confirmed: true };
  return { gate, sources, entry, view, input };
}
async function opened(brand = 0, entryIndex = 0) {
  const f = await fixture(brand, entryIndex),
    path = await openServiceCompletionContext(f.view, f.input),
    reference = path.customer_safe.documentation.find(
      (d) => d.report.reference.report_id === f.entry.report_id,
    )!.report.reference;
  return { ...f, path, reference };
}
function duringCompletion(change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (
      !reached &&
      body.mode === 'LOCAL_CUSTOMER_COMPLETION_DOCUMENTATION_REVIEW'
    ) {
      reached = true;
      await change();
    }
    return result;
  });
  return () => expect(reached).toBe(true);
}
it.each([0, 1, 2])(
  'brand %i follows one actual request to its exact report, finding, Passport and original completion requirements without effects',
  async (brand) => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.sources.company.id),
      releases = f.sources.entries.map((e) => e.release.read('staff')),
      writers = [
        vi.spyOn(f.sources.estimates, 'create'),
        vi.spyOn(f.sources.estimates, 'save'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      ids = vi.spyOn(crypto, 'randomUUID'),
      path = await openServiceCompletionContext(f.view, f.input),
      doc = path.customer_safe.documentation.find(
        (d) => d.report.reference.report_id === f.entry.report_id,
      )!,
      evidence = await openServiceCompletionReport(path, doc.report.reference),
      finding = await openServiceCompletionFinding(
        path,
        evidence.report.observations[0].reference,
      );
    expect(path.request.id).toBe(f.entry.intake_request_id);
    expect(path.context.recorded_request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(
      path.customer_safe.required_proof.map((p) => [
        p.kind,
        p.status,
        p.evidence,
      ]),
    ).toEqual([
      ['SCOPE_VERIFICATION', 'UNKNOWN', 'NOT_AVAILABLE_IN_EXISTING_SOURCES'],
      ['PHYSICAL_COMPLETION', 'UNKNOWN', 'NOT_AVAILABLE_IN_EXISTING_SOURCES'],
      ['CUSTOMER_ACCEPTANCE', 'UNKNOWN', 'NOT_AVAILABLE_IN_EXISTING_SOURCES'],
      ['WARRANTY', 'UNKNOWN', 'NOT_AVAILABLE_IN_EXISTING_SOURCES'],
    ]);
    expect(path.customer_safe.timeline.snapshot.format).toBe(
      'synthetic-property-passport-timeline-v1',
    );
    expect(evidence.report).toEqual(doc.report);
    expect(evidence.completion!.report).toEqual(doc.report);
    expect(evidence.completion!.job.reference).toMatchObject({
      job_id: f.entry.target.job_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(
      evidence.completion!.job.lines.every(
        (l) => l.documentation_match === 'NOT_ESTABLISHED',
      ),
    ).toBe(true);
    expect(evidence.completion!.interpretation).toMatchObject({
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      warranty: 'UNVERIFIED',
      delivery: 'NOT_SENT',
    });
    expect(finding.finding).toEqual(evidence.report.observations[0]);
    expect(returnServiceCompletionSelection(path)).toEqual({
      view: f.view,
      selection: { request_id: path.request.id, job_id: path.context.job_id },
    });
    expect(returnServiceCompletionSelection(path).view).toBe(f.view);
    expect(selectServiceCompletionJob(path)).toBe(f.entry.target.job_id);
    expect(Object.isFrozen(evidence.completion!.job.lines)).toBe(true);
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    expect(f.sources.entries.map((e) => e.release.read('staff'))).toEqual(
      releases,
    );
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it('same-property jobs stay distinct and another property report association stays UNKNOWN', async () => {
  const f = await opened(0, 3),
    sibling = f.view.requests.find((r) => r.jobs.length === 2)!;
  expect(sibling.jobs).toHaveLength(2);
  expect(new Set(sibling.jobs.map((j) => j.job_id)).size).toBe(2);
  expect(new Set(sibling.jobs.map((j) => j.issued_version_id)).size).toBe(2);
  const other = f.path.customer_safe.documentation.find(
    (d) => d.report.reference.report_id !== f.entry.report_id,
  )!;
  expect(other.selected_job_association).toBe('UNKNOWN');
  const evidence = await openServiceCompletionReport(
    f.path,
    other.report.reference,
  );
  expect(evidence.selected_job_association).toBe('UNKNOWN');
  expect(evidence.completion).toBeNull();
  expect(evidence.completion_status).toBe(
    'UNKNOWN_REPORT_JOB_LINK_NOT_RECORDED',
  );
  expect(f.path.customer_safe.physical_completion).toBe('UNKNOWN');
});
it.each([0, 1, 2])(
  'brand %i literal filters intersect actual customer/property/state/job and retain exact view for return',
  async (brand) => {
    const f = await fixture(brand),
      row = filterServiceCompletionRequests(f.view, {
        ...emptyServiceCompletionFilters,
        query: f.entry.target.job_id!,
      })[0],
      filters = {
        query: row.job.job_id,
        customer_id: row.customer_id,
        location_id: row.location_id,
        request_state: row.request.status,
      };
    expect(
      filterServiceCompletionRequests(f.view, filters).map((r) => r.job.job_id),
    ).toEqual([f.entry.target.job_id]);
    expect(
      filterServiceCompletionRequests(f.view, { ...filters, query: '.*' }),
    ).toEqual([]);
    const foreignProperty = f.view.requests.find(
      (r) => r.location_id !== row.location_id,
    )!.location_id;
    expect(
      filterServiceCompletionRequests(f.view, {
        ...filters,
        location_id: foreignProperty,
      }),
    ).toEqual([]);
    expect(f.view.available_requests).toBe(3);
    expect(f.view.available_job_contexts).toBe(4);
    expect(f.view.coverage).toBe(
      'ADMITTED_EXISTING_SOURCE_HANDLES_NOT_COMPLETE_HISTORY',
    );
  },
);
it.each([
  'query',
  'customer_id',
  'location_id',
  'request_state',
  'extra',
  'getter',
  'toJSON',
] as const)(
  'invalid %s filter rejects without coercion/getter/serialization',
  async (kind) => {
    const f = await fixture(),
      called = vi.fn(() => ''),
      bad = { ...emptyServiceCompletionFilters };
    if (kind === 'query') bad.query = 'x'.repeat(101);
    if (['customer_id', 'location_id', 'request_state'].includes(kind))
      Object.assign(bad, { [kind]: 'foreign' });
    if (kind === 'extra') Object.assign(bad, { extra: true });
    if (kind === 'getter')
      Object.defineProperty(bad, 'query', { enumerable: true, get: called });
    if (kind === 'toJSON') Object.assign(bad, { toJSON: called });
    expect(() => filterServiceCompletionRequests(f.view, bad)).toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it.each(['foreign', 'ambiguous', 'getter', 'copy'] as const)(
  'selected job %s is presentation only and cannot broaden or fall back',
  async (kind) => {
    const f = await fixture(),
      called = vi.fn(() => 'foreign');
    if (kind === 'foreign')
      expect(() => selectServiceCompletionContext(f.view, 'foreign')).toThrow();
    if (kind === 'getter')
      expect(() =>
        selectServiceCompletionContext(f.view, {
          toString: called,
        } as unknown as string),
      ).toThrow();
    if (kind === 'copy')
      expect(() =>
        selectServiceCompletionContext(
          JSON.parse(JSON.stringify(f.view)),
          f.entry.target.job_id!,
        ),
      ).toThrow(/retained/);
    if (kind === 'ambiguous') {
      f.sources.entries[1].target.job_id = f.entry.target.job_id;
      await expect(
        readServiceCompletionGuide(f.sources, f.gate),
      ).rejects.toThrow();
    }
    expect(called).not.toHaveBeenCalled();
  },
);
it.each(['confirmation', 'request', 'unrelated-job'] as const)(
  'exact context rejects missing or unrelated %s',
  async (kind) => {
    const f = await fixture(),
      input = { ...f.input };
    if (kind === 'confirmation') input.staff_context_confirmed = false;
    if (kind === 'request') input.request_id = 'foreign';
    if (kind === 'unrelated-job')
      input.job_id = f.view.requests.find(
        (r) => r.request.id !== input.request_id,
      )!.jobs[0].job_id;
    await expect(openServiceCompletionContext(f.view, input)).rejects.toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i revoked current member cannot show or navigate retained completion evidence',
  async (brand) => {
    const f = await opened(brand);
    await f.sources.operations.configure(
      f.sources.company.id,
      'active',
      'starter',
      {},
      f.sources.company.id + '-backup-owner',
    );
    await f.sources.operations.revokeOwner(
      f.sources.company.id,
      f.entry.target.actor_id,
    );
    expect(() => assertServiceCompletionContextCurrent(f.path)).toThrow();
    expect(() => selectServiceCompletionJob(f.path)).toThrow();
    expect(() => returnServiceCompletionSelection(f.path)).toThrow();
    expect(inspectServiceCompletionContext(f.path)).toEqual({
      status: 'UNKNOWN',
      replay: false,
      replacement: null,
    });
  },
);
it.each([
  'model',
  'root',
  'gate',
  'published-version',
  'customer-property',
  'company',
] as const)(
  'withdrawn %s withholds exact context and cannot revive it after restoration',
  async (kind) => {
    const f = await opened();
    if (kind === 'model') f.entry.customerModel.logout();
    if (kind === 'root') f.sources.entries = [...f.sources.entries];
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'published-version') f.entry.published_version++;
    if (kind === 'customer-property')
      f.entry.target.location_id = f.sources.entries[1].target.location_id;
    if (kind === 'company')
      await f.sources.operations.configure(
        f.sources.company.id,
        'suspended',
        'starter',
        {},
        f.entry.target.actor_id,
      );
    expect(inspectServiceCompletionContext(f.path).status).toBe('UNKNOWN');
    f.gate.confirmed = true;
    expect(() => selectServiceCompletionJob(f.path)).toThrow();
  },
);
it.each(['confirmation', 'gate', 'reference', 'model', 'source'] as const)(
  'final original completion await rechecks %s before exposing evidence',
  async (kind) => {
    const f = await opened(),
      ref = { ...f.reference },
      reached = duringCompletion(async () => {
        if (kind === 'confirmation') f.input.staff_context_confirmed = false;
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'reference') ref.published_version++;
        if (kind === 'model') f.entry.customerModel.logout();
        if (kind === 'source')
          await f.sources.estimates.revise(
            f.sources.company.id,
            f.entry.issued,
          );
      });
    await expect(openServiceCompletionReport(f.path, ref)).rejects.toThrow();
    reached();
    f.input.staff_context_confirmed = true;
    f.gate.confirmed = true;
    expect(inspectServiceCompletionContext(f.path).status).toBe('UNKNOWN');
  },
);
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'published_version',
] as const)(
  'foreign or missing report %s cannot replace an original source',
  async (key) => {
    const f = await opened(),
      ref = { ...f.reference };
    Object.assign(ref, { [key]: key === 'published_version' ? 99 : 'foreign' });
    await expect(openServiceCompletionReport(f.path, ref)).rejects.toThrow();
    expect(inspectServiceCompletionContext(f.path).status).toBe('UNKNOWN');
  },
);
it('wrong finding source position cannot infer a match', async () => {
  const f = await opened(),
    ref = {
      ...f.path.customer_safe.documentation[0].report.observations[0].reference,
      source_index: 99,
    };
  await expect(openServiceCompletionFinding(f.path, ref)).rejects.toThrow();
});
it('lost report ACK stays UNKNOWN and cannot replay, resume or return through the guide', async () => {
  const f = await opened();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('lost exact read ACK'),
  );
  await expect(
    openServiceCompletionReport(f.path, f.reference),
  ).rejects.toThrow();
  expect(inspectServiceCompletionContext(f.path)).toEqual({
    status: 'UNKNOWN',
    replay: false,
    replacement: null,
  });
  await expect(
    openServiceCompletionReport(f.path, f.reference),
  ).rejects.toThrow(/UNKNOWN/);
  expect(() => returnServiceCompletionSelection(f.path)).toThrow();
});
it.each([0, 1, 2])(
  'brand %i completion/report projection excludes private evidence and unrelated customer identities',
  async (brand) => {
    const f = await opened(brand),
      evidence = await openServiceCompletionReport(f.path, f.reference),
      text = JSON.stringify(evidence);
    for (const term of [
      'PRIVATE',
      'unit_cost_minor',
      'hourly_rate_minor',
      'supplier_cost',
      'internal_notes',
      'actor_id',
      'worker_id',
      'payroll',
      f.entry.receipt_id,
      f.entry.offer_id,
      f.sources.entries[1].target.customer_id,
      f.sources.entries[1].report_id,
    ])
      expect(text).not.toContain(term);
    const copy = JSON.parse(text);
    expect(() => assertServiceCompletionEvidenceCurrent(copy)).toThrow(
      /retained/,
    );
  },
);
it('source, context and report getters reject without invocation', async () => {
  const f = await fixture(),
    called = vi.fn(() => '');
  await expect(
    readServiceCompletionGuide(
      Object.defineProperty({ ...f.sources }, 'company', {
        enumerable: true,
        get: called,
      }),
      f.gate,
    ),
  ).rejects.toThrow();
  await expect(
    openServiceCompletionContext(
      f.view,
      Object.defineProperty({ ...f.input }, 'staff_context_confirmed', {
        enumerable: true,
        get: called,
      }),
    ),
  ).rejects.toThrow();
  const path = await openServiceCompletionContext(f.view, f.input);
  await expect(
    openServiceCompletionReport(
      path,
      Object.defineProperty(
        { ...path.customer_safe.documentation[0].report.reference },
        'published_version',
        { enumerable: true, get: called },
      ),
    ),
  ).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
it.each([
  'default',
  'production',
  'https',
  'foreign-host',
  'unconfirmed',
] as const)(
  '%s OFF admission precedes source getters and serialization in domain and React',
  async (kind) => {
    const called = vi.fn(() => {
        throw Error('must not run');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: called,
      }) as OperatingSources;
    if (kind === 'production') vi.stubEnv('DEV', false);
    if (kind === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    if (kind === 'foreign-host')
      vi.stubGlobal('window', {
        location: { hostname: 'localhost.example.invalid', protocol: 'http:' },
      });
    const gate =
      kind === 'default'
        ? { enabled: false, confirmed: false }
        : { enabled: true, confirmed: kind !== 'unconfirmed' };
    await expect(readServiceCompletionGuide(sources, gate)).rejects.toThrow(
      /OFF/,
    );
    if (kind !== 'unconfirmed')
      expect(
        renderToStaticMarkup(
          createElement(ServiceCompletionGuide, {
            sources,
            enabled: kind !== 'default',
          }),
        ),
      ).toContain('Service completion guide is off');
    expect(called).not.toHaveBeenCalled();
  },
);
it('replacement customer model invalidates the original evidence even with identical IDs', async () => {
  const f = await opened(),
    model = new CustomerPortalPreviewModel(
      f.sources.company,
      f.sources.property,
    );
  model.admitLocalJourney(f.entry.target, f.gate);
  f.entry.customerModel = model;
  expect(() => assertServiceCompletionContextCurrent(f.path)).toThrow();
  expect(() => assertServiceCompletionGuideCurrent(f.view)).toThrow();
});
it('an unpublished later visit cannot become a new completion report or mutate the retained report', async () => {
  const f = await opened(),
    evidence = await openServiceCompletionReport(f.path, f.reference),
    before = JSON.stringify(evidence),
    visit = f.sources.property.addVisit(
      f.sources.company.id,
      f.entry.plan_id,
      '2027-01-11',
      'after',
    );
  f.sources.property.saveVisit(f.sources.company.id, visit, {
    summary: 'Unpublished later change',
    internal_notes: 'PRIVATE',
    checklist: [],
    findings: [],
  });
  expect(() => assertServiceCompletionEvidenceCurrent(evidence)).toThrow();
  expect(JSON.stringify(evidence)).toBe(before);
  expect(evidence.report.reference.report_id).toBe(f.entry.report_id);
  expect(evidence.completion!.interpretation.physical_completion).toBe(
    'UNVERIFIED',
  );
});

it('the sibling job opens only its own recorded completion source with the original issued baseline', async () => {
  const f = await opened(0, 3),
    evidence = await openServiceCompletionReport(f.path, f.reference);
  expect(evidence.selected_job_association).toBe('EXACT_RECORDED_JOB_LINK');
  expect(evidence.completion_status).toBe('EXACT_READ_ONLY_DOCUMENTATION');
  expect(evidence.completion!.job.reference.job_id).toBe(f.entry.target.job_id);
  expect(evidence.completion!.job.reference.issued_version_id).toBe(
    f.entry.target.version_id,
  );
});
it.each(['missing-report', 'duplicate-plan'] as const)(
  'missing or ambiguous %s cannot become admitted guide evidence',
  async (kind) => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(sampleCompanies[0], gate);
    if (kind === 'missing-report') sources.entries[0].report_id = 'missing';
    else {
      const read = sources.property.read.bind(sources.property);
      vi.spyOn(sources.property, 'read').mockImplementation((org) => {
        const state = read(org);
        return {
          ...state,
          plans: [
            ...state.plans,
            structuredClone(
              state.plans.find((p) => p.id === sources.entries[0].plan_id)!,
            ),
          ],
        };
      });
    }
    await expect(readServiceCompletionGuide(sources, gate)).rejects.toThrow();
  },
);
it('a serializer on an issued source is rejected without executing it', async () => {
  const f = await fixture(),
    called = vi.fn(() => '');
  Object.assign(f.entry.issued, { toJSON: called });
  await expect(readServiceCompletionGuide(f.sources, f.gate)).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
it('source gate withdrawal after the final original request hash prevents the guide result', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[0], gate),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_SERVICE_REQUEST_REVIEW_PATH') {
      reached = true;
      gate.confirmed = false;
    }
    return result;
  });
  await expect(readServiceCompletionGuide(sources, gate)).rejects.toThrow();
  expect(reached).toBe(true);
});
it('React explicitly reports loading without preparing, publishing or approving evidence', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[0], gate),
    command = vi.spyOn(sources.entries[0].release, 'command'),
    issue = vi.spyOn(sources.estimates, 'issue');
  const html = renderToStaticMarkup(
    createElement(ServiceCompletionGuide, {
      sources,
      enabled: true,
      selectedJobId: sources.entries[0].target.job_id!,
    }),
  );
  expect(html).toContain('Loading exact service completion evidence');
  expect(html).toContain('Service completion guide');
  expect(html).not.toContain('Prepare completion documentation');
  expect(command).not.toHaveBeenCalled();
  expect(issue).not.toHaveBeenCalled();
});

it('same model instance with changed read evidence cannot retain an earlier completion view', async () => {
  const f = await opened(),
    evidence = await openServiceCompletionReport(f.path, f.reference),
    read = f.entry.customerModel.read.bind(f.entry.customerModel);
  const changed = vi
    .spyOn(f.entry.customerModel, 'read')
    .mockImplementation(() => ({
      ...read(),
      customerName: 'Changed model evidence',
    }));
  expect(() => assertServiceCompletionEvidenceCurrent(evidence)).toThrow();
  changed.mockRestore();
  expect(inspectServiceCompletionContext(f.path).status).toBe('UNKNOWN');
});
