import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fork, type ChildProcess } from 'node:child_process';
import { sampleCompanies } from '../src/domain/platform';
import { verifyLedger } from '../src/domain/release/types';
import { customerPreview } from '../src/domain/estimating/customer-preview';
import { prepareAdvancedHandoff } from '../src/lib/workflows/advanced-handoffs';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  admitCrewAssignment,
  assertCrewAssignmentCurrentNow,
  type CrewAssignmentInput,
} from '../src/lib/workflows/crew-assignment-lab';
import {
  reviewScheduleProposalRevision,
  reconcileScheduleProposalRevision,
  openScheduleProposalRevisionSource,
  closeScheduleProposalRevision,
} from '../src/lib/workflows/schedule-proposal-revisions';
import {
  readFinancialEvidenceSources,
  openFinancialEvidenceSource,
  prepareFinancialEvidenceReview,
  reconcileFinancialEvidenceReview,
} from '../src/lib/workflows/financial-evidence-review';
import {
  readServiceLifecycleReview,
  openServiceLifecycleJob,
  openServiceLifecycleReport,
  selectServiceLifecycleJob,
  inspectServiceLifecycle,
} from '../src/lib/workflows/service-lifecycle-review';
import {
  readConsentCancellationSources,
  prepareConsentCancellationReview,
  assertConsentCancellationReviewNow,
  reconcileConsentCancellationReview,
  cancelConsentCancellationReview,
  openConsentCancellationSource,
} from '../src/lib/workflows/consent-cancellation-review';
import {
  readVerifiedOperatingSuggestions,
  openVerifiedSuggestionSource,
  openVerifiedSuggestionJob,
  inspectVerifiedOperatingSuggestions,
} from '../src/lib/workflows/verified-operating-suggestions';
import {
  readExternalProposalSource,
  externalProposalReferences,
  reviewExternalProposalLifecycle,
  prepareExternalProposalHandoff,
  inspectExternalProposalLifecycle,
  externalProposalState,
  revokeExternalProposal,
  selectExternalProposalJob,
} from '../src/lib/workflows/external-proposal-lifecycle';
import { ScheduleProposalRevisions } from '../src/components/workflows/ScheduleProposalRevisions';
import { FinancialEvidenceReview } from '../src/components/workflows/FinancialEvidenceReview';
import { ServiceLifecycleReview } from '../src/components/workflows/ServiceLifecycleReview';
import { ConsentCancellationReview } from '../src/components/workflows/ConsentCancellationReview';
import { VerifiedOperatingSuggestions } from '../src/components/workflows/VerifiedOperatingSuggestions';
import { ExternalProposalLifecycle } from '../src/components/workflows/ExternalProposalLifecycle';
import {
  executeCrewTransaction,
  type CrewLabCommand,
} from '../server/field-lab/crew-transaction';
import {
  executeScheduleRevision,
  reconcileScheduleRevision,
  type ScheduleRevisionCommand,
  type ScheduleRevisionAuthority,
} from '../server/field-lab/proposal-revisions';
import {
  changeSyntheticConsent,
  type SyntheticConsentFacts,
} from '../server/consent-lab/atomic-boundary';
import {
  installConsentCancellationFixture,
  executeConsentCancellation,
  reconcileConsentCancellation,
  type CancellationLabCommand,
  type CancellationLabAuthority,
} from '../server/consent-lab/cancellation-review';

// Independent composition uses the actual shared source factory and original
// command/calculation engines. Neither module-specific fixture nor git history
// chooses the expected identity, arithmetic or workflow facts below.
const folders: string[] = [],
  children: ChildProcess[] = [];
beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  children.splice(0).forEach((child) => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  folders.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true }));
});
async function fixture(brand = 0, financial = false) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0];
  if (financial) {
    // Only original explicit synthetic commands produce these records. No
    // operational payment/provider fixture or fabricated operational status.
    const r = entry.release;
    await r.command('staff', 'create_contract', {
      offer_id: entry.offer_id,
      terms: 'Independent disposable synthetic contract fixture.',
      legal_reference: 'No genuine legal or customer authority.',
    });
    const contract = r.read('staff').release_contracts[0];
    await r.command('customer', 'sign_contract', {
      contract_id: contract.id,
      document_hash: contract.document_hash,
      typed_name: 'Independent synthetic fixture',
      consent: true,
    });
    await r.command('staff', 'create_invoice', { contract_id: contract.id });
    const invoice = r.read('staff').release_invoices[0],
      amount = invoice.snapshot.schedule[0].amount_minor;
    await r.command('customer', 'authorize_payment', {
      invoice_id: invoice.id,
      amount_minor: amount,
      consent: true,
    });
    const authorization = r.read('staff').release_authorizations[0];
    await r.command('staff', 'synthetic_capture', {
      invoice_id: invoice.id,
      authorization_id: authorization.id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: null,
    });
    const event = r.read('staff').release_payment_events[0];
    await r.command('staff', 'synthetic_refund', {
      invoice_id: invoice.id,
      authorization_id: authorization.id,
      amount_minor: Math.max(1, Math.floor(amount / 3)),
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: event.id,
    });
  }
  const original: CrewAssignmentInput = {
    week_start: entry.day,
    timezone: entry.timezone,
    proposal: {
      job_id: entry.target.job_id!,
      worker_id: entry.worker_id,
      source_visit_id: entry.scheduled_visit_id,
      day: entry.day,
      start: entry.day + 'T09:00',
      end: entry.day + 'T11:00',
      hours_start: entry.day + 'T08:00',
      hours_end: entry.day + 'T16:00',
    },
  };
  const proposed: CrewAssignmentInput = {
    ...original,
    proposal: {
      ...original.proposal,
      start: entry.day + 'T13:00',
      end: entry.day + 'T15:00',
    },
  };
  return {
    gate,
    sources,
    entry,
    original,
    proposed,
    field: {
      original,
      proposed,
      expected_revision: 0,
      expires_at: Date.now() + 30 * 60_000,
    },
    finance: { as_of: new Date().toISOString(), input_revision: 1 },
    customer: { query: '', location_id: '', job_id: '' },
    growth: {
      window: {
        from: '2026-12-28',
        through: '2027-01-25',
        as_of: '2026-12-28T12:00:00.000Z',
        channel: 'email' as const,
      },
      lead_days: 14,
      overdue_days: 7,
      query: '',
      kind: 'all' as const,
      readiness: 'all' as const,
      job_id: '',
      customer_id: '',
      location_id: '',
    },
    intelligence: {
      review_on: entry.day,
      timezone: entry.timezone,
      input_revision: 1,
      ordering: 'EVIDENCE_FIRST' as const,
    },
    advanced: {
      job_id: entry.target.job_id!,
      kind: 'offline' as const,
      note: 'Independent exact-source review; no external operation.',
      review_on: entry.day,
      manual_priority: 'normal' as const,
      edition: 'property_services' as const,
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function snapshot(f: Fixture) {
  return JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    canonical: f.sources.entries.map((e) =>
      f.sources.estimates.readSyntheticPrototypeSources(e.target),
    ),
    releases: f.sources.entries.map((e) => e.release.read('staff')),
  });
}
const reads = {
  field: (f: Fixture) =>
    reviewScheduleProposalRevision(f.sources, f.field, f.gate),
  finance: (f: Fixture) =>
    readFinancialEvidenceSources(f.sources, f.finance, f.gate),
  customer: (f: Fixture) =>
    readServiceLifecycleReview(f.sources, f.customer, f.gate),
  growth: (f: Fixture) =>
    readConsentCancellationSources(f.sources, f.growth, f.gate),
  intelligence: (f: Fixture) =>
    readVerifiedOperatingSuggestions(f.sources, f.intelligence, f.gate),
  advanced: (f: Fixture) =>
    readExternalProposalSource(f.sources, f.advanced, f.gate),
};
async function views(f: Fixture) {
  const [field, finance, customer, growth, intelligence, advanced] =
    await Promise.all([
      reads.field(f),
      reads.finance(f),
      reads.customer(f),
      reads.growth(f),
      reads.intelligence(f),
      reads.advanced(f),
    ]);
  return { field, finance, customer, growth, intelligence, advanced };
}
type Views = Awaited<ReturnType<typeof views>>;
async function proposals(f: Fixture, v: Views) {
  const detail = openFinancialEvidenceSource(
    v.finance,
    v.finance.correction.baseline.queue.find(
      (x) => x.job_id === f.entry.target.job_id,
    )!.id,
  );
  const finance = await prepareFinancialEvidenceReview(detail, {
    remaining: {
      ...detail.correction.before.remaining,
      other: detail.correction.before.remaining.other + 241,
    },
    reason: 'Independent review of unsaved remaining-cost scenario.',
    confirmed: true,
    excludes_unpaid_commitments: true,
    source_sha256: detail.correction.source_sha256,
    input_revision: 2,
  });
  const candidate = v.growth.candidates[0],
    growthInput = {
      proposal: {
        candidate_key: candidate.key,
        proposed_on: candidate.selection.due_on,
        purpose: 'service_follow_up' as const,
        plan_kind: 'follow_up' as const,
      },
      expires_at: f.field.expires_at,
    },
    growth = await prepareConsentCancellationReview(
      v.growth,
      growthInput,
      f.gate,
    );
  const refs = externalProposalReferences(v.advanced),
    advancedInput = {
      proposal: {
        external_reference: 'independent-cycle12-source',
        source: refs.source,
      },
      workflow: refs.workflow,
      review_expires_at_ms: 2000,
    },
    clock = { now_ms: 1000 },
    advanced = await reviewExternalProposalLifecycle(
      v.advanced,
      advancedInput,
      clock,
    );
  return { finance, growth, growthInput, advanced, advancedInput, clock };
}
type Proposals = Awaited<ReturnType<typeof proposals>>;

