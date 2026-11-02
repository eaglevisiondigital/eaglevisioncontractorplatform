import { uuidPattern } from '../../domain/intake';
import { customerPreview } from '../../domain/estimating/customer-preview';
import { projectSyntheticFinancialExport } from '../../domain/finance/export';
import { detached } from '../../domain/jobs/margin-analysis';
import { documentHash } from '../../domain/release/preview';
import type {
  Invoice,
  LedgerEntry,
  PaymentEvent,
} from '../../domain/release/types';
import { completionReviewGuard } from '../job-cost-completion';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { journeyEnabled, type JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFinancialCorrectionSources,
  openFinancialCorrectionException,
  prepareFinancialCorrection,
  reconcileFinancialCorrection,
  type FinancialCorrectionSourceInput,
  type FinancialCorrectionProposal,
  type FinancialCorrectionSources,
  type FinancialCorrectionDetail,
  type FinancialCorrectionPacket,
} from './financial-correction-review';

const denied = () =>
  Error(
    'Exact current local financial evidence required; UNKNOWN permits exact read-only reconciliation only',
  );
/** Actual runtime admission precedes every source/input getter or serializer. */
export function financialEvidenceEnabled(enabled = false) {
  return (
    enabled === true &&
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: 'true',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  );
}
function admit(gate: JourneyAdmission) {
  completionReviewGuard(gate)();
  if (!financialEvidenceEnabled(true)) throw denied();
}
type ExportPacket = Awaited<
  ReturnType<typeof projectSyntheticFinancialExport>
>['packet'];
interface InvoiceEvidence {
  invoice_id: string;
  contract_id: string;
  offer_id: string | null;
  issued_version_id: string | null;
  linkage: 'LINKED' | 'UNLINKED';
  verification: ExportPacket['status'] | 'UNVERIFIED';
  invoice: ExportPacket['invoice'];
  events: ExportPacket['events'];
  ledger: ExportPacket['ledgerEntries'];
  summary:
    | (Omit<
        NonNullable<ExportPacket['summary']>,
        'captured_minor' | 'refunded_minor'
      > & { captured_minor: string | null; refunded_minor: string | null })
    | null;
  source_sha256: string | null;
  missing_evidence: string[];
}
function safeEvent(e: PaymentEvent) {
  return {
    id: e.id,
    invoice_id: e.invoice_id,
    authorization_id: e.authorization_id,
    kind: e.kind,
    adjusts_event_id: e.adjusts_event_id,
    created_at: e.created_at,
    currency: e.currency,
    amount_minor: e.amount_minor,
  };
}
function safeLedger(e: LedgerEntry) {
  return {
    id: e.id,
    invoice_id: e.invoice_id,
    event_id: e.event_id,
    debit_account: e.debit_account,
    credit_account: e.credit_account,
    created_at: e.created_at,
    currency: e.currency,
    amount_minor: e.amount_minor,
  };
}
/** No financial row carries a job ID: the explicit canonical FK chain is required.
 * Similar descriptions/addresses/amounts and even the same property never join jobs. */
