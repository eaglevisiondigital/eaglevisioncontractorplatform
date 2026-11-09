import type { Phase3Repository } from '../../lib/phase3';
import { jobFinancials, type Job } from '../../domain/jobs/financials';

export type ExpenseReviewDecision = 'approved' | 'rejected';
// Ephemeral UI attempt guards only; never business state or restart custody.
const attempts = new WeakMap<Phase3Repository, Set<string>>();
export function expenseReviewAttempted(
  repo: Phase3Repository,
  org: string,
  jobId: string,
  expenseId: string,
) {
  return attempts.get(repo)?.has(`${org}/${jobId}/${expenseId}`) ?? false;
}
/** Local form preflight only. Original repository owns the append and financial validation. */
export function expenseReviewPreflight(
  org: string,
  displayed: Job,
  current: Job | null,
  expenseId: string,
  admin: boolean,
  decision: ExpenseReviewDecision,
  reason: string,
  confirmed: boolean,
) {
  if (!admin) throw Error('Management authorization required');
  if (!confirmed) throw Error('Confirm this exact submission and decision');
  const explanation = reason.trim();
  if (!explanation || explanation.length > 2000)
    throw Error('Provide a review reason of 1–2000 characters');
  if (decision !== 'approved' && decision !== 'rejected')
    throw Error('Unknown review decision');
  const expense = displayed.expenses.find((e) => e.id === expenseId);
  const actual = current?.expenses.find((e) => e.id === expenseId);
  if (
    !current ||
    displayed.organization_id !== org ||
    current.organization_id !== org ||
    current.id !== displayed.id ||
    current.lock_revision !== displayed.lock_revision ||
    JSON.stringify(current.baseline) !== JSON.stringify(displayed.baseline) ||
    !expense ||
    expense.job_id !== displayed.id ||
    !actual ||
    JSON.stringify(actual) !== JSON.stringify(expense) ||
    current.events.some((e) => e.submission_id === expenseId) ||
    displayed.events.some((e) => e.submission_id === expenseId)
  )
    throw Error('Expense or job changed; reload before reviewing');
  // Reuse the canonical calculation, including duplicate and credit safeguards.
  jobFinancials({
    ...current,
    events: [
      ...current.events,
      {
        id: '',
        submission_id: expenseId,
        decision,
        reason: explanation,
        created_at: '',
      },
    ],
  });
  return explanation;
}

export function reviewSampleExpense(
  repo: Phase3Repository,
  org: string,
  displayed: Job,
  expenseId: string,
  admin: boolean,
  decision: ExpenseReviewDecision,
  reason: string,
  confirmed: boolean,
) {
  if (!repo.sample) throw Error('Local sample review only');
  const key = `${org}/${displayed.id}/${expenseId}`;
  if (expenseReviewAttempted(repo, org, displayed.id, expenseId))
    throw Error('Review already attempted; exact read only');
  const explanation = expenseReviewPreflight(
    org,
    displayed,
    repo.syntheticJob(org, displayed.id),
    expenseId,
    admin,
    decision,
    reason,
    confirmed,
  );
  const held = attempts.get(repo) ?? new Set<string>();
  held.add(key);
  attempts.set(repo, held);
  // No asynchronous gap between the source fence and original sample writer.
  return repo.reviewExpense(
    org,
    displayed.id,
    expenseId,
    decision,
    explanation,
  );
}
