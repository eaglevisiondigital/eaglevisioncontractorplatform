import type { PropertyRepository } from '../property';
import {
  readFieldWorkOrders,
  fieldWorkOrderBinding,
  type WorkOrder,
} from '../field-work-orders';
import { readTechnicianDayBoard } from '../field-day-board';
import { fieldSchedulingPreviewEnabled } from '../field-scheduling';
import { capacityDay } from '../../domain/field/crew-capacity';
import { projectPublishedHistory } from '../../domain/property/report-page';
import { documentHash } from '../../domain/release/preview';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  prototypeFields,
  freezePrototype,
  type PrototypeSource,
  type PrototypeTarget,
  type PrototypeAdmission,
} from '../program/prototype-source';

export const fieldWorkflowEnabled = fieldSchedulingPreviewEnabled;
export interface FieldWorkflowInput {
  day: string;
  timezone: string;
}
export interface FieldReportReference {
  report_id: string;
  published_version: number;
}
/** Navigation context only. The destination must independently admit its own sources. */
export interface FieldWorkflowHandoff extends FieldReportReference {
  organization_id: string;
  customer_id: string;
  location_id: string;
  job_id: string;
  estimate_id: string;
  issued_version_id: string;
  issued_version_number: number;
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 200)
    throw Error('Exact primitive Field identity required');
  return value;
}
function pinTarget(input: PrototypeTarget) {
  const names = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'job_id',
    'estimate_id',
    'version_id',
  ];
  const value = prototypeFields(input, names);
  if (Object.keys(value).length !== names.length)
    throw Error('Exact Field target required');
  for (const name of names) text(value[name]);
  return value as unknown as PrototypeTarget & { job_id: string };
}
function pinInput(input: FieldWorkflowInput) {
  const value = prototypeFields(input, ['day', 'timezone']);
  const day = text(value.day),
    timezone = text(value.timezone);
  capacityDay(day, timezone);
  return { day, timezone };
}
function gateNow(gate: PrototypeAdmission) {
  const value = prototypeFields(gate, ['enabled', 'confirmed']);
  if (value.enabled !== true || value.confirmed !== true)
    throw Error('Field workflow is OFF without current explicit confirmation');
}
function pinReport(input: FieldReportReference) {
  const value = prototypeFields(input, ['report_id', 'published_version']);
  const report_id = text(value.report_id),
    published_version = value.published_version;
  if (
    typeof published_version !== 'number' ||
    !Number.isSafeInteger(published_version) ||
    published_version < 1
  )
    throw Error('Exact published report version required');
  return { report_id, published_version };
}
function fieldSource(
  repo: PropertyRepository,
  t: PrototypeTarget & { job_id: string },
  order: WorkOrder,
) {
  fieldWorkOrderBinding(repo, t.organization_id, t.actor_id, order);
  if (
    order.source.job_id !== t.job_id ||
    order.source.estimate_id !== t.estimate_id ||
    order.source.issued_version_id !== t.version_id ||
    order.customer.id !== t.customer_id ||
    order.baseline_property?.id !== t.location_id
  )
    throw Error(
      'Exact Field job/customer/property/issued baseline unavailable',
    );
  const job = repo.estimates.syntheticJob(t.organization_id, t.job_id);
  if (
    !job ||
    job.lock_revision !== order.source.job_revision ||
    job.baseline.issued_version_id !== t.version_id
  )
    throw Error('Current exact job revision changed');
  const state = repo.read(t.organization_id),
    assignments = repo.estimates
      .syntheticJobAssignments(t.organization_id, t.actor_id)
      .filter((a) => a.job_id === t.job_id);
  const active = assignments.filter((a) => a.active),
    members = repo.operations.syntheticMemberships(t.organization_id);
  if (
    active.length !== order.crew.length ||
    active.some((a) => !order.crew.some((w) => w.user_id === a.user_id))
  )
    throw Error('Current Field crew relationship changed');
  for (const worker of order.crew)
    if (
      !members.some(
        (m) =>
          m.user_id === worker.user_id &&
          m.active &&
          (['owner', 'admin'].includes(m.role) ||
            (m.role === 'staff' &&
              ['field_staff', 'office_manager'].includes(m.staff_type))),
      )
    )
      throw Error('Current Field technician unavailable');
  repo.operations.syntheticProperty(
    t.organization_id,
    t.customer_id,
    t.location_id,
  );
  const plans = state.plans.filter((p) => p.job_id === t.job_id);
  if (
    plans.some(
      (p) =>
        p.organization_id !== t.organization_id ||
        p.customer_id !== t.customer_id ||
        p.location_id !== t.location_id,
    ) ||
    new Set(plans.map((p) => p.id)).size !== plans.length
  )
    throw Error('Exact job plan association UNKNOWN');
  const visits = state.visits.filter((v) =>
    plans.some((p) => p.id === v.plan_id),
  );
  if (
    new Set(visits.map((v) => v.id)).size !== visits.length ||
    visits.some((v) => v.organization_id !== t.organization_id)
  )
    throw Error('Exact job visit association UNKNOWN');
  for (const original of order.visits) {
    const v = visits.find((v) => v.id === original.id),
      p = plans.find((p) => p.id === original.plan_id);
    if (
      !v ||
      !p ||
      v.revision !== original.revision ||
      p.revision !== original.plan_revision ||
      v.visited_on !== original.date ||
      p.timezone !== original.timezone
    )
      throw Error('Current Field visit or plan changed');
  }
  if (visits.length !== order.visits.length)
    throw Error('Current Field visit coverage changed');
  const reports = state.reports.filter((r) =>
    visits.some((v) => v.id === r.visit_id),
  );
  if (
    new Set(reports.map((r) => JSON.stringify([r.id, r.version]))).size !==
    reports.length
  )
    throw Error('Exact published report identity ambiguous');
  const projected = projectPublishedHistory(reports, {
    organization_id: t.organization_id,
    customer_id: t.customer_id,
    location_id: t.location_id,
  });
  const safeReports = projected.map((report) => {
    const original = reports.find(
      (r) => r.id === report.id && r.version === report.version,
    )!;
    const visit = visits.find((v) => v.id === original.visit_id)!,
      plan = plans.find((p) => p.id === visit.plan_id)!;
    return {
      report_id: report.id,
      published_version: report.version,
      published_at: report.published_at,
      visit_id: visit.id,
      plan_id: plan.id,
      job_id: t.job_id,
      snapshot: report.snapshot,
    };
  });
  return {
    fence: JSON.stringify({ plans, visits, reports, assignments }),
    reports: safeReports,
  };
}
const bindings = new WeakMap<
  object,
  {
    repo: PropertyRepository;
    target: PrototypeTarget & { job_id: string };
    originalTarget: PrototypeTarget;
    originalInput: FieldWorkflowInput;
    inputSignature: string;
    targetSignature: string;
    gate: PrototypeAdmission;
    source: PrototypeSource;
    order: WorkOrder;
    fence: string;
  }