async function canonicalEvidence(
  sources: OperatingSources,
  asOf: string,
  check: () => void,
) {
  const jobs = [];
  for (const entry of sources.entries) {
    check();
    const workspace = detached(entry.release.read('staff')),
      target = entry.target,
      job = sources.estimates.readSyntheticPrototypeSources(target).job!;
    const rowSets = [
      workspace.release_invoices,
      workspace.release_contracts,
      workspace.release_offers,
      workspace.release_authorizations,
      workspace.release_payment_events,
      workspace.release_ledger_entries,
    ];
    for (const rows of rowSets) {
      if (
        new Set(rows.map((r) => r.id)).size !== rows.length ||
        rows.some(
          (r) =>
            !uuidPattern.test(r.id) ||
            typeof r.created_at !== 'string' ||
            !Number.isFinite(Date.parse(r.created_at)) ||
            r.organization_id !== target.organization_id ||
            r.customer_id !== target.customer_id,
        )
      )
        throw denied();
    }
    const invoices: InvoiceEvidence[] = [];
    for (const invoice of workspace.release_invoices) {
      if (
        (invoice.snapshot.location !== null &&
          invoice.snapshot.location?.id !== target.location_id) ||
        invoice.snapshot.customer.id !== target.customer_id ||
        invoice.currency !== job.baseline.currency
      )
        throw denied();
      const contract = workspace.release_contracts.find(
          (c) => c.id === invoice.contract_id,
        ),
        offer =
          contract &&
          workspace.release_offers.find((o) => o.id === contract.offer_id),
        events = workspace.release_payment_events.filter(
          (e) => e.invoice_id === invoice.id,
        ),
        ledger = workspace.release_ledger_entries.filter(
          (e) => e.invoice_id === invoice.id,
        );
      const expectedScope = {
        ...customerPreview(entry.release.version),
        internal_test: true,
      };
      const linked =
        contract &&
        offer &&
        offer.id === entry.offer_id &&
        offer.version_id === target.version_id &&
        job.baseline.issued_version_id === target.version_id &&
        entry.release.version.id === target.version_id &&
        invoice.snapshot.location?.id === target.location_id &&
        JSON.stringify(offer.snapshot) === JSON.stringify(expectedScope) &&
        JSON.stringify(contract.document.scope) ===
          JSON.stringify(offer.snapshot) &&
        JSON.stringify(invoice.snapshot) === JSON.stringify(offer.snapshot);
      if (!linked) {
        invoices.push({
          invoice_id: invoice.id,
          contract_id: invoice.contract_id,
          offer_id: offer?.id ?? null,
          issued_version_id: offer?.version_id ?? null,
          linkage: 'UNLINKED',
          verification: 'UNVERIFIED',
          invoice: null,
          events: [],
          ledger: [],
          summary: null,
          source_sha256: null,
          missing_evidence: [
            'Exact invoice/contract/original offer/issued-version/job linkage is absent or conflicting. Amounts remain UNKNOWN.',
          ],
        });
        continue;
      }
      const contractHash = await documentHash(contract.document);
      check();
      if (contractHash !== contract.document_hash) throw denied();
      const exported = await projectSyntheticFinancialExport(
        {
          syntheticFixture: true,
          scope: {
            organizationId: target.organization_id,
            customerId: target.customer_id,
            propertyId: target.location_id,
            invoiceId: invoice.id,
            currency: invoice.currency,
            asOf,
          },
          source: {
            kind: 'release-preview',
            reference: `financial-evidence:${invoice.id}`,
            observedAt: asOf,
            coverage: 'complete',
            outcome: 'known',
            contractId: contract.id,
            eventIds: events.map((e) => e.id),
            ledgerEntryIds: ledger.map((e) => e.id),
          },
          invoice: invoice as Invoice,
          events,
          ledgerEntries: ledger,
        },
        { enabled: true },
      );
      check();
      const p = exported.packet,
        authorizationCoverage = events.every((e) =>
          workspace.release_authorizations.some(
            (a) =>
              a.id === e.authorization_id &&
              a.invoice_id === invoice.id &&
              a.currency === invoice.currency,
          ),
        );
      invoices.push({
        invoice_id: invoice.id,
        contract_id: contract.id,
        offer_id: offer.id,
        issued_version_id: offer.version_id,
        linkage: 'LINKED',
        verification:
          events.length && authorizationCoverage ? p.status : 'UNVERIFIED',
        invoice: p.invoice,
        events: p.events,
        ledger: p.ledgerEntries,
        summary:
          events.length && authorizationCoverage && p.summary
            ? {
                ...p.summary,
                captured_minor: events.some(
                  (e) => e.kind === 'synthetic_capture',
                )
                  ? p.summary.captured_minor
                  : null,
                refunded_minor: events.some(
                  (e) => e.kind === 'synthetic_refund',
                )
                  ? p.summary.refunded_minor
                  : null,
              }
            : null,
        source_sha256: p.integrity.sourceSha256,
        missing_evidence: [
          ...p.reasons,
          ...(!authorizationCoverage
            ? [
                'Exact existing synthetic payment authorization linkage is missing; event coverage and balance remain UNKNOWN.',
              ]
            : []),
          ...(!events.length
            ? [
                'No canonical payment event is recorded; capture/refund amounts and invoice balance remain UNKNOWN.',
              ]
            : []),
        ],
      });
    }
    const linkedIds = new Set(
      invoices.filter((i) => i.linkage === 'LINKED').map((i) => i.invoice_id),
    );
    const unlinked_events = workspace.release_payment_events
        .filter((e) => !linkedIds.has(e.invoice_id))
        .map(safeEvent),
      unlinked_ledger = workspace.release_ledger_entries
        .filter((e) => !linkedIds.has(e.invoice_id))
        .map(safeLedger);
    jobs.push({
      target: { ...target },
      currency: job.baseline.currency,
      source_job_revision: job.lock_revision,
      original_offer_id: entry.offer_id,
      original_receipt_id: entry.receipt_id,
      invoices,
      unlinked_events,
      unlinked_ledger,
      coverage:
        invoices.length &&
        invoices.every((i) => i.verification === 'RECONCILED_SYNTHETIC_ONLY') &&
        !unlinked_events.length &&
        !unlinked_ledger.length
          ? ('VERIFIED_SYNTHETIC_ONLY' as const)
          : ('UNVERIFIED' as const),
      missing_evidence: [
        ...(!invoices.length
          ? [
              'No canonical invoice exists in this exact local source. Invoice amounts and balance remain UNKNOWN.',
            ]
          : []),
        ...(!workspace.release_payment_events.length
          ? [
              'No canonical payment event is recorded. Absence is not zero capture or zero refund.',
            ]
          : []),
        ...(!workspace.release_ledger_entries.length
          ? ['No canonical ledger posting is recorded.']
          : []),
        ...(unlinked_events.length || unlinked_ledger.length
          ? [
              'UNLINKED event/posting evidence cannot establish job financial amounts.',
            ]
          : []),
        'Only this exact local synthetic source snapshot is covered; genuine provider, void and bank settlement evidence is UNKNOWN.',
      ],
      provider: {
        genuine_authentication: 'UNVERIFIED' as const,
        void: 'UNKNOWN' as const,
        settlement: 'UNKNOWN' as const,
      },
    });
    check();
  }
  return jobs;
}
const sourceRecords = new WeakMap<
  object,
  {
    sources: OperatingSources;
    gate: JourneyAdmission;
    check: () => void;
    correction: FinancialCorrectionSources;
  }
