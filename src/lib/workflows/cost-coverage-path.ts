import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import type {
  DailyWorkbenchProps,
  DailyWorkbenchStep,
} from './daily-workbench-contract';
import type { PriorityLiveCallback } from './priority-actions';
import {
  costCorrectionReviewEnabled,
  readCostCorrectionReview,
  assertCostCorrectionReviewCurrent,
} from './cost-correction-review';
import {
  readDailyWorkContext,
  assertDailyWorkContextNow,
  continueDailyWorkContext,
} from './daily-workbench-runtime';
export const costCoveragePathEnabled = costCorrectionReviewEnabled;
export interface CostCoverageSource {
  readonly key: string;
  readonly kind:
    'time' | 'material' | 'material_review' | 'invoice_requirement';
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly references: readonly string[];
  readonly facts: readonly string[];
  readonly destination: DailyWorkbenchStep;
}
/** Original current read handles only, not canonical state or command custody. */
const reads = new WeakSet<object>();
export async function readCostCoveragePath(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const g = prototypeFields(gate, ['enabled', 'confirmed']);
  if (
    Object.keys(g).length !== 2 ||
    g.enabled !== true ||
    g.confirmed !== true ||
    !costCoveragePathEnabled(true)
  )
    throw Error('Cost coverage path is OFF');
  const original = await readCostCorrectionReview(sources, jobId, gate),
    context = await readDailyWorkContext(sources, jobId, gate),
    e = original.costs.evidence;
  assertCostCorrectionReviewCurrent(original);
  assertDailyWorkContextNow(context);
  const rows: CostCoverageSource[] = [];
  for (const time of e.time) {
    const correcting = e.time.filter((t) => t.corrects_id === time.id);
    rows.push({
      key: `time:${time.id}`,
      kind: 'time',
      id: time.id,
      title: 'Recorded time and correction lineage',
      status: time.review ?? 'NO_RECORDED_REVIEW',
      references: [
        ...(time.corrects_id ? [time.corrects_id] : []),
        ...correcting.map((t) => t.id),
      ],
      facts: [
        `Submitted: ${time.submitted}`,
        `Recorded review: ${time.review ?? 'not present in available source'}`,
        `Started: ${time.started_at}; ended: ${time.ended_at ?? 'OPEN'}`,
        `Corrects exact entry: ${time.corrects_id ?? 'none recorded'}`,
        `Correction entries: ${correcting.map((t) => t.id).join(', ') || 'none recorded'}`,
        e.labor_entry_ids.includes(time.id)
          ? 'Included in available canonical locked-labor evidence.'
          : 'UNPOSTED OR UNVERIFIED: entry is absent from available canonical locked-labor evidence. This is not zero-cost proof.',
      ],
      destination: 'field',
    });
  }
  for (const expense of e.expenses) {
    const events = e.reviews.filter((r) => r.submission_id === expense.id);
    rows.push({
      key: `material:${expense.id}`,
      kind: 'material',
      id: expense.id,
      title: 'Recorded expense source',
      status:
        events.length === 1 ? events[0].decision : 'NO_UNIQUE_RECORDED_REVIEW',
      references: [
        ...events.map((r) => r.id),
        ...(expense.adjusts_expense_id ? [expense.adjusts_expense_id] : []),
      ],
      facts: [
        `Category: ${expense.category}; recorded kind: ${expense.kind}`,
        `Exact recorded amount: ${expense.amount_minor} ${e.currency} minor units`,
        events.length === 1
          ? `Original event ${events[0].id} records ${events[0].decision}.`
          : 'No unique original review event is available; do not infer approval or posting.',
        `Adjustment source: ${expense.adjusts_expense_id ?? 'none recorded'}`,
      ],
      destination: 'finance',
    });
  }
  for (const review of e.reviews) {
    const source = e.expenses.filter((x) => x.id === review.submission_id);
    rows.push({
      key: `material_review:${review.id}`,
      kind: 'material_review',
      id: review.id,
      title: 'Original material review event',
      status: source.length === 1 ? review.decision : 'UNKNOWN_SOURCE_LINK',
      references: [review.submission_id],
      facts: [
        `Exact submission: ${review.submission_id}`,
        `Recorded decision: ${review.decision}; recorded at: ${review.created_at}`,
        source.length === 1
          ? 'Exact expense source exists in this current job.'
          : 'Expense linkage is unavailable; no text, amount or supplier matching is used.',
        'Internal expense review is not payment, invoice, procurement or settlement authority.',
      ],
      destination: 'finance',
    });
  }
  for (const requirement of e.invoice.requirements)
    rows.push({
      key: `invoice_requirement:${requirement.id}`,
      kind: 'invoice_requirement',
      id: requirement.id,
      title: 'Original invoice requirement',
      status: requirement.status,
      references: [e.issued.version_id],
      facts: [
        requirement.detail,
        `Original invoice review: ${e.invoice.overall}`,
        'Requirement review does not issue an invoice or create customer debt.',
      ],
      destination: 'invoice',
    });
  const view = freezePrototype({
    original,
    context,
    rows,
    coverage: e.facts.cost_coverage,
    missing_evidence: [...e.facts.missing_evidence],
    invoice_status: e.invoice.overall,
    limits:
      'Available current recorded sources only. Missing, superseded or unposted labor is not complete cost proof. No ledger, payment, posting or invoice authority.',
    operational_ready: false as const,
  });
  reads.add(view);
  return view;
}
export type CostCoveragePathRead = Awaited<
  ReturnType<typeof readCostCoveragePath>
