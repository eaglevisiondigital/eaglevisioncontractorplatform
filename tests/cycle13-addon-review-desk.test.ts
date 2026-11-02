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
import {
  advancedHandoffKinds,
  prepareAdvancedHandoff,
  type AdvancedHandoffInput,
} from '../src/lib/workflows/advanced-handoffs';
import {
  readExternalProposalSource,
  externalProposalReferences,
  reviewExternalProposalLifecycle,
  prepareExternalProposalHandoff,
  inspectExternalProposalLifecycle,
} from '../src/lib/workflows/external-proposal-lifecycle';
import { AddonReviewDesk } from '../src/components/workflows/AddonReviewDesk';
import {
  readAddonReviewDesk,
  inspectAddonReviewSource,
  inspectAddonReviewReference,
  openAddonOriginalControl,
  selectAddonReviewJob,
  assertAddonReviewCurrentNow,
  assertAddonReviewDetailCurrentNow,
  inspectAddonReviewDesk,
  type AddonReviewInput,
  type AddonSourceReference,
  type AddonRecordReference,
} from '../src/lib/workflows/addon-review-desk';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(index = 0, kind: AddonReviewInput['kind'] = 'offline') {
  const gate = { enabled: true, confirmed: true };
  return {
    sources: await prepareOperatingSources(sampleCompanies[index], gate),
    gate,
    input: {
      query: '',
      job_id: '',
      kind,
      edition: 'property_services',
    } as AddonReviewInput,
  };
}
async function detailed(index = 0, kind: AddonReviewInput['kind'] = 'offline') {
  const f = await fixture(index, kind),
    view = await readAddonReviewDesk(f.sources, f.input, f.gate),
    detail = await inspectAddonReviewSource(view, view.rows[0].reference);
  return { ...f, view, detail };
}
async function original(
  sources: OperatingSources,
  gate: { enabled: boolean; confirmed: boolean },
  kind: AddonReviewInput['kind'] = 'offline',
  jobId = sources.entries[0].target.job_id!,
) {
  const handoff: AdvancedHandoffInput = {
      job_id: jobId,
      kind,
      note: 'Literal original control source review.',
      review_on: '2026-12-28',
      manual_priority: 'normal',
      edition: 'property_services',
    },
    source = await readExternalProposalSource(sources, handoff, gate),
    refs = externalProposalReferences(source),
    input = {
      proposal: { external_reference: 'original-only', source: refs.source },
      workflow: refs.workflow,
      review_expires_at_ms: 2000,
    },
    clock = { now_ms: 1000 };
  return { handoff, source, input, clock };
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
for (const index of [0, 1, 2])
  for (const kind of advancedHandoffKinds)
    it(`brand ${index} ${kind} inspects actual job/issued/report/workflow/material sources without creating records or engine attempts`, async () => {
      const { sources, gate, input } = await fixture(index, kind),
        before = sources.property.read(sources.company.id),
        releases = sources.entries.map((e) => e.release.read('staff')),
        company = JSON.stringify(sources.company),
        writers = [
          vi.spyOn(sources.estimates, 'create'),
          vi.spyOn(sources.estimates, 'save'),
          vi.spyOn(sources.estimates, 'issue'),
          vi.spyOn(sources.estimates, 'approveJob'),
          vi.spyOn(sources.estimates, 'assignJob'),
          vi.spyOn(sources.estimates, 'recordTime'),
          vi.spyOn(sources.property, 'saveVisit'),
          vi.spyOn(sources.property, 'publish'),
          ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
        ],
        ids = vi.spyOn(crypto, 'randomUUID');
      const view = await readAddonReviewDesk(sources, input, gate);
      expect(() => assertAddonReviewCurrentNow(view)).not.toThrow();
      expect(view).toMatchObject({
        available_jobs: 4,
        matching_jobs: 4,
        available_modes: 7,
        operational_ready: false,
      });
      const detail = await inspectAddonReviewSource(
          view,
          view.rows[0].reference,
        ),
        entry = sources.entries.find(
          (e) => e.target.job_id === detail.reference.job_id,
        )!;
      expect(detail.reference).toMatchObject({
        organization_id: sources.company.id,
        customer_id: entry.target.customer_id,
        location_id: entry.target.location_id,
        job_id: entry.target.job_id,
        issued_version_id: entry.target.version_id,
        kind,
      });
      expect(detail.report).toEqual({
        report_id: entry.report_id,
        published_version: entry.published_version,
      });
      expect(detail.source_references.workflow).toMatchObject({
        plan_id: entry.plan_id,
        scheduled_visit_id: entry.scheduled_visit_id,
        published_visit_id: entry.visit_id,
      });
      expect(detail.catalog_links.state).toBe(
        'MISSING_RECORDED_CATALOG_ASSOCIATION',
      );
      expect(detail.missing_evidence).toMatchObject({
        provider: 'UNKNOWN',
        accounting_mapping: 'UNKNOWN',
        storm_incident: 'UNKNOWN',
        network_vetting: 'UNKNOWN',
        physical_completion: 'UNKNOWN',
        voice_recognition: 'NONE',
      });
      expect(detail.time).toEqual([]);
      expect(detail.materials.every((m) => m.catalog_item_id === null)).toBe(
        true,
      );
      expect(detail.requirements.length).toBeGreaterThanOrEqual(2);
      for (const ref of detail.references) {
        const inspected = await inspectAddonReviewReference(detail, ref);
        expect(inspected.reference).toEqual(ref);
        expect(inspected.reference.job_id).toBe(entry.target.job_id);
      }
      expect(openAddonOriginalControl(detail)).toBe(sources);
      expect(selectAddonReviewJob(detail)).toBe(entry.target.job_id);
      expect(Object.isFrozen(detail.references)).toBe(true);
      expect(detail.original_engine_attempt).toBe(
        'NO_ATTEMPT_OBSERVED_IN_THIS_ADAPTER',
      );
      expect(sources.property.read(sources.company.id)).toEqual(before);
      expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
        releases,
      );
      expect(JSON.stringify(sources.company)).toBe(company);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
      expect(ids).not.toHaveBeenCalled();
    });
