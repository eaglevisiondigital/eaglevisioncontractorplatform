import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sampleCompanies } from '../src/domain/platform';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  admitCrewAssignment,
  assertCrewAssignmentCurrentNow,
  openCrewAssignmentJob,
  reconcileCrewAssignment,
  type CrewAssignmentInput,
} from '../src/lib/workflows/crew-assignment-lab';
import {
  readFinancialCorrectionSources,
  openFinancialCorrectionException,
  prepareFinancialCorrection,
  reconcileFinancialCorrection,
} from '../src/lib/workflows/financial-correction-review';
import {
  readServiceContinuity,
  openServiceContinuityJob,
  openServiceContinuityReport,
  selectServiceContinuityJob,
  inspectServiceContinuity,
} from '../src/lib/workflows/service-continuity';
import {
  readAtomicConsentLab,
  inspectAtomicConsentRequirements,
  assertAtomicConsentRequirementsNow,
  openAtomicConsentSource,
  reconcileAtomicConsentRequirements,
} from '../src/lib/workflows/atomic-consent-lab';
import {
  readDailyActionCenter,
  openDailyActionSource,
  openDailyActionJob,
  inspectDailyActionCenter,
} from '../src/lib/workflows/daily-action-center';
import {
  readSyncAdmissionSource,
  syncSourceReference,
  reviewSyncAdmission,
  selectSyncAdmissionJob,
  prepareSyncReviewHandoff,
  inspectSyncReviewHandoff,
} from '../src/lib/workflows/sync-admission-review';
import { readPilotScorecard } from '../src/lib/workflows/pilot-scorecard';
import {
  executeCrewTransaction,
  reconcileCrewTransaction,
  type CrewLabCommand,
} from '../server/field-lab/crew-transaction';
import {
  installSyntheticConsent,
  changeSyntheticConsent,
  evaluateAtomicBoundary,
  reconcileAtomicBoundary,
  type SyntheticConsentFacts,
  type AtomicConsentCommand,
} from '../server/consent-lab/atomic-boundary';
import { CrewAssignmentLab } from '../src/components/workflows/CrewAssignmentLab';
import { FinancialCorrectionReview } from '../src/components/workflows/FinancialCorrectionReview';
import { ServiceContinuity } from '../src/components/workflows/ServiceContinuity';
import { AtomicConsentLab } from '../src/components/workflows/AtomicConsentLab';
import { DailyActionCenter } from '../src/components/workflows/DailyActionCenter';
import { SyncAdmissionReview } from '../src/components/workflows/SyncAdmissionReview';
import { PilotScorecard } from '../src/components/workflows/PilotScorecard';

