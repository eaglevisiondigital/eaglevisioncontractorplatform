import { materialPrice, type Pricing } from '../materials/import';
import {
  purchaseMatches,
  normalizeProduct,
  type Job,
} from '../jobs/financials';
export type Disposition = 'absorbed' | 'included' | 'proposed' | 'deferred';
export interface MaterialDecision {
  id: string;
  expense_id: string;
  revision: number;
  disposition: Disposition;
  reason: string;
  scope_line_id: string | null;
  pricing: Pricing;
  presentation: 'itemized' | 'package';
  description: string;
  change_id: string | null;
  selling_minor: number;
}
export function unbilledRows(job: Job) {
  const approved = new Set(
    job.events
      .filter((x) => x.decision === 'approved')
      .map((x) => x.submission_id),
  );
  const payments = job.expenses.filter(
    (e) =>
      approved.has(e.id) && e.kind === 'payment' && e.category === 'materials',
  );
  return payments.map((e) => {
    const credits = job.expenses
      .filter(
        (c) =>
          approved.has(c.id) &&
          c.kind === 'credit' &&
          c.adjusts_expense_id === e.id,
      )
      .reduce((s, c) => s + c.amount_minor, 0);
    if (!Number.isSafeInteger(credits) || credits > e.amount_minor)
      throw Error('Credit reconciliation required');
    const matches = purchaseMatches(e, job.baseline);
    const line = job.baseline.lines.find((l) => l.id === e.estimate_line_id);
    const overlaps = payments.filter(
      (p) =>
        p.id !== e.id &&
        normalizeProduct(p.supplier) === normalizeProduct(e.supplier) &&
        normalizeProduct(p.purchase_key) === normalizeProduct(e.purchase_key),
    );
    const cumulative = line
      ? payments
          .filter((p) => p.estimate_line_id === line.id && p.unit === line.unit)
          .reduce((s, p) => s + (p.quantity_milli ?? 0), 0)
      : 0;
    const flags: string[] = [];
    if (overlaps.length)
      flags.push(
        'Possible overlapping invoice/receipt: reconcile before billing',
      );
    if (!line)
      flags.push(
        matches.length
          ? 'Ambiguous product match: confirm scope'
          : 'Unmatched or substituted material',
      );
    if (line && e.unit !== line.unit) flags.push('Unit mismatch');
    if (line && cumulative > line.quantity_milli)
      flags.push('Cumulative quantity exceeds original scope');
    if (
      line &&
      e.unit_cost_minor !== null &&
      e.unit_cost_minor > line.unit_cost_minor
    )
      flags.push('Supplier price increase');
    if (
      job.baseline.lines.some(
        (l) => l.unit === 'lump_sum' || l.import_approval_id,
      )
    )
      flags.push('Check existing materials package coverage');
    if (job.changes.some((c) => c.status === 'approved'))
      flags.push('Review approved changes before proposing billing');
    if (credits) flags.push('Return/credit applied; quantity needs review');
    return {
      expense: e,
      net_minor: e.amount_minor - credits,
      matches,
      flags,
      overlap: overlaps.length > 0,
    };
  });
}
export function prepareMaterialDecision(
  job: Job,
  expenseId: string,
  input: Omit<
    MaterialDecision,
    'id' | 'expense_id' | 'revision' | 'change_id' | 'selling_minor'
  >,
) {
  const row = unbilledRows(job).find((r) => r.expense.id === expenseId);
  if (
    !row ||
    !input.reason.trim() ||
    input.reason.length > 1000 ||
    !input.description.trim() ||
    input.description.length > 1000 ||
    !['absorbed', 'included', 'proposed', 'deferred'].includes(
      input.disposition,
    ) ||
    !['itemized', 'package'].includes(input.presentation)
  )
    throw Error('Reviewed approved purchase required');
  if (
    (input.disposition === 'included' || input.scope_line_id !== null) &&
    !job.baseline.lines.some((l) => l.id === input.scope_line_id) &&
    !job.changes.some(
      (c) =>
        c.id === input.scope_line_id &&
        c.status === 'approved' &&
        !!c.authorization_reference,
    )
  )
    throw Error('Authorized existing scope required');
  if (input.disposition === 'proposed' && (row.overlap || row.net_minor <= 0))
    throw Error('Resolve duplicate/credit before billing proposal');
  const price = materialPrice(row.net_minor, input.pricing);
  return {
    ...structuredClone(input),
    selling_minor: input.disposition === 'proposed' ? price.price_minor : 0,
    expense_id: expenseId,
  };
}
