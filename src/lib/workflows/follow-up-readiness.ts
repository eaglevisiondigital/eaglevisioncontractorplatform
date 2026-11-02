import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFollowUpDesk,
  assertFollowUpCurrentNow,
  openFollowUpSource,
  type FollowUpDeskInput,
  type FollowUpDeskView,
  type FollowUpProposalInput,
} from './follow-up-admission';
import { readGrowthReminderReview } from '../growth-reminders';
import {
  readConsentCancellationSources,
  assertConsentCancellationSourcesNow,
  prepareConsentCancellationReview,
  assertConsentCancellationReviewNow,
  reconcileConsentCancellationReview,
  cancelConsentCancellationReview,
  consentCancellationStateNow,
  type ConsentCancellationView,
} from './consent-cancellation-review';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

type ObservedChannel = 'RECORDED_ALLOWED' | 'RECORDED_DENIED' | 'UNKNOWN';
export interface FollowUpReadinessInput extends FollowUpDeskInput {
  /** Explicit requested review context, never recorded purpose consent. */
  purpose: FollowUpProposalInput['purpose'];
  channel_state: 'all' | ObservedChannel;
}
function on(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Follow-up readiness is OFF');
}
function pin(input: FollowUpReadinessInput) {
  const f = prototypeFields(input, [
    'window',
    'lead_days',
    'overdue_days',
    'query',
    'kind',
    'readiness',
    'job_id',
    'customer_id',
    'location_id',
    'purpose',
    'channel_state',
  ]);
  const w = prototypeFields(f.window, ['from', 'through', 'as_of', 'channel']);
  if (
    Object.keys(f).length !== 11 ||
    Object.keys(w).length !== 4 ||
    Object.entries({ ...f, ...w }).some(
      ([k, v]) =>
        k !== 'window' &&
        !(
          typeof v === 'string' ||
          (typeof v === 'number' && Number.isSafeInteger(v))
        ),
    ) ||
    !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
      f.purpose as string,
    ) ||
    !['all', 'RECORDED_ALLOWED', 'RECORDED_DENIED', 'UNKNOWN'].includes(
      f.channel_state as string,
    )
  )
    throw Error(
      'Exact primitive follow-up filters and requested purpose required',
    );
  if (typeof f.query !== 'string' || f.query.length > 200)
    throw Error('Literal search must be at most 200 characters');
  const value = { ...f, window: w } as unknown as FollowUpReadinessInput;
  const { purpose, channel_state, ...desk } = value;
  // Search is literal over the final allowlisted facts; C10 retains exact context/kind filters.
  return {
    value,
    desk: { ...desk, query: '' },
    signature: JSON.stringify(value),
    purpose,
    channel_state,
  };
}
type Reminder = Awaited<ReturnType<typeof readGrowthReminderReview>>;
interface Binding {
  sources: OperatingSources;
  input: FollowUpReadinessInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  desk: FollowUpDeskView | null;
  observations: Map<string, Reminder>;
  gate: JourneyAdmission;
  unknown: boolean;
  reviews: Map<string, ConsentCancellationView>;
}
const retained = new WeakMap<object, Binding>();
// References to original C12 one-use outputs only; never a second consent or opportunity store.
const originals = new WeakMap<
  OperatingSources['property'],
  Map<string, ConsentCancellationView>
