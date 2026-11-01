import { describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { LocalJobMarginReader } from '../src/lib/job-margin-analysis';
import {
  projectLocalJobMargin,
  type MarginScope,
} from '../src/domain/jobs/margin-analysis';
import {
  jobFinancials,
  baselineFromEstimate,
} from '../src/domain/jobs/financials';
import { calculateEstimate } from '../src/domain/estimating/calculation';

async function fixture(index = 0, property = false) {
  const company = sampleCompanies[index],
    org = company.id;
  const operations = new Operations(true),
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  let job = (await repo.jobs(org))[0];
  let summary = (await repo.list(org))[0];
  let issued = (await repo.history(org, summary.id)).find(
    (v) => v.id === job.baseline.issued_version_id,
  )!;
  if (property) {
    await operations.saveLocation(org, issued.payload.customer_id, {
      address_line1: '100 Synthetic Analysis Lane',
      address_line2: null,
      city: 'Example City',
      region: 'TX',
      postal_code: '75000',
      country_code: 'US',
    });
    const location = (
      await operations.listLocations(org, issued.payload.customer_id)
    )[0];
    const draft = await repo.get(org, summary.id);
    const saved = await repo.create(company, {
      ...draft.version.payload,
      location_id: location.id,
    });
    const source = await repo.issue(org, saved);
    const id = await repo.approveJob(org, source);
    job = (await repo.jobs(org)).find((j) => j.id === id)!;
    // New jobs have no labor-summary observation yet; the existing payroll lock observes zero.
    await repo.payroll(
      org,
      '2026-10-04T05:00:00Z',
      '2026-10-11T05:00:00Z',
      {},
      true,
    );
    job = (await repo.jobs(org)).find((j) => j.id === id)!;
    summary = source.estimate;
    issued = source.version;
  }
  const scope: MarginScope = {
    organizationId: org,
    jobId: job.id,
    jobRevision: job.lock_revision,
    estimateId: summary.id,
    issuedVersionId: issued.id,
    customerId: issued.payload.customer_id,
    propertyId: issued.payload.location_id,
    currency: job.baseline.currency,
  };
  const reader = new LocalJobMarginReader(repo, true),
    actor = `${org}-owner`;
  const labor = {
    status: 'known' as const,
    currency: scope.currency,
    unpostedApproved: 0,
    unresolved: 0,
    entryIds: [] as string[],
    lockedPeriodIds: [] as string[],
  };
  return {
    org,
    repo,
    operations,
    company,
    job,
    issued,
    scope,
    reader,
    actor,
    input: { scope, job, issued, labor },
  };
}
const project = (input: Parameters<typeof projectLocalJobMargin>[0]) =>
  projectLocalJobMargin(input, { enabled: true });

describe('existing-source local job margin analysis', () => {
  it.each([0, 1, 2])(
    'uses actual approved expenses and canonical integer totals for company %i without a side effect',
    async (index) => {
      const f = await fixture(index);
      const before = {
        jobs: await f.repo.jobs(f.org),
        history: await f.repo.history(f.org, f.scope.estimateId),
        workforce: await f.repo.workforce(f.org),
      };
      const result = await f.reader.read(f.scope, f.actor),
        canonical = jobFinancials(f.job);
      expect(result.status).toBe('PARTIAL');
      expect(result.coverage?.unpostedApprovedTime).toBe(5);
      expect(result.totals?.projectedContributionMinor).toBe(
        canonical.projected_profit_minor,
      );
      expect(result.categories.map((r) => r.projectedMinor)).toEqual(
        canonical.categories.map((r) => r.projected_minor),
      );
      expect(result.source.reviewEventIds).toEqual(
        f.job.events.map((e) => e.id),
      );
      expect(result.source.expenseIds).toEqual(f.job.expenses.map((e) => e.id));
      expect(
        result.categories.every(
          (r) => r.varianceMinor === r.projectedMinor - r.budgetMinor,
        ),
      ).toBe(true);
      expect({
        jobs: await f.repo.jobs(f.org),
        history: await f.repo.history(f.org, f.scope.estimateId),
        workforce: await f.repo.workforce(f.org),
      }).toEqual(before);
      expect(JSON.stringify(result)).not.toMatch(
        /Example Building Supply|unit_cost_minor|cash_hour_minor|deductions|internal_note|classification_review/,
      );
      expect(Object.isFrozen(result.categories[0])).toBe(true);
    },
  );
  it.each([0, 1, 2])(
    'reads actual property-bound immutable source and locked workforce flow for company %i',
    async (index) => {
      const f = await fixture(index, true);
      expect(f.scope.propertyId).not.toBeNull();
      const result = await f.reader.read(f.scope, f.actor);
      expect(result.status).toBe('PARTIAL');
      expect(result.scope.propertyId).toBe(f.scope.propertyId);
      expect(result.totals?.projectedContributionMinor).toBe(
        jobFinancials(f.job).projected_profit_minor,
      );
      const foreign = await fixture((index + 1) % 3, true);
      await expect(
        f.reader.read(
          { ...f.scope, propertyId: foreign.scope.propertyId },
          f.actor,
        ),
      ).rejects.toThrow();
    },
  );
  it('distinguishes unposted approved time from exact locked labor without a double posting', async () => {
    const f = await fixture();
    await f.repo.payroll(
      f.org,
      '2026-10-04T05:00:00Z',
      '2026-10-11T05:00:00Z',
      {},
      true,
    );
    f.scope.jobRevision = (await f.repo.jobs(f.org))[0].lock_revision;
    const before = await f.repo.workforce(f.org),
      result = await f.reader.read(f.scope, f.actor);
    expect(result.coverage?.unpostedApprovedTime).toBe(0);
    expect(result.source.lockedPeriodIds).toEqual(
      before.periods.map((p) => p.id),
    );
    expect(
      result.categories.find((r) => r.category === 'labor')!.recordedMinor,
    ).toBeGreaterThan(0);
    expect(await f.repo.workforce(f.org)).toEqual(before);
  });
  it('defaults off and blocks connected/unknown company sources before repository reads', async () => {
    const f = await fixture(),
      jobs = vi.spyOn(f.repo, 'jobs');
    await expect(
      new LocalJobMarginReader(f.repo).read(f.scope, f.actor),
    ).rejects.toThrow(/disabled/);
    expect(() => projectLocalJobMargin(f.input)).toThrow(/disabled/);
    await expect(
      new LocalJobMarginReader(
        new Phase3Repository(new Operations(false)),
        true,
      ).read(f.scope, f.actor),
    ).rejects.toThrow(/synthetic/);
    await expect(
      f.reader.read({ ...f.scope, organizationId: 'unknown' }, f.actor),
    ).rejects.toThrow();
    expect(jobs).not.toHaveBeenCalled();
  });
  it.each(['estimator', 'field', 'customer', 'platform', 'unknown'])(
    'withholds private margins from %s',
    async (role) => {
      const f = await fixture(),
        jobs = vi.spyOn(f.repo, 'jobs');
      await expect(f.reader.read(f.scope, `${f.org}-${role}`)).rejects.toThrow(
        /eligible/,
      );
      expect(jobs).not.toHaveBeenCalled();
    },
  );
  it('permits a current admin and rejects revocation during a pending read', async () => {
    const f = await fixture(),
      actor = `${f.org}-estimator`;
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    await expect(f.reader.read(f.scope, actor)).resolves.toHaveProperty(
      'status',
      'PARTIAL',
    );
    const history = f.repo.history.bind(f.repo);
    vi.spyOn(f.repo, 'history').mockImplementation(async (...args) => {
      const result = await history(...args);
      await f.operations.manageMember(
        f.org,
        actor,
        false,
        'admin',
        'office_manager',
      );
      return result;
    });
    await expect(f.reader.read(f.scope, actor)).rejects.toThrow(/eligible/);
  });
  it('rejects stale lock selection and a changed source between reads', async () => {
    const f = await fixture();
    await expect(
      f.reader.read({ ...f.scope, jobRevision: 99 }, f.actor),
    ).rejects.toThrow();
    const jobs = f.repo.jobs.bind(f.repo);
    let calls = 0;
    vi.spyOn(f.repo, 'jobs').mockImplementation(async (...args) => {
      const result = await jobs(...args);
      if (++calls === 2) result[0].projection.remaining.materials++;
      return result;
    });
    await expect(f.reader.read(f.scope, f.actor)).rejects.toThrow(
      /changed during/,
    );
  });
  it.each(['customerId', 'jobId', 'issuedVersionId', 'estimateId'] as const)(
    'does not infer source identity from matching values: %s',
    async (key) => {
      const f = await fixture();
      const result = f.reader.read(
        { ...f.scope, [key]: crypto.randomUUID() },
        f.actor,
      );
      if (key === 'jobId' || key === 'issuedVersionId' || key === 'estimateId')
        expect((await result).totals).toBeNull();
      else await expect(result).rejects.toThrow();
    },
  );
  it('rejects foreign expense job, duplicate expense/event/decision and unknown review source', async () => {
    const f = await fixture();
    for (const mutate of [
      (x: typeof f.input) => {
        x.job.expenses[0].job_id = crypto.randomUUID();
      },
      (x: typeof f.input) => {
        x.job.expenses.push(structuredClone(x.job.expenses[0]));
      },
      (x: typeof f.input) => {
        x.job.events.push(structuredClone(x.job.events[0]));
      },
      (x: typeof f.input) => {
        x.job.events.push({ ...x.job.events[0], id: crypto.randomUUID() });
      },
      (x: typeof f.input) => {
        x.job.events[0].submission_id = crypto.randomUUID();
      },
    ]) {
      const input = structuredClone(f.input);
      mutate(input);
      expect(() => project(input)).toThrow();
    }
  });
  it('rejects altered saved calculation/baseline, currency, enum coercion and fractional or overflow amounts', async () => {
    const f = await fixture();
    for (const mutate of [
      (x: typeof f.input) => {
        x.issued.calculation.net_minor++;
      },
      (x: typeof f.input) => {
        x.job.baseline.costs.materials++;
      },
      (x: typeof f.input) => {
        x.labor.currency = 'CAD';
      },
      (x: typeof f.input) => {
        x.job.expenses[0].amount_minor = 0.1;
      },
      (x: typeof f.input) => {
        x.job.expenses[0].amount_minor = 9e12 + 1;
      },
      (x: typeof f.input) => {
        Object.assign(x.job.events[0], {
          decision: { toString: () => 'approved' },
        });
      },
      (x: typeof f.input) => {
        Object.assign(x.labor, { status: new String('known') });
      },
      (x: typeof f.input) => {
        Object.assign(x.job.projection, { costs_complete: 'true' });
      },
    ]) {
      const input = structuredClone(f.input);
      mutate(input);
      expect(() => project(input)).toThrow();
    }
  });
  it('preserves UNKNOWN with no totals for missing source, summary or currency coverage', async () => {
    const f = await fixture();
    for (const input of [
      { ...f.input, job: null },
      { ...f.input, issued: null },
      { ...f.input, labor: { ...f.input.labor, currency: null } },
      { ...f.input, labor: { ...f.input.labor, status: 'unknown' as const } },
      { ...f.input, job: { ...f.job, labor: undefined } },
    ]) {
      expect(project(input)).toMatchObject({
        status: 'UNKNOWN',
        totals: null,
        categories: [],
      });
    }
  });
  it('does not treat projected zero remaining or management completeness as evidence of posted labor', async () => {
    const f = await fixture();
    const projection = structuredClone(f.job.projection);
    projection.costs_complete = true;
    for (const key of Object.keys(
      projection.remaining,
    ) as (keyof typeof projection.remaining)[])
      projection.remaining[key] = 0;
    await f.repo.projection(f.org, f.job, projection);
    f.scope.jobRevision++;
    const result = await f.reader.read(f.scope, f.actor);
    expect(result.status).toBe('PARTIAL');
    expect(result.coverage?.unpostedApprovedTime).toBe(5);
    expect(result.authority).toContain('No final profit');
  });
  it('reports only management-declared completeness after exact existing lock and projection workflows', async () => {
    const f = await fixture();
    await f.repo.payroll(
      f.org,
      '2026-10-04T05:00:00Z',
      '2026-10-11T05:00:00Z',
      {},
      true,
    );
    const job = (await f.repo.jobs(f.org))[0],
      projection = structuredClone(job.projection);
    projection.costs_complete = true;
    for (const key of Object.keys(
      projection.remaining,
    ) as (keyof typeof projection.remaining)[])
      projection.remaining[key] = 0;
    await f.repo.projection(f.org, job, projection);
    f.scope.jobRevision = job.lock_revision + 1;
    const result = await f.reader.read(f.scope, f.actor);
    expect(result.status).toBe('DECLARED_COSTS_COMPLETE');
    expect(result.reasons).toEqual([]);
    expect(result.authority).toContain('No final profit');
  });
  it('reuses commitment/payment/credit calculation and binds a credit to its exact approved payment', async () => {
    const f = await fixture();
    const source = f.job.expenses[0];
    for (const [kind, amount] of [
      ['commitment', 10000],
      ['payment', 6000],
      ['credit', 2000],
    ] as const) {
      const id = await f.repo.submitExpense(f.org, f.job.id, {
        ...source,
        kind,
        amount_minor: amount,
        purchase_key: 'variance-test',
        reference: `variance-${kind}`,
        adjusts_expense_id:
          kind === 'credit'
            ? f.job.expenses.find((e) => e.reference === 'variance-payment')?.id
            : null,
      });
      await f.repo.reviewExpense(
        f.org,
        f.job.id,
        id,
        'approved',
        'Synthetic review',
      );
      f.job = (await f.repo.jobs(f.org))[0];
    }
    f.scope.jobRevision = f.job.lock_revision;
    const result = await f.reader.read(f.scope, f.actor);
    expect(result.categories[0].recordedMinor).toBe(source.amount_minor + 4000);
    expect(result.categories[0].unpaidCommitmentMinor).toBe(4000);
    const input = { ...f.input, job: f.job, scope: f.scope };
    input.job.expenses.at(-1)!.adjusts_expense_id = crypto.randomUUID();
    expect(() => project(input)).toThrow();
  });
  it('handles zero revenue and safe integer limits without a false zero margin or rounding drift', async () => {
    const f = await fixture();
    const input = structuredClone(f.input);
    for (const line of input.issued.payload.lines) line.unit_price_minor = 0;
    input.issued.calculation = calculateEstimate(input.issued.payload, 0);
    input.job.baseline = baselineFromEstimate(
      input.issued.id,
      input.issued.payload,
      input.issued.calculation,
    );
    expect(project(input).totals?.projectedMarginBps).toBeNull();
    input.job.projection.remaining.other = 9e12;
    expect(() => project(input)).toThrow(/limit/);
  });
  it('keeps absent workforce currency and mismatched locked labor UNKNOWN without showing zero profit', async () => {
    const f = await fixture();
    const workforce = f.repo.workforce.bind(f.repo);
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (...args) => {
      const data = await workforce(...args);
      data.policy!.currency = undefined;
      return data;
    });
    expect(await f.reader.read(f.scope, f.actor)).toMatchObject({
      status: 'UNKNOWN',
      totals: null,
    });
    vi.restoreAllMocks();
    const jobs = f.repo.jobs.bind(f.repo);
    vi.spyOn(f.repo, 'jobs').mockImplementation(async (...args) => {
      const data = await jobs(...args);
      data[0].labor!.cash_minor = 1;
      return data;
    });
    expect(await f.reader.read(f.scope, f.actor)).toMatchObject({
      status: 'UNKNOWN',
      totals: null,
    });
  });
  it('pins detached scope before awaits and rejects non-UUID source references', async () => {
    const f = await fixture(),
      original = f.scope.jobId;
    const pending = f.reader.read(f.scope, f.actor);
    f.scope.jobId = crypto.randomUUID();
    expect((await pending).scope.jobId).toBe(original);
    f.input.scope.jobId = original;
    f.input.job.events[0].id = 'private arbitrary reference';
    expect(() => project(f.input)).toThrow();
  });
  it('rejects duplicate labor source rows and preserves canonical integer boundary behavior', async () => {
    const f = await fixture();
    await f.repo.payroll(
      f.org,
      '2026-10-04T05:00:00Z',
      '2026-10-11T05:00:00Z',
      {},
      true,
    );
    f.scope.jobRevision = (await f.repo.jobs(f.org))[0].lock_revision;
    const workforce = f.repo.workforce.bind(f.repo);
    vi.spyOn(f.repo, 'workforce').mockImplementation(async (...args) => {
      const data = await workforce(...args);
      data.periods[0].snapshot!.rows.push(
        structuredClone(data.periods[0].snapshot!.rows[0]),
      );
      return data;
    });
    expect(await f.reader.read(f.scope, f.actor)).toMatchObject({
      status: 'UNKNOWN',
      totals: null,
    });
    const input = structuredClone(f.input);
    input.scope.jobRevision = input.job.lock_revision;
    input.job.expenses = [];
    input.job.events = [];
    for (const line of input.issued.payload.lines) line.unit_price_minor = 0;
    input.issued.payload.lines[0].fixed_markup_minor = 1;
    input.issued.calculation = calculateEstimate(input.issued.payload, 0);
    input.job.baseline = baselineFromEstimate(
      input.issued.id,
      input.issued.payload,
      input.issued.calculation,
    );
    for (const category of Object.keys(
      input.job.projection.remaining,
    ) as (keyof typeof input.job.projection.remaining)[])
      input.job.projection.remaining[category] = 0;
    input.job.projection.remaining.other = 9e12;
    const result = project(input);
    expect(result.totals?.projectedCostMinor).toBe(9e12);
    expect(result.totals?.projectedContributionMinor).toBe(1 - 9e12);
    expect(result.totals?.projectedMarginBps).toBeNull();
  });
  it('detaches only allowlisted facts, never executes accessors and never freezes source objects', async () => {
    const f = await fixture();
    const result = project(f.input),
      before = result.categories[0].recordedMinor;
    f.job.expenses[0].amount_minor++;
    expect(result.categories[0].recordedMinor).toBe(before);
    expect(Object.isFrozen(f.input)).toBe(false);
    const getter = vi.fn(() => 'private');
    Object.defineProperty(f.input.scope, 'private', {
      get: getter,
      enumerable: true,
    });
    expect(() => project(f.input)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});
