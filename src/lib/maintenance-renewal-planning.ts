import type { ReportBoundary } from '../domain/property/report-page';
import { reportUuid } from '../domain/property/report-page';
import type { PropertyRepository } from './property';
import {
  readGrowthReminderReview,
  type ReminderWindow,
} from './growth-reminders';

type ReminderReview = Awaited<ReturnType<typeof readGrowthReminderReview>>;
type Candidate = ReminderReview['candidates'][number];
type ChannelReference = NonNullable<ReminderReview['consent']['reference']>;
export interface RenewalPlanningAdmission {
  enabled?: boolean;
  confirmed: boolean;
  lead_days: number;
  overdue_days: number;
}
export interface MaintenancePlanningSelection {
  candidate_key: string;
  kind: Candidate['kind'];
  due_on: string;
  timezone: string;
  source: Candidate['source'];
}
interface Snapshot {
  boundary: ReportBoundary;
  reviewer_id: string;
  window: ReminderWindow;
  policy: { lead_days: number; overdue_days: number };
  selection: MaintenancePlanningSelection;
  channel_reference: ChannelReference;
}
export interface MaintenanceVisitProposal {
  version: 'maintenance-visit-proposal/v1';
  id: string;
  sha256: string;
  snapshot: Snapshot;
  scope: 'STAFF_PLANNING_ONLY';
  renewal_terms: 'UNKNOWN';
  purpose_consent: 'UNVERIFIED';
  suppression: 'UNVERIFIED';
  recurring_enrollment: 'UNVERIFIED';
  sender_authority: 'UNVERIFIED';
  renewal_anchor: null;
  agreement_id: null;
  scheduling_authority: 'BLOCKED';
  message_authority: 'BLOCKED';
  billing_authority: 'BLOCKED';
  recipient: null;
  provider_request: null;
}

