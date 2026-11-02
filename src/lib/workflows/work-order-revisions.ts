import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFieldWorkOrders,
  fieldWorkOrderBinding,
  openFieldWorkOrder,
  type WorkOrder,
} from '../field-work-orders';
import {
  reviewScheduleProposalRevision,
  assertScheduleProposalRevisionCurrentNow,
  reconcileScheduleProposalRevision,
  closeScheduleProposalRevision,
  openScheduleProposalRevisionSource,
  type ScheduleProposalRevisionInput,
  type ScheduleProposalRevisionView,
} from './schedule-proposal-revisions';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

export interface WorkOrderRevisionInput {
  schedule: ScheduleProposalRevisionInput;
  /** Staff proposal only; never replaces immutable issued scope. */
  instructions: string;
}
function on(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit confirmed work-order proposal required');
}
function pin(input: WorkOrderRevisionInput) {
  const f = prototypeFields(input, ['schedule', 'instructions']);
  if (
    Object.keys(f).length !== 2 ||
    typeof f.instructions !== 'string' ||
    f.instructions !== f.instructions.trim() ||
    !f.instructions ||
    f.instructions.length > 2000
  )
    throw Error(
      'Exact trimmed proposed instructions (1–2000 characters) required',
    );
  const s = prototypeFields(f.schedule, [
    'original',
    'proposed',
    'expected_revision',
    'expires_at',
  ]);
  if (Object.keys(s).length !== 4) throw Error('Exact schedule input required');
  const assignments = ['original', 'proposed'].map((name) => {
    const a = prototypeFields(s[name], ['week_start', 'timezone', 'proposal']);
    const p = prototypeFields(a.proposal, [
      'job_id',
      'day',
      'source_visit_id',
      'worker_id',
      'start',
      'end',
      'hours_start',
      'hours_end',
    ]);
    if (
      Object.keys(a).length !== 3 ||
      Object.keys(p).length !== 8 ||
      typeof a.week_start !== 'string' ||
      typeof a.timezone !== 'string' ||
      Object.values(p).some((v) => v !== null && typeof v !== 'string')
    )
      throw Error('Primitive exact scheduling references required');
    return { week_start: a.week_start, timezone: a.timezone, proposal: p };
  });
  if (
    !Number.isSafeInteger(s.expected_revision) ||
    !Number.isSafeInteger(s.expires_at)
  )
    throw Error('Exact revision and deadline required');
  const value = {
    schedule: {
      original: assignments[0],
      proposed: assignments[1],
      expected_revision: s.expected_revision,
      expires_at: s.expires_at,
    },
    instructions: f.instructions,
  } as unknown as WorkOrderRevisionInput;
  return { value, signature: JSON.stringify(value) };
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  input: WorkOrderRevisionInput;
  signature: string;
  gate: JourneyAdmission;
  scheduleGate: JourneyAdmission;
  schedule: ScheduleProposalRevisionView | null;
  order: WorkOrder | null;
  unknown: boolean;
}
const retained = new WeakMap<object, Binding>();
// Only immutable same-tab review history. C12 owns the logical hold and every revision.
interface Comparison {
  revision: number;
  instructions: string;
  original: ScheduleProposalRevisionView['original'];
  proposed: ScheduleProposalRevisionView['proposed'];
  scope_sha256: string;
}
interface History {
  view: object;
  history: readonly Comparison[];
}
const latest = new WeakMap<object, Map<string, History>>();
function check(b: Binding, terminal = false) {
  try {
    on(b.gate);
    b.capture.check();
    if (b.unknown || pin(b.input).signature !== b.signature)
      throw Error('Work-order input changed / UNKNOWN');
    if (b.order)
      fieldWorkOrderBinding(
        b.sources.property,
        b.capture.organization_id,
        b.capture.actor_id,
        b.order,
      );
    if (b.schedule && !terminal)
      assertScheduleProposalRevisionCurrentNow(b.schedule);
  } catch (error) {
    b.unknown = true;
    b.scheduleGate.confirmed = false;
    if (b.schedule) {
      try {
        assertScheduleProposalRevisionCurrentNow(b.schedule);
      } catch {
        /* C12 permanent UNKNOWN. */
      }
    }
    throw error;
  }
}
/** Reuses canonical work orders and the actual C12 revision engine; no business writer. */
export async function reviewWorkOrderRevision(
  sources: OperatingSources,
  input: WorkOrderRevisionInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate); // OFF must precede every source/input getter.
  const capture = captureOperatingSources(sources, gate),
    request = pin(input);
  const key = JSON.stringify([
    capture.organization_id,
    request.value.schedule.original.proposal.job_id,
    request.value.schedule.original.proposal.source_visit_id,
  ]);
  const registry = latest.get(sources.estimates) ?? new Map<string, History>();
  latest.set(sources.estimates, registry);
  const previous = registry.get(key);
  if (previous)
    assertWorkOrderRevisionCurrentNow(previous.view as WorkOrderRevisionView);
  const b: Binding = {
    sources,
    capture,
    input,
    signature: request.signature,
    gate,
    scheduleGate: { enabled: true, confirmed: true },
    schedule: null,
    order: null,
    unknown: false,
  };
  try {
    const model = await readFieldWorkOrders(
      sources.property,
      capture.organization_id,
      capture.actor_id,
    );
    check(b);
    b.order =
      model.orders.find(
        (o) =>
          o.source.job_id === request.value.schedule.original.proposal.job_id,
      ) ?? null;
    if (!b.order || b.order.assignment_state !== 'KNOWN')
      throw Error('Exact assigned work order UNKNOWN');
    check(b);
    b.schedule = await reviewScheduleProposalRevision(
      sources,
      request.value.schedule,
      b.scheduleGate,
    );
    check(b);
    const e = b.schedule.original.envelope;
    if (
      b.order.source.issued_version_id !== e.issued_version_id ||
      b.order.customer.id !== e.customer_id ||
      b.order.baseline_property?.id !== e.property_id ||
      !b.order.visits.some(
        (v) =>
          v.id === e.visit_id &&
          v.revision === e.visit_revision &&
          v.plan_id === e.plan_id &&
          v.plan_revision === e.plan_revision,
      ) ||
      !b.order.crew.some((w) => w.worker_id === e.worker_id)
    )
      throw Error('Exact original scope/worker/visit binding UNKNOWN');
    const issued_scope = b.order.scope.map((line) => ({ ...line }));
    const scope_sha256 = await documentHash(issued_scope);
    check(b);
    const comparison = {
      revision: b.schedule.revision,
      instructions: request.value.instructions,
      original: b.schedule.original,
      proposed: b.schedule.proposed,
      scope_sha256,
    };
    const body = {
      mode: 'LOCAL_WORK_ORDER_REVISION_REVIEW' as const,
      organization_id: e.organization_id,
      customer_id: e.customer_id,
      property_id: e.property_id,
      job_id: e.job_id,
      title: b.order.title,
      issued_scope,
      ...comparison,
      history: [...(previous?.history ?? []), comparison],
      expires_at: b.schedule.expires_at,
      durable_receipt: 'UNKNOWN' as const,
      durable_writer: 'NOT_CONNECTED' as const,
      instructions_custody: 'SAME_TAB_ONLY' as const,
      actual_availability: 'UNKNOWN' as const,
      source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
      authority: {
        dispatch: false,
        schedule: false,
        scope_change: false,
        financial: false,
        communicate: false,
      },
    };
    const sha256 = await documentHash(body);
    check(b);
    const fresh = await openFieldWorkOrder(
      sources.property,
      capture.organization_id,
      capture.actor_id,
      b.order,
    );
    check(b);
    if (JSON.stringify(fresh) !== JSON.stringify(b.order))
      throw Error('Current work order changed');
    if (
      (await reconcileScheduleProposalRevision(b.schedule)).status !==
      'CURRENT_REVIEW_ONLY'
    )
      throw Error('Exact schedule revision UNKNOWN');
    check(b);
    const view = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    retained.set(view, b);
    registry.set(key, { view, history: body.history });
    return view;
  } catch (error) {
    b.unknown = true;
    b.scheduleGate.confirmed = false;
    if (b.schedule) {
      try {
        assertScheduleProposalRevisionCurrentNow(b.schedule);
      } catch {
        /* Preserve original C12 hold. */
      }
    }
    throw error;
  }
}
export type WorkOrderRevisionView = Awaited<
  ReturnType<typeof reviewWorkOrderRevision>
>;
export function assertWorkOrderRevisionCurrentNow(view: WorkOrderRevisionView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained work-order revision required');
  check(b);
}
export async function reconcileWorkOrderRevision(view: WorkOrderRevisionView) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(view);
  if (!b) return unknown;
  try {
    check(b, true);
    const result = await reconcileScheduleProposalRevision(b.schedule!);
    check(b, true);
    return result;
  } catch {
    return unknown;
  }
}
export function closeWorkOrderRevision(
  view: WorkOrderRevisionView,
  action: 'CANCEL' | 'REVOKE',
) {
  assertWorkOrderRevisionCurrentNow(view);
  return closeScheduleProposalRevision(retained.get(view)!.schedule!, action);
}
export async function openWorkOrderRevisionSource(view: WorkOrderRevisionView) {
  assertWorkOrderRevisionCurrentNow(view);
  const b = retained.get(view)!;
  const detail = await openScheduleProposalRevisionSource(b.schedule!);
  check(b);
  return detail;
}
