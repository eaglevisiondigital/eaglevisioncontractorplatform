import { CustomerPortalPreviewModel } from '../customer-preview';
import {
  emptyHistoryFilters,
  recordedFrequency,
  searchInspectionHistory,
  type HistoryFilters,
} from '../../domain/property/history-search';
import { reportUuid } from '../../domain/property/report-page';
import {
  freezePrototype,
  prototypeFields,
  type PrototypeAdmission,
  type PrototypeTarget,
  type Immutable,
} from '../program/prototype-source';
import {
  readCustomerWorkflow,
  type CustomerWorkflowSelection,
} from './customer-workflow';

type Search = ReturnType<typeof searchInspectionHistory>;
const bindings = new WeakMap<
  object,
  {
    model: CustomerPortalPreviewModel;
    target: PrototypeTarget;
    selection: CustomerWorkflowSelection;
    filters: HistoryFilters;
    gate: PrototypeAdmission;
    fingerprint: string;
  }
>();
export type CustomerServiceRead = Immutable<{
  status: 'CURRENT' | 'UNKNOWN';
  property_label: string | null;
  reports: Search['reports'];
  matching: number;
  available: number;
  options: Search['options'] | null;
  frequencies: Record<string, string>;
  issued_scope: {
    job_id: string;
    estimate_id: string;
    issued_version_id: string;
    issued_version_number: number;
    name: string;
    description: string;
  } | null;
  history_completeness: 'UNKNOWN';
  physical_completion: 'UNVERIFIED';
  authority: 'EVIDENCE_NAVIGATION_ONLY';
}>;
function unknown(): CustomerServiceRead {
  return {
    status: 'UNKNOWN',
    property_label: null,
    reports: [],
    matching: 0,
    available: 0,
    options: null,
    frequencies: {},
    issued_scope: null,
    history_completeness: 'UNKNOWN',
    physical_completion: 'UNVERIFIED',
    authority: 'EVIDENCE_NAVIGATION_ONLY',
  };
}
function admission(gate: PrototypeAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit local evidence navigation required');
}
function pinTarget(input: PrototypeTarget) {
  const keys = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const t = prototypeFields(input, keys);
  if (
    Object.keys(t).length !== keys.length ||
    keys.some(
      (k) => typeof t[k] !== 'string' || !t[k] || (t[k] as string).length > 200,
    )
  )
    throw Error('Exact existing journey identities required');
  return t as unknown as PrototypeTarget;
}
function pinSelection(input: CustomerWorkflowSelection) {
  const s = prototypeFields(input, ['report_id', 'published_version']);
  if (
    !reportUuid(s.report_id) ||
    !Number.isSafeInteger(s.published_version) ||
    Number(s.published_version) < 1
  )
    throw Error('Exact published selection required');
  return {
    report_id: s.report_id,
    published_version: Number(s.published_version),
  };
}
function pinFilters(input: HistoryFilters): HistoryFilters {
  const keys = Object.keys(emptyHistoryFilters),
    f = prototypeFields(input, keys);
  if (
    Object.keys(f).length !== keys.length ||
    keys.some((k) => typeof f[k] !== 'string' || (f[k] as string).length > 200)
  )
    throw Error('Invalid evidence filters');
  return f as HistoryFilters;
}
/** Private comparison only. Never returned or serialized into a customer projection. */
function checkpoint(
  model: CustomerPortalPreviewModel,
  target: PrototypeTarget,
) {
  if (
    !(model instanceof CustomerPortalPreviewModel) ||
    model.company.id !== target.organization_id ||
    !model.repo.operations.sample ||
    !model.repo.estimates.sample
  )
    throw Error('Current local model required');
  const source = model.repo.estimates.readSyntheticPrototypeSources(target);
  const current = model.read(),
    c = current.context;
  if (
    c.organization_id !== target.organization_id ||
    c.customer_id !== target.customer_id ||
    c.location_id !== target.location_id ||
    c.reports !== true ||
    !c.version_ids.includes(target.version_id) ||
    source.bundle.version.status !== 'issued' ||
    !source.job ||
    source.job.baseline.issued_version_id !== target.version_id
  )
    throw Error('Exact current issued job/property required');
  return JSON.stringify({
    source,
    current,
    property: model.repo.read(target.organization_id),
    members: model.repo.operations.syntheticMemberships(target.organization_id),
  });
}

/** Read-only navigator over existing authorized published reports. No new search index,
 * service request, response, recipient, message store, writer or connected authority. */
