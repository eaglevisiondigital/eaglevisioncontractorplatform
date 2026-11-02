import {
  costCategories,
  type CostCategory,
} from '../../domain/jobs/financials';
import { detached } from '../../domain/jobs/margin-analysis';
import { documentHash } from '../../domain/release/preview';
import { completionReviewGuard } from '../job-cost-completion';
import { freezePrototype, prototypeFields } from '../program/prototype-source';
import type { JourneyAdmission } from './journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from './operating-center-runtime';
import {
  readFinancialExceptions,
  openFinancialException,
  inspectFinancialExceptions,
  type FinancialExceptionsReview,
} from './financial-exceptions';
import {
  readPortfolioFinance,
  openPortfolioFinanceJob,
  inspectPortfolioFinance,
  type PortfolioFinanceReview,
} from './portfolio-finance';

export interface FinancialCorrectionSourceInput {
  as_of: string;
  input_revision: number;
}
export interface FinancialCorrectionProposal {
  remaining: Record<CostCategory, number>;
  reason: string;
  confirmed: true;
  excludes_unpaid_commitments: true;
  source_sha256: string;
  input_revision: number;
}
const denied = () =>
  Error(
    'Exact inspected current financial exception and explicit correction proposal required',
  );
function own(value: unknown, keys: readonly string[]) {
  const p = prototypeFields(value, keys);
  if (Reflect.ownKeys(p).length !== keys.length) throw denied();
  return p;
}
function sourceInput(value: FinancialCorrectionSourceInput) {
  const p = own(value, ['as_of', 'input_revision']);
  if (
    typeof p.as_of !== 'string' ||
    !Number.isFinite(Date.parse(p.as_of)) ||
    new Date(p.as_of).toISOString() !== p.as_of ||
    !Number.isSafeInteger(p.input_revision) ||
    Number(p.input_revision) < 1
  )
    throw denied();
  return { as_of: p.as_of, input_revision: p.input_revision as number };
}
function proposalInput(value: FinancialCorrectionProposal) {
  const p = own(value, [
    'remaining',
    'reason',
    'confirmed',
    'excludes_unpaid_commitments',
    'source_sha256',
    'input_revision',
  ]);
  const remaining = own(p.remaining, costCategories);
  if (
    p.confirmed !== true ||
    p.excludes_unpaid_commitments !== true ||
    typeof p.reason !== 'string' ||
    !p.reason.trim() ||
    p.reason.length > 2000 ||
    typeof p.source_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(p.source_sha256) ||
    !Number.isSafeInteger(p.input_revision) ||
    Number(p.input_revision) < 1 ||
    Object.values(remaining).some(
      (n) =>
        typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > 9e12,
    )
  )
    throw denied();
  return {
    remaining: { ...remaining } as Record<CostCategory, number>,
    reason: p.reason.trim(),
    confirmed: true as const,
    excludes_unpaid_commitments: true as const,
    source_sha256: p.source_sha256,
    input_revision: p.input_revision as number,
  };
}
const sourceRecords = new WeakMap<
  object,
  {
    sources: OperatingSources;
    gate: JourneyAdmission;
    check: () => void;
    baseline: FinancialExceptionsReview;
  }
>();
const detailRecords = new WeakMap<
  object,
  {
    sources: OperatingSources;
    gate: JourneyAdmission;
    check: () => void;
    baseline: FinancialExceptionsReview;
    exception_id: string;
  }
>();
const attempts = new WeakMap<object, Set<string>>();
const packets = new WeakMap<
  object,
  { check: () => void; proposed: PortfolioFinanceReview; uncertain: boolean }
>();

