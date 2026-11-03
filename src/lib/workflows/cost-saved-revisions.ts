import { freezePrototype, prototypeFields } from '../program/prototype-source';
import { completionReviewGuard } from '../job-cost-completion';
import type { JourneyAdmission, LocalJourney } from './journey-runtime';
import type { OperatingSources } from './operating-center-runtime';
import {
  financialCaseworkEnabled,
  readFinancialCasework,
  openFinancialCaseworkJob,
  compareFinancialCaseworkReview,
  type FinancialCaseworkReview,
  type FinancialCaseworkDetail,
} from './financial-casework';
import {
  readSavedRevision,
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  compareSavedRevisions,
  adoptSavedRevision,
  type SavedRevisionSnapshot,
  type SavedRevisionSelection,
} from './saved-revision-runtime';

export const costSavedRevisionsEnabled = financialCaseworkEnabled;
// Exact source handles and read/comparison provenance only, never business state.
const subsets = new WeakMap<
  OperatingSources,
  WeakMap<LocalJourney, OperatingSources>
>();
function subset(sources: OperatingSources, entry: LocalJourney) {
  let entries = subsets.get(sources);
  if (!entries) subsets.set(sources, (entries = new WeakMap()));
  let value = entries.get(entry);
  if (!value) {
    value = { ...sources, entries: [entry] };
    entries.set(entry, value);
  }
  return value;
}
function project(detail: FinancialCaseworkDetail, entry: LocalJourney) {
  const job = detail.job,
    raw = entry.estimates.readSyntheticPrototypeSources(entry.target);
  if (!raw.job || raw.job.lock_revision !== job.source.job_revision)
    throw Error('Exact current saved job cost revision required');
  return {
    job_name: job.name,
    customer_name: job.customer_name,
    property_label: job.property_label,
    currency: job.currency,
    job_revision: job.source.job_revision,
    issued: {
      version_id: job.source.issued_version_id,
      version_number: job.source.issued_version_number,
      scope_sha256: job.source.scope_sha256,
    },
    facts: {
      remaining: job.facts.remaining,
      costs: job.facts.costs,
      margin: job.facts.margin,
      cost_coverage: job.facts.cost_coverage,
      missing_evidence: job.facts.missing_evidence,
    },
    expenses: raw.job.expenses.map((e) => ({
      id: e.id,
      category: e.category,
      kind: e.kind,
      amount_minor: e.amount_minor,
      estimate_line_id: e.estimate_line_id,
      quantity_milli: e.quantity_milli,
      unit: e.unit,
      adjusts_expense_id: e.adjusts_expense_id ?? null,
    })),
    reviews: raw.job.events.map((e) => ({
      id: e.id,
      submission_id: e.submission_id,
      decision: e.decision,
      created_at: e.created_at,
    })),
    time: raw.workforce.entries.map((e) => ({
      id: e.id,
      submitted: e.submitted,
      kind: e.kind,
      started_at: e.started_at,
      ended_at: e.ended_at,
      corrects_id: e.corrects_id,
      review:
        raw.workforce.reviews.find((r) => r.entry_id === e.id)?.decision ??
        null,
    })),
    locked_periods: job.source.locked_period_ids.map((id) => ({ id })),
    labor_entry_ids: [...job.source.labor_entry_ids],
    invoice: {
      overall: job.invoice.overall,
      requirements: job.invoice.requirements.map((r) => ({
        id: r.id,
        status: r.status,
        detail: r.detail,
      })),
    },
    accounting: {
      coverage: job.financial.coverage,
      invoice_ids: job.financial.invoices.map((i) => i.invoice_id),
      missing_evidence: [...job.financial.missing_evidence],
    },
    authority: 'READ_ONLY_NO_POSTING_ISSUANCE_OR_ACTION_RENEWAL' as const,
  };
}
export type CostSavedEvidence = ReturnType<typeof project>;
export type CostSavedRevision = SavedRevisionSnapshot<CostSavedEvidence>;
const originals = new WeakMap<
  object,
  { review: FinancialCaseworkReview; detail: FinancialCaseworkDetail }
