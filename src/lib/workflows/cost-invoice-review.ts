import { freezePrototype, prototypeFields } from '../program/prototype-source';
import {
  financeCaseDeskEnabled,
  readFinanceCaseDesk,
  openFinanceCaseDesk,
  assertFinanceCaseDeskReviewCurrent,
  assertFinanceCaseDeskCurrent,
  filterFinanceCaseDesk,
  inspectFinanceCaseDeskSource,
  returnFinanceCaseDesk,
  navigateFinanceCaseDesk,
  type FinanceCaseDeskSelection,
} from './finance-case-desk';
import type { DailyWorkbenchProps } from './daily-workbench-contract';

// Original C17 source reader, canonical calculations/verifier, terminal view and
// canonical-org/job navigation outcome metadata remain the sole authorities.
export const costInvoiceReviewEnabled = financeCaseDeskEnabled;
export const readCostInvoiceReview = readFinanceCaseDesk;
const selections = new WeakMap<
  object,
  {
    review: Parameters<typeof openFinanceCaseDesk>[0];
    steps: Set<'invoice' | 'customer'>;
  }
>();
export function openCostInvoiceReview(
  ...args: Parameters<typeof openFinanceCaseDesk>
) {
  const result = openFinanceCaseDesk(...args);
  selections.set(result, { review: args[0], steps: new Set() });
  return result;
}
export const assertCostInvoiceReviewCurrent = assertFinanceCaseDeskCurrent;
export const assertCostInvoiceSourcesCurrent =
  assertFinanceCaseDeskReviewCurrent;
export const filterCostInvoiceJobs = filterFinanceCaseDesk;
export const inspectCostInvoiceSource = inspectFinanceCaseDeskSource;
export const returnCostInvoiceReview = returnFinanceCaseDesk;
export type CostInvoiceSelection = FinanceCaseDeskSelection;
export interface CostInvoiceFocus {
  focus: 'review' | 'invoice';
  query: string;
  status: string;
}
const denied = () =>
  Error(
    'Exact current cost/invoice evidence and original filter required; no alternate source',
  );

/** Literal focus/filtering over original requirement and source rows only. No new
 * readiness score, balance, arithmetic, correction, invoice or accounting engine. */
