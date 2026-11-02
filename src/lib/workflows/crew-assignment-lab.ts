import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readPortfolioScheduling,
  reconcilePortfolioScheduling,
  openPortfolioSchedulingJob,
  type PortfolioSchedulingProposal,
  type PortfolioSchedulingView,
} from './portfolio-scheduling';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';
import { capacityDay, capacityWindow } from '../../domain/field/crew-capacity';

export interface CrewAssignmentInput {
  week_start: string;
  timezone: string;
  proposal: PortfolioSchedulingProposal;
}
function pin(input: CrewAssignmentInput) {
  const keys = ['week_start', 'timezone', 'proposal'];
  const f = prototypeFields(input, keys);
  if (Object.keys(f).length !== keys.length)
    throw Error('Exact assignment input required');
  const names = [
    'job_id',
    'day',
    'source_visit_id',
    'worker_id',
    'start',
    'end',
    'hours_start',
    'hours_end',
  ];
  const p = prototypeFields(f.proposal, names);
  if (
    Object.keys(p).length !== names.length ||
    typeof f.week_start !== 'string' ||
    typeof f.timezone !== 'string'
  )
    throw Error('Exact assignment proposal required');
  for (const k of names)
    if (
      p[k] !== null &&
      (typeof p[k] !== 'string' ||
        !(p[k] as string).trim() ||
        (p[k] as string).length > 200)
    )
      throw Error('Primitive proposal required');
  const result = {
    week_start: f.week_start,
    timezone: f.timezone,
    proposal: p as unknown as PortfolioSchedulingProposal,
  };
  return { value: result, signature: JSON.stringify(result) };
}
interface Binding {
  input: CrewAssignmentInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  board: PortfolioSchedulingView;
}
const retained = new WeakMap<object, Binding>();
function check(b: Binding) {
  b.capture.check();
  if (pin(b.input).signature !== b.signature)
    throw Error('Assignment proposal changed');
}
export function assertCrewAssignmentCurrentNow(
  admission: CrewAssignmentAdmission,
) {
  const b = retained.get(admission);
  if (!b) throw Error('Exact retained admission required');
  check(b);
}
/** Browser-safe admission only. It never opens a durable store or reserves a worker. */
export async function admitCrewAssignment(
  sources: OperatingSources,
  input: CrewAssignmentInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    request = pin(input);
  const p = request.value.proposal;
  const board = await readPortfolioScheduling(
    sources,
    {
      week_start: request.value.week_start,
      timezone: request.value.timezone,
      job_id: '',
      worker_id: '',
      proposals: [p],
    },
    gate,
  );
  const binding: Binding = {
    input,
    signature: request.signature,
    capture,
    board,
  };
  check(binding);
  const job = board.jobs.find((j) => j.source.job_id === p.job_id)!;
  const visit = job.visits.find((v) => v.id === p.source_visit_id)!;
  const day = board.days.find((d) => d.day === p.day)!;
  const lane = day.lanes.find((l) => l.worker_id === p.worker_id)!;
  const bounds = capacityDay(p.day, board.timezone);
  const window =
    p.start === null
      ? null
      : capacityWindow(p.start, p.end!, board.timezone, bounds);
  const hours =
    p.hours_start === null
      ? null
      : capacityWindow(p.hours_start, p.hours_end!, board.timezone, bounds);
  const envelope = {
    mode: 'DISPOSABLE_CREW_RESERVATION_ADMISSION' as const,
    organization_id: board.organization_id,
    actor_id: board.reviewer_id,
    customer_id: job.customer.id,
    property_id: job.property.id,
    job_id: job.source.job_id,
    job_revision: job.source.job_revision,
    estimate_id: job.source.estimate_id,
    issued_version_id: job.source.issued_version_id,
    issued_version_number: job.source.issued_version_number,
    visit_id: visit.id,
    visit_revision: visit.revision,
    plan_id: visit.plan_id,
    plan_revision: visit.plan_revision,
    worker_id: p.worker_id,
    day: p.day,
    timezone: board.timezone,
    start: window?.start ?? null,
    end: window?.end ?? null,
    hours_start: hours?.start ?? null,
    hours_end: hours?.end ?? null,
    source_sha256: board.integrity.sha256,
    canonical_conflict_count: lane.conflicts.length,
    canonical_capacity_state: lane.capacity?.capacity_state ?? 'UNKNOWN',
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    actual_availability: 'UNKNOWN' as const,
    authority: {
      assign: false,
      dispatch: false,
      schedule: false,
      communicate: false,
      financial: false,
    },
  };
  const sha256 = await documentHash(envelope);
  check(binding);
  if (
    (await reconcilePortfolioScheduling(board)).status !== 'CURRENT_REVIEW_ONLY'
  )
    throw Error('Exact source UNKNOWN');
  check(binding);
  const result = freezePrototype({
    envelope,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
    jobs: board.jobs,
    capacity: lane.capacity,
    conflicts: lane.conflicts,
    browser_persistence: 'NONE' as const,
    durable_writer: 'NOT_CONNECTED' as const,
  });
  retained.set(result, binding);
  return result;
}
export type CrewAssignmentAdmission = Awaited<
  ReturnType<typeof admitCrewAssignment>
>;
export type CrewAssignmentEnvelope = CrewAssignmentAdmission['envelope'];
export async function reconcileCrewAssignment(
  admission: CrewAssignmentAdmission,
) {
  const result = {
    status: 'UNKNOWN' as 'UNKNOWN' | 'CURRENT_ADMISSION_ONLY',
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(admission);
  if (!b) return result;
  try {
    check(b);
    if (
      (await reconcilePortfolioScheduling(b.board)).status !==
      'CURRENT_REVIEW_ONLY'
    )
      return result;
    check(b);
    return { ...result, status: 'CURRENT_ADMISSION_ONLY' as const };
  } catch {
    return result;
  }
}
export async function openCrewAssignmentJob(
  admission: CrewAssignmentAdmission,
) {
  const b = retained.get(admission);
  if (
    !b ||
    (await reconcileCrewAssignment(admission)).status !==
      'CURRENT_ADMISSION_ONLY'
  )
    throw Error('Admission UNKNOWN');
  const result = await openPortfolioSchedulingJob(
    b.board,
    admission.envelope.job_id,
  );
  check(b);
  return result;
}
