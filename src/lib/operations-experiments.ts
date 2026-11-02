import type { PropertyRepository } from './property';
import {
  fieldWorkOrderBinding,
  readFieldWorkOrders,
  type WorkOrder,
  type WorkOrderModel,
} from './field-work-orders';
import {
  reviewCrewDayCapacity,
  type CrewPlanningWindow,
  type CrewProposedHours,
} from './field-crew-capacity';
import { capacityDay } from '../domain/field/crew-capacity';

/** Staff-only ephemeral inputs. These are proposals, never scheduling commands. */
export interface OperationsExperimentInput {
  day: string;
  timezone: string;
  booking: {
    order: WorkOrder;
    worker_id: string;
    visit_id: string;
    start: string | null;
    end: string | null;
  };
  other_windows: CrewPlanningWindow[];
  proposed_hours: CrewProposedHours[];
  route: { order: WorkOrder; visit_id: string }[];
  capture: {
    order: WorkOrder;
    visit_id: string;
    note: string;
  };
}
export interface OperationsExperimentAdmission {
  enabled?: boolean;
  confirmed?: boolean;
}
function fields(value: unknown, names: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw Error('Exact plain experiment data required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== names.length ||
    names.some((name) => !descriptors[name] || !('value' in descriptors[name]))
  )
    throw Error('Exact own-data experiment fields required');
  return Object.fromEntries(
    names.map((name) => [name, descriptors[name].value]),
  );
}
function rows(value: unknown, maximum = 16): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw Error('Bounded exact experiment rows required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index];
    if (!descriptor || !('value' in descriptor))
      throw Error('Experiment row accessors unavailable');
    return descriptor.value;
  });
}
function text(value: unknown, maximum = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw Error('Bounded primitive experiment text required');
  return value;
}
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
function admission(
  repo: PropertyRepository,
  org: string,
  actor: string,
  gate: OperationsExperimentAdmission,
) {
  const permission = fields(gate, ['enabled', 'confirmed']);
  if (permission.enabled !== true || permission.confirmed !== true)
    throw Error(
      'Experiment is OFF without explicit current staff confirmation',
    );
  text(org);
  text(actor);
  if (!repo.operations.sample || !repo.estimates.sample)
    throw Error('Local synthetic operations only');
  const members = repo.operations
    .syntheticMemberships(org)
    .filter((m) => m.user_id === actor && m.active);
  if (
    members.length !== 1 ||
    !(
      ['owner', 'admin'].includes(members[0].role) ||
      (members[0].role === 'staff' &&
        members[0].staff_type === 'office_manager')
    )
  )
    throw Error('Current exact synthetic office reviewer required');
  return JSON.stringify([members[0].role, members[0].staff_type]);
}
function pin(
  repo: PropertyRepository,
  org: string,
  actor: string,
  input: OperationsExperimentInput,
) {
  const root = fields(input, [
    'day',
    'timezone',
    'booking',
    'other_windows',
    'proposed_hours',
    'route',
    'capture',
  ]);
  const source = (order: unknown) => {
    const retained = order as WorkOrder;
    const binding = fieldWorkOrderBinding(repo, org, actor, retained);
    return { retained, binding, data: JSON.parse(binding) as WorkOrder };
  };
  const b = fields(root.booking, [
    'order',
    'worker_id',
    'visit_id',
    'start',
    'end',
  ]);
  const c = fields(root.capture, ['order', 'visit_id', 'note']);
  const booking = {
    ...source(b.order),
    worker_id: text(b.worker_id),
    visit_id: text(b.visit_id),
    start: b.start === null ? null : text(b.start),
    end: b.end === null ? null : text(b.end),
  };
  if ((booking.start === null) !== (booking.end === null))
    throw Error('Both proposed booking times or neither are required');
  const windows = rows(root.other_windows).map((value) => {
    const w = fields(value, ['order', 'worker_id', 'visit_id', 'start', 'end']);
    return {
      ...source(w.order),
      worker_id: text(w.worker_id),
      visit_id: w.visit_id === null ? null : text(w.visit_id),
      start: text(w.start),
      end: text(w.end),
    };
  });
  const hours = rows(root.proposed_hours).map((value) => {
    const h = fields(value, ['worker_id', 'start', 'end']);
    return {
      worker_id: text(h.worker_id),
      start: text(h.start),
      end: text(h.end),
    };
  });
  const route = rows(root.route).map((value) => {
    const stop = fields(value, ['order', 'visit_id']);
    return { ...source(stop.order), visit_id: text(stop.visit_id) };
  });
  if (
    new Set(
      route.map((s) => JSON.stringify([s.data.source.job_id, s.visit_id])),
    ).size !== route.length
  )
    throw Error('Duplicate route stop proposal unavailable');
  const capture = {
    ...source(c.order),
    visit_id: text(c.visit_id),
    note: text(c.note, 1000).trim(),
  };
  const day = text(root.day),
    timezone = text(root.timezone);
  capacityDay(day, timezone);
  const signature = JSON.stringify({
    day,
    timezone,
    booking: [
      booking.binding,
      booking.worker_id,
      booking.visit_id,
      booking.start,
      booking.end,
    ],
    windows: windows.map((w) => [
      w.binding,
      w.worker_id,
      w.visit_id,
      w.start,
      w.end,
    ]),
    hours,
    route: route.map((s) => [s.binding, s.visit_id]),
    capture: [capture.binding, capture.visit_id, capture.note],
  });
  return { day, timezone, booking, windows, hours, route, capture, signature };
}
type Pinned = ReturnType<typeof pin>;
function validateSources(model: WorkOrderModel, selected: Pinned) {
  if (!model.manager) throw Error('Office experiment review required');
  const references = [
    selected.booking,
    selected.capture,
    ...selected.route,
    ...selected.windows,
  ];
  for (const source of references) {
    const current = model.orders.filter(
      (o) => o.source.job_id === source.data.source.job_id,
    );
    if (current.length !== 1 || JSON.stringify(current[0]) !== source.binding)
      throw Error('Exact current work-order source unavailable');
    if (
      !source.data.crew.some((w) => w.worker_id === selected.booking.worker_id)
    )
      throw Error(
        'Route and capture require the exact proposed job technician',
      );
    if (source.visit_id !== null) {
      const visits = source.data.visits.filter((v) => v.id === source.visit_id);
      if (visits.length !== 1)
        throw Error('Exact source property visit required');
      const bounds = capacityDay(selected.day, selected.timezone),
        visitDay = capacityDay(visits[0].date, visits[0].timezone);
      if (visitDay.start >= bounds.end || visitDay.end <= bounds.start)
        throw Error('Selected visit does not overlap the proposed civil day');
    }
  }
}
/** Final synchronous fence uses existing sample readers; no await follows this check. */
function sourceFence(
  repo: PropertyRepository,
  org: string,
  actor: string,
  model: WorkOrderModel,
) {
  const state = repo.read(org),
    assignments = repo.estimates.syntheticJobAssignments(org, actor),
    members = repo.operations.syntheticMemberships(org);
  const jobs = model.orders.map((order) => {
    const job = repo.estimates.syntheticJob(org, order.source.job_id);
    if (
      !job ||
      job.lock_revision !== order.source.job_revision ||
      job.baseline.issued_version_id !== order.source.issued_version_id
    )
      throw Error('Current job source changed');
    const active = assignments.filter((a) => a.job_id === job.id && a.active);
    if (
      active.length !== order.crew.length ||
      active.some((a) => !order.crew.some((w) => w.user_id === a.user_id))
    )
      throw Error('Current exact job assignment changed');
    for (const worker of order.crew)
      if (
        !members.some(
          (m) =>
            m.user_id === worker.user_id &&
            m.active &&
            (['owner', 'admin'].includes(m.role) ||
              (m.role === 'staff' &&
                ['office_manager', 'field_staff'].includes(m.staff_type))),
        )
      )
        throw Error('Current exact worker eligibility changed');
    for (const visit of order.visits) {
      const v = state.visits.find((row) => row.id === visit.id),
        p = state.plans.find((row) => row.id === visit.plan_id);
      if (
        !v ||
        !p ||
        v.revision !== visit.revision ||
        p.revision !== visit.plan_revision ||
        v.plan_id !== p.id ||
        p.organization_id !== org ||
        v.organization_id !== org ||
        p.customer_id !== order.customer.id ||
        p.location_id !== visit.location_id ||
        p.job_id !== job.id ||
        v.visited_on !== visit.date ||
        p.timezone !== visit.timezone
      )
        throw Error('Current property visit or plan changed');
      repo.operations.syntheticProperty(
        org,
        order.customer.id,
        visit.location_id,
      );
    }
    return [job.id, job.lock_revision, job.baseline.issued_version_id];
  });
  return JSON.stringify({
    jobs,
    assignments,
    plans: state.plans,
    visits: state.visits,
  });
}
function reference(source: { data: WorkOrder; visit_id: string }) {
  const visit = source.data.visits.find((v) => v.id === source.visit_id)!;
  return {
    ...source.data.source,
    customer_id: source.data.customer.id,
    property_id: visit.location_id,
    visit_id: visit.id,
    visit_revision: visit.revision,
    plan_id: visit.plan_id,
    plan_revision: visit.plan_revision,
    recorded_date: visit.date,
    timezone: visit.timezone,
  };
}
async function sha(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
const retained = new WeakMap<
  object,
  {
    repo: PropertyRepository;
    org: string;
    actor: string;
    input: OperationsExperimentInput;
    gate: OperationsExperimentAdmission;
    inputSignature: string;
    role: string;
    sourceSignature: string;
    fence: string;
  }
>();

/** No booking, route optimization provider, persistent capture or command executor. */
export async function reviewOperationsExperiments(
  repo: PropertyRepository,
  org: string,
  actor: string,
  input: OperationsExperimentInput,
  gate: OperationsExperimentAdmission = {},
) {
  const role = admission(repo, org, actor, gate),
    selected = pin(repo, org, actor, input);
  const assertInput = () => {
    if (
      admission(repo, org, actor, gate) !== role ||
      pin(repo, org, actor, input).signature !== selected.signature
    )
      throw Error('Experiment inputs or current staff confirmation changed');
  };
  const model = await readFieldWorkOrders(repo, org, actor);
  assertInput();
  validateSources(model, selected);
  const sourceSignature = JSON.stringify(model),
    fence = sourceFence(repo, org, actor, model);
  const proposal = {
    day: selected.day,
    timezone: selected.timezone,
    confirmed: true,
    windows: selected.windows.map((w) => ({
      order: w.retained,
      worker_id: w.worker_id,
      visit_id: w.visit_id,
      start: w.start,
      end: w.end,
    })),
    hours: selected.hours,
  };
  if (selected.booking.start !== null)
    proposal.windows.push({
      order: selected.booking.retained,
      worker_id: selected.booking.worker_id,
      visit_id: selected.booking.visit_id,
      start: selected.booking.start,
      end: selected.booking.end!,
    });
  const capacity = await reviewCrewDayCapacity(repo, org, actor, proposal);
  assertInput();
  if (capacity.source_snapshot !== sourceSignature)
    throw Error('Capacity and booking source changed');
  const worker = capacity.workers.find(
    (w) => w.worker_id === selected.booking.worker_id,
  );
  if (!worker) throw Error('Exact current proposed technician unavailable');
  const conflicts = capacity.overlaps.filter(
    (c) => c.worker_id === worker.worker_id,
  );
  const body = {
    mode: 'LOCAL_SYNTHETIC_EXPERIMENT' as const,
    audience: 'SYNTHETIC_STAFF_ONLY' as const,
    organization_id: org,
    reviewer: actor,
    day: selected.day,
    timezone: selected.timezone,
    booking: {
      source: reference(selected.booking),
      worker_id: selected.booking.worker_id,
      proposed_start: selected.booking.start,
      proposed_end: selected.booking.end,
      timing:
        selected.booking.start === null
          ? ('DATE_ONLY_UNKNOWN' as const)
          : ('HUMAN_PROPOSAL' as const),
      day_review:
        selected.booking.start === null
          ? ('UNKNOWN' as const)
          : conflicts.length
            ? ('REPORTED_DAY_CONFLICT' as const)
            : worker.capacity_state === 'OUTSIDE_PROPOSED_HOURS'
              ? ('OUTSIDE_PROPOSED_HOURS' as const)
              : worker.capacity_state === 'UNKNOWN'
                ? ('HOURS_UNKNOWN' as const)
                : ('NO_REPORTED_DAY_CONFLICT' as const),
      capacity: { ...worker },
      conflicts,
      actual_availability: 'UNKNOWN' as const,
      historical_coverage: 'AVAILABLE_RECORDS_ONLY' as const,
      booking_authority: 'BLOCKED' as const,
    },
    route: {
      ordering: 'EXPLICIT_HUMAN_INPUT_ORDER' as const,
      stops: selected.route.map((stop, index) => ({
        position: index + 1,
        source: reference(stop),
      })),
      geography: 'UNAVAILABLE' as const,
      travel_time: 'UNKNOWN' as const,
      optimization: 'NOT_PERFORMED' as const,
      dispatch_authority: 'BLOCKED' as const,
    },
    offline_capture: {
      source: reference(selected.capture),
      note: selected.capture.note,
      status: 'UNSAVED_FIELD_NOTE_PROPOSAL' as const,
      storage: 'SESSION_OBJECT_ONLY' as const,
      crash_durability: 'NOT_PROVIDED' as const,
      synchronization: 'EXACT_READ_ONLY_RECONCILIATION_ONLY' as const,
      replay: 'FORBIDDEN' as const,
      physical_completion: 'UNVERIFIED' as const,
    },
    authority: {
      schedule: false,
      assign: false,
      dispatch: false,
      save_note: false,
      sync: false,
      retry: false,
      communicate: false,
      financial: false,
      hosted: false,
    },
  };
  const integrity = await sha(body);
  assertInput();
  const current = await readFieldWorkOrders(repo, org, actor);
  assertInput();
  validateSources(current, selected);
  if (
    JSON.stringify(current) !== sourceSignature ||
    sourceFence(repo, org, actor, current) !== fence
  )
    throw Error(
      'Experiment source changed; no candidate was scheduled or captured',
    );
  const result = freeze({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, content_sha256: integrity },
  });
  retained.set(result, {
    repo,
    org,
    actor,
    input,
    gate,
    role,
    inputSignature: selected.signature,
    sourceSignature,
    fence,
  });
  return result;
}
export type OperationsExperimentReview = Awaited<
  ReturnType<typeof reviewOperationsExperiments>