/** Read the actual saved forecast only. No fabricated cost coverage or persisted correction. */
export async function readFinancialCorrectionSources(
  sources: OperatingSources,
  originalInput: FinancialCorrectionSourceInput,
  gate: JourneyAdmission = { enabled: false, confirmed: false },
) {
  completionReviewGuard(gate)();
  const capture = captureOperatingSources(sources, gate),
    selected = sourceInput(originalInput),
    identity = JSON.stringify(selected);
  let baseline: FinancialExceptionsReview | null = null;
  const check = () => {
    capture.check();
    if (JSON.stringify(sourceInput(originalInput)) !== identity) throw denied();
    if (baseline) openFinancialException(baseline, baseline.queue[0].id);
  };
  check();
  baseline = await readFinancialExceptions(
    sources,
    {
      basis: 'SAVED_FORECASTS',
      portfolio: {
        ...selected,
        excludes_unpaid_commitments: true,
        proposals: capture.entries.map((e) => ({
          job_id: e.target.job_id!,
          remaining: {
            ...sources.estimates.readSyntheticPrototypeSources(e.target).job!
              .projection.remaining,
          },
        })),
      },
    },
    gate,
  );
  check();
  const body = {
    mode: 'LOCAL_FINANCIAL_CORRECTION_SOURCES' as const,
    organization_id: capture.organization_id,
    actor_id: capture.actor_id,
    baseline,
    authority: 'STAFF_READ_ONLY_NO_CORRECTION_OR_FINANCIAL_EXECUTION' as const,
  };
  const sha256 = await documentHash(body);
  check();
  const result = freezePrototype({ ...body, sha256 });
  sourceRecords.set(result, { sources, gate, check, baseline });
  return result;
}
export type FinancialCorrectionSources = Awaited<
  ReturnType<typeof readFinancialCorrectionSources>
>;

/** An exact retained detail is required before the separate explicit proposal step. */
export function openFinancialCorrectionException(
  review: FinancialCorrectionSources,
  exceptionId: string,
) {
  const record = sourceRecords.get(review);
  if (!record) throw denied();
  record.check();
  const detail = openFinancialException(record.baseline, exceptionId);
  const result = freezePrototype({
    mode: 'INSPECTED_FINANCIAL_EXCEPTION' as const,
    source_sha256: review.sha256,
    exception: detail.exception,
    target: { ...detail.target },
    job_name: detail.job.name,
    customer_name: detail.job.customer_name,
    property_label: detail.job.property_label,
    currency: detail.job.review.recorded.recorded.currency,
    before: facts(detail.job.review),
    invoice: detail.job.review.invoice,
  });
  detailRecords.set(result, { ...record, exception_id: exceptionId });
  record.check();
  return result;
}
export type FinancialCorrectionDetail = ReturnType<
  typeof openFinancialCorrectionException
>;
type JobReview = PortfolioFinanceReview['jobs'][number]['review'];
function facts(review: JobReview) {
  return {
    remaining: { ...review.scenario.proposed_remaining },
    cost_coverage: review.scenario.completion.status,
    missing_evidence: [...review.scenario.completion.reasons],
    costs: review.scenario.completion.totals
      ? { ...review.scenario.completion.totals }
      : null,
    categories: review.scenario.completion.categories.map((c) => ({ ...c })),
    margin: review.scenario.margin.totals
      ? { ...review.scenario.margin.totals }
      : null,
    warnings: detached(review.scenario.margin.warningReview),
    provider_evidence: {
      ...review.scenario.completion.providerEvidence,
      eventIds: [],
    },
    invoice_status: review.invoice.overall,
  };
}
/** Only subtract already-canonical integer values for an explicit before/after difference. */
function difference(before: number | null, after: number | null) {
  if (before === null || after === null) return null;
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after))
    throw denied();
  const delta = BigInt(after) - BigInt(before);
  if (
    delta > BigInt(Number.MAX_SAFE_INTEGER) ||
    delta < -BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw denied();
  return Number(delta);
}

