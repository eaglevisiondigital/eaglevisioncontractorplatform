import { expect, it, vi } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { Phase3Repository } from '../../src/lib/phase3';
import { sampleCompanies } from '../../src/domain/platform';
import { requireCurrentPayrollSource } from '../../src/components/phase3/payroll-current-source';
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    repo = new Phase3Repository(new Operations(true));
  await repo.initialize(company);
  return { repo, org: company.id, data: await repo.workforce(company.id) };
}
it.each([0, 1, 2])(
  'brand %i authorizes only the unchanged current canonical payroll source, without mutation',
  async (index) => {
    const f = await fixture(index),
      before = await f.repo.workforce(f.org);
    expect(
      await requireCurrentPayrollSource(f.repo, f.org, f.data, () => true),
    ).toEqual(f.data);
    expect(await f.repo.workforce(f.org)).toEqual(before);
  },
);
it('does not read when the displayed role/context is already ineligible', async () => {
  const f = await fixture(),
    spy = vi.spyOn(f.repo, 'workforce');
  await expect(
    requireCurrentPayrollSource(
      f.repo,
      f.org,
      { ...f.data, payroll_admin: false },
      () => true,
    ),
  ).rejects.toThrow(/administration/);
  await expect(
    requireCurrentPayrollSource(f.repo, f.org, f.data, () => false),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('revocation with unchanged row counts denies cached private-source export', async () => {
  const f = await fixture();
  vi.spyOn(f.repo, 'workforce').mockResolvedValue({
    ...f.data,
    payroll_admin: false,
  });
  await expect(
    requireCurrentPayrollSource(f.repo, f.org, f.data, () => true),
  ).rejects.toThrow(/access unavailable/);
});
it('a delayed reader cannot authorize a former component/context', async () => {
  const f = await fixture();
  let current = true,
    release: (() => void) | undefined;
  vi.spyOn(f.repo, 'workforce').mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return f.data;
  });
  const pending = requireCurrentPayrollSource(
    f.repo,
    f.org,
    f.data,
    () => current,
  );
  current = false;
  release!();
  await expect(pending).rejects.toThrow(/context changed/);
});
it.each([
  'rates',
  'entries',
  'reviews',
  'periods',
  'workers',
  'policy',
] as const)('changed %s invalidates the retained preparation', async (key) => {
  const f = await fixture(),
    changed = structuredClone(f.data);
  if (key === 'policy')
    changed.policy = {
      ...changed.policy!,
      overtime_after_seconds: changed.policy!.overtime_after_seconds + 1,
    } as typeof changed.policy;
  else (changed[key] as unknown[]).push({ id: 'different-source' });
  vi.spyOn(f.repo, 'workforce').mockResolvedValue(changed);
  await expect(
    requireCurrentPayrollSource(f.repo, f.org, f.data, () => true),
  ).rejects.toThrow();
});
it('foreign worker identities and read denial fail closed', async () => {
  const f = await fixture(),
    foreign = structuredClone(f.data);
  foreign.workers[0].organization_id = sampleCompanies[1].id;
  const spy = vi.spyOn(f.repo, 'workforce').mockResolvedValue(foreign);
  await expect(
    requireCurrentPayrollSource(f.repo, f.org, f.data, () => true),
  ).rejects.toThrow(/access unavailable/);
  spy.mockRejectedValue(Error('Read denied'));
  await expect(
    requireCurrentPayrollSource(f.repo, f.org, f.data, () => true),
  ).rejects.toThrow(/Read denied/);
});
