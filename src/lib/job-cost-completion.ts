import type { LocalJobMargin } from '../domain/jobs/margin-analysis';
import type { Job } from '../domain/jobs/financials';

export interface CompletionReviewAdmission {
  enabled: boolean;
  confirmed: boolean;
}
const denied = () =>
  new Error('Exact cost-to-complete review evidence unavailable');
/** Only own primitive confirmations; re-read the original admission across waits. */
export function completionReviewGuard(input: CompletionReviewAdmission) {
  return () => {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype)
      throw denied();
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== 2 ||
      !keys.includes('enabled') ||
      !keys.includes('confirmed')
    )
      throw denied();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      !('value' in descriptors.enabled) ||
      !('value' in descriptors.confirmed) ||
      descriptors.enabled.value !== true ||
      descriptors.confirmed.value !== true
    )
      throw new Error(
        'Enable and explicitly confirm this local cost review first',
      );
  };
}
function minor(value: number, signed = false) {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > 9e12 ||
    (!signed && value < 0)
  )
    throw denied();
  return value;
}
function total(values: number[], signed = false) {
  const value = values.reduce(
    (sum, value) => sum + BigInt(minor(value, signed)),
    0n,
  );
  if (value < -9000000000000n || value > 9000000000000n) throw denied();
  return minor(Number(value), signed);
}
function immutable<T>(input: T): Readonly<T> {
  if (input && typeof input === 'object') {
    Object.values(input).forEach(immutable);
    Object.freeze(input);
  }
  return input;
}
/** A read-only decomposition of the canonical projection, never a second cost engine.
 * Current authorization and full source validation belong to LocalJobMarginReader.
 */
export function projectJobCostCompletion(
  margin: LocalJobMargin,
  job: Job | null,
) {
  const base = {
    mode: 'local-synthetic-read-only' as const,
    scope: { ...margin.scope },
    status: margin.status,
    coverage: margin.coverage ? { ...margin.coverage } : null,
    reasons: [...margin.reasons],
    authority:
      'Staff cost review only. Forecasts and internal expense records are not verified physical completion, bank payment, refund, settlement or financial authority.',
    providerEvidence: {
      status: 'UNKNOWN' as const,
      eventIds: [] as string[],
      voidStatus: 'UNKNOWN' as const,
      refundStatus: 'UNKNOWN' as const,
      settlementStatus: 'UNKNOWN' as const,
      reason:
        'Existing job expenses have no exact release payment-event or invoice relationship. Credits are internal cost adjustments; they do not prove a refund or void.',
    },
    laborSource: {
      entryIds:
        margin.status === 'UNKNOWN' ? [] : [...margin.source.laborEntryIds],
      lockedPeriodIds:
        margin.status === 'UNKNOWN' ? [] : [...margin.source.lockedPeriodIds],
      meaning:
        'Recorded locked labor cost, not available hours or payroll payment.',
    },
  };
  if (margin.status === 'UNKNOWN' || !margin.totals || !job)
    return immutable({ ...base, totals: null, expenses: [], categories: [] });
  if (
    job.id !== margin.scope.jobId ||
    job.organization_id !== margin.scope.organizationId ||
    job.lock_revision !== margin.scope.jobRevision ||
    job.baseline.issued_version_id !== margin.scope.issuedVersionId ||
    job.baseline.currency !== margin.scope.currency ||
    JSON.stringify(job.expenses.map((row) => row.id).sort()) !==
      JSON.stringify([...margin.source.expenseIds].sort()) ||
    JSON.stringify(job.events.map((row) => row.id).sort()) !==
      JSON.stringify([...margin.source.reviewEventIds].sort())
  )
    throw denied();
  const categories = margin.categories.map((row) => ({
    category: row.category,
    recordedMinor: minor(row.recordedMinor, true),
    unpaidCommitmentMinor: minor(row.unpaidCommitmentMinor),
    remainingForecastMinor: minor(row.forecastMinor),
    costToCompleteMinor: total([row.unpaidCommitmentMinor, row.forecastMinor]),
    projectedMinor: minor(row.projectedMinor, true),
  }));
  const recordedMinor = total(
    categories.map((row) => row.recordedMinor),
    true,
  );
  const unpaidCommitmentMinor = total(
    categories.map((row) => row.unpaidCommitmentMinor),
  );
  const remainingForecastMinor = total(
    categories.map((row) => row.remainingForecastMinor),
  );
  const costToCompleteMinor = total([
    unpaidCommitmentMinor,
    remainingForecastMinor,
  ]);
  const projectedMinor = total([recordedMinor, costToCompleteMinor], true);
  if (projectedMinor !== margin.totals.projectedCostMinor) throw denied();
  const expenses = job.expenses.map((expense) => {
    // Quantities are metadata only: never recalculate amount or infer unit conversion.
    if (
      (expense.quantity_milli !== null &&
        (!Number.isSafeInteger(expense.quantity_milli) ||
          expense.quantity_milli <= 0 ||
          expense.quantity_milli > 9e12)) ||
      (expense.unit_cost_minor !== null &&
        (!Number.isSafeInteger(expense.unit_cost_minor) ||
          expense.unit_cost_minor < 0 ||
          expense.unit_cost_minor > 9e12)) ||
      (expense.unit !== null &&
        (typeof expense.unit !== 'string' ||
          !expense.unit.trim() ||
          expense.unit.length > 40))
    )
      throw denied();
    const review = job.events.find((row) => row.submission_id === expense.id);
    return {
      id: expense.id,
      category: expense.category,
      kind: expense.kind,
      amountMinor: minor(expense.amount_minor),
      quantityMilli: expense.quantity_milli,
      unit: expense.unit,
      sourceLineId: expense.estimate_line_id,
      submittedAt: expense.submitted_at,
      review: review
        ? {
            id: review.id,
            decision: review.decision,
            createdAt: review.created_at,
          }
        : null,
      inclusion:
        review?.decision === 'approved'
          ? ('CANONICAL_SOURCE' as const)
          : ('EXCLUDED' as const),
      adjustsExpenseId:
        expense.kind === 'credit' ? expense.adjusts_expense_id! : null,
      meaning:
        expense.kind === 'credit'
          ? 'Internal approved-cost adjustment; no provider refund or void evidence.'
          : expense.kind === 'commitment'
            ? 'Canonical purchase commitment; remaining amount is net of recorded purchase costs.'
            : 'Internal recorded expense; bank payment is not established.',
    };
  });
  return immutable({
    ...base,
    totals: {
      recordedMinor,
      unpaidCommitmentMinor,
      remainingForecastMinor,
      costToCompleteMinor,
      projectedMinor,
      currency: margin.scope.currency,
    },
    categories,
    expenses,
  });
}
export type JobCostCompletionReview = ReturnType<
  typeof projectJobCostCompletion
>;
