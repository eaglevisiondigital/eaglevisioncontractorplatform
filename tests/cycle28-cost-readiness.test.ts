import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ui = vi.hoisted(() => ({ index: 0, seeds: new Map<number, unknown>() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      const index = ui.index++;
      return actual.useState(
        ui.seeds.has(index) ? ui.seeds.get(index) : initial,
      );
    }) as typeof actual.useState,
  };
});
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import {
  validateCostCoverageAction,
  continueCostCoverageAction,
  type CostCoverageActionValidation,
} from '../src/lib/workflows/cost-coverage-actions';
import { CostCoverageActions } from '../src/components/workflows/CostCoverageActions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  ui.index = 0;
  ui.seeds.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    org = all.company.id;
  const read = () => readRecordedCostRequirements(sources, job, gate);
  return { gate, all, entry, sources, job, org, read, view: await read() };
}
type F = Awaited<ReturnType<typeof fixture>>;
function verify(f: F, kind: 'time' | 'material', id?: string) {
  const row = f.view.original.rows.find(
    (r) => r.kind === kind && (!id || r.id === id),
  )!;
  return validateCostCoverageAction(f.view, {
    kind,
    id: row.id,
    expected_job_revision: f.view.original.original.costs.evidence.job_revision,
    purpose: 'cost_review',
  });
}
function markup(f: F, result: CostCoverageActionValidation) {
  ui.index = 0;
  ui.seeds = new Map([
    [1, f.view],
    [2, result.source.key],
    [4, result],
  ] as [number, unknown][]);
  return renderToStaticMarkup(
    createElement(CostCoverageActions, {
      sources: f.sources,
      selectedJobId: f.job,
      enabled: true,
    }),
  );
}
it.each([0, 1, 2])(
  'brand %i selected native time facts are visible before original review navigation',
  async (brand) => {
    const f = await fixture(brand),
      result = verify(f, 'time'),
      native = f.sources.estimates
        .readSyntheticPrototypeSources(f.entry.target)
        .workforce.entries.find((e) => e.id === result.source.id)!;
    expect(result.recorded_source.time?.started_at).toBe(native.started_at);
    expect(result.recorded_source.time?.ended_at).toBe(native.ended_at);
    const html = markup(f, result);
    expect(html).toContain('Exact selected source facts');
    expect(html).toContain(
      `Started: ${native.started_at}; ended: ${native.ended_at}`,
    );
    expect(html).toContain('This is not zero-cost proof.');
    expect(result.recorded_source.labor_lineage?.locked_labor_reference).toBe(
      false,
    );
    expect(result.invoice_prepared).toBe(false);
  },
);
it.each([0, 1, 2])(
  'brand %i original material approval requires a fresh exact read and retains canonical profit and independent invoice gaps',
  async (brand) => {
    const f = await fixture(brand),
      id = f.view.original.original.material.expense_id!,
      before = verify(f, 'material', id),
      snapshot = JSON.stringify(before),
      nativeOriginal = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ).bundle.version;
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      id,
      'approved',
      'Explicit synthetic source review only',
    );
    expect(markup(f, before)).not.toContain('Exact selected source facts');
    expect(() => verify(f, 'material', id)).toThrow();
    const view = await f.read(),
      current = verify({ ...f, view }, 'material', id),
      native = f.sources.estimates.syntheticJob(f.org, f.job)!;
    expect(current.source.facts.join(' ')).toContain('records approved');
    expect(current.recorded_source.review_events[0].submission_id).toBe(id);
    expect(current.canonical_totals.categories).toEqual(
      jobFinancials(native).categories,
    );
    expect(current.canonical_totals.projected_profit_minor).toBe(
      jobFinancials(native).projected_profit_minor,
    );
    expect(current.invoice_overall).toBe('NO_GO');
    expect(current.invoice_requirements.some((r) => r.status !== 'PASS')).toBe(
      true,
    );
    expect(current.recorded_source.provider_settlement).toBe('UNVERIFIED');
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).bundle
        .version,
    ).toEqual(nativeOriginal);
    expect(JSON.stringify(before)).toBe(snapshot);
  },
);
it.each([0, 1, 2])(
  'brand %i actual corrected time keeps the exact original lineage without allocating labor cost or clearing invoice requirements',
  async (brand) => {
    const f = await fixture(brand),
      original = verify(f, 'time'),
      time = original.recorded_source.time!;
    const id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
      job_id: f.job,
      overhead_center: null,
      task: 'Reviewed native correction',
      kind: time.kind,
      started_at: time.started_at,
      ended_at: time.ended_at,
      billable: false,
      corrects_id: time.id,
    });
    if (typeof id !== 'string')
      throw Error('Exact native correction ID required');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'Synthetic internal correction only',
    );
    const view = await f.read(),
      current = verify({ ...f, view }, 'time', id),
      previous = verify({ ...f, view }, 'time', time.id);
    expect(current.recorded_source.time?.corrects_id).toBe(time.id);
    expect(current.source.facts.join(' ')).toContain(time.id);
    expect(
      previous.recorded_source.labor_lineage?.correcting_entry_ids,
    ).toContain(id);
    expect(current.recorded_source.labor_lineage?.locked_labor_reference).toBe(
      false,
    );
    expect(current.action).toBe('UNPOSTED_OR_UNVERIFIED_LABOR_REVIEW');
    expect(current.invoice_overall).toBe('NO_GO');
    expect(current.canonical_totals.categories).toEqual(
      jobFinancials(f.sources.estimates.syntheticJob(f.org, f.job)!).categories,
    );
  },
);
it.each([0, 1, 2])(
  'brand %i revoked access withholds previously visible exact source facts',
  async (brand) => {
    const f = await fixture(brand),
      result = verify(f, 'time'),
      original = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        original(org).map((m) =>
          m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
        ),
    );
    const html = markup(f, result);
    expect(html).not.toContain('Exact selected source facts');
    expect(html).not.toContain(result.recorded_source.time!.started_at);
    expect(() => verify(f, 'time')).toThrow();
  },
);
it('foreign selectors cannot obtain another company exact source facts', async () => {
  const own = await fixture(),
    other = await fixture(1),
    foreign = verify(other, 'time');
  expect(() =>
    validateCostCoverageAction(own.view, {
      kind: 'time',
      id: foreign.source.id,
      expected_job_revision:
        own.view.original.original.costs.evidence.job_revision,
      purpose: 'cost_review',
    }),
  ).toThrow();
});
it('concurrent original navigation remains one-use and a lost acknowledgment never becomes a cost receipt', async () => {
  const f = await fixture(),
    result = verify(f, 'time'),
    input = {
      kind: 'time' as const,
      id: result.source.id,
      expected_job_revision: result.job_revision,
      purpose: 'cost_review' as const,
    },
    callback = vi.fn(() => {
      throw Error('Lost original ACK');
    }),
    live = { current: callback, generation: 0 };
  const outcomes = await Promise.all([
    continueCostCoverageAction(f.view, input, true, callback, live),
    continueCostCoverageAction(f.view, input, true, callback, live),
  ]);
  expect(outcomes.some((r) => r.status === 'UNKNOWN')).toBe(true);
  expect(callback).toHaveBeenCalledTimes(1);
  await expect(f.read()).rejects.toThrow();
  expect(result.recorded_source.durable_receipt).toBe(
    'UNVERIFIED_NO_OPERATIONAL_CUSTODY',
  );
});
it('default OFF remains source-free', () => {
  const getter = vi.fn(() => {
      throw Error('Private access');
    }),
    sources = Object.defineProperty({}, 'company', { get: getter });
  ui.index = 0;
  ui.seeds.clear();
  expect(
    renderToStaticMarkup(
      createElement(CostCoverageActions, {
        sources: sources as never,
        enabled: false,
      }),
    ),
  ).toContain('Cost coverage actions are OFF.');
  expect(getter).not.toHaveBeenCalled();
});