>();
function checkLive(binding: NonNullable<ReturnType<typeof bindings.get>>) {
  gateNow(binding.gate);
  if (
    JSON.stringify(pinTarget(binding.originalTarget)) !==
      binding.targetSignature ||
    JSON.stringify(pinInput(binding.originalInput)) !== binding.inputSignature
  )
    throw Error('Field selection changed');
  assertPrototypeSourceCurrentNow(binding.source);
  if (
    fieldSource(binding.repo, binding.target, binding.order).fence !==
    binding.fence
  )
    throw Error('Field evidence changed');
}
/** Reads existing repositories only. No scheduling, assignment, report or completion write. */
export async function readFieldWorkflow(
  repo: PropertyRepository,
  target: PrototypeTarget,
  input: FieldWorkflowInput,
  gate: PrototypeAdmission = {},
) {
  gateNow(gate);
  const t = pinTarget(target),
    request = pinInput(input),
    targetSignature = JSON.stringify(t),
    inputSignature = JSON.stringify(request);
  const currentInput = () => {
    gateNow(gate);
    if (
      JSON.stringify(pinTarget(target)) !== targetSignature ||
      JSON.stringify(pinInput(input)) !== inputSignature
    )
      throw Error('Field selection changed');
  };
  const source = await readPrototypeSource(repo.estimates, t, gate);
  currentInput();
  const model = await readFieldWorkOrders(repo, t.organization_id, t.actor_id);
  currentInput();
  const orders = model.orders.filter((o) => o.source.job_id === t.job_id);
  if (orders.length !== 1) throw Error('Exact current work order unavailable');
  const order = orders[0],
    initial = fieldSource(repo, t, order);
  const board = await readTechnicianDayBoard(
    repo,
    t.organization_id,
    t.actor_id,
    { ...request, worker_id: '', proposal: null },
  );
  currentInput();
  const selectedCrew = board.lanes
    .filter((lane) => order.crew.some((w) => w.worker_id === lane.worker_id))
    .map((lane) => ({
      worker_id: lane.worker_id,
      label: lane.label,
      events: lane.events.filter((event) => event.job_id === t.job_id),
      actual_availability: lane.actual_availability,
    }));
  const body = {
    mode: 'LOCAL_SYNTHETIC_FIELD_REVIEW' as const,
    source: {
      organization_id: t.organization_id,
      customer_id: t.customer_id,
      location_id: t.location_id,
      job_id: t.job_id,
      estimate_id: t.estimate_id,
      issued_version_id: t.version_id,
      issued_version_number: order.source.issued_version_number,
      job_revision: order.source.job_revision,
      source_sha256: source.sha256,
    },
    job: {
      title: order.title,
      customer_label: order.customer.label,
      property_label: order.baseline_property!.label,
      scope: order.scope,
      crew: order.crew,
      assignment_state: order.assignment_state,
    },
    day: {
      ...request,
      civil_day_minutes: board.civil_day_minutes,
      crew: selectedCrew,
      timing: 'RECORDED_EVIDENCE_ONLY' as const,
      actual_availability: 'UNKNOWN' as const,
      proposed_hours: 'NOT_SUPPLIED' as const,
      capacity: 'UNKNOWN' as const,
    },
    published_reports: initial.reports,
    history_coverage: 'AVAILABLE_EXACT_JOB_LINKED_RECORDS_ONLY' as const,
    physical_completion: 'UNVERIFIED' as const,
    authority: {
      assign: false,
      schedule: false,
      dispatch: false,
      publish: false,
      communicate: false,
      financial: false,
      hosted: false,
    },
  };
  const sha256 = await documentHash(body);
  currentInput();
  await assertPrototypeSourceCurrent(source);
  currentInput();
  const binding = {
    repo,
    target: t,
    originalTarget: target,
    originalInput: input,
    inputSignature,
    targetSignature,
    gate,
    source,
    order,
    fence: initial.fence,
  };
  checkLive(binding); // Final synchronous current-source fence; no await follows.
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256', sha256 },
  });
  bindings.set(view, binding);
  return view;
}
export type FieldWorkflowView = Awaited<ReturnType<typeof readFieldWorkflow>>;
export async function verifyFieldWorkflow(view: FieldWorkflowView) {
  const binding = bindings.get(view);
  if (!binding) return { status: 'UNKNOWN' as const, replacement: null };
  try {
    checkLive(binding);
    await assertPrototypeSourceCurrent(binding.source);
    checkLive(binding);
    return { status: 'CURRENT' as const, replacement: null };
  } catch {
    return { status: 'UNKNOWN' as const, replacement: null };
  }
}
export async function openFieldWorkflowReport(
  view: FieldWorkflowView,
  reference: FieldReportReference,
) {
  const binding = bindings.get(view);
  if (!binding) throw Error('Exact retained Field workflow required');
  const selected = pinReport(reference),
    signature = JSON.stringify(selected);
  if ((await verifyFieldWorkflow(view)).status !== 'CURRENT')
    throw Error('Field evidence UNKNOWN; reload exact sources');
  if (JSON.stringify(pinReport(reference)) !== signature)
    throw Error('Report selection changed');
  const reports = view.published_reports.filter(
    (r) =>
      r.report_id === selected.report_id &&
      r.published_version === selected.published_version,
  );
  if (reports.length !== 1)
    throw Error('Exact displayed report/version required');
  const handoff: FieldWorkflowHandoff = {
    ...selected,
    organization_id: view.source.organization_id,
    customer_id: view.source.customer_id,
    location_id: view.source.location_id,
    job_id: view.source.job_id,
    estimate_id: view.source.estimate_id,
    issued_version_id: view.source.issued_version_id,
    issued_version_number: view.source.issued_version_number,
  };
  checkLive(binding);
  return freezePrototype({
    report: reports[0],
    handoff,
    authority: 'NAVIGATION_ONLY' as const,
  });
}
