import { it, expect } from 'vitest';
import {
  jobFinancials,
  purchaseMatches,
  baselineFromEstimate,
  type Job,
  type Expense,
} from '../src/domain/jobs/financials';
import {
  preparePayroll,
  validateTime,
  employerBoundary,
  payrollCsv,
  type Worker,
  type LaborRate,
  type TimeEntry,
  type WorkforcePolicy,
} from '../src/domain/workforce/payroll';
import { industryEstimate } from '../src/domain/estimating/fixtures';
import { calculateEstimate } from '../src/domain/estimating/calculation';
import { sampleCompanies } from '../src/domain/platform';
const uuid = () => crypto.randomUUID();
function job(): Job {
  const p = industryEstimate(sampleCompanies[0], uuid());
  const baseline = baselineFromEstimate(uuid(), p, calculateEstimate(p));
  return {
    id: uuid(),
    organization_id: uuid(),
    name: 'Synthetic fence',
    baseline,
    projection: {
      remaining: {
        materials: 0,
        labor: 0,
        subcontractors: 0,
        equipment: 0,
        other: 0,
      },
      overrun_bps: 1000,
      erosion_bps: 500,
      costs_complete: false,
    },
    lock_revision: 1,
    expenses: [],
    events: [],
    changes: [],
  };
}
function expense(j: Job, kind: Expense['kind'], amount = 10000): Expense {
  return {
    id: uuid(),
    job_id: j.id,
    purchase_key: 'PO-123',
    supplier: 'Example Supply',
    reference: uuid(),
    category: 'materials',
    kind,
    amount_minor: amount,
    description: j.baseline.lines[0].description,
    estimate_line_id: j.baseline.lines[0].id,
    quantity_milli: null,
    unit: j.baseline.lines[0].unit,
    unit_cost_minor: null,
    document_ids: [],
    material_approval_id: null,
    submitted_at: new Date().toISOString(),
  };
}
function add(j: Job, e: Expense) {
  j.expenses.push(e);
  j.events.push({
    id: uuid(),
    submission_id: e.id,
    decision: 'approved',
    reason: 'Synthetic management review',
    created_at: new Date().toISOString(),
  });
}
it('baseline retains original selected estimate revenue and material/labor cost', () => {
  const j = job();
  expect(j.baseline.costs.labor).toBe(208000);
  expect(j.baseline.costs.materials).toBe(508800);
  expect(j.baseline.revenue_minor).toBe(818560);
});
it('commitment and matching payment are not double-counted', () => {
  const j = job();
  add(j, expense(j, 'commitment', 10000));
  add(j, expense(j, 'payment', 6000));
  const c = jobFinancials(j).categories[0];
  expect(c.paid_minor).toBe(6000);
  expect(c.committed_remaining_minor).toBe(4000);
  expect(c.projected_minor).toBe(10000);
});
it('credits reduce paid costs and outstanding commitment without rewriting purchases', () => {
  const j = job();
  add(j, expense(j, 'commitment', 10000));
  add(j, expense(j, 'payment', 10000));
  add(j, expense(j, 'credit', 2000));
  expect(jobFinancials(j).categories[0].projected_minor).toBe(8000);
  expect(j.expenses[0].amount_minor).toBe(10000);
});
it('rejects credits above recorded paid cost', () => {
  const j = job();
  add(j, expense(j, 'credit', 10));
  expect(() => jobFinancials(j)).toThrow(/Credit/);
});
it('pending or rejected submissions do not change costs', () => {
  const j = job();
  j.expenses.push(expense(j, 'payment'));
  expect(jobFinancials(j).projected_cost_minor).toBe(0);
});
it('internal and proposed changes never increase customer billing', () => {
  const j = job();
  j.changes = [
    {
      id: uuid(),
      description: 'Proposed extra gate',
      category: 'materials',
      cost_minor: 10000,
      revenue_minor: 20000,
      status: 'proposed',
      authorization_reference: null,
    },
  ];
  expect(jobFinancials(j).revised_revenue_minor).toBe(j.baseline.revenue_minor);
  j.changes[0].status = 'approved';
  expect(() => jobFinancials(j)).toThrow(/authorization/);
  j.changes[0].authorization_reference =
    'Synthetic signed authorization reference';
  expect(jobFinancials(j).revised_revenue_minor).toBe(
    j.baseline.revenue_minor + 20000,
  );
});
it('normalizes products and units but leaves ambiguous candidates for review', () => {
  const j = job();
  const l = j.baseline.lines[0];
  j.baseline.lines.push({ ...l, id: uuid() });
  expect(
    purchaseMatches(
      {
        description: ` ${l.description.toUpperCase()} `,
        unit: l.unit,
        estimate_line_id: null,
      },
      j.baseline,
    ),
  ).toHaveLength(2);
  expect(
    purchaseMatches(
      { description: 'unplanned', unit: 'each', estimate_line_id: null },
      j.baseline,
    ),
  ).toHaveLength(0);
});
it('detects unplanned products, quantity changes and unit cost increases', () => {
  const j = job();
  const e = expense(j, 'payment');
  e.quantity_milli = 2000;
  e.unit_cost_minor = 999999;
  add(j, e);
  expect(jobFinancials(j).anomalies.join(' ')).toMatch(
    /quantity differs.*cost increased/,
  );
});
it('detects duplicate supplier documents', () => {
  const j = job();
  const e = expense(j, 'payment');
  add(j, e);
  add(j, { ...e, id: uuid() });
  expect(() => jobFinancials(j)).toThrow(/Duplicate/);
});
it('forecasts include remaining costs and approved labor only once', () => {
  const j = job();
  j.labor = {
    seconds: 3600,
    billable_seconds: 1800,
    cash_minor: 2800,
    burden_minor: 560,
    imputed_minor: 4500,
    billing_minor: 6500,
  };
  j.projection.remaining.labor = 5000;
  expect(
    jobFinancials(j).categories.find((c) => c.category === 'labor')
      ?.projected_minor,
  ).toBe(12860);
});
it('does not label incomplete costs final', () => {
  const j = job();
  expect(jobFinancials(j).complete).toBe(false);
  j.projection.costs_complete = true;
  expect(jobFinancials(j).complete).toBe(true);
  j.expenses.push(expense(j, 'payment'));
  expect(jobFinancials(j).complete).toBe(false);
});
it('warns on category overruns and projected profit erosion', () => {
  const j = job();
  add(j, expense(j, 'payment', 1e6));
  const c = jobFinancials(j);
  expect(c.categories[0].overrun).toBe(true);
  expect(c.profit_erosion).toBe(true);
});
const worker: Worker = {
  id: uuid(),
  organization_id: uuid(),
  user_id: uuid(),
  display_name: 'Synthetic worker',
  worker_type: 'w2_hourly',
  cost_source: 'time',
  active: true,
};
const rate: LaborRate = {
  id: uuid(),
  worker_id: worker.id,
  effective_from: '2026-01-01T00:00:00Z',
  cash_hour_minor: 2000,
  salary_week_minor: 80000,
  burden_bps: 2000,
  estimated_loaded_hour_minor: 2500,
  billing_hour_minor: 6500,
  imputed_hour_minor: 0,
  overtime_eligible: true,
  classification_review_reference: 'Synthetic classification review',
};
const policy: WorkforcePolicy = {
  timezone: 'America/Chicago',
  week_start: 7,
  overtime_after_seconds: 144000,
  overtime_multiplier_bps: 15000,
  review_reference: 'Synthetic policy',
};
function time(
  start: string,
  end: string | null,
  jobId: string | null = uuid(),
): TimeEntry {
  return {
    id: uuid(),
    worker_id: worker.id,
    job_id: jobId,
    overhead_center: jobId ? null : 'Administration',
    task: 'Project work',
    kind: 'work',
    started_at: start,
    ended_at: end,
    submitted: true,
    billable: !!jobId,
    corrects_id: null,
  };
}
const payroll = (entries: TimeEntry[], w = worker, r = rate, p = policy) =>
  preparePayroll(
    [w],
    [r],
    entries,
    entries.map((e) => ({
      entry_id: e.id,
      decision: 'approved',
      reason: 'Synthetic review',
    })),
    p,
  );
