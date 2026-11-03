import { documentHash } from '../../domain/release/preview';
import { detached } from '../../domain/jobs/margin-analysis';
import { freezePrototype } from '../program/prototype-source';
import { completionReviewGuard } from '../job-cost-completion';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { FinancialCorrectionSourceInput } from './financial-correction-review';
import {
  openFinancialCaseworkJob,
  assertFinancialCaseworkCurrent,
  type FinancialCaseworkReview,
  type FinancialCaseworkDetail,
} from './financial-casework';
import {
  financeCaseContinuityEnabled,
  readFinanceCaseContinuity,
  financialCaseSourceItems,
  inspectFinanceCaseSource,
  assertFinanceCaseSelectionCurrent,
  type FinanceCaseSourceIdentity,
} from './finance-case-continuity';
import type { OperatingJobSection } from './operating-navigation';

export const financeReviewPathEnabled = financeCaseContinuityEnabled;
const denied = () =>
  Error(
    'Exact current financial exception path required; UNKNOWN permits exact read-only return only',
  );
const unknown = () =>
  freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
const reviews = new WeakMap<
  object,
  { check: () => void; snapshots: Readonly<Record<string, string>> }
>();
const paths = new WeakMap<
  object,
  {
    review: FinancialCaseworkReview;
    detail: FinancialCaseworkDetail;
    uncertain: boolean;
  }
>();
const evidence = new WeakMap<object, { path: FinanceReviewPathSelection }>();

/** Return the original C13 review. Only hashes of actual invoice snapshots are
 * associated privately; canonical cost/event/ledger verification stays unchanged. */
export async function readFinanceReviewPath(
  sources: OperatingSources,
  input: FinancialCorrectionSourceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  if (!financeReviewPathEnabled(true)) throw denied();
  const capture = captureOperatingSources(sources, gate);
  const review = await readFinanceCaseContinuity(sources, input, gate);
  const check = () => {
    capture.check();
    assertFinancialCaseworkCurrent(review);
  };
  check();
  const snapshots: Record<string, string> = {};
  for (const entry of capture.entries) {
    const workspace = detached(entry.release.read('staff'));
    for (const invoice of workspace.release_invoices) {
      snapshots[`${entry.target.job_id}:${invoice.id}`] = await documentHash(
        invoice.snapshot,
      );
      check();
    }
  }
  check();
  reviews.set(review, { check, snapshots: freezePrototype(snapshots) });
  return review;
}
export function openFinanceReviewPath(
  review: FinancialCaseworkReview,
  exceptionId: string,
  selectedJobId?: string,
) {
  const record = reviews.get(review);
  if (!record) throw denied();
  record.check();
  if (
    typeof exceptionId !== 'string' ||
    exceptionId.length > 400 ||
    (selectedJobId !== undefined &&
      (typeof selectedJobId !== 'string' ||
        !selectedJobId ||
        selectedJobId.length > 200))
  )
    throw denied();
  const matches = review.jobs.filter((job) =>
    job.original_exception_ids.includes(exceptionId),
  );
  if (
    matches.length !== 1 ||
    (selectedJobId !== undefined && matches[0].target.job_id !== selectedJobId)
  )
    throw denied();
  const detail = openFinancialCaseworkJob(review, matches[0].target.job_id!),
    exception = detail.job.requirements.find((item) => item.id === exceptionId);
  if (!exception) throw denied();
  const result = freezePrototype({
    mode: 'EXACT_FINANCIAL_EXCEPTION_REVIEW_PATH' as const,
    anchor: {
      exception_id: exceptionId,
      target: { ...detail.job.target },
      job_revision: detail.job.source.job_revision,
      issued_scope_sha256: detail.job.source.scope_sha256,
      source_sha256: review.source_sha256,
      as_of: review.as_of,
    },
    exception,
    name: detail.job.name,
    customer_name: detail.job.customer_name,
    property_label: detail.job.property_label,
    coverage: detail.job.facts,
    invoice: detail.job.invoice,
    sources: financialCaseSourceItems(detail),
    meaning:
      'One retained original exception. Readiness is not permission to issue, pay or change a ledger.',
  });
  record.check();
  paths.set(result, { review, detail, uncertain: false });
  return result;
}
export type FinanceReviewPathSelection = ReturnType<
  typeof openFinanceReviewPath
