import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  assertRecordedCostRequirementsCurrent,
  inspectRecordedCostSource,
  continueRecordedCostSource,
  type RecordedCostRequirementsRead,
} from './recorded-cost-requirements';
import type { CostCoverageSource } from './cost-coverage-path';

export interface CostCoverageActionInput {
  kind: CostCoverageSource['kind'];
  id: string;
  expected_job_revision: number;
  purpose: 'cost_review' | 'invoice_preparation';
}
/** Literal presentation filtering over original authorized rows. Selection remains
 * exact kind/ID authorization in validateCostCoverageAction, never a text match. */
export function filterCostCoverageActionSources(
  view: RecordedCostRequirementsRead,
  input: { query: string; kind: CostCoverageSource['kind'] | 'all' },
) {
  assertRecordedCostRequirementsCurrent(view);
  const p = prototypeFields(input, ['query', 'kind']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.query !== 'string' ||
    p.query.length > 200 ||
    ![
      'all',
      'time',
      'material',
      'material_review',
      'invoice_requirement',
    ].includes(p.kind as string)
  )
    throw Error('Bounded literal current cost-source filters required');
  const query = p.query.trim().toLowerCase();
  const rows = view.original.rows.filter(
    (row) =>
      (p.kind === 'all' || row.kind === p.kind) &&
      (!query ||
        [
          row.kind,
          row.id,
          row.title,
          row.status,
          ...row.references,
          ...row.facts,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );
  assertRecordedCostRequirementsCurrent(view);
  return freezePrototype({
    rows,
    matching: rows.length,
    available: view.original.rows.length,
    meaning: 'LITERAL_PRESENTATION_ONLY_NOT_SOURCE_AUTHORIZATION' as const,
  });
}
/** A preparation validator over original handles. No read constructor, command
 * custody, financial calculation or new source registry is introduced. */
export function validateCostCoverageAction(
  view: RecordedCostRequirementsRead,
  input: CostCoverageActionInput,
) {
  assertRecordedCostRequirementsCurrent(view);
  const p = prototypeFields(input, [
    'kind',
    'id',
    'expected_job_revision',
    'purpose',
  ]);
  if (
    Object.keys(p).length !== 4 ||
    !['cost_review', 'invoice_preparation'].includes(p.purpose as string) ||
    !Number.isSafeInteger(p.expected_job_revision)
  )
    throw Error('Exact cost action selection required');
  const evidence = view.original.original.costs.evidence;
  if (p.expected_job_revision !== evidence.job_revision)
    throw Error(
      'Saved job revision changed; reselect the current original source',
    );
  const source = inspectRecordedCostSource(view, {
    kind: input.kind,
    id: input.id,
  });
  if (
    (p.purpose === 'invoice_preparation') !==
    (source.kind === 'invoice_requirement')
  )
    throw Error(
      'Invoice preparation requires an exact original invoice requirement',
    );
  const time = evidence.time.find(
      (row) => source.kind === 'time' && row.id === source.id,
    ),
    expense = evidence.expenses.find(
      (row) => source.kind === 'material' && row.id === source.id,
    ),
    event = evidence.reviews.find(
      (row) => source.kind === 'material_review' && row.id === source.id,
    ),
    expenseId = expense?.id ?? event?.submission_id,
    linkedExpenses = evidence.expenses.filter((row) => row.id === expenseId),
    recordedExpense =
      linkedExpenses.length === 1 ? linkedExpenses[0] : undefined,
    reviews = evidence.reviews.filter((row) => row.submission_id === expenseId),
    material = view.original.original.material,
    labor = view.labor.find((row) => row.entry_id === time?.id),
    invoice = evidence.invoice.requirements.find(
      (row) => source.kind === 'invoice_requirement' && row.id === source.id,
    ),
    category = view.categories.find(
      (row) => row.category === (time ? 'labor' : recordedExpense?.category),
    );
  const action = time
    ? labor?.locked_labor_reference
      ? 'LOCKED_LABOR_INSPECT_ONLY'
      : 'UNPOSTED_OR_UNVERIFIED_LABOR_REVIEW'
    : expense
      ? reviews.length === 0 &&
        material.can_review &&
        material.eligible_expenses.some((row) => row.expense_id === expense.id)
        ? 'EXISTING_PENDING_MATERIAL_REVIEW'
        : 'RECORDED_MATERIAL_INSPECT_ONLY'
      : event
        ? 'RECORDED_MATERIAL_EVENT_INSPECT_ONLY'
        : 'ORIGINAL_INVOICE_REQUIREMENT_REVIEW';
  assertRecordedCostRequirementsCurrent(view);
  return freezePrototype({
    source,
    recorded_source: {
      identity: { ...view.original.original.costs.identity },
      currency: evidence.currency,
      expense: recordedExpense ? { ...recordedExpense } : null,
      expense_link: expenseId
        ? recordedExpense
          ? 'EXACT_CURRENT_SOURCE'
          : 'UNKNOWN_SOURCE_LINK'
        : 'NOT_APPLICABLE',
      review_event: event ? { ...event } : null,
      review_events: reviews.map((row) => ({ ...row })),
      adjustment_source: recordedExpense?.adjusts_expense_id
        ? evidence.expenses.filter(
            (row) => row.id === recordedExpense.adjusts_expense_id,
          ).length === 1
          ? {
              ...evidence.expenses.find(
                (row) => row.id === recordedExpense.adjusts_expense_id,
              )!,
            }
          : null
        : null,
      adjustment_link: recordedExpense?.adjusts_expense_id
        ? evidence.expenses.filter(
            (row) => row.id === recordedExpense.adjusts_expense_id,
          ).length === 1
          ? 'EXACT_CURRENT_SOURCE'
          : 'UNKNOWN_SOURCE_LINK'
        : 'NONE_RECORDED',
      adjusting_expense_ids: recordedExpense
        ? evidence.expenses
            .filter((row) => row.adjusts_expense_id === recordedExpense.id)
            .map((row) => row.id)
        : [],
      time: time ? { ...time } : null,
      labor_lineage: labor ? { ...labor } : null,
      available_locked_period_ids: [...view.locked_period_ids],
      locked_period_link:
        'AVAILABLE_JOB_PERIODS_NOT_PER_ENTRY_ALLOCATION' as const,
      durable_receipt: 'UNVERIFIED_NO_OPERATIONAL_CUSTODY' as const,
      provider_settlement: 'UNVERIFIED' as const,
    },
    canonical_totals: {
      currency: evidence.currency,
      categories: view.original.original.canonical.categories.map((row) => ({
        ...row,
      })),
      revised_revenue_minor:
        view.original.original.canonical.revised_revenue_minor,
      projected_cost_minor:
        view.original.original.canonical.projected_cost_minor,
      projected_profit_minor:
        view.original.original.canonical.projected_profit_minor,
      projected_margin_bps:
        view.original.original.canonical.projected_margin_bps,
      profit_erosion: view.original.original.canonical.profit_erosion,
      complete: view.original.original.canonical.complete,
      meaning:
        'COPIED_CANONICAL_JOB_TOTALS_NOT_SOURCE_ALLOCATION_OR_SETTLEMENT' as const,
    },
    action,
    destination: source.destination,
    job_revision: evidence.job_revision,
    issued_version_id: evidence.issued.version_id,
    category: category ?? null,
    labor: labor ?? null,
    material_review_ids: reviews.map((row) => row.id),
    invoice_requirement: invoice ?? null,
    financial_exceptions: view.requirements,
    cost_coverage: view.coverage,
    canonical_margin: view.original.original.canonical.projected_margin_bps,
    canonical_warnings: view.canonical_anomalies,
    invoice_overall: view.invoice_overall,
    missing_evidence: evidence.facts.missing_evidence,
    review_navigation: 'ORIGINAL_EXACT_REVIEW_ONLY' as const,
    invoice_prepared: false as const,
    financial_execution: false as const,
    limits: time
      ? 'Unposted or unverified time is not zero cost. Locked evidence cannot be reopened or posted here. Use the original field review; payroll execution remains closed.'
      : invoice
        ? 'Each original invoice prerequisite remains independent. This validation cannot issue an invoice, establish contract approval, create debt or clear missing provider evidence.'
        : 'Only the original pending material-review control may append its native review. Inspecting or navigating cannot approve, allocate, purchase, post, settle or pay.',
  });
}
export type CostCoverageActionValidation = ReturnType<
  typeof validateCostCoverageAction
>;
export async function continueCostCoverageAction(
  view: RecordedCostRequirementsRead,
  input: CostCoverageActionInput,
  confirmed: boolean,
  ...args: Parameters<typeof continueRecordedCostSource> extends [
    unknown,
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) {
  if (confirmed !== true)
    return {
      status: 'WITHHELD_NO_DISPATCH' as const,
      replay: 'FORBIDDEN' as const,
    };
  try {
    const result = validateCostCoverageAction(view, input);
    return await continueRecordedCostSource(view, result.source, ...args);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
}
