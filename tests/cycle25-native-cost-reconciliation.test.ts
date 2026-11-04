import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import {
  filterCostCoverageActionSources,
  validateCostCoverageAction,
  continueCostCoverageAction,
  type CostCoverageActionInput,
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
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[0],
    job = entry.target.job_id!,
    org = sources.company.id;
  const read = () => readRecordedCostRequirements(sources, job, gate);
  return { gate, sources, entry, job, org, read, view: await read() };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function select(
  f: Fixture,
  kind: CostCoverageActionInput['kind'],
  id?: string,
): CostCoverageActionInput {
  const row = f.view.original.rows.find(
    (r) => r.kind === kind && (!id || r.id === id),
  )!;
  return {
    kind,
    id: row.id,
    expected_job_revision: f.view.original.original.costs.evidence.job_revision,
    purpose:
      kind === 'invoice_requirement' ? 'invoice_preparation' : 'cost_review',
  };
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
async function expense(f: Fixture, parent: string | null) {
  const source = f.sources.estimates.syntheticJob(f.org, f.job)!.expenses[0];
  return f.sources.estimates.submitExpense(f.org, f.job, {
    ...source,
    supplier: 'Synthetic exact supplier',
    reference: crypto.randomUUID(),
    purchase_key:
      (parent
        ? f.sources.estimates
            .syntheticJob(f.org, f.job)!
            .expenses.find((row) => row.id === parent)?.purchase_key
        : null) ?? crypto.randomUUID(),
    category: 'materials',
    kind: parent ? 'credit' : 'payment',
    amount_minor: parent ? 500 : 4200,
    estimate_line_id: f.sources.estimates.syntheticJob(f.org, f.job)!.baseline
      .lines[0].id,
    quantity_milli: 2500,
    unit: 'piece',
    unit_cost_minor: 1680,
    description: 'Literal [source] only',
    document_ids: [],
    material_approval_id: null,
    adjusts_expense_id: parent,
  });
}
describe('Cycle25 native labor/material reconciliation', () => {
  it.each([0, 1, 2])(
    'brand %i exact native adjustment and review events retain immutable canonical facts',
    async (brand) => {
      const f = await fixture(brand),
        parent = await expense(f, null),
        adjustment = await expense(f, parent);
      await f.sources.estimates.reviewExpense(
        f.org,
        f.job,
        parent,
        'approved',
        'Original native review',
      );
      await f.sources.estimates.reviewExpense(
        f.org,
        f.job,
        adjustment,
        'approved',
        'Original native adjustment review',
      );
      f.view = await f.read();
      const before = f.sources.estimates.syntheticJob(f.org, f.job)!,
        raw = JSON.stringify(before),
        result = validateCostCoverageAction(
          f.view,
          select(f, 'material', adjustment),
        );
      expect(result.recorded_source.expense).toMatchObject({
        id: adjustment,
        adjusts_expense_id: parent,
        quantity_milli: 2500,
        unit: 'piece',
        amount_minor: 500,
      });
      expect(result.recorded_source.adjustment_source?.id).toBe(parent);
      expect(result.recorded_source.adjustment_link).toBe(
        'EXACT_CURRENT_SOURCE',
      );
      expect(result.recorded_source.review_events).toEqual(
        before.events
          .filter((r) => r.submission_id === adjustment)
          .map(({ id, submission_id, decision, created_at }) => ({
            id,
            submission_id,
            decision,
            created_at,
          })),
      );
      const event = before.events.find((r) => r.submission_id === adjustment)!;
      const reviewed = validateCostCoverageAction(
        f.view,
        select(f, 'material_review', event.id),
      );
      expect(reviewed.recorded_source.review_event).toMatchObject({
        id: event.id,
        submission_id: adjustment,
      });
      expect(reviewed.recorded_source.expense?.id).toBe(adjustment);
      expect(reviewed.category?.category).toBe('materials');
      const canonical = jobFinancials(before);
      expect(result.canonical_totals).toMatchObject({
        categories: canonical.categories,
        revised_revenue_minor: canonical.revised_revenue_minor,
        projected_cost_minor: canonical.projected_cost_minor,
        projected_profit_minor: canonical.projected_profit_minor,
        projected_margin_bps: canonical.projected_margin_bps,
        complete: canonical.complete,
        profit_erosion: canonical.profit_erosion,
      });
      expect(Object.isFrozen(result.recorded_source.expense)).toBe(true);
      expect(result.recorded_source.durable_receipt).toBe(
        'UNVERIFIED_NO_OPERATIONAL_CUSTODY',
      );
      expect(result.recorded_source.provider_settlement).toBe('UNVERIFIED');
      expect(result.invoice_overall).toBe('NO_GO');
      expect(JSON.stringify(result)).not.toMatch(
        /unit_cost_minor|payroll_rate|staff-only|Synthetic exact supplier/,
      );
      expect(
        JSON.stringify(f.sources.estimates.syntheticJob(f.org, f.job)),
      ).toBe(raw);
      const original = validateCostCoverageAction(
        f.view,
        select(f, 'material', parent),
      );
      expect(original.recorded_source.adjusting_expense_ids).toContain(
        adjustment,
      );
    },
  );
  it.each([0, 1, 2])(
    'brand %i literal source search has no selection or financial authority',
    async (brand) => {
      const f = await fixture(brand),
        input = select(f, 'time'),
        row = f.view.original.rows.find((r) => r.id === input.id)!;
      expect(
        filterCostCoverageActionSources(f.view, {
          query: input.id,
          kind: 'all',
        }).rows,
      ).toContain(row);
      expect(
        filterCostCoverageActionSources(f.view, { query: '.*', kind: 'all' })
          .matching,
      ).toBe(0);
      expect(
        filterCostCoverageActionSources(f.view, { query: '[a-z]', kind: 'all' })
          .matching,
      ).toBe(0);
      expect(
        filterCostCoverageActionSources(f.view, {
          query: '',
          kind: 'material',
        }).rows.every((r) => r.kind === 'material'),
      ).toBe(true);
      expect(
        filterCostCoverageActionSources(f.view, {
          query: 'not-present',
          kind: 'all',
        }).matching,
      ).toBe(0);
      const validation = validateCostCoverageAction(f.view, input);
      expect(validation.recorded_source.time?.id).toBe(input.id);
      expect(validation.recorded_source.labor_lineage?.requirement).toBe(
        'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
      );
      expect(validation.recorded_source).not.toHaveProperty(
        'labor_amount_minor',
      );
      expect(validation.financial_execution).toBe(false);
    },
  );
  it('actual recorded time correction preserves both exact entries and unposted lineage without labor allocation', async () => {
    const f = await fixture(),
      original = select(f, 'time');
    const id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
      job_id: f.job,
      overhead_center: null,
      task: 'Native exact correction',
      kind: 'work',
      started_at: '2026-02-05T10:00:00.000Z',
      ended_at: '2026-02-05T10:30:00.000Z',
      billable: false,
      corrects_id: original.id,
    });
    if (typeof id !== 'string') throw Error('Native ID required');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'Original native review',
    );
    f.view = await f.read();
    const corrected = validateCostCoverageAction(f.view, select(f, 'time', id));
    const predecessor = validateCostCoverageAction(
      f.view,
      select(f, 'time', original.id),
    );
    expect(corrected.recorded_source.time?.corrects_id).toBe(original.id);
    expect(corrected.labor?.corrects_id).toBe(original.id);
    expect(corrected.labor?.recorded_review).toBe('approved');
    expect(predecessor.labor?.correcting_entry_ids).toContain(id);
    expect(corrected.labor?.requirement).toBe(
      'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
    );
    expect(corrected.recorded_source).not.toHaveProperty(
      'payroll_amount_minor',
    );
    expect(corrected.recorded_source.locked_period_link).toBe(
      'AVAILABLE_JOB_PERIODS_NOT_PER_ENTRY_ALLOCATION',
    );
    expect(corrected.invoice_prepared).toBe(false);
  });
  it('missing recorded material quantities remain unknown, never zero', async () => {
    const f = await fixture(),
      result = validateCostCoverageAction(
        f.view,
        select(f, 'material', f.view.original.original.material.expense_id!),
      );
    expect(result.recorded_source.expense?.quantity_milli).toBeNull();
    expect(result.recorded_source.expense?.unit).toBeNull();
    expect(result.recorded_source.adjustment_link).toBe('NONE_RECORDED');
  });
  it('unavailable exact adjustment reference stays UNKNOWN without matching amount or description', async () => {
    const f = await fixture(),
      missing = crypto.randomUUID(),
      id = await expense(f, missing);
    f.view = await f.read();
    const result = validateCostCoverageAction(
      f.view,
      select(f, 'material', id),
    );
    expect(result.recorded_source.expense?.adjusts_expense_id).toBe(missing);
    expect(result.recorded_source.adjustment_link).toBe('UNKNOWN_SOURCE_LINK');
    expect(result.recorded_source.adjustment_source).toBeNull();
  });
  it('invoice requirement inspection preserves canonical totals and independent provider gaps', async () => {
    const f = await fixture(),
      result = validateCostCoverageAction(
        f.view,
        select(f, 'invoice_requirement'),
      );
    expect(result.recorded_source.expense).toBeNull();
    expect(result.recorded_source.expense_link).toBe('NOT_APPLICABLE');
    expect(result.canonical_totals.complete).toBe(false);
    expect(result.invoice_prepared).toBe(false);
    expect(result.financial_exceptions).toEqual(f.view.requirements);
  });
  it.each(['revoked', 'property', 'version', 'gate'] as const)(
    '%s drift hides selection and reconciliation facts',
    async (mode) => {
      const f = await fixture(),
        input = select(f, 'time'),
        callback = vi.fn();
      if (mode === 'revoked') revoke(f);
      if (mode === 'property') f.entry.target.location_id = 'foreign';
      if (mode === 'version') f.entry.target.version_id = 'foreign';
      if (mode === 'gate') f.gate.confirmed = false;
      expect(() =>
        filterCostCoverageActionSources(f.view, { query: '', kind: 'all' }),
      ).toThrow();
      expect(() => validateCostCoverageAction(f.view, input)).toThrow();
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
  it('another company source cannot be selected even if query searches its ID', async () => {
    const f = await fixture(),
      foreign = await fixture(1),
      input = select(foreign, 'time');
    expect(
      filterCostCoverageActionSources(f.view, { query: input.id, kind: 'all' })
        .matching,
    ).toBe(0);
    expect(() =>
      validateCostCoverageAction(f.view, {
        ...input,
        expected_job_revision:
          f.view.original.original.costs.evidence.job_revision,
      }),
    ).toThrow();
  });
  it('native source change invalidates previous facts and fresh evidence remains independent of issue authority', async () => {
    const f = await fixture(),
      id = f.view.original.original.material.expense_id!,
      old = validateCostCoverageAction(f.view, select(f, 'material', id)),
      frozen = JSON.stringify(old);
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      id,
      'approved',
      'Original reviewed source',
    );
    expect(() =>
      filterCostCoverageActionSources(f.view, { query: '', kind: 'all' }),
    ).toThrow();
    f.view = await f.read();
    const next = validateCostCoverageAction(f.view, select(f, 'material', id));
    expect(next.recorded_source.review_events).toHaveLength(1);
    expect(next.canonical_totals.projected_cost_minor).not.toBe(
      old.canonical_totals.projected_cost_minor,
    );
    expect(JSON.stringify(old)).toBe(frozen);
    expect(next.invoice_prepared).toBe(false);
  });
  it.each(['getter', 'extra', 'long', 'invalid-kind'] as const)(
    '%s filter is denied without evaluating untrusted input',
    async (mode) => {
      const f = await fixture(),
        getter = vi.fn(() => '');
      const input =
        mode === 'getter'
          ? Object.defineProperty({ kind: 'all' }, 'query', { get: getter })
          : mode === 'extra'
            ? { query: '', kind: 'all', authority: true }
            : mode === 'long'
              ? { query: 'x'.repeat(201), kind: 'all' }
              : { query: '', kind: 'foreign' };
      expect(() =>
        filterCostCoverageActionSources(f.view, input as never),
      ).toThrow();
      expect(getter).not.toHaveBeenCalled();
    },
  );
  it('concurrent original navigation invokes one callback without creating expense or ledger records', async () => {
    const f = await fixture(),
      input = select(f, 'time'),
      before = f.sources.estimates.syntheticJob(f.org, f.job),
      callback = vi.fn(),
      live = { current: callback, generation: 0 };
    const result = await Promise.all([
      continueCostCoverageAction(f.view, input, true, callback, live),
      continueCostCoverageAction(f.view, input, true, callback, live),
    ]);
    expect(result.some((r) => r.status === 'CURRENT_REVIEW_ONLY')).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(before);
  });
  it('ambiguous original navigation blocks fresh evidence without replay or replacement receipt', async () => {
    const f = await fixture(),
      input = select(f, 'time'),
      callback = vi.fn(() => {
        throw Error('Lost original acknowledgment');
      });
    expect(
      (
        await continueCostCoverageAction(f.view, input, true, callback, {
          current: callback,
          generation: 0,
        })
      ).status,
    ).toBe('UNKNOWN');
    await expect(f.read()).rejects.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
