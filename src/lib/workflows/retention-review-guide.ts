import { documentHash } from '../../domain/release/preview';
import { maintenanceDate } from '../../domain/property/maintenance';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import type { OperatingJobSection } from './operating-navigation';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import { readMaintenancePlanningContinuity } from './maintenance-planning-continuity';
import {
  assertFollowUpReadinessCurrentNow,
  reconcileFollowUpReadiness,
  openFollowUpReadinessSource,
  type FollowUpReadinessInput,
  type FollowUpReadinessView,
} from './follow-up-readiness';

function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit retention source review required');
}
interface Binding {
  original: FollowUpReadinessView;
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  unknown: boolean;
}
// Exact reader handles only; no recurring agreement, consent, message or opportunity store.
const retained = new WeakMap<object, Binding>();
function current(b: Binding) {
  try {
    admit(b.gate);
    b.capture.check();
    assertFollowUpReadinessCurrentNow(b.original);
    if (b.unknown) throw Error('Retention source UNKNOWN');
  } catch (error) {
    b.unknown = true;
    throw error;
  }
}
/** The original recurrence/consent reader remains the only planning eligibility producer. */
export async function readRetentionReviewGuide(
  sources: OperatingSources,
  input: FollowUpReadinessInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // OFF before source/input descriptors or getters.
  const capture = captureOperatingSources(sources, gate);
  const original = await readMaintenancePlanningContinuity(
      sources,
      input,
      gate,
    ),
    b: Binding = { original, capture, gate, unknown: false };
  current(b);
  if (
    original.filters.job_id &&
    !capture.entries.some((e) => e.target.job_id === original.filters.job_id)
  )
    throw Error('Exact retained job unavailable; no fallback');
  const body = {
    mode: 'LOCAL_RETENTION_REVIEW_GUIDE' as const,
    organization_id: original.organization_id,
    window: original.window,
    selected_job_id: original.filters.job_id || null,
    requested_purpose: original.requested_purpose,
    rows: original.rows.map((r) => ({
      key: r.key,
      context: {
        organization_id: r.context.organization_id,
        customer_id: r.context.customer_id,
        location_id: r.context.location_id,
        job_id: r.context.job_id,
        issued_version_id: r.context.issued_version_id,
        customer_label: r.context.customer_label,
        property_label: r.context.property_label,
        job_title: r.context.job_title,
      },
      plan_name: r.plan_name,
      plan_reference: r.plan_reference,
      kind: r.selection.kind,
      recorded_due_on: r.recorded_due_on,
      date_basis: r.date_basis,
      planning_status: r.planning_status,
      staff_planning_eligible: r.staff_planning_eligible,
      channel: r.channel,
      historical_channel_state: r.observed_contact_v1.observed_channel_state,
      historical_contact_reference: r.observed_contact_v1.reference,
      current_channel_authority: r.current_channel_authority,
      purpose_consent: r.purpose_consent,
      suppression: r.suppression,
      enrollment: r.enrollment,
      renewal_terms: r.renewal_terms,
      exact_visits: r.exact_visits,
      source: r.selection.source,
      communication_authority: 'BLOCKED' as const,
    })),
    available_occurrences: original.available_occurrences,
    matching_occurrences: original.matching_occurrences,
    coverage: original.coverage,
    count_is_complete: false as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    purpose_is: 'REQUESTED_REVIEW_CONTEXT_ONLY' as const,
    renewal_terms: 'UNKNOWN' as const,
    recipient: null,
    provider_request: null,
    authority: {
      send: false,
      enroll: false,
      schedule: false,
      bill: false,
      financial: false,
      provider: false,
      outbox: false,
    },
    original_source_sha256: original.integrity.sha256,
    custody: 'SAME_TAB_REFERENCE_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  if (
    (await reconcileFollowUpReadiness(original)).status !==
    'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Original consent observations UNKNOWN');
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(view, b);
  return view;
}
export type RetentionReviewGuideView = Awaited<
  ReturnType<typeof readRetentionReviewGuide>