it.each([0, 1, 2])(
  'brand %i composes all six exact source reviews, original canonical engines and strict customer proof requirements without effects',
  async (brand) => {
    const f = await fixture(brand, true),
      before = snapshot(f),
      network = vi.spyOn(globalThis, 'fetch'),
      writers = [
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'approveJob'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'projection'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      v = await views(f),
      p = await proposals(f, v);
    expect(f.sources.entries).toHaveLength(4);
    expect(
      new Set(f.sources.entries.map((e) => e.target.customer_id)).size,
    ).toBe(3);
    expect(
      new Set(f.sources.entries.map((e) => e.target.location_id)).size,
    ).toBe(3);
    expect(new Set(f.sources.entries.map((e) => e.worker_id)).size).toBe(2);
    expect((await openScheduleProposalRevisionSource(v.field)).job_id).toBe(
      f.entry.target.job_id,
    );
    expect(v.field.actual_availability).toBe('UNKNOWN');
    expect(v.field.durable_writer).toBe('NOT_CONNECTED');
    expect(v.field.original.envelope.visit_id).toBe(f.entry.scheduled_visit_id);
    expect(v.field.original.envelope.issued_version_id).toBe(
      f.entry.target.version_id,
    );
    const raw = f.entry.release.read('staff'),
      invoice = raw.release_invoices[0],
      contract = raw.release_contracts.find(
        (c) => c.id === invoice.contract_id,
      )!,
      offer = raw.release_offers.find((o) => o.id === contract.offer_id)!,
      evidence = p.finance.canonical_before.invoices[0];
    expect(offer.id).toBe(f.entry.offer_id);
    expect(offer.version_id).toBe(f.entry.target.version_id);
    expect(contract.document.scope).toEqual({
      ...customerPreview(f.entry.release.version),
      internal_test: true,
    });
    expect(evidence).toMatchObject({
      invoice_id: invoice.id,
      contract_id: contract.id,
      offer_id: offer.id,
      issued_version_id: f.entry.target.version_id,
      linkage: 'LINKED',
      verification: 'RECONCILED_SYNTHETIC_ONLY',
    });
    expect(evidence.events.map((e) => e.id).sort()).toEqual(
      raw.release_payment_events.map((e) => e.id).sort(),
    );
    expect(evidence.ledger.map((e) => e.id).sort()).toEqual(
      raw.release_ledger_entries.map((e) => e.id).sort(),
    );
    expect(evidence.summary!.balance_minor).toBe(
      String(
        verifyLedger(
          invoice,
          raw.release_ledger_entries,
          raw.release_payment_events,
        ),
      ),
    );
    expect(p.finance.canonical_after).toEqual(p.finance.canonical_before);
    expect(
      p.finance.correction.comparison.categories.find(
        (x) => x.category === 'other',
      )!.delta_minor,
    ).toBe(241);
    expect(p.finance.canonical_after.provider.settlement).toBe('UNKNOWN');
    const first = f.entry,
      sameProperty = f.sources.entries[3];
    expect(sameProperty.target.location_id).toBe(first.target.location_id);
    expect(sameProperty.target.version_id).not.toBe(first.target.version_id);
    expect(
      v.finance.jobs.find(
        (j) => j.target.job_id === sameProperty.target.job_id,
      )!.invoices,
    ).toEqual([]);
    for (const e of [first, sameProperty]) {
      const detail = await openServiceLifecycleJob(
          v.customer,
          e.target.job_id!,
        ),
        report = detail.customer_safe.documentation.find(
          (r) => r.report.reference.report_id === e.report_id,
        )!;
      expect(selectServiceLifecycleJob(detail)).toBe(e.target.job_id);
      expect(detail.staff.provenance).toMatchObject({
        issued_version_id: e.target.version_id,
        offer_id: e.offer_id,
        receipt: { id: e.receipt_id },
      });
      expect(detail.customer_safe.scope).toMatchObject({
        job_id: e.target.job_id,
        estimate_id: e.target.estimate_id,
        issued_version_id: e.target.version_id,
      });
      expect(
        detail.customer_safe.scope.lines.every(
          (l) => l.verified_completion_match === 'UNKNOWN',
        ),
      ).toBe(true);
      expect(detail.customer_safe.required_proof.map((r) => r.kind)).toEqual([
        'SCOPE_VERIFICATION',
        'PHYSICAL_COMPLETION',
        'CUSTOMER_ACCEPTANCE',
        'WARRANTY',
      ]);
      expect(
        detail.customer_safe.required_proof.every(
          (r) => r.status === 'UNKNOWN',
        ),
      ).toBe(true);
      expect(detail.staff.workflow_facts.date_precision).toBe(
        'DATE_ONLY_AVAILABILITY_UNKNOWN',
      );
      expect(detail.staff.workflow_facts.job_workflow_status).toBe(
        'UNKNOWN_NOT_RECORDED_BY_SOURCE',
      );
      expect(
        (await openServiceLifecycleReport(detail, report.report.reference))
          .reference,
      ).toEqual(report.report.reference);
      expect(report.selected_job_association).toBe('EXACT_RECORDED_JOB_LINK');
      for (const otherReport of detail.customer_safe.documentation.filter(
        (r) => r.report.reference.report_id !== e.report_id,
      ))
        expect(otherReport.selected_job_association).toBe('UNKNOWN');
      expect(JSON.stringify(detail.customer_safe)).not.toMatch(
        /PRIVATE|unit_cost|supplier|payroll|margin|worker_id|actor_id|internal_notes|@example/,
      );
      const card = v.intelligence.cards.find(
          (c) => c.job_id === e.target.job_id && c.source.kind === 'report',
        )!,
        inspected = await openVerifiedSuggestionSource(
          v.intelligence,
          card.key,
        );
      expect(inspected.target).toEqual(e.target);
      expect(inspected.source).toMatchObject({
        id: e.report_id,
        version: e.published_version,
      });
      expect(openVerifiedSuggestionJob(inspected).target).toEqual(e.target);
      expect(card.verification.status).toBe('MATCHED_RECORDED_STATE');
      expect(
        card.verification.facts.find((x) => x.code === 'JOB_COMPLETION_STATE')!
          .value,
      ).toBeNull();
      expect(card.verification.gaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PHYSICAL_ACCEPTANCE',
            status: 'UNVERIFIED',
          }),
        ]),
      );
      expect(card.verification.action_authority).toBe(
        'BLOCKED_SEPARATE_AUTHORITY_UNVERIFIED',
      );
    }
    const consentSource = await openConsentCancellationSource(p.growth);
    expect(
      f.sources.entries.some(
        (e) =>
          e.target.job_id === consentSource.job_id &&
          e.target.version_id === consentSource.issued_version_id,
      ),
    ).toBe(true);
    expect(p.growth.operational_authority).toBe('BLOCKED');
    expect(p.growth.browser_writer).toBe('NOT_CONNECTED');
    expect(p.growth.observed.current_channel).toBe('UNKNOWN');
    expect(selectExternalProposalJob(p.advanced)).toBe(first.target.job_id);
    const handoff = await prepareExternalProposalHandoff(p.advanced, {
      confirmed: true,
      reviewed_lifecycle_sha256: p.advanced.integrity.sha256,
    });
    expect(handoff).toMatchObject({
      imported: false,
      synchronized: false,
      delivery: 'NOT_SENT',
      operational_ready: false,
    });
    expect(handoff.original_handoff).toMatchObject({
      imported: false,
      synchronized: false,
      delivery: 'NOT_SENT',
    });
    for (const authority of [
      v.field.authority,
      p.finance.authority,
      p.growth.authority,
      v.intelligence.authority,
      p.advanced.authority,
    ])
      expect(Object.values(authority).every((x) => x === false)).toBe(true);
    expect(snapshot(f)).toBe(before);
    expect(network).not.toHaveBeenCalled();
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);

