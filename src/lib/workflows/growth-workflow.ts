import type { PropertyRepository } from '../property';
import { fieldSchedulingPreviewEnabled } from '../field-scheduling';
import {
  readGrowthReminderReview,
  type ReminderWindow,
} from '../growth-reminders';
import {
  readMaintenanceRenewalPlanning,
  prepareMaintenanceVisitProposal,
  type MaintenancePlanningSelection,
} from '../maintenance-renewal-planning';
import {
  prepareGrowthOpportunity,
  type GrowthOpportunityInput,
} from '../growth-opportunity-review';
import { documentHash } from '../../domain/release/preview';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  freezePrototype,
  prototypeFields,
  type PrototypeTarget,
  type PrototypeSource,
  type PrototypeAdmission,
} from '../program/prototype-source';

export const growthWorkflowEnabled = fieldSchedulingPreviewEnabled;
export const growthWorkflowReviewHorizon = {
  lead_days: 7,
  overdue_days: 3,
} as const;
export interface GrowthWorkflowSource {
  organization_id: string;
  customer_id: string;
  location_id: string;
  job_id: string;
  plan_id: string;
  report_id: string;
  report_version: number;
  finding_id: string;
  maintenance_revision: number;
}
function text(value: unknown, max = 200) {
  if (typeof value !== 'string' || !value || value.length > max)
    throw Error('Bounded primitive Growth input required');
  return value;
}
function pinTarget(input: PrototypeTarget) {
  const names = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const value = prototypeFields(input, names);
  if (Object.keys(value).length !== names.length)
    throw Error('Exact Growth target required');
  for (const key of names) text(value[key]);
  return value as unknown as PrototypeTarget & { job_id: string };
}
function pinWindow(input: ReminderWindow): ReminderWindow {
  const value = prototypeFields(input, ['from', 'through', 'as_of', 'channel']);
  if (
    Object.keys(value).length !== 4 ||
    !['email', 'sms'].includes(value.channel as string)
  )
    throw Error('Exact Growth review window required');
  return {
    from: text(value.from, 10),
    through: text(value.through, 10),
    as_of: text(value.as_of, 100),
    channel: value.channel as ReminderWindow['channel'],
  };
}
function admit(gate: PrototypeAdmission) {
  const value = prototypeFields(gate, ['enabled', 'confirmed']);
  if (value.enabled !== true || value.confirmed !== true)
    throw Error('Growth workflow is OFF without current explicit confirmation');
}
const boundary = (target: PrototypeTarget) => ({
  organization_id: target.organization_id,
  customer_id: target.customer_id,
  location_id: target.location_id,
});
function currentProperty(
  repo: PropertyRepository,
  target: PrototypeTarget & { job_id: string },
) {
  repo.operations.syntheticProperty(
    target.organization_id,
    target.customer_id,
    target.location_id,
  );
  const state = repo.read(target.organization_id),
    items = repo.maintenance(target.organization_id, target.actor_id).items;
  const plans = state.plans.filter((plan) => plan.job_id === target.job_id);
  if (
    plans.some(
      (p) =>
        p.organization_id !== target.organization_id ||
        p.customer_id !== target.customer_id ||
        p.location_id !== target.location_id,
    )
  )
    throw Error('Exact Growth plan/property association UNKNOWN');
  const visits = state.visits.filter((visit) =>
    plans.some((plan) => plan.id === visit.plan_id),
  );
  const reports = state.reports.filter((report) =>
    visits.some((visit) => visit.id === report.visit_id),
  );
  const opportunities = items
    .filter((item) => item.job_id === target.job_id)
    .map((item) => {
      const report = reports.filter(
          (r) =>
            r.id === item.source.report_id &&
            r.version === item.source.report_version,
        ),
        plan = plans.find((p) => p.id === item.plan_id);
      if (
        !plan ||
        report.length !== 1 ||
        item.source.organization_id !== target.organization_id ||
        item.source.customer_id !== target.customer_id ||
        item.source.location_id !== target.location_id ||
        report[0].findings.filter((f) => f.id === item.source.finding_id)
          .length !== 1
      )
        throw Error('Exact published maintenance finding unavailable');
      return {
        source: {
          organization_id: target.organization_id,
          customer_id: target.customer_id,
          location_id: target.location_id,
          job_id: target.job_id,
          plan_id: item.plan_id,
          report_id: item.source.report_id,
          report_version: item.source.report_version,
          finding_id: item.source.finding_id,
          maintenance_revision: item.record.revision,
        },
        observation: item.finding.description,
        recommendation: item.finding.recommendation,
        category: item.finding.category,
        location: item.finding.location,
        reported_severity: item.finding.severity,
        manual_priority: item.record.priority,
        staff_review: item.record.review,
        follow_up_on: item.record.follow_up_on || null,
        recurring: item.recurring,
        physical_completion: 'UNVERIFIED' as const,
      };
    });
  if (
    new Set(plans.map((p) => p.id)).size !== plans.length ||
    new Set(opportunities.map((i) => JSON.stringify(i.source))).size !==
      opportunities.length
  )
    throw Error('Growth source identity ambiguous');
  return {
    plans,
    opportunities,
    fence: JSON.stringify({
      plans,
      visits,
      reports,
      items: items
        .filter((item) => item.job_id === target.job_id)
        .map((i) => ({
          source: i.source,
          record: i.record,
          plan_id: i.plan_id,
        })),
    }),
  };
}
const bindings = new WeakMap<
  object,
  {
    repo: PropertyRepository;
    target: PrototypeTarget & { job_id: string };
    originalTarget: PrototypeTarget;
    originalWindow: ReminderWindow;
    gate: PrototypeAdmission;
    source: PrototypeSource;
    targetSignature: string;
    windowSignature: string;
    propertyFence: string;
    consentSignature: string;
  }