// Copy named own primitive data only. Caller getters, prototypes, serializers and
// extra private fields never become evidence and are never frozen or serialized.
function record(value: unknown, names: readonly string[], exact = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Primitive planning input required');
  if (
    exact &&
    (Reflect.ownKeys(value).length !== names.length ||
      Reflect.ownKeys(value).some(
        (k) => typeof k !== 'string' || !names.includes(k),
      ))
  )
    throw Error('Exact planning evidence required');
  return Object.fromEntries(
    names.map((name) => {
      const d = Object.getOwnPropertyDescriptor(value, name);
      if (!d || !('value' in d))
        throw Error('Primitive planning input required');
      return [name, d.value as unknown];
    }),
  );
}
function string(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw Error('Invalid planning text');
  return value;
}
function uuid(value: unknown): string {
  if (!reportUuid(value)) throw Error('Invalid planning identity');
  return value as string;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw Error('Invalid planning integer');
  return value;
}
function boundary(value: unknown, exact = false): ReportBoundary {
  const r = record(
    value,
    ['organization_id', 'customer_id', 'location_id'],
    exact,
  );
  return {
    organization_id: string(r.organization_id, 100),
    customer_id: uuid(r.customer_id),
    location_id: uuid(r.location_id),
  };
}
function windowInput(value: unknown, exact = false): ReminderWindow {
  const r = record(value, ['from', 'through', 'as_of', 'channel'], exact);
  if (r.channel !== 'email' && r.channel !== 'sms')
    throw Error('Invalid planning channel');
  return {
    from: string(r.from, 10),
    through: string(r.through, 10),
    as_of: string(r.as_of, 100),
    channel: r.channel,
  };
}
function policyInput(value: unknown) {
  const r = record(value, [
    'enabled',
    'confirmed',
    'lead_days',
    'overdue_days',
  ]);
  if (r.enabled !== true || r.confirmed !== true)
    throw Error('Explicit synthetic planning confirmation required');
  return {
    lead_days: integer(r.lead_days, 0, 30),
    overdue_days: integer(r.overdue_days, 0, 93),
  };
}
function selectionInput(
  value: unknown,
  exact = false,
): MaintenancePlanningSelection {
  const r = record(
      value,
      ['candidate_key', 'kind', 'due_on', 'timezone', 'source'],
      exact,
    ),
    s = record(
      r.source,
      [
        'plan_id',
        'plan_revision',
        'occurrence_index',
        'report_id',
        'report_version',
        'finding_id',
        'maintenance_revision',
      ],
      exact,
    );
  if (r.kind !== 'inspection_occurrence' && r.kind !== 'staff_follow_up')
    throw Error('Invalid planning source kind');
  const source = {
    plan_id: uuid(s.plan_id),
    plan_revision: integer(s.plan_revision, 1),
    occurrence_index:
      s.occurrence_index === null
        ? null
        : integer(s.occurrence_index, 0, 10000),
    report_id: s.report_id === null ? null : uuid(s.report_id),
    report_version:
      s.report_version === null ? null : integer(s.report_version, 1),
    finding_id: s.finding_id === null ? null : string(s.finding_id, 100),
    maintenance_revision:
      s.maintenance_revision === null
        ? null
        : integer(s.maintenance_revision, 0),
  };
  if (
    r.kind === 'inspection_occurrence'
      ? source.occurrence_index === null ||
        source.report_id !== null ||
        source.report_version !== null ||
        source.finding_id !== null ||
        source.maintenance_revision !== null
      : source.occurrence_index !== null ||
        source.report_id === null ||
        source.report_version === null ||
        source.finding_id === null ||
        source.maintenance_revision === null
  )
    throw Error('Contradictory planning source');
  return {
    candidate_key: string(r.candidate_key),
    kind: r.kind,
    due_on: string(r.due_on, 10),
    timezone: string(r.timezone, 100),
    source,
  };
}
function channelInput(value: unknown): ChannelReference {
  const r = record(value, ['id', 'recorded_at', 'policy'], true);
  if (r.policy !== 'contact-v1') throw Error('Unknown channel evidence');
  return {
    id: uuid(r.id),
    recorded_at: string(r.recorded_at, 100),
    policy: 'contact-v1',
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function digest(snapshot: Snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
function livePolicy(
  admission: RenewalPlanningAdmission,
  policy: ReturnType<typeof policyInput>,
) {
  if (!same(policyInput(admission), policy))
    throw Error('Planning confirmation changed');
}
function prepared(
  snapshot: Snapshot,
  sha256: string,
): MaintenanceVisitProposal {
  return freeze({
    version: 'maintenance-visit-proposal/v1',
    id: `maintenance-visit-proposal:${sha256}`,
    sha256,
    snapshot,
    scope: 'STAFF_PLANNING_ONLY',
    renewal_terms: 'UNKNOWN',
    purpose_consent: 'UNVERIFIED',
    suppression: 'UNVERIFIED',
    recurring_enrollment: 'UNVERIFIED',
    sender_authority: 'UNVERIFIED',
    renewal_anchor: null,
    agreement_id: null,
    scheduling_authority: 'BLOCKED',
    message_authority: 'BLOCKED',
    billing_authority: 'BLOCKED',
    recipient: null,
    provider_request: null,
  });
}

/** Unwired, read-only planning view over the existing eligibility reader. A date
 * is the recorded recurrence/follow-up date, not a booking or renewal agreement. */
export async function readMaintenanceRenewalPlanning(
  repo: PropertyRepository,
  target: ReportBoundary,
  actor: string,
  query: ReminderWindow,
  admission: RenewalPlanningAdmission,
) {
  const policy = policyInput(admission),
    pinnedBoundary = boundary(target),
    pinnedWindow = windowInput(query),
    reviewer = string(actor, 100);
  const review = await readGrowthReminderReview(
    repo,
    pinnedBoundary,
    reviewer,
    pinnedWindow,
    {
      enabled: true,
      eligibility: { enabled: true, confirmed: true, ...policy },
    },
  );
  livePolicy(admission, policy);
  return freeze({
    boundary: pinnedBoundary,
    reviewer_id: reviewer,
    window: pinnedWindow,
    policy,
    coverage: review.coverage,
    history_completeness: review.history_completeness,
    count_is_complete: review.count_is_complete,
    candidates: review.candidates.map((candidate) => {
      const eligibility = review.eligibility_review!.items.find(
        (i) => i.candidate_key === candidate.key,
      )!;
      return {
        selection: selectionInput({
          candidate_key: candidate.key,
          kind: candidate.kind,
          due_on: candidate.due_on,
          timezone: candidate.timezone,
          source: candidate.source,
        }),
        planning_status: eligibility.planning_status,
        can_prepare_visit_proposal: eligibility.eligible_for_staff_review,
        exact_visits: eligibility.exact_visits.map((v) => ({ ...v })),
        channel_reference: eligibility.channel_reference
          ? channelInput(eligibility.channel_reference)
          : null,
        renewal_terms: 'UNKNOWN' as const,
        purpose_consent: 'UNVERIFIED' as const,
        suppression: 'UNVERIFIED' as const,
        recurring_enrollment: 'UNVERIFIED' as const,
        sender_authority: 'UNVERIFIED' as const,
        renewal_anchor: null,
        agreement_id: null,
        message_authority: 'BLOCKED' as const,
        scheduling_authority: 'BLOCKED' as const,
        billing_authority: 'BLOCKED' as const,
      };
    }),
    message_authority: 'BLOCKED' as const,
    scheduling_authority: 'BLOCKED' as const,
    billing_authority: 'BLOCKED' as const,
    recipient: null,
    provider_request: null,
  });
}

/** Explicit preparation only; no save, visit creation, enrollment, recipient or
 * command seam. Repeated reads of the exact same evidence have the same identity. */
export async function prepareMaintenanceVisitProposal(
  repo: PropertyRepository,
  target: ReportBoundary,
  actor: string,
  query: ReminderWindow,
  selected: MaintenancePlanningSelection,
  admission: RenewalPlanningAdmission,
) {
  const selection = selectionInput(selected),
    policy = policyInput(admission);
  const initial = await readMaintenanceRenewalPlanning(
    repo,
    target,
    actor,
    query,
    admission,
  );
  const row = initial.candidates.find((c) => same(c.selection, selection));
  if (!row?.can_prepare_visit_proposal || !row.channel_reference)
    throw Error(
      'Exact eligible planning source unavailable; do not replace or infer',
    );
  const snapshot: Snapshot = {
    boundary: initial.boundary,
    reviewer_id: initial.reviewer_id,
    window: initial.window,
    policy: initial.policy,
    selection: row.selection,
    channel_reference: row.channel_reference,
  };
  const sha256 = await digest(snapshot);
  livePolicy(admission, policy);
  const final = await readMaintenanceRenewalPlanning(
    repo,
    snapshot.boundary,
    snapshot.reviewer_id,
    snapshot.window,
    admission,
  );
  const current = final.candidates.find((c) => same(c.selection, selection));
  if (
    !current?.can_prepare_visit_proposal ||
    !same(current.channel_reference, snapshot.channel_reference)
  )
    throw Error('Planning source changed; no proposal prepared');
  livePolicy(admission, policy);
  return prepared(snapshot, sha256);
}

function retained(value: unknown) {
  const r = record(
    value,
    [
      'version',
      'id',
      'sha256',
      'snapshot',
      'scope',
      'renewal_terms',
      'purpose_consent',
      'suppression',
      'recurring_enrollment',
      'sender_authority',
      'renewal_anchor',
      'agreement_id',
      'scheduling_authority',
      'message_authority',
      'billing_authority',
      'recipient',
      'provider_request',
    ],
    true,
  );
  if (
    r.version !== 'maintenance-visit-proposal/v1' ||
    typeof r.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(r.sha256) ||
    r.id !== `maintenance-visit-proposal:${r.sha256}` ||
    r.scope !== 'STAFF_PLANNING_ONLY' ||
    r.renewal_terms !== 'UNKNOWN' ||
    r.purpose_consent !== 'UNVERIFIED' ||
    r.suppression !== 'UNVERIFIED' ||
    r.recurring_enrollment !== 'UNVERIFIED' ||
    r.sender_authority !== 'UNVERIFIED' ||
    r.renewal_anchor !== null ||
    r.agreement_id !== null ||
    r.scheduling_authority !== 'BLOCKED' ||
    r.message_authority !== 'BLOCKED' ||
    r.billing_authority !== 'BLOCKED' ||
    r.recipient !== null ||
    r.provider_request !== null
  )
    throw Error('Invalid retained planning evidence');
  const s = record(
      r.snapshot,
      [
        'boundary',
        'reviewer_id',
        'window',
        'policy',
        'selection',
        'channel_reference',
      ],
      true,
    ),
    p = record(s.policy, ['lead_days', 'overdue_days'], true);
  const snapshot: Snapshot = {
    boundary: boundary(s.boundary, true),
    reviewer_id: string(s.reviewer_id, 100),
    window: windowInput(s.window, true),
    policy: {
      lead_days: integer(p.lead_days, 0, 30),
      overdue_days: integer(p.overdue_days, 0, 93),
    },
    selection: selectionInput(s.selection, true),
    channel_reference: channelInput(s.channel_reference),
  };
  return { snapshot, sha256: r.sha256 };
}

/** Exact read-only reconciliation. Missing/denied/ambiguous evidence is UNKNOWN;
 * no replacement proposal, new ID, replay, continuation or mutation is returned. */
export async function reconcileMaintenanceVisitProposal(
  repo: PropertyRepository,
  actor: string,
  proposal: unknown,
  admission: RenewalPlanningAdmission,
): Promise<
  Readonly<{
    status: 'CURRENT' | 'STALE' | 'UNKNOWN';
    proposal_id: string | null;
    scheduling_authority: 'BLOCKED';
    message_authority: 'BLOCKED';
    billing_authority: 'BLOCKED';
    replacement: null;
  }>
> {
  let id: string | null = null;
  const result = (status: 'CURRENT' | 'STALE' | 'UNKNOWN') =>
    freeze({
      status,
      proposal_id: id,
      scheduling_authority: 'BLOCKED' as const,
      message_authority: 'BLOCKED' as const,
      billing_authority: 'BLOCKED' as const,
      replacement: null,
    });
  try {
    const { snapshot, sha256 } = retained(proposal),
      policy = policyInput(admission);
    if (
      actor !== snapshot.reviewer_id ||
      !same(snapshot.policy, policy) ||
      (await digest(snapshot)) !== sha256
    )
      return result('UNKNOWN');
    id = `maintenance-visit-proposal:${sha256}`;
    livePolicy(admission, policy);
    const review = await readMaintenanceRenewalPlanning(
      repo,
      snapshot.boundary,
      actor,
      snapshot.window,
      admission,
    );
    const exact = review.candidates.find((c) =>
      same(c.selection, snapshot.selection),
    );
    if (!exact) {
      const changedPlan = review.candidates.some(
        (c) =>
          c.selection.source.plan_id === snapshot.selection.source.plan_id &&
          c.selection.source.plan_revision !==
            snapshot.selection.source.plan_revision,
      );
      return result(changedPlan ? 'STALE' : 'UNKNOWN');
    }
    if (exact.planning_status === 'UNKNOWN') return result('UNKNOWN');
    return result(
      exact.can_prepare_visit_proposal &&
        same(exact.channel_reference, snapshot.channel_reference)
        ? 'CURRENT'
        : 'STALE',
    );
  } catch {
    return result('UNKNOWN');
  }
}
