import type { JourneyAdmission } from './journey-runtime';
import type { OperatingSources } from './operating-center-runtime';
import {
  readFollowUpReadiness,
  assertFollowUpReadinessCurrentNow,
  reconcileFollowUpReadiness,
  openFollowUpReadinessSource,
  inspectFollowUpReadinessRequirements,
  reconcileFollowUpReadinessRequirements,
  closeFollowUpReadinessReview,
  type FollowUpReadinessInput,
  type FollowUpReadinessView,
} from './follow-up-readiness';
import {
  assertConsentCancellationReviewNow,
  type ConsentCancellationView,
} from './consent-cancellation-review';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { maintenanceDate } from '../../domain/property/maintenance';
import { documentHash } from '../../domain/release/preview';

function on(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit local maintenance confirmation required');
}
export interface MaintenancePlanningProposal {
  proposed_on: string;
  plan_kind: 'follow_up' | 'renewal';
}
function pin(input: MaintenancePlanningProposal) {
  const f = prototypeFields(input, ['proposed_on', 'plan_kind']);
  if (
    Object.keys(f).length !== 2 ||
    typeof f.proposed_on !== 'string' ||
    !['follow_up', 'renewal'].includes(f.plan_kind as string)
  )
    throw Error('Exact human date and planning kind required');
  maintenanceDate(f.proposed_on);
  return {
    value: {
      proposed_on: f.proposed_on,
      plan_kind: f.plan_kind as MaintenancePlanningProposal['plan_kind'],
    },
    signature: JSON.stringify(f),
  };
}
/** Existing C13 read model remains the only occurrence/consent source; no new eligibility engine. */
export async function readMaintenancePlanningContinuity(
  sources: OperatingSources,
  input: FollowUpReadinessInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate);
  const view = await readFollowUpReadiness(sources, input, gate);
  assertFollowUpReadinessCurrentNow(view);
  roots.set(view, sources.property);
  return view;
}
type State =
  | 'READY_FOR_REQUIREMENTS'
  | 'PENDING'
  | 'BLOCKED_LOCAL_REVIEW'
  | 'CANCELLED_LOCAL_REVIEW'
  | 'REVOKED_LOCAL_REVIEW'
  | 'EXPIRED_LOCAL_REVIEW'
  | 'UNKNOWN';
interface Binding {
  view: FollowUpReadinessView;
  key: string;
  gate: JourneyAdmission;
  state: State;
  attempted: boolean;
  input: MaintenancePlanningProposal | null;
  signature: string | null;
  preparationGate: JourneyAdmission | null;
  original: ConsentCancellationView | null;
  lastClock: number;
  registry: Map<string, Binding>;
  attemptKey: string;
}
// Exact references to original C13/C12 views; not a maintenance, consent or enrollment store.
const retained = new WeakMap<object, Binding>();
const roots = new WeakMap<
  FollowUpReadinessView,
  OperatingSources['property']
>();
// Reserve the handoff itself before the delegated C12 async admission starts.
// A lost acknowledgement before C12's own claim must not reopen a new view/purpose/date.
const attempts = new WeakMap<
  OperatingSources['property'],
  Map<string, Binding>
>();
function check(b: Binding, terminal = false) {
  try {
    on(b.gate);
    assertFollowUpReadinessCurrentNow(b.view);
    if (b.preparationGate) on(b.preparationGate);
    if (b.input && pin(b.input).signature !== b.signature)
      throw Error('Retained human planning input changed');
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < b.lastClock)
      throw Error('Planning review clock changed');
    b.lastClock = now;
    if (b.original) {
      assertConsentCancellationReviewNow(b.original);
      if (
        now >= b.original.expires_at &&
        ['PENDING', 'BLOCKED_LOCAL_REVIEW'].includes(b.state)
      )
        b.state = 'EXPIRED_LOCAL_REVIEW';
    }
    if (
      b.state === 'UNKNOWN' ||
      (!terminal &&
        [
          'CANCELLED_LOCAL_REVIEW',
          'REVOKED_LOCAL_REVIEW',
          'EXPIRED_LOCAL_REVIEW',
        ].includes(b.state))
    )
      throw Error('Terminal review; exact reconciliation only');
  } catch (error) {
    if (
      ![
        'CANCELLED_LOCAL_REVIEW',
        'REVOKED_LOCAL_REVIEW',
        'EXPIRED_LOCAL_REVIEW',
      ].includes(b.state)
    )
      b.state = 'UNKNOWN';
    throw error;
  }
}
/** Inspect a displayed occurrence first; retain its exact job/property/plan/purpose without another selector. */
export async function selectMaintenancePlanningSource(
  view: FollowUpReadinessView,
  key: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate);
  assertFollowUpReadinessCurrentNow(view);
  if (typeof key !== 'string' || !key || key.length > 2000)
    throw Error('Exact displayed occurrence key required');
  const row = view.rows.find((r) => r.key === key);
  if (!row)
    throw Error(
      'Exact displayed occurrence required; no nearest or latest fallback',
    );
  const root = roots.get(view);
  if (!root) throw Error('Exact continuity reader source required');
  const registry = attempts.get(root) ?? new Map<string, Binding>();
  attempts.set(root, registry);
  const source = await openFollowUpReadinessSource(view, key);
  on(gate);
  assertFollowUpReadinessCurrentNow(view);
  const body = {
    mode: 'LOCAL_MAINTENANCE_SOURCE_HANDOFF' as const,
    organization_id: view.organization_id,
    occurrence: row,
    requested_purpose: view.requested_purpose,
    source,
    source_sha256: view.integrity.sha256,
    coverage: view.coverage,
    authority: view.authority,
  };
  const sha256 = await documentHash(body);
  on(gate);
  assertFollowUpReadinessCurrentNow(view);
  const selection = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(selection, {
    view,
    key,
    gate,
    state: 'READY_FOR_REQUIREMENTS',
    attempted: false,
    input: null,
    signature: null,
    preparationGate: null,
    original: null,
    lastClock: Date.now(),
    registry,
    attemptKey: JSON.stringify([
      view.organization_id,
      row.context.customer_id,
      row.context.location_id,
      key,
    ]),
  });
  return selection;
}
export type MaintenancePlanningSelection = Awaited<
  ReturnType<typeof selectMaintenancePlanningSource>
