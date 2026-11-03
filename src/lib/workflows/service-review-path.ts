import { documentHash } from '../../domain/release/preview';
import type {
  PassportReportReference,
  PassportFindingReference,
} from '../../domain/property/passport';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readServicePassportDesk,
  assertServicePassportCurrentNow,
  type ServicePassportView,
} from './service-passport-desk';
import {
  readServiceSourceContinuity,
  assertServiceSourceContinuityCurrentNow,
  openServiceSourceReport,
  openServiceSourceFinding,
  selectServiceSourceJob,
  type ServiceSourceRead,
} from './service-source-continuity';
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (p.enabled !== true || p.confirmed !== true)
    throw Error('Service review path is OFF without explicit local admission');
}
interface RequestBinding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  capture: ReturnType<typeof captureOperatingSources>;
  desk: ServicePassportView;
  held: boolean;
}
const requests = new WeakMap<object, RequestBinding>();
function current(b: RequestBinding) {
  if (b.held)
    throw Error(
      'UNKNOWN service request evidence is exact read only; no replacement',
    );
  try {
    admit(b.gate);
    b.capture.check();
    assertServicePassportCurrentNow(b.desk);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Existing actual request identities and admitted job contexts; no request/job FK is invented. */
export async function readServiceReviewRequests(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const capture = captureOperatingSources(sources, gate),
    desk = await readServicePassportDesk(
      sources,
      { query: '', customer_id: '', location_id: '', job_id: '', state: '' },
      gate,
    ),
    b: RequestBinding = { sources, gate, capture, desk, held: false };
  current(b);
  type Path = ServicePassportView['staff_paths'][number];
  const grouped = new Map<
    string,
    {
      request: Path['request'];
      customer_id: string;
      customer_label: string;
      location_id: string;
      property_label: string;
      jobs: {
        job_id: string;
        name: string;
        issued_version_id: string;
        issued_version_number: number;
      }[];
    }
  >();
  for (const p of desk.staff_paths) {
    let group = grouped.get(p.request.id);
    if (!group) {
      group = {
        request: p.request,
        customer_id: p.customer_id,
        customer_label: p.customer_label,
        location_id: p.location_id,
        property_label: p.property_label,
        jobs: [],
      };
      grouped.set(p.request.id, group);
    }
    if (
      group.customer_id !== p.customer_id ||
      group.location_id !== p.location_id ||
      JSON.stringify(group.request) !== JSON.stringify(p.request)
    )
      throw Error('Ambiguous original request/customer/property identity');
    if (group.jobs.some((j) => j.job_id === p.job_id))
      throw Error('Ambiguous original job context');
    group.jobs.push({
      job_id: p.job_id,
      name: p.scope_name,
      issued_version_id: p.issued_version_id,
      issued_version_number: p.issued_version_number,
    });
  }
  const body = {
    mode: 'LOCAL_SERVICE_REQUEST_REVIEW_PATH' as const,
    organization_id: desk.organization_id,
    requests: [...grouped.values()],
    available_requests: grouped.size,
    available_job_contexts: desk.available_jobs,
    request_job_relationship:
      'UNKNOWN_NO_RECORDED_FK_IN_CURRENT_SOURCE_CONTRACT' as const,
    coverage: 'ADMITTED_EXISTING_SOURCE_HANDLES_NOT_COMPLETE_HISTORY' as const,
    authority: 'READ_ONLY_STAFF_CONTEXT_SELECTION' as const,
  };
  const sha256 = await documentHash(body);
  current(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  requests.set(view, b);
  return view;
}
export type ServiceReviewRequests = Awaited<
  ReturnType<typeof readServiceReviewRequests>
>;
export function assertServiceReviewRequestsCurrent(
  view: ServiceReviewRequests,
) {
  const b = requests.get(view);
  if (!b) throw Error('Exact retained service request selection required');
  current(b);
}
/** Presentation hint is independently checked against this exact admitted request view. */
export function selectServiceReviewContext(
  view: ServiceReviewRequests,
  jobId?: string,
) {
  assertServiceReviewRequestsCurrent(view);
  if (
    jobId !== undefined &&
    (typeof jobId !== 'string' || !jobId || jobId.length > 200)
  )
    throw Error('Exact selected job hint required');
  const matches = view.requests.flatMap((group) =>
    group.jobs
      .filter((job) => jobId === undefined || job.job_id === jobId)
      .map((job) => ({ request_id: group.request.id, job_id: job.job_id })),
  );
  if (jobId !== undefined && matches.length !== 1)
    throw Error('Selected job unavailable or ambiguous');
  return matches[0] ?? null;
}
export interface ServiceReviewContext {
  request_id: string;
  job_id: string;
  staff_context_confirmed: boolean;
}
function pin(input: ServiceReviewContext) {
  const p = prototypeFields(input, [
    'request_id',
    'job_id',
    'staff_context_confirmed',
  ]);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.request_id !== 'string' ||
    !p.request_id ||
    p.request_id.length > 200 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200 ||
    p.staff_context_confirmed !== true
  )
    throw Error(
      'Explicit exact request and staff-selected job context required',
    );
  return {
    request_id: p.request_id,
    job_id: p.job_id,
    staff_context_confirmed: true,
  };
}
interface PathBinding {
  parent: RequestBinding;
  view: ServiceReviewRequests;
  input: ServiceReviewContext;
  signature: string;
  source: ServiceSourceRead;
  held: boolean;
}
const paths = new WeakMap<object, PathBinding>();
function pathCurrent(b: PathBinding) {
  if (b.held)
    throw Error('UNKNOWN service path permits exact retained read only');
  try {
    current(b.parent);
    if (JSON.stringify(pin(b.input)) !== b.signature)
      throw Error('Original staff context changed');
    assertServiceSourceContinuityCurrentNow(b.source);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export async function openServiceReviewPath(
  view: ServiceReviewRequests,
  input: ServiceReviewContext,
) {
  const parent = requests.get(view);
  if (!parent) throw Error('Exact retained service request selection required');
  current(parent);
  const selected = pin(input),
    group = view.requests.find((g) => g.request.id === selected.request_id),
    job = group?.jobs.find((j) => j.job_id === selected.job_id);
  if (!group || !job)
    throw Error('Exact visible request and authorized job context required');
  const source = await readServiceSourceContinuity(
      parent.sources,
      { job_id: job.job_id },
      parent.gate,
    ),
    b: PathBinding = {
      parent,
      view,
      input,
      signature: JSON.stringify(selected),
      source,
      held: false,
    };
  pathCurrent(b);
  if (
    source.staff_request.id !== group.request.id ||
    source.customer_safe.property.customer_id !== group.customer_id ||
    source.customer_safe.property.location_id !== group.location_id ||
    source.customer_safe.scope.job_id !== job.job_id ||
    source.customer_safe.scope.issued_version_id !== job.issued_version_id
  )
    throw Error(
      'Exact request/customer/property/job/issued continuity required',
    );
  const body = {
    mode: 'LOCAL_EXACT_SERVICE_REVIEW_PATH' as const,
    request: source.staff_request,
    context: {
      request_id: selected.request_id,
      job_id: selected.job_id,
      relationship: 'EXPLICIT_STAFF_SELECTED_CONTEXT' as const,
      recorded_request_job_link:
        'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT' as const,
    },
    recorded_job_scope: {
      job_id: job.job_id,
      issued_version_id: job.issued_version_id,
      meaning: 'EXACT_RECORDED_ISSUED_JOB_BASELINE' as const,
    },
    customer_label: source.customer_label,
    customer_safe: source.customer_safe,
    return_context: {
      request_id: selected.request_id,
      job_id: selected.job_id,
    },
    authority:
      'READ_ONLY_EVIDENCE_NOT_PHYSICAL_COMPLETION_OR_ACCEPTANCE' as const,
  };
  const sha256 = await documentHash(body);
  pathCurrent(b);
  const path = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  paths.set(path, b);
  return path;
}
export type ServiceReviewPathRead = Awaited<
  ReturnType<typeof openServiceReviewPath>
>;
function binding(path: ServiceReviewPathRead) {
  const b = paths.get(path);
  if (!b) throw Error('Exact retained service review path required');
  pathCurrent(b);
  return b;
}
export function assertServiceReviewPathCurrent(path: ServiceReviewPathRead) {
  binding(path);
}
export async function openServiceReviewReport(
  path: ServiceReviewPathRead,
  reference: PassportReportReference,
) {
  const b = binding(path);
  try {
    const report = await openServiceSourceReport(b.source, reference);
    pathCurrent(b);
    return report;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export async function openServiceReviewFinding(
  path: ServiceReviewPathRead,
  reference: PassportFindingReference,
) {
  const b = binding(path);
  try {
    const finding = await openServiceSourceFinding(b.source, reference);
    pathCurrent(b);
    return finding;
  } catch (error) {
    b.held = true;
    throw error;
  }
}
export function returnServiceReviewRequest(path: ServiceReviewPathRead) {
  const b = binding(path);
  return { view: b.view, selection: path.return_context };
}
export function selectServiceReviewJob(path: ServiceReviewPathRead) {
  return selectServiceSourceJob(binding(path).source);
}
export function inspectServiceReviewPath(path: ServiceReviewPathRead) {
  try {
    binding(path);
    return {
      status: 'CURRENT_EXACT_READ_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    return { status: 'UNKNOWN' as const, replay: false, replacement: null };
  }
}