>();
function check(b: Binding) {
  try {
    on(b.gate);
    b.capture.check();
    if (b.unknown || pin(b.input).signature !== b.signature)
      throw Error('Original filters or purpose changed');
    if (b.desk) assertFollowUpCurrentNow(b.desk);
  } catch (error) {
    b.unknown = true;
    throw error;
  }
}
function observed(r: Reminder) {
  return JSON.stringify({
    consent: r.consent,
    purpose: r.purpose_consent,
    suppression: r.suppression,
    enrollment: r.recurring_enrollment,
  });
}
async function refreshEvidence(b: Binding) {
  check(b);
  for (const job of b.desk!.jobs) {
    const current = await readGrowthReminderReview(
      b.sources.property,
      {
        organization_id: job.organization_id,
        customer_id: job.customer_id,
        location_id: job.location_id,
      },
      b.capture.actor_id,
      pin(b.input).value.window,
      { enabled: true },
    );
    check(b);
    if (observed(current) !== observed(b.observations.get(job.job_id)!)) {
      b.unknown = true;
      throw Error('Recorded contact/consent source changed');
    }
  }
  check(b);
}
/** Actual C10 recurrence/maintenance records plus canonical captured contact evidence; no eligibility engine. */
export async function readFollowUpReadiness(
  sources: OperatingSources,
  input: FollowUpReadinessInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate); // OFF before source/input getters.
  const capture = captureOperatingSources(sources, gate),
    request = pin(input),
    b: Binding = {
      sources,
      input,
      signature: request.signature,
      capture,
      desk: null,
      observations: new Map(),
      gate,
      unknown: false,
      reviews: originals.get(sources.property) ?? new Map(),
    };
  originals.set(sources.property, b.reviews);
  b.desk = await readFollowUpDesk(sources, request.desk, gate);
  check(b);
  for (const job of b.desk.jobs) {
    const observation = await readGrowthReminderReview(
      sources.property,
      {
        organization_id: job.organization_id,
        customer_id: job.customer_id,
        location_id: job.location_id,
      },
      capture.actor_id,
      request.value.window,
      { enabled: true },
    );
    check(b);
    b.observations.set(job.job_id, observation);
  }
  const rows = b.desk.candidates.map((candidate) => {
    const observation = b.observations.get(candidate.context.job_id)!;
    const state = sources.property.read(capture.organization_id);
    const plans = state.plans.filter(
      (p) =>
        p.id === candidate.selection.source.plan_id &&
        p.revision === candidate.selection.source.plan_revision &&
        p.organization_id === capture.organization_id &&
        p.customer_id === candidate.context.customer_id &&
        p.location_id === candidate.context.location_id &&
        p.job_id === candidate.context.job_id,
    );
    if (plans.length !== 1)
      throw Error('Exact original maintenance plan source UNKNOWN');
    const plan = plans[0];
    return {
      ...candidate,
      requested_purpose: request.purpose,
      recorded_due_on: candidate.selection.due_on,
      date_basis:
        candidate.selection.kind === 'staff_follow_up'
          ? ('RECORDED_STAFF_FOLLOW_UP' as const)
          : ('CANONICAL_PLAN_OCCURRENCE' as const),
      plan_reference: {
        id: plan.id,
        revision: plan.revision,
        cadence: plan.cadence,
        starts_on: plan.starts_on,
        timezone: plan.timezone,
      },
      channel: request.value.window.channel,
      observed_contact_v1: observation.consent,
      current_channel_authority: 'UNKNOWN' as const,
      purpose_consent: observation.purpose_consent,
      suppression: observation.suppression,
      enrollment: observation.recurring_enrollment,
      enrollment_reference: null,
      suppression_reference: null,
      renewal_terms: 'UNKNOWN' as const,
      next_missing_evidence:
        'EXACT_ORIGINAL_CONSENT_REQUIREMENTS_REVIEW' as const,
      communication_authority: observation.communication_authority,
    };
  });
  const query = request.value.query.toLocaleLowerCase();
  const matching = rows.filter(
    (row) =>
      (request.channel_state === 'all' ||
        row.observed_contact_v1.observed_channel_state ===
          request.channel_state) &&
      [
        row.context.customer_label,
        row.context.property_label,
        row.context.job_title,
        row.plan_name,
        row.recorded_due_on,
        row.selection.kind,
        row.planning_status,
        row.channel,
        row.observed_contact_v1.observed_channel_state,
        request.purpose,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
  );
  const body = {
    mode: 'LOCAL_FOLLOW_UP_READINESS_TRIAGE' as const,
    organization_id: capture.organization_id,
    window: request.value.window,
    requested_purpose: request.purpose,
    filters: {
      query: request.value.query,
      job_id: request.value.job_id,
      customer_id: request.value.customer_id,
      location_id: request.value.location_id,
      channel_state: request.channel_state,
      kind: request.value.kind,
      readiness: request.value.readiness,
    },
    jobs: b.desk.jobs,
    rows: matching,
    available_occurrences: b.desk.available_occurrences,
    matching_occurrences: matching.length,
    coverage: b.desk.coverage,
    count_is_complete: false as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    purpose_is: 'REQUESTED_REVIEW_CONTEXT_ONLY' as const,
    authority: {
      send: false,
      provider: false,
      outbox: false,
      enroll: false,
      schedule: false,
      financial: false,
    },
  };
  const sha256 = await documentHash(body);
  check(b);
  await refreshEvidence(b);
  check(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(view, b);
  return view;
}
export type FollowUpReadinessView = Awaited<
  ReturnType<typeof readFollowUpReadiness>
>;
export function assertFollowUpReadinessCurrentNow(view: FollowUpReadinessView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained follow-up readiness required');
  check(b);
}
export async function reconcileFollowUpReadiness(view: FollowUpReadinessView) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(view);
  if (!b) return unknown;
  try {
    await refreshEvidence(b);
    check(b);
    return { ...unknown, status: 'CAPTURED_NOT_ATOMIC' as const };
  } catch {
    return unknown;
  }
}
/** Original plan, historical contact reference and absent enrollment/suppression remain separate. */
export async function openFollowUpReadinessSource(
  view: FollowUpReadinessView,
  key: string,
) {
  assertFollowUpReadinessCurrentNow(view);
  const b = retained.get(view)!;
  const row = view.rows.find((r) => r.key === key);
  if (!row) throw Error('Exact displayed follow-up source required');
  await refreshEvidence(b);
  check(b);
  const detail = await openFollowUpSource(b.desk!, key);
  check(b);
  await refreshEvidence(b);
  check(b);
  const original = b.reviews.get(key);
  if (original) assertConsentCancellationReviewNow(original);
  return freezePrototype({
    ...detail,
    plan_reference: row.plan_reference,
    historical_contact_reference: row.observed_contact_v1.reference,
    current_channel_authority: 'UNKNOWN' as const,
    purpose_consent: row.purpose_consent,
    suppression: row.suppression,
    suppression_reference: null,
    enrollment: row.enrollment,
    enrollment_reference: null,
    original_control_reference: original
      ? {
          requirements_sha256: original.original_requirements_sha256,
          review_sha256: original.integrity.sha256,
        }
      : null,
    original_control_status: original
      ? consentCancellationStateNow(original)
      : ('NOT_REVIEWED' as const),
    send: false,
  });
}
/** Explicit original C12 workflow control only; browsing/filtering never consumes a one-use hold. */
export async function inspectFollowUpReadinessRequirements(
  view: FollowUpReadinessView,
  key: string,
  input: { proposed_on: string; plan_kind: FollowUpProposalInput['plan_kind'] },
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  on(gate);
  assertFollowUpReadinessCurrentNow(view);
  const b = retained.get(view)!;
  if (!view.rows.some((r) => r.key === key))
    throw Error('Exact displayed follow-up source required');
  const p = prototypeFields(input, ['proposed_on', 'plan_kind']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.proposed_on !== 'string' ||
    !['follow_up', 'renewal'].includes(p.plan_kind as string)
  )
    throw Error('Explicit human date and planning kind required');
  const signature = JSON.stringify(p),
    current = () => {
      check(b);
      on(gate);
      if (
        JSON.stringify(prototypeFields(input, ['proposed_on', 'plan_kind'])) !==
        signature
      )
        throw Error('Original proposal changed');
    };
  await refreshEvidence(b);
  current();
  const sources = await readConsentCancellationSources(
    b.sources,
    pin(b.input).desk,
    gate,
  );
  current();
  assertConsentCancellationSourcesNow(sources);
  const original = await prepareConsentCancellationReview(
    sources,
    {
      proposal: {
        candidate_key: key,
        proposed_on: p.proposed_on,
        purpose: view.requested_purpose,
        plan_kind: p.plan_kind as FollowUpProposalInput['plan_kind'],
      },
      expires_at: Date.now() + 30 * 60_000,
    },
    gate,
  );
  current();
  assertConsentCancellationReviewNow(original);
  b.reviews.set(key, original);
  return original;
}
export async function reconcileFollowUpReadinessRequirements(
  view: FollowUpReadinessView,
  key: string,
) {
  const unknown = {
    status: 'UNKNOWN' as const,
    send: false,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  const b = retained.get(view),
    original = b?.reviews.get(key);
  if (!b || !original || !view.rows.some((row) => row.key === key))
    return unknown;
  try {
    await refreshEvidence(b);
    check(b);
    const result = await reconcileConsentCancellationReview(original);
    check(b);
    return result;
  } catch {
    return unknown;
  }
}
export function closeFollowUpReadinessReview(
  view: FollowUpReadinessView,
  key: string,
  action: 'CANCEL' | 'REVOKE',
) {
  assertFollowUpReadinessCurrentNow(view);
  const original = retained.get(view)!.reviews.get(key);
  if (!original || !view.rows.some((row) => row.key === key))
    throw Error('Exact original retained consent review required');
  return cancelConsentCancellationReview(original, action);
}
