import {
  costCategories,
  type CostCategory,
} from '../../domain/jobs/financials';
import { detached } from '../../domain/jobs/margin-analysis';
import { documentHash } from '../../domain/release/preview';
import { prototypeFields, freezePrototype } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFinanceDesk,
  inspectFinanceDesk,
  type FinanceDeskReview,
} from './finance-desk';

export interface PortfolioFinanceInput {
  as_of: string;
  input_revision: number;
  excludes_unpaid_commitments: true;
  proposals: {
    job_id: string;
    remaining: Record<CostCategory, number>;
  }[];
}
const denied = () =>
  Error('Exact current confirmed portfolio finance sources required');
function own(value: unknown, keys: readonly string[]) {
  const p = prototypeFields(value, keys);
  if (Reflect.ownKeys(p).length !== keys.length) throw denied();
  return p;
}
function pin(value: PortfolioFinanceInput) {
  const p = own(value, [
    'as_of',
    'input_revision',
    'excludes_unpaid_commitments',
    'proposals',
  ]);
  if (
    typeof p.as_of !== 'string' ||
    !Number.isFinite(Date.parse(p.as_of)) ||
    new Date(p.as_of).toISOString() !== p.as_of ||
    !Number.isSafeInteger(p.input_revision) ||
    Number(p.input_revision) < 1 ||
    p.excludes_unpaid_commitments !== true ||
    !Array.isArray(p.proposals) ||
    p.proposals.length < 1 ||
    p.proposals.length > 20
  )
    throw denied();
  // detached rejects accessors, sparse arrays, symbols and executable nested values.
  const proposals = detached(p.proposals) as PortfolioFinanceInput['proposals'];
  const ids = new Set<string>();
  for (const proposal of proposals) {
    const row = own(proposal, ['job_id', 'remaining']);
    const remaining = own(row.remaining, costCategories);
    if (
      typeof row.job_id !== 'string' ||
      !row.job_id ||
      row.job_id.length > 200 ||
      ids.has(row.job_id) ||
      Object.values(remaining).some(
        (n) =>
          typeof n !== 'number' ||
          !Number.isSafeInteger(n) ||
          n < 0 ||
          n > 9_000_000_000_000,
      )
    )
      throw denied();
    ids.add(row.job_id);
  }
  return {
    as_of: p.as_of,
    input_revision: p.input_revision as number,
    excludes_unpaid_commitments: true as const,
    proposals,
  };
}
/** Add only already-canonical integer facts. No new estimate, margin ratio or cost engine. */
function sum(values: readonly number[]) {
  const result = values.reduce((s, n) => {
    if (!Number.isSafeInteger(n)) throw denied();
    return s + BigInt(n);
  }, 0n);
  if (
    result > BigInt(Number.MAX_SAFE_INTEGER) ||
    result < -BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw denied();
  return Number(result);
}
const records = new WeakMap<
  object,
  { check: () => void; children: FinanceDeskReview[] }
>();

/** Bounded selected-job staff roll-up over the existing canonical Finance Desk. */
export async function readPortfolioFinance(
  sources: OperatingSources,
  originalInput: PortfolioFinanceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  const captured = captureOperatingSources(sources, gate),
    selected = pin(originalInput),
    identity = JSON.stringify(selected);
  const check = () => {
    captured.check();
    if (JSON.stringify(pin(originalInput)) !== identity) throw denied();
  };
  const raw = captured.entries.map((entry) =>
    sources.estimates.readSyntheticPrototypeSources(entry.target),
  );
  const currency = raw[0].job!.baseline.currency;
  const expenseIds = new Set<string>(),
    eventIds = new Set<string>();
  if (
    selected.proposals.length !== captured.entries.length ||
    raw.some(
      (r) =>
        r.job!.baseline.currency !== currency ||
        r.bundle.version.calculation.currency !== currency,
    )
  )
    throw Error('Mixed currencies cannot be combined');
  for (const r of raw) {
    for (const expense of r.job!.expenses) {
      if (expense.job_id !== r.job!.id || expenseIds.has(expense.id))
        throw Error('Duplicate or foreign expense source');
      expenseIds.add(expense.id);
    }
    for (const event of r.job!.events) {
      if (eventIds.has(event.id)) throw Error('Duplicate cost-review source');
      eventIds.add(event.id);
    }
  }
  const children: FinanceDeskReview[] = [];
  for (let index = 0; index < captured.entries.length; index++) {
    const entry = captured.entries[index],
      original = raw[index];
    const proposal = selected.proposals.find(
      (p) => p.job_id === entry.target.job_id,
    );
    if (!proposal) throw denied();
    check();
    children.push(
      await readFinanceDesk(
        sources.estimates,
        entry.target,
        {
          job_review: {
            finance: {
              job_revision: original.job!.lock_revision,
              currency,
              release: {
                preview: entry.release,
                offer_id: entry.offer_id,
                decision_id: entry.receipt_id,
                contract_id: null,
                signature_id: null,
                invoice_id: null,
                as_of: selected.as_of,
              },
              accounting_aliases: null,
              procurement: null,
            },
            time: null,
            material: null,
            input_revision: selected.input_revision,
          },
          remaining: proposal.remaining,
          excludes_unpaid_commitments: true,
          input_revision: selected.input_revision,
        },
        gate,
      ),
    );
    check();
  }
  const jobs = children.map((review, index) => ({
    target: { ...captured.entries[index].target },
    name: raw[index].job!.name,
    customer_name: raw[index].bundle.version.customer_snapshot.display_name,
    property_label:
      raw[index].bundle.version.location_snapshot?.address_line1 ??
      'Property reference only',
    expense_ids: raw[index].job!.expenses.map((e) => e.id),
    review,
  }));
  const missing = jobs
    .filter(
      (j) =>
        !j.review.scenario.completion.totals ||
        !j.review.recorded.recorded.costReview.completion.totals,
    )
    .map((j) => j.target.job_id!);
  const totalFields = [
    'recordedMinor',
    'unpaidCommitmentMinor',
    'remainingForecastMinor',
    'costToCompleteMinor',
    'projectedMinor',
  ] as const;
  function totals(proposed: boolean) {
    if (missing.length) return null;
    return Object.fromEntries(
      totalFields.map((field) => [
        field,
        sum(
          jobs.map(
            (j) =>
              (proposed
                ? j.review.scenario.completion.totals
                : j.review.recorded.recorded.costReview.completion.totals)![
                field
              ],
          ),
        ),
      ]),
    ) as Record<(typeof totalFields)[number], number>;
  }
  const body = {
    mode: 'LOCAL_SYNTHETIC_PORTFOLIO_FINANCE' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    organization_id: captured.organization_id,
    actor_id: captured.actor_id,
    currency,
    as_of: selected.as_of,
    input_revision: selected.input_revision,
    coverage: {
      selected_jobs: jobs.length,
      covered_jobs: jobs.length - missing.length,
      missing_job_ids: missing,
      status: missing.length
        ? ('UNKNOWN' as const)
        : ('PARTIAL_NOT_FINAL' as const),
      meaning:
        'This bounded selected-job set is not complete company accounting, verified profit or settlement.',
    },
    totals: {
      recorded: totals(false),
      proposed: totals(true),
      issued_quoted_total_minor: sum(
        jobs.map((j) => j.review.invoice.scope.totals.total_minor),
      ),
      meaning:
        'Issued quoted customer totals are separate from earned revenue. Unknown costs are never zero or summed. Each cost row is added once; remaining proposals exclude unpaid commitments.',
    },
    jobs,
    compatibility: {
      invoice: 'NO_GO' as const,
      accounting: 'UNKNOWN_NO_EXACT_INVOICE' as const,
      quickbooks: 'UNVERIFIED' as const,
      procurement: 'UNKNOWN_NO_EXACT_REVIEW' as const,
      meaning:
        'Existing per-job issued scope and missing requirements remain available below. No account mapping, export rows, procurement order or invoice association is invented.',
    },
    authority: {
      save: false,
      invoice: false,
      ledger: false,
      payment: false,
      procurement: false,
      payroll: false,
      export: false,
      provider: false,
      send: false,
      hosted: false,
    },
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  for (const child of children) {
    if ((await inspectFinanceDesk(child)).status !== 'CURRENT_LOCAL_SOURCE')
      throw denied();
    check();
  }
  check(); // Terminal synchronous original-input/current-role/source fence after every await.
  const result = freezePrototype({ ...body, sha256 });
  records.set(result, { check, children });
  return result;
}
export type PortfolioFinanceReview = Awaited<
  ReturnType<typeof readPortfolioFinance>
>;

export async function inspectPortfolioFinance(review: PortfolioFinanceReview) {
  const record = records.get(review);
  if (!record)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.check();
    const { sha256, ...body } = review;
    if ((await documentHash(body)) !== sha256) throw denied();
    record.check();
    for (const child of record.children) {
      if ((await inspectFinanceDesk(child)).status !== 'CURRENT_LOCAL_SOURCE')
        throw denied();
      record.check();
    }
    return freezePrototype({
      status: 'CURRENT_LOCAL_SOURCE' as const,
      replacement: null,
    });
  } catch {
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
/** UI navigation only, with current full portfolio source checks before and after selection. */
export function openPortfolioFinanceJob(
  review: PortfolioFinanceReview,
  jobId: string,
) {
  const record = records.get(review);
  if (!record || typeof jobId !== 'string') throw denied();
  record.check();
  const matches = review.jobs.filter((j) => j.target.job_id === jobId);
  if (matches.length !== 1) throw denied();
  record.check();
  return freezePrototype({
    mode: 'NAVIGATION_ONLY' as const,
    target: { ...matches[0].target },
  });
}
