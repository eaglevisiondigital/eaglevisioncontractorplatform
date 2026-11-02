import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readPortfolioMaintenance,
  reconcilePortfolioMaintenance,
  openPortfolioMaintenanceItem,
  reviewPortfolioMaintenanceConsent,
  type PortfolioMaintenanceInput,
  type PortfolioMaintenanceView,
} from './portfolio-maintenance';
import { readGrowthReminderReview } from '../growth-reminders';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { maintenanceDate } from '../../domain/property/maintenance';
import { documentHash } from '../../domain/release/preview';
export type FollowUpDeskInput = PortfolioMaintenanceInput;
export interface FollowUpProposalInput {
  candidate_key: string;
  proposed_on: string;
  purpose: 'service_follow_up' | 'recurring_maintenance' | 'marketing';
  plan_kind: 'follow_up' | 'renewal';
}
function fields(value: unknown, names: string[]) {
  const f = prototypeFields(value, names);
  if (Object.keys(f).length !== names.length)
    throw Error('Exact follow-up fields required');
  return f;
}
function deskSignature(input: FollowUpDeskInput) {
  const f = fields(input, [
      'window',
      'lead_days',
      'overdue_days',
      'query',
      'kind',
      'readiness',
      'job_id',
      'customer_id',
      'location_id',
    ]),
    w = fields(f.window, ['from', 'through', 'as_of', 'channel']);
  for (const [key, value] of Object.entries({ ...f, ...w }))
    if (
      key !== 'window' &&
      !(
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
    )
      throw Error('Primitive follow-up selection required');
  return JSON.stringify({ ...f, window: w });
}
function proposal(input: FollowUpProposalInput) {
  const f = fields(input, [
    'candidate_key',
    'proposed_on',
    'purpose',
    'plan_kind',
  ]);
  if (
    typeof f.candidate_key !== 'string' ||
    !f.candidate_key ||
    f.candidate_key.length > 2000 ||
    typeof f.proposed_on !== 'string' ||
    typeof f.purpose !== 'string' ||
    !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
      f.purpose,
    ) ||
    typeof f.plan_kind !== 'string' ||
    !['follow_up', 'renewal'].includes(f.plan_kind)
  )
    throw Error('Exact proposed date, purpose and plan kind required');
  maintenanceDate(f.proposed_on);
  return {
    value: f as unknown as FollowUpProposalInput,
    signature: JSON.stringify(f),
  };
}
function admit(gate: JourneyAdmission) {
  const f = fields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit enabled staff confirmation required');
}
type Capture = ReturnType<typeof captureOperatingSources>;
interface DeskBinding {
  sources: OperatingSources;
  input: FollowUpDeskInput;
  signature: string;
  capture: Capture;
  portfolio: PortfolioMaintenanceView;
}
const desks = new WeakMap<object, DeskBinding>();
function check(b: DeskBinding) {
  b.capture.check();
  if (deskSignature(b.input) !== b.signature)
    throw Error('Original follow-up window or filters changed');
}
export async function readFollowUpDesk(
  sources: OperatingSources,
  input: FollowUpDeskInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    signature = deskSignature(input),
    portfolio = await readPortfolioMaintenance(sources, input, gate),
    b = { sources, input, signature, capture, portfolio };
  check(b);
  const result = freezePrototype({
    mode: 'LOCAL_SOURCE_BOUND_FOLLOW_UP_DESK' as const,
    organization_id: portfolio.organization_id,
    window: portfolio.window,
    jobs: portfolio.jobs,
    candidates: portfolio.candidates,
    findings: portfolio.findings,
    available_occurrences: portfolio.available_occurrences,
    matching_occurrences: portfolio.matching_occurrences,
    coverage: portfolio.coverage,
    count_is_complete: false as const,
    renewal_terms: 'UNKNOWN' as const,
    communication_authority: 'BLOCKED' as const,
    planning_integrity: portfolio.integrity,
  });
  desks.set(result, b);
  return result;
}
export type FollowUpDeskView = Awaited<ReturnType<typeof readFollowUpDesk>>;
export function assertFollowUpCurrentNow(view: FollowUpDeskView) {
  const b = desks.get(view);
  if (!b) throw Error('Exact retained follow-up desk required');
  check(b);
}
interface Hold {
  state: 'PENDING' | 'BLOCKED_REVIEW' | 'UNKNOWN';
  result?: FollowUpAdmissionView;
  view: FollowUpDeskView;
  input: FollowUpProposalInput;
  signature: string;
  gate: JourneyAdmission;
}
const holds = new WeakMap<OperatingSources['property'], Map<string, Hold>>();
function holdKey(
  b: DeskBinding,
  candidate: FollowUpDeskView['candidates'][number],
) {
  return JSON.stringify([
    b.capture.organization_id,
    candidate.context.customer_id,
    candidate.context.location_id,
    candidate.key,
  ]);
}
export function followUpAttemptState(view: FollowUpDeskView, key: string) {
  const b = desks.get(view);
  if (!b) return 'UNKNOWN' as const;
  const c = view.candidates.find((c) => c.key === key);
  if (!c) return 'UNKNOWN' as const;
  try {
    check(b);
    return (
      holds.get(b.sources.property)?.get(holdKey(b, c))?.state ??
      ('NOT_REVIEWED' as const)
    );
  } catch {
    return 'UNKNOWN' as const;
  }
}
const unknown = () => ({
  status: 'UNKNOWN' as const,
  decision: 'BLOCKED' as const,
  send: false as const,
  recipient: null,
  provider_request: null,
  replacement: null,
  replay: 'FORBIDDEN' as const,
});
function current(b: DeskBinding, h: Hold) {
  check(b);
  admit(h.gate);
  if (proposal(h.input).signature !== h.signature)
    throw Error('Original proposed date, purpose or selection changed');
}
/** One in-memory, source-keyed inspection of send requirements. It cannot admit a message. */
export async function prepareFollowUpAdmission(
  view: FollowUpDeskView,
  input: FollowUpProposalInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const b = desks.get(view),
    p = proposal(input);
  admit(gate);
  if (!b) throw Error('Exact retained follow-up desk required');
  check(b);
  const candidate = view.candidates.find(
    (c) => c.key === p.value.candidate_key,
  );
  if (!candidate)
    throw Error('Exact displayed maintenance opportunity required');
  const key = holdKey(b, candidate),
    map = holds.get(b.sources.property) ?? new Map<string, Hold>();
  holds.set(b.sources.property, map);
  if (map.has(key))
    throw Error(
      'Existing review or UNKNOWN: exact read-only reconciliation only',
    );
  const h: Hold = {
    state: 'PENDING',
    view,
    input,
    signature: p.signature,
    gate,
  };
  map.set(key, h);
  try {
    current(b, h);
    if (
      (await reconcilePortfolioMaintenance(b.portfolio)).status !==
      'CAPTURED_NOT_ATOMIC'
    )
      throw Error('Planning source UNKNOWN');
    current(b, h);
    const consent = await reviewPortfolioMaintenanceConsent(
      b.portfolio,
      candidate.key,
      { purpose: p.value.purpose },
      gate,
    );
    current(b, h);
    if (!('integrity' in consent))
      throw Error('Current consent source UNKNOWN');
    const readCurrent = () =>
      readGrowthReminderReview(
        b.sources.property,
        {
          organization_id: candidate.context.organization_id,
          customer_id: candidate.context.customer_id,
          location_id: candidate.context.location_id,
        },
        b.capture.actor_id,
        b.portfolio.window,
        { enabled: true },
      );
    const observed = await readCurrent();
    current(b, h);
    // These are the existing authoritative reader's limits, not invented consent/suppression facts.
    const evidence = (r: typeof observed) =>
      JSON.stringify({
        consent: r.consent,
        purpose: r.purpose_consent,
        suppression: r.suppression,
        enrollment: r.recurring_enrollment,
      });
    const observedSignature = evidence(observed);
    const body = {
      mode: 'LOCAL_FOLLOW_UP_ADMISSION_BOUNDARY_REVIEW' as const,
      status: 'BLOCKED_REVIEW' as const,
      decision: 'BLOCKED' as const,
      organization_id: view.organization_id,
      context: candidate.context,
      source_selection: candidate.selection,
      recorded_due_on: candidate.selection.due_on,
      recorded_plan_name: candidate.plan_name,
      staff_planning_eligible: candidate.staff_planning_eligible,
      proposal: {
        proposed_on: p.value.proposed_on,
        purpose: p.value.purpose,
        plan_kind: p.value.plan_kind,
        authority: 'UNSAVED_HUMAN_PROPOSAL' as const,
      },
      channel: b.portfolio.window.channel,
      observed_contact_v1_state: observed.consent.observed_channel_state,
      observed_consent_evidence: observed.consent.reference,
      current_channel_authority: 'UNKNOWN' as const,
      purpose_consent: observed.purpose_consent,
      suppression: observed.suppression,
      recurring_enrollment: observed.recurring_enrollment,
      renewal_terms: 'UNKNOWN' as const,
      consent_currentness: 'CAPTURED_NOT_ATOMIC' as const,
      authoritative_send_gate: 'ABSENT' as const,
      missing_gates: consent.missing_gates,
      recipient: null,
      provider_request: null,
      planning_sha256: view.planning_integrity.sha256,
      consent_review_sha256: consent.integrity.sha256,
      authority: {
        send: false,
        resolve_recipient: false,
        enroll: false,
        schedule: false,
        contract: false,
        financial: false,
        hosted: false,
        replay: false,
      },
    };
    const sha256 = await documentHash(body);
    current(b, h);
    // Re-read current source evidence after the last hash await, including the canonical
    // suppression/purpose fields. Missing authoritative records always remain unverified.
    const final = await readCurrent();
    current(b, h);
    if (evidence(final) !== observedSignature)
      throw Error(
        'Consent withdrawal, conflict or suppression evidence changed',
      );
    const result = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    h.result = result;
    h.state = 'BLOCKED_REVIEW';
    return result;
  } catch (error) {
    h.state = 'UNKNOWN';
    throw error;
  }
}
export type FollowUpAdmissionView = Awaited<
  ReturnType<typeof prepareFollowUpAdmission>
>;
export async function reconcileFollowUpAdmission(
  view: FollowUpDeskView,
  key: string,
) {
  const b = desks.get(view);
  if (!b) return unknown();
  const candidate = view.candidates.find((c) => c.key === key);
  if (!candidate) return unknown();
  const h = holds.get(b.sources.property)?.get(holdKey(b, candidate));
  if (!h || h.view !== view) return unknown();
  try {
    current(b, h);
    if (
      (await reconcilePortfolioMaintenance(b.portfolio)).status !==
      'CAPTURED_NOT_ATOMIC'
    )
      return unknown();
    current(b, h);
    // Deliberately no prepare function or new identity; this reads the exact retained evidence only.
    return h.state === 'BLOCKED_REVIEW' && h.result
      ? {
          ...unknown(),
          status: 'EXACT_BLOCKED_REVIEW' as const,
          review: h.result,
        }
      : unknown();
  } catch {
    return unknown();
  }
}
export async function openFollowUpSource(view: FollowUpDeskView, key: string) {
  const b = desks.get(view);
  if (!b) throw Error('Exact retained follow-up desk required');
  check(b);
  const result = await openPortfolioMaintenanceItem(b.portfolio, key);
  check(b);
  return result;
}