>;
/** Separate explicit action over the original blocked C12 one-use review. No sender/worker is connected. */
export async function prepareMaintenancePlanningContinuity(
  selection: MaintenancePlanningSelection,
  input: MaintenancePlanningProposal,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate);
  const b = retained.get(selection);
  if (!b) throw Error('Exact retained maintenance source required');
  check(b);
  if (
    b.attempted ||
    b.registry.has(b.attemptKey) ||
    b.state !== 'READY_FOR_REQUIREMENTS'
  )
    throw Error('Original attempt retained; no duplicate or UNKNOWN replay');
  const request = pin(input);
  b.attempted = true;
  b.registry.set(b.attemptKey, b);
  b.state = 'PENDING';
  b.input = input;
  b.signature = request.signature;
  b.preparationGate = gate;
  try {
    b.original = await inspectFollowUpReadinessRequirements(
      b.view,
      b.key,
      input,
      gate,
    );
    check(b);
    const body = {
      mode: 'LOCAL_MAINTENANCE_PLANNING_CONTINUITY' as const,
      organization_id: selection.organization_id,
      occurrence: selection.occurrence,
      requested_purpose: selection.requested_purpose,
      proposed_on: request.value.proposed_on,
      plan_kind: request.value.plan_kind,
      source_sha256: selection.source_sha256,
      selection_sha256: selection.integrity.sha256,
      original_control: {
        envelope: b.original.envelope,
        requirements_sha256: b.original.original_requirements_sha256,
        review_sha256: b.original.integrity.sha256,
        expires_at: b.original.expires_at,
      },
      missing_gates: b.original.missing_gates,
      observed: b.original.observed,
      renewal_terms: 'UNKNOWN' as const,
      purpose_is: 'REQUESTED_REVIEW_CONTEXT_ONLY' as const,
      operational_authority: 'BLOCKED' as const,
      browser_writer: 'NOT_CONNECTED' as const,
      authority: b.original.authority,
    };
    const sha256 = await documentHash(body);
    check(b);
    const result = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    b.state = 'BLOCKED_LOCAL_REVIEW';
    retained.set(result, b);
    return result;
  } catch (error) {
    b.state = 'UNKNOWN';
    throw error;
  }
}
export type MaintenancePlanningContinuityView = Awaited<
  ReturnType<typeof prepareMaintenancePlanningContinuity>
>;
export function assertMaintenancePlanningContinuityNow(
  view: MaintenancePlanningSelection | MaintenancePlanningContinuityView,
) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained maintenance continuity required');
  check(b);
  if (b.state === 'PENDING') throw Error('Pending outcome; exact read only');
  return b.state;
}
export async function reconcileMaintenancePlanningContinuity(
  view: MaintenancePlanningSelection | MaintenancePlanningContinuityView,
) {
  const result = {
    status: 'UNKNOWN' as State,
    send: false,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(view);
  if (!b) return result;
  try {
    check(b, true);
    if (b.state === 'PENDING') return result;
    const r = b.original
      ? await reconcileFollowUpReadinessRequirements(b.view, b.key)
      : await reconcileFollowUpReadiness(b.view);
    check(b, true);
    if (r.status === 'UNKNOWN') {
      b.state = 'UNKNOWN';
      return result;
    }
    if (
      [
        'CANCELLED_LOCAL_REVIEW',
        'REVOKED_LOCAL_REVIEW',
        'EXPIRED_LOCAL_REVIEW',
      ].includes(r.status)
    )
      b.state = r.status as State;
    return { ...result, status: b.state };
  } catch {
    return result;
  }
}
export function closeMaintenancePlanningContinuity(
  view: MaintenancePlanningSelection | MaintenancePlanningContinuityView,
  action: 'CANCEL' | 'REVOKE',
) {
  if (!['CANCEL', 'REVOKE'].includes(action))
    throw Error('Explicit cancel/revoke required');
  assertMaintenancePlanningContinuityNow(view);
  const b = retained.get(view)!;
  if (!b.original)
    throw Error(
      'Original requirements must be reviewed before terminal withdrawal',
    );
  const r = closeFollowUpReadinessReview(b.view, b.key, action);
  b.state =
    action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW';
  return r;
}
export async function openMaintenancePlanningContinuitySource(
  view: MaintenancePlanningSelection | MaintenancePlanningContinuityView,
) {
  assertMaintenancePlanningContinuityNow(view);
  const b = retained.get(view)!;
  const source = await openFollowUpReadinessSource(b.view, b.key);
  check(b);
  return source;
}