export async function readCustomerService(
  model: CustomerPortalPreviewModel,
  input: PrototypeTarget,
  selected: CustomerWorkflowSelection,
  filters: HistoryFilters,
  gate: PrototypeAdmission = {},
): Promise<CustomerServiceRead> {
  try {
    admission(gate);
    const t = pinTarget(input),
      s = pinSelection(selected),
      f = pinFilters(filters);
    const before = checkpoint(model, t);
    const guard = () => {
      admission(gate);
      if (
        JSON.stringify(pinTarget(input)) !== JSON.stringify(t) ||
        JSON.stringify(pinSelection(selected)) !== JSON.stringify(s) ||
        JSON.stringify(pinFilters(filters)) !== JSON.stringify(f) ||
        checkpoint(model, t) !== before
      )
        throw Error('Evidence context changed');
    };
    const anchor = await readCustomerWorkflow(model, t, s, {
      enabled: true,
      confirmed: true,
    });
    guard();
    if (anchor.status !== 'CURRENT' || !anchor.timeline) return unknown();
    const scope = anchor.timeline.snapshot.events.filter(
      (e) =>
        e.kind === 'issued-job-scope' &&
        e.job.reference.job_id === t.job_id &&
        e.job.reference.estimate_id === t.estimate_id &&
        e.job.reference.issued_version_id === t.version_id,
    );
    if (scope.length !== 1 || scope[0].kind !== 'issued-job-scope')
      return unknown();
    const current = model.read(),
      state = model.repo.read(t.organization_id);
    // A same-property report is not necessarily this job's report. Use the actual
    // unique visit -> plan -> job relationship; never descriptions or newest fallback.
    const candidates = current.reports.filter((r) => {
      const visits = state.visits.filter((v) => v.id === r.visit_id);
      const plans = state.plans.filter((p) => p.id === visits[0]?.plan_id);
      return (
        visits.length === 1 &&
        plans.length === 1 &&
        visits[0].organization_id === t.organization_id &&
        plans[0].organization_id === t.organization_id &&
        plans[0].customer_id === t.customer_id &&
        plans[0].location_id === t.location_id &&
        plans[0].job_id === t.job_id
      );
    });
    for (const report of candidates) {
      const reviewed = await readCustomerWorkflow(
        model,
        t,
        {
          report_id: report.id,
          published_version: report.version,
        },
        { enabled: true, confirmed: true },
      );
      guard();
      if (reviewed.status !== 'CURRENT') return unknown();
    }
    const search = searchInspectionHistory(
      candidates,
      current.context,
      f,
      current.cadences,
    );
    guard();
    const job = scope[0].job;
    const result = freezePrototype({
      status: 'CURRENT' as const,
      property_label: current.context.property_label,
      reports: search.reports,
      matching: search.reports.length,
      available: search.available,
      options: search.options,
      frequencies: Object.fromEntries(
        candidates.map((r) => [
          r.id,
          recordedFrequency(current.cadences[r.id]),
        ]),
      ),
      issued_scope: {
        job_id: job.reference.job_id,
        estimate_id: job.reference.estimate_id,
        issued_version_id: job.reference.issued_version_id,
        issued_version_number: job.reference.issued_version_number,
        name: job.issued_source.scope.name,
        description: job.issued_source.scope.description,
      },
      history_completeness: 'UNKNOWN' as const,
      physical_completion: 'UNVERIFIED' as const,
      authority: 'EVIDENCE_NAVIGATION_ONLY' as const,
    });
    bindings.set(result, {
      model,
      target: t,
      selection: s,
      filters: f,
      gate,
      fingerprint: before,
    });
    return result;
  } catch {
    return unknown();
  }
}

/** UI consumers recheck synchronously after their final await; copied/foreign results
 * confer no access. No new read, replacement selection or command is performed. */
export function assertCustomerServiceCurrentNow(
  model: CustomerPortalPreviewModel,
  input: PrototypeTarget,
  selected: CustomerWorkflowSelection,
  filters: HistoryFilters,
  read: CustomerServiceRead,
) {
  const b = bindings.get(read);
  if (
    !b ||
    b.model !== model ||
    JSON.stringify(pinTarget(input)) !== JSON.stringify(b.target) ||
    JSON.stringify(pinSelection(selected)) !== JSON.stringify(b.selection) ||
    JSON.stringify(pinFilters(filters)) !== JSON.stringify(b.filters)
  )
    throw Error('Exact original service evidence required');
  admission(b.gate);
  if (checkpoint(model, b.target) !== b.fingerprint)
    throw Error('Service evidence changed; exact read only');
}
