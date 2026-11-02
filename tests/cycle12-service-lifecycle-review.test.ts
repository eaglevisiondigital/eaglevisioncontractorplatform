import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { projectIssuedReview } from '../src/domain/customer/review';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { Phase3Repository } from '../src/lib/phase3';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceLifecycleReview,
  openServiceLifecycleJob,
  openServiceLifecycleReport,
  assertServiceLifecycleCurrentNow,
  assertServiceLifecycleDetailCurrentNow,
  inspectServiceLifecycle,
  selectServiceLifecycleJob,
  type ServiceLifecycleInput,
} from '../src/lib/workflows/service-lifecycle-review';
import { ServiceLifecycleReview } from '../src/components/workflows/ServiceLifecycleReview';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true };
  return {
    sources: await prepareOperatingSources(sampleCompanies[index], gate),
    gate,
    input: { query: '', location_id: '', job_id: '' },
  };
}
async function detailFixture(index = 0) {
  const f = await fixture(index),
    view = await readServiceLifecycleReview(f.sources, f.input, f.gate),
    detail = await openServiceLifecycleJob(view, view.staff_paths[0].job_id);
  return { ...f, view, detail };
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
it.each([0, 1, 2])(
  'brand %i retains real request/receipt -> exact issued job -> recorded visits -> Passport without writers',
  async (index) => {
    const { sources, input, gate } = await fixture(index),
      before = sources.property.read(sources.company.id),
      releases = sources.entries.map((e) => e.release.read('staff')),
      estimates = await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
      writers = [
        vi.spyOn(sources.estimates, 'create'),
        vi.spyOn(sources.estimates, 'revise'),
        vi.spyOn(sources.estimates, 'issue'),
        vi.spyOn(sources.estimates, 'approveJob'),
        vi.spyOn(sources.estimates, 'assignJob'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.operations, 'assignIntake'),
        ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ];
    const ids = vi.spyOn(crypto, 'randomUUID');
    const view = await readServiceLifecycleReview(sources, input, gate);
    expect(() => assertServiceLifecycleCurrentNow(view)).not.toThrow();
    expect(view).toMatchObject({
      available_jobs: 4,
      available_properties: 3,
      available_reports: 4,
      matching_jobs: 4,
      physical_completion: 'UNKNOWN',
      customer_acceptance: 'UNKNOWN',
      warranty: 'UNKNOWN',
      authority: 'READ_ONLY_REQUIREMENTS_NO_OPERATIONAL_PASS',
    });
    for (const p of view.staff_paths) {
      const detail = await openServiceLifecycleJob(view, p.job_id),
        e = sources.entries.find((e) => e.target.job_id === p.job_id)!;
      expect(detail.staff.provenance).toMatchObject({
        request: { id: e.intake_request_id },
        receipt: { id: e.receipt_id },
        offer_id: e.offer_id,
        issued_version_id: e.target.version_id,
        request_scope_association:
          'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK',
        genuine_customer_approval: 'UNVERIFIED',
        contract_execution: 'BLOCKED',
      });
      const visit = before.visits.find((v) => v.id === e.scheduled_visit_id)!;
      expect(detail.staff.workflow_facts.scheduled_visit).toEqual({
        id: visit.id,
        plan_id: visit.plan_id,
        revision: visit.revision,
        date: visit.visited_on,
        phase: visit.phase,
        status: visit.status,
      });
      expect(detail.staff.workflow_facts).toMatchObject({
        estimate_status: 'issued',
        job_workflow_status: 'UNKNOWN_NOT_RECORDED_BY_SOURCE',
        date_precision: 'DATE_ONLY_AVAILABILITY_UNKNOWN',
        dispatch: 'NOT_AUTHORIZED',
      });
      expect(detail.customer_safe.contractor.id).toBe(
        sampleCompanies[index].id,
      );
      expect(detail.customer_safe.scope).toMatchObject({
        job_id: e.target.job_id,
        issued_version_id: e.target.version_id,
      });
      expect(detail.customer_safe.required_proof.map((r) => r.status)).toEqual([
        'UNKNOWN',
        'UNKNOWN',
        'UNKNOWN',
        'UNKNOWN',
      ]);
      expect(selectServiceLifecycleJob(detail)).toBe(p.job_id);
      for (const r of detail.customer_safe.documentation) {
        expect(
          await openServiceLifecycleReport(detail, r.report.reference),
        ).toEqual(r.report);
      }
      expect(Object.isFrozen(detail.customer_safe.required_proof)).toBe(true);
    }
    expect(sources.property.read(sources.company.id)).toEqual(before);
    expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
      releases,
    );
    expect(
      await Promise.all(
        sources.entries.map((e) =>
          sources.estimates.get(sources.company.id, e.target.estimate_id),
        ),
      ),
    ).toEqual(estimates);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it('keeps two jobs on one property distinct and does not assign sibling property documentation to the selected job', async () => {
  const { sources, view, detail } = await detailFixture(),
    siblings = view.staff_paths.filter(
      (p) => p.location_id === detail.customer_safe.property.location_id,
    );
  expect(siblings).toHaveLength(2);
  expect(new Set(siblings.map((p) => p.request.id)).size).toBe(1);
  expect(new Set(siblings.map((p) => p.issued_version_id)).size).toBe(2);
  expect(
    detail.customer_safe.documentation
      .map((d) => d.selected_job_association)
      .sort(),
  ).toEqual(['EXACT_RECORDED_JOB_LINK', 'UNKNOWN']);
  const sibling = await openServiceLifecycleJob(view, siblings[1].job_id);
  expect(sibling.staff.provenance.receipt.id).not.toBe(
    detail.staff.provenance.receipt.id,
  );
  expect(sibling.customer_safe.scope.issued_version_id).not.toBe(
    detail.customer_safe.scope.issued_version_id,
  );
  expect(detail.customer_safe.property.location_id).toBe(
    sources.entries[0].target.location_id,
  );
});
it('literal combined filters retain available counts and report source identities', async () => {
  const { sources, input, gate, view } = await detailFixture(),
    p = view.staff_paths[0];
  for (const query of [
    p.request.id,
    p.receipt.id,
    p.issued_version_id,
    p.linked_reports[0].reference.report_id,
  ]) {
    const filtered = await readServiceLifecycleReview(
      sources,
      { ...input, query, job_id: p.job_id, location_id: p.location_id },
      gate,
    );
    expect(filtered.matching_jobs).toBe(1);
    expect(filtered.available_jobs).toBe(4);
    expect(filtered.staff_paths[0].job_id).toBe(p.job_id);
  }
  for (const query of ['.*', '%', 'no-matching-source']) {
    const empty = await readServiceLifecycleReview(
      sources,
      { ...input, query },
      gate,
    );
    expect(empty.staff_paths).toEqual([]);
    expect(empty.available_reports).toBe(4);
  }
});
it.each(['location_id', 'job_id', 'conflict'] as const)(
  'denies foreign or conflicting %s filters rather than selecting another record',
  async (kind) => {
    const { sources, input, gate } = await fixture(),
      bad = { ...input };
    if (kind === 'location_id' || kind === 'job_id') bad[kind] = 'foreign';
    else {
      bad.location_id = sources.entries[0].target.location_id;
      bad.job_id = sources.entries[1].target.job_id!;
    }
    await expect(
      readServiceLifecycleReview(sources, bad, gate),
    ).rejects.toThrow();
  },
);
it('cannot open a hidden valid job or reconstruct view/detail authority from JSON', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readServiceLifecycleReview(
      sources,
      { ...input, job_id: sources.entries[0].target.job_id! },
      gate,
    ),
    detail = await openServiceLifecycleJob(view, view.staff_paths[0].job_id);
  await expect(
    openServiceLifecycleJob(view, sources.entries[1].target.job_id!),
  ).rejects.toThrow(/visible/);
  await expect(
    openServiceLifecycleJob(
      JSON.parse(JSON.stringify(view)),
      view.staff_paths[0].job_id,
    ),
  ).rejects.toThrow(/retained/);
  expect(() =>
    selectServiceLifecycleJob(JSON.parse(JSON.stringify(detail))),
  ).toThrow(/retained/);
  await expect(
    openServiceLifecycleReport(
      JSON.parse(JSON.stringify(detail)),
      detail.customer_safe.documentation[0].report.reference,
    ),
  ).rejects.toThrow(/retained/);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'job_id',
] as const)('denies foreign original %s', async (key) => {
  const { sources, input, gate } = await fixture();
  sources.entries[0].target[key] = 'foreign';
  await expect(
    readServiceLifecycleReview(sources, input, gate),
  ).rejects.toThrow();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'published_version',
  'kind',
] as const)(
  'denies a wrong exact report %s without latest/fuzzy fallback',
  async (key) => {
    const { detail } = await detailFixture(),
      ref = { ...detail.customer_safe.documentation[0].report.reference };
    Object.assign(ref, { [key]: key === 'published_version' ? 2 : 'foreign' });
    await expect(openServiceLifecycleReport(detail, ref)).rejects.toThrow();
  },
);
it('withdraws all detail/report/navigation after staff revocation', async () => {
  const { sources, view, detail } = await detailFixture();
  await sources.operations.configure(
    sources.company.id,
    'active',
    'starter',
    {},
    sources.company.id + '-backup-owner',
  );
  await sources.operations.revokeOwner(
    sources.company.id,
    sources.entries[0].target.actor_id,
  );
  expect(() => assertServiceLifecycleDetailCurrentNow(detail)).toThrow();
  expect(inspectServiceLifecycle(view)).toEqual({
    status: 'UNKNOWN',
    replay: false,
    replacement: null,
  });
  expect(() => selectServiceLifecycleJob(detail)).toThrow();
  await expect(
    openServiceLifecycleReport(
      detail,
      detail.customer_safe.documentation[0].report.reference,
    ),
  ).rejects.toThrow();
});
it.each(['model', 'repository', 'source-root'] as const)(
  'equal-ID %s replacement invalidates retained evidence',
  async (kind) => {
    const { sources, gate, view, detail } = await detailFixture(),
      e = sources.entries[0];
    if (kind === 'model') {
      const m = new CustomerPortalPreviewModel(
        sources.company,
        sources.property,
      );
      m.admitLocalJourney(e.target, gate);
      e.customerModel = m;
    } else if (kind === 'repository')
      sources.estimates = new Phase3Repository(sources.operations);
    else sources.entries = [...sources.entries];
    expect(() => assertServiceLifecycleDetailCurrentNow(detail)).toThrow();
    expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  },
);
it('same-model customer context changes invalidate retained evidence', async () => {
  const { sources, view, detail } = await detailFixture();
  sources.entries[0].customerModel.logout();
  expect(() => assertServiceLifecycleDetailCurrentNow(detail)).toThrow();
  expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
});
it('stale input is terminal UNKNOWN even after restoration', async () => {
  const { view, input, detail } = await detailFixture();
  input.query = 'changed';
  expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  input.query = '';
  expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  expect(() => selectServiceLifecycleJob(detail)).toThrow(/UNKNOWN/);
});
it('withdrawn source admission remains terminal UNKNOWN after restoration', async () => {
  const { gate, view, detail } = await detailFixture();
  gate.confirmed = false;
  expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  gate.confirmed = true;
  expect(() => assertServiceLifecycleDetailCurrentNow(detail)).toThrow(
    /UNKNOWN/,
  );
});
it.each([
  'query',
  'location_id',
  'job_id',
  'gate',
  'model',
  'repository',
  'source-root',
  'member',
] as const)('rechecks %s after the final lifecycle digest', async (change) => {
  const { sources, input, gate } = await fixture(),
    reached = digestChange('LOCAL_SERVICE_LIFECYCLE_REQUIREMENTS', async () => {
      if (change === 'query' || change === 'location_id' || change === 'job_id')
        input[change] = 'changed';
      if (change === 'gate') gate.confirmed = false;
      if (change === 'model') sources.entries[0].customerModel.logout();
      if (change === 'repository')
        sources.estimates = new Phase3Repository(sources.operations);
      if (change === 'source-root') sources.entries = [...sources.entries];
      if (change === 'member') {
        await sources.operations.configure(
          sources.company.id,
          'active',
          'starter',
          {},
          sources.company.id + '-backup-owner',
        );
        await sources.operations.revokeOwner(
          sources.company.id,
          sources.entries[0].target.actor_id,
        );
      }
    });
  await expect(
    readServiceLifecycleReview(sources, input, gate),
  ).rejects.toThrow();
  reached();
});
it.each(['input', 'gate', 'model'] as const)(
  'rechecks %s after final detail digest and retains UNKNOWN',
  async (change) => {
    const { sources, view, input, gate } = await detailFixture(),
      reached = digestChange('LOCAL_SERVICE_LIFECYCLE_JOB_REQUIREMENTS', () => {
        if (change === 'input') input.query = 'changed';
        if (change === 'gate') gate.confirmed = false;
        if (change === 'model') sources.entries[0].customerModel.logout();
      });
    await expect(
      openServiceLifecycleJob(view, view.staff_paths[0].job_id),
    ).rejects.toThrow();
    reached();
    input.query = '';
    gate.confirmed = true;
    expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  },
);
it('report reference mutation during the final await cannot replay after restoration', async () => {
  const { view, detail } = await detailFixture(),
    ref = { ...detail.customer_safe.documentation[0].report.reference },
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    reached = true;
    ref.published_version = 2;
    return value;
  });
  await expect(openServiceLifecycleReport(detail, ref)).rejects.toThrow();
  expect(reached).toBe(true);
  ref.published_version = 1;
  expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  await expect(openServiceLifecycleReport(detail, ref)).rejects.toThrow();
});
it('keeps strict safe fields separate from staff receipt, private notes, supplier, payroll and costs', async () => {
  const { sources, input, gate } = await fixture(),
    e = sources.entries[0],
    state = sources.property.read(sources.company.id),
    scheduled = state.visits.find((v) => v.id === e.scheduled_visit_id)!;
  sources.property.saveVisit(sources.company.id, scheduled, {
    ...scheduled.content,
    internal_notes: 'PRIVATE-STAFF-NOTE-DO-NOT-EXPORT',
  });
  const view = await readServiceLifecycleReview(sources, input, gate),
    detail = await openServiceLifecycleJob(view, e.target.job_id!),
    safe = detail.customer_safe,
    text = JSON.stringify(safe);
  const keys = (v: unknown): string[] =>
    !v || typeof v !== 'object'
      ? []
      : Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]);
  for (const key of [
    'internal_notes',
    'unit_cost_minor',
    'amount_minor',
    'supplier',
    'payroll',
    'worker_id',
    'actor_id',
    'receipt_id',
    'offer_id',
    'recorded_by',
    'margin_bps',
  ])
    expect(keys(safe)).not.toContain(key);
  for (const privateValue of [
    'PRIVATE-STAFF-NOTE-DO-NOT-EXPORT',
    'Synthetic planning supplier',
    'LOCAL-COMMITMENT-ONLY',
    e.receipt_id,
    e.offer_id,
    e.target.actor_id,
  ])
    expect(text).not.toContain(privateValue);
  expect(Object.keys(safe)).toEqual([
    'contractor',
    'property',
    'scope',
    'passport',
    'documentation',
    'required_proof',
    'physical_completion',
    'customer_acceptance',
    'warranty',
    'history_completeness',
    'media',
    'interpretation',
    'authority',
  ]);
});
it('later empty after-phase documentation never verifies physical completion or rewrites historical review', async () => {
  const { sources, input, gate, view, detail } = await detailFixture(),
    old = JSON.stringify(detail),
    e = sources.entries[0];
  let visit = sources.property.addVisit(
    sources.company.id,
    e.plan_id,
    '2026-12-21',
    'after',
  );
  sources.property.saveVisit(sources.company.id, visit, {
    summary: 'No new observations recorded.',
    internal_notes: 'PRIVATE',
    checklist: [],
    findings: [],
  });
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.submit(sources.company.id, visit);
  visit = sources.property
    .read(sources.company.id)
    .visits.find((v) => v.id === visit.id)!;
  sources.property.publish(sources.company.id, visit);
  expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  expect(JSON.stringify(detail)).toBe(old);
  const fresh = await readServiceLifecycleReview(sources, input, gate),
    newer = await openServiceLifecycleJob(fresh, e.target.job_id!);
  expect(fresh.available_reports).toBe(5);
  expect(
    newer.customer_safe.documentation.some((d) => d.report.phase === 'after'),
  ).toBe(true);
  expect(newer.customer_safe.physical_completion).toBe('UNKNOWN');
  expect(newer.customer_safe.customer_acceptance).toBe('UNKNOWN');
  expect(newer.customer_safe.warranty).toBe('UNKNOWN');
  expect(
    newer.customer_safe.scope.lines.every(
      (l) => l.verified_completion_match === 'UNKNOWN',
    ),
  ).toBe(true);
});
it('ambiguous duplicate plan identity is denied rather than manufactured into a lifecycle link', async () => {
  const { sources, input, gate } = await fixture(),
    read = sources.property.read.bind(sources.property);
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
  await expect(
    readServiceLifecycleReview(sources, input, gate),
  ).rejects.toThrow();
});
it('missing original receipt is denied without a fabricated lifecycle link', async () => {
  const { sources, input, gate } = await fixture();
  sources.entries[0].receipt_id = sources.entries[1].receipt_id;
  await expect(
    readServiceLifecycleReview(sources, input, gate),
  ).rejects.toThrow();
});
it('issued-only customer projection continues rejecting drafts', async () => {
  const { sources, view, detail } = await detailFixture(),
    e = sources.entries[0];
  const draft = await sources.estimates.revise(sources.company.id, e.issued);
  expect(() =>
    projectIssuedReview(draft.version, {
      organization_id: e.target.organization_id,
      customer_id: e.target.customer_id,
      location_id: e.target.location_id,
      company_name: sources.company.name,
      primary_color: sources.company.primary_color,
      property_label: detail.customer_safe.property.label,
      reports: true,
      version_ids: [draft.version.id],
    }),
  ).toThrow(/unavailable/);
  expect(inspectServiceLifecycle(view).status).toBe('UNKNOWN');
  expect(() => selectServiceLifecycleJob(detail)).toThrow();
});
it('simultaneous reads remain immutable requirements and create no duplicate records', async () => {
  const { sources, input, gate } = await fixture(),
    before = sources.property.read(sources.company.id),
    views = await Promise.all([
      readServiceLifecycleReview(sources, input, gate),
      readServiceLifecycleReview(sources, { ...input }, gate),
    ]);
  expect(views[0]).toEqual(views[1]);
  expect(sources.property.read(sources.company.id)).toEqual(before);
});
it('default OFF precedes source and input getters or toJSON', async () => {
  const getter = vi.fn(() => {
      throw Error('must not run');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources,
    input = Object.defineProperty({}, 'query', {
      get: getter,
    }) as ServiceLifecycleInput;
  await expect(readServiceLifecycleReview(sources, input)).rejects.toThrow(
    /OFF/,
  );
  expect(getter).not.toHaveBeenCalled();
  expect(
    renderToStaticMarkup(createElement(ServiceLifecycleReview, { sources })),
  ).toContain('Service lifecycle review is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote', 'disabled'] as const)(
  'UI %s gate denies before source getters',
  (kind) => {
    vi.stubGlobal('window', {
      location: {
        hostname: kind === 'remote' ? 'example.invalid' : '127.0.0.1',
        protocol: kind === 'https' ? 'https:' : 'http:',
      },
    });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const getter = vi.fn(() => {
        throw Error('must not run');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources;
    const html = renderToStaticMarkup(
      createElement(ServiceLifecycleReview, {
        sources,
        enabled: kind !== 'disabled',
      }),
    );
    expect(html).toContain('Service lifecycle review is off');
    expect(getter).not.toHaveBeenCalled();
    expect(html).not.toContain('<input');
  },
);
it.each([0, 1, 2])(
  'brand %i renders the admitted scoped form without automatic source review',
  async (index) => {
    const { sources } = await fixture(index);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(ServiceLifecycleReview, { sources, enabled: true }),
    );
    expect(html).toContain('aria-label="Service lifecycle review"');
    expect(html).toContain('Review lifecycle sources');
    expect(html).toContain('Search lifecycle sources');
    expect(html).not.toContain(sources.entries[0].receipt_id);
  },
);
it.each(['query', 'source', 'report'] as const)(
  'rejects %s accessors without execution',
  async (kind) => {
    const { sources, input, gate, detail } = await detailFixture(),
      getter = vi.fn(() => '');
    if (kind === 'query')
      await expect(
        readServiceLifecycleReview(
          sources,
          Object.defineProperty({ ...input }, 'query', {
            enumerable: true,
            get: getter,
          }),
          gate,
        ),
      ).rejects.toThrow();
    if (kind === 'source')
      await expect(
        readServiceLifecycleReview(
          Object.defineProperty({ ...sources }, 'company', {
            enumerable: true,
            get: getter,
          }),
          input,
          gate,
        ),
      ).rejects.toThrow();
    if (kind === 'report')
      await expect(
        openServiceLifecycleReport(
          detail,
          Object.defineProperty(
            { ...detail.customer_safe.documentation[0].report.reference },
            'published_version',
            { enumerable: true, get: getter },
          ),
        ),
      ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);
it('rejects source serializers and filter coercion without invoking either', async () => {
  const { sources, input, gate } = await fixture(),
    called = vi.fn(() => '');
  await expect(
    readServiceLifecycleReview(
      sources,
      {
        ...input,
        query: { toString: called },
      } as unknown as ServiceLifecycleInput,
      gate,
    ),
  ).rejects.toThrow();
  await expect(
    readServiceLifecycleReview(
      sources,
      { ...input, toJSON: called } as ServiceLifecycleInput,
      gate,
    ),
  ).rejects.toThrow();
  Object.assign(sources.entries[0].issued, { toJSON: called });
  await expect(
    readServiceLifecycleReview(sources, input, gate),
  ).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
it.each([
  { query: 'x'.repeat(101), location_id: '', job_id: '' },
  { query: '', location_id: 'x'.repeat(201), job_id: '' },
  { query: '', location_id: '', job_id: 'x'.repeat(201) },
])('rejects bounded invalid filters %j', async (bad) => {
  const { sources, gate } = await fixture();
  await expect(
    readServiceLifecycleReview(sources, bad, gate),
  ).rejects.toThrow();
});
