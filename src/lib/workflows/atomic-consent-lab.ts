import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFollowUpDesk,
  assertFollowUpCurrentNow,
  prepareFollowUpAdmission,
  reconcileFollowUpAdmission,
  openFollowUpSource,
  followUpAttemptState,
  type FollowUpDeskInput,
  type FollowUpDeskView,
  type FollowUpProposalInput,
  type FollowUpAdmissionView,
} from './follow-up-admission';
import { documentHash } from '../../domain/release/preview';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
interface DeskBinding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  desk: FollowUpDeskView;
}
const desks = new WeakMap<object, DeskBinding>();
export async function readAtomicConsentLab(
  sources: OperatingSources,
  input: FollowUpDeskInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    desk = await readFollowUpDesk(sources, input, gate);
  capture.check();
  assertFollowUpCurrentNow(desk);
  const view = freezePrototype({
    organization_id: desk.organization_id,
    candidates: desk.candidates,
    available_occurrences: desk.available_occurrences,
    matching_occurrences: desk.matching_occurrences,
    coverage: desk.coverage,
    planning_sha256: desk.planning_integrity.sha256,
    operational_authority: 'BLOCKED' as const,
    atomic_source_auth: 'UNVERIFIED' as const,
  });
  desks.set(view, { sources, capture, desk });
  return view;
}
export type AtomicConsentLabView = Awaited<
  ReturnType<typeof readAtomicConsentLab>
>;
export function assertAtomicConsentCurrentNow(view: AtomicConsentLabView) {
  const b = desks.get(view);
  if (!b) throw Error('Exact retained atomic review required');
  b.capture.check();
  assertFollowUpCurrentNow(b.desk);
}
export function atomicConsentAttemptState(
  view: AtomicConsentLabView,
  key: string,
) {
  const b = desks.get(view);
  if (!b) return 'UNKNOWN';
  try {
    assertAtomicConsentCurrentNow(view);
    return followUpAttemptState(b.desk, key);
  } catch {
    return 'UNKNOWN';
  }
}
interface ReviewBinding {
  view: AtomicConsentLabView;
  key: string;
  proposal: FollowUpProposalInput;
  signature: string;
  review: FollowUpAdmissionView;
  gate: JourneyAdmission;
}
const reviews = new WeakMap<object, ReviewBinding>();
function signature(input: FollowUpProposalInput) {
  const f = prototypeFields(input, [
    'candidate_key',
    'proposed_on',
    'purpose',
    'plan_kind',
  ]);
  if (
    Object.keys(f).length !== 4 ||
    Object.values(f).some((v) => typeof v !== 'string')
  )
    throw Error('Exact primitive consent proposal required');
  return JSON.stringify(f);
}
/** Reuse the actual C10 one-use blocked review. No positive fixture enters this projection. */
export async function inspectAtomicConsentRequirements(
  view: AtomicConsentLabView,
  input: FollowUpProposalInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const confirmation = prototypeFields(gate, ['enabled', 'confirmed']);
  if (confirmation.enabled !== true || confirmation.confirmed !== true)
    throw Error('Atomic requirements review is OFF');
  assertAtomicConsentCurrentNow(view);
  const b = desks.get(view)!,
    original = signature(input),
    review = await prepareFollowUpAdmission(b.desk, input, gate);
  assertAtomicConsentCurrentNow(view);
  if (signature(input) !== original) throw Error('Consent proposal changed');
  const candidate = view.candidates.find((c) => c.key === input.candidate_key)!;
  const envelope = {
    mode: 'LOCAL_ATOMIC_CONSENT_REQUIREMENTS_SOURCE' as const,
    organization_id: review.organization_id,
    actor_id: b.capture.actor_id,
    customer_id: review.context.customer_id,
    property_id: review.context.location_id,
    job_id: review.context.job_id,
    issued_version_id: review.context.issued_version_id,
    candidate_key: input.candidate_key,
    plan_id: candidate.selection.source.plan_id,
    source_revision: candidate.selection.source.plan_revision,
    source_sha256: view.planning_sha256,
    blocked_review_sha256: review.integrity.sha256,
    purpose: review.proposal.purpose,
    channel: review.channel,
    proposed_on: review.proposal.proposed_on,
    operational_authority: 'BLOCKED' as const,
  };
  const sha256 = await documentHash(envelope);
  assertAtomicConsentCurrentNow(view);
  if (signature(input) !== original) throw Error('Consent proposal changed');
  const current = await reconcileFollowUpAdmission(b.desk, input.candidate_key);
  assertAtomicConsentCurrentNow(view);
  if (
    signature(input) !== original ||
    current.status !== 'EXACT_BLOCKED_REVIEW' ||
    current.review !== review
  )
    throw Error('Exact admission UNKNOWN');
  const result = freezePrototype({
    envelope,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
    observed: {
      channel: review.observed_contact_v1_state,
      current_channel: 'UNKNOWN' as const,
      purpose: review.purpose_consent,
      suppression: review.suppression,
      enrollment: review.recurring_enrollment,
    },
    missing_gates: review.missing_gates,
    required_atomic_facts: [
      'EXACT_SOURCE_REVISION',
      'CURRENT_PRINCIPAL',
      'PURPOSE',
      'OPAQUE_RECIPIENT_REFERENCE',
      'ENROLLMENT',
      'SUPPRESSION',
      'AUTHORIZED_SENDER',
      'CURRENT_TIMESTAMP',
      'SOURCE_REVOCATION',
    ] as const,
    authority: {
      send: false,
      outbox: false,
      resolve_recipient: false,
      provider: false,
      financial: false,
    },
    browser_writer: 'NOT_CONNECTED' as const,
  });
  reviews.set(result, {
    view,
    key: input.candidate_key,
    proposal: input,
    signature: original,
    review,
    gate,
  });
  return result;
}
export type AtomicConsentRequirements = Awaited<
  ReturnType<typeof inspectAtomicConsentRequirements>
>;
export type AtomicConsentEnvelope = AtomicConsentRequirements['envelope'];
export function assertAtomicConsentRequirementsNow(
  review: AtomicConsentRequirements,
) {
  const b = reviews.get(review);
  if (!b) throw Error('Exact retained requirements required');
  assertAtomicConsentCurrentNow(b.view);
  const g = prototypeFields(b.gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Original confirmation withdrawn');
  if (signature(b.proposal) !== b.signature)
    throw Error('Original consent proposal changed');
}
export async function reconcileAtomicConsentRequirements(
  review: AtomicConsentRequirements,
) {
  const unknown = {
    status: 'UNKNOWN' as 'UNKNOWN' | 'EXACT_BLOCKED_REQUIREMENTS',
    replay: 'FORBIDDEN' as const,
    replacement: null,
    send: false as const,
  };
  const b = reviews.get(review);
  if (!b) return unknown;
  try {
    assertAtomicConsentRequirementsNow(review);
    const current = await reconcileFollowUpAdmission(
      desks.get(b.view)!.desk,
      b.key,
    );
    assertAtomicConsentRequirementsNow(review);
    return current.status === 'EXACT_BLOCKED_REVIEW' &&
      current.review === b.review
      ? { ...unknown, status: 'EXACT_BLOCKED_REQUIREMENTS' as const }
      : unknown;
  } catch {
    return unknown;
  }
}
export async function openAtomicConsentSource(
  view: AtomicConsentLabView,
  key: string,
) {
  assertAtomicConsentCurrentNow(view);
  const result = await openFollowUpSource(desks.get(view)!.desk, key);
  assertAtomicConsentCurrentNow(view);
  return result;
}
