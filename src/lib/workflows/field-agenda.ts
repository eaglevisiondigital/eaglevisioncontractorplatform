import { Temporal } from '@js-temporal/polyfill';
import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type { DailyWorkbenchStep } from './daily-workbench-contract';
import {
  readFieldWorkspace,
  assertFieldWorkspaceNow,
  reconcileFieldWorkspace,
  type FieldWorkspaceView,
} from './field-workspace';

function admit(gate: JourneyAdmission) {
  const f = prototypeFields(gate, ['enabled', 'confirmed']);
  if (f.enabled !== true || f.confirmed !== true)
    throw Error('Explicit local field agenda review required');
}
interface Binding {
  capture: ReturnType<typeof captureOperatingSources>;
  gate: JourneyAdmission;
  workspaces: Map<string, FieldWorkspaceView>;
  outcomes: Map<string, 'PENDING' | 'UNKNOWN'>;
  unknown: boolean;
}
const retained = new WeakMap<object, Binding>();
// Ephemeral navigation outcomes only. They follow canonical repositories, not replaceable wrappers.
const outcomes = new WeakMap<
  OperatingSources['operations'],
  Map<string, 'PENDING' | 'UNKNOWN'>
>();
const key = (org: string, job: string) => JSON.stringify([org, job]);
function check(b: Binding) {
  try {
    admit(b.gate);
    b.capture.check();
    if (b.unknown) throw Error('Field agenda UNKNOWN');
    for (const workspace of b.workspaces.values())
      assertFieldWorkspaceNow(workspace);
  } catch (error) {
    b.unknown = true;
    throw error;
  }
}
/** An allowlisted agenda over unchanged exact field readers. No task or schedule records are created. */
export async function readFieldAgenda(
  sources: OperatingSources,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  admit(gate); // OFF before source getters.
  const root = prototypeFields(sources, [
      'company',
      'operations',
      'estimates',
      'property',
      'entries',
      'gate',
    ]),
    capture = captureOperatingSources(sources, gate),
    operations = root.operations as OperatingSources['operations'],
    holds =
      outcomes.get(operations) ?? new Map<string, 'PENDING' | 'UNKNOWN'>();
  outcomes.set(operations, holds); // Pin before the first await.
  const b: Binding = {
    capture,
    gate,
    workspaces: new Map(),
    outcomes: holds,
    unknown: false,
  };
  for (const entry of capture.entries) {
    const workspace = await readFieldWorkspace(
      sources,
      { job_id: entry.target.job_id!, worker_id: '' },
      gate,
    );
    check(b);
    b.workspaces.set(workspace.source.job_id, workspace);
  }
  const rows = [...b.workspaces.values()].map((workspace) => ({
    key: key(capture.organization_id, workspace.source.job_id),
    source: workspace.source,
    job: workspace.job,
    day: workspace.day,
    timezone: workspace.timezone,
    crew: workspace.crew,
    visits: workspace.visits,
    reports: workspace.reports,
    reported_statuses: [
      ...new Set(workspace.visits.map((v) => v.recorded_status)),
    ],
    source_sha256: workspace.integrity.sha256,
    actual_availability: 'UNKNOWN' as const,
    physical_completion: 'UNVERIFIED' as const,
  }));
  const body = {
    mode: 'LOCAL_FIELD_AGENDA' as const,
    organization_id: capture.organization_id,
    rows,
    available_jobs: rows.length,
    coverage: 'AVAILABLE_EXACT_JOB_RECORDS_ONLY' as const,
    count_is_complete: false as const,
    authority: {
      dispatch: false,
      assign: false,
      schedule: false,
      write: false,
      complete: false,
      financial: false,
      communicate: false,
    },
    custody: 'SAME_TAB_REFERENCE_ONLY' as const,
  };
  const sha256 = await documentHash(body);
  check(b);
  const view = freezePrototype({
    ...body,
    integrity: { algorithm: 'SHA-256' as const, sha256 },
  });
  retained.set(view, b);
  return view;
}
export type FieldAgendaView = Awaited<ReturnType<typeof readFieldAgenda>>;
export interface FieldAgendaFilter {
  query: string;
  day: string;
  period: 'day' | 'week' | 'all';
  worker_id: string;
  status: string;
}
export function assertFieldAgendaNow(view: FieldAgendaView) {
  const b = retained.get(view);
  if (!b) throw Error('Exact retained field agenda required');
  check(b);
}
export function filterFieldAgenda(
  view: FieldAgendaView,
  input: FieldAgendaFilter,
) {
  assertFieldAgendaNow(view);
  const f = prototypeFields(input, [
    'query',
    'day',
    'period',
    'worker_id',
    'status',
  ]);
  if (
    Object.keys(f).length !== 5 ||
    typeof f.query !== 'string' ||
    f.query.length > 200 ||
    typeof f.day !== 'string' ||
    typeof f.worker_id !== 'string' ||
    typeof f.status !== 'string' ||
    !['day', 'week', 'all'].includes(f.period as string)
  )
    throw Error('Exact bounded field agenda filters required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.day))
    throw Error('Exact valid calendar day required');
  const start = Temporal.PlainDate.from(f.day, { overflow: 'reject' }),
    through =
      f.period === 'week'
        ? start.add({ days: 6 }).toString()
        : start.toString();
  if (
    f.worker_id &&
    !view.rows.some((r) => r.crew.some((w) => w.worker_id === f.worker_id))
  )
    throw Error('Exact recorded technician required');
  if (
    f.status !== 'all' &&
    !view.rows.some((r) => r.reported_statuses.includes(f.status as never))
  )
    throw Error('Exact recorded inspection status required');
  const query = f.query.toLocaleLowerCase(),
    rows = view.rows.filter(
      (r) =>
        (f.period === 'all' ||
          (r.day >= start.toString() && r.day <= through)) &&
        (!f.worker_id || r.crew.some((w) => w.worker_id === f.worker_id)) &&
        (f.status === 'all' ||
          r.reported_statuses.includes(f.status as never)) &&
        [
          r.job.title,
          r.job.customer_label,
          r.job.property_label,
          r.source.job_id,
        ].some((v) => v.toLocaleLowerCase().includes(query)),
    );
  // Date-only co-occurrence is a review signal, never an inferred timed conflict or availability.
  const signals = rows.flatMap((r) =>
    r.crew
      .filter((w) =>
        rows.some(
          (other) =>
            other !== r &&
            other.day === r.day &&
            other.crew.some((ow) => ow.worker_id === w.worker_id),
        ),
      )
      .map((w) => ({
        job_id: r.source.job_id,
        worker_id: w.worker_id,
        day: r.day,
        state: 'DATE_ONLY_REVIEW_REQUIRED' as const,
      })),
  );
  assertFieldAgendaNow(view);
  return freezePrototype({
    rows,
    matching_jobs: rows.length,
    available_jobs: view.available_jobs,
    signals,
    timed_conflicts: 'UNKNOWN' as const,
    actual_availability: 'UNKNOWN' as const,
    coverage: view.coverage,
  });
}
export async function reconcileFieldAgenda(view: FieldAgendaView) {
  const b = retained.get(view),
    result = {
      status: 'UNKNOWN' as 'UNKNOWN' | 'CURRENT_REVIEW_ONLY',
      replay: 'FORBIDDEN' as const,
      replacement: null,
    };
  if (!b) return result;
  try {
    check(b);
    for (const workspace of b.workspaces.values()) {
      if (
        (await reconcileFieldWorkspace(workspace)).status !==
        'CURRENT_REVIEW_ONLY'
      )
        throw Error('Original field evidence changed');
      check(b);
    }
    if (view.rows.some((row) => b.outcomes.get(row.key) === 'UNKNOWN'))
      return result;
    return { ...result, status: 'CURRENT_REVIEW_ONLY' as const };
  } catch {
    b.unknown = true;
    return result;
  }
}
export async function inspectFieldAgendaJob(
  view: FieldAgendaView,
  jobId: string,
) {
  const b = retained.get(view);
  if (!b || !b.workspaces.has(jobId))
    throw Error('Exact displayed field job required');
  check(b);
  if (
    (await reconcileFieldWorkspace(b.workspaces.get(jobId)!)).status !==
    'CURRENT_REVIEW_ONLY'
  )
    throw Error('Field agenda UNKNOWN');
  check(b);
  const workspace = b.workspaces.get(jobId)!;
  return { row: view.rows.find((r) => r.source.job_id === jobId)!, workspace };
}
/** Local presentation continuation only. Withdrawal before invocation is known no-dispatch. */
export async function continueFieldAgenda(
  view: FieldAgendaView,
  jobId: string,
  callback: (jobId: string, step: DailyWorkbenchStep) => void | Promise<void>,
  stillCurrent: () => boolean = () => true,
) {
  const b = retained.get(view);
  if (
    !b ||
    !b.workspaces.has(jobId) ||
    typeof callback !== 'function' ||
    typeof stillCurrent !== 'function'
  )
    throw Error('Exact displayed field continuation required');
  check(b);
  const navigationKey = key(view.organization_id, jobId);
  if (b.outcomes.has(navigationKey))
    throw Error('Field continuation pending or UNKNOWN; exact read only');
  b.outcomes.set(navigationKey, 'PENDING');
  let invoked = false;
  try {
    await inspectFieldAgendaJob(view, jobId);
    check(b);
    if (!stillCurrent())
      return { status: 'WITHDRAWN' as const, dispatch: false as const };
    check(b);
    invoked = true;
    await callback(jobId, 'finance');
    check(b);
    if (!stillCurrent())
      throw Error('Field continuation lease changed after invocation');
    check(b);
    return {
      status: 'LOCAL_NAVIGATION_ONLY' as const,
      dispatch: false as const,
    };
  } catch (error) {
    if (invoked || b.unknown) {
      b.unknown = true;
      b.outcomes.set(navigationKey, 'UNKNOWN');
    }
    throw error;
  } finally {
    if (b.outcomes.get(navigationKey) === 'PENDING')
      b.outcomes.delete(navigationKey);
  }
}
