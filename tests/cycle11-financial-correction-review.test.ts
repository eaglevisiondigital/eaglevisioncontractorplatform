import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { documentHash } from '../src/domain/release/preview';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFinancialCorrectionSources,
  openFinancialCorrectionException,
  prepareFinancialCorrection,
  reconcileFinancialCorrection,
  type FinancialCorrectionProposal,
} from '../src/lib/workflows/financial-correction-review';
import {
  FinancialCorrectionReview,
  FinancialCorrectionSourceButton,
} from '../src/components/workflows/FinancialCorrectionReview';
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
  const sourceInput = { as_of: new Date().toISOString(), input_revision: 1 };
  const review = await readFinancialCorrectionSources(
    sources,
    sourceInput,
    gate,
  );
  const detail = openFinancialCorrectionException(
    review,
    review.baseline.queue.find(
      (q) => q.job_id === sources.entries[0].target.job_id,
    )!.id,
  );
  const input: FinancialCorrectionProposal = {
    remaining: {
      ...detail.before.remaining,
      other: detail.before.remaining.other + 1200,
    },
    reason:
      'Review the remaining inspection materials and exact recorded costs.',
    confirmed: true,
    excludes_unpaid_commitments: true,
    source_sha256: detail.source_sha256,
    input_revision: 2,
  };
  return {
    sources,
    gate,
    sourceInput,
    review,
    detail,
    input,
    prepare: () => prepareFinancialCorrection(detail, input),
  };
}
function digestChange(mode: string, change: () => void | Promise<void>) {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let fired = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      !fired &&
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes(`"mode":"${mode}"`)
    ) {
      fired = true;
      await change();
    }
    return result;
  });
  return () => fired;
}
function sourceSnapshot(f: Awaited<ReturnType<typeof fixture>>) {
  return JSON.stringify(
    f.sources.entries.map((e) => ({
      source: f.sources.estimates.readSyntheticPrototypeSources(e.target),
      release: e.release.read('staff'),
    })),
  );
}
describe('Cycle 11 exact-source financial correction proposals', () => {
  it('source action accessible name preserves the visible label for speech navigation', () => {
    const markup = renderToStaticMarkup(
      createElement(FinancialCorrectionSourceButton, {
        title: 'Cost coverage <unverified>',
        job: 'Exact synthetic job',
        disabled: false,
        onInspect: () => {},
      }),
    );
    const accessibleName = /aria-label="([^"]+)"/.exec(markup)?.[1];
    expect(markup).toContain('>Inspect source</button>');
    expect(accessibleName).toBe(
      'Inspect source: Cost coverage &lt;unverified&gt; for Exact synthetic job',
    );
    expect(accessibleName).toContain('Inspect source');
    expect(markup).not.toContain('<unverified>');
  });
  it.each([0, 1, 2])(
    'company %i prepares a current immutable source-bound proposal while UNKNOWN remains UNKNOWN',
    async (index) => {
      const f = await fixture(index),
        before = sourceSnapshot(f),
        writers = [
          vi.spyOn(f.sources.estimates, 'projection'),
          vi.spyOn(f.sources.estimates, 'submitExpense'),
          vi.spyOn(f.sources.estimates, 'recordTime'),
          vi.spyOn(f.sources.estimates, 'payroll'),
          ...f.sources.entries.map((e) => vi.spyOn(e.release, 'command')),
        ];
      const p = await f.prepare();
      expect(p.target).toEqual(f.sources.entries[0].target);
      expect(p.exception.id).toBe(f.detail.exception.id);
      expect(p.source_job_revision).toBe(
        f.detail.exception.source.job_revision,
      );
      expect(p.original_offer_id).toBe(f.sources.entries[0].offer_id);
      expect(p.original_receipt_id).toBe(f.sources.entries[0].receipt_id);
      expect(p.before.cost_coverage).toBe('UNKNOWN');
      expect(p.after.cost_coverage).toBe('UNKNOWN');
      expect(p.before.costs).toBeNull();
      expect(p.after.costs).toBeNull();
      expect(p.comparison.cost_to_complete_delta_minor).toBeNull();
      expect(
        p.comparison.categories.find((c) => c.category === 'other'),
      ).toMatchObject({ changed: true, delta_minor: 1200 });
      expect(p.comparison.categories.filter((c) => !c.changed)).toHaveLength(4);
      expect(p.after.invoice_status).toBe('NO_GO');
      expect(Object.values(p.authority).every((v) => v === false)).toBe(true);
      expect(Object.values(p.unchanged).every((v) => v === true)).toBe(true);
      expect(p.after.provider_evidence.settlementStatus).toBe('UNKNOWN');
      expect(Object.isFrozen(p.after.remaining)).toBe(true);
      expect(JSON.stringify(p)).not.toMatch(
        /PRIVATE staff|Synthetic planning supplier|journey-.*@example|5550100100|internal_notes|cash_minor|burden_minor|unit_cost_minor/,
      );
      const { id, sha256, ...body } = p;
      expect(await documentHash(body)).toBe(sha256);
      expect(id).toBe(`financial-correction:${sha256}`);
      expect(await reconcileFinancialCorrection(p)).toEqual({
        status: 'CURRENT_UNSAVED_REVIEW_ONLY',
        replacement: null,
      });
      expect(sourceSnapshot(f)).toBe(before);
      writers.forEach((w) => expect(w).not.toHaveBeenCalled());
    },
  );
  it.each([0, 1, 2])(
    'company %i uses canonical known-cost totals and preserves recorded costs/commitments',
    async (index) => {
      const f = await fixture(index, true),
        p = await f.prepare();
      expect(p.before.costs).not.toBeNull();
      expect(p.after.costs).not.toBeNull();
      expect(p.after.costs!.recordedMinor).toBe(p.before.costs!.recordedMinor);
      expect(p.after.costs!.unpaidCommitmentMinor).toBe(
        p.before.costs!.unpaidCommitmentMinor,
      );
      expect(p.comparison.cost_to_complete_delta_minor).toBe(1200);
      expect(p.comparison.projected_contribution_delta_minor).toBe(-1200);
      expect(p.after.costs!.costToCompleteMinor).toBe(
        p.before.costs!.costToCompleteMinor + 1200,
      );
      expect(p.after.cost_coverage).not.toBe('DECLARED_COSTS_COMPLETE');
      expect(p.after.margin!.projectedContributionMinor).toBe(
        p.before.margin!.projectedContributionMinor - 1200,
      );
    },
  );
  it('explicit unchanged proposal records no arithmetic or coverage improvement', async () => {
    const f = await fixture();
    f.input.remaining = { ...f.detail.before.remaining };
    const p = await f.prepare();
    expect(
      p.comparison.categories.every((c) => !c.changed && c.delta_minor === 0),
    ).toBe(true);
    expect(p.after).toEqual(p.before);
    expect(p.after.costs).toBeNull();
  });
  it('keeps same-property jobs and distinct exception identities separate', async () => {
    const f = await fixture(),
      a = f.sources.entries[0],
      b = f.sources.entries[3];
    expect(a.target.location_id).toBe(b.target.location_id);
    expect(a.target.job_id).not.toBe(b.target.job_id);
    const d = openFinancialCorrectionException(
      f.review,
      f.review.baseline.queue.find((q) => q.job_id === b.target.job_id)!.id,
    );
    const p = await prepareFinancialCorrection(d, {
      ...f.input,
      source_sha256: d.source_sha256,
      remaining: { ...d.before.remaining },
    });
    expect(p.target).toEqual(b.target);
    expect(p.target.version_id).not.toBe(a.target.version_id);
  });
  it('requires exact retained inspected source and rejects copied review/detail/packet', async () => {
    const f = await fixture();
    expect(() =>
      openFinancialCorrectionException(
        structuredClone(f.review),
        f.detail.exception.id,
      ),
    ).toThrow();
    await expect(
      prepareFinancialCorrection(structuredClone(f.detail), f.input),
    ).rejects.toThrow();
    const p = await f.prepare();
    expect(await reconcileFinancialCorrection(structuredClone(p))).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(() =>
      openFinancialCorrectionException(f.review, crypto.randomUUID()),
    ).toThrow();
  });
  it('prevents duplicate and concurrent preparation before awaiting without a replacement receipt', async () => {
    const f = await fixture(),
      result = await Promise.allSettled([f.prepare(), f.prepare()]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(f.prepare()).rejects.toThrow('already held');
    f.input.reason =
      'A different reason cannot bypass the exact held exception.';
    await expect(f.prepare()).rejects.toThrow('already held');
  });
  it('retains the hold across a new source container and newly read detail', async () => {
    const f = await fixture();
    await f.prepare();
    const fresh = await readFinancialCorrectionSources(
        { ...f.sources },
        { ...f.sourceInput },
        f.gate,
      ),
      detail = openFinancialCorrectionException(fresh, f.detail.exception.id);
    await expect(
      prepareFinancialCorrection(detail, {
        ...f.input,
        source_sha256: detail.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });
  it('lost acknowledgment stays UNKNOWN and cannot be replayed', async () => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const result = await digest(...args);
        if (
          new TextDecoder()
            .decode(args[1] as ArrayBuffer)
            .includes('"mode":"LOCAL_FINANCIAL_CORRECTION_PROPOSAL"')
        )
          throw Error('Lost acknowledgment');
        return result;
      });
    await expect(f.prepare()).rejects.toThrow('Lost acknowledgment');
    spy.mockRestore();
    await expect(f.prepare()).rejects.toThrow('already held');
  });
  it('retains frozen packet evidence after an actual saved revision and refuses stale reads or replacement', async () => {
    const f = await fixture(),
      p = await f.prepare(),
      immutable = JSON.stringify(p),
      job = f.sources.estimates.syntheticJob(
        f.sources.company.id,
        p.target.job_id!,
      )!;
    await f.sources.estimates.projection(f.sources.company.id, job, {
      ...job.projection,
      remaining: { ...job.projection.remaining, other: 800 },
    });
    expect(await reconcileFinancialCorrection(p)).toEqual({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(JSON.stringify(p)).toBe(immutable);
    expect(() =>
      openFinancialCorrectionException(f.review, f.detail.exception.id),
    ).toThrow();
    const fresh = await readFinancialCorrectionSources(
        f.sources,
        { ...f.sourceInput },
        f.gate,
      ),
      d = openFinancialCorrectionException(fresh, f.detail.exception.id);
    await expect(
      prepareFinancialCorrection(d, {
        ...f.input,
        source_sha256: d.source_sha256,
      }),
    ).rejects.toThrow('already held');
  });
  it.each(['staff', 'inactive', 'foreign'] as const)(
    'rejects %s staff after source inspection',
    async (kind) => {
      const f = await fixture(),
        members = f.sources.operations.syntheticMemberships.bind(
          f.sources.operations,
        );
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
        (org) =>
          members(org).map((m) =>
            m.user_id === f.detail.target.actor_id
              ? {
                  ...m,
                  role: kind === 'staff' ? 'staff' : m.role,
                  active: kind !== 'inactive',
                  organization_id:
                    kind === 'foreign' ? 'foreign' : m.organization_id,
                }
              : m,
          ),
      );
      await expect(f.prepare()).rejects.toThrow();
    },
  );
  it('denies foreign company, customer, property and canonical repository substitution', async () => {
    const f = await fixture(),
      foreign = await fixture(1);
    await expect(
      readFinancialCorrectionSources(
        { ...f.sources, entries: [foreign.sources.entries[0]] },
        f.sourceInput,
        f.gate,
      ),
    ).rejects.toThrow();
    await expect(
      readFinancialCorrectionSources(
        { ...f.sources, estimates: foreign.sources.estimates },
        f.sourceInput,
        f.gate,
      ),
    ).rejects.toThrow();
    f.sources.entries[0].target.customer_id =
      f.sources.entries[1].target.customer_id;
    await expect(f.prepare()).rejects.toThrow();
  });
  it.each([
    [
      'amount',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.remaining.other++;
      },
    ],
    [
      'remaining identity',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.remaining = { ...f.input.remaining };
      },
    ],
    [
      'reason',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.input.reason = 'Changed live proposal';
      },
    ],
    [
      'confirmation',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.gate.confirmed = false;
      },
    ],
    [
      'source root',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries = [...f.sources.entries];
      },
    ],
    [
      'receipt',
      (f: Awaited<ReturnType<typeof fixture>>) => {
        f.sources.entries[0].receipt_id = crypto.randomUUID();
      },
    ],
  ] as const)(
    'rejects %s drift after the proposal hash and permanently holds the attempt',
    async (_name, change) => {
      const f = await fixture(),
        fired = digestChange('LOCAL_FINANCIAL_CORRECTION_PROPOSAL', () =>
          change(f),
        );
      await expect(f.prepare()).rejects.toThrow();
      expect(fired()).toBe(true);
    },
  );
  it('rechecks staff eligibility at the final proposal await', async () => {
    const f = await fixture(),
      members = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      fired = digestChange('LOCAL_FINANCIAL_CORRECTION_PROPOSAL', () => {
        vi.spyOn(
          f.sources.operations,
          'syntheticMemberships',
        ).mockImplementation((org) =>
          members(org).map((m) => ({ ...m, active: false })),
        );
      });
    await expect(f.prepare()).rejects.toThrow();
    expect(fired()).toBe(true);
  });
  it('reconciliation UNKNOWN stays UNKNOWN after confirmation is restored', async () => {
    const f = await fixture(),
      p = await f.prepare();
    f.gate.confirmed = false;
    expect((await reconcileFinancialCorrection(p)).status).toBe('UNKNOWN');
    f.gate.confirmed = true;
    expect((await reconcileFinancialCorrection(p)).status).toBe('UNKNOWN');
  });
  it('source input and original identity drift after source hash fail closed', async () => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(sampleCompanies[0], gate),
      input = { as_of: new Date().toISOString(), input_revision: 1 },
      fired = digestChange('LOCAL_FINANCIAL_CORRECTION_SOURCES', () => {
        input.input_revision++;
      });
    await expect(
      readFinancialCorrectionSources(sources, input, gate),
    ).rejects.toThrow();
    expect(fired()).toBe(true);
  });
  it('default OFF rejects before touching source getters and renders without source reads', async () => {
    const f = await fixture(),
      getter = vi.fn(() => f.sources.estimates),
      poison = { ...f.sources };
    Object.defineProperty(poison, 'estimates', {
      get: getter,
      enumerable: true,
    });
    await expect(
      readFinancialCorrectionSources(poison, f.sourceInput),
    ).rejects.toThrow();
    const off = renderToStaticMarkup(
      createElement(FinancialCorrectionReview, { sources: poison }),
    );
    expect(off).toContain('Financial correction review is off');
    expect(off).not.toContain('<input');
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([NaN, -1, 1.25, 9_000_000_000_001])(
    'rejects invalid forecast %s before reserving an attempt',
    async (amount) => {
      const f = await fixture();
      f.input.remaining.materials = amount;
      await expect(f.prepare()).rejects.toThrow();
      f.input.remaining = { ...f.detail.before.remaining };
      await expect(f.prepare()).resolves.toBeTruthy();
    },
  );
  it.each([
    'confirmation',
    'unpaid commitments',
    'source hash',
    'unknown field',
    'empty reason',
  ] as const)(
    'rejects invalid %s without creating financial authority',
    async (kind) => {
      const f = await fixture();
      const bad = {
        ...f.input,
        ...(kind === 'confirmation'
          ? { confirmed: false }
          : kind === 'unpaid commitments'
            ? { excludes_unpaid_commitments: false }
            : kind === 'source hash'
              ? { source_sha256: '0'.repeat(64) }
              : kind === 'unknown field'
                ? { settled: true }
                : { reason: '   ' }),
      };
      await expect(
        prepareFinancialCorrection(
          f.detail,
          bad as FinancialCorrectionProposal,
        ),
      ).rejects.toThrow();
    },
  );
  it('rejects executable input accessors without invoking them, including a late accessor change', async () => {
    const f = await fixture(),
      getter = vi.fn(() => f.input.remaining);
    const bad = { ...f.input };
    Object.defineProperty(bad, 'remaining', { get: getter, enumerable: true });
    await expect(prepareFinancialCorrection(f.detail, bad)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    const late = vi.fn(() => ({ ...f.detail.before.remaining }));
    digestChange('LOCAL_FINANCIAL_CORRECTION_PROPOSAL', () => {
      Object.defineProperty(f.input, 'remaining', {
        get: late,
        enumerable: true,
      });
    });
    await expect(f.prepare()).rejects.toThrow();
    expect(late).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2])(
    'company %i exposes a named source-first accessible component without preparatory writes',
    async (index) => {
      const f = await fixture(index),
        before = sourceSnapshot(f),
        markup = renderToStaticMarkup(
          createElement(FinancialCorrectionReview, {
            sources: f.sources,
            enabled: true,
          }),
        );
      expect(markup).toContain('aria-label="Financial correction review"');
      expect(markup).toContain('Load saved financial exceptions');
      expect(markup).toContain('Nothing is saved, resolved or paid');
      expect(markup).not.toContain('<table');
      expect(sourceSnapshot(f)).toBe(before);
    },
  );
});
