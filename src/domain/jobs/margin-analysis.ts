import { uuidPattern } from '../intake';
import { calculateEstimate, validateEstimate } from '../estimating/calculation';
import type { EstimateVersion } from '../estimating/types';
import {
  baselineFromEstimate,
  costCategories,
  jobFinancials,
  type Job,
  type CostCategory,
} from './financials';

export interface MarginScope {
  organizationId: string;
  jobId: string;
  jobRevision: number;
  estimateId: string;
  issuedVersionId: string;
  customerId: string;
  propertyId: string | null;
  currency: string;
}
export interface LaborCoverage {
  status: 'known' | 'unknown';
  currency: string | null;
  unpostedApproved: number;
  unresolved: number;
  entryIds: string[];
  lockedPeriodIds: string[];
}
export interface MarginReviewInput {
  minimumMarginBps: number;
  confirmed: true;
}
/** Exact decimal percent input; no float rounding, coercion or persisted policy. */
export function parseLocalMarginPercent(text: string): number {
  if (typeof text !== 'string')
    throw new Error(
      'Enter a percentage from 0 to 100 with up to two decimal places',
    );
  const match = /^(0|[1-9]\d?|100)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match)
    throw new Error(
      'Enter a percentage from 0 to 100 with up to two decimal places',
    );
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (bps > 10000)
    throw new Error(
      'Enter a percentage from 0 to 100 with up to two decimal places',
    );
  return bps;
}
/** Display an admitted integer ratio exactly, including large or negative ratios. */
export function formatMarginBps(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('Margin ratio unavailable');
  const bps = BigInt(value),
    absolute = bps < 0n ? -bps : bps;
  return `${bps < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}%`;
}
function admitReview(
  input: MarginReviewInput | null | undefined,
): MarginReviewInput | null {
  if (input == null) return null;
  if (
    Object.keys(input).sort().join(',') !== 'confirmed,minimumMarginBps' ||
    input.confirmed !== true ||
    !Number.isSafeInteger(input.minimumMarginBps) ||
    input.minimumMarginBps < 0 ||
    input.minimumMarginBps > 10000
  )
    throw new Error('Explicit valid local margin review input required');
  return { minimumMarginBps: input.minimumMarginBps, confirmed: true };
}
interface WarningReview {
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  sourceThresholds: {
    categoryOverrunBps: number;
    marginErosionBps: number;
  } | null;
  aboveBudgetCategories: {
    category: CostCategory;
    thresholdExceeded: boolean;
  }[];
  negativeContribution: boolean | null;
  erosionThresholdExceeded: boolean | null;
  minimumMargin: {
    basisPoints: number;
    source: 'local-confirmed-review-input';
    assessment: 'BELOW_INPUT' | 'AT_OR_ABOVE_INPUT' | 'UNAVAILABLE';
  } | null;
}
const fail = () =>
  new Error('Exact local job-cost source evidence unavailable');
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const unique = (values: string[]) => {
  if (values.some((id) => typeof id !== 'string' || !uuidPattern.test(id)))
    throw fail();
  if (new Set(values).size !== values.length) throw fail();
};
function integer(value: number, signed = false) {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > 9e12 ||
    (!signed && value < 0)
  )
    throw fail();
}
/** Reject executable/non-JSON data before cloning; never freeze caller-owned input. */
export function detached<T>(value: T): T {
  const visit = (v: unknown, depth: number) => {
    if (depth > 20) throw fail();
    if (v === null || ['string', 'boolean', 'undefined'].includes(typeof v))
      return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw fail();
      return;
    }
    if (
      typeof v !== 'object' ||
      (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype)
    )
      throw fail();
    const descriptors = Object.getOwnPropertyDescriptors(v);
    for (const d of Object.values(descriptors)) {
      if (!('value' in d)) throw fail();
      visit(d.value, depth + 1);
    }
  };
  visit(value, 0);
  return structuredClone(value);
}
function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

