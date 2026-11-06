import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  readSavedSourceExercise,
  type SavedSourceExerciseView,
} from './saved-revision-exercise';
import {
  assertSavedRevisionCurrent,
  assertSavedRevisionAccess,
} from './saved-revision-runtime';
import {
  readMaintenanceSavedRevision,
  assertMaintenanceSavedRevisionCurrent,
  verifyMaintenanceSavedRevisionCurrent,
  type MaintenanceSavedSnapshot,
} from './maintenance-saved-revisions';
import {
  readMaintenancePlanningContinuity,
  selectMaintenancePlanningSource,
  prepareMaintenancePlanningContinuity,
  closeMaintenancePlanningContinuity,
  reconcileMaintenancePlanningContinuity,
  openMaintenancePlanningContinuitySource,
  type MaintenancePlanningProposal,
} from './maintenance-planning-continuity';
import {
  assertFollowUpReadinessCurrentNow,
  type FollowUpReadinessView,
} from './follow-up-readiness';

export const maintenanceReviewPurposes = [
  'service_follow_up',
  'recurring_maintenance',
  'marketing',
] as const;
export type MaintenanceReviewPurpose =
  (typeof maintenanceReviewPurposes)[number];
/** Native InspectionPlan has no active/cancel state. This selects the ORIGINAL
 * blocked staff-review lifecycle only; it cannot cancel a plan or enrollment. */
export async function readPlanCancellationReview(
  sources: OperatingSources,
  jobId: string,
  purpose: MaintenanceReviewPurpose,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<PlanCancellationReview> {
  const view = await readSavedSourceExercise(sources, jobId, gate);
  if (!maintenanceReviewPurposes.includes(purpose))
    throw Error('Exact explicit requested review purpose required');
  const saved = await readMaintenanceSavedRevision(sources, jobId, gate),
    desk = await readMaintenancePlanningContinuity(
      sources,
      {
        window: { ...saved.evidence.window },
        lead_days: 14,
        overdue_days: 7,
        query: '',
        kind: 'all',
        readiness: 'all',
        job_id: view.identity.job_id,
        customer_id: view.identity.customer_id,
        location_id: view.identity.location_id,
        purpose,
        channel_state: 'all',
      },
      gate,
    );
  const review = Object.freeze({ view, saved, desk, purpose, gate });
  assertPlanCancellationCurrent(review);
  return review;
}
export interface PlanCancellationReview {
  readonly view: SavedSourceExerciseView;
  readonly saved: MaintenanceSavedSnapshot;
  readonly desk: FollowUpReadinessView;
  readonly purpose: MaintenanceReviewPurpose;
  readonly gate: JourneyAdmission;
}
function assertSavedPlanIdentity(review: PlanCancellationReview) {
  const keys = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ] as const;
  if (
    keys.some((key) => review.saved.identity[key] !== review.view.identity[key])
  )
    throw Error('Original native saved maintenance identity required');
}
/** Original access only for retained point-in-time presentation. Mutable source
 * freshness is still required separately by every native action/verification. */
