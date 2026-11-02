import { describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { LocalJobMarginReader } from '../src/lib/job-margin-analysis';
import {
  projectLocalJobMargin,
  type MarginScope,
  parseLocalMarginPercent,
  formatMarginBps,
  type MarginReviewInput,
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

describe('Cycle4 existing-engine warning review', () => {
  it.each([0, 1, 2])(
    'binds warnings to actual saved job revision and canonical thresholds for company %i',
    async (index) => {
      const f = await fixture(index),
        before = await f.repo.jobs(f.org);
      const projection = structuredClone(f.job.projection);
      projection.remaining.materials += f.job.baseline.costs.materials;
      projection.overrun_bps = 1500;
      projection.erosion_bps = 250;
      await f.repo.projection(f.org, f.job, projection);
      const job = (await f.repo.jobs(f.org))[0],
        canonical = jobFinancials(job);
      f.scope.jobRevision = job.lock_revision;
      const result = await f.reader.read(f.scope, f.actor, {
        minimumMarginBps: 5000,
        confirmed: true,
      });
      expect(result.scope.issuedVersionId).toBe(
        before[0].baseline.issued_version_id,
      );
      expect(result.warningReview.sourceThresholds).toEqual({
        categoryOverrunBps: 1500,
        marginErosionBps: 250,
      });
      expect(result.warningReview.aboveBudgetCategories).toEqual(
        canonical.categories
          .filter((c) => c.projected_minor > c.budget_minor)
          .map((c) => ({ category: c.category, thresholdExceeded: c.overrun })),
      );
      expect(result.warningReview.negativeContribution).toBe(
        canonical.projected_profit_minor < 0,
      );
      expect(result.warningReview.erosionThresholdExceeded).toBe(
        canonical.profit_erosion,
      );
      expect(result.warningReview.minimumMargin?.assessment).toBe(
        canonical.projected_margin_bps < 5000
          ? 'BELOW_INPUT'
          : 'AT_OR_ABOVE_INPUT',
      );
      expect(await f.repo.jobs(f.org)).toEqual([job]);
      expect(
        (await f.repo.history(f.org, f.scope.estimateId)).find(
          (v) => v.id === f.issued.id,
        ),
      ).toEqual(f.issued);
    },
  );
  it('distinguishes positive category variance at the exact saved threshold from exceeding it', async () => {
    const f = await fixture(),
      input = structuredClone(f.input);
    input.job.expenses = [];
    input.job.events = [];
    const budget = input.job.baseline.costs.materials;
    input.job.projection.overrun_bps = 1000;
    const cutoff = budget + Number((BigInt(budget) * 1000n) / 10000n);
    input.job.projection.remaining.materials = cutoff;
    expect(project(input).warningReview.aboveBudgetCategories).toContainEqual({
      category: 'materials',
      thresholdExceeded: false,
    });
    input.job.projection.remaining.materials++;
    expect(project(input).warningReview.aboveBudgetCategories).toContainEqual({
      category: 'materials',
      thresholdExceeded: true,
    });
    expect(project(input).categories[0].overrun).toBe(
      jobFinancials(input.job).categories[0].overrun,
    );
  });
  it('handles a zero category budget as unplanned projected cost without inventing a percent variance', async () => {
    const f = await fixture(),
      input = structuredClone(f.input);
    expect(input.job.baseline.costs.other).toBe(0);
    input.job.projection.remaining.other = 1;
    const result = project(input);
    expect(result.warningReview.aboveBudgetCategories).toContainEqual({
      category: 'other',
      thresholdExceeded: true,
    });
    expect(
      result.categories.find((r) => r.category === 'other')?.varianceMinor,
    ).toBe(1);
    expect(JSON.stringify(result.warningReview)).not.toMatch(
      /Infinity|NaN|variancePercent/,
    );
  });
  it('compares an exact canonical margin floor without rounding the decision or changing the saved policy', async () => {
    const f = await fixture(),
      margin = jobFinancials(f.job).projected_margin_bps;
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeLessThan(10000);
    const before = await f.repo.jobs(f.org);
    const at = await f.reader.read(f.scope, f.actor, {
      minimumMarginBps: margin,
      confirmed: true,
    });
    expect(at.warningReview.minimumMargin?.assessment).toBe(
      'AT_OR_ABOVE_INPUT',
    );
    const above = await f.reader.read(f.scope, f.actor, {
      minimumMarginBps: margin + 1,
      confirmed: true,
    });
    expect(above.warningReview.minimumMargin?.assessment).toBe('BELOW_INPUT');
    expect(at.totals).toEqual(above.totals);
    expect(at.warningReview.sourceThresholds).toEqual(
      above.warningReview.sourceThresholds,
    );
    expect(await f.repo.jobs(f.org)).toEqual(before);
    expect(Object.isFrozen(at.warningReview.minimumMargin)).toBe(true);
  });
  it('pins confirmed primitive review input before asynchronous reads and resets only by an explicit separate read', async () => {
    const f = await fixture(),
      review: MarginReviewInput = { minimumMarginBps: 2500, confirmed: true };
    const pending = f.reader.read(f.scope, f.actor, review);
    review.minimumMarginBps = 9900;
    expect((await pending).warningReview.minimumMargin?.basisPoints).toBe(2500);
    expect(
      (await f.reader.read(f.scope, f.actor)).warningReview.minimumMargin,
    ).toBeNull();
  });
  it.each([
    { minimumMarginBps: -1, confirmed: true },
    { minimumMarginBps: 10001, confirmed: true },
    { minimumMarginBps: 0.1, confirmed: true },
    { minimumMarginBps: Number.MAX_SAFE_INTEGER + 1, confirmed: true },
    { minimumMarginBps: 2500, confirmed: false },
    { minimumMarginBps: '2500', confirmed: true },
    { minimumMarginBps: 2500, confirmed: true, companyPolicy: true },
  ])(
    'rejects an unconfirmed, coerced or out-of-bounds floor %#',
    async (review) => {
      const f = await fixture();
      await expect(
        f.reader.read(f.scope, f.actor, review as MarginReviewInput),
      ).rejects.toThrow(/review input/);
    },
  );
  it('retains UNKNOWN for missing evidence while preserving only the unavailable local-input assessment', async () => {
    const f = await fixture(),
      review: MarginReviewInput = { minimumMarginBps: 2500, confirmed: true };
    const result = projectLocalJobMargin(
      { ...f.input, job: null, review },
      { enabled: true },
    );
    expect(result).toMatchObject({
      status: 'UNKNOWN',
      totals: null,
      categories: [],
      warningReview: {
        availability: 'UNAVAILABLE',
        sourceThresholds: null,
        negativeContribution: null,
        erosionThresholdExceeded: null,
        aboveBudgetCategories: [],
        minimumMargin: { assessment: 'UNAVAILABLE' },
      },
    });
  });
  it('keeps negative contribution visible but withholds zero-revenue margin and erosion assessments', async () => {
    const f = await fixture(),
      input = structuredClone(f.input);
    for (const line of input.issued.payload.lines) line.unit_price_minor = 0;
    input.issued.calculation = calculateEstimate(input.issued.payload, 0);
    input.job.baseline = baselineFromEstimate(
      input.issued.id,
      input.issued.payload,
      input.issued.calculation,
    );
    const result = projectLocalJobMargin(
      { ...input, review: { minimumMarginBps: 0, confirmed: true } },
      { enabled: true },
    );
    expect(result.totals?.projectedMarginBps).toBeNull();
    expect(result.warningReview).toMatchObject({
      negativeContribution: true,
      erosionThresholdExceeded: null,
      minimumMargin: { assessment: 'UNAVAILABLE' },
    });
    expect(result.status).toBe('PARTIAL');
  });
  it('withholds unsafe canonical ratios while keeping exact safe minor-unit contribution and a negative warning', async () => {
    const f = await fixture(),
      input = structuredClone(f.input);
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
    const result = projectLocalJobMargin(
      { ...input, review: { minimumMarginBps: 5000, confirmed: true } },
      { enabled: true },
    );
    expect(result.totals?.projectedContributionMinor).toBe(1 - 9e12);
    expect(result.totals?.projectedMarginBps).toBeNull();
    expect(result.warningReview).toMatchObject({
      negativeContribution: true,
      erosionThresholdExceeded: null,
      minimumMargin: { assessment: 'UNAVAILABLE' },
    });
  });
  it('withholds erosion for zero original revenue after an exact approved revenue change supports a current ratio', async () => {
    const f = await fixture(),
      input = structuredClone(f.input);
    input.job.expenses = [];
    input.job.events = [];
    for (const line of input.issued.payload.lines) {
      line.unit_price_minor = 0;
      line.unit_cost_minor = 0;
      line.fixed_markup_minor = 0;
    }
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
    input.job.changes = [
      {
        id: crypto.randomUUID(),
        category: 'other',
        description: 'Synthetic approved source boundary',
        status: 'approved',
        cost_minor: 0,
        revenue_minor: 9e12,
        authorization_reference: 'Synthetic exact authorization fixture',
      },
    ];
    const result = project(input);
    expect(result.totals?.projectedMarginBps).toBe(10000);
    expect(result.totals?.profitErosion).toBeNull();
    expect(result.warningReview.erosionThresholdExceeded).toBeNull();
    expect(result.totals?.projectedContributionMinor).toBe(
      jobFinancials(input.job).projected_profit_minor,
    );
  });
  it.each([0, 1, 2])(
    'rejects an actual owner/admin-to-estimator downgrade immediately after the job read for company %i',
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
      const jobs = f.repo.jobs.bind(f.repo),
        history = vi.spyOn(f.repo, 'history');
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
        f.reader.read(f.scope, actor, {
          minimumMarginBps: 2500,
          confirmed: true,
        }),
      ).rejects.toThrow(/eligible/);
      expect(history).not.toHaveBeenCalled();
    },
  );
  it('rechecks membership after an awaited current CRM page instead of trusting cached financial classification', async () => {
    const f = await fixture(),
      actor = `${f.org}-estimator`;
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    const customers = f.operations.listCustomers.bind(f.operations);
    vi.spyOn(f.operations, 'listCustomers').mockImplementation(
      async (...args) => {
        const result = await customers(...args);
        await f.operations.manageMember(
          f.org,
          actor,
          false,
          'admin',
          'office_manager',
        );
        return result;
      },
    );
    await expect(f.reader.read(f.scope, actor)).rejects.toThrow(/eligible/);
  });
  it('keeps floor evidence scoped to one currency and source version, never exposing internal notes or contact data', async () => {
    const f = await fixture(),
      before = structuredClone(f.issued);
    const result = await f.reader.read(f.scope, f.actor, {
      minimumMarginBps: 2500,
      confirmed: true,
    });
    await expect(
      f.reader.read({ ...f.scope, currency: 'CAD' }, f.actor, {
        minimumMarginBps: 2500,
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(JSON.stringify(result.warningReview)).not.toMatch(
      /unit_cost|supplier|payroll|worker|note|email|phone|address|cash_hour|deduction/,
    );
    expect(f.issued).toEqual(before);
  });
  it.each(['0', '0.01', '25.50', '100.00'])(
    'parses exact local percent input %s without floats',
    (text) => {
      const expected = { '0': 0, '0.01': 1, '25.50': 2550, '100.00': 10000 };
      expect(parseLocalMarginPercent(text)).toBe(
        expected[text as keyof typeof expected],
      );
    },
  );
  it.each([
    '',
    '01',
    '.25',
    '1e2',
    '25.555',
    '-1',
    '100.01',
    'Infinity',
    '25%',
  ])('rejects invalid percent input %s', (text) => {
    expect(() => parseLocalMarginPercent(text)).toThrow(/percentage/);
  });
  it('formats exact negative and large integer ratios without rounding away basis points', () => {
    expect(formatMarginBps(-1)).toBe('-0.01%');
    expect(formatMarginBps(0)).toBe('0.00%');
    expect(formatMarginBps(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91%');
    expect(formatMarginBps(-Number.MAX_SAFE_INTEGER)).toBe(
      '-90071992547409.91%',
    );
    expect(() => formatMarginBps(0.5)).toThrow(/unavailable/);
  });
});
