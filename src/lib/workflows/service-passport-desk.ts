import { documentHash } from '../../domain/release/preview';
import type {
  PassportFindingReference,
  PassportReportReference,
} from '../../domain/property/passport';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { readCustomerWorkflow } from './customer-workflow';
import {
  readServiceLifecycleReview,
  openServiceLifecycleJob,
  openServiceLifecycleReport,
  selectServiceLifecycleJob,
  assertServiceLifecycleCurrentNow,
  assertServiceLifecycleDetailCurrentNow,
  type ServiceLifecycleView,
  type ServiceLifecycleDetail,
} from './service-lifecycle-review';

export interface ServicePassportInput {
  query: string;
  customer_id: string;
  location_id: string;
  job_id: string;
  state: string;
}
const keys = [
  'query',
  'customer_id',
  'location_id',
  'job_id',
  'state',
] as const;
function pin(input: ServicePassportInput) {
  const p = prototypeFields(input, keys);
  if (
    Object.keys(p).length !== keys.length ||
    keys.some(
      (k) =>
        typeof p[k] !== 'string' ||
        (p[k] as string).length > (k === 'query' ? 100 : 200),
    )
  )
    throw Error('Exact bounded literal service filters required');
  return Object.fromEntries(
    keys.map((k) => [k, p[k]]),
  ) as unknown as ServicePassportInput;
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error(
      'Service and Passport desk is OFF without explicit local admission',
    );
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  capture: ReturnType<typeof captureOperatingSources>;
  original: ServicePassportInput;
  signature: string;
  lifecycle: ServiceLifecycleView;
  held: boolean;
  inspected: Set<string>;
}
const views = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held)
    throw Error('UNKNOWN service evidence is exact read only; no replay');
  try {
    admit(b.gate);
    if (JSON.stringify(pin(b.original)) !== b.signature)
      throw Error('Original service selection changed');
    b.capture.check();
    assertServiceLifecycleCurrentNow(b.lifecycle);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** A navigation projection over original requests and Passport sources, never a business store. */
export async function readServicePassportDesk(
  sources: OperatingSources,
  input: ServicePassportInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // Denied admission must not invoke inputs, source getters or serializers.
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate);
  const lifecycle = await readServiceLifecycleReview(
    sources,
    { query: '', location_id: '', job_id: '' },
    gate,
  );
  const b: Binding = {
    sources,
    gate,
    capture,
    original: input,
    signature: JSON.stringify(selected),
    lifecycle,
    held: false,
    inspected: new Set(),
  };
  current(b);
  const all = lifecycle.staff_paths;
  if (
    selected.customer_id &&
    !all.some((p) => p.customer_id === selected.customer_id)
  )
    throw Error('Exact admitted customer required');
  if (
    selected.location_id &&
    !all.some(
      (p) =>
        p.location_id === selected.location_id &&
        (!selected.customer_id || p.customer_id === selected.customer_id),
    )
  )
    throw Error('Exact admitted customer/property required');
  if (
    selected.job_id &&
    !all.some(
      (p) =>
        p.job_id === selected.job_id &&
        (!selected.customer_id || p.customer_id === selected.customer_id) &&
        (!selected.location_id || p.location_id === selected.location_id),
    )
  )
    throw Error('Exact admitted customer/property/job required');
  if (selected.state && !all.some((p) => p.request.status === selected.state))
    throw Error('Recorded request state required');
  const query = selected.query.toLocaleLowerCase('en-US');
  const paths = all.filter(
    (p) =>
      (!selected.customer_id || p.customer_id === selected.customer_id) &&
      (!selected.location_id || p.location_id === selected.location_id) &&
      (!selected.job_id || p.job_id === selected.job_id) &&
      (!selected.state || p.request.status === selected.state) &&
      (!query ||
        [
          p.request.id,
          p.request.summary,
          p.request.status,
          p.customer_id,
          p.customer_label,
          p.location_id,
          p.property_label,
          p.job_id,
          p.estimate_id,
          p.estimate_number,
          p.issued_version_id,
          p.scope_name,
          p.scope_description,
          ...p.linked_reports.flatMap((r) => [
            r.reference.report_id,
            r.summary,
          ]),
        ].some((v) => v.toLocaleLowerCase('en-US').includes(query))),
  );
  const body = {
    mode: 'LOCAL_SERVICE_PASSPORT_DESK' as const,
    organization_id: lifecycle.organization_id,
    filters: selected,
    available_requests: new Set(all.map((p) => p.request.id)).size,
    available_customers: new Set(all.map((p) => p.customer_id)).size,
    available_jobs: lifecycle.available_jobs,
    available_properties: lifecycle.available_properties,
    available_reports: lifecycle.available_reports,
    matching_jobs: paths.length,
    matching_requests: new Set(paths.map((p) => p.request.id)).size,
    customer_options: [
      ...new Map(
        all.map((p) => [
          p.customer_id,
          { customer_id: p.customer_id, label: p.customer_label },
        ]),
      ).values(),
    ],
    property_options: [
      ...new Map(
        all.map((p) => [
          p.location_id,
          {
            location_id: p.location_id,
            customer_id: p.customer_id,
            label: p.property_label,
          },
        ]),
      ).values(),
    ],
    job_options: all.map((p) => ({
      job_id: p.job_id,
      customer_id: p.customer_id,
      location_id: p.location_id,
      label: p.scope_name,
      issued_version_number: p.issued_version_number,
    })),
    state_options: [...new Set(all.map((p) => p.request.status))],
    staff_paths: paths,
    coverage: 'AVAILABLE_ADMITTED_SOURCES_NOT_COMPLETE_HISTORY' as const,
    authority: 'READ_ONLY_SOURCE_EXPLORATION' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  views.set(view, b);
  return view;
}
export type ServicePassportView = Awaited<
  ReturnType<typeof readServicePassportDesk>
>;
export function assertServicePassportCurrentNow(view: ServicePassportView) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained service desk required');
  current(b);
}
interface DetailBinding {
  parent: Binding;
  lifecycle: ServiceLifecycleDetail;
}
const details = new WeakMap<object, DetailBinding>();
function detailCurrent(b: DetailBinding) {
  current(b.parent);
  try {
    assertServiceLifecycleDetailCurrentNow(b.lifecycle);
  } catch (error) {
    b.parent.held = true;
    throw error;
  }
}
export async function openServicePassportJob(
  view: ServicePassportView,
  jobId: string,
) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained service desk required');
  current(b);
  if (
    typeof jobId !== 'string' ||
    !view.staff_paths.some((p) => p.job_id === jobId)
  )
    throw Error('Exact visible service job required');
  try {
    const lifecycle = await openServiceLifecycleJob(b.lifecycle, jobId),
      binding = { parent: b, lifecycle };
    detailCurrent(binding);
    const entry = b.capture.entries.find((e) => e.target.job_id === jobId)!;
    const read = await readCustomerWorkflow(
      entry.customerModel,
      entry.target,
      {
        report_id: entry.report_id,
        published_version: entry.published_version,
      },
      b.gate,
    );
    detailCurrent(binding);
    if (
      read.status !== 'CURRENT' ||
      !read.timeline ||
      read.timeline.snapshot.customer_id !==
        lifecycle.customer_safe.property.customer_id ||
      read.timeline.snapshot.location_id !==
        lifecycle.customer_safe.property.location_id
    )
      throw Error('Exact existing Property Passport timeline required');
    const body = {
      mode: 'LOCAL_SERVICE_PASSPORT_SOURCE' as const,
      staff: lifecycle.staff.provenance,
      customer_safe: { ...lifecycle.customer_safe, timeline: read.timeline },
      return_selection: view.filters,
      inspection_meaning:
        'SAME_TAB_READING_ONLY_NOT_VERIFICATION_OR_APPROVAL' as const,
    };
    const sha256 = await documentHash(body);
    detailCurrent(binding);
    const detail = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    details.set(detail, binding);
    b.inspected.add(`job:${jobId}`);
    return detail;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export type ServicePassportDetail = Awaited<
  ReturnType<typeof openServicePassportJob>
>;
export function assertServicePassportDetailCurrentNow(
  detail: ServicePassportDetail,
) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained service source required');
  detailCurrent(b);
}
function referencePin(
  reference: PassportReportReference | PassportFindingReference,
  finding = false,
) {
  const fields = [
    'kind',
    'organization_id',
    'customer_id',
    'location_id',
    'report_id',
    'published_version',
    ...(finding ? ['finding_id', 'source_index'] : []),
  ];
  const p = prototypeFields(reference, fields);
  if (
    Object.keys(p).length !== fields.length ||
    p.kind !== (finding ? 'finding' : 'report') ||
    [
      'organization_id',
      'customer_id',
      'location_id',
      'report_id',
      ...(finding ? ['finding_id'] : []),
    ].some(
      (k) =>
        typeof p[k] !== 'string' ||
        !(p[k] as string).length ||
        (p[k] as string).length > 200,
    ) ||
    typeof p.published_version !== 'number' ||
    !Number.isSafeInteger(p.published_version) ||
    p.published_version < 1 ||
    (finding &&
      (typeof p.source_index !== 'number' ||
        !Number.isSafeInteger(p.source_index) ||
        p.source_index < 0))
  )
    throw Error('Exact own-data report/version/finding reference required');
  return JSON.stringify(Object.fromEntries(fields.map((key) => [key, p[key]])));
}
export async function openServicePassportReport(
  detail: ServicePassportDetail,
  reference: PassportReportReference,
) {
  assertServicePassportDetailCurrentNow(detail);
  const b = details.get(detail)!,
    signature = referencePin(reference);
  try {
    const report = await openServiceLifecycleReport(b.lifecycle, reference);
    detailCurrent(b);
    if (referencePin(reference) !== signature)
      throw Error('Original report reference changed');
    b.parent.inspected.add(`report:${signature}`);
    return report;
  } catch (error) {
    b.parent.held = true;
    throw error;
  }
}
/** Exact published position plus finding ID. No label matching or inferred repair. */
export async function openServicePassportFinding(
  detail: ServicePassportDetail,
  reference: PassportFindingReference,
) {
  assertServicePassportDetailCurrentNow(detail);
  const b = details.get(detail)!,
    signature = referencePin(reference, true),
    selected = JSON.parse(signature) as PassportFindingReference;
  try {
    const report = await openServicePassportReport(detail, {
      kind: 'report',
      organization_id: selected.organization_id,
      customer_id: selected.customer_id,
      location_id: selected.location_id,
      report_id: selected.report_id,
      published_version: selected.published_version,
    });
    if (referencePin(reference, true) !== signature)
      throw Error('Original finding reference changed');
    const finding = report.observations[selected.source_index];
    if (!finding || referencePin(finding.reference, true) !== signature)
      throw Error('Exact published finding position and identity required');
    const body = {
      mode: 'LOCAL_SERVICE_PASSPORT_FINDING' as const,
      report_reference: report.reference,
      finding,
      interpretation:
        'PUBLISHED_OBSERVATION_NOT_COMPLETION_VERIFICATION' as const,
    };
    const sha256 = await documentHash(body);
    detailCurrent(b);
    if (referencePin(reference, true) !== signature)
      throw Error('Original finding reference changed');
    const result = freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
    b.parent.inspected.add(`finding:${signature}`);
    return result;
  } catch (error) {
    b.parent.held = true;
    throw error;
  }
}
export function selectServicePassportJob(detail: ServicePassportDetail) {
  assertServicePassportDetailCurrentNow(detail);
  return selectServiceLifecycleJob(details.get(detail)!.lifecycle);
}
export function inspectServicePassportDesk(view: ServicePassportView) {
  try {
    assertServicePassportCurrentNow(view);
    return {
      status: 'CURRENT_READ_ONLY' as const,
      inspected_sources: views.get(view)!.inspected.size,
      meaning: 'READ_IN_THIS_TAB_NOT_VERIFIED' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    return {
      status: 'UNKNOWN' as const,
      inspected_sources: null,
      meaning: 'READ_IN_THIS_TAB_NOT_VERIFIED' as const,
      replay: false,
      replacement: null,
    };
  }
}
