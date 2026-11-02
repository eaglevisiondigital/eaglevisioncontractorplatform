import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { readFieldWorkOrders } from '../field-work-orders';
import {
  readMaintenanceDesk,
  reconcileMaintenanceDesk,
  openMaintenanceDeskSource,
  reviewMaintenanceConsentPreflight,
  reconcileMaintenanceConsentPreflight,
  type MaintenanceDeskInput,
  type MaintenanceDeskView,
  type MaintenanceConsentInput,
  type MaintenanceConsentReview,
} from './maintenance-desk';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';
export interface PortfolioMaintenanceInput extends MaintenanceDeskInput {
  job_id: string;
  customer_id: string;
  location_id: string;
}
function fields(value: unknown, names: string[]) {
  const f = prototypeFields(value, names);
  if (Object.keys(f).length !== names.length)
    throw Error('Exact portfolio maintenance fields required');
  return f;
}
function text(value: unknown, empty = false): string {
  if (
    typeof value !== 'string' ||
    (!empty && !value.trim()) ||
    value.length > 200
  )
    throw Error('Primitive maintenance selection required');
  return value;
}
function pin(input: PortfolioMaintenanceInput) {
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
  if (w.channel !== 'email' && w.channel !== 'sms')
    throw Error('Explicit supported channel required');
  if (
    typeof f.lead_days !== 'number' ||
    !Number.isSafeInteger(f.lead_days) ||
    f.lead_days < 0 ||
    f.lead_days > 30 ||
    typeof f.overdue_days !== 'number' ||
    !Number.isSafeInteger(f.overdue_days) ||
    f.overdue_days < 0 ||
    f.overdue_days > 93
  )
    throw Error('Bounded review horizons required');
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
      channel: w.channel as MaintenanceDeskInput['window']['channel'],
    },
    lead_days: f.lead_days,
    overdue_days: f.overdue_days,
    query: text(f.query, true),
    kind: f.kind as MaintenanceDeskInput['kind'],
    readiness: f.readiness as MaintenanceDeskInput['readiness'],
    job_id: text(f.job_id, true),
    customer_id: text(f.customer_id, true),
    location_id: text(f.location_id, true),
  };
  return { ...result, signature: JSON.stringify(result) };
}
type Capture = ReturnType<typeof captureOperatingSources>;
type Context = {
  organization_id: string;
  job_id: string;
  customer_id: string;
  location_id: string;
  customer_label: string;
  property_label: string;
  job_title: string;
  issued_version_id: string;
};
type Candidate = MaintenanceDeskView['candidates'][number];
type Finding = MaintenanceDeskView['maintenance_findings'][number];
interface Child {
  view: MaintenanceDeskView;
  context: Context;
}
interface Binding {
  sources: OperatingSources;
  input: PortfolioMaintenanceInput;
  signature: string;
  capture: Capture;
  children: Child[];
  candidates: Map<string, { child: Child; candidate: Candidate }>;
  findings: Map<string, { child: Child; finding: Finding }>;
}
const retained = new WeakMap<object, Binding>();
function check(b: Binding) {
  b.capture.check();
  if (pin(b.input).signature !== b.signature)
    throw Error('Original maintenance selection changed');
}
const unknown = () => ({
  status: 'UNKNOWN' as const,
  decision: 'BLOCKED' as const,
  replacement: null,
  replay: 'FORBIDDEN' as const,
  send: false as const,
  recipient: null,
  provider_request: null,
});
/** Current exact multi-job planning view. Existing per-property recurrence/consent engines remain authoritative. */
export async function readPortfolioMaintenance(
  sources: OperatingSources,
  input: PortfolioMaintenanceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    request = pin(input),
    b: Binding = {
      sources,
      input,
      signature: request.signature,
      capture,
      children: [],
      candidates: new Map(),
      findings: new Map(),
    };
  check(b);
  const model = await readFieldWorkOrders(
    sources.property,
    capture.organization_id,
    capture.actor_id,
  );
  check(b);
  if (!model.manager) throw Error('Eligible company office reviewer required');
  const jobs: Context[] = [],
    allCandidates: ReturnType<typeof projectCandidate>[] = [],
    allFindings: ReturnType<typeof projectFinding>[] = [];
  for (const entry of capture.entries) {
    const matches = model.orders.filter(
        (o) => o.source.job_id === entry.target.job_id,
      ),
      o = matches[0];
    if (
      matches.length !== 1 ||
      o.customer.id !== entry.target.customer_id ||
      o.baseline_property?.id !== entry.target.location_id ||
      o.source.issued_version_id !== entry.target.version_id
    )
      throw Error(
        'Exact maintenance job/customer/property/issued identity required',
      );
    const context: Context = {
      organization_id: capture.organization_id,
      job_id: o.source.job_id,
      customer_id: o.customer.id,
      location_id: o.baseline_property.id,
      customer_label: o.customer.label,
      property_label: o.baseline_property.label,
      job_title: o.title,
      issued_version_id: o.source.issued_version_id,
    };
    jobs.push(context);
    const childInput: MaintenanceDeskInput = {
      window: request.window,
      lead_days: request.lead_days,
      overdue_days: request.overdue_days,
      query: '',
      kind: 'all',
      readiness: 'all',
    };
    const view = await readMaintenanceDesk(entry, childInput, gate);
    check(b);
    const child = { view, context };
    b.children.push(child);
    for (const candidate of view.candidates) {
      const s = candidate.selection,
        key =
          'occurrence:' +
          JSON.stringify([
            context.organization_id,
            context.customer_id,
            context.location_id,
            s.source.plan_id,
            s.kind,
            s.source.occurrence_index,
            s.source.report_id,
            s.source.report_version,
            s.source.finding_id,
            s.due_on,
          ]);
      const projected = projectCandidate(key, context, candidate),
        prior = b.candidates.get(key);
      if (prior) {
        if (
          JSON.stringify(
            projectCandidate(key, prior.child.context, prior.candidate),
          ) !== JSON.stringify(projected)
        )
          throw Error('Ambiguous exact occurrence association');
        continue;
      }
      b.candidates.set(key, { child, candidate });
      allCandidates.push(projected);
    }
    for (const finding of view.maintenance_findings) {
      if (
        finding.source.job_id !== context.job_id ||
        finding.source.customer_id !== context.customer_id ||
        finding.source.location_id !== context.location_id
      )
        throw Error('Exact published finding ownership required');
      const s = finding.source,
        key =
          'finding:' +
          JSON.stringify([
            s.organization_id,
            s.customer_id,
            s.location_id,
            s.plan_id,
            s.report_id,
            s.report_version,
            s.finding_id,
          ]),
        projected = projectFinding(key, context, finding),
        prior = b.findings.get(key);
      if (prior) {
        if (
          JSON.stringify(
            projectFinding(key, prior.child.context, prior.finding),
          ) !== JSON.stringify(projected)
        )
          throw Error('Ambiguous published finding association');
        continue;
      }
      b.findings.set(key, { child, finding });
      allFindings.push(projected);
    }
  }
  if (
    (request.job_id && !jobs.some((j) => j.job_id === request.job_id)) ||
    (request.customer_id &&
      !jobs.some((j) => j.customer_id === request.customer_id)) ||
    (request.location_id &&
      !jobs.some((j) => j.location_id === request.location_id))
  )
    throw Error('Only exact admitted source filters allowed');
  const contextMatches = (c: Context) =>
    (!request.job_id || c.job_id === request.job_id) &&
    (!request.customer_id || c.customer_id === request.customer_id) &&
    (!request.location_id || c.location_id === request.location_id);
  if (
    (request.job_id || request.customer_id || request.location_id) &&
    !jobs.some(contextMatches)
  )
    throw Error('Conflicting customer/property/job filters');
  const query = request.query.toLocaleLowerCase(),
    literal = (values: unknown[]) =>
      values.join(' ').toLocaleLowerCase().includes(query);
  const candidates = allCandidates.filter(
    (r) =>
      contextMatches(r.context) &&
      (request.kind === 'all' || r.selection.kind === request.kind) &&
      (request.readiness === 'all' ||
        r.staff_planning_eligible === (request.readiness === 'preparable')) &&
      literal([
        r.context.customer_label,
        r.context.property_label,
        r.context.job_title,
        r.plan_name,
        r.selection.kind,
        r.selection.due_on,
        r.planning_status,
      ]),
  );
  const findings = allFindings.filter(
    (r) =>
      contextMatches(r.context) &&
      literal([
        r.context.customer_label,
        r.context.property_label,
        r.context.job_title,
        r.observation,
        r.recommendation,
        r.category,
        r.location,
      ]),
  );
  const body = {
    mode: 'LOCAL_MULTI_JOB_MAINTENANCE_REVIEW' as const,
    organization_id: capture.organization_id,
    window: request.window,
    review_policy: {
      lead_days: request.lead_days,
      overdue_days: request.overdue_days,
    },
    filters: {
      job_id: request.job_id,
      customer_id: request.customer_id,
      location_id: request.location_id,
      query: request.query,
      kind: request.kind,
      readiness: request.readiness,
    },
    jobs,
    available_jobs: jobs.length,
    matching_jobs: jobs.filter(contextMatches).length,
    available_occurrences: allCandidates.length,
    matching_occurrences: candidates.length,
    available_findings: allFindings.length,
    matching_findings: findings.length,
    candidates,
    findings,
    coverage:
      'ADMITTED_JOBS_AVAILABLE_PUBLISHED_AND_PLAN_RECORDS_ONLY' as const,
    count_is_complete: false as const,
    consent_currentness: 'CAPTURED_NOT_ATOMIC' as const,
    current_channel_authority: 'UNKNOWN' as const,
    purpose_consent: 'UNVERIFIED' as const,
    suppression: 'UNVERIFIED' as const,
    renewal_terms: 'UNKNOWN' as const,
    enrollment: 'UNVERIFIED' as const,
    sender: 'UNVERIFIED' as const,
    recipient: null,
    provider_request: null,
    authority: {
      send: false,
      enroll: false,
      schedule: false,
      bill: false,
      financial: false,
      hosted: false,
      replay: false,
    },
  };
  const sha256 = await documentHash(body);
  check(b);
  for (const child of b.children) {
    if (
      (await reconcileMaintenanceDesk(child.view)).status !==
      'CAPTURED_NOT_ATOMIC'
    )
      throw Error('Captured maintenance source UNKNOWN');
    check(b);
  }
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(result, b);
  return result;
}
function projectCandidate(key: string, context: Context, c: Candidate) {
  return {
    key,
    context,
    selection: c.selection,
    plan_name: c.plan_name,
    planning_status: c.planning_status,
    staff_planning_eligible: c.can_prepare_visit_proposal,
    exact_visits: c.exact_visits,
    eligibility_basis: 'CAPTURED_STAFF_PLANNING_ONLY' as const,
    message_authority: 'BLOCKED' as const,
    renewal_terms: 'UNKNOWN' as const,
  };
}
function projectFinding(key: string, context: Context, f: Finding) {
  return {
    key,
    context,
    source: f.source,
    observation: f.observation,
    recommendation: f.recommendation,
    category: f.category,
    location: f.location,
    reported_severity: f.reported_severity,
    staff_review: f.staff_review,
    follow_up_on: f.follow_up_on,
    recurring: f.recurring,
    physical_completion: 'UNVERIFIED' as const,
  };
}
export type PortfolioMaintenanceView = Awaited<
  ReturnType<typeof readPortfolioMaintenance>