// Independent combined probes: one actual retained repository set per company,
// not independently fabricated source records for each feature.
const folders: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  folders.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true }));
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    e = sources.entries[0];
  const crew: CrewAssignmentInput = {
    week_start: e.day,
    timezone: e.timezone,
    proposal: {
      job_id: e.target.job_id!,
      worker_id: e.worker_id,
      source_visit_id: e.scheduled_visit_id,
      day: e.day,
      start: e.day + 'T09:00',
      end: e.day + 'T11:00',
      hours_start: e.day + 'T08:00',
      hours_end: e.day + 'T16:00',
    },
  };
  const finance = { as_of: new Date().toISOString(), input_revision: 1 };
  const continuity = { query: '', location_id: '', job_id: '' };
  const growth = {
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
  };
  const intelligence = {
    review_on: e.day,
    timezone: e.timezone,
    input_revision: 1,
    ordering: 'EVIDENCE_FIRST' as const,
  };
  const advanced = {
    job_id: e.target.job_id!,
    kind: 'offline' as const,
    note: 'Exact independently reviewed local source; no synchronization.',
    review_on: e.day,
    manual_priority: 'normal' as const,
    edition: 'property_services' as const,
  };
  return {
    sources,
    gate,
    crew,
    finance,
    continuity,
    growth,
    intelligence,
    advanced,
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
  field: (f: Fixture) => admitCrewAssignment(f.sources, f.crew, f.gate),
  finance: (f: Fixture) =>
    readFinancialCorrectionSources(f.sources, f.finance, f.gate),
  customer: (f: Fixture) =>
    readServiceContinuity(f.sources, f.continuity, f.gate),
  growth: (f: Fixture) => readAtomicConsentLab(f.sources, f.growth, f.gate),
  intelligence: (f: Fixture) =>
    readDailyActionCenter(f.sources, f.intelligence, f.gate),
  advanced: (f: Fixture) =>
    readSyncAdmissionSource(f.sources, f.advanced, f.gate),
};
async function views(f: Fixture) {
  const [crew, finance, customer, growth, intelligence, advanced] =
    await Promise.all([
      reads.field(f),
      reads.finance(f),
      reads.customer(f),
      reads.growth(f),
      reads.intelligence(f),
      reads.advanced(f),
    ]);
  return { crew, finance, customer, growth, intelligence, advanced };
}
async function proposals(f: Fixture, v: Awaited<ReturnType<typeof views>>) {
  const exception = v.finance.baseline.queue.find(
    (q) => q.job_id === f.sources.entries[0].target.job_id,
  )!;
  const detail = openFinancialCorrectionException(v.finance, exception.id);
  const correction = await prepareFinancialCorrection(detail, {
    remaining: {
      ...detail.before.remaining,
      other: detail.before.remaining.other + 137,
    },
    reason: 'Review this exact unsaved materials forecast independently.',
    confirmed: true,
    excludes_unpaid_commitments: true,
    source_sha256: detail.source_sha256,
    input_revision: 2,
  });
  const candidate = v.growth.candidates[0];
  const consent = await inspectAtomicConsentRequirements(
    v.growth,
    {
      candidate_key: candidate.key,
      proposed_on: candidate.selection.due_on,
      purpose: 'service_follow_up',
      plan_kind: 'follow_up',
    },
    f.gate,
  );
  const sync = await reviewSyncAdmission(v.advanced, {
    external_reference: 'independent-exact-source',
    source: syncSourceReference(v.advanced),
  });
  const handoff = await prepareSyncReviewHandoff(sync, {
    confirmed: true,
    reviewed_comparison_sha256: sync.integrity.sha256,
  });
  return { correction, consent, sync, handoff };
}
it.each([0, 1, 2])(
  'company %i shares exact retained customer/property/job/version evidence across all six packages without business effects',
  async (brand) => {
    const f = await fixture(brand),
      before = snapshot(f);
    const network = vi.spyOn(globalThis, 'fetch');
    const writers = [
      vi.spyOn(f.sources.estimates, 'assignJob'),
      vi.spyOn(f.sources.estimates, 'recordTime'),
      vi.spyOn(f.sources.estimates, 'submitExpense'),
      vi.spyOn(f.sources.estimates, 'projection'),
      vi.spyOn(f.sources.estimates, 'issue'),
      vi.spyOn(f.sources.property, 'saveVisit'),
      vi.spyOn(f.sources.property, 'publish'),
      ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
    ];
    const v = await views(f),
      p = await proposals(f, v),
      first = f.sources.entries[0],
      fourth = f.sources.entries[3];
    expect(f.sources.entries).toHaveLength(4);
    expect(
      new Set(f.sources.entries.map((e) => e.target.customer_id)).size,
    ).toBe(3);
    expect(new Set(f.sources.entries.map((e) => e.worker_id)).size).toBe(2);
    expect(first.target.location_id).toBe(fourth.target.location_id);
    expect(first.target.version_id).not.toBe(fourth.target.version_id);
    expect(await openCrewAssignmentJob(v.crew)).toMatchObject({
      organization_id: first.target.organization_id,
      customer_id: first.target.customer_id,
      location_id: first.target.location_id,
      job_id: first.target.job_id,
      estimate_id: first.target.estimate_id,
      version_id: first.target.version_id,
    });
    for (const e of [first, fourth]) {
      const path = v.customer.paths.find((x) => x.job_id === e.target.job_id)!,
        detail = await openServiceContinuityJob(v.customer, e.target.job_id!),
        source = v.intelligence.cards.find(
          (c) => c.job_id === e.target.job_id && c.source.kind === 'report',
        )!,
        report = await openDailyActionSource(v.intelligence, source.key);
      expect(path.receipt.id).toBe(e.receipt_id);
      expect(detail.staff.issued_version_id).toBe(e.target.version_id);
      expect(detail.staff.offer_id).toBe(e.offer_id);
      expect(selectServiceContinuityJob(detail)).toBe(e.target.job_id);
      expect(
        openDailyActionJob(v.intelligence, e.target.job_id!).target,
      ).toEqual(e.target);
      expect(report.target).toEqual(e.target);
      expect(report.source).toMatchObject({
        id: e.report_id,
        version: e.published_version,
      });
      const passportReport =
        detail.customer_safe.property_passport.reports.find(
          (r) => r.report.reference.report_id === e.report_id,
        )!;
      const original = await openServiceContinuityReport(
        detail,
        passportReport.report.reference,
      );
      expect(original.reference).toEqual(passportReport.report.reference);
      expect(detail.customer_safe.physical_completion).toBe('UNVERIFIED');
      expect(detail.customer_safe.warranty).toBe('UNVERIFIED');
      expect(JSON.stringify(detail.customer_safe)).not.toMatch(
        /PRIVATE|unit_cost|supplier|payroll|margin|worker_id|actor_id|internal_notes/,
      );
    }
    expect(p.correction.target).toEqual(first.target);
    expect(p.correction.original_receipt_id).toBe(first.receipt_id);
    expect(p.correction.before.costs).toBeNull();
    expect(p.correction.after.costs).toBeNull();
    expect(
      p.correction.comparison.categories.find((c) => c.category === 'other')!
        .delta_minor,
    ).toBe(137);
    expect(p.correction.comparison.cost_to_complete_delta_minor).toBeNull();
    expect(p.correction.after.provider_evidence.settlementStatus).toBe(
      'UNKNOWN',
    );
    const growthSource = await openAtomicConsentSource(
      v.growth,
      p.consent.envelope.candidate_key,
    );
    expect(
      f.sources.entries.some(
        (e) =>
          e.target.job_id === growthSource.job_id &&
          e.target.customer_id === growthSource.customer_id &&
          e.target.location_id === growthSource.location_id &&
          e.target.version_id === growthSource.issued_version_id,
      ),
    ).toBe(true);
    expect(p.consent.envelope.operational_authority).toBe('BLOCKED');
    expect(p.consent.observed.current_channel).toBe('UNKNOWN');
    expect(p.sync.source.issued_version_id).toBe(first.target.version_id);
    expect(selectSyncAdmissionJob(p.sync)).toBe(first.target.job_id);
    expect(p.handoff).toMatchObject({
      imported: false,
      synchronized: false,
      delivery: 'NOT_SENT',
    });
    for (const authority of [
      v.crew.envelope.authority,
      p.correction.authority,
      p.consent.authority,
      v.intelligence.authority,
      p.sync.authority,
    ])
      expect(Object.values(authority).every((x) => x === false)).toBe(true);
    expect(snapshot(f)).toBe(before);
    expect(network).not.toHaveBeenCalled();
    writers.forEach((w) => expect(w).not.toHaveBeenCalled());
  },
);

