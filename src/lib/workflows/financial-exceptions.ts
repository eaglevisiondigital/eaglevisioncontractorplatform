import { detached } from '../../domain/jobs/margin-analysis';
import { costCategories } from '../../domain/jobs/financials';
import { documentHash } from '../../domain/release/preview';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readPortfolioFinance,
  inspectPortfolioFinance,
  openPortfolioFinanceJob,
  type PortfolioFinanceInput,
  type PortfolioFinanceReview,
} from './portfolio-finance';

export type FinancialExceptionKind =
  'coverage' | 'margin' | 'remaining_cost' | 'invoice_readiness';
export interface FinancialExceptionsInput {
  basis: 'SAVED_FORECASTS' | 'UNSAVED_PROPOSALS';
  portfolio: PortfolioFinanceInput;
}
export interface FinancialExceptionsFilter {
  kind: 'all' | FinancialExceptionKind;
  job_id: string | null;
  query: string;
}
export interface FinancialException {
  id: string;
  kind: FinancialExceptionKind;
  job_id: string;
  status: 'UNKNOWN' | 'RECORDED_WARNING' | 'REVIEW_REQUIRED' | 'NO_GO';
  title: string;
  observation: string;
  suggested_review: string;
  source: {
    job_revision: number;
    estimate_id: string;
    issued_version_id: string;
    issued_version_number: number;
    scope_sha256: string;
    expense_ids: string[];
  };
}
const denied = () =>
  Error('Exact confirmed current financial exception review required');
function own(value: unknown, keys: readonly string[]) {
  const p = prototypeFields(value, keys);
  if (Reflect.ownKeys(p).length !== keys.length) throw denied();
  return p;
}
function pin(value: FinancialExceptionsInput) {
  const p = own(value, ['basis', 'portfolio']);
  if (
    typeof p.basis !== 'string' ||
    !['SAVED_FORECASTS', 'UNSAVED_PROPOSALS'].includes(p.basis)
  )
    throw denied();
  own(p.portfolio, [
    'as_of',
    'input_revision',
    'excludes_unpaid_commitments',
    'proposals',
  ]);
  const portfolio = detached(p.portfolio) as PortfolioFinanceInput;
  return { basis: p.basis as FinancialExceptionsInput['basis'], portfolio };
}
function filterInput(value: FinancialExceptionsFilter) {
  const p = own(value, ['kind', 'job_id', 'query']);
  if (
    typeof p.kind !== 'string' ||
    ![
      'all',
      'coverage',
      'margin',
      'remaining_cost',
      'invoice_readiness',
    ].includes(p.kind) ||
    (p.job_id !== null &&
      (typeof p.job_id !== 'string' || !p.job_id || p.job_id.length > 200)) ||
    typeof p.query !== 'string' ||
    p.query.length > 200
  )
    throw denied();
  return p as unknown as FinancialExceptionsFilter;
}
const records = new WeakMap<
  object,
  { check: () => void; portfolio: PortfolioFinanceReview }
>();

