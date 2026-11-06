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
/** Validate original receipt data without executing its getters. This is a
 * local input check, never a receipt issuer, custody registry or replacement. */
function receiptOwnData(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol')
      throw Error('Plain original task receipt data required');
    return;
  }
  if (
    seen.has(value) ||
    !Object.isFrozen(value) ||
    ![null, Object.prototype, Array.prototype].includes(
      Object.getPrototypeOf(value),
    )
  )
    throw Error('Immutable own-data task receipt required');
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))
      throw Error('Executable task receipt fields forbidden');
    receiptOwnData(descriptors[key].value, seen);
  }
  seen.delete(value);
}
/** Retained receipts must still refer to the exact original source context.
 * This checks a presentation reference, not durable receipt authenticity. */
function originalReceiptContext(review: TaskReceiptReconciliation) {
  const fields = prototypeFields(review, ['view', 'receipt']);
  if (Object.keys(fields).length !== 2)
    throw Error('Original receipt review required');
  const { view, receipt } = fields as unknown as TaskReceiptReconciliation;
  if (!Object.isFrozen(receipt))
    throw Error('Original immutable task receipt required');
  receiptOwnData(receipt);
  // A descriptor-bearing Proxy must not change receipt fields after the current
  // access check. The discarded clone is never a source or receipt authority.
  const snapshot = structuredClone(receipt);
  const keys = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ] as const;
  const identity = prototypeFields(snapshot.identity, keys);
  if (
    Object.keys(identity).length !== keys.length ||
    keys.some((key) => identity[key] !== view.identity[key]) ||
    snapshot.visit_id !== view.evidence.visit_id ||
    snapshot.plan_id !== view.evidence.plan_id
  )
    throw Error('Exact original task receipt source identity required');
  return { view, receipt };
}
/** Access to retained point-in-time detail is checked by its original owner.
 * This does not require unchanged mutable evidence, release custody or authorize replay. */
export function assertTaskReceiptObservationAccess(
  review: TaskReceiptReconciliation,
): void {
  const { view } = originalReceiptContext(review);
  assertSavedRevisionAccess(view);
}
export function inspectTaskReceiptReconciliation(
  review: TaskReceiptReconciliation,
) {
  const { view, receipt } = originalReceiptContext(review);
  assertSavedRevisionCurrent(view);
  return receipt;
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
/** Capture caller-owned reference fields before the original native guards.
 * These local references retain their original opaque owners, not cloned authority. */
function continuityReferences(
  review: TaskReceiptContinuity,
  invalid = 'Original task continuity references required',
): TaskReceiptContinuity {
  const fields = prototypeFields(review, ['receipt', 'graph', 'order']);
  if (Object.keys(fields).length !== 3) throw Error(invalid);
  const receipt = prototypeFields(fields.receipt, ['view', 'receipt']);
  return {
    receipt: receipt as unknown as TaskReceiptReconciliation,
    graph: fields.graph as TaskReceiptContinuity['graph'],
    order: fields.order as TaskReceiptContinuity['order'],
  };
}
export function inspectTaskReceiptContinuity(review: TaskReceiptContinuity) {
  const refs = continuityReferences(review),
    receipt = inspectTaskReceiptReconciliation(refs.receipt),
    graph = inspectTaskRevisionConsistency(refs.graph);
  assertSavedRevisionCurrent(refs.order);
  const original = prototypeFields(receipt, Object.keys(receipt));
  if (
    (['state', 'source_id', 'result_id'] as const).some(
      (key) => original[key] !== graph.receipt[key],
    )
  )
    throw Error(
      'Original receipt custody changed during task continuity; explicitly read only again',
    );
  if (
    JSON.stringify(refs.receipt.view.identity) !==
      JSON.stringify(refs.graph.identity) ||
    JSON.stringify(refs.graph.identity) !== JSON.stringify(refs.order.identity)
  )
    throw Error('Exact work-order task and receipt identity required');
  return { receipt, graph, order: refs.order.evidence };
}
export function inspectTaskReceiptTask(
  review: TaskReceiptContinuity,
  entryId: string,
) {
  const refs = continuityReferences(review),
    current = inspectTaskReceiptContinuity(refs),
    lineage = selectTaskRevisionLineage(refs.graph, entryId),
    task = current.graph.graph.nodes.find(
      (row) => row.id === lineage.selected_id,
    )!;
  const assigned = current.order.crew.filter(
    (worker) => worker.worker_id === task.worker_id,
  );
  if (assigned.length !== 1)
    throw Error('Exact current assigned task worker required');
  return freezePrototype({
    identity: refs.graph.identity,
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
  const refs = continuityReferences(review),
    selected = inspectTaskReceiptTask(refs, entryId),
    source = await readSavedTaskCorrection(refs.receipt.view, selected.task.id);
  inspectTaskReceiptTask(refs, entryId);
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
  const refs = continuityReferences(review),
    source = await verifyTaskReceiptCorrectionSource(refs, entryId);
  inspectTaskReceiptTask(refs, entryId);
  if (!source.can_edit)
    throw Error('Original correction source held or locked; no replay');
  return freezePrototype({
    job_id: refs.graph.identity.job_id,
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
  const refs = continuityReferences(
    previous,
    'Original exact task continuity required',
  );
  if (Object.keys(refs.receipt).length !== 2)
    throw Error('Original task receipt references required');
  assertSavedRevisionAccess(refs.receipt.view);
  assertSavedRevisionAccess(refs.graph);
  assertSavedRevisionAccess(refs.order);
  const identity = refs.receipt.view.identity;
  if (
    jobId !== identity.job_id ||
    JSON.stringify(identity) !== JSON.stringify(refs.graph.identity) ||
    JSON.stringify(identity) !== JSON.stringify(refs.order.identity)
  )
    throw Error('Exact original task context required for reread');
  const next = await readTaskReceiptContinuity(sources, jobId, gate);
  assertSavedRevisionAccess(refs.receipt.view);
  inspectTaskReceiptContinuity(next);
  if (JSON.stringify(next.receipt.view.identity) !== JSON.stringify(identity))
    throw Error('Task reread cannot substitute a customer/property/version');
  return next;
}
