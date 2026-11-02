import { Temporal } from '@js-temporal/polyfill';
import type { PropertyRepository } from './property';
import {
  fieldWorkOrdersEnabled,
  readFieldWorkOrders,
  openFieldWorkOrder,
  fieldWorkOrderBinding,
  type WorkOrder,
  type WorkOrderModel,
} from './field-work-orders';
import {
  capacityDay,
  capacityLocalInstant,
} from '../domain/field/crew-capacity';
import {
  reviewCrewDayCapacity,
  type CrewDayProposal,
  type CrewDayCapacityReview,
} from './field-crew-capacity';

export const technicianDayBoardEnabled = fieldWorkOrdersEnabled;
export interface TechnicianDayInput {
  day: string;
  timezone: string;
  worker_id: string;
  proposal: CrewDayProposal | null;
}
function own(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw Error('Exact named day-board inputs required');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((k) => !fields[k] || !('value' in fields[k]))
  )
    throw Error('Primitive own-data day-board inputs required');
  return Object.fromEntries(keys.map((k) => [k, fields[k].value]));
}
function text(value: unknown) {
  if (typeof value !== 'string')
    throw Error('Primitive day-board text required');
  return value;
}
function rows(value: unknown): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 32 ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw Error('At most 32 exact proposal rows required');
  const fields = Object.getOwnPropertyDescriptors(value);
  return Array.from({ length: value.length }, (_, i) => {
    if (!fields[i] || !('value' in fields[i]))
      throw Error('Proposal accessors unavailable');
    return fields[i].value;
  });
}
function pin(
  repo: PropertyRepository,
  org: string,
  actor: string,
  input: TechnicianDayInput,
) {
  const root = own(input, ['day', 'timezone', 'worker_id', 'proposal']);
  const values: unknown[] = [
    text(root.day),
    text(root.timezone),
    text(root.worker_id),
  ];
  if (root.proposal !== null) {
    const p = own(root.proposal, [
      'day',
      'timezone',
      'windows',
      'hours',
      'confirmed',
    ]);
    if (p.confirmed !== true)
      throw Error('Explicit current proposal confirmation required');
    if (p.day !== root.day || p.timezone !== root.timezone)
      throw Error('Exact board/proposal day and timezone required');
    values.push(
      text(p.day),
      text(p.timezone),
      p.confirmed,
      rows(p.windows).map((value) => {
        const w = own(value, [
          'order',
          'worker_id',
          'visit_id',
          'start',
          'end',
        ]);
        return [
          fieldWorkOrderBinding(repo, org, actor, w.order as WorkOrder),
          text(w.worker_id),
          w.visit_id === null ? null : text(w.visit_id),
          text(w.start),
          text(w.end),
        ];
      }),
      rows(p.hours).map((value) => {
        const h = own(value, ['worker_id', 'start', 'end']);
        return [text(h.worker_id), text(h.start), text(h.end)];
      }),
    );
  } else values.push(null);
  return {
    day: text(root.day),
    timezone: text(root.timezone),
    worker_id: text(root.worker_id),
    proposal: root.proposal as CrewDayProposal | null,
    fingerprint: JSON.stringify(values),
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
interface DayEvent {
  kind: 'PROPOSED_WINDOW' | 'RECORDED_SEGMENT' | 'DATE_ONLY_VISIT';
  job_id: string;
  title: string;
  customer_id: string;
  customer_label: string;
  property_id: string | null;
  property_label: string | null;
  estimate_id: string;
  issued_version_id: string;
  issued_version_number: number;
  job_revision: number;
  visit_id: string | null;
  visit_revision: number | null;
  plan_id: string | null;
  plan_revision: number | null;
  recorded_id: string | null;
  start: string | null;
  end: string | null;
  date: string | null;
  timezone: string;
  timing: 'HUMAN_PROPOSAL' | 'RECORDED_TIMESTAMPS' | 'TIME_UNKNOWN';
  description: string;
}
function event(
  order: WorkOrder,
): Omit<DayEvent, 'kind' | 'description' | 'timing'> {
  return {
    job_id: order.source.job_id,
    title: order.title,
    customer_id: order.customer.id,
    customer_label: order.customer.label,
    property_id: order.baseline_property?.id ?? null,
    property_label: order.baseline_property?.label ?? null,
    estimate_id: order.source.estimate_id,
    issued_version_id: order.source.issued_version_id,
    issued_version_number: order.source.issued_version_number,
    job_revision: order.source.job_revision,
    visit_id: null,
    visit_revision: null,
    plan_id: null,
    plan_revision: null,
    recorded_id: null,
    start: null,
    end: null,
    date: null,
    timezone: '',
  };
}
const bindings = new WeakMap<
  object,
  {
    repo: PropertyRepository;
    org: string;
    actor: string;
    input: TechnicianDayInput;
    inputFingerprint: string;
    sourceFingerprint: string;
    model: WorkOrderModel;
  }
>();

/** Read-only composition over existing work orders and C4 capacity; never a dispatch schedule. */
export async function readTechnicianDayBoard(
  repo: PropertyRepository,
  org: string,
  actor: string,
  input: TechnicianDayInput,
) {
  const admitted = pin(repo, org, actor, input),
    bounds = capacityDay(admitted.day, admitted.timezone);
  const assertInput = () => {
    if (pin(repo, org, actor, input).fingerprint !== admitted.fingerprint)
      throw Error('Day-board inputs changed. Review again.');
  };
  const model = await readFieldWorkOrders(repo, org, actor);
  assertInput();
  const sourceFingerprint = JSON.stringify(model);
  const crew = model.manager
    ? model.crew
    : model.crew.filter((w) => w.user_id === actor);
  if (
    admitted.worker_id &&
    !crew.some((w) => w.worker_id === admitted.worker_id)
  )
    throw Error('Current authorized technician required');
  if (!model.manager && admitted.proposal !== null)
    throw Error('Office confirmation required for proposals');
  let capacity: CrewDayCapacityReview | null = null;
  if (admitted.proposal) {
    capacity = await reviewCrewDayCapacity(repo, org, actor, admitted.proposal);
    assertInput();
  }
  const lanes = crew
    .filter((w) => !admitted.worker_id || admitted.worker_id === w.worker_id)
    .map((worker) => {
      const events: DayEvent[] = [];
      for (const order of model.orders.filter((o) =>
        o.crew.some((w) => w.worker_id === worker.worker_id),
      )) {
        for (const visit of order.visits) {
          const visitDay = capacityDay(visit.date, visit.timezone);
          if (visitDay.start < bounds.end && visitDay.end > bounds.start)
            events.push({
              ...event(order),
              kind: 'DATE_ONLY_VISIT',
              visit_id: visit.id,
              visit_revision: visit.revision,
              plan_id: visit.plan_id,
              plan_revision: visit.plan_revision,
              property_id: visit.location_id,
              property_label: visit.property_label,
              date: visit.date,
              timezone: visit.timezone,
              timing: 'TIME_UNKNOWN',
              description: visit.plan_name,
            });
        }
        for (const entry of order.recorded_time.filter(
          (e) => e.worker_id === worker.worker_id,
        )) {
          const start = Temporal.Instant.from(
            entry.started_at,
          ).epochMilliseconds;
          const end =
            entry.ended_at === null
              ? null
              : Temporal.Instant.from(entry.ended_at).epochMilliseconds;
          if (end !== null && end <= start)
            throw Error('Recorded timing UNKNOWN. Reload exact source.');
          if (start < bounds.end && (end === null || end > bounds.start))
            events.push({
              ...event(order),
              kind: 'RECORDED_SEGMENT',
              recorded_id: entry.id,
              start: entry.started_at,
              end: entry.ended_at,
              timezone: admitted.timezone,
              timing: 'RECORDED_TIMESTAMPS',
              description:
                entry.kind.replaceAll('_', ' ') +
                (end === null ? ' · end UNKNOWN' : ''),
            });
        }
      }
      for (const window of capacity?.windows.filter(
        (w) => w.worker_id === worker.worker_id,
      ) ?? []) {
        const order = model.orders.find(
          (o) => o.source.job_id === window.job_id,
        )!;
        const visit = order.visits.find((v) => v.id === window.visit_id);
        events.push({
          ...event(order),
          kind: 'PROPOSED_WINDOW',
          ...{
            property_id: window.source.property_id,
            property_label:
              visit?.property_label ?? order.baseline_property?.label ?? null,
            visit_id: window.visit_id,
            visit_revision: window.source.visit_revision,
            plan_id: window.source.plan_id,
            plan_revision: window.source.plan_revision,
            start: window.local_start,
            end: window.local_end,
            timezone: admitted.timezone,
            timing: 'HUMAN_PROPOSAL',
            description: window.label,
          },
        });
      }
      const instant = (e: DayEvent) =>
        e.start === null
          ? 0
          : e.kind === 'PROPOSED_WINDOW'
            ? capacityLocalInstant(e.start, e.timezone)
            : Temporal.Instant.from(e.start).epochMilliseconds;
      events.sort(
        (a, b) =>
          (a.kind === 'DATE_ONLY_VISIT' ? 1 : 0) -
            (b.kind === 'DATE_ONLY_VISIT' ? 1 : 0) ||
          instant(a) - instant(b) ||
          a.job_id.localeCompare(b.job_id),
      );
      return {
        worker_id: worker.worker_id,
        label: worker.label,
        events,
        capacity:
          capacity?.workers.find((w) => w.worker_id === worker.worker_id) ??
          null,
        conflicts:
          capacity?.overlaps.filter((w) => w.worker_id === worker.worker_id) ??
          [],
        actual_availability: 'UNKNOWN' as const,
        visit_assignment: 'JOB_CREW_RELATIONSHIP_ONLY' as const,
      };
    });
  const final = await readFieldWorkOrders(repo, org, actor);
  assertInput();
  if (JSON.stringify(final) !== sourceFingerprint)
    throw Error(
      'Current day-board source or staff access changed. Reload field records.',
    );
  const board = freeze({
    organization_id: org,
    reviewer: actor,
    day: admitted.day,
    timezone: admitted.timezone,
    civil_day_minutes: bounds.minutes,
    manager: model.manager,
    lanes,
    authority: 'READ_ONLY_LOCAL_REVIEW' as const,
    actual_availability: 'UNKNOWN' as const,
    coverage: 'AVAILABLE_RECORDS_ONLY' as const,
    proposal_review:
      capacity === null
        ? ('NOT_REQUESTED' as const)
        : ('EXPLICIT_HUMAN_PROPOSAL' as const),
    duplicate_proposals_ignored: capacity?.duplicate_proposals_ignored ?? 0,
    recorded_issues: capacity?.recorded_issues ?? [],
    source_fingerprint: sourceFingerprint,
  });
  bindings.set(board, {
    repo,
    org,
    actor,
    input,
    inputFingerprint: admitted.fingerprint,
    sourceFingerprint,
    model,
  });
  return board;
}
export type TechnicianDayBoardView = Awaited<
  ReturnType<typeof readTechnicianDayBoard>
>;

export async function openTechnicianDayBoardSource(
  board: TechnicianDayBoardView,
  job: string,
) {
  const binding = bindings.get(board);
  if (!binding || typeof job !== 'string')
    throw Error('Exact retained day-board source required');
  const { repo, org, actor, input } = binding;
  if (pin(repo, org, actor, input).fingerprint !== binding.inputFingerprint)
    throw Error('Day-board inputs changed');
  const current = await readFieldWorkOrders(repo, org, actor);
  if (
    JSON.stringify(current) !== binding.sourceFingerprint ||
    pin(repo, org, actor, input).fingerprint !== binding.inputFingerprint
  )
    throw Error('Day-board source changed. Reload field records.');
  const order = binding.model.orders.find((o) => o.source.job_id === job);
  if (
    !order ||
    !board.lanes.some((lane) => lane.events.some((e) => e.job_id === job))
  )
    throw Error('Exact displayed day-board source required');
  const source = await openFieldWorkOrder(repo, org, actor, order);
  if (pin(repo, org, actor, input).fingerprint !== binding.inputFingerprint)
    throw Error('Day-board inputs changed');
  return source;
}
