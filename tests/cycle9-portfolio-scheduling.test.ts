import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPortfolioScheduling,
  reconcilePortfolioScheduling,
  openPortfolioSchedulingJob,
  type PortfolioSchedulingInput,
} from '../src/lib/workflows/portfolio-scheduling';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    entry = sources.entries[0],
    input: PortfolioSchedulingInput = {
      week_start: entry.day,
      timezone: entry.timezone,
      job_id: '',
      worker_id: '',
      proposals: [],
    };
  return { sources, gate, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) =>
  readPortfolioScheduling(f.sources, f.input, f.gate);
function proposal(f: Fixture, index = 0, start = '09:00', end = '11:00') {
  const e = f.sources.entries[index];
  return {
    job_id: e.target.job_id!,
    day: f.input.week_start,
    source_visit_id: e.scheduled_visit_id,
    worker_id: e.worker_id,
    start: f.input.week_start + 'T' + start,
    end: f.input.week_start + 'T' + end,
    hours_start: f.input.week_start + 'T08:00',
    hours_end: f.input.week_start + 'T16:00',
  };
}
it.each([0, 1, 2])(
  'company %s reads four actual jobs, deduped crew and exact property identities without writers',
  async (index) => {
    const f = await fixture(index),
      s = f.sources,
      state = s.property.read(s.company.id),
      jobs = await s.estimates.jobs(s.company.id),
      releases = s.entries.map((e) => e.release.read('staff')),
      writers = [
        vi.spyOn(s.estimates, 'assignJob'),
        vi.spyOn(s.estimates, 'recordTime'),
        vi.spyOn(s.property, 'addVisit'),
        vi.spyOn(s.property, 'saveVisit'),
        vi.spyOn(s.property, 'publish'),
      ],
      v = await read(f);
    expect(v.jobs).toHaveLength(4);
    expect(new Set(v.jobs.map((j) => j.source.job_id)).size).toBe(4);
    expect(new Set(v.jobs.map((j) => j.customer.id)).size).toBe(3);
    expect(new Set(v.jobs.map((j) => j.property.id)).size).toBe(3);
    expect(v.days).toHaveLength(7);
    for (const d of v.days) {
      expect(new Set(d.lanes.map((l) => l.worker_id)).size).toBe(
        d.lanes.length,
      );
      for (const e of d.lanes.flatMap((l) => l.events)) {
        const source = s.entries.find((j) => j.target.job_id! === e.job_id)!;
        expect(e.customer_id).toBe(source.target.customer_id);
        expect(e.property_id).toBe(source.target.location_id);
        expect(e.issued_version_id).toBe(source.target.version_id);
      }
    }
    expect(
      v.days.flatMap((d) => d.lanes.flatMap((l) => l.events)),
    ).toContainEqual(
      expect.objectContaining({
        kind: 'DATE_ONLY_VISIT',
        timing: 'TIME_UNKNOWN',
      }),
    );
    expect(v.actual_availability).toBe('UNKNOWN');
    expect(Object.values(v.authority).every((x) => x === false)).toBe(true);
    expect(JSON.stringify(v)).not.toMatch(
      /unit_cost|payroll|internal_notes|supplier|margin|@example.invalid|555010|PRIVATE/,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(s.property.read(s.company.id)).toEqual(state);
    expect(await s.estimates.jobs(s.company.id)).toEqual(jobs);
    expect(s.entries.map((e) => e.release.read('staff'))).toEqual(releases);
    expect(await reconcilePortfolioScheduling(v)).toMatchObject({
      status: 'CURRENT_REVIEW_ONLY',
      replacement: null,
      replay: 'FORBIDDEN',
    });
  },
);
it('shared crew conflicts across different exact jobs are calculated once by canonical capacity', async () => {
  const f = await fixture();
  f.input.proposals = [proposal(f, 0), proposal(f, 2, '10:00', '12:00')];
  const v = await read(f),
    lane = v.days[0].lanes.find(
      (l) => l.worker_id === f.sources.entries[0].worker_id,
    )!;
  expect(lane.capacity?.planned_minutes).toBe(180);
  expect(lane.conflicts).toContainEqual(
    expect.objectContaining({ minutes: 60 }),
  );
  expect(lane.events.filter((e) => e.kind === 'PROPOSED_WINDOW')).toHaveLength(
    2,
  );
  expect(
    new Set(
      lane.events
        .filter((e) => e.kind === 'PROPOSED_WINDOW')
        .map((e) => e.job_id),
    ).size,
  ).toBe(2);
});
it('identical repeated detached windows are ignored by canonical engine and exact event display', async () => {
  const f = await fixture(),
    p = proposal(f);
  f.input.proposals = [p, { ...p }];
  const v = await read(f),
    lane = v.days[0].lanes.find((l) => l.worker_id === p.worker_id)!;
  expect(v.days[0].duplicate_proposals_ignored).toBe(1);
  expect(lane.capacity?.planned_minutes).toBe(120);
  expect(lane.events.filter((e) => e.kind === 'PROPOSED_WINDOW')).toHaveLength(
    1,
  );
});
it('job and technician filters retain source context while capacity still uses authorized company evidence', async () => {
  const f = await fixture();
  f.input.proposals = [proposal(f), proposal(f, 2, '10:00', '12:00')];
  f.input.job_id = f.sources.entries[0].target.job_id!;
  f.input.worker_id = f.sources.entries[0].worker_id;
  const v = await read(f);
  expect(v.matching_jobs).toBe(1);
  expect(v.available_jobs).toBe(4);
  expect(
    v.days.every((d) =>
      d.lanes.every((l) => l.worker_id === f.input.worker_id),
    ),
  ).toBe(true);
  expect(
    v.days
      .flatMap((d) => d.lanes.flatMap((l) => l.events))
      .every((e) => e.job_id === f.input.job_id),
  ).toBe(true);
  expect(v.days[0].lanes[0].conflicts.length).toBeGreaterThan(0);
  await expect(
    openPortfolioSchedulingJob(v, f.sources.entries[1].target.job_id!),
  ).rejects.toThrow('displayed');
});
it('exact source navigation returns the original job/customer/property/issued identity', async () => {
  const f = await fixture(),
    v = await read(f),
    e = f.sources.entries[2],
    s = await openPortfolioSchedulingJob(v, e.target.job_id!);
  expect(s).toMatchObject({
    organization_id: e.target.organization_id,
    job_id: e.target.job_id!,
    customer_id: e.target.customer_id,
    location_id: e.target.location_id,
    estimate_id: e.target.estimate_id,
    version_id: e.target.version_id,
  });
  expect(Object.isFrozen(v.days)).toBe(true);
  await expect(openPortfolioSchedulingJob(v, 'foreign')).rejects.toThrow();
  expect((await reconcilePortfolioScheduling(structuredClone(v))).status).toBe(
    'UNKNOWN',
  );
});
it('no matching events remains availability UNKNOWN, not an available slot', async () => {
  const f = await fixture();
  f.input.week_start = '2030-01-07';
  const v = await read(f);
  expect(v.days.flatMap((d) => d.lanes.flatMap((l) => l.events))).toHaveLength(
    0,
  );
  expect(v.actual_availability).toBe('UNKNOWN');
});
it.each(['2026-02-30', '2026-1-1', 'invalid'])(
  'invalid week %s fails closed',
  async (value) => {
    const f = await fixture();
    f.input.week_start = value;
    await expect(read(f)).rejects.toThrow();
  },
);
it.each(['job_id', 'worker_id'] as const)(
  'foreign %s filter cannot broaden access',
  async (key) => {
    const f = await fixture();
    f.input[key] = 'foreign';
    await expect(read(f)).rejects.toThrow();
  },
);
it.each(['job_id', 'source_visit_id', 'worker_id'] as const)(
  'foreign detached proposal %s rejected',
  async (key) => {
    const f = await fixture(),
      p = proposal(f);
    p[key] = 'foreign';
    f.input.proposals = [p];
    await expect(read(f)).rejects.toThrow();
  },
);
it.each(['getter', 'symbol', 'serializer', 'row-getter'] as const)(
  'strict %s input rejected without invoking hook',
  async (kind) => {
    const f = await fixture(),
      hook = vi.fn();
    if (kind === 'getter')
      Object.defineProperty(f.input, 'week_start', { get: hook });
    if (kind === 'symbol') Object.assign(f.input, { [Symbol('unsafe')]: true });
    if (kind === 'serializer') Object.assign(f.input, { toJSON: hook });
    if (kind === 'row-getter') {
      f.input.proposals = [proposal(f)];
      Object.defineProperty(f.input.proposals, 0, { get: hook });
    }
    await expect(read(f)).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
  },
);
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('default-off gate %s blocks without read', async (gate) => {
  const f = await fixture(),
    spy = vi.spyOn(f.sources.estimates, 'jobs');
  await expect(
    readPortfolioScheduling(f.sources, f.input, gate),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('duplicate entry identity cannot double count jobs', async () => {
  const f = await fixture();
  (f.sources.entries as (typeof f.sources.entries)[0][]).push(
    f.sources.entries[0],
  );
  await expect(read(f)).rejects.toThrow();
});
it('foreign repository composition is denied', async () => {
  const f = await fixture(),
    foreign = await fixture(1);
  f.sources.property = foreign.sources.property;
  await expect(read(f)).rejects.toThrow();
});
it('same customer wrong property remains rejected rather than substituted', async () => {
  const f = await fixture();
  f.sources.entries[0].target.location_id =
    f.sources.entries[1].target.location_id;
  await expect(read(f)).rejects.toThrow();
});
it('actual source revision stales frozen board and prevents source navigation', async () => {
  const f = await fixture(),
    v = await read(f),
    before = JSON.stringify(v),
    plan = f.sources.property
      .read(f.sources.company.id)
      .plans.find((p) => p.id === f.sources.entries[0].plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...plan,
    name: 'Changed actual plan',
  });
  expect((await reconcilePortfolioScheduling(v)).status).toBe('UNKNOWN');
  await expect(
    openPortfolioSchedulingJob(v, f.sources.entries[0].target.job_id!),
  ).rejects.toThrow('UNKNOWN');
  expect(JSON.stringify(v)).toBe(before);
});
it('revoked actual reviewer invalidates all jobs', async () => {
  const f = await fixture(),
    actor = f.sources.company.id + '-estimator';
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.sources.entries.forEach((e) => (e.target.actor_id = actor));
  const v = await read(f);
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect((await reconcilePortfolioScheduling(v)).status).toBe('UNKNOWN');
  await expect(read(f)).rejects.toThrow();
});
it.each(['input', 'target', 'gate', 'container'] as const)(
  'awaited canonical read rechecks original live %s',
  async (kind) => {
    const f = await fixture(),
      original = f.sources.estimates.workforce.bind(f.sources.estimates);
    let once = true;
    vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
      async (org) => {
        const value = await original(org);
        if (once) {
          once = false;
          if (kind === 'input') f.input.worker_id = 'changed';
          if (kind === 'target')
            f.sources.entries[1].target.customer_id = 'foreign';
          if (kind === 'gate') f.gate.confirmed = false;
          if (kind === 'container') f.sources.entries = [...f.sources.entries];
        }
        return value;
      },
    );
    await expect(read(f)).rejects.toThrow();
  },
);
it('final awaited hash rejects actual source mutation after all day captures', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args),
      text = new TextDecoder().decode(args[1] as ArrayBuffer);
    if (!changed && text.includes('LOCAL_MULTI_JOB_WEEKLY_REVIEW')) {
      changed = true;
      const p = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.id === f.sources.entries[2].plan_id)!;
      f.sources.property.savePlan(f.sources.company.id, {
        ...p,
        name: 'Last hash mutation',
      });
    }
    return value;
  });
  await expect(read(f)).rejects.toThrow();
  expect(changed).toBe(true);
});
it('lost exact read remains UNKNOWN and never invokes a writer or replay', async () => {
  const f = await fixture(),
    v = await read(f),
    writer = vi.spyOn(f.sources.estimates, 'assignJob');
  vi.spyOn(f.sources.estimates, 'jobs').mockRejectedValue(Error('Read lost'));
  expect(await reconcilePortfolioScheduling(v)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(writer).not.toHaveBeenCalled();
});
it('invalid, out-of-week and unpaired proposal times fail closed', async () => {
  const f = await fixture();
  for (const p of [
    { ...proposal(f), day: '2030-01-01' },
    { ...proposal(f), end: null },
    { ...proposal(f), end: f.input.week_start + 'T08:00' },
  ]) {
    f.input.proposals = [p];
    await expect(read(f)).rejects.toThrow();
  }
});
it.each([
  ['2026-03-08', 1380],
  ['2026-11-01', 1500],
] as const)(
  'DST civil week %s has actual %s minutes without implied availability',
  async (day, minutes) => {
    const f = await fixture();
    f.input.week_start = day;
    expect((await read(f)).days[0].civil_day_minutes).toBe(minutes);
  },
);
