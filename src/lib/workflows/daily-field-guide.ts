import { documentHash } from '../../domain/release/preview';
import {
  fieldWorkOrderBinding,
  readFieldWorkOrders,
} from '../field-work-orders';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import type { OperatingJobSection } from './operating-navigation';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFieldWorkflow,
  verifyFieldWorkflow,
  openFieldWorkflowReport,
  type FieldWorkflowView,
  type FieldReportReference,
} from './field-workflow';

export type DailyFieldStep = 'scope' | 'crew' | 'visits' | 'reports';
export interface DailyFieldSelection {
  job_id: string;
  worker_id: string;
}
function admit(gate: JourneyAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Explicit daily field source review required');
}
function selection(input: DailyFieldSelection) {
  const p = prototypeFields(input, ['job_id', 'worker_id']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.job_id !== 'string' ||
    !p.job_id ||
    p.job_id.length > 200 ||
    typeof p.worker_id !== 'string' ||
    p.worker_id.length > 200
  )
    throw Error('Exact daily field job and technician selection required');
  return { job_id: p.job_id, worker_id: p.worker_id };
}
interface Binding {
  sources: OperatingSources;
  capture: ReturnType<typeof captureOperatingSources>;
  field: FieldWorkflowView;
  gate: JourneyAdmission;
  input: DailyFieldSelection;
  signature: string;
  unknown: boolean;
}
// Reader handles only. No task, assignment, timer, completion or operational store.
const retained = new WeakMap<object, Binding>();
function current(b: Binding) {
  try {
    admit(b.gate);
    b.capture.check();
    const job = b.sources.estimates.syntheticJob(
      b.field.source.organization_id,
      b.field.source.job_id,
    );
    if (
      b.unknown ||
      JSON.stringify(selection(b.input)) !== b.signature ||
      !job ||
      job.lock_revision !== b.field.source.job_revision ||
      job.baseline.issued_version_id !== b.field.source.issued_version_id
    )
      throw Error('Daily field evidence UNKNOWN');
    b.capture.check();
  } catch (error) {
    b.unknown = true;
    throw error;
  }
}
/** Read exact existing work-order/field evidence. Review labels are not operational task states. */
export async function readDailyFieldGuide(
  sources: OperatingSources,
  input: DailyFieldSelection,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // OFF before any source or selection getter.
  const picked = selection(input),
    signature = JSON.stringify(picked),
    capture = captureOperatingSources(sources, gate);
  const entries = capture.entries.filter(
    (e) => e.target.job_id === picked.job_id,
  );
  if (entries.length !== 1)
    throw Error('Exact daily field job unavailable; no fallback');
  const e = entries[0];
  const checkInput = () => {
    admit(gate);
    capture.check();
    if (JSON.stringify(selection(input)) !== signature)
      throw Error('Daily field selection changed');
    capture.check();
  };
  const field = await readFieldWorkflow(
    sources.property,
    e.target,
    { day: e.day, timezone: e.timezone },
    gate,
  );
  checkInput();
  const model = await readFieldWorkOrders(
    sources.property,
    capture.organization_id,
    capture.actor_id,
  );
  checkInput();
  const orders = model.orders.filter((o) => o.source.job_id === picked.job_id);
  if (orders.length !== 1) throw Error('Exact original work order unavailable');
  const order = orders[0];
  fieldWorkOrderBinding(
    sources.property,
    capture.organization_id,
    capture.actor_id,
    order,
  );
  if (
    order.source.issued_version_id !== field.source.issued_version_id ||
    order.source.job_revision !== field.source.job_revision ||
    order.customer.id !== field.source.customer_id ||
    order.baseline_property?.id !== field.source.location_id
  )
    throw Error('Exact work-order source mismatch');
  const crew = field.job.crew.filter(
    (w) => !picked.worker_id || w.worker_id === picked.worker_id,
  );
  if (picked.worker_id && crew.length !== 1)
    throw Error('Exact recorded technician unavailable');
  const visits = order.visits
    .filter((v) => v.date === e.day)
    .map((v) => ({
      visit_id: v.id,
      revision: v.revision,
      plan_id: v.plan_id,
      plan_revision: v.plan_revision,
      day: v.date,
      timezone: v.timezone,
      recorded_status: v.status,
    }));
  const body = {
    mode: 'LOCAL_DAILY_FIELD_GUIDE' as const,
    source: field.source,
    job: {
      title: field.job.title,
      customer_label: field.job.customer_label,
      property_label: field.job.property_label,
    },
    day: e.day,
    timezone: e.timezone,
    selected_worker_id: picked.worker_id || null,
    scope: field.job.scope,
    crew,
    visits,
    published_reports: field.published_reports.map((r) => ({
      report_id: r.report_id,
      published_version: r.published_version,
      visit_id: r.visit_id,
      plan_id: r.plan_id,
      job_id: r.job_id,
    })),
    steps: [
      {
        key: 'scope' as const,
        label: 'Review issued work scope',
        status: 'RECORDED_SCOPE' as const,
        reason:
          'Exact immutable issued baseline; review does not authorize extra work.',
      },
      {
        key: 'crew' as const,
        label: 'Review technician evidence',
        status: crew.length
          ? ('RECORDED_ASSIGNMENT' as const)
          : ('UNKNOWN' as const),
        reason:
          'Current recorded staff relationships; availability and time worked remain UNKNOWN.',
      },
      {
        key: 'visits' as const,
        label: 'Review daily visit evidence',
        status: visits.length
          ? ('RECORDED_VISITS' as const)
          : ('MISSING_EVIDENCE' as const),
        reason:
          'Draft, submitted or published describes the inspection record, never physical completion.',
      },
      {
        key: 'reports' as const,
        label: 'Review published source reports',
        status: field.published_reports.length
          ? ('AVAILABLE_DOCUMENTATION' as const)
          : ('MISSING_EVIDENCE' as const),
        reason:
          'Exact available job-linked versions only; missing reports never prove repair or complete history.',
      },
    ],
    actual_availability: 'UNKNOWN' as const,
    time_worked: 'NOT_INFERRED' as const,
    physical_completion: 'UNVERIFIED' as const,
    task_state: 'NO_OPERATIONAL_TASK_TRANSITION' as const,
    custody: 'SAME_TAB_REFERENCE_ONLY' as const,
    authority: {
      assign: false,
      schedule: false,
      dispatch: false,
      record_time: false,
      complete: false,
      financial: false,
      communicate: false,
      hosted: false,
    },
    original_field_sha256: field.integrity.sha256,
  };
  const sha256 = await documentHash(body);
  checkInput();
  if ((await verifyFieldWorkflow(field)).status !== 'CURRENT')
    throw Error('Original field evidence UNKNOWN');
  checkInput();
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(view, {
    sources,
    capture,
    field,
    gate,
    input,
    signature,
    unknown: false,
  });
  return view;
}
export type DailyFieldGuideView = Awaited<
  ReturnType<typeof readDailyFieldGuide>