it('honest empty financial sources stay UNKNOWN across the actual same-property jobs', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v);
  expect(v.finance.jobs).toHaveLength(4);
  for (const job of v.finance.jobs) {
    expect(job.invoices).toEqual([]);
    expect(job.unlinked_events).toEqual([]);
    expect(job.unlinked_ledger).toEqual([]);
    expect(job.coverage).toBe('UNVERIFIED');
    expect(job.missing_evidence.join(' ')).toContain('Absence is not zero');
  }
  expect(p.finance.correction.before.costs).toBeNull();
  expect(p.finance.correction.after.costs).toBeNull();
  expect(
    p.finance.correction.comparison.cost_to_complete_delta_minor,
  ).toBeNull();
});

it('revoking the shared eligible reviewer denies every retained package and exact source navigation', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v);
  const detail = await openServiceLifecycleJob(
      v.customer,
      f.entry.target.job_id!,
    ),
    card = v.intelligence.cards[0],
    suggestion = await openVerifiedSuggestionSource(v.intelligence, card.key);
  await f.sources.operations.configure(
    f.sources.company.id,
    'active',
    'starter',
    {},
    f.sources.company.id + '-independent-backup-owner',
  );
  await f.sources.operations.revokeOwner(
    f.sources.company.id,
    f.entry.target.actor_id,
  );
  expect((await reconcileScheduleProposalRevision(v.field)).status).toBe(
    'UNKNOWN',
  );
  expect((await reconcileFinancialEvidenceReview(p.finance)).status).toBe(
    'UNKNOWN',
  );
  expect(inspectServiceLifecycle(v.customer).status).toBe('UNKNOWN');
  expect((await reconcileConsentCancellationReview(p.growth)).status).toBe(
    'UNKNOWN',
  );
  expect(
    (await inspectVerifiedOperatingSuggestions(v.intelligence)).status,
  ).toBe('UNKNOWN');
  expect((await inspectExternalProposalLifecycle(p.advanced)).status).toBe(
    'UNKNOWN',
  );
  await expect(openScheduleProposalRevisionSource(v.field)).rejects.toThrow();
  expect(() => selectServiceLifecycleJob(detail)).toThrow();
  await expect(openConsentCancellationSource(p.growth)).rejects.toThrow();
  expect(() => openVerifiedSuggestionJob(suggestion)).toThrow();
  expect(() => selectExternalProposalJob(p.advanced)).toThrow();
});

it('roundtrip data copies retain evidence but never private source/custody authority', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v);
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  expect((await reconcileScheduleProposalRevision(copy(v.field))).status).toBe(
    'UNKNOWN',
  );
  expect((await reconcileFinancialEvidenceReview(copy(p.finance))).status).toBe(
    'UNKNOWN',
  );
  expect(inspectServiceLifecycle(copy(v.customer)).status).toBe('UNKNOWN');
  expect(
    (await reconcileConsentCancellationReview(copy(p.growth))).status,
  ).toBe('UNKNOWN');
  expect(
    (await inspectVerifiedOperatingSuggestions(copy(v.intelligence))).status,
  ).toBe('UNKNOWN');
  expect(
    (await inspectExternalProposalLifecycle(copy(p.advanced))).status,
  ).toBe('UNKNOWN');
});

it('foreign tenant/job/report/candidate references are denied or quarantined with no nearest-source substitution', async () => {
  const f = await fixture(),
    other = await fixture(1),
    v = await views(f),
    foreign = await views(other);
  await expect(
    reviewScheduleProposalRevision(
      f.sources,
      { ...f.field, proposed: other.proposed },
      f.gate,
    ),
  ).rejects.toThrow();
  expect(() =>
    openFinancialEvidenceSource(
      v.finance,
      foreign.finance.correction.baseline.queue[0].id,
    ),
  ).toThrow();
  await expect(
    openServiceLifecycleJob(v.customer, other.entry.target.job_id!),
  ).rejects.toThrow();
  await expect(
    prepareConsentCancellationReview(
      v.growth,
      {
        proposal: {
          candidate_key: foreign.growth.candidates[0].key,
          proposed_on: '2026-12-28',
          purpose: 'service_follow_up',
          plan_kind: 'follow_up',
        },
        expires_at: f.field.expires_at,
      },
      f.gate,
    ),
  ).rejects.toThrow();
  await expect(
    openVerifiedSuggestionSource(
      v.intelligence,
      foreign.intelligence.cards[0].key,
    ),
  ).rejects.toThrow();
  const refs = externalProposalReferences(foreign.advanced),
    review = await reviewExternalProposalLifecycle(
      v.advanced,
      {
        proposal: {
          external_reference: 'foreign-reference',
          source: refs.source,
        },
        workflow: refs.workflow,
        review_expires_at_ms: 2000,
      },
      { now_ms: 1000 },
    );
  expect(review.reference_status).toBe('QUARANTINED_REFERENCE_OR_WORKFLOW');
  await expect(
    prepareExternalProposalHandoff(review, {
      confirmed: true,
      reviewed_lifecycle_sha256: review.integrity.sha256,
    }),
  ).rejects.toThrow();
});

for (const name of Object.keys(reads) as (keyof typeof reads)[]) {
  it(`${name} rejects a foreign executable source getter without invoking it`, async () => {
    const f = await fixture(),
      hook = vi.fn();
    Object.defineProperty(f.sources, 'company', { get: hook });
    await expect(reads[name](f)).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
  });
  it(`${name} fences original admission after a genuine asynchronous digest`, async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (!changed) {
        changed = true;
        f.gate.confirmed = false;
      }
      return result;
    });
    await expect(reads[name](f)).rejects.toThrow();
    expect(changed).toBe(true);
  });
}

for (const Component of [
  ScheduleProposalRevisions,
  FinancialEvidenceReview,
  ServiceLifecycleReview,
  ConsentCancellationReview,
  VerifiedOperatingSuggestions,
  ExternalProposalLifecycle,
]) {
  it(`${Component.name} defaults OFF before source getters and serializers`, () => {
    const hook = vi.fn(),
      sources = Object.defineProperties(
        {},
        {
          company: { get: hook },
          entries: { get: hook },
          toJSON: { value: hook },
        },
      ) as OperatingSources;
    const html = renderToStaticMarkup(createElement(Component, { sources }));
    expect(html.toLowerCase()).toContain('off');
    expect(hook).not.toHaveBeenCalled();
  });
  it(`${Component.name} refuses explicit enabled on an HTTPS non-loopback surface before source access`, () => {
    vi.stubGlobal('window', {
      location: { hostname: 'example.invalid', protocol: 'https:' },
    });
    const hook = vi.fn(),
      sources = Object.defineProperty({}, 'company', {
        get: hook,
      }) as OperatingSources;
    const html = renderToStaticMarkup(
      createElement(Component, { sources, enabled: true }),
    );
    expect(html).not.toMatch(/<(?:form|button|input)\b/);
    expect(hook).not.toHaveBeenCalled();
  });
}

