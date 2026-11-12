import { expect, it, vi } from 'vitest';
import { prototypeFixture } from '../program/prototype-fixture';
import { payrollPreparationInputs } from '../../src/components/phase3/payroll-preparation-inputs';

it.each([
  -1,
  0.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])(
  'rejects deduction %s before the original writer or saved period changes',
  async (amount) => {
    const f = await prototypeFixture(),
      data = await f.repo.workforce(f.company.id),
      writer = vi.spyOn(f.repo, 'payroll');
    const lock = () => {
      const period = payrollPreparationInputs(
        data,
        '2026-01-01',
        '2026-01-08',
        { [data.workers[0].id]: amount },
      );
      return f.repo.payroll(
        f.company.id,
        period.start,
        period.end,
        { [data.workers[0].id]: amount },
        true,
      );
    };
    expect(lock).toThrow(/deduction/i);
    expect(writer).not.toHaveBeenCalled();
    expect((await f.repo.workforce(f.company.id)).periods).toEqual(
      data.periods,
    );
  },
);

it.each([
  ['2026-01-08', '2026-01-01'],
  ['2026-01-01', '2026-01-01'],
  ['invalid', '2026-01-08'],
])('rejects invalid period %s to %s before any lock', async (start, end) => {
  const f = await prototypeFixture(),
    data = await f.repo.workforce(f.company.id);
  expect(() => payrollPreparationInputs(data, start, end, {})).toThrow();
  expect((await f.repo.workforce(f.company.id)).periods).toEqual([]);
});

it('rejects an unrecognized worker and missing employer policy', async () => {
  const f = await prototypeFixture(),
    data = await f.repo.workforce(f.company.id);
  expect(() =>
    payrollPreparationInputs(data, '2026-01-01', '2026-01-08', {
      'foreign-worker': 1,
    }),
  ).toThrow(/current worker/);
  expect(() =>
    payrollPreparationInputs(
      { ...data, policy: null },
      '2026-01-01',
      '2026-01-08',
      {},
    ),
  ).toThrow(/policy/);
});

it('valid preparation locks and reopens the original exact employer-local period once', async () => {
  const f = await prototypeFixture(),
    data = await f.repo.workforce(f.company.id),
    deductions = { [data.workers[0].id]: 1200 },
    period = payrollPreparationInputs(
      data,
      '2026-01-01',
      '2026-01-08',
      deductions,
    );
  await f.repo.payroll(
    f.company.id,
    period.start,
    period.end,
    deductions,
    true,
  );
  const reopened = await f.repo.workforce(f.company.id);
  expect(reopened.periods).toHaveLength(1);
  expect(reopened.periods[0]).toMatchObject({
    starts_at: period.start,
    ends_at: period.end,
    status: 'locked',
    snapshot: { rows: [], deductions },
  });
  await expect(
    f.repo.payroll(f.company.id, period.start, period.end, deductions, true),
  ).rejects.toThrow(/locked/);
  expect((await f.repo.workforce(f.company.id)).periods).toEqual(
    reopened.periods,
  );
});
