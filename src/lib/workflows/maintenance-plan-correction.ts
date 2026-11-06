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
const sourceFields = [
  'plan_id',
  'revision',
  'name',
  'cadence',
  'interval_days',
  'can_edit',
  'blocked_reason',
] as const;
/** Capture caller selectors before native access checks. The original opaque
 * handles remain authoritative; no copied handle or new review registry exists. */
function reviewFields(review: MaintenancePlanCorrectionReview) {
  const fields = prototypeFields(review, ['view', 'source', 'renewal']),
    source = prototypeFields(fields.source, sourceFields);
  if (
    Object.keys(fields).length !== 3 ||
    Object.keys(source).length !== sourceFields.length ||
    typeof source.plan_id !== 'string' ||
    typeof source.name !== 'string' ||
    typeof source.cadence !== 'string' ||
    typeof source.revision !== 'number' ||
    !Number.isSafeInteger(source.revision) ||
    typeof source.interval_days !== 'number' ||
    !Number.isSafeInteger(source.interval_days) ||
    typeof source.can_edit !== 'boolean' ||
    (source.blocked_reason !== null &&
      typeof source.blocked_reason !== 'string')
  )
    throw Error(
      'Exact own maintenance review handles and primitive source required',
    );
  return {
    view: fields.view as MaintenancePlanCorrectionReview['view'],
    source: source as unknown as PlanCorrectionSource,
    renewal: fields.renewal as MaintenancePlanCorrectionReview['renewal'],
  };
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
  const fields = reviewFields(review),
    current = readSavedPlanCorrection(fields.view);
  assertMaintenanceSavedRevisionCurrent(fields.renewal);
  const renewal = projectMaintenanceRenewalEvidence(fields.renewal);
  if (
    (
      [
        'organization_id',
        'actor_id',
        'customer_id',
        'location_id',
        'estimate_id',
        'version_id',
        'job_id',
      ] as const
    ).some(
      (key) => fields.view.identity[key] !== fields.renewal.identity[key],
    ) ||
    !renewal.saved.plans.some(
      (plan) =>
        plan.id === current.plan_id && plan.revision === current.revision,
    )
  )
    throw Error('Exact original plan and same-job renewal handles required');
  if (sourceFields.some((key) => current[key] !== fields.source[key]))
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
  const fields = reviewFields(review),
    current = assertMaintenancePlanCorrectionCurrent(fields),
    actual = projectMaintenanceRenewalEvidence(fields.renewal);
  return freezePrototype({
    plan_id: current.plan_id,
    revision: current.revision,
    occurrences: actual.renewal
      .filter((r) => r.selection.source.plan_id === current.plan_id)
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
