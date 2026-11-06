import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readRecordedCostRequirements,
  assertRecordedCostRequirementsCurrent,
  inspectRecordedCostSource,
} from '../src/lib/workflows/recorded-cost-requirements';
import { inspectCostCoverageSource } from '../src/lib/workflows/cost-coverage-path';
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
});
async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    job = entry.target.job_id!,
    org = sources.company.id;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const view = await readRecordedCostRequirements(sources, job, gate),
    row = view.original.rows.find((r) => r.kind === 'material')!;
  if (!row) throw Error('Original canonical material source required');
  return { gate, sources, entry, org, job, view, row };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const revoke = (f: Fixture) =>
  f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
const action = (f: Fixture) => ({
  kind: f.row.kind,
  id: f.row.id,
  expected_job_revision: f.view.original.original.costs.evidence.job_revision,
  purpose: 'cost_review' as const,
});

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: recorded-cost facade withholds private material facts when the final descriptor capture revokes actual access`, async () => {
    const f = await fixture(brand);
    let captures = 0,
      revoked: Promise<void> | undefined,
      result: unknown;
    const input = new Proxy(
      { kind: f.row.kind, id: f.row.id },
      {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'kind' && ++captures === 2) revoked = revoke(f);
          return descriptor;
        },
      },
    );
    try {
      result = inspectRecordedCostSource(f.view, input);
    } catch {
      /* Current source guard must deny private data. */
    }
    expect(revoked).toBeDefined();
    await revoked;
    expect(result).toBeUndefined();
    expect(() => assertRecordedCostRequirementsCurrent(f.view)).toThrow();
  });

  it(`brand ${brand}: original cost-source reader also withholds after executable input withdraws its current native authority`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const input = new Proxy(
      { kind: f.row.kind, id: f.row.id },
      {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'id' && !revoked) revoked = revoke(f);
          return descriptor;
        },
      },
    );
    expect(() => inspectCostCoverageSource(f.view.original, input)).toThrow();
    expect(revoked).toBeDefined();
    await revoked;
  });

  it(`brand ${brand}: ordinary exact sources preserve canonical integer totals, labor uncertainty and independent invoice requirements without writes`, async () => {
    const f = await fixture(brand),
      job = f.sources.estimates.syntheticJob(f.org, f.job)!,
      canonical = jobFinancials(job),
      property = f.sources.property.read(f.org),
      writers = [
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'reviewExpense'),
        vi.spyOn(f.sources.property, 'saveVisit'),
      ];
    for (const kind of [
      'time',
      'material',
      'material_review',
      'invoice_requirement',
    ] as const) {
      const row = f.view.original.rows.find((r) => r.kind === kind)!;
      expect(inspectRecordedCostSource(f.view, { id: row.id, kind })).toBe(row);
      const review = validateCostCoverageAction(f.view, {
        kind,
        id: row.id,
        expected_job_revision:
          f.view.original.original.costs.evidence.job_revision,
        purpose:
          kind === 'invoice_requirement'
            ? 'invoice_preparation'
            : 'cost_review',
      });
      expect(review.source).toBe(row);
      expect(review.canonical_totals.categories).toEqual(canonical.categories);
      expect(review.canonical_totals.projected_cost_minor).toBe(
        canonical.projected_cost_minor,
      );
      expect(review.canonical_totals.projected_profit_minor).toBe(
        canonical.projected_profit_minor,
      );
      expect(review.canonical_totals.projected_margin_bps).toBe(
        canonical.projected_margin_bps,
      );
      expect(review.financial_execution).toBe(false);
      expect(review.invoice_prepared).toBe(false);
      expect(review.recorded_source.durable_receipt).toBe(
        'UNVERIFIED_NO_OPERATIONAL_CUSTODY',
      );
      expect(review.recorded_source.provider_settlement).toBe('UNVERIFIED');
      expect(review.invoice_requirements).toEqual(
        f.view.original.original.costs.evidence.invoice.requirements,
      );
      if (kind === 'time')
        expect(review.labor?.requirement).toBe(
          'UNPOSTED_OR_UNVERIFIED_NOT_ZERO_COST',
        );
    }
    expect(f.sources.estimates.syntheticJob(f.org, f.job)).toEqual(job);
    expect(f.sources.property.read(f.org)).toEqual(property);
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
  });

  it(`brand ${brand}: own accessors and foreign source IDs are denied without evaluating a getter or granting fuzzy selection`, async () => {
    const f = await fixture(brand),
      getter = vi.fn(() => f.row.id),
      input = Object.defineProperty({ kind: f.row.kind }, 'id', {
        get: getter,
      });
    expect(() => inspectRecordedCostSource(f.view, input as never)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    for (const id of ['foreign-source-id', '.*', f.row.title])
      expect(() =>
        inspectRecordedCostSource(f.view, { kind: f.row.kind, id }),
      ).toThrow();
    expect(
      inspectRecordedCostSource(f.view, { kind: f.row.kind, id: f.row.id }),
    ).toBe(f.row);
  });

  it(`brand ${brand}: currently authorized foreign-company source cannot substitute its material reference into this job`, async () => {
    const f = await fixture(brand),
      foreign = await fixture((brand + 1) % 3);
    expect(foreign.org).not.toBe(f.org);
    expect(() =>
      inspectRecordedCostSource(f.view, {
        kind: foreign.row.kind,
        id: foreign.row.id,
      }),
    ).toThrow();
    expect(
      inspectRecordedCostSource(f.view, { kind: f.row.kind, id: f.row.id }),
    ).toBe(f.row);
    expect(
      inspectRecordedCostSource(foreign.view, {
        kind: foreign.row.kind,
        id: foreign.row.id,
      }),
    ).toBe(foreign.row);
  });

  it(`brand ${brand}: native material review stales original row selection and a fresh reader preserves recorded event identity without invoice authority`, async () => {
    const f = await fixture(brand),
      expense = f.view.original.original.material.expense_id!;
    await f.sources.estimates.reviewExpense(
      f.org,
      f.job,
      expense,
      'approved',
      'Exact native local material review',
    );
    expect(() =>
      inspectRecordedCostSource(f.view, { kind: f.row.kind, id: f.row.id }),
    ).toThrow();
    const fresh = await readRecordedCostRequirements(f.sources, f.job, f.gate),
      native = f.sources.estimates.syntheticJob(f.org, f.job)!,
      event = native.events.find((e) => e.submission_id === expense)!;
    expect(
      inspectRecordedCostSource(fresh, {
        kind: 'material_review',
        id: event.id,
      }).id,
    ).toBe(event.id);
    expect(
      validateCostCoverageAction(fresh, {
        kind: 'material_review',
        id: event.id,
        expected_job_revision:
          fresh.original.original.costs.evidence.job_revision,
        purpose: 'cost_review',
      }),
    ).toMatchObject({
      financial_execution: false,
      invoice_prepared: false,
      cost_coverage: fresh.coverage,
    });
  });

  it(`brand ${brand}: original async navigation keeps UNKNOWN after actual callback-time revocation and cannot invoke another callback`, async () => {
    const f = await fixture(brand),
      callback = vi.fn(async () => {
        await revoke(f);
      }),
      live = { current: callback, generation: 1 },
      input = action(f);
    expect(
      await continueCostCoverageAction(f.view, input, true, callback, live),
    ).toMatchObject({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(
      await continueCostCoverageAction(f.view, input, true, callback, live),
    ).toMatchObject({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(() => inspectRecordedCostSource(f.view, input)).toThrow();
  });
}
it('OFF original requirements read denies before caller-owned source selectors', async () => {
  const getter = vi.fn(() => {
      throw Error('Private source');
    }),
    sources = new Proxy({}, { get: getter });
  await expect(
    readRecordedCostRequirements(sources as never, 'unadmitted'),
  ).rejects.toThrow('OFF');
  expect(getter).not.toHaveBeenCalled();
});
