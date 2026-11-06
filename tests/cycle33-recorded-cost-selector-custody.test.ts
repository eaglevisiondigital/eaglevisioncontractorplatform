import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { jobFinancials } from '../src/domain/jobs/financials';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import {
  readRecordedCostRequirements,
  assertRecordedCostRequirementsCurrent,
  inspectRecordedCostSource,
  continueRecordedCostSource,
} from '../src/lib/workflows/recorded-cost-requirements';
import type { CostCoverageSource } from '../src/lib/workflows/cost-coverage-path';

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
    entry = sources.entries[0],
    org = sources.company.id,
    job = entry.target.job_id!;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-retained-cost-owner',
  );
  const view = await readRecordedCostRequirements(sources, job, gate),
    requirements = view.original.rows.filter(
      (row) => row.kind === 'invoice_requirement',
    );
  expect(requirements.length).toBeGreaterThan(1);
  return { gate, sources, entry, org, job, view, requirements };
}
type Selection = Pick<CostCoverageSource, 'kind' | 'id'>;
function changingSelection(first: Selection, second: Selection) {
  let captures = 0;
  const input = new Proxy(
    { kind: first.kind, id: first.id },
    {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key),
          selected = captures === 0 ? first : second;
        if (key === 'id') captures++;
        return descriptor && (key === 'kind' || key === 'id')
          ? { ...descriptor, value: selected[key] }
          : descriptor;
      },
    },
  );
  return { input, captures: () => captures };
}

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: retains the first captured invoice requirement instead of substituting a second original ID`, async () => {
    const f = await fixture(brand),
      first = f.requirements[0],
      second = f.requirements[1],
      selection = changingSelection(first, second),
      before = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      result = inspectRecordedCostSource(f.view, selection.input);
    expect(first.id).toBe('ISSUED_SCOPE');
    expect(second.id).toBe('SAVED_TAX_REVIEW');
    expect(result).toBe(first);
    expect(result.id).not.toBe(second.id);
    expect(selection.captures()).toBe(1);
    expect(f.view.invoice_overall).toBe('NO_GO');
    expect(f.view.operational_ready).toBe(false);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(before);
  });

  it(`brand ${brand}: a later kind and ID pair cannot replace the captured original expense`, async () => {
    const f = await fixture(brand),
      first = f.view.original.rows.find((row) => row.kind === 'material')!;
    expect(first).toBeDefined();
    const selection = changingSelection(first, f.requirements[0]);
    expect(inspectRecordedCostSource(f.view, selection.input)).toBe(first);
    expect(selection.captures()).toBe(1);
  });

  it(`brand ${brand}: ordinary exact selectors preserve original row identity and canonical cost and invoice evidence without writes`, async () => {
    const f = await fixture(brand),
      before = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      canonical = jobFinancials(
        f.sources.estimates.syntheticJob(f.org, f.job)!,
      ),
      invoice = structuredClone(
        f.view.original.original.costs.evidence.invoice,
      ),
      financial = f.entry.release.read('staff'),
      command = vi.spyOn(f.entry.release, 'command'),
      review = vi.spyOn(f.sources.estimates, 'reviewExpense');
    for (const row of f.view.original.rows)
      expect(
        inspectRecordedCostSource(f.view, { kind: row.kind, id: row.id }),
      ).toBe(row);
    expect(f.view.original.original.canonical).toEqual(canonical);
    expect(f.view.invoice_overall).toBe(invoice.overall);
    expect(f.view.original.original.costs.evidence.invoice).toEqual(invoice);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(before);
    expect(f.entry.release.read('staff')).toEqual(financial);
    expect(command).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(f.view.operational_ready).toBe(false);
  });

  it(`brand ${brand}: native owner revocation during capture denies the source and continuation`, async () => {
    const f = await fixture(brand),
      row = f.requirements[0],
      callback = vi.fn();
    let revoked: Promise<void> | undefined;
    const input = new Proxy(
      { kind: row.kind, id: row.id },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'id' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => inspectRecordedCostSource(f.view, input)).toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => assertRecordedCostRequirementsCurrent(f.view)).toThrow();
    expect(
      await continueRecordedCostSource(f.view, row, callback, {
        current: callback,
        generation: 0,
      }),
    ).toEqual({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
    expect(callback).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: withdrawn original confirmation during capture does not expose a retained source`, async () => {
    const f = await fixture(brand),
      row = f.requirements[0],
      input = new Proxy(
        { kind: row.kind, id: row.id },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'id') f.gate.confirmed = false;
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    expect(() => inspectRecordedCostSource(f.view, input)).toThrow();
    expect(() => assertRecordedCostRequirementsCurrent(f.view)).toThrow();
  });

  it(`brand ${brand}: changed canonical cost state is denied before reading the selector`, async () => {
    const f = await fixture(brand),
      job = f.sources.estimates.syntheticJob(f.org, f.job)!;
    await f.sources.estimates.projection(f.org, job, {
      ...job.projection,
      remaining: {
        ...job.projection.remaining,
        other: job.projection.remaining.other + 1,
      },
    });
    const capture = vi.fn(() => {
        throw Error('Stale selector must not be read');
      }),
      input = new Proxy(
        { kind: f.requirements[0].kind, id: f.requirements[0].id },
        { getOwnPropertyDescriptor: capture },
      );
    expect(() => inspectRecordedCostSource(f.view, input)).toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
}

it('foreign-tenant and sibling-job expense IDs never substitute this job original source', async () => {
  const first = await fixture(0),
    foreign = await fixture(1),
    sibling = await readRecordedCostRequirements(
      first.sources,
      first.sources.entries[1].target.job_id!,
      first.gate,
    ),
    outside = [
      foreign.view.original.rows.find((row) => row.kind === 'material')!,
      sibling.original.rows.find((row) => row.kind === 'material')!,
    ];
  for (const row of outside) {
    expect(row).toBeDefined();
    expect(() =>
      inspectRecordedCostSource(first.view, { kind: row.kind, id: row.id }),
    ).toThrow('Unique exact recorded cost source required');
  }
  expect(
    inspectRecordedCostSource(first.view, {
      kind: first.requirements[0].kind,
      id: first.requirements[0].id,
    }),
  ).toBe(first.requirements[0]);
});

it('captured source selection cannot renew original UNKNOWN navigation or infer invoice issuance', async () => {
  const f = await fixture(0),
    row = inspectRecordedCostSource(f.view, {
      kind: f.requirements[0].kind,
      id: f.requirements[0].id,
    }),
    callback = vi.fn(() => {
      throw Error('Lost original navigation acknowledgment');
    }),
    live = { current: callback, generation: 0 },
    before = f.entry.release.read('staff');
  expect(
    (await continueRecordedCostSource(f.view, row, callback, live)).status,
  ).toBe('UNKNOWN');
  expect(
    (await continueRecordedCostSource(f.view, row, callback, live)).status,
  ).toBe('UNKNOWN');
  expect(callback).toHaveBeenCalledTimes(1);
  expect(f.entry.release.read('staff')).toEqual(before);
  expect(f.view.invoice_overall).toBe('NO_GO');
  expect(f.view.operational_ready).toBe(false);
});

it('default-OFF and unadmitted views do not inspect private sources or executable selectors', async () => {
  const getter = vi.fn(() => {
      throw Error('No private input access');
    }),
    sources = new Proxy({}, { get: getter }),
    input = new Proxy({}, { getOwnPropertyDescriptor: getter });
  await expect(
    readRecordedCostRequirements(sources as never, 'unadmitted'),
  ).rejects.toThrow('OFF');
  expect(() => inspectRecordedCostSource({} as never, input as never)).toThrow(
    'Original recorded-cost requirements required',
  );
  expect(getter).not.toHaveBeenCalled();
});

it('getter and malformed selectors are denied without reading executable fields or using a fallback ID', async () => {
  const f = await fixture(0),
    row = f.requirements[0],
    getter = vi.fn(() => row.id),
    input = Object.defineProperty({ kind: row.kind }, 'id', {
      enumerable: true,
      get: getter,
    });
  expect(() => inspectRecordedCostSource(f.view, input as never)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  for (const invalid of [
    { kind: row.kind },
    { kind: 'unrecorded', id: row.id },
    { kind: row.kind, id: 1 },
    { kind: row.kind, id: row.id, extra: true },
  ])
    expect(() => inspectRecordedCostSource(f.view, invalid as never)).toThrow();
  expect(
    inspectRecordedCostSource(f.view, { kind: row.kind, id: row.id }),
  ).toBe(row);
});