export function assertPlanCancellationObservationAccess(
  review: PlanCancellationReview,
): void {
  if (
    Object.keys(
      prototypeFields(review, ['view', 'saved', 'desk', 'purpose', 'gate']),
    ).length !== 5
  )
    throw Error('Original staff review references required');
  assertSavedRevisionAccess(review.view);
  assertSavedRevisionAccess(review.saved);
  assertSavedPlanIdentity(review);
}
export function assertPlanCancellationCurrent(review: PlanCancellationReview) {
  if (
    Object.keys(
      prototypeFields(review, ['view', 'saved', 'desk', 'purpose', 'gate']),
    ).length !== 5
  )
    throw Error('Original staff review references required');
  assertSavedPlanIdentity(review);
  assertSavedRevisionCurrent(review.view);
  assertMaintenanceSavedRevisionCurrent(review.saved);
  assertFollowUpReadinessCurrentNow(review.desk);
  if (
    review.desk.requested_purpose !== review.purpose ||
    review.desk.rows.some(
      (row) =>
        row.context.job_id !== review.view.identity.job_id ||
        row.context.customer_id !== review.view.identity.customer_id ||
        row.context.location_id !== review.view.identity.location_id ||
        !review.saved.evidence.plans.some(
          (p) =>
            p.id === row.plan_reference.id &&
            p.revision === row.plan_reference.revision,
        ),
    )
  )
    throw Error('Exact current job/property/plan/purpose source required');
  return review;
}
export async function selectPlanCancellationOccurrence(
  review: PlanCancellationReview,
  key: string,
) {
  assertPlanCancellationCurrent(review);
  if (!review.desk.rows.some((row) => row.key === key))
    throw Error('Exact displayed occurrence required; no fallback');
  const selection = await selectMaintenancePlanningSource(
    review.desk,
    key,
    review.gate,
  );
  assertPlanCancellationCurrent(review);
  return Object.freeze({ review, selection });
}
export type PlanCancellationSelection = Awaited<
  ReturnType<typeof selectPlanCancellationOccurrence>
>;
function assertSelectionJoin(selected: PlanCancellationSelection) {
  if (
    Object.keys(prototypeFields(selected, ['review', 'selection'])).length !== 2
  )
    throw Error('Exact original staff review selection required');
  const review = selected.review;
  prototypeFields(review, ['view', 'saved', 'desk', 'purpose', 'gate']);
  prototypeFields(review.view, Object.keys(review.view));
  prototypeFields(review.saved, Object.keys(review.saved));
  prototypeFields(review.desk, Object.keys(review.desk));
  prototypeFields(selected.selection, Object.keys(selected.selection));
  assertSavedPlanIdentity(review);
  const original = selected.selection,
    displayed = review.desk.rows.find((row) => row === original.occurrence),
    identity = review.view.identity;
  if (
    !displayed ||
    original.organization_id !== identity.organization_id ||
    original.organization_id !== review.desk.organization_id ||
    original.source_sha256 !== review.desk.integrity.sha256 ||
    original.requested_purpose !== review.purpose ||
    original.requested_purpose !== review.desk.requested_purpose ||
    displayed.key !== original.occurrence.key ||
    displayed.context.organization_id !== identity.organization_id ||
    displayed.context.job_id !== identity.job_id ||
    displayed.context.customer_id !== identity.customer_id ||
    displayed.context.location_id !== identity.location_id ||
    !review.saved.evidence.plans.some(
      (plan) =>
        plan.id === displayed.plan_reference.id &&
        plan.revision === displayed.plan_reference.revision,
    )
  )
    throw Error(
      'Exact displayed review, purpose, occurrence and native plan binding required',
    );
}
function assertSelection(selected: PlanCancellationSelection) {
  assertSelectionJoin(selected);
  assertPlanCancellationCurrent(selected.review);
}
function unknownCancellationResult() {
  return freezePrototype({
    status: 'UNKNOWN' as const,
    send: false as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
    native_plan_cancellation: 'UNSUPPORTED' as const,
    enrollment_cancellation: 'UNSUPPORTED' as const,
    plan_mutation_performed: false as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    consent_mutation: false as const,
  });
}
export async function preparePlanCancellationReview(
  selected: PlanCancellationSelection,
  proposal: MaintenancePlanningProposal,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error(
      'Explicit blocked staff review preparation confirmation required',
    );
  assertSelection(selected);
  const f = prototypeFields(proposal, ['proposed_on', 'plan_kind']);
  if (Object.keys(f).length !== 2)
    throw Error('Exact original review proposal required');
  // Reject descriptor-bearing Proxies before original admission. Keep the
  // ordinary original input for the native owner's later live-input fences.
  if (JSON.stringify(structuredClone(proposal)) !== JSON.stringify(f))
    throw Error('Plain stable original staff-review proposal required');
  await verifyMaintenanceSavedRevisionCurrent(selected.review.saved);
  assertPlanCancellationCurrent(selected.review);
  if (
    JSON.stringify(prototypeFields(proposal, ['proposed_on', 'plan_kind'])) !==
    JSON.stringify(f)
  )
    throw Error('Confirmed staff review proposal changed during source check');
  return prepareMaintenancePlanningContinuity(
    selected.selection,
    proposal,
    selected.review.gate,
  );
}
/** The only transition is the original C12/C14 terminal review control. No new
 * attempt owner, consent history, plan writer, sender or cancellation record. */
