import { documentHash } from '../../domain/release/preview';
import type { PayrollRow } from '../../domain/workforce/payroll';
import { completionReviewGuard } from '../job-cost-completion';
import { freezePrototype } from '../program/prototype-source';
import type { WorkforceData } from '../phase3';
import { type OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  readCostSavedRevision,
  costSavedRevisionsEnabled,
  type CostSavedEvidence,
} from './cost-saved-revisions';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  type SavedRevisionSnapshot,
} from './saved-revision-runtime';
import {
  evidenceFields,
  evidenceText,
  evidenceNumber,
  evidenceList,
  evidenceLiteral,
  type EvidenceRecipe,
  type EvidenceIdentity,
} from './saved-evidence-runtime';

export const recordedCostContinuityEnabled = costSavedRevisionsEnabled;
type Parser = (value: unknown) => unknown;
const text: Parser = (v) => evidenceText(v),
  number: Parser = (v) => {
    const n = evidenceNumber(v, -9000000000000);
    if (n > 9000000000000)
      throw Error('Bounded canonical minor amount required');
    return n;
  };
const optional =
  (parse: Parser): Parser =>
  (v) =>
    v === null ? null : parse(v);
const literal =
  (expected: string | boolean | null): Parser =>
  (v) =>
    evidenceLiteral(v, expected);
const choice =
  (...allowed: readonly unknown[]): Parser =>
  (v) => {
    if (!allowed.includes(v)) throw Error('Exact recorded cost state required');
    return v;
  };
const list =
  (parse: Parser): Parser =>
  (v) =>
    evidenceList(v).map(parse);
const shape =
  (schema: Record<string, Parser>): Parser =>
  (value) => {
    const p = evidenceFields(value, Object.keys(schema));
    return Object.fromEntries(Object.keys(p).map((k) => [k, schema[k](p[k])]));
  };