it.each(['CANCEL', 'REVOKE'] as const)(
  'schedule and consent %s terminate local review without mutating source records or restoring a fresh attempt',
  async (action) => {
    const f = await fixture(),
      before = snapshot(f),
      v = await views(f),
      p = await proposals(f, v),
      fieldBytes = JSON.stringify(v.field),
      growthBytes = JSON.stringify(p.growth);
    closeScheduleProposalRevision(v.field, action);
    cancelConsentCancellationReview(p.growth, action);
    expect((await reconcileScheduleProposalRevision(v.field)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    expect((await reconcileConsentCancellationReview(p.growth)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
    await expect(
      reviewScheduleProposalRevision(
        f.sources,
        {
          ...f.field,
          expected_revision: 1,
          expires_at: f.field.expires_at + 1,
        },
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      prepareConsentCancellationReview(
        v.growth,
        { ...p.growthInput, expires_at: p.growthInput.expires_at + 1 },
        f.gate,
      ),
    ).rejects.toThrow();
    expect(JSON.stringify(v.field)).toBe(fieldBytes);
    expect(JSON.stringify(p.growth)).toBe(growthBytes);
    expect(snapshot(f)).toBe(before);
  },
);

it('schedule CAS, fixed expiry and replaced presentation never renew the original source lineage', async () => {
  const f = await fixture(),
    first = await reads.field(f);
  await expect(reads.field(f)).rejects.toThrow();
  const second = await reviewScheduleProposalRevision(
    f.sources,
    {
      ...f.field,
      expected_revision: 1,
      proposed: {
        ...f.proposed,
        proposal: {
          ...f.proposed.proposal,
          start: f.entry.day + 'T11:00',
          end: f.entry.day + 'T13:00',
        },
      },
    },
    f.gate,
  );
  expect(second.revision).toBe(2);
  expect(second.original).toEqual(first.original);
  expect((await reconcileScheduleProposalRevision(first)).status).toBe(
    'UNKNOWN',
  );
  vi.spyOn(Date, 'now').mockReturnValue(f.field.expires_at);
  expect((await reconcileScheduleProposalRevision(second)).status).toBe(
    'EXPIRED',
  );
  await expect(
    reviewScheduleProposalRevision(
      f.sources,
      {
        ...f.field,
        expected_revision: 2,
        expires_at: f.field.expires_at + 60000,
      },
      f.gate,
    ),
  ).rejects.toThrow();
});

it('external workflow mismatch is quarantined even when all original immutable source IDs match', async () => {
  const f = await fixture(),
    source = await reads.advanced(f),
    refs = externalProposalReferences(source),
    review = await reviewExternalProposalLifecycle(
      source,
      {
        proposal: {
          external_reference: 'same-source-wrong-workflow',
          source: refs.source,
        },
        workflow: {
          ...refs.workflow,
          scheduled_visit_revision: refs.workflow.scheduled_visit_revision! + 1,
        },
        review_expires_at_ms: 2000,
      },
      { now_ms: 1000 },
    );
  expect(review.comparison.exact_reference).toBe(true);
  expect(review.reference_status).toBe('QUARANTINED_REFERENCE_OR_WORKFLOW');
  expect(
    review.workflow_differences.find(
      (d) => d.field === 'scheduled_visit_revision',
    )!.status,
  ).toBe('CONFLICT');
  await expect(
    prepareExternalProposalHandoff(review, {
      confirmed: true,
      reviewed_lifecycle_sha256: review.integrity.sha256,
    }),
  ).rejects.toThrow();
});

it('a preparation through the original advanced engine consumes the same hold used by the new external wrapper', async () => {
  const f = await fixture(),
    source = await reads.advanced(f),
    refs = externalProposalReferences(source),
    before = snapshot(f);
  await prepareAdvancedHandoff(source, {
    confirmed: true,
    reviewed_requirements_sha256: source.integrity.sha256,
  });
  const view = await reviewExternalProposalLifecycle(
    source,
    {
      proposal: {
        external_reference: 'original-engine-already-used',
        source: refs.source,
      },
      workflow: refs.workflow,
      review_expires_at_ms: 2000,
    },
    { now_ms: 1000 },
  );
  await expect(
    prepareExternalProposalHandoff(view, {
      confirmed: true,
      reviewed_lifecycle_sha256: view.integrity.sha256,
    }),
  ).rejects.toThrow();
  expect((await inspectExternalProposalLifecycle(view)).status).toBe('UNKNOWN');
  expect(snapshot(f)).toBe(before);
});

it('an exact visit identity with unrecognized recorded state stays UNKNOWN while service proof remains unverified', async () => {
  const f = await fixture(),
    original = f.sources.property.read.bind(f.sources.property),
    state = original(f.sources.company.id),
    visit = state.visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
  visit.phase = 'unrecognized' as typeof visit.phase;
  // Stable corrupt input establishes the state check independently of drift rejection.
  vi.spyOn(f.sources.property, 'read').mockImplementation(() =>
    structuredClone(state),
  );
  const suggestions = await reads.intelligence(f),
    card = suggestions.cards.find(
      (c) => c.source.kind === 'visit' && c.source.id === visit.id,
    )!,
    service = await reads.customer(f),
    detail = await openServiceLifecycleJob(service, f.entry.target.job_id!);
  expect(card.source.id).toBe(visit.id);
  expect(card.verification.status).toBe('UNKNOWN');
  expect(
    card.verification.facts.find((x) => x.code === 'VISIT_PHASE')!.value,
  ).toBeNull();
  expect(
    card.verification.required_checks.find(
      (x) => x.code === 'VISIT_WORKFLOW_STATE',
    )!.status,
  ).toBe('UNKNOWN');
  expect(card.verification.action_authority).toContain('BLOCKED');
  expect(
    detail.customer_safe.required_proof.every((r) => r.status === 'UNKNOWN'),
  ).toBe(true);
});

it('missing invoice-contract linkage is UNLINKED while the actual canonical event/posting sources remain unchanged', async () => {
  const f = await fixture(0, true),
    original = f.entry.release.read.bind(f.entry.release),
    raw = original('staff'),
    bad = structuredClone(raw);
  bad.release_contracts = [];
  vi.spyOn(f.entry.release, 'read').mockImplementation((actor) => ({
    ...structuredClone(bad),
    actor,
  }));
  const review = await reads.finance(f),
    evidence = review.jobs.find(
      (j) => j.target.job_id === f.entry.target.job_id,
    )!;
  expect(evidence.invoices[0]).toMatchObject({
    linkage: 'UNLINKED',
    verification: 'UNVERIFIED',
    summary: null,
    invoice: null,
  });
  expect(evidence.unlinked_events.map((e) => e.id).sort()).toEqual(
    raw.release_payment_events.map((e) => e.id).sort(),
  );
  expect(evidence.unlinked_ledger.map((e) => e.id).sort()).toEqual(
    raw.release_ledger_entries.map((e) => e.id).sort(),
  );
  expect(original('staff')).toEqual(raw);
});

it.each(['expiry', 'revoke'] as const)(
  'external %s preserves original delegated evidence and forbids another preparation',
  async (kind) => {
    const f = await fixture(),
      v = await views(f),
      p = await proposals(f, v),
      confirmation = {
        confirmed: true,
        reviewed_lifecycle_sha256: p.advanced.integrity.sha256,
      },
      packet = await prepareExternalProposalHandoff(p.advanced, confirmation),
      before = JSON.stringify(packet);
    if (kind === 'expiry') p.clock.now_ms = 2000;
    else revokeExternalProposal(p.advanced, confirmation);
    expect(externalProposalState(p.advanced).status).toBe(
      kind === 'expiry' ? 'EXPIRED' : 'REVOKED',
    );
    await expect(
      prepareExternalProposalHandoff(p.advanced, confirmation),
    ).rejects.toThrow();
    await expect(
      reviewExternalProposalLifecycle(
        v.advanced,
        { ...p.advancedInput, review_expires_at_ms: 4000 },
        p.clock,
      ),
    ).rejects.toThrow();
    expect(JSON.stringify(packet)).toBe(before);
  },
);

function folder(prefix: 'propel-crew-lab-' | 'propel-consent-lab-') {
  const path = mkdtempSync(join(tmpdir(), prefix));
  folders.push(path);
  return path;
}
async function labs(f: Fixture, p: Proposals) {
  const crewRoot = folder('propel-crew-lab-'),
    root = folder('propel-consent-lab-'),
    crewPath = join(crewRoot, 'custody.sqlite'),
    schedulePath = join(crewRoot, 'proposal-revisions.sqlite'),
    consentPath = join(root, 'authority.sqlite'),
    cancellationPath = join(root, 'cancellation.sqlite'),
    original = await admitCrewAssignment(f.sources, f.original, f.gate),
    proposed = await admitCrewAssignment(f.sources, f.proposed, f.gate),
    now = { field: Date.now(), consent: f.growth.window.as_of };
  const crew: CrewLabCommand = {
    command_id: 'lab-independent-original',
    expected_revision: 0,
    envelope: original.envelope,
    sha256: original.integrity.sha256,
  };
  const scheduleAuthority: ScheduleRevisionAuthority = {
    enabled: true,
    test_only: true,
    clock: () => now.field,
    checkSource(envelope) {
      const admitted = [original, proposed].find(
        (x) => JSON.stringify(x.envelope) === JSON.stringify(envelope),
      );
      if (!admitted)
        throw Error('Exact independent original admission required');
      assertCrewAssignmentCurrentNow(admitted);
      return admitted.integrity.sha256;
    },
  };
  expect(
    executeCrewTransaction(crewPath, crew, scheduleAuthority).receipt?.status,
  ).toBe('RESERVED_LAB_ONLY');
  const schedule: ScheduleRevisionCommand = {
    command_id: 'lab-independent-revision',
    expected_revision: 0,
    previous_receipt_id: null,
    original: crew,
    proposal: proposed.envelope,
    proposal_sha256: proposed.integrity.sha256,
    action: 'REVISE',
    expires_at: now.field + 60_000,
  };
  const e = p.growth.envelope,
    facts: SyntheticConsentFacts = {
      mode: 'TRUSTED_SYNTHETIC_FIXTURE',
      schema_revision: 1,
      organization_id: e.organization_id,
      actor_id: e.actor_id,
      customer_id: e.customer_id,
      property_id: e.property_id,
      job_id: e.job_id,
      source_sha256: e.source_sha256,
      source_revision: e.source_revision,
      purpose: e.purpose,
      channel: e.channel,
      recipient_reference: 'synthetic-recipient:' + e.customer_id,
      sender_reference: 'synthetic-sender:' + e.organization_id,
      purpose_allowed: true,
      recipient_verified: true,
      enrollment_active: true,
      suppressed: false,
      sender_authorized: true,
      principal_active: true,
      source_revoked: false,
      observed_at: now.consent,
      valid_from: '2026-12-28T11:59:00.000Z',
      expires_at: '2026-12-28T12:01:00.000Z',
    },
    cancellation: CancellationLabCommand = {
      command_id: 'lab-independent-boundary',
      operation: 'CHECK',
      expected_fixture_revision: 0,
      original: {
        command_id: 'lab-independent-original-boundary',
        expected_revision: 0,
        envelope: e,
        sha256: p.growth.original_requirements_sha256,
        expected_at: now.consent,
        max_age_ms: 60_000,
      },
      recipient_reference: facts.recipient_reference,
      sender_reference: facts.sender_reference,
      expected_at: now.consent,
      max_age_ms: 60_000,
      original_receipt_id: null,
    },
    consentAuthority: CancellationLabAuthority = {
      enabled: true,
      test_only: true,
      clock: () => now.consent,
      checkSource(envelope) {
        assertConsentCancellationReviewNow(p.growth);
        if (JSON.stringify(envelope) !== JSON.stringify(e))
          throw Error('Exact retained consent source required');
        return p.growth.original_requirements_sha256;
      },
    };
  installConsentCancellationFixture(
    consentPath,
    cancellationPath,
    cancellation,
    facts,
    consentAuthority,
  );
  return {
    root,
    crewPath,
    schedulePath,
    consentPath,
    cancellationPath,
    schedule,
    cancellation,
    scheduleAuthority,
    consentAuthority,
    facts,
    now,
  };
}

it('both actual disposable SQLite extensions reconcile lost ACK by exact receipts without replay or canonical business effects', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v),
    l = await labs(f, p),
    before = snapshot(f);
  const loss = () => {
    throw Error('Independent lost acknowledgment');
  };
  expect(
    executeScheduleRevision(l.crewPath, l.schedulePath, l.schedule, {
      ...l.scheduleAuthority,
      afterCommit: loss,
    }).status,
  ).toBe('UNKNOWN');
  const schedule = reconcileScheduleRevision(
    l.crewPath,
    l.schedulePath,
    l.schedule,
    l.scheduleAuthority,
  );
  expect(schedule.receipt).toMatchObject({
    status: 'REVISED_LAB_ONLY',
    revision: 1,
    business_write: false,
    dispatch: false,
  });
  expect(
    executeScheduleRevision(l.crewPath, l.schedulePath, l.schedule, {
      ...l.scheduleAuthority,
      afterClaim: loss,
    }),
  ).toEqual(schedule);
  expect(
    executeConsentCancellation(
      l.consentPath,
      l.cancellationPath,
      l.cancellation,
      { ...l.consentAuthority, afterCommit: loss },
    ).status,
  ).toBe('UNKNOWN');
  const consent = reconcileConsentCancellation(
    l.consentPath,
    l.cancellationPath,
    l.cancellation,
    l.consentAuthority,
  );
  expect(consent.receipt).toMatchObject({
    fixture_only: true,
    send: false,
    provider: false,
    outbox: false,
    source_auth_atomicity: 'UNVERIFIED',
  });
  expect(consent.receipt!.original_receipt!.boundary).toBe(
    'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
  );
  expect(
    executeConsentCancellation(
      l.consentPath,
      l.cancellationPath,
      l.cancellation,
      { ...l.consentAuthority, afterClaim: loss },
    ),
  ).toEqual(consent);
  for (const path of [l.schedulePath, l.cancellationPath]) {
    const db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare('SELECT count(*) AS n FROM receipts').get()!.n).toBe(1);
    db.close();
  }
  expect(snapshot(f)).toBe(before);
});

it('missing receipts after both permanent claims stay UNKNOWN through restored confirmation and replacement commands', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v),
    l = await labs(f, p);
  const withdraw = () => {
    f.gate.confirmed = false;
  };
  expect(
    executeScheduleRevision(l.crewPath, l.schedulePath, l.schedule, {
      ...l.scheduleAuthority,
      afterClaim: withdraw,
    }).status,
  ).toBe('UNKNOWN');
  f.gate.confirmed = true;
  expect(
    reconcileScheduleRevision(
      l.crewPath,
      l.schedulePath,
      l.schedule,
      l.scheduleAuthority,
    ).status,
  ).toBe('UNKNOWN');
  expect(
    executeScheduleRevision(
      l.crewPath,
      l.schedulePath,
      {
        ...l.schedule,
        command_id: 'lab-independent-new-id',
        expires_at: l.schedule.expires_at + 1,
      },
      l.scheduleAuthority,
    ).status,
  ).toBe('UNKNOWN');
  expect(
    executeConsentCancellation(
      l.consentPath,
      l.cancellationPath,
      l.cancellation,
      { ...l.consentAuthority, afterClaim: withdraw },
    ).status,
  ).toBe('UNKNOWN');
  f.gate.confirmed = true;
  expect(
    reconcileConsentCancellation(
      l.consentPath,
      l.cancellationPath,
      l.cancellation,
      l.consentAuthority,
    ).status,
  ).toBe('UNKNOWN');
  expect(() =>
    executeConsentCancellation(
      l.consentPath,
      l.cancellationPath,
      { ...l.cancellation, command_id: 'lab-independent-sender-replacement' },
      l.consentAuthority,
    ),
  ).toThrow('UNKNOWN');
  for (const [path, table] of [
    [l.schedulePath, 'attempts'],
    [l.cancellationPath, 'claims'],
  ]) {
    const db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n).toBe(1);
    expect(db.prepare('SELECT count(*) AS n FROM receipts').get()!.n).toBe(0);
    db.close();
  }
});

