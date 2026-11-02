import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readAtomicConsentLab,
  assertAtomicConsentCurrentNow,
  inspectAtomicConsentRequirements,
  assertAtomicConsentRequirementsNow,
  reconcileAtomicConsentRequirements,
  openAtomicConsentSource,
  atomicConsentAttemptState,
  type AtomicConsentLabView,
  type AtomicConsentRequirements,
} from './atomic-consent-lab';
import type {
  FollowUpDeskInput,
  FollowUpProposalInput,
} from './follow-up-admission';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

export interface ConsentCancellationInput {
  proposal: FollowUpProposalInput;
  expires_at: number;
}
type State =
  | 'PENDING'
  | 'ACTIVE_LOCAL_REVIEW'
  | 'UNKNOWN'
  | 'CANCELLED_LOCAL_REVIEW'
  | 'REVOKED_LOCAL_REVIEW'
  | 'EXPIRED_LOCAL_REVIEW';
interface SourcesBinding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  desk: AtomicConsentLabView;
}
interface Hold {
  state: State;
  view: object | null;
}
interface Binding {
  source: SourcesBinding;
  input: ConsentCancellationInput;
  signature: string;
  gate: JourneyAdmission;
  original: AtomicConsentRequirements | null;
  hold: Hold;
  last_clock: number;
}
const sourcesMap = new WeakMap<object, SourcesBinding>(),
  reviews = new WeakMap<object, Binding>(),
  holds = new WeakMap<OperatingSources['property'], Map<string, Hold>>();
function enabled(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Consent cancellation review is OFF');
}
function pin(input: ConsentCancellationInput) {
  const f = prototypeFields(input, ['proposal', 'expires_at']);
  if (
    Object.keys(f).length !== 2 ||
    !Number.isSafeInteger(f.expires_at) ||
    Number(f.expires_at) < 0
  )
    throw Error('Explicit finite review expiration required');
  const p = prototypeFields(f.proposal, [
    'candidate_key',
    'proposed_on',
    'purpose',
    'plan_kind',
  ]);
  if (
    Object.keys(p).length !== 4 ||
    Object.values(p).some(
      (v) => typeof v !== 'string' || !v || v.length > 2000,
    ) ||
    !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
      p.purpose as string,
    ) ||
    !['follow_up', 'renewal'].includes(p.plan_kind as string)
  )
    throw Error('Exact primitive blocked follow-up proposal required');
  return {
    value: {
      proposal: p as unknown as FollowUpProposalInput,
      expires_at: Number(f.expires_at),
    },
    signature: JSON.stringify({ proposal: p, expires_at: f.expires_at }),
  };
}
/** Actual existing C11/C10 blocked maintenance records only. No synthetic authority facts. */
export async function readConsentCancellationSources(
  sources: OperatingSources,
  input: FollowUpDeskInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  enabled(gate);
  const capture = captureOperatingSources(sources, gate),
    desk = await readAtomicConsentLab(sources, input, gate);
  capture.check();
  assertAtomicConsentCurrentNow(desk);
  const view = freezePrototype({
    organization_id: desk.organization_id,
    candidates: desk.candidates,
    available_occurrences: desk.available_occurrences,
    matching_occurrences: desk.matching_occurrences,
    coverage: desk.coverage,
    operational_authority: 'BLOCKED' as const,
    browser_writer: 'NOT_CONNECTED' as const,
  });
  sourcesMap.set(view, { sources, capture, desk });
  return view;
}
export type ConsentCancellationSources = Awaited<
  ReturnType<typeof readConsentCancellationSources>
