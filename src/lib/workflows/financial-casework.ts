import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { completionReviewGuard } from '../job-cost-completion';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { FinancialCorrectionSourceInput } from './financial-correction-review';
import type { FinancialExceptionKind } from './financial-exceptions';
import {
  financialEvidenceEnabled,
  readFinancialEvidenceSources,
  openFinancialEvidenceSource,
  assertFinancialEvidenceCurrent,
  type FinancialEvidenceSources,
} from './financial-evidence-review';

export type FinancialCaseworkKind =
  FinancialExceptionKind | 'canonical_evidence';
export interface FinancialCaseworkFilter {
  query: string;
  kind: 'all' | FinancialCaseworkKind;
  job_id: string | null;
}
export const financialCaseworkEnabled = financialEvidenceEnabled;
const denied = () =>
  Error(
    'Exact current financial casework required; UNKNOWN allows exact read-only reconciliation only',
  );
function admit(gate: JourneyAdmission) {
  completionReviewGuard(gate)();
  if (!financialCaseworkEnabled(true)) throw denied();
}
interface Requirement {
  id: string;
  kind: FinancialCaseworkKind;
  status: string;
  title: string;
  observation: string;
  suggested_review: string;
}
const reviews = new WeakMap<
  object,
  {
    sources: OperatingSources;
    models: readonly object[];
    evidence: FinancialEvidenceSources;
    check: () => void;
    uncertain: boolean;
  }
>();
const details = new WeakMap<
  object,
  {
    review: FinancialCaseworkReview;
    sources: OperatingSources;
    uncertain: boolean;
  }
>();

/** One read composition over C12 and the original canonical calculators/verifier.
 * No correction preparation, financial arithmetic, writer or competing verifier. */
export async function readFinancialCasework(
  sources: OperatingSources,
  input: FinancialCorrectionSourceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // Before any caller source/input getter or serializer.
  const capture = captureOperatingSources(sources, gate);
  const models = [
    sources.operations,
    sources.estimates,
    sources.property,
    ...capture.entries.map((e) => e.release),
  ];
  const evidence = await readFinancialEvidenceSources(sources, input, gate);
  const check = () => {
    admit(gate);
    capture.check();
    assertFinancialEvidenceCurrent(evidence);
  };
  check();
  const baseline = evidence.correction.baseline;
  const jobs = baseline.portfolio.jobs.map((job) => {
    const exceptions = baseline.queue.filter(
      (q) => q.job_id === job.target.job_id,
    );
    if (!exceptions.length) throw denied();
    const inspected = openFinancialEvidenceSource(evidence, exceptions[0].id);
    const raw = sources.estimates.readSyntheticPrototypeSources(
      job.target,
    ).job!;
    const requirements: Requirement[] = exceptions.map((q) => ({
      id: q.id,
      kind: q.kind,
      status: q.status,
      title: q.title,
      observation: q.observation,
      suggested_review: q.suggested_review,
    }));
    if (inspected.evidence.coverage !== 'VERIFIED_SYNTHETIC_ONLY')
      requirements.splice(
        requirements.findIndex((q) => q.kind === 'invoice_readiness'),
        0,
        {
          id: `${job.target.job_id}:canonical-evidence`,
          kind: 'canonical_evidence',
          status: 'UNKNOWN',
          title: 'Canonical financial coverage needs review',
          observation: [
            ...inspected.evidence.missing_evidence,
            ...inspected.evidence.invoices.flatMap((i) => i.missing_evidence),
          ].join(' '),
          suggested_review:
            'Inspect exact invoice, contract, offer, event and posting identities. Missing or unlinked evidence cannot establish a job balance. Genuine provider and settlement evidence remain UNKNOWN.',
        },
      );
    return {
      target: { ...job.target },
      name: job.name,
      customer_name: job.customer_name,
      property_label: job.property_label,
      currency: inspected.correction.currency,
      source: {
        job_revision: raw.lock_revision,
        issued_version_id: job.target.version_id,
        issued_version_number:
          inspected.correction.exception.source.issued_version_number,
        scope_sha256: inspected.correction.exception.source.scope_sha256,
        expense_ids: [...job.expense_ids],
        cost_review_event_ids: raw.events.map((e) => e.id),
        labor_entry_ids: [
          ...job.review.scenario.completion.laborSource.entryIds,
        ],
        locked_period_ids: [
          ...job.review.scenario.completion.laborSource.lockedPeriodIds,
        ],
        original_offer_id: inspected.evidence.original_offer_id,
        original_receipt_id: inspected.evidence.original_receipt_id,
      },
      facts: inspected.correction.before,
      invoice: inspected.correction.invoice,
      financial: inspected.evidence,
      requirements,
      original_exception_ids: exceptions.map((q) => q.id),
    };
  });
  // Preserve the existing exception ordering; the first unresolved requirement
  // determines review order only, never operational urgency or debt.
  const order: FinancialCaseworkKind[] = [
    'coverage',
    'margin',
    'remaining_cost',
    'canonical_evidence',
    'invoice_readiness',
  ];
  jobs.sort(
    (a, b) =>
      order.indexOf(a.requirements[0].kind) -
        order.indexOf(b.requirements[0].kind) ||
      a.target.job_id!.localeCompare(b.target.job_id!),
  );
  check();
  const review = freezePrototype({
    mode: 'LOCAL_FINANCIAL_CASEWORK' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    organization_id: evidence.organization_id,
    as_of: baseline.as_of,
    source_sha256: evidence.sha256,
    jobs,
    order_meaning:
      'Review order only: missing cost coverage, canonical margin warnings, remaining-cost context, canonical evidence gaps, then invoice prerequisites. No urgency, debt or execution priority is inferred.',
    authority: { ...baseline.authority },
    custody: baseline.custody,
  });
  reviews.set(review, { sources, models, evidence, check, uncertain: false });
  return review;
}
export type FinancialCaseworkReview = Awaited<
  ReturnType<typeof readFinancialCasework>
