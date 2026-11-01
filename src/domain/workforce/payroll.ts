import { Temporal } from '@js-temporal/polyfill';
export type WorkerType =
  'w2_hourly' | 'salaried' | 'contractor_1099' | 'owner' | 'other';
export interface Worker {
  id: string;
  organization_id: string;
  user_id: string;
  display_name: string;
  worker_type: WorkerType;
  cost_source: 'time' | 'invoice' | 'imputed';
  active: boolean;
}
export interface LaborRate {
  id: string;
  worker_id: string;
  effective_from: string;
  cash_hour_minor: number;
  salary_week_minor: number;
  burden_bps: number;
  estimated_loaded_hour_minor: number;
  billing_hour_minor: number;
  imputed_hour_minor: number;
  overtime_eligible: boolean;
  classification_review_reference: string;
}
export interface WorkforcePolicy {
  currency?: string;
  timezone: string;
  week_start: number;
  overtime_after_seconds: number;
  overtime_multiplier_bps: number;
  review_reference: string;
}
export interface TimeEntry {
  id: string;
  worker_id: string;
  job_id: string | null;
  overhead_center: string | null;
  task: string;
  kind: 'work' | 'break_paid' | 'break';
  started_at: string;
  ended_at: string | null;
  submitted: boolean;
  billable: boolean;
  corrects_id: string | null;
}
export interface TimeReview {
  entry_id: string;
  decision: 'approved' | 'rejected';
  reason: string;
}
export interface PayrollRow {
  entry_id: string;
  worker_id: string;
  job_id: string | null;
  week: string;
  regular_seconds: number;
  overtime_seconds: number;
  cash_minor: number;
  burden_minor: number;
  imputed_minor: number;
  billing_minor: number;
  estimated_loaded_minor: number;
  billable_seconds: number;
  rate_id: string | null;
}
function instant(value: string) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error('Explicit timezone offset required');
  return Temporal.Instant.from(value);
}
export function validateTime(entries: TimeEntry[]) {
  for (const e of entries) {
    if ((e.job_id === null) === (e.overhead_center === null) || !e.task.trim())
      throw new Error('Choose a job or approved overhead cost center and task');
    const start = instant(e.started_at);
    if (e.ended_at) {
      const end = instant(e.ended_at);
      if (
        end.epochMilliseconds <= start.epochMilliseconds ||
        end.epochMilliseconds - start.epochMilliseconds > 18 * 3600000
      )
        throw new Error(
          'Time segment must be positive and no longer than 18 hours',
        );
    }
    for (const other of entries) {
      if (
        other.id === e.id ||
        other.worker_id !== e.worker_id ||
        e.corrects_id === other.id ||
        other.corrects_id === e.id
      )
        continue;
      const a = start.epochMilliseconds;
      const b = e.ended_at ? instant(e.ended_at).epochMilliseconds : Infinity;
      const c = instant(other.started_at).epochMilliseconds;
      const d = other.ended_at
        ? instant(other.ended_at).epochMilliseconds
        : Infinity;
      if (a < d && c < b) throw new Error('Overlapping time entries');
    }
  }
}
function round(n: bigint, d = 3600n): bigint {
  if (n < 0n) return -round(-n, d);
  return (n + d / 2n) / d;
}
const safe = (n: bigint) => {
  if (n > 9000000000000n || n < -9000000000000n)
    throw new Error('Labor cost exceeds limit');
  return Number(n);
};
export function preparePayroll(
  workers: Worker[],
  rates: LaborRate[],
  entries: TimeEntry[],
  reviews: TimeReview[],
  policy: WorkforcePolicy,
): PayrollRow[] {
  if (
    !policy.review_reference.trim() ||
    !Number.isInteger(policy.week_start) ||
    policy.week_start < 1 ||
    policy.week_start > 7 ||
    !Number.isInteger(policy.overtime_after_seconds) ||
    policy.overtime_after_seconds < 1 ||
    policy.overtime_after_seconds > 7 * 86400 ||
    !Number.isInteger(policy.overtime_multiplier_bps) ||
    policy.overtime_multiplier_bps < 10000 ||
    policy.overtime_multiplier_bps > 30000
  )
    throw new Error('Reviewed employer overtime policy required');
  const approved = new Set(
    reviews.filter((r) => r.decision === 'approved').map((r) => r.entry_id),
  );
  const superseded = new Set(
    entries
      .filter((e) => approved.has(e.id) && e.corrects_id)
      .map((e) => e.corrects_id),
  );
  const active = entries.filter(
    (e) => approved.has(e.id) && !superseded.has(e.id),
  );
  validateTime(active);
  const pieces: {
    entry: TimeEntry;
    start: Temporal.Instant;
    seconds: number;
    week: string;
    rate: LaborRate;
    worker: Worker;
  }[] = [];
  for (const e of active) {
    if (e.kind === 'break') continue;
    if (!e.ended_at || !e.submitted)
      throw new Error('Approved time must be closed and submitted');
    const worker = workers.find((w) => w.id === e.worker_id);
    if (!worker) throw new Error('Worker unavailable');
    let start = instant(e.started_at);
    const end = instant(e.ended_at);
    while (Temporal.Instant.compare(start, end) < 0) {
      const local = start.toZonedDateTimeISO(policy.timezone);
      const date = local
        .toPlainDate()
        .subtract({ days: (local.dayOfWeek - policy.week_start + 7) % 7 });
      const weekStart = date.toZonedDateTime({
        timeZone: policy.timezone,
        plainTime: '00:00',
      });
      const next = weekStart.add({ days: 7 }).toInstant();
      const stop = Temporal.Instant.compare(next, end) < 0 ? next : end;
      const seconds = (stop.epochMilliseconds - start.epochMilliseconds) / 1000;
      if (!Number.isInteger(seconds))
        throw new Error('Time precision is whole seconds');
      const rate = rates
        .filter(
          (r) =>
            r.worker_id === worker.id &&
            Temporal.Instant.compare(instant(r.effective_from), start) <= 0,
        )
        .sort(
          (a, b) => Date.parse(a.effective_from) - Date.parse(b.effective_from),
        )
        .at(-1);
      if (
        rates.some(
          (r) =>
            r.worker_id === worker.id &&
            Date.parse(r.effective_from) > start.epochMilliseconds &&
            Date.parse(r.effective_from) < stop.epochMilliseconds,
        )
      )
        throw new Error('Split time at effective rate changes');
      if (!rate?.classification_review_reference.trim())
        throw new Error('Reviewed effective labor rate required');
      for (const n of [
        rate.cash_hour_minor,
        rate.salary_week_minor,
        rate.estimated_loaded_hour_minor,
        rate.billing_hour_minor,
        rate.imputed_hour_minor,
        rate.burden_bps,
      ])
        if (!Number.isSafeInteger(n) || n < 0 || n > 1e9)
          throw new Error('Invalid labor rate');
      pieces.push({
        entry: e,
        start,
        seconds,
        week: weekStart.toInstant().toString(),
        rate,
        worker,
      });
      start = stop;
    }
  }
  pieces.sort(
    (a, b) =>
      a.start.epochMilliseconds - b.start.epochMilliseconds ||
      a.entry.id.localeCompare(b.entry.id),
  );
  const elapsed = new Map<string, number>();
  return pieces.map((p) => {
    const key = `${p.worker.id}|${p.week}`;
    const before = elapsed.get(key) ?? 0;
    elapsed.set(key, before + p.seconds);
    const regular = p.rate.overtime_eligible
      ? Math.max(0, Math.min(p.seconds, policy.overtime_after_seconds - before))
      : p.seconds;
    const overtime = p.seconds - regular;
    const r = p.rate;
    let cash = 0n;
    if (p.worker.cost_source === 'time') {
      if (p.worker.worker_type === 'salaried') {
        const group = pieces.filter(
          (x) => x.worker.id === p.worker.id && x.week === p.week,
        );
        if (group.some((x) => x.rate.salary_week_minor !== r.salary_week_minor))
          throw new Error(
            'Salary rate changes within a week require reviewed allocation',
          );
        const total = BigInt(group.reduce((s, x) => s + x.seconds, 0));
        cash =
          p === group.at(-1)
            ? BigInt(r.salary_week_minor) -
              group
                .slice(0, -1)
                .reduce(
                  (s, x) =>
                    s +
                    (BigInt(r.salary_week_minor) * BigInt(x.seconds)) / total,
                  0n,
                )
            : (BigInt(r.salary_week_minor) * BigInt(p.seconds)) / total;
        if (r.overtime_eligible)
          cash += round(
            BigInt(r.salary_week_minor) *
              BigInt(overtime) *
              BigInt(policy.overtime_multiplier_bps - 10000),
            BigInt(policy.overtime_after_seconds) * 10000n,
          );
      } else
        cash = round(
          BigInt(r.cash_hour_minor) *
            (BigInt(regular) * 10000n +
              BigInt(overtime) * BigInt(policy.overtime_multiplier_bps)),
          3600n * 10000n,
        );
    }
    return {
      entry_id: p.entry.id,
      worker_id: p.worker.id,
      job_id: p.entry.job_id,
      week: p.week,
      regular_seconds: regular,
      overtime_seconds: overtime,
      cash_minor: safe(cash),
      burden_minor: safe(round(cash * BigInt(r.burden_bps), 10000n)),
      imputed_minor: safe(
        round(BigInt(r.imputed_hour_minor) * BigInt(p.seconds)),
      ),
      billing_minor: safe(
        round(BigInt(r.billing_hour_minor) * BigInt(p.seconds)),
      ),
      estimated_loaded_minor: safe(
        round(BigInt(r.estimated_loaded_hour_minor) * BigInt(p.seconds)),
      ),
      billable_seconds: p.entry.billable ? p.seconds : 0,
      rate_id: r.id,
    };
  });
}
export function payrollCsv(
  rows: PayrollRow[],
  deductions: Record<string, number> = {},
  currency = 'USD',
) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid payroll currency');
  const workerIds = [
    ...new Set([...rows.map((r) => r.worker_id), ...Object.keys(deductions)]),
  ];
  return [
    'worker_id,currency,regular_seconds,overtime_seconds,cash_minor,employer_burden_minor,imputed_minor,billing_value_minor,manual_deduction_minor',
    ...workerIds.map((id) => {
      const own = rows.filter((r) => r.worker_id === id);
      const deduction = deductions[id] ?? 0;
      if (!Number.isSafeInteger(deduction) || deduction < 0)
        throw new Error('Invalid deduction');
      const sum = (key: keyof PayrollRow) =>
        safe(
          own.reduce((s, r) => {
            const n = Number(r[key]);
            if (!Number.isSafeInteger(n))
              throw new Error('Invalid payroll amount');
            return s + BigInt(n);
          }, 0n),
        );
      return [
        id,
        currency,
        sum('regular_seconds'),
        sum('overtime_seconds'),
        sum('cash_minor'),
        sum('burden_minor'),
        sum('imputed_minor'),
        sum('billing_minor'),
        deduction,
      ].join(',');
    }),
  ].join('\n');
}

export function employerBoundary(date: string, timezone: string) {
  return Temporal.PlainDate.from(date)
    .toZonedDateTime({ timeZone: timezone, plainTime: '00:00' })
    .toInstant()
    .toString();
}