it('shared eligible-staff revocation denies every retained desk and every previously valid exact navigation', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v);
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
  expect((await reconcileCrewAssignment(v.crew)).status).toBe('UNKNOWN');
  expect((await reconcileFinancialCorrection(p.correction)).status).toBe(
    'UNKNOWN',
  );
  expect(inspectServiceContinuity(v.customer).status).toBe('UNKNOWN');
  expect((await reconcileAtomicConsentRequirements(p.consent)).status).toBe(
    'UNKNOWN',
  );
  expect((await inspectDailyActionCenter(v.intelligence)).status).toBe(
    'UNKNOWN',
  );
  expect((await inspectSyncReviewHandoff(p.handoff)).status).toBe('UNKNOWN');
  expect(() => readPilotScorecard(f.sources, f.gate)).toThrow();
  await expect(openCrewAssignmentJob(v.crew)).rejects.toThrow();
  await expect(
    openServiceContinuityJob(v.customer, f.sources.entries[0].target.job_id!),
  ).rejects.toThrow();
  await expect(
    openAtomicConsentSource(v.growth, p.consent.envelope.candidate_key),
  ).rejects.toThrow();
  expect(() => selectSyncAdmissionJob(p.sync)).toThrow();
});

it('foreign identifiers remain denied or quarantined across the shared environment, never nearest/latest substituted', async () => {
  const f = await fixture(),
    other = await fixture(1),
    v = await views(f),
    foreign = await views(other),
    id = other.sources.entries[0].target.job_id!;
  await expect(
    admitCrewAssignment(
      f.sources,
      { ...f.crew, proposal: { ...f.crew.proposal, job_id: id } },
      f.gate,
    ),
  ).rejects.toThrow();
  expect(() =>
    openFinancialCorrectionException(
      v.finance,
      foreign.finance.baseline.queue[0].id,
    ),
  ).toThrow();
  await expect(openServiceContinuityJob(v.customer, id)).rejects.toThrow();
  await expect(
    openAtomicConsentSource(v.growth, foreign.growth.candidates[0].key),
  ).rejects.toThrow();
  expect(() => openDailyActionJob(v.intelligence, id)).toThrow();
  const review = await reviewSyncAdmission(v.advanced, {
    external_reference: 'foreign-reference',
    source: syncSourceReference(foreign.advanced),
  });
  expect(review.reference_status).toBe(
    'QUARANTINED_MISSING_OR_CONFLICTING_REFERENCE',
  );
  await expect(
    prepareSyncReviewHandoff(review, {
      confirmed: true,
      reviewed_comparison_sha256: review.integrity.sha256,
    }),
  ).rejects.toThrow();
});

