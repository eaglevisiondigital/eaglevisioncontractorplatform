import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import {
  jobFinancials,
  type Expense,
  type Job,
} from '../../src/domain/jobs/financials';
import {
  expenseReviewPreflight,
  expenseReviewAttempted,
  reviewSampleExpense,
} from '../../src/components/phase3/expense-management-review';
import { prototypeFixture } from '../program/prototype-fixture';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0, kind: Expense['kind'] = 'commitment') {
  const f = await prototypeFixture(sampleCompanies[index], true);
  const jobId = f.target.job_id!;
  const id = await f.repo.submitExpense(f.company.id, jobId, {
    purchase_key: 'REVIEW-PO',
    supplier: 'Review supplier',
    reference: 'REVIEW-DOC',
    description: 'Submitted material evidence',
    category: 'materials',
    kind,
    amount_minor: 12345,
    estimate_line_id: null,
    quantity_milli: null,
    unit: null,
    unit_cost_minor: null,
    document_ids: [],
    material_approval_id: null,
  });
  const read = () => f.repo.syntheticJob(f.company.id, jobId)!;
  const job = read();
  const run = (
    decision: 'approved' | 'rejected' = 'approved',
    reason = 'Supplier document checked against original submission',
    admin = true,
    confirmed = true,
  ) =>
    reviewSampleExpense(
      f.repo,
      f.company.id,
      job,
      id,
      admin,
      decision,
      reason,
      confirmed,
    );
  return { ...f, job, id, read, run };
}
it.each([0, 1, 2])(
  'brand %i approves original evidence and reopens append-only review with exact cost propagation',
  async (index) => {
    const f = await fixture(index);
    const before = jobFinancials(f.job);
    await f.run();
    const reopened = (await f.repo.jobs(f.company.id)).find(
      (j) => j.id === f.job.id,
    )!;
    expect(reopened.expenses).toEqual(f.job.expenses);
    expect(reopened.baseline).toEqual(f.job.baseline);
    expect(reopened.events).toHaveLength(f.job.events.length + 1);
    expect(reopened.events.at(-1)).toMatchObject({
      submission_id: f.id,
      decision: 'approved',
      reason: 'Supplier document checked against original submission',
    });
    expect(reopened.events.at(-1)?.created_at).toBeTruthy();
    expect(reopened.lock_revision).toBe(f.job.lock_revision + 1);
    const after = jobFinancials(reopened);
    expect(after.projected_cost_minor - before.projected_cost_minor).toBe(
      12345,
    );
    expect(after.projected_profit_minor).toBe(
      before.projected_profit_minor - 12345,
    );
    expect(after.revised_revenue_minor).toBe(before.revised_revenue_minor);
    expect(
      after.categories.find((c) => c.category === 'materials')?.paid_minor,
    ).toBe(0);
    expect(after.complete).toBe(false);
    expect(() => f.run()).toThrow(/already attempted/);
    await expect(
      f.repo.reviewExpense(f.company.id, f.job.id, f.id, 'rejected', 'replace'),
    ).rejects.toThrow(/Review unavailable/);
    expect(f.read()).toEqual(reopened);
  },
);
it('rejection preserves submission and costs, with an actual retained correction reason', async () => {
  const f = await fixture();
  const costs = jobFinancials(f.job);
  await f.run(
    'rejected',
    '  Missing supplier document; submit corrected evidence separately.  ',
  );
  expect(f.read().expenses).toEqual(f.job.expenses);
  expect(f.read().events.at(-1)?.reason).toBe(
    'Missing supplier document; submit corrected evidence separately.',
  );
  expect(jobFinancials(f.read())).toEqual(costs);
});
it('requires management permission, explicit confirmation and a bounded nonblank reason before invoking writer', async () => {
  const f = await fixture();
  const spy = vi.spyOn(f.repo, 'reviewExpense');
  for (const run of [
    () => f.run('approved', 'Reason', false),
    () => f.run('approved', 'Reason', true, false),
    () => f.run('approved', '  '),
    () => f.run('approved', 'x'.repeat(2001)),
  ])
    expect(run).toThrow();
  expect(spy).not.toHaveBeenCalled();
  expect(expenseReviewAttempted(f.repo, f.company.id, f.job.id, f.id)).toBe(
    false,
  );
  expect(f.read()).toEqual(f.job);
});
it('denies stale job revisions after an intervening projection write without consuming a review', async () => {
  const f = await fixture();
  await f.repo.projection(f.company.id, f.job, { ...f.job.projection });
  expect(() => f.run()).toThrow(/changed/);
  expect(expenseReviewAttempted(f.repo, f.company.id, f.job.id, f.id)).toBe(
    false,
  );
  expect(f.read().events).toEqual(f.job.events);
});
it('denies tenant, job, baseline and original expense mismatches and already reviewed records', async () => {
  const f = await fixture();
  const pre =
    (displayed: Job, current: Job | null, org = f.company.id) =>
    () =>
      expenseReviewPreflight(
        org,
        displayed,
        current,
        f.id,
        true,
        'approved',
        'Checked',
        true,
      );
  expect(pre(f.job, f.job, sampleCompanies[1].id)).toThrow();
  expect(pre(f.job, null)).toThrow();
  expect(pre(f.job, { ...f.job, id: 'foreign' })).toThrow();
  expect(
    pre(f.job, {
      ...f.job,
      baseline: { ...f.job.baseline, issued_version_id: 'other' },
    }),
  ).toThrow();
  const changed = structuredClone(f.job);
  changed.expenses.find((e) => e.id === f.id)!.amount_minor++;
  expect(pre(f.job, changed)).toThrow();
  await f.run();
  expect(pre(f.read(), f.read())).toThrow();
});
it('two independent review forms have one winner through shared attempt custody and original duplicate controls', async () => {
  const f = await fixture();
  const first = f.run();
  expect(() =>
    reviewSampleExpense(
      f.repo,
      f.company.id,
      f.job,
      f.id,
      true,
      'rejected',
      'Concurrent review',
      true,
    ),
  ).toThrow(/already attempted/);
  await first;
  expect(f.read().events.filter((e) => e.submission_id === f.id)).toHaveLength(
    1,
  );
});
it('invalid credit approval fails preflight atomically and can instead be rejected with reason', async () => {
  const f = await fixture(0, 'credit');
  expect(() => f.run()).toThrow(/Credit exceeds/);
  expect(f.read()).toEqual(f.job);
  expect(expenseReviewAttempted(f.repo, f.company.id, f.job.id, f.id)).toBe(
    false,
  );
  await f.run('rejected', 'Credit has no corresponding recorded payment');
  expect(f.read().events.at(-1)?.decision).toBe('rejected');
});
it.each([false, true])(
  'lost acknowledgement (committed=%s) holds exact submission without replay',
  async (committed) => {
    const f = await fixture();
    const original = f.repo.reviewExpense.bind(f.repo);
    const spy = vi
      .spyOn(f.repo, 'reviewExpense')
      .mockImplementation(async (...args) => {
        if (committed) await original(...args);
        throw Error('Lost acknowledgement');
      });
    await expect(f.run()).rejects.toThrow(/Lost acknowledgement/);
    expect(() => f.run()).toThrow(/exact read only/);
    expect(spy).toHaveBeenCalledTimes(1);
    const exact = (await f.repo.jobs(f.company.id)).find(
      (j) => j.id === f.job.id,
    )!;
    expect(exact.events.filter((e) => e.submission_id === f.id)).toHaveLength(
      committed ? 1 : 0,
    );
    expect(exact.expenses).toEqual(f.job.expenses);
  },
);
it('sample-only UI operation never enters connected RPC', async () => {
  const f = await fixture();
  const spy = vi.spyOn(f.repo, 'reviewExpense');
  expect(() =>
    reviewSampleExpense(
      { ...f.repo, sample: false } as typeof f.repo,
      f.company.id,
      f.job,
      f.id,
      true,
      'approved',
      'Checked',
      true,
    ),
  ).toThrow(/sample/);
  expect(spy).not.toHaveBeenCalled();
});
