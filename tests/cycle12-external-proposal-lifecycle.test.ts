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
  prepareSyncReviewHandoff,
  readSyncAdmissionSource,
  reviewSyncAdmission,
  syncSourceReference,
} from '../src/lib/workflows/sync-admission-review';
import {
  readExternalProposalSource,
  externalProposalReferences,
  reviewExternalProposalLifecycle,
  externalProposalState,
  cancelExternalProposal,
  revokeExternalProposal,
  prepareExternalProposalHandoff,
  inspectExternalProposalLifecycle,
  selectExternalProposalJob,
  type ExternalProposalInput,
  type ExternalWorkflowReference,
} from '../src/lib/workflows/external-proposal-lifecycle';
import { ExternalProposalLifecycle } from '../src/components/workflows/ExternalProposalLifecycle';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(
  index = 0,
  kind: AdvancedHandoffInput['kind'] = 'offline',
) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    handoff: AdvancedHandoffInput = {
      job_id: sources.entries[0].target.job_id!,
      kind,
      note: 'Literal staff source review; no external execution.',
      review_on: '2026-12-28',
      manual_priority: 'normal',
      edition: 'property_services',
    },
    source = await readExternalProposalSource(sources, handoff, gate),
    refs = externalProposalReferences(source),
    input: ExternalProposalInput = {
      proposal: {
        external_reference: 'local-proposal-001',
        source: refs.source,
      },
      workflow: refs.workflow,
      review_expires_at_ms: 2000,
    },
    clock = { now_ms: 1000 };
  return { sources, gate, handoff, source, input, clock };
}
async function reviewed(
  index = 0,
  kind: AdvancedHandoffInput['kind'] = 'offline',
) {
  const f = await fixture(index, kind),
    view = await reviewExternalProposalLifecycle(f.source, f.input, f.clock);
  return {
    ...f,
    view,
    confirmation: {
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
it.each([0, 1, 2])(
  'brand %i uses all seven original engines, actual source/workflow revisions and original C11 holds without business effects',
  async (index) => {
    const f = await fixture(index),
      { sources, gate } = f,
      before = sources.property.read(sources.company.id),
      releases = sources.entries.map((e) => e.release.read('staff')),
      bundles = await Promise.all(
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
        vi.spyOn(sources.property, 'saveVisit'),
        vi.spyOn(sources.property, 'publish'),
        ...sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ];
    for (const kind of advancedHandoffKinds) {
      const handoff = { ...f.handoff, kind },
        source =
          kind === 'offline'
            ? f.source
            : await readExternalProposalSource(sources, handoff, gate),
        refs = externalProposalReferences(source),
        input = {
          proposal: {
            external_reference: 'all-modes-original-source',
            source: refs.source,
          },
          workflow: refs.workflow,
          review_expires_at_ms: 2000,
        },
        clock = { now_ms: 1000 },
        view = await reviewExternalProposalLifecycle(source, input, clock);
      expect(view.kind).toBe(kind);
      expect(view.comparison.source).toEqual(refs.source);
      expect(
        view.comparison.differences.every((d) => d.status === 'MATCH'),
      ).toBe(true);
      expect(view.workflow_differences).toHaveLength(6);
      expect(view.workflow_differences.every((d) => d.status === 'MATCH')).toBe(
        true,
      );
      expect(view).toMatchObject({
        reference_status: 'EXACT_SOURCE_AND_WORKFLOW_REVIEW_ONLY',
        operational_ready: false,
        clock_authority: 'EXPLICIT_TRUSTED_SYNTHETIC_TEST_TIME_NOT_OPERATIONAL',
        persistence: 'SAME_TAB_REVIEW_CONTROL_ONLY',
      });
      expect(Object.values(view.authority).every((v) => v === false)).toBe(
        true,
      );
      const fixed = JSON.stringify(view),
        first = externalProposalState(view),
        packet = await prepareExternalProposalHandoff(view, {
          confirmed: true,
          reviewed_lifecycle_sha256: view.integrity.sha256,
        });
      expect(first.status).toBe('REVIEWED');
      expect(first.events).toHaveLength(2);
      expect(packet.original_handoff.comparison).toBe(view.comparison);
      expect(
        packet.original_handoff.existing_handoff.requirements.source
          .issued_version_id,
      ).toBe(source.source.issued_version_id);
      expect(
        packet.original_handoff.existing_handoff.canonical_reference.engine,
      ).toBe(
        kind === 'trade'
          ? 'EXISTING_TRADE_EDITION_ENGINE'
          : 'EXISTING_OPERATING_ADDON_ENGINE',
      );
      expect((await inspectExternalProposalLifecycle(view)).status).toBe(
        'PREPARED',
      );
      expect(selectExternalProposalJob(view)).toBe(f.handoff.job_id);
      expect(JSON.stringify(view)).toBe(fixed);
      expect(Object.isFrozen(view.workflow_differences)).toBe(true);
      expect(first.events).toHaveLength(2); // Later control transitions never mutate a prior state snapshot.
      expect(JSON.stringify(packet)).not.toMatch(
        /PRIVATE|unit_cost_minor|supplier_cost|payroll|margin_bps|hourly_rate_minor|internal_notes|staff_type/,
      );
      const evidence = packet.original_handoff.existing_handoff.evidence;
      if (kind === 'offline')
        expect(
          evidence.facts.find((f) => f.label === 'Actual availability')?.value,
        ).toBe('UNKNOWN');
      if (kind === 'voice')
        expect(
          evidence.facts.find((f) => f.label === 'Recognition')?.value,
        ).toBe('NONE');
      if (kind === 'accounting')
        expect(
          evidence.facts.find((f) => f.label === 'Overall invoice readiness')
            ?.value,
        ).toBe('NO_GO');
      if (kind === 'procurement')
        expect(view.catalog_links.state).toBe(
          'MISSING_RECORDED_CATALOG_ASSOCIATION',
        );
      if (kind === 'receptionist')
        expect(
          evidence.facts.find((f) => f.label === 'purpose_consent')?.value,
        ).toBe('UNVERIFIED');
      if (kind === 'storm_network')
        expect(
          evidence.facts.find((f) => f.label === 'Incident reported on')?.value,
        ).toBeNull();
      if (kind === 'trade')
        expect(evidence.facts.find((f) => f.label === 'Licensing')?.value).toBe(
          'UNVERIFIED',
        );
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
    ).toEqual(bundles);
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);
it.each(advancedHandoffKinds)(
  'mode %s expires at the reviewer deadline without renewal by new source/view/label/clock',
  async (kind) => {
    const { sources, gate, handoff, source, input, clock, view, confirmation } =
        await reviewed(0, kind),
      original = JSON.stringify(view);
    clock.now_ms = 2000;
    expect(externalProposalState(view).status).toBe('EXPIRED');
    await expect(
      prepareExternalProposalHandoff(view, confirmation),
    ).rejects.toThrow(/unexpired/);
    const fresh = await readExternalProposalSource(
      { ...sources, entries: [...sources.entries] },
      { ...handoff },
      gate,
    );
    await expect(
      reviewExternalProposalLifecycle(
        fresh,
        {
          ...input,
          proposal: { ...input.proposal, external_reference: 'new-label' },
          review_expires_at_ms: 9999,
        },
        { now_ms: 1000 },
      ),
    ).rejects.toThrow(/no new view/);
    await expect(
      reviewExternalProposalLifecycle(source, input, { now_ms: 1000 }),
    ).rejects.toThrow(/exact read only/);
    expect(JSON.stringify(view)).toBe(original);
    clock.now_ms = 1000;
    expect((await inspectExternalProposalLifecycle(view)).status).toBe(
      'UNKNOWN',
    );
    clock.now_ms = 2001;
    expect((await inspectExternalProposalLifecycle(view)).status).toBe(
      'UNKNOWN',
    );
  },
);
it.each(['cancel', 'revoke'] as const)(
  '%s withdraws local review while preserving immutable original comparison and permanent local fence',
  async (action) => {
    const f = await reviewed(),
      before = JSON.stringify(f.view),
      first = externalProposalState(f.view),
      state = (
        action === 'cancel' ? cancelExternalProposal : revokeExternalProposal
      )(f.view, f.confirmation);
    expect(state.status).toBe(action === 'cancel' ? 'CANCELLED' : 'REVOKED');
    expect(first.events).toHaveLength(2);
    expect(state.events).toHaveLength(3);
    expect(JSON.stringify(f.view)).toBe(before);
    await expect(
      prepareExternalProposalHandoff(f.view, f.confirmation),
    ).rejects.toThrow();
    await expect(
      reviewExternalProposalLifecycle(
        f.source,
        { ...f.input, review_expires_at_ms: 3000 },
        f.clock,
      ),
    ).rejects.toThrow(/exact read only/);
  },
);
it('revocation after preparation preserves original immutable evidence and consumes no new handoff', async () => {
  const f = await reviewed(),
    packet = await prepareExternalProposalHandoff(f.view, f.confirmation),
    old = JSON.stringify(packet);
  expect(revokeExternalProposal(f.view, f.confirmation).status).toBe('REVOKED');
  expect((await inspectExternalProposalLifecycle(f.view)).status).toBe(
    'REVOKED',
  );
  expect(JSON.stringify(packet)).toBe(old);
  await expect(
    prepareExternalProposalHandoff(f.view, f.confirmation),
  ).rejects.toThrow();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'estimate_id',
  'issued_version_id',
  'source_sha256',
  'saved_lock_revision',
] as const)(
  'conflicting source %s remains quarantined and cannot delegate',
  async (field) => {
    const f = await fixture();
    Object.assign(f.input.proposal.source, {
      [field]: field === 'saved_lock_revision' ? 999 : 'foreign-reference',
    });
    const view = await reviewExternalProposalLifecycle(
      f.source,
      f.input,
      f.clock,
    );
    expect(
      view.comparison.differences.find((d) => d.field === field)?.status,
    ).toBe('CONFLICT');
    expect(externalProposalState(view).status).toBe('QUARANTINED');
    await expect(
      prepareExternalProposalHandoff(view, {
        confirmed: true,
        reviewed_lifecycle_sha256: view.integrity.sha256,
      }),
    ).rejects.toThrow();
  },
);
it.each([
  'plan_id',
  'plan_revision',
  'scheduled_visit_id',
  'scheduled_visit_revision',
  'published_visit_id',
  'published_visit_revision',
] as const)(
  'compares exact proposed workflow %s separately from canonical source hash',
  async (field) => {
    const f = await fixture();
    Object.assign(f.input.workflow, {
      [field]: field.endsWith('_revision') ? 999 : 'foreign-workflow-reference',
    });
    const view = await reviewExternalProposalLifecycle(
      f.source,
      f.input,
      f.clock,
    );
    expect(view.comparison.exact_reference).toBe(true);
    expect(
      view.workflow_differences.find((d) => d.field === field)?.status,
    ).toBe('CONFLICT');
    expect(externalProposalState(view).status).toBe('QUARANTINED');
  },
);
it('explicit missing source and workflow references remain missing and quarantined', async () => {
  const f = await fixture();
  f.input.proposal.source.job_id = null;
  f.input.workflow.plan_revision = null;
  const view = await reviewExternalProposalLifecycle(
    f.source,
    f.input,
    f.clock,
  );
  expect(
    view.comparison.differences.find((d) => d.field === 'job_id')?.status,
  ).toBe('MISSING');
  expect(
    view.workflow_differences.find((d) => d.field === 'plan_revision')?.status,
  ).toBe('MISSING');
  expect(externalProposalState(view).status).toBe('QUARANTINED');
});
it('racing same-label proposals on two actual jobs retain original C11 multi-target quarantine', async () => {
  const a = await fixture(),
    second = await readExternalProposalSource(
      a.sources,
      { ...a.handoff, job_id: a.sources.entries[1].target.job_id! },
      a.gate,
    ),
    refs = externalProposalReferences(second),
    other = {
      proposal: {
        external_reference: a.input.proposal.external_reference,
        source: refs.source,
      },
      workflow: refs.workflow,
      review_expires_at_ms: 2000,
    };
  const views = await Promise.all([
    reviewExternalProposalLifecycle(a.source, a.input, a.clock),
    reviewExternalProposalLifecycle(second, other, { now_ms: 1000 }),
  ]);
  expect(views.map((v) => externalProposalState(v).status).sort()).toEqual([
    'QUARANTINED',
    'REVIEWED',
  ]);
  expect(
    views.some(
      (v) =>
        v.comparison.reference_status === 'QUARANTINED_MULTI_TARGET_REFERENCE',
    ),
  ).toBe(true);
});
it('concurrent first comparisons and competing local preparations delegate only once', async () => {
  const f = await fixture(),
    reads = await Promise.allSettled([
      reviewExternalProposalLifecycle(f.source, f.input, f.clock),
      reviewExternalProposalLifecycle(f.source, { ...f.input }, f.clock),
    ]);
  expect(reads.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const view = (
      reads.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof reviewExternalProposalLifecycle>>
      >
    ).value,
    confirmation = {
      confirmed: true,
      reviewed_lifecycle_sha256: view.integrity.sha256,
    },
    results = await Promise.allSettled([
      prepareExternalProposalHandoff(view, confirmation),
      prepareExternalProposalHandoff(view, { ...confirmation }),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(externalProposalState(view).status).toBe('PREPARED');
});
it('preserves original C10 preparation hold even when another entry point prepared first', async () => {
  const f = await fixture(0, 'procurement');
  await prepareAdvancedHandoff(f.source, {
    confirmed: true,
    reviewed_requirements_sha256: f.source.integrity.sha256,
  });
  const view = await reviewExternalProposalLifecycle(
      f.source,
      f.input,
      f.clock,
    ),
    confirmation = {
      confirmed: true,
      reviewed_lifecycle_sha256: view.integrity.sha256,
    };
  await expect(
    prepareExternalProposalHandoff(view, confirmation),
  ).rejects.toThrow(/no replay/);
  expect((await inspectExternalProposalLifecycle(view)).status).toBe('UNKNOWN');
  await expect(
    prepareExternalProposalHandoff(view, confirmation),
  ).rejects.toThrow(/UNKNOWN/);
});
it('separate confirmation must match before consuming the original hold', async () => {
  const f = await reviewed();
  await expect(
    prepareExternalProposalHandoff(f.view, {
      ...f.confirmation,
      confirmed: false,
    }),
  ).rejects.toThrow(/confirmation/);
  await expect(
    prepareExternalProposalHandoff(f.view, {
      ...f.confirmation,
      reviewed_lifecycle_sha256: '0'.repeat(64),
    }),
  ).rejects.toThrow(/confirmation/);
  expect(externalProposalState(f.view).status).toBe('REVIEWED');
  expect(
    (await prepareExternalProposalHandoff(f.view, f.confirmation)).delivery,
  ).toBe('NOT_SENT');
});
it.each(['cancel', 'revoke', 'expiry', 'confirmation', 'source'] as const)(
  '%s during original preparation final await withdraws delegation without replay',
  async (change) => {
    const f = await reviewed(),
      reached = digestChange('LOCAL_EXTERNAL_PROPOSAL_ORIGINAL_HANDOFF', () => {
        if (change === 'cancel')
          cancelExternalProposal(f.view, { ...f.confirmation });
        if (change === 'revoke')
          revokeExternalProposal(f.view, { ...f.confirmation });
        if (change === 'expiry') f.clock.now_ms = 2000;
        if (change === 'confirmation') f.confirmation.confirmed = false;
        if (change === 'source') f.sources.entries = [...f.sources.entries];
      });
    await expect(
      prepareExternalProposalHandoff(f.view, f.confirmation),
    ).rejects.toThrow();
    reached();
    await expect(
      prepareExternalProposalHandoff(f.view, {
        ...f.confirmation,
        confirmed: true,
      }),
    ).rejects.toThrow();
    const old = await readSyncAdmissionSource(
      f.sources,
      { ...f.handoff },
      f.gate,
    ).catch(() => null);
    if (old) {
      const comparison = await reviewSyncAdmission(old, {
        external_reference: 'fresh-label-cannot-replay',
        source: syncSourceReference(old),
      });
      await expect(
        prepareSyncReviewHandoff(comparison, {
          confirmed: true,
          reviewed_comparison_sha256: comparison.integrity.sha256,
        }),
      ).rejects.toThrow(/no replay/);
    }
  },
);
it.each([
  'proposal',
  'workflow',
  'expiry',
  'clock',
  'gate',
  'model',
  'repository',
  'source-root',
  'member',
] as const)(
  'rechecks original %s after final lifecycle comparison await',
  async (change) => {
    const f = await fixture(),
      reached = digestChange('LOCAL_EXTERNAL_PROPOSAL_LIFECYCLE', async () => {
        if (change === 'proposal')
          f.input.proposal.external_reference = 'changed';
        if (change === 'workflow') f.input.workflow.plan_revision = 999;
        if (change === 'expiry') f.input.review_expires_at_ms++;
        if (change === 'clock') f.clock.now_ms = 2000;
        if (change === 'gate') f.gate.confirmed = false;
        if (change === 'model') f.sources.entries[0].customerModel.logout();
        if (change === 'repository')
          f.sources.estimates = new Phase3Repository(f.sources.operations);
        if (change === 'source-root')
          f.sources.entries = [...f.sources.entries];
        if (change === 'member') {
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
      reviewExternalProposalLifecycle(f.source, f.input, f.clock),
    ).rejects.toThrow();
    reached();
  },
);
it('pins same-model context before the source reader final await', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[0], gate),
    input: AdvancedHandoffInput = {
      job_id: sources.entries[0].target.job_id!,
      kind: 'offline',
      note: 'Literal source review',
      review_on: '2026-12-28',
      manual_priority: 'normal',
      edition: 'property_services',
    },
    reached = digestChange('LOCAL_ADVANCED_HANDOFF_REQUIREMENTS', () =>
      sources.entries[0].customerModel.logout(),
    );
  await expect(
    readExternalProposalSource(sources, input, gate),
  ).rejects.toThrow();
  reached();
});
it.each(['input', 'clock', 'gate', 'model', 'workflow'] as const)(
  'render-time %s change withholds evidence and remains terminal after restoration',
  async (change) => {
    const f = await reviewed();
    if (change === 'input') f.input.proposal.source.source_sha256 = 'changed';
    if (change === 'clock') f.clock.now_ms = 999;
    if (change === 'gate') f.gate.confirmed = false;
    if (change === 'model') f.sources.entries[0].customerModel.logout();
    if (change === 'workflow') {
      const visit = f.sources.property
        .read(f.sources.company.id)
        .visits.find((v) => v.id === f.sources.entries[0].scheduled_visit_id)!;
      f.sources.property.saveVisit(f.sources.company.id, visit, {
        ...visit.content,
        summary: 'Changed recorded workflow revision.',
      });
    }
    expect(() => externalProposalState(f.view)).toThrow();
    f.clock.now_ms = 1000;
    f.gate.confirmed = true;
    expect((await inspectExternalProposalLifecycle(f.view)).status).toBe(
      'UNKNOWN',
    );
    expect(() => selectExternalProposalJob(f.view)).toThrow();
  },
);
it('equal-context model replacement and copied lifecycle/source objects cannot restore control', async () => {
  const f = await reviewed(),
    replacement = new CustomerPortalPreviewModel(
      f.sources.company,
      f.sources.property,
    );
  expect(() =>
    externalProposalReferences(JSON.parse(JSON.stringify(f.source))),
  ).toThrow(/retained/);
  expect(() =>
    externalProposalState(JSON.parse(JSON.stringify(f.view))),
  ).toThrow(/retained/);
  await expect(
    prepareExternalProposalHandoff(
      JSON.parse(JSON.stringify(f.view)),
      f.confirmation,
    ),
  ).rejects.toThrow(/retained/);
  replacement.admitLocalJourney(f.sources.entries[0].target, f.gate);
  f.sources.entries[0].customerModel = replacement;
  expect((await inspectExternalProposalLifecycle(f.view)).status).toBe(
    'UNKNOWN',
  );
});
it('original delegation confirmation is checked again on later render/inspection', async () => {
  const f = await reviewed();
  await prepareExternalProposalHandoff(f.view, f.confirmation);
  f.confirmation.confirmed = false;
  expect(() => externalProposalState(f.view)).toThrow();
  f.confirmation.confirmed = true;
  expect((await inspectExternalProposalLifecycle(f.view)).status).toBe(
    'UNKNOWN',
  );
});
it('lost final acknowledgment consumes the original C11 hold and new labels cannot replay', async () => {
  const f = await reviewed(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let reached = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args),
      body = JSON.parse(new TextDecoder().decode(args[1] as ArrayBuffer));
    if (body.mode === 'LOCAL_EXTERNAL_PROPOSAL_ORIGINAL_HANDOFF') {
      reached = true;
      throw Error('Lost local acknowledgment');
    }
    return result;
  });
  await expect(
    prepareExternalProposalHandoff(f.view, f.confirmation),
  ).rejects.toThrow();
  expect(reached).toBe(true);
  expect((await inspectExternalProposalLifecycle(f.view)).status).toBe(
    'UNKNOWN',
  );
  await expect(
    reviewExternalProposalLifecycle(
      f.source,
      {
        ...f.input,
        proposal: { ...f.input.proposal, external_reference: 'replacement' },
      },
      f.clock,
    ),
  ).rejects.toThrow(/exact read only/);
});
it.each([0, -1, 1000, 86_401_001, NaN, Infinity])(
  'rejects invalid reviewer expiry %s before reserving a local comparison',
  async (expiry) => {
    const f = await fixture();
    await expect(
      reviewExternalProposalLifecycle(
        f.source,
        { ...f.input, review_expires_at_ms: expiry },
        f.clock,
      ),
    ).rejects.toThrow();
    expect(
      (await reviewExternalProposalLifecycle(f.source, f.input, f.clock))
        .reference_status,
    ).toBe('EXACT_SOURCE_AND_WORKFLOW_REVIEW_ONLY');
  },
);
it('OFF rejects before source/input getters and UI production/HTTP/loopback checks precede source reads', async () => {
  const getter = vi.fn(() => {
      throw Error('must not run');
    }),
    sources = Object.defineProperty({}, 'company', {
      get: getter,
    }) as OperatingSources,
    input = Object.defineProperty({}, 'note', {
      get: getter,
    }) as AdvancedHandoffInput;
  await expect(readExternalProposalSource(sources, input)).rejects.toThrow(
    /OFF/,
  );
  expect(
    renderToStaticMarkup(createElement(ExternalProposalLifecycle, { sources })),
  ).toContain('External proposal lifecycle is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['production', 'https', 'remote'] as const)(
  'UI %s gate denies before source getters',
  (kind) => {
    vi.stubGlobal('window', {
      location: {
        hostname: kind === 'remote' ? 'example.invalid' : 'localhost',
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
    expect(
      renderToStaticMarkup(
        createElement(ExternalProposalLifecycle, { sources, enabled: true }),
      ),
    ).toContain('External proposal lifecycle is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i renders scoped source/mode controls without automatic review',
  async (i) => {
    const f = await fixture(i);
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(ExternalProposalLifecycle, {
        sources: f.sources,
        enabled: true,
      }),
    );
    expect(html).toContain('aria-label="External proposal lifecycle"');
    expect(html).toContain('Read exact proposal source');
    expect(html).toContain('Voice-to-Estimate');
    expect(html).toContain('Trade edition context');
    expect(html).not.toContain(f.source.source.source_sha256);
  },
);
it.each(['proposal', 'workflow', 'clock', 'source'] as const)(
  'rejects %s accessors without invoking getters',
  async (kind) => {
    const f = await fixture(),
      getter = vi.fn(() => '');
    if (kind === 'proposal')
      Object.defineProperty(f.input.proposal, 'external_reference', {
        enumerable: true,
        get: getter,
      });
    if (kind === 'workflow')
      Object.defineProperty(f.input.workflow, 'plan_revision', {
        enumerable: true,
        get: getter,
      });
    if (kind === 'clock')
      Object.defineProperty(f.clock, 'now_ms', {
        enumerable: true,
        get: getter,
      });
    if (kind === 'source') {
      await expect(
        readExternalProposalSource(
          Object.defineProperty({ ...f.sources }, 'company', {
            enumerable: true,
            get: getter,
          }),
          f.handoff,
          f.gate,
        ),
      ).rejects.toThrow();
    } else
      await expect(
        reviewExternalProposalLifecycle(f.source, f.input, f.clock),
      ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);
it('rejects proposal toJSON, coercive labels and workflow serializers without invocation', async () => {
  const f = await fixture(),
    called = vi.fn(() => '');
  await expect(
    reviewExternalProposalLifecycle(
      f.source,
      {
        ...f.input,
        proposal: {
          ...f.input.proposal,
          external_reference: { toString: called },
        },
      } as unknown as ExternalProposalInput,
      f.clock,
    ),
  ).rejects.toThrow();
  await expect(
    reviewExternalProposalLifecycle(
      f.source,
      { ...f.input, toJSON: called } as ExternalProposalInput,
      f.clock,
    ),
  ).rejects.toThrow();
  await expect(
    reviewExternalProposalLifecycle(
      f.source,
      {
        ...f.input,
        workflow: {
          ...f.input.workflow,
          toJSON: called,
        } as ExternalWorkflowReference,
      },
      f.clock,
    ),
  ).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
});
