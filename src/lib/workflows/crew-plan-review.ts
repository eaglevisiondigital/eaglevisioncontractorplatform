import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readPortfolioScheduling,
  reconcilePortfolioScheduling,
  openPortfolioSchedulingJob,
  type PortfolioSchedulingProposal,
  type PortfolioSchedulingView,
} from './portfolio-scheduling';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import { documentHash } from '../../domain/release/preview';

export interface CrewPlanInput {
  week_start: string;
  timezone: string;
  job_id: string;
  worker_id: string;
  plan_a: PortfolioSchedulingProposal[];
  plan_b: PortfolioSchedulingProposal[];
}
const keys = [
  'week_start',
  'timezone',
  'job_id',
  'worker_id',
  'plan_a',
  'plan_b',
];
const rowKeys = [
  'job_id',
  'day',
  'source_visit_id',
  'worker_id',
  'start',
  'end',
  'hours_start',
  'hours_end',
];
function exact(value: unknown, names: string[]) {
  const f = prototypeFields(value, names);
  if (Object.keys(f).length !== names.length)
    throw Error('Exact crew-plan fields required');
  return f;
}
function pin(input: CrewPlanInput) {
  const f = exact(input, keys);
  for (const k of keys.slice(0, 4))
    if (typeof f[k] !== 'string' || (f[k] as string).length > 200)
      throw Error('Primitive crew-plan context required');
  const list = (value: unknown) => {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > 32 ||
      Reflect.ownKeys(value).length !== value.length + 1
    )
      throw Error('At most 32 dense proposal rows per plan');
    const descriptors = Object.getOwnPropertyDescriptors(value),
      seen = new Set<string>();
    return Array.from({ length: value.length }, (_, i) => {
      if (!descriptors[i] || !Object.hasOwn(descriptors[i], 'value'))
        throw Error('Proposal accessors unavailable');
      const p = exact(descriptors[i].value, rowKeys);
      for (const k of rowKeys)
        if (
          (p[k] !== null || rowKeys.indexOf(k) < 4) &&
          (typeof p[k] !== 'string' ||
            !(p[k] as string).trim() ||
            (p[k] as string).length > 200)
        )
          throw Error('Primitive crew-plan row required');
      const key = JSON.stringify([
        p.job_id,
        p.worker_id,
        p.source_visit_id,
        p.day,
      ]);
      if (seen.has(key))
        throw Error('One exact job/technician/visit/day row per plan required');
      seen.add(key);
      return p as unknown as PortfolioSchedulingProposal;
    });
  };
  const result: CrewPlanInput = {
    week_start: f.week_start as string,
    timezone: f.timezone as string,
    job_id: f.job_id as string,
    worker_id: f.worker_id as string,
    plan_a: list(f.plan_a),
    plan_b: list(f.plan_b),
  };
  return { value: result, signature: JSON.stringify(result) };
}
const identity = (p: PortfolioSchedulingProposal) =>
  JSON.stringify([p.job_id, p.worker_id, p.source_visit_id, p.day]);
