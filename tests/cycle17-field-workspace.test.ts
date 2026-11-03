import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readFieldWorkspace as read,
  assertFieldWorkspaceNow as current,
  reconcileFieldWorkspace as reconcile,
  openFieldWorkspaceSection as open,
  openFieldWorkspaceReport as report,
  navigateFieldWorkspace as navigate,
} from '../src/lib/workflows/field-workspace';
import { FieldWorkspace } from '../src/components/workflows/FieldWorkspace';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2],
    input = { job_id: entry.target.job_id!, worker_id: '' };
  return { gate, sources, entry, input };
}
it.each([0, 1, 2])(
  'brand %s retains authoritative job/property/issued/crew breadcrumbs without business writes',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
      ],
      fetch = vi.spyOn(globalThis, 'fetch'),
      v = await read(f.sources, f.input, f.gate);
    expect(v.source).toMatchObject({
      organization_id: f.sources.company.id,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.input.job_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(v.breadcrumbs.map((b) => b.id)).toEqual([
      f.sources.company.id,
      f.entry.target.customer_id,
      f.entry.target.location_id,
      f.input.job_id,
      f.entry.target.version_id,
    ]);
    expect(v.crew.some((w) => w.worker_id === f.entry.worker_id)).toBe(true);
    expect(
      v.visits.some((r) => r.visit_id === f.entry.scheduled_visit_id),
    ).toBe(true);
    expect(v.operational_ready).toBe(false);
    expect(v.physical_completion).toBe('UNVERIFIED');
    expect(Object.values(v.authority).every((a) => !a)).toBe(true);
    expect(Object.isFrozen(v.breadcrumbs)).toBe(true);
    expect(JSON.stringify(v)).not.toMatch(
      /unit_cost|supplier|payroll|margin|PRIVATE|@example.invalid/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(['controls', 'sources', 'readiness'] as const)(
  'opening %s and returning reuses the same immutable workspace',
  async (section) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      snapshot = JSON.stringify(v),
      first = await open(v, section),
      back = await open(v, 'controls');
    expect(first.view).toBe(v);
    expect(first.section).toBe(section);
    expect(back.view).toBe(v);
    expect(back.section).toBe('controls');
    expect(JSON.stringify(v)).toBe(snapshot);
    expect((await reconcile(v)).status).toBe('CURRENT_REVIEW_ONLY');
  },
);
it('published report navigation retains exact original report/version and rejects foreign versions', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    row = v.reports[0],
    detail = await report(v, row.report_id, row.published_version);
  expect(detail.report.report_id).toBe(row.report_id);
  expect(detail.report.published_version).toBe(row.published_version);
  expect(detail.handoff.job_id).toBe(v.source.job_id);
  await expect(
    report(v, row.report_id, row.published_version + 1),
  ).rejects.toThrow();
  await expect(
    report(
      v,
      f.sources.entries[0].report_id,
      f.sources.entries[0].published_version,
    ),
  ).rejects.toThrow();
});
it('readiness gaps never promote synthetic custody or physical recovery to operational acceptance', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    r = Object.fromEntries(v.requirements.map((x) => [x.key, x.status]));
  expect(r).toEqual({
    browser_context: 'SAME_TAB_REFERENCE_ONLY',
    operational_custody: 'NOT_CONNECTED',
    physical_recovery: 'UNVERIFIED',
    authentication: 'UNVERIFIED',
    availability: 'UNKNOWN',
    dispatch: 'BLOCKED',
  });
  expect(v.operational_ready).toBe(false);
  expect(v.requirements.some((x) => (x.status as string) === 'PASS')).toBe(
    false,
  );
});
it('OFF precedes source and selection getters', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'],
    input = Object.defineProperty({}, 'job_id', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['input'];
  await expect(read(sources, input)).rejects.toThrow();
  expect(
    renderToStaticMarkup(createElement(FieldWorkspace, { sources })),
  ).toContain('workspace is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:'])(
  'protocol %s is OFF without source reads',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
        ReturnType<typeof fixture>
      >['sources'];
    expect(
      renderToStaticMarkup(
        createElement(FieldWorkspace, { sources, enabled: true }),
      ),
    ).toContain('workspace is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it('invalid job hint never selects another available job', async () => {
  const f = await fixture();
  await expect(
    read(f.sources, { job_id: 'foreign-job', worker_id: '' }, f.gate),
  ).rejects.toThrow();
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const html = renderToStaticMarkup(
    createElement(FieldWorkspace, {
      sources: f.sources,
      enabled: true,
      selectedJobId: 'foreign-job',
    }),
  );
  expect(html).toContain(
    'No exact authorized job selected. No fallback selection.',
  );
  expect(html).toContain('<button disabled="">Open retained field workspace');
});
it.each([1, 2])(
  'company %s cannot substitute another tenant job context',
  async (brand) => {
    const f = await fixture(),
      foreign = await fixture(brand);
    await expect(
      read(foreign.sources, f.input, foreign.gate),
    ).rejects.toThrow();
  },
);
it('same-company wrong-property handles are rejected before any breadcrumb can be produced', async () => {
  const f = await fixture(),
    wrong = f.sources.entries[0],
    selected = f.sources.entries[2];
  const entries = f.sources.entries.map((e) =>
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
  await expect(
    read({ ...f.sources, entries }, f.input, f.gate),
  ).rejects.toThrow();
});
it('copied workspace cannot navigate or reconcile using matching labels/IDs alone', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    clone = structuredClone(v),
    callback = vi.fn();
  expect(() => current(clone)).toThrow();
  expect((await reconcile(clone)).status).toBe('UNKNOWN');
  await expect(open(clone, 'controls')).rejects.toThrow();
  await expect(navigate(clone, callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
it.each(['gate', 'input', 'source', 'member', 'job'] as const)(
  'retained %s drift permanently withholds source/controls/navigation',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      saved = JSON.stringify(v),
      callback = vi.fn();
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'input') f.input.job_id = f.sources.entries[0].target.job_id!;
    if (kind === 'source') f.sources.entries = [...f.sources.entries];
    if (kind === 'member')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'job')
      vi.spyOn(f.sources.estimates, 'syntheticJob').mockReturnValue(null);
    expect(() => current(v)).toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(open(v, 'controls')).rejects.toThrow();
    await expect(navigate(v, callback)).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    f.gate.confirmed = true;
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    expect(JSON.stringify(v)).toBe(saved);
  },
);
it.each(['gate', 'member', 'selection'] as const)(
  'final %s withdrawal after workspace hash withholds the result',
  async (kind) => {
    const f = await fixture(),
      original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_RETAINED_FIELD_WORKSPACE')
      ) {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'member')
          vi.spyOn(
            f.sources.operations,
            'syntheticMemberships',
          ).mockReturnValue([]);
        if (kind === 'selection') f.input.worker_id = 'foreign-worker';
      }
      return result;
    });
    await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
  },
);
it('concurrent navigation of the same source has one callback and no second action', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    callback = vi.fn(),
    outcomes = await Promise.allSettled([
      navigate(v, callback),
      navigate(v, callback),
    ]);
  expect(outcomes.map((r) => r.status).sort()).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(callback).toHaveBeenCalledExactlyOnceWith(v.source.job_id, 'field');
  expect((await reconcile(v)).status).toBe('CURRENT_REVIEW_ONLY');
});
it('revocation during navigation await prevents the callback', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    callback = vi.fn(),
    original = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await original(...args);
    f.gate.confirmed = false;
    return result;
  });
  await expect(navigate(v, callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
it('a callback that navigates then throws retains UNKNOWN and forbids a second navigation', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.input, f.gate),
    snapshot = JSON.stringify(view),
    navigated: string[] = [],
    first = vi.fn((jobId: string) => {
      navigated.push(jobId);
      throw Error('Lost field navigation acknowledgment');
    }),
    second = vi.fn();
  await expect(navigate(view, first)).rejects.toThrow(
    'Lost field navigation acknowledgment',
  );
  await expect(navigate(view, second)).rejects.toThrow();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(navigated).toEqual([view.source.job_id]);
  expect((await reconcile(view)).status).toBe('UNKNOWN');
  await expect(open(view, 'controls')).rejects.toThrow();
  expect(JSON.stringify(view)).toBe(snapshot);
});
it.each([0, 1, 2])(
  'brand %s preselects the exact host job with one source confirmation',
  async (brand) => {
    const f = await fixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(FieldWorkspace, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
      }),
    );
    expect(html).toContain('value="' + f.input.job_id + '" selected');
    expect(html).toContain('Open retained field workspace');
    expect(html).not.toContain('Inspect daily field sources');
    expect(html).not.toMatch(/unit_cost|supplier|payroll|PRIVATE/);
  },
);