it.each(['CANCEL', 'REVOKE', 'SUPPRESS'] as const)(
  'participating %s before the actual boundary serializes denial; a later check cannot create communication authority',
  async (operation) => {
    const f = await fixture(),
      v = await views(f),
      p = await proposals(f, v),
      l = await labs(f, p),
      before = snapshot(f),
      command = {
        ...l.cancellation,
        command_id: 'lab-independent-withdrawal',
        operation,
      };
    const withdrawal = executeConsentCancellation(
        l.consentPath,
        l.cancellationPath,
        command,
        l.consentAuthority,
      ),
      check = executeConsentCancellation(
        l.consentPath,
        l.cancellationPath,
        l.cancellation,
        l.consentAuthority,
      );
    expect(withdrawal.status).toBe('EXACT_RECEIPT');
    expect(check.receipt!.original_receipt!.boundary).toBe('DENIED');
    expect(
      check.receipt!.original_receipt!.linearization_sequence,
    ).toBeGreaterThan(withdrawal.receipt!.linearization_sequence);
    expect(check.receipt).toMatchObject({
      send: false,
      provider: false,
      outbox: false,
    });
    expect(
      reconcileConsentCancellation(
        l.consentPath,
        l.cancellationPath,
        command,
        l.consentAuthority,
      ).receipt,
    ).toEqual(withdrawal.receipt);
    expect(snapshot(f)).toBe(before);
  },
);

