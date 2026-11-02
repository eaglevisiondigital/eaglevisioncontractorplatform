import { sampleCompanies } from '../domain/platform';
import { jobFinancials, type CostCategory } from '../domain/jobs/financials';
import type { MarginScope } from '../domain/jobs/margin-analysis';
import { documentHash } from '../domain/release/preview';
import { validateTime, type TimeEntry } from '../domain/workforce/payroll';
import type { WorkforceData } from './phase3';
import { LocalJobMarginReader } from './job-margin-analysis';
import {
  completionReviewGuard,
  type CompletionReviewAdmission,
} from './job-cost-completion';

type Immutable<T> = T extends object
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T;
const deny = () => new Error('Exact local Profit Guard review unavailable');
const freeze = <T>(value: T): Immutable<T> => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as Immutable<T>;
};
function fields(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw deny();
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw deny();
  const descriptors = Object.getOwnPropertyDescriptors(value),
    result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) throw deny();
    result[key] = descriptor.value;
  }
  return result;
}
function text(value: unknown, max = 250): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw deny();
  return value;
}
const scopeKeys = [
  'organizationId',
  'jobId',
  'jobRevision',
  'estimateId',
  'issuedVersionId',
  'customerId',
  'propertyId',
  'currency',
] as const;
function scopeInput(input: MarginScope): MarginScope {
  const source = fields(input, scopeKeys);
  for (const key of scopeKeys.filter(
    (key) => !['jobRevision', 'propertyId'].includes(key),
  ))
    text(source[key]);
  if (
    !Number.isSafeInteger(source.jobRevision) ||
    (source.jobRevision as number) < 1 ||
    (source.propertyId !== null && typeof source.propertyId !== 'string')
  )
    throw deny();
  return source as unknown as MarginScope;
}
export interface ProfitGuardTimeProposalInput {
  workerId: string;
  startedAt: string;
  endedAt: string;
  task: string;
  allocation: 'job' | 'overhead';
  overheadCenter: string | null;
}
const timeKeys = [
  'workerId',
  'startedAt',
  'endedAt',
  'task',
  'allocation',
  'overheadCenter',
] as const;
function timeInput(input: ProfitGuardTimeProposalInput | null) {
  if (input === null) return null;
  const value = fields(input, timeKeys);
  for (const key of ['workerId', 'startedAt', 'endedAt', 'task'])
    text(value[key]);
  if (
    !['job', 'overhead'].includes(value.allocation as string) ||
    (value.allocation === 'job'
      ? value.overheadCenter !== null
      : typeof value.overheadCenter !== 'string' ||
        !value.overheadCenter.trim() ||
        value.overheadCenter.length > 80)
  )
    throw deny();
  return value as unknown as ProfitGuardTimeProposalInput;
}
function access(
  reader: LocalJobMarginReader,
  scope: MarginScope,
  actor: string,
  admission: CompletionReviewAdmission,
) {
  completionReviewGuard(admission)();
  if (
    reader.enabled !== true ||
    !reader.repo.sample ||
    !sampleCompanies.some((company) => company.id === scope.organizationId)
  )
    throw deny();
  const members = reader.repo.operations
    .syntheticMemberships(scope.organizationId)
    .filter((member) => member.user_id === actor);
  if (
    members.length !== 1 ||
    !members[0].active ||
    !['owner', 'admin'].includes(members[0].role)
  )
    throw deny();
  return members[0].role;
}
function currentJob(reader: LocalJobMarginReader, scope: MarginScope) {
  const job = reader.repo.syntheticJob(scope.organizationId, scope.jobId);
  if (
    job &&
    (job.organization_id !== scope.organizationId ||
      job.id !== scope.jobId ||
      job.lock_revision !== scope.jobRevision ||
      job.baseline.issued_version_id !== scope.issuedVersionId ||
      job.baseline.currency !== scope.currency)
  )
    throw deny();
  return job;
}
function workforceFootprint(workforce: WorkforceData, scope: MarginScope) {
  if (
    new Set(workforce.workers.map((worker) => worker.id)).size !==
      workforce.workers.length ||
    workforce.workers.some(
      (worker) => worker.organization_id !== scope.organizationId,
    ) ||
    new Set(workforce.entries.map((entry) => entry.id)).size !==
      workforce.entries.length
  )
    throw deny();
  // Internal ephemeral equality evidence only. No rate, deduction, payroll snapshot or name.
  return JSON.stringify({
    workers: workforce.workers.map(
      ({ id, organization_id, user_id, active }) => ({
        id,
        organization_id,
        user_id,
        active,
      }),
    ),
    entries: workforce.entries,
    reviews: workforce.reviews,
    periods: workforce.periods.map(({ id, starts_at, ends_at, status }) => ({
      id,
      starts_at,
      ends_at,
      status,
    })),
  });
}
function planTime(
  input: ProfitGuardTimeProposalInput,
  workforce: WorkforceData,
  reader: LocalJobMarginReader,
  scope: MarginScope,
) {
  const workers = workforce.workers.filter(
      (worker) => worker.id === input.workerId,
    ),
    worker = workers[0];
  const members = reader.repo.operations
    .syntheticMemberships(scope.organizationId)
    .filter((member) => member.user_id === worker?.user_id);
  if (
    workers.length !== 1 ||
    !worker.active ||
    worker.organization_id !== scope.organizationId ||
    members.length !== 1 ||
    !members[0].active
  )
    throw deny();
  const proposal: TimeEntry = {
    id: 'profit-guard-unposted-proposal',
    worker_id: worker.id,
    job_id: input.allocation === 'job' ? scope.jobId : null,
    overhead_center: input.overheadCenter,
    task: input.task,
    kind: 'work',
    started_at: input.startedAt,
    ended_at: input.endedAt,
    submitted: false,
    billable: false,
    corrects_id: null,
  };
  // Existing canonical time validation; no duration, wage, burden or allocation calculator.
  validateTime([...workforce.entries, proposal]);
  const lockedRange = workforce.periods.some(
    (period) =>
      period.status === 'locked' &&
      Date.parse(period.starts_at) < Date.parse(input.endedAt) &&
      Date.parse(period.ends_at) > Date.parse(input.startedAt),
  );
  return {
    status: 'BLOCKED_DRAFT_ONLY' as const,
    workerId: worker.id,
    jobId: proposal.job_id,
    allocation: input.allocation,
    overheadCenter: input.overheadCenter,
    task: input.task,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    evidence: 'CAPTURED_NOT_ATOMIC' as const,
    timeValidation: 'VALID_AGAINST_CAPTURED_ENTRIES' as const,
    currentWorkerAndTimeCoverage: 'UNKNOWN' as const,
    approvedOverheadCenter:
      input.allocation === 'overhead' ? ('UNVERIFIED' as const) : null,
    lockedRange,
    monetaryAllocation: null,
    reason:
      'Human proposal only. Async workforce capture does not prove current time/worker coverage. No posting, wage calculation, approved overhead policy or cost allocation is authorized.',
  };
}
interface RiskCard {
  code: string;
  level: 'REVIEW' | 'ATTENTION' | 'UNKNOWN';
  label: string;
  category: CostCategory | null;
  expenseIds: string[];
}
function cards(
  completion: Awaited<ReturnType<LocalJobMarginReader['readCompletion']>>,
  canonical: ReturnType<typeof jobFinancials> | null,
  marginBasisAvailable: boolean,
) {
  const result: RiskCard[] = [];
  const add = (
    code: string,
    level: RiskCard['level'],
    label: string,
    category: CostCategory | null = null,
    expenseIds: string[] = [],
  ) => result.push({ code, level, label, category, expenseIds });
  if (completion.status === 'UNKNOWN' || !canonical)
    add(
      'SOURCE_COVERAGE',
      'UNKNOWN',
      'Exact job, issued estimate or locked labor evidence is unavailable. No profitability amounts can be shown.',
    );
  else {
    if (completion.status !== 'DECLARED_COSTS_COMPLETE')
      add(
        'COST_COVERAGE',
        'REVIEW',
        'Recorded coverage is partial. Review remaining forecast and cost submissions; this is not final profit.',
      );
    for (const row of canonical.categories) {
      const ids = completion.expenses
        .filter(
          (expense) =>
            expense.category === row.category &&
            expense.inclusion === 'CANONICAL_SOURCE',
        )
        .map((expense) => expense.id);
      if (row.committed_remaining_minor > 0)
        add(
          'UNPAID_COMMITMENT',
          'REVIEW',
          'Review the canonical unpaid purchase commitment; no bank payment or settlement is established.',
          row.category,
          ids,
        );
      if (row.committed_remaining_minor > 0 && row.remaining_minor > 0)
        add(
          'FORECAST_OVERLAP_REVIEW',
          'REVIEW',
          'Forecast and unpaid commitment are additive. Review possible overlap manually; no automatic netting.',
          row.category,
          ids,
        );
      if (row.overrun)
        add(
          'CATEGORY_OVERRUN',
          'ATTENTION',
          'The existing canonical category-overrun threshold is exceeded.',
          row.category,
          ids,
        );
    }
    if (canonical.projected_profit_minor < 0)
      add(
        'NEGATIVE_CONTRIBUTION',
        'ATTENTION',
        'Canonical projected contribution is negative, before unallocated overhead and taxes.',
      );
    if (marginBasisAvailable && canonical.profit_erosion)
      add(
        'MARGIN_EROSION',
        'ATTENTION',
        'The existing canonical margin-erosion threshold is exceeded.',
      );
  }
  add(
    'WORKFORCE_CURRENTNESS',
    'UNKNOWN',
    'Current unposted time and worker coverage cannot be proven atomically by the existing async workforce reader.',
  );
  add(
    'UNALLOCATED_OVERHEAD',
    'UNKNOWN',
    'No approved overhead allocation source is present. Contribution is not net business profit.',
  );
  add(
    'PROVIDER_EVIDENCE',
    'UNKNOWN',
    'Payment, refund, void and settlement remain UNKNOWN without exact provider/job linkage.',
  );
  return result;
}
const records = new WeakMap<
  object,
  {
    reader: LocalJobMarginReader;
    scope: MarginScope;
    actor: string;
    admission: CompletionReviewAdmission;
    role: string;
    fingerprint: string;
    workforceFingerprint: string | null;
  }
