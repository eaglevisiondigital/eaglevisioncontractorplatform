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
  navigationOutcomes: Map<string, 'PENDING' | 'UNKNOWN'>;
  navigationKeys: readonly string[];
}
const desks = new WeakMap<object, DeskBinding>();
// Outcome metadata follows the pinned canonical Operations handle and exact org/job.
// A fresh desk, purpose, occurrence, revision or wrapper cannot reset ambiguity.
const navigationOutcomes = new WeakMap<
  OperatingSources['operations'],
  Map<string, 'PENDING' | 'UNKNOWN'>
>();
function check(b: DeskBinding, evidenceOnly = false) {
  try {
    admit(b.gate);
    b.capture.check();
    assertRetentionReviewGuideNow(b.original);
    if (
      b.unknown ||
      (!evidenceOnly &&
        b.navigationKeys.some(
          (key) => b.navigationOutcomes.get(key) === 'UNKNOWN',
        ))
    )
      throw Error('Retained maintenance source UNKNOWN');
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
  const root = prototypeFields(sources, [
      'company',
      'operations',
      'estimates',
      'property',
      'entries',
      'gate',
    ]),
    capture = captureOperatingSources(sources, gate),
    operations = root.operations as OperatingSources['operations'];
  const outcomes =
    navigationOutcomes.get(operations) ??
    new Map<string, 'PENDING' | 'UNKNOWN'>();
  navigationOutcomes.set(operations, outcomes);
  const original = await readRetentionReviewGuide(sources, input, gate),
    navigationKeys = capture.entries
      .filter(
        (e) =>
          !original.selected_job_id ||
          e.target.job_id === original.selected_job_id,
      )
      .map((e) => JSON.stringify([capture.organization_id, e.target.job_id])),
    b: DeskBinding = {
      original,
      capture,
      gate,
      unknown: false,
      navigationOutcomes: outcomes,
      navigationKeys,
    };
  check(b, true); // Read-only snapshots never clear or authorize UNKNOWN navigation.
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
  check(b, true);
  if (
    (await reconcileRetentionReviewGuide(original)).status !==
    'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Original consent source UNKNOWN');
  check(b, true);
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
  navigationOutcomes: Map<string, 'PENDING' | 'UNKNOWN'>;
  navigationKey: string;
}
const cases = new WeakMap<object, CaseBinding>();
/** Exact occurrence breadcrumbs remain selected while original controls keep their separate confirmations. */
export async function selectRetainedMaintenanceCase(
  view: RetainedMaintenanceDeskView,
  key: string,
) {
  const b = desks.get(view);
  if (!b) throw Error('Exact retained maintenance desk required');
  check(b, true);
  const selected = view.rows.find((r) => r.key === key);
  if (!selected) throw Error('Exact displayed maintenance occurrence required');
  const navigationKey = JSON.stringify([
      selected.context.organization_id,
      selected.context.job_id,
    ]),
    outcomes = b.navigationOutcomes;
  if (
    (await reconcileRetentionReviewGuide(b.original)).status !==
    'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Original contact observations changed');
  check(b, true);
  const original = await inspectRetentionReviewItem(b.original, key);
  check(b, true);
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
  check(b, true);
  assertRetentionReviewItemNow(original);
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  cases.set(result, {
    desk: view,
    original,
    navigationOutcomes: outcomes,
    navigationKey,
  });
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
  if (b.navigationOutcomes.get(b.navigationKey) === 'PENDING')
    throw Error('Exact maintenance navigation already pending');
  b.navigationOutcomes.set(b.navigationKey, 'PENDING');
  try {
    await openRetainedMaintenanceSection(view, 'sources');
    assertRetainedMaintenanceCaseNow(view);
    callback(view.row.context.job_id, 'maintenance');
  } catch (error) {
    const desk = desks.get(b.desk);
    if (desk) desk.unknown = true;
    b.navigationOutcomes.set(b.navigationKey, 'UNKNOWN');
    throw error;
  } finally {
    if (b.navigationOutcomes.get(b.navigationKey) === 'PENDING')
      b.navigationOutcomes.delete(b.navigationKey);
  }
}
