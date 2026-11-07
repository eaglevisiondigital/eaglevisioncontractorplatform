import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { OperatingSources } from './operating-center-runtime';
import type { JourneyAdmission } from './journey-runtime';
import {
  costCoveragePathEnabled,
  readCostCoveragePath,
  assertCostCoveragePathCurrent,
  inspectCostCoverageSource,
  continueCostCoverageSource,
  type CostCoverageSource,
} from './cost-coverage-path';
import {
  readFinancialCasework,
  openFinancialCaseworkJob,
  assertFinancialCaseworkCurrent,
} from './financial-casework';
import { assertCostCorrectionReviewAccess } from './cost-correction-review';
export const recordedCostRequirementsEnabled = costCoveragePathEnabled;
/** Read handles only. Native cost, invoice, correction and navigation owners remain unchanged. */
const reads = new WeakSet<object>();
export async function readRecordedCostRequirements(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const original = await readCostCoveragePath(sources, jobId, gate);
  assertCostCoveragePathCurrent(original);
  const entries = sources.entries.filter((e) => e.target.job_id === jobId);
  if (entries.length !== 1) throw Error('Unique original cost job required');
  const review = await readFinancialCasework(
      { ...sources, entries },
      { as_of: new Date().toISOString(), input_revision: 1 },
      gate,
    ),
    detail = openFinancialCaseworkJob(review, jobId),
    e = original.original.costs.evidence,
    identity = original.original.costs.identity;
  assertCostCoveragePathCurrent(original);
  assertFinancialCaseworkCurrent(detail);
  if (
    detail.job.target.organization_id !== identity.organization_id ||
    detail.job.target.customer_id !== identity.customer_id ||
    detail.job.target.location_id !== identity.location_id ||
    detail.job.target.version_id !== identity.version_id ||
    detail.job.source.job_revision !== e.job_revision
  )
    throw Error('Exact canonical financial and cost identity required');
  const categories = original.original.canonical.categories.map((category) => ({
    ...category,
    source_keys: original.rows
      .filter(
        (row) =>
          (row.kind === 'time' && category.category === 'labor') ||
          (row.kind === 'material' &&
            e.expenses.some(
              (expense) =>
                expense.id === row.id && expense.category === category.category,
            )),
      )
      .map((row) => row.key),
    meaning: 'CANONICAL_CATEGORY_TOTAL_NOT_PER_ENTRY_ALLOCATION' as const,
  }));
  const labor = e.time.map((time) => ({
    entry_id: time.id,
    corrects_id: time.corrects_id,
    correcting_entry_ids: e.time
      .filter((t) => t.corrects_id === time.id)
      .map((t) => t.id),
    recorded_review: time.review,
    submitted: time.submitted,
    locked_labor_reference: e.labor_entry_ids.includes(time.id),
    requirement: e.labor_entry_ids.includes(time.id)
      ? ('EXACT_ENTRY_IN_AVAILABLE_LOCKED_LABOR_EVIDENCE' as const)
      : ('UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST' as const),
  }));
  const value = freezePrototype({
    original,
    detail,
    categories,
    labor,
    locked_period_ids: e.locked_periods.map((p) => p.id),
    requirements: detail.job.requirements,
    invoices: detail.job.financial.invoices,
    unlinked_events: detail.job.financial.unlinked_events,
    unlinked_ledger: detail.job.financial.unlinked_ledger,
    coverage: e.facts.cost_coverage,
    invoice_overall: e.invoice.overall,
    financial_coverage: detail.job.financial.coverage,
    canonical_anomalies: original.original.canonical.anomalies,
    operational_ready: false as const,
    limits:
      'Canonical totals are copied, never recalculated or allocated across entries. Locked labor references do not prove payment; a corrected task does not prove cost coverage. Missing financial links remain UNKNOWN. Staff review cannot post, issue, settle or pay.',
  });
  reads.add(value);
  return value;
}
export type RecordedCostRequirementsRead = Awaited<
  ReturnType<typeof readRecordedCostRequirements>
>;
/** Access to an original point-in-time read only. Mutable financial freshness
 * and native navigation still require the separate current read's guards. */
export function assertRecordedCostRequirementsAccess(
  view: RecordedCostRequirementsRead,
) {
  if (!reads.has(view))
    throw Error('Original recorded-cost requirements required');
  assertCostCorrectionReviewAccess(view.original.original);
}
export function assertRecordedCostRequirementsCurrent(
  view: RecordedCostRequirementsRead,
) {
  if (!reads.has(view))
    throw Error('Original recorded-cost requirements required');
  assertCostCoveragePathCurrent(view.original);
  assertFinancialCaseworkCurrent(view.detail);
}
export function inspectRecordedCostCategory(
  view: RecordedCostRequirementsRead,
  category: string,
) {
  assertRecordedCostRequirementsCurrent(view);
  const rows = view.categories.filter((row) => row.category === category);
  if (typeof category !== 'string' || rows.length !== 1)
    throw Error('Exact current canonical category required');
  return rows[0];
}
export function inspectRecordedCostRequirement(
  view: RecordedCostRequirementsRead,
  id: string,
) {
  assertRecordedCostRequirementsCurrent(view);
  const rows = view.requirements.filter((row) => row.id === id);
  if (typeof id !== 'string' || id.length > 200 || rows.length !== 1)
    throw Error('Exact original financial requirement required');
  return rows[0];
}
export function inspectRecordedCostSource(
  view: RecordedCostRequirementsRead,
  input: { kind: CostCoverageSource['kind']; id: string },
) {
  assertRecordedCostRequirementsCurrent(view);
  const p = prototypeFields(input, ['kind', 'id']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.id !== 'string' ||
    (p.kind !== 'time' &&
      p.kind !== 'material' &&
      p.kind !== 'material_review' &&
      p.kind !== 'invoice_requirement')
  )
    throw Error('Exact original source selector required');
  return inspectCostCoverageSource(view.original, { kind: p.kind, id: p.id });
}
export async function continueRecordedCostSource(
  view: RecordedCostRequirementsRead,
  ...args: Parameters<typeof continueCostCoverageSource> extends [
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) {
  try {
    assertRecordedCostRequirementsCurrent(view);
  } catch {
    return { status: 'UNKNOWN' as const, replay: 'FORBIDDEN' as const };
  }
  return continueCostCoverageSource(view.original, ...args);
}
