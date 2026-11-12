import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { blankLine } from '../../src/domain/estimating/calculation';
import { jobFinancials, type Expense } from '../../src/domain/jobs/financials';
import { materialExpenseEvidence } from '../../src/components/phase3/material-expense-evidence';
import { prototypeFixture } from '../program/prototype-fixture';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const f = await prototypeFixture(sampleCompanies[index], true);
  const job = (await f.repo.jobs(f.company.id)).find(
    (j) => j.id === f.target.job_id,
  )!;
  const line = job.baseline.lines.find((l) =>
    ['material', 'product', 'allowance'].includes(l.kind),
  )!;
  const input: Parameters<typeof materialExpenseEvidence>[2] = {
    category: 'materials',
    line: line.id,
    quantity: '2.125',
    unit: line.unit,
    unitCost: String(line.unit_cost_minor + 100),
  };
  const evidence = () => materialExpenseEvidence(f.company.id, job, input);
  const payload = (): Omit<Expense, 'id' | 'job_id' | 'submitted_at'> => ({
    purchase_key: 'SYNTHETIC-PO',
    supplier: 'Synthetic Material Supply',
    reference: 'SYNTHETIC-DOC',
    description: 'Reported materials for review',
    category: 'materials',
    kind: 'commitment',
    amount_minor: 12345,
    estimate_line_id: line.id,
    ...evidence(),
    document_ids: [],
    material_approval_id: null,
  });
  return { ...f, job, line, input, evidence, payload };
}
it.each([0, 1, 2])(
  'brand %i: original submission/readback retains exact reported evidence pending review',
  async (index) => {
    const f = await fixture(index);
    const before = jobFinancials(f.job);
    const id = await f.repo.submitExpense(f.company.id, f.job.id, f.payload());
    const reopened = (await f.repo.jobs(f.company.id)).find(
      (j) => j.id === f.job.id,
    )!;
    expect(reopened.expenses).toHaveLength(f.job.expenses.length + 1);
    const record = reopened.expenses.find((e) => e.id === id)!;
    expect(record).toMatchObject({
      job_id: f.job.id,
      estimate_line_id: f.line.id,
      quantity_milli: 2125,
      unit: f.line.unit,
      unit_cost_minor: f.line.unit_cost_minor + 100,
    });
    expect(reopened.events.some((e) => e.submission_id === id)).toBe(false);
    expect(reopened.baseline).toEqual(f.job.baseline);
    expect(jobFinancials(reopened).categories).toEqual(before.categories);
    expect(jobFinancials(reopened).revised_revenue_minor).toBe(
      before.revised_revenue_minor,
    );
    const reviewed = {
      ...reopened,
      events: [
        ...reopened.events,
        {
          id: crypto.randomUUID(),
          submission_id: id,
          decision: 'approved' as const,
          reason: 'Synthetic pure engine variance fixture only',
          created_at: new Date().toISOString(),
        },
      ],
    };
    expect(jobFinancials(reviewed).anomalies.join(' ')).toContain(
      'quantity differs from original budget',
    );
    expect(jobFinancials(reviewed).anomalies.join(' ')).toContain(
      'supplier unit cost increased',
    );
    expect(
      (await f.repo.jobs(f.company.id)).find((j) => j.id === f.job.id)!.events,
    ).toEqual(reopened.events);
  },
);
it('blank evidence remains UNKNOWN and zero explicitly reported unit cost remains zero', async () => {
  const f = await fixture();
  Object.assign(f.input, { quantity: '', unit: '', unitCost: '' });
  expect(f.evidence()).toEqual({
    quantity_milli: null,
    unit: null,
    unit_cost_minor: null,
  });
  Object.assign(f.input, { quantity: '1', unit: f.line.unit, unitCost: '0' });
  expect(f.evidence().unit_cost_minor).toBe(0);
});
it.each(['0', '-1', 'NaN', '1.0001', '1000001'])(
  'rejects invalid reported quantity %s before any write',
  async (quantity) => {
    const f = await fixture();
    f.input.quantity = quantity;
    expect(f.evidence).toThrow();
    expect(
      (await f.repo.jobs(f.company.id)).find((j) => j.id === f.job.id)!
        .expenses,
    ).toEqual(f.job.expenses);
  },
);
it.each(['1.5', '-1', 'Infinity', '9000000000001'])(
  'rejects invalid minor-unit cost %s',
  async (unitCost) => {
    const f = await fixture();
    f.input.unitCost = unitCost;
    expect(f.evidence).toThrow();
  },
);
it('rejects partial evidence, unit conflicts, nonmaterial categories and wrong original source lines', async () => {
  const f = await fixture();
  const run = (patch: Partial<typeof f.input>) => () =>
    materialExpenseEvidence(f.company.id, f.job, { ...f.input, ...patch });
  for (const patch of [
    { quantity: '' },
    { unit: '' },
    { unit: 'unverified-unit' },
    { unit: f.line.unit === 'each' ? 'hour' : 'each' },
    { category: 'labor' },
    { line: 'foreign-or-new-revision-line' },
  ])
    expect(run(patch)).toThrow();
  const labor = f.job.baseline.lines.find((l) => l.kind === 'labor')!;
  expect(run({ line: labor.id, unit: labor.unit })).toThrow(/material budget/);
  expect(() =>
    materialExpenseEvidence(sampleCompanies[1].id, f.job, f.input),
  ).toThrow(/Exact original/);
});
it('does not invent a budget relationship for unmatched reported material evidence', async () => {
  const f = await fixture();
  f.input.line = '';
  const evidence = f.evidence();
  expect(evidence.quantity_milli).toBe(2125);
  expect(Object.hasOwn(evidence, 'estimate_line_id')).toBe(false);
});
it('original duplicate-document protection gives one winner and never replaces the saved evidence', async () => {
  const f = await fixture();
  const data = f.payload();
  const results = await Promise.allSettled([
    f.repo.submitExpense(f.company.id, f.job.id, data),
    f.repo.submitExpense(f.company.id, f.job.id, data),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  const first = (await f.repo.jobs(f.company.id)).find(
    (j) => j.id === f.job.id,
  )!.expenses;
  await expect(
    f.repo.submitExpense(f.company.id, f.job.id, {
      ...data,
      quantity_milli: 9999,
    }),
  ).rejects.toThrow(/Duplicate/);
  expect(
    (await f.repo.jobs(f.company.id)).find((j) => j.id === f.job.id)!.expenses,
  ).toEqual(first);
  await expect(
    f.repo.submitExpense(sampleCompanies[1].id, f.job.id, data),
  ).rejects.toThrow();
});
it('later estimate revisions cannot rebind material evidence away from the immutable job baseline', async () => {
  const f = await fixture();
  const revision = await f.repo.revise(f.company.id, f.bundle);
  const added = { ...blankLine(), description: 'Later private revision item' };
  await f.repo.save(f.company.id, revision, {
    ...revision.version.payload,
    lines: [...revision.version.payload.lines, added],
  });
  f.input.line = added.id;
  expect(f.evidence).toThrow(/original material/);
  f.input.line = f.line.id;
  await f.repo.submitExpense(f.company.id, f.job.id, f.payload());
  const reopened = (await f.repo.jobs(f.company.id)).find(
    (j) => j.id === f.job.id,
  )!;
  expect(reopened.baseline).toEqual(f.job.baseline);
  expect(reopened.baseline.issued_version_id).toBe(f.bundle.version.id);
});

it('a lost submission acknowledgment is resolved by exact readback without automatic replay', async () => {
  const f = await fixture();
  const data = f.payload();
  const submit = f.repo.submitExpense.bind(f.repo);
  const call = vi
    .spyOn(f.repo, 'submitExpense')
    .mockImplementationOnce(async (org, job, payload) => {
      await submit(org, job, payload);
      throw Error('Synthetic acknowledgment lost');
    });
  await expect(
    f.repo.submitExpense(f.company.id, f.job.id, data),
  ).rejects.toThrow(/acknowledgment lost/);
  const read = (await f.repo.jobs(f.company.id)).find(
    (j) => j.id === f.job.id,
  )!;
  const matches = read.expenses.filter(
    (e) => e.supplier === data.supplier && e.reference === data.reference,
  );
  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({ ...data, job_id: f.job.id });
  expect(read.events.some((e) => e.submission_id === matches[0].id)).toBe(
    false,
  );
  expect(call).toHaveBeenCalledTimes(1);
});

it.each(['foreign', 'ambiguous', 'labor'] as const)(
  'blank reported measurements never admit a %s material source line',
  async (mode) => {
    const f = await fixture();
    Object.assign(f.input, { quantity: '', unit: '', unitCost: '' });
    if (mode === 'foreign') f.input.line = crypto.randomUUID();
    if (mode === 'ambiguous') f.job.baseline.lines.push({ ...f.line });
    if (mode === 'labor')
      f.input.line = f.job.baseline.lines.find(
        (line) => line.kind === 'labor',
      )!.id;
    const writer = vi.spyOn(f.repo, 'submitExpense');
    expect(f.payload).toThrow(/original material budget line/);
    expect(writer).not.toHaveBeenCalled();
    expect(
      (await f.repo.jobs(f.company.id)).find((job) => job.id === f.job.id)!
        .expenses,
    ).toEqual(f.job.expenses);
  },
);

it.each([0, 1, 2])(
  'brand %i saves and reopens an exact original material line with UNKNOWN measurements',
  async (index) => {
    const f = await fixture(index);
    Object.assign(f.input, { quantity: '', unit: '', unitCost: '' });
    const id = await f.repo.submitExpense(f.company.id, f.job.id, f.payload());
    const reopened = (await f.repo.jobs(f.company.id)).find(
      (job) => job.id === f.job.id,
    )!;
    expect(
      reopened.expenses.find((expense) => expense.id === id),
    ).toMatchObject({
      job_id: f.job.id,
      estimate_line_id: f.line.id,
      quantity_milli: null,
      unit: null,
      unit_cost_minor: null,
    });
    expect(reopened.baseline).toEqual(f.job.baseline);
    expect(reopened.events).toEqual(f.job.events);
  },
);
