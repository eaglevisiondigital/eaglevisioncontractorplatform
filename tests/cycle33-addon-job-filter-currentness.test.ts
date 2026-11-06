import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readAddonReadinessJobs,
  assertAddonReadinessJobsCurrent,
  filterAddonReadinessJobs,
  selectAddonReadinessJob,
} from '../src/lib/workflows/addon-readiness-guide';

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
  it(`brand ${brand}: add-on job filter withholds private rows after input capture revokes native access`, async () => {
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
    const jobs = await readAddonReadinessJobs(sources, gate);
    let revoked: Promise<void> | undefined, result: unknown;
    const filters = new Proxy(
      { query: '', location_id: '' },
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
      result = filterAddonReadinessJobs(jobs, filters);
    } catch {
      // Private retained job and property facts require current native access.
    }
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => assertAddonReadinessJobsCurrent(jobs)).toThrow();
    expect(result).toBeUndefined();
  });

async function loaded(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    jobs = await readAddonReadinessJobs(sources, gate);
  return { gate, sources, jobs, org: sources.company.id };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: withdrawn confirmation during add-on filter capture remains UNKNOWN after restoration`, async () => {
    const f = await loaded(brand),
      filters = new Proxy(
        { query: '', location_id: '' },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'query') f.gate.confirmed = false;
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    expect(() => filterAddonReadinessJobs(f.jobs, filters)).toThrow();
    f.gate.confirmed = true;
    expect(() => assertAddonReadinessJobsCurrent(f.jobs)).toThrow('UNKNOWN');
  });
  it(`brand ${brand}: ordinary literal job filters retain exact original rows, selection and canonical state`, async () => {
    const f = await loaded(brand),
      row = f.jobs.rows[0],
      property = f.sources.property.read(f.org),
      release = f.sources.entries.map((e) => e.release.read('staff')),
      selected = selectAddonReadinessJob(f.jobs, row.job_id),
      getter = vi.fn(() => ''),
      accessor = Object.defineProperty({ location_id: '' }, 'query', {
        enumerable: true,
        get: getter,
      });
    expect(() => filterAddonReadinessJobs(f.jobs, accessor as never)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const rows = filterAddonReadinessJobs(f.jobs, {
      query: row.job_id,
      location_id: row.location_id,
    });
    expect(rows).toEqual([row]);
    expect(rows[0]).toBe(row);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(
      filterAddonReadinessJobs(f.jobs, { query: '.*', location_id: '' }),
    ).toEqual([]);
    expect(selectAddonReadinessJob(f.jobs, row.job_id)).toBe(selected);
    expect(f.jobs.crm_history_completeness).toBe('UNKNOWN');
    expect(f.jobs.authority).toBe('NAVIGATION_ONLY');
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(f.sources.entries.map((e) => e.release.read('staff'))).toEqual(
      release,
    );
  });
  it(`brand ${brand}: same-property jobs stay separate and a different selected property cannot broaden matching`, async () => {
    const f = await loaded(brand),
      shared = f.sources.entries[0].target.location_id,
      same = f.jobs.rows.filter((r) => r.location_id === shared),
      other = f.jobs.rows.find((r) => r.location_id !== shared)!;
    expect(same.length).toBeGreaterThan(1);
    const rows = filterAddonReadinessJobs(f.jobs, {
      query: '',
      location_id: shared,
    });
    expect(rows).toEqual(same);
    expect(new Set(rows.map((r) => r.job_id)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.issued_version_id)).size).toBe(
      rows.length,
    );
    expect(
      filterAddonReadinessJobs(f.jobs, {
        query: same[0].job_id,
        location_id: other.location_id,
      }),
    ).toEqual([]);
  });
  it(`brand ${brand}: copied add-on job views cannot acquire original current-source access`, async () => {
    const f = await loaded(brand);
    expect(() =>
      filterAddonReadinessJobs({ ...f.jobs }, { query: '', location_id: '' }),
    ).toThrow('UNKNOWN');
    expect(
      filterAddonReadinessJobs(f.jobs, { query: '', location_id: '' }),
    ).toEqual(f.jobs.rows);
  });
}
it('add-on filtering cannot substitute foreign-company job IDs or properties', async () => {
  const own = await loaded(0),
    other = await loaded(1);
  expect(own.org).not.toBe(other.org);
  expect(
    filterAddonReadinessJobs(own.jobs, {
      query: other.jobs.rows[0].job_id,
      location_id: '',
    }),
  ).toEqual([]);
  expect(() =>
    filterAddonReadinessJobs(own.jobs, {
      query: '',
      location_id: other.jobs.rows[0].location_id,
    }),
  ).toThrow('Exact bounded');
  expect(own.jobs.organization_id).toBe(own.org);
});
it('original invalid and default-OFF add-on reads inspect no caller filters or sources', async () => {
  const read = vi.fn(() => {
      throw Error('Private caller input');
    }),
    value = new Proxy({}, { get: read, getOwnPropertyDescriptor: read });
  expect(() => filterAddonReadinessJobs({} as never, value as never)).toThrow(
    'UNKNOWN',
  );
  await expect(readAddonReadinessJobs(value as never)).rejects.toThrow('OFF');
  expect(read).not.toHaveBeenCalled();
});
