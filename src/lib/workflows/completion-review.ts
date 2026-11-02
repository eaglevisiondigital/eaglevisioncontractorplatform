import { documentHash } from '../../domain/release/preview';
import { reportUuid } from '../../domain/property/report-page';
import { CustomerPortalPreviewModel } from '../customer-preview';
import {
  freezePrototype,
  prototypeFields,
  type PrototypeAdmission,
} from '../program/prototype-source';
import type { LocalJourney } from './journey-runtime';
import {
  prepareCustomerWorkflowPack,
  readCustomerWorkflow,
  verifyCustomerWorkflowPack,
  type CustomerWorkflowSelection,
} from './customer-workflow';

function exact(value: unknown, keys: readonly string[]) {
  const f = prototypeFields(value, keys);
  if (Object.keys(f).length !== keys.length)
    throw Error('Exact own fields required');
  return f;
}
function admit(gate: PrototypeAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Completion review is OFF without explicit local admission');
}
function target(sources: LocalJourney) {
  const d = Object.getOwnPropertyDescriptor(sources, 'target');
  if (!d || !('value' in d)) throw Error('Own exact target required');
  const t = exact(d.value, [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ]);
  if (
    Object.values(t).some((v) => typeof v !== 'string' || !v || v.length > 200)
  )
    throw Error('Exact primitive identities required');
  return t as unknown as LocalJourney['target'];
}
function model(sources: LocalJourney) {
  const d = Object.getOwnPropertyDescriptor(sources, 'customerModel');
  if (!d || !('value' in d) || !(d.value instanceof CustomerPortalPreviewModel))
    throw Error('Actual local customer model required');
  const m = d.value as CustomerPortalPreviewModel;
  if (
    m.repo !== sources.property ||
    m.repo.operations !== sources.operations ||
    m.repo.estimates !== sources.estimates
  )
    throw Error('Same authoritative source instances required');
  return m;
}
function pin(input: CustomerWorkflowSelection) {
  const p = exact(input, ['report_id', 'published_version']);
  if (
    !reportUuid(p.report_id) ||
    typeof p.published_version !== 'number' ||
    !Number.isSafeInteger(p.published_version) ||
    p.published_version < 1
  )
    throw Error('Exact published report and version required');
  return { report_id: p.report_id, published_version: p.published_version };
}
/** Private source fence only. Internal records never enter the customer-safe body. */
function fingerprint(sources: LocalJourney) {
  const t = target(sources),
    m = model(sources);
  const source = m.repo.estimates.readSyntheticPrototypeSources(t);
  return JSON.stringify({
    target: t,
    current: m.read(),
    property: m.repo.read(t.organization_id),
    source,
    members: m.repo.operations.syntheticMemberships(t.organization_id),
  });
}
interface Binding {
  sources: LocalJourney;
  model: CustomerPortalPreviewModel;
  original: CustomerWorkflowSelection;
  selection: CustomerWorkflowSelection;
  gate: PrototypeAdmission;
  target: LocalJourney['target'];
  fingerprint: string;
  sourceHash: string;
}
const views = new WeakMap<object, Binding>();
function current(b: Binding) {
  admit(b.gate);
  if (
    model(b.sources) !== b.model ||
    JSON.stringify(target(b.sources)) !== JSON.stringify(b.target) ||
    JSON.stringify(pin(b.original)) !== JSON.stringify(b.selection) ||
    fingerprint(b.sources) !== b.fingerprint
  )
    throw Error('Exact documentation changed; UNKNOWN is read only');
}
/** Compare issued scope and recorded documentation without inventing line-to-finding or completion evidence. */
export async function readCompletionReview(
  sources: LocalJourney,
  input: CustomerWorkflowSelection,
  gate: PrototypeAdmission = {},
) {
  admit(gate);
  const t = target(sources),
    m = model(sources),
    selected = pin(input),
    before = fingerprint(sources);
  const anchor = await readCustomerWorkflow(m, t, selected, gate);
  if (anchor.status !== 'CURRENT' || !anchor.timeline || !anchor.source_hash)
    throw Error('Exact authorized published documentation unavailable');
  const reportEvents = anchor.timeline.snapshot.events.filter(
    (e) =>
      e.kind === 'inspection-documentation' &&
      e.reference.kind === 'report' &&
      e.reference.report_id === selected.report_id &&
      e.reference.published_version === selected.published_version,
  );
  const jobEvents = anchor.timeline.snapshot.events.filter(
    (e) =>
      e.kind === 'issued-job-scope' &&
      e.reference.kind === 'job-documentation' &&
      e.reference.job_id === t.job_id &&
      e.reference.estimate_id === t.estimate_id &&
      e.reference.issued_version_id === t.version_id,
  );
  if (
    reportEvents.length !== 1 ||
    jobEvents.length !== 1 ||
    reportEvents[0].kind !== 'inspection-documentation' ||
    jobEvents[0].kind !== 'issued-job-scope'
  )
    throw Error('Unique exact report and issued job evidence required');
  const r = reportEvents[0],
    j = jobEvents[0];
  const body = {
    mode: 'LOCAL_CUSTOMER_COMPLETION_DOCUMENTATION_REVIEW' as const,
    contractor: { ...anchor.timeline.snapshot.contractor },
    property: {
      organization_id: t.organization_id,
      customer_id: t.customer_id,
      location_id: t.location_id,
      label: anchor.timeline.snapshot.property_label,
    },
    job: {
      reference: { ...j.job.reference },
      issued_at: j.issued_at,
      name: j.job.issued_source.scope.name,
      description: j.job.issued_source.scope.description,
      lines: j.job.issued_source.scope.lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity_milli: line.quantity_milli,
        unit: line.unit,
        documentation_match: 'NOT_ESTABLISHED' as const,
      })),
    },
    report: {
      reference: { ...r.report.reference },
      visited_on: r.report.visited_on,
      published_at: r.report.published_at,
      phase: r.report.phase,
      summary: r.report.summary,
      checklist: r.report.checklist.map((item) => ({
        reference: { ...item.reference },
        label: item.label,
        recorded_completed: item.recorded_completed,
      })),
      observations: r.report.observations.map((o) => ({
        reference: { ...o.reference },
        category: o.category,
        location: o.location,
        severity: o.severity,
        observation: o.observation,
        recommendation: o.recommendation,
      })),
    },
    coverage: {
      available_report_events: anchor.timeline.snapshot.events.filter(
        (e) => e.kind === 'inspection-documentation',
      ).length,
      history_completeness: 'UNKNOWN' as const,
      after_phase_recorded: r.report.phase === 'after',
      checklist_recorded: r.report.checklist.length,
      checklist_recorded_checked: r.report.checklist.filter(
        (item) => item.recorded_completed,
      ).length,
      media: 'UNAVAILABLE' as const,
      line_to_finding_links: 'NOT_RECORDED' as const,
    },
    interpretation: {
      physical_completion: 'UNVERIFIED' as const,
      customer_acceptance: 'UNVERIFIED' as const,
      warranty: 'UNVERIFIED' as const,
      repair_status: 'NOT_INFERRED' as const,
      delivery: 'NOT_SENT' as const,
      authority: 'DOCUMENTATION_ONLY' as const,
    },
  };
  const b: Binding = {
    sources,
    model: m,
    original: input,
    selection: selected,
    gate,
    target: t,
    fingerprint: before,
    sourceHash: anchor.source_hash,
  };
  const sha256 = await documentHash(body);
  current(b);
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  views.set(result, b);
  return result;
}
export type CompletionReviewView = Awaited<
  ReturnType<typeof readCompletionReview>