const id: Parser = (v) => {
  const s = evidenceText(v, 200);
  if (!s) throw Error('Source ID required');
  return s;
};
const hash: Parser = (v) => {
  const s = evidenceText(v, 64);
  if (!/^[a-f0-9]{64}$/.test(s)) throw Error('Source hash required');
  return s;
};
const nonnegative: Parser = (v) => evidenceNumber(v);
const categories = {
  materials: nonnegative,
  labor: nonnegative,
  equipment: nonnegative,
  subcontractors: nonnegative,
  other: nonnegative,
};
function project(snapshot: SavedRevisionSnapshot<unknown>) {
  const e = snapshot.evidence as CostSavedEvidence;
  return {
    job_name: e.job_name,
    customer_name: e.customer_name,
    property_label: e.property_label,
    currency: e.currency,
    job_revision: e.job_revision,
    issued: e.issued,
    facts: e.facts,
    expenses: e.expenses,
    reviews: e.reviews,
    time: e.time,
    locked_periods: e.locked_periods,
    labor_entry_ids: e.labor_entry_ids,
    invoice: e.invoice,
    accounting: e.accounting,
    authority: e.authority,
  };
}
export type RecordedCostEvidence = ReturnType<typeof project>;
const costSchema = shape({
  job_name: text,
  customer_name: text,
  property_label: text,
  currency: choice('USD'),
  job_revision: nonnegative,
  issued: shape({
    version_id: id,
    version_number: nonnegative,
    scope_sha256: hash,
  }),
  facts: shape({
    remaining: shape(categories),
    costs: optional(
      shape({
        recordedMinor: number,
        unpaidCommitmentMinor: number,
        remainingForecastMinor: number,
        costToCompleteMinor: number,
        projectedMinor: number,
        currency: choice('USD'),
      }),
    ),
    margin: optional(
      shape({
        revenueMinor: number,
        projectedCostMinor: number,
        projectedContributionMinor: number,
        projectedMarginBps: optional(number),
        profitErosion: optional(choice(true, false)),
      }),
    ),
    cost_coverage: choice('DECLARED_COSTS_COMPLETE', 'PARTIAL', 'UNKNOWN'),
    missing_evidence: list(text),
  }),
  expenses: list(
    shape({
      id,
      category: choice(...Object.keys(categories)),
      kind: choice('commitment', 'payment', 'credit'),
      amount_minor: number,
      estimate_line_id: optional(id),
      quantity_milli: optional(number),
      unit: optional(text),
      adjusts_expense_id: optional(id),
    }),
  ),
  reviews: list(
    shape({
      id,
      submission_id: id,
      decision: choice('approved', 'rejected'),
      created_at: text,
    }),
  ),
  time: list(
    shape({
      id,
      submitted: choice(true, false),
      kind: choice('work', 'break_paid', 'break'),
      started_at: text,
      ended_at: optional(text),
      corrects_id: optional(id),
      review: choice('approved', 'rejected', null),
    }),
  ),
  locked_periods: list(shape({ id })),
  labor_entry_ids: list(id),
  invoice: shape({
    overall: text,
    requirements: list(shape({ id, status: text, detail: text })),
  }),
  accounting: shape({
    coverage: text,
    invoice_ids: list(id),
    missing_evidence: list(text),
  }),
  authority: literal('READ_ONLY_NO_POSTING_ISSUANCE_OR_ACTION_RENEWAL'),
});
export function parseRecordedCostEvidence(
  value: unknown,
  identity?: EvidenceIdentity,
): RecordedCostEvidence {
  const parsed = costSchema(value) as RecordedCostEvidence;
  if (identity && parsed.issued.version_id !== identity.version_id)
    throw Error('Exact issued source ownership required');
  for (const rows of [
    parsed.expenses,
    parsed.reviews,
    parsed.time,
    parsed.locked_periods,
  ])
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw Error('Unique recorded source IDs required');
  if (new Set(parsed.labor_entry_ids).size !== parsed.labor_entry_ids.length)
    throw Error('Unique labor sources required');
  return parsed;
}
export function assertRecordedCostSource(
  payload: RecordedCostEvidence,
  snapshot: SavedRevisionSnapshot<unknown>,
) {
  const current = project(snapshot);
  parseRecordedCostEvidence(payload, snapshot.identity);
  if (
    payload.job_revision > current.job_revision ||
    JSON.stringify(payload.issued) !== JSON.stringify(current.issued) ||
    ['job_name', 'customer_name', 'property_label', 'currency'].some(
      (k) =>
        payload[k as keyof RecordedCostEvidence] !==
        current[k as keyof RecordedCostEvidence],
    )
  )
    throw Error('Exact historical cost source required');
  for (const key of ['expenses', 'reviews', 'locked_periods'] as const)
    for (const row of payload[key])
      if (!current[key].some((r) => JSON.stringify(r) === JSON.stringify(row)))
        throw Error('Unrecorded cost source rejected');
  for (const row of payload.time) {
    const match = current.time.find((r) => r.id === row.id);
    if (
      !match ||
      ['id', 'kind', 'started_at', 'ended_at', 'corrects_id'].some(
        (k) => row[k as keyof typeof row] !== match[k as keyof typeof row],
      ) ||
      (row.submitted && !match.submitted) ||
      (row.review !== null && row.review !== match.review)
    )
      throw Error('Unrecorded time source rejected');
  }
  if (
    payload.labor_entry_ids.some(
      (id) => !current.labor_entry_ids.includes(id),
    ) ||
    payload.accounting.invoice_ids.some(
      (id) => !current.accounting.invoice_ids.includes(id),
    )
  )
    throw Error('Unrecorded labor/invoice source rejected');
  if (
    payload.job_revision === current.job_revision &&
    JSON.stringify(payload) !== JSON.stringify(current)
  )
    throw Error('Current cost content must match canonical source');
}
export const recordedCostRecipe: EvidenceRecipe<RecordedCostEvidence> & {
  assertSource: typeof assertRecordedCostSource;
} = Object.freeze({
  kind: 'finance',
  title: 'Recorded cost',
  read: readCostSavedRevision,
  project,
  parse: parseRecordedCostEvidence,
  assertSource: assertRecordedCostSource,
});

