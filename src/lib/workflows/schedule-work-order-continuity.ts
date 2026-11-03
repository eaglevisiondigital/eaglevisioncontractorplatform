import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  reviewScheduleProposalRevision,
  assertScheduleProposalRevisionCurrentNow,
  reconcileScheduleProposalRevision,
  closeScheduleProposalRevision,
  openScheduleProposalRevisionSource,
  type ScheduleProposalRevisionInput,
  type ScheduleProposalRevisionView,
} from './schedule-proposal-revisions';
import {
  reviewWorkOrderRevision,
  assertWorkOrderRevisionCurrentNow,
  reconcileWorkOrderRevision,
  closeWorkOrderRevision,
  openWorkOrderRevisionSource,
  type WorkOrderRevisionView,
} from './work-order-revisions';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

function on(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit local review confirmation required');
}
function exact(value: unknown, keys: string[]) {
  const f = prototypeFields(value, keys);
  if (Object.keys(f).length !== keys.length)
    throw Error('Exact own-data handoff fields required');
  return f;
}
function pin(input: ScheduleProposalRevisionInput) {
  const f = exact(input, [
    'original',
    'proposed',
    'expected_revision',
    'expires_at',
  ]);
  const assignment = (value: unknown) => {
    const a = exact(value, ['week_start', 'timezone', 'proposal']);
    const p = exact(a.proposal, [
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
      typeof a.week_start !== 'string' ||
      typeof a.timezone !== 'string' ||
      Object.values(p).some((v) => v !== null && typeof v !== 'string')
    )
      throw Error('Primitive exact schedule source required');
    return { week_start: a.week_start, timezone: a.timezone, proposal: p };
  };
  if (
    !Number.isSafeInteger(f.expected_revision) ||
    !Number.isSafeInteger(f.expires_at)
  )
    throw Error('Exact revision and expiration required');
  const value = {
    original: assignment(f.original),
    proposed: assignment(f.proposed),
    expected_revision: f.expected_revision,
    expires_at: f.expires_at,
  } as unknown as ScheduleProposalRevisionInput;
  return { value, signature: JSON.stringify(value) };
}
function instruction(input: { instructions: string }) {
  const f = exact(input, ['instructions']);
  if (
    typeof f.instructions !== 'string' ||
    !f.instructions ||
    f.instructions !== f.instructions.trim() ||
    f.instructions.length > 2000
  )
    throw Error('Trimmed instructions of 1–2000 characters required');
  return f.instructions;
}
type State =
  | 'READY_FOR_WORK_ORDER'
  | 'PENDING'
  | 'PREPARED_REVIEW_ONLY'
  | 'CANCELLED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'UNKNOWN';
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  input: ScheduleProposalRevisionInput;
  signature: string;
  scheduleInput: ScheduleProposalRevisionInput;
  schedule: ScheduleProposalRevisionView;
  order: WorkOrderRevisionView | null;
  gate: JourneyAdmission;
  scheduleGate: JourneyAdmission;
  childGate: JourneyAdmission | null;
  state: State;
  lastClock: number;
  attempted: boolean;
  instructionInput: { instructions: string } | null;
  instructionText: string | null;
  preparationGate: JourneyAdmission | null;
}
// Opaque same-tab handoff references only. Existing C12/C13 own logical revision custody.
const retained = new WeakMap<object, Binding>();
function unknown(b: Binding) {
  b.state = 'UNKNOWN';
  b.scheduleGate.confirmed = false;
  try {
    assertScheduleProposalRevisionCurrentNow(b.schedule);
  } catch {
    /* Preserve exact original C12 UNKNOWN. */
  }
  if (b.childGate) b.childGate.confirmed = false;
  if (b.order)
    try {
      assertWorkOrderRevisionCurrentNow(b.order);
    } catch {
      /* Preserve C13/C12 hold. */
    }
}
function check(b: Binding, terminal = false, predecessor = true) {
  try {
    on(b.gate);
    b.capture.check();
    if (pin(b.input).signature !== b.signature)
      throw Error('Retained schedule input changed');
    if (b.preparationGate) on(b.preparationGate);
    if (
      b.instructionInput &&
      instruction(b.instructionInput) !== b.instructionText
    )
      throw Error('Retained instructions changed');
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < b.lastClock)
      throw Error('Review clock changed');
    b.lastClock = now;
    if (
      now >= b.schedule.expires_at &&
      !['CANCELLED', 'REVOKED', 'UNKNOWN'].includes(b.state)
    )
      b.state = 'EXPIRED';
    if (
      b.state === 'UNKNOWN' ||
      (!terminal && ['CANCELLED', 'REVOKED', 'EXPIRED'].includes(b.state))
    )
      throw Error('Terminal handoff; exact read only');
    if (!terminal) {
      if (b.order) assertWorkOrderRevisionCurrentNow(b.order);
      else if (predecessor)
        assertScheduleProposalRevisionCurrentNow(b.schedule);
    }
  } catch (error) {
    if (!['CANCELLED', 'REVOKED', 'EXPIRED'].includes(b.state)) unknown(b);
    throw error;
  }
}
/** First explicit review: retain the actual C12 proposal and exact source without creating work. */
export async function beginScheduleWorkOrderContinuity(
  sources: OperatingSources,
  input: ScheduleProposalRevisionInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate); // OFF precedes source/input reads.
  const capture = captureOperatingSources(sources, gate),
    request = pin(input);
  const scheduleGate = { enabled: true, confirmed: true };
  const schedule = await reviewScheduleProposalRevision(
    sources,
    input,
    scheduleGate,
  );
  try {
    capture.check();
    on(gate);
    if (pin(input).signature !== request.signature)
      throw Error('Live schedule changed');
    assertScheduleProposalRevisionCurrentNow(schedule);
    const e = schedule.proposed.envelope;
    const body = {
      mode: 'LOCAL_SCHEDULE_WORK_ORDER_HANDOFF' as const,
      organization_id: e.organization_id,
      customer_id: e.customer_id,
      property_id: e.property_id,
      job_id: e.job_id,
      schedule,
      source_version: e.issued_version_id,
      custody: 'SAME_TAB_REFERENCE_ONLY' as const,
      actual_availability: 'UNKNOWN' as const,
      durable_writer: 'NOT_CONNECTED' as const,
      authority: {
        dispatch: false,
        schedule: false,
        scope_change: false,
        financial: false,
        communicate: false,
      },
    };
    const sha256 = await documentHash(body);
    capture.check();
    on(gate);
    assertScheduleProposalRevisionCurrentNow(schedule);
    if (pin(input).signature !== request.signature)
      throw Error('Live schedule changed');
    const view = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    retained.set(view, {
      sources,
      capture,
      input,
      signature: request.signature,
      scheduleInput: request.value,
      schedule,
      order: null,
      gate,
      scheduleGate,
      childGate: null,
      state: 'READY_FOR_WORK_ORDER',
      lastClock: Date.now(),
      attempted: false,
      instructionInput: null,
      instructionText: null,
      preparationGate: null,
    });
    return view;
  } catch (error) {
    scheduleGate.confirmed = false;
    try {
      assertScheduleProposalRevisionCurrentNow(schedule);
    } catch {
      /* Original C12 hold remains terminal. */
    }
    throw error;
  }
}
export type ScheduleWorkOrderHandoff = Awaited<
  ReturnType<typeof beginScheduleWorkOrderContinuity>
