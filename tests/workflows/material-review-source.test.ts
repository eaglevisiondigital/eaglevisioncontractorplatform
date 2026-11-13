import { expect, it, vi } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { PropertyRepository } from '../../src/lib/property';
import { sampleCompanies } from '../../src/domain/platform';
import { jobFinancials } from '../../src/domain/jobs/financials';
import { reviewCurrentMaterial } from '../../src/components/property/material-review-source';
async function fixture() {
  const org = sampleCompanies[0].id,
    repo = new PropertyRepository(new Operations(true));
  await repo.initialize(sampleCompanies[0]);
  const job = (await repo.estimates.jobs(org))[0],
    expense = job.expenses.find(
      (e) => e.kind === 'payment' && e.category === 'materials',
    )!;
  const input = {
    disposition: 'proposed' as const,
    reason: 'Original reviewed fictional purchase',
    scope_line_id: null,
    pricing: { mode: 'pass_through' as const, value: 0 },
    presentation: 'package' as const,
    description: 'Fictional supplemental proposal',
  };
  const writer = vi.spyOn(repo, 'decide');
  const run = (displayed = job, current = () => true) =>
    reviewCurrentMaterial(repo, org, displayed, expense.id, [], input, current);
  const credit = async () => {
    const id = String(
      await repo.estimates.submitExpense(org, job.id, {
        ...expense,
        kind: 'credit',
        amount_minor: 1000,
        reference: crypto.randomUUID(),
        adjusts_expense_id: expense.id,
      }),
    );
    await repo.estimates.reviewExpense(
      org,
      job.id,
      id,
      'approved',
      'Fictional reviewed return',
    );
  };
  return { org, repo, job, expense, input, writer, run, credit };
}
it('denies stale approved-credit repricing without any review or proposal write', async () => {
  const f = await fixture();
  await f.credit();
  const before = f.repo.read(f.org),
    jobs = await f.repo.estimates.jobs(f.org);
  await expect(f.run()).rejects.toThrow(/source changed/);
  expect(f.writer).not.toHaveBeenCalled();
  expect(f.repo.read(f.org)).toEqual(before);
  expect(await f.repo.estimates.jobs(f.org)).toEqual(jobs);
});
it('explicit refreshed review saves/reopens corrected proposal and preserves approved revenue and costs', async () => {
  const f = await fixture();
  await f.credit();
  const current = (await f.repo.estimates.jobs(f.org)).find(
      (j) => j.id === f.job.id,
    )!,
    before = jobFinancials(current);
  const result = await f.run(current),
    reopened = f.repo.read(f.org).decisions.find((d) => d.id === result.id)!;
  expect(reopened).toEqual(result);
  expect(result.selling_minor).toBe(f.expense.amount_minor - 1000);
  const job = (await f.repo.estimates.jobs(f.org)).find(
    (j) => j.id === f.job.id,
  )!;
  expect(job.changes.find((c) => c.id === result.change_id)).toMatchObject({
    status: 'proposed',
    revenue_minor: result.selling_minor,
    cost_minor: 0,
  });
  expect(jobFinancials(job).revised_revenue_minor).toBe(
    before.revised_revenue_minor,
  );
  expect(jobFinancials(job).categories.map((c) => c.paid_minor)).toEqual(
    before.categories.map((c) => c.paid_minor),
  );
});
it('denies a changed canonical review revision before the writer', async () => {
  const f = await fixture();
  await f.repo.decide(f.org, f.job.id, f.expense.id, 0, {
    ...f.input,
    disposition: 'deferred',
  });
  f.writer.mockClear();
  await expect(f.run()).rejects.toThrow(/source changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it.each(['crm', 'estimates'] as const)(
  'denies revoked %s review permission',
  async (field) => {
    const f = await fixture(),
      access = await f.repo.operations.companyAccess(f.org);
    vi.spyOn(f.repo.operations, 'companyAccess').mockResolvedValue({
      ...access,
      [field]: false,
    });
    await expect(f.run()).rejects.toThrow(/access required/);
    expect(f.writer).not.toHaveBeenCalled();
  },
);
it('denies navigation/edit context changes while the permission read awaits', async () => {
  const f = await fixture(),
    access = await f.repo.operations.companyAccess(f.org);
  let current = true;
  vi.spyOn(f.repo.operations, 'companyAccess').mockImplementation(async () => {
    current = false;
    return access;
  });
  await expect(f.run(f.job, () => current)).rejects.toThrow(/context changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('rejects foreign displayed tenant without rebinding its expense', async () => {
  const f = await fixture();
  await expect(
    f.run({ ...f.job, organization_id: sampleCompanies[1].id }),
  ).rejects.toThrow(/source changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('reuses canonical concurrent-review exclusion to produce one change and one receipt', async () => {
  const f = await fixture(),
    results = await Promise.allSettled([f.run(), f.run()]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(
    f.repo.read(f.org).decisions.filter((d) => d.expense_id === f.expense.id),
  ).toHaveLength(1);
  const after = (await f.repo.estimates.jobs(f.org)).find(
    (j) => j.id === f.job.id,
  )!;
  expect(after.changes).toHaveLength(f.job.changes.length + 1);
});
it('keeps submitted input and displayed source snapshots immutable across the permission await', async () => {
  const f = await fixture(),
    access = await f.repo.operations.companyAccess(f.org),
    reason = f.input.reason;
  vi.spyOn(f.repo.operations, 'companyAccess').mockImplementation(async () => {
    f.input.reason = 'Changed after submission';
    f.input.pricing.value = 999;
    return access;
  });
  const result = await f.run();
  expect(result.reason).toBe(reason);
  expect(result.pricing.value).toBe(0);
});
it('the original sample reader captures an immutable source before returning its promise', async () => {
  const f = await fixture(),
    pending = f.repo.estimates.jobs(f.org);
  await f.credit();
  const captured = await pending,
    current = await f.repo.estimates.jobs(f.org);
  expect(captured.find((j) => j.id === f.job.id)).toEqual(f.job);
  expect(current.find((j) => j.id === f.job.id)?.expenses.length).toBe(
    f.job.expenses.length + 1,
  );
  expect(f.writer).not.toHaveBeenCalled();
});
it.each(['before', 'during'] as const)(
  'rejects overridden delayed reader %s permission read without dispatch or credit mutation',
  async (timing) => {
    const f = await fixture(),
      original = f.repo.estimates.jobs,
      access = await f.repo.operations.companyAccess(f.org);
    const delayed = vi.fn(async (...args: Parameters<typeof original>) => {
      await f.credit();
      return original.apply(f.repo.estimates, args);
    });
    if (timing === 'before') f.repo.estimates.jobs = delayed;
    else
      vi.spyOn(f.repo.operations, 'companyAccess').mockImplementation(
        async () => {
          f.repo.estimates.jobs = delayed;
          return access;
        },
      );
    await expect(f.run()).rejects.toThrow(/Original local job reader/);
    expect(delayed).not.toHaveBeenCalled();
    expect(f.writer).not.toHaveBeenCalled();
    expect(
      (await original.call(f.repo.estimates, f.org)).find(
        (j) => j.id === f.job.id,
      ),
    ).toEqual(f.job);
  },
);