>;
export function assertRetentionReviewGuideNow(view: RetentionReviewGuideView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained retention guide required');
  current(b);
}
export interface RetentionReviewFilter {
  query: string;
  kind: 'all' | RetentionReviewGuideView['rows'][number]['kind'];
  channel_state:
    | 'all'
    | RetentionReviewGuideView['rows'][number]['historical_channel_state'];
  from: string;
  through: string;
}
/** Literal filtering of captured allowlisted rows; not a consent or recurrence engine. */
export function filterRetentionReviewGuide(
  view: RetentionReviewGuideView,
  input: RetentionReviewFilter,
) {
  assertRetentionReviewGuideNow(view);
  const f = prototypeFields(input, [
    'query',
    'kind',
    'channel_state',
    'from',
    'through',
  ]);
  if (
    Object.keys(f).length !== 5 ||
    typeof f.query !== 'string' ||
    f.query.length > 200 ||
    typeof f.from !== 'string' ||
    typeof f.through !== 'string' ||
    !['all', 'inspection_occurrence', 'staff_follow_up'].includes(
      f.kind as string,
    ) ||
    !['all', 'RECORDED_ALLOWED', 'RECORDED_DENIED', 'UNKNOWN'].includes(
      f.channel_state as string,
    )
  )
    throw Error('Exact bounded literal retention filters required');
  maintenanceDate(f.from);
  maintenanceDate(f.through);
  if (
    f.from > f.through ||
    f.from < view.window.from ||
    f.through > view.window.through
  )
    throw Error('Filter range must remain inside captured review window');
  const query = f.query.toLocaleLowerCase();
  const rows = view.rows.filter(
    (r) =>
      (f.kind === 'all' || r.kind === f.kind) &&
      (f.channel_state === 'all' ||
        r.historical_channel_state === f.channel_state) &&
      r.recorded_due_on >= f.from! &&
      r.recorded_due_on <= f.through! &&
      [
        r.context.customer_label,
        r.context.property_label,
        r.context.job_title,
        r.plan_name,
        r.recorded_due_on,
        r.kind,
        r.planning_status,
        r.channel,
        r.historical_channel_state,
        view.requested_purpose,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
  );
  assertRetentionReviewGuideNow(view);
  return freezePrototype({
    rows,
    matching: rows.length,
    captured: view.rows.length,
    count_is_complete: false as const,
    send: false as const,
  });
}
export async function reconcileRetentionReviewGuide(
  view: RetentionReviewGuideView,
) {
  const b = retained.get(view),
    result = {
      status: 'UNKNOWN' as 'UNKNOWN' | 'CAPTURED_NOT_ATOMIC',
      send: false as const,
      replay: 'FORBIDDEN' as const,
      replacement: null,
    };
  if (!b) return result;
  try {
    current(b);
    if (
      (await reconcileFollowUpReadiness(b.original)).status !==
      'CAPTURED_NOT_ATOMIC'
    )
      throw Error('Original observations changed');
    current(b);
    return { ...result, status: 'CAPTURED_NOT_ATOMIC' as const };
  } catch {
    b.unknown = true;
    return result;
  }
}
async function verified(view: RetentionReviewGuideView) {
  if (
    (await reconcileRetentionReviewGuide(view)).status !== 'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Retention source UNKNOWN; exact read only');
  assertRetentionReviewGuideNow(view);
  return retained.get(view)!;
}
const details = new WeakMap<
  object,
  { view: RetentionReviewGuideView; key: string }
>();
/** Inspect the same exact original source without consuming an original review attempt. */
export async function inspectRetentionReviewItem(
  view: RetentionReviewGuideView,
  key: string,
) {
  const b = await verified(view);
  if (typeof key !== 'string' || !view.rows.some((r) => r.key === key))
    throw Error('Exact displayed retention occurrence required');
  const original = await openFollowUpReadinessSource(b.original, key);
  assertRetentionReviewGuideNow(view);
  const row = view.rows.find((r) => r.key === key)!;
  if (
    original.job_id !== row.context.job_id ||
    original.customer_id !== row.context.customer_id ||
    original.location_id !== row.context.location_id ||
    original.plan_reference.id !== row.plan_reference.id ||
    original.plan_reference.revision !== row.plan_reference.revision
  )
    throw Error('Exact original occurrence context changed');
  const detail = freezePrototype({
    row,
    requested_purpose: view.requested_purpose,
    historical_contact_reference: original.historical_contact_reference,
    current_channel_authority: original.current_channel_authority,
    purpose_consent: original.purpose_consent,
    suppression: original.suppression,
    enrollment: original.enrollment,
    original_control_status: original.original_control_status,
    operational_authority: 'BLOCKED' as const,
    send: false as const,
    renewal_terms: 'UNKNOWN' as const,
  });
  details.set(detail, { view, key });
  return detail;
}
export type RetentionReviewItem = Awaited<
  ReturnType<typeof inspectRetentionReviewItem>
>;
export function assertRetentionReviewItemNow(detail: RetentionReviewItem) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained occurrence inspection required');
  assertRetentionReviewGuideNow(b.view);
}
export async function returnRetentionReviewGuide(detail: RetentionReviewItem) {
  const d = details.get(detail);
  if (!d) throw Error('Exact retained occurrence inspection required');
  const b = await verified(d.view);
  await openFollowUpReadinessSource(b.original, d.key);
  assertRetentionReviewItemNow(detail);
  return d.view;
}
export async function openRetentionReviewControls(detail: RetentionReviewItem) {
  await returnRetentionReviewGuide(detail);
  assertRetentionReviewItemNow(detail);
  // Original component accepts only a job hint. Purpose/channel/occurrence confirmations remain separate.
  return detail.row.context.job_id;
}
export async function navigateRetentionReviewJob(
  detail: RetentionReviewItem,
  callback: (jobId: string, section?: OperatingJobSection) => void,
) {
  await returnRetentionReviewGuide(detail);
  assertRetentionReviewItemNow(detail);
  callback(detail.row.context.job_id, 'maintenance');
}
