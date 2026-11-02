import { Temporal } from '@js-temporal/polyfill';
import type { LocalJourney } from './journey-runtime';
import { readBookingSchedulingSource } from './booking-scheduling';
import { readTechnicianDayBoard } from '../field-day-board';
import {
  readFieldWorkOrders,
  fieldWorkOrderBinding,
  type WorkOrder,
} from '../field-work-orders';
import {
  capacityDay,
  capacityLocalInstant,
} from '../../domain/field/crew-capacity';
import { documentHash } from '../../domain/release/preview';
import { PropertyRepository } from '../property';
import {
  readPrototypeSource,
  assertPrototypeSourceCurrent,
  assertPrototypeSourceCurrentNow,
  prototypeFields,
  freezePrototype,
  type PrototypeAdmission,
  type PrototypeTarget,
} from '../program/prototype-source';

export interface WeeklyCrewProposal {
  day: string;
  source_visit_id: string;
  worker_id: string;
  start: string | null;
  end: string | null;
  hours_start: string | null;
  hours_end: string | null;
}
export interface WeeklyCrewInput {
  week_start: string;
  timezone: string;
  worker_id: string;
  proposals: WeeklyCrewProposal[];
}
function fields(value: unknown, names: string[]) {
  const result = prototypeFields(value, names);
  if (Object.keys(result).length !== names.length)
    throw Error('Exact weekly review fields required');
  return result;
}
function text(value: unknown, empty = false) {
  if (
    typeof value !== 'string' ||
    (!empty && !value.trim()) ||
    value.length > 200
  )
    throw Error('Primitive weekly review text required');
  return value;
}
function admitted(gate: PrototypeAdmission) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (g.enabled !== true || g.confirmed !== true)
    throw Error('Weekly review is OFF without current explicit confirmation');
}
function composition(sources: LocalJourney) {
  // Dependencies are actual Main instances; do not execute caller source getters.
  const values = prototypeFields(sources, Object.keys(sources));
  const repo = values.property;
  if (
    !(repo instanceof PropertyRepository) ||
    values.estimates !== repo.estimates ||
    values.operations !== repo.operations
  )
    throw Error('Same actual journey repositories required');
  const names = [
    'organization_id',
    'actor_id',
    'customer_id',
    'location_id',
    'estimate_id',
    'version_id',
    'job_id',
  ];
  const target = fields(values.target, names);
  names.forEach((name) => text(target[name]));
  admitted(values.gate as PrototypeAdmission);
  const company = prototypeFields(
    values.company,
    Object.keys(values.company as object),
  );
  if (company.id !== target.organization_id)
    throw Error('Exact journey company required');
  return {
    repo,
    target: target as unknown as PrototypeTarget & { job_id: string },
    visit_id: text(values.scheduled_visit_id),
    timezone: text(values.timezone),
  };
}
function pin(input: WeeklyCrewInput) {
  const f = fields(input, ['week_start', 'timezone', 'worker_id', 'proposals']);
  const start = text(f.week_start),
    timezone = text(f.timezone),
    worker_id = text(f.worker_id, true);
  capacityDay(start, timezone);
  const dates = Array.from({ length: 7 }, (_, index) =>
    Temporal.PlainDate.from(start).add({ days: index }).toString(),
  );
  dates.forEach((day) => capacityDay(day, timezone));
  const rows = f.proposals;
  if (
    !Array.isArray(rows) ||
    Object.getPrototypeOf(rows) !== Array.prototype ||
    rows.length > 14 ||
    Reflect.ownKeys(rows).length !== rows.length + 1
  )
    throw Error('At most fourteen exact weekly proposal rows required');
  const descriptors = Object.getOwnPropertyDescriptors(rows);
  const proposals = Array.from({ length: rows.length }, (_, index) => {
    if (!descriptors[index] || !Object.hasOwn(descriptors[index], 'value'))
      throw Error('Weekly row accessors unavailable');
    const p = fields(descriptors[index].value, [
      'day',
      'source_visit_id',
      'worker_id',
      'start',
      'end',
      'hours_start',
      'hours_end',
    ]);
    const result = {
      day: text(p.day),
      source_visit_id: text(p.source_visit_id),
      worker_id: text(p.worker_id),
      start: p.start === null ? null : text(p.start),
      end: p.end === null ? null : text(p.end),
      hours_start: p.hours_start === null ? null : text(p.hours_start),
      hours_end: p.hours_end === null ? null : text(p.hours_end),
    };
    if (
      !dates.includes(result.day) ||
      (result.start === null) !== (result.end === null) ||
      (result.hours_start === null) !== (result.hours_end === null)
    )
      throw Error('Exact week and paired proposal times required');
    for (const time of [
      result.start,
      result.end,
      result.hours_start,
      result.hours_end,
    ])
      if (time !== null) {
        capacityLocalInstant(time, timezone);
        if (time.slice(0, 10) !== result.day)
          throw Error('Proposal must stay on its explicit civil day');
      }
    return result;
  });
  return {
    week_start: start,
    timezone,
    worker_id,
    proposals,
    dates,
    signature: JSON.stringify({ start, timezone, worker_id, proposals }),
  };
}
function fence(sources: LocalJourney, order: WorkOrder) {
  const c = composition(sources);
  fieldWorkOrderBinding(
    c.repo,
    c.target.organization_id,
    c.target.actor_id,
    order,
  );
  c.repo.operations.syntheticProperty(
    c.target.organization_id,
    c.target.customer_id,
    c.target.location_id,
  );
  return JSON.stringify({
    property: c.repo.read(c.target.organization_id),
    assignments: c.repo.estimates.syntheticJobAssignments(
      c.target.organization_id,
      c.target.actor_id,
    ),
    memberships: c.repo.operations.syntheticMemberships(
      c.target.organization_id,
    ),
  });
}
type Source = Awaited<ReturnType<typeof readPrototypeSource>>;
interface Binding {
  repo: PropertyRepository;
  sources: LocalJourney;
  input: WeeklyCrewInput;
  gate: PrototypeAdmission;
  signature: string;
  selection: string;
  source: Source;
  order: WorkOrder;
  modelSignature: string;
  fence: string;
}
const retained = new WeakMap<object, Binding>();
function checkNow(b: Binding) {
  admitted(b.gate);
  const c = composition(b.sources);
  if (c.repo !== b.repo) throw Error('Weekly repository replaced');
  if (
    JSON.stringify({
      target: c.target,
      visit_id: c.visit_id,
      timezone: c.timezone,
    }) !== b.selection ||
    pin(b.input).signature !== b.signature
  )
    throw Error('Weekly source or proposal selection changed');
  assertPrototypeSourceCurrentNow(b.source);
  if (fence(b.sources, b.order) !== b.fence)
    throw Error('Weekly source revisions changed');
}
/** Seven current canonical day readers, scoped to the exact selected job/property. */
export async function readWeeklyCrew(
  sources: LocalJourney,
  input: WeeklyCrewInput,
  gate: PrototypeAdmission = {},
) {
  admitted(gate);
  const c = composition(sources),
    request = pin(input);
  if (request.timezone !== c.timezone)
    throw Error('Exact source timezone required');
  const selection = JSON.stringify({
    target: c.target,
    visit_id: c.visit_id,
    timezone: c.timezone,
  });
  const checkInput = () => {
    admitted(gate);
    const current = composition(sources);
    if (
      JSON.stringify({
        target: current.target,
        visit_id: current.visit_id,
        timezone: current.timezone,
      }) !== selection ||
      current.repo !== c.repo ||
      pin(input).signature !== request.signature
    )
      throw Error('Weekly selection changed');
  };
  const anchor = await readBookingSchedulingSource(
    c.repo,
    c.target,
    c.visit_id,
    gate,
  );
  checkInput();
  const source = await readPrototypeSource(c.repo.estimates, c.target, gate);
  checkInput();
  if (source.sha256 !== anchor.source.source_sha256)
    throw Error('Weekly source changed during admission');
  const model = await readFieldWorkOrders(
    c.repo,
    c.target.organization_id,
    c.target.actor_id,
  );
  checkInput();
  const matches = model.orders.filter(
      (o) => o.source.job_id === c.target.job_id,
    ),
    order = matches[0];
  if (
    !model.manager ||
    matches.length !== 1 ||
    order.source.issued_version_id !== c.target.version_id ||
    order.customer.id !== c.target.customer_id ||
    order.baseline_property?.id !== c.target.location_id
  )
    throw Error('Exact current staff/job/property source required');
  if (
    request.worker_id &&
    !order.crew.some((w) => w.worker_id === request.worker_id)
  )
    throw Error('Exact assigned technician filter required');
  for (const p of request.proposals)
    if (
      !order.crew.some((w) => w.worker_id === p.worker_id) ||
      !order.visits.some(
        (v) =>
          v.id === p.source_visit_id &&
          v.customer_id === c.target.customer_id &&
          v.location_id === c.target.location_id,
      )
    )
      throw Error('Exact assigned crew and original property visit required');
  const binding: Binding = {
    repo: c.repo,
    sources,
    input,
    gate,
    signature: request.signature,
    selection,
    source,
    order,
    modelSignature: JSON.stringify(model),
    fence: fence(sources, order),
  };
  const days = [];
  for (const day of request.dates) {
    const proposals = request.proposals.filter((p) => p.day === day);
    const board = await readTechnicianDayBoard(
      c.repo,
      c.target.organization_id,
      c.target.actor_id,
      {
        day,
        timezone: request.timezone,
        worker_id: '',
        proposal: {
          day,
          timezone: request.timezone,
          confirmed: true,
          windows: proposals
            .filter((p) => p.start !== null)
            .map((p) => ({
              order,
              worker_id: p.worker_id,
              visit_id:
                order.visits.find((v) => v.id === p.source_visit_id)!.date ===
                day
                  ? p.source_visit_id
                  : null,
              start: p.start!,
              end: p.end!,
            })),
          hours: proposals
            .filter((p) => p.hours_start !== null)
            .map((p) => ({
              worker_id: p.worker_id,
              start: p.hours_start!,
              end: p.hours_end!,
            })),
        },
      },
    );
    checkNow(binding);
    if (board.source_fingerprint !== binding.modelSignature)
      throw Error('Weekly captured crew evidence changed between days');
    days.push({
      day,
      civil_day_minutes: board.civil_day_minutes,
      lanes: board.lanes
        .filter(
          (lane) =>
            order.crew.some((w) => w.worker_id === lane.worker_id) &&
            (!request.worker_id || request.worker_id === lane.worker_id),
        )
        .map((lane) => ({
          worker_id: lane.worker_id,
          label: lane.label,
          events: lane.events.filter(
            (event) =>
              event.job_id === c.target.job_id &&
              event.customer_id === c.target.customer_id &&
              event.property_id === c.target.location_id,
          ),
          capacity: lane.capacity,
          conflicts: lane.conflicts,
          actual_availability: 'UNKNOWN' as const,
        })),
    });
  }
  const revision_sha256 = await documentHash({ order, fence: binding.fence });
  checkNow(binding);
  const body = {
    mode: 'LOCAL_WEEKLY_CREW_REVIEW' as const,
    reviewer_id: c.target.actor_id,
    source: anchor.source,
    original_visits: order.visits.map((visit) => ({ ...visit })),
    job_title: order.title,
    customer_label: order.customer.label,
    property_label: order.baseline_property.label,
    week_start: request.week_start,
    timezone: request.timezone,
    days,
    proposals: request.proposals.map((p) => ({
      ...p,
      original_visit: order.visits.find((v) => v.id === p.source_visit_id)!,
      kind:
        order.visits.find((v) => v.id === p.source_visit_id)!.date === p.day
          ? ('SAME_DAY_HUMAN_PROPOSAL' as const)
          : ('UNSAVED_JOB_WINDOW' as const),
      visit_moved: false as const,
    })),
    source_revision_sha256: revision_sha256,
    workforce_currentness: 'CAPTURED_NOT_ATOMIC' as const,
    coverage: 'SELECTED_JOB_PROPERTY_AVAILABLE_RECORDS_ONLY' as const,
    actual_availability: 'UNKNOWN' as const,
    authority: {
      schedule: false,
      assign: false,
      dispatch: false,
      write: false,
      communicate: false,
      financial: false,
      replay: false,
    },
  };
  const sha256 = await documentHash(body);
  checkNow(binding);
  const current = await readFieldWorkOrders(
    c.repo,
    c.target.organization_id,
    c.target.actor_id,
  );
  checkNow(binding);
  if (JSON.stringify(current) !== binding.modelSignature)
    throw Error('Weekly source capture changed');
  await assertPrototypeSourceCurrent(source);
  checkInput();
  checkNow(binding);
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(result, binding);
  return result;
}
export type WeeklyCrewView = Awaited<ReturnType<typeof readWeeklyCrew>>;
export async function reconcileWeeklyCrew(view: WeeklyCrewView) {
  const unknown = {
    status: 'UNKNOWN' as const,
    replacement: null,
    replay: 'FORBIDDEN' as const,
  };
  const b = retained.get(view);
  if (!b) return unknown;
  try {
    checkNow(b);
    const c = composition(b.sources),
      current = await readFieldWorkOrders(
        c.repo,
        c.target.organization_id,
        c.target.actor_id,
      );
    checkNow(b);
    if (JSON.stringify(current) !== b.modelSignature) return unknown;
    await assertPrototypeSourceCurrent(b.source);
    checkNow(b);
    return { ...unknown, status: 'CURRENT_REVIEW_ONLY' as const };
  } catch {
    return unknown;
  }
}
export interface WeeklyCrewComparisonInput {
  expected_first_sha256: string;
  expected_second_sha256: string;
}
/** Compare exact retained snapshots and combined proposals; never acquires/applies a lock. */
export async function compareWeeklyCrewSnapshots(
  first: WeeklyCrewView,
  second: WeeklyCrewView,
  input: WeeklyCrewComparisonInput,
  gate: PrototypeAdmission = {},
) {
  const blocked = {
    status: 'UNKNOWN' as const,
    applied: false as const,
    replacement: null,
    replay: 'FORBIDDEN' as const,
  };
  try {
    admitted(gate);
    const fieldsNow = () => {
      admitted(gate);
      const f = fields(input, [
        'expected_first_sha256',
        'expected_second_sha256',
      ]);
      return [text(f.expected_first_sha256), text(f.expected_second_sha256)];
    };
    const expected = fieldsNow(),
      a = retained.get(first),
      b = retained.get(second);
    if (!a || !b) return blocked;
    checkNow(a);
    checkNow(b);
    if (
      expected[0] !== first.integrity.sha256 ||
      expected[1] !== second.integrity.sha256
    )
      return { ...blocked, status: 'CAS_REFERENCE_MISMATCH' as const };
    const ca = composition(a.sources),
      cb = composition(b.sources);
    const identity = (t: PrototypeTarget) =>
      JSON.stringify([
        t.organization_id,
        t.customer_id,
        t.location_id,
        t.job_id,
        t.estimate_id,
        t.version_id,
      ]);
    if (
      ca.repo !== cb.repo ||
      identity(ca.target) !== identity(cb.target) ||
      first.week_start !== second.week_start ||
      first.timezone !== second.timezone ||
      first.source_revision_sha256 !== second.source_revision_sha256
    )
      return { ...blocked, status: 'SOURCE_REFERENCE_MISMATCH' as const };
    if (
      (await reconcileWeeklyCrew(first)).status !== 'CURRENT_REVIEW_ONLY' ||
      (await reconcileWeeklyCrew(second)).status !== 'CURRENT_REVIEW_ONLY'
    )
      return blocked;
    const proposals = [...pin(a.input).proposals, ...pin(b.input).proposals];
    if (proposals.length > 14) throw Error('Bounded combined review required');
    const combined = await readWeeklyCrew(
      a.sources,
      {
        week_start: first.week_start,
        timezone: first.timezone,
        worker_id: '',
        proposals,
      },
      gate,
    );
    const check = () => {
      if (JSON.stringify(fieldsNow()) !== JSON.stringify(expected))
        throw Error('Comparison CAS selection changed');
      checkNow(a);
      checkNow(b);
    };
    check();
    const body = {
      status: 'MATCHING_SOURCE_REVIEW_ONLY' as const,
      first_sha256: first.integrity.sha256,
      second_sha256: second.integrity.sha256,
      reviewers:
        first.reviewer_id === second.reviewer_id
          ? ('SAME_SYNTHETIC_REVIEWER' as const)
          : ('DISTINCT_SYNTHETIC_REVIEWERS' as const),
      source_revision_sha256: first.source_revision_sha256,
      conflicts: combined.days.flatMap((day) =>
        day.lanes.flatMap((lane) =>
          lane.conflicts.map((conflict) => ({ day: day.day, ...conflict })),
        ),
      ),
      actual_availability: 'UNKNOWN' as const,
      workforce_currentness: 'CAPTURED_NOT_ATOMIC' as const,
      applied: false as const,
      replacement: null,
      replay: 'FORBIDDEN' as const,
    };
    const sha256 = await documentHash(body);
    check();
    return freezePrototype({
      ...body,
      integrity: { algorithm: 'SHA-256' as const, sha256 },
    });
  } catch {
    return blocked;
  }
}
