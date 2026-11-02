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
import { ServicePassportDesk } from '../src/components/workflows/ServicePassportDesk';
import {
  readServicePassportDesk,
  openServicePassportJob,
  openServicePassportReport,
  openServicePassportFinding,
  selectServicePassportJob,
  assertServicePassportCurrentNow,
  assertServicePassportDetailCurrentNow,
  inspectServicePassportDesk,
  type ServicePassportInput,
} from '../src/lib/workflows/service-passport-desk';

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
    input: {
      query: '',
      customer_id: '',
      location_id: '',
      job_id: '',
      state: '',
    },
  };
}
async function detailFixture(index = 0) {
  const f = await fixture(index),
    view = await readServicePassportDesk(f.sources, f.input, f.gate),
    detail = await openServicePassportJob(view, view.staff_paths[0].job_id);
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
  'brand %i explores actual requests, issued scope, original receipts, Passport report and finding without writers or new IDs',
  async (index) => {
    const { sources, gate, input } = await fixture(index),
      before = sources.property.read(sources.company.id),
      releases = sources.entries.map((e) => e.release.read('staff'));
    const writers = [
        vi.spyOn(sources.estimates, 'create'),
        vi.spyOn(sources.estimates, 'revise'),
        vi.spyOn(sources.estimates, 'issue'),
        vi.spyOn(sources.estimates, 'approveJob'),
        vi.spyOn(sources.estimates, 'assignJob'),
        vi.spyOn(sources.property, 'publish'),
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.operations, 'assignIntake'),
        ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      ids = vi.spyOn(crypto, 'randomUUID');
    const view = await readServicePassportDesk(sources, input, gate);
    expect(() => assertServicePassportCurrentNow(view)).not.toThrow();
    expect(view).toMatchObject({
      available_requests: 3,
      available_customers: 3,
      available_jobs: 4,
      available_properties: 3,
      available_reports: 4,
      matching_jobs: 4,
      coverage: 'AVAILABLE_ADMITTED_SOURCES_NOT_COMPLETE_HISTORY',
    });
    expect(inspectServicePassportDesk(view).inspected_sources).toBe(0);
    for (const p of view.staff_paths) {
      const detail = await openServicePassportJob(view, p.job_id),
        e = sources.entries.find((e) => e.target.job_id === p.job_id)!;
      expect(detail.staff).toMatchObject({
        request: { id: e.intake_request_id },
        receipt: { id: e.receipt_id },
        offer_id: e.offer_id,
        issued_version_id: e.target.version_id,
        request_scope_association:
          'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK',
        genuine_customer_approval: 'UNVERIFIED',
      });
      expect(detail.customer_safe.contractor.id).toBe(
        sampleCompanies[index].id,
      );
      expect(detail.customer_safe.timeline.snapshot.format).toBe(
        'synthetic-property-passport-timeline-v1',
      );
      expect(detail.customer_safe.scope.job_id).toBe(p.job_id);
      expect(detail.customer_safe.required_proof.map((p) => p.status)).toEqual([
        'UNKNOWN',
        'UNKNOWN',
        'UNKNOWN',
        'UNKNOWN',
      ]);
      const doc = detail.customer_safe.documentation[0],
        report = await openServicePassportReport(detail, doc.report.reference);
      expect(report).toEqual(doc.report);
      const finding = await openServicePassportFinding(
        detail,
        report.observations[0].reference,
      );
      expect(finding.finding).toEqual(report.observations[0]);
      expect(finding.report_reference).toEqual(report.reference);
      expect(selectServicePassportJob(detail)).toBe(p.job_id);
      expect(
        Object.isFrozen(detail.customer_safe.timeline.snapshot.events),
      ).toBe(true);
    }
    expect(inspectServicePassportDesk(view).inspected_sources).toBeGreaterThan(
      4,
    );
    expect(sources.property.read(sources.company.id)).toEqual(before);
    expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
      releases,
    );
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
  },
);
it('keeps same-property jobs, immutable versions and report links distinct; back context is exact', async () => {
  const { sources, input, gate } = await fixture(),
    e = sources.entries[0];
  const filters = {
      ...input,
      customer_id: e.target.customer_id,
      location_id: e.target.location_id,
      state: 'new',
    },
    initial = await readServicePassportDesk(sources, input, gate);
  filters.state = initial.staff_paths[0].request.status;
  const view = await readServicePassportDesk(sources, filters, gate);
  expect(view.staff_paths).toHaveLength(2);
  expect(new Set(view.staff_paths.map((p) => p.request.id)).size).toBe(1);
  const a = await openServicePassportJob(view, view.staff_paths[0].job_id),
    b = await openServicePassportJob(view, view.staff_paths[1].job_id);
  expect(a.customer_safe.scope.issued_version_id).not.toBe(
    b.customer_safe.scope.issued_version_id,
  );
  expect(a.staff.receipt.id).not.toBe(b.staff.receipt.id);
  expect(
    a.customer_safe.documentation.map((d) => d.selected_job_association).sort(),
  ).toEqual(['EXACT_RECORDED_JOB_LINK', 'UNKNOWN']);
  expect(a.return_selection).toEqual(filters);
  expect(b.return_selection).toEqual(filters);
  expect(view.matching_requests).toBe(1);
  expect(view.available_requests).toBe(3);
});
it.each([
  'request',
  'job',
  'property',
  'customer',
  'version',
  'report',
  'scope',
] as const)('literal search combines all filters for %s', async (kind) => {
  const { sources, input, gate, view } = await detailFixture(),
    p = view.staff_paths[0];
  const terms = {
    request: p.request.id,
    job: p.job_id,
    property: p.location_id,
    customer: p.customer_id,
    version: p.issued_version_id,
    report: p.linked_reports[0].reference.report_id,
    scope: p.scope_name,
  };
  const result = await readServicePassportDesk(
    sources,
    {
      ...input,
      query: terms[kind],
      customer_id: p.customer_id,
      location_id: p.location_id,
      job_id: p.job_id,
      state: p.request.status,
    },
    gate,
  );
  expect(result.matching_jobs).toBe(1);
  expect(result.staff_paths[0].job_id).toBe(p.job_id);
  expect(result.available_reports).toBe(4);
});
it.each(['.*', '%', 'no-matching-evidence'])(
  'literal empty search %s retains honest available counts',
  async (query) => {
    const { sources, input, gate } = await fixture(),
      view = await readServicePassportDesk(sources, { ...input, query }, gate);
    expect(view.staff_paths).toEqual([]);
    expect(view.available_jobs).toBe(4);
    expect(view.matching_requests).toBe(0);
  },
);
it.each(['customer_id', 'location_id', 'job_id', 'state', 'conflict'] as const)(
  'denies foreign or conflicting %s filter',
  async (kind) => {
    const { sources, input, gate } = await fixture(),
      bad = { ...input };
    if (kind === 'conflict') {
      bad.customer_id = sources.entries[0].target.customer_id;
      bad.job_id = sources.entries[1].target.job_id!;
    } else bad[kind] = 'foreign';
    await expect(readServicePassportDesk(sources, bad, gate)).rejects.toThrow();
  },
);
it('cannot open an off-filter valid job or reconstruct authority through JSON', async () => {
  const { sources, input, gate } = await fixture(),
    view = await readServicePassportDesk(
      sources,
      { ...input, job_id: sources.entries[0].target.job_id! },
      gate,
    ),
    detail = await openServicePassportJob(view, view.staff_paths[0].job_id);
  await expect(
    openServicePassportJob(view, sources.entries[1].target.job_id!),
  ).rejects.toThrow(/visible/);
  await expect(
    openServicePassportJob(
      JSON.parse(JSON.stringify(view)),
      view.staff_paths[0].job_id,
    ),
  ).rejects.toThrow(/retained/);
  expect(() =>
    selectServicePassportJob(JSON.parse(JSON.stringify(detail))),
  ).toThrow(/retained/);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'report_id',
  'published_version',
  'kind',
] as const)('denies wrong report %s without latest fallback', async (key) => {
  const { detail } = await detailFixture(),
    ref = { ...detail.customer_safe.documentation[0].report.reference };
  Object.assign(ref, { [key]: key === 'published_version' ? 2 : 'foreign' });
  await expect(openServicePassportReport(detail, ref)).rejects.toThrow();
});
it.each([
  'finding_id',
  'source_index',
  'report_id',
  'published_version',
] as const)('denies wrong finding %s without fuzzy matching', async (key) => {
  const { detail } = await detailFixture(),
    ref = {
      ...detail.customer_safe.documentation[0].report.observations[0].reference,
    };
  Object.assign(ref, {
    [key]:
      key === 'source_index' ? 1 : key === 'published_version' ? 2 : 'foreign',
  });
  await expect(openServicePassportFinding(detail, ref)).rejects.toThrow();
});
it('revocation withdraws currentness, exact navigation and report/finding access', async () => {
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
  expect(inspectServicePassportDesk(view).status).toBe('UNKNOWN');
  expect(() => selectServicePassportJob(detail)).toThrow();
  await expect(
    openServicePassportFinding(
      detail,
      detail.customer_safe.documentation[0].report.observations[0].reference,
    ),
  ).rejects.toThrow();
});
it.each(['model', 'repository', 'root', 'logout'] as const)(
  'equal-context %s change invalidates retained sources',
  async (kind) => {
    const { sources, gate, view, detail } = await detailFixture(),
      e = sources.entries[0];
    if (kind === 'model') {
      const model = new CustomerPortalPreviewModel(
        sources.company,
        sources.property,
      );
      model.admitLocalJourney(e.target, gate);
      e.customerModel = model;
    }
    if (kind === 'repository')
      sources.estimates = new Phase3Repository(sources.operations);
    if (kind === 'root') sources.entries = [...sources.entries];
    if (kind === 'logout') e.customerModel.logout();
    expect(() => assertServicePassportDetailCurrentNow(detail)).toThrow();
    expect(inspectServicePassportDesk(view).status).toBe('UNKNOWN');
  },
);
it.each([
  'query',
  'customer_id',
  'location_id',
  'job_id',
  'state',
  'gate',
  'model',
  'root',
] as const)('rechecks %s after final desk digest', async (kind) => {
  const { sources, input, gate } = await fixture(),
    reached = digestChange('LOCAL_SERVICE_PASSPORT_DESK', () => {
      if (kind === 'gate') gate.confirmed = false;
      else if (kind === 'model') sources.entries[0].customerModel.logout();
      else if (kind === 'root') sources.entries = [...sources.entries];
      else input[kind] = 'changed';
    });
  await expect(readServicePassportDesk(sources, input, gate)).rejects.toThrow();
  reached();
});
it.each(['input', 'gate', 'model'] as const)(
  'rechecks %s at final detail await and cannot restore UNKNOWN',
  async (kind) => {
    const { view, input, gate, sources } = await detailFixture(),
      reached = digestChange('LOCAL_SERVICE_PASSPORT_SOURCE', () => {
        if (kind === 'input') input.query = 'changed';
        if (kind === 'gate') gate.confirmed = false;
        if (kind === 'model') sources.entries[0].customerModel.logout();
      });
    await expect(
      openServicePassportJob(view, view.staff_paths[0].job_id),
    ).rejects.toThrow();
    reached();
    input.query = '';
    gate.confirmed = true;
    expect(inspectServicePassportDesk(view).status).toBe('UNKNOWN');
  },
);
it('finding reference changes after final digest retain UNKNOWN and never replay', async () => {
  const { detail, view } = await detailFixture(),
    ref = {
      ...detail.customer_safe.documentation[0].report.observations[0].reference,
    },
    reached = digestChange('LOCAL_SERVICE_PASSPORT_FINDING', () => {
      ref.finding_id = 'changed';
    });
  await expect(openServicePassportFinding(detail, ref)).rejects.toThrow();
  reached();
  ref.finding_id =
    detail.customer_safe.documentation[0].report.observations[0].reference.finding_id;
  expect(inspectServicePassportDesk(view).status).toBe('UNKNOWN');
  await expect(openServicePassportFinding(detail, ref)).rejects.toThrow();
});
it('late finding accessor is rejected without executing it', async () => {
  const { detail } = await detailFixture(),
    ref = {
      ...detail.customer_safe.documentation[0].report.observations[0].reference,
    },
    getter = vi.fn(() => 0),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    Object.defineProperty(ref, 'source_index', {
      enumerable: true,
      configurable: true,
      get: getter,
    });
    return value;
  });
  await expect(openServicePassportFinding(detail, ref)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('lost read acknowledgment withholds progress and exact navigation permanently for retained view', async () => {
  const { detail, view } = await detailFixture();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('lost read acknowledgment'),
  );
  await expect(
    openServicePassportReport(
      detail,
      detail.customer_safe.documentation[0].report.reference,
    ),
  ).rejects.toThrow();
  expect(inspectServicePassportDesk(view)).toMatchObject({
    status: 'UNKNOWN',
    inspected_sources: null,
    replay: false,
    replacement: null,
  });
  expect(() => selectServicePassportJob(detail)).toThrow(/UNKNOWN/);
});
it('safe allowlist and existing timeline exclude staff, supplier, cost, rate and other-customer evidence', async () => {
  const { detail, sources } = await detailFixture(),
    safe = detail.customer_safe,
    text = JSON.stringify(safe),
    keys = (v: unknown): string[] =>
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
  for (const value of [
    'PRIVATE',
    'Synthetic planning supplier',
    sources.entries[0].receipt_id,
    sources.entries[0].offer_id,
    sources.entries[0].target.actor_id,
    sources.entries[1].target.customer_id,
    sources.entries[1].report_id,
  ])
    expect(text).not.toContain(value);
});
it('later empty after report never changes immutable documentation or claims completion', async () => {
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
    summary: 'No new findings recorded.',
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
  expect(inspectServicePassportDesk(view).status).toBe('UNKNOWN');
  expect(JSON.stringify(detail)).toBe(old);
  const fresh = await readServicePassportDesk(sources, input, gate),
    newer = await openServicePassportJob(fresh, e.target.job_id!);
  expect(fresh.available_reports).toBe(5);
  expect(newer.customer_safe).toMatchObject({
    physical_completion: 'UNKNOWN',
    customer_acceptance: 'UNKNOWN',
    warranty: 'UNKNOWN',
    history_completeness: 'UNKNOWN',
  });
  expect(newer.customer_safe.timeline.snapshot.physical_completion).toBe(
    'UNVERIFIED',
  );
});
it.each([
  'ambiguous-plan',
  'missing-receipt',
  'foreign-customer',
  'issued-version',
] as const)(
  'denies %s rather than inventing source associations',
  async (kind) => {
    const { sources, input, gate } = await fixture();
    if (kind === 'ambiguous-plan') {
      const read = sources.property.read.bind(sources.property);
      vi.spyOn(sources.property, 'read').mockImplementation((org) => {
        const s = read(org);
        return {
          ...s,
          plans: [
            ...s.plans,
            structuredClone(
              s.plans.find((p) => p.id === sources.entries[0].plan_id)!,
            ),
          ],
        };
      });
    }
    if (kind === 'missing-receipt') sources.entries[0].receipt_id = 'missing';
    if (kind === 'foreign-customer')
      sources.entries[0].target.customer_id = 'foreign';
    if (kind === 'issued-version')
      sources.entries[0].target.version_id = 'foreign';
    await expect(
      readServicePassportDesk(sources, input, gate),
    ).rejects.toThrow();
  },
);
it('simultaneous read-only desks do not alter records or share inspected presentation', async () => {
  const { sources, input, gate } = await fixture(),
    [a, b] = await Promise.all([
      readServicePassportDesk(sources, input, gate),
      readServicePassportDesk(sources, { ...input }, gate),
    ]);
  expect(a).toEqual(b);
  await openServicePassportJob(a, a.staff_paths[0].job_id);
  expect(inspectServicePassportDesk(a).inspected_sources).toBe(1);
  expect(inspectServicePassportDesk(b).inspected_sources).toBe(0);
});
it('OFF is checked before any source/input getter or serializer', async () => {
  const getter = vi.fn(() => {
      throw Error('must not execute');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources,
    input = Object.defineProperty({}, 'query', {
      get: getter,
    }) as ServicePassportInput;
  await expect(readServicePassportDesk(sources, input)).rejects.toThrow(/OFF/);
  expect(
    renderToStaticMarkup(createElement(ServicePassportDesk, { sources })),
  ).toContain('Service and Passport desk is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote', 'disabled'] as const)(
  'UI %s admission denies before source getters',
  (kind) => {
    vi.stubGlobal('window', {
      location: {
        hostname: kind === 'remote' ? 'example.invalid' : '127.0.0.1',
        protocol: kind === 'https' ? 'https:' : 'http:',
      },
    });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const getter = vi.fn(() => {
        throw Error('must not execute');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources,
      html = renderToStaticMarkup(
        createElement(ServicePassportDesk, {
          sources,
          enabled: kind !== 'disabled',
        }),
      );
    expect(html).toContain('Service and Passport desk is off');
    expect(html).not.toContain('<input');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i renders usable scoped controls without auto-reading content',
  async (index) => {
    const { sources } = await fixture(index);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(ServicePassportDesk, { sources, enabled: true }),
    );
    for (const label of [
      'Service and Passport desk',
      'Search service evidence',
      'Customer',
      'Property',
      'Job',
      'Request state',
      'Explore service evidence',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain(sources.entries[0].receipt_id);
  },
);
it.each([
  'input',
  'source',
  'finding',
  'serializer',
  'coercion',
  'extra',
] as const)(
  'rejects %s accessors or serialization without execution',
  async (kind) => {
    const { sources, input, gate, detail } = await detailFixture(),
      called = vi.fn(() => ''),
      ref =
        detail.customer_safe.documentation[0].report.observations[0].reference;
    if (kind === 'input')
      await expect(
        readServicePassportDesk(
          sources,
          Object.defineProperty({ ...input }, 'query', {
            enumerable: true,
            get: called,
          }),
          gate,
        ),
      ).rejects.toThrow();
    if (kind === 'source')
      await expect(
        readServicePassportDesk(
          Object.defineProperty({ ...sources }, 'company', {
            enumerable: true,
            get: called,
          }),
          input,
          gate,
        ),
      ).rejects.toThrow();
    if (kind === 'finding')
      await expect(
        openServicePassportFinding(
          detail,
          Object.defineProperty({ ...ref }, 'finding_id', {
            enumerable: true,
            get: called,
          }),
        ),
      ).rejects.toThrow();
    if (kind === 'serializer') {
      Object.assign(sources.entries[0].issued, { toJSON: called });
      await expect(
        readServicePassportDesk(sources, input, gate),
      ).rejects.toThrow();
    }
    if (kind === 'coercion')
      await expect(
        readServicePassportDesk(
          sources,
          {
            ...input,
            query: { toString: called },
          } as unknown as ServicePassportInput,
          gate,
        ),
      ).rejects.toThrow();
    if (kind === 'extra')
      await expect(
        readServicePassportDesk(
          sources,
          { ...input, toJSON: called } as ServicePassportInput,
          gate,
        ),
      ).rejects.toThrow();
    expect(called).not.toHaveBeenCalled();
  },
);
it.each(['input', 'gate', 'saved-source', 'member'] as const)(
  'final finding await rechecks %s and retains UNKNOWN',
  async (kind) => {
    const { sources, view, detail, input, gate } = await detailFixture(),
      ref =
        detail.customer_safe.documentation[0].report.observations[0].reference,
      reached = digestChange('LOCAL_SERVICE_PASSPORT_FINDING', async () => {
        if (kind === 'input') input.state = 'changed';
        if (kind === 'gate') gate.enabled = false;
        if (kind === 'saved-source')
          await sources.estimates.revise(
            sources.company.id,
            sources.entries[0].issued,
          );
        if (kind === 'member') {
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
    await expect(openServicePassportFinding(detail, ref)).rejects.toThrow();
    reached();
    input.state = '';
    gate.enabled = true;
    expect(inspectServicePassportDesk(view).status).toBe('UNKNOWN');
  },
);
it('canonical exact finding accepts own-data references regardless of field insertion order', async () => {
  const { detail } = await detailFixture(),
    ref =
      detail.customer_safe.documentation[0].report.observations[0].reference;
  const reordered = Object.fromEntries(
    Object.entries(ref).reverse(),
  ) as unknown as typeof ref;
  expect(
    (await openServicePassportFinding(detail, reordered)).finding.reference,
  ).toEqual(ref);
});
it('all admitted dependent filter options retain exact customer/property context', async () => {
  const { sources, input, gate } = await fixture(),
    e = sources.entries[0],
    view = await readServicePassportDesk(
      sources,
      {
        ...input,
        customer_id: e.target.customer_id,
        location_id: e.target.location_id,
      },
      gate,
    );
  expect(view.customer_options).toHaveLength(3);
  expect(view.property_options).toHaveLength(3);
  expect(view.job_options).toHaveLength(4);
  expect(
    view.job_options.filter(
      (j) =>
        j.customer_id === e.target.customer_id &&
        j.location_id === e.target.location_id,
    ),
  ).toHaveLength(2);
});
it.each(['query', 'customer_id', 'state'] as const)(
  'invalid bounded %s input is rejected without coercion',
  async (key) => {
    const { sources, input, gate } = await fixture();
    await expect(
      readServicePassportDesk(
        sources,
        { ...input, [key]: 'x'.repeat(201) },
        gate,
      ),
    ).rejects.toThrow(/bounded/);
  },
);
