import { prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import { journeyEnabled, type JourneyAdmission } from './journey-runtime';
import {
  readSavedSourceExercise,
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
