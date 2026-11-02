import { documentHash } from '../../domain/release/preview';
import type { PassportReportReference } from '../../domain/property/passport';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  assertServiceContinuityCurrentNow,
  assertServiceContinuityDetailCurrentNow,
  readServiceContinuity,
  openServiceContinuityJob,
  openServiceContinuityReport,
  selectServiceContinuityJob,
  type ServiceContinuityInput,
  type ServiceContinuityView,
  type ServiceContinuityDetail,
} from './service-continuity';

export type ServiceLifecycleInput = ServiceContinuityInput;
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error(
      'Service lifecycle review is OFF without explicit local admission',
    );
}
function pin(input: ServiceLifecycleInput) {
  const p = prototypeFields(input, ['query', 'location_id', 'job_id']);
  if (
    Object.keys(p).length !== 3 ||
    typeof p.query !== 'string' ||
    p.query.length > 100 ||
    typeof p.location_id !== 'string' ||
    p.location_id.length > 200 ||
    typeof p.job_id !== 'string' ||
    p.job_id.length > 200
  )
    throw Error('Exact bounded literal lifecycle filters required');
  return { query: p.query, location_id: p.location_id, job_id: p.job_id };
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  original: ServiceLifecycleInput;
  signature: string;
  continuity: ServiceContinuityView;
  held: boolean;
}
const views = new WeakMap<object, Binding>();
function current(b: Binding) {
  if (b.held)
    throw Error('UNKNOWN lifecycle evidence is exact read only; no replay');
  try {
    if (JSON.stringify(pin(b.original)) !== b.signature)
      throw Error('Original lifecycle filters changed');
    b.capture.check();
    assertServiceContinuityCurrentNow(b.continuity);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
/** Staff-only navigation over actual request/receipt handles, never a lifecycle store. */
export async function readServiceLifecycleReview(
  sources: OperatingSources,
  input: ServiceLifecycleInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // Before source accessors, serializers or filter coercion.
  const selected = pin(input),
    capture = captureOperatingSources(sources, gate);
  const continuity = await readServiceContinuity(sources, input, gate);
  const b: Binding = {
    sources,
    capture,
    original: input,
    signature: JSON.stringify(selected),
    continuity,
    held: false,
  };
  current(b);
  const body = {
    mode: 'LOCAL_SERVICE_LIFECYCLE_REQUIREMENTS' as const,
    organization_id: continuity.organization_id,
    available_jobs: continuity.available_jobs,
    available_properties: continuity.available_properties,
    available_reports: continuity.available_reports,
    matching_jobs: continuity.matching_jobs,
    property_options: continuity.property_options,
    job_options: continuity.job_options,
    filters: selected,
    staff_paths: continuity.paths,
    coverage: 'PREPARED_AUTHORIZED_HANDLES_ONLY' as const,
    physical_completion: 'UNKNOWN' as const,
    customer_acceptance: 'UNKNOWN' as const,
    warranty: 'UNKNOWN' as const,
    authority: 'READ_ONLY_REQUIREMENTS_NO_OPERATIONAL_PASS' as const,
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
export type ServiceLifecycleView = Awaited<
  ReturnType<typeof readServiceLifecycleReview>
>;
export function assertServiceLifecycleCurrentNow(view: ServiceLifecycleView) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained lifecycle view required');
  current(b);
}
interface DetailBinding {
  parent: Binding;
  continuity: ServiceContinuityDetail;
}
const details = new WeakMap<object, DetailBinding>();
function detailCurrent(b: DetailBinding) {
  current(b.parent);
  try {
    assertServiceContinuityDetailCurrentNow(b.continuity);
  } catch (error) {
    b.parent.held = true;
    throw error;
  }
}
/** Requirements describe missing proof. They never attest that work happened. */
export async function openServiceLifecycleJob(
  view: ServiceLifecycleView,
  jobId: string,
) {
  const b = views.get(view);
  if (!b) throw Error('Exact retained lifecycle view required');
  current(b);
  if (
    typeof jobId !== 'string' ||
    !view.staff_paths.some((p) => p.job_id === jobId)
  )
    throw Error('Exact visible lifecycle job required');
  try {
    return await buildLifecycleJob(b, jobId);
  } catch (error) {
    b.held = true;
    throw error;
  }
}
async function buildLifecycleJob(b: Binding, jobId: string) {
  const continuity = await openServiceContinuityJob(b.continuity, jobId);
  const binding = { parent: b, continuity };
  detailCurrent(binding);
  const entry = b.capture.entries.find((e) => e.target.job_id === jobId);
  if (!entry) throw Error('Original lifecycle handle required');
  const state = b.sources.property.read(b.capture.organization_id),
    plan = state.plans.find((p) => p.id === entry.plan_id),
    scheduled = state.visits.find((v) => v.id === entry.scheduled_visit_id),
    published = state.visits.find((v) => v.id === entry.visit_id),
    safe = continuity.customer_safe.property_passport,
    scope = safe.jobs.find((j) => j.job_id === jobId);
  if (!plan || !scheduled || !published || !scope)
    throw Error('Exact recorded plan, visit and issued scope required');
  const body = {
    mode: 'LOCAL_SERVICE_LIFECYCLE_JOB_REQUIREMENTS' as const,
    staff: {
      provenance: continuity.staff,
      workflow_facts: {
        request_status: continuity.staff.request.status,
        estimate_status: 'issued' as const,
        job_record: 'EXACT_ISSUED_JOB_RECORDED' as const,
        job_workflow_status: 'UNKNOWN_NOT_RECORDED_BY_SOURCE' as const,
        plan: {
          id: plan.id,
          revision: plan.revision,
          cadence: plan.cadence,
          starts_on: plan.starts_on,
          timezone: plan.timezone,
          job_id: plan.job_id,
        },
        scheduled_visit: {
          id: scheduled.id,
          plan_id: scheduled.plan_id,
          revision: scheduled.revision,
          date: scheduled.visited_on,
          phase: scheduled.phase,
          status: scheduled.status,
        },
        published_visit: {
          id: published.id,
          plan_id: published.plan_id,
          revision: published.revision,
          date: published.visited_on,
          phase: published.phase,
          status: published.status,
        },
        date_precision: 'DATE_ONLY_AVAILABILITY_UNKNOWN' as const,
        dispatch: 'NOT_AUTHORIZED' as const,
      },
      suggestions: [
        'Inspect the exact issued scope and each recorded report before reviewing missing verification evidence.',
        'Obtain separately authorized, scope-specific verification and customer acceptance evidence; no proof is created by this review.',
      ],
      suggestion_authority: 'STAFF_REVIEW_SUGGESTIONS_ONLY' as const,
    },
    customer_safe: {
      contractor: safe.contractor,
      property: {
        organization_id: safe.organization_id,
        customer_id: safe.customer_id,
        location_id: safe.location_id,
        label: safe.property_label,
      },
      scope: {
        job_id: scope.job_id,
        estimate_id: scope.estimate_id,
        issued_version_id: scope.issued_version_id,
        issued_version_number: scope.issued_version_number,
        issued_source_sha256:
          continuity.customer_safe.selected_documentation.job.reference
            .issued_source_sha256,
        name: scope.name,
        description: scope.description,
        lines: scope.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity_milli: l.quantity_milli,
          unit: l.unit,
          verified_completion_match: 'UNKNOWN' as const,
        })),
      },
      passport: safe,
      documentation: safe.reports.map((r) => ({
        report: r.report,
        sha256: r.sha256,
        selected_job_association:
          r.association === 'EXACT_RECORDED_LINK' &&
          r.linked_job_ids.length === 1 &&
          r.linked_job_ids[0] === jobId
            ? ('EXACT_RECORDED_JOB_LINK' as const)
            : ('UNKNOWN' as const),
        interpretation:
          'PUBLISHED_OBSERVATIONS_AND_RECOMMENDATIONS_ONLY' as const,
      })),
      required_proof: [
        {
          kind: 'SCOPE_VERIFICATION',
          status: 'UNKNOWN',
          required:
            'Independent scope-line and quantity verification tied to this exact job and immutable issued version.',
          evidence: 'NOT_AVAILABLE_IN_EXISTING_SOURCES',
        },
        {
          kind: 'PHYSICAL_COMPLETION',
          status: 'UNKNOWN',
          required:
            'Authorized physical completion verification with exact job, scope, verifier and verification date evidence.',
          evidence: 'NOT_AVAILABLE_IN_EXISTING_SOURCES',
        },
        {
          kind: 'CUSTOMER_ACCEPTANCE',
          status: 'UNKNOWN',
          required:
            'Genuine customer acceptance evidence tied to the exact completed scope; LOCAL-TEST preferences do not supply it.',
          evidence: 'NOT_AVAILABLE_IN_EXISTING_SOURCES',
        },
        {
          kind: 'WARRANTY',
          status: 'UNKNOWN',
          required:
            'Applicable reviewed warranty terms and separately verified scope-specific eligibility evidence.',
          evidence: 'NOT_AVAILABLE_IN_EXISTING_SOURCES',
        },
      ] as const,
      physical_completion: 'UNKNOWN' as const,
      customer_acceptance: 'UNKNOWN' as const,
      warranty: 'UNKNOWN' as const,
      history_completeness: 'UNKNOWN' as const,
      media: 'UNAVAILABLE_NOT_VERIFICATION' as const,
      interpretation:
        'Photos, recorded checkmarks, after phase and absence of findings do not verify physical completion, customer acceptance or warranty.',
      authority: 'READ_ONLY_REQUIREMENTS_NO_OPERATIONAL_PASS' as const,
    },
  };
  const sha256 = await documentHash(body);
  detailCurrent(binding);
  const detail = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  details.set(detail, binding);
  return detail;
}
export type ServiceLifecycleDetail = Awaited<
  ReturnType<typeof openServiceLifecycleJob>
