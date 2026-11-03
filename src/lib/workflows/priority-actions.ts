import { prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type {
  DailyWorkbenchProps,
  DailyWorkbenchStep,
} from './daily-workbench-contract';
import { ownerActionDeskEnabled } from './owner-action-desk';
import {
  readDailyActionCenter,
  filterDailyActionCenter,
  inspectDailyActionCenter,
  openDailyActionSource,
  openDailyActionJob,
  type DailyActionCenterReview,
  type DailyActionCenterFilter,
} from './daily-action-center';
export const priorityActionsEnabled = ownerActionDeskEnabled;
type PrioritySource = Awaited<ReturnType<typeof openDailyActionSource>>;
export interface PriorityActionsInput {
  job_id: string | null;
}
export type PriorityContinue = NonNullable<DailyWorkbenchProps['onContinue']>;
export interface PriorityLiveCallback {
  current: PriorityContinue | undefined;
  generation: number;
}
interface Binding {
  sources: OperatingSources;
  gate: JourneyAdmission;
  input: PriorityActionsInput;
  signature: string;
  capture: ReturnType<typeof captureOperatingSources>;
  operations: OperatingSources['operations'];
  keys: string[];
  review?: DailyActionCenterReview;
  held: boolean;
  pending: boolean;
  tasks: Map<string, PrioritySource>;
  inspecting: Set<string>;
  controls: Map<
    string,
    Readonly<{ sources: OperatingSources; selectedJobId: string }>
  >;
}
const reviews = new WeakMap<object, Binding>(),
  tasks = new WeakMap<object, Binding>(),
  holds = new WeakMap<object, Set<string>>(),
  pendingClaims = new WeakMap<object, Map<string, object>>();
function admit(gate: JourneyAdmission) {
  const p = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(p).length !== 2 ||
    p.enabled !== true ||
    p.confirmed !== true ||
    !priorityActionsEnabled(true)
  )
    throw Error(
      'Priority actions are OFF without explicit development HTTP loopback admission',
    );
}
function pin(input: PriorityActionsInput) {
  const p = prototypeFields(input, ['job_id']);
  if (
    Object.keys(p).length !== 1 ||
    !(
      p.job_id === null ||
      (typeof p.job_id === 'string' &&
        p.job_id.length > 0 &&
        p.job_id.length <= 200)
    )
  )
    throw Error(
      'Exact priority job hint or explicit all-job selection required',
    );
  return p.job_id as string | null;
}
function hold(b: Binding) {
  b.held = true;
  let held = holds.get(b.operations);
  if (!held) holds.set(b.operations, (held = new Set()));
  b.keys.forEach((k) => held.add(k));
}
function check(b: Binding) {
  if (b.held || b.keys.some((k) => holds.get(b.operations)?.has(k)))
    throw Error(
      'UNKNOWN priority source; no reset, replacement, retry or renewed window',
    );
  try {
    admit(b.gate);
    b.capture.check();
    if (JSON.stringify(pin(b.input)) !== b.signature)
      throw Error('Original priority context changed');
    if (b.review)
      filterDailyActionCenter(b.review, {
        area: 'all',
        level: 'all',
        job_id: null,
        query: '',
        band: 'all',
      });
  } catch (error) {
    hold(b);
    throw error;
  }
}
/** The SAME original pure daily source review/ordering; leaves original OwnerActionDesk finite custody untouched. */
export async function readPriorityActions(
  sources: OperatingSources,
  input: PriorityActionsInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate);
  const job = pin(input),
    capture = captureOperatingSources(sources, gate),
    entries = capture.entries.filter(
      (e) => job === null || e.target.job_id === job,
    );
  if (!entries.length || (job !== null && entries.length !== 1))
    throw Error('Exact admitted priority job required; no fallback');
  const b: Binding = {
    sources,
    gate,
    input,
    signature: JSON.stringify(job),
    capture,
    operations: capture.entries[0].operations,
    keys: entries.map((e) =>
      JSON.stringify([capture.organization_id, e.target.job_id]),
    ),
    held: false,
    pending: false,
    tasks: new Map(),
    inspecting: new Set(),
    controls: new Map(),
  };
  check(b);
  try {
    const entry = entries[0],
      review = await readDailyActionCenter(
        sources,
        {
          review_on: entry.day,
          timezone: entry.timezone,
          ordering: 'EVIDENCE_FIRST',
          input_revision: 1,
        },
        gate,
      );
    b.review = review;
    check(b);
    reviews.set(review, b);
    return review;
  } catch (error) {
    hold(b);
    throw error;
  }
}
export type PriorityActionsRead = DailyActionCenterReview;
function current(view: PriorityActionsRead) {
  const b = reviews.get(view);
  if (!b) throw Error('Exact retained daily priority sources required');
  check(b);
  return b;
}
export function assertPriorityActionsCurrent(view: PriorityActionsRead) {
  current(view);
}
export function filterPriorityActions(
  view: PriorityActionsRead,
  filter: DailyActionCenterFilter,
) {
  const b = current(view);
  const selected = pin(b.input),
    p = prototypeFields(filter, ['area', 'level', 'job_id', 'query', 'band']);
  if (Object.keys(p).length !== 5)
    throw Error('Exact priority filters required');
  if (selected !== null && p.job_id !== null && p.job_id !== selected)
    throw Error('Filter outside pinned job context');
  return filterDailyActionCenter(view, {
    ...(p as unknown as DailyActionCenterFilter),
    job_id: selected ?? (p.job_id as string | null),
  });
}
export async function inspectPriorityAction(
  view: PriorityActionsRead,
  key: string,
) {
  const b = current(view),
    row = view.cards.find((t) => t.key === key),
    job = pin(b.input);
  if (!row?.job_id || (job !== null && row.job_id !== job))
    throw Error('Exact visible priority source required');
  const retained = b.tasks.get(key);
  if (retained) {
    return retained;
  }
  if (b.inspecting.has(key))
    throw Error('Priority source inspection already pending');
  b.inspecting.add(key);
  try {
    const task = await openDailyActionSource(view, key);
    check(b);
    b.tasks.set(key, task);
    tasks.set(task, b);
    return task;
  } catch (error) {
    hold(b);
    throw error;
  } finally {
    b.inspecting.delete(key);
  }
}
export function priorityOriginalProps(
  view: PriorityActionsRead,
  jobId: string,
) {
  const b = current(view),
    selected = pin(b.input);
  if (
    typeof jobId !== 'string' ||
    (selected !== null && jobId !== selected) ||
    view.jobs.filter((j) => j.target.job_id === jobId).length !== 1
  )
    throw Error('Exact original priority job required');
  let props = b.controls.get(jobId);
  if (!props) {
    const entry = b.capture.entries.find((e) => e.target.job_id === jobId)!;
    // An exact handle subset over the SAME canonical repositories prevents an
    // original per-job finite read from preclaiming unrelated portfolio jobs.
    const sources: OperatingSources = { ...b.sources, entries: [entry] };
    captureOperatingSources(sources, b.gate).check();
    props = Object.freeze({ sources, selectedJobId: jobId });
    b.controls.set(jobId, props);
  }
  return props;
}
export function priorityContinuationStep(
  task: PrioritySource,
): DailyWorkbenchStep {
  const b = tasks.get(task);
  if (!b) throw Error('Exact inspected priority source required');
  check(b);
  const job = openDailyActionJob(b.review!, task.target.job_id!);
  if (job.target.job_id !== task.target.job_id)
    throw Error('Exact original source job required');
  switch (task.source.kind) {
    case 'report':
      return 'customer';
    case 'finance':
      return 'finance';
    case 'visit':
    case 'time':
      return 'field';
    case 'issued':
      return 'priorities';
    default:
      throw Error('Original source destination UNKNOWN');
  }
}
class Withdrawn extends Error {}
function callback(expected: PriorityContinue, live: PriorityLiveCallback) {
  const p = prototypeFields(live, ['current', 'generation']);
  if (
    Object.keys(p).length !== 2 ||
    typeof expected !== 'function' ||
    p.current !== expected ||
    typeof p.generation !== 'number' ||
    !Number.isSafeInteger(p.generation) ||
    p.generation < 0
  )
    throw new Withdrawn('Priority callback withdrawn or replaced');
  return p.generation;
}
/** Original pure source revalidation; no new inspection window. Original control deadlines remain separate. */
export async function continuePriorityAction(
  view: PriorityActionsRead,
  task: PrioritySource,
  expected: PriorityContinue,
  live: PriorityLiveCallback,
) {
  const b = current(view),
    generation = callback(expected, live);
  if (tasks.get(task) !== b)
    throw Error('Exact retained priority inspection required');
  if (b.pending) throw Error('Priority continuation already pending');
  const key = JSON.stringify([b.capture.organization_id, task.target.job_id]);
  let claims = pendingClaims.get(b.operations);
  if (!claims) pendingClaims.set(b.operations, (claims = new Map()));
  if (claims.has(key))
    throw Error('Priority continuation already pending for the canonical job');
  const claim = {};
  claims.set(key, claim); // Before the first await, across retained wrappers.
  b.pending = true;
  let invoked = false;
  try {
    const result = await inspectDailyActionCenter(view);
    check(b);
    if (result.status !== 'CURRENT_LOCAL_SOURCE')
      throw Error('UNKNOWN original daily source reconciliation');
    openDailyActionJob(view, task.target.job_id!);
    if (callback(expected, live) !== generation)
      throw new Withdrawn('Priority callback withdrawn or replaced');
    const step = priorityContinuationStep(task);
    invoked = true;
    await expected(task.target.job_id!, step);
    current(view);
    if (callback(expected, live) !== generation)
      throw new Withdrawn('Priority callback changed after dispatch');
    return task.target.job_id!;
  } catch (error) {
    if (invoked || !(error instanceof Withdrawn)) hold(b);
    throw error;
  } finally {
    if (claims.get(key) === claim) claims.delete(key);
    b.pending = false;
  }
}
