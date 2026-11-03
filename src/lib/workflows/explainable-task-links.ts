import { freezePrototype } from '../program/prototype-source';
import {
  assertOperatingNavigationCurrent,
  type OperatingNavigationReview,
  type OperatingJobSection,
} from './operating-navigation';
import {
  verifiedTaskHandoffEnabled,
  readVerifiedTaskHandoff,
  inspectVerifiedTaskHandoff,
  assertVerifiedTaskHandoffCurrent,
  navigateVerifiedTaskHandoff,
  type VerifiedTaskHandoffSelection,
} from './verified-task-handoff';

export const explainableTaskLinksEnabled = verifiedTaskHandoffEnabled;
export const readExplainableTaskLinks = readVerifiedTaskHandoff;
const denied = () =>
  Error(
    'Exact current task explanation required; UNKNOWN has no replacement or renewed inspection',
  );
const unknown = () =>
  freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
const links = new WeakMap<
  object,
  { handoff: VerifiedTaskHandoffSelection; uncertain: boolean }
>();
const destinations = new WeakMap<object, { link: ExplainableTaskLink }>();
function hint(jobId: string, selectedJobId?: string) {
  if (
    selectedJobId !== undefined &&
    (typeof selectedJobId !== 'string' || selectedJobId !== jobId)
  )
    throw denied();
}

/** One original C14 inspection. Explanation/destination/return never inspect again,
 * create another priority or renew the original finite window. */
export async function openExplainableTaskLink(
  review: OperatingNavigationReview,
  key: string,
  selectedJobId?: string,
) {
  assertOperatingNavigationCurrent(review);
  if (typeof key !== 'string' || key.length > 700) throw denied();
  const matches = review.tasks.filter((task) => task.key === key);
  if (matches.length !== 1 || !matches[0].job_id) throw denied();
  hint(matches[0].job_id, selectedJobId);
  const handoff = await inspectVerifiedTaskHandoff(review, key);
  assertVerifiedTaskHandoffCurrent(handoff);
  hint(handoff.selected.job_id, selectedJobId);
  const task = handoff.task;
  const result = freezePrototype({
    mode: 'EXACT_EXPLAINABLE_LOCAL_TASK_LINK' as const,
    anchor: {
      ...handoff.selected,
      target: { ...handoff.target },
      source_sha256: handoff.source_sha256,
      review_on: review.review_on,
      timezone: review.timezone,
    },
    context: task.context,
    original_rank: task.rank,
    recorded_fact: task.recorded_fact,
    recommended_manual_review: task.suggested_human_review,
    why_this_order: task.why_this_order,
    order_reasons: task.order_reasons,
    missing_evidence: task.missing_evidence,
    verification: task.verification,
    destination: task.navigation,
    inspected_at: handoff.inspected_at,
    expires_at: handoff.expires_at,
    clock_meaning: handoff.clock_meaning,
    authority: handoff.authority,
    meaning:
      'Source-based recommendation for manual review. Original ranking, evidence gaps and all blocked action authority remain unchanged.',
  });
  links.set(result, { handoff, uncertain: false });
  assertExplainableTaskLinkCurrent(result, selectedJobId);
  return result;
}
export type ExplainableTaskLink = Awaited<
  ReturnType<typeof openExplainableTaskLink>
>;
export function assertExplainableTaskLinkCurrent(
  link: ExplainableTaskLink,
  selectedJobId?: string,
) {
  const record = links.get(link);
  if (!record || record.uncertain) throw denied();
  try {
    hint(link.anchor.job_id, selectedJobId);
    assertVerifiedTaskHandoffCurrent(record.handoff);
  } catch {
    record.uncertain = true;
    throw denied();
  }
}
/** A synchronous presentation stage over the same retained inspected handoff. */
export function inspectExplainableDestination(
  link: ExplainableTaskLink,
  selectedJobId?: string,
) {
  assertExplainableTaskLinkCurrent(link, selectedJobId);
  const result = freezePrototype({
    anchor: link.anchor,
    destination: link.destination,
    required_checks: link.verification.required_checks,
    facts: link.verification.facts,
    gaps: link.verification.gaps,
    inspected_at: link.inspected_at,
    expires_at: link.expires_at,
    meaning:
      'Only this original local review destination. This stage neither prepares nor executes the recommended business action.',
  });
  assertExplainableTaskLinkCurrent(link, selectedJobId);
  destinations.set(result, { link });
  return result;
}
export type ExplainableTaskDestination = ReturnType<
  typeof inspectExplainableDestination
>;
export function assertExplainableDestinationCurrent(
  destination: ExplainableTaskDestination,
  selectedJobId?: string,
) {
  const record = destinations.get(destination);
  if (!record) throw denied();
  assertExplainableTaskLinkCurrent(record.link, selectedJobId);
}
export function returnExplainableTaskLink(
  link: ExplainableTaskLink,
  selectedJobId?: string,
) {
  try {
    assertExplainableTaskLinkCurrent(link, selectedJobId);
    return freezePrototype({
      status: 'CURRENT_EXACT_SUGGESTION_RETURN' as const,
      anchor: link.anchor,
      replacement: null,
    });
  } catch {
    return unknown();
  }
}
/** The unchanged C14/C13 navigator resolves the original source and workflow state
 * again. A final wrapper check also fences the host's current selected-job hint. */
export function navigateExplainableTaskLink(
  destination: ExplainableTaskDestination,
  callback: (jobId: string, section?: OperatingJobSection) => void,
  selectedJobId?: string,
) {
  const record = destinations.get(destination);
  if (!record || typeof callback !== 'function') return unknown();
  const link = record.link;
  try {
    assertExplainableDestinationCurrent(destination, selectedJobId);
    const result = navigateVerifiedTaskHandoff(
      links.get(link)!.handoff,
      (jobId, section) => {
        assertExplainableDestinationCurrent(destination, selectedJobId);
        if (jobId !== link.anchor.job_id || section !== link.anchor.section)
          throw denied();
        callback(jobId, section);
      },
    );
    if (result.status !== 'EXACT_LOCAL_TASK_REVIEW_REQUESTED') throw denied();
    return freezePrototype({
      status: 'ORIGINAL_TASK_REVIEW_REQUESTED' as const,
      anchor: link.anchor,
    });
  } catch {
    links.get(link)!.uncertain = true;
    return unknown();
  }
}
