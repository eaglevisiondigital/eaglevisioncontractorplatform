import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPrioritySavedRevision,
  comparePrioritySavedRevisions,
  filterPrioritySavedRevisions,
} from '../src/lib/workflows/priority-saved-revisions';
import { assertSavedRevisionAccess } from '../src/lib/workflows/saved-revision-runtime';

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
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    org = sources.company.id;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const before = await readPrioritySavedRevision(
      sources,
      entry.target.job_id!,
      gate,
    ),
    current = await readPrioritySavedRevision(
      sources,
      entry.target.job_id!,
      gate,
    ),
    comparison = comparePrioritySavedRevisions(before, current);
  return { sources, entry, org, before, current, comparison, gate };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: comparison input capture cannot revoke native access and return private priority rows`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const input = new Proxy(
      { query: '', area: 'all', changed_only: false },
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
    let result: unknown;
    try {
      result = filterPrioritySavedRevisions(f.comparison, input);
    } catch {
      // No retained private rows may escape after actual current revocation.
    }
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => assertSavedRevisionAccess(f.current)).toThrow();
    expect(result).toBeUndefined();
  });
  it(`brand ${brand}: ordinary filters retain original row identities, literal matching and exact job context without writes`, async () => {
    const f = await fixture(brand),
      property = f.sources.property.read(f.org),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      all = filterPrioritySavedRevisions(f.comparison, {
        query: '',
        area: 'all',
        changed_only: false,
      }),
      row = all.rows.find(
        (r) => (r.current ?? r.before)?.source.kind === 'issued',
      )!,
      card = (row.current ?? row.before)!,
      exact = filterPrioritySavedRevisions(f.comparison, {
        query: card.source.id.toUpperCase(),
        area: card.area,
        changed_only: false,
      });
    expect(all.rows).toEqual(f.comparison.rows);
    expect(all.rows.every((r, index) => r === f.comparison.rows[index])).toBe(
      true,
    );
    expect(exact.rows).toContain(row);
    expect(
      exact.rows.every(
        (r) => (r.current ?? r.before)!.job_id === f.entry.target.job_id,
      ),
    ).toBe(true);
    expect(exact.available).toBe(all.available);
    expect(
      filterPrioritySavedRevisions(f.comparison, {
        query: '[literal.*]',
        area: 'all',
        changed_only: false,
      }).matching,
    ).toBe(0);
    expect(
      filterPrioritySavedRevisions(f.comparison, {
        query: '',
        area: 'all',
        changed_only: true,
      }).matching,
    ).toBe(0);
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    expect(all).not.toHaveProperty('selection');
  });
  it(`brand ${brand}: an accessor is rejected without invocation or loss of legitimate source access`, async () => {
    const f = await fixture(brand),
      getter = vi.fn(() => ''),
      input = Object.defineProperty(
        { area: 'all', changed_only: false },
        'query',
        {
          enumerable: true,
          get: getter,
        },
      );
    expect(() =>
      filterPrioritySavedRevisions(f.comparison, input as never),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => assertSavedRevisionAccess(f.current)).not.toThrow();
  });
  it(`brand ${brand}: native cost-source revision stales old comparison rows without adopting replacement evidence`, async () => {
    const f = await fixture(brand),
      original = JSON.stringify(f.comparison),
      job = f.sources.estimates.syntheticJob(f.org, f.entry.target.job_id!)!;
    await f.sources.estimates.projection(f.org, job, {
      ...job.projection,
      remaining: {
        ...job.projection.remaining,
        other: job.projection.remaining.other + 700,
      },
    });
    expect(() =>
      filterPrioritySavedRevisions(f.comparison, {
        query: '',
        area: 'all',
        changed_only: false,
      }),
    ).toThrow();
    expect(JSON.stringify(f.comparison)).toBe(original);
  });
  it(`brand ${brand}: current confirmation withdrawal during input capture withholds original rows`, async () => {
    const f = await fixture(brand);
    let captures = 0;
    const input = new Proxy(
      { query: '', area: 'all', changed_only: false },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'query') {
            captures++;
            f.gate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => filterPrioritySavedRevisions(f.comparison, input)).toThrow();
    expect(captures).toBeGreaterThan(0);
  });
  it(`brand ${brand}: copied comparison and another original job cannot become this comparison authority`, async () => {
    const f = await fixture(brand),
      other = await readPrioritySavedRevision(
        f.sources,
        f.sources.entries[2].target.job_id!,
        f.gate,
      );
    expect(() =>
      filterPrioritySavedRevisions(
        { ...f.comparison },
        {
          query: '',
          area: 'all',
          changed_only: false,
        },
      ),
    ).toThrow('Original saved priority comparison required');
    expect(() => comparePrioritySavedRevisions(f.before, other)).toThrow();
  });
}
it('foreign-tenant originals cannot form a comparison or be selected by a search string', async () => {
  const first = await fixture(0),
    second = await fixture(1),
    foreign = second.current.evidence.cards.find(
      (c) => c.source.kind === 'issued',
    )!;
  expect(() =>
    comparePrioritySavedRevisions(first.before, second.current),
  ).toThrow();
  expect(
    filterPrioritySavedRevisions(first.comparison, {
      query: foreign.source.id,
      area: 'all',
      changed_only: false,
    }).matching,
  ).toBe(0);
});
