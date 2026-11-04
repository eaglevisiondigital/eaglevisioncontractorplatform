import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import {
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
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareCorrectionPreviewSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    org = all.company.id,
    view = await readRecordedCostRequirements(sources, job, gate);
  const time = view.original.rows.find((r) => r.kind === 'time')!,
    material = view.original.rows.find((r) => r.kind === 'material')!,
    select = (row = time): CostCoverageActionInput => ({
      kind: row.kind,
      id: row.id,
      expected_job_revision: view.original.original.costs.evidence.job_revision,
      purpose: 'cost_review',
    });
  return { gate, sources, entry, job, org, view, time, material, select };
}
it.each([0, 1, 2])(
  'brand %i strict own-data selection cannot be substituted through caller property reads',
  async (brand) => {
    const f = await fixture(brand),
      original = f.select(),
      get = vi.fn((target: CostCoverageActionInput, key: PropertyKey) =>
        key === 'kind'
          ? f.material.kind
          : key === 'id'
            ? f.material.id
            : Reflect.get(target, key),
      ),
      input = new Proxy(original, { get }),
      before = JSON.stringify(f.sources.estimates.syntheticJob(f.org, f.job)),
      result = validateCostCoverageAction(f.view, input);
    expect(result.source).toBe(f.time);
    expect(result.recorded_source.time?.id).toBe(original.id);
    expect(result.recorded_source.expense).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(result.financial_execution).toBe(false);
    expect(result.invoice_prepared).toBe(false);
    expect(JSON.stringify(f.sources.estimates.syntheticJob(f.org, f.job))).toBe(
      before,
    );
  },
);
it.each([0, 1, 2])(
  'brand %i native expense review invalidates an exact descriptor selection rather than adopting a new source',
  async (brand) => {
    const f = await fixture(brand),
      id = f.view.original.original.material.expense_id!,
      before = validateCostCoverageAction(f.view, f.select()),
      input = f.select();
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      id,
      'approved',
      'Explicit synthetic native review',
    );
    expect(() => validateCostCoverageAction(f.view, input)).toThrow();
    const current = await readRecordedCostRequirements(
        f.sources,
        f.job,
        f.gate,
      ),
      result = validateCostCoverageAction(current, {
        ...input,
        expected_job_revision:
          current.original.original.costs.evidence.job_revision,
      });
    expect(result.source.id).toBe(input.id);
    expect(result.recorded_source.time?.id).toBe(
      before.recorded_source.time?.id,
    );
    expect(result.invoice_overall).toBe('NO_GO');
    expect(result.recorded_source.provider_settlement).toBe('UNVERIFIED');
    expect(result.canonical_totals.projected_cost_minor).not.toBe(
      before.canonical_totals.projected_cost_minor,
    );
  },
);
it('foreign source descriptors cannot borrow an authorized local row through a get trap', async () => {
  const own = await fixture(),
    other = await fixture(1),
    get = vi.fn(() => own.time.id),
    input = new Proxy({ ...own.select(), id: other.time.id }, { get });
  expect(() => validateCostCoverageAction(own.view, input)).toThrow();
  expect(get).not.toHaveBeenCalled();
});
it('revoked staff cannot expose a captured canonical selection', async () => {
  const f = await fixture(),
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() => validateCostCoverageAction(f.view, f.select())).toThrow();
});
it('competing original navigation stays one-use and a lost ACK cannot become a receipt or permit replay', async () => {
  const f = await fixture(),
    callback = vi.fn(() => {
      throw Error('Lost native navigation ACK');
    }),
    live = { current: callback, generation: 0 },
    input = f.select();
  const outcomes = await Promise.all([
    continueCostCoverageAction(f.view, input, true, callback, live),
    continueCostCoverageAction(f.view, input, true, callback, live),
  ]);
  expect(outcomes.some((r) => r.status === 'UNKNOWN')).toBe(true);
  expect(callback).toHaveBeenCalledTimes(1);
  await expect(
    readRecordedCostRequirements(f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it('default OFF never reads source records', async () => {
  const read = vi.fn(() => {
      throw Error('Private source access');
    }),
    sources = Object.defineProperty({}, 'company', { get: read });
  await expect(
    readRecordedCostRequirements(sources as never, 'job'),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
