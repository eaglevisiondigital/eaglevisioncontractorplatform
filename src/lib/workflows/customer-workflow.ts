import { CustomerPortalPreviewModel } from '../customer-preview';
import { documentHash } from '../../domain/release/preview';
import {
  createPropertyPassportTimeline,
  type PropertyPassportTimeline,
} from '../../domain/property/passport-timeline';
import {
  prepareProofOfWorkPack,
  proofOfWorkSourceReference,
  verifyProofOfWorkPack,
  type ProofOfWorkPack,
} from '../../domain/property/proof-of-work-pack';
import { reportUuid } from '../../domain/property/report-page';
import {
  prototypeFields,
  freezePrototype,
  type PrototypeTarget,
  type PrototypeAdmission,
} from '../program/prototype-source';

export interface CustomerWorkflowSelection {
  report_id: string;
  published_version: number;
}
export interface CustomerWorkflowPreparation extends PrototypeAdmission {
  reviewed_source_hash: string;
}
export interface CustomerWorkflowRead {
  status: 'CURRENT' | 'UNKNOWN';
  timeline: PropertyPassportTimeline | null;
  selection: CustomerWorkflowSelection | null;
  source_hash: string | null;
  physical_completion: 'UNVERIFIED';
  customer_acceptance: 'UNVERIFIED';
  warranty: 'UNVERIFIED';
  authority: 'DOCUMENTATION_ONLY';
}
const packBindings = new WeakSet<object>();
function admission(value: PrototypeAdmission) {
  const p = prototypeFields(value, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Explicit local customer documentation review required');
}
function target(value: PrototypeTarget): PrototypeTarget & { job_id: string } {
  const keys = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const p = prototypeFields(value, keys);
  if (
    Object.keys(p).length !== keys.length ||
    keys.some(
      (k) => typeof p[k] !== 'string' || !p[k] || (p[k] as string).length > 200,
    )
  )
    throw Error('Exact current journey identities required');
  return p as unknown as PrototypeTarget & { job_id: string };
}
function selection(value: CustomerWorkflowSelection) {
  const p = prototypeFields(value, ['report_id', 'published_version']);
  if (
    !reportUuid(p.report_id) ||
    typeof p.published_version !== 'number' ||
    !Number.isSafeInteger(p.published_version) ||
    p.published_version < 1
  )
    throw Error('Exact published report version required');
  return { report_id: p.report_id, published_version: p.published_version };
}
/** Existing current sources only. No caller-provided handoff is access authority. */
function checkpoint(
  model: CustomerPortalPreviewModel,
  t: ReturnType<typeof target>,
  s: CustomerWorkflowSelection,
) {
  if (
    !(model instanceof CustomerPortalPreviewModel) ||
    model.company.id !== t.organization_id ||
    !model.repo.operations.sample ||
    !model.repo.estimates.sample
  )
    throw Error('Current local customer model required');
  const current = model.read(),
    c = current.context;
  if (
    c.organization_id !== t.organization_id ||
    c.customer_id !== t.customer_id ||
    c.location_id !== t.location_id ||
    c.reports !== true ||
    !c.version_ids.includes(t.version_id)
  )
    throw Error('Exact authorized customer property/version required');
  const actual = model.repo.estimates.readSyntheticPrototypeSources(t);
  if (
    !actual.job ||
    actual.job.baseline.issued_version_id !== t.version_id ||
    actual.bundle.version.status !== 'issued'
  )
    throw Error('Exact issued job source required');
  const state = model.repo.read(t.organization_id),
    reports = current.reports.filter(
      (r) => r.id === s.report_id && r.version === s.published_version,
    );
  if (reports.length !== 1)
    throw Error('Exact customer-visible published report unavailable');
  const report = reports[0],
    visits = state.visits.filter((v) => v.id === report.visit_id),
    plans = state.plans.filter((p) => p.id === visits[0]?.plan_id);
  if (
    visits.length !== 1 ||
    plans.length !== 1 ||
    visits[0].organization_id !== t.organization_id ||
    plans[0].organization_id !== t.organization_id ||
    plans[0].customer_id !== t.customer_id ||
    plans[0].location_id !== t.location_id ||
    plans[0].job_id !== t.job_id
  )
    throw Error('Exact published report to job association unavailable');
  return JSON.stringify({
    context: c,
    reports: current.reports,
    issued: actual.bundle.version,
    job: {
      id: actual.job.id,
      organization_id: actual.job.organization_id,
      baseline: actual.job.baseline.issued_version_id,
    },
    plan: {
      id: plans[0].id,
      revision: plans[0].revision,
      job_id: plans[0].job_id,
    },
    visit: {
      id: visits[0].id,
      revision: visits[0].revision,
      plan_id: visits[0].plan_id,
    },
  });
}
function selectedSources(
  events: PropertyPassportTimeline['snapshot']['events'],
  t: ReturnType<typeof target>,
  s: CustomerWorkflowSelection,
) {
  const reports = events.filter(
    (e) =>
      e.kind === 'inspection-documentation' &&
      e.reference.kind === 'report' &&
      e.reference.report_id === s.report_id &&
      e.reference.published_version === s.published_version,
  );
  const jobs = events.filter(
    (e) =>
      e.kind === 'issued-job-scope' &&
      e.reference.kind === 'job-documentation' &&
      e.reference.job_id === t.job_id &&
      e.reference.estimate_id === t.estimate_id &&
      e.reference.issued_version_id === t.version_id,
  );
  if (reports.length !== 1 || jobs.length !== 1)
    throw Error('Exact authorized timeline sources required');
  const report = reports[0];
  if (
    report.kind !== 'inspection-documentation' ||
    report.job_link_status !== 'EXACT' ||
    report.linked_jobs.length !== 1 ||
    report.linked_jobs[0].job_id !== t.job_id ||
    report.linked_jobs[0].issued_version_id !== t.version_id
  )
    throw Error('Exact documentation association required');
  return [
    proofOfWorkSourceReference(jobs[0]),
    proofOfWorkSourceReference(report),
  ];
}
const unknown = (): CustomerWorkflowRead => ({
  status: 'UNKNOWN',
  timeline: null,
  selection: null,
  source_hash: null,
  physical_completion: 'UNVERIFIED',
  customer_acceptance: 'UNVERIFIED',
  warranty: 'UNVERIFIED',
  authority: 'DOCUMENTATION_ONLY',
});
/** Customer-safe composition of the existing Passport timeline. No new data store. */
export async function readCustomerWorkflow(
  model: CustomerPortalPreviewModel,
  selected: PrototypeTarget,
  report: CustomerWorkflowSelection,
  gate: PrototypeAdmission = {},
): Promise<CustomerWorkflowRead> {
  try {
    admission(gate);
    const t = target(selected),
      s = selection(report),
      before = checkpoint(model, t, s);
    const timeline = await createPropertyPassportTimeline(
      model,
      {
        organization_id: t.organization_id,
        customer_id: t.customer_id,
        location_id: t.location_id,
      },
      { enabled: true },
    );
    admission(gate);
    const sources = selectedSources(timeline.snapshot.events, t, s);
    const source_hash = await documentHash({
      timeline_sha256: timeline.integrity.sha256,
      sources,
    });
    admission(gate);
    if (checkpoint(model, t, s) !== before) return unknown();
    return freezePrototype({
      status: 'CURRENT' as const,
      timeline,
      selection: s,
      source_hash,
      physical_completion: 'UNVERIFIED' as const,
      customer_acceptance: 'UNVERIFIED' as const,
      warranty: 'UNVERIFIED' as const,
      authority: 'DOCUMENTATION_ONLY' as const,
    });
  } catch {
    return unknown();
  }
}
/** Prepare only the two explicitly reviewed existing report/job events through C5's pack. */
export async function prepareCustomerWorkflowPack(
  model: CustomerPortalPreviewModel,
  selected: PrototypeTarget,
  report: CustomerWorkflowSelection,
  input: CustomerWorkflowPreparation,
): Promise<ProofOfWorkPack> {
  const p = prototypeFields(input, [
    'enabled',
    'confirmed',
    'reviewed_source_hash',
  ]);
  if (
    typeof p.reviewed_source_hash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.reviewed_source_hash)
  )
    throw Error('Exact reviewed documentation hash required');
  const pinned = JSON.stringify(p),
    t = target(selected),
    s = selection(report);
  const guard = () => {
    const live = prototypeFields(input, [
      'enabled',
      'confirmed',
      'reviewed_source_hash',
    ]);
    admission({
      enabled: live.enabled === true,
      confirmed: live.confirmed === true,
    });
    if (JSON.stringify(live) !== pinned)
      throw Error('Documentation confirmation changed');
  };
  guard();
  const before = checkpoint(model, t, s);
  const current = await readCustomerWorkflow(model, t, s, {
    enabled: true,
    confirmed: true,
  });
  guard();
  if (
    !current.timeline ||
    current.status !== 'CURRENT' ||
    current.source_hash !== p.reviewed_source_hash ||
    checkpoint(model, t, s) !== before
  )
    throw Error('Current exact reviewed documentation required');
  const pack = await prepareProofOfWorkPack(
    model,
    {
      organization_id: t.organization_id,
      customer_id: t.customer_id,
      location_id: t.location_id,
    },
    {
      timeline_sha256: current.timeline.integrity.sha256,
      sources: selectedSources(current.timeline.snapshot.events, t, s),
      confirmed: true,
    },
    { enabled: true },
  );
  guard();
  if (checkpoint(model, t, s) !== before)
    throw Error('Documentation changed; exact read only');
  packBindings.add(pack);
  return pack;
}
/** No replay/replacement: verify the same existing pack against current exact sources. */
export async function verifyCustomerWorkflowPack(
  model: CustomerPortalPreviewModel,
  selected: PrototypeTarget,
  report: CustomerWorkflowSelection,
  pack: ProofOfWorkPack,
  gate: PrototypeAdmission = {},
): Promise<'CURRENT' | 'STALE' | 'UNKNOWN'> {
  try {
    admission(gate);
    if (!packBindings.has(pack)) return 'UNKNOWN';
    const t = target(selected),
      s = selection(report),
      before = checkpoint(model, t, s);
    if (
      pack.snapshot.organization_id !== t.organization_id ||
      pack.snapshot.customer_id !== t.customer_id ||
      pack.snapshot.location_id !== t.location_id
    )
      return 'UNKNOWN';
    selectedSources(pack.snapshot.events, t, s);
    const result = await verifyProofOfWorkPack(model, pack.reference, {
      enabled: true,
    });
    admission(gate);
    if (checkpoint(model, t, s) !== before) return 'UNKNOWN';
    return result.status;
  } catch {
    return 'UNKNOWN';
  }
}
