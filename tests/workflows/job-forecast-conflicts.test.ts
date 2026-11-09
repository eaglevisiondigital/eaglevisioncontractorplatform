import { expect, it } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { jobFinancials } from '../../src/domain/jobs/financials';
import {
  exactForecastSource,
  forecastChanged,
  forecastConflicts,
  reconcileForecast,
  holdForecast,
  forecastHeld,
} from '../../src/components/phase3/job-forecast-conflicts';
import { prototypeFixture } from '../program/prototype-fixture';
async function fixture(index = 0) {
  const f = await prototypeFixture(sampleCompanies[index], true);
  const read = async () =>
    (await f.repo.jobs(f.company.id)).find((j) => j.id === f.target.job_id)!;
  return { ...f, read, base: await read() };
}
it.each([0, 1, 2])(
  'brand %i saves and reopens reconciled independent forecast changes through original CAS writer',
  async (index) => {
    const f = await fixture(index),
      entered = structuredClone(f.base.projection);
    entered.remaining.materials = 54321;
    const other = structuredClone(f.base.projection);
    other.remaining.equipment = 1234;
    await f.repo.projection(f.company.id, f.base, other);
    const latest = await f.read();
    expect(forecastChanged(f.base, latest)).toBe(true);
    await expect(
      f.repo.projection(f.company.id, f.base, entered),
    ).rejects.toThrow(/changed/);
    expect(forecastConflicts(f.company.id, f.base, entered, latest)).toEqual(
      [],
    );
    const merged = reconcileForecast(f.company.id, f.base, entered, latest, {});
    expect(merged.remaining).toEqual({ ...other.remaining, materials: 54321 });
    await f.repo.projection(f.company.id, latest, merged);
    const reopened = await f.read();
    expect(reopened.projection).toEqual(merged);
    expect(reopened.lock_revision).toBe(f.base.lock_revision + 2);
    expect(reopened.baseline).toEqual(f.base.baseline);
    expect(reopened.events).toEqual(f.base.events);
    expect(reopened.expenses).toEqual(f.base.expenses);
    expect(jobFinancials(reopened)).toEqual(
      jobFinancials({ ...latest, projection: merged }),
    );
    expect(jobFinancials(reopened).revised_revenue_minor).toBe(
      jobFinancials(f.base).revised_revenue_minor,
    );
  },
);
it('conflicting amounts require explicit choices and never overwrite another category', async () => {
  const f = await fixture(),
    entered = structuredClone(f.base.projection),
    other = structuredClone(f.base.projection);
  entered.remaining.materials = 111;
  other.remaining.materials = 222;
  other.remaining.other = 333;
  await f.repo.projection(f.company.id, f.base, other);
  const latest = await f.read();
  expect(forecastConflicts(f.company.id, f.base, entered, latest)).toEqual([
    'materials',
  ]);
  expect(() =>
    reconcileForecast(f.company.id, f.base, entered, latest, {}),
  ).toThrow(/Choose/);
  expect(
    reconcileForecast(f.company.id, f.base, entered, latest, {
      materials: 'entered',
    }).remaining,
  ).toEqual({ ...other.remaining, materials: 111 });
  expect(
    reconcileForecast(f.company.id, f.base, entered, latest, {
      materials: 'saved',
    }).remaining,
  ).toEqual(other.remaining);
  expect((await f.read()).projection).toEqual(other);
});
it('intervening expense without a job revision increment still requires source review and renewed completion confirmation', async () => {
  const f = await fixture(),
    entered = structuredClone(f.base.projection);
  entered.costs_complete = true;
  await f.repo.submitExpense(f.company.id, f.base.id, {
    purchase_key: 'P',
    supplier: 'S',
    reference: 'R',
    description: 'Pending original evidence',
    category: 'materials',
    kind: 'commitment',
    amount_minor: 100,
    estimate_line_id: null,
    quantity_milli: null,
    unit: null,
    unit_cost_minor: null,
    document_ids: [],
    material_approval_id: null,
  });
  const latest = await f.read();
  expect(latest.lock_revision).toBe(f.base.lock_revision);
  expect(forecastChanged(f.base, latest)).toBe(true);
  expect(
    reconcileForecast(f.company.id, f.base, entered, latest, {}).costs_complete,
  ).toBe(false);
});
it('denies foreign, missing, regressed, or replaced original job sources', async () => {
  const f = await fixture();
  for (const job of [
    undefined,
    { ...f.base, id: 'foreign' },
    { ...f.base, organization_id: sampleCompanies[1].id },
    { ...f.base, lock_revision: f.base.lock_revision - 1 },
    { ...f.base, baseline: { ...f.base.baseline, issued_version_id: 'other' } },
  ])
    expect(() => exactForecastSource(f.company.id, f.base, job)).toThrow(
      /Exact job/,
    );
  expect(() =>
    exactForecastSource(sampleCompanies[1].id, f.base, f.base),
  ).toThrow();
});
it('validates financial inputs and preserves canonical one-winner concurrency after reconciliation', async () => {
  const f = await fixture(),
    entered = structuredClone(f.base.projection);
  entered.remaining.materials = -1;
  expect(() =>
    reconcileForecast(f.company.id, f.base, entered, f.base, {}),
  ).toThrow(/Invalid remaining/);
  entered.remaining.materials = 123;
  const results = await Promise.allSettled([
    f.repo.projection(f.company.id, f.base, entered),
    f.repo.projection(f.company.id, f.base, entered),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await f.read()).lock_revision).toBe(f.base.lock_revision + 1);
});
it('UNKNOWN guard survives component navigation and is isolated by original repository and tenant/job', async () => {
  const f = await fixture(),
    g = await fixture();
  expect(forecastHeld(f.repo, f.company.id, f.base.id)).toBe(false);
  holdForecast(f.repo, f.company.id, f.base.id);
  expect(forecastHeld(f.repo, f.company.id, f.base.id)).toBe(true);
  expect(forecastHeld(f.repo, sampleCompanies[1].id, f.base.id)).toBe(false);
  expect(forecastHeld(g.repo, f.company.id, f.base.id)).toBe(false);
});

it('a shared save lease denies parallel forms, releases after a safe preflight cancellation, and never clears UNKNOWN', async () => {
  const f = await fixture();
  const { acquireForecastSave } =
    await import('../../src/components/phase3/job-forecast-conflicts');
  const release = acquireForecastSave(f.repo, f.company.id, f.base.id);
  expect(() => acquireForecastSave(f.repo, f.company.id, f.base.id)).toThrow(
    /in progress/,
  );
  release();
  const second = acquireForecastSave(f.repo, f.company.id, f.base.id);
  holdForecast(f.repo, f.company.id, f.base.id);
  second();
  expect(() => acquireForecastSave(f.repo, f.company.id, f.base.id)).toThrow(
    /UNKNOWN/,
  );
});