it('combines overtime across multiple jobs and overhead in one employer week', () => {
  const entries = Array.from({ length: 5 }, (_, i) =>
    time(
      `2026-10-0${i + 5}T13:00:00Z`,
      `2026-10-0${i + 5}T22:00:00Z`,
      i === 4 ? null : uuid(),
    ),
  );
  const rows = payroll(entries);
  expect(rows.reduce((s, r) => s + r.regular_seconds, 0)).toBe(40 * 3600);
  expect(rows.reduce((s, r) => s + r.overtime_seconds, 0)).toBe(5 * 3600);
  expect(rows.reduce((s, r) => s + r.cash_minor, 0)).toBe(95000);
  expect(rows.reduce((s, r) => s + r.burden_minor, 0)).toBe(19000);
});
it('rejects overlaps across jobs, including open clocks and breaks', () => {
  const a = time('2026-10-05T13:00:00Z', '2026-10-05T15:00:00Z');
  const b = time('2026-10-05T14:00:00Z', null);
  expect(() => validateTime([a, b])).toThrow(/Overlapping/);
});
it('permits adjacent job switching and preserves midnight elapsed time', () => {
  const entries = [
    time('2026-10-05T23:00:00-05:00', '2026-10-06T01:00:00-05:00'),
    time('2026-10-06T01:00:00-05:00', '2026-10-06T02:00:00-05:00'),
  ];
  expect(payroll(entries).reduce((s, r) => s + r.regular_seconds, 0)).toBe(
    10800,
  );
});
it('honors daylight-saving elapsed time instead of wall clock subtraction', () => {
  const e = time('2026-11-01T00:00:00-05:00', '2026-11-01T03:00:00-06:00');
  expect(payroll([e])[0].regular_seconds).toBe(14400);
});
it('splits a shift at the employer workweek boundary', () => {
  const e = time('2026-10-10T23:00:00-05:00', '2026-10-11T02:00:00-05:00');
  const rows = payroll([e]);
  expect(rows.map((r) => r.regular_seconds)).toEqual([3600, 7200]);
  expect(new Set(rows.map((r) => r.week)).size).toBe(2);
});
it('distinguishes paid and unpaid breaks', () => {
  const work = time('2026-10-05T13:00:00Z', '2026-10-05T14:00:00Z');
  const paid = {
    ...time('2026-10-05T14:00:00Z', '2026-10-05T14:15:00Z'),
    kind: 'break_paid' as const,
  };
  const unpaid = {
    ...time('2026-10-05T14:15:00Z', '2026-10-05T14:45:00Z'),
    kind: 'break' as const,
  };
  expect(
    payroll([work, paid, unpaid]).reduce((s, r) => s + r.cash_minor, 0),
  ).toBe(2500);
});
it.each([
  ['2026-10-05T13:00:00', '2026-10-05T14:00:00Z'],
  ['2026-10-05T13:00:00Z', '2026-10-05T13:00:00Z'],
  ['2026-10-05T13:00:00Z', '2026-10-06T13:00:00Z'],
])('rejects invalid timestamps %s / %s', (start, end) =>
  expect(() => payroll([time(start, end)])).toThrow(),
);
it('imputed owner time creates economic cost and no payroll wages', () => {
  const e = time('2026-10-05T13:00:00Z', '2026-10-05T15:00:00Z', null);
  const rows = payroll(
    [e],
    { ...worker, worker_type: 'owner', cost_source: 'imputed' },
    { ...rate, imputed_hour_minor: 4500 },
  );
  expect(rows[0].cash_minor).toBe(0);
  expect(rows[0].burden_minor).toBe(0);
  expect(rows[0].imputed_minor).toBe(9000);
});
it('invoice-costed contractor time never duplicates contractor cash fees', () => {
  const rows = payroll([time('2026-10-05T13:00:00Z', '2026-10-05T15:00:00Z')], {
    ...worker,
    worker_type: 'contractor_1099',
    cost_source: 'invoice',
  });
  expect(rows[0].cash_minor).toBe(0);
  expect(rows[0].billing_minor).toBe(13000);
});
it('requires reviewed effective rates and employer policy', () => {
  const e = time('2026-10-05T13:00:00Z', '2026-10-05T15:00:00Z');
  expect(() =>
    payroll([e], worker, { ...rate, effective_from: '2027-01-01T00:00:00Z' }),
  ).toThrow(/rate/);
  expect(() =>
    payroll([e], worker, rate, { ...policy, review_reference: '' }),
  ).toThrow(/policy/);
});
it('approved corrections supersede originals without mutating them', () => {
  const original = time('2026-10-05T13:00:00Z', '2026-10-05T15:00:00Z');
  const correction = {
    ...original,
    id: uuid(),
    ended_at: '2026-10-05T14:00:00Z',
    corrects_id: original.id,
  };
  expect(payroll([original, correction])[0].cash_minor).toBe(2000);
  expect(original.ended_at).toBe('2026-10-05T15:00:00Z');
});
it('exports preparation only and retains manually entered deductions', () => {
  const rows = payroll([time('2026-10-05T13:00:00Z', '2026-10-05T15:00:00Z')]);
  const csv = payrollCsv(rows, { [worker.id]: 100 });
  expect(csv).toContain('manual_deduction_minor');
  expect(csv.split('\n')[1].endsWith(',100')).toBe(true);
  expect(csv).not.toMatch(/bank|routing|withholding/);
});
it('uses employer midnight boundaries across DST', () => {
  expect(employerBoundary('2026-11-01', 'America/Chicago')).toBe(
    '2026-11-01T05:00:00Z',
  );
  expect(employerBoundary('2026-11-08', 'America/Chicago')).toBe(
    '2026-11-08T06:00:00Z',
  );
});