>;
export function assertConsentCancellationSourcesNow(
  view: ConsentCancellationSources,
) {
  const b = sourcesMap.get(view);
  if (!b) throw Error('Exact retained cancellation sources required');
  b.capture.check();
  assertAtomicConsentCurrentNow(b.desk);
}
function check(b: Binding) {
  try {
    enabled(b.gate);
    b.source.capture.check();
    assertAtomicConsentCurrentNow(b.source.desk);
    if (pin(b.input).signature !== b.signature)
      throw Error('Original cancellation proposal changed');
    if (b.original) assertAtomicConsentRequirementsNow(b.original);
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < b.last_clock)
      throw Error('Local review clock moved back');
    b.last_clock = now;
    if (
      now >= b.input.expires_at &&
      ['PENDING', 'ACTIVE_LOCAL_REVIEW'].includes(b.hold.state)
    )
      b.hold.state = 'EXPIRED_LOCAL_REVIEW';
    if (b.hold.state === 'UNKNOWN') throw Error('Terminal UNKNOWN hold');
  } catch (error) {
    b.hold.state = 'UNKNOWN';
    throw error;
  }
}
/** Retains the actual C11 one-use blocked requirements. Cancellation controls affect this review only. */
export async function prepareConsentCancellationReview(
  view: ConsentCancellationSources,
  input: ConsentCancellationInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  enabled(gate);
  assertConsentCancellationSourcesNow(view);
  const source = sourcesMap.get(view)!,
    request = pin(input),
    now = Date.now();
  if (
    !Number.isSafeInteger(now) ||
    request.value.expires_at <= now ||
    request.value.expires_at > now + 60 * 60_000
  )
    throw Error('Future local review expiry within one hour required');
  const candidate = view.candidates.find(
    (c) => c.key === request.value.proposal.candidate_key,
  );
  if (!candidate) throw Error('Exact admitted maintenance record required');
  const key = JSON.stringify([
      view.organization_id,
      candidate.context.customer_id,
      candidate.context.location_id,
      candidate.key,
    ]),
    registry = holds.get(source.sources.property) ?? new Map<string, Hold>();
  holds.set(source.sources.property, registry);
  if (registry.has(key))
    throw Error(
      'Existing local review/UNKNOWN: no new view, purpose, ID or time bypass',
    );
  const hold: Hold = { state: 'PENDING', view: null };
  registry.set(key, hold);
  const b: Binding = {
    source,
    input,
    signature: request.signature,
    gate,
    original: null,
    hold,
    last_clock: now,
  };
  try {
    if (
      atomicConsentAttemptState(source.desk, candidate.key) !== 'NOT_REVIEWED'
    )
      throw Error('Original C11/C10 one-use hold');
    b.original = await inspectAtomicConsentRequirements(
      source.desk,
      request.value.proposal,
      gate,
    );
    check(b);
    const body = {
      mode: 'LOCAL_CONSENT_CANCELLATION_REVIEW' as const,
      envelope: b.original.envelope,
      original_requirements_sha256: b.original.integrity.sha256,
      observed: b.original.observed,
      missing_gates: b.original.missing_gates,
      expires_at: request.value.expires_at,
      operational_authority: 'BLOCKED' as const,
      cancellation_scope: 'SAME_TAB_REVIEW_ONLY' as const,
      browser_writer: 'NOT_CONNECTED' as const,
      consent_mutation: false as const,
      authority: {
        send: false,
        provider: false,
        outbox: false,
        resolve_recipient: false,
        enroll: false,
        financial: false,
      },
    };
    const sha256 = await documentHash(body);
    check(b);
    if (
      (await reconcileAtomicConsentRequirements(b.original)).status !==
      'EXACT_BLOCKED_REQUIREMENTS'
    )
      throw Error('Original blocked requirements UNKNOWN');
    check(b);
    if (hold.state !== 'PENDING') throw Error('Review expired');
    const result = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    hold.state = 'ACTIVE_LOCAL_REVIEW';
    hold.view = result;
    reviews.set(result, b);
    return result;
  } catch (error) {
    hold.state = 'UNKNOWN';
    throw error;
  }
}
export type ConsentCancellationView = Awaited<
  ReturnType<typeof prepareConsentCancellationReview>
>;
export function assertConsentCancellationReviewNow(
  view: ConsentCancellationView,
) {
  const b = reviews.get(view);
  if (!b || b.hold.view !== view)
    throw Error('Exact retained cancellation review required');
  check(b);
}
export function consentCancellationStateNow(view: ConsentCancellationView) {
  assertConsentCancellationReviewNow(view);
  return reviews.get(view)!.hold.state;
}
export function cancelConsentCancellationReview(
  view: ConsentCancellationView,
  action: 'CANCEL' | 'REVOKE',
) {
  assertConsentCancellationReviewNow(view);
  const b = reviews.get(view)!;
  if (
    !['CANCEL', 'REVOKE'].includes(action) ||
    b.hold.state !== 'ACTIVE_LOCAL_REVIEW'
  )
    throw Error('Irrevocable terminal local review');
  b.hold.state =
    action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW';
  return {
    status: b.hold.state,
    send: false as const,
    consent_mutation: false as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
}
export async function reconcileConsentCancellationReview(
  view: ConsentCancellationView,
) {
  const result = {
    status: 'UNKNOWN' as State,
    send: false as const,
    consent_mutation: false as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = reviews.get(view);
  if (!b || b.hold.view !== view) return result;
  try {
    check(b);
    if (
      (await reconcileAtomicConsentRequirements(b.original!)).status !==
      'EXACT_BLOCKED_REQUIREMENTS'
    )
      throw Error('Original UNKNOWN');
    check(b);
    return { ...result, status: b.hold.state };
  } catch {
    b.hold.state = 'UNKNOWN';
    return result;
  }
}
export async function openConsentCancellationSource(
  view: ConsentCancellationView,
) {
  assertConsentCancellationReviewNow(view);
  const b = reviews.get(view)!;
  if ((await reconcileConsentCancellationReview(view)).status === 'UNKNOWN')
    throw Error('Cancellation source UNKNOWN');
  const detail = await openAtomicConsentSource(
    b.source.desk,
    view.envelope.candidate_key,
  );
  assertConsentCancellationReviewNow(view);
  return detail;
}