export function focusCostInvoiceReview(
  selection: FinanceCaseDeskSelection,
  input: CostInvoiceFocus,
  selectedJobId?: string,
) {
  assertFinanceCaseDeskCurrent(selection, selectedJobId);
  const p = prototypeFields(input, ['focus', 'query', 'status']);
  if (
    Reflect.ownKeys(p).length !== 3 ||
    !['review', 'invoice'].includes(p.focus as string) ||
    typeof p.query !== 'string' ||
    p.query.length > 200 ||
    typeof p.status !== 'string'
  )
    throw denied();
  const rows =
    p.focus === 'invoice'
      ? selection.job.invoice.requirements.map((r) => ({
          id: r.id,
          title: r.id,
          status: r.status,
          observation: r.detail,
          suggested_review:
            'Review this exact original invoice prerequisite; no issue or send authority.',
          kind: 'invoice_requirement',
        }))
      : selection.job.requirements;
  const statuses = [...new Set(rows.map((r) => r.status))];
  if (p.status !== 'all' && !statuses.includes(p.status)) throw denied();
  const query = p.query.trim().toLowerCase();
  const requirements = rows.filter(
    (r) =>
      (p.status === 'all' || r.status === p.status) &&
      (!query ||
        [r.id, r.title, r.status, r.observation, r.suggested_review]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );
  const sourceRows = selection.sources.filter(
    (s) => p.focus === 'review' || s.kind !== 'expense',
  );
  const sources = sourceRows.filter(
    (s) =>
      (p.status === 'all' || s.status === p.status) &&
      (!query ||
        [s.id, s.kind, s.label, s.status, s.meaning, ...s.related_ids]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );
  const result = freezePrototype({
    focus: p.focus as 'review' | 'invoice',
    anchor: selection.anchor,
    customer_name: selection.job.customer_name,
    property_label: selection.job.property_label,
    job_name: selection.job.name,
    requirements,
    requirement_count: requirements.length,
    available_requirements: rows.length,
    statuses,
    sources,
    source_count: sources.length,
    available_sources: sourceRows.length,
    costs: selection.job.facts.costs,
    margin: selection.job.facts.margin,
    cost_coverage: selection.job.facts.cost_coverage,
    missing_evidence: selection.job.facts.missing_evidence,
    invoice: selection.job.invoice,
    accounting: selection.accounting,
    meaning:
      'Available recorded requirements only. A filter match or recorded local reference is not resolved work, complete costs, final profit, invoice authority or accounting acceptance.',
  });
  assertFinanceCaseDeskCurrent(selection, selectedJobId);
  return result;
}
export type CostInvoiceFocusReview = ReturnType<typeof focusCostInvoiceReview>;
export interface CostInvoiceContinuationLease {
  current: DailyWorkbenchProps['onContinue'];
  generation: number;
}
function callbackLease(value: CostInvoiceContinuationLease) {
  const p = prototypeFields(value, ['current', 'generation']);
  if (
    Reflect.ownKeys(p).length !== 2 ||
    !Number.isSafeInteger(p.generation) ||
    Number(p.generation) < 0 ||
    (p.current !== undefined && typeof p.current !== 'function')
  )
    throw denied();
  return p as unknown as CostInvoiceContinuationLease;
}
function matches(
  expected: CostInvoiceContinuationLease,
  current: CostInvoiceContinuationLease,
) {
  try {
    const a = callbackLease(expected),
      b = callbackLease(current);
    return (
      typeof a.current === 'function' &&
      a.current === b.current &&
      a.generation === b.generation
    );
  } catch {
    return false;
  }
}
const unknown = () =>
  freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
const noDispatch = (
  meaning = 'The current continuation callback was unavailable or changed before invocation. No host continuation was called.',
) =>
  freezePrototype({
    status: 'NO_DISPATCH' as const,
    replacement: null,
    meaning,
  });
/** Continue only through original C17 exact navigation. Known callback withdrawal
 * is detected before dispatch (and rechecked in its final callback), so it does
 * not fabricate an ambiguous invoked outcome. Once invoked, loss remains the
 * unchanged C17 canonical org/job UNKNOWN across wrappers and saved revisions. */
export function continueCostInvoiceReview(
  selection: FinanceCaseDeskSelection,
  step: 'invoice' | 'customer',
  expected: CostInvoiceContinuationLease,
  current: CostInvoiceContinuationLease,
  selectedJobId?: string,
) {
  try {
    assertFinanceCaseDeskCurrent(selection, selectedJobId);
    if (step !== 'invoice' && step !== 'customer')
      return noDispatch(
        'The requested local continuation step is invalid. No host continuation was called.',
      );
    if (returnFinanceCaseDesk(selection, selectedJobId).status === 'UNKNOWN')
      return unknown();
    if (!matches(expected, current)) return noDispatch();
    const pinned = callbackLease(expected);
    const retained = selections.get(selection);
    if (!retained) return unknown();
    if (retained.steps.has(step))
      return noDispatch(
        'This exact local review step was already continued. No duplicate host continuation was called.',
      );
    // Each separately confirmed UI step uses the SAME retained original review.
    // A new presentation reference is not a new source read or business record;
    // original C17 canonical UNKNOWN and all version/member fences still apply.
    const navigation = openFinanceCaseDesk(
      retained.review,
      selection.anchor.target.job_id!,
      selectedJobId,
    );
    retained.steps.add(step);
    let knownNoDispatch = false;
    const result = navigateFinanceCaseDesk(
      navigation,
      (job, section) => {
        assertFinanceCaseDeskCurrent(selection, selectedJobId);
        if (job !== selection.anchor.target.job_id || section !== 'finance')
          throw denied();
        if (!matches(pinned, current)) {
          knownNoDispatch = true;
          return;
        }
        const outcome: unknown = pinned.current!(job, step);
        // Legacy navigation is synchronous. An invoked async/thenable outcome
        // cannot be acknowledged here: consume rejection, then throw INSIDE the
        // original navigator so its canonical org/job UNKNOWN hold survives.
        if (outcome !== undefined) {
          void Promise.resolve(outcome).catch(() => undefined);
          throw Error('Invoked continuation did not acknowledge synchronously');
        }
        assertFinanceCaseDeskCurrent(selection, selectedJobId);
        if (!matches(pinned, current)) throw denied();
      },
      selectedJobId,
    );
    if (knownNoDispatch) {
      retained.steps.delete(step);
      return noDispatch();
    }
    if (result.status === 'UNKNOWN') return unknown();
    return freezePrototype({
      status: 'EXACT_DAILY_FINANCE_CONTINUATION_REQUESTED' as const,
      job_id: selection.anchor.target.job_id!,
      step,
      anchor: selection.anchor,
    });
  } catch {
    return unknown();
  }
}
