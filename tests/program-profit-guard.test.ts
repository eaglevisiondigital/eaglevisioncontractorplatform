import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials, type Expense } from '../src/domain/jobs/financials';
import type { MarginScope } from '../src/domain/jobs/margin-analysis';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { LocalJobMarginReader } from '../src/lib/job-margin-analysis';
import {
  readProfitGuardReview,
  verifyProfitGuardReview,
  type ProfitGuardTimeProposalInput,
} from '../src/lib/profit-guard';
import { documentHash } from '../src/domain/release/preview';

afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id;
  const operations = new Operations(true),
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  const job = (await repo.jobs(org))[0],
    estimate = (await repo.list(org))[0];
  const issued = (await repo.history(org, estimate.id)).find(
    (version) => version.id === job.baseline.issued_version_id,
  )!;
  const scope: MarginScope = {
    organizationId: org,
    jobId: job.id,
    jobRevision: job.lock_revision,
    estimateId: estimate.id,
    issuedVersionId: issued.id,
    customerId: issued.payload.customer_id,
    propertyId: issued.payload.location_id,
    currency: job.baseline.currency,
  };
  const reader = new LocalJobMarginReader(repo, true),
    admission = { enabled: true, confirmed: true },
    actor = `${org}-owner`;
  const workforce = await repo.workforce(org);
  const proposal: ProfitGuardTimeProposalInput = {
    workerId: workforce.workers[1].id,
    startedAt: '2099-06-01T08:00:00-05:00',
    endedAt: '2099-06-01T09:00:00-05:00',
    task: 'Review maintenance scope',
    allocation: 'job',
    overheadCenter: null,
  };
  async function append(
    kind: Expense['kind'],
    amount: number,
    adjusts: string | null = null,
  ) {
    const id = await repo.submitExpense(org, job.id, {
      kind,
      category: 'materials',
      amount_minor: amount,
      supplier: 'PRIVATE SUPPLIER',
      purchase_key: 'profit-guard-source-purchase',
      reference: crypto.randomUUID(),
      description: 'PRIVATE EXPENSE DESCRIPTION',
      estimate_line_id: job.baseline.lines[0].id,
      quantity_milli: null,
      unit: null,
      unit_cost_minor: null,
      document_ids: [],
      material_approval_id: null,
      adjusts_expense_id: adjusts,
    });
    await repo.reviewExpense(
      org,
      job.id,
      id,
      'approved',
      'PRIVATE REVIEW REASON',
    );
    scope.jobRevision = repo.syntheticJob(org, job.id)!.lock_revision;
    return id;
  }
  return {
    company,
    org,
    operations,
    repo,
    job,
    scope,
    reader,
    admission,
    actor,
    proposal,
    append,
    read: (time: ProfitGuardTimeProposalInput | null = null) =>
      readProfitGuardReview(reader, scope, actor, admission, time),
  };
}

