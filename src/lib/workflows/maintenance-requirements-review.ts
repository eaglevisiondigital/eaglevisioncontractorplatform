import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readMaintenancePlanCorrectionReview,
  reconcileMaintenancePlanCorrectionReview,
  assertMaintenancePlanCorrectionCurrent,
} from './maintenance-plan-correction';
import { projectMaintenanceRenewalEvidence } from './maintenance-renewal-evidence';
import { verifyMaintenanceSavedRevisionCurrent } from './maintenance-saved-revisions';
import {
  readSavedRevision,
  assertSavedRevisionCurrent,
  compareSavedRevisions,
} from './saved-revision-runtime';
import { inspectSavedSourceExercise } from './saved-revision-exercise';
import { freezePrototype } from '../program/prototype-source';

/** Current original planner facts only. No purpose-consent/suppression source is
 * invented, and a recorded channel preference never becomes sending authority. */
export async function readMaintenanceRequirementsReview(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const original = await readMaintenancePlanCorrectionReview(
      sources,
      jobId,
      gate,
    ),
    receipt = await reconcileMaintenancePlanCorrectionReview(original),
    held = JSON.stringify(inspectSavedSourceExercise(original.view)),
    actual = projectMaintenanceRenewalEvidence(original.renewal);
  assertMaintenancePlanCorrectionCurrent(original);
  const plan = actual.saved.plans.find((p) => p.id === original.source.plan_id);
  if (!plan || plan.revision !== original.source.revision)
    throw Error('Exact native plan revision required');
  const snapshot = await readSavedRevision(
    sources,
    jobId,
    'maintenance',
    gate,
    () => ({
      plan,
      window: actual.saved.window,
      receipt,
      recorded_channel: actual.saved.recorded_channel,
      occurrences: actual.renewal
        .filter((r) => r.selection.source.plan_id === plan.id)
        .map((r) => ({
          id: r.selection.candidate_key,
          kind: r.selection.kind,
          due_on: r.selection.due_on,
          timezone: r.selection.timezone,
          source: r.selection.source,
          planning_status: r.planning_status,
          exact_visits: r.exact_visits,
          message_authority: r.message_authority,
          scheduling_authority: r.scheduling_authority,
          billing_authority: r.billing_authority,
        })),
      requirements: {
        purpose_consent: actual.saved.purpose_consent,
        suppression: actual.saved.suppression,
        enrollment: actual.saved.enrollment,
        renewal_terms: actual.saved.renewal_terms,
        sender_authority: 'UNVERIFIED' as const,
        source_atomicity: actual.saved.source_atomicity,
      },
      coverage: actual.saved.coverage,
      count_is_complete: false as const,
      physical_completion: 'UNVERIFIED' as const,
      authority: actual.saved.authority,
      recipient: null,
      provider_request: null,
      replay: 'FORBIDDEN' as const,
    }),
    () => {
      assertMaintenancePlanCorrectionCurrent(original);
      if (JSON.stringify(inspectSavedSourceExercise(original.view)) !== held)
        throw Error('Original plan correction custody changed');
    },
  );
  await verifyMaintenanceSavedRevisionCurrent(original.renewal);
  const final = await reconcileMaintenancePlanCorrectionReview(original);
  assertSavedRevisionCurrent(snapshot);
  if (JSON.stringify(final) !== JSON.stringify(receipt))
    throw Error('Original plan correction receipt changed');
  return snapshot;
}
export type MaintenanceRequirementsSnapshot = Awaited<
  ReturnType<typeof readMaintenanceRequirementsReview>
>;
export function inspectMaintenanceRequirements(
  snapshot: MaintenanceRequirementsSnapshot,
) {
  assertSavedRevisionCurrent(snapshot);
  return snapshot.evidence;
}
/** Same-session before/current presentation only; no historical restoration or
 * renewal authorization. Exact occurrence IDs are never matched by wording. */
export function compareMaintenanceRequirements(
  before: MaintenanceRequirementsSnapshot,
  current: MaintenanceRequirementsSnapshot,
) {
  compareSavedRevisions(before, current);
  const a = before.evidence,
    b = current.evidence;
  if (a.plan.id !== b.plan.id)
    throw Error('Same original maintenance plan required');
  const fields = [
    'revision',
    'name',
    'cadence',
    'interval_days',
    'starts_on',
    'timezone',
  ] as const;
  return freezePrototype({
    before_plan: a.plan,
    current_plan: b.plan,
    fields: fields.map((field) => ({
      field,
      before: a.plan[field],
      current: b.plan[field],
      state:
        a.plan[field] === b.plan[field]
          ? ('UNCHANGED' as const)
          : ('CHANGED' as const),
    })),
    occurrences: [
      ...new Set([
        ...a.occurrences.map((r) => r.id),
        ...b.occurrences.map((r) => r.id),
      ]),
    ].map((id) => {
      const old = a.occurrences.find((r) => r.id === id),
        next = b.occurrences.find((r) => r.id === id);
      return {
        id,
        state: !old
          ? ('ADDED' as const)
          : !next
            ? ('NOT_IN_CURRENT_REVIEW' as const)
            : JSON.stringify(old) === JSON.stringify(next)
              ? ('UNCHANGED' as const)
              : ('CHANGED' as const),
      };
    }),
    recorded_channel_changed:
      JSON.stringify(a.recorded_channel) !== JSON.stringify(b.recorded_channel),
    meaning: 'OBSERVED_DIFFERENCES_ONLY' as const,
    send: false as const,
    renew: false as const,
  });
}
export function maintenanceRequirementsDestination(
  snapshot: MaintenanceRequirementsSnapshot,
) {
  inspectMaintenanceRequirements(snapshot);
  return { job_id: snapshot.identity.job_id, step: 'maintenance' as const };
}