>();
const detailRecords = new WeakMap<
  object,
  { check: () => void; correction: FinancialCorrectionDetail }
>();
const packetRecords = new WeakMap<
  object,
  {
    check: () => void;
    correction: FinancialCorrectionPacket;
    uncertain: boolean;
  }
>();

export async function readFinancialEvidenceSources(
  sources: OperatingSources,
  input: FinancialCorrectionSourceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const captured = captureOperatingSources(sources, gate);
  let correction: FinancialCorrectionSources | null = null;
  const check = () => {
    admit(gate);
    captured.check();
    if (correction)
      openFinancialCorrectionException(
        correction,
        correction.baseline.queue[0].id,
      );
  };
  check();
  correction = await readFinancialCorrectionSources(sources, input, gate);
  check();
  const jobs = await canonicalEvidence(
    sources,
    correction.baseline.as_of,
    check,
  );
  check();
  const body = {
    mode: 'LOCAL_CANONICAL_FINANCIAL_EVIDENCE' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    organization_id: captured.organization_id,
    correction,
    jobs,
    authority: 'STAFF_READ_ONLY_NO_FINANCIAL_EXECUTION' as const,
  };
  const sha256 = await documentHash(body);
  check();
  const result = freezePrototype({ ...body, sha256 });
  sourceRecords.set(result, { sources, gate, check, correction });
  return result;
}
export type FinancialEvidenceSources = Awaited<
  ReturnType<typeof readFinancialEvidenceSources>
>;