type Capture = ReturnType<typeof captureOperatingSources>;
interface Binding {
  input: CrewPlanInput;
  signature: string;
  capture: Capture;
  boards: PortfolioSchedulingView[];
}
const retained = new WeakMap<object, Binding>();
function check(b: Binding) {
  b.capture.check();
  if (pin(b.input).signature !== b.signature)
    throw Error('Crew-plan inputs changed; comparison withheld');
}
export function assertCrewPlanCurrentNow(view: CrewPlanReviewView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained crew-plan review required');
  check(b);
}
/** Compare existing canonical day-board results. No scheduling, assignment or capacity engine. */
export async function reviewCrewPlans(
  sources: OperatingSources,
  input: CrewPlanInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    request = pin(input);
  const b: Binding = {
    input,
    signature: request.signature,
    capture,
    boards: [],
  };
  const common = {
    week_start: request.value.week_start,
    timezone: request.value.timezone,
    job_id: request.value.job_id,
    worker_id: request.value.worker_id,
  };
  for (const proposals of [[], request.value.plan_a, request.value.plan_b]) {
    b.boards.push(
      await readPortfolioScheduling(sources, { ...common, proposals }, gate),
    );
    check(b);
  }
  const [recorded, planA, planB] = b.boards;
  const before = new Map(request.value.plan_a.map((p) => [identity(p), p])),
    after = new Map(request.value.plan_b.map((p) => [identity(p), p]));
  const changes = [...new Set([...before.keys(), ...after.keys()])].map(
    (key) => {
      const a = before.get(key) ?? null,
        z = after.get(key) ?? null,
        p = a ?? z!;
      return {
        job_id: p.job_id,
        worker_id: p.worker_id,
        source_visit_id: p.source_visit_id,
        day: p.day,
        status:
          a === null
            ? ('ADDED' as const)
            : z === null
              ? ('REMOVED' as const)
              : JSON.stringify(a) === JSON.stringify(z)
                ? ('UNCHANGED' as const)
                : ('CHANGED' as const),
        plan_a: a,
        plan_b: z,
      };
    },
  );
  const days = recorded.days.map((day, index) => ({
    day: day.day,
    civil_day_minutes: day.civil_day_minutes,
    lanes: day.lanes.map((lane) => {
      const a = planA.days[index].lanes.find(
          (l) => l.worker_id === lane.worker_id,
        )!,
        z = planB.days[index].lanes.find(
          (l) => l.worker_id === lane.worker_id,
        )!;
      return {
        worker_id: lane.worker_id,
        label: lane.label,
        recorded_events: lane.events,
        plan_a: {
          capacity: a.capacity,
          conflicts: a.conflicts,
          events: a.events.filter((e) => e.kind === 'PROPOSED_WINDOW'),
        },
        plan_b: {
          capacity: z.capacity,
          conflicts: z.conflicts,
          events: z.events.filter((e) => e.kind === 'PROPOSED_WINDOW'),
        },
        proposed_workload_difference_minutes:
          a.capacity === null || z.capacity === null
            ? null
            : z.capacity.planned_minutes - a.capacity.planned_minutes,
        actual_availability: 'UNKNOWN' as const,
      };
    }),
  }));
  const body = {
    mode: 'LOCAL_CREW_PLAN_COMPARISON' as const,
    organization_id: recorded.organization_id,
    reviewer_id: recorded.reviewer_id,
    week_start: recorded.week_start,
    timezone: recorded.timezone,
    jobs: recorded.jobs,
    filters: recorded.filters,
    available_jobs: recorded.available_jobs,
    matching_jobs: recorded.matching_jobs,
    changes,
    days,
    source_integrity: b.boards.map((board) => board.integrity.sha256),
    coverage: recorded.coverage,
    source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
    actual_availability: 'UNKNOWN' as const,
    authority: {
      write: false,
      assign: false,
      dispatch: false,
      synchronize: false,
      financial: false,
      communicate: false,
    },
  };
  const sha256 = await documentHash(body);
  check(b);
  // Reconcile all three exact retained boards after the last asynchronous calculation.
  for (const board of b.boards) {
    if (
      (await reconcilePortfolioScheduling(board)).status !==
      'CURRENT_REVIEW_ONLY'
    )
      throw Error('Crew-plan source UNKNOWN');
    check(b);
  }
  const result = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(result, b);
  return result;
}
export type CrewPlanReviewView = Awaited<ReturnType<typeof reviewCrewPlans>>;
export async function reconcileCrewPlans(view: CrewPlanReviewView) {
  const unknown = {
      status: 'UNKNOWN' as 'UNKNOWN' | 'CURRENT_REVIEW_ONLY',
      replacement: null,
      replay: 'FORBIDDEN' as const,
    },
    b = retained.get(view);
  if (!b) return unknown;
  try {
    check(b);
    for (const board of b.boards) {
      if (
        (await reconcilePortfolioScheduling(board)).status !==
        'CURRENT_REVIEW_ONLY'
      )
        return unknown;
      check(b);
    }
    return { ...unknown, status: 'CURRENT_REVIEW_ONLY' as const };
  } catch {
    return unknown;
  }
}
export async function openCrewPlanJob(view: CrewPlanReviewView, jobId: string) {
  const b = retained.get(view);
  if (!b || (await reconcileCrewPlans(view)).status !== 'CURRENT_REVIEW_ONLY')
    throw Error('Crew-plan source UNKNOWN');
  const target = await openPortfolioSchedulingJob(b.boards[0], jobId);
  check(b);
  return target;
}
