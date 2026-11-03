import { CustomerPortalPreviewModel } from '../customer-preview';
import type {
  PassportReportReference,
  PassportFindingReference,
} from '../../domain/property/passport';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { journeyEnabled, type JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readServiceReviewRequests,
  assertServiceReviewRequestsCurrent,
  selectServiceReviewContext,
  openServiceReviewPath,
  assertServiceReviewPathCurrent,
  openServiceReviewReport,
  openServiceReviewFinding,
  returnServiceReviewRequest,
  selectServiceReviewJob,
  type ServiceReviewRequests,
  type ServiceReviewPathRead,
  type ServiceReviewContext,
} from './service-review-path';
import {
  readCompletionReview,
  completionReviewChecks,
} from './completion-review';

export { completionReviewChecks };
export function serviceCompletionGuideEnabled(enabled = false) {
  return (
    enabled === true &&
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: 'true',
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  );
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !serviceCompletionGuideEnabled(true)
  )
    throw Error(
      'Service completion guide is OFF without explicit development HTTP loopback admission',
    );
}
interface Binding {
  gate: JourneyAdmission;
  capture: ReturnType<typeof captureOperatingSources>;
  view: ServiceReviewRequests;
  held: boolean;
}
const views = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held)
    throw Error(
      'UNKNOWN service guide is exact read only; no reset or replacement',
    );
  try {
    admit(b.gate);
    b.capture.check();
    assertServiceReviewRequestsCurrent(b.view);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
function binding(view: ServiceReviewRequests) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained service completion guide required');
  current(b);
  return b;
}
/** The original request view, not a second request/job/history store. */
export async function readServiceCompletionGuide(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // Before source getters, serialization or source capture.
  const capture = captureOperatingSources(sources, gate),
    view = await readServiceReviewRequests(sources, gate),
    b: Binding = { gate, capture, view, held: false };
  current(b);
  views.set(view, b);
  return view;
}
export type ServiceCompletionGuideView = ServiceReviewRequests;
export function assertServiceCompletionGuideCurrent(
  view: ServiceCompletionGuideView,
) {
  binding(view);
}
export function selectServiceCompletionContext(
  view: ServiceCompletionGuideView,
  jobId?: string,
) {
  binding(view);
  return selectServiceReviewContext(view, jobId);
}
export interface ServiceCompletionFilters {
  query: string;
  customer_id: string;
  location_id: string;
  request_state: string;
}
export const emptyServiceCompletionFilters: ServiceCompletionFilters =
  Object.freeze({
    query: '',
    customer_id: '',
    location_id: '',
    request_state: '',
  });