>;
export async function reconcilePortfolioMaintenance(
  view: PortfolioMaintenanceView,
) {
  const b = retained.get(view);
  if (!b) return unknown();
  try {
    check(b);
    for (const c of b.children) {
      if (
        (await reconcileMaintenanceDesk(c.view)).status !==
        'CAPTURED_NOT_ATOMIC'
      )
        return unknown();
      check(b);
    }
    return { ...unknown(), status: 'CAPTURED_NOT_ATOMIC' as const };
  } catch {
    return unknown();
  }
}
export async function openPortfolioMaintenanceItem(
  view: PortfolioMaintenanceView,
  key: string,
) {
  const b = retained.get(view);
  if (!b || typeof key !== 'string')
    throw Error('Exact retained maintenance key required');
  const candidate = view.candidates.find((r) => r.key === key),
    finding = view.findings.find((r) => r.key === key),
    row = candidate ?? finding;
  if (!row) throw Error('Exact displayed maintenance source required');
  if (
    (await reconcilePortfolioMaintenance(view)).status !== 'CAPTURED_NOT_ATOMIC'
  )
    throw Error('Maintenance source UNKNOWN');
  check(b);
  if (finding) {
    const exact = b.findings.get(key)!;
    await openMaintenanceDeskSource(exact.child.view, exact.finding.source);
    check(b);
  }
  return freezePrototype({
    authority: 'NAVIGATION_ONLY' as const,
    ...row.context,
    kind: candidate
      ? ('RECURRENCE_OCCURRENCE' as const)
      : ('PUBLISHED_FINDING' as const),
    source: candidate ? candidate.selection : finding!.source,
  });
}
const consentBindings = new WeakMap<
  object,
  {
    view: PortfolioMaintenanceView;
    review: MaintenanceConsentReview;
    input: { purpose: MaintenanceConsentInput['purpose'] };
    signature: string;
    gate: JourneyAdmission;
  }
