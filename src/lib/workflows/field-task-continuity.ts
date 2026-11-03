import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  assertScheduleWorkOrderContinuityNow,
  openScheduleWorkOrderContinuitySource,
  reconcileScheduleWorkOrderContinuity,
  type ScheduleWorkOrderContinuityView,
} from './schedule-work-order-continuity';
import {
  readFieldWorkflow,
  verifyFieldWorkflow,
  type FieldWorkflowView,
} from './field-workflow';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

function on(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit local evidence review required');
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  continuity: ScheduleWorkOrderContinuityView;
  field: FieldWorkflowView;
  gate: JourneyAdmission;
  unknown: boolean;
}
// Opaque references to existing readers only; no task, reservation or business store.
const retained = new WeakMap<object, Binding>();
const held = new WeakSet<object>();
function check(b: Binding) {
  try {
    on(b.gate);
    b.capture.check();
    const job = b.sources.estimates.syntheticJob(
      b.field.source.organization_id,
      b.field.source.job_id,
    );
    if (
      !job ||
      job.lock_revision !== b.field.source.job_revision ||
      job.baseline.issued_version_id !== b.field.source.issued_version_id
    )
      throw Error('Exact field job revision changed');
    if (b.unknown || held.has(b.continuity))
      throw Error('Task evidence UNKNOWN');
    if (
      assertScheduleWorkOrderContinuityNow(b.continuity) !==
      'PREPARED_REVIEW_ONLY'
    )
      throw Error('Exact prepared instruction successor required');
  } catch (error) {
    b.unknown = true;
    held.add(b.continuity);
    throw error;
  }
}
/** Read the original field workflow for the exact prepared predecessor/job/technician/day. */
export async function readFieldTaskEvidence(
  sources: OperatingSources,
  continuity: ScheduleWorkOrderContinuityView,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate); // OFF before source/view reads.
  if (held.has(continuity))
    throw Error('Retained UNKNOWN; no replacement evidence path');
  if (
    assertScheduleWorkOrderContinuityNow(continuity) !== 'PREPARED_REVIEW_ONLY'
  )
    throw Error('Exact original prepared continuity required');
  const capture = captureOperatingSources(sources, gate);
  const e = sources.entries.filter(
    (entry) => entry.target.job_id === continuity.job_id,
  );
  if (e.length !== 1) throw Error('Exact task job unavailable');
  const entry = e[0],
    source = continuity.order.original.envelope;
  if (
    entry.target.organization_id !== continuity.organization_id ||
    entry.target.customer_id !== continuity.customer_id ||
    entry.target.location_id !== continuity.property_id ||
    entry.target.version_id !== continuity.predecessor.source_version ||
    entry.scheduled_visit_id !== source.visit_id ||
    entry.worker_id !== source.worker_id ||
    entry.day !== source.day ||
    entry.timezone !== source.timezone
  )
    throw Error('Exact task source association required');
  let b: Binding | null = null;
  try {
    const field = await readFieldWorkflow(
      sources.property,
      entry.target,
      { day: entry.day, timezone: entry.timezone },
      gate,
    );
    b = { sources, capture, continuity, field, gate, unknown: false };
    check(b);
    if (
      field.source.job_id !== continuity.job_id ||
      field.source.customer_id !== continuity.customer_id ||
      field.source.location_id !== continuity.property_id ||
      field.source.issued_version_id !==
        continuity.predecessor.source_version ||
      field.source.job_revision !== source.job_revision
    )
      throw Error('Field source changed');
    const crew = field.day.crew.filter(
      (worker) => worker.worker_id === source.worker_id,
    );
    if (crew.length !== 1)
      throw Error('Exact assigned technician evidence UNKNOWN');
    const body = {
      mode: 'LOCAL_FIELD_TASK_EVIDENCE' as const,
      source: field.source,
      job: {
        title: field.job.title,
        customer_label: field.job.customer_label,
        property_label: field.job.property_label,
      },
      predecessor: continuity.predecessor,
      instructions: {
        revision: continuity.order.revision,
        text: continuity.order.instructions,
        sha256: continuity.order.integrity.sha256,
      },
      technician_day: {
        day: field.day.day,
        timezone: field.day.timezone,
        worker_id: crew[0].worker_id,
        label: crew[0].label,
        events: crew[0].events,
        actual_availability: 'UNKNOWN' as const,
        time_worked: 'NOT_INFERRED' as const,
      },
      expires_at: continuity.order.expires_at,
      field_integrity: field.integrity.sha256,
      custody: 'SAME_TAB_REFERENCE_ONLY' as const,
      physical_completion: 'UNVERIFIED' as const,
      authority: {
        dispatch: false,
        assign: false,
        record_time: false,
        publish: false,
        communicate: false,
        financial: false,
      },
    };
    const sha256 = await documentHash(body);
    check(b);
    if ((await verifyFieldWorkflow(field)).status !== 'CURRENT')
      throw Error('Exact field evidence UNKNOWN');
    check(b);
    const view = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    retained.set(view, b);
    return view;
  } catch (error) {
    held.add(continuity);
    if (b) b.unknown = true;
    throw error;
  }
}
export type FieldTaskEvidence = Awaited<
  ReturnType<typeof readFieldTaskEvidence>
>;
export function assertFieldTaskEvidenceNow(view: FieldTaskEvidence) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained task evidence required');
  check(b);
}
/** Reconcile only original held readers; no review, successor, retry or business writer. */
export async function reconcileFieldTaskEvidence(view: FieldTaskEvidence) {
  const result = {
    status: 'UNKNOWN' as
      'UNKNOWN' | 'CURRENT_REVIEW_ONLY' | 'CANCELLED' | 'REVOKED' | 'EXPIRED',
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(view);
  if (!b) return result;
  try {
    on(b.gate);
    b.capture.check();
    const original = await reconcileScheduleWorkOrderContinuity(b.continuity);
    on(b.gate);
    b.capture.check();
    if (
      original.status === 'CANCELLED' ||
      original.status === 'REVOKED' ||
      original.status === 'EXPIRED'
    )
      return { ...result, status: original.status };
    check(b);
    if (original.status !== 'PREPARED_REVIEW_ONLY')
      throw Error('Original continuity not current');
    check(b);
    if ((await verifyFieldWorkflow(b.field)).status !== 'CURRENT')
      throw Error('Field evidence changed');
    check(b);
    return { ...result, status: 'CURRENT_REVIEW_ONLY' as const };
  } catch {
    b.unknown = true;
    held.add(b.continuity);
    return result;
  }
}
/** Return to the same immutable predecessor/instructions, never whichever job is newest. */
export async function returnFieldTaskReview(view: FieldTaskEvidence) {
  const b = retained.get(view);
  if (
    !b ||
    (await reconcileFieldTaskEvidence(view)).status !== 'CURRENT_REVIEW_ONLY'
  )
    throw Error('Task source UNKNOWN; exact read only');
  await openScheduleWorkOrderContinuitySource(b.continuity);
  check(b);
  return b.continuity;
}
