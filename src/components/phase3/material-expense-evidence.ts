import { decimalToScaled } from '../../domain/estimating/calculation';
import { estimateUnits } from '../../domain/estimating/types';
import type { Job, Expense } from '../../domain/jobs/financials';
export type ExpenseJobContext = Pick<Job, 'id' | 'baseline'> &
  Partial<Pick<Job, 'organization_id'>>;
/** Shape reported evidence only; original submitExpense owns writes and duplicates. */
export function materialExpenseEvidence(
  org: string,
  job: ExpenseJobContext,
  input: {
    category: string;
    line: string;
    quantity: string;
    unit: string;
    unitCost: string;
  },
): Pick<Expense, 'quantity_milli' | 'unit' | 'unit_cost_minor'> {
  if (job.organization_id !== org || !job.id || !job.baseline.issued_version_id)
    throw Error('Exact original job baseline required');
  const quantity = input.quantity.trim(),
    unit = input.unit.trim(),
    cost = input.unitCost.trim();
  if (!quantity && !unit && !cost)
    return { quantity_milli: null, unit: null, unit_cost_minor: null };
  if (input.category !== 'materials')
    throw Error('Reported material evidence requires the materials category');
  if (
    !quantity ||
    !estimateUnits.includes(unit as (typeof estimateUnits)[number])
  )
    throw Error(
      'Enter an explicit material quantity and its recorded unit, or leave all evidence fields blank',
    );
  const amount = decimalToScaled(quantity, 3);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000)
    throw Error('Enter a positive material quantity within supported limits');
  if (input.line) {
    const lines = job.baseline.lines.filter((l) => l.id === input.line);
    if (
      lines.length !== 1 ||
      !['material', 'product', 'allowance'].includes(lines[0].kind)
    )
      throw Error('Exact original material budget line required');
    if (lines[0].unit !== unit)
      throw Error(
        'Reported unit differs from the original budget; review the match without unit conversion',
      );
  }
  const unitCost = cost ? Number(cost) : null;
  if (
    cost &&
    (!/^\d+$/.test(cost) ||
      !Number.isSafeInteger(unitCost) ||
      unitCost! < 0 ||
      unitCost! > 9e12)
  )
    throw Error(
      'Reported unit cost must be whole nonnegative minor units or blank for UNKNOWN',
    );
  return { quantity_milli: amount, unit, unit_cost_minor: unitCost };
}
