import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readCostSavedRevision,
  compareCostSavedRevisions,
  filterCostSavedRevisions,
} from '../src/lib/workflows/cost-saved-revisions';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
} from '../src/lib/workflows/saved-revision-runtime';

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

async function fixture(brand: number) {
  const sources = await prepareOperatingSources(sampleCompanies[brand], {
      enabled: true,
      confirmed: true,
    }),
    entry = sources.entries[0],
    org = sources.company.id,
    beforeGate = { enabled: true, confirmed: true },
    gate = { enabled: true, confirmed: true };
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-cost-filter-remaining-owner',
  );
  const before = await readCostSavedRevision(
      sources,
      entry.target.job_id!,
      beforeGate,
    ),
    current = await readCostSavedRevision(sources, entry.target.job_id!, gate),
    comparison = compareCostSavedRevisions(before, current);
  return { sources, entry, org, gate, beforeGate, before, current, comparison };
}

const clear = { query: '', changed_only: false };

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: filter capture revocation cannot disclose saved canonical cost rows`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined,
      result: ReturnType<typeof filterCostSavedRevisions> | undefined;
    const input = new Proxy(
      { ...clear },
      {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'query' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return descriptor;
        },
      },
    );
    try {
      result = filterCostSavedRevisions(f.comparison, input);
    } catch {
      // Current native authorization must withhold retained private rows.
    }
    expect(revoked).toBeDefined();
    await revoked;
    expect(
      f.sources.operations
        .syntheticMemberships(f.org)
        .find((m) => m.user_id === f.entry.target.actor_id)!.active,
    ).toBe(false);
    expect(() => assertSavedRevisionAccess(f.current)).toThrow();
    expect(result).toBeUndefined();
  });

  it(`brand ${brand}: filter capture cannot withdraw the current local review and retain its private result`, async () => {
    const f = await fixture(brand);
    let captured = 0;
    const input = new Proxy(
      { ...clear },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'changed_only') {
            captured++;
            f.gate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => filterCostSavedRevisions(f.comparison, input)).toThrow();
    expect(captured).toBe(1);
    expect(() => assertSavedRevisionCurrent(f.current)).toThrow();
  });

  it(`brand ${brand}: earlier review withdrawal during capture cannot disclose its historical facts through a still-current read`, async () => {
    const f = await fixture(brand);
    let captured = 0;
    const input = new Proxy(
      { ...clear },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'query') {
            captured++;
            f.beforeGate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => filterCostSavedRevisions(f.comparison, input)).toThrow();
    expect(captured).toBe(1);
    expect(() => assertSavedRevisionAccess(f.before)).toThrow();
    expect(() => assertSavedRevisionCurrent(f.current)).not.toThrow();
  });

  it(`brand ${brand}: unchanged filters preserve exact current rows, integer evidence and literal search without writes`, async () => {
    const f = await fixture(brand),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      property = f.sources.property.read(f.org),
      release = f.entry.release.read('staff'),
      before = JSON.stringify(f.before),
      writers = [
        vi.spyOn(f.sources.estimates, 'projection'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.estimates, 'reviewExpense'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'issue'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.entry.release, 'command'),
        vi.spyOn(globalThis, 'fetch'),
      ],
      all = filterCostSavedRevisions(f.comparison, clear),
      facts = f.comparison.rows.find(
        (row) => row.kind === 'canonical' && row.id === 'facts',
      )!;
    expect(all.rows).toEqual(f.comparison.rows);
    expect(
      all.rows.every((row, index) => row === f.comparison.rows[index]),
    ).toBe(true);
    expect(all.available).toBe(f.comparison.rows.length);
    expect(
      filterCostSavedRevisions(f.comparison, {
        query: 'FACTS',
        changed_only: false,
      }).rows,
    ).toEqual([facts]);
    expect(
      filterCostSavedRevisions(f.comparison, {
        query: '[not-a-regex.*]',
        changed_only: false,
      }).matching,
    ).toBe(0);
    expect(
      filterCostSavedRevisions(f.comparison, { ...clear, changed_only: true })
        .matching,
    ).toBe(0);
    expect(JSON.stringify(f.before)).toBe(before);
    expect(f.current.evidence.facts).toEqual(f.before.evidence.facts);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(f.entry.release.read('staff')).toEqual(release);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: an authorized stale baseline compares exact newly recorded expense and review identifiers without inferring settlement`, async () => {
    const f = await fixture(brand),
      original = JSON.stringify(f.before),
      id = await f.sources.estimates.submitExpense(
        f.org,
        f.entry.target.job_id!,
        {
          purchase_key: crypto.randomUUID(),
          supplier: 'PRIVATE_COST_FILTER_SUPPLIER',
          reference: crypto.randomUUID(),
          category: 'materials',
          kind: 'payment',
          amount_minor: 2300,
          description: 'PRIVATE_COST_FILTER_NOTE',
          estimate_line_id: null,
          quantity_milli: 1000,
          unit: 'each',
          unit_cost_minor: 2300,
          document_ids: [],
          material_approval_id: null,
        },
      );
    await f.sources.estimates.reviewExpense(
      f.org,
      f.entry.target.job_id!,
      id,
      'approved',
      'PRIVATE_COST_FILTER_REVIEW',
    );
    const current = await readCostSavedRevision(
        f.sources,
        f.entry.target.job_id!,
        f.gate,
      ),
      comparison = compareCostSavedRevisions(f.before, current),
      originalRow = comparison.rows.find(
        (row) => row.kind === 'expenses' && row.id === id,
      )!,
      selected = filterCostSavedRevisions(comparison, {
        query: id.toUpperCase(),
        changed_only: true,
      });
    expect(() => assertSavedRevisionCurrent(f.before)).toThrow();
    expect(() => assertSavedRevisionAccess(f.before)).not.toThrow();
    expect(selected.rows).toContain(originalRow);
    expect(originalRow.status).toBe('ADDED');
    expect(originalRow.current).toMatchObject({
      id,
      amount_minor: 2300,
      quantity_milli: 1000,
      unit: 'each',
    });
    expect(
      current.evidence.reviews.find((row) => row.submission_id === id),
    ).toMatchObject({ decision: 'approved', submission_id: id });
    expect(current.identity).toEqual(f.before.identity);
    expect(JSON.stringify(f.before)).toBe(original);
    expect(JSON.stringify(selected)).not.toContain('PRIVATE_COST_FILTER');
    expect(current.operational_ready).toBe(false);
  });

  it(`brand ${brand}: a later canonical forecast withholds the stale current comparison before caller filter inspection`, async () => {
    const f = await fixture(brand),
      job = f.sources.estimates.syntheticJob(f.org, f.entry.target.job_id!)!;
    await f.sources.estimates.projection(f.org, job, {
      ...job.projection,
      remaining: {
        ...job.projection.remaining,
        other: job.projection.remaining.other + 1250,
      },
    });
    const captured = vi.fn(),
      input = new Proxy(
        { ...clear },
        {
          getOwnPropertyDescriptor(target, key) {
            captured();
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    expect(() => filterCostSavedRevisions(f.comparison, input)).toThrow();
    expect(captured).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: copied comparisons and foreign tenant snapshots cannot borrow the original cost context`, async () => {
    const f = await fixture(brand),
      other = await fixture((brand + 1) % 3),
      captured = vi.fn(),
      input = new Proxy(
        { ...clear },
        {
          getOwnPropertyDescriptor(target, key) {
            captured();
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    expect(other.org).not.toBe(f.org);
    expect(() => compareCostSavedRevisions(f.before, other.current)).toThrow();
    expect(() =>
      filterCostSavedRevisions({ ...f.comparison }, input),
    ).toThrow();
    expect(captured).not.toHaveBeenCalled();
    expect(
      filterCostSavedRevisions(f.comparison, {
        query: other.entry.target.job_id!,
        changed_only: false,
      }).matching,
    ).toBe(0);
  });

  it(`brand ${brand}: leading withdrawn-admission denial still occurs before filter descriptors`, async () => {
    const f = await fixture(brand),
      captured = vi.fn(),
      input = new Proxy(
        { ...clear },
        {
          getOwnPropertyDescriptor(target, key) {
            captured();
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    f.gate.confirmed = false;
    expect(() => filterCostSavedRevisions(f.comparison, input)).toThrow();
    expect(captured).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: filtering approved unposted time retains UNKNOWN cost evidence and never adopts a saved selection`, async () => {
    const f = await fixture(brand),
      selection = createSavedRevisionSelection(f.before),
      worker = (await f.sources.estimates.workforce(f.org)).workers[0],
      id = await f.sources.estimates.recordTime(f.org, worker.id, {
        job_id: f.entry.target.job_id!,
        overhead_center: null,
        task: 'PRIVATE_FILTER_UNPOSTED_TIME',
        kind: 'work',
        started_at: '2026-01-03T10:00:00Z',
        ended_at: '2026-01-03T11:00:00Z',
        billable: true,
        corrects_id: null,
      });
    if (typeof id !== 'string')
      throw Error('Exact original recorded time ID required');
    await f.sources.estimates.submitTime(f.org, id);
    await f.sources.estimates.reviewTime(
      f.org,
      id,
      'approved',
      'PRIVATE_FILTER_TIME_REVIEW',
    );
    const current = await readCostSavedRevision(
        f.sources,
        f.entry.target.job_id!,
        f.gate,
      ),
      comparison = compareCostSavedRevisions(f.before, current),
      result = filterCostSavedRevisions(comparison, {
        query: id,
        changed_only: false,
      });
    expect(current.evidence.time.find((row) => row.id === id)?.review).toBe(
      'approved',
    );
    expect(current.evidence.facts.costs).toBeNull();
    expect(current.evidence.facts.cost_coverage).toBe('UNKNOWN');
    expect(current.evidence.labor_entry_ids).not.toContain(id);
    expect(result.rows).toContain(
      comparison.rows.find((row) => row.kind === 'time' && row.id === id),
    );
    expect(JSON.stringify(result)).not.toContain('PRIVATE_FILTER');
    expect(readSavedRevisionSelection(selection).snapshot).toBe(f.before);
    expect(readSavedRevisionSelection(selection).generation).toBe(0);
    expect(current.operational_ready).toBe(false);
  });
}