export async function closePlanCancellationReview(
  selected: PlanCancellationSelection,
  action: 'CANCEL' | 'REVOKE',
  confirmed: boolean,
) {
  if (confirmed !== true || !['CANCEL', 'REVOKE'].includes(action))
    throw Error('Explicit confirmed terminal staff-review action required');
  assertSelection(selected);
  await verifyMaintenanceSavedRevisionCurrent(selected.review.saved);
  assertPlanCancellationCurrent(selected.review);
  await openMaintenancePlanningContinuitySource(selected.selection);
  assertPlanCancellationCurrent(selected.review);
  return closeMaintenancePlanningContinuity(selected.selection, action);
}
export async function reconcilePlanCancellationReview(
  selected: PlanCancellationSelection,
) {
  prototypeFields(selected, ['review', 'selection']);
  try {
    assertSelectionJoin(selected);
  } catch {
    return unknownCancellationResult();
  }
  const result = await reconcileMaintenancePlanningContinuity(
    selected.selection,
  );
  try {
    assertPlanCancellationCurrent(selected.review);
    await verifyMaintenanceSavedRevisionCurrent(selected.review.saved);
    assertPlanCancellationCurrent(selected.review);
    return freezePrototype({
      ...result,
      native_plan_cancellation: 'UNSUPPORTED' as const,
      enrollment_cancellation: 'UNSUPPORTED' as const,
      plan_mutation_performed: false as const,
      source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
      consent_mutation: false as const,
    });
  } catch {
    return freezePrototype({
      ...result,
      status: 'UNKNOWN' as const,
      native_plan_cancellation: 'UNSUPPORTED' as const,
      enrollment_cancellation: 'UNSUPPORTED' as const,
      plan_mutation_performed: false as const,
      source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
      consent_mutation: false as const,
    });
  }
}
export function planCancellationFacts(review: PlanCancellationReview) {
  // Capture caller-owned references before the original current/consent guards.
  // Keep the original opaque handles; no caller read follows those guards.
  const current = prototypeFields(review, [
    'view',
    'saved',
    'desk',
    'purpose',
    'gate',
  ]) as unknown as PlanCancellationReview;
  assertPlanCancellationCurrent(current);
  return freezePrototype({
    identity: current.view.identity,
    purpose: current.purpose,
    plans: current.saved.evidence.plans,
    rows: current.desk.rows.map((row) => ({
      key: row.key,
      due_on: row.recorded_due_on,
      context: row.context,
      plan_reference: row.plan_reference,
      channel: row.channel,
      recorded_channel: row.observed_contact_v1.observed_channel_state,
      purpose_consent: row.purpose_consent,
      suppression: row.suppression,
      enrollment: row.enrollment,
      renewal_terms: row.renewal_terms,
    })),
    native_plan_cancellation: 'UNSUPPORTED' as const,
    enrollment_cancellation: 'UNSUPPORTED' as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    send: false as const,
    renew: false as const,
    consent_mutation: false as const,
  });
}

/** The selected original row and saved plan are the only sources. No new
 * eligibility, renewal, suppression or enrollment model is constructed. */