>();

/** Unwired source-bound review composition. Never writes or creates financial truth. */
export async function readProfitGuardReview(
  reader: LocalJobMarginReader,
  input: MarginScope,
  actor: string,
  admission: CompletionReviewAdmission = { enabled: false, confirmed: false },
  proposalInput: ProfitGuardTimeProposalInput | null = null,
) {
  completionReviewGuard(admission)();
  const scope = scopeInput(input),
    proposal = timeInput(proposalInput);
  text(actor);
  const role = access(reader, scope, actor, admission),
    before = currentJob(reader, scope),
    fingerprint = JSON.stringify(before);
  const completion = await reader.readCompletion(scope, actor, admission);
  access(reader, scope, actor, admission);
  let workforceFingerprint: string | null = null;
  let timeProposal: ReturnType<typeof planTime> | null = null;
  if (proposal && completion.status !== 'UNKNOWN') {
    const first = await reader.repo.workforce(scope.organizationId);
    access(reader, scope, actor, admission);
    workforceFingerprint = workforceFootprint(first, scope);
    const second = await reader.repo.workforce(scope.organizationId);
    access(reader, scope, actor, admission);
    if (workforceFootprint(second, scope) !== workforceFingerprint)
      throw deny();
    timeProposal = planTime(proposal, second, reader, scope);
  }
  const canonical =
    completion.status === 'UNKNOWN' || !before ? null : jobFinancials(before);
  if (
    completion.totals &&
    canonical &&
    completion.totals.projectedMinor !== canonical.projected_cost_minor
  )
    throw deny();
  const marginBasisAvailable = Boolean(
    canonical &&
    before &&
    before.baseline.revenue_minor > 0 &&
    canonical.revised_revenue_minor > 0 &&
    Number.isSafeInteger(canonical.projected_margin_bps),
  );
  const body = {
    mode: 'local-synthetic-staff-review-only' as const,
    audience: 'current-synthetic-owner-admin' as const,
    scope,
    status: completion.status,
    completion,
    profitability: canonical
      ? {
          revenueMinor: canonical.revised_revenue_minor,
          projectedCostMinor: canonical.projected_cost_minor,
          projectedContributionMinor: canonical.projected_profit_minor,
          projectedMarginBps:
            canonical.revised_revenue_minor > 0 &&
            Number.isSafeInteger(canonical.projected_margin_bps)
              ? canonical.projected_margin_bps
              : null,
          marginErosion: marginBasisAvailable ? canonical.profit_erosion : null,
        }
      : null,
    cards: cards(completion, canonical, marginBasisAvailable),
    timeProposal,
    authority: {
      postTime: false,
      postExpense: false,
      allocateOverhead: false,
      payroll: false,
      dispatch: false,
      approve: false,
      financialExecution: false,
      communicate: false,
      hosted: false,
    },
    genuineAuthentication: 'UNVERIFIED' as const,
    workforceCurrentness: 'UNKNOWN' as const,
    custody: 'SESSION_ONLY_NO_REFRESH_OR_CRASH_DURABILITY' as const,
  };
  const reviewHash = await documentHash(body);
  // All awaits end before the exact synchronous job and current membership checkpoint.
  if (
    JSON.stringify(timeInput(proposalInput)) !== JSON.stringify(proposal) ||
    JSON.stringify(currentJob(reader, scope)) !== fingerprint ||
    access(reader, scope, actor, admission) !== role
  )
    throw deny();
  const result = freeze({ ...body, reviewHash });
  records.set(result, {
    reader,
    scope: structuredClone(scope),
    actor,
    admission,
    role,
    fingerprint,
    workforceFingerprint,
  });
  return result;
}
export type ProfitGuardReview = Awaited<
  ReturnType<typeof readProfitGuardReview>
