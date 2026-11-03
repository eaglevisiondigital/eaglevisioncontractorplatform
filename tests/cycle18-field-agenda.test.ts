import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFieldAgenda as read,
  filterFieldAgenda as filter,
  assertFieldAgendaNow as current,
  reconcileFieldAgenda as reconcile,
  inspectFieldAgendaJob as inspect,
  continueFieldAgenda as next,
  type FieldAgendaFilter,
} from '../src/lib/workflows/field-agenda';
import { FieldAgenda } from '../src/components/workflows/FieldAgenda';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('admitted component rejects accessor source containers before invoking their getters', () => {
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'];
  expect(
    renderToStaticMarkup(
      createElement(FieldAgenda, { sources, enabled: true }),
    ),
  ).toContain('Current authorized field sources unavailable');
  expect(getter).not.toHaveBeenCalled();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate);
  return { gate, sources, job: sources.entries[2].target.job_id! };
}
const all: FieldAgendaFilter = {
  query: '',
  day: '2026-12-28',
  period: 'all',
  worker_id: '',
  status: 'all',
};
it.each([0, 1, 2])(
  'brand %s builds four exact job agendas from the existing repositories without writes',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch'),
      view = await read(f.sources, f.gate);
    expect(view.rows).toHaveLength(4);
    for (const row of view.rows) {
      const entry = f.sources.entries.find(
        (e) => e.target.job_id === row.source.job_id,
      )!;
      expect(row.source).toMatchObject({
        organization_id: f.sources.company.id,
        customer_id: entry.target.customer_id,
        location_id: entry.target.location_id,
        issued_version_id: entry.target.version_id,
      });
      expect(row.actual_availability).toBe('UNKNOWN');
      expect(row.physical_completion).toBe('UNVERIFIED');
      expect(
        row.reports.some(
          (r) =>
            r.report_id === entry.report_id &&
            r.published_version === entry.published_version,
        ),
      ).toBe(true);
    }
    expect(Object.isFrozen(view.rows)).toBe(true);
    expect(Object.values(view.authority).every((v) => !v)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /unit_cost|supplier|payroll|margin|PRIVATE|@example.invalid/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s combines literal search, daily/weekly date, recorded staff and status filters',
  async (brand) => {
    const f = await fixture(brand),
      view = await read(f.sources, f.gate),
      row = view.rows[2],
      picked = filter(view, {
        ...all,
        query: row.source.job_id,
        period: 'day',
        day: row.day,
        worker_id: row.crew[0].worker_id,
        status: row.reported_statuses[0],
      });
    expect(picked.rows.map((r) => r.source.job_id)).toEqual([
      row.source.job_id,
    ]);
    expect(picked.matching_jobs).toBe(1);
    expect(picked.available_jobs).toBe(4);
    expect(filter(view, { ...all, period: 'day' }).matching_jobs).toBe(2);
    expect(filter(view, { ...all, period: 'week' }).matching_jobs).toBe(4);
    expect(filter(view, { ...all, query: '[not-regex].*' }).matching_jobs).toBe(
      0,
    );
    expect(filter(view, all).matching_jobs).toBe(4);
  },
);
it('date-only crew co-occurrence is a review signal, never a confirmed timed conflict or free capacity', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.gate),
    result = filter(view, all);
  expect(result.signals).not.toHaveLength(0);
  expect(
    result.signals.every((s) => s.state === 'DATE_ONLY_REVIEW_REQUIRED'),
  ).toBe(true);
  expect(result.timed_conflicts).toBe('UNKNOWN');
  expect(result.actual_availability).toBe('UNKNOWN');
});
it.each([
  { day: '2026-02-30' },
  { day: '2026-2-3' },
  { period: 'month' },
  { worker_id: 'foreign-worker' },
  { status: 'completed' },
  { query: 'x'.repeat(201) },
])(
  'invalid filter %j is rejected without losing the exact source',
  async (bad) => {
    const f = await fixture(),
      view = await read(f.sources, f.gate);
    expect(() =>
      filter(view, { ...all, ...bad } as FieldAgendaFilter),
    ).toThrow();
    expect(filter(view, all).matching_jobs).toBe(4);
  },
);
it('OFF precedes source/getter reads in the actual domain and component', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'];
  await expect(read(sources)).rejects.toThrow();
  expect(
    renderToStaticMarkup(createElement(FieldAgenda, { sources })),
  ).toContain('Field agenda is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:'])(
  'protocol %s remains OFF before source reads',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
        ReturnType<typeof fixture>
      >['sources'];
    expect(
      renderToStaticMarkup(
        createElement(FieldAgenda, { sources, enabled: true }),
      ),
    ).toContain('Field agenda is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it('an invalid host hint has no available-job fallback', async () => {
  const f = await fixture();
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const html = renderToStaticMarkup(
    createElement(FieldAgenda, {
      sources: f.sources,
      enabled: true,
      selectedJobId: 'foreign-job',
    }),
  );
  expect(html).toContain(
    'No exact authorized job selected. No fallback selection.',
  );
  expect(html).toContain('<button disabled="">Load recorded field agenda');
});
it.each([1, 2])(
  'company %s cannot substitute source handles from a foreign tenant',
  async (brand) => {
    const f = await fixture(),
      foreign = await fixture(brand);
    await expect(
      read({ ...f.sources, entries: foreign.sources.entries }, f.gate),
    ).rejects.toThrow();
  },
);
it('same-company wrong customer/property source is rejected before agenda rows', async () => {
  const f = await fixture(),
    wrong = f.sources.entries[0],
    selected = f.sources.entries[2],
    entries = f.sources.entries.map((e) =>
      e === selected
        ? {
            ...e,
            target: {
              ...e.target,
              customer_id: wrong.target.customer_id,
              location_id: wrong.target.location_id,
            },
          }
        : e,
    );
  await expect(read({ ...f.sources, entries }, f.gate)).rejects.toThrow();
});
it('copied agenda and unlisted job cannot open the original retained workspace', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.gate),
    callback = vi.fn();
  await expect(inspect(structuredClone(view), f.job)).rejects.toThrow();
  await expect(inspect(view, 'foreign-job')).rejects.toThrow();
  await expect(next(view, 'foreign-job', callback)).rejects.toThrow();
  expect((await reconcile(structuredClone(view))).status).toBe('UNKNOWN');
  expect(callback).not.toHaveBeenCalled();
});
it.each(['gate', 'member', 'job', 'entries'] as const)(
  'observed %s revocation or staleness is terminal despite restoration',
  async (kind) => {
    const f = await fixture(),
      view = await read(f.sources, f.gate),
      entries = f.sources.entries;
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'member')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'job')
      vi.spyOn(f.sources.estimates, 'syntheticJob').mockReturnValue(null);
    if (kind === 'entries') f.sources.entries = [...entries];
    expect(() => current(view)).toThrow();
    vi.restoreAllMocks();
    f.gate.confirmed = true;
    f.sources.entries = entries;
    expect((await reconcile(view)).status).toBe('UNKNOWN');
    await expect(inspect(view, f.job)).rejects.toThrow();
  },
);
it('source withdrawal during agenda hashing withholds the entire result', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (
      new TextDecoder()
        .decode(args[1] as ArrayBuffer)
        .includes('LOCAL_FIELD_AGENDA')
    )
      f.gate.confirmed = false;
    return result;
  });
  await expect(read(f.sources, f.gate)).rejects.toThrow();
});
it.each([0, 1, 2])(
  'brand %s opens exact immutable work source then continues the exact job to finance',
  async (brand) => {
    const f = await fixture(brand),
      view = await read(f.sources, f.gate),
      selected = await inspect(view, f.job),
      callback = vi.fn();
    expect(selected.workspace.source).toEqual(selected.row.source);
    expect(selected.workspace.integrity.sha256).toBe(
      selected.row.source_sha256,
    );
    expect(await next(view, f.job, callback)).toMatchObject({
      status: 'LOCAL_NAVIGATION_ONLY',
      dispatch: false,
    });
    expect(callback).toHaveBeenCalledExactlyOnceWith(f.job, 'finance');
  },
);
it('competing continuation has exactly one invocation', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.gate),
    callback = vi.fn(),
    results = await Promise.allSettled([
      next(view, f.job, callback),
      next(view, f.job, callback),
    ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(callback).toHaveBeenCalledTimes(1);
});
it('known removed/replaced callback before invocation is no-dispatch and permits a later current review', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.gate),
    old = vi.fn(),
    fresh = vi.fn();
  expect(await next(view, f.job, old, () => false)).toMatchObject({
    status: 'WITHDRAWN',
  });
  expect(old).not.toHaveBeenCalled();
  await next(view, f.job, fresh);
  expect(fresh).toHaveBeenCalledExactlyOnceWith(f.job, 'finance');
});
it.each(['throw', 'reject'] as const)(
  'invoked callback %s retains canonical UNKNOWN through a fresh wrapper and restored source',
  async (outcome) => {
    const f = await fixture(),
      view = await read(f.sources, f.gate),
      invoked = vi.fn(() => {
        if (outcome === 'throw') throw Error('Lost acknowledgment');
        return Promise.reject(Error('Lost acknowledgment'));
      });
    await expect(next(view, f.job, invoked)).rejects.toThrow(
      'Lost acknowledgment',
    );
    const wrapper = { ...f.sources },
      fresh = await read(wrapper, f.gate),
      retry = vi.fn();
    await expect(next(fresh, f.job, retry)).rejects.toThrow();
    expect((await reconcile(view)).status).toBe('UNKNOWN');
    expect((await reconcile(fresh)).status).toBe('UNKNOWN');
    expect(invoked).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  },
);
it('source handle pinned before await prevents mutable getter replacement from rebinding uncertainty', async () => {
  const f = await fixture(),
    wrapper = { ...f.sources },
    view = await read(f.sources, f.gate),
    callback = vi.fn(() => {
      Object.defineProperty(f.sources, 'operations', {
        configurable: true,
        get() {
          throw Error('Lost handle');
        },
      });
      throw Error('Unknown');
    });
  await expect(next(view, f.job, callback)).rejects.toThrow();
  const fresh = await read(wrapper, f.gate),
    retry = vi.fn();
  await expect(next(fresh, f.job, retry)).rejects.toThrow();
  expect(retry).not.toHaveBeenCalled();
});
it('revocation during final navigation verification prevents callback', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.gate),
    callback = vi.fn(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    f.gate.confirmed = false;
    return result;
  });
  await expect(next(view, f.job, callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
