import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  reviewCrewPlans,
  reconcileCrewPlans,
  openCrewPlanJob,
  assertCrewPlanCurrentNow,
  type CrewPlanInput,
} from '../src/lib/workflows/crew-plan-review';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[index], gate),
    first = sources.entries[0];
  const input: CrewPlanInput = {
    week_start: first.day,
    timezone: first.timezone,
    job_id: '',
    worker_id: '',
    plan_a: [],
    plan_b: [],
  };
  return { sources, input, gate };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function row(f: Fixture, index = 0, start = '09:00', end = '11:00') {
  const e = f.sources.entries[index],
    day = f.input.week_start;
  return {
    job_id: e.target.job_id!,
    worker_id: e.worker_id,
    source_visit_id: e.scheduled_visit_id,
    day,
    start: day + 'T' + start,
    end: day + 'T' + end,
    hours_start: day + 'T08:00',
    hours_end: day + 'T16:00',
  };
}
const review = (f: Fixture) => reviewCrewPlans(f.sources, f.input, f.gate);
it.each([0, 1, 2])(
  'brand %s compares canonical four-job week without mutating records or authority',
  async (i) => {
    const f = await fixture(i),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'addVisit'),
        vi.spyOn(f.sources.property, 'publish'),
      ];
    f.input.plan_a = [row(f)];
    f.input.plan_b = [row(f, 0, '10:00', '13:00')];
    const v = await review(f),
      lane = v.days[0].lanes.find(
        (l) => l.worker_id === f.sources.entries[0].worker_id,
      )!;
    expect(v.jobs).toHaveLength(4);
    expect(v.days).toHaveLength(7);
    expect(v.organization_id).toBe(f.sources.company.id);
    expect(v.changes[0].status).toBe('CHANGED');
    expect(lane.plan_a.capacity?.planned_minutes).toBe(120);
    expect(lane.plan_b.capacity?.planned_minutes).toBe(180);
    expect(lane.proposed_workload_difference_minutes).toBe(60);
    expect(
      lane.recorded_events.some(
        (e) => e.kind === 'DATE_ONLY_VISIT' && e.timing === 'TIME_UNKNOWN',
      ),
    ).toBe(true);
    expect(v.source_atomicity).toBe('CAPTURED_NOT_ATOMIC');
    expect(v.actual_availability).toBe('UNKNOWN');
    expect(Object.values(v.authority).every((a) => a === false)).toBe(true);
    expect(JSON.stringify(v)).not.toMatch(
      /unit_cost|payroll|supplier|private_notes|margin|@example.invalid|PRIVATE/,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect((await reconcileCrewPlans(v)).status).toBe('CURRENT_REVIEW_ONLY');
    expect(v.integrity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(v.days)).toBe(true);
  },
);
it('cross-job shared-technician overlap remains canonical and does not double count minutes', async () => {
  const f = await fixture();
  f.input.plan_a = [row(f), row(f, 2, '10:00', '12:00')];
  f.input.plan_b = [row(f), row(f, 2, '11:00', '13:00')];
  const v = await review(f),
    l = v.days[0].lanes.find((l) => l.worker_id === row(f).worker_id)!;
  expect(l.plan_a.capacity?.planned_minutes).toBe(180);
  expect(l.plan_a.conflicts).toContainEqual(
    expect.objectContaining({ minutes: 60 }),
  );
  expect(l.plan_b.conflicts).toHaveLength(0);
  expect(l.plan_b.capacity?.planned_minutes).toBe(240);
  expect(l.plan_a.events.map((e) => e.job_id)).toEqual(
    expect.arrayContaining([row(f).job_id, row(f, 2).job_id]),
  );
});
it('exact additions/removals/unchanged rows stay separate even when property or wording is shared', async () => {
  const f = await fixture();
  f.input.plan_a = [row(f), row(f, 1)];
  f.input.plan_b = [row(f), row(f, 3)];
  const v = await review(f);
  expect(v.changes.map((c) => c.status)).toEqual([
    'UNCHANGED',
    'REMOVED',
    'ADDED',
  ]);
  expect(new Set(v.changes.map((c) => c.job_id)).size).toBe(3);
  expect(v.jobs[0].property.id).toBe(v.jobs[3].property.id);
  expect(v.changes[0].source_visit_id).not.toBe(v.changes[2].source_visit_id);
});
it('missing proposed hours remains UNKNOWN, never the civil-day duration', async () => {
  const f = await fixture(),
    p = { ...row(f), hours_start: null, hours_end: null };
  f.input.plan_a = [p];
  f.input.plan_b = [{ ...p }];
  const v = await review(f),
    l = v.days[0].lanes.find((l) => l.worker_id === p.worker_id)!;
  expect(v.days[0].civil_day_minutes).toBe(1440);
  expect(l.plan_a.capacity?.proposed_available_minutes).toBeNull();
  expect(l.plan_a.capacity?.capacity_state).toBe('UNKNOWN');
  expect(l.actual_availability).toBe('UNKNOWN');
});
it('outside proposed working hours is factual review evidence, not dispatch permission', async () => {
  const f = await fixture();
  f.input.plan_b = [
    {
      ...row(f),
      hours_start: f.input.week_start + 'T12:00',
      hours_end: f.input.week_start + 'T16:00',
    },
  ];
  const v = await review(f),
    l = v.days[0].lanes.find((l) => l.worker_id === row(f).worker_id)!;
  expect(l.plan_b.capacity?.outside_proposed_hours_minutes).toBe(120);
  expect(l.plan_b.capacity?.capacity_state).toBe('OUTSIDE_PROPOSED_HOURS');
});
it('job/worker filtering retains whole-company conflict basis and exact navigation', async () => {
  const f = await fixture();
  f.input.plan_a = [row(f), row(f, 2, '10:00', '12:00')];
  f.input.job_id = row(f).job_id;
  f.input.worker_id = row(f).worker_id;
  const v = await review(f);
  expect(
    v.days.every((d) => d.lanes.every((l) => l.worker_id === row(f).worker_id)),
  ).toBe(true);
  expect(v.days[0].lanes[0].plan_a.conflicts.length).toBeGreaterThan(0);
  const target = await openCrewPlanJob(v, row(f).job_id);
  expect(target).toMatchObject({
    job_id: row(f).job_id,
    organization_id: f.sources.company.id,
    location_id: f.sources.entries[0].target.location_id,
    version_id: f.sources.entries[0].target.version_id,
  });
  await expect(openCrewPlanJob(v, row(f, 2).job_id)).rejects.toThrow();
});
it('empty future week is not an available slot or physical completion', async () => {
  const f = await fixture();
  f.input.week_start = '2030-01-07';
  const v = await review(f);
  expect(v.changes).toHaveLength(0);
  expect(
    v.days.flatMap((d) => d.lanes.flatMap((l) => l.recorded_events)),
  ).toHaveLength(0);
  expect(v.actual_availability).toBe('UNKNOWN');
});
it.each(['job_id', 'worker_id', 'source_visit_id'] as const)(
  'foreign proposal %s rejected',
  async (k) => {
    const f = await fixture(),
      p = row(f);
    p[k] = 'foreign';
    f.input.plan_b = [p];
    await expect(review(f)).rejects.toThrow();
  },
);
it.each(['job_id', 'worker_id'] as const)(
  'foreign context %s rejected',
  async (k) => {
    const f = await fixture();
    f.input[k] = 'foreign';
    await expect(review(f)).rejects.toThrow();
  },
);
it('wrong same-customer property source is never substituted', async () => {
  const f = await fixture();
  f.sources.entries[0].target.location_id =
    f.sources.entries[1].target.location_id;
  await expect(review(f)).rejects.toThrow();
});
it('unassigned technician cannot be selected even if another admitted job uses it', async () => {
  const f = await fixture(),
    p = row(f);
  p.worker_id = f.sources.entries[1].worker_id;
  f.input.plan_a = [p];
  await expect(review(f)).rejects.toThrow();
});
it('foreign repositories and duplicated canonical handles reject', async () => {
  const f = await fixture(),
    g = await fixture(1);
  f.sources.property = g.sources.property;
  await expect(review(f)).rejects.toThrow();
  const h = await fixture();
  h.sources.entries = [...h.sources.entries, h.sources.entries[0]];
  await expect(review(h)).rejects.toThrow();
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('default-off gate %s rejects', async (g) => {
  const f = await fixture(),
    spy = vi.spyOn(f.sources.estimates, 'jobs');
  await expect(reviewCrewPlans(f.sources, f.input, g)).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it.each(['plan_a', 'plan_b'] as const)(
  'duplicate exact identity in %s rejects instead of silently choosing times',
  async (k) => {
    const f = await fixture();
    f.input[k] = [row(f), row(f, 0, '12:00', '14:00')];
    await expect(review(f)).rejects.toThrow('One exact');
  },
);
it.each(['getter', 'serializer', 'symbol', 'row-getter', 'sparse'] as const)(
  'strict %s input rejects without invoking caller code',
  async (kind) => {
    const f = await fixture(),
      hook = vi.fn();
    if (kind === 'getter')
      Object.defineProperty(f.input, 'week_start', { get: hook });
    if (kind === 'serializer') Object.assign(f.input, { toJSON: hook });
    if (kind === 'symbol') Object.assign(f.input, { [Symbol('hook')]: true });
    if (kind === 'row-getter') {
      f.input.plan_a = [row(f)];
      Object.defineProperty(f.input.plan_a, 0, { get: hook });
    }
    if (kind === 'sparse') f.input.plan_b = Array(2);
    await expect(review(f)).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
  },
);
it.each(['week', 'timezone', 'paired', 'reversed', 'out-of-week'] as const)(
  'invalid %s input rejected by canonical validators',
  async (kind) => {
    const f = await fixture(),
      p = row(f);
    if (kind === 'week') f.input.week_start = '2026-02-30';
    if (kind === 'timezone') f.input.timezone = 'invalid';
    if (kind === 'paired') p.end = null as unknown as string;
    if (kind === 'reversed') p.end = f.input.week_start + 'T08:00';
    if (kind === 'out-of-week') p.day = '2030-01-01';
    f.input.plan_a = [p];
    await expect(review(f)).rejects.toThrow();
  },
);
it('frozen comparison stales after actual plan edit and remains immutable', async () => {
  const f = await fixture(),
    v = await review(f),
    original = JSON.stringify(v),
    p = f.sources.property
      .read(f.sources.company.id)
      .plans.find((p) => p.id === f.sources.entries[0].plan_id)!;
  f.sources.property.savePlan(f.sources.company.id, {
    ...p,
    name: 'Edited current plan',
  });
  expect((await reconcileCrewPlans(v)).status).toBe('UNKNOWN');
  expect(() => assertCrewPlanCurrentNow(v)).toThrow();
  await expect(openCrewPlanJob(v, row(f).job_id)).rejects.toThrow('UNKNOWN');
  expect(JSON.stringify(v)).toBe(original);
});
it('revoked staff member invalidates retained review', async () => {
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
  const v = await review(f);
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect((await reconcileCrewPlans(v)).status).toBe('UNKNOWN');
  await expect(review(f)).rejects.toThrow();
});
it.each(['input', 'gate', 'same-id-container', 'model'] as const)(
  'final comparison hash rechecks original live %s',
  async (kind) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_CREW_PLAN_COMPARISON')
      ) {
        changed = true;
        if (kind === 'input') f.input.plan_b.push(row(f));
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'same-id-container')
          f.sources.entries = [...f.sources.entries];
        if (kind === 'model')
          f.sources.entries[0].customerModel =
            f.sources.entries[1].customerModel;
      }
      return result;
    });
    await expect(review(f)).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('concurrent reviewers are read-only captures, not reservations', async () => {
  const f = await fixture(),
    other = { ...f.input, plan_b: [row(f)] };
  const [a, b] = await Promise.all([
    review(f),
    reviewCrewPlans(f.sources, other, f.gate),
  ]);
  expect(a.integrity.sha256).not.toBe(b.integrity.sha256);
  expect((await reconcileCrewPlans(a)).status).toBe('CURRENT_REVIEW_ONLY');
  expect((await reconcileCrewPlans(b)).status).toBe('CURRENT_REVIEW_ONLY');
  f.input.week_start = '2030-01-07';
  expect((await reconcileCrewPlans(a)).status).toBe('UNKNOWN');
  expect((await reconcileCrewPlans(b)).status).toBe('CURRENT_REVIEW_ONLY');
});
it('lost exact read and copied comparison stay UNKNOWN without writers or replay', async () => {
  const f = await fixture(),
    v = await review(f),
    writer = vi.spyOn(f.sources.estimates, 'assignJob');
  expect((await reconcileCrewPlans(structuredClone(v))).status).toBe('UNKNOWN');
  vi.spyOn(f.sources.estimates, 'jobs').mockRejectedValue(Error('lost read'));
  expect(await reconcileCrewPlans(v)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(writer).not.toHaveBeenCalled();
});