export function planCancellationOccurrenceFacts(
  selected: PlanCancellationSelection,
) {
  assertSelection(selected);
  const row = selected.selection.occurrence,
    plan = selected.review.saved.evidence.plans.filter(
      (p) =>
        p.id === row.plan_reference.id &&
        p.revision === row.plan_reference.revision,
    );
  if (plan.length !== 1) throw Error('Exact single saved native plan required');
  return freezePrototype({
    identity: selected.review.view.identity,
    occurrence_key: row.key,
    occurrence_kind: row.selection.kind,
    due_on: row.recorded_due_on,
    date_basis: row.date_basis,
    plan: plan[0],
    requested_purpose: selected.review.purpose,
    requested_purpose_is: 'REVIEW_CONTEXT_NOT_CONSENT' as const,
    channel: row.channel,
    recorded_channel: row.observed_contact_v1.observed_channel_state,
    channel_reference: row.observed_contact_v1.reference,
    current_channel_authority: row.current_channel_authority,
    purpose_consent: row.purpose_consent,
    suppression: row.suppression,
    enrollment: row.enrollment,
    renewal_terms: row.renewal_terms,
    followups: selected.review.saved.evidence.followups.filter(
      (f) => f.plan_id === plan[0].id,
    ),
    native_plan_cancellation: 'UNSUPPORTED' as const,
    enrollment_cancellation: 'UNSUPPORTED' as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    send: false as const,
    renew: false as const,
  });
}
/** Explicit read-only verification before the original blocked staff-review
 * action. This is a point-in-time observation, never a token or one-use claim. */
export async function verifyPlanCancellationRequirements(
  selected: PlanCancellationSelection,
) {
  const before = planCancellationOccurrenceFacts(selected);
  await verifyMaintenanceSavedRevisionCurrent(selected.review.saved);
  assertSelection(selected);
  await openMaintenancePlanningContinuitySource(selected.selection);
  assertSelection(selected);
  const after = planCancellationOccurrenceFacts(selected);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error(
      'Selected maintenance requirements changed during verification',
    );
  return freezePrototype({
    status: 'CURRENT_REQUIREMENTS_CAPTURED_NOT_ATOMIC' as const,
    facts: after,
    blocked_requirements: [
      'PURPOSE_SPECIFIC_CONSENT',
      'CURRENT_SUPPRESSION',
      'RECURRING_ENROLLMENT',
      'RENEWAL_TERMS',
      'ATOMIC_CONSENT_AT_SEND',
      'CONNECTED_AUTHORITY',
    ] as const,
    action_scope: 'ORIGINAL_BLOCKED_STAFF_REVIEW_ONLY' as const,
    durable_receipt: 'NOT_IMPLEMENTED' as const,
    send: false as const,
    renew: false as const,
    replay: 'FORBIDDEN' as const,
  });
}

/** Reread the same original identity and explicitly requested purpose. Returning
 * an existing native review never replaces an occurrence or clears original
 * attempt custody. Callers must select the retained exact key, never first/latest. */
export async function rereadPlanCancellationReview(
  previous: PlanCancellationReview,
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const requested = prototypeFields(gate, ['enabled', 'confirmed']);
  if (requested.enabled !== true || requested.confirmed !== true)
    throw Error('Explicit local current-source reread required');
  if (
    Object.keys(
      prototypeFields(previous, ['view', 'saved', 'desk', 'purpose', 'gate']),
    ).length !== 5
  )
    throw Error('Original maintenance review references required');
  assertSavedRevisionAccess(previous.view);
  assertSavedRevisionAccess(previous.saved);
  const desk = prototypeFields(previous.desk, [
    'mode',
    'organization_id',
    'window',
    'requested_purpose',
    'filters',
    'jobs',
    'rows',
    'available_occurrences',
    'matching_occurrences',
    'coverage',
    'count_is_complete',
    'source_atomicity',
    'purpose_is',
    'authority',
    'integrity',
  ]);
  assertSavedPlanIdentity(previous);
  if (
    jobId !== previous.view.identity.job_id ||
    desk.requested_purpose !== previous.purpose
  )
    throw Error(
      'Exact original maintenance job and requested purpose required',
    );
  const next = await readPlanCancellationReview(
    sources,
    jobId,
    previous.purpose,
    gate,
  );
  assertSavedRevisionAccess(previous.view);
  assertPlanCancellationCurrent(next);
  if (
    JSON.stringify(previous.view.identity) !==
    JSON.stringify(next.view.identity)
  )
    throw Error(
      'Maintenance reread cannot substitute company/customer/property/version',
    );
  return next;
}