>;
export function assertFinanceReviewPathCurrent(
  path: FinanceReviewPathSelection,
) {
  const record = paths.get(path);
  if (!record || record.uncertain) throw denied();
  try {
    reviews.get(record.review)!.check();
    assertFinancialCaseworkCurrent(record.detail);
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
export function inspectFinanceReviewEvidence(
  path: FinanceReviewPathSelection,
  input: FinanceCaseSourceIdentity,
) {
  assertFinanceReviewPathCurrent(path);
  const record = paths.get(path)!,
    selected = inspectFinanceCaseSource(
      record.review,
      path.anchor.target.job_id!,
      input,
    );
  const invoices = record.detail.job.financial.invoices.filter(
    (invoice) => invoice.invoice_id === selected.item?.invoice_id,
  );
  const invoice = invoices.length === 1 ? invoices[0] : null;
  const event =
    selected.identity.kind === 'event'
      ? invoice?.events.find((event) => event.id === selected.identity.id)
      : null;
  const posting =
    selected.identity.kind === 'posting'
      ? invoice?.ledger.find((posting) => posting.id === selected.identity.id)
      : null;
  const result = freezePrototype({
    anchor: path.anchor,
    selection: selected,
    invoice_source: invoice
      ? {
          id: invoice.invoice_id,
          contract_id: invoice.contract_id,
          offer_id: invoice.offer_id,
          issued_version_id: invoice.issued_version_id,
          linkage: invoice.linkage,
          verification: invoice.verification,
          snapshot_sha256:
            reviews.get(record.review)!.snapshots[
              `${path.anchor.target.job_id}:${invoice.invoice_id}`
            ] ?? null,
          canonical_source_sha256: invoice.source_sha256,
          summary: invoice.summary,
        }
      : null,
    event: event
      ? {
          id: event.id,
          kind: event.kind,
          authorization_id: event.authorization_id,
          adjusts_event_id: event.adjusts_event_id,
          created_at: event.created_at,
          amount_minor: selected.item?.amount_minor ?? null,
        }
      : null,
    posting: posting
      ? {
          id: posting.id,
          event_id: posting.event_id,
          debit_account: posting.debit_account,
          credit_account: posting.credit_account,
          created_at: posting.created_at,
          amount_minor: selected.item?.amount_minor ?? null,
        }
      : null,
    identity_meaning:
      'Events and postings have immutable IDs/content, not invented version fields. Amounts and reconciliation come only from the existing canonical verifier.',
  });
  assertFinanceCaseSelectionCurrent(selected);
  assertFinanceReviewPathCurrent(path);
  evidence.set(result, { path });
  return result;
}
export type FinanceReviewEvidence = ReturnType<
  typeof inspectFinanceReviewEvidence
>;
export function assertFinanceReviewEvidenceCurrent(
  value: FinanceReviewEvidence,
) {
  const record = evidence.get(value);
  if (!record) throw denied();
  assertFinanceReviewPathCurrent(record.path);
  assertFinanceCaseSelectionCurrent(value.selection);
}
export function returnFinanceReviewPath(path: FinanceReviewPathSelection) {
  try {
    assertFinanceReviewPathCurrent(path);
    return freezePrototype({
      status: 'CURRENT_EXACT_CASE_RETURN' as const,
      anchor: path.anchor,
      replacement: null,
    });
  } catch {
    return unknown();
  }
}
export function navigateFinanceReviewPath(
  path: FinanceReviewPathSelection,
  callback: (jobId: string, section?: OperatingJobSection) => void,
) {
  try {
    assertFinanceReviewPathCurrent(path);
    if (typeof callback !== 'function') throw denied();
    const jobId = path.anchor.target.job_id!;
    assertFinanceReviewPathCurrent(path);
    callback(jobId, 'finance');
    return freezePrototype({
      status: 'ORIGINAL_FINANCE_REVIEW_REQUESTED' as const,
      return_anchor: path.anchor,
    });
  } catch {
    const record = paths.get(path);
    if (record) record.uncertain = true;
    return unknown();
  }
}