>;
export function assertCostCoveragePathCurrent(view: CostCoveragePathRead) {
  if (!reads.has(view)) throw Error('Original cost coverage read required');
  assertCostCorrectionReviewCurrent(view.original);
  assertDailyWorkContextNow(view.context);
}
export function inspectCostCoverageSource(
  view: CostCoveragePathRead,
  input: { kind: CostCoverageSource['kind']; id: string },
) {
  assertCostCoveragePathCurrent(view);
  const p = prototypeFields(input, ['kind', 'id']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.kind !== 'string' ||
    typeof p.id !== 'string' ||
    p.id.length > 200
  )
    throw Error('Exact recorded cost source selector required');
  const rows = view.rows.filter(
    (row) => row.kind === p.kind && row.id === p.id,
  );
  if (rows.length !== 1)
    throw Error('Unique exact recorded cost source required');
  assertCostCoveragePathCurrent(view);
  return rows[0];
}
export async function continueCostCoverageSource(
  view: CostCoveragePathRead,
  row: CostCoverageSource,
  callback: NonNullable<DailyWorkbenchProps['onContinue']>,
  live: PriorityLiveCallback,
) {
  try {
    assertCostCoveragePathCurrent(view);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
  if (!view.rows.includes(row) || typeof callback !== 'function')
    return {
      status: 'WITHHELD_NO_DISPATCH' as const,
      replay: 'FORBIDDEN' as const,
    };
  const current = prototypeFields(live, ['current', 'generation']);
  if (current.current !== callback || !Number.isSafeInteger(current.generation))
    return {
      status: 'WITHHELD_NO_DISPATCH' as const,
      replay: 'FORBIDDEN' as const,
    };
  const generation = current.generation;
  const dispatch = async () => {
    assertCostCoveragePathCurrent(view);
    await callback(view.context.job_id, row.destination);
    assertCostCoveragePathCurrent(view);
  };
  const lease = () => {
    assertCostCoveragePathCurrent(view);
    const next = prototypeFields(live, ['current', 'generation']);
    return next.current === callback && next.generation === generation
      ? dispatch
      : undefined;
  };
  return continueDailyWorkContext(
    view.context,
    row.destination,
    dispatch,
    lease,
  );
}
