import { expect, it, vi } from 'vitest';
import { jobChangeApprovalPreflight } from '../../src/components/phase3/job-change-approval';
import { sampleCompanies } from '../../src/domain/platform';
import { jobFinancials } from '../../src/domain/jobs/financials';
import { prototypeFixture } from '../program/prototype-fixture';

async function fixture(index = 0, cost = 1000) {
  const f = await prototypeFixture(sampleCompanies[index], true);
  const jobId = f.target.job_id!;
  await f.repo.proposeChange(f.company.id, jobId, {
    description: 'Synthetic original-source scope proposal',
    revenue_minor: 2000,
    cost_minor: cost,
    category: 'materials',
    status: 'proposed',
  });
  const read = async () =>
    (await f.repo.jobs(f.company.id)).find((job) => job.id === jobId)!;
  const before = await read(),
    change = before.changes.at(-1)!;
  const approve = (reference: string) => {
    jobChangeApprovalPreflight(
      f.company.id,
      before,
      f.repo.syntheticJob(f.company.id, jobId),
      change.id,
      reference,
    );
    return f.repo.approveChange(f.company.id, jobId, change.id, reference);
  };
  return { ...f, jobId, read, before, change, approve };
}

it('approval control refuses aggregate overflow before the pinned writer, preserving saved proposal and forecast', async () => {
  const f = await fixture(0, 9e12),
    writer = vi.spyOn(f.repo, 'approveChange');
  expect(f.before.projection.remaining.materials).toBeGreaterThan(0);
  expect(() => f.approve('Synthetic explicit approval')).toThrow(/limits/);
  expect(writer).not.toHaveBeenCalled();
  expect(await f.read()).toEqual(f.before);
  expect(jobFinancials(await f.read())).toEqual(jobFinancials(f.before));
});

it.each([0, 1, 2])(
  'brand %i original control approves once and reopens the canonical revised budget',
  async (index) => {
    const f = await fixture(index),
      original = jobFinancials(f.before);
    await f.approve('Synthetic explicit approval');
    const reopened = await f.read();
    expect(reopened.baseline).toEqual(f.before.baseline);
    expect(
      reopened.changes.find((change) => change.id === f.change.id),
    ).toMatchObject({
      status: 'approved',
      authorization_reference: 'Synthetic explicit approval',
      cost_minor: 1000,
    });
    expect(reopened.projection.remaining.materials).toBe(
      f.before.projection.remaining.materials + 1000,
    );
    expect(reopened.lock_revision).toBe(f.before.lock_revision + 1);
    const revised = jobFinancials(reopened);
    expect(revised.revised_revenue_minor).toBe(
      original.revised_revenue_minor + 2000,
    );
    expect(revised.projected_cost_minor).toBe(
      original.projected_cost_minor + 1000,
    );
    expect(() => f.approve('Repeat')).toThrow(/changed/);
    expect(await f.read()).toEqual(reopened);
  },
);

it('concurrent control confirmations have one winner without duplicate budget propagation', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    Promise.resolve().then(() => f.approve('Synthetic approval1')),
    Promise.resolve().then(() => f.approve('Synthetic approval2')),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1,
  );
  expect((await f.read()).projection.remaining.materials).toBe(
    f.before.projection.remaining.materials + 1000,
  );
});

it('control rejects foreign, missing, stale or replaced job evidence and missing authorization', async () => {
  const f = await fixture();
  const current = f.repo.syntheticJob(f.company.id, f.jobId)!;
  for (const changed of [
    null,
    { ...current, organization_id: sampleCompanies[1].id },
    { ...current, id: crypto.randomUUID() },
    { ...current, lock_revision: current.lock_revision + 1 },
    {
      ...current,
      baseline: { ...current.baseline, issued_version_id: crypto.randomUUID() },
    },
  ])
    expect(() =>
      jobChangeApprovalPreflight(
        f.company.id,
        f.before,
        changed,
        f.change.id,
        'Synthetic',
      ),
    ).toThrow(/changed/);
  expect(() =>
    jobChangeApprovalPreflight(
      sampleCompanies[1].id,
      f.before,
      current,
      f.change.id,
      'Synthetic',
    ),
  ).toThrow(/changed/);
  expect(() => f.approve(' ')).toThrow(/authorization/);
  expect(await f.read()).toEqual(f.before);
});