>();
/** Source-bound architecture inspection only. There is deliberately no recipient resolver/sender. */
export async function reviewPortfolioMaintenanceConsent(
  view: PortfolioMaintenanceView,
  key: string,
  input: { purpose: MaintenanceConsentInput['purpose'] },
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  try {
    const f = fields(input, ['purpose']);
    if (
      typeof f.purpose !== 'string' ||
      !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
        f.purpose,
      )
    )
      return unknown();
    const signature = JSON.stringify(f);
    const b = retained.get(view),
      row = view.candidates.find((c) => c.key === key);
    if (!b || !row) return unknown();
    const exact = b.candidates.get(key);
    if (!exact) return unknown();
    const current = () => {
      check(b);
      const g = fields(gate, ['enabled', 'confirmed']);
      if (
        g.enabled !== true ||
        g.confirmed !== true ||
        JSON.stringify(fields(input, ['purpose'])) !== signature
      )
        throw Error('Current explicit consent review confirmation required');
    };
    current();
    if (
      (await reconcilePortfolioMaintenance(view)).status !==
      'CAPTURED_NOT_ATOMIC'
    )
      return unknown();
    current();
    const child = exact.child.view,
      review = await reviewMaintenanceConsentPreflight(
        child,
        exact.candidate,
        {
          recipient_customer_id: row.context.customer_id,
          channel: view.window.channel,
          purpose: f.purpose as MaintenanceConsentInput['purpose'],
          expected_source_sha256: child.source.source_sha256,
          expected_consent_id: child.consent.reference?.id ?? null,
        },
        gate,
      );
    current();
    if (!('integrity' in review)) return unknown();
    const body = {
      mode: 'LOCAL_PORTFOLIO_CONSENT_BOUNDARY_REVIEW' as const,
      ...unknown(),
      decision: 'BLOCKED' as const,
      context: row.context,
      selection: row.selection,
      requested_purpose: f.purpose,
      current_contact_reference: null,
      observed_channel_state: 'UNKNOWN' as const,
      consent_currentness: 'CAPTURED_NOT_ATOMIC' as const,
      purpose_scope: 'UNVERIFIED' as const,
      suppression: 'UNVERIFIED' as const,
      enrollment: 'UNVERIFIED' as const,
      sender: 'UNVERIFIED' as const,
      missing_gates: review.missing_gates,
      captured_planning_sha256: view.integrity.sha256,
    };
    const sha256 = await documentHash(body);
    current();
    const historical = await reconcileMaintenanceConsentPreflight(review);
    current();
    if (!('historical_binding' in historical)) return unknown();
    const result = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    consentBindings.set(result, { view, review, input, signature, gate });
    return result;
  } catch {
    return unknown();
  }
}
export type PortfolioConsentReview = Awaited<
  ReturnType<typeof reviewPortfolioMaintenanceConsent>
>;
export async function reconcilePortfolioMaintenanceConsent(
  review: PortfolioConsentReview,
) {
  const b = consentBindings.get(review);
  if (!b) return unknown();
  try {
    const original = retained.get(b.view);
    if (!original) return unknown();
    const checkNow = () => {
      check(original);
      const g = fields(b.gate, ['enabled', 'confirmed']);
      if (
        g.enabled !== true ||
        g.confirmed !== true ||
        JSON.stringify(fields(b.input, ['purpose'])) !== b.signature
      )
        throw Error('Consent selection changed');
    };
    checkNow();
    const current = await reconcileMaintenanceConsentPreflight(b.review);
    checkNow();
    return 'historical_binding' in current
      ? {
          ...unknown(),
          historical_binding: 'MATCHED_HISTORICAL_CAPTURE_ONLY' as const,
          decision: 'BLOCKED' as const,
        }
      : unknown();
  } catch {
    return unknown();
  }
}
