import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import { confirmCostCorrectionReview } from '../src/lib/workflows/cost-correction-review';
import {
  validateCostCoverageAction,
  continueCostCoverageAction,
  type CostCoverageActionInput,
} from '../src/lib/workflows/cost-coverage-actions';
import { CostCoverageActions } from '../src/components/workflows/CostCoverageActions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture(brand = 0, correction = true) {
  const gate = { enabled: true, confirmed: true },
    sources = await (
      correction ? prepareCorrectionPreviewSources : prepareOperatingSources
    )(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    job = entry.target.job_id!,
    org = sources.company.id;
  const view = await readRecordedCostRequirements(sources, job, gate);
  return { gate, sources, entry, job, org, view };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function select(
  f: Fixture,
  kind: CostCoverageActionInput['kind'],
  id?: string,
): CostCoverageActionInput {
  const source = f.view.original.rows.find(
    (r) => r.kind === kind && (!id || r.id === id),
  )!;
  return {
    kind,
    id: source.id,
    expected_job_revision: f.view.original.original.costs.evidence.job_revision,
    purpose:
      kind === 'invoice_requirement' ? 'invoice_preparation' : 'cost_review',
  };
}
async function drift(f: Fixture) {
  const job = f.sources.estimates.syntheticJob(f.org, f.job)!;
  await f.sources.estimates.projection(f.org, job, {
    ...job.projection,
    remaining: {
      ...job.projection.remaining,
      other: job.projection.remaining.other + 1,
    },
  });
}
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
describe('Cycle24 actual cost and preparation action validation', () => {
  it.each([0, 1, 2])(
    'brand %i exact pending native material action keeps canonical costs and independent requirements',
    async (brand) => {
      const f = await fixture(brand),
        before = f.sources.estimates.syntheticJob(f.org, f.job)!,
        input = select(
          f,
          'material',
          f.view.original.original.material.expense_id!,
        ),
        result = validateCostCoverageAction(f.view, input),
        canonical = jobFinancials(before);
      expect(result.action).toBe('EXISTING_PENDING_MATERIAL_REVIEW');
      expect(result.category?.projected_minor).toBe(
        canonical.categories.find((c) => c.category === 'materials')!
          .projected_minor,
      );
      expect(result.canonical_margin).toBe(canonical.projected_margin_bps);
      expect(result.financial_exceptions).toEqual(
        f.view.detail.job.requirements,
      );
      expect(result.financial_execution).toBe(false);
      expect(result.invoice_prepared).toBe(false);
      expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(before);
    },
  );
  it.each([0, 1, 2])(
    'brand %i approved unposted labor opens original field review without allocating or posting labor',
    async (brand) => {
      const f = await fixture(brand),
        result = validateCostCoverageAction(f.view, select(f, 'time')),
        callback = vi.fn();
      expect(result.action).toBe('UNPOSTED_OR_UNVERIFIED_LABOR_REVIEW');
      expect(result.labor?.requirement).toBe(
        'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
      );
      expect(result.labor?.recorded_review).toBe('approved');
      expect(result.labor).not.toHaveProperty('amount_minor');
      const payroll = vi.spyOn(f.sources.estimates, 'payroll');
      expect(
        (
          await continueCostCoverageAction(
            f.view,
            select(f, 'time'),
            true,
            callback,
            { current: callback, generation: 0 },
          )
        ).status,
      ).toBe('CURRENT_REVIEW_ONLY');
      expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, 'field');
      expect(payroll).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 2])(
    'brand %i exact invoice requirement remains independent of cost review',
    async (brand) => {
      const f = await fixture(brand),
        input = select(f, 'invoice_requirement'),
        result = validateCostCoverageAction(f.view, input);
      expect(result.invoice_requirement).toEqual(
        f.view.original.original.costs.evidence.invoice.requirements.find(
          (r) => r.id === input.id,
        ),
      );
      expect(result.invoice_overall).toBe('NO_GO');
      expect(result.destination).toBe('invoice');
      expect(result.limits).toContain('cannot issue');
      expect(result.financial_execution).toBe(false);
      expect(() =>
        validateCostCoverageAction(f.view, {
          ...input,
          purpose: 'cost_review',
        }),
      ).toThrow();
      expect(() =>
        validateCostCoverageAction(f.view, {
          ...select(f, 'material'),
          purpose: 'invoice_preparation',
        }),
      ).toThrow();
    },
  );
  it('original native material approval changes action and canonical category while invoice prerequisites remain blocked', async () => {
    const f = await fixture(),
      input = select(
        f,
        'material',
        f.view.original.original.material.expense_id!,
      );
    await confirmCostCorrectionReview(
      f.view.original.original,
      {
        expense_id: input.id,
        decision: 'approved',
        reason: 'Explicit exact native review.',
      },
      true,
    );
    expect(() => validateCostCoverageAction(f.view, input)).toThrow();
    const view = await readRecordedCostRequirements(f.sources, f.job, f.gate),
      result = validateCostCoverageAction(view, {
        ...input,
        expected_job_revision:
          view.original.original.costs.evidence.job_revision,
      });
    expect(result.action).toBe('RECORDED_MATERIAL_INSPECT_ONLY');
    expect(result.material_review_ids).toHaveLength(1);
    expect(result.invoice_overall).toBe('NO_GO');
    expect(result.category?.projected_minor).toBe(
      jobFinancials(
        f.sources.estimates.syntheticJob(f.org, f.job)!,
      ).categories.find((c) => c.category === 'materials')!.projected_minor,
    );
  });
  it('actual locked labor references stay inspect only without reopening or double posting', async () => {
    const f = await fixture(0, false),
      id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'Ended native labor',
        kind: 'work',
        started_at: '2026-02-03T10:00:00.000Z',
        ended_at: '2026-02-03T11:00:00.000Z',
        billable: false,
        corrects_id: null,
      });
    if (typeof id !== 'string') throw Error('ID');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'Native synthetic review',
    );
    await f.sources.estimates.payroll(
      f.org,
      '2026-02-03T00:00:00.000Z',
      '2026-02-04T00:00:00.000Z',
      {},
      true,
    );
    const payroll = vi.spyOn(f.sources.estimates, 'payroll'),
      before = await f.sources.estimates.workforce(f.org),
      view = await readRecordedCostRequirements(f.sources, f.job, f.gate),
      result = validateCostCoverageAction(view, {
        kind: 'time',
        id,
        expected_job_revision:
          view.original.original.costs.evidence.job_revision,
        purpose: 'cost_review',
      });
    expect(result.action).toBe('LOCKED_LABOR_INSPECT_ONLY');
    expect(result.labor?.locked_labor_reference).toBe(true);
    expect(payroll).not.toHaveBeenCalled();
    expect(await f.sources.estimates.workforce(f.org)).toEqual(before);
  });
  it.each(['revision', 'missing', 'foreign', 'extra', 'getter'] as const)(
    '%s selector cannot prepare an action',
    async (mode) => {
      const f = await fixture(),
        input = select(f, 'time'),
        getter = vi.fn(() => input.id);
      if (mode === 'revision') input.expected_job_revision++;
      if (mode === 'missing') input.id = 'missing';
      if (mode === 'foreign')
        input.id = (await fixture(1)).view.labor[0].entry_id;
      const attempted =
        mode === 'extra'
          ? { ...input, execute: true }
          : mode === 'getter'
            ? Object.defineProperty({ ...input }, 'id', { get: getter })
            : input;
      expect(() => validateCostCoverageAction(f.view, attempted)).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it.each(['job', 'revoked', 'gate', 'property', 'version'] as const)(
    '%s drift withholds exact navigation',
    async (mode) => {
      const f = await fixture(),
        input = select(f, 'time'),
        callback = vi.fn();
      validateCostCoverageAction(f.view, input);
      if (mode === 'job') await drift(f);
      if (mode === 'revoked') revoke(f);
      if (mode === 'gate') f.gate.confirmed = false;
      if (mode === 'property') f.entry.target.location_id = 'foreign';
      if (mode === 'version') f.entry.target.version_id = 'foreign';
      expect(
        (
          await continueCostCoverageAction(f.view, input, true, callback, {
            current: callback,
            generation: 0,
          })
        ).status,
      ).toBe('UNKNOWN');
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('confirmation and live callback generation are required before original navigation', async () => {
    const f = await fixture(),
      input = select(f, 'time'),
      callback = vi.fn();
    expect(
      (
        await continueCostCoverageAction(f.view, input, false, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(
      (
        await continueCostCoverageAction(f.view, input, true, callback, {
          current: undefined,
          generation: 1,
        })
      ).status,
    ).toBe('WITHHELD_NO_DISPATCH');
    expect(callback).not.toHaveBeenCalled();
  });
  it('concurrent navigation uses original one-use custody', async () => {
    const f = await fixture(),
      input = select(f, 'time'),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    const results = await Promise.all([
      continueCostCoverageAction(f.view, input, true, callback, live),
      continueCostCoverageAction(f.view, input, true, callback, live),
    ]);
    expect(results.map((r) => r.status)).toContain('CURRENT_REVIEW_ONLY');
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('lost acknowledgment remains UNKNOWN across fresh reads with no replacement or replay', async () => {
    const f = await fixture(),
      input = select(f, 'time'),
      callback = vi.fn(() => {
        throw Error('Lost ack');
      });
    expect(
      (
        await continueCostCoverageAction(f.view, input, true, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(
      readRecordedCostRequirements(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('copied original handles confer no preparation authority', async () => {
    const f = await fixture();
    expect(() =>
      validateCostCoverageAction({ ...f.view }, select(f, 'time')),
    ).toThrow();
  });
  it('OFF component reads no sources and exposes no private costs', () => {
    const getter = vi.fn(() => {
        throw Error('No source read');
      }),
      sources = Object.defineProperty({}, 'company', { get: getter });
    const html = renderToStaticMarkup(
      createElement(CostCoverageActions, {
        sources: sources as never,
        enabled: false,
      }),
    );
    expect(html).toContain('Cost coverage actions are OFF');
    expect(getter).not.toHaveBeenCalled();
    expect(html).not.toContain('staff-cost');
  });
});