>;
/** Separate staff action. The exact reviewed proposal becomes the C13 predecessor; no selector fallback. */
export async function prepareScheduleWorkOrderInstructions(
  view: ScheduleWorkOrderHandoff,
  input: { instructions: string },
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate);
  const b = retained.get(view);
  if (!b) throw Error('Exact retained schedule handoff required');
  check(b);
  if (b.attempted || b.state !== 'READY_FOR_WORK_ORDER')
    throw Error(
      'Existing attempt; no duplicate, retry or successor replacement',
    );
  const text = instruction(input);
  b.attempted = true;
  b.state = 'PENDING'; // Reserve before await; never cleared.
  b.instructionInput = input;
  b.instructionText = text;
  b.preparationGate = gate;
  const childGate = { enabled: true, confirmed: true };
  b.childGate = childGate;
  try {
    b.order = await reviewWorkOrderRevision(
      b.sources,
      {
        schedule: {
          ...b.scheduleInput,
          expected_revision: b.schedule.revision,
        },
        instructions: text,
      },
      childGate,
    );
    check(b, false, false);
    on(gate);
    if (
      instruction(input) !== text ||
      b.order.revision !== b.schedule.revision + 1 ||
      JSON.stringify(b.order.proposed) !==
        JSON.stringify(b.schedule.proposed) ||
      JSON.stringify(b.order.original) !== JSON.stringify(b.schedule.original)
    )
      throw Error('Exact predecessor, instructions or successor changed');
    const body = {
      mode: 'LOCAL_SCHEDULE_WORK_ORDER_CONTINUITY' as const,
      organization_id: view.organization_id,
      customer_id: view.customer_id,
      property_id: view.property_id,
      job_id: view.job_id,
      predecessor: {
        revision: b.schedule.revision,
        sha256: b.schedule.integrity.sha256,
        source_version: view.source_version,
      },
      order: b.order,
      authority: view.authority,
      custody: 'SAME_TAB_REFERENCE_ONLY' as const,
    };
    const sha256 = await documentHash(body);
    check(b);
    on(gate);
    if (instruction(input) !== text) throw Error('Live instructions changed');
    const result = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    b.state = 'PREPARED_REVIEW_ONLY';
    retained.set(result, b);
    return result;
  } catch (error) {
    unknown(b);
    throw error;
  }
}
export type ScheduleWorkOrderContinuityView = Awaited<
  ReturnType<typeof prepareScheduleWorkOrderInstructions>