>();
type Binding = NonNullable<ReturnType<typeof bindings.get>>;
function live(binding: Binding) {
  admit(binding.gate);
  if (
    JSON.stringify(pinTarget(binding.originalTarget)) !==
      binding.targetSignature ||
    JSON.stringify(pinWindow(binding.originalWindow)) !==
      binding.windowSignature
  )
    throw Error('Growth selection changed');
  assertPrototypeSourceCurrentNow(binding.source);
  if (
    currentProperty(binding.repo, binding.target).fence !==
    binding.propertyFence
  )
    throw Error('Growth property or maintenance evidence changed');
}
function policy(gate: PrototypeAdmission) {
  admit(gate);
  return { enabled: true, confirmed: true, ...growthWorkflowReviewHorizon };
}
/** Planning-only composition. Consent is captured through async readers, never atomic current authority. */
export async function readGrowthWorkflow(
  repo: PropertyRepository,
  target: PrototypeTarget,
  window: ReminderWindow,
  gate: PrototypeAdmission = {},
) {
  admit(gate);
  const selected = pinTarget(target),
    query = pinWindow(window),
    targetSignature = JSON.stringify(selected),
    windowSignature = JSON.stringify(query);
  const checkInput = () => {
    admit(gate);
    if (
      JSON.stringify(pinTarget(target)) !== targetSignature ||
      JSON.stringify(pinWindow(window)) !== windowSignature
    )
      throw Error('Growth selection changed');
  };
  const source = await readPrototypeSource(repo.estimates, selected, gate);
  checkInput();
  const property = currentProperty(repo, selected);
  const reminder = await readGrowthReminderReview(
    repo,
    boundary(selected),
    selected.actor_id,
    query,
    { enabled: true },
  );
  checkInput();
  const planning = await readMaintenanceRenewalPlanning(
    repo,
    boundary(selected),
    selected.actor_id,
    query,
    policy(gate),
  );
  checkInput();
  const candidates = planning.candidates.filter((candidate) =>
    property.plans.some(
      (plan) => plan.id === candidate.selection.source.plan_id,
    ),
  );
  const references = candidates
    .filter((c) => c.channel_reference !== null)
    .map((c) => JSON.stringify(c.channel_reference));
  if (
    references.some(
      (reference) => reference !== JSON.stringify(reminder.consent.reference),
    )
  )
    throw Error('Captured channel evidence changed');
  const body = {
    mode: 'LOCAL_SYNTHETIC_GROWTH_REVIEW' as const,
    source: {
      ...boundary(selected),
      job_id: selected.job_id,
      estimate_id: selected.estimate_id,
      issued_version_id: selected.version_id,
      source_sha256: source.sha256,
    },
    window: query,
    review_horizon: growthWorkflowReviewHorizon,
    maintenance_opportunities: property.opportunities,
    candidates,
    consent: {
      observed_channel_state: reminder.consent.observed_channel_state,
      reference: reminder.consent.reference,
      status: 'CAPTURED_NOT_ATOMIC' as const,
      current_channel_authority: 'UNKNOWN' as const,
    },
    renewal_terms: 'UNKNOWN' as const,
    renewal_anchor: null,
    agreement_id: null,
    purpose_consent: 'UNVERIFIED' as const,
    suppression: 'UNVERIFIED' as const,
    recurring_enrollment: 'UNVERIFIED' as const,
    sender_authority: 'UNVERIFIED' as const,
    historical_coverage: planning.coverage,
    history_completeness: 'UNKNOWN' as const,
    count_is_complete: planning.count_is_complete,
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
  checkInput();
  const final = await readGrowthReminderReview(
    repo,
    boundary(selected),
    selected.actor_id,
    query,
    { enabled: true },
  );
  checkInput();
  if (JSON.stringify(final) !== JSON.stringify(reminder))
    throw Error('Growth source or captured channel changed');
  await assertPrototypeSourceCurrent(source);
  checkInput();
  const binding = {
    repo,
    target: selected,
    originalTarget: target,
    originalWindow: window,
    gate,
    source,
    targetSignature,
    windowSignature,
    propertyFence: property.fence,
    consentSignature: JSON.stringify(final.consent),
  };
  live(binding);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256', sha256 },
  });
  bindings.set(view, binding);
  return view;
}
export type GrowthWorkflowView = Awaited<ReturnType<typeof readGrowthWorkflow>>;
export async function verifyGrowthWorkflow(view: GrowthWorkflowView) {
  const binding = bindings.get(view);
  if (!binding) return { status: 'UNKNOWN' as const, replacement: null };
  try {
    live(binding);
    const final = await readGrowthReminderReview(
      binding.repo,
      boundary(binding.target),
      binding.target.actor_id,
      pinWindow(binding.originalWindow),
      { enabled: true },
    );
    if (JSON.stringify(final.consent) !== binding.consentSignature)
      throw Error('Captured channel changed');
    await assertPrototypeSourceCurrent(binding.source);
    live(binding);
    return { status: 'CAPTURED_NOT_ATOMIC' as const, replacement: null };
  } catch {
    return { status: 'UNKNOWN' as const, replacement: null };
  }
}
export async function prepareGrowthWorkflowProposal(
  view: GrowthWorkflowView,
  selection: MaintenancePlanningSelection,
) {
  const binding = bindings.get(view);
  if (
    !binding ||
    (await verifyGrowthWorkflow(view)).status !== 'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Exact Growth source UNKNOWN');
  const row = view.candidates.find((row) => row.selection === selection);
  if (!row?.can_prepare_visit_proposal)
    throw Error('Exact staff-review candidate required');
  const proposal = await prepareMaintenanceVisitProposal(
    binding.repo,
    boundary(binding.target),
    binding.target.actor_id,
    pinWindow(binding.originalWindow),
    row.selection,
    policy(binding.gate),
  );
  if ((await verifyGrowthWorkflow(view)).status !== 'CAPTURED_NOT_ATOMIC')
    throw Error('Growth review changed; no proposal use');
  live(binding);
  return freezePrototype({
    proposal,
    consent_status: 'CAPTURED_NOT_ATOMIC' as const,
    current_channel_authority: 'UNKNOWN' as const,
    authority: 'STAFF_PLANNING_ONLY' as const,
  });
}
export async function prepareGrowthWorkflowOpportunity(
  view: GrowthWorkflowView,
  request: GrowthOpportunityInput,
) {
  const binding = bindings.get(view);
  const pinRequest = () => {
    const fields = prototypeFields(request, [
      'purpose',
      'synthetic_transcript',
    ]);
    if (
      Object.keys(fields).length !== 2 ||
      typeof fields.purpose !== 'string' ||
      !['referral', 'reputation', 'lead_recovery', 'receptionist'].includes(
        fields.purpose,
      )
    )
      throw Error('Explicit supported opportunity purpose required');
    return {
      purpose: fields.purpose as GrowthOpportunityInput['purpose'],
      synthetic_transcript: text(fields.synthetic_transcript, 2000),
    };
  };
  const selected = pinRequest(),
    signature = JSON.stringify(selected);
  if (
    !binding ||
    (await verifyGrowthWorkflow(view)).status !== 'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Exact Growth source UNKNOWN');
  const opportunity = await prepareGrowthOpportunity(
    binding.repo,
    boundary(binding.target),
    binding.target.actor_id,
    pinWindow(binding.originalWindow),
    selected,
    binding.gate,
  );
  if (
    JSON.stringify(pinRequest()) !== signature ||
    (await verifyGrowthWorkflow(view)).status !== 'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Growth opportunity selection changed');
  if (JSON.stringify(pinRequest()) !== signature)
    throw Error('Growth opportunity selection changed');
  live(binding);
  return freezePrototype({
    opportunity,
    consent_status: 'CAPTURED_NOT_ATOMIC' as const,
    authority: 'STAFF_REVIEW_ONLY' as const,
  });
}
export async function openGrowthWorkflowSource(
  view: GrowthWorkflowView,
  source: GrowthWorkflowSource,
) {
  const binding = bindings.get(view);
  const names = [
    'organization_id',
    'customer_id',
    'location_id',
    'job_id',
    'plan_id',
    'report_id',
    'report_version',
    'finding_id',
    'maintenance_revision',
  ];
  if (!binding) throw Error('Exact retained Growth view required');
  if (!view.maintenance_opportunities.some((item) => item.source === source))
    throw Error('Exact displayed finding required');
  const selected = prototypeFields(source, names),
    signature = JSON.stringify(selected);
  if (
    !binding ||
    (await verifyGrowthWorkflow(view)).status !== 'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Exact Growth source UNKNOWN');
  if (
    !view.maintenance_opportunities.some(
      (item) => JSON.stringify(item.source) === signature,
    ) ||
    JSON.stringify(prototypeFields(source, names)) !== signature
  )
    throw Error('Exact displayed finding required');
  live(binding);
  return freezePrototype({
    source: { ...selected } as unknown as GrowthWorkflowSource,
    authority: 'NAVIGATION_ONLY' as const,
  });
}
