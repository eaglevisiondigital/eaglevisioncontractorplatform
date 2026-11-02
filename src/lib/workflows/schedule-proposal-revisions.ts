import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  admitCrewAssignment,
  assertCrewAssignmentCurrentNow,
  reconcileCrewAssignment,
  openCrewAssignmentJob,
  type CrewAssignmentInput,
  type CrewAssignmentAdmission,
} from './crew-assignment-lab';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

export interface ScheduleProposalRevisionInput {
  original: CrewAssignmentInput;
  proposed: CrewAssignmentInput;
  expected_revision: number;
  expires_at: number;
}
type SessionState =
  | 'PENDING'
  | 'CURRENT_REVIEW_ONLY'
  | 'UNKNOWN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REVOKED';
interface Hold {
  state: SessionState;
  revision: number;
  expires_at: number;
  original_signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  active: object | null;
}
interface Binding {
  input: ScheduleProposalRevisionInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  original: CrewAssignmentAdmission | null;
  proposed: CrewAssignmentAdmission | null;
  hold: Hold;
  last_clock: number;
}
// Same-tab custody only, scoped to the existing repository. No business records or persistence.
const holds = new WeakMap<object, Map<string, Hold>>(),
  retained = new WeakMap<object, Binding>();
function enabled(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit enabled/confirmed proposal review required');
}
function fields(value: unknown, keys: string[]) {
  const f = prototypeFields(value, keys);
  if (Object.keys(f).length !== keys.length)
    throw Error('Exact proposal revision input required');
  return f;
}
function assignment(value: unknown): CrewAssignmentInput {
  const f = fields(value, ['week_start', 'timezone', 'proposal']);
  if (typeof f.week_start !== 'string' || typeof f.timezone !== 'string')
    throw Error('Primitive week/timezone required');
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
  const p = fields(f.proposal, names);
  for (const key of names)
    if (
      (p[key] === null &&
        !['start', 'end', 'hours_start', 'hours_end'].includes(key)) ||
      (p[key] !== null &&
        (typeof p[key] !== 'string' ||
          !(p[key] as string).trim() ||
          (p[key] as string).length > 200))
    )
      throw Error('Primitive source-bound proposal required');
  return {
    week_start: f.week_start,
    timezone: f.timezone,
    proposal: p as unknown as CrewAssignmentInput['proposal'],
  };
}
function pin(input: ScheduleProposalRevisionInput) {
  const f = fields(input, [
    'original',
    'proposed',
    'expected_revision',
    'expires_at',
  ]);
  if (
    !Number.isSafeInteger(f.expected_revision) ||
    Number(f.expected_revision) < 0 ||
    !Number.isSafeInteger(f.expires_at) ||
    Number(f.expires_at) < 0
  )
    throw Error('Exact revision and expiration required');
  const original = assignment(f.original),
    proposed = assignment(f.proposed);
  if (
    original.proposal.job_id !== proposed.proposal.job_id ||
    original.proposal.source_visit_id !== proposed.proposal.source_visit_id ||
    original.timezone !== proposed.timezone
  )
    throw Error('Exact original job/visit/timezone required');
  const value = {
    original,
    proposed,
    expected_revision: Number(f.expected_revision),
    expires_at: Number(f.expires_at),
  };
  return {
    value,
    signature: JSON.stringify(value),
    original_signature: JSON.stringify(original),
  };
}
function check(b: Binding, terminal = false) {
  try {
    enabled(b.gate);
    b.capture.check();
    b.hold.capture.check();
    if (pin(b.input).signature !== b.signature)
      throw Error('Live proposal revision input changed');
    if (b.original) assertCrewAssignmentCurrentNow(b.original);
    if (b.proposed) assertCrewAssignmentCurrentNow(b.proposed);
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < b.last_clock)
      throw Error('Review clock changed');
    b.last_clock = now;
    if (
      now >= b.hold.expires_at &&
      ['PENDING', 'CURRENT_REVIEW_ONLY'].includes(b.hold.state)
    )
      b.hold.state = 'EXPIRED';
    if (
      b.hold.state === 'UNKNOWN' ||
      (!terminal && !['PENDING', 'CURRENT_REVIEW_ONLY'].includes(b.hold.state))
    )
      throw Error('Terminal proposal review hold');
  } catch (error) {
    if (['PENDING', 'CURRENT_REVIEW_ONLY'].includes(b.hold.state))
      b.hold.state = 'UNKNOWN';
    throw error;
  }
}
/** Actual C11 source admission and canonical capacity, with finite same-tab revision custody. */
export async function reviewScheduleProposalRevision(
  sources: OperatingSources,
  input: ScheduleProposalRevisionInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  enabled(gate); // OFF precedes every caller source/input getter or serializer.
  const capture = captureOperatingSources(sources, gate),
    request = pin(input),
    now = Date.now();
  if (
    !Number.isSafeInteger(now) ||
    request.value.expires_at <= now ||
    request.value.expires_at > now + 60 * 60_000
  )
    throw Error('Explicit future expiration within one hour required');
  const entry = capture.entries.find(
    (e) => e.target.job_id === request.value.original.proposal.job_id,
  );
  if (
    !entry ||
    entry.scheduled_visit_id !== request.value.original.proposal.source_visit_id
  )
    throw Error('Admitted original job/visit required');
  const key = JSON.stringify([
    capture.organization_id,
    entry.target.job_id,
    entry.scheduled_visit_id,
  ]);
  let registry = holds.get(sources.estimates);
  if (!registry) {
    registry = new Map();
    holds.set(sources.estimates, registry);
  }
  let hold = registry.get(key);
  if (hold) {
    try {
      hold.capture.check();
    } catch {
      hold.state = 'UNKNOWN';
    }
    if (
      now >= hold.expires_at &&
      ['PENDING', 'CURRENT_REVIEW_ONLY'].includes(hold.state)
    )
      hold.state = 'EXPIRED';
    if (
      hold.state !== 'CURRENT_REVIEW_ONLY' ||
      hold.revision !== request.value.expected_revision ||
      hold.original_signature !== request.original_signature ||
      request.value.expires_at !== hold.expires_at
    )
      throw Error(
        'Retained logical proposal hold; no replay, changed-time or replacement bypass',
      );
  } else {
    if (request.value.expected_revision !== 0)
      throw Error('Exact initial review revision zero required');
    // The root's current gate survives editing a separate human confirmation checkbox.
    const rootGate = fields(sources, [
      'company',
      'operations',
      'estimates',
      'property',
      'entries',
      'gate',
    ]).gate as JourneyAdmission;
    hold = {
      state: 'PENDING',
      revision: 0,
      expires_at: request.value.expires_at,
      original_signature: request.original_signature,
      capture: captureOperatingSources(sources, rootGate),
      active: null,
    };
    registry.set(key, hold);
  }
  hold.state = 'PENDING'; // Before the first await; an uncertain result permanently holds this lineage.
  const b: Binding = {
    input,
    signature: request.signature,
    capture,
    gate,
    original: null,
    proposed: null,
    hold,
    last_clock: now,
  };
  try {
    b.original = await admitCrewAssignment(
      sources,
      request.value.original,
      gate,
    );
    check(b);
    b.proposed = await admitCrewAssignment(
      sources,
      request.value.proposed,
      gate,
    );
    check(b);
    for (const k of [
      'organization_id',
      'actor_id',
      'customer_id',
      'property_id',
      'job_id',
      'job_revision',
      'estimate_id',
      'issued_version_id',
      'issued_version_number',
      'visit_id',
      'visit_revision',
      'plan_id',
      'plan_revision',
    ] as const)
      if (b.original.envelope[k] !== b.proposed.envelope[k])
        throw Error('Immutable original source changed');
    const body = {
      mode: 'LOCAL_SCHEDULE_PROPOSAL_REVISION_REVIEW' as const,
      revision: hold.revision + 1,
      expires_at: hold.expires_at,
      original: {
        envelope: b.original.envelope,
        sha256: b.original.integrity.sha256,
      },
      proposed: {
        envelope: b.proposed.envelope,
        sha256: b.proposed.integrity.sha256,
      },
      capacity: b.proposed.capacity,
      conflicts: b.proposed.conflicts,
      actual_availability: 'UNKNOWN' as const,
      browser_persistence: 'NONE' as const,
      durable_writer: 'NOT_CONNECTED' as const,
      source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
      authority: {
        schedule: false,
        assign: false,
        dispatch: false,
        communicate: false,
        financial: false,
      },
    };
    const sha256 = await documentHash(body);
    check(b);
    if (
      (await reconcileCrewAssignment(b.original)).status !==
      'CURRENT_ADMISSION_ONLY'
    )
      throw Error('Original admission UNKNOWN');
    check(b);
    if (
      (await reconcileCrewAssignment(b.proposed)).status !==
      'CURRENT_ADMISSION_ONLY'
    )
      throw Error('Proposed admission UNKNOWN');
    check(b);
    const view = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    hold.revision++;
    hold.state = 'CURRENT_REVIEW_ONLY';
    hold.active = view;
    retained.set(view, b);
    return view;
  } catch (error) {
    if ((hold.state as SessionState) !== 'EXPIRED') hold.state = 'UNKNOWN';
    throw error;
  }
}
export type ScheduleProposalRevisionView = Awaited<
  ReturnType<typeof reviewScheduleProposalRevision>