>;
export function assertScheduleWorkOrderContinuityNow(
  view: ScheduleWorkOrderHandoff | ScheduleWorkOrderContinuityView,
) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained continuity required');
  check(b);
  if (b.state === 'PENDING')
    throw Error('Ambiguous pending handoff; read only');
  return b.state;
}
/** Exact reads never execute either review method again. */
export async function reconcileScheduleWorkOrderContinuity(
  view: ScheduleWorkOrderHandoff | ScheduleWorkOrderContinuityView,
) {
  const result = {
    status: 'UNKNOWN' as State,
    replay: 'FORBIDDEN' as const,
    replacement: null,
    durable_receipt: 'UNKNOWN' as const,
  };
  const b = retained.get(view);
  if (!b) return result;
  try {
    check(b, true);
    if (b.state === 'PENDING') return result;
    const r = b.order
      ? await reconcileWorkOrderRevision(b.order)
      : await reconcileScheduleProposalRevision(b.schedule);
    check(b, true);
    if (r.status === 'UNKNOWN') {
      unknown(b);
      return result;
    }
    if (['CANCELLED', 'REVOKED', 'EXPIRED'].includes(r.status))
      b.state = r.status as State;
    return { ...result, status: b.state };
  } catch {
    return result;
  }
}
export function closeScheduleWorkOrderContinuity(
  view: ScheduleWorkOrderHandoff | ScheduleWorkOrderContinuityView,
  action: 'CANCEL' | 'REVOKE',
) {
  if (!['CANCEL', 'REVOKE'].includes(action))
    throw Error('Explicit terminal withdrawal required');
  assertScheduleWorkOrderContinuityNow(view);
  const b = retained.get(view)!;
  const result = b.order
    ? closeWorkOrderRevision(b.order, action)
    : closeScheduleProposalRevision(b.schedule, action);
  b.state = action === 'CANCEL' ? 'CANCELLED' : 'REVOKED';
  return result;
}
export async function openScheduleWorkOrderContinuitySource(
  view: ScheduleWorkOrderHandoff | ScheduleWorkOrderContinuityView,
) {
  assertScheduleWorkOrderContinuityNow(view);
  const b = retained.get(view)!;
  const detail = b.order
    ? await openWorkOrderRevisionSource(b.order)
    : await openScheduleProposalRevisionSource(b.schedule);
  check(b);
  return detail;
}
