import type { PassportReportReference } from '../../domain/property/passport';
import { prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { DailyWorkbenchProps } from './daily-workbench-contract';
import {
  publishedServiceNavigationEnabled,
  readPublishedServiceHistory,
  refreshPublishedServiceHistory,
  assertPublishedServiceHistory,
  publishedServiceContext,
  inspectPublishedServiceReport,
  readPublishedServiceRequirements,
  type PublishedServiceHistory,
} from './published-service-navigation';
export const propertyServiceContinuityEnabled =
  publishedServiceNavigationEnabled;
export interface PropertyServiceJob {
  readonly context: ReturnType<typeof publishedServiceContext>;
  /** The original C21 safe evidence object, not a copied snapshot/archive. */
  readonly history: PublishedServiceHistory;
}
export interface PropertyServiceContinuityView {
  readonly selected_job_id: string;
  readonly organization_id: string;
  readonly customer_id: string;
  readonly location_id: string;
  readonly property_label: string;
  readonly jobs: readonly PropertyServiceJob[];
  readonly history_completeness: 'UNKNOWN';
  readonly request_job_link: 'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT';
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  entries: OperatingSources['entries'];
  selected: OperatingSources['entries'][number];
}
const bindings = new WeakMap<object, Binding>();
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !propertyServiceContinuityEnabled(true)
  )
    throw Error(
      'Property service continuity is OFF without explicit local admission',
    );
}
function related(b: Binding) {
  admit(b.gate);
  const current = captureOperatingSources(b.sources, b.gate);
  current.check();
  const t = b.selected.target;
  if (!current.entries.includes(b.selected))
    throw Error('Exact original selected job required');
  return current.entries.filter(
    (e) =>
      e.target.organization_id === t.organization_id &&
      e.target.customer_id === t.customer_id &&
      e.target.location_id === t.location_id,
  );
}
function binding(view: PropertyServiceContinuityView) {
  const b = bindings.get(view);
  if (!b) throw Error('Original property service view required');
  // Let the original history reader observe a revoked/corrupt source before a
  // generic container fence can mask its existing terminal UNKNOWN custody.
  for (const job of view.jobs) assertPublishedServiceHistory(job.history);
  const current = related(b);
  if (
    current.length !== b.entries.length ||
    current.some((e, i) => e !== b.entries[i]) ||
    b.selected.target.job_id !== view.selected_job_id
  )
    throw Error('Same exact property source set required; no replacement');
  for (const job of view.jobs) {
    assertPublishedServiceHistory(job.history);
    const context = publishedServiceContext(job.history);
    if (
      JSON.stringify(context) !== JSON.stringify(job.context) ||
      context.organization_id !== view.organization_id ||
      context.customer_id !== view.customer_id ||
      context.location_id !== view.location_id ||
      !current.some((e) => e.target.job_id === context.job_id)
    )
      throw Error('Exact job/customer/property history required');
  }
  return b;
}
function assemble(b: Binding, histories: readonly PublishedServiceHistory[]) {
  const entries = related(b);
  if (histories.length !== entries.length)
    throw Error('All exact available property sources required');
  const jobs = Object.freeze(
    histories.map((history, i) => {
      const context = Object.freeze(publishedServiceContext(history));
      if (context.job_id !== entries[i].target.job_id)
        throw Error('Exact property job source order required');
      return Object.freeze({ context, history });
    }),
  );
  const t = b.selected.target;
  const view = Object.freeze({
    selected_job_id: t.job_id!,
    organization_id: t.organization_id,
    customer_id: t.customer_id,
    location_id: t.location_id,
    property_label: histories[0].property_label,
    jobs,
    history_completeness: 'UNKNOWN' as const,
    request_job_link: 'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT' as const,
  });
  bindings.set(view, { ...b, entries });
  binding(view);
  return view;
}
/** Compose original published readers over exact CRM property/job identities.
 * The returned index contains original safe history objects; it is not a store,
 * restoration layer, new evidence archive, or authority to publish/complete. */
