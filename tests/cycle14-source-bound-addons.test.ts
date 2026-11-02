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
  type AdvancedHandoffInput,
} from '../src/lib/workflows/advanced-handoffs';
import {
  readAddonReviewDesk,
  inspectAddonReviewSource,
  type AddonReviewDetail,
} from '../src/lib/workflows/addon-review-desk';
import {
  readExternalProposalSource,
  externalProposalReferences,
  reviewExternalProposalLifecycle,
  externalProposalState,
} from '../src/lib/workflows/external-proposal-lifecycle';
import {
  SourceBoundAddonEntry,
  SourceBoundAddons,
} from '../src/components/workflows/SourceBoundAddons';
import {
  readSourceBoundAddons,
  assertSourceBoundAddonsCurrentNow,
  reviewSourceBoundAddons,
  sourceBoundAddonsState,
  prepareSourceBoundAddons,
  cancelSourceBoundAddons,
  revokeSourceBoundAddons,
  inspectSourceBoundAddons,
  selectSourceBoundAddonJob,
  type SourceBoundReviewConfirmation,
} from '../src/lib/workflows/source-bound-addons';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(
  index = 0,
  kind: AdvancedHandoffInput['kind'] = 'offline',
  entryIndex = 0,
) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    input = {
      query: '',
      job_id: sources.entries[entryIndex].target.job_id!,
      kind,
      edition: 'property_services' as const,
    },
    desk = await readAddonReviewDesk(sources, input, gate),
    selection = await inspectAddonReviewSource(desk, desk.rows[0].reference);
  return { sources, gate, input, selection };
}
async function pinned(
  index = 0,
  kind: AdvancedHandoffInput['kind'] = 'offline',
) {
  const f = await fixture(index, kind),
    read = await readSourceBoundAddons(f.sources, f.selection, f.gate),
    confirmation: SourceBoundReviewConfirmation = {
      confirmed: true,
      reviewed_source_sha256: read.integrity.sha256,
      external_reference: 'pin-001',
      review_expires_at_ms: 2000,
    },
    clock = { now_ms: 1000 };
  return { ...f, read, confirmation, clock };
}
async function reviewed(kind: AdvancedHandoffInput['kind'] = 'offline') {
  const f = await pinned(0, kind),
    view = await reviewSourceBoundAddons(f.read, f.confirmation, f.clock);
  return {
    ...f,
    view,
    prepare: {
      confirmed: true,
      reviewed_lifecycle_sha256: view.integrity.sha256,
    },
  };
}
function digestChange(mode: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (!fired && body.mode === mode) {
      fired = true;
      await change();
    }
    return result;
  });
  return () => expect(fired).toBe(true);
}
for (const index of [0, 1, 2])
  for (const kind of advancedHandoffKinds)
    it(`brand ${index} ${kind} preserves the inspected pin and delegates to unchanged original engine without business effects`, async () => {
      const { sources, gate, selection } = await fixture(index, kind),
        before = sources.property.read(sources.company.id),
        releases = sources.entries.map((e) => e.release.read('staff')),
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
      const read = await readSourceBoundAddons(sources, selection, gate);
      expect(ids).not.toHaveBeenCalled();
      expect(read.source).toEqual(selection.reference);
      expect(read.edition).toEqual(selection.edition);
      expect(read.report).toEqual(selection.report);
      expect(read.references).toEqual(selection.source_references);
      expect(sourceBoundAddonsState(read).status).toBe('PINNED_NOT_REVIEWED');
      expect(selectSourceBoundAddonJob(read)).toBe(selection.reference.job_id);
      const view = await reviewSourceBoundAddons(
        read,
        {
          confirmed: true,
          reviewed_source_sha256: read.integrity.sha256,
          external_reference: 'exact-source',
          review_expires_at_ms: 2000,
        },
        { now_ms: 1000 },
      );
      expect(view.comparison.source).toEqual(read.references.source);
      expect(view.kind).toBe(kind);
      expect(view.workflow_differences.every((d) => d.status === 'MATCH')).toBe(
        true,
      );
      expect(view.reference_status).toBe(
        'EXACT_SOURCE_AND_WORKFLOW_REVIEW_ONLY',
      );
      const packet = await prepareSourceBoundAddons(read, {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      });
      expect(packet.original_handoff.comparison).toBe(view.comparison);
      expect(
        packet.original_handoff.existing_handoff.requirements.source
          .issued_version_id,
      ).toBe(read.source.issued_version_id);
      expect(
        packet.original_handoff.existing_handoff.requirements.review_context
          .edition,
      ).toBe(selection.edition.human_selected_review_context);
      expect(
        packet.original_handoff.existing_handoff.canonical_reference.engine,
      ).toBe(
        kind === 'trade'
          ? 'EXISTING_TRADE_EDITION_ENGINE'
          : 'EXISTING_OPERATING_ADDON_ENGINE',
      );
      expect((await inspectSourceBoundAddons(read)).status).toBe('PREPARED');
      expect(externalProposalState(view).status).toBe('PREPARED');
      expect(packet).toMatchObject({
        imported: false,
        synchronized: false,
        operational_ready: false,
        delivery: 'NOT_SENT',
      });
      expect(Object.isFrozen(packet.original_handoff)).toBe(true);
      expect(sources.property.read(sources.company.id)).toEqual(before);
      expect(sources.entries.map((e) => e.release.read('staff'))).toEqual(
        releases,
      );
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    });
it('read-only pinning starts no original lifecycle or engine attempt', async () => {
  const { sources, gate, selection } = await fixture(),
    read = await readSourceBoundAddons(sources, selection, gate),
    entry = sources.entries.find(
      (e) => e.target.job_id === selection.reference.job_id,
    )!,
    input: AdvancedHandoffInput = {
      job_id: entry.target.job_id!,
      kind: selection.reference.kind,
      note: 'Original independently confirmed review.',
      review_on: entry.day,
      manual_priority: 'normal',
      edition: selection.edition.human_selected_review_context,
    },
    source = await readExternalProposalSource(sources, input, gate),
    refs = externalProposalReferences(source),
    view = await reviewExternalProposalLifecycle(
      source,
      {
        proposal: { external_reference: 'original-first', source: refs.source },
        workflow: refs.workflow,
        review_expires_at_ms: 2000,
      },
      { now_ms: 1000 },
    );
  expect(view.reference_status).toBe('EXACT_SOURCE_AND_WORKFLOW_REVIEW_ONLY');
  await expect(
    reviewSourceBoundAddons(
      read,
      {
        confirmed: true,
        reviewed_source_sha256: read.integrity.sha256,
        external_reference: 'cannot-reset',
        review_expires_at_ms: 2000,
      },
      { now_ms: 1000 },
    ),
  ).rejects.toThrow(/Existing lifecycle/);
});
it('same-property sibling jobs retain separate pins and immutable issued/report references', async () => {
  const { sources, gate, selection } = await fixture(),
    e = sources.entries.find(
      (e) =>
        e.target.location_id === selection.reference.location_id &&
        e.target.job_id !== selection.reference.job_id,
    )!,
    desk = await readAddonReviewDesk(
      sources,
      {
        query: '',
        job_id: e.target.job_id!,
        kind: 'offline',
        edition: 'property_services',
      },
      gate,
    ),
    other = await inspectAddonReviewSource(desk, desk.rows[0].reference),
    [a, b] = await Promise.all([
      readSourceBoundAddons(sources, selection, gate),
      readSourceBoundAddons(sources, other, gate),
    ]);
  expect(a.source.location_id).toBe(b.source.location_id);
  expect(a.source.job_id).not.toBe(b.source.job_id);
  expect(a.source.issued_version_id).not.toBe(b.source.issued_version_id);
  expect(a.report.report_id).not.toBe(b.report.report_id);
});
it.each([
  'root-copy',
  'other-root',
  'copy-selection',
  'foreign-selection',
] as const)('denies %s instead of substituting another pin', async (kind) => {
  const { sources, gate, selection } = await fixture();
  if (kind === 'root-copy')
    await expect(
      readSourceBoundAddons({ ...sources }, selection, gate),
    ).rejects.toThrow(/root/);
  if (kind === 'other-root') {
    const other = await fixture();
    await expect(
      readSourceBoundAddons(other.sources, selection, gate),
    ).rejects.toThrow();
  }
  if (kind === 'copy-selection')
    await expect(
      readSourceBoundAddons(
        sources,
        JSON.parse(JSON.stringify(selection)),
        gate,
      ),
    ).rejects.toThrow(/retained/);
  if (kind === 'foreign-selection') {
    const other = await fixture(1);
    await expect(
      readSourceBoundAddons(sources, other.selection, gate),
    ).rejects.toThrow();
  }
});
it.each([
  'confirmation',
  'hash',
  'label',
  'deadline',
  'extra',
  'getter',
] as const)(
  'requires explicit valid %s before original review',
  async (kind) => {
    const { read, confirmation, clock } = await pinned(),
      called = vi.fn(() => true),
      bad = { ...confirmation };
    if (kind === 'confirmation') bad.confirmed = false;
    if (kind === 'hash') bad.reviewed_source_sha256 = 'a'.repeat(64);
    if (kind === 'label') bad.external_reference = '<script>';
    if (kind === 'deadline') bad.review_expires_at_ms = NaN;
    if (kind === 'extra') Object.assign(bad, { toJSON: called });
    if (kind === 'getter')
      Object.defineProperty(bad, 'confirmed', {
        enumerable: true,
        get: called,
      });
    await expect(reviewSourceBoundAddons(read, bad, clock)).rejects.toThrow();
    expect(called).not.toHaveBeenCalled();
    expect(sourceBoundAddonsState(read).status).toBe('PINNED_NOT_REVIEWED');
  },
);
for (const kind of advancedHandoffKinds)
  for (const action of ['expired', 'cancelled', 'revoked'] as const)
    it(`${kind} original ${action} hold cannot be replaced through fresh pin or label`, async () => {
      const f = await reviewed(kind),
        originalSnapshot = JSON.stringify(f.view);
      if (action === 'expired') f.clock.now_ms = 2000;
      else if (action === 'cancelled')
        cancelSourceBoundAddons(f.read, f.prepare);
      else revokeSourceBoundAddons(f.read, f.prepare);
      expect(sourceBoundAddonsState(f.read).status).toBe(action.toUpperCase());
      expect(JSON.stringify(f.view)).toBe(originalSnapshot);
      const next = await readSourceBoundAddons(f.sources, f.selection, f.gate);
      await expect(
        reviewSourceBoundAddons(
          next,
          {
            ...f.confirmation,
            reviewed_source_sha256: next.integrity.sha256,
            external_reference: 'new-label',
            review_expires_at_ms: 4000,
          },
          { now_ms: 3000 },
        ),
      ).rejects.toThrow(/Existing lifecycle/);
      await expect(
        prepareSourceBoundAddons(f.read, f.prepare),
      ).rejects.toThrow();
    });
