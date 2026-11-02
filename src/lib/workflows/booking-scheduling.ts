import { PropertyRepository } from '../property';
import {
  readFieldWorkOrders,
  fieldWorkOrderBinding,
  type WorkOrder,
} from '../field-work-orders';
import { reviewCrewDayCapacity } from '../field-crew-capacity';
import {
  reviewOperationsExperiments,
  reconcileOperationsExperiment,
} from '../operations-experiments';
import {
  capacityDay,
  capacityLocalInstant,
} from '../../domain/field/crew-capacity';
import { documentHash } from '../../domain/release/preview';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  prototypeFields,
  freezePrototype,
  type PrototypeTarget,
  type PrototypeAdmission,
} from '../program/prototype-source';

function exact(value: unknown, names: string[]) {
  const fields = prototypeFields(value, names);
  if (Object.keys(fields).length !== names.length)
    throw Error('Exact named booking review fields required');
  return fields;
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw Error('Exact primitive booking reference required');
  return value;
}
function targetInput(target: PrototypeTarget) {
  const names = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const fields = exact(target, names);
  names.forEach((name) => text(fields[name]));
  return fields as unknown as PrototypeTarget & { job_id: string };
}
function admitted(gate: PrototypeAdmission) {
  const fields = prototypeFields(gate, ['enabled', 'confirmed']);
  if (fields.enabled !== true || fields.confirmed !== true)
    throw Error('Booking review is OFF without current explicit confirmation');
}
function propertyFence(repo: PropertyRepository, target: PrototypeTarget) {
  repo.operations.syntheticProperty(
    target.organization_id,
    target.customer_id,
    target.location_id,
  );
  return JSON.stringify({
    property: repo.read(target.organization_id),
    assignments: repo.estimates.syntheticJobAssignments(
      target.organization_id,
      target.actor_id,
    ),
    memberships: repo.operations.syntheticMemberships(target.organization_id),
  });
}
type PrototypeSource = Awaited<ReturnType<typeof readPrototypeSource>>;
interface SourceBinding {
  repo: PropertyRepository;
  target: PrototypeTarget & { job_id: string };
  originalTarget: PrototypeTarget;
  targetSignature: string;
  gate: PrototypeAdmission;
  source: PrototypeSource;
  order: WorkOrder;
  orderSignature: string;
  modelSignature: string;
  propertyFence: string;
}
const sources = new WeakMap<object, SourceBinding>();
function checkSourceNow(binding: SourceBinding) {
  admitted(binding.gate);
  if (
    JSON.stringify(targetInput(binding.originalTarget)) !==
    binding.targetSignature
  )
    throw Error('Booking selection changed');
  assertPrototypeSourceCurrentNow(binding.source);
  if (
    fieldWorkOrderBinding(
      binding.repo,
      binding.target.organization_id,
      binding.target.actor_id,
      binding.order,
    ) !== binding.orderSignature ||
    propertyFence(binding.repo, binding.target) !== binding.propertyFence
  )
    throw Error('Booking visit, crew or source revision changed');
}