export function openFinancialEvidenceSource(
  review: FinancialEvidenceSources,
  exceptionId: string,
) {
  const record = sourceRecords.get(review);
  if (!record) throw denied();
  record.check();
  const correction = openFinancialCorrectionException(
      record.correction,
      exceptionId,
    ),
    evidence = review.jobs.find(
      (j) => j.target.job_id === correction.target.job_id,
    );
  if (
    !evidence ||
    JSON.stringify(evidence.target) !== JSON.stringify(correction.target)
  )
    throw denied();
  const result = freezePrototype({
    mode: 'INSPECTED_CANONICAL_FINANCIAL_EVIDENCE' as const,
    source_sha256: review.sha256,
    correction,
    evidence,
  });
  const check = () => {
    record.check();
    openFinancialCorrectionException(record.correction, exceptionId);
  };
  check();
  detailRecords.set(result, { check, correction });
  return result;
}
export type FinancialEvidenceDetail = ReturnType<
  typeof openFinancialEvidenceSource
>;
/** Synchronous render/navigation fence; does not reconcile, replace or replay. */
export function assertFinancialEvidenceCurrent(
  value:
    | FinancialEvidenceSources
    | FinancialEvidenceDetail
    | FinancialEvidencePacket,
) {
  const record =
    sourceRecords.get(value) ??
    detailRecords.get(value) ??
    packetRecords.get(value);
  if (!record || ('uncertain' in record && record.uncertain)) throw denied();
  try {
    record.check();
  } catch (error) {
    if ('uncertain' in record) record.uncertain = true;
    throw error;
  }
}
/** Delegates to the unchanged C11 engine and its canonical repository/job/exception hold.
 * A new note, view or evidence wrapper cannot create a second attempt. */
export async function prepareFinancialEvidenceReview(
  detail: FinancialEvidenceDetail,
  input: FinancialCorrectionProposal,
) {
  const record = detailRecords.get(detail);
  if (!record) throw denied();
  record.check();
  const originalRemaining = prototypeFields(input, [
      'remaining',
      'reason',
      'confirmed',
      'excludes_unpaid_commitments',
      'source_sha256',
      'input_revision',
    ]).remaining,
    inputIdentity = JSON.stringify(detached(input));
  const check = () => {
    record.check();
    if (
      prototypeFields(input, [
        'remaining',
        'reason',
        'confirmed',
        'excludes_unpaid_commitments',
        'source_sha256',
        'input_revision',
      ]).remaining !== originalRemaining ||
      JSON.stringify(detached(input)) !== inputIdentity
    )
      throw denied();
  };
  check();
  const correction = await prepareFinancialCorrection(record.correction, input);
  check();
  if (
    (await reconcileFinancialCorrection(correction)).status !==
    'CURRENT_UNSAVED_REVIEW_ONLY'
  )
    throw denied();
  check();
  const body = {
    mode: 'IMMUTABLE_CANONICAL_FINANCIAL_REVIEW' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    target: { ...correction.target },
    source_sha256: detail.source_sha256,
    correction,
    canonical_before: detail.evidence,
    canonical_after: detail.evidence,
    meaning:
      'Canonical financial evidence is unchanged. This is an unsaved staff forecast proposal, never a ledger correction or customer financial projection.',
    authority: correction.authority,
    custody: correction.custody,
  };
  const sha256 = await documentHash(body);
  check();
  // Final awaited verification also fences the original live proposal and current sources.
  if (
    (await reconcileFinancialCorrection(correction)).status !==
    'CURRENT_UNSAVED_REVIEW_ONLY'
  )
    throw denied();
  check();
  const result = freezePrototype({
    id: `financial-evidence:${sha256}`,
    ...body,
    sha256,
  });
  packetRecords.set(result, { check, correction, uncertain: false });
  return result;
}
export type FinancialEvidencePacket = Awaited<
  ReturnType<typeof prepareFinancialEvidenceReview>
>;
export async function reconcileFinancialEvidenceReview(
  packet: FinancialEvidencePacket,
) {
  const record = packetRecords.get(packet);
  if (!record || record.uncertain)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.check();
    const { id, sha256, ...body } = packet;
    if (
      id !== `financial-evidence:${sha256}` ||
      (await documentHash(body)) !== sha256
    )
      throw denied();
    record.check();
    if (
      (await reconcileFinancialCorrection(record.correction)).status !==
      'CURRENT_UNSAVED_REVIEW_ONLY'
    )
      throw denied();
    record.check();
    return freezePrototype({
      status: 'CURRENT_UNSAVED_REVIEW_ONLY' as const,
      replacement: null,
    });
  } catch {
    record.uncertain = true;
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
