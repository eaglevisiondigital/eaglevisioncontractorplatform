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
    reviews = evidence.reviews.filter((row) => row.submission_id === expenseId),
    material = view.original.original.material,
    labor = view.labor.find((row) => row.entry_id === time?.id),
    invoice = evidence.invoice.requirements.find(
      (row) => source.kind === 'invoice_requirement' && row.id === source.id,
    ),
    category = view.categories.find(
      (row) => row.category === (time ? 'labor' : expense?.category),
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
