import { freezePrototype } from '../program/prototype-source';
import {
  assertFinancialCaseworkCurrent,
  openFinancialCaseworkJob,
  filterFinancialCasework,
  type FinancialCaseworkReview,
  type FinancialCaseworkFilter,
} from './financial-casework';
import {
  financeReviewPathEnabled,
  readFinanceReviewPath,
  openFinanceReviewPath,
  assertFinanceReviewPathCurrent,
  inspectFinanceReviewEvidence,
  navigateFinanceReviewPath,
  type FinanceReviewPathSelection,
} from './finance-review-path';
import type { FinanceCaseSourceIdentity } from './finance-case-continuity';
import type { OperatingJobSection } from './operating-navigation';

// The desk reads the unchanged canonical financial composition. No new calculator,
// correction proposal, ledger, invoice, accounting export or business store.
export const financeCaseDeskEnabled = financeReviewPathEnabled;
export const readFinanceCaseDesk = readFinanceReviewPath;
export const assertFinanceCaseDeskReviewCurrent =
  assertFinancialCaseworkCurrent;
export const filterFinanceCaseDesk = filterFinancialCasework;
export type FinanceCaseDeskReview = FinancialCaseworkReview;
export type FinanceCaseDeskFilter = FinancialCaseworkFilter;
const denied = () =>
  Error(
    'Exact current financial desk context required; no alternate source or replay',
  );
const unknown = () =>
  freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
const retained = new WeakMap<
  object,
  {
    review: FinancialCaseworkReview;
    path: FinanceReviewPathSelection;
    uncertain: boolean;
    navigated: boolean;
  }
>();

/** One retained job context exposes all original requirements and exact sources,
 * eliminating a second exception selection merely to inspect canonical evidence. */
export function openFinanceCaseDesk(
  review: FinancialCaseworkReview,
  jobId: string,
  selectedJobId?: string,
) {
  assertFinancialCaseworkCurrent(review);
  if (
    typeof jobId !== 'string' ||
    (selectedJobId !== undefined && selectedJobId !== jobId)
  )
    throw denied();
  const detail = openFinancialCaseworkJob(review, jobId),
    original = detail.job.original_exception_ids[0];
  if (!original) throw denied();
  const path = openFinanceReviewPath(review, original, jobId);
  const desk = freezePrototype({
    mode: 'RETAINED_FINANCIAL_CASE_DESK' as const,
    anchor: path.anchor,
    job: detail.job,
    sources: path.sources,
    accounting: {
      canonical_coverage: detail.job.financial.coverage,
      missing_evidence: detail.job.financial.missing_evidence,
      status: 'BLOCKED_NO_OPERATIONAL_ACCOUNTING_AUTHORITY' as const,
      meaning:
        'Original invoice/event/posting verification only. Provider authentication, settlement and accounting acceptance remain separate gates; no export or ledger write is enabled.',
    },
    meaning:
      'Staff-only saved financial context. Missing costs are not zero; forecast margin is not settled profit and invoice requirements grant no issuance authority.',
  });
  assertFinanceReviewPathCurrent(path);
  retained.set(desk, { review, path, uncertain: false, navigated: false });
  return desk;
}
export type FinanceCaseDeskSelection = ReturnType<typeof openFinanceCaseDesk>;
export function assertFinanceCaseDeskCurrent(
  desk: FinanceCaseDeskSelection,
  selectedJobId?: string,
) {
  const record = retained.get(desk);
  if (!record || record.uncertain) throw denied();
  try {
    if (
      selectedJobId !== undefined &&
      selectedJobId !== desk.anchor.target.job_id
    )
      throw denied();
    assertFinancialCaseworkCurrent(record.review);
    assertFinanceReviewPathCurrent(record.path);
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
export function inspectFinanceCaseDeskSource(
  desk: FinanceCaseDeskSelection,
  source: FinanceCaseSourceIdentity,
  selectedJobId?: string,
) {
  assertFinanceCaseDeskCurrent(desk, selectedJobId);
  const evidence = inspectFinanceReviewEvidence(
    retained.get(desk)!.path,
    source,
  );
  assertFinanceCaseDeskCurrent(desk, selectedJobId);
  return evidence;
}
export function returnFinanceCaseDesk(
  desk: FinanceCaseDeskSelection,
  selectedJobId?: string,
) {
  try {
    assertFinanceCaseDeskCurrent(desk, selectedJobId);
    return freezePrototype({
      status: 'CURRENT_EXACT_DESK_RETURN' as const,
      anchor: desk.anchor,
      replacement: null,
    });
  } catch {
    return unknown();
  }
}
/** Presentation-only callback; one claimed synchronous attempt per retained desk.
 * A thrown/removed host callback remains UNKNOWN, never a fallback or new attempt. */
export function navigateFinanceCaseDesk(
  desk: FinanceCaseDeskSelection,
  callback: (jobId: string, section?: OperatingJobSection) => void,
  selectedJobId?: string,
) {
  const record = retained.get(desk);
  try {
    assertFinanceCaseDeskCurrent(desk, selectedJobId);
    if (!record || record.navigated || typeof callback !== 'function')
      throw denied();
    record.navigated = true;
    const result = navigateFinanceReviewPath(record.path, (job, section) => {
      assertFinanceCaseDeskCurrent(desk, selectedJobId);
      if (job !== desk.anchor.target.job_id || section !== 'finance')
        throw denied();
      callback(job, section);
    });
    if (result.status === 'UNKNOWN') throw denied();
    assertFinanceCaseDeskCurrent(desk, selectedJobId);
    return freezePrototype({
      status: 'EXACT_FINANCE_DESK_NAVIGATION_REQUESTED' as const,
      anchor: desk.anchor,
    });
  } catch {
    if (record) record.uncertain = true;
    return unknown();
  }
}
