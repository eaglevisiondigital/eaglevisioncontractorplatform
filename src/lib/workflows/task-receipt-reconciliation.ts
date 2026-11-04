import { readFieldSavedRevision } from './field-saved-revisions';
import {
  readTaskRevisionConsistency,
  inspectTaskRevisionConsistency,
  selectTaskRevisionLineage,
} from './task-revision-consistency';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readSavedSourceExercise,
  reconcileSavedTaskReceipt,
  readSavedTaskCorrection,
} from './saved-revision-exercise';
import {
  assertSavedRevisionCurrent,
  assertSavedRevisionAccess,
} from './saved-revision-runtime';
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

/** References to original read owners only; no copied command custody or receipt. */
export interface TaskReceiptContinuity {
  readonly receipt: TaskReceiptReconciliation;
  readonly graph: Awaited<ReturnType<typeof readTaskRevisionConsistency>>;
  readonly order: Awaited<ReturnType<typeof readFieldSavedRevision>>;
}
export async function readTaskReceiptContinuity(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const receipt = await readTaskReceiptReconciliation(sources, jobId, gate),
    graph = await readTaskRevisionConsistency(sources, jobId, gate),
    order = await readFieldSavedRevision(sources, jobId, gate);
  const review = Object.freeze({ receipt, graph, order });
  inspectTaskReceiptContinuity(review);
  return review;
}
export function inspectTaskReceiptContinuity(review: TaskReceiptContinuity) {
  if (
    Object.keys(prototypeFields(review, ['receipt', 'graph', 'order']))
      .length !== 3
  )
    throw Error('Original task continuity references required');
  const receipt = inspectTaskReceiptReconciliation(review.receipt),
    graph = inspectTaskRevisionConsistency(review.graph);
  assertSavedRevisionCurrent(review.order);
  if (
    JSON.stringify(review.receipt.view.identity) !==
      JSON.stringify(review.graph.identity) ||
    JSON.stringify(review.graph.identity) !==
      JSON.stringify(review.order.identity)
  )
    throw Error('Exact work-order task and receipt identity required');
  return { receipt, graph, order: review.order.evidence };
}
export function inspectTaskReceiptTask(
  review: TaskReceiptContinuity,
  entryId: string,
) {
  const current = inspectTaskReceiptContinuity(review),
    lineage = selectTaskRevisionLineage(review.graph, entryId),
    task = current.graph.graph.nodes.find(
      (row) => row.id === lineage.selected_id,
    )!;
  const assigned = current.order.crew.filter(
    (worker) => worker.worker_id === task.worker_id,
  );
  if (assigned.length !== 1)
    throw Error('Exact current assigned task worker required');
  return freezePrototype({
    identity: review.graph.identity,
    task,
    assigned_worker: assigned[0],
    assignment_state: current.order.assignment_state,
    receipt_role: lineage.receipt_link,
    custody: current.receipt.state,
    source_id: current.receipt.source_id,
    acknowledged_result_id: current.receipt.result_id,
    successor_ids: task.successor_ids,
    correction_requirement:
      task.review_state === 'CLOSED_SUBMITTED_APPROVED' &&
      task.successor_ids.length === 0
        ? current.receipt.state === 'NOT_ATTEMPTED'
          ? ('VERIFY_ORIGINAL_SOURCE' as const)
          : ('ORIGINAL_CUSTODY_HELD' as const)
        : ('NATIVE_SOURCE_NOT_ELIGIBLE' as const),
    durable_receipt: 'NOT_IMPLEMENTED' as const,
    physical_completion: 'UNVERIFIED' as const,
    availability: 'UNKNOWN' as const,
    replay: 'FORBIDDEN' as const,
    write: false as const,
  });
}
/** An explicit current check delegates eligibility, locks and held attempts to
 * the original owner. It creates neither a writer nor a replacement attempt. */
export async function verifyTaskReceiptCorrectionSource(
  review: TaskReceiptContinuity,
  entryId: string,
) {
  const selected = inspectTaskReceiptTask(review, entryId),
    source = await readSavedTaskCorrection(
      review.receipt.view,
      selected.task.id,
    );
  inspectTaskReceiptTask(review, entryId);
  if (
    source.source_entry_id !== selected.task.id ||
    source.worker_id !== selected.task.worker_id ||
    source.task !== selected.task.task ||
    source.started_at !== selected.task.started_at ||
    source.ended_at !== selected.task.ended_at ||
    source.billable !== selected.task.billable
  )
    throw Error('Exact current original correction source required');
  return source;
}
export async function taskReceiptControlsDestination(
  review: TaskReceiptContinuity,
  entryId: string,
) {
  const source = await verifyTaskReceiptCorrectionSource(review, entryId);
  inspectTaskReceiptTask(review, entryId);
  if (!source.can_edit)
    throw Error('Original correction source held or locked; no replay');
  return freezePrototype({
    job_id: review.graph.identity.job_id,
    step: 'field' as const,
    source_entry_id: source.source_entry_id,
    meaning: 'OPEN_ORIGINAL_CONTROLS_ONLY' as const,
  });
}

/** Explicit reread of the same original source context. Mutable evidence may be
 * stale, but current access and immutable identity must still match. Original
 * attempts/UNKNOWN remain owned by the unchanged native reader. */
export async function rereadTaskReceiptContinuity(
  previous: TaskReceiptContinuity,
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const requested = prototypeFields(gate, ['enabled', 'confirmed']);
  if (requested.enabled !== true || requested.confirmed !== true)
    throw Error('Explicit local current-source reread required');
  if (
    Object.keys(prototypeFields(previous, ['receipt', 'graph', 'order']))
      .length !== 3
  )
    throw Error('Original exact task continuity required');
  if (
    Object.keys(prototypeFields(previous.receipt, ['view', 'receipt']))
      .length !== 2
  )
    throw Error('Original task receipt references required');
  assertSavedRevisionAccess(previous.receipt.view);
  assertSavedRevisionAccess(previous.graph);
  assertSavedRevisionAccess(previous.order);
  const identity = previous.receipt.view.identity;
  if (
    jobId !== identity.job_id ||
    JSON.stringify(identity) !== JSON.stringify(previous.graph.identity) ||
    JSON.stringify(identity) !== JSON.stringify(previous.order.identity)
  )
    throw Error('Exact original task context required for reread');
  const next = await readTaskReceiptContinuity(sources, jobId, gate);
  assertSavedRevisionAccess(previous.receipt.view);
  inspectTaskReceiptContinuity(next);
  if (JSON.stringify(next.receipt.view.identity) !== JSON.stringify(identity))
    throw Error('Task reread cannot substitute a customer/property/version');
  return next;
}
