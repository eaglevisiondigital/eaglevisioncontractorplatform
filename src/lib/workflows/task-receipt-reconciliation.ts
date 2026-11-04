import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readSavedSourceExercise,
  reconcileSavedTaskReceipt,
} from './saved-revision-exercise';
import { assertSavedRevisionCurrent } from './saved-revision-runtime';
import { freezePrototype, prototypeFields } from '../program/prototype-source';

/** Explicit read-only action over the original correction claim. It never
 * acknowledges, completes, retries or creates a native correction. */
export async function readTaskReceiptReconciliation(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const view = await readSavedSourceExercise(sources, jobId, gate),
    receipt = await reconcileSavedTaskReceipt(view);
  assertSavedRevisionCurrent(view);
  return freezePrototype({ view, receipt });
}
export type TaskReceiptReconciliation = Awaited<
  ReturnType<typeof readTaskReceiptReconciliation>
>;
export function inspectTaskReceiptReconciliation(
  review: TaskReceiptReconciliation,
) {
  const fields = prototypeFields(review, ['view', 'receipt']);
  if (Object.keys(fields).length !== 2)
    throw Error('Original receipt review required');
  assertSavedRevisionCurrent(review.view);
  return review.receipt;
}