>;
export function assertServiceLifecycleDetailCurrentNow(
  detail: ServiceLifecycleDetail,
) {
  const b = details.get(detail);
  if (!b) throw Error('Exact retained lifecycle detail required');
  detailCurrent(b);
}
function reportPin(reference: PassportReportReference) {
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
    throw Error('Exact own-data published report reference required');
  return JSON.stringify(p);
}
/** Inspect an exact original published version; job navigation is a separate action. */
export async function openServiceLifecycleReport(
  detail: ServiceLifecycleDetail,
  reference: PassportReportReference,
) {
  assertServiceLifecycleDetailCurrentNow(detail);
  const b = details.get(detail)!,
    signature = reportPin(reference);
  try {
    const report = await openServiceContinuityReport(b.continuity, reference);
    detailCurrent(b);
    if (reportPin(reference) !== signature)
      throw Error('Original report reference changed');
    return report;
  } catch (error) {
    b.parent.held = true;
    throw error;
  }
}
export function selectServiceLifecycleJob(detail: ServiceLifecycleDetail) {
  assertServiceLifecycleDetailCurrentNow(detail);
  return selectServiceContinuityJob(details.get(detail)!.continuity);
}
export function inspectServiceLifecycle(view: ServiceLifecycleView) {
  try {
    assertServiceLifecycleCurrentNow(view);
    return {
      status: 'CURRENT_REQUIREMENTS_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    return { status: 'UNKNOWN' as const, replay: false, replacement: null };
  }
}
