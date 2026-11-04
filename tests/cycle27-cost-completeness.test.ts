import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { jobFinancials } from '../src/domain/jobs/financials';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { readRecordedCostRequirements } from '../src/lib/workflows/recorded-cost-requirements';
import {
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
    org = all.company.id,
    view = await readRecordedCostRequirements(sources, job, gate);
  return { gate, sources, entry, job, org, view };
}
it.each([0, 1, 2])(
  'brand %i selected labor review carries every exact independent native invoice requirement',
  async (brand) => {
    const f = await fixture(brand),
      row = f.view.original.rows.find((r) => r.kind === 'time')!,
      evidence = f.view.original.original.costs.evidence;
    const result = validateCostCoverageAction(f.view, {
      kind: row.kind,
      id: row.id,
      expected_job_revision: evidence.job_revision,
      purpose: 'cost_review',
    });
    expect(evidence.invoice.requirements.length).toBeGreaterThan(1);
    expect(result).toHaveProperty(
      'invoice_requirements',
      evidence.invoice.requirements,
    );
    expect(result.invoice_prepared).toBe(false);
    expect(result.financial_execution).toBe(false);
  },
);

it.each([0, 1, 2])(
  'brand %i each native source keeps its own status and the independent complete requirement list without writes',
  async (brand) => {
    const f = await fixture(brand),
      native = f.sources.estimates.syntheticJob(f.org, f.job)!,
      before = JSON.stringify(native),
      canonical = jobFinancials(native);
    for (const kind of [
      'time',
      'material',
      'material_review',
      'invoice_requirement',
    ] as const) {
      const row = f.view.original.rows.find((r) => r.kind === kind)!;
      const result = validateCostCoverageAction(f.view, {
        kind,
        id: row.id,
        expected_job_revision: native.lock_revision,
        purpose:
          kind === 'invoice_requirement'
            ? 'invoice_preparation'
            : 'cost_review',
      });
      expect(result.invoice_requirements).toEqual(
        f.view.original.original.costs.evidence.invoice.requirements,
      );
      expect(result.source.status).toBe(row.status);
      expect(result.canonical_totals.categories).toEqual(canonical.categories);
      expect(result.canonical_totals.projected_profit_minor).toBe(
        canonical.projected_profit_minor,
      );
      expect(Object.isFrozen(result.invoice_requirements)).toBe(true);
      expect(
        result.invoice_requirements.every(
          (r) => Object.keys(r).sort().join(',') === 'detail,id,status',
        ),
      ).toBe(true);
      expect(result.financial_execution).toBe(false);
    }
    expect(JSON.stringify(f.sources.estimates.syntheticJob(f.org, f.job))).toBe(
      before,
    );
  },
);
it.each([0, 1, 2])(
  'brand %i actual material approval changes canonical cost but cannot clear independent invoice requirements',
  async (brand) => {
    const f = await fixture(brand),
      id = f.view.original.original.material.expense_id!,
      before = validateCostCoverageAction(f.view, {
        kind: 'material',
        id,
        expected_job_revision:
          f.view.original.original.costs.evidence.job_revision,
        purpose: 'cost_review',
      }),
      frozen = JSON.stringify(before);
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      id,
      'approved',
      'Exact canonical staff review',
    );
    const current = await readRecordedCostRequirements(
        f.sources,
        f.job,
        f.gate,
      ),
      result = validateCostCoverageAction(current, {
        kind: 'material',
        id,
        expected_job_revision:
          current.original.original.costs.evidence.job_revision,
        purpose: 'cost_review',
      });
    expect(result.canonical_totals.projected_cost_minor).not.toBe(
      before.canonical_totals.projected_cost_minor,
    );
    expect(result.invoice_requirements).toEqual(
      current.original.original.costs.evidence.invoice.requirements,
    );
    expect(result.invoice_overall).toBe('NO_GO');
    expect(result.invoice_prepared).toBe(false);
    expect(result.recorded_source.durable_receipt).toBe(
      'UNVERIFIED_NO_OPERATIONAL_CUSTODY',
    );
    expect(JSON.stringify(before)).toBe(frozen);
    expect(() =>
      validateCostCoverageAction(f.view, {
        kind: 'material',
        id,
        expected_job_revision: before.job_revision,
        purpose: 'cost_review',
      }),
    ).toThrow();
  },
);
it('revoked staff cannot expose retained canonical invoice requirements', async () => {
  const f = await fixture(),
    original = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    ),
    row = f.view.original.rows[0];
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() =>
    validateCostCoverageAction(f.view, {
      kind: row.kind,
      id: row.id,
      expected_job_revision:
        f.view.original.original.costs.evidence.job_revision,
      purpose: 'cost_review',
    }),
  ).toThrow();
});
it('foreign selected source and mismatched invoice purpose cannot borrow this job requirement list', async () => {
  const f = await fixture(),
    other = await fixture(1),
    row = other.view.original.rows.find((r) => r.kind === 'time')!;
  expect(() =>
    validateCostCoverageAction(f.view, {
      kind: row.kind,
      id: row.id,
      expected_job_revision:
        f.view.original.original.costs.evidence.job_revision,
      purpose: 'cost_review',
    }),
  ).toThrow();
  const own = f.view.original.rows.find((r) => r.kind === 'time')!;
  expect(() =>
    validateCostCoverageAction(f.view, {
      kind: own.kind,
      id: own.id,
      expected_job_revision:
        f.view.original.original.costs.evidence.job_revision,
      purpose: 'invoice_preparation',
    }),
  ).toThrow();
});
it('reading all requirements creates no navigation grant and original UNKNOWN cannot be replayed', async () => {
  const f = await fixture(),
    row = f.view.original.rows.find((r) => r.kind === 'time')!,
    input = {
      kind: row.kind,
      id: row.id,
      expected_job_revision:
        f.view.original.original.costs.evidence.job_revision,
      purpose: 'cost_review' as const,
    },
    callback = vi.fn(() => {
      throw Error('Lost native navigation ACK');
    }),
    live = { current: callback, generation: 0 };
  expect(
    validateCostCoverageAction(f.view, input).invoice_requirements.length,
  ).toBeGreaterThan(0);
  expect(
    (await continueCostCoverageAction(f.view, input, false, callback, live))
      .status,
  ).toBe('WITHHELD_NO_DISPATCH');
  expect(callback).not.toHaveBeenCalled();
  expect(
    (await continueCostCoverageAction(f.view, input, true, callback, live))
      .status,
  ).toBe('UNKNOWN');
  await expect(
    readRecordedCostRequirements(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  expect(callback).toHaveBeenCalledTimes(1);
});