>();
export async function readCostSavedRevision(
  sources: OperatingSources,
  jobId: string,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
): Promise<CostSavedRevision> {
  completionReviewGuard(gate)();
  if (!costSavedRevisionsEnabled(true)) throw Error('Saved cost review is OFF');
  let original:
    | { review: FinancialCaseworkReview; detail: FinancialCaseworkDetail }
    | undefined;
  const snapshot = await readSavedRevision(
    sources,
    jobId,
    'finance',
    gate,
    async (entry) => {
      const review = await readFinancialCasework(
          subset(sources, entry),
          { as_of: new Date().toISOString(), input_revision: 1 },
          gate,
        ),
        detail = openFinancialCaseworkJob(review, jobId);
      original = { review, detail };
      return project(detail, entry);
    },
  );
  if (!original) throw Error('Original canonical financial read required');
  originals.set(snapshot, original);
  return snapshot;
}
export type CostChangeStatus =
  'ADDED' | 'CHANGED' | 'UNCHANGED' | 'NOT_PRESENT_IN_CURRENT_READ';
export interface CostRevisionRow {
  kind: string;
  id: string;
  status: CostChangeStatus;
  before: unknown;
  current: unknown;
}
function rows(
  before: CostSavedRevision['evidence'],
  current: CostSavedRevision['evidence'],
) {
  const result: CostRevisionRow[] = [];
  const add = (kind: string, id: string, a: unknown, b: unknown) =>
    result.push({
      kind,
      id,
      status:
        a === undefined
          ? 'ADDED'
          : b === undefined
            ? 'NOT_PRESENT_IN_CURRENT_READ'
            : JSON.stringify(a) === JSON.stringify(b)
              ? 'UNCHANGED'
              : 'CHANGED',
      before: a ?? null,
      current: b ?? null,
    });
  for (const field of ['facts', 'issued', 'invoice', 'accounting'] as const)
    add('canonical', field, before[field], current[field]);
  for (const field of [
    'expenses',
    'reviews',
    'time',
    'locked_periods',
  ] as const) {
    const a = new Map(before[field].map((r) => [r.id, r])),
      b = new Map(current[field].map((r) => [r.id, r]));
    if (a.size !== before[field].length || b.size !== current[field].length)
      throw Error('Duplicate saved source identity');
    for (const id of new Set([...a.keys(), ...b.keys()]))
      add(field, id, a.get(id), b.get(id));
  }
  return result;
}
export function compareCostSavedRevisions(
  before: CostSavedRevision,
  current: CostSavedRevision,
) {
  const a = originals.get(before),
    b = originals.get(current);
  if (!a || !b) throw Error('Original cost snapshots required');
  const comparison = compareSavedRevisions(before, current),
    canonical = compareFinancialCaseworkReview(a.detail, b.review),
    result = freezePrototype({
      comparison,
      canonical,
      rows: rows(before.evidence, current.evidence),
      meaning:
        'Observed saved source differences only; absent is not paid, completed or resolved.',
    });
  comparisons.set(result, comparison);
  return result;
}
export type CostSavedComparison = ReturnType<typeof compareCostSavedRevisions>;
const comparisons = new WeakMap<
  object,
  ReturnType<typeof compareSavedRevisions<CostSavedEvidence>>
>();
export function filterCostSavedRevisions(
  value: CostSavedComparison,
  input: { query: string; changed_only: boolean },
) {
  if (!comparisons.has(value)) throw Error('Original cost comparison required');
  assertSavedRevisionAccess(value.comparison.before);
  assertSavedRevisionCurrent(value.comparison.current);
  const p = prototypeFields(input, ['query', 'changed_only']);
  if (
    Object.keys(p).length !== 2 ||
    typeof p.query !== 'string' ||
    p.query.length > 200 ||
    typeof p.changed_only !== 'boolean'
  )
    throw Error('Exact literal saved-cost filters required');
  const query = p.query.toLowerCase().trim();
  const matches = value.rows.filter(
    (r) =>
      (!p.changed_only || r.status !== 'UNCHANGED') &&
      (!query ||
        [
          r.kind,
          r.id,
          r.status,
          JSON.stringify(r.before),
          JSON.stringify(r.current),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );
  return freezePrototype({
    rows: matches,
    matching: matches.length,
    available: value.rows.length,
  });
}
export function adoptCostSavedRevision(
  selection: SavedRevisionSelection<CostSavedEvidence>,
  value: CostSavedComparison,
  generation: number,
  confirmed: boolean,
) {
  const comparison = comparisons.get(value);
  if (!comparison) throw Error('Original inspected cost comparison required');
  return adoptSavedRevision(selection, comparison, generation, confirmed);
}
