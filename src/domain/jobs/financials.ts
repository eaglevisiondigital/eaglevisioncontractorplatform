import type { EstimateInput, EstimateCalculation } from '../estimating/types';
export const costCategories = [
  'materials',
  'labor',
  'subcontractors',
  'equipment',
  'other',
] as const;
export type CostCategory = (typeof costCategories)[number];
export interface JobBaseline {
  issued_version_id: string;
  revenue_minor: number;
  costs: Record<CostCategory, number>;
  lines: EstimateInput['lines'];
  currency: string;
}
export interface Expense {
  labor_worker_id?: string | null;
  material_import_line_ids?: string[];
  id: string;
  job_id: string;
  purchase_key: string;
  supplier: string;
  reference: string;
  category: CostCategory;
  kind: 'commitment' | 'payment' | 'credit';
  amount_minor: number;
  description: string;
  estimate_line_id: string | null;
  quantity_milli: number | null;
  unit: string | null;
  unit_cost_minor: number | null;
  document_ids: string[];
  material_approval_id: string | null;
  submitted_at: string;
}
export interface ExpenseEvent {
  id: string;
  submission_id: string;
  decision: 'approved' | 'rejected';
  reason: string;
  created_at: string;
}
export interface ChangeOrder {
  id: string;
  description: string;
  revenue_minor: number;
  cost_minor: number;
  category: CostCategory;
  status: 'internal' | 'proposed' | 'approved';
  authorization_reference: string | null;
}
export interface JobProjection {
  remaining: Record<CostCategory, number>;
  overrun_bps: number;
  erosion_bps: number;
  costs_complete: boolean;
}
export interface LaborSummary {
  seconds: number;
  billable_seconds: number;
  cash_minor: number;
  burden_minor: number;
  imputed_minor: number;
  billing_minor: number;
}
export interface Job {
  labor?: LaborSummary;
  id: string;
  organization_id: string;
  name: string;
  baseline: JobBaseline;
  projection: JobProjection;
  lock_revision: number;
  expenses: Expense[];
  events: ExpenseEvent[];
  changes: ChangeOrder[];
}
const checked = (n: number) => {
  if (!Number.isSafeInteger(n) || Math.abs(n) > 9e12)
    throw new Error('Job financial amount exceeds limits');
  return n;
};
export function baselineFromEstimate(
  versionId: string,
  p: EstimateInput,
  calc: EstimateCalculation,
): JobBaseline {
  const costs: Record<CostCategory, number> = {
    materials: 0,
    labor: 0,
    subcontractors: 0,
    equipment: 0,
    other: 0,
  };
  for (const c of calc.lines.filter((l) => l.included)) {
    const l = p.lines.find((l) => l.id === c.id)!;
    const category =
      l.kind === 'labor'
        ? 'labor'
        : ['material', 'product', 'allowance'].includes(l.kind)
          ? 'materials'
          : 'other';
    costs[category] = checked(costs[category] + c.cost_minor);
  }
  return {
    issued_version_id: versionId,
    revenue_minor: calc.net_minor,
    costs,
    lines: structuredClone(
      p.lines.filter((l) => calc.lines.find((c) => c.id === l.id)?.included),
    ),
    currency: p.currency,
  };
}
export function normalizeProduct(description: string) {
  return description
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export function purchaseMatches(
  expense: Pick<Expense, 'description' | 'unit' | 'estimate_line_id'>,
  baseline: JobBaseline,
) {
  if (expense.estimate_line_id) {
    const exact = baseline.lines.find((l) => l.id === expense.estimate_line_id);
    return exact
      ? [
          {
            id: exact.id,
            reason: 'source identifier',
            confidence: 'exact' as const,
          },
        ]
      : [];
  }
  const name = normalizeProduct(expense.description);
  return baseline.lines
    .filter(
      (l) =>
        l.unit === expense.unit && normalizeProduct(l.description) === name,
    )
    .map((l) => ({
      id: l.id,
      reason: 'normalized description and unit; manual confirmation required',
      confidence: 'candidate' as const,
    }));
}
export function jobFinancials(job: Job) {
  if (
    !Number.isInteger(job.projection.overrun_bps) ||
    job.projection.overrun_bps < 0 ||
    job.projection.overrun_bps > 100000 ||
    !Number.isInteger(job.projection.erosion_bps) ||
    job.projection.erosion_bps < 0 ||
    job.projection.erosion_bps > 10000
  )
    throw new Error('Invalid warning thresholds');
  const approved = new Set(
    job.events
      .filter((e) => e.decision === 'approved')
      .map((e) => e.submission_id),
  );
  const purchases = new Map<
    string,
    {
      commitment: number;
      paid: number;
      credits: number;
      category: CostCategory;
    }
  >();
  const seen = new Set<string>();
  const anomalies: string[] = [];
  for (const e of job.expenses.filter((e) => approved.has(e.id))) {
    if (
      seen.has(
        `${e.supplier.toLowerCase().trim()}|${e.reference.toLowerCase().trim()}`,
      )
    )
      throw new Error('Duplicate supplier document');
    seen.add(
      `${e.supplier.toLowerCase().trim()}|${e.reference.toLowerCase().trim()}`,
    );
    if (!Number.isSafeInteger(e.amount_minor) || e.amount_minor <= 0)
      throw new Error('Invalid expense amount');
    const key = `${e.supplier.toLowerCase().trim()}|${e.purchase_key.toLowerCase().trim()}`;
    const purchase = purchases.get(key) ?? {
      commitment: 0,
      paid: 0,
      credits: 0,
      category: e.category,
    };
    if (purchase.category !== e.category)
      throw new Error('Purchase category conflict');
    if (e.kind === 'commitment')
      purchase.commitment = checked(purchase.commitment + e.amount_minor);
    else if (e.kind === 'payment')
      purchase.paid = checked(purchase.paid + e.amount_minor);
    else {
      purchase.credits = checked(purchase.credits + e.amount_minor);
    }
    purchases.set(key, purchase);
    const match = purchaseMatches(e, job.baseline);
    if (!e.estimate_line_id)
      anomalies.push(
        `${e.description}: ${match.length ? 'purchase match requires review' : 'unplanned purchase or substitution'}`,
      );
    const line = job.baseline.lines.find((l) => l.id === e.estimate_line_id);
    if (
      line &&
      e.quantity_milli !== null &&
      e.quantity_milli !== line.quantity_milli
    )
      anomalies.push(`${e.description}: quantity differs from original budget`);
    if (
      line &&
      e.unit_cost_minor !== null &&
      e.unit_cost_minor > line.unit_cost_minor
    )
      anomalies.push(`${e.description}: supplier unit cost increased`);
  }
  for (const p of purchases.values()) {
    if (p.credits > p.paid)
      throw new Error('Credit exceeds recorded paid amount');
    p.paid -= p.credits;
    p.commitment = Math.max(0, p.commitment - p.credits);
  }
  const categories = costCategories.map((category) => {
    const rows = [...purchases.values()].filter((p) => p.category === category);
    const paid = checked(
      rows.reduce((s, r) => s + r.paid, 0) +
        (category === 'labor' && job.labor
          ? job.labor.cash_minor +
            job.labor.burden_minor +
            job.labor.imputed_minor
          : 0),
    );
    const committed = checked(
      rows.reduce((s, r) => s + Math.max(0, r.commitment - r.paid), 0),
    );
    const expected =
      job.baseline.costs[category] +
      job.changes
        .filter((c) => c.status === 'approved' && c.category === category)
        .reduce((s, c) => s + c.cost_minor, 0);
    const remaining = job.projection.remaining[category];
    if (!Number.isSafeInteger(remaining) || remaining < 0)
      throw new Error('Invalid remaining cost projection');
    const projected = checked(paid + committed + remaining);
    const overrun =
      BigInt(projected) >
      BigInt(expected) +
        (BigInt(expected) * BigInt(job.projection.overrun_bps)) / 10000n;
    return {
      category,
      original_minor: job.baseline.costs[category],
      budget_minor: checked(expected),
      paid_minor: paid,
      committed_remaining_minor: committed,
      remaining_minor: remaining,
      projected_minor: projected,
      overrun,
    };
  });
  const revenue = checked(
    job.baseline.revenue_minor +
      job.changes
        .filter((c) => c.status === 'approved')
        .reduce((s, c) => {
          if (!c.authorization_reference?.trim())
            throw new Error('Customer change authorization required');
          return s + c.revenue_minor;
        }, 0),
  );
  const originalCost = checked(
    Object.values(job.baseline.costs).reduce((s, n) => s + n, 0),
  );
  const projectedCost = checked(
    categories.reduce((s, c) => s + c.projected_minor, 0),
  );
  const originalProfit = checked(job.baseline.revenue_minor - originalCost);
  const profit = checked(revenue - projectedCost);
  const marginBps = revenue
    ? Number((BigInt(profit) * 10000n) / BigInt(revenue))
    : 0;
  const originalMargin = job.baseline.revenue_minor
    ? Number(
        (BigInt(originalProfit) * 10000n) / BigInt(job.baseline.revenue_minor),
      )
    : 0;
  return {
    categories,
    revised_revenue_minor: revenue,
    original_cost_minor: originalCost,
    projected_cost_minor: projectedCost,
    projected_profit_minor: profit,
    projected_margin_bps: marginBps,
    profit_erosion: originalMargin - marginBps > job.projection.erosion_bps,
    anomalies,
    complete:
      job.projection.costs_complete &&
      categories.every(
        (c) => c.remaining_minor === 0 && c.committed_remaining_minor === 0,
      ) &&
      job.expenses.every((e) =>
        job.events.some((a) => a.submission_id === e.id),
      ),
  };
}
