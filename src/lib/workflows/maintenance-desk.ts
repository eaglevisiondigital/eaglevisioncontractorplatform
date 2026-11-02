import { PropertyRepository } from '../property';
import type { LocalJourney } from './journey-runtime';
import {
  readGrowthWorkflow,
  verifyGrowthWorkflow,
  openGrowthWorkflowSource,
  type GrowthWorkflowSource,
} from './growth-workflow';
import {
  readGrowthReminderReview,
  type ReminderWindow,
} from '../growth-reminders';
import {
  readMaintenanceRenewalPlanning,
  prepareMaintenanceVisitProposal,
  reconcileMaintenanceVisitProposal,
  type MaintenanceVisitProposal,
} from '../maintenance-renewal-planning';
import { documentHash } from '../../domain/release/preview';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  prototypeFields,
  freezePrototype,
  type PrototypeTarget,
  type PrototypeAdmission,
} from '../program/prototype-source';

export interface MaintenanceDeskInput {
  window: ReminderWindow;
  lead_days: number;
  overdue_days: number;
  query: string;
  kind: 'all' | 'inspection_occurrence' | 'staff_follow_up';
  readiness: 'all' | 'preparable' | 'blocked';
}
function fields(value: unknown, names: string[]) {
  const result = prototypeFields(value, names);
  if (Object.keys(result).length !== names.length)
    throw Error('Exact maintenance desk fields required');
  return result;
}
function text(value: unknown, empty = false) {
  if (
    typeof value !== 'string' ||
    (!empty && !value.trim()) ||
    value.length > 200
  )
    throw Error('Primitive maintenance desk text required');
  return value;
}
function admit(gate: PrototypeAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error(
      'Maintenance desk is OFF without current explicit confirmation',
    );
}
function composition(sources: LocalJourney) {
  const f = prototypeFields(sources, Object.keys(sources)),
    repo = f.property;
  if (
    !(repo instanceof PropertyRepository) ||
    repo.estimates !== f.estimates ||
    repo.operations !== f.operations
  )
    throw Error('Actual shared journey repositories required');
  const names = [
      'organization_id',
      'actor_id',
      'customer_id',
      'location_id',
      'estimate_id',
      'version_id',
      'job_id',
    ],
    t = fields(f.target, names);
  names.forEach((name) => text(t[name]));
  admit(f.gate as PrototypeAdmission);
  const company = prototypeFields(f.company, Object.keys(f.company as object));
  if (company.id !== t.organization_id)
    throw Error('Exact journey company required');
  return { repo, target: t as unknown as PrototypeTarget & { job_id: string } };
}
function pin(input: MaintenanceDeskInput) {
  const f = fields(input, [
      'window',
      'lead_days',
      'overdue_days',
      'query',
      'kind',
      'readiness',
    ]),
    w = fields(f.window, ['from', 'through', 'as_of', 'channel']);
  if (w.channel !== 'email' && w.channel !== 'sms')
    throw Error('Explicit supported channel required');
  if (
    !Number.isSafeInteger(f.lead_days) ||
    Number(f.lead_days) < 0 ||
    Number(f.lead_days) > 30 ||
    !Number.isSafeInteger(f.overdue_days) ||
    Number(f.overdue_days) < 0 ||
    Number(f.overdue_days) > 93
  )
    throw Error('Bounded calendar-day review horizons required');
  if (
    typeof f.kind !== 'string' ||
    !['all', 'inspection_occurrence', 'staff_follow_up'].includes(f.kind) ||
    typeof f.readiness !== 'string' ||
    !['all', 'preparable', 'blocked'].includes(f.readiness)
  )
    throw Error('Exact primitive maintenance filters required');
  const result = {
    window: {
      from: text(w.from),
      through: text(w.through),
      as_of: text(w.as_of),
      channel: w.channel as ReminderWindow['channel'],
    },
    lead_days: f.lead_days as number,
    overdue_days: f.overdue_days as number,
    query: text(f.query, true),
    kind: f.kind as MaintenanceDeskInput['kind'],
    readiness: f.readiness as MaintenanceDeskInput['readiness'],
  };
  return { ...result, signature: JSON.stringify(result) };
}
function propertyFence(sources: LocalJourney) {
  const { repo, target: t } = composition(sources);
  repo.operations.syntheticProperty(
    t.organization_id,
    t.customer_id,
    t.location_id,
  );
  return JSON.stringify({
    property: repo.read(t.organization_id),
    maintenance: repo
      .maintenance(t.organization_id, t.actor_id)
      .items.map((item) => ({
        source: item.source,
        record: item.record,
        plan_id: item.plan_id,
      })),
    memberships: repo.operations.syntheticMemberships(t.organization_id),
  });
}
type Growth = Awaited<ReturnType<typeof readGrowthWorkflow>>;
type Source = Awaited<ReturnType<typeof readPrototypeSource>>;
interface Binding {
  sources: LocalJourney;
  repo: PropertyRepository;
  input: MaintenanceDeskInput;
  gate: PrototypeAdmission;
  signature: string;
  selection: string;
  source: Source;
  growth: Growth;
  fence: string;
  consent: string;
}
const retained = new WeakMap<object, Binding>();
function checkNow(b: Binding) {
  admit(b.gate);
  const c = composition(b.sources);
  if (
    c.repo !== b.repo ||
    JSON.stringify(c.target) !== b.selection ||
    pin(b.input).signature !== b.signature
  )
    throw Error('Maintenance desk selection changed');
  assertPrototypeSourceCurrentNow(b.source);
  if (propertyFence(b.sources) !== b.fence)
    throw Error('Maintenance source revisions changed');
}
const boundary = (t: PrototypeTarget) => ({
  organization_id: t.organization_id,
  customer_id: t.customer_id,
  location_id: t.location_id,
});
const consentSignature = (
  consent:
    | Growth['consent']
    | Awaited<ReturnType<typeof readGrowthReminderReview>>['consent'],
) => JSON.stringify([consent.observed_channel_state, consent.reference]);
function policy(b: Binding) {
  const p = pin(b.input);
  admit(b.gate);
  return {
    enabled: true,
    confirmed: true,
    lead_days: p.lead_days,
    overdue_days: p.overdue_days,
  };
}

