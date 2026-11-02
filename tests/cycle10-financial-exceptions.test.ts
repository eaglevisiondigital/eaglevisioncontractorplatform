import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFinancialExceptions,
  filterFinancialExceptions,
  openFinancialException,
  inspectFinancialExceptions,
  type FinancialExceptionsInput,
  type FinancialExceptionsFilter,
} from '../src/lib/workflows/financial-exceptions';
import { FinancialExceptions } from '../src/components/workflows/FinancialExceptions';
afterEach(() => vi.restoreAllMocks());
const clear: FinancialExceptionsFilter = {
  kind: 'all',
  job_id: null,
  query: '',
};
async function fixture(index = 0, known = false) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate);
  if (known)
    await sources.estimates.payroll(
      sources.company.id,
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      {},
      true,
    );
  const input: FinancialExceptionsInput = {
    basis: 'SAVED_FORECASTS',
    portfolio: {
      as_of: new Date().toISOString(),
      input_revision: 1,
      excludes_unpaid_commitments: true,
      proposals: sources.entries.map((entry) => ({
        job_id: entry.target.job_id!,
        remaining: {
          ...sources.estimates.syntheticJob(
            sources.company.id,
            entry.target.job_id!,
          )!.projection.remaining,
        },
      })),
    },
  };
  return {
    sources,
    gate,
    input,
    read: () => readFinancialExceptions(sources, input, gate),
  };
}
function digestChange(change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !fired &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_SYNTHETIC_FINANCIAL_EXCEPTIONS')
    ) {
      fired = true;
      await change();
    }
    return result;
  });
  return () => fired;
}
describe('Cycle 10 canonical financial exceptions', () => {
  it.each([0, 1, 2])(
    'company %i exposes exact coverage/invoice gaps without writes or customer-private data',
    async (index) => {
      const f = await fixture(index),
        s = f.sources,
        before = JSON.stringify(
          s.entries.map((e) => ({
            source: s.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
        ),
        writers = [
          vi.spyOn(s.estimates, 'projection'),
          vi.spyOn(s.estimates, 'submitExpense'),
          vi.spyOn(s.estimates, 'recordTime'),
          vi.spyOn(s.estimates, 'payroll'),
          ...s.entries.map((e) => vi.spyOn(e.release, 'command')),
        ];
      const r = await f.read();
      expect(r.counts).toEqual({
        coverage: 4,
        margin: 0,
        remaining_cost: 0,
        invoice_readiness: 4,
      });
      expect(r.queue).toHaveLength(8);
      expect(r.coverage.covered_jobs).toBe(0);
      expect(r.portfolio.totals.recorded).toBeNull();
      expect(r.portfolio.totals.proposed).toBeNull();
      expect(
        r.queue
          .filter((q) => q.kind === 'coverage')
          .every((q) => q.status === 'UNKNOWN'),
      ).toBe(true);
      expect(r.basis).toBe('SAVED_FORECASTS');
      expect(new Set(r.queue.map((q) => q.id)).size).toBe(8);
      expect(Object.values(r.authority).every((a) => a === false)).toBe(true);
      expect(JSON.stringify(r)).not.toMatch(
        /PRIVATE staff|Synthetic planning supplier|journey-.*@example|5550100100|internal_notes|cash_minor|burden_minor/,
      );
      expect(
        JSON.stringify(
          s.entries.map((e) => ({
            source: s.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
          })),
        ),
      ).toBe(before);
      writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
      for (const entry of s.entries) {
        const row = r.queue.find((q) => q.job_id === entry.target.job_id)!;
        const detail = openFinancialException(r, row.id);
        expect(detail.target).toEqual(entry.target);
        expect(detail.job.review.invoice.reference.offer_id).toBe(
          entry.offer_id,
        );
        expect(detail.job.review.invoice.reference.decision_id).toBe(
          entry.receipt_id,
        );
        expect(detail.exception.source.issued_version_id).toBe(
          entry.target.version_id,
        );
        expect(detail.exception.source.scope_sha256).toBe(
          detail.job.review.invoice.scope_sha256,
        );
        expect(detail.job.review.invoice.overall).toBe('NO_GO');
      }
      expect(await inspectFinancialExceptions(r)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
    },
  );
  it.each([0, 1, 2])(
    'company %i queue follows canonical warnings and CTC without inventing calculations',
    async (index) => {
      const f = await fixture(index, true);
      f.input.basis = 'UNSAVED_PROPOSALS';
      f.input.portfolio.proposals[0].remaining.materials = 900_000_000;
      const original = f.sources.estimates.syntheticJob(
          f.sources.company.id,
          f.sources.entries[0].target.job_id!,
        )!,
        r = await f.read(),
        first = r.portfolio.jobs[0],
        warnings = first.review.scenario.margin.warningReview;
      expect(r.counts.coverage).toBe(0);
      expect(r.counts.remaining_cost).toBe(4);
      expect(r.counts.margin).toBeGreaterThan(0);
      expect(warnings.negativeContribution).toBe(true);
      expect(
        r.queue.some(
          (q) => q.id === `${first.target.job_id}:negative-contribution`,
        ),
      ).toBe(true);
      expect(
        r.queue.some((q) => q.id === `${first.target.job_id}:margin-erosion`),
      ).toBe(warnings.erosionThresholdExceeded === true);
      for (const row of warnings.aboveBudgetCategories)
        expect(
          r.queue.some(
            (q) => q.id === `${first.target.job_id}:category:${row.category}`,
          ),
        ).toBe(true);
      const detail = openFinancialException(
        r,
        r.queue.find(
          (q) =>
            q.kind === 'remaining_cost' && q.job_id === first.target.job_id,
        )!.id,
      );
      expect(
        detail.job.review.scenario.completion.totals!.costToCompleteMinor,
      ).toBe(
        detail.job.review.scenario.completion.totals!.unpaidCommitmentMinor +
          detail.job.review.scenario.completion.totals!.remainingForecastMinor,
      );
      expect(detail.job.review.scenario.proposed_remaining.materials).toBe(
        900_000_000,
      );
      expect(
        f.sources.estimates.syntheticJob(f.sources.company.id, original.id),
      ).toEqual(original);
      expect(r.queue.every((q) => !('urgent' in q) && !('resolved' in q))).toBe(
        true,
      );
    },
  );
  it('saved mode rejects changed amounts while explicit proposal mode preserves originals', async () => {
    const f = await fixture();
    f.input.portfolio.proposals[0].remaining.other = 500;
    await expect(f.read()).rejects.toThrow('exact recorded');
    f.input.basis = 'UNSAVED_PROPOSALS';
    const r = await f.read();
    expect(r.portfolio.jobs[0].review.scenario.proposed_remaining.other).toBe(
      500,
    );
    expect(r.portfolio.jobs[0].review.scenario.original_remaining.other).toBe(
      0,
    );
    expect(r.portfolio.totals.proposed).toBeNull();
  });
  it('saved mode compares category values rather than object insertion order', async () => {
    const f = await fixture(),
      p = f.input.portfolio.proposals[0];
    p.remaining = {
      other: p.remaining.other,
      equipment: p.remaining.equipment,
      subcontractors: p.remaining.subcontractors,
      labor: p.remaining.labor,
      materials: p.remaining.materials,
    };
    expect((await f.read()).basis).toBe('SAVED_FORECASTS');
  });
  it('combined exact-job/kind/literal filters return accurate counts and a useful empty result', async () => {
    const f = await fixture(),
      r = await f.read(),
      first = r.queue.find((q) => q.kind === 'invoice_readiness')!,
      filtered = filterFinancialExceptions(r, {
        job_id: first.job_id,
        kind: 'invoice_readiness',
        query: first.source.issued_version_id,
      });
    expect(filtered.matching).toBe(1);
    expect(filtered.queue[0]).toEqual(first);
    expect(filtered.available).toBe(8);
    expect(
      filterFinancialExceptions(r, { ...clear, kind: 'margin' }).matching,
    ).toBe(0);
    expect(
      filterFinancialExceptions(r, { ...clear, query: '[literal.*no-match]' })
        .matching,
    ).toBe(0);
    expect(filterFinancialExceptions(r, clear).matching).toBe(8);
  });
  it('keeps two jobs at the same property separate and never manufactures an invoice reference', async () => {
    const f = await fixture(),
      r = await f.read(),
      same = r.portfolio.jobs.filter(
        (j) => j.target.location_id === f.sources.entries[0].target.location_id,
      );
    expect(same).toHaveLength(2);
    expect(new Set(same.map((j) => j.target.job_id)).size).toBe(2);
    for (const job of same) {
      const own = filterFinancialExceptions(r, {
        ...clear,
        job_id: job.target.job_id,
      });
      expect(own.queue).toHaveLength(2);
      expect(job.review.invoice.reference.invoice_id).toBeNull();
      expect(job.review.compatibility.accounting.status).toBe('UNKNOWN');
      expect(job.review.compatibility.accounting.quickbooks.status).toBe(
        'UNVERIFIED',
      );
    }
  });
  it('rejects duplicate job/expense identity and mixed currencies through existing portfolio admission', async () => {
    const f = await fixture();
    await expect(
      readFinancialExceptions(
        { ...f.sources, entries: [f.sources.entries[0], f.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    const read = f.sources.estimates.readSyntheticPrototypeSources.bind(
        f.sources.estimates,
      ),
      first = read(f.sources.entries[0].target).job!.expenses[0].id;
    const spy = vi
      .spyOn(f.sources.estimates, 'readSyntheticPrototypeSources')
      .mockImplementation((target) => {
        const r = read(target);
        if (target.job_id === f.sources.entries[1].target.job_id)
          r.job!.expenses[0].id = first;
        return r;
      });
    await expect(f.read()).rejects.toThrow('Duplicate');
    spy.mockRestore();
    vi.spyOn(
      f.sources.estimates,
      'readSyntheticPrototypeSources',
    ).mockImplementation((target) => {
      const r = read(target);
      if (target.job_id === f.sources.entries[1].target.job_id)
        r.job!.baseline.currency = 'EUR';
      return r;
    });
    await expect(f.read()).rejects.toThrow('Mixed currencies');
  });
  it('rejects foreign company/job/property and repository substitutions', async () => {
    const f = await fixture(),
      foreign = await fixture(1);
    await expect(
      readFinancialExceptions(
        { ...f.sources, entries: [foreign.sources.entries[0]] },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readFinancialExceptions(
        { ...f.sources, estimates: foreign.sources.estimates },
        f.input,
        f.gate,
      ),
    ).rejects.toThrow();
    f.sources.entries[0].target.location_id =
      f.sources.entries[1].target.location_id;
    await expect(f.read()).rejects.toThrow();
  });
  it.each(['staff', 'inactive'] as const)(
    'denies %s membership before exposing staff finance',
    async (role) => {
      const f = await fixture(),
        members = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          members(org).map((m) =>
            m.user_id === f.sources.entries[0].target.actor_id
              ? {
                  ...m,
                  role: role === 'inactive' ? m.role : 'staff',
                  active: role !== 'inactive',
                }
              : m,
          ),
      );
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each([
    [
      'input amount',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.portfolio.proposals[0].remaining.other++;
      },
    ],
    [
      'basis',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.basis = 'UNSAVED_PROPOSALS';
      },
    ],
    [
      'input identity',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.portfolio = structuredClone(f.input.portfolio);
      },
    ],
    [
      'root entries',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries = [...f.sources.entries];
      },
    ],
    [
      'receipt',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[3].receipt_id = crypto.randomUUID();
      },
    ],
    [
      'confirmation',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.gate.confirmed = false;
      },
    ],
  ] as const)(
    'rejects original %s change after final hash',
    async (_name, change) => {
      const f = await fixture(),
        fired = digestChange(() => change(f));
      await expect(f.read()).rejects.toThrow();
      expect(fired()).toBe(true);
    },
  );
  it('rechecks eligible membership at the last asynchronous boundary', async () => {
    const f = await fixture(),
      members = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      fired = digestChange(() => {
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          members(org).map((m) => ({ ...m, active: false })),
        );
      });
    await expect(f.read()).rejects.toThrow();
    expect(fired()).toBe(true);
  });
  it('retains immutable UNKNOWN after an actual saved job revision and forbids stale navigation', async () => {
    const f = await fixture(),
      r = await f.read(),
      before = JSON.stringify(r),
      job = f.sources.estimates.syntheticJob(
        f.sources.company.id,
        f.sources.entries[0].target.job_id!,
      )!;
    await f.sources.estimates.projection(f.sources.company.id, job, {
      ...job.projection,
      remaining: { ...job.projection.remaining, other: 1200 },
    });
    expect(await inspectFinancialExceptions(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() => filterFinancialExceptions(r, clear)).toThrow();
    expect(() => openFinancialException(r, r.queue[0].id)).toThrow();
    expect(JSON.stringify(r)).toBe(before);
  });
  it('rejects copied evidence and unknown source/filter IDs while retaining integrity', async () => {
    const f = await fixture(),
      r = await f.read();
    expect(await inspectFinancialExceptions(structuredClone(r))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() => openFinancialException(r, crypto.randomUUID())).toThrow();
    expect(() =>
      filterFinancialExceptions(r, { ...clear, job_id: crypto.randomUUID() }),
    ).toThrow();
    const { sha256, ...body } = r;
    expect(await documentHash(body)).toBe(sha256);
    expect(Object.isFrozen(r.queue[0].source.expense_ids)).toBe(true);
  });
  it('rejects executable inputs/filters without invoking coercion or accessors', async () => {
    const f = await fixture(),
      r = await f.read(),
      coerce = vi.fn(() => 'all');
    expect(() =>
      filterFinancialExceptions(r, {
        ...clear,
        kind: { toString: coerce } as unknown as 'all',
      }),
    ).toThrow();
    expect(coerce).not.toHaveBeenCalled();
    const getter = vi.fn(() => 'SAVED_FORECASTS');
    Object.defineProperty(f.input, 'basis', { get: getter, enumerable: true });
    await expect(f.read()).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([NaN, -1, 1.25, 9_000_000_000_001])(
    'rejects invalid canonical input amount %s',
    async (amount) => {
      const f = await fixture();
      f.input.basis = 'UNSAVED_PROPOSALS';
      f.input.portfolio.proposals[0].remaining.materials = amount;
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each([0, 1, 2])(
    'company %i renders a default-OFF accessible source-first form',
    async (index) => {
      const f = await fixture(index),
        off = renderToStaticMarkup(
          createElement(FinancialExceptions, { sources: f.sources }),
        ),
        on = renderToStaticMarkup(
          createElement(FinancialExceptions, {
            sources: f.sources,
            enabled: true,
          }),
        );
      expect(off).toContain('Financial exception review is off');
      expect(off).not.toContain('<input');
      expect(on).toContain('aria-label="Financial exception queue"');
      expect(on).toContain('Exact saved remaining forecasts');
      expect(on).toContain('Explicit unsaved remaining proposals');
      expect(on).toContain('I confirm these exact jobs');
      expect(on.match(/readOnly=""/g)).toHaveLength(20);
    },
  );
});
