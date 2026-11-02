import { describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { LocalJobMarginReader } from '../src/lib/job-margin-analysis';
import {
  completionReviewGuard,
  projectJobCostCompletion,
} from '../src/lib/job-cost-completion';
import {
  type MarginScope,
  projectLocalJobMargin,
} from '../src/domain/jobs/margin-analysis';
import { jobFinancials, type Expense } from '../src/domain/jobs/financials';

async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id;
  const operations = new Operations(true),
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  const job = (await repo.jobs(org))[0],
    estimate = (await repo.list(org))[0];
  const issued = (await repo.history(org, estimate.id)).find(
    (row) => row.id === job.baseline.issued_version_id,
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
    actor = `${org}-owner`;
  const admission = { enabled: true, confirmed: true };
  const read = () => reader.readCompletion(scope, actor, admission);
  async function append(
    kind: Expense['kind'],
    amount = 1000,
    adjusts: string | null = null,
    decision: 'approved' | 'rejected' | null = 'approved',
  ) {
    const id = await repo.submitExpense(org, job.id, {
      kind,
      category: 'equipment',
      amount_minor: amount,
      supplier: 'Synthetic equipment supplier',
      purchase_key: 'exact-local-purchase',
      reference: crypto.randomUUID(),
      description: 'Private staff note must not leak',
      estimate_line_id: null,
      quantity_milli: 1000,
      unit: 'each',
      unit_cost_minor: amount,
      document_ids: [],
      material_approval_id: null,
      adjusts_expense_id: adjusts,
    });
    if (decision)
      await repo.reviewExpense(
        org,
        job.id,
        id,
        decision,
        'Private review reason',
      );
    scope.jobRevision = (await repo.jobs(org))[0].lock_revision;
    return id;
  }
  return {
    company,
    org,
    operations,
    repo,
    job,
    issued,
    scope,
    reader,
    actor,
    admission,
    read,
    append,
  };
}

describe('source-bound cost-to-complete review', () => {
  it.each([0, 1, 2])(
    'decomposes exact canonical job costs for company %i without any writer or financial effects',
    async (index) => {
      const f = await fixture(index),
        before = structuredClone(await f.repo.jobs(f.org));
      const writers = [
        vi.spyOn(f.repo, 'projection'),
        vi.spyOn(f.repo, 'submitExpense'),
        vi.spyOn(f.repo, 'reviewExpense'),
        vi.spyOn(f.repo, 'approveJob'),
      ];
      const result = await f.read(),
        canonical = jobFinancials(before[0]);
      expect(result.status).toBe('PARTIAL');
      expect(result.totals?.projectedMinor).toBe(
        canonical.projected_cost_minor,
      );
      expect(result.totals?.costToCompleteMinor).toBe(
        canonical.categories.reduce(
          (n, row) => n + row.committed_remaining_minor + row.remaining_minor,
          0,
        ),
      );
      expect(
        result.totals!.recordedMinor + result.totals!.costToCompleteMinor,
      ).toBe(result.totals!.projectedMinor);
      expect(result.providerEvidence).toMatchObject({
        status: 'UNKNOWN',
        eventIds: [],
        refundStatus: 'UNKNOWN',
        voidStatus: 'UNKNOWN',
        settlementStatus: 'UNKNOWN',
      });
      expect(Object.isFrozen(result.totals)).toBe(true);
      expect(await f.repo.jobs(f.org)).toEqual(before);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
    },
  );
  it('nets an exact approved payment/credit against its commitment once without inferring a refund', async () => {
    const f = await fixture();
    await f.append('commitment', 10000);
    const payment = await f.append('payment', 4000),
      credit = await f.append('credit', 1000, payment);
    const result = await f.read(),
      row = result.categories.find((row) => row.category === 'equipment')!;
    expect(row).toMatchObject({
      recordedMinor: 3000,
      unpaidCommitmentMinor: 6000,
      remainingForecastMinor: 0,
      costToCompleteMinor: 6000,
      projectedMinor: 9000,
    });
    expect(result.expenses.find((row) => row.id === credit)).toMatchObject({
      adjustsExpenseId: payment,
      kind: 'credit',
      inclusion: 'CANONICAL_SOURCE',
      review: { decision: 'approved' },
    });
    expect(result.providerEvidence.refundStatus).toBe('UNKNOWN');
    expect(result.providerEvidence.eventIds).toEqual([]);
  });
  it('keeps remaining forecast additive and does not silently net it against unpaid commitments', async () => {
    const f = await fixture();
    await f.append('commitment', 10000);
    await f.append('payment', 4000);
    const job = (await f.repo.jobs(f.org))[0];
    await f.repo.projection(f.org, job, {
      ...job.projection,
      remaining: { ...job.projection.remaining, equipment: 2500 },
    });
    f.scope.jobRevision++;
    const result = await f.read();
    expect(
      result.categories.find((row) => row.category === 'equipment'),
    ).toMatchObject({
      recordedMinor: 4000,
      unpaidCommitmentMinor: 6000,
      remainingForecastMinor: 2500,
      costToCompleteMinor: 8500,
      projectedMinor: 12500,
    });
  });
  it('retains pending and rejected source IDs while excluding their amounts', async () => {
    const f = await fixture(),
      baseline = await f.read(),
      pending = await f.append('payment', 1000, null, null),
      rejected = await f.append('payment', 2000, null, 'rejected');
    const result = await f.read();
    expect(result.totals).toEqual(baseline.totals);
    expect(result.expenses.find((row) => row.id === pending)).toMatchObject({
      review: null,
      inclusion: 'EXCLUDED',
    });
    expect(result.expenses.find((row) => row.id === rejected)).toMatchObject({
      review: { decision: 'rejected' },
      inclusion: 'EXCLUDED',
    });
    expect(result.coverage?.pendingExpenses).toBe(1);
  });
  it('does not expose private supplier/expense descriptions/review reasons or payroll rates', async () => {
    const f = await fixture();
    await f.append('payment');
    const text = JSON.stringify(await f.read());
    expect(text).not.toMatch(
      /Synthetic equipment supplier|Private staff note|Private review reason|cash_hour|burden_rate|unit_cost_minor|deduction/,
    );
  });
  it.each([
    {},
    { enabled: false, confirmed: true },
    { enabled: true, confirmed: false },
    { enabled: true, confirmed: 'true' },
    { enabled: true, confirmed: true, extra: true },
  ])(
    'denies absent or nonexact confirmations %j before reading',
    async (admission) => {
      const f = await fixture(),
        jobs = vi.spyOn(f.repo, 'jobs');
      await expect(
        f.reader.readCompletion(f.scope, f.actor, admission as never),
      ).rejects.toThrow();
      expect(jobs).not.toHaveBeenCalled();
    },
  );
  it('defaults off and rejects admission accessors/symbols without invoking them', async () => {
    const f = await fixture(),
      getter = vi.fn(() => true),
      admission = { enabled: true };
    Object.defineProperty(admission, 'confirmed', { get: getter });
    await expect(f.reader.readCompletion(f.scope, f.actor)).rejects.toThrow();
    expect(() => completionReviewGuard(admission as never)()).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      completionReviewGuard({
        enabled: true,
        confirmed: true,
        [Symbol()]: true,
      })(),
    ).toThrow();
  });
  it.each(['jobs', 'history', 'workforce'] as const)(
    'denies a confirmation withdrawn during the awaited %s read',
    async (method) => {
      const f = await fixture(),
        original = f.repo[method].bind(f.repo) as (
          ...args: unknown[]
        ) => Promise<unknown>;
      vi.spyOn(f.repo, method).mockImplementation((async (
        ...args: unknown[]
      ) => {
        const result = await original(...args);
        f.admission.confirmed = false;
        return result;
      }) as never);
      await expect(f.read()).rejects.toThrow(/confirm/);
    },
  );
  it.each([0, 1, 2])(
    'denies actual admin downgrade after a source wait for company %i',
    async (index) => {
      const f = await fixture(index),
        actor = `${f.org}-estimator`;
      await f.operations.manageMember(
        f.org,
        actor,
        true,
        'admin',
        'office_manager',
      );
      const jobs = f.repo.jobs.bind(f.repo);
      vi.spyOn(f.repo, 'jobs').mockImplementation(async (...args) => {
        const result = await jobs(...args);
        await f.operations.manageMember(
          f.org,
          actor,
          true,
          'staff',
          'estimator',
        );
        return result;
      });
      await expect(
        f.reader.readCompletion(f.scope, actor, f.admission),
      ).rejects.toThrow(/eligible/);
    },
  );
  it.each(['field', 'estimator', 'foreign'])(
    'denies ineligible %s identity',
    async (role) => {
      const f = await fixture();
      await expect(
        f.reader.readCompletion(f.scope, `${f.org}-${role}`, f.admission),
      ).rejects.toThrow(/eligible/);
    },
  );
  it('denies a revoked staff member and a disabled reader', async () => {
    const f = await fixture(),
      actor = `${f.org}-estimator`;
    await f.operations.manageMember(
      f.org,
      actor,
      false,
      'admin',
      'office_manager',
    );
    await expect(
      f.reader.readCompletion(f.scope, actor, f.admission),
    ).rejects.toThrow(/eligible/);
    await expect(
      new LocalJobMarginReader(f.repo).readCompletion(
        f.scope,
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow(/disabled/);
  });
  it.each(['customerId', 'propertyId'] as const)(
    'rejects a wrong exact %s binding',
    async (field) => {
      const f = await fixture();
      await expect(
        f.reader.readCompletion(
          { ...f.scope, [field]: crypto.randomUUID() },
          f.actor,
          f.admission,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(['issuedVersionId', 'estimateId'] as const)(
    'keeps absent exact %s evidence UNKNOWN without selecting a newer source',
    async (field) => {
      const f = await fixture();
      const result = await f.reader.readCompletion(
        { ...f.scope, [field]: crypto.randomUUID() },
        f.actor,
        f.admission,
      );
      expect(result.status).toBe('UNKNOWN');
      expect(result.totals).toBeNull();
      expect(result.expenses).toEqual([]);
      expect(result.laborSource.entryIds).toEqual([]);
    },
  );
  it('withholds amounts when current labor coverage cannot be established', async () => {
    const f = await fixture(),
      workforce = f.repo.workforce.bind(f.repo);
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (...args) => ({
      ...(await workforce(...args)),
      policy: null,
    }));
    const result = await f.read();
    expect(result.status).toBe('UNKNOWN');
    expect(result.totals).toBeNull();
    expect(result.expenses).toEqual([]);
  });
  it('cannot read a foreign company job or reuse its scope with the local actor', async () => {
    const f = await fixture(),
      foreign = await fixture(1);
    await expect(
      f.reader.readCompletion(foreign.scope, f.actor, f.admission),
    ).rejects.toThrow(/eligible/);
    const result = await f.reader.readCompletion(
      { ...f.scope, jobId: foreign.scope.jobId },
      f.actor,
      f.admission,
    );
    expect(result.status).toBe('UNKNOWN');
    expect(result.totals).toBeNull();
    expect(JSON.stringify(result)).not.toContain(foreign.issued.id);
  });
  it('withholds totals for a missing exact job and does not substitute the newest source', async () => {
    const f = await fixture();
    const result = await f.reader.readCompletion(
      { ...f.scope, jobId: crypto.randomUUID() },
      f.actor,
      f.admission,
    );
    expect(result.status).toBe('UNKNOWN');
    expect(result.totals).toBeNull();
    expect(result.expenses).toEqual([]);
  });
  it('rejects stale revisions and source changes during a double read', async () => {
    const f = await fixture();
    await expect(
      f.reader.readCompletion(
        { ...f.scope, jobRevision: f.scope.jobRevision + 1 },
        f.actor,
        f.admission,
      ),
    ).rejects.toThrow();
    const jobs = f.repo.jobs.bind(f.repo);
    let count = 0;
    vi.spyOn(f.repo, 'jobs').mockImplementation(async (...args) => {
      const rows = structuredClone(await jobs(...args));
      if (++count === 2) rows[0].projection.remaining.other++;
      return rows;
    });
    await expect(f.read()).rejects.toThrow(/changed/);
  });
  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])(
    'rejects unsafe minor-unit or quantity evidence %s',
    async (value) => {
      const f = await fixture();
      const jobs = f.repo.jobs.bind(f.repo);
      vi.spyOn(f.repo, 'jobs').mockImplementation(async (...args) => {
        const rows = structuredClone(await jobs(...args));
        rows[0].expenses[0].quantity_milli = value;
        return rows;
      });
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('rejects unsafe unit metadata and unknown void expense kinds rather than coercing them', async () => {
    const f = await fixture();
    const jobs = f.repo.jobs.bind(f.repo);
    const spy = vi.spyOn(f.repo, 'jobs').mockImplementation(async (...args) => {
      const rows = structuredClone(await jobs(...args));
      rows[0].expenses[0].unit = ' ';
      return rows;
    });
    await expect(f.read()).rejects.toThrow();
    spy.mockRestore();
    vi.spyOn(f.repo, 'jobs').mockImplementation(async (...args) => {
      const rows = structuredClone(await jobs(...args));
      rows[0].expenses[0].kind = 'void' as never;
      return rows;
    });
    await expect(f.read()).rejects.toThrow();
  });
  it('supports exact zero remaining amounts but never upgrades management declaration to verified completion', async () => {
    const f = await fixture(),
      job = structuredClone(f.job);
    job.expenses = [];
    job.events = [];
    job.labor = {
      seconds: 0,
      billable_seconds: 0,
      cash_minor: 0,
      burden_minor: 0,
      imputed_minor: 0,
      billing_minor: 0,
    };
    job.projection = {
      ...job.projection,
      costs_complete: true,
      remaining: {
        materials: 0,
        labor: 0,
        subcontractors: 0,
        equipment: 0,
        other: 0,
      },
    };
    const margin = projectLocalJobMargin(
      {
        scope: f.scope,
        job,
        issued: f.issued,
        labor: {
          status: 'known',
          currency: f.scope.currency,
          unpostedApproved: 0,
          unresolved: 0,
          entryIds: [],
          lockedPeriodIds: [],
        },
      },
      { enabled: true },
    );
    const result = projectJobCostCompletion(margin, job);
    expect(result.status).toBe('DECLARED_COSTS_COMPLETE');
    expect(result.totals?.costToCompleteMinor).toBe(0);
    expect(result.providerEvidence.status).toBe('UNKNOWN');
    expect(result.authority).toContain('not verified physical completion');
  });
});
