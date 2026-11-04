import type { PassportReportReference } from '../../domain/property/passport';
import {
  readServiceSourceReview,
  readServiceSourceLineage,
  inspectServiceSourceReport,
  type ServiceSourceRead,
} from './service-source-review';
import { prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import { journeyEnabled, type JourneyAdmission } from './journey-runtime';
import {
  readSavedSourceExercise,
  inspectSavedSourceExercise,
  readSavedRequestAction,
  executeSavedRequestAction,
  reconcileSavedRequestAction,
  savedRequestStatuses,
  type SavedRequestActionInput,
  type SavedSourceExerciseView,
} from './saved-revision-exercise';

export type ServiceRequestActionView = SavedSourceExerciseView;
export type ServiceRequestActionInput = SavedRequestActionInput;
export { savedRequestStatuses };
export function serviceRequestActionsEnabled(enabled = false) {
  return (
    enabled === true &&
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: 'true',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  );
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !serviceRequestActionsEnabled(true)
  )
    throw Error('Service request actions are OFF without local confirmation');
}
/** The original source handle and original attempt owner only. */
export async function readServiceRequestActions(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const view = await readSavedSourceExercise(sources, jobId, gate);
  admit(gate);
  readSavedRequestAction(view);
  return view;
}
export const inspectServiceRequestActions = readSavedRequestAction;

/** Parse a form, never a new lifecycle engine or a server CAS claim. */
export function parseServiceRequestAction(
  view: ServiceRequestActionView,
  input: unknown,
) {
  const p = prototypeFields(input, [
      'request_id',
      'status',
      'assigned_to',
      'expected_status',
      'expected_assigned_to',
      'expected_updated_at',
    ]),
    current = readSavedRequestAction(view);
  if (
    Object.keys(p).length !== 6 ||
    p.request_id !== current.request_id ||
    p.expected_status !== current.status ||
    p.expected_assigned_to !== current.assigned_to ||
    p.expected_updated_at !== current.updated_at ||
    !savedRequestStatuses.some((status) => status === p.status) ||
    (p.assigned_to !== null &&
      !current.eligible_assignees.some((m) => m.user_id === p.assigned_to)) ||
    (p.status === current.status && p.assigned_to === current.assigned_to)
  )
    throw Error(
      'Exact current request, changed review state and assignee required',
    );
  return input as ServiceRequestActionInput;
}
export async function saveServiceRequestAction(
  view: ServiceRequestActionView,
  input: unknown,
  confirmed: boolean,
) {
  if (confirmed !== true)
    throw Error('Explicit request review confirmation required');
  const parsed = parseServiceRequestAction(view, input);
  return executeSavedRequestAction(view, parsed, confirmed);
}
/** Original read-only observation, never replay or ambiguous-writer attribution. */
export const reconcileServiceRequestAction = reconcileSavedRequestAction;

/** Revalidate the original access owner before showing a retained observation.
 * Current native versions may have changed after the read. This is access to
 * historical point-in-time detail, not a current-row or mutation receipt claim. */
export function assertServiceRequestObservationAccess(
  view: ServiceRequestActionView,
): void {
  inspectSavedSourceExercise(view);
}

/** Join the original request action and original safe published-source readers.
 * The returned value is the original reader, not another snapshot or custody owner. */
export async function readServiceRequestEvidence(
  view: ServiceRequestActionView,
  sources: OperatingSources,
  jobId: string,
  expected: ReturnType<typeof inspectServiceRequestActions>,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  assertRequestEvidenceSelection(view, expected);
  if (jobId !== view.identity.job_id)
    throw Error('Exact original selected request job context required');
  const evidence = await readServiceSourceReview(
    sources,
    { job_id: jobId, staff_context_confirmed: true },
    gate,
  );
  admit(gate);
  inspectServiceRequestEvidence(view, evidence, expected);
  return evidence;
}
function assertRequestEvidenceSelection(
  view: ServiceRequestActionView,
  expected: ReturnType<typeof inspectServiceRequestActions>,
) {
  const current = inspectServiceRequestActions(view),
    supplied = prototypeFields(expected, [
      'request_id',
      'organization_id',
      'customer_id',
      'location_id',
      'status',
      'assigned_to',
      'updated_at',
      'eligible_assignees',
      'statuses',
      'state',
      'can_edit',
      'replay',
      'native_cas',
      'durable_receipt',
    ]);
  // A displayed snapshot is selection data, never a caller-supplied reader.
  // Reject inherited/extra/accessor fields before reading any binding value.
  if (Object.keys(supplied).length !== 14)
    throw Error('Exact own original request snapshot fields required');
  for (const key of [
    'request_id',
    'organization_id',
    'customer_id',
    'location_id',
    'status',
    'assigned_to',
    'updated_at',
  ] as const)
    if (current[key] !== supplied[key])
      throw Error('Exact original request status and responsibility changed');
  return current;
}
/** Ephemeral allowlisted source detail only. Request-to-job linkage stays UNKNOWN. */
export function inspectServiceRequestEvidence(
  view: ServiceRequestActionView,
  evidence: ServiceSourceRead,
  expected: ReturnType<typeof inspectServiceRequestActions>,
) {
  const current = assertRequestEvidenceSelection(view, expected),
    lineage = readServiceSourceLineage(evidence),
    identity = view.identity;
  if (
    current.request_id !== lineage.request.id ||
    current.status !== lineage.request.status ||
    identity.organization_id !== lineage.property.organization_id ||
    identity.customer_id !== lineage.property.customer_id ||
    identity.location_id !== lineage.property.location_id ||
    identity.job_id !== lineage.scope.job_id ||
    identity.estimate_id !== lineage.scope.estimate_id ||
    identity.version_id !== lineage.scope.issued_version_id ||
    current.organization_id !== lineage.property.organization_id ||
    current.customer_id !== lineage.property.customer_id ||
    current.location_id !== lineage.property.location_id
  )
    throw Error(
      'Exact original request, property, job and issued scope required',
    );
  // Both original owners recheck their own current authority and source fences.
  assertRequestEvidenceSelection(view, expected);
  return lineage;
}
/** Original report/version/finding projection only; never latest-by-name substitution. */
export async function inspectServiceRequestReport(
  view: ServiceRequestActionView,
  evidence: ServiceSourceRead,
  expected: ReturnType<typeof inspectServiceRequestActions>,
  reference: PassportReportReference,
) {
  inspectServiceRequestEvidence(view, evidence, expected);
  const report = await inspectServiceSourceReport(evidence, reference);
  inspectServiceRequestEvidence(view, evidence, expected);
  return report;
}