it('participating suppression CAS drift is UNKNOWN and replacement IDs cannot overwrite newer evidence', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v),
    l = await labs(f, p);
  changeSyntheticConsent(
    l.consentPath,
    p.growth.envelope,
    0,
    { ...l.facts, suppressed: true },
    l.consentAuthority,
  );
  const command: CancellationLabCommand = {
    ...l.cancellation,
    command_id: 'lab-independent-stale-cancel',
    operation: 'CANCEL',
  };
  expect(
    executeConsentCancellation(
      l.consentPath,
      l.cancellationPath,
      command,
      l.consentAuthority,
    ).status,
  ).toBe('UNKNOWN');
  expect(
    executeConsentCancellation(
      l.consentPath,
      l.cancellationPath,
      {
        ...command,
        command_id: 'lab-independent-retry-cancel',
        expected_fixture_revision: 1,
      },
      l.consentAuthority,
    ).status,
  ).toBe('UNKNOWN');
  const db = new DatabaseSync(l.consentPath, { readOnly: true });
  expect(db.prepare('SELECT revision FROM authority').get()!.revision).toBe(1);
  db.close();
});

it('a real competing suppression process serializes after a held native boundary while exact reads preserve the immutable original receipt', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v),
    l = await labs(f, p),
    before = snapshot(f),
    release = join(l.root, 'release-boundary');
  function worker(name: string, mode: string) {
    const input = join(l.root, `${name}-input.json`),
      witness = join(l.root, `${name}-witness.json`);
    writeFileSync(
      input,
      JSON.stringify({ command: l.cancellation, facts: l.facts }),
    );
    writeFileSync(
      witness,
      JSON.stringify({ envelope: p.growth.envelope, now: l.now.consent }),
    );
    const child = fork(
      new URL('./helpers/cycle12-consent-worker.ts', import.meta.url),
      [l.consentPath, l.cancellationPath, input, witness, mode, release],
      {
        execArgv: ['--experimental-strip-types'],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    children.push(child);
    const inbox: Record<string, unknown>[] = [];
    let stderr = '';
    child.on('message', (message) =>
      inbox.push(message as Record<string, unknown>),
    );
    child.stderr?.on('data', (data) => {
      stderr += String(data);
    });
    function event(name: string) {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const find = () => inbox.find((message) => message.event === name);
        const found = find();
        if (found) {
          resolve(found);
          return;
        }
        const cleanup = () => {
            clearTimeout(timer);
            child.off('message', onMessage);
            child.off('exit', onExit);
          },
          onMessage = () => {
            const value = find();
            if (value) {
              cleanup();
              resolve(value);
            }
          },
          onExit = () => {
            cleanup();
            reject(
              Error(`Independent worker exited before ${name}: ${stderr}`),
            );
          },
          timer = setTimeout(() => {
            cleanup();
            reject(Error(`Independent worker timeout ${name}: ${stderr}`));
          }, 10_000);
        child.on('message', onMessage);
        child.on('exit', onExit);
      });
    }
    return { child, event };
  }
  const boundary = worker('boundary', 'hold-boundary'),
    suppression = worker('suppression', 'old-suppress');
  await Promise.all([boundary.event('READY'), suppression.event('READY')]);
  boundary.child.send('GO');
  await boundary.event('AT_BOUNDARY');
  suppression.child.send('GO');
  await suppression.event('SOURCE_CHECKED');
  writeFileSync(release, 'explicit release');
  const checked = (await boundary.event('RESULT')).result as ReturnType<
      typeof executeConsentCancellation
    >,
    withdrawn = (await suppression.event('RESULT')).result as {
      linearization_sequence: number;
    };
  expect(checked.receipt!.original_receipt!.boundary).toBe(
    'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
  );
  expect(withdrawn.linearization_sequence).toBeGreaterThan(
    checked.receipt!.linearization_sequence,
  );
  const exact = reconcileConsentCancellation(
    l.consentPath,
    l.cancellationPath,
    l.cancellation,
    l.consentAuthority,
  );
  expect(exact.receipt).toEqual(checked.receipt);
  expect(exact.current_cancellation).toBe('C11_WITHDRAWN_FIXTURE');
  expect(exact.receipt).toMatchObject({
    send: false,
    provider: false,
    outbox: false,
  });
  expect(snapshot(f)).toBe(before);
}, 30_000);