type Jobs = Awaited<ReturnType<OperatingSources['estimates']['jobs']>>;
interface State {
  workforce: WorkforceData;
  jobs: Jobs;
  signature: string;
}
interface PeriodBinding {
  sources: OperatingSources;
  snapshot: Awaited<ReturnType<typeof readCostSavedRevision>>;
  gate: JourneyAdmission;
  start: string;
  end: string;
  state: State;
  rows: PayrollRow[];
  sha256: string;
  used: boolean;
}
export interface OrganizationLaborPreview {
  readonly organization_id: string;
  readonly selected_job_id: string;
  readonly start: string;
  readonly end: string;
  readonly source_sha256: string;
  readonly jobs: readonly {
    id: string;
    name: string;
    revision: number;
    entry_ids: readonly string[];
    loaded_cost_minor: number;
  }[];
  readonly entries: readonly {
    id: string;
    job_id: string | null;
    started_at: string;
    ended_at: string | null;
    review: string | null;
    included_in_original_preparation: boolean;
  }[];
  readonly meaning: 'ORGANIZATION_WIDE_INTERNAL_PREPARATION_ONLY';
  readonly financial_execution: false;
}
const previews = new WeakMap<object, PeriodBinding>();
type Attempt = {
  start: string;
  end: string;
  status: 'PENDING' | 'UNKNOWN' | 'LOCKED';
  estimates: OperatingSources['estimates'];
  sha256: string;
  period_id?: string;
};
// One-use command outcome metadata only; canonical records stay in the original repository.
const attempts = new WeakMap<
  OperatingSources['operations'],
  Map<string, Attempt[]>