>;
export function assertScheduleProposalRevisionCurrentNow(
  view: ScheduleProposalRevisionView,
) {
  const b = retained.get(view);
  if (!b || b.hold.active !== view)
    throw Error('Exact latest retained revision review required');
  check(b);
}
/** Permanent same-tab withdrawal. Never writes a schedule or calls the disposable server lab. */
export function closeScheduleProposalRevision(
  view: ScheduleProposalRevisionView,
  action: 'CANCEL' | 'REVOKE',
) {
  if (!['CANCEL', 'REVOKE'].includes(action))
    throw Error('Explicit cancel/revoke action required');
  assertScheduleProposalRevisionCurrentNow(view);
  const b = retained.get(view)!;
  b.hold.state = action === 'CANCEL' ? 'CANCELLED' : 'REVOKED';
  return {
    status: b.hold.state,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
}
export async function reconcileScheduleProposalRevision(
  view: ScheduleProposalRevisionView,
) {
  const result = {
    status: 'UNKNOWN' as SessionState,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(view);
  if (!b || b.hold.active !== view) return result;
  try {
    check(b, true);
    if (
      (await reconcileCrewAssignment(b.original!)).status !==
      'CURRENT_ADMISSION_ONLY'
    )
      throw Error('Original UNKNOWN');
    check(b, true);
    if (
      (await reconcileCrewAssignment(b.proposed!)).status !==
      'CURRENT_ADMISSION_ONLY'
    )
      throw Error('Proposed UNKNOWN');
    check(b, true);
    return { ...result, status: b.hold.state };
  } catch {
    return result;
  }
}
export async function openScheduleProposalRevisionSource(
  view: ScheduleProposalRevisionView,
) {
  assertScheduleProposalRevisionCurrentNow(view);
  const b = retained.get(view)!;
  if (
    (await reconcileScheduleProposalRevision(view)).status !==
    'CURRENT_REVIEW_ONLY'
  )
    throw Error('Revision source UNKNOWN');
  const detail = await openCrewAssignmentJob(b.proposed!);
  assertScheduleProposalRevisionCurrentNow(view);
  return detail;
}
