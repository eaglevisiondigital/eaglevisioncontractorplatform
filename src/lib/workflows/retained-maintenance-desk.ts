import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import type { OperatingJobSection } from './operating-navigation';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { FollowUpReadinessInput } from './follow-up-readiness';
import {
  readRetentionReviewGuide,
  assertRetentionReviewGuideNow,
  filterRetentionReviewGuide,
  reconcileRetentionReviewGuide,
  inspectRetentionReviewItem,
  assertRetentionReviewItemNow,
  returnRetentionReviewGuide,
  type RetentionReviewGuideView,
  type RetentionReviewFilter,
  type RetentionReviewItem,
} from './retention-review-guide';

function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit retained maintenance source review required');
}
interface DeskBinding {
  original: RetentionReviewGuideView;
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  unknown: boolean;
}
const desks = new WeakMap<object, DeskBinding>();
function check(b: DeskBinding) {
  try {
    admit(b.gate);
    b.capture.check();
    assertRetentionReviewGuideNow(b.original);
    if (b.unknown) throw Error('Retained maintenance source UNKNOWN');
  } catch (error) {
    b.unknown = true;
    throw error;
  }
}
/** Same original recurrence/contact reader; no new maintenance or consent engine/store. */
export async function readRetainedMaintenanceDesk(
  sources: OperatingSources,
  input: FollowUpReadinessInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const capture = captureOperatingSources(sources, gate),
    original = await readRetentionReviewGuide(sources, input, gate),
    b: DeskBinding = { original, capture, gate, unknown: false };
  check(b);
  const body = {
    mode: 'LOCAL_RETAINED_MAINTENANCE_DESK' as const,
    organization_id: original.organization_id,
    company_label: sources.company.name,
    selected_job_id: original.selected_job_id,
    requested_purpose: original.requested_purpose,
    window: original.window,
    rows: original.rows,
    available_occurrences: original.available_occurrences,
    matching_occurrences: original.matching_occurrences,
    coverage: original.coverage,
    count_is_complete: false as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    authority: original.authority,
    original_source_sha256: original.integrity.sha256,
    custody: 'SAME_TAB_REFERENCE_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  check(b);
  if (
    (await reconcileRetentionReviewGuide(original)).status !==
    'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Original consent source UNKNOWN');
  check(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  desks.set(view, b);
  return view;
}
export type RetainedMaintenanceDeskView = Awaited<
  ReturnType<typeof readRetainedMaintenanceDesk>
>;
export function assertRetainedMaintenanceDeskNow(
  view: RetainedMaintenanceDeskView,
) {
  const b = desks.get(view);
  if (!b) throw Error('Exact retained maintenance desk required');
  check(b);
}
export function filterRetainedMaintenanceDesk(
  view: RetainedMaintenanceDeskView,
  input: RetentionReviewFilter,
) {
  assertRetainedMaintenanceDeskNow(view);
  const result = filterRetentionReviewGuide(desks.get(view)!.original, input);
  assertRetainedMaintenanceDeskNow(view);
  return result;
}
export async function reconcileRetainedMaintenanceDesk(
  view: RetainedMaintenanceDeskView,
) {
  const b = desks.get(view),
    result = {
      status: 'UNKNOWN' as 'UNKNOWN' | 'CAPTURED_NOT_ATOMIC',
      send: false as const,
      replacement: null,
      replay: 'FORBIDDEN' as const,
    };
  if (!b) return result;
  try {
    check(b);
    if (
      (await reconcileRetentionReviewGuide(b.original)).status !==
      'CAPTURED_NOT_ATOMIC'
    )
      throw Error('Original contact observations changed');
    check(b);
    return { ...result, status: 'CAPTURED_NOT_ATOMIC' as const };
  } catch {
    b.unknown = true;
    return result;
  }
}
async function verified(view: RetainedMaintenanceDeskView) {
  if (
    (await reconcileRetainedMaintenanceDesk(view)).status !==
    'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Maintenance source UNKNOWN; exact read only');
  assertRetainedMaintenanceDeskNow(view);
  return desks.get(view)!;
}
interface CaseBinding {
  desk: RetainedMaintenanceDeskView;
  original: RetentionReviewItem;
  navigationPending: boolean;
}
const cases = new WeakMap<object, CaseBinding>();
/** Exact occurrence breadcrumbs remain selected while original controls keep their separate confirmations. */
export async function selectRetainedMaintenanceCase(
  view: RetainedMaintenanceDeskView,
  key: string,
) {
  const b = await verified(view),
    original = await inspectRetentionReviewItem(b.original, key);
  assertRetainedMaintenanceDeskNow(view);
  const row = original.row;
  const body = {
    mode: 'LOCAL_RETAINED_MAINTENANCE_CASE' as const,
    row,
    requested_purpose: original.requested_purpose,
    historical_contact_reference: original.historical_contact_reference,
    current_channel_authority: original.current_channel_authority,
    purpose_consent: original.purpose_consent,
    suppression: original.suppression,
    enrollment: original.enrollment,
    renewal_terms: original.renewal_terms,
    captured_original_control_status: original.original_control_status,
    breadcrumbs: [
      {
        kind: 'company' as const,
        id: view.organization_id,
        label: view.company_label,
      },
      {
        kind: 'customer' as const,
        id: row.context.customer_id,
        label: row.context.customer_label,
      },
      {
        kind: 'property' as const,
        id: row.context.location_id,
        label: row.context.property_label,
      },
      {
        kind: 'job' as const,
        id: row.context.job_id,
        label: row.context.job_title,
      },
      {
        kind: 'plan' as const,
        id: row.plan_reference.id,
        label: row.plan_name + ' · revision ' + row.plan_reference.revision,
      },
      { kind: 'occurrence' as const, id: row.key, label: row.recorded_due_on },
    ],
    original_control_handoff:
      'SAME_JOB_ONLY_RECONFIRM_ORIGINAL_CONTEXT' as const,
    send: false as const,
    recipient: null,
    provider_request: null,
    operational_authority: 'BLOCKED' as const,
    source_sha256: view.integrity.sha256,
  };
  const sha256 = await documentHash(body);
  await returnRetentionReviewGuide(original);
  assertRetainedMaintenanceDeskNow(view);
  assertRetentionReviewItemNow(original);
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  cases.set(result, { desk: view, original, navigationPending: false });
  return result;
}
export type RetainedMaintenanceCase = Awaited<
  ReturnType<typeof selectRetainedMaintenanceCase>
>;
export type RetainedMaintenanceSection = 'controls' | 'sources' | 'queue';
export function assertRetainedMaintenanceCaseNow(
  view: RetainedMaintenanceCase,
) {
  const b = cases.get(view);
  if (!b) throw Error('Exact retained maintenance case required');
  assertRetainedMaintenanceDeskNow(b.desk);
  assertRetentionReviewItemNow(b.original);
}
export async function openRetainedMaintenanceSection(
  view: RetainedMaintenanceCase,
  section: RetainedMaintenanceSection,
) {
  const b = cases.get(view);
  if (!b) throw Error('Exact retained maintenance case required');
  await verified(b.desk);
  await returnRetentionReviewGuide(b.original);
  if (!['controls', 'sources', 'queue'].includes(section))
    throw Error('Exact displayed maintenance destination required');
  assertRetainedMaintenanceCaseNow(view);
  return { view, desk: b.desk, section };
}
export async function navigateRetainedMaintenanceCase(
  view: RetainedMaintenanceCase,
  callback: (jobId: string, section?: OperatingJobSection) => void,
) {
  const b = cases.get(view);
  if (!b) throw Error('Exact retained maintenance case required');
  assertRetainedMaintenanceCaseNow(view);
  if (b.navigationPending)
    throw Error('Exact maintenance navigation already pending');
  b.navigationPending = true;
  try {
    await openRetainedMaintenanceSection(view, 'sources');
    assertRetainedMaintenanceCaseNow(view);
    callback(view.row.context.job_id, 'maintenance');
  } catch (error) {
    const desk = desks.get(b.desk);
    if (desk) desk.unknown = true;
    throw error;
  } finally {
    b.navigationPending = false;
  }
}
