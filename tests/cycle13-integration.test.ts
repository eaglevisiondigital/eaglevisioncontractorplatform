import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sampleCompanies } from '../src/domain/platform';
import { verifyLedger } from '../src/domain/release/types';
import { advancedHandoffKinds } from '../src/lib/workflows/advanced-handoffs';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  reviewWorkOrderRevision,
  openWorkOrderRevisionSource,
  reconcileWorkOrderRevision as reconcileBrowserWorkOrder,
  assertWorkOrderRevisionCurrentNow,
  closeWorkOrderRevision,
} from '../src/lib/workflows/work-order-revisions';
import {
  readFinancialCasework,
  openFinancialCaseworkJob,
  filterFinancialCasework,
  compareFinancialCaseworkReview,
  assertFinancialCaseworkCurrent,
} from '../src/lib/workflows/financial-casework';
import {
  readServicePassportDesk,
  openServicePassportJob,
  openServicePassportReport,
  openServicePassportFinding,
  selectServicePassportJob,
  inspectServicePassportDesk,
  assertServicePassportCurrentNow,
} from '../src/lib/workflows/service-passport-desk';
import {
  readFollowUpReadiness,
  openFollowUpReadinessSource,
  inspectFollowUpReadinessRequirements,
  reconcileFollowUpReadinessRequirements,
  closeFollowUpReadinessReview,
  reconcileFollowUpReadiness,
  assertFollowUpReadinessCurrentNow,
  type FollowUpReadinessInput,
} from '../src/lib/workflows/follow-up-readiness';
import {
  readOperatingNavigation,
  inspectOperatingNavigationSource,
  navigateOperatingSuggestion,
  inspectOperatingNavigation,
  assertOperatingNavigationCurrent,
} from '../src/lib/workflows/operating-navigation';
import {
  readAddonReviewDesk,
  inspectAddonReviewSource,
  assertAddonReviewCurrentNow,
  inspectAddonReviewReference,
  selectAddonReviewJob,
  openAddonOriginalControl,
} from '../src/lib/workflows/addon-review-desk';
import {
  admitCrewAssignment,
  assertCrewAssignmentCurrentNow,
  type CrewAssignmentInput,
} from '../src/lib/workflows/crew-assignment-lab';
import {
  prepareCrewLab,
  executeCrewTransaction,
  type CrewLabCommand,
} from '../server/field-lab/crew-transaction';
import {
  prepareScheduleRevisionLab,
  type ScheduleRevisionAuthority,
  type ScheduleRevisionCommand,
} from '../server/field-lab/proposal-revisions';
import {
  bindWorkOrderRevisionCommand,
  executeWorkOrderRevision,
  reconcileWorkOrderRevision,
  type WorkOrderRevisionAuthority,
} from '../server/field-lab/work-order-revisions';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import inventory from '../docs/program/CYCLE13_VISUAL_APPROVAL_INVENTORY.json';
import { validateVisualInventory } from '../scripts/cycle13-visual-comparison.mjs';