it('all six browser adapters remain disconnected from both disposable writers and external execution', () => {
  for (const [module, component] of [
    ['schedule-proposal-revisions', 'ScheduleProposalRevisions'],
    ['financial-evidence-review', 'FinancialEvidenceReview'],
    ['service-lifecycle-review', 'ServiceLifecycleReview'],
    ['consent-cancellation-review', 'ConsentCancellationReview'],
    ['verified-operating-suggestions', 'VerifiedOperatingSuggestions'],
    ['external-proposal-lifecycle', 'ExternalProposalLifecycle'],
  ]) {
    const source = readFileSync(
        new URL(`../src/lib/workflows/${module}.ts`, import.meta.url),
        'utf8',
      ),
      ui = readFileSync(
        new URL(
          `../src/components/workflows/${component}.tsx`,
          import.meta.url,
        ),
        'utf8',
      ),
      css = readFileSync(
        new URL(`../src/components/workflows/${module}.css`, import.meta.url),
        'utf8',
      );
    expect(source + ui).not.toMatch(
      /node:sqlite|server\/(field-lab|consent-lab)|fetch\(|localStorage|indexedDB|\.command\(|\.assignJob\(|\.recordConsent\(/,
    );
    expect(css).toContain('--journey-primary');
    expect(css).toContain('44px');
  }
});
