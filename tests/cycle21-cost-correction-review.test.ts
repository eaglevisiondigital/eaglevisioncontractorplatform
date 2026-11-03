import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readCostCorrectionReview,
  assertCostCorrectionReviewCurrent,
  assertCostCorrectionReviewAccess,
  confirmCostCorrectionReview,
  reconcileCostCorrectionReview,
} from '../src/lib/workflows/cost-correction-review';
import { CostCorrectionReview } from '../src/components/workflows/CostCorrectionReview';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0];
  return {
    gate,
    sources,
    entry,
    org: sources.company.id,
    job: entry.target.job_id!,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function pending(
  f: Fixture,
  reference = 'LOCAL-C21-REVIEW',
  amount = 700,
) {
  return f.sources.estimates.submitExpense(f.org, f.job, {
    purchase_key: `C21-${reference}`,
    supplier: 'Synthetic review supplier',
    reference,
    category: 'materials',
    kind: 'commitment',
    amount_minor: amount,
    description:
      'Existing canonical pending material source; no procurement execution.',
    estimate_line_id: null,
    quantity_milli: null,
    unit: null,
    unit_cost_minor: null,
    document_ids: [],
    material_approval_id: null,
  });
}
const read = (f: Fixture, id?: string) =>
  readCostCorrectionReview(f.sources, f.job, f.gate, id);
const input = (id: string, decision: 'approved' | 'rejected' = 'approved') => ({
  expense_id: id,
  decision,
  reason: 'Explicit synthetic staff review of exact pending source.',
});
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
}
async function forecast(f: Fixture) {
  const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
  await f.sources.estimates.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 100,
    },
  });
}
describe('Cycle21 exact pending recorded-cost correction review', () => {
  it('rejects executable admission before source access without evaluating getter', async () => {
    const getter = vi.fn(() => {
      throw Error('Executable gate');
    });
    const gate = Object.defineProperty({ confirmed: true }, 'enabled', {
      get: getter,
      enumerable: true,
    });
    await expect(
      readCostCorrectionReview({} as never, 'missing', gate as never),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['payment', 'credit'] as const)(
    'pending %s is outside this non-executing review scope',
    async (kind) => {
      const f = await fixture(),
        id = await f.sources.estimates.submitExpense(f.org, f.job, {
          purchase_key: 'EXCLUDED',
          supplier: 'Synthetic supplier',
          reference: `EXCLUDED-${kind}`,
          category: 'materials',
          kind,
          amount_minor: 100,
          description: 'Canonical excluded source',
          estimate_line_id: null,
          quantity_milli: null,
          unit: null,
          unit_cost_minor: null,
          document_ids: [],
          material_approval_id: null,
        });
      await expect(read(f, id)).rejects.toThrow();
    },
  );
  it('foreign adjustment provenance cannot become a reviewable commitment', async () => {
    const f = await fixture(),
      other = await fixture(1),
      source = other.sources.estimates.syntheticJob(other.org, other.job)!
        .expenses[0].id;
    const id = await f.sources.estimates.submitExpense(f.org, f.job, {
      purchase_key: 'FOREIGN-ADJUSTMENT',
      supplier: 'Synthetic supplier',
      reference: 'FOREIGN-ADJUSTMENT',
      category: 'materials',
      kind: 'commitment',
      amount_minor: 100,
      description: 'Ambiguous adjustment',
      estimate_line_id: null,
      quantity_milli: null,
      unit: null,
      unit_cost_minor: null,
      document_ids: [],
      material_approval_id: null,
      adjusts_expense_id: source,
    });
    await expect(read(f, id)).rejects.toThrow();
  });
  it.each([0, 1, 2])(
    'brand %i original expense review updates canonical costs and preserves source',
    async (brand) => {
      const f = await fixture(brand),
        id = await pending(f),
        view = await read(f, id),
        before = f.sources.estimates.syntheticJob(f.org, f.job)!,
        financials = jobFinancials(before),
        release = JSON.stringify(f.entry.release.read('staff'));
      expect(view.material.expense_id).toBe(id);
      expect(view.material.can_review).toBe(true);
      expect(
        (await confirmCostCorrectionReview(view, input(id), true)).status,
      ).toBe('SYNTHETIC_SOURCE_SAVED');
      const after = f.sources.estimates.syntheticJob(f.org, f.job)!;
      expect(after.expenses).toEqual(before.expenses);
      expect(after.events).toHaveLength(before.events.length + 1);
      expect(after.lock_revision).toBe(before.lock_revision + 1);
      expect(
        jobFinancials(after).categories.find((x) => x.category === 'materials')!
          .committed_remaining_minor -
          financials.categories.find((x) => x.category === 'materials')!
            .committed_remaining_minor,
      ).toBe(700);
      expect(after.events.at(-1)).toMatchObject({
        submission_id: id,
        decision: 'approved',
        reason: input(id).reason,
      });
      expect(JSON.stringify(f.entry.release.read('staff'))).toBe(release);
      const fresh = await read(f);
      expect(fresh.costs.evidence.job_revision).toBe(after.lock_revision);
      expect(
        fresh.canonical.categories.find((x) => x.category === 'materials')!
          .committed_remaining_minor,
      ).toBeGreaterThan(
        view.canonical.categories.find((x) => x.category === 'materials')!
          .committed_remaining_minor,
      );
      expect(fresh.costs.evidence.facts.cost_coverage).not.toBe(
        'DECLARED_COSTS_COMPLETE',
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i rejecting incorrect pending evidence preserves costs and immutable original',
    async (brand) => {
      const f = await fixture(brand),
        id = await pending(f),
        view = await read(f, id),
        before = f.sources.estimates.syntheticJob(f.org, f.job)!;
      await confirmCostCorrectionReview(view, input(id, 'rejected'), true);
      const after = f.sources.estimates.syntheticJob(f.org, f.job)!;
      expect(after.expenses).toEqual(before.expenses);
      expect(jobFinancials(after)).toEqual(jobFinancials(before));
      expect(after.events.at(-1)?.decision).toBe('rejected');
    },
  );
  it.each([0, 1, 2])(
    'brand %i pending source has no invented posting or cost-complete claim',
    async (brand) => {
      const f = await fixture(brand),
        id = await pending(f),
        view = await read(f, id),
        before = f.sources.estimates.syntheticJob(f.org, f.job)!;
      expect(view.costs.evidence.expenses.some((e) => e.id === id)).toBe(true);
      expect(
        view.costs.evidence.reviews.some((e) => e.submission_id === id),
      ).toBe(false);
      expect(view.meaning).toBe('INTERNAL_RECORDED_COST_REVIEW_ONLY');
      expect(view.financial_execution).toBe(false);
      expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(before);
    },
  );
  it('no eligible pending source creates no placeholder expense', async () => {
    const f = await fixture(),
      before = f.sources.estimates.syntheticJob(f.org, f.job)!,
      view = await read(f);
    expect(view.material.eligible_expenses).toHaveLength(0);
    expect(view.material.can_review).toBe(false);
    expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(before);
  });
  it('explicit confirmation and source decision are required before native review', async () => {
    const f = await fixture(),
      id = await pending(f),
      view = await read(f, id),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense');
    await expect(
      confirmCostCorrectionReview(view, input(id), false),
    ).rejects.toThrow();
    await expect(
      confirmCostCorrectionReview(
        view,
        { ...input(id), decision: 'paid' } as never,
        true,
      ),
    ).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it.each(['', ' ', 'x'.repeat(2001)])(
    'invalid reason %j never writes',
    async (reason) => {
      const f = await fixture(),
        id = await pending(f),
        view = await read(f, id),
        review = vi.spyOn(f.sources.estimates, 'reviewExpense');
      await expect(
        confirmCostCorrectionReview(view, { ...input(id), reason }, true),
      ).rejects.toThrow();
      expect(review).not.toHaveBeenCalled();
    },
  );
  it('unknown expense and exact foreign source never fall back', async () => {
    const f = await fixture(),
      other = await fixture(1),
      id = await pending(other);
    await expect(read(f, id)).rejects.toThrow();
    await expect(read(f, crypto.randomUUID())).rejects.toThrow();
  });
  it('existing reviewed source cannot be reviewed again', async () => {
    const f = await fixture(),
      id = f.sources.estimates.syntheticJob(f.org, f.job)!.expenses[0].id,
      review = vi.spyOn(f.sources.estimates, 'reviewExpense');
    await expect(read(f, id)).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it('saved job CAS drift blocks exact source action', async () => {
    const f = await fixture(),
      id = await pending(f),
      view = await read(f, id),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense');
    await forecast(f);
    expect(() => assertCostCorrectionReviewCurrent(view)).toThrow();
    assertCostCorrectionReviewAccess(view);
    await expect(
      confirmCostCorrectionReview(view, input(id), true),
    ).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it('another pending expense without job lock bump still invalidates current source fingerprint', async () => {
    const f = await fixture(),
      id = await pending(f),
      view = await read(f, id),
      revision = view.costs.evidence.job_revision;
    await pending(f, 'OTHER-PENDING');
    expect(f.sources.estimates.syntheticJob(f.org, f.job)!.lock_revision).toBe(
      revision,
    );
    expect(() => assertCostCorrectionReviewCurrent(view)).toThrow();
  });
  it.each(['revoked', 'property', 'job', 'root'])(
    '%s source changes deny before writer',
    async (mode) => {
      const f = await fixture(),
        id = await pending(f),
        view = await read(f, id),
        review = vi.spyOn(f.sources.estimates, 'reviewExpense');
      if (mode === 'revoked') revoke(f);
      if (mode === 'property')
        f.entry.target.location_id = f.sources.entries[1].target.location_id;
      if (mode === 'job')
        f.entry.target.job_id = f.sources.entries[1].target.job_id;
      if (mode === 'root')
        f.sources.entries = [{ ...f.entry }, ...f.sources.entries.slice(1)];
      await expect(
        confirmCostCorrectionReview(view, input(id), true),
      ).rejects.toThrow();
      expect(review).not.toHaveBeenCalled();
    },
  );
  it('original material-review exercise cannot be bypassed by fresh correction wrapper', async () => {
    const f = await fixture(),
      old = await readSavedSourceExercise(f.sources, f.job, f.gate);
    await executeSavedSourceExercise(old, 'material-review', true);
    const id = await pending(f),
      view = await read(f, id),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense');
    expect(view.material.can_review).toBe(false);
    await expect(
      confirmCostCorrectionReview(view, input(id), true),
    ).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it('known review cannot duplicate and reconciliation is exact read-only', async () => {
    const f = await fixture(),
      id = await pending(f),
      view = await read(f, id);
    await confirmCostCorrectionReview(view, input(id), true);
    const review = vi.spyOn(f.sources.estimates, 'reviewExpense'),
      submit = vi.spyOn(f.sources.estimates, 'submitExpense');
    await reconcileCostCorrectionReview(view);
    expect(review).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    await expect(read(f, id)).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it('lost native acknowledgement retains UNKNOWN across new source wrappers without replay', async () => {
    const f = await fixture(),
      id = await pending(f);
    await pending(f, 'OTHER-HELD');
    const view = await read(f, id),
      native = f.sources.estimates.reviewExpense.bind(f.sources.estimates),
      review = vi
        .spyOn(f.sources.estimates, 'reviewExpense')
        .mockImplementation(async (...args) => {
          await native(...args);
          throw Error('lost acknowledgement');
        });
    await expect(
      confirmCostCorrectionReview(view, input(id), true),
    ).rejects.toThrow();
    await reconcileCostCorrectionReview(view);
    expect(review).toHaveBeenCalledTimes(1);
    const next = await readCostCorrectionReview(
      { ...f.sources },
      f.job,
      f.gate,
    );
    expect(next.material.can_review).toBe(false);
    await expect(
      confirmCostCorrectionReview(next, input(id), true),
    ).rejects.toThrow();
    expect(review).toHaveBeenCalledTimes(1);
  });
  it('concurrent original same-job wrappers call native review at most once', async () => {
    const f = await fixture(),
      id = await pending(f),
      a = await read(f, id),
      b = await readCostCorrectionReview({ ...f.sources }, f.job, f.gate, id),
      native = f.sources.estimates.reviewExpense.bind(f.sources.estimates);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      wait = new Promise<void>((r) => {
        release = r;
      });
    const review = vi
      .spyOn(f.sources.estimates, 'reviewExpense')
      .mockImplementation(async (...args) => {
        entered();
        await wait;
        return native(...args);
      });
    const first = confirmCostCorrectionReview(a, input(id), true);
    await started;
    await expect(
      confirmCostCorrectionReview(b, input(id), true),
    ).rejects.toThrow();
    release();
    await first;
    expect(review).toHaveBeenCalledTimes(1);
  });
  it('invalid canonical approved expense is blocked before native review', async () => {
    const f = await fixture(),
      id = await pending(f, 'INVALID', -50),
      view = await read(f, id),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense');
    await expect(
      confirmCostCorrectionReview(view, input(id), true),
    ).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
  it('rejected invalid pending source can be retained without changing canonical cost', async () => {
    const f = await fixture(),
      id = await pending(f, 'INVALID', -50),
      view = await read(f, id),
      before = jobFinancials(f.sources.estimates.syntheticJob(f.org, f.job)!);
    await confirmCostCorrectionReview(view, input(id, 'rejected'), true);
    expect(
      jobFinancials(f.sources.estimates.syntheticJob(f.org, f.job)!),
    ).toEqual(before);
  });
  it('time corrections show exact predecessor and conservative unposted coverage', async () => {
    const f = await fixture(),
      entry = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'Original task',
        kind: 'work',
        started_at: '2026-02-03T10:00:00.000Z',
        ended_at: '2026-02-03T11:00:00.000Z',
        billable: false,
        corrects_id: null,
      });
    if (typeof entry !== 'string')
      throw Error('Exact canonical time ID required');
    await f.sources.estimates.submitTime(f.org, entry);
    await f.sources.estimates.reviewTime(
      f.org,
      entry,
      'approved',
      'Synthetic only',
    );
    const correction = await f.sources.estimates.recordTime(
      f.org,
      f.entry.worker_id,
      {
        job_id: f.job,
        overhead_center: null,
        task: 'Corrected task',
        kind: 'work',
        started_at: '2026-02-03T10:00:00.000Z',
        ended_at: '2026-02-03T11:00:00.000Z',
        billable: false,
        corrects_id: entry,
      },
    );
    const value = await read(f);
    expect(
      value.costs.evidence.time.find((x) => x.id === correction)?.corrects_id,
    ).toBe(entry);
    expect(value.costs.evidence.facts.cost_coverage).not.toBe(
      'DECLARED_COSTS_COMPLETE',
    );
    expect(value.costs.evidence.locked_periods).toHaveLength(0);
  });
  it('material review preserves already locked labor evidence without reopening period', async () => {
    const f = await fixture(),
      id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'Ended synthetic work',
        kind: 'work',
        started_at: '2026-02-03T10:00:00.000Z',
        ended_at: '2026-02-03T11:00:00.000Z',
        billable: false,
        corrects_id: null,
      });
    if (typeof id !== 'string') throw Error('Exact canonical time ID required');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'Synthetic internal time review',
    );
    await f.sources.estimates.payroll(
      f.org,
      '2026-02-03T00:00:00.000Z',
      '2026-02-04T00:00:00.000Z',
      {},
      true,
    );
    const period = JSON.stringify(
        (await f.sources.estimates.workforce(f.org)).periods,
      ),
      expense = await pending(f),
      view = await read(f, expense);
    expect(view.costs.evidence.locked_periods.length).toBeGreaterThan(0);
    expect(view.costs.evidence.labor_entry_ids).toContain(id);
    await confirmCostCorrectionReview(view, input(expense), true);
    expect(
      JSON.stringify((await f.sources.estimates.workforce(f.org)).periods),
    ).toBe(period);
  });
  it('no fake cost restoration, row replacement, ledger/invoice/payment or provider on read/reconcile', async () => {
    const f = await fixture(),
      id = await pending(f),
      submit = vi.spyOn(f.sources.estimates, 'submitExpense'),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense'),
      payroll = vi.spyOn(f.sources.estimates, 'payroll'),
      fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const value = await read(f, id);
    await reconcileCostCorrectionReview(value);
    expect(submit).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(payroll).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(value.costs.evidence)).not.toMatch(
      /worker_rate|payroll_deduction|staff_notes/,
    );
  });
  it('OFF blocks source descriptors and renderer without any placeholder', async () => {
    const getter = vi.fn(() => {
      throw Error('read');
    });
    await expect(
      readCostCorrectionReview(
        Object.defineProperty({}, 'entries', { get: getter }) as never,
        'missing',
      ),
    ).rejects.toThrow('OFF');
    expect(getter).not.toHaveBeenCalled();
    expect(
      renderToStaticMarkup(
        createElement(CostCorrectionReview, { sources: {} as never }),
      ),
    ).toContain('Cost correction review is OFF');
  });
});
