import { Temporal } from '@js-temporal/polyfill';
import type { PropertyRepository } from './property';
import {
  openFieldWorkOrder,
  fieldWorkOrderBinding,
  readFieldWorkOrders,
  fieldWorkOrdersEnabled,
  type WorkOrder,
} from './field-work-orders';
import {
  calculateCrewCapacity,
  capacityDay,
  capacityWindow,
  type CapacityInterval,
} from '../domain/field/crew-capacity';

export const fieldCrewCapacityEnabled = fieldWorkOrdersEnabled;
export interface CrewPlanningWindow {
  order: WorkOrder;
  worker_id: string;
  visit_id: string | null;
  start: string;
  end: string;
}
export interface CrewProposedHours {
  worker_id: string;
  start: string;
  end: string;
}
export interface CrewDayProposal {
  day: string;
  timezone: string;
  windows: CrewPlanningWindow[];
  hours: CrewProposedHours[];
  confirmed: boolean;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const fingerprint = (value: unknown) => JSON.stringify(value);
function text(value: unknown): string {
  if (typeof value !== 'string')
    throw Error('Primitive text review inputs required');
  return value;
}
function dataFields(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw Error('Exact plain review input required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => !descriptors[key] || !('value' in descriptors[key]))
  )
    throw Error('Exact named review data fields required');
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function dataRows(value: unknown): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 32
  )
    throw Error('Review at most 32 exact input rows');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw Error('Exact review row array required');
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor))
      throw Error('Review row accessors unavailable');
    return descriptor.value;
  });
}