/** Read the actual visit before filling a proposal. No booking/assignment writer. */
export async function readBookingSchedulingSource(
  repo: PropertyRepository,
  target: PrototypeTarget,
  sourceVisitId: string,
  gate: PrototypeAdmission = {},
) {
  admitted(gate);
  if (!(repo instanceof PropertyRepository))
    throw Error('Actual shared PropertyRepository required');
  const t = targetInput(target),
    visitId = text(sourceVisitId),
    targetSignature = JSON.stringify(t);
  const checkInput = () => {
    admitted(gate);
    if (JSON.stringify(targetInput(target)) !== targetSignature)
      throw Error('Booking selection changed');
  };
  const source = await readPrototypeSource(repo.estimates, t, gate);
  checkInput();
  const model = await readFieldWorkOrders(repo, t.organization_id, t.actor_id);
  checkInput();
  if (!model.manager) throw Error('Current eligible office reviewer required');
  const orders = model.orders.filter((o) => o.source.job_id === t.job_id);
  if (orders.length !== 1) throw Error('Exact current job unavailable');
  const order = orders[0];
  fieldWorkOrderBinding(repo, t.organization_id, t.actor_id, order);
  if (
    order.source.organization_id !== t.organization_id ||
    order.source.estimate_id !== t.estimate_id ||
    order.source.issued_version_id !== t.version_id ||
    order.customer.id !== t.customer_id ||
    order.baseline_property?.id !== t.location_id
  )
    throw Error('Exact customer, property and issued job source required');
  const visits = order.visits.filter(
    (v) =>
      v.id === visitId &&
      v.customer_id === t.customer_id &&
      v.location_id === t.location_id,
  );
  if (visits.length !== 1)
    throw Error('Exact existing property visit required');
  const visit = visits[0],
    state = repo.read(t.organization_id);
  const actualVisit = state.visits.filter((v) => v.id === visit.id);
  const plans = state.plans.filter((p) => p.id === visit.plan_id);
  if (
    actualVisit.length !== 1 ||
    plans.length !== 1 ||
    plans[0].organization_id !== t.organization_id ||
    actualVisit[0].organization_id !== t.organization_id ||
    plans[0].job_id !== t.job_id ||
    plans[0].customer_id !== t.customer_id ||
    plans[0].location_id !== t.location_id ||
    actualVisit[0].plan_id !== plans[0].id ||
    actualVisit[0].revision !== visit.revision ||
    plans[0].revision !== visit.plan_revision ||
    actualVisit[0].visited_on !== visit.date ||
    plans[0].timezone !== visit.timezone
  )
    throw Error('Current exact visit/plan provenance unavailable');
  const binding: SourceBinding = {
    repo,
    target: t,
    originalTarget: target,
    targetSignature,
    gate,
    source,
    order,
    orderSignature: fieldWorkOrderBinding(
      repo,
      t.organization_id,
      t.actor_id,
      order,
    ),
    modelSignature: JSON.stringify(model),
    propertyFence: propertyFence(repo, t),
  };
  const body = {
    mode: 'LOCAL_BOOKING_SOURCE' as const,
    source: {
      organization_id: t.organization_id,
      customer_id: t.customer_id,
      location_id: t.location_id,
      job_id: t.job_id,
      job_revision: order.source.job_revision,
      estimate_id: t.estimate_id,
      issued_version_id: t.version_id,
      issued_version_number: order.source.issued_version_number,
      source_sha256: source.sha256,
    },
    job_title: order.title,
    customer_label: order.customer.label,
    property_label: order.baseline_property.label,
    original_visit: { ...visit },
    crew: order.crew.map((w) => ({ worker_id: w.worker_id, label: w.label })),
    actual_availability: 'UNKNOWN' as const,
  };
  const sha256 = await documentHash(body);
  checkInput();
  await assertPrototypeSourceCurrent(source);
  checkSourceNow(binding);
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  sources.set(result, binding);
  return result;
}
export type BookingSchedulingSource = Awaited<
  ReturnType<typeof readBookingSchedulingSource>