it('detached copies cannot restore private authority bindings or bypass UNKNOWN reconciliation', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v);
  expect((await reconcileCrewAssignment(structuredClone(v.crew))).status).toBe(
    'UNKNOWN',
  );
  expect(
    (await reconcileFinancialCorrection(structuredClone(p.correction))).status,
  ).toBe('UNKNOWN');
  expect(inspectServiceContinuity(structuredClone(v.customer)).status).toBe(
    'UNKNOWN',
  );
  expect(
    (await reconcileAtomicConsentRequirements(structuredClone(p.consent)))
      .status,
  ).toBe('UNKNOWN');
  expect(
    (await inspectDailyActionCenter(structuredClone(v.intelligence))).status,
  ).toBe('UNKNOWN');
  expect(
    (await inspectSyncReviewHandoff(structuredClone(p.handoff))).status,
  ).toBe('UNKNOWN');
});

for (const name of Object.keys(reads) as (keyof typeof reads)[]) {
  it(`${name} rejects original source accessors without executing caller code`, async () => {
    const f = await fixture();
    let invoked = false;
    Object.defineProperty(f.sources, 'company', {
      get() {
        invoked = true;
        throw Error('Caller getter executed');
      },
    });
    await expect(reads[name](f)).rejects.toThrow();
    expect(invoked).toBe(false);
  });
  it(`${name} rechecks live original admission after a real asynchronous hash`, async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let withdrawn = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (!withdrawn) {
        withdrawn = true;
        f.gate.confirmed = false;
      }
      return result;
    });
    await expect(reads[name](f)).rejects.toThrow();
    expect(withdrawn).toBe(true);
  });
}

for (const Component of [
  CrewAssignmentLab,
  FinancialCorrectionReview,
  ServiceContinuity,
  AtomicConsentLab,
  DailyActionCenter,
  SyncAdmissionReview,
  PilotScorecard,
]) {
  it(`${Component.name} stays default OFF before source getters or serialization`, () => {
    let invoked = false;
    const sources = Object.defineProperties(
      {},
      {
        company: {
          get() {
            invoked = true;
            throw Error('No source read');
          },
        },
        toJSON: {
          value() {
            invoked = true;
            throw Error('No serialization');
          },
        },
      },
    ) as OperatingSources;
    const html = renderToStaticMarkup(createElement(Component, { sources }));
    expect(invoked).toBe(false);
    expect(html.toLowerCase()).toContain('off');
  });
}