/** Read-only review of explicit ephemeral proposals. No scheduling or availability store. */
export async function reviewCrewDayCapacity(
  repo: PropertyRepository,
  org: string,
  actor: string,
  input: CrewDayProposal,
) {
  const admitted = dataFields(input, [
    'day',
    'timezone',
    'windows',
    'hours',
    'confirmed',
  ]);
  const assertConfirmed = () => {
    if (
      dataFields(input, ['day', 'timezone', 'windows', 'hours', 'confirmed'])
        .confirmed !== true
    )
      throw Error(
        'Explicit current confirmation of proposed hours and windows required',
      );
  };
  assertConfirmed();
  const day = text(admitted.day),
    timezone = text(admitted.timezone),
    windows = dataRows(admitted.windows).map((value) => {
      const w = dataFields(value, [
        'order',
        'worker_id',
        'visit_id',
        'start',
        'end',
      ]);
      const order = w.order as WorkOrder;
      return {
        order,
        display: fieldWorkOrderBinding(repo, org, actor, order),
        worker_id: text(w.worker_id),
        visit_id: w.visit_id === null ? null : text(w.visit_id),
        start: text(w.start),
        end: text(w.end),
      };
    }),
    hours = dataRows(admitted.hours).map((value) => {
      const h = dataFields(value, ['worker_id', 'start', 'end']);
      return {
        worker_id: text(h.worker_id),
        start: text(h.start),
        end: text(h.end),
      };
    }),
    bounds = capacityDay(day, timezone);
  const model = await readFieldWorkOrders(repo, org, actor);
  assertConfirmed();
  if (!model.manager)
    throw Error(
      'Current sample office reviewer required for proposed capacity',
    );
  const sourceSnapshot = fingerprint(model);
  for (const order of new Set(windows.map((w) => w.order))) {
    await openFieldWorkOrder(repo, org, actor, order);
    assertConfirmed();
  }
  const planned = windows.map((w) => {
    if (fieldWorkOrderBinding(repo, org, actor, w.order) !== w.display)
      throw Error('Retained work-order source changed');
    const current = model.orders.find(
      (o) => o.source.job_id === w.order.source.job_id,
    );
    if (!current || fingerprint(current) !== w.display)
      throw Error('Exact current work-order source required');
    if (!current.crew.some((member) => member.worker_id === w.worker_id))
      throw Error('Current exact job crew relationship required');
    const visit =
      w.visit_id === null
        ? null
        : current.visits.find((v) => v.id === w.visit_id);
    if (w.visit_id !== null && !visit)
      throw Error('Exact linked property visit required');
    const interval = capacityWindow(w.start, w.end, timezone, bounds);
    if (visit) {
      const originalStart = Temporal.PlainDateTime.from(
        w.start,
      ).toZonedDateTime(timezone, { disambiguation: 'reject' });
      if (
        originalStart.withTimeZone(visit.timezone).toPlainDate().toString() !==
        visit.date
      )
        throw Error(
          'Proposed visit window does not match its recorded property date',
        );
    }
    return {
      key: `${current.source.job_id}${visit ? '/visit/' + visit.id : '/job'}`,
      worker_id: w.worker_id,
      job_id: current.source.job_id,
      visit_id: visit?.id ?? null,
      ...interval,
      source: {
        ...current.source,
        customer_id: current.customer.id,
        property_id:
          visit?.location_id ?? current.baseline_property?.id ?? null,
        plan_id: visit?.plan_id ?? null,
        plan_revision: visit?.plan_revision ?? null,
        visit_revision: visit?.revision ?? null,
      },
      label: visit ? visit.plan_name : current.title,
      local_start: w.start,
      local_end: w.end,
    };
  });
  const proposedHours = hours.map((h) => {
    if (!model.crew.some((w) => w.worker_id === h.worker_id))
      throw Error('Current exact worker required for proposed hours');
    return {
      worker_id: h.worker_id,
      ...capacityWindow(h.start, h.end, timezone, bounds),
    };
  });
  const recorded: CapacityInterval[] = [],
    recordedUnknown = new Set<string>(),
    recordedIssues: string[] = [];
  const byId = new Map<
    string,
    { order: WorkOrder; entry: WorkOrder['recorded_time'][number] }[]
  >();
  for (const order of model.orders)
    for (const entry of order.recorded_time) {
      const group = byId.get(entry.id) ?? [];
      group.push({ order, entry });
      byId.set(entry.id, group);
    }
  for (const [id, rows] of byId) {
    const { order, entry } = rows[0];
    if (
      rows.some(
        (row) =>
          row.order.source.job_id !== order.source.job_id ||
          fingerprint(row.entry) !== fingerprint(entry),
      )
    ) {
      rows.forEach((row) => recordedUnknown.add(row.entry.worker_id));
      recordedIssues.push(`Ambiguous recorded segment ${id}`);
      continue;
    }
    try {
      const start = Temporal.Instant.from(entry.started_at).epochMilliseconds;
      if (!entry.ended_at) {
        if (start < bounds.end) {
          recordedUnknown.add(entry.worker_id);
          recordedIssues.push(`End UNKNOWN for recorded segment ${id}`);
        }
        continue;
      }
      const end = Temporal.Instant.from(entry.ended_at).epochMilliseconds;
      if (end <= start) throw Error('Invalid interval');
      if (start < bounds.end && end > bounds.start)
        recorded.push({
          key: id,
          worker_id: entry.worker_id,
          job_id: order.source.job_id,
          visit_id: null,
          start: Math.max(start, bounds.start),
          end: Math.min(end, bounds.end),
        });
    } catch {
      recordedUnknown.add(entry.worker_id);
      recordedIssues.push(`Timing UNKNOWN for recorded segment ${id}`);
    }
  }
  const current = await readFieldWorkOrders(repo, org, actor);
  assertConfirmed();
  if (
    !current.manager ||
    sourceSnapshot !== fingerprint(current) ||
    windows.some(
      (w) => fieldWorkOrderBinding(repo, org, actor, w.order) !== w.display,
    )
  )
    throw Error(
      'Crew, source or staff classification changed. Reload field records.',
    );
  const calculation = calculateCrewCapacity(
    model.crew.map((w) => w.worker_id),
    planned,
    proposedHours,
    recorded,
    [...recordedUnknown],
  );
  return freeze({
    organization_id: org,
    reviewer: actor,
    day,
    timezone,
    civil_day_minutes: bounds.minutes,
    authority: 'SESSION_PROPOSAL_ONLY' as const,
    actual_availability: 'UNKNOWN' as const,
    historical_coverage: 'AVAILABLE_RECORDS_ONLY' as const,
    source_snapshot: sourceSnapshot,
    workers: calculation.workers.map((row) => ({
      ...row,
      label: model.crew.find((w) => w.worker_id === row.worker_id)!.label,
    })),
    overlaps: calculation.overlaps,
    duplicate_proposals_ignored: calculation.duplicate_proposals_ignored,
    windows: planned,
    hours: proposedHours,
    recorded_issues: recordedIssues,
    dated_visits: model.orders.flatMap((order) =>
      order.visits
        .filter((v) => {
          const sourceDay = capacityDay(v.date, v.timezone);
          return sourceDay.start < bounds.end && sourceDay.end > bounds.start;
        })
        .map((visit) => ({
          job_id: order.source.job_id,
          visit_id: visit.id,
          visit_revision: visit.revision,
          plan_id: visit.plan_id,
          plan_revision: visit.plan_revision,
          customer_id: visit.customer_id,
          property_id: visit.location_id,
          property_label: visit.property_label,
          date: visit.date,
          timezone: visit.timezone,
          timing: planned.some((w) => w.visit_id === visit.id)
            ? ('HUMAN_PROPOSED_WINDOW' as const)
            : ('TIME_UNKNOWN' as const),
          assignment: order.assignment_state,
        })),
    ),
  });
}
export type CrewDayCapacityReview = Awaited<
  ReturnType<typeof reviewCrewDayCapacity>
>;
