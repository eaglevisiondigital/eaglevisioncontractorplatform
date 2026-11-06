import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPublishedServiceHistory,
  assertPublishedServiceHistory,
  filterPublishedServiceHistory,
  publishedServiceContext,
} from '../src/lib/workflows/published-service-navigation';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
for (const brand of [0, 1, 2])
  it(`brand ${brand}: published-history filter withholds private reports after input capture revokes native access`, async () => {
    const gate = { enabled: true, confirmed: true },
      sources = await prepareOperatingSources(sampleCompanies[brand], gate),
      entry = sources.entries[0],
      org = sources.company.id;
    await sources.operations.configure(
      org,
      'active',
      'synthetic',
      {},
      `${org}-remaining-owner`,
    );
    const history = await readPublishedServiceHistory(
      sources,
      entry.target.job_id!,
      gate,
    );
    let revoked: Promise<void> | undefined, result: unknown;
    const filters = new Proxy(
      { query: '', phase: '', severity: '' },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'query' && !revoked)
            revoked = sources.operations.revokeOwner(
              org,
              entry.target.actor_id,
            );
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    try {
      result = filterPublishedServiceHistory(history, filters);
    } catch {
      // Private retained report history must remain withheld after revocation.
    }
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => assertPublishedServiceHistory(history)).toThrow();
    expect(result).toBeUndefined();
  });

async function loaded(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    history = await readPublishedServiceHistory(
      sources,
      entry.target.job_id!,
      gate,
    );
  return { gate, sources, entry, history, org: sources.company.id };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: withdrawn confirmation during published filter capture remains UNKNOWN after restoration`, async () => {
    const f = await loaded(brand),
      filters = new Proxy(
        { query: '', phase: '', severity: '' },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'query') f.gate.confirmed = false;
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    expect(() => filterPublishedServiceHistory(f.history, filters)).toThrow();
    f.gate.confirmed = true;
    expect(() => assertPublishedServiceHistory(f.history)).toThrow('UNKNOWN');
    await expect(
      readPublishedServiceHistory(f.sources, f.entry.target.job_id!, f.gate),
    ).rejects.toThrow('UNKNOWN');
  });
  it(`brand ${brand}: ordinary published filters retain literal semantics and original safe report references without writes`, async () => {
    const f = await loaded(brand),
      report = f.history.reports[0],
      state = f.sources.property.read(f.org),
      context = publishedServiceContext(f.history),
      getter = vi.fn(() => ''),
      accessor = Object.defineProperty({ phase: '', severity: '' }, 'query', {
        enumerable: true,
        get: getter,
      });
    expect(() =>
      filterPublishedServiceHistory(f.history, accessor as never),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const rows = filterPublishedServiceHistory(f.history, {
      query: report.reference.report_id,
      phase: report.report.phase,
      severity: '',
    });
    expect(rows).toEqual([report]);
    expect(rows[0]).toBe(report);
    expect(
      filterPublishedServiceHistory(f.history, {
        query: '.*',
        phase: '',
        severity: '',
      }),
    ).toEqual([]);
    expect(publishedServiceContext(f.history)).toEqual(context);
    expect(f.history.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(f.history.physical_completion).toBe('UNVERIFIED');
    expect(f.history.customer_acceptance).toBe('UNVERIFIED');
    expect(f.sources.property.read(f.org)).toEqual(state);
  });
  it(`brand ${brand}: ordinary native plan changes do not replace immutable published history`, async () => {
    const f = await loaded(brand),
      before = JSON.stringify(f.history.reports),
      state = f.sources.property.read(f.org),
      plan = state.plans.find((p) => p.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...plan,
      name: `${plan.name} explicit native revision`,
    });
    const rows = filterPublishedServiceHistory(f.history, {
      query: '',
      phase: '',
      severity: '',
    });
    expect(rows[0]).toBe(f.history.reports[0]);
    expect(JSON.stringify(rows)).toBe(before);
    expect(
      f.sources.property.read(f.org).plans.find((p) => p.id === plan.id)
        ?.revision,
    ).toBe(plan.revision + 1);
    expect(f.history.history_completeness).toBe('UNKNOWN');
  });
  it(`brand ${brand}: copied published history cannot acquire the original current reader binding`, async () => {
    const f = await loaded(brand);
    expect(() =>
      filterPublishedServiceHistory(
        { ...f.history },
        { query: '', phase: '', severity: '' },
      ),
    ).toThrow('Original published history evidence required');
    expect(
      filterPublishedServiceHistory(f.history, {
        query: '',
        phase: '',
        severity: '',
      }),
    ).toEqual(f.history.reports);
  });
}
it('published filtering cannot substitute a foreign company report by exact ID text', async () => {
  const own = await loaded(0),
    other = await loaded(1);
  expect(own.org).not.toBe(other.org);
  expect(
    filterPublishedServiceHistory(own.history, {
      query: other.history.reports[0].reference.report_id,
      phase: '',
      severity: '',
    }),
  ).toEqual([]);
  expect(publishedServiceContext(own.history).organization_id).toBe(own.org);
});
it('original invalid and default-OFF published reads inspect no caller filters or sources', async () => {
  const read = vi.fn(() => {
      throw Error('Private caller input');
    }),
    value = new Proxy({}, { get: read, getOwnPropertyDescriptor: read });
  expect(() =>
    filterPublishedServiceHistory({} as never, value as never),
  ).toThrow('Original published history evidence required');
  await expect(
    readPublishedServiceHistory(value as never, 'unadmitted'),
  ).rejects.toThrow('OFF');
  expect(read).not.toHaveBeenCalled();
});