// Independent composition: expected IDs come from the real shared source factory,
// not module-specific fixtures, copied view objects or a second business store.
const folders: string[] = [];
beforeEach(() => {
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  folders
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true }));
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0];
  const original: CrewAssignmentInput = {
    week_start: entry.day,
    timezone: entry.timezone,
    proposal: {
      job_id: entry.target.job_id!,
      day: entry.day,
      source_visit_id: entry.scheduled_visit_id,
      worker_id: entry.worker_id,
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
      start: entry.day + 'T12:00',
      end: entry.day + 'T14:00',
    },
  };
  const growth: FollowUpReadinessInput = {
    window: {
      from: '2026-12-28',
      through: '2027-01-25',
      as_of: '2026-12-28T12:00:00.000Z',
      channel: 'email',
    },
    lead_days: 14,
    overdue_days: 7,
    query: '',
    kind: 'all',
    readiness: 'all',
    job_id: '',
    customer_id: '',
    location_id: '',
    purpose: 'service_follow_up',
    channel_state: 'all',
  };
  return {
    sources,
    gate,
    entry,
    field: {
      schedule: {
        original,
        proposed,
        expected_revision: 0,
        expires_at: Date.now() + 30 * 60_000,
      },
      instructions:
        'Independent staff proposal; preserve the original issued scope.',
    },
    finance: { as_of: new Date().toISOString(), input_revision: 1 },
    customer: {
      query: '',
      customer_id: '',
      location_id: '',
      job_id: '',
      state: '',
    },
    growth,
    intelligence: {
      review_on: entry.day,
      timezone: entry.timezone,
      input_revision: 1,
      ordering: 'EVIDENCE_FIRST' as const,
    },
    advanced: {
      query: '',
      job_id: '',
      kind: 'offline' as const,
      edition: 'property_services' as const,
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const reads = {
  field: (f: Fixture) => reviewWorkOrderRevision(f.sources, f.field, f.gate),
  finance: (f: Fixture) => readFinancialCasework(f.sources, f.finance, f.gate),
  customer: (f: Fixture) =>
    readServicePassportDesk(f.sources, f.customer, f.gate),
  growth: (f: Fixture) => readFollowUpReadiness(f.sources, f.growth, f.gate),
  intelligence: (f: Fixture) =>
    readOperatingNavigation(f.sources, f.intelligence, f.gate),
  advanced: (f: Fixture) => readAddonReviewDesk(f.sources, f.advanced, f.gate),
};
const kinds = Object.keys(reads) as (keyof typeof reads)[];
async function readAll(f: Fixture) {
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
type Views = Awaited<ReturnType<typeof readAll>>;
function snapshot(f: Fixture) {
  return JSON.stringify({
    property: f.sources.property.read(f.sources.company.id),
    entries: f.sources.entries.map((entry) => ({
      canonical: f.sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ),
      release: entry.release.read('staff'),
    })),
  });
}
function denyRetained(v: Views) {
  for (const check of [
    () => assertWorkOrderRevisionCurrentNow(v.field),
    () => assertFinancialCaseworkCurrent(v.finance),
    () => assertServicePassportCurrentNow(v.customer),
    () => assertFollowUpReadinessCurrentNow(v.growth),
    () => assertOperatingNavigationCurrent(v.intelligence),
    () => assertAddonReviewCurrentNow(v.advanced),
  ])
    expect(check).toThrow();
}

// These are complete six-workflow integration cases, not a global timeout change.
// Keep the finite C12-established 90s headroom; product/native/CAS bounds stay exact.
it.each([0, 1, 2])(
  'brand %i follows one exact job across all six desks without changing canonical evidence or invoking authority',
  async (brand) => {
    const f = await fixture(brand),
      before = snapshot(f),
      writers = [
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.estimates, 'revise'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.estimates, 'projection'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
      ],
      network = vi.spyOn(globalThis, 'fetch'),
      ids = vi.spyOn(crypto, 'randomUUID');
    const v = await readAll(f),
      target = f.entry.target;
    const { title, ...fieldReference } = await openWorkOrderRevisionSource(
      v.field,
    );
    const { actor_id: actor, ...publicTarget } = target;
    expect(actor).toBe(f.entry.target.actor_id);
    expect(fieldReference).toEqual(publicTarget);
    expect(title).toBe(v.field.title);
    expect(v.field.instructions).toBe(f.field.instructions);
    expect(v.field.durable_writer).toBe('NOT_CONNECTED');
    expect(v.field.durable_receipt).toBe('UNKNOWN');
    expect(v.field.actual_availability).toBe('UNKNOWN');
    const finance = openFinancialCaseworkJob(v.finance, target.job_id!);
    expect(finance.job.target).toEqual(target);
    expect(finance.job.financial.invoices).toEqual([]);
    expect(finance.job.facts.costs).toBeNull();
    expect(finance.job.invoice.overall).toBe('NO_GO');
    expect(
      finance.job.requirements.some((r) => r.kind === 'canonical_evidence'),
    ).toBe(true);
    const customer = await openServicePassportJob(v.customer, target.job_id!);
    expect(customer.staff.issued_version_id).toBe(target.version_id);
    expect(customer.staff.receipt.id).toBe(f.entry.receipt_id);
    expect(customer.staff.offer_id).toBe(f.entry.offer_id);
    expect(customer.staff.request_scope_association).toBe(
      'EXPLICIT_STAFF_SELECTION_NOT_RECORDED_REQUEST_ESTIMATE_FK',
    );
    expect(customer.customer_safe.scope).toMatchObject({
      job_id: target.job_id,
      estimate_id: target.estimate_id,
      issued_version_id: target.version_id,
    });
    const document = customer.customer_safe.documentation.find(
      (d) => d.report.reference.report_id === f.entry.report_id,
    )!;
    expect(document).toBeDefined();
    const report = await openServicePassportReport(
      customer,
      document.report.reference,
    );
    expect(report.reference).toEqual(document.report.reference);
    const finding = await openServicePassportFinding(
      customer,
      report.observations[0].reference,
    );
    expect(finding.finding.reference).toEqual(report.observations[0].reference);
    expect(selectServicePassportJob(customer)).toBe(target.job_id);
    expect(
      customer.customer_safe.required_proof.every(
        (p) => p.status === 'UNKNOWN',
      ),
    ).toBe(true);
    expect(JSON.stringify(customer.customer_safe)).not.toMatch(
      /unit_cost|supplier|payroll|margin|worker_id|actor_id|internal_notes|PRIVATE|@example|Independent staff proposal/,
    );
    const growth = v.growth.rows.find(
      (row) => row.context.job_id === target.job_id,
    )!;
    expect(growth).toBeDefined();
    const followUp = await openFollowUpReadinessSource(v.growth, growth.key);
    expect(followUp.job_id).toBe(target.job_id);
    expect(growth.plan_reference.id).toBe(f.entry.plan_id);
    expect(growth.current_channel_authority).toBe('UNKNOWN');
    expect(growth.suppression_reference).toBeNull();
    expect(growth.enrollment_reference).toBeNull();
    expect(growth.communication_authority).toBe('BLOCKED');
    const task = v.intelligence.tasks.find(
      (t) => t.job_id === target.job_id && t.source.kind === 'report',
    )!;
    const suggestion = await inspectOperatingNavigationSource(
        v.intelligence,
        task.key,
      ),
      navigate = vi.fn();
    expect(suggestion.target).toEqual(target);
    expect(suggestion.source.id).toBe(f.entry.report_id);
    expect(suggestion.source.version).toBe(f.entry.published_version);
    expect(navigateOperatingSuggestion(suggestion, navigate)).toMatchObject({
      status: 'LOCAL_REVIEW_NAVIGATION_REQUESTED',
      job_id: target.job_id,
      section: 'completion',
      authority: 'PRESENTATION_ONLY',
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      target.job_id,
      'completion',
    );
    const row = v.advanced.rows.find(
      (r) => r.reference.job_id === target.job_id,
    )!;
    const addon = await inspectAddonReviewSource(v.advanced, row.reference);
    expect(selectAddonReviewJob(addon)).toBe(target.job_id);
    expect(openAddonOriginalControl(addon)).toBe(f.sources);
    const issued = addon.references.find((r) => r.kind === 'issued')!;
    expect(
      (await inspectAddonReviewReference(addon, issued)).reference,
    ).toMatchObject({
      id: target.version_id,
      job_id: target.job_id,
      customer_id: target.customer_id,
      location_id: target.location_id,
    });
    expect(Object.isFrozen(addon)).toBe(true);
    for (const authority of [
      v.field.authority,
      v.finance.authority,
      v.growth.authority,
      v.intelligence.authority,
    ])
      expect(Object.values(authority).every((value) => value === false)).toBe(
        true,
      );
    expect(snapshot(f)).toBe(before);
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    expect(ids).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  },
  90_000,
);

it.each(kinds)(
  '%s defaults OFF before source/input getters or serializers',
  async (kind) => {
    const f = await fixture(),
      getter = vi.fn(() => {
        throw Error('Getter executed');
      });
    f.gate.enabled = false;
    const poison = Object.defineProperty({}, 'company', { get: getter });
    Object.defineProperty(poison, 'toJSON', { get: getter });
    f.sources = poison as OperatingSources;
    await expect(reads[kind](f)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each(kinds)(
  '%s rejects a foreign tenant repository rather than borrowing current labels',
  async (kind) => {
    const f = await fixture(),
      other = await fixture(1);
    f.sources.property = other.sources.property;
    await expect(reads[kind](f)).rejects.toThrow();
  },
);
it.each(kinds)(
  '%s detects source-root replacement after an actual awaited hash',
  async (kind) => {
    const f = await fixture(),
      hash = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await hash(...args);
      if (!changed) {
        changed = true;
        f.sources.entries = [...f.sources.entries];
      }
      return value;
    });
    await expect(reads[kind](f)).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('revoked current staff cannot keep any of six retained source reviews or restore them through a new label', async () => {
  const f = await fixture(),
    v = await readAll(f);
  await f.sources.operations.configure(
    f.sources.company.id,
    'active',
    'starter',
    {},
    f.sources.company.id + '-independent-c13-backup',
  );
  await f.sources.operations.revokeOwner(
    f.sources.company.id,
    f.entry.target.actor_id,
  );
  denyRetained(v);
  expect((await reconcileBrowserWorkOrder(v.field)).status).toBe('UNKNOWN');
  expect((await reconcileFollowUpReadiness(v.growth)).status).toBe('UNKNOWN');
  expect((await inspectOperatingNavigation(v.intelligence)).status).toBe(
    'UNKNOWN',
  );
  expect(inspectServicePassportDesk(v.customer).status).toBe('UNKNOWN');
}, 90_000);
it('withdrawing then restoring the shared gate leaves every previous view permanently UNKNOWN', async () => {
  const f = await fixture(),
    v = await readAll(f);
  f.gate.confirmed = false;
  denyRetained(v);
  f.gate.confirmed = true;
  denyRetained(v);
}, 90_000);
it('serializing and copying six genuine views preserves evidence bytes but grants no retained source authority', async () => {
  const f = await fixture(),
    v = await readAll(f);
  denyRetained(structuredClone(v));
  expect(
    (await reconcileBrowserWorkOrder(structuredClone(v.field))).status,
  ).toBe('UNKNOWN');
  expect(
    (await inspectOperatingNavigation(structuredClone(v.intelligence))).status,
  ).toBe('UNKNOWN');
  expect(inspectServicePassportDesk(v.customer).status).toBe(
    'CURRENT_READ_ONLY',
  );
}, 90_000);
it('same-property jobs retain distinct issued/report/request provenance and cannot substitute another customer in a filter', async () => {
  const f = await fixture(),
    first = f.entry,
    second = f.sources.entries[3];
  expect(first.target.location_id).toBe(second.target.location_id);
  expect(first.target.version_id).not.toBe(second.target.version_id);
  const view = await reads.customer(f);
  const a = await openServicePassportJob(view, first.target.job_id!),
    b = await openServicePassportJob(view, second.target.job_id!);
  expect(a.customer_safe.scope.issued_version_id).toBe(first.target.version_id);
  expect(b.customer_safe.scope.issued_version_id).toBe(
    second.target.version_id,
  );
  expect(a.staff.receipt.id).toBe(first.receipt_id);
  expect(b.staff.receipt.id).toBe(second.receipt_id);
  const foreign = f.sources.entries[1];
  await expect(
    readServicePassportDesk(
      f.sources,
      {
        ...f.customer,
        customer_id: foreign.target.customer_id,
        location_id: first.target.location_id!,
        job_id: first.target.job_id!,
      },
      f.gate,
    ),
  ).rejects.toThrow();
});
it('finding navigation rejects a different exact published source position even when wording could match', async () => {
  const f = await fixture(),
    v = await reads.customer(f),
    detail = await openServicePassportJob(v, f.entry.target.job_id!),
    report = detail.customer_safe.documentation[0].report,
    reference = report.observations[0].reference;
  await expect(
    openServicePassportFinding(detail, {
      ...reference,
      source_index: reference.source_index + 1000,
    }),
  ).rejects.toThrow();
  expect(inspectServicePassportDesk(v).status).toBe('UNKNOWN');
});
it.each(['CANCEL', 'REVOKE'] as const)(
  '%s closes the original C12 work-order series even if instructions and revision labels change',
  async (action) => {
    const f = await fixture(),
      view = await reads.field(f),
      before = snapshot(f);
    closeWorkOrderRevision(view, action);
    expect((await reconcileBrowserWorkOrder(view)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    await expect(
      reviewWorkOrderRevision(
        f.sources,
        {
          ...f.field,
          instructions: 'A replacement label cannot authorize another review.',
          schedule: { ...f.field.schedule, expected_revision: 1 },
        },
        f.gate,
      ),
    ).rejects.toThrow();
    expect(snapshot(f)).toBe(before);
  },
);
it('Growth keeps its original cancelled consent review across a fresh filtered desk and a different requested purpose', async () => {
  const f = await fixture(),
    v = await reads.growth(f),
    row = v.rows[0];
  const before = snapshot(f);
  await inspectFollowUpReadinessRequirements(
    v,
    row.key,
    { proposed_on: row.recorded_due_on, plan_kind: 'follow_up' },
    f.gate,
  );
  closeFollowUpReadinessReview(v, row.key, 'REVOKE');
  expect(
    (await reconcileFollowUpReadinessRequirements(v, row.key)).status,
  ).toBe('REVOKED_LOCAL_REVIEW');
  const reread = await readFollowUpReadiness(
    f.sources,
    { ...f.growth, purpose: 'marketing', job_id: row.context.job_id },
    f.gate,
  );
  await expect(
    inspectFollowUpReadinessRequirements(
      reread,
      row.key,
      { proposed_on: row.recorded_due_on, plan_kind: 'renewal' },
      f.gate,
    ),
  ).rejects.toThrow();
  expect(snapshot(f)).toBe(before);
});
it('a saved canonical forecast change remains separate from an old financial review and never fills absent event evidence', async () => {
  const f = await fixture(),
    review = await reads.finance(f),
    detail = openFinancialCaseworkJob(review, f.entry.target.job_id!),
    oldBytes = JSON.stringify(detail),
    raw = f.sources.estimates.readSyntheticPrototypeSources(
      f.entry.target,
    ).job!;
  await f.sources.estimates.projection(f.sources.company.id, raw, {
    ...raw.projection,
    remaining: {
      ...raw.projection.remaining,
      other: raw.projection.remaining.other + 23,
    },
  });
  expect(() => assertFinancialCaseworkCurrent(detail)).toThrow();
  const current = await readFinancialCasework(
    f.sources,
    { ...f.finance, input_revision: 2 },
    f.gate,
  );
  expect(compareFinancialCaseworkReview(detail, current)).toMatchObject({
    status: 'SOURCE_CHANGED',
    replacement: null,
  });
  expect(JSON.stringify(detail)).toBe(oldBytes);
  const fresh = openFinancialCaseworkJob(current, f.entry.target.job_id!);
  expect(fresh.job.facts.costs).toBeNull();
  expect(fresh.job.financial.invoices).toEqual([]);
  expect(
    filterFinancialCasework(current, {
      query: f.entry.target.job_id!,
      kind: 'canonical_evidence',
      job_id: f.entry.target.job_id!,
    }).matching,
  ).toBe(1);
});
it('a canonical synthetic invoice and ledger bind only their exact offer-issued-job chain, not the same-property sibling', async () => {
  const f = await fixture(),
    preview = f.entry.release;
  // Explicit original-engine TEST commands, never browser actions or an operational provider.
  await preview.command('staff', 'create_contract', {
    offer_id: f.entry.offer_id,
    terms: 'Independent synthetic evidence fixture.',
    legal_reference: 'Not genuine legal approval.',
  });
  const contract = preview.read('staff').release_contracts[0];
  await preview.command('customer', 'sign_contract', {
    contract_id: contract.id,
    document_hash: contract.document_hash,
    typed_name: 'Independent synthetic fixture',
    consent: true,
  });
  await preview.command('staff', 'create_invoice', {
    contract_id: contract.id,
  });
  const invoice = preview.read('staff').release_invoices[0],
    amount = invoice.snapshot.schedule[0].amount_minor;
  await preview.command('customer', 'authorize_payment', {
    invoice_id: invoice.id,
    amount_minor: amount,
    consent: true,
  });
  const authorization = preview.read('staff').release_authorizations[0];
  await preview.command('staff', 'synthetic_capture', {
    invoice_id: invoice.id,
    authorization_id: authorization.id,
    amount_minor: amount,
    idempotency_key: crypto.randomUUID(),
    adjusts_event_id: null,
  });
  // The observation cutoff must follow these explicitly created fixture events;
  // the canonical exporter correctly rejects events later than the chosen as-of.
  f.finance.as_of = new Date().toISOString();
  const source = preview.read('staff'),
    before = snapshot(f),
    read = await reads.finance(f),
    selected = openFinancialCaseworkJob(read, f.entry.target.job_id!),
    linked = selected.job.financial.invoices[0];
  expect(linked.linkage).toBe('LINKED');
  expect(linked.issued_version_id).toBe(f.entry.target.version_id);
  expect(linked.offer_id).toBe(f.entry.offer_id);
  expect(linked.contract_id).toBe(contract.id);
  expect(linked.summary?.balance_minor).toBe(
    String(
      verifyLedger(
        invoice,
        source.release_ledger_entries,
        source.release_payment_events,
      ),
    ),
  );
  expect(linked.events.map((e) => e.id).sort()).toEqual(
    source.release_payment_events.map((e) => e.id).sort(),
  );
  expect(linked.ledger.map((e) => e.id).sort()).toEqual(
    source.release_ledger_entries.map((e) => e.id).sort(),
  );
  const sibling = openFinancialCaseworkJob(
    read,
    f.sources.entries[3].target.job_id!,
  );
  expect(sibling.job.target.location_id).toBe(selected.job.target.location_id);
  expect(sibling.job.financial.invoices).toEqual([]);
  expect(selected.job.invoice.overall).toBe('NO_GO');
  expect(selected.job.financial.provider.settlement).toBe('UNKNOWN');
  expect(snapshot(f)).toBe(before);
});
it('competing Growth desk instances consume one original requirements review and cannot create competing consent authority', async () => {
  const f = await fixture(),
    first = await reads.growth(f),
    row = first.rows[0],
    second = await readFollowUpReadiness(
      f.sources,
      { ...f.growth, job_id: row.context.job_id },
      f.gate,
    ),
    before = snapshot(f);
  const results = await Promise.allSettled(
    [first, second].map((view) =>
      inspectFollowUpReadinessRequirements(
        view,
        row.key,
        { proposed_on: row.recorded_due_on, plan_kind: 'follow_up' },
        f.gate,
      ),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  const original = results.find((r) => r.status === 'fulfilled')!;
  if (original.status !== 'fulfilled')
    throw Error('One exact original result required');
  expect(original.value.operational_authority).toBe('BLOCKED');
  expect(
    Object.values(original.value.authority).every((value) => value === false),
  ).toBe(true);
  expect(snapshot(f)).toBe(before);
});
it.each(advancedHandoffKinds)(
  'advanced %s inspects original source references without starting a competing engine or copying a proposal',
  async (kind) => {
    const f = await fixture(),
      before = snapshot(f),
      view = await readAddonReviewDesk(
        f.sources,
        { ...f.advanced, kind },
        f.gate,
      ),
      row = view.rows.find(
        (r) => r.reference.job_id === f.entry.target.job_id,
      )!,
      detail = await inspectAddonReviewSource(view, row.reference);
    expect(view.available_modes).toBe(7);
    expect(view.operational_ready).toBe(false);
    expect(detail.reference.kind).toBe(kind);
    expect(detail.reference.issued_version_id).toBe(f.entry.target.version_id);
    expect(detail.source_references.workflow).toMatchObject({
      plan_id: f.entry.plan_id,
      scheduled_visit_id: f.entry.scheduled_visit_id,
      published_visit_id: f.entry.visit_id,
    });
    const report = detail.references.find((ref) => ref.kind === 'report')!;
    expect(
      (await inspectAddonReviewReference(detail, report)).reference,
    ).toMatchObject({
      id: f.entry.report_id,
      version: f.entry.published_version,
      job_id: f.entry.target.job_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(openAddonOriginalControl(detail)).toBe(f.sources);
    expect(detail.original_lifecycle_hold).toBe(
      'NOT_OBSERVABLE_FROM_SOURCE_READ_USE_ORIGINAL_CONTROL',
    );
    expect(detail.missing_evidence).toMatchObject({
      authenticated_sync: 'UNKNOWN',
      physical_completion: 'UNKNOWN',
      provider: 'UNKNOWN',
      voice_recognition: 'NONE',
      network_vetting: 'UNKNOWN',
    });
    expect(JSON.stringify(detail)).not.toMatch(
      /unit_cost|supplier_name|payroll|internal_notes|PRIVATE|@example/,
    );
    expect(snapshot(f)).toBe(before);
  },
);

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function nativeFixture() {
  const f = await fixture(),
    original = await admitCrewAssignment(
      f.sources,
      f.field.schedule.original,
      f.gate,
    ),
    proposal = await admitCrewAssignment(
      f.sources,
      f.field.schedule.proposed,
      f.gate,
    ),
    folder = mkdtempSync(join(tmpdir(), 'propel-crew-lab-independent-c13-'));
  folders.push(folder);
  const crewPath = join(folder, 'custody.sqlite'),
    path = join(folder, 'proposal-revisions.sqlite'),
    now = Date.now();
  const base: CrewLabCommand = {
    command_id: 'lab-independent-original',
    expected_revision: 0,
    envelope: original.envelope,
    sha256: original.integrity.sha256,
  };
  const authority: ScheduleRevisionAuthority = {
    enabled: true,
    test_only: true,
    clock: () => now,
    checkSource(envelope) {
      const witness = [original, proposal].find(
        (v) => JSON.stringify(v.envelope) === JSON.stringify(envelope),
      );
      if (!witness)
        throw Error('Exact independently retained canonical source required');
      assertCrewAssignmentCurrentNow(witness);
      return witness.integrity.sha256;
    },
  };
  prepareCrewLab(crewPath, authority);
  expect(
    executeCrewTransaction(crewPath, base, authority).receipt?.status,
  ).toBe('RESERVED_LAB_ONLY');
  prepareScheduleRevisionLab(crewPath, path, authority);
  const orders = await readFieldWorkOrders(
      f.sources.property,
      f.sources.company.id,
      f.entry.target.actor_id,
    ),
    order = orders.orders.find(
      (o) => o.source.job_id === f.entry.target.job_id,
    )!;
  const scope = digest(order.scope),
    command: ScheduleRevisionCommand = {
      command_id: 'lab-independent-revision',
      expected_revision: 0,
      previous_receipt_id: null,
      original: base,
      proposal: proposal.envelope,
      proposal_sha256: proposal.integrity.sha256,
      action: 'REVISE',
      expires_at: now + 30 * 60_000,
    };
  const witness: WorkOrderRevisionAuthority = {
    ...authority,
    checkWorkOrder(value) {
      if (
        value.issued_scope_sha256 !== scope ||
        JSON.stringify(value.schedule.original) !== JSON.stringify(base)
      )
        throw Error('Independent work-order witness mismatch');
      return scope;
    },
  };
  return {
    ...f,
    crewPath,
    path,
    base,
    command,
    scope,
    witness,
    bound: bindWorkOrderRevisionCommand(
      command,
      f.field.instructions,
      scope,
      witness,
    ),
  };
}
function rows(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      tables: db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all(),
      attempts: db.prepare('SELECT * FROM attempts ORDER BY command_id').all(),
      receipts: db.prepare('SELECT * FROM receipts ORDER BY command_id').all(),
    };
  } finally {
    db.close();
  }
}
it('a native claimed UNKNOWN cannot be bypassed after journal reopen by changed instructions or a new digest', async () => {
  const f = await nativeFixture(),
    unknownAuthority = {
      ...f.witness,
      afterClaim() {
        throw Error('Simulated interruption after durable original claim');
      },
    };
  expect(
    executeWorkOrderRevision(f.crewPath, f.path, f.bound, unknownAuthority)
      .status,
  ).toBe('UNKNOWN');
  const held = rows(f.path),
    replacement = bindWorkOrderRevisionCommand(
      f.command,
      'Changed text cannot reset the original series hold.',
      f.scope,
      f.witness,
    );
  expect(replacement.schedule.command_id).not.toBe(f.bound.schedule.command_id);
  expect(
    executeWorkOrderRevision(f.crewPath, f.path, replacement, f.witness).status,
  ).toBe('UNKNOWN');
  expect(
    reconcileWorkOrderRevision(f.crewPath, f.path, f.bound, f.witness).status,
  ).toBe('UNKNOWN');
  expect(rows(f.path)).toEqual(held);
  expect(held.receipts).toHaveLength(0);
  expect(held.attempts).toHaveLength(1);
});
it('lost native acknowledgment reconciles only the complete original payload; digest custody stores no operational instruction content', async () => {
  const f = await nativeFixture(),
    originalCrew = readFileSync(f.crewPath),
    before = snapshot(f);
  expect(
    executeWorkOrderRevision(f.crewPath, f.path, f.bound, {
      ...f.witness,
      afterCommit() {
        throw Error('Lost exact acknowledgment');
      },
    }).status,
  ).toBe('UNKNOWN');
  const saved = rows(f.path),
    bytes = JSON.stringify(saved);
  expect(bytes).not.toContain(f.bound.instructions);
  expect(saved.receipts).toHaveLength(1);
  const result = reconcileWorkOrderRevision(
    f.crewPath,
    f.path,
    f.bound,
    f.witness,
  );
  expect(result.status).toBe('EXACT_RECEIPT');
  expect(result.lineage).toMatchObject({
    instructions: f.bound.instructions,
    full_content_persisted: false,
    business_write: false,
    dispatch: false,
  });
  expect(
    reconcileWorkOrderRevision(
      f.crewPath,
      f.path,
      { ...f.bound, instructions: '' },
      f.witness,
    ).status,
  ).toBe('UNKNOWN');
  expect(rows(f.path)).toEqual(saved);
  expect(readFileSync(f.crewPath)).toEqual(originalCrew);
  expect(snapshot(f)).toBe(before);
});
it('visual inventory independently binds original pixels and exact local approval scope without granting new approval', () => {
  const root = new URL('../', import.meta.url).pathname;
  expect(validateVisualInventory(root, inventory)).toEqual({
    locks: 5,
    bindings: 13,
    approvalRecords: 3,
  });
  for (const lock of inventory.locks)
    expect(
      createHash('sha256')
        .update(readFileSync(new URL('../' + lock.path, import.meta.url)))
        .digest('hex'),
    ).toBe(lock.sha256);
  expect(inventory.evidenceGrantsApproval).toBe(false);
  expect(
    inventory.externalOriginals.every(
      (entry) => entry.availability === 'MISSING',
    ),
  ).toBe(true);
  expect(inventory.missingVisualApprovals.map((entry) => entry.status)).toEqual(
    [
      'NO_EXACT_VISUAL_APPROVAL_FOUND_IN_REVIEWED_RECORDS',
      'NO_EXACT_VISUAL_APPROVAL_FOUND_IN_REVIEWED_RECORDS',
    ],
  );
  expect(
    inventory.screenshotCollections.every(
      (entry) =>
        entry.captureCommitBinding === 'UNKNOWN' &&
        entry.approvalGrantedByPresence === false,
    ),
  ).toBe(true);
});
