import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { completionReviewGuard } from '../job-cost-completion';
import type { Operations } from '../operations';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { FinancialCorrectionSourceInput } from './financial-correction-review';
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
const reviewBindings = new WeakMap<
  object,
  { operations: Operations; organization_id: string }
>();
// Same-tab navigation outcome metadata, not a business store. Keying to the
// canonical Operations and exact organization/job survives presentation wrappers,
// saved revisions and source-container replacement. Never key to a fresh review.
const navigationOutcomes = new WeakMap<
  Operations,
  Map<string, 'PENDING' | 'UNKNOWN'>
>();
export async function readFinanceCaseDesk(
  sources: OperatingSources,
  input: FinancialCorrectionSourceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  if (!financeCaseDeskEnabled(true)) throw denied();
  const capture = captureOperatingSources(sources, gate),
    operations = prototypeFields(sources, [
      'company',
      'operations',
      'estimates',
      'property',
      'entries',
      'gate',
    ]).operations as Operations,
    organization_id = capture.organization_id;
  capture.check();
  const review = await readFinanceReviewPath(sources, input, gate);
  capture.check();
  assertFinancialCaseworkCurrent(review);
  reviewBindings.set(review, { operations, organization_id });
  return review;
}
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
    operations: Operations;
    navigation_key: string;
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
  const binding = reviewBindings.get(review);
  if (!binding) throw denied();
  if (
    typeof jobId !== 'string' ||
    (selectedJobId !== undefined && selectedJobId !== jobId)
  )
    throw denied();
  const detail = openFinancialCaseworkJob(review, jobId),
    original = detail.job.original_exception_ids[0];
  if (
    !original ||
    detail.job.target.organization_id !== binding.organization_id
  )
    throw denied();
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
  retained.set(desk, {
    review,
    path,
    uncertain: false,
    navigated: false,
    operations: binding.operations,
    navigation_key: JSON.stringify([binding.organization_id, jobId]),
  });
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
    const record = retained.get(desk)!;
    if (navigationOutcomes.get(record.operations)?.has(record.navigation_key))
      return unknown();
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
 * A thrown/removed host callback holds the canonical org/job UNKNOWN across
 * fresh views and revisions, never a fallback or new attempt. */
export function navigateFinanceCaseDesk(
  desk: FinanceCaseDeskSelection,
  callback: (jobId: string, section?: OperatingJobSection) => void,
  selectedJobId?: string,
) {
  const record = retained.get(desk);
  let claimed = false;
  try {
    assertFinanceCaseDeskCurrent(desk, selectedJobId);
    if (!record || record.navigated || typeof callback !== 'function')
      throw denied();
    let outcomes = navigationOutcomes.get(record.operations);
    if (!outcomes) {
      outcomes = new Map();
      navigationOutcomes.set(record.operations, outcomes);
    }
    if (outcomes.has(record.navigation_key)) throw denied();
    record.navigated = true;
    outcomes.set(record.navigation_key, 'PENDING');
    claimed = true;
    const result = navigateFinanceReviewPath(record.path, (job, section) => {
      assertFinanceCaseDeskCurrent(desk, selectedJobId);
      if (job !== desk.anchor.target.job_id || section !== 'finance')
        throw denied();
      callback(job, section);
    });
    if (result.status === 'UNKNOWN') throw denied();
    assertFinanceCaseDeskCurrent(desk, selectedJobId);
    outcomes.delete(record.navigation_key);
    return freezePrototype({
      status: 'EXACT_FINANCE_DESK_NAVIGATION_REQUESTED' as const,
      anchor: desk.anchor,
    });
  } catch {
    if (record) {
      record.uncertain = true;
      if (claimed)
        navigationOutcomes
          .get(record.operations)!
          .set(record.navigation_key, 'UNKNOWN');
    }
    return unknown();
  }
}