>;

/** A failed fence permanently withholds this retained review; rereads never reset
 * the unchanged C11 correction hold. Copies confer no retained-source identity. */
export function assertFinancialCaseworkCurrent(
  value: FinancialCaseworkReview | FinancialCaseworkDetail,
) {
  const reviewRecord = reviews.get(value);
  const detailRecord = details.get(value);
  if (detailRecord) {
    if (detailRecord.uncertain) throw denied();
    try {
      assertFinancialCaseworkCurrent(detailRecord.review);
    } catch {
      detailRecord.uncertain = true;
      throw denied();
    }
    return;
  }
  if (!reviewRecord || reviewRecord.uncertain) throw denied();
  try {
    reviewRecord.check();
  } catch {
    reviewRecord.uncertain = true;
    throw denied();
  }
}

export function filterFinancialCasework(
  review: FinancialCaseworkReview,
  value: FinancialCaseworkFilter,
) {
  assertFinancialCaseworkCurrent(review);
  const p = prototypeFields(value, ['query', 'kind', 'job_id']);
  if (
    Reflect.ownKeys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 200 ||
    typeof p.kind !== 'string' ||
    ![
      'all',
      'coverage',
      'margin',
      'remaining_cost',
      'invoice_readiness',
      'canonical_evidence',
    ].includes(p.kind) ||
    (p.job_id !== null &&
      (typeof p.job_id !== 'string' ||
        !review.jobs.some((j) => j.target.job_id === p.job_id)))
  )
    throw denied();
  const query = p.query.trim().toLowerCase();
  const jobs = review.jobs.filter(
    (j) =>
      (p.job_id === null || j.target.job_id === p.job_id) &&
      (p.kind === 'all' || j.requirements.some((r) => r.kind === p.kind)) &&
      (!query ||
        [
          j.name,
          j.customer_name,
          j.property_label,
          j.target.job_id,
          j.target.estimate_id,
          j.target.version_id,
          ...j.source.expense_ids,
          ...j.source.cost_review_event_ids,
          ...j.financial.invoices.flatMap((i) => [
            i.invoice_id,
            i.contract_id,
            i.offer_id,
            ...i.events.map((e) => e.id),
            ...i.ledger.map((e) => e.id),
          ]),
          ...j.financial.unlinked_events.map((e) => e.id),
          ...j.financial.unlinked_ledger.map((e) => e.id),
          ...j.requirements.flatMap((r) => [
            r.title,
            r.observation,
            r.suggested_review,
          ]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );
  assertFinancialCaseworkCurrent(review);
  return freezePrototype({
    jobs,
    matching: jobs.length,
    available: review.jobs.length,
  });
}

export function openFinancialCaseworkJob(
  review: FinancialCaseworkReview,
  jobId: string,
) {
  assertFinancialCaseworkCurrent(review);
  const record = reviews.get(review)!;
  if (typeof jobId !== 'string' || jobId.length > 200) throw denied();
  const matches = review.jobs.filter((j) => j.target.job_id === jobId);
  if (matches.length !== 1) throw denied();
  const job = matches[0];
  const evidence = openFinancialEvidenceSource(
    record.evidence,
    job.original_exception_ids[0],
  );
  assertFinancialCaseworkCurrent(review);
  const detail = freezePrototype({
    mode: 'INSPECTED_FINANCIAL_CASEWORK' as const,
    source_sha256: review.source_sha256,
    job,
    evidence,
  });
  details.set(detail, { review, sources: record.sources, uncertain: false });
  return detail;
}
export type FinancialCaseworkDetail = ReturnType<
  typeof openFinancialCaseworkJob
>;

/** Exact read-only comparison. A new explicitly read current review may explain
 * changed saved references, but can never reconcile/replay a correction proposal. */
export function compareFinancialCaseworkReview(
  detail: FinancialCaseworkDetail,
  current?: FinancialCaseworkReview,
) {
  const record = details.get(detail);
  if (!record)
    return freezePrototype({
      status: 'UNKNOWN' as const,
      requires_current_read: true,
      changes: [] as string[],
      replacement: null,
    });
  let priorCurrent = true;
  try {
    assertFinancialCaseworkCurrent(detail);
  } catch {
    priorCurrent = false;
  }
  if (!current)
    return freezePrototype({
      status: priorCurrent
        ? ('CURRENT_REVIEWED_SOURCE' as const)
        : ('UNKNOWN' as const),
      requires_current_read: !priorCurrent,
      changes: [] as string[],
      replacement: null,
    });
  assertFinancialCaseworkCurrent(current);
  const freshRecord = reviews.get(current)!;
  const priorRecord = reviews.get(record.review)!;
  if (
    freshRecord.sources !== record.sources ||
    freshRecord.models.length !== priorRecord.models.length ||
    freshRecord.models.some((model, i) => model !== priorRecord.models[i])
  )
    throw denied();
  const fresh = current.jobs.find(
    (j) => j.target.job_id === detail.job.target.job_id,
  );
  if (
    !fresh ||
    JSON.stringify(fresh.target) !== JSON.stringify(detail.job.target)
  )
    throw denied();
  const changes = (['source', 'facts', 'invoice', 'financial'] as const).filter(
    (key) => JSON.stringify(detail.job[key]) !== JSON.stringify(fresh[key]),
  );
  assertFinancialCaseworkCurrent(current);
  return freezePrototype({
    status: changes.length
      ? ('SOURCE_CHANGED' as const)
      : priorCurrent
        ? ('CURRENT_REVIEWED_SOURCE' as const)
        : ('UNKNOWN' as const),
    requires_current_read: !priorCurrent && !changes.length,
    changes,
    replacement: null,
  });
}