>;

/** Exact read-only reconciliation only. No replacement IDs, replay, store or writer. */
export async function verifyProfitGuardReview(review: ProfitGuardReview) {
  const record = records.get(review);
  if (!record || review.status === 'UNKNOWN')
    return freeze({
      status: 'UNKNOWN' as const,
      replacement: null,
      workforce: 'UNKNOWN' as const,
    });
  const { reader, scope, actor, admission, fingerprint, role } = record;
  try {
    if (access(reader, scope, actor, admission) !== role) throw deny();
    const currentCompletion = await reader.readCompletion(
      scope,
      actor,
      admission,
    );
    if (currentCompletion.status === 'UNKNOWN') throw deny();
    if (record.workforceFingerprint !== null) {
      const workforce = await reader.repo.workforce(scope.organizationId);
      if (workforceFootprint(workforce, scope) !== record.workforceFingerprint)
        return freeze({
          status: 'STALE' as const,
          replacement: null,
          workforce: 'UNKNOWN' as const,
        });
    }
    if (JSON.stringify(currentJob(reader, scope)) !== fingerprint)
      return freeze({
        status: 'STALE' as const,
        replacement: null,
        workforce: 'UNKNOWN' as const,
      });
    if (access(reader, scope, actor, admission) !== role) throw deny();
    return freeze({
      status: 'CURRENT_JOB_SOURCE' as const,
      replacement: null,
      workforce: 'UNKNOWN' as const,
    });
  } catch {
    return freeze({
      status: 'UNKNOWN' as const,
      replacement: null,
      workforce: 'UNKNOWN' as const,
    });
  }
}
