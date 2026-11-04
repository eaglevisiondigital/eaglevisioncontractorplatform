import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import { freezePrototype } from '../program/prototype-source';
import {
  evidenceFields,
  evidenceList,
  evidenceText,
} from './saved-evidence-runtime';
import {
  readTaskCustodyReview,
  inspectTaskCustodyReview,
  type TaskCustodySnapshot,
} from './task-custody-review';
import { readFieldSavedRevision } from './field-saved-revisions';
import {
  assertSavedRevisionCurrent,
  readSavedRevision,
} from './saved-revision-runtime';

type Row = TaskCustodySnapshot['evidence']['available_tasks'][number];
const keys = [
  'id',
  'job_id',
  'worker_id',
  'corrects_id',
  'task',
  'kind',
  'started_at',
  'ended_at',
  'billable',
  'submitted',
  'review',
] as const;
const id = (value: unknown) => {
  const result = evidenceText(value, 200);
  if (!result || result !== result.trim())
    throw Error('Exact task identity required');
  return result;
};
/** Read-only graph diagnostics, never a time/payroll engine or winner selector. */
export function analyzeTaskRevisionGraph(input: unknown) {
  const rows = evidenceList(input, 1000).map((value) => {
    const f = evidenceFields(value, keys);
    for (const key of ['id', 'job_id', 'worker_id'] as const) id(f[key]);
    if (f.corrects_id !== null) id(f.corrects_id);
    if (
      typeof f.billable !== 'boolean' ||
      typeof f.submitted !== 'boolean' ||
      !['work', 'break_paid', 'break'].includes(f.kind as string) ||
      ![null, 'approved', 'rejected'].includes(f.review as null | string)
    )
      throw Error('Canonical task fields required');
    evidenceText(f.task, 2000);
    evidenceText(f.started_at, 100);
    if (f.ended_at !== null) evidenceText(f.ended_at, 100);
    return f as unknown as Row;
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error('Duplicate task IDs are ambiguous');
  const byId = new Map(rows.map((row) => [row.id, row]));
  const successors = new Map<string, Row[]>();
  for (const row of rows)
    if (row.corrects_id)
      successors.set(row.corrects_id, [
        ...(successors.get(row.corrects_id) ?? []),
        row,
      ]);
  const issues: {
    code:
      | 'MISSING_PREDECESSOR'
      | 'CROSS_SOURCE_PREDECESSOR'
      | 'COMPETING_CORRECTIONS'
      | 'CYCLE';
    entry_id: string;
    related_ids: string[];
  }[] = [];
  const nodes = rows.map((row) => {
    const children = successors.get(row.id) ?? [];
    const parent = row.corrects_id ? byId.get(row.corrects_id) : undefined;
    if (row.corrects_id && !parent)
      issues.push({
        code: 'MISSING_PREDECESSOR',
        entry_id: row.id,
        related_ids: [row.corrects_id],
      });
    if (
      parent &&
      (parent.job_id !== row.job_id || parent.worker_id !== row.worker_id)
    )
      issues.push({
        code: 'CROSS_SOURCE_PREDECESSOR',
        entry_id: row.id,
        related_ids: [parent.id],
      });
    if (children.length > 1)
      issues.push({
        code: 'COMPETING_CORRECTIONS',
        entry_id: row.id,
        related_ids: children.map((r) => r.id).sort(),
      });
    const path: string[] = [],
      seen = new Set<string>();
    let cursor: Row | undefined = row;
    while (cursor) {
      if (seen.has(cursor.id)) {
        issues.push({ code: 'CYCLE', entry_id: row.id, related_ids: path });
        break;
      }
      seen.add(cursor.id);
      path.push(cursor.id);
      cursor = cursor.corrects_id ? byId.get(cursor.corrects_id) : undefined;
    }
    return {
      ...row,
      predecessor_id: row.corrects_id,
      successor_ids: children.map((r) => r.id).sort(),
      linkage: children.length
        ? ('SUCCESSOR_RECORDED' as const)
        : ('NO_SUCCESSOR_OBSERVED' as const),
      review_state:
        row.review === 'approved' && row.submitted && row.ended_at
          ? ('CLOSED_SUBMITTED_APPROVED' as const)
          : ('INTERNAL_REVIEW_INCOMPLETE' as const),
    };
  });
  return freezePrototype({
    nodes,
    issues,
    consistency: issues.length
      ? ('CONFLICT_REVIEW_REQUIRED' as const)
      : ('AVAILABLE_LINKS_CONSISTENT' as const),
    complete_history: false as const,
    selected_winner: null,
    physical_completion: 'UNVERIFIED' as const,
    payroll: false as const,
  });
}
export async function readTaskRevisionConsistency(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const custody = await readTaskCustodyReview(sources, jobId, gate),
    order = await readFieldSavedRevision(sources, jobId, gate),
    data = inspectTaskCustodyReview(custody);
  assertSavedRevisionCurrent(order);
  if (JSON.stringify(custody.identity) !== JSON.stringify(order.identity))
    throw Error('Exact work-order/task identity required');
  const graph = analyzeTaskRevisionGraph(data.available_tasks);
  for (const task of graph.nodes) {
    const recorded = order.evidence.tasks.find((r) => r.id === task.id);
    if (
      !recorded ||
      recorded.worker_id !== task.worker_id ||
      recorded.corrects_id !== task.corrects_id ||
      recorded.task !== task.task ||
      recorded.started_at !== task.started_at ||
      recorded.ended_at !== task.ended_at ||
      recorded.submitted !== task.submitted ||
      (['approved', 'rejected'].includes(recorded.review)
        ? recorded.review
        : null) !== task.review
    )
      throw Error('Exact work-order task evidence required');
  }
  return readSavedRevision(
    sources,
    jobId,
    'field',
    gate,
    () => ({
      graph,
      receipt: data.receipt,
      custody: data.status,
      receipt_consistency:
        data.receipt.state === 'UNKNOWN'
          ? ('HELD_UNKNOWN' as const)
          : data.receipt.state === 'PENDING'
            ? ('PENDING' as const)
            : data.receipt.state === 'NOT_ATTEMPTED'
              ? ('NO_COMMAND_RECEIPT' as const)
              : data.receipt.observed === 'EXACT_RESULT_OBSERVED'
                ? ('EXACT_RESULT_LINKED' as const)
                : ('RESULT_NOT_VERIFIED' as const),
      work_order: {
        source: order.evidence.source,
        assignment_state: order.evidence.assignment_state,
        visits: order.evidence.visits.map((v) => ({
          id: v.id,
          plan_id: v.plan_id,
          revision: v.revision,
          status: v.status,
          phase: v.phase,
        })),
        plans: order.evidence.plans.map((p) => ({
          id: p.id,
          revision: p.revision,
        })),
      },
      coverage: 'AVAILABLE_EXACT_JOB_ASSIGNED_WORKER_ONLY' as const,
      source_atomicity: 'CAPTURED_NOT_ATOMIC' as const,
      replay: 'FORBIDDEN' as const,
      write: false as const,
      dispatch: false as const,
      financial: false as const,
    }),
    () => {
      inspectTaskCustodyReview(custody);
      assertSavedRevisionCurrent(order);
    },
  );
}
export type TaskRevisionSnapshot = Awaited<
  ReturnType<typeof readTaskRevisionConsistency>
>;
export function inspectTaskRevisionConsistency(snapshot: TaskRevisionSnapshot) {
  assertSavedRevisionCurrent(snapshot);
  return snapshot.evidence;
}
/** Selection names one observed ID. It cannot infer the newest/effective record. */
export function selectTaskRevisionLineage(
  snapshot: TaskRevisionSnapshot,
  entryId: string,
) {
  const data = inspectTaskRevisionConsistency(snapshot),
    selected = data.graph.nodes.find((r) => r.id === id(entryId));
  if (!selected) throw Error('Selected exact task is unavailable; no fallback');
  const connected = new Set([selected.id]);
  for (let i = 0; i < data.graph.nodes.length; i++)
    for (const row of data.graph.nodes)
      if (connected.has(row.id) && row.predecessor_id)
        connected.add(row.predecessor_id);
      else if (row.predecessor_id && connected.has(row.predecessor_id))
        connected.add(row.id);
  return freezePrototype({
    selected_id: selected.id,
    nodes: data.graph.nodes.filter((r) => connected.has(r.id)),
    issues: data.graph.issues.filter((i) => connected.has(i.entry_id)),
    receipt_link:
      selected.id === data.receipt.source_id
        ? ('EXACT_RECEIPT_SOURCE' as const)
        : selected.id === data.receipt.result_id
          ? ('EXACT_RECEIPT_RESULT' as const)
          : ('NOT_ATTRIBUTED_TO_RECEIPT' as const),
    selected_winner: null,
    replay: 'FORBIDDEN' as const,
  });
}
export function taskRevisionDestination(
  snapshot: TaskRevisionSnapshot,
  entryId: string,
) {
  selectTaskRevisionLineage(snapshot, entryId);
  return { job_id: snapshot.identity.job_id, step: 'field' as const };
}
