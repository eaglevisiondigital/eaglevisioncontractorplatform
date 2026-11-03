import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { jobFinancials } from '../../domain/jobs/financials';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  costSavedRevisionsEnabled,
  readCostSavedRevision,
} from './cost-saved-revisions';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
} from './saved-revision-runtime';
import {
  readSavedSourceExercise,
  readSavedMaterialCorrection,
  executeSavedMaterialCorrection,
  reconcileSavedSourceCorrection,
  type SavedSourceExerciseView,
} from './saved-revision-exercise';
export const costCorrectionReviewEnabled = costSavedRevisionsEnabled;
/** Original read handles only. Native reviewExpense and the original shared
 * material-review attempt own writes and uncertainty; no second custody map. */
const reads = new WeakSet<object>();
export async function readCostCorrectionReview(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
  expenseId?: string,
) {
  const admission = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(admission).length !== 2 ||
    admission.enabled !== true ||
    admission.confirmed !== true ||
    !costCorrectionReviewEnabled(true)
  )
    throw Error('Cost correction review is OFF');
  const costs = await readCostSavedRevision(sources, jobId, gate),
    exercise = await readSavedSourceExercise(sources, jobId, gate),
    material = readSavedMaterialCorrection(exercise, expenseId),
    job = sources.estimates.syntheticJob(costs.identity.organization_id, jobId);
  if (
    !job ||
    job.organization_id !== costs.identity.organization_id ||
    job.lock_revision !== costs.evidence.job_revision ||
    job.baseline.issued_version_id !== costs.identity.version_id
  )
    throw Error('Exact canonical job-cost source required');
  const canonical = jobFinancials(job);
  assertSavedRevisionCurrent(costs);
  assertSavedRevisionCurrent(exercise);
  const value = freezePrototype({
    costs,
    exercise,
    material,
    canonical,
    meaning: 'INTERNAL_RECORDED_COST_REVIEW_ONLY' as const,
    financial_execution: false as const,
  });
  reads.add(value);
  return value;
}
export type CostCorrectionReviewRead = Awaited<
  ReturnType<typeof readCostCorrectionReview>
>;
export function assertCostCorrectionReviewAccess(
  value: CostCorrectionReviewRead,
) {
  if (!reads.has(value)) throw Error('Original cost correction read required');
  assertSavedRevisionAccess(value.costs);
  assertSavedRevisionAccess(value.exercise);
}
export function assertCostCorrectionReviewCurrent(
  value: CostCorrectionReviewRead,
) {
  assertCostCorrectionReviewAccess(value);
  assertSavedRevisionCurrent(value.costs);
  assertSavedRevisionCurrent(value.exercise);
}
export async function confirmCostCorrectionReview(
  value: CostCorrectionReviewRead,
  input: Parameters<typeof executeSavedMaterialCorrection>[1],
  confirmed: boolean,
) {
  assertCostCorrectionReviewCurrent(value);
  return executeSavedMaterialCorrection(value.exercise, input, confirmed);
}
/** Exact original receipt inspection only. It cannot retry/replace/review. */
export function reconcileCostCorrectionReview(value: CostCorrectionReviewRead) {
  assertCostCorrectionReviewAccess(value);
  return reconcileSavedSourceCorrection(value.exercise, 'material-review');
}
export type MaterialReviewSource = ReturnType<
  typeof readSavedMaterialCorrection
>;
export type NativeMaterialReviewInput = Parameters<
  typeof executeSavedMaterialCorrection
>[1];
export type OriginalMaterialReviewHandle = SavedSourceExerciseView;