it.each([0, 1, 2])(
  'company %i scorecard preserves original capability states and separates Phase One gates from local feature evidence',
  async (brand) => {
    const f = await fixture(brand),
      card = readPilotScorecard(f.sources, f.gate);
    expect(card.organization_id).toBe(f.sources.company.id);
    expect(card.features).toHaveLength(25);
    expect(card.phase_one).toHaveLength(8);
    expect(card.features.every((x) => x.release === 'not_authorized')).toBe(
      true,
    );
    expect(card.release).toBe('NOT_READY_NOT_AUTHORIZED');
    expect(JSON.stringify(card)).not.toMatch(
      /PRIVATE|"unit_cost_minor"|"payroll"|"margin_bps"|@example|"customer_id"|"job_id"/,
    );
    expect(Object.values(card.authority).every((x) => x === false)).toBe(true);
  },
);

async function lab(
  f: Fixture,
  v: Awaited<ReturnType<typeof views>>,
  p: Awaited<ReturnType<typeof proposals>>,
) {
  const crewFolder = mkdtempSync(
      join(tmpdir(), 'propel-crew-lab-independent-'),
    ),
    consentFolder = mkdtempSync(
      join(tmpdir(), 'propel-consent-lab-independent-'),
    );
  folders.push(crewFolder, consentFolder);
  const crewPath = join(crewFolder, 'custody.sqlite'),
    consentPath = join(consentFolder, 'authority.sqlite');
  const crewCommand: CrewLabCommand = {
    command_id: 'lab-independent-crew',
    expected_revision: 0,
    envelope: v.crew.envelope,
    sha256: v.crew.integrity.sha256,
  };
  const crewAuthority = {
    enabled: true,
    test_only: true,
    checkSource: () => {
      assertCrewAssignmentCurrentNow(v.crew);
      return v.crew.integrity.sha256;
    },
  };
  const e = p.consent.envelope,
    clock = f.growth.window.as_of;
  const facts: SyntheticConsentFacts = {
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
    observed_at: clock,
    valid_from: '2026-12-28T11:59:00.000Z',
    expires_at: '2026-12-28T12:01:00.000Z',
  };
  const consentCommand: AtomicConsentCommand = {
    command_id: 'lab-independent-consent',
    expected_revision: 0,
    envelope: e,
    sha256: p.consent.integrity.sha256,
    expected_at: clock,
    max_age_ms: 60_000,
  };
  const consentAuthority = {
    enabled: true,
    test_only: true,
    checkSource: () => {
      assertAtomicConsentRequirementsNow(p.consent);
      return p.consent.integrity.sha256;
    },
    clock: () => clock,
  };
  installSyntheticConsent(consentPath, e, facts, consentAuthority);
  return {
    crewPath,
    consentPath,
    crewCommand,
    crewAuthority,
    consentCommand,
    consentAuthority,
    facts,
  };
}
it('lost acknowledgments in both actual SQLite laboratories reconcile exact receipts without touching canonical business records or replaying', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v),
    l = await lab(f, v, p),
    before = snapshot(f);
  expect(
    executeCrewTransaction(l.crewPath, l.crewCommand, {
      ...l.crewAuthority,
      afterCommit() {
        throw Error('Lost crew acknowledgment');
      },
    }).status,
  ).toBe('UNKNOWN');
  const crew = reconcileCrewTransaction(
    l.crewPath,
    l.crewCommand,
    l.crewAuthority,
  );
  expect(crew.status).toBe('EXACT_RECEIPT');
  expect(crew.receipt).toMatchObject({
    status: 'RESERVED_LAB_ONLY',
    dispatch: false,
    business_write: false,
  });
  expect(
    executeCrewTransaction(l.crewPath, l.crewCommand, {
      ...l.crewAuthority,
      afterClaim() {
        throw Error('Must not replay claim');
      },
    }),
  ).toEqual(crew);
  expect(
    evaluateAtomicBoundary(l.consentPath, l.consentCommand, {
      ...l.consentAuthority,
      afterCommit() {
        throw Error('Lost consent acknowledgment');
      },
    }).status,
  ).toBe('UNKNOWN');
  const consent = reconcileAtomicBoundary(
    l.consentPath,
    l.consentCommand,
    l.consentAuthority,
  );
  expect(consent.status).toBe('EXACT_RECEIPT');
  expect(consent.receipt).toMatchObject({
    fixture_only: true,
    boundary: 'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
    send: false,
    outbox: false,
    provider: false,
    global_source_auth_atomicity: 'UNVERIFIED',
  });
  expect(
    evaluateAtomicBoundary(l.consentPath, l.consentCommand, {
      ...l.consentAuthority,
      afterClaim() {
        throw Error('Must not replay claim');
      },
    }),
  ).toEqual(consent);
  expect(v.crew.durable_writer).toBe('NOT_CONNECTED');
  expect(p.consent.browser_writer).toBe('NOT_CONNECTED');
  expect(snapshot(f)).toBe(before);
});
it('a participating synthetic suppression withdrawal between permanent claim and boundary serializes denial and cannot be bypassed with a replacement command', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v),
    l = await lab(f, v, p);
  const outcome = evaluateAtomicBoundary(l.consentPath, l.consentCommand, {
    ...l.consentAuthority,
    afterClaim() {
      changeSyntheticConsent(
        l.consentPath,
        p.consent.envelope,
        0,
        { ...l.facts, suppressed: true },
        l.consentAuthority,
      );
    },
  });
  expect(outcome.status).toBe('EXACT_RECEIPT');
  expect(outcome.receipt).toMatchObject({
    boundary: 'DENIED',
    fixture_revision: 1,
    send: false,
  });
  expect(outcome.receipt!.denials).toEqual(
    expect.arrayContaining(['STALE_REVISION', 'SUPPRESSION']),
  );
  expect(
    evaluateAtomicBoundary(
      l.consentPath,
      {
        ...l.consentCommand,
        command_id: 'lab-replacement-is-forbidden',
        expected_revision: 1,
      },
      l.consentAuthority,
    ).status,
  ).toBe('UNKNOWN');
});
it('source withdrawal after each permanent claim retains UNKNOWN even after presentation confirmation returns and a new command ID is attempted', async () => {
  const f = await fixture(),
    v = await views(f),
    p = await proposals(f, v),
    l = await lab(f, v, p);
  const lost = () => {
    f.gate.confirmed = false;
  };
  expect(
    executeCrewTransaction(l.crewPath, l.crewCommand, {
      ...l.crewAuthority,
      afterClaim: lost,
    }).status,
  ).toBe('UNKNOWN');
  f.gate.confirmed = true;
  expect(
    reconcileCrewTransaction(l.crewPath, l.crewCommand, l.crewAuthority).status,
  ).toBe('UNKNOWN');
  expect(
    executeCrewTransaction(
      l.crewPath,
      { ...l.crewCommand, command_id: 'lab-new-crew-id' },
      l.crewAuthority,
    ).status,
  ).toBe('UNKNOWN');
  expect(
    evaluateAtomicBoundary(l.consentPath, l.consentCommand, {
      ...l.consentAuthority,
      afterClaim: lost,
    }).status,
  ).toBe('UNKNOWN');
  f.gate.confirmed = true;
  expect(
    reconcileAtomicBoundary(l.consentPath, l.consentCommand, l.consentAuthority)
      .status,
  ).toBe('UNKNOWN');
  expect(
    evaluateAtomicBoundary(
      l.consentPath,
      { ...l.consentCommand, command_id: 'lab-new-consent-id' },
      l.consentAuthority,
    ).status,
  ).toBe('UNKNOWN');
});
it('the common owner-brief correction changes only whitespace and preserves the reviewed exact source semantics', () => {
  const path = 'docs/program/CYCLE11_IMPLEMENTATION_BRIEF.md';
  const owner = execFileSync(
    'git',
    ['show', 'b6ac4fc28c5a50d2029db4a5a69d345af0e3f35b:' + path],
    { encoding: 'utf8' },
  );
  const current = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  expect(current.replace(/\s+/g, ' ').trim()).toBe(
    owner.replace(/\s+/g, ' ').trim(),
  );
  expect(createHash('sha256').update(current).digest('hex')).toBe(
    '78b9aeeebe91dbeaed2a11f0240dbfb88771241e52cc2137bfbfb8bcca0663f1',
  );
});