>;
export interface BookingSchedulingInput {
  source: BookingSchedulingSource;
  source_visit_id: string;
  day: string;
  timezone: string;
  worker_id: string;
  review_note: string;
  start: string | null;
  end: string | null;
  hours_start: string | null;
  hours_end: string | null;
}
function pin(input: BookingSchedulingInput) {
  const fields = exact(input, [
    'source',
    'source_visit_id',
    'day',
    'timezone',
    'worker_id',
    'review_note',
    'start',
    'end',
    'hours_start',
    'hours_end',
  ]);
  if (
    !fields.source ||
    typeof fields.source !== 'object' ||
    !sources.has(fields.source)
  )
    throw Error('Exact retained booking source required');
  const values = {
    source_visit_id: text(fields.source_visit_id),
    day: text(fields.day),
    timezone: text(fields.timezone),
    worker_id: text(fields.worker_id),
    review_note: text(fields.review_note),
    start: fields.start === null ? null : text(fields.start),
    end: fields.end === null ? null : text(fields.end),
    hours_start: fields.hours_start === null ? null : text(fields.hours_start),
    hours_end: fields.hours_end === null ? null : text(fields.hours_end),
  };
  if (
    (values.start === null) !== (values.end === null) ||
    (values.hours_start === null) !== (values.hours_end === null)
  )
    throw Error('Both proposed start/end values or neither are required');
  capacityDay(values.day, values.timezone);
  // Scope this form to its selected civil day; canonical engine validates DST and intervals.
  for (const value of [
    values.start,
    values.end,
    values.hours_start,
    values.hours_end,
  ]) {
    if (value !== null) {
      capacityLocalInstant(value, values.timezone);
      if (value.slice(0, 10) !== values.day)
        throw Error('Proposal times must use the selected civil day');
    }
  }
  return {
    source: fields.source as BookingSchedulingSource,
    values,
    signature: JSON.stringify(values),
  };
}
type Capacity = Awaited<ReturnType<typeof reviewCrewDayCapacity>>;
interface ReviewBinding {
  source: BookingSchedulingSource;
  sourceBinding: SourceBinding;
  input: BookingSchedulingInput;
  signature: string;
  gate: PrototypeAdmission;
  target: PrototypeTarget;
  targetSignature: string;
  experiment: Awaited<ReturnType<typeof reviewOperationsExperiments>> | null;
}
const reviews = new WeakMap<object, ReviewBinding>();
function checkReviewNow(binding: ReviewBinding) {
  admitted(binding.gate);
  if (JSON.stringify(targetInput(binding.target)) !== binding.targetSignature)
    throw Error('Booking target changed');
  const current = pin(binding.input);
  if (
    current.source !== binding.source ||
    current.signature !== binding.signature
  )
    throw Error('Booking proposal or confirmation changed');
  checkSourceNow(binding.sourceBinding);
}
/** Human-confirmed, immutable review. Alternate days are JOB_WINDOW proposals only. */
export async function readBookingScheduling(
  repo: PropertyRepository,
  target: PrototypeTarget,
  input: BookingSchedulingInput,
  gate: PrototypeAdmission = {},
) {
  admitted(gate);
  const selected = pin(input),
    sourceBinding = sources.get(selected.source)!;
  const t = targetInput(target);
  if (
    repo !== sourceBinding.repo ||
    JSON.stringify(t) !== sourceBinding.targetSignature
  )
    throw Error('Booking source differs from exact current target');
  const { source, values } = selected;
  if (
    values.source_visit_id !== source.original_visit.id ||
    values.timezone !== source.original_visit.timezone
  )
    throw Error('Exact original visit and plan timezone required');
  if (!source.crew.some((w) => w.worker_id === values.worker_id))
    throw Error('Current exact assigned job technician required');
  const binding: ReviewBinding = {
    source,
    sourceBinding,
    input,
    signature: selected.signature,
    gate,
    target,
    targetSignature: JSON.stringify(t),
    experiment: null,
  };
  const targetSignature = JSON.stringify(t);
  const checkNow = () => {
    if (JSON.stringify(targetInput(target)) !== targetSignature)
      throw Error('Booking target changed');
    checkReviewNow(binding);
  };
  checkNow();
  const sameDay = values.day === source.original_visit.date;
  const hours =
    values.hours_start === null
      ? []
      : [
          {
            worker_id: values.worker_id,
            start: values.hours_start,
            end: values.hours_end!,
          },
        ];
  let capacity: Pick<
    Capacity,
    | 'civil_day_minutes'
    | 'workers'
    | 'overlaps'
    | 'dated_visits'
    | 'source_snapshot'
  > & { recorded_issues: string[] | null };
  let experiment: ReviewBinding['experiment'] = null;
  if (sameDay) {
    experiment = await reviewOperationsExperiments(
      repo,
      t.organization_id,
      t.actor_id,
      {
        day: values.day,
        timezone: values.timezone,
        booking: {
          order: sourceBinding.order,
          worker_id: values.worker_id,
          visit_id: values.source_visit_id,
          start: values.start,
          end: values.end,
        },
        other_windows: [],
        proposed_hours: hours,
        route: [],
        // Actual human input only; this unsaved review context is not inspection evidence.
        capture: {
          order: sourceBinding.order,
          visit_id: values.source_visit_id,
          note: values.review_note,
        },
      },
      gate,
    );
    checkNow();
    const bounds = capacityDay(values.day, values.timezone);
    capacity = {
      civil_day_minutes: bounds.minutes,
      workers: [experiment.booking.capacity],
      overlaps: [...experiment.booking.conflicts],
      source_snapshot: sourceBinding.modelSignature,
      // The existing experiment projects worker coverage, not individual invalid rows.
      recorded_issues: null,
      dated_visits: sourceBinding.order.visits
        .filter((visit) => {
          const day = capacityDay(visit.date, visit.timezone);
          return day.start < bounds.end && day.end > bounds.start;
        })
        .map((visit) => ({
          job_id: t.job_id,
          visit_id: visit.id,
          visit_revision: visit.revision,
          plan_id: visit.plan_id,
          plan_revision: visit.plan_revision,
          customer_id: visit.customer_id,
          property_id: visit.location_id,
          property_label: visit.property_label,
          date: visit.date,
          timezone: visit.timezone,
          timing:
            visit.id === values.source_visit_id && values.start !== null
              ? ('HUMAN_PROPOSED_WINDOW' as const)
              : ('TIME_UNKNOWN' as const),
          assignment: sourceBinding.order.assignment_state,
        })),
    };
  } else {
    capacity = await reviewCrewDayCapacity(
      repo,
      t.organization_id,
      t.actor_id,
      {
        day: values.day,
        timezone: values.timezone,
        confirmed: true,
        hours,
        windows:
          values.start === null
            ? []
            : [
                {
                  order: sourceBinding.order,
                  worker_id: values.worker_id,
                  visit_id: null,
                  start: values.start,
                  end: values.end!,
                },
              ],
      },
    );
  }
  checkNow();
  if (capacity.source_snapshot !== sourceBinding.modelSignature)
    throw Error(
      'Captured crew/work-order evidence changed. Load the original source again.',
    );
  const worker = capacity.workers.find((w) => w.worker_id === values.worker_id);
  if (!worker) throw Error('Current exact technician unavailable');
  const conflicts = capacity.overlaps.filter(
    (c) => c.worker_id === values.worker_id,
  );
  const body = {
    mode: 'LOCAL_BOOKING_REVIEW_ONLY' as const,
    source: source.source,
    original_visit: source.original_visit,
    proposal: {
      ...values,
      kind: sameDay
        ? ('SAME_DAY_VISIT_WINDOW' as const)
        : ('UNSAVED_JOB_WINDOW_RESCHEDULE' as const),
      timing:
        values.start === null
          ? ('DATE_ONLY_UNKNOWN' as const)
          : ('EXPLICIT_HUMAN_PROPOSAL' as const),
      visit_moved: false as const,
    },
    capacity: {
      civil_day_minutes: capacity.civil_day_minutes,
      worker: { ...worker },
      conflicts,
      dated_visits: capacity.dated_visits.filter(
        (v) => v.property_id === t.location_id && v.job_id === t.job_id,
      ),
      recorded_issues: capacity.recorded_issues,
      review:
        values.start === null
          ? ('UNKNOWN' as const)
          : conflicts.length
            ? ('RECORDED_CONFLICT' as const)
            : worker.recorded_coverage === 'UNKNOWN'
              ? ('RECORDED_TIME_UNKNOWN' as const)
              : worker.capacity_state === 'OUTSIDE_PROPOSED_HOURS'
                ? ('OUTSIDE_PROPOSED_HOURS' as const)
                : worker.capacity_state === 'UNKNOWN'
                  ? ('HOURS_UNKNOWN' as const)
                  : ('NO_REPORTED_CONFLICT' as const),
      actual_availability: 'UNKNOWN' as const,
      workforce_currentness: 'CAPTURED_NOT_ATOMIC' as const,
      coverage: 'AVAILABLE_RECORDS_ONLY' as const,
    },
    authority: {
      schedule: false,
      reschedule: false,
      assign: false,
      dispatch: false,
      communicate: false,
      financial: false,
      replay: false,
    },
    persistence: 'IMMUTABLE_SESSION_REVIEW_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  checkNow();
  if (
    experiment &&
    (await reconcileOperationsExperiment(experiment)).state !==
      'CURRENT_REVIEW_ONLY'
  )
    throw Error('Exact same-day experiment evidence UNKNOWN');
  checkNow();
  const current = await readFieldWorkOrders(
    repo,
    t.organization_id,
    t.actor_id,
  );
  checkNow();
  if (JSON.stringify(current) !== capacity.source_snapshot)
    throw Error('Crew capacity capture changed');
  await assertPrototypeSourceCurrent(sourceBinding.source);
  checkNow();
  binding.experiment = experiment;
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  reviews.set(result, binding);
  return result;
}
export type BookingSchedulingReview = Awaited<
  ReturnType<typeof readBookingScheduling>
>;
/** Exact read-only reconciliation only; no replacement, replay or source rebinding. */
export async function reconcileBookingScheduling(
  view: BookingSchedulingReview,
) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replacement: null,
    replay: 'FORBIDDEN' as const,
  };
  const binding = reviews.get(view);
  if (!binding) return unknown;
  try {
    checkReviewNow(binding);
    if (
      binding.experiment &&
      (await reconcileOperationsExperiment(binding.experiment)).state !==
        'CURRENT_REVIEW_ONLY'
    )
      return unknown;
    const { sourceBinding } = binding;
    const current = await readFieldWorkOrders(
      sourceBinding.repo,
      sourceBinding.target.organization_id,
      sourceBinding.target.actor_id,
    );
    checkReviewNow(binding);
    if (JSON.stringify(current) !== sourceBinding.modelSignature)
      return unknown;
    await assertPrototypeSourceCurrent(sourceBinding.source);
    checkReviewNow(binding);
    return {
      status: 'CURRENT_REVIEW_ONLY' as const,
      replacement: null,
      replay: 'FORBIDDEN' as const,
    };
  } catch {
    return unknown;
  }
}