describe('source-bound default-off Profit Guard', () => {
  it.each([0, 1, 2])(
    'composes canonical actual source amounts and manual cards for company %i without side effects',
    async (index) => {
      const f = await fixture(index),
        before = structuredClone(await f.repo.jobs(f.org));
      const workforce = structuredClone(await f.repo.workforce(f.org)),
        history = structuredClone(
          await f.repo.history(f.org, f.scope.estimateId),
        );
      const writes = [
        vi.spyOn(f.repo, 'recordTime'),
        vi.spyOn(f.repo, 'projection'),
        vi.spyOn(f.repo, 'submitExpense'),
        vi.spyOn(f.repo, 'reviewExpense'),
        vi.spyOn(f.repo, 'approveJob'),
        vi.spyOn(f.repo, 'issue'),
      ];
      const result = await f.read(),
        canonical = jobFinancials(before[0]);
      expect(result.profitability).toMatchObject({
        projectedCostMinor: canonical.projected_cost_minor,
        projectedContributionMinor: canonical.projected_profit_minor,
        projectedMarginBps: canonical.projected_margin_bps,
      });
      expect(result.completion.totals?.projectedMinor).toBe(
        canonical.projected_cost_minor,
      );
      expect(result.cards.map((card) => card.code)).toContain(
        'UNALLOCATED_OVERHEAD',
      );
      expect(
        Object.values(result.authority).every((allowed) => allowed === false),
      ).toBe(true);
      expect(result.genuineAuthentication).toBe('UNVERIFIED');
      expect(await verifyProfitGuardReview(result)).toEqual({
        status: 'CURRENT_JOB_SOURCE',
        replacement: null,
        workforce: 'UNKNOWN',
      });
      expect(await f.repo.jobs(f.org)).toEqual(before);
      expect(await f.repo.workforce(f.org)).toEqual(workforce);
      expect(await f.repo.history(f.org, f.scope.estimateId)).toEqual(history);
      writes.forEach((write) => expect(write).not.toHaveBeenCalled());
    },
  );
  it('retains exact approved commitment/payment/credit IDs and canonical netting without a duplicate calculator', async () => {
    const f = await fixture();
    const commitment = await f.append('commitment', 10000),
      payment = await f.append('payment', 4000),
      credit = await f.append('credit', 1000, payment);
    const result = await f.read(),
      canonical = jobFinancials(f.repo.syntheticJob(f.org, f.job.id)!);
    const card = result.cards.find(
      (row) => row.code === 'UNPAID_COMMITMENT' && row.category === 'materials',
    )!;
    expect(card.expenseIds).toEqual(
      expect.arrayContaining([commitment, payment, credit]),
    );
    expect(
      result.completion.categories.find((row) => row.category === 'materials')
        ?.unpaidCommitmentMinor,
    ).toBe(6000);
    expect(result.completion.totals?.projectedMinor).toBe(
      canonical.projected_cost_minor,
    );
    expect(
      result.cards.some((row) => row.code === 'FORECAST_OVERLAP_REVIEW'),
    ).toBe(true);
    expect(result.completion.providerEvidence.refundStatus).toBe('UNKNOWN');
  });
  it('uses canonical overrun and margin-erosion thresholds without treating a warning as authority', async () => {
    const f = await fixture();
    await f.append('commitment', 900000000);
    const result = await f.read();
    expect(result.cards.map((row) => row.code)).toEqual(
      expect.arrayContaining([
        'CATEGORY_OVERRUN',
        'NEGATIVE_CONTRIBUTION',
        'MARGIN_EROSION',
      ]),
    );
    expect(result.profitability?.projectedContributionMinor).toBeLessThan(0);
    expect(result.authority.approve).toBe(false);
    expect(result.authority.financialExecution).toBe(false);
  });
  it('withholds monetary and source arrays when the existing reader reports missing labor coverage', async () => {
    const f = await fixture(),
      original = f.repo.workforce.bind(f.repo);
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (org) => ({
      ...(await original(org)),
      policy: null,
    }));
    const result = await f.read();
    expect(result.status).toBe('UNKNOWN');
    expect(result.completion.totals).toBeNull();
    expect(result.profitability).toBeNull();
    expect(result.completion.expenses).toEqual([]);
    expect(result.cards.some((row) => row.code === 'SOURCE_COVERAGE')).toBe(
      true,
    );
  });
  it('shows management-declared completion without asserting physical completion, final net profit or settlement', async () => {
    const f = await fixture(),
      job = f.repo.syntheticJob(f.org, f.job.id)!;
    await f.repo.projection(f.org, job, {
      ...job.projection,
      costs_complete: true,
      remaining: {
        materials: 0,
        labor: 0,
        subcontractors: 0,
        equipment: 0,
        other: 0,
      },
    });
    f.scope.jobRevision++;
    const result = await f.read();
    expect(result.completion.coverage?.managementCostsComplete).toBe(true);
    expect(['PARTIAL', 'DECLARED_COSTS_COMPLETE']).toContain(result.status);
    expect(result.workforceCurrentness).toBe('UNKNOWN');
    expect(result.cards.map((card) => card.code)).toEqual(
      expect.arrayContaining(['UNALLOCATED_OVERHEAD', 'PROVIDER_EVIDENCE']),
    );
    expect(result.completion.providerEvidence.settlementStatus).toBe('UNKNOWN');
  });
  it('strictly allowlists result fields, excludes existing private notes/rates/names and freezes every result', async () => {
    const f = await fixture();
    await f.append('payment', 1000);
    const result = await f.read(),
      serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /PRIVATE|cash_hour|salary_week|burden_bps|imputed_hour|deduction|classification_review|display_name|Example Building|Alex|Sam/,
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cards)).toBe(true);
    expect(Object.isFrozen(result.completion.expenses[0])).toBe(true);
    const { reviewHash, ...body } = result;
    expect(reviewHash).toBe(await documentHash(body));
    expect(await verifyProfitGuardReview(structuredClone(result))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
      workforce: 'UNKNOWN',
    });
  });
  it.each([
    {},
    { enabled: false, confirmed: true },
    { enabled: true, confirmed: false },
    { enabled: true, confirmed: 'true' },
    { enabled: true, confirmed: true, extra: 1 },
  ])(
    'rejects invalid/default-off admission %j before source reads',
    async (admission) => {
      const f = await fixture(),
        jobs = vi.spyOn(f.repo, 'jobs');
      await expect(
        readProfitGuardReview(f.reader, f.scope, f.actor, admission as never),
      ).rejects.toThrow();
      expect(jobs).not.toHaveBeenCalled();
    },
  );
  it('defaults off and denies getter/symbol/serializer admission before invoking it', async () => {
    const f = await fixture(),
      getter = vi.fn(() => true),
      admission = { enabled: true };
    Object.defineProperty(admission, 'confirmed', { get: getter });
    await expect(
      readProfitGuardReview(f.reader, f.scope, f.actor),
    ).rejects.toThrow();
    await expect(
      readProfitGuardReview(f.reader, f.scope, f.actor, admission as never),
    ).rejects.toThrow();
    await expect(
      readProfitGuardReview(f.reader, f.scope, f.actor, {
        ...f.admission,
        [Symbol()]: true,
      }),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['field', 'estimator', 'foreign'])(
    'denies an ineligible %s actor before job reads',
    async (role) => {
      const f = await fixture(),
        read = vi.spyOn(f.repo, 'jobs');
      await expect(
        readProfitGuardReview(
          f.reader,
          f.scope,
          `${f.org}-${role}`,
          f.admission,
        ),
      ).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('rejects connected and disabled financial readers', async () => {
    const f = await fixture();
    await expect(
      readProfitGuardReview(
        new LocalJobMarginReader(f.repo),
        f.scope,
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
    await expect(
      readProfitGuardReview(
        new LocalJobMarginReader(
          new Phase3Repository(new Operations(false)),
          true,
        ),
        f.scope,
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
  });
  it.each([
    'organizationId',
    'jobId',
    'issuedVersionId',
    'estimateId',
    'customerId',
    'propertyId',
    'currency',
  ] as const)('rejects incorrect exact %s association', async (key) => {
    const f = await fixture();
    const operation = readProfitGuardReview(
      f.reader,
      {
        ...f.scope,
        [key]:
          key === 'organizationId'
            ? sampleCompanies[1].id
            : key === 'currency'
              ? 'CAD'
              : crypto.randomUUID(),
      },
      f.actor,
      f.admission,
    );
    if (key === 'jobId' || key === 'estimateId') {
      const result = await operation;
      expect(result.status).toBe('UNKNOWN');
      expect(result.profitability).toBeNull();
      expect(result.completion.totals).toBeNull();
      expect(result.completion.expenses).toEqual([]);
    } else await expect(operation).rejects.toThrow();
  });
  it('rejects accessors, extra fields and symbols in source scope without invoking caller code', async () => {
    const f = await fixture(),
      getter = vi.fn(() => f.scope.jobId),
      scope = { ...f.scope };
    Object.defineProperty(scope, 'jobId', { get: getter });
    await expect(
      readProfitGuardReview(f.reader, scope, f.actor, f.admission),
    ).rejects.toThrow();
    await expect(
      readProfitGuardReview(
        f.reader,
        {
          ...f.scope,
          toJSON() {
            throw Error('executed');
          },
        } as never,
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
    await expect(
      readProfitGuardReview(
        f.reader,
        { ...f.scope, [Symbol()]: true },
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('requires the original confirmation after an awaited source read', async () => {
    const f = await fixture(),
      read = f.repo.workforce.bind(f.repo);
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (org) => {
      const result = await read(org);
      f.admission.confirmed = false;
      return result;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('blocks a real job revision change during the last asynchronous hash wait', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const value = await digest(...args),
        job = f.repo.syntheticJob(f.org, f.job.id)!;
      await f.repo.projection(f.org, job, {
        ...job.projection,
        remaining: { ...job.projection.remaining, other: 50 },
      });
      return value;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('blocks revocation at the final asynchronous hash checkpoint', async () => {
    const f = await fixture(),
      actor = `${f.org}-estimator`,
      digest = crypto.subtle.digest.bind(crypto.subtle);
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      await f.operations.manageMember(
        f.org,
        actor,
        false,
        'admin',
        'office_manager',
      );
      return result;
    });
    await expect(
      readProfitGuardReview(f.reader, f.scope, actor, f.admission),
    ).rejects.toThrow();
  });
  it('never replaces a stale/uncertain review and preserves its frozen original contents', async () => {
    const f = await fixture(),
      review = await f.read(),
      original = JSON.stringify(review);
    await f.append('payment', 1000);
    expect(await verifyProfitGuardReview(review)).toMatchObject({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(JSON.stringify(review)).toBe(original);
    f.admission.confirmed = false;
    expect(await verifyProfitGuardReview(review)).toMatchObject({
      status: 'UNKNOWN',
      replacement: null,
    });
  });
});

describe('unposted time/overhead proposals, not workforce acceptance', () => {
  it.each([0, 1, 2])(
    'validates a human proposal against actual worker relationships for company %i without recording time',
    async (index) => {
      const f = await fixture(index),
        before = await f.repo.workforce(f.org),
        record = vi.spyOn(f.repo, 'recordTime');
      const result = await f.read(f.proposal);
      expect(result.timeProposal).toMatchObject({
        status: 'BLOCKED_DRAFT_ONLY',
        workerId: f.proposal.workerId,
        jobId: f.job.id,
        evidence: 'CAPTURED_NOT_ATOMIC',
        timeValidation: 'VALID_AGAINST_CAPTURED_ENTRIES',
        currentWorkerAndTimeCoverage: 'UNKNOWN',
        monetaryAllocation: null,
      });
      expect(result.authority.postTime).toBe(false);
      expect(await f.repo.workforce(f.org)).toEqual(before);
      expect(record).not.toHaveBeenCalled();
      expect(await verifyProfitGuardReview(result)).toMatchObject({
        status: 'CURRENT_JOB_SOURCE',
        workforce: 'UNKNOWN',
      });
    },
  );
  it('keeps overhead allocation and its approval explicitly unverified and amount-free', async () => {
    const f = await fixture(),
      result = await f.read({
        ...f.proposal,
        allocation: 'overhead',
        overheadCenter: 'Human proposed office review',
      });
    expect(result.timeProposal).toMatchObject({
      allocation: 'overhead',
      jobId: null,
      approvedOverheadCenter: 'UNVERIFIED',
      monetaryAllocation: null,
      status: 'BLOCKED_DRAFT_ONLY',
    });
    expect(result.authority.allocateOverhead).toBe(false);
  });
  it.each([
    { startedAt: '2099-06-01T08:00:00' },
    { endedAt: '2099-06-01T07:00:00-05:00' },
    { endedAt: '2099-06-02T08:00:00-05:00' },
    { workerId: 'unrelated-worker' },
    { task: '' },
    { overheadCenter: 'unexpected-job-center' },
    { allocation: 'overhead', overheadCenter: '' },
  ])(
    'rejects invalid proposal %j using exact relationships and existing time validation',
    async (patch) => {
      const f = await fixture();
      await expect(
        f.read({ ...f.proposal, ...patch } as never),
      ).rejects.toThrow();
    },
  );
  it('rejects overlap with an actual existing source time entry', async () => {
    const f = await fixture();
    await f.repo.recordTime(f.org, f.proposal.workerId, {
      job_id: f.job.id,
      overhead_center: null,
      task: 'PRIVATE EXISTING TASK',
      kind: 'work',
      started_at: f.proposal.startedAt,
      ended_at: f.proposal.endedAt,
      billable: false,
      corrects_id: null,
    });
    await expect(f.read(f.proposal)).rejects.toThrow(/Overlapping/);
  });
  it('rejects a foreign worker and a revoked local worker membership', async () => {
    const f = await fixture(),
      foreign = await fixture(1);
    await expect(
      f.read({ ...f.proposal, workerId: foreign.proposal.workerId }),
    ).rejects.toThrow();
    await f.operations.manageMember(
      f.org,
      `${f.org}-field`,
      false,
      'staff',
      'field_staff',
    );
    await expect(f.read(f.proposal)).rejects.toThrow();
  });
  it('rejects changing workforce evidence during proposal capture', async () => {
    const f = await fixture(),
      read = f.repo.workforce.bind(f.repo);
    let calls = 0;
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (org) => {
      const data = await read(org);
      if (++calls === 4) data.workers[1].active = false;
      return data;
    });
    await expect(f.read(f.proposal)).rejects.toThrow();
  });
  it('reconciles changed actual time evidence as stale without posting/replay', async () => {
    const f = await fixture(),
      result = await f.read(f.proposal);
    await f.repo.recordTime(f.org, f.proposal.workerId, {
      job_id: f.job.id,
      overhead_center: null,
      task: 'PRIVATE NEW TASK',
      kind: 'work',
      started_at: '2099-06-01T10:00:00-05:00',
      ended_at: '2099-06-01T11:00:00-05:00',
      billable: false,
      corrects_id: null,
    });
    expect(await verifyProfitGuardReview(result)).toEqual({
      status: 'STALE',
      replacement: null,
      workforce: 'UNKNOWN',
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE NEW TASK/);
  });
  it('never promotes async workforce coverage when time changes during the digest wait', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      await f.repo.recordTime(f.org, f.proposal.workerId, {
        job_id: f.job.id,
        overhead_center: null,
        task: 'Private race task',
        kind: 'work',
        started_at: '2099-06-01T10:00:00-05:00',
        ended_at: '2099-06-01T11:00:00-05:00',
        billable: false,
        corrects_id: null,
      });
      return result;
    });
    const review = await f.read(f.proposal);
    expect(review.timeProposal?.currentWorkerAndTimeCoverage).toBe('UNKNOWN');
    expect(review.timeProposal?.status).toBe('BLOCKED_DRAFT_ONLY');
    expect(await verifyProfitGuardReview(review)).toMatchObject({
      status: 'STALE',
      replacement: null,
    });
  });
  it('does not execute proposal getters or serializers', async () => {
    const f = await fixture(),
      input = { ...f.proposal },
      getter = vi.fn(() => f.proposal.workerId);
    Object.defineProperty(input, 'workerId', { get: getter });
    await expect(f.read(input)).rejects.toThrow();
    await expect(
      f.read({
        ...f.proposal,
        toJSON() {
          throw Error('executed');
        },
      } as never),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});