>;
export const completionReviewChecks = {
  scope: 'I reviewed the exact issued scope identity and quantities.',
  documentation:
    'I reviewed the exact published report, findings and recorded checklist.',
  limitations:
    'I understand documentation is not verified physical completion, customer acceptance or warranty.',
} as const;
export interface CompletionReviewConfirmation {
  confirmed: boolean;
  checks: Record<keyof typeof completionReviewChecks, boolean>;
}
function confirm(input: CompletionReviewConfirmation) {
  const f = exact(input, ['confirmed', 'checks']),
    checks = exact(f.checks, Object.keys(completionReviewChecks));
  if (f.confirmed !== true || Object.values(checks).some((v) => v !== true))
    throw Error('Explicit complete documentation review required');
  return JSON.stringify({ confirmed: f.confirmed, checks });
}
const claims = new WeakMap<object, Set<string>>();
interface PacketBinding {
  read: Binding;
  pack: Awaited<ReturnType<typeof prepareCustomerWorkflowPack>>;
  original: CompletionReviewConfirmation;
  confirmed: string;
  held: boolean;
}
const packets = new WeakMap<object, PacketBinding>();
/** Existing Proof of Work engine only. No completion store, customer response, publication or delivery. */
export async function prepareCompletionReview(
  view: CompletionReviewView,
  input: CompletionReviewConfirmation,
) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained documentation review required');
  current(b);
  const confirmed = confirm(input),
    key = JSON.stringify({
      organization_id: b.target.organization_id,
      customer_id: b.target.customer_id,
      location_id: b.target.location_id,
      estimate_id: b.target.estimate_id,
      version_id: b.target.version_id,
      job_id: b.target.job_id,
    });
  let claimed = claims.get(b.sources.operations);
  if (!claimed) {
    claimed = new Set();
    claims.set(b.sources.operations, claimed);
  }
  if (claimed.has(key))
    throw Error('Preparation already attempted; UNKNOWN cannot be replayed');
  claimed.add(key);
  const stable = () => {
    current(b);
    if (confirm(input) !== confirmed)
      throw Error('Documentation confirmation changed');
  };
  const pack = await prepareCustomerWorkflowPack(
    b.model,
    b.target,
    b.selection,
    { enabled: true, confirmed: true, reviewed_source_hash: b.sourceHash },
  );
  stable();
  const body = {
    mode: 'IMMUTABLE_COMPLETION_DOCUMENTATION_REVIEW' as const,
    review: view,
    proof_of_work: pack,
    reviewed_checks: {
      scope: true as const,
      documentation: true as const,
      limitations: true as const,
    },
    physical_completion: 'UNVERIFIED' as const,
    customer_acceptance: 'UNVERIFIED' as const,
    warranty: 'UNVERIFIED' as const,
    delivery: 'NOT_SENT' as const,
    persistence: 'SAME_TAB_MEMORY_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  stable();
  const packet = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  packets.set(packet, {
    read: b,
    pack,
    original: input,
    confirmed,
    held: false,
  });
  return packet;
}
export type CompletionReviewPacket = Awaited<
  ReturnType<typeof prepareCompletionReview>