>;

/** Exact retained-object inspection only. Never resumes, saves, queues or replaces. */
export async function reconcileOperationsExperiment(
  review: OperationsExperimentReview,
) {
  const binding = retained.get(review);
  const unknown = {
    state: 'UNKNOWN' as const,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
  if (!binding)
    return freeze({
      ...unknown,
      reason: 'EXACT_RETAINED_PROPOSAL_UNAVAILABLE' as const,
    });
  const { repo, org, actor, input, gate } = binding;
  try {
    const check = () => {
      if (admission(repo, org, actor, gate) !== binding.role)
        throw Error('Current review eligibility unavailable');
      return pin(repo, org, actor, input);
    };
    const selected = check();
    if (selected.signature !== binding.inputSignature)
      return freeze({
        state: 'STALE' as const,
        reason: 'HUMAN_PROPOSAL_CHANGED' as const,
        replay: 'FORBIDDEN' as const,
        replacement: null,
      });
    const current = await readFieldWorkOrders(repo, org, actor);
    const after = check();
    if (after.signature !== binding.inputSignature)
      return freeze({
        state: 'STALE' as const,
        reason: 'HUMAN_PROPOSAL_CHANGED' as const,
        replay: 'FORBIDDEN' as const,
        replacement: null,
      });
    if (
      JSON.stringify(current) !== binding.sourceSignature ||
      sourceFence(repo, org, actor, current) !== binding.fence
    )
      return freeze({
        state: 'STALE' as const,
        reason: 'SOURCE_CHANGED' as const,
        replay: 'FORBIDDEN' as const,
        replacement: null,
      });
    validateSources(current, after);
    return freeze({
      state: 'CURRENT_REVIEW_ONLY' as const,
      reason: 'EXACT_AVAILABLE_SOURCE_MATCH' as const,
      replay: 'FORBIDDEN' as const,
      replacement: null,
    });
  } catch {
    return freeze({
      ...unknown,
      reason: 'SOURCE_OR_CURRENT_ELIGIBILITY_UNAVAILABLE' as const,
    });
  }
}
