import { Temporal } from '@js-temporal/polyfill';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFieldWorkOrders,
  fieldWorkOrderBinding,
  type WorkOrder,
} from '../field-work-orders';
import { readTechnicianDayBoard } from '../field-day-board';
import { readBookingSchedulingSource } from './booking-scheduling';
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
} from '../program/prototype-source';

export interface PortfolioSchedulingProposal {
  job_id: string;
  day: string;
  source_visit_id: string;
  worker_id: string;
  start: string | null;
  end: string | null;
  hours_start: string | null;
  hours_end: string | null;
}
export interface PortfolioSchedulingInput {
  week_start: string;
  timezone: string;
  job_id: string;
  worker_id: string;
  proposals: PortfolioSchedulingProposal[];
}
function fields(value: unknown, keys: string[]) {
  const f = prototypeFields(value, keys);
  if (Object.keys(f).length !== keys.length)
    throw Error('Exact portfolio scheduling fields required');
  return f;
}
function text(value: unknown, empty = false): string {
  if (
    typeof value !== 'string' ||
    (!empty && !value.trim()) ||
    value.length > 200
  )
    throw Error('Primitive scheduling selection required');
  return value;
}
function pin(input: PortfolioSchedulingInput) {
  const f = fields(input, [
    'week_start',
    'timezone',
    'job_id',
    'worker_id',
    'proposals',
  ]);
  const week_start = text(f.week_start),
    timezone = text(f.timezone),
    job_id = text(f.job_id, true),
    worker_id = text(f.worker_id, true);
  capacityDay(week_start, timezone);
  const dates = Array.from({ length: 7 }, (_, i) =>
    Temporal.PlainDate.from(week_start).add({ days: i }).toString(),
  );
  dates.forEach((d) => capacityDay(d, timezone));
  if (
    !Array.isArray(f.proposals) ||
    Object.getPrototypeOf(f.proposals) !== Array.prototype ||
    f.proposals.length > 32 ||
    Reflect.ownKeys(f.proposals).length !== f.proposals.length + 1
  )
    throw Error('At most 32 exact detached proposals required');
  const descriptors = Object.getOwnPropertyDescriptors(f.proposals);
  const proposals = Array.from({ length: f.proposals.length }, (_, i) => {
    const d = descriptors[i];
    if (!d || !Object.hasOwn(d, 'value'))
      throw Error('Proposal getters unavailable');
    const p = fields(d.value, [
      'job_id',
      'day',
      'source_visit_id',
      'worker_id',
      'start',
      'end',
      'hours_start',
      'hours_end',
    ]);
    const result = {
      job_id: text(p.job_id),
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
      throw Error('Exact week and paired times required');
    for (const time of [
      result.start,
      result.end,
      result.hours_start,
      result.hours_end,
    ])
      if (time !== null) {
        capacityLocalInstant(time, timezone);
        if (time.slice(0, 10) !== result.day)
          throw Error('Detached proposal must stay on its day');
      }
    return result;
  });
  const result = { week_start, timezone, job_id, worker_id, proposals };
  return { ...result, dates, signature: JSON.stringify(result) };
}
type Capture = ReturnType<typeof captureOperatingSources>;
type Source = Awaited<ReturnType<typeof readPrototypeSource>>;
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  input: PortfolioSchedulingInput;
  capture: Capture;
  signature: string;
  prototype: Source[];
  orders: WorkOrder[];
  model_signature: string;
  fence: string;
}
const retained = new WeakMap<object, Binding>();
function fence(b: Pick<Binding, 'sources' | 'capture' | 'orders'>) {
  b.capture.check();
  const s = b.sources,
    c = b.capture;
  b.orders.forEach((o) =>
    fieldWorkOrderBinding(s.property, c.organization_id, c.actor_id, o),
  );
  return JSON.stringify({
    property: s.property.read(c.organization_id),
    members: s.operations.syntheticMemberships(c.organization_id),
    assignments: s.estimates.syntheticJobAssignments(
      c.organization_id,
      c.actor_id,
    ),
  });
}
function check(b: Binding) {
  b.capture.check();
  if (pin(b.input).signature !== b.signature)
    throw Error('Portfolio scheduling input changed');
  b.prototype.forEach(assertPrototypeSourceCurrentNow);
  if (fence(b) !== b.fence)
    throw Error('Portfolio property, crew or source revisions changed');
}
/** One canonical seven-day company board over the exact admitted jobs. No schedule store. */
export async function readPortfolioScheduling(
  sources: OperatingSources,
  input: PortfolioSchedulingInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    request = pin(input);
  const immediate = () => {
    capture.check();
    if (pin(input).signature !== request.signature)
      throw Error('Portfolio input changed');
  };
  if (capture.entries.some((e) => e.timezone !== request.timezone))
    throw Error('Exact common source timezone required');
  const model = await readFieldWorkOrders(
    sources.property,
    capture.organization_id,
    capture.actor_id,
  );
  immediate();
  if (!model.manager) throw Error('Current eligible office reviewer required');
  const orders: WorkOrder[] = [],
    prototype: Source[] = [];
  for (const entry of capture.entries) {
    const matches = model.orders.filter(
        (o) => o.source.job_id === entry.target.job_id,
      ),
      o = matches[0];
    if (
      matches.length !== 1 ||
      o.customer.id !== entry.target.customer_id ||
      o.baseline_property?.id !== entry.target.location_id ||
      o.source.estimate_id !== entry.target.estimate_id ||
      o.source.issued_version_id !== entry.target.version_id
    )
      throw Error(
        'Exact admitted job/customer/property/issued source required',
      );
    if (orders.some((prior) => prior.source.job_id === o.source.job_id))
      throw Error('Duplicate admitted job identity');
    const anchor = await readBookingSchedulingSource(
      sources.property,
      entry.target,
      entry.scheduled_visit_id,
      gate,
    );
    immediate();
    const p = await readPrototypeSource(sources.estimates, entry.target, gate);
    immediate();
    if (p.sha256 !== anchor.source.source_sha256)
      throw Error('Source changed during portfolio admission');
    orders.push(o);
    prototype.push(p);
  }
  if (request.job_id && !orders.some((o) => o.source.job_id === request.job_id))
    throw Error('Job filter must be an admitted source');
  const crew = model.crew.filter((w) =>
    orders.some((o) => o.crew.some((c) => c.worker_id === w.worker_id)),
  );
  if (request.worker_id && !crew.some((w) => w.worker_id === request.worker_id))
    throw Error('Technician filter must be admitted crew');
  for (const p of request.proposals) {
    const o = orders.find((o) => o.source.job_id === p.job_id);
    if (
      !o ||
      !o.crew.some((w) => w.worker_id === p.worker_id) ||
      !o.visits.some(
        (v) =>
          v.id === p.source_visit_id &&
          v.customer_id === o.customer.id &&
          v.location_id === o.baseline_property?.id,
      )
    )
      throw Error(
        'Exact job-assigned technician and original property visit required',
      );
  }
  const binding: Binding = {
    sources,
    gate,
    input,
    capture,
    signature: request.signature,
    prototype,
    orders,
    model_signature: JSON.stringify(model),
    fence: '',
  };
  binding.fence = fence(binding);
  const days = [];
  for (const day of request.dates) {
    const proposals = request.proposals.filter((p) => p.day === day);
    const board = await readTechnicianDayBoard(
      sources.property,
      capture.organization_id,
      capture.actor_id,
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
            .map((p) => {
              const order = orders.find((o) => o.source.job_id === p.job_id)!,
                visit = order.visits.find((v) => v.id === p.source_visit_id)!;
              return {
                order,
                worker_id: p.worker_id,
                visit_id: visit.date === day ? visit.id : null,
                start: p.start!,
                end: p.end!,
              };
            }),
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
    check(binding);
    if (board.source_fingerprint !== binding.model_signature)
      throw Error('Company crew source changed between days');
    days.push({
      day,
      civil_day_minutes: board.civil_day_minutes,
      duplicate_proposals_ignored: board.duplicate_proposals_ignored,
      lanes: board.lanes
        .filter(
          (l) =>
            crew.some((w) => w.worker_id === l.worker_id) &&
            (!request.worker_id || request.worker_id === l.worker_id),
        )
        .map((l) => {
          const seen = new Map<string, string>();
          const events = l.events
            .filter(
              (e) =>
                orders.some((o) => o.source.job_id === e.job_id) &&
                (!request.job_id || e.job_id === request.job_id),
            )
            .filter((e) => {
              const key = JSON.stringify([
                  e.kind,
                  e.job_id,
                  e.visit_id,
                  e.recorded_id,
                  e.start,
                  e.end,
                ]),
                bytes = JSON.stringify(e),
                prior = seen.get(key);
              if (prior && prior !== bytes)
                throw Error('Ambiguous exact event identity');
              if (prior) return false;
              seen.set(key, bytes);
              return true;
            });
          return {
            worker_id: l.worker_id,
            label: l.label,
            events,
            capacity: l.capacity,
            conflicts: l.conflicts,
            actual_availability: 'UNKNOWN' as const,
          };
        }),
    });
  }
  const body = {
    mode: 'LOCAL_MULTI_JOB_WEEKLY_REVIEW' as const,
    organization_id: capture.organization_id,
    reviewer_id: capture.actor_id,
    week_start: request.week_start,
    timezone: request.timezone,
    filters: { job_id: request.job_id, worker_id: request.worker_id },
    jobs: orders.map((o) => ({
      source: o.source,
      title: o.title,
      customer: o.customer,
      property: o.baseline_property!,
      crew: o.crew.map((w) => ({ worker_id: w.worker_id, label: w.label })),
      visits: o.visits.map((v) => ({ ...v })),
    })),
    available_jobs: orders.length,
    matching_jobs: request.job_id ? 1 : orders.length,
    days,
    proposals: request.proposals.map((p) => ({
      ...p,
      visit_moved: false as const,
    })),
    coverage: 'ADMITTED_JOBS_AVAILABLE_RECORDS_ONLY' as const,
    capacity_basis:
      'CANONICAL_AUTHORIZED_COMPANY_RECORDS_AND_EXPLICIT_PROPOSALS' as const,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    actual_availability: 'UNKNOWN' as const,
    offline_synchronization: 'REVIEW_ONLY_NO_APPLY' as const,
    storm_network: 'NO_EXTERNAL_CREW_OR_CAPACITY_ASSUMED' as const,
    authority: {
      assign: false,
      dispatch: false,
      write: false,
      synchronize: false,
      communicate: false,
      financial: false,
      replay: false,
    },
  };
  const sha256 = await documentHash(body);
  check(binding);
  const current = await readFieldWorkOrders(
    sources.property,
    capture.organization_id,
    capture.actor_id,
  );
  check(binding);
  if (JSON.stringify(current) !== binding.model_signature)
    throw Error('Final company work orders changed');
  for (const source of prototype) {
    await assertPrototypeSourceCurrent(source);
    check(binding);
  }
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(result, binding);
  return result;
}
export type PortfolioSchedulingView = Awaited<
  ReturnType<typeof readPortfolioScheduling>
>;
export async function reconcilePortfolioScheduling(
  view: PortfolioSchedulingView,
) {
  const result = {
    status: 'UNKNOWN' as 'UNKNOWN' | 'CURRENT_REVIEW_ONLY',
    replacement: null,
    replay: 'FORBIDDEN' as const,
  };
  const b = retained.get(view);
  if (!b) return result;
  try {
    check(b);
    const current = await readFieldWorkOrders(
      b.sources.property,
      b.capture.organization_id,
      b.capture.actor_id,
    );
    check(b);
    if (JSON.stringify(current) !== b.model_signature) return result;
    for (const source of b.prototype) {
      await assertPrototypeSourceCurrent(source);
      check(b);
    }
    return { ...result, status: 'CURRENT_REVIEW_ONLY' as const };
  } catch {
    return result;
  }
}
export async function openPortfolioSchedulingJob(
  view: PortfolioSchedulingView,
  job_id: string,
) {
  const b = retained.get(view);
  if (!b || typeof job_id !== 'string')
    throw Error('Exact retained portfolio source required');
  const job = view.jobs.find((j) => j.source.job_id === job_id);
  if (!job || (view.filters.job_id && view.filters.job_id !== job_id))
    throw Error('Exact displayed portfolio job required');
  if (
    (await reconcilePortfolioScheduling(view)).status !== 'CURRENT_REVIEW_ONLY'
  )
    throw Error('Portfolio source UNKNOWN');
  check(b);
  return freezePrototype({
    organization_id: view.organization_id,
    job_id: job.source.job_id,
    customer_id: job.customer.id,
    location_id: job.property.id,
    estimate_id: job.source.estimate_id,
    version_id: job.source.issued_version_id,
    title: job.title,
  });
}
