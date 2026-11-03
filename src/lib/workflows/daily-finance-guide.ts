import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  assertFinancialCaseworkCurrent,
  filterFinancialCasework,
  type FinancialCaseworkReview,
  type FinancialCaseworkFilter,
} from './financial-casework';
import {
  financeReviewPathEnabled,
  readFinanceReviewPath,
  openFinanceReviewPath,
  assertFinanceReviewPathCurrent,
  returnFinanceReviewPath,
  navigateFinanceReviewPath,
} from './finance-review-path';

export const dailyFinanceGuideEnabled = financeReviewPathEnabled;
export const readDailyFinanceGuide = readFinanceReviewPath;
export const assertDailyFinanceGuideCurrent = assertFinancialCaseworkCurrent;
export const assertDailyFinanceReviewCurrent = assertFinanceReviewPathCurrent;
export const returnDailyFinanceReview = returnFinanceReviewPath;
export const navigateDailyFinanceReview = navigateFinanceReviewPath;
const denied = () =>
  Error(
    'Exact current daily financial job and original exception required; no alternate case is selected',
  );

/** Presentation over the original job/source filter and canonical facts. The next
 * review is the first applicable original exception, never a new priority score. */
export function filterDailyFinanceGuide(
  review: FinancialCaseworkReview,
  filter: FinancialCaseworkFilter,
) {
  assertFinancialCaseworkCurrent(review);
  const fields = prototypeFields(filter, ['query', 'kind', 'job_id']);
  const selected = { ...fields } as unknown as FinancialCaseworkFilter;
  const original = filterFinancialCasework(review, selected);
  const result = freezePrototype({
    matching: original.matching,
    available: original.available,
    as_of: review.as_of,
    order_meaning: review.order_meaning,
    jobs: original.jobs.map((job) => ({
      job,
      next_review:
        job.requirements.find(
          (requirement) =>
            job.original_exception_ids.includes(requirement.id) &&
            (selected.kind === 'all' || requirement.kind === selected.kind),
        ) ?? null,
      cost_coverage: job.facts.cost_coverage,
      profitability:
        job.facts.costs === null || job.facts.margin === null
          ? ('UNKNOWN' as const)
          : ('RECORDED_FORECAST_ONLY' as const),
      invoice_readiness: job.invoice.overall,
      canonical_coverage: job.financial.coverage,
    })),
    meaning:
      'Available selected-job evidence only. Missing coverage is not zero cost or final profit; review order grants no urgency or financial authority.',
  });
  assertFinancialCaseworkCurrent(review);
  return result;
}
export type DailyFinanceGuideView = ReturnType<typeof filterDailyFinanceGuide>;
/** Return the actual C15 retained path. Hints and descriptions never establish a
 * job relationship, choose a replacement exception or create another review packet. */
export function selectDailyFinanceReview(
  review: FinancialCaseworkReview,
  selection: { job_id: string; exception_id: string },
  selectedJobId?: string,
) {
  assertFinancialCaseworkCurrent(review);
  const p = prototypeFields(selection, ['job_id', 'exception_id']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.job_id !== 'string' ||
    typeof p.exception_id !== 'string' ||
    (selectedJobId !== undefined &&
      (typeof selectedJobId !== 'string' || selectedJobId !== p.job_id))
  )
    throw denied();
  const jobs = review.jobs.filter(
    (job) =>
      job.target.job_id === p.job_id &&
      job.original_exception_ids.includes(p.exception_id as string),
  );
  if (jobs.length !== 1) throw denied();
  return openFinanceReviewPath(review, p.exception_id, p.job_id);
}
export type DailyFinanceReviewSelection = ReturnType<
  typeof selectDailyFinanceReview
>;