/** Exact-source exception/review queue over canonical portfolio evidence. No writer or calculator. */
export async function readFinancialExceptions(
  sources: OperatingSources,
  originalInput: FinancialExceptionsInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const capture = captureOperatingSources(sources, gate),
    selected = pin(originalInput),
    portfolioInput = own(originalInput, ['basis', 'portfolio'])
      .portfolio as PortfolioFinanceInput,
    identity = JSON.stringify(selected);
  let portfolio: PortfolioFinanceReview | null = null;
  const check = () => {
    capture.check();
    if (
      own(originalInput, ['basis', 'portfolio']).portfolio !== portfolioInput ||
      JSON.stringify(pin(originalInput)) !== identity
    )
      throw denied();
    if (portfolio)
      openPortfolioFinanceJob(portfolio, portfolio.jobs[0].target.job_id!);
  };
  check();
  if (selected.basis === 'SAVED_FORECASTS') {
    // This is only a source-value binding. Existing Portfolio Finance admits amounts/identity.
    if (!Array.isArray(selected.portfolio.proposals)) throw denied();
    for (const entry of capture.entries) {
      const saved = sources.estimates.readSyntheticPrototypeSources(
        entry.target,
      ).job!.projection.remaining;
      const proposals = selected.portfolio.proposals.filter(
        (p) => p.job_id === entry.target.job_id,
      );
      if (
        proposals.length !== 1 ||
        costCategories.some(
          (category) => proposals[0].remaining?.[category] !== saved[category],
        )
      )
        throw Error(
          'Saved-forecast review requires the exact recorded category values',
        );
    }
  }
  portfolio = await readPortfolioFinance(sources, portfolioInput, gate);
  check();
  const queue: FinancialException[] = [];
  for (const job of portfolio.jobs) {
    const margin = job.review.scenario.margin,
      completion = job.review.scenario.completion;
    const source = {
      job_revision: job.review.scenario.source_job_revision,
      estimate_id: job.target.estimate_id,
      issued_version_id: job.target.version_id,
      issued_version_number: job.review.invoice.issued.version_number,
      scope_sha256: job.review.invoice.scope_sha256,
      expense_ids: [...job.expense_ids],
    };
    const add = (
      key: string,
      kind: FinancialExceptionKind,
      status: FinancialException['status'],
      title: string,
      observation: string,
      suggested_review: string,
    ) =>
      queue.push({
        id: `${job.target.job_id}:${key}`,
        kind,
        job_id: job.target.job_id!,
        status,
        title,
        observation,
        suggested_review,
        source: { ...source, expense_ids: [...source.expense_ids] },
      });
    if (
      !completion.totals ||
      !job.review.recorded.recorded.costReview.completion.totals
    )
      add(
        'coverage',
        'coverage',
        'UNKNOWN',
        'Cost coverage is incomplete',
        margin.reasons.join(' ') ||
          'Required cost or labor evidence is missing. Aggregate costs remain UNKNOWN.',
        'Review the exact existing cost and locked-labor source references. Missing costs are not zero, available capacity or final profit.',
      );
    const warnings = margin.warningReview;
    if (warnings.availability === 'AVAILABLE') {
      for (const category of warnings.aboveBudgetCategories)
        add(
          `category:${category.category}`,
          'margin',
          'RECORDED_WARNING',
          `${category.category} exceeds recorded budget`,
          `The existing canonical category comparison is above budget; its recorded overrun threshold is ${category.thresholdExceeded ? 'exceeded' : 'not exceeded'}.`,
          'Inspect the original category costs and proposed forecast. This is an internal cost warning, not customer authorization or a supplier order.',
        );
      if (warnings.negativeContribution === true)
        add(
          'negative-contribution',
          'margin',
          'RECORDED_WARNING',
          'Negative projected contribution',
          'The existing canonical scenario reports a negative projected contribution.',
          'Review recorded actuals, commitments and remaining estimates. This is not a loss guarantee, settled accounting or permission to change an issued customer scope.',
        );
      if (warnings.erosionThresholdExceeded === true)
        add(
          'margin-erosion',
          'margin',
          'RECORDED_WARNING',
          'Recorded margin-erosion threshold exceeded',
          'The existing canonical scenario exceeds the job source margin-erosion threshold.',
          'Review the exact saved policy and scenario. No new policy, price, invoice or financial action is created.',
        );
    }
    if (completion.totals && completion.totals.costToCompleteMinor > 0)
      add(
        'cost-to-complete',
        'remaining_cost',
        'REVIEW_REQUIRED',
        'Remaining-cost review',
        `Canonical cost-to-complete is recorded from net unpaid commitments plus the ${selected.basis === 'SAVED_FORECASTS' ? 'saved remaining forecast' : 'explicit unsaved remaining proposal'}.`,
        'Inspect the canonical amounts in this exact job. Remaining costs are a review context, not an overdue debt, dispatch instruction or verified repair status.',
      );
    if (job.review.invoice.overall === 'NO_GO')
      add(
        'invoice-prerequisites',
        'invoice_readiness',
        'NO_GO',
        'Invoice prerequisites remain blocked',
        'The existing issued-scope invoice review is NO_GO. Genuine contract/signature, tax, coverage and financial authority are separately required.',
        'Open the exact issued version and existing requirement statuses. No invoice, receivable, ledger row, export or payment is prepared or executed.',
      );
  }
  const order: FinancialExceptionKind[] = [
    'coverage',
    'margin',
    'remaining_cost',
    'invoice_readiness',
  ];
  queue.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  if (new Set(queue.map((q) => q.id)).size !== queue.length) throw denied();
  const counts = {
    coverage: 0,
    margin: 0,
    remaining_cost: 0,
    invoice_readiness: 0,
  };
  for (const row of queue) counts[row.kind]++;
  const body = {
    mode: 'LOCAL_SYNTHETIC_FINANCIAL_EXCEPTIONS' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    organization_id: capture.organization_id,
    actor_id: capture.actor_id,
    basis: selected.basis,
    input_revision: selected.portfolio.input_revision,
    as_of: selected.portfolio.as_of,
    portfolio,
    queue,
    counts,
    coverage: {
      selected_jobs: portfolio.coverage.selected_jobs,
      covered_jobs: portfolio.coverage.covered_jobs,
      missing_job_ids: [...portfolio.coverage.missing_job_ids],
      meaning:
        'Only the exact selected-job source set is reviewed. Queue count is review evidence, not complete company history, urgency, debt or physical completion.',
    },
    order_meaning:
      'Review ordering only: missing coverage, canonical warnings, remaining-cost context, then invoice prerequisites. No severity or execution priority is inferred.',
    authority: {
      save: false,
      invoice: false,
      ledger: false,
      payment: false,
      payroll: false,
      procurement: false,
      export: false,
      provider: false,
      communicate: false,
      hosted: false,
    },
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  if (
    (await inspectPortfolioFinance(portfolio)).status !== 'CURRENT_LOCAL_SOURCE'
  )
    throw denied();
  check();
  const result = freezePrototype({ ...body, sha256 });
  records.set(result, { check, portfolio });
  return result;
}
export type FinancialExceptionsReview = Awaited<
  ReturnType<typeof readFinancialExceptions>
>;
export function filterFinancialExceptions(
  review: FinancialExceptionsReview,
  value: FinancialExceptionsFilter,
) {
  const record = records.get(review);
  if (!record) throw denied();
  record.check();
  const selected = filterInput(value),
    query = selected.query.trim().toLowerCase();
  if (
    selected.job_id !== null &&
    !review.portfolio.jobs.some((j) => j.target.job_id === selected.job_id)
  )
    throw denied();
  const queue = review.queue.filter((row) => {
    const job = review.portfolio.jobs.find(
      (j) => j.target.job_id === row.job_id,
    )!;
    return (
      (selected.kind === 'all' || row.kind === selected.kind) &&
      (selected.job_id === null || row.job_id === selected.job_id) &&
      (!query ||
        `${row.title} ${row.observation} ${row.suggested_review} ${row.source.issued_version_id} ${job.name} ${job.customer_name} ${job.property_label}`
          .toLowerCase()
          .includes(query))
    );
  });
  record.check();
  return freezePrototype({
    queue,
    matching: queue.length,
    available: review.queue.length,
    coverage: review.coverage,
  });
}
export function openFinancialException(
  review: FinancialExceptionsReview,
  id: string,
) {
  const record = records.get(review);
  if (!record || typeof id !== 'string' || id.length > 400) throw denied();
  record.check();
  const rows = review.queue.filter((q) => q.id === id);
  if (rows.length !== 1) throw denied();
  const row = rows[0],
    target = openPortfolioFinanceJob(record.portfolio, row.job_id).target,
    job = review.portfolio.jobs.find((j) => j.target.job_id === row.job_id)!;
  record.check();
  return freezePrototype({
    authority: 'NAVIGATION_ONLY' as const,
    exception: row,
    target: { ...target },
    job,
  });
}
export async function inspectFinancialExceptions(
  review: FinancialExceptionsReview,
) {
  const record = records.get(review);
  if (!record)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.check();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    record.check();
    if (
      (await inspectPortfolioFinance(record.portfolio)).status !==
      'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    record.check();
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch {
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
