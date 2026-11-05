import { prototypeFields, freezePrototype } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readSavedSourceExercise,
  readSavedPlanCorrection,
  executeSavedPlanCorrection,
  reconcileSavedSourceCorrection,
  type SavedSourceExerciseView,
} from './saved-revision-exercise';
import {
  readMaintenanceRenewalEvidence,
  projectMaintenanceRenewalEvidence,
} from './maintenance-renewal-evidence';
import {
  assertMaintenanceSavedRevisionCurrent,
  verifyMaintenanceSavedRevisionCurrent,
} from './maintenance-saved-revisions';

export type PlanCorrectionSource = ReturnType<typeof readSavedPlanCorrection>;
export interface PlanCorrectionInput {
  plan_id: string;
  revision: number;
  name: string;
  cadence: 'once' | 'weekly' | 'monthly' | 'custom';
  interval_days: number;
}
export interface MaintenancePlanCorrectionReview {
  readonly view: SavedSourceExerciseView;
  readonly source: PlanCorrectionSource;
  readonly renewal: Awaited<ReturnType<typeof readMaintenanceRenewalEvidence>>;
}
/** Bounded form data only. Existing savePlan owns native schedule semantics and CAS. */
export function parsePlanCorrectionInput(
  value: unknown,
  source: PlanCorrectionSource,
): PlanCorrectionInput {
  const f = prototypeFields(value, [
    'plan_id',
    'revision',
    'name',
    'cadence',
    'interval_days',
  ]);
  if (
    Object.keys(f).length !== 5 ||
    f.plan_id !== source.plan_id ||
    f.revision !== source.revision ||
    typeof f.name !== 'string' ||
    !f.name.trim() ||
    f.name !== f.name.trim() ||
    f.name.length > 200 ||
    !['once', 'weekly', 'monthly', 'custom'].includes(f.cadence as string) ||
    typeof f.interval_days !== 'number' ||
    !Number.isInteger(f.interval_days) ||
    f.interval_days < 1 ||
    f.interval_days > 365
  )
    throw Error(
      'Exact current plan revision and bounded correction fields required',
    );
  // Reject executable form objects before the original one-use admission.
  // Retain the ordinary original form for the native engine's live fences.
  if (JSON.stringify(structuredClone(value)) !== JSON.stringify(f))
    throw Error('Plain stable original maintenance correction fields required');
  return freezePrototype({
    plan_id: source.plan_id,
    revision: source.revision,
    name: f.name,
    cadence: f.cadence as PlanCorrectionInput['cadence'],
    interval_days: f.interval_days,
  });
}
export async function readMaintenancePlanCorrectionReview(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<MaintenancePlanCorrectionReview> {
  const view = await readSavedSourceExercise(sources, jobId, gate),
    source = readSavedPlanCorrection(view),
    renewal = await readMaintenanceRenewalEvidence(sources, jobId, gate);
  const current = readSavedPlanCorrection(view),
    data = projectMaintenanceRenewalEvidence(renewal);
  if (
    JSON.stringify(source) !== JSON.stringify(current) ||
    !data.saved.plans.some(
      (p) => p.id === source.plan_id && p.revision === source.revision,
    )
  )
    throw Error(
      'Exact same current maintenance plan and renewal source required',
    );
  return freezePrototype({ view, source, renewal });
}
export function assertMaintenancePlanCorrectionCurrent(
  review: MaintenancePlanCorrectionReview,
) {
  const current = readSavedPlanCorrection(review.view);
  assertMaintenanceSavedRevisionCurrent(review.renewal);
  if (JSON.stringify(current) !== JSON.stringify(review.source))
    throw Error('Plan correction review is stale or held');
  return current;
}
/** Current original consent/contact capture is a review fence, never consent-at-send. */
export async function saveMaintenancePlanCorrectionReview(
  review: MaintenancePlanCorrectionReview,
  value: unknown,
  confirmed: boolean,
) {
  const source = assertMaintenancePlanCorrectionCurrent(review);
  if (confirmed !== true || !source.can_edit)
    throw Error('Explicit current plan correction confirmation required');
  const input = parsePlanCorrectionInput(value, source);
  await verifyMaintenanceSavedRevisionCurrent(review.renewal);
  assertMaintenancePlanCorrectionCurrent(review);
  if (
    JSON.stringify(parsePlanCorrectionInput(value, source)) !==
    JSON.stringify(input)
  )
    throw Error(
      'Confirmed maintenance plan input changed during source review',
    );
  return executeSavedPlanCorrection(
    review.view,
    value as PlanCorrectionInput,
    true,
  );
}
export function maintenancePlanRenewalReview(
  review: MaintenancePlanCorrectionReview,
) {
  assertMaintenancePlanCorrectionCurrent(review);
  const actual = projectMaintenanceRenewalEvidence(review.renewal);
  return freezePrototype({
    plan_id: review.source.plan_id,
    revision: review.source.revision,
    occurrences: actual.renewal
      .filter((r) => r.selection.source.plan_id === review.source.plan_id)
      .map((r) => ({
        id: r.selection.candidate_key,
        due_on: r.selection.due_on,
        kind: r.selection.kind,
        message_authority: r.message_authority,
        scheduling_authority: r.scheduling_authority,
        billing_authority: r.billing_authority,
      })),
    recorded_channel: actual.saved.recorded_channel.state,
    purpose_consent: actual.saved.purpose_consent,
    suppression: actual.saved.suppression,
    enrollment: actual.saved.enrollment,
    renewal_terms: actual.saved.renewal_terms,
    source_atomicity: actual.saved.source_atomicity,
    send: false as const,
    renew: false as const,
  });
}
export function reconcileMaintenancePlanCorrectionReview(
  review: MaintenancePlanCorrectionReview,
) {
  return reconcileSavedSourceCorrection(review.view, 'plan-revision');
}