it.each(['comparison', 'handoff'] as const)(
  'lost original %s ACK stays UNKNOWN across fresh pin/source view/mode/job',
  async (stage) => {
    const f = await pinned();
    let view: Awaited<ReturnType<typeof reviewSourceBoundAddons>> | undefined;
    if (stage === 'handoff')
      view = await reviewSourceBoundAddons(f.read, f.confirmation, f.clock);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let fired = false;
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const result = await digest(...args),
          body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
        if (
          !fired &&
          body.mode ===
            (stage === 'comparison'
              ? 'LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE'
              : 'IMMUTABLE_ADVANCED_REVIEW_HANDOFF')
        ) {
          fired = true;
          throw Error('lost original ACK');
        }
        return result;
      });
    if (stage === 'comparison')
      await expect(
        reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
      ).rejects.toThrow();
    else
      await expect(
        prepareSourceBoundAddons(f.read, {
          confirmed: true,
          reviewed_lifecycle_sha256: view!.integrity.sha256,
        }),
      ).rejects.toThrow();
    expect(fired).toBe(true);
    spy.mockRestore();
    expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
    const d = await readAddonReviewDesk(
        f.sources,
        {
          query: '',
          job_id: f.selection.reference.job_id,
          kind: f.selection.reference.kind,
          edition: f.selection.edition.human_selected_review_context,
        },
        f.gate,
      ),
      selection = await inspectAddonReviewSource(d, d.rows[0].reference),
      fresh = await readSourceBoundAddons(f.sources, selection, f.gate);
    await readAddonReviewDesk(
      f.sources,
      { query: '', job_id: '', kind: 'voice', edition: 'roofing' },
      f.gate,
    );
    await expect(
      reviewSourceBoundAddons(
        fresh,
        {
          ...f.confirmation,
          reviewed_source_sha256: fresh.integrity.sha256,
          external_reference: 'fresh-view',
        },
        f.clock,
      ),
    ).rejects.toThrow(/Existing lifecycle/);
  },
);
it('concurrent fresh pins preserve the single original same-repository/job/mode reservation', async () => {
  const f = await pinned(),
    other = await readSourceBoundAddons(f.sources, f.selection, f.gate),
    results = await Promise.allSettled([
      reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
      reviewSourceBoundAddons(
        other,
        {
          ...f.confirmation,
          reviewed_source_sha256: other.integrity.sha256,
          external_reference: 'concurrent',
        },
        f.clock,
      ),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
});
it.each(['gate', 'model', 'root', 'source', 'member'] as const)(
  'last pin hash rechecks %s',
  async (kind) => {
    const f = await fixture(),
      reached = digestChange('LOCAL_SOURCE_BOUND_ADVANCED_REVIEW', async () => {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'model') f.sources.entries[0].customerModel.logout();
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
        if (kind === 'source')
          await f.sources.estimates.revise(
            f.sources.company.id,
            f.sources.entries[0].issued,
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
            f.sources.entries[0].target.actor_id,
          );
        }
      });
    await expect(
      readSourceBoundAddons(f.sources, f.selection, f.gate),
    ).rejects.toThrow();
    reached();
  },
);
it.each(['confirmed', 'hash', 'expiry', 'gate', 'member', 'clock'] as const)(
  'original comparison final await rechecks %s without reset',
  async (kind) => {
    const f = await pinned(),
      reached = digestChange('LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE', async () => {
        if (kind === 'confirmed') f.confirmation.confirmed = false;
        if (kind === 'hash')
          f.confirmation.reviewed_source_sha256 = 'a'.repeat(64);
        if (kind === 'expiry') f.confirmation.review_expires_at_ms = 4000;
        if (kind === 'gate') f.gate.enabled = false;
        if (kind === 'clock') f.clock.now_ms = 2000;
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
            f.sources.entries[0].target.actor_id,
          );
        }
      });
    await expect(
      reviewSourceBoundAddons(f.read, f.confirmation, f.clock),
    ).rejects.toThrow();
    reached();
    expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
  },
);
it('original preparation final await checks exact live confirmation and retains immutable comparison', async () => {
  const f = await reviewed(),
    snapshot = JSON.stringify(f.view),
    reached = digestChange('LOCAL_EXTERNAL_PROPOSAL_ORIGINAL_HANDOFF', () => {
      f.prepare.confirmed = false;
    });
  await expect(prepareSourceBoundAddons(f.read, f.prepare)).rejects.toThrow();
  reached();
  expect(JSON.stringify(f.view)).toBe(snapshot);
  expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
});
it.each(['model', 'repository', 'logout', 'revocation', 'gate'] as const)(
  'render/navigation reject %s change and restoration cannot revive retained evidence',
  async (kind) => {
    const f = await pinned(),
      e = f.sources.entries[0];
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
    if (kind === 'logout') e.customerModel.logout();
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'revocation') {
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
    expect(() => assertSourceBoundAddonsCurrentNow(f.read)).toThrow();
    f.gate.confirmed = true;
    expect(() => selectSourceBoundAddonJob(f.read)).toThrow(/UNKNOWN/);
    expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
  },
);
it('copies cannot replay retained pin/view authority', async () => {
  const f = await pinned(),
    copy = JSON.parse(JSON.stringify(f.read));
  await expect(
    reviewSourceBoundAddons(copy, f.confirmation, f.clock),
  ).rejects.toThrow(/retained/);
  expect(() => selectSourceBoundAddonJob(copy)).toThrow(/retained/);
  expect((await inspectSourceBoundAddons(copy)).status).toBe('UNKNOWN');
});
it('allowlisted pin and original handoff exclude private rates/costs/workforce/notes/other customer', async () => {
  const f = await reviewed(),
    packet = await prepareSourceBoundAddons(f.read, f.prepare),
    text = JSON.stringify({ read: f.read, packet });
  for (const term of [
    'PRIVATE',
    'unit_cost_minor',
    'supplier_cost',
    'hourly_rate_minor',
    'worker_id',
    'actor_id',
    'internal_notes',
    'payroll',
    f.sources.entries[1].target.customer_id,
    f.sources.entries[1].report_id,
  ])
    expect(text).not.toContain(term);
});
it('clock rollback remains original UNKNOWN and exact inspection cannot renew it', async () => {
  const f = await reviewed();
  f.clock.now_ms = 500;
  expect(() => sourceBoundAddonsState(f.read)).toThrow();
  f.clock.now_ms = 1000;
  expect((await inspectSourceBoundAddons(f.read)).status).toBe('UNKNOWN');
  await expect(prepareSourceBoundAddons(f.read, f.prepare)).rejects.toThrow();
});
it('default OFF precedes source and selection getters/serialization', async () => {
  const getter = vi.fn(() => {
      throw Error('must not run');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources,
    selection = Object.defineProperty({}, 'reference', {
      get: getter,
    }) as AddonReviewDetail;
  await expect(readSourceBoundAddons(sources, selection)).rejects.toThrow(
    /OFF/,
  );
  expect(
    renderToStaticMarkup(createElement(SourceBoundAddonEntry, { sources })),
  ).toContain('Source-bound advanced entry is off');
  expect(
    renderToStaticMarkup(
      createElement(SourceBoundAddons, { sources, selection }),
    ),
  ).toContain('Pinned advanced workflow is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote', 'disabled'] as const)(
  'entry and pin UI %s admission precede getters',
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
      }) as OperatingSources,
      selection = Object.defineProperty({}, 'reference', {
        get: getter,
      }) as AddonReviewDetail;
    for (const component of [
      createElement(SourceBoundAddonEntry, {
        sources,
        enabled: kind !== 'disabled',
      }),
      createElement(SourceBoundAddons, {
        sources,
        selection,
        enabled: kind !== 'disabled',
      }),
    ]) {
      const html = renderToStaticMarkup(component);
      expect(html).toContain(' is off');
      expect(html).not.toContain('<select');
    }
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i entry prefills supplied job and pin has no repeated target selectors',
  async (index) => {
    const f = await fixture(index, 'trade', 3);
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1', protocol: 'http:' },
    });
    const entry = renderToStaticMarkup(
        createElement(SourceBoundAddonEntry, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.selection.reference.job_id,
        }),
      ),
      pin = renderToStaticMarkup(
        createElement(SourceBoundAddons, {
          sources: f.sources,
          selection: f.selection,
          enabled: true,
        }),
      );
    expect(entry).toContain('Inspect selected advanced source');
    expect(entry).toContain(`value="${f.selection.reference.job_id}" selected`);
    expect(pin).not.toContain('<select');
    expect(pin).not.toContain('Use exact source references');
    expect(pin).not.toContain('Review this exact source;');
  },
);
