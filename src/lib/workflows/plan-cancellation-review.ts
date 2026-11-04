import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  readSavedSourceExercise,
  type SavedSourceExerciseView,
} from './saved-revision-exercise';
import { assertSavedRevisionCurrent } from './saved-revision-runtime';
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
export function assertPlanCancellationCurrent(review: PlanCancellationReview) {
  if (
    Object.keys(
      prototypeFields(review, ['view', 'saved', 'desk', 'purpose', 'gate']),
    ).length !== 5
  )
    throw Error('Original staff review references required');
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
  assertPlanCancellationCurrent(review);
  return freezePrototype({
    identity: review.view.identity,
    purpose: review.purpose,
    plans: review.saved.evidence.plans,
    rows: review.desk.rows.map((row) => ({
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