>;
export async function reconcileCompletionReview(
  packet: CompletionReviewPacket,
) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replay: false,
    replacement: null,
  };
  const b = packets.get(packet);
  if (!b || b.held) return unknown;
  try {
    current(b.read);
    if (confirm(b.original) !== b.confirmed) throw Error('Review withdrawn');
    const { integrity, ...content } = packet;
    if ((await documentHash(content)) !== integrity.sha256)
      throw Error('Integrity mismatch');
    const state = await verifyCustomerWorkflowPack(
      b.read.model,
      b.read.target,
      b.read.selection,
      b.pack,
      b.read.gate,
    );
    current(b.read);
    if (confirm(b.original) !== b.confirmed || state !== 'CURRENT')
      throw Error('Exact evidence changed');
    return {
      status: 'CURRENT_REVIEW_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    b.held = true;
    return unknown;
  }
}
/** Source navigation re-reads the same exact report/version, never latest or a replacement. */
export async function openCompletionSource(view: CompletionReviewView) {
  const b = views.get(view);
  if (!b) throw Error('Unknown evidence');
  current(b);
  const exactView = await readCompletionReview(b.sources, b.original, b.gate);
  current(b);
  if (exactView.integrity.sha256 !== view.integrity.sha256)
    throw Error('Exact source changed');
  return exactView.report;
}
