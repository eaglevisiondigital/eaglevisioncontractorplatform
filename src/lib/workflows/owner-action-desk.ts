import { freezePrototype } from '../program/prototype-source';
import {
  ownerBriefingGuideEnabled,
  readOwnerBriefingGuide,
  assertOwnerBriefingGuideCurrent,
  filterOwnerBriefingGuide,
  openOwnerBriefingTask,
  assertOwnerBriefingTaskCurrent,
  inspectOwnerBriefingDestination,
  assertOwnerBriefingDestinationCurrent,
  navigateOwnerBriefingTask,
  returnOwnerBriefingTask,
  type OwnerBriefingReview,
  type OwnerBriefingFilter,
  type OwnerBriefingTask,
  type OwnerBriefingDestination,
} from './owner-briefing-guide';
import type { OperatingJobSection } from './operating-navigation';

// One original finite source set, priority order, inspection hold and clock.
// These are retained presentation references, not a new Copilot/action engine.
export const ownerActionDeskEnabled = ownerBriefingGuideEnabled;
export const readOwnerActionDesk = readOwnerBriefingGuide;
export const assertOwnerActionDeskReviewCurrent =
  assertOwnerBriefingGuideCurrent;
export const filterOwnerActionDesk = filterOwnerBriefingGuide;
export type OwnerActionDeskReview = OwnerBriefingReview;
export type OwnerActionDeskFilter = OwnerBriefingFilter;
const denied = () =>
  Error(
    'Exact current owner task required; UNKNOWN has no replay, replacement or renewed expiry',
  );
const unknown = () =>
  freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
const retained = new WeakMap<
  object,
  {
    task: OwnerBriefingTask;
    destination: OwnerBriefingDestination;
    uncertain: boolean;
    navigated: boolean;
  }
>();

/** One explicit original inspection also exposes its synchronous destination
 * checks, removing an extra presentation-only stage without bypassing inspection. */
export async function openOwnerActionDeskTask(
  review: OwnerBriefingReview,
  key: string,
  selectedJobId?: string,
) {
  assertOwnerBriefingGuideCurrent(review);
  const task = await openOwnerBriefingTask(review, key, selectedJobId);
  assertOwnerBriefingTaskCurrent(task, selectedJobId);
  const destination = inspectOwnerBriefingDestination(task, selectedJobId);
  const result = freezePrototype({
    mode: 'RETAINED_OWNER_ACTION_REVIEW' as const,
    anchor: task.anchor,
    context: task.context,
    original_rank: task.original_rank,
    recorded_fact: task.recorded_fact,
    next_review: task.recommended_manual_review,
    why_this_order: task.why_this_order,
    order_reasons: task.order_reasons,
    missing_evidence: task.missing_evidence,
    verification: task.verification,
    destination: destination.destination,
    inspected_at: task.inspected_at,
    expires_at: task.expires_at,
    authority: task.authority,
    meaning:
      'Source-verified suggestion for human review only. This is not an approved action, dispatch, customer instruction or financial authority.',
  });
  assertOwnerBriefingDestinationCurrent(destination, selectedJobId);
  retained.set(result, {
    task,
    destination,
    uncertain: false,
    navigated: false,
  });
  return result;
}
export type OwnerActionDeskTask = Awaited<
  ReturnType<typeof openOwnerActionDeskTask>
>;
export function assertOwnerActionDeskTaskCurrent(
  task: OwnerActionDeskTask,
  selectedJobId?: string,
) {
  const record = retained.get(task);
  if (!record || record.uncertain) throw denied();
  try {
    assertOwnerBriefingTaskCurrent(record.task, selectedJobId);
    assertOwnerBriefingDestinationCurrent(record.destination, selectedJobId);
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
/** Exact read-only currentness/reconciliation only; no second inspection, ranking,
 * source read, command attempt, expiry extension or substitution. */
export function returnOwnerActionDeskTask(
  task: OwnerActionDeskTask,
  selectedJobId?: string,
) {
  try {
    assertOwnerActionDeskTaskCurrent(task, selectedJobId);
    const result = returnOwnerBriefingTask(
      retained.get(task)!.task,
      selectedJobId,
    );
    if (result.status === 'UNKNOWN') throw denied();
    return freezePrototype({
      status: 'CURRENT_EXACT_OWNER_TASK_RETURN' as const,
      anchor: task.anchor,
      replacement: null,
    });
  } catch {
    return unknown();
  }
}
export function navigateOwnerActionDeskTask(
  task: OwnerActionDeskTask,
  callback: (jobId: string, section?: OperatingJobSection) => void,
  selectedJobId?: string,
) {
  const record = retained.get(task);
  try {
    assertOwnerActionDeskTaskCurrent(task, selectedJobId);
    if (!record || record.navigated || typeof callback !== 'function')
      throw denied();
    record.navigated = true;
    const result = navigateOwnerBriefingTask(
      record.destination,
      (job, section) => {
        assertOwnerActionDeskTaskCurrent(task, selectedJobId);
        if (job !== task.anchor.job_id || section !== task.anchor.section)
          throw denied();
        callback(job, section);
      },
      selectedJobId,
    );
    if (result.status === 'UNKNOWN') throw denied();
    assertOwnerActionDeskTaskCurrent(task, selectedJobId);
    return freezePrototype({
      status: 'EXACT_OWNER_TASK_NAVIGATION_REQUESTED' as const,
      anchor: task.anchor,
    });
  } catch {
    if (record) record.uncertain = true;
    return unknown();
  }
}