/** Literal intersection over the original admitted records. Available counts are not complete coverage. */
export function filterServiceCompletionRequests(
  view: ServiceCompletionGuideView,
  input: ServiceCompletionFilters,
) {
  binding(view);
  const p = prototypeFields(input, [
    'query',
    'customer_id',
    'location_id',
    'request_state',
  ]);
  if (
    Object.keys(p).length !== 4 ||
    Object.entries(p).some(
      ([key, value]) =>
        typeof value !== 'string' ||
        value.length > (key === 'query' ? 100 : 200),
    )
  )
    throw Error('Exact bounded literal service filters required');
  const f = p as unknown as ServiceCompletionFilters;
  for (const key of ['customer_id', 'location_id', 'request_state'] as const)
    if (
      f[key] &&
      !view.requests.some(
        (r) => (key === 'request_state' ? r.request.status : r[key]) === f[key],
      )
    )
      throw Error('Filter identity is outside admitted service evidence');
  const query = f.query.trim().toLocaleLowerCase();
  return freezePrototype(
    view.requests.flatMap((group) =>
      group.jobs
        .filter(
          (job) =>
            (!f.customer_id || f.customer_id === group.customer_id) &&
            (!f.location_id || f.location_id === group.location_id) &&
            (!f.request_state || f.request_state === group.request.status) &&
            [
              group.request.id,
              group.request.summary,
              group.customer_label,
              group.property_label,
              group.customer_id,
              group.location_id,
              group.request.status,
              job.job_id,
              job.name,
              job.issued_version_id,
            ]
              .join(' ')
              .toLocaleLowerCase()
              .includes(query),
        )
        .map((job) => ({
          request: group.request,
          customer_id: group.customer_id,
          customer_label: group.customer_label,
          location_id: group.location_id,
          property_label: group.property_label,
          job,
        })),
    ),
  );
}
/** Private source fence only: never serialize executable hooks or expose model state. */
function modelSignature(value: unknown, active = new Set<object>()): string {
  function data(v: unknown): unknown {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (
      !v ||
      typeof v !== 'object' ||
      active.has(v) ||
      ![null, Object.prototype, Array.prototype].includes(
        Object.getPrototypeOf(v),
      )
    )
      throw Error('Plain customer-model evidence required');
    active.add(v);
    const d = Object.getOwnPropertyDescriptors(v),
      keys = Reflect.ownKeys(v);
    if (
      keys.some((k) => typeof k !== 'string' || !Object.hasOwn(d[k], 'value'))
    )
      throw Error('Own-data customer-model evidence required');
    let result: unknown;
    if (Array.isArray(v)) {
      if (
        keys.length !== v.length + 1 ||
        Array.from({ length: v.length }, (_, i) => d[String(i)]).some(
          (item) => !item,
        )
      )
        throw Error('Dense customer-model evidence required');
      result = Array.from({ length: v.length }, (_, i) =>
        data(d[String(i)].value),
      );
    } else
      result = Object.fromEntries(
        (keys as string[]).map((k) => [k, data(d[k].value)]),
      );
    active.delete(v);
    return result;
  }
  return JSON.stringify(data(value));
}
interface ContextBinding {
  parent: Binding;
  model: string;
  held: boolean;
}
const contexts = new WeakMap<object, ContextBinding>();
function context(path: ServiceReviewPathRead) {
  const b = contexts.get(path);
  if (!b || b.held)
    throw Error('UNKNOWN or unretained exact service context; no replay');
  try {
    current(b.parent);
    assertServiceReviewPathCurrent(path);
    const entry = b.parent.capture.entries.find(
      (e) => e.target.job_id === path.context.job_id,
    );
    if (
      !entry ||
      !(entry.customerModel instanceof CustomerPortalPreviewModel) ||
      entry.customerModel.company !== entry.company ||
      entry.customerModel.repo !== entry.property
    )
      throw Error('Original service model and repository required');
    const state = entry.customerModel.read();
    if (modelSignature(state) !== b.model)
      throw Error('Original customer model evidence changed');
    const c = prototypeFields(state.context, [
      'organization_id',
      'customer_id',
      'location_id',
      'company_name',
      'primary_color',
      'property_label',
      'reports',
      'version_ids',
    ]);
    if (
      c.organization_id !== entry.target.organization_id ||
      c.customer_id !== entry.target.customer_id ||
      c.location_id !== entry.target.location_id ||
      c.reports !== true ||
      !Array.isArray(c.version_ids)
    )
      throw Error('Current exact customer model context required');
    const ids = Object.getOwnPropertyDescriptors(c.version_ids);
    if (
      Reflect.ownKeys(c.version_ids).length !== c.version_ids.length + 1 ||
      Array.from(
        { length: c.version_ids.length },
        (_, i) => ids[String(i)],
      ).some(
        (d) => !d || !Object.hasOwn(d, 'value') || typeof d.value !== 'string',
      ) ||
      !Object.values(ids).some((d) => d.value === entry.target.version_id)
    )
      throw Error('Current exact issued customer version required');
  } catch (error) {
    b.held = true;
    throw error;
  }
  return b;
}
/** Explicit staff context only; the absent original request/job FK remains UNKNOWN. */
export async function openServiceCompletionContext(
  view: ServiceCompletionGuideView,
  input: ServiceReviewContext,
) {
  const b = binding(view),
    path = await openServiceReviewPath(view, input);
  current(b);
  assertServiceReviewPathCurrent(path);
  const entry = b.capture.entries.find(
    (e) => e.target.job_id === path.context.job_id,
  );
  if (!entry) throw Error('Original customer-model source required');
  contexts.set(path, {
    parent: b,
    model: modelSignature(entry.customerModel.read()),
    held: false,
  });
  context(path);
  return path;
}
export type ServiceCompletionContext = ServiceReviewPathRead;
export function assertServiceCompletionContextCurrent(
  path: ServiceCompletionContext,
) {
  context(path);
}
function reportSignature(reference: PassportReportReference) {
  const p = prototypeFields(reference, [
    'kind',
    'organization_id',
    'customer_id',
    'location_id',
    'report_id',
    'published_version',
  ]);
  if (
    Object.keys(p).length !== 6 ||
    p.kind !== 'report' ||
    ['organization_id', 'customer_id', 'location_id', 'report_id'].some(
      (k) =>
        typeof p[k] !== 'string' ||
        !(p[k] as string).length ||
        (p[k] as string).length > 200,
    ) ||
    typeof p.published_version !== 'number' ||
    !Number.isSafeInteger(p.published_version) ||
    p.published_version < 1
  )
    throw Error('Exact own-data published report/version reference required');
  return JSON.stringify([
    p.kind,
    p.organization_id,
    p.customer_id,
    p.location_id,
    p.report_id,
    p.published_version,
  ]);
}
/** Original published report plus the existing read-only completion review; no preparation claim or packet. */
export async function openServiceCompletionReport(
  path: ServiceCompletionContext,
  reference: PassportReportReference,
) {
  const b = context(path);
  try {
    const signature = reportSignature(reference),
      report = await openServiceReviewReport(path, reference);
    context(path);
    const doc = path.customer_safe.documentation.find(
      (d) => reportSignature(d.report.reference) === signature,
    );
    if (!doc) throw Error('Original published documentation required');
    const entry = b.parent.capture.entries.find(
      (e) => e.target.job_id === path.context.job_id,
    );
    if (!entry) throw Error('Original exact job handle required');
    const completion =
      doc.selected_job_association === 'EXACT_RECORDED_JOB_LINK'
        ? await readCompletionReview(
            entry,
            {
              report_id: report.reference.report_id,
              published_version: report.reference.published_version,
            },
            b.parent.gate,
          )
        : null;
    context(path);
    if (
      reportSignature(reference) !== signature ||
      (completion &&
        (reportSignature(completion.report.reference) !==
          reportSignature(report.reference) ||
          completion.property.organization_id !==
            path.customer_safe.property.organization_id ||
          completion.property.customer_id !==
            path.customer_safe.property.customer_id ||
          completion.property.location_id !==
            path.customer_safe.property.location_id ||
          completion.job.reference.job_id !== path.context.job_id ||
          completion.job.reference.issued_version_id !==
            path.recorded_job_scope.issued_version_id))
    )
      throw Error('Exact completion source/context changed');
    const evidence = freezePrototype({
      report,
      completion,
      completion_status: completion
        ? ('EXACT_READ_ONLY_DOCUMENTATION' as const)
        : ('UNKNOWN_REPORT_JOB_LINK_NOT_RECORDED' as const),
      selected_job_association: doc.selected_job_association,
    });
    evidenceContexts.set(evidence, path);
    return evidence;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export type ServiceCompletionEvidence = Awaited<
  ReturnType<typeof openServiceCompletionReport>
>;
const evidenceContexts = new WeakMap<object, ServiceCompletionContext>();
export function assertServiceCompletionEvidenceCurrent(
  evidence: ServiceCompletionEvidence,
) {
  const path = evidenceContexts.get(evidence);
  if (!path) throw Error('Exact retained completion evidence required');
  context(path);
}
export async function openServiceCompletionFinding(
  path: ServiceCompletionContext,
  reference: PassportFindingReference,
) {
  const b = context(path);
  try {
    const finding = await openServiceReviewFinding(path, reference);
    context(path);
    return finding;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export function returnServiceCompletionSelection(
  path: ServiceCompletionContext,
) {
  context(path);
  return returnServiceReviewRequest(path);
}
export function selectServiceCompletionJob(path: ServiceCompletionContext) {
  context(path);
  return selectServiceReviewJob(path);
}
export function inspectServiceCompletionContext(
  path: ServiceCompletionContext,
) {
  try {
    context(path);
    return {
      status: 'CURRENT_EXACT_READ_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    return { status: 'UNKNOWN' as const, replay: false, replacement: null };
  }
}