>;
export function assertDailyFieldGuideNow(view: DailyFieldGuideView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained daily field guide required');
  current(b);
}
export async function reconcileDailyFieldGuide(view: DailyFieldGuideView) {
  const b = retained.get(view),
    result = {
      status: 'UNKNOWN' as 'UNKNOWN' | 'CURRENT_REVIEW_ONLY',
      replay: 'FORBIDDEN' as const,
      replacement: null,
    };
  if (!b) return result;
  try {
    current(b);
    if ((await verifyFieldWorkflow(b.field)).status !== 'CURRENT')
      throw Error('Original field evidence changed');
    current(b);
    return { ...result, status: 'CURRENT_REVIEW_ONLY' as const };
  } catch {
    b.unknown = true;
    return result;
  }
}
async function verified(view: DailyFieldGuideView) {
  if ((await reconcileDailyFieldGuide(view)).status !== 'CURRENT_REVIEW_ONLY')
    throw Error('Daily field source UNKNOWN; exact read only');
  assertDailyFieldGuideNow(view);
  return retained.get(view)!;
}
/** Inspect an original source projection, not a completion/assignment transition. */
export async function inspectDailyFieldStep(
  view: DailyFieldGuideView,
  step: DailyFieldStep,
) {
  await verified(view);
  if (!['scope', 'crew', 'visits', 'reports'].includes(step))
    throw Error('Exact displayed review step required');
  const detail = view.steps.find((s) => s.key === step)!;
  assertDailyFieldGuideNow(view);
  return freezePrototype({
    source: view.source,
    step: detail,
    scope: step === 'scope' ? view.scope : [],
    crew: step === 'crew' ? view.crew : [],
    visits: step === 'visits' ? view.visits : [],
    reports: step === 'reports' ? view.published_reports : [],
    completion: 'UNVERIFIED' as const,
    authority: 'READ_ONLY' as const,
  });
}
/** Presentation-only allowlist: the original reader still admits the exact report/version. */
export function dailyFieldReportReference(
  displayed: DailyFieldGuideView['published_reports'][number],
): FieldReportReference {
  const value = prototypeFields(displayed, [
    'report_id',
    'published_version',
    'visit_id',
    'plan_id',
    'job_id',
  ]);
  if (
    Object.keys(value).length !== 5 ||
    typeof value.report_id !== 'string' ||
    !value.report_id ||
    typeof value.published_version !== 'number' ||
    !Number.isSafeInteger(value.published_version) ||
    value.published_version < 1
  )
    throw Error('Exact displayed report reference required');
  return {
    report_id: value.report_id,
    published_version: value.published_version,
  };
}
export async function inspectDailyFieldReport(
  view: DailyFieldGuideView,
  reference: FieldReportReference,
) {
  const b = await verified(view);
  const result = await openFieldWorkflowReport(b.field, reference);
  assertDailyFieldGuideNow(view);
  return result;
}
export async function openDailyFieldControls(view: DailyFieldGuideView) {
  await verified(view);
  assertDailyFieldGuideNow(view);
  return view.source.job_id;
}
export async function navigateDailyFieldJob(
  view: DailyFieldGuideView,
  callback: (jobId: string, section?: OperatingJobSection) => void,
) {
  await verified(view);
  assertDailyFieldGuideNow(view); // No await between final source fence and navigation.
  callback(view.source.job_id, 'field');
}