/** Editable-window planning desk over existing source/recurrence/consent engines. */
export async function readMaintenanceDesk(
  sources: LocalJourney,
  input: MaintenanceDeskInput,
  gate: PrototypeAdmission = {},
) {
  admit(gate);
  const c = composition(sources),
    request = pin(input),
    selection = JSON.stringify(c.target);
  const checkInput = () => {
    admit(gate);
    const now = composition(sources);
    if (
      now.repo !== c.repo ||
      JSON.stringify(now.target) !== selection ||
      pin(input).signature !== request.signature
    )
      throw Error('Maintenance selection changed');
  };
  const source = await readPrototypeSource(c.repo.estimates, c.target, gate);
  checkInput();
  const growth = await readGrowthWorkflow(
    c.repo,
    c.target,
    request.window,
    gate,
  );
  checkInput();
  const fence = propertyFence(sources),
    state = c.repo.read(c.target.organization_id),
    plans = state.plans.filter(
      (p) =>
        p.job_id === c.target.job_id &&
        p.customer_id === c.target.customer_id &&
        p.location_id === c.target.location_id,
    );
  const planning = await readMaintenanceRenewalPlanning(
    c.repo,
    boundary(c.target),
    c.target.actor_id,
    request.window,
    {
      enabled: true,
      confirmed: true,
      lead_days: request.lead_days,
      overdue_days: request.overdue_days,
    },
  );
  checkInput();
  const query = request.query.toLocaleLowerCase(),
    all = planning.candidates
      .filter((candidate) =>
        plans.some((plan) => plan.id === candidate.selection.source.plan_id),
      )
      .map((candidate) => ({
        ...candidate,
        plan_name: plans.find(
          (p) => p.id === candidate.selection.source.plan_id,
        )!.name,
      }));
  const candidates = all.filter(
    (candidate) =>
      (request.kind === 'all' || candidate.selection.kind === request.kind) &&
      (request.readiness === 'all' ||
        candidate.can_prepare_visit_proposal ===
          (request.readiness === 'preparable')) &&
      [
        candidate.plan_name,
        candidate.selection.kind,
        candidate.selection.due_on,
        candidate.planning_status,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
  );
  const binding: Binding = {
    sources,
    repo: c.repo,
    input,
    gate,
    signature: request.signature,
    selection,
    source,
    growth,
    fence,
    consent: consentSignature(growth.consent),
  };
  const body = {
    mode: 'LOCAL_MAINTENANCE_DESK' as const,
    source: growth.source,
    window: request.window,
    review_policy: {
      lead_days: request.lead_days,
      overdue_days: request.overdue_days,
    },
    filters: {
      query: request.query,
      kind: request.kind,
      readiness: request.readiness,
    },
    available_count: all.length,
    matching_count: candidates.length,
    count_is_complete: false as const,
    candidates,
    maintenance_findings: growth.maintenance_opportunities.filter((finding) =>
      [
        finding.observation,
        finding.recommendation,
        finding.category,
        finding.location,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    ),
    available_findings_count: growth.maintenance_opportunities.length,
    consent: growth.consent,
    renewal_terms: 'UNKNOWN' as const,
    renewal_agreement: null,
    purpose_consent: 'UNVERIFIED' as const,
    suppression: 'UNVERIFIED' as const,
    sender: 'UNVERIFIED' as const,
    enrollment: 'UNVERIFIED' as const,
    recipient: null,
    provider_request: null,
    authority: {
      send: false,
      schedule: false,
      enroll: false,
      bill: false,
      financial: false,
      hosted: false,
    },
  };
  const sha256 = await documentHash(body);
  checkNow(binding);
  if ((await verifyGrowthWorkflow(growth)).status !== 'CAPTURED_NOT_ATOMIC')
    throw Error('Exact captured Growth source UNKNOWN');
  checkNow(binding);
  const final = await readGrowthReminderReview(
    c.repo,
    boundary(c.target),
    c.target.actor_id,
    request.window,
    { enabled: true },
  );
  checkNow(binding);
  if (consentSignature(final.consent) !== binding.consent)
    throw Error('Captured channel evidence changed');
  await assertPrototypeSourceCurrent(source);
  checkInput();
  checkNow(binding);
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(result, binding);
  return result;
}
export type MaintenanceDeskView = Awaited<
  ReturnType<typeof readMaintenanceDesk>
>;
export type MaintenanceDeskCandidate =
  MaintenanceDeskView['candidates'][number];
export async function reconcileMaintenanceDesk(view: MaintenanceDeskView) {
  const unknown = {
      status: 'UNKNOWN' as const,
      replacement: null,
      replay: 'FORBIDDEN' as const,
    },
    b = retained.get(view);
  if (!b) return unknown;
  try {
    checkNow(b);
    const c = composition(b.sources),
      final = await readGrowthReminderReview(
        c.repo,
        boundary(c.target),
        c.target.actor_id,
        pin(b.input).window,
        { enabled: true },
      );
    checkNow(b);
    if (consentSignature(final.consent) !== b.consent) return unknown;
    await assertPrototypeSourceCurrent(b.source);
    checkNow(b);
    return { ...unknown, status: 'CAPTURED_NOT_ATOMIC' as const };
  } catch {
    return unknown;
  }
}
export async function openMaintenanceDeskSource(
  view: MaintenanceDeskView,
  source: GrowthWorkflowSource,
) {
  const b = retained.get(view);
  if (!b || !view.maintenance_findings.some((row) => row.source === source))
    throw Error('Exact displayed maintenance finding required');
  if ((await reconcileMaintenanceDesk(view)).status !== 'CAPTURED_NOT_ATOMIC')
    throw Error('Maintenance source UNKNOWN');
  const result = await openGrowthWorkflowSource(b.growth, source);
  checkNow(b);
  return result;
}
interface Hold {
  state: 'PENDING' | 'PREPARED' | 'UNKNOWN';
  proposal?: MaintenanceVisitProposal;
}
const holds = new WeakMap<PropertyRepository, Map<string, Hold>>();
function holdKey(b: Binding, candidate: MaintenanceDeskCandidate) {
  const t = composition(b.sources).target,
    s = candidate.selection;
  // Revision changes do not turn an UNKNOWN attempt into a fresh identity.
  return JSON.stringify([
    t.organization_id,
    t.customer_id,
    t.location_id,
    t.job_id,
    s.kind,
    s.due_on,
    s.source.plan_id,
    s.source.report_id,
    s.source.finding_id,
  ]);
}
export function maintenanceDeskAttemptState(
  view: MaintenanceDeskView,
  candidate: MaintenanceDeskCandidate,
) {
  const b = retained.get(view);
  if (!b || !view.candidates.includes(candidate)) return 'UNKNOWN' as const;
  try {
    checkNow(b);
    return (
      holds.get(b.repo)?.get(holdKey(b, candidate))?.state ??
      ('NOT_PREPARED' as const)
    );
  } catch {
    return 'UNKNOWN' as const;
  }
}
export async function prepareMaintenanceDeskReview(
  view: MaintenanceDeskView,
  candidate: MaintenanceDeskCandidate,
  gate: PrototypeAdmission = {},
) {
  admit(gate);
  const b = retained.get(view);
  if (
    !b ||
    !view.candidates.includes(candidate) ||
    !candidate.can_prepare_visit_proposal
  )
    throw Error('Exact eligible displayed candidate required');
  const c = composition(b.sources),
    key = holdKey(b, candidate),
    map = holds.get(c.repo) ?? new Map<string, Hold>();
  holds.set(c.repo, map);
  if (map.has(key))
    throw Error(
      'Existing preparation or UNKNOWN: exact read-only reconciliation only',
    );
  if ((await reconcileMaintenanceDesk(view)).status !== 'CAPTURED_NOT_ATOMIC')
    throw Error('Maintenance review UNKNOWN');
  admit(gate);
  checkNow(b);
  if (map.has(key)) throw Error('Concurrent preparation already retained');
  const hold: Hold = { state: 'PENDING' };
  map.set(key, hold);
  try {
    hold.proposal = await prepareMaintenanceVisitProposal(
      c.repo,
      boundary(c.target),
      c.target.actor_id,
      pin(b.input).window,
      candidate.selection,
      policy(b),
    );
    admit(gate);
    checkNow(b);
    if ((await reconcileMaintenanceDesk(view)).status !== 'CAPTURED_NOT_ATOMIC')
      throw Error('Prepared source unavailable');
    admit(gate);
    checkNow(b);
    hold.state = 'PREPARED';
    return hold.proposal;
  } catch (error) {
    hold.state = 'UNKNOWN';
    throw error;
  }
}
export async function reconcileMaintenanceDeskPreparation(
  view: MaintenanceDeskView,
  candidate: MaintenanceDeskCandidate,
) {
  const unknown = {
      status: 'UNKNOWN' as const,
      replacement: null,
      replay: 'FORBIDDEN' as const,
    },
    b = retained.get(view);
  if (!b || !view.candidates.includes(candidate)) return unknown;
  try {
    const hold = holds.get(b.repo)?.get(holdKey(b, candidate));
    if (!hold?.proposal) return unknown;
    if ((await reconcileMaintenanceDesk(view)).status !== 'CAPTURED_NOT_ATOMIC')
      return unknown;
    const c = composition(b.sources),
      current = await reconcileMaintenanceVisitProposal(
        c.repo,
        c.target.actor_id,
        hold.proposal,
        policy(b),
      );
    checkNow(b);
    if (current.status !== 'CURRENT') return unknown;
    return {
      ...unknown,
      status:
        hold.state === 'PREPARED'
          ? ('EXACT_PREPARED_REVIEW_ONLY' as const)
          : ('UNKNOWN' as const),
      proposal: hold.proposal,
      attempt_state: hold.state,
    };
  } catch {
    return unknown;
  }
}

export interface MaintenanceConsentInput {
  recipient_customer_id: string;
  channel: 'email' | 'sms';
  purpose: 'service_follow_up' | 'recurring_maintenance' | 'marketing';
  expected_source_sha256: string;
  expected_consent_id: string | null;
}
function consentInput(input: MaintenanceConsentInput) {
  const f = fields(input, [
    'recipient_customer_id',
    'channel',
    'purpose',
    'expected_source_sha256',
    'expected_consent_id',
  ]);
  if (
    typeof f.channel !== 'string' ||
    !['email', 'sms'].includes(f.channel) ||
    typeof f.purpose !== 'string' ||
    !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
      f.purpose,
    )
  )
    throw Error('Explicit primitive channel and purpose required');
  return {
    recipient_customer_id: text(f.recipient_customer_id),
    channel: f.channel as MaintenanceConsentInput['channel'],
    purpose: f.purpose as MaintenanceConsentInput['purpose'],
    expected_source_sha256: text(f.expected_source_sha256),
    expected_consent_id:
      f.expected_consent_id === null ? null : text(f.expected_consent_id),
  };
}
const preflights = new WeakMap<
  object,
  {
    view: MaintenanceDeskView;
    candidate: MaintenanceDeskCandidate;
    input: MaintenanceConsentInput;
    signature: string;
    gate: PrototypeAdmission;
  }
>();
/** A fail-closed architecture prototype. It has no recipient resolver or sender port. */
export async function reviewMaintenanceConsentPreflight(
  view: MaintenanceDeskView,
  candidate: MaintenanceDeskCandidate,
  input: MaintenanceConsentInput,
  gate: PrototypeAdmission = {},
) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replacement: null,
    replay: 'FORBIDDEN' as const,
    send: false as const,
    recipient: null,
    provider_request: null,
  };
  try {
    admit(gate);
    const selected = consentInput(input),
      signature = JSON.stringify(selected),
      b = retained.get(view);
    if (!b || !view.candidates.includes(candidate)) return unknown;
    const c = composition(b.sources);
    const check = () => {
      admit(gate);
      checkNow(b);
      if (JSON.stringify(consentInput(input)) !== signature)
        throw Error('Consent preflight selection changed');
    };
    check();
    if (
      selected.recipient_customer_id !== c.target.customer_id ||
      selected.channel !== view.window.channel ||
      selected.expected_source_sha256 !== view.source.source_sha256 ||
      selected.expected_consent_id !== (view.consent.reference?.id ?? null)
    )
      return unknown;
    if ((await reconcileMaintenanceDesk(view)).status !== 'CAPTURED_NOT_ATOMIC')
      return unknown;
    check();
    const final = await readGrowthReminderReview(
      c.repo,
      boundary(c.target),
      c.target.actor_id,
      pin(b.input).window,
      { enabled: true },
    );
    check();
    if (consentSignature(final.consent) !== b.consent) return unknown;
    const body = {
      status: 'UNKNOWN' as const,
      decision: 'BLOCKED' as const,
      source: view.source,
      selection: candidate.selection,
      recipient_reference: {
        organization_id: c.target.organization_id,
        customer_id: c.target.customer_id,
        location_id: c.target.location_id,
        channel: selected.channel,
      },
      requested_purpose: selected.purpose,
      current_contact_reference: null,
      observed_channel_state: 'UNKNOWN' as const,
      captured_planning_view_sha256: view.integrity.sha256,
      captured_evidence_kind: 'HISTORICAL_CONTACT_V1_ONLY' as const,
      consent_currentness: 'CAPTURED_NOT_ATOMIC' as const,
      current_channel_authority: 'UNKNOWN' as const,
      purpose_scope: 'UNVERIFIED' as const,
      suppression: 'UNVERIFIED' as const,
      sender: 'UNVERIFIED' as const,
      recurring_enrollment: 'UNVERIFIED' as const,
      recipient_endpoint: 'UNRESOLVED' as const,
      missing_gates: [
        'CURRENT_CONTACT_CHANNEL_ALLOWANCE',
        'PURPOSE_SPECIFIC_CONSENT',
        'SUPPRESSION',
        'SENDER_AUTHORITY',
        'ENROLLMENT_IF_REQUIRED',
        'EXACT_RECIPIENT_ENDPOINT',
        'ATOMIC_CONSENT_AT_SEND',
      ] as const,
      send: false as const,
      recipient: null,
      provider_request: null,
      replacement: null,
      replay: 'FORBIDDEN' as const,
    };
    const sha256 = await documentHash(body);
    check();
    await assertPrototypeSourceCurrent(b.source);
    check();
    const result = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    preflights.set(result, { view, candidate, input, signature, gate });
    return result;
  } catch {
    return unknown;
  }
}
export type MaintenanceConsentReview = Awaited<
  ReturnType<typeof reviewMaintenanceConsentPreflight>
>;
export async function reconcileMaintenanceConsentPreflight(
  review: MaintenanceConsentReview,
) {
  const unknown = {
      status: 'UNKNOWN' as const,
      replacement: null,
      replay: 'FORBIDDEN' as const,
      send: false as const,
    },
    p = preflights.get(review);
  if (!p) return unknown;
  try {
    admit(p.gate);
    const b = retained.get(p.view);
    if (!b || JSON.stringify(consentInput(p.input)) !== p.signature)
      return unknown;
    if (
      (await reconcileMaintenanceDesk(p.view)).status !== 'CAPTURED_NOT_ATOMIC'
    )
      return unknown;
    admit(p.gate);
    checkNow(b);
    if (JSON.stringify(consentInput(p.input)) !== p.signature) return unknown;
    return {
      ...unknown,
      status: 'UNKNOWN' as const,
      decision: 'BLOCKED' as const,
      historical_binding: 'MATCHED_CAPTURE_ONLY' as const,
      consent_currentness: 'CAPTURED_NOT_ATOMIC' as const,
    };
  } catch {
    return unknown;
  }
}