>();
function ledger(b: PeriodBinding) {
  let orgs = attempts.get(b.sources.operations);
  if (!orgs) attempts.set(b.sources.operations, (orgs = new Map()));
  let rows = orgs.get(b.snapshot.identity.organization_id);
  if (!rows) orgs.set(b.snapshot.identity.organization_id, (rows = []));
  return rows;
}
function admit(gate: JourneyAdmission) {
  completionReviewGuard(gate)();
  if (!recordedCostContinuityEnabled(true))
    throw Error('Recorded cost continuity is OFF');
}
function current(b: PeriodBinding, mutable = true) {
  admit(b.gate);
  if (mutable) assertSavedRevisionCurrent(b.snapshot);
  else assertSavedRevisionAccess(b.snapshot);
}
async function state(
  sources: OperatingSources,
  check: () => void,
): Promise<State> {
  check();
  const workforce = await sources.estimates.workforce(sources.company.id);
  check();
  const jobs = await sources.estimates.jobs(sources.company.id);
  check();
  if (
    !workforce.payroll_admin ||
    jobs.some((j) => j.organization_id !== sources.company.id) ||
    new Set(jobs.map((j) => j.id)).size !== jobs.length
  )
    throw Error('Exact organization payroll authority required');
  return { workforce, jobs, signature: JSON.stringify({ workforce, jobs }) };
}
function interval(start: string, end: string) {
  const pattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
  if (
    !pattern.test(start) ||
    !pattern.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    new Date(start).toISOString() !== start ||
    new Date(end).toISOString() !== end ||
    start >= end ||
    Date.parse(end) > Date.now() ||
    Date.parse(end) - Date.parse(start) > 32 * 86400000
  )
    throw Error('Exact ended period of at most 32 days required');
}
export async function previewOrganizationLabor(
  sources: OperatingSources,
  jobId: string,
  input: { start: string; end: string },
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<OrganizationLaborPreview> {
  admit(gate);
  const p = evidenceFields(input, ['start', 'end']),
    start = evidenceText(p.start, 40),
    end = evidenceText(p.end, 40);
  interval(start, end);
  const snapshot = await readCostSavedRevision(sources, jobId, gate),
    check = () => {
      admit(gate);
      assertSavedRevisionCurrent(snapshot);
    };
  const before = await state(sources, check);
  if (
    before.workforce.periods.some(
      (p) => p.status === 'locked' && p.starts_at < end && p.ends_at > start,
    )
  )
    throw Error('Existing locked period overlaps');
  const entries = before.workforce.entries.filter(
    (e) => e.started_at < end && (e.ended_at ?? '9999') > start,
  );
  if (!entries.length)
    throw Error(
      'Recorded reviewed time required; no empty organization preparation',
    );
  check();
  const prepared = await sources.estimates.payroll(
    sources.company.id,
    start,
    end,
    {},
    false,
  );
  check();
  const after = await state(sources, check);
  if (before.signature !== after.signature)
    throw Error('Canonical organization preparation source changed');
  const sha256 = await documentHash({
    organization_id: snapshot.identity.organization_id,
    start,
    end,
    source: before.signature,
  });
  check();
  const view = freezePrototype({
    organization_id: snapshot.identity.organization_id,
    selected_job_id: jobId,
    start,
    end,
    source_sha256: sha256,
    jobs: before.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      revision: j.lock_revision,
      entry_ids: prepared.rows
        .filter((r) => r.job_id === j.id)
        .map((r) => r.entry_id),
      loaded_cost_minor: prepared.rows
        .filter((r) => r.job_id === j.id)
        .reduce(
          (sum, r) => sum + r.cash_minor + r.burden_minor + r.imputed_minor,
          0,
        ),
    })),
    entries: entries.map((e) => ({
      id: e.id,
      job_id: e.job_id,
      started_at: e.started_at,
      ended_at: e.ended_at,
      review:
        before.workforce.reviews.find((r) => r.entry_id === e.id)?.decision ??
        null,
      included_in_original_preparation: prepared.rows.some(
        (r) => r.entry_id === e.id,
      ),
    })),
    meaning: 'ORGANIZATION_WIDE_INTERNAL_PREPARATION_ONLY' as const,
    financial_execution: false as const,
  });
  previews.set(view, {
    sources,
    snapshot,
    gate,
    start,
    end,
    state: before,
    rows: prepared.rows,
    sha256,
    used: false,
  });
  return view;
}
export function assertOrganizationLaborAccess(view: OrganizationLaborPreview) {
  const b = previews.get(view);
  if (!b) throw Error('Original organization preview required');
  current(b, false);
}
export function assertOrganizationLaborCurrent(view: OrganizationLaborPreview) {
  const b = previews.get(view);
  if (!b) throw Error('Original organization preview required');
  current(b);
  interval(b.start, b.end);
}
export async function confirmOrganizationLabor(
  view: OrganizationLaborPreview,
  confirmed: boolean,
  live: () => boolean = () => true,
) {
  const b = previews.get(view);
  if (!b) return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  let attempt: Attempt | undefined;
  try {
    if (confirmed !== true || b.used)
      throw Error('Unused explicit organization confirmation required');
    current(b);
    interval(b.start, b.end);
    if (ledger(b).some((a) => a.start < b.end && a.end > b.start))
      return {
        status: 'HELD_NO_REPLAY' as const,
        replay: 'FORBIDDEN' as const,
      };
    if (live() !== true)
      return {
        status: 'WITHHELD_NO_DISPATCH' as const,
        replay: 'FORBIDDEN' as const,
      };
    current(b);
    b.used = true;
    attempt = {
      start: b.start,
      end: b.end,
      status: 'PENDING',
      estimates: b.sources.estimates,
      sha256: b.sha256,
    };
    ledger(b).push(attempt);
    const before = await state(b.sources, () => current(b));
    if (before.signature !== b.state.signature)
      throw Error('Organization source changed before preparation');
    if (live() !== true) throw Error('Preparation confirmation withdrawn');
    current(b);
    interval(b.start, b.end);
    const result = await b.sources.estimates.payroll(
      view.organization_id,
      b.start,
      b.end,
      {},
      true,
    );
    current(b, false);
    const after = await state(b.sources, () => current(b, false));
    const periods = after.workforce.periods.filter(
      (p) =>
        p.starts_at === b.start && p.ends_at === b.end && p.status === 'locked',
    );
    if (
      periods.length !== 1 ||
      !periods[0].snapshot ||
      JSON.stringify(result) !==
        JSON.stringify({ rows: b.rows, deductions: {} }) ||
      JSON.stringify(periods[0].snapshot) !== JSON.stringify(result) ||
      after.workforce.periods.length !== before.workforce.periods.length + 1 ||
      after.jobs.length !== before.jobs.length ||
      before.jobs.some(
        (j) =>
          after.jobs.find((n) => n.id === j.id)?.lock_revision !==
          j.lock_revision + 1,
      )
    )
      throw Error('Exact original payroll acknowledgment required');
    const expectedWorkforce = {
      ...before.workforce,
      periods: [...before.workforce.periods, periods[0]],
    };
    if (JSON.stringify(expectedWorkforce) !== JSON.stringify(after.workforce))
      throw Error('Organization workforce changed during preparation');
    for (const job of before.jobs) {
      const actual = after.jobs.find((j) => j.id === job.id)!;
      const rows = b.rows.filter((r) => r.job_id === job.id);
      const old = job.labor ?? {
        seconds: 0,
        billable_seconds: 0,
        cash_minor: 0,
        burden_minor: 0,
        imputed_minor: 0,
        billing_minor: 0,
      };
      const total = (key: keyof PayrollRow) =>
        rows.reduce((sum, r) => sum + Number(r[key]), 0);
      const labor = {
        seconds:
          old.seconds + total('regular_seconds') + total('overtime_seconds'),
        billable_seconds: old.billable_seconds + total('billable_seconds'),
        cash_minor: old.cash_minor + total('cash_minor'),
        burden_minor: old.burden_minor + total('burden_minor'),
        imputed_minor: old.imputed_minor + total('imputed_minor'),
        billing_minor: old.billing_minor + total('billing_minor'),
      };
      if (
        JSON.stringify(actual) !==
        JSON.stringify({ ...job, labor, lock_revision: job.lock_revision + 1 })
      )
        throw Error('Exact canonical aggregate acknowledgment required');
    }
    if (live() !== true)
      throw Error('Preparation acknowledgment context changed');
    current(b, false);
    attempt.period_id = periods[0].id;
    attempt.status = 'LOCKED';
    return freezePrototype({
      status: 'LOCKED_INTERNAL_PREPARATION' as const,
      period_id: periods[0].id,
      replay: 'FORBIDDEN' as const,
      financial_execution: false as const,
    });
  } catch {
    if (attempt) attempt.status = 'UNKNOWN';
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
}
export async function reconcileOrganizationLabor(
  view: OrganizationLaborPreview,
) {
  const b = previews.get(view);
  if (!b) return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  try {
    current(b, false);
    const currentState = await state(b.sources, () => current(b, false));
    const claim = ledger(b).find(
      (a) =>
        a.start === b.start &&
        a.end === b.end &&
        a.sha256 === b.sha256 &&
        a.estimates === b.sources.estimates,
    );
    const matches = currentState.workforce.periods.filter(
      (p) =>
        p.starts_at === b.start &&
        p.ends_at === b.end &&
        p.status === 'locked' &&
        JSON.stringify(p.snapshot) ===
          JSON.stringify({ rows: b.rows, deductions: {} }),
    );
    if (claim?.status === 'LOCKED' && matches.length !== 1)
      claim.status = 'UNKNOWN';
    return freezePrototype({
      status: claim?.status ?? 'NOT_ATTEMPTED',
      exact_period_observed: matches.length === 1,
      period_id: matches.length === 1 ? matches[0].id : null,
      replay: 'FORBIDDEN' as const,
      meaning: 'EXACT_READ_ONLY_RECONCILIATION' as const,
    });
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
}
