import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import type { MarginScope } from '../src/domain/jobs/margin-analysis';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { LocalJobMarginReader } from '../src/lib/job-margin-analysis';
import {
  readProfitGuardReview,
  verifyProfitGuardReview,
} from '../src/lib/profit-guard';

afterEach(() => vi.restoreAllMocks());
async function fixture(brand = 0) {
  const company = sampleCompanies[brand],
    org = company.id,
    operations = new Operations(true),
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  const job = (await repo.jobs(org))[0],
    estimate = (await repo.list(org))[0],
    issued = (await repo.history(org, estimate.id)).find(
      (version) => version.id === job.baseline.issued_version_id,
    )!,
    scope: MarginScope = {
      organizationId: org,
      jobId: job.id,
      jobRevision: job.lock_revision,
      estimateId: estimate.id,
      issuedVersionId: issued.id,
      customerId: issued.payload.customer_id,
      propertyId: issued.payload.location_id,
      currency: job.baseline.currency,
    },
    workforce = await repo.workforce(org),
    worker = workforce.workers[1],
    reader = new LocalJobMarginReader(repo, true),
    admission = { enabled: true, confirmed: true },
    actor = `${org}-owner`;
  async function record(overhead = false) {
    const id = await repo.recordTime(org, worker.id, {
      job_id: overhead ? null : job.id,
      overhead_center: overhead ? 'synthetic-review-only' : null,
      task: 'Explicit source-bound completeness review',
      kind: 'work',
      started_at: '2099-06-05T08:00:00-05:00',
      ended_at: '2099-06-05T09:00:00-05:00',
      billable: false,
      corrects_id: null,
    });
    if (typeof id !== 'string') throw Error('Exact native time ID required');
    return id;
  }
  return {
    org,
    job,
    repo,
    operations,
    scope,
    reader,
    admission,
    actor,
    record,
    read: () => readProfitGuardReview(reader, scope, actor, admission),
  };
}

it.each([0, 1, 2])(
  'brand %i approved unposted labor changes retained completeness even when the canonical job and posted totals do not change',
  async (brand) => {
    const f = await fixture(brand),
      review = await f.read(),
      frozen = JSON.stringify(review),
      jobBefore = f.repo.syntheticJob(f.org, f.job.id)!,
      totals = jobFinancials(jobBefore),
      id = await f.record();
    await f.repo.submitTime(f.org, id);
    await f.repo.reviewTime(
      f.org,
      id,
      'approved',
      'Synthetic staff review only',
    );
    const current = await f.read();
    expect(current.completion.coverage!.unpostedApprovedTime).toBe(
      review.completion.coverage!.unpostedApprovedTime + 1,
    );
    expect(f.repo.syntheticJob(f.org, f.job.id)).toEqual(jobBefore);
    expect(jobFinancials(f.repo.syntheticJob(f.org, f.job.id)!)).toEqual(
      totals,
    );
    expect(current.profitability).toEqual(review.profitability);
    expect(await verifyProfitGuardReview(review)).toEqual({
      status: 'STALE',
      replacement: null,
      workforce: 'UNKNOWN',
    });
    expect(await verifyProfitGuardReview(current)).toMatchObject({
      status: 'CURRENT_JOB_SOURCE',
      workforce: 'UNKNOWN',
    });
    expect(JSON.stringify(review)).toBe(frozen);
    expect(current.completion.providerEvidence.settlementStatus).toBe(
      'UNKNOWN',
    );
    expect(
      Object.values(current.authority).every((value) => value === false),
    ).toBe(true);
  },
);

it.each([0, 1, 2])(
  'brand %i an actual unsubmitted task makes prior unresolved-time completeness stale without posting cost',
  async (brand) => {
    const f = await fixture(brand),
      review = await f.read();
    await f.record();
    const current = await f.read();
    expect(current.completion.coverage!.unresolvedTime).toBe(
      review.completion.coverage!.unresolvedTime + 1,
    );
    expect(current.completion.totals).toEqual(review.completion.totals);
    await expect(verifyProfitGuardReview(review)).resolves.toMatchObject({
      status: 'STALE',
      replacement: null,
      workforce: 'UNKNOWN',
    });
  },
);

it('an unrelated overhead time record does not substitute another source or stale unchanged selected-job completion', async () => {
  const f = await fixture(),
    review = await f.read();
  await f.record(true);
  const current = await f.read();
  expect(current.completion).toEqual(review.completion);
  await expect(verifyProfitGuardReview(review)).resolves.toEqual({
    status: 'CURRENT_JOB_SOURCE',
    replacement: null,
    workforce: 'UNKNOWN',
  });
});

it('withdrawn confirmation across the original verification await returns UNKNOWN rather than a private stale assessment', async () => {
  const f = await fixture(),
    review = await f.read();
  await f.record();
  const pending = verifyProfitGuardReview(review);
  f.admission.confirmed = false;
  await expect(pending).resolves.toEqual({
    status: 'UNKNOWN',
    replacement: null,
    workforce: 'UNKNOWN',
  });
});

it('staff revocation across native reread withholds completeness reconciliation', async () => {
  const f = await fixture(),
    actor = `${f.org}-estimator`;
  await f.operations.manageMember(
    f.org,
    actor,
    true,
    'admin',
    'office_manager',
  );
  const review = await readProfitGuardReview(
      f.reader,
      f.scope,
      actor,
      f.admission,
    ),
    pending = verifyProfitGuardReview(review);
  await f.operations.manageMember(
    f.org,
    actor,
    false,
    'admin',
    'office_manager',
  );
  await expect(pending).resolves.toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
    workforce: 'UNKNOWN',
  });
});

it('a reconstructed review has no original reconciliation authority and performs no native reads', async () => {
  const f = await fixture(),
    review = await f.read(),
    read = vi.spyOn(f.reader, 'readCompletion');
  await expect(
    verifyProfitGuardReview(structuredClone(review)),
  ).resolves.toEqual({
    status: 'UNKNOWN',
    replacement: null,
    workforce: 'UNKNOWN',
  });
  expect(read).not.toHaveBeenCalled();
});

it('actual job-cost revision drift retains its original UNKNOWN classification and cannot be rebound', async () => {
  const f = await fixture(),
    review = await f.read(),
    original = JSON.stringify(review),
    job = f.repo.syntheticJob(f.org, f.job.id)!;
  await f.repo.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 1,
    },
  });
  await expect(verifyProfitGuardReview(review)).resolves.toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
  });
  expect(JSON.stringify(review)).toBe(original);
});

it('a foreign organization actor cannot receive selected-job cost completeness', async () => {
  const f = await fixture(0);
  await expect(
    readProfitGuardReview(
      f.reader,
      f.scope,
      `${sampleCompanies[1].id}-owner`,
      f.admission,
    ),
  ).rejects.toThrow();
});
