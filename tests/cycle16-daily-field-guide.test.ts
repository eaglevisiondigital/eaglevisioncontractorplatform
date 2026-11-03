import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readDailyFieldGuide as read,
  assertDailyFieldGuideNow as current,
  reconcileDailyFieldGuide as reconcile,
  inspectDailyFieldStep as inspect,
  inspectDailyFieldReport as report,
  dailyFieldReportReference,
  openDailyFieldControls as controls,
  navigateDailyFieldJob as navigate,
} from '../src/lib/workflows/daily-field-guide';
import { DailyFieldGuide } from '../src/components/workflows/DailyFieldGuide';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0, index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[index],
    input = { job_id: entry.target.job_id!, worker_id: '' };
  return { gate, sources, entry, input };
}
it.each([0, 1, 2])(
  'brand %s reads exact daily scope/crew/visits/report versions without business writes',
  async (brand) => {
    const f = await fixture(brand, 2),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
      ],
      network = vi.spyOn(globalThis, 'fetch');
    const v = await read(f.sources, f.input, f.gate);
    expect(v.source).toMatchObject({
      organization_id: f.sources.company.id,
      job_id: f.entry.target.job_id,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(v.day).toBe(f.entry.day);
    expect(
      v.visits.some((x) => x.visit_id === f.entry.scheduled_visit_id),
    ).toBe(true);
    expect(
      v.published_reports.some(
        (r) =>
          r.report_id === f.entry.report_id &&
          r.published_version === f.entry.published_version,
      ),
    ).toBe(true);
    expect(v.crew.some((w) => w.worker_id === f.entry.worker_id)).toBe(true);
    expect(v.steps.map((s) => s.key)).toEqual([
      'scope',
      'crew',
      'visits',
      'reports',
    ]);
    expect(v.physical_completion).toBe('UNVERIFIED');
    expect(v.actual_availability).toBe('UNKNOWN');
    expect(v.time_worked).toBe('NOT_INFERRED');
    expect(v.task_state).toBe('NO_OPERATIONAL_TASK_TRANSITION');
    expect(Object.values(v.authority).every((a) => !a)).toBe(true);
    expect(Object.isFrozen(v.visits)).toBe(true);
    expect(v.integrity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(v)).not.toMatch(
      /unit_cost|supplier|payroll|margin|PRIVATE|@example.invalid/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);
it.each(['scope', 'crew', 'visits', 'reports'] as const)(
  'inspects only the selected %s evidence step',
  async (key) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      step = await inspect(v, key);
    expect(step.source).toBe(v.source);
    expect(step.step.key).toBe(key);
    for (const [name, items] of Object.entries({
      scope: step.scope,
      crew: step.crew,
      visits: step.visits,
      reports: step.reports,
    }))
      expect(items).toEqual(
        name === key
          ? name === 'reports'
            ? v.published_reports
            : v[name as 'scope' | 'crew' | 'visits']
          : [],
      );
    expect(step.completion).toBe('UNVERIFIED');
    expect(step.authority).toBe('READ_ONLY');
  },
);
it('OFF precedes source and input getters', async () => {
  const getter = vi.fn(),
    sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['sources'],
    input = Object.defineProperty({}, 'job_id', { get: getter }) as Awaited<
      ReturnType<typeof fixture>
    >['input'];
  await expect(read(sources, input)).rejects.toThrow();
  expect(
    renderToStaticMarkup(createElement(DailyFieldGuide, { sources })),
  ).toContain('guide is off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:', 'data:'])(
  'protocol %s leaves the guide off without source reads',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn(),
      sources = Object.defineProperty({}, 'gate', { get: getter }) as Awaited<
        ReturnType<typeof fixture>
      >['sources'];
    expect(
      renderToStaticMarkup(
        createElement(DailyFieldGuide, { sources, enabled: true }),
      ),
    ).toContain('guide is off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it('rejects accessor inputs without invoking them', async () => {
  const f = await fixture(),
    getter = vi.fn(),
    input = Object.defineProperty({ worker_id: '' }, 'job_id', {
      get: getter,
    }) as typeof f.input;
  await expect(read(f.sources, input, f.gate)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each(['foreign-job', '', 'x'.repeat(201)])(
  'invalid job %s never substitutes a visible record',
  async (job_id) => {
    const f = await fixture();
    await expect(
      read(f.sources, { job_id, worker_id: '' }, f.gate),
    ).rejects.toThrow();
  },
);
it('exact technician selection retains only that current recorded relationship', async () => {
  const f = await fixture();
  f.input.worker_id = f.entry.worker_id;
  const v = await read(f.sources, f.input, f.gate);
  expect(v.selected_worker_id).toBe(f.entry.worker_id);
  expect(v.crew).toHaveLength(1);
  expect(v.crew[0].worker_id).toBe(f.entry.worker_id);
});
it('foreign technician is rejected without changing assignment', async () => {
  const f = await fixture();
  await expect(
    read(f.sources, { ...f.input, worker_id: 'foreign-worker' }, f.gate),
  ).rejects.toThrow();
});
it.each([1, 2])('company %s cannot read another company job', async (brand) => {
  const a = await fixture(),
    b = await fixture(brand);
  await expect(read(b.sources, a.input, b.gate)).rejects.toThrow();
});
it('copied guide does not confer retained source or navigation authority', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    copied = structuredClone(v),
    callback = vi.fn();
  expect(() => current(copied)).toThrow();
  expect((await reconcile(copied)).status).toBe('UNKNOWN');
  await expect(inspect(copied, 'scope')).rejects.toThrow();
  await expect(controls(copied)).rejects.toThrow();
  await expect(navigate(copied, callback)).rejects.toThrow();
  expect(callback).not.toHaveBeenCalled();
});
it('opens only the exact original published report/version', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    r = await report(v, {
      report_id: f.entry.report_id,
      published_version: f.entry.published_version,
    });
  expect(r.report.report_id).toBe(f.entry.report_id);
  expect(r.report.published_version).toBe(f.entry.published_version);
  expect(r.handoff.job_id).toBe(f.entry.target.job_id);
  await expect(
    report(v, {
      report_id: f.entry.report_id,
      published_version: f.entry.published_version + 1,
    }),
  ).rejects.toThrow();
  const other = f.sources.entries[1];
  await expect(
    report(v, {
      report_id: other.report_id,
      published_version: other.published_version,
    }),
  ).rejects.toThrow();
});
it('displayed five-field report rows enter the exact original reader through the narrow UI reference mapper', async () => {
  const f = await fixture(),
    view = await read(f.sources, f.input, f.gate),
    displayed = (await inspect(view, 'reports')).reports[0],
    reference = dailyFieldReportReference(displayed);
  expect(Object.keys(displayed)).toEqual([
    'report_id',
    'published_version',
    'visit_id',
    'plan_id',
    'job_id',
  ]);
  expect(Object.keys(reference)).toEqual(['report_id', 'published_version']);
  const original = await report(view, reference);
  expect(original.report.report_id).toBe(displayed.report_id);
  expect(original.report.published_version).toBe(displayed.published_version);
  expect(original.handoff.job_id).toBe(displayed.job_id);
  // The original strict two-field boundary remains unchanged and rejects extra fields.
  await expect(report(view, displayed)).rejects.toThrow();
});
it('repeated original-control entry retains exact job and creates no review or successor', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    before = JSON.stringify(v),
    digest = vi.spyOn(crypto.subtle, 'digest');
  expect(await controls(v)).toBe(f.input.job_id);
  expect(await controls(v)).toBe(f.input.job_id);
  expect((await reconcile(v)).status).toBe('CURRENT_REVIEW_ONLY');
  expect(JSON.stringify(v)).toBe(before);
  // Hashes belong to original read verification, never a new schedule/order payload.
  const payloads = digest.mock.calls.map((args) =>
    new TextDecoder().decode(args[1] as ArrayBuffer),
  );
  expect(payloads.join('')).not.toContain('SCHEDULE_PROPOSAL');
});
it('exact current navigation maps to the existing field section only', async () => {
  const f = await fixture(),
    v = await read(f.sources, f.input, f.gate),
    callback = vi.fn();
  await navigate(v, callback);
  expect(callback).toHaveBeenCalledExactlyOnceWith(f.input.job_id, 'field');
});
it.each(['gate', 'input', 'root', 'member', 'job'] as const)(
  'retained %s drift blocks details, controls and navigation permanently',
  async (kind) => {
    const f = await fixture(),
      v = await read(f.sources, f.input, f.gate),
      snapshot = JSON.stringify(v),
      callback = vi.fn();
    if (kind === 'gate') f.gate.confirmed = false;
    if (kind === 'input') f.input.worker_id = 'different-worker';
    if (kind === 'root') f.sources.entries = [...f.sources.entries];
    if (kind === 'member')
      vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
        [],
      );
    if (kind === 'job')
      vi.spyOn(f.sources.estimates, 'syntheticJob').mockReturnValue(null);
    expect(() => current(v)).toThrow();
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    await expect(controls(v)).rejects.toThrow();
    await expect(navigate(v, callback)).rejects.toThrow();
    vi.restoreAllMocks();
    f.gate.confirmed = true;
    expect((await reconcile(v)).status).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
    expect(JSON.stringify(v)).toBe(snapshot);
  },
);
it.each(['gate', 'input', 'member'] as const)(
  'final %s withdrawal after the guide hash withholds its result',
  async (kind) => {
    const f = await fixture(),
      real = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await real(...args),
        text = new TextDecoder().decode(args[1] as ArrayBuffer);
      if (text.includes('LOCAL_DAILY_FIELD_GUIDE')) {
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'input')
          f.input.job_id = f.sources.entries[1].target.job_id!;
        if (kind === 'member')
          vi.spyOn(
            f.sources.operations,
            'syntheticMemberships',
          ).mockReturnValue([]);
      }
      return result;
    });
    await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
  },
);
it('inactive or downgraded current reviewer cannot read the guide', async () => {
  const f = await fixture(),
    members = f.sources.operations.syntheticMemberships(f.sources.company.id);
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue(
    members.map((m) => ({ ...m, role: 'staff', staff_type: 'field_staff' })),
  );
  await expect(read(f.sources, f.input, f.gate)).rejects.toThrow();
});
it.each([0, 1, 2])(
  'brand %s uses the exact host hint and accessible read-only controls',
  async (brand) => {
    const f = await fixture(brand, 2);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(DailyFieldGuide, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.input.job_id,
      }),
    );
    expect(html).toContain('value="' + f.input.job_id + '" selected');
    expect(html).toContain('Daily guide technician');
    expect(html).toContain('Inspect daily field sources');
    expect(html).not.toContain('Review field task schedule'); // Original controls need explicit source review and entry.
    expect(html).not.toMatch(/unit_cost|supplier|payroll|PRIVATE/);
  },
);
it('foreign host hint remains unselected with no prepared controls', async () => {
  const f = await fixture();
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', protocol: 'http:' },
  });
  const html = renderToStaticMarkup(
    createElement(DailyFieldGuide, {
      sources: f.sources,
      enabled: true,
      selectedJobId: 'foreign-job',
    }),
  );
  expect(html).toContain(
    'No exact authorized job selected. No fallback selection.',
  );
  expect(html).toContain('<button disabled="">Inspect daily field sources');
});