/** Internal fixture projection. Authorization belongs to the current-source reader. */
export function projectLocalJobMargin(
  input: {
    scope: MarginScope;
    job: Job | null;
    issued: EstimateVersion | null;
    labor: LaborCoverage;
    review?: MarginReviewInput | null;
  },
  options: { enabled: boolean } = { enabled: false },
) {
  if (options.enabled !== true)
    throw new Error('Local margin analysis is disabled');
  const raw = detached(input);
  const { job, issued, labor } = raw;
  const review = admitReview(raw.review);
  const scope: MarginScope = {
    organizationId: raw.scope.organizationId,
    jobId: raw.scope.jobId,
    jobRevision: raw.scope.jobRevision,
    estimateId: raw.scope.estimateId,
    issuedVersionId: raw.scope.issuedVersionId,
    customerId: raw.scope.customerId,
    propertyId: raw.scope.propertyId,
    currency: raw.scope.currency,
  };
  for (const id of [
    scope.jobId,
    scope.estimateId,
    scope.issuedVersionId,
    scope.customerId,
    ...(scope.propertyId === null ? [] : [scope.propertyId]),
  ])
    if (typeof id !== 'string' || !uuidPattern.test(id)) throw fail();
  if (typeof scope.organizationId !== 'string') throw fail();
  if (
    !['known', 'unknown'].includes(labor.status) ||
    typeof labor.status !== 'string'
  )
    throw fail();
  if (typeof scope.currency !== 'string' || !/^[A-Z]{3}$/.test(scope.currency))
    throw fail();
  integer(scope.jobRevision);
  if (!scope.jobRevision) throw fail();
  for (const count of [labor.unpostedApproved, labor.unresolved])
    integer(count);
  unique(labor.entryIds);
  unique(labor.lockedPeriodIds);
  const base = {
    mode: 'local-synthetic-read-only' as const,
    scope: { ...scope },
    authority:
      'Projected contribution before unallocated overhead and taxes. No final profit, settlement, payroll or provider authority.',
    source: {
      expenseIds: [] as string[],
      reviewEventIds: [] as string[],
      approvedChangeIds: [] as string[],
      laborEntryIds: [...labor.entryIds].sort(),
      lockedPeriodIds: [...labor.lockedPeriodIds].sort(),
    },
  };
  if (
    !job ||
    !issued ||
    !job.labor ||
    labor.status === 'unknown' ||
    labor.currency === null
  )
    return immutable({
      ...base,
      status: 'UNKNOWN' as const,
      reasons: ['Missing exact issued, job or labor coverage evidence'],
      categories: [],
      totals: null,
      coverage: null,
      warningReview: {
        availability: 'UNAVAILABLE',
        sourceThresholds: null,
        aboveBudgetCategories: [],
        negativeContribution: null,
        erosionThresholdExceeded: null,
        minimumMargin: review
          ? {
              basisPoints: review.minimumMarginBps,
              source: 'local-confirmed-review-input',
              assessment: 'UNAVAILABLE',
            }
          : null,
      } satisfies WarningReview,
    });
  if (
    job.organization_id !== scope.organizationId ||
    job.id !== scope.jobId ||
    job.lock_revision !== scope.jobRevision ||
    job.baseline.issued_version_id !== scope.issuedVersionId ||
    issued.id !== scope.issuedVersionId ||
    issued.estimate_id !== scope.estimateId ||
    issued.organization_id !== scope.organizationId ||
    issued.status !== 'issued' ||
    !issued.issued_at ||
    issued.payload.customer_id !== scope.customerId ||
    issued.customer_snapshot.id !== scope.customerId ||
    issued.payload.location_id !== scope.propertyId ||
    (issued.location_snapshot !== null &&
      issued.location_snapshot.id !== scope.propertyId) ||
    job.baseline.currency !== scope.currency ||
    issued.payload.currency !== scope.currency ||
    issued.calculation.currency !== scope.currency ||
    labor.currency !== scope.currency
  )
    throw fail();
  // Preserve engine v1 rounding and the immutable saved tax calculation.
  validateEstimate(issued.payload);
  const calculated = calculateEstimate(
    issued.payload,
    issued.calculation.tax_rate_bps,
  );
  if (
    !equal(calculated, issued.calculation) ||
    !issued.tax_policy_snapshot ||
    issued.tax_policy_snapshot.id !== issued.payload.tax_policy_id ||
    issued.tax_policy_snapshot.organization_id !== scope.organizationId ||
    issued.tax_policy_snapshot.status !== 'reviewed' ||
    issued.tax_policy_snapshot.rate_bps !== calculated.tax_rate_bps
  )
    throw fail();
  const expected = baselineFromEstimate(issued.id, issued.payload, calculated);
  if (!equal(expected, job.baseline)) throw fail();
  if (typeof job.projection.costs_complete !== 'boolean') throw fail();
  for (const category of costCategories) {
    integer(job.baseline.costs[category]);
    integer(job.projection.remaining[category]);
  }
  for (const key of ['seconds', 'billable_seconds'] as const)
    integer(job.labor[key]);
  for (const key of [
    'cash_minor',
    'burden_minor',
    'imputed_minor',
    'billing_minor',
  ] as const)
    integer(job.labor[key], true);
  unique(job.expenses.map((e) => e.id));
  unique(job.events.map((e) => e.id));
  unique(job.events.map((e) => e.submission_id));
  unique(job.changes.map((c) => c.id));
  const approved = new Set<string>();
  for (const event of job.events) {
    const expense = job.expenses.find((e) => e.id === event.submission_id);
    if (
      !expense ||
      !['approved', 'rejected'].includes(event.decision) ||
      typeof event.decision !== 'string' ||
      !Number.isFinite(Date.parse(event.created_at)) ||
      Date.parse(event.created_at) < Date.parse(expense.submitted_at)
    )
      throw fail();
    if (event.decision === 'approved') approved.add(expense.id);
  }
  for (const expense of job.expenses) {
    if (
      expense.job_id !== job.id ||
      !costCategories.includes(expense.category) ||
      expense.category === 'labor' ||
      !['commitment', 'payment', 'credit'].includes(expense.kind) ||
      typeof expense.kind !== 'string' ||
      !Number.isFinite(Date.parse(expense.submitted_at)) ||
      (expense.estimate_line_id !== null &&
        !job.baseline.lines.some(
          (line) => line.id === expense.estimate_line_id,
        ))
    )
      throw fail();
    integer(expense.amount_minor);
    if (!expense.amount_minor) throw fail();
    if (expense.kind === 'credit') {
      const original = job.expenses.find(
        (e) => e.id === expense.adjusts_expense_id,
      );
      if (
        !original ||
        !approved.has(original.id) ||
        original.kind !== 'payment' ||
        original.category !== expense.category ||
        original.supplier.toLowerCase().trim() !==
          expense.supplier.toLowerCase().trim() ||
        original.purchase_key.toLowerCase().trim() !==
          expense.purchase_key.toLowerCase().trim() ||
        Date.parse(original.submitted_at) > Date.parse(expense.submitted_at)
      )
        throw fail();
    }
  }
  for (const change of job.changes) {
    if (
      !costCategories.includes(change.category) ||
      !['internal', 'proposed', 'approved'].includes(change.status) ||
      typeof change.status !== 'string'
    )
      throw fail();
    integer(change.cost_minor);
    integer(change.revenue_minor);
  }
  const financials = jobFinancials(job);
  const pendingExpenses = job.expenses.filter(
    (e) => !job.events.some((event) => event.submission_id === e.id),
  ).length;
  const reasons = [
    ...(!job.projection.costs_complete
      ? ['Management has not marked costs complete']
      : []),
    ...(pendingExpenses ? ['Expense submissions await review'] : []),
    ...(labor.unpostedApproved
      ? ['Approved time is not in locked labor costs']
      : []),
    ...(labor.unresolved ? ['Time entries remain unresolved'] : []),
    ...(financials.categories.some(
      (c) => c.remaining_minor || c.committed_remaining_minor,
    )
      ? ['Forecast or unpaid commitments remain']
      : []),
  ];
  const marginAvailable =
    financials.revised_revenue_minor > 0 &&
    Number.isSafeInteger(financials.projected_margin_bps);
  // The admitted immutable estimate calculation already bounds the original
  // ratio. A zero original denominator still cannot support erosion comparison.
  const originalRatioSupported =
    job.baseline.revenue_minor > 0 &&
    Number.isSafeInteger(issued.calculation.profit_margin_bps);
  return immutable({
    ...base,
    source: {
      ...base.source,
      expenseIds: job.expenses.map((e) => e.id).sort(),
      reviewEventIds: job.events.map((e) => e.id).sort(),
      approvedChangeIds: job.changes
        .filter((c) => c.status === 'approved')
        .map((c) => c.id)
        .sort(),
    },
    status:
      reasons.length || !financials.complete
        ? ('PARTIAL' as const)
        : ('DECLARED_COSTS_COMPLETE' as const),
    reasons,
    coverage: {
      pendingExpenses,
      unpostedApprovedTime: labor.unpostedApproved,
      unresolvedTime: labor.unresolved,
      managementCostsComplete: job.projection.costs_complete,
    },
    warningReview: {
      availability: 'AVAILABLE',
      sourceThresholds: {
        categoryOverrunBps: job.projection.overrun_bps,
        marginErosionBps: job.projection.erosion_bps,
      },
      aboveBudgetCategories: financials.categories
        .filter((c) => c.projected_minor > c.budget_minor)
        .map((c) => ({ category: c.category, thresholdExceeded: c.overrun })),
      negativeContribution: financials.projected_profit_minor < 0,
      erosionThresholdExceeded:
        marginAvailable && originalRatioSupported
          ? financials.profit_erosion
          : null,
      minimumMargin: review
        ? {
            basisPoints: review.minimumMarginBps,
            source: 'local-confirmed-review-input',
            assessment: !marginAvailable
              ? 'UNAVAILABLE'
              : financials.projected_margin_bps < review.minimumMarginBps
                ? 'BELOW_INPUT'
                : 'AT_OR_ABOVE_INPUT',
          }
        : null,
    } satisfies WarningReview,
    categories: financials.categories.map((c) => ({
      category: c.category,
      originalMinor: c.original_minor,
      budgetMinor: c.budget_minor,
      recordedMinor: c.paid_minor,
      unpaidCommitmentMinor: c.committed_remaining_minor,
      forecastMinor: c.remaining_minor,
      projectedMinor: c.projected_minor,
      varianceMinor: Number(BigInt(c.projected_minor) - BigInt(c.budget_minor)),
      overrun: c.overrun,
    })),
    totals: {
      revenueMinor: financials.revised_revenue_minor,
      projectedCostMinor: financials.projected_cost_minor,
      projectedContributionMinor: financials.projected_profit_minor,
      projectedMarginBps: marginAvailable
        ? financials.projected_margin_bps
        : null,
      profitErosion:
        marginAvailable && originalRatioSupported
          ? financials.profit_erosion
          : null,
    },
  });
}
export type LocalJobMargin = ReturnType<typeof projectLocalJobMargin>;
