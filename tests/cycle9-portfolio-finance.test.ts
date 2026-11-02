import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPortfolioFinance,
  inspectPortfolioFinance,
  openPortfolioFinanceJob,
  type PortfolioFinanceInput,
} from '../src/lib/workflows/portfolio-finance';
import { PortfolioFinance } from '../src/components/workflows/PortfolioFinance';

afterEach(() => vi.restoreAllMocks());
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
  const input: PortfolioFinanceInput = {
    as_of: new Date().toISOString(),
    input_revision: 1,
    excludes_unpaid_commitments: true,
    proposals: sources.entries.map((entry, index) => ({
      job_id: entry.target.job_id!,
      remaining: {
        materials: 2500 + index,
        labor: 3000,
        subcontractors: 0,
        equipment: 0,
        other: 0,
      },
    })),
  };
  return {
    sources,
    gate,
    input,
    read: () => readPortfolioFinance(sources, input, gate),
  };
}
function digestChange(change: () => void) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let triggered = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !triggered &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_SYNTHETIC_PORTFOLIO_FINANCE')
    ) {
      triggered = true;
      change();
    }
    return result;
  });
  return () => triggered;
}
describe('Cycle 9 canonical selected-job portfolio finance', () => {
  it.each([0, 1, 2])(
    'company %i keeps four exact jobs and honest UNKNOWN without writes',
    async (index) => {
      const f = await fixture(index),
        { sources: s } = f;
      const before = JSON.stringify(
        s.entries.map((e) => ({
          source: s.estimates.readSyntheticPrototypeSources(e.target),
          release: e.release.read('staff'),
        })),
      );
      const writers = [
        vi.spyOn(s.estimates, 'projection'),
        vi.spyOn(s.estimates, 'recordTime'),
        vi.spyOn(s.estimates, 'payroll'),
        vi.spyOn(s.estimates, 'submitExpense'),
        ...s.entries.map((e) => vi.spyOn(e.release, 'command')),
      ];
      const r = await f.read();
      expect(r.jobs.map((j) => j.target.job_id)).toEqual(
        s.entries.map((e) => e.target.job_id),
      );
      expect(new Set(r.jobs.map((j) => j.target.location_id)).size).toBe(3);
      expect(r.coverage).toMatchObject({
        selected_jobs: 4,
        covered_jobs: 0,
        status: 'UNKNOWN',
      });
      expect(r.totals.recorded).toBeNull();
      expect(r.totals.proposed).toBeNull();
      expect(r.totals.issued_quoted_total_minor).toBe(
        s.entries.reduce(
          (n, e) => n + e.issued.version.calculation.total_minor,
          0,
        ),
      );
      expect(
        r.jobs.every((j) => j.review.scenario.completion.totals === null),
      ).toBe(true);
      expect(r.jobs[0].review.scenario.proposed_remaining).toEqual(
        f.input.proposals[0].remaining,
      );
      expect(r.compatibility).toMatchObject({
        invoice: 'NO_GO',
        accounting: 'UNKNOWN_NO_EXACT_INVOICE',
        quickbooks: 'UNVERIFIED',
        procurement: 'UNKNOWN_NO_EXACT_REVIEW',
      });
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
      expect(await inspectPortfolioFinance(r)).toEqual({
        status: 'CURRENT_LOCAL_SOURCE',
        replacement: null,
      });
      for (const [i, job] of r.jobs.entries()) {
        expect(job.review.invoice.reference.decision_id).toBe(
          s.entries[i].receipt_id,
        );
        expect(job.review.invoice.issued.version_id).toBe(
          s.entries[i].target.version_id,
        );
        expect(openPortfolioFinanceJob(r, job.target.job_id!)).toEqual({
          mode: 'NAVIGATION_ONLY',
          target: s.entries[i].target,
        });
      }
    },
  );
  it.each([0, 1, 2])(
    'company %i sums only canonical covered cost components once',
    async (index) => {
      const f = await fixture(index, true),
        { sources: s } = f,
        first = s.entries[0],
        job = s.estimates.syntheticJob(s.company.id, first.target.job_id!)!;
      const commitment = job.expenses[0];
      const payment = await s.estimates.submitExpense(s.company.id, job.id, {
        ...commitment,
        purchase_key: commitment.purchase_key,
        kind: 'payment',
        amount_minor: 4000,
        reference: crypto.randomUUID(),
        adjusts_expense_id: null,
      });
      await s.estimates.reviewExpense(
        s.company.id,
        job.id,
        payment,
        'approved',
        'Synthetic internal review',
      );
      const credit = await s.estimates.submitExpense(s.company.id, job.id, {
        ...commitment,
        purchase_key: commitment.purchase_key,
        kind: 'credit',
        amount_minor: 1000,
        reference: crypto.randomUUID(),
        adjusts_expense_id: payment,
      });
      await s.estimates.reviewExpense(
        s.company.id,
        job.id,
        credit,
        'approved',
        'Synthetic internal review',
      );
      const originals = s.entries.map((e) =>
        s.estimates.syntheticJob(s.company.id, e.target.job_id!)!,
      );
      const r = await f.read();
      const canonical = originals.map((job, i) =>
        jobFinancials({
          ...structuredClone(job),
          projection: {
            ...job.projection,
            remaining: { ...f.input.proposals[i].remaining },
            costs_complete: false,
          },
        }),
      );
      expect(r.coverage).toMatchObject({
        covered_jobs: 4,
        status: 'PARTIAL_NOT_FINAL',
      });
      expect(r.totals.proposed?.projectedMinor).toBe(
        canonical.reduce((n, j) => n + j.projected_cost_minor, 0),
      );
      expect(r.jobs[0].review.scenario.completion.totals).toMatchObject({
        recordedMinor: 3000,
        unpaidCommitmentMinor: 8500,
        remainingForecastMinor: 5500,
        costToCompleteMinor: 14000,
        projectedMinor: 17000,
      });
      expect(
        r.totals.proposed!.recordedMinor +
          r.totals.proposed!.costToCompleteMinor,
      ).toBe(r.totals.proposed!.projectedMinor);
      expect(
        s.entries.map((e) =>
          s.estimates.syntheticJob(s.company.id, e.target.job_id!),
        ),
      ).toEqual(originals);
      expect(r.jobs.every((j) => j.review.invoice.overall === 'NO_GO')).toBe(
        true,
      );
    },
  );
  it('withholds every aggregate cost when even one actual job has missing labor', async () => {
    const f = await fixture(0, true),
      original = f.sources.estimates.readSyntheticPrototypeSources.bind(
        f.sources.estimates,
      ),
      missing = f.sources.entries[1].target.job_id;
    vi.spyOn(
      f.sources.estimates,
      'readSyntheticPrototypeSources',
    ).mockImplementation((target) => {
      const source = original(target);
      if (target.job_id === missing && source.job) delete source.job.labor;
      return source;
    });
    const r = await f.read();
    expect(r.coverage.covered_jobs).toBe(3);
    expect(r.coverage.missing_job_ids).toEqual([missing]);
    expect(r.totals.proposed).toBeNull();
    expect(r.totals.recorded).toBeNull();
  });
  it('rejects duplicate jobs instead of double counting the same property handle', async () => {
    const f = await fixture();
    f.sources.entries = [f.sources.entries[0], f.sources.entries[0]];
    await expect(f.read()).rejects.toThrow();
  });
  it('rejects duplicate exact expense identity across separate jobs', async () => {
    const f = await fixture(),
      original = f.sources.estimates.readSyntheticPrototypeSources.bind(
        f.sources.estimates,
      ),
      first = original(f.sources.entries[0].target).job!.expenses[0].id;
    vi.spyOn(
      f.sources.estimates,
      'readSyntheticPrototypeSources',
    ).mockImplementation((t) => {
      const r = original(t);
      if (t.job_id === f.sources.entries[1].target.job_id)
        r.job!.expenses[0].id = first;
      return r;
    });
    await expect(f.read()).rejects.toThrow('Duplicate');
  });
  it('rejects mixed recorded currencies without conversion or fabricated FX', async () => {
    const f = await fixture(),
      original = f.sources.estimates.readSyntheticPrototypeSources.bind(
        f.sources.estimates,
      );
    vi.spyOn(
      f.sources.estimates,
      'readSyntheticPrototypeSources',
    ).mockImplementation((t) => {
      const r = original(t);
      if (t.job_id === f.sources.entries[1].target.job_id)
        r.job!.baseline.currency = 'EUR';
      return r;
    });
    await expect(f.read()).rejects.toThrow('Mixed currencies');
  });
  it('rejects foreign tenant handles and same-company repository substitution', async () => {
    const f = await fixture(),
      other = await fixture(1);
    f.sources.entries = [
      ...f.sources.entries.slice(0, 3),
      other.sources.entries[0],
    ];
    await expect(f.read()).rejects.toThrow();
    await expect(
      readPortfolioFinance(
        { ...other.sources, estimates: f.sources.estimates },
        other.input,
        other.gate,
      ),
    ).rejects.toThrow();
  });
  it('rejects wrong property associations and withdrawn admissions', async () => {
    const f = await fixture();
    f.sources.entries[0].target.location_id =
      f.sources.entries[1].target.location_id;
    await expect(f.read()).rejects.toThrow();
    f.gate.confirmed = false;
    await expect(f.read()).rejects.toThrow();
  });
  it.each(['field', 'estimator', 'inactive'] as const)(
    'rejects %s synthetic staff projections',
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
                  active: role !== 'inactive',
                  role: role === 'inactive' ? m.role : ('staff' as const),
                  staff_type: role === 'inactive' ? m.staff_type : role,
                }
              : m,
          ),
      );
      await expect(f.read()).rejects.toThrow();
    },
  );
  it.each([
    [
      'input proposal',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.proposals[0].remaining.materials++;
      },
    ],
    [
      'offer selector',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[0].offer_id = crypto.randomUUID();
      },
    ],
    [
      'receipt selector',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[1].receipt_id = crypto.randomUUID();
      },
    ],
    [
      'source array',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries = [...f.sources.entries];
      },
    ],
    [
      'target object',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[0].target = { ...f.sources.entries[0].target };
      },
    ],
    [
      'confirmation',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.gate.confirmed = false;
      },
    ],
  ] as const)(
    'rejects changed original %s after the final portfolio hash',
    async (_name, change) => {
      const f = await fixture(),
        triggered = digestChange(() => change(f));
      await expect(f.read()).rejects.toThrow();
      expect(triggered()).toBe(true);
    },
  );
  it('rechecks current staff at the final async boundary', async () => {
    const f = await fixture(),
      members = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
    const triggered = digestChange(() =>
      vi
        .spyOn(f.sources.operations, 'syntheticMemberships')
        .mockImplementation((org) =>
          members(org).map((m) => ({ ...m, active: false })),
        ),
    );
    await expect(f.read()).rejects.toThrow();
    expect(triggered()).toBe(true);
  });
  it('retains an immutable UNKNOWN snapshot after actual saved forecast edits; never replays or substitutes', async () => {
    const f = await fixture(),
      r = await f.read(),
      bytes = JSON.stringify(r),
      job = f.sources.estimates.syntheticJob(
        f.sources.company.id,
        f.sources.entries[0].target.job_id!,
      )!;
    await f.sources.estimates.projection(f.sources.company.id, job, {
      ...job.projection,
      remaining: { ...job.projection.remaining, other: 4500 },
    });
    expect(await inspectPortfolioFinance(r)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(JSON.stringify(r)).toBe(bytes);
    expect(() =>
      openPortfolioFinanceJob(r, r.jobs[0].target.job_id!),
    ).toThrow();
  });
  it('rejects copied/imported evidence and unknown navigation IDs', async () => {
    const f = await fixture(),
      r = await f.read();
    expect(await inspectPortfolioFinance(structuredClone(r))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() => openPortfolioFinanceJob(r, crypto.randomUUID())).toThrow();
    const { sha256, ...body } = r;
    expect(await documentHash(body)).toBe(sha256);
    expect(Object.isFrozen(r.jobs[0].review.scenario.proposed_remaining)).toBe(
      true,
    );
  });
  it.each([NaN, -1, 1.2, 9_000_000_000_001])(
    'rejects invalid minor amount %s',
    async (value) => {
      const f = await fixture();
      f.input.proposals[0].remaining.materials = value;
      await expect(f.read()).rejects.toThrow();
    },
  );
  it('rejects missing, duplicated or foreign proposal jobs', async () => {
    const f = await fixture();
    f.input.proposals.pop();
    await expect(f.read()).rejects.toThrow();
    const second = await fixture();
    second.input.proposals[1].job_id = second.input.proposals[0].job_id;
    await expect(second.read()).rejects.toThrow();
  });
  it('rejects executable/coercive proposal values without invoking them', async () => {
    const f = await fixture(),
      coerce = vi.fn(() => 100);
    f.input.proposals[0].remaining.materials = {
      valueOf: coerce,
    } as unknown as number;
    await expect(f.read()).rejects.toThrow();
    expect(coerce).not.toHaveBeenCalled();
  });
  it('rejects sparse and accessor proposal arrays without executing getters', async () => {
    const f = await fixture(),
      getter = vi.fn(() => f.input.proposals[0]);
    Object.defineProperty(f.input.proposals, '0', {
      get: getter,
      enumerable: true,
    });
    await expect(f.read()).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])(
    'renders accessible source-bound company %i form and defaults OFF',
    async (index) => {
      const f = await fixture(index);
      const off = renderToStaticMarkup(
        createElement(PortfolioFinance, { sources: f.sources }),
      );
      expect(off).toContain('Portfolio finance is off');
      expect(off).not.toContain('<input');
      const on = renderToStaticMarkup(
        createElement(PortfolioFinance, { sources: f.sources, enabled: true }),
      );
      expect(on).toContain('aria-label="Portfolio finance review"');
      expect(on).toContain('Portfolio remaining-cost proposals');
      expect(on.match(/inputMode="decimal"/g)).toHaveLength(20);
      expect(on).toContain('I explicitly confirm');
      expect(on).not.toContain('<header');
    },
  );
});
