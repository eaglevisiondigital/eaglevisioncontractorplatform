import type { JourneyAdmission } from './journey-runtime';
import {
  assertMaintenancePlanningContinuityNow,
  reconcileMaintenancePlanningContinuity,
  openMaintenancePlanningContinuitySource,
  type MaintenancePlanningContinuityView,
} from './maintenance-planning-continuity';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

function on(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit local requirements inspection required');
}
interface Binding {
  original: MaintenancePlanningContinuityView;
  gate: JourneyAdmission;
  unknown: boolean;
}
// Retained original reader references only; no enrollment, recipient or consent authority store.
const retained = new WeakMap<object, Binding>();
const held = new WeakSet<object>();
function check(b: Binding) {
  try {
    on(b.gate);
    if (b.unknown || held.has(b.original))
      throw Error('Maintenance requirements UNKNOWN');
    if (
      assertMaintenancePlanningContinuityNow(b.original) !==
      'BLOCKED_LOCAL_REVIEW'
    )
      throw Error('Exact active blocked requirements review required');
  } catch (error) {
    b.unknown = true;
    held.add(b.original);
    throw error;
  }
}
/** Inspect the original prepared occurrence/purpose requirements, never derive permission to send. */
export async function readMaintenanceReviewRequirements(
  original: MaintenancePlanningContinuityView,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate); // OFF before reading retained evidence.
  const b: Binding = { original, gate, unknown: false };
  check(b);
  try {
    const source = await openMaintenancePlanningContinuitySource(original);
    check(b);
    const row = original.occurrence,
      envelope = original.original_control.envelope;
    if (
      envelope.candidate_key !== row.key ||
      envelope.organization_id !== original.organization_id ||
      envelope.job_id !== row.context.job_id ||
      envelope.customer_id !== row.context.customer_id ||
      envelope.property_id !== row.context.location_id ||
      envelope.plan_id !== row.plan_reference.id ||
      envelope.source_revision !== row.plan_reference.revision ||
      envelope.purpose !== original.requested_purpose ||
      envelope.channel !== row.channel
    )
      throw Error(
        'Exact occurrence, plan, purpose and channel binding required',
      );
    const body = {
      mode: 'LOCAL_MAINTENANCE_REQUIREMENTS_PATH' as const,
      organization_id: original.organization_id,
      occurrence: {
        key: row.key,
        context: row.context,
        plan_name: row.plan_name,
        recorded_due_on: row.recorded_due_on,
        date_basis: row.date_basis,
        plan_reference: row.plan_reference,
      },
      requested_purpose: original.requested_purpose,
      channel: row.channel,
      human_proposal: {
        proposed_on: original.proposed_on,
        plan_kind: original.plan_kind,
      },
      original_control: original.original_control,
      source_sha256: original.source_sha256,
      selection_sha256: original.selection_sha256,
      planning_sha256: original.integrity.sha256,
      observed: original.observed,
      historical_contact_reference: source.historical_contact_reference,
      current_channel_authority: source.current_channel_authority,
      purpose_consent: source.purpose_consent,
      suppression: source.suppression,
      suppression_reference: source.suppression_reference,
      enrollment: source.enrollment,
      enrollment_reference: source.enrollment_reference,
      missing_gates: original.missing_gates,
      renewal_terms: 'UNKNOWN' as const,
      operational_authority: 'BLOCKED' as const,
      freshness: 'CAPTURED_NOT_ATOMIC' as const,
      custody: 'SAME_TAB_REFERENCE_ONLY' as const,
      authority: original.authority,
    };
    const sha256 = await documentHash(body);
    check(b);
    if (
      (await reconcileMaintenancePlanningContinuity(original)).status !==
      'BLOCKED_LOCAL_REVIEW'
    )
      throw Error('Original requirements changed');
    // Final original source reader refreshes canonical contact/purpose/suppression observations.
    await openMaintenancePlanningContinuitySource(original);
    check(b);
    const view = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    retained.set(view, b);
    return view;
  } catch (error) {
    b.unknown = true;
    held.add(original);
    throw error;
  }
}
export type MaintenanceReviewRequirements = Awaited<
  ReturnType<typeof readMaintenanceReviewRequirements>
>;
export function assertMaintenanceReviewRequirementsNow(
  view: MaintenanceReviewRequirements,
) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained requirements path required');
  check(b);
}
export async function reconcileMaintenanceReviewRequirements(
  view: MaintenanceReviewRequirements,
) {
  const result = {
    status: 'UNKNOWN' as
      | 'UNKNOWN'
      | 'BLOCKED_LOCAL_REVIEW'
      | 'CANCELLED_LOCAL_REVIEW'
      | 'REVOKED_LOCAL_REVIEW'
      | 'EXPIRED_LOCAL_REVIEW',
    send: false as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(view);
  if (!b) return result;
  try {
    on(b.gate);
    const original = await reconcileMaintenancePlanningContinuity(b.original);
    on(b.gate);
    if (
      original.status === 'CANCELLED_LOCAL_REVIEW' ||
      original.status === 'REVOKED_LOCAL_REVIEW' ||
      original.status === 'EXPIRED_LOCAL_REVIEW'
    )
      return { ...result, status: original.status };
    check(b);
    if (original.status !== 'BLOCKED_LOCAL_REVIEW')
      throw Error('Original review no longer current');
    await openMaintenancePlanningContinuitySource(b.original);
    check(b);
    return { ...result, status: 'BLOCKED_LOCAL_REVIEW' as const };
  } catch {
    b.unknown = true;
    held.add(b.original);
    return result;
  }
}
/** Return the same retained planning item after exact read-only reconciliation. */
export async function returnMaintenancePlanningReview(
  view: MaintenanceReviewRequirements,
) {
  const b = retained.get(view);
  if (
    !b ||
    (await reconcileMaintenanceReviewRequirements(view)).status !==
      'BLOCKED_LOCAL_REVIEW'
  )
    throw Error('Maintenance path UNKNOWN; no replay');
  check(b);
  return b.original;
}
