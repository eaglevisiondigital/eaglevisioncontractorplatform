import type { PassportReportReference } from '../../domain/property/passport';
import { prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  serviceCompletionGuideEnabled,
  readServiceCompletionGuide,
  assertServiceCompletionGuideCurrent,
  selectServiceCompletionContext,
  openServiceCompletionContext,
  assertServiceCompletionContextCurrent,
  openServiceCompletionReport,
  type ServiceCompletionContext,
} from './service-completion-guide';
import {
  readPropertyServiceContinuity,
  assertPropertyServiceContinuity,
  inspectPropertyServiceJob,
  readPropertyServiceVersionStatus,
  type PropertyServiceContinuityView,
} from './property-service-continuity';
import { inspectPublishedServiceReport } from './published-service-navigation';

export const serviceSourceReviewEnabled = serviceCompletionGuideEnabled;
export interface ServiceSourceReviewInput {
  job_id: string;
  staff_context_confirmed: boolean;
}
/** Original reader handles only. No copied business state, archive, command
 * custody, snapshot hash, attempt registry or restoration adapter is added. */
export interface ServiceSourceRead {
  readonly context: ServiceCompletionContext;
  readonly property: PropertyServiceContinuityView;
}
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !serviceSourceReviewEnabled(true)
  )
    throw Error(
      'Service source review is OFF without explicit local admission',
    );
}
function pin(input: ServiceSourceReviewInput) {
  const p = prototypeFields(input, ['job_id', 'staff_context_confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200 ||
    p.staff_context_confirmed !== true
  )
    throw Error('Exact retained job and explicit staff context required');
  return p.job_id;
}
/** Original guide owns stale/UNKNOWN custody; original C22 reader owns property
 * access and published immutability. This consumer creates no competing hold. */
function captureServiceSourceReview(view: ServiceSourceRead) {
  const p = prototypeFields(view, ['context', 'property']);
  if (Object.keys(p).length !== 2)
    throw Error('The two original service reader handles are required');
  const context = p.context as ServiceCompletionContext,
    property = p.property as PropertyServiceContinuityView;
  assertServiceCompletionContextCurrent(context);
  assertPropertyServiceContinuity(property);
  const job = inspectPropertyServiceJob(property, property.selected_job_id),
    scope = context.customer_safe.scope,
    location = context.customer_safe.property;
  if (
    context.context.job_id !== property.selected_job_id ||
    context.recorded_job_scope.job_id !== property.selected_job_id ||
    scope.job_id !== job.context.job_id ||
    scope.estimate_id !== job.context.estimate_id ||
    scope.issued_version_id !== job.context.issued_version_id ||
    location.organization_id !== property.organization_id ||
    location.customer_id !== property.customer_id ||
    location.location_id !== property.location_id ||
    job.history.request_id !== context.request.id ||
    context.context.recorded_request_job_link !== property.request_job_link
  )
    throw Error(
      'Exact original request context, property and issued job required',
    );
  return { context, property };
}
export function assertServiceSourceReview(view: ServiceSourceRead) {
  captureServiceSourceReview(view);
}
/** Explicitly selected staff context, not a recorded request-to-job FK. */
export async function readServiceSourceReview(
  sources: OperatingSources,
  input: ServiceSourceReviewInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<ServiceSourceRead> {
  admit(gate); // Before input/source getters.
  const job = pin(input),
    guide = await readServiceCompletionGuide(sources, gate);
  const check = () => {
    admit(gate);
    if (pin(input) !== job) throw Error('Original service selection changed');
    assertServiceCompletionGuideCurrent(guide);
  };
  check();
  const selected = selectServiceCompletionContext(guide, job);
  if (!selected) throw Error('Unique exact request/job context unavailable');
  const context = await openServiceCompletionContext(guide, {
    ...selected,
    staff_context_confirmed: true,
  });
  check();
  const property = await readPropertyServiceContinuity(sources, job, gate);
  check();
  const view = Object.freeze({ context, property });
  assertServiceSourceReview(view);
  return view;
}
/** An ephemeral drill-down over the original allowlisted readers. No FK is
 * inferred from a shared property, date, summary, finding label or request text. */
export function readServiceSourceLineage(view: ServiceSourceRead) {
  const { context, property } = captureServiceSourceReview(view),
    job = inspectPropertyServiceJob(property, property.selected_job_id);
  return Object.freeze({
    request: context.request,
    customer_label: context.customer_label,
    property: context.customer_safe.property,
    scope: context.customer_safe.scope,
    request_job_link: context.context.recorded_request_job_link,
    request_context: context.context.relationship,
    issued_job_link: 'EXACT_RECORDED_ISSUED_JOB_BASELINE' as const,
    reports: Object.freeze(
      job.history.reports.map((report) =>
        Object.freeze({
          reference: report.reference,
          visit_id: report.visit_id,
          plan_id: report.plan_id,
          job_id: job.context.job_id,
          summary: report.report.summary,
          sha256: report.sha256,
          relationship: 'EXACT_RECORDED_REPORT_VISIT_PLAN_JOB' as const,
          version: readPropertyServiceVersionStatus(
            property,
            job.context.job_id,
            report.reference,
          ),
        }),
      ),
    ),
    required_proof: context.customer_safe.required_proof,
    physical_completion: context.customer_safe.physical_completion,
    customer_acceptance: context.customer_safe.customer_acceptance,
    warranty: context.customer_safe.warranty,
    history_completeness: 'UNKNOWN' as const,
    authority: 'READ_ONLY_SOURCE_REVIEW_NOT_COMPLETION_OR_ACCEPTANCE' as const,
  });
}
/** Existing completion reader only, after membership in the exact original job
 * history is proven. A same-property report from another job is not substituted. */
export async function inspectServiceSourceReport(
  view: ServiceSourceRead,
  reference: PassportReportReference,
) {
  const { context, property } = captureServiceSourceReview(view);
  const job = inspectPropertyServiceJob(property, property.selected_job_id);
  inspectPublishedServiceReport(job.history, reference);
  const report = await openServiceCompletionReport(context, reference);
  assertServiceSourceReview({ context, property });
  if (
    report.selected_job_association !== 'EXACT_RECORDED_JOB_LINK' ||
    !report.completion ||
    report.completion.job.reference.job_id !== job.context.job_id ||
    report.completion.job.reference.issued_version_id !==
      job.context.issued_version_id
  )
    throw Error(
      'Exact original report/job completion requirements unavailable',
    );
  return report;
}
/** Inspect original readers only; never restore, retry, refresh or replace. */
export function reconcileServiceSourceReview(view: ServiceSourceRead) {
  try {
    assertServiceSourceReview(view);
    return {
      status: 'CURRENT_EXACT_READ_ONLY' as const,
      replay: false,
      replacement: null,
    };
  } catch {
    return { status: 'UNKNOWN' as const, replay: false, replacement: null };
  }
}