/** One immutable unsaved review, never a writer. A lost outcome permanently holds this exact exception. */
export async function prepareFinancialCorrection(
  detail: FinancialCorrectionDetail,
  originalInput: FinancialCorrectionProposal,
) {
  const record = detailRecords.get(detail);
  if (!record) throw denied();
  record.check();
  const selected = proposalInput(originalInput),
    identity = JSON.stringify(selected),
    originalRemaining = originalInput.remaining;
  if (selected.source_sha256 !== detail.source_sha256) throw denied();
  const check = () => {
    record.check();
    if (
      own(originalInput, [
        'remaining',
        'reason',
        'confirmed',
        'excludes_unpaid_commitments',
        'source_sha256',
        'input_revision',
      ]).remaining !== originalRemaining ||
      JSON.stringify(proposalInput(originalInput)) !== identity
    )
      throw denied();
    const current = openFinancialException(
      record.baseline,
      record.exception_id,
    );
    if (
      JSON.stringify(current.target) !== JSON.stringify(detail.target) ||
      JSON.stringify(current.exception) !== JSON.stringify(detail.exception)
    )
      throw denied();
  };
  check();
  const key = `${detail.target.organization_id}:${detail.target.job_id}:${record.exception_id}`;
  const held = attempts.get(record.sources.estimates) ?? new Set<string>();
  if (held.has(key))
    throw Error(
      'Correction attempt already held; exact read-only reconciliation only. No replay.',
    );
  held.add(key);
  attempts.set(record.sources.estimates, held); // Held before the first await, independent of note or container.
  const portfolio = await readPortfolioFinance(
    record.sources,
    {
      as_of: record.baseline.as_of,
      input_revision: selected.input_revision,
      excludes_unpaid_commitments: true,
      proposals: record.baseline.portfolio.jobs.map((job) => ({
        job_id: job.target.job_id!,
        remaining:
          job.target.job_id === detail.target.job_id
            ? { ...selected.remaining }
            : { ...job.review.scenario.original_remaining },
      })),
    },
    record.gate,
  );
  check();
  openPortfolioFinanceJob(portfolio, detail.target.job_id!);
  const job = portfolio.jobs.find(
    (j) => j.target.job_id === detail.target.job_id,
  )!;
  const before = detail.before,
    after = facts(job.review);
  const body = {
    mode: 'LOCAL_FINANCIAL_CORRECTION_PROPOSAL' as const,
    audience: 'CURRENT_SYNTHETIC_OWNER_ADMIN_ONLY' as const,
    target: { ...detail.target },
    source_sha256: detail.source_sha256,
    exception: { ...detail.exception },
    reviewer_id: record.baseline.actor_id,
    source_job_revision: job.review.scenario.source_job_revision,
    original_offer_id: job.review.invoice.reference.offer_id,
    original_receipt_id: job.review.invoice.reference.decision_id,
    as_of: record.baseline.as_of,
    input_revision: selected.input_revision,
    reason: selected.reason,
    currency: detail.currency,
    before,
    after,
    comparison: {
      categories: costCategories.map((category) => ({
        category,
        before_minor: before.remaining[category],
        proposed_minor: after.remaining[category],
        delta_minor: difference(
          before.remaining[category],
          after.remaining[category],
        ),
        changed: before.remaining[category] !== after.remaining[category],
      })),
      cost_to_complete_delta_minor: difference(
        before.costs?.costToCompleteMinor ?? null,
        after.costs?.costToCompleteMinor ?? null,
      ),
      projected_contribution_delta_minor: difference(
        before.margin?.projectedContributionMinor ?? null,
        after.margin?.projectedContributionMinor ?? null,
      ),
      meaning:
        'Differences in a detached unsaved forecast scenario. Missing evidence remains UNKNOWN; no exception is resolved or financial state corrected.',
    },
    unchanged: {
      recorded_costs: true,
      net_unpaid_commitments: true,
      issued_estimate: true,
      invoice_readiness: true,
      ledger: true,
      source_job_revision: true,
      cost_coverage_not_fabricated: true,
    },
    authority: {
      save_forecast: false,
      resolve_exception: false,
      capture: false,
      refund: false,
      settlement: false,
      invoice: false,
      ledger: false,
      payroll: false,
      provider: false,
      send: false,
      hosted: false,
    },
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const sha256 = await documentHash(body);
  check();
  if (
    (await inspectPortfolioFinance(portfolio)).status !==
      'CURRENT_LOCAL_SOURCE' ||
    (await inspectFinancialExceptions(record.baseline)).status !==
      'CURRENT_LOCAL_SOURCE'
  )
    throw denied();
  check(); // Current source, role, gate and original live proposal after every await.
  const result = freezePrototype({
    id: `financial-correction:${sha256}`,
    ...body,
    sha256,
  });
  packets.set(result, { check, proposed: portfolio, uncertain: false });
  return result;
}
export type FinancialCorrectionPacket = Awaited<
  ReturnType<typeof prepareFinancialCorrection>
>;
/** Exact retained packet only; copied or ambiguous evidence never creates a replacement. */
export async function reconcileFinancialCorrection(
  packet: FinancialCorrectionPacket,
) {
  const record = packets.get(packet);
  if (!record || record.uncertain)
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  try {
    record.check();
    const { id, sha256, ...body } = packet;
    if (
      id !== `financial-correction:${sha256}` ||
      (await documentHash(body)) !== sha256
    )
      throw denied();
    record.check();
    if (
      (await inspectPortfolioFinance(record.proposed)).status !==
      'CURRENT_LOCAL_SOURCE'
    )
      throw denied();
    record.check();
    return freezePrototype({
      status: 'CURRENT_UNSAVED_REVIEW_ONLY' as const,
      replacement: null,
    });
  } catch {
    record.uncertain = true;
    return freezePrototype({ status: 'UNKNOWN' as const, replacement: null });
  }
}