export async function readPropertyServiceContinuity(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<PropertyServiceContinuityView> {
  admit(gate); // Before source selectors/getters.
  if (typeof jobId !== 'string' || !jobId || jobId.length > 200)
    throw Error('Exact retained job required');
  const capture = captureOperatingSources(sources, gate);
  const selected = capture.entries.filter((e) => e.target.job_id === jobId);
  if (selected.length !== 1)
    throw Error('Unique selected job required; no fallback');
  const b: Binding = { sources, gate, selected: selected[0], entries: [] };
  b.entries = related(b);
  const histories = await Promise.all(
    b.entries.map((entry) =>
      readPublishedServiceHistory(sources, entry.target.job_id!, gate),
    ),
  );
  capture.check();
  return assemble(b, histories);
}
export function assertPropertyServiceContinuity(
  view: PropertyServiceContinuityView,
) {
  binding(view);
}
export function inspectPropertyServiceJob(
  view: PropertyServiceContinuityView,
  jobId: string,
) {
  binding(view);
  if (typeof jobId !== 'string') throw Error('Exact job identity required');
  const matches = view.jobs.filter((job) => job.context.job_id === jobId);
  if (matches.length !== 1)
    throw Error('Exact authorized same-property job required');
  return matches[0];
}
/** Compare only published siblings of the exact recorded visit/plan. A newer
 * available report never replaces the retained selected source automatically. */
export function readPropertyServiceVersionStatus(
  view: PropertyServiceContinuityView,
  jobId: string,
  reference?: PassportReportReference,
) {
  const job = inspectPropertyServiceJob(view, jobId);
  const entry = binding(view).entries.find((e) => e.target.job_id === jobId)!;
  const anchor = job.history.reports.find(
    (r) =>
      r.reference.report_id === entry.report_id &&
      r.reference.published_version === entry.published_version,
  );
  if (!anchor) throw Error('Exact retained published source unavailable');
  const selected = inspectPublishedServiceReport(
    job.history,
    reference ?? anchor.reference,
  );
  const siblings = job.history.reports.filter(
    (r) => r.visit_id === selected.visit_id && r.plan_id === selected.plan_id,
  );
  const versions = siblings
    .map((r) => r.reference.published_version)
    .sort((a, b) => a - b);
  const latest = versions[versions.length - 1];
  return Object.freeze({
    job_id: job.context.job_id,
    selected_report_id: selected.reference.report_id,
    selected_published_version: selected.reference.published_version,
    visit_id: selected.visit_id,
    plan_id: selected.plan_id,
    available_sibling_versions: Object.freeze(versions),
    latest_available_sibling_version: latest,
    status:
      selected.reference.published_version === latest
        ? ('LATEST_IN_LOADED_PUBLISHED_SIBLINGS' as const)
        : ('OLDER_AVAILABLE_PUBLISHED_VERSION' as const),
    history_completeness: 'UNKNOWN' as const,
    availability: 'LAST_EXPLICIT_PUBLISHED_READ' as const,
    physical_completion: 'UNVERIFIED' as const,
    customer_acceptance: 'UNVERIFIED' as const,
  });
}
export async function refreshPropertyServiceContinuity(
  view: PropertyServiceContinuityView,
) {
  const b = binding(view);
  const capture = captureOperatingSources(b.sources, b.gate);
  const histories = await Promise.all(
    view.jobs.map((job) => refreshPublishedServiceHistory(job.history)),
  );
  capture.check();
  binding(view);
  return assemble(b, histories);
}
export async function readPropertyServiceRequirements(
  view: PropertyServiceContinuityView,
  jobId: string,
  reference?: PassportReportReference,
) {
  const job = inspectPropertyServiceJob(view, jobId);
  const entry = binding(view).entries.find((e) => e.target.job_id === jobId)!;
  const anchor = job.history.reports.find(
    (r) =>
      r.reference.report_id === entry.report_id &&
      r.reference.published_version === entry.published_version,
  );
  if (!anchor) throw Error('Exact retained published source unavailable');
  const result = await readPublishedServiceRequirements(
    job.history,
    reference ?? anchor.reference,
  );
  binding(view);
  return result;
}

export interface PropertyServiceJobCallback {
  current: DailyWorkbenchProps['onSelectJob'];
  generation: number;
}
/** Synchronous presentation handoff only. The original host independently
 * revalidates the ID and retains the original canonical command custody. */
export function handoffPropertyServiceJob(
  view: PropertyServiceContinuityView,
  jobId: string,
  expected: NonNullable<DailyWorkbenchProps['onSelectJob']>,
  lease: PropertyServiceJobCallback,
) {
  const check = () => {
    const p = prototypeFields(lease, ['current', 'generation']);
    if (
      Object.keys(p).length !== 2 ||
      p.current !== expected ||
      typeof expected !== 'function' ||
      !Number.isSafeInteger(p.generation) ||
      Number(p.generation) < 0
    )
      throw Error('Exact current property job callback required');
    return p.generation;
  };
  const generation = check();
  const job = inspectPropertyServiceJob(view, jobId);
  const result = (
    expected as (...args: Parameters<typeof expected>) => unknown
  )(job.context.job_id, 'completion');
  if (result !== undefined) {
    void Promise.resolve(result).catch(() => undefined);
    throw Error(
      'UNKNOWN property job handoff; synchronous original host required',
    );
  }
  assertPropertyServiceContinuity(view);
  if (check() !== generation)
    throw Error('UNKNOWN property job callback changed after dispatch');
  return job.context.job_id;
}
