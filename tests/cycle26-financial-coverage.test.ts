import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import {
  refreshCostCoverageActionSelection,
  filterCostCoverageActionSources,
  validateCostCoverageAction,
  continueCostCoverageAction,
} from '../src/lib/workflows/cost-coverage-actions';
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
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    org = all.company.id;
  const read = () => readRecordedCostRequirements(sources, job, gate);
  return { all, gate, sources, entry, job, org, read, view: await read() };
}
it.each([0, 1, 2])(
  'brand %i retains each exact unchanged original kind but never its previous confirmation or verification',
  async (brand) => {
    const f = await fixture(brand),
      current = await f.read(),
      before = f.sources.estimates.syntheticJob(f.org, f.job);
    for (const kind of [
      'time',
      'material',
      'material_review',
      'invoice_requirement',
    ] as const) {
      const row = f.view.original.rows.find((r) => r.kind === kind)!;
      expect(row).toBeTruthy();
      const retained = refreshCostCoverageActionSelection(
        f.view,
        current,
        row.key,
      );
      expect(retained.selection_key).toBe(row.key);
      expect(retained.status).toBe('UNCHANGED_SOURCE_REVERIFY_REQUIRED');
      expect(retained.input).toEqual({
        kind,
        id: row.id,
        expected_job_revision:
          current.original.original.costs.evidence.job_revision,
        purpose:
          kind === 'invoice_requirement'
            ? 'invoice_preparation'
            : 'cost_review',
      });
      expect(retained.requires_verification).toBe(true);
      expect(retained.previous_confirmation_retained).toBe(false);
      expect(retained).not.toHaveProperty('inspection');
      expect(Object.isFrozen(retained.input)).toBe(true);
      const verified = validateCostCoverageAction(current, retained.input!);
      expect(verified.financial_execution).toBe(false);
      expect(verified.invoice_prepared).toBe(false);
    }
    expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(before);
  },
);
it.each([0, 1, 2])(
  'brand %i unchanged source remains selectable outside literal filtered results after refresh',
  async (brand) => {
    const f = await fixture(brand),
      row = f.view.original.rows.find((r) => r.kind === 'time')!,
      current = await f.read();
    expect(
      filterCostCoverageActionSources(current, {
        query: 'no-matching-original-source',
        kind: 'all',
      }).matching,
    ).toBe(0);
    const retained = refreshCostCoverageActionSelection(
      f.view,
      current,
      row.key,
    );
    expect(retained.selection_key).toBe(row.key);
    expect(
      validateCostCoverageAction(current, retained.input!).recorded_source.time
        ?.id,
    ).toBe(row.id);
    expect(
      filterCostCoverageActionSources(current, { query: '.*', kind: 'all' })
        .matching,
    ).toBe(0);
  },
);
it.each([0, 1, 2])(
  'brand %i native review stales old selection while copied canonical cost/profit and independent invoice evidence remain truthful',
  async (brand) => {
    const f = await fixture(brand),
      id = f.view.original.original.material.expense_id!,
      row = f.view.original.rows.find(
        (r) => r.kind === 'material' && r.id === id,
      )!;
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      id,
      'approved',
      'Exact native staff review',
    );
    const current = await f.read(),
      retained = refreshCostCoverageActionSelection(f.view, current, row.key);
    expect(retained.status).toBe('STALE_SOURCE_RESELECT_REQUIRED');
    expect(retained.selection_key).toBeNull();
    expect(retained.input).toBeNull();
    const input = {
        kind: 'material' as const,
        id,
        expected_job_revision:
          current.original.original.costs.evidence.job_revision,
        purpose: 'cost_review' as const,
      },
      result = validateCostCoverageAction(current, input),
      canonical = jobFinancials(
        f.sources.estimates.syntheticJob(f.org, f.job)!,
      );
    expect(result.recorded_source.review_events).toHaveLength(1);
    expect(result.canonical_totals.categories).toEqual(canonical.categories);
    expect(result.canonical_totals.projected_profit_minor).toBe(
      canonical.projected_profit_minor,
    );
    expect(result.canonical_totals.projected_margin_bps).toBe(
      canonical.projected_margin_bps,
    );
    expect(result.invoice_overall).toBe('NO_GO');
    expect(result.recorded_source.durable_receipt).toBe(
      'UNVERIFIED_NO_OPERATIONAL_CUSTODY',
    );
    expect(result.recorded_source.provider_settlement).toBe('UNVERIFIED');
  },
);
it('foreign company and sibling native job cannot retain another selected source', async () => {
  const f = await fixture(),
    other = await fixture(1),
    key = f.view.original.rows[0].key;
  expect(() =>
    refreshCostCoverageActionSelection(f.view, other.view, key),
  ).toThrow();
  const sibling = await readRecordedCostRequirements(
    { ...f.all, entries: [f.all.entries[1]] },
    f.all.entries[1].target.job_id!,
    f.gate,
  );
  expect(() =>
    refreshCostCoverageActionSelection(f.view, sibling, key),
  ).toThrow();
});
it('revoked staff cannot refresh, expose canonical totals or keep prior confirmation', async () => {
  const f = await fixture(),
    current = await f.read(),
    key = f.view.original.rows[0].key,
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() =>
    refreshCostCoverageActionSelection(f.view, current, key),
  ).toThrow();
});
it('empty, forged, missing or unbounded selections never choose first/latest/source by wording', async () => {
  const f = await fixture(),
    current = await f.read();
  expect(
    refreshCostCoverageActionSelection(f.view, current, '').selection_key,
  ).toBeNull();
  expect(
    refreshCostCoverageActionSelection(
      { ...f.view },
      current,
      f.view.original.rows[0].key,
    ).selection_key,
  ).toBeNull();
  expect(() =>
    refreshCostCoverageActionSelection(f.view, current, 'material:missing'),
  ).toThrow();
  expect(() =>
    refreshCostCoverageActionSelection(f.view, current, 'x'.repeat(501)),
  ).toThrow();
});
it('refresh retains presentation only: original confirmation/live lease and one-use custody still govern navigation', async () => {
  const f = await fixture(),
    current = await f.read(),
    row = f.view.original.rows.find((r) => r.kind === 'time')!,
    retained = refreshCostCoverageActionSelection(f.view, current, row.key),
    callback = vi.fn(),
    live = { current: callback, generation: 0 };
  expect(
    (
      await continueCostCoverageAction(
        current,
        retained.input!,
        false,
        callback,
        live,
      )
    ).status,
  ).toBe('WITHHELD_NO_DISPATCH');
  expect(callback).not.toHaveBeenCalled();
  const outcomes = await Promise.all([
    continueCostCoverageAction(current, retained.input!, true, callback, live),
    continueCostCoverageAction(current, retained.input!, true, callback, live),
  ]);
  expect(outcomes.some((r) => r.status === 'CURRENT_REVIEW_ONLY')).toBe(true);
  expect(callback).toHaveBeenCalledTimes(1);
});
it('UNKNOWN original navigation cannot be renewed by refreshing an original wrapper', async () => {
  const f = await fixture(),
    current = await f.read(),
    row = f.view.original.rows.find((r) => r.kind === 'time')!,
    retained = refreshCostCoverageActionSelection(f.view, current, row.key),
    callback = vi.fn(() => {
      throw Error('Lost exact ACK');
    });
  expect(
    (
      await continueCostCoverageAction(
        current,
        retained.input!,
        true,
        callback,
        { current: callback, generation: 0 },
      )
    ).status,
  ).toBe('UNKNOWN');
  await expect(f.read()).rejects.toThrow();
  expect(() =>
    refreshCostCoverageActionSelection(f.view, current, row.key),
  ).toThrow();
  expect(callback).toHaveBeenCalledTimes(1);
});