it('same-property jobs retain distinct issued versions/reports and back filter context', async () => {
  const { sources, gate, input } = await fixture(),
    first = await readAddonReviewDesk(sources, input, gate),
    property = first.rows[0].reference.location_id,
    rows = first.rows.filter((r) => r.reference.location_id === property);
  expect(rows).toHaveLength(2);
  const a = await inspectAddonReviewSource(first, rows[0].reference),
    b = await inspectAddonReviewSource(first, rows[1].reference);
  expect(a.reference.job_id).not.toBe(b.reference.job_id);
  expect(a.reference.issued_version_id).not.toBe(b.reference.issued_version_id);
  expect(a.report.report_id).not.toBe(b.report.report_id);
  expect(a.return_selection).toEqual(input);
  expect(b.return_selection).toEqual(input);
});
it.each([
  'job',
  'customer',
  'property',
  'issued',
  'report',
  'plan',
  'material',
] as const)(
  'literal %s search composes exact job/mode filtering',
  async (kind) => {
    const { sources, gate, input, view, detail } = await detailed(),
      r = view.rows[0],
      terms = {
        job: r.reference.job_id,
        customer: r.reference.customer_id,
        property: r.reference.location_id,
        issued: r.reference.issued_version_id,
        report: r.report_id,
        plan: r.workflow.plan_id!,
        material: detail.materials[0].line_id,
      };
    const result = await readAddonReviewDesk(
      sources,
      { ...input, job_id: r.reference.job_id, query: terms[kind] },
      gate,
    );
    expect(result.matching_jobs).toBe(1);
    expect(result.available_jobs).toBe(4);
    expect(result.rows[0].reference.job_id).toBe(r.reference.job_id);
  },
);
it.each(['.*', '%', 'no-such-literal-source'])(
  'empty literal %s retains available coverage',
  async (query) => {
    const { sources, input, gate } = await fixture(),
      view = await readAddonReviewDesk(sources, { ...input, query }, gate);
    expect(view.rows).toEqual([]);
    expect(view.available_jobs).toBe(4);
  },
);
it('foreign filter and off-filter source selection cannot substitute another job', async () => {
  const { sources, input, gate } = await fixture();
  await expect(
    readAddonReviewDesk(sources, { ...input, job_id: 'foreign' }, gate),
  ).rejects.toThrow();
  const view = await readAddonReviewDesk(
      sources,
      { ...input, job_id: sources.entries[0].target.job_id! },
      gate,
    ),
    other = await readAddonReviewDesk(sources, input, gate);
  await expect(
    inspectAddonReviewSource(
      view,
      other.rows.find(
        (r) => r.reference.job_id !== view.rows[0].reference.job_id,
      )!.reference,
    ),
  ).rejects.toThrow(/visible/);
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'issued_version_id',
  'saved_lock_revision',
  'source_sha256',
  'kind',
] as const)(
  'wrong source %s cannot inspect or borrow identity',
  async (key) => {
    const { view } = await detailed(),
      ref = { ...view.rows[0].reference };
    Object.assign(ref, {
      [key]: key === 'saved_lock_revision' ? 999 : 'foreign',
    });
    await expect(inspectAddonReviewSource(view, ref)).rejects.toThrow();
  },
);
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'issued_version_id',
  'source_sha256',
  'id',
  'version',
  'kind',
] as const)(
  'wrong recorded %s cannot borrow a report/time/material identity',
  async (key) => {
    const { detail } = await detailed(),
      ref = { ...detail.references[0] };
    Object.assign(ref, { [key]: key === 'version' ? 99 : 'foreign' });
    await expect(inspectAddonReviewReference(detail, ref)).rejects.toThrow();
  },
);
it('cannot fabricate absent time or catalog mappings; independently checked material ID stays exact', async () => {
  const { detail } = await detailed(),
    base = detail.references[0];
  await expect(
    inspectAddonReviewReference(detail, {
      ...base,
      kind: 'time',
      id: 'absent-time',
      version: null,
    }),
  ).rejects.toThrow();
  await expect(
    inspectAddonReviewReference(detail, {
      ...base,
      kind: 'material',
      id: 'foreign-material',
      version: null,
    }),
  ).rejects.toThrow();
  expect(detail.materials.every((m) => m.catalog_item_id === null)).toBe(true);
});
it('copies cannot recover inspection, original control or navigation authority', async () => {
  const { view, detail } = await detailed();
  await expect(
    inspectAddonReviewSource(
      JSON.parse(JSON.stringify(view)),
      view.rows[0].reference,
    ),
  ).rejects.toThrow(/retained/);
  expect(() =>
    openAddonOriginalControl(JSON.parse(JSON.stringify(detail))),
  ).toThrow(/retained/);
  expect(() =>
    selectAddonReviewJob(JSON.parse(JSON.stringify(detail))),
  ).toThrow(/retained/);
});
it.each([
  'query',
  'job_id',
  'kind',
  'edition',
  'gate',
  'model',
  'root',
  'member',
] as const)('last desk await rechecks %s', async (kind) => {
  const { sources, input, gate } = await fixture(),
    reached = digestChange('LOCAL_ADDON_REVIEW_DESK', async () => {
      if (kind === 'query') input.query = 'changed';
      if (kind === 'job_id') input.job_id = 'foreign';
      if (kind === 'kind') input.kind = 'voice';
      if (kind === 'edition') input.edition = 'roofing';
      if (kind === 'gate') gate.confirmed = false;
      if (kind === 'model') sources.entries[0].customerModel.logout();
      if (kind === 'root') sources.entries = [...sources.entries];
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
  await expect(readAddonReviewDesk(sources, input, gate)).rejects.toThrow();
  reached();
});
it.each(['input', 'gate', 'source', 'reference'] as const)(
  'last source inspection await rechecks %s and cannot restore UNKNOWN',
  async (kind) => {
    const { sources, input, gate, view } = await detailed(),
      ref = { ...view.rows[0].reference },
      reached = digestChange(
        'LOCAL_ADDON_EXACT_SOURCE_INSPECTION',
        async () => {
          if (kind === 'input') input.query = 'changed';
          if (kind === 'gate') gate.enabled = false;
          if (kind === 'source')
            await sources.estimates.revise(
              sources.company.id,
              sources.entries[0].issued,
            );
          if (kind === 'reference') ref.source_sha256 = 'changed';
        },
      );
    await expect(inspectAddonReviewSource(view, ref)).rejects.toThrow();
    reached();
    input.query = '';
    gate.enabled = true;
    expect(inspectAddonReviewDesk(view).status).toBe('UNKNOWN');
  },
);
it('last record await checks original reference before navigation', async () => {
  const { view, detail } = await detailed(),
    ref = { ...detail.references[0] },
    reached = digestChange('LOCAL_ADDON_RECORDED_REFERENCE', () => {
      ref.id = 'changed';
    });
  await expect(inspectAddonReviewReference(detail, ref)).rejects.toThrow();
  reached();
  expect(inspectAddonReviewDesk(view).status).toBe('UNKNOWN');
  expect(() => selectAddonReviewJob(detail)).toThrow(/UNKNOWN/);
});
it.each(['model', 'repository', 'root', 'logout'] as const)(
  'same-context %s replacement withdraws all retained content',
  async (kind) => {
    const { sources, gate, view, detail } = await detailed(),
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
    expect(() => assertAddonReviewDetailCurrentNow(detail)).toThrow();
    expect(inspectAddonReviewDesk(view).status).toBe('UNKNOWN');
    expect(() => openAddonOriginalControl(detail)).toThrow();
  },
);
it('revocation blocks detail/render/original control/job navigation', async () => {
  const { sources, view, detail } = await detailed();
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
  expect(inspectAddonReviewDesk(view).status).toBe('UNKNOWN');
  expect(() => openAddonOriginalControl(detail)).toThrow();
  expect(() => selectAddonReviewJob(detail)).toThrow();
});
it.each(['comparison', 'handoff'] as const)(
  'original C12 %s lost ACK cannot be bypassed by fresh desk/container/mode/job/label',
  async (stage) => {
    const { sources, gate, input } = await fixture(),
      f = await original(sources, gate);
    let view:
      Awaited<ReturnType<typeof reviewExternalProposalLifecycle>> | undefined;
    if (stage === 'handoff')
      view = await reviewExternalProposalLifecycle(f.source, f.input, f.clock);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let fired = false;
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const value = await digest(...args),
          body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
        if (
          !fired &&
          body.mode ===
            (stage === 'comparison'
              ? 'LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE'
              : 'IMMUTABLE_ADVANCED_REVIEW_HANDOFF')
        ) {
          fired = true;
          throw Error('original acknowledgment lost');
        }
        return value;
      });
    if (stage === 'comparison')
      await expect(
        reviewExternalProposalLifecycle(f.source, f.input, f.clock),
      ).rejects.toThrow();
    else
      await expect(
        prepareExternalProposalHandoff(view!, {
          confirmed: true,
          reviewed_lifecycle_sha256: view!.integrity.sha256,
        }),
      ).rejects.toThrow();
    expect(fired).toBe(true);
    spy.mockRestore();
    const desk = await readAddonReviewDesk({ ...sources }, input, gate),
      detail = await inspectAddonReviewSource(
        desk,
        desk.rows.find((r) => r.reference.job_id === f.handoff.job_id)!
          .reference,
      );
    expect(openAddonOriginalControl(detail).estimates).toBe(sources.estimates);
    await readAddonReviewDesk(sources, { ...input, kind: 'voice' }, gate);
    await readAddonReviewDesk(
      sources,
      { ...input, job_id: sources.entries[1].target.job_id! },
      gate,
    );
    const fresh = await original(openAddonOriginalControl(detail), gate);
    fresh.input.proposal.external_reference = 'replacement-label';
    await expect(
      reviewExternalProposalLifecycle(fresh.source, fresh.input, {
        now_ms: 1000,
      }),
    ).rejects.toThrow(/Existing lifecycle/);
    if (stage === 'handoff') {
      expect((await inspectExternalProposalLifecycle(view!)).status).toBe(
        'UNKNOWN',
      );
      await expect(
        prepareAdvancedHandoff(fresh.source, {
          confirmed: true,
          reviewed_requirements_sha256: fresh.source.integrity.sha256,
        }),
      ).rejects.toThrow(/Prior|UNKNOWN/);
    }
  },
);
it('concurrent desk reads inspect freely while original same-key reviews reserve only once', async () => {
  const { sources, input, gate } = await fixture(),
    [a, b] = await Promise.all([
      readAddonReviewDesk(sources, input, gate),
      readAddonReviewDesk(sources, { ...input }, gate),
    ]);
  expect(a).toEqual(b);
  const d = await inspectAddonReviewSource(a, a.rows[0].reference);
  expect(openAddonOriginalControl(d)).toBe(sources);
  const f = await original(sources, gate),
    g = await original(sources, gate),
    results = await Promise.allSettled([
      reviewExternalProposalLifecycle(f.source, f.input, f.clock),
      reviewExternalProposalLifecycle(
        g.source,
        {
          ...g.input,
          proposal: { ...g.input.proposal, external_reference: 'competing' },
        },
        g.clock,
      ),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
});
it('staff projection excludes costs/rates/payroll/private notes/workforce/contact and foreign customer content', async () => {
  const { sources, detail } = await detailed(),
    text = JSON.stringify(detail);
  for (const term of [
    'PRIVATE',
    'unit_cost_minor',
    'supplier_cost',
    'hourly_rate_minor',
    'margin_bps',
    'payroll',
    'worker_id',
    'actor_id',
    'internal_notes',
    '@example.invalid',
    sources.entries[1].target.customer_id,
    sources.entries[1].report_id,
  ])
    expect(text).not.toContain(term);
  expect(detail.authority).toBe('STAFF_READ_ONLY_NOT_CUSTOMER_PROJECTION');
});
it('OFF admission precedes input/source getters and serializers', async () => {
  const called = vi.fn(() => {
      throw Error('must not execute');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: called,
    }) as OperatingSources,
    input = Object.defineProperty({}, 'query', {
      get: called,
    }) as AddonReviewInput;
  await expect(readAddonReviewDesk(sources, input)).rejects.toThrow(/OFF/);
  expect(
    renderToStaticMarkup(createElement(AddonReviewDesk, { sources })),
  ).toContain('Advanced review desk is off');
  expect(called).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote', 'disabled'] as const)(
  'UI %s gate rejects before source access',
  (kind) => {
    vi.stubGlobal('window', {
      location: {
        hostname: kind === 'remote' ? 'example.invalid' : '127.0.0.1',
        protocol: kind === 'https' ? 'https:' : 'http:',
      },
    });
    if (kind === 'production') vi.stubEnv('DEV', false);
    const called = vi.fn(() => {
        throw Error('must not execute');
      }),
      sources = Object.defineProperty({}, 'company', {
        get: called,
      }) as OperatingSources,
      html = renderToStaticMarkup(
        createElement(AddonReviewDesk, {
          sources,
          enabled: kind !== 'disabled',
        }),
      );
    expect(html).toContain('Advanced review desk is off');
    expect(html).not.toContain('<input');
    expect(called).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i renders usable controls without automatic source content or original-control mount',
  async (index) => {
    const { sources } = await fixture(index);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(AddonReviewDesk, { sources, enabled: true }),
    );
    for (const label of [
      'Advanced review desk',
      'Search advanced sources',
      'Advanced job',
      'Advanced review mode',
      'Explore advanced sources',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('aria-label="External proposal lifecycle"');
    expect(html).not.toContain(sources.entries[0].receipt_id);
  },
);
it.each([
  'query',
  'root',
  'source-reference',
  'record-reference',
  'coercion',
  'toJSON',
] as const)('rejects %s accessors/coercion without executing', async (kind) => {
  const { sources, input, gate, view, detail } = await detailed(),
    called = vi.fn(() => '');
  if (kind === 'query')
    await expect(
      readAddonReviewDesk(
        sources,
        Object.defineProperty({ ...input }, 'query', {
          enumerable: true,
          get: called,
        }),
        gate,
      ),
    ).rejects.toThrow();
  if (kind === 'root')
    await expect(
      readAddonReviewDesk(
        Object.defineProperty({ ...sources }, 'company', {
          enumerable: true,
          get: called,
        }),
        input,
        gate,
      ),
    ).rejects.toThrow();
  if (kind === 'source-reference')
    await expect(
      inspectAddonReviewSource(
        view,
        Object.defineProperty({ ...view.rows[0].reference }, 'source_sha256', {
          enumerable: true,
          get: called,
        }) as AddonSourceReference,
      ),
    ).rejects.toThrow();
  if (kind === 'record-reference')
    await expect(
      inspectAddonReviewReference(
        detail,
        Object.defineProperty({ ...detail.references[0] }, 'id', {
          enumerable: true,
          get: called,
        }) as AddonRecordReference,
      ),
    ).rejects.toThrow();
  if (kind === 'coercion')
    await expect(
      readAddonReviewDesk(
        sources,
        {
          ...input,
          query: { toString: called },
        } as unknown as AddonReviewInput,
        gate,
      ),
    ).rejects.toThrow();
  if (kind === 'toJSON') {
    Object.assign(sources.entries[0].issued, { toJSON: called });
    await expect(readAddonReviewDesk(sources, input, gate)).rejects.toThrow();
  }
  expect(called).not.toHaveBeenCalled();
});
it('stable references ignore key insertion order while preserving exact values', async () => {
  const { view } = await detailed(),
    ref = Object.fromEntries(
      Object.entries(view.rows[0].reference).reverse(),
    ) as unknown as AddonSourceReference,
    detail = await inspectAddonReviewSource(view, ref),
    record = Object.fromEntries(
      Object.entries(detail.references[0]).reverse(),
    ) as unknown as AddonRecordReference;
  expect((await inspectAddonReviewReference(detail, record)).reference).toEqual(
    detail.references[0],
  );
});
