import { expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  fieldCrewCapacityEnabled,
  reviewCrewDayCapacity,
  type CrewDayProposal,
} from '../src/lib/field-crew-capacity';
import {
  calculateCrewCapacity,
  capacityDay,
  capacityLocalInstant,
  capacityWindow,
  type CapacityInterval,
} from '../src/domain/field/crew-capacity';
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  const initial = await readFieldWorkOrders(repo, org, actor),
    worker = initial.crew.find((w) => w.user_id === org + '-field')!;
  await repo.estimates.assignJob(
    org,
    initial.orders[0].source.job_id,
    worker.user_id,
    true,
  );
  const model = await readFieldWorkOrders(repo, org, actor),
    order = model.orders[0];
  const input: CrewDayProposal = {
    day: '2026-10-16',
    timezone: 'America/Chicago',
    confirmed: true,
    windows: [
      {
        order,
        worker_id: worker.worker_id,
        visit_id: null,
        start: '2026-10-16T09:00',
        end: '2026-10-16T11:00',
      },
    ],
    hours: [
      {
        worker_id: worker.worker_id,
        start: '2026-10-16T08:00',
        end: '2026-10-16T16:00',
      },
    ],
  };
  return { company, org, actor, operations, repo, worker, model, order, input };
}
it.each([0, 1, 2])(
  'reviews actual company %s assigned sources, untimed property evidence and proposed capacity without mutation',
  async (index) => {
    const f = await fixture(index),
      state = f.repo.read(f.org),
      jobs = await f.repo.estimates.jobs(f.org),
      workforce = await f.repo.estimates.workforce(f.org),
      assignments = f.repo.estimates.syntheticJobAssignments(f.org, f.actor);
    const writers = [
      vi.spyOn(f.repo.estimates, 'assignJob'),
      vi.spyOn(f.repo.estimates, 'recordTime'),
      vi.spyOn(f.repo.estimates, 'approveJob'),
      vi.spyOn(f.repo, 'saveVisit'),
    ];
    const review = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
    expect(review).toMatchObject({
      organization_id: f.org,
      authority: 'SESSION_PROPOSAL_ONLY',
      actual_availability: 'UNKNOWN',
      historical_coverage: 'AVAILABLE_RECORDS_ONLY',
    });
    expect(
      review.workers.find((w) => w.worker_id === f.worker.worker_id),
    ).toMatchObject({
      planned_minutes: 120,
      proposed_available_minutes: 480,
      unused_proposed_minutes: 360,
      outside_proposed_hours_minutes: 0,
      capacity_state: 'WITHIN_PROPOSED_HOURS',
    });
    expect(review.windows[0].source).toMatchObject({
      ...f.order.source,
      customer_id: f.order.customer.id,
      property_id: null,
    });
    expect(review.dated_visits[0]).toMatchObject({
      visit_id: state.visits[0].id,
      plan_id: state.plans[0].id,
      property_id: state.plans[0].location_id,
      timing: 'TIME_UNKNOWN',
    });
    expect(writers.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(f.repo.read(f.org)).toEqual(state);
    expect(await f.repo.estimates.jobs(f.org)).toEqual(jobs);
    expect(await f.repo.estimates.workforce(f.org)).toEqual(workforce);
    expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual(
      assignments,
    );
    expect(JSON.stringify(review)).not.toMatch(
      /unit_cost|supplier|payroll|internal_notes|PRIVATE|cash_hour_minor|margin/,
    );
    expect(Object.isFrozen(review)).toBe(true);
    expect(Object.isFrozen(review.windows[0].source)).toBe(true);
  },
);
it('finds exact visit/work-order overlap without claiming that an untimed visit had a slot', async () => {
  const f = await fixture();
  f.input.windows.push({
    ...f.input.windows[0],
    visit_id: f.order.visits[0].id,
    start: '2026-10-16T10:00',
    end: '2026-10-16T12:00',
  });
  const review = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(review.overlaps).toMatchObject([
    { kind: 'VISIT_OVERLAP', minutes: 60 },
  ]);
  expect(
    review.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.planned_minutes,
  ).toBe(180);
  expect(review.dated_visits[0].timing).toBe('HUMAN_PROPOSED_WINDOW');
  expect(review.windows[1].source).toMatchObject({
    plan_id: f.order.visits[0].plan_id,
    visit_revision: f.order.visits[0].revision,
    property_id: f.order.visits[0].location_id,
  });
});
it('compares two actual existing-engine job baselines and crew assignments', async () => {
  const f = await fixture();
  const original = await f.repo.estimates.get(
    f.org,
    f.order.source.estimate_id,
    f.order.source.issued_version_id,
  );
  const payload = structuredClone(original.version.payload);
  payload.project.name = 'Second local job';
  payload.expires_on = '2099-01-01';
  const created = await f.repo.estimates.create(f.company, payload);
  const issued = await f.repo.estimates.issue(f.org, created);
  const second = await f.repo.estimates.approveJob(f.org, issued);
  await f.repo.estimates.assignJob(f.org, second, f.worker.user_id, true);
  const model = await readFieldWorkOrders(f.repo, f.org, f.actor);
  f.input.windows = model.orders.map((order) => ({
    order,
    worker_id: f.worker.worker_id,
    visit_id: null,
    start: '2026-10-16T09:00',
    end: '2026-10-16T11:00',
  }));
  const review = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(review.overlaps).toMatchObject([
    { kind: 'WORK_ORDER_OVERLAP', minutes: 120 },
  ]);
  expect(
    review.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.planned_minutes,
  ).toBe(120);
  expect(new Set(review.windows.map((w) => w.job_id)).size).toBe(2);
});
it('does not double count exact duplicate proposals and distinguishes same-source partial overlaps from adjacency', async () => {
  const f = await fixture(),
    first = f.input.windows[0];
  f.input.windows.push(
    { ...first },
    { ...first, start: '2026-10-16T10:00', end: '2026-10-16T12:00' },
    { ...first, start: '2026-10-16T12:00', end: '2026-10-16T13:00' },
  );
  const review = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(review.duplicate_proposals_ignored).toBe(1);
  expect(review.overlaps).toMatchObject([
    { kind: 'SAME_SOURCE_WINDOWS', minutes: 60 },
  ]);
  expect(
    review.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.planned_minutes,
  ).toBe(240);
});
it('unions overlapping proposed hours and finds outside-hours work even if total hours appear sufficient', async () => {
  const f = await fixture();
  f.input.hours = [
    {
      worker_id: f.worker.worker_id,
      start: '2026-10-16T07:00',
      end: '2026-10-16T10:00',
    },
    {
      worker_id: f.worker.worker_id,
      start: '2026-10-16T08:00',
      end: '2026-10-16T10:00',
    },
  ];
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(
    result.workers.find((w) => w.worker_id === f.worker.worker_id),
  ).toMatchObject({
    proposed_available_minutes: 180,
    planned_minutes: 120,
    outside_proposed_hours_minutes: 60,
    unused_proposed_minutes: 120,
    capacity_state: 'OUTSIDE_PROPOSED_HOURS',
  });
});
it('keeps availability and date-only conflict evidence UNKNOWN without invented zero-capacity claims', async () => {
  const f = await fixture();
  f.input.hours = [];
  f.input.windows = [];
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(
    result.workers.every(
      (w) =>
        w.capacity_state === 'UNKNOWN' && w.proposed_available_minutes === null,
    ),
  ).toBe(true);
  expect(result.overlaps).toEqual([]);
  expect(result.dated_visits[0].timing).toBe('TIME_UNKNOWN');
});
it('uses actual recorded timestamps separately from planned windows and clips cross-midnight evidence', async () => {
  const f = await fixture();
  f.input.day = '2026-10-05';
  f.input.hours = [];
  f.input.windows = [
    {
      ...f.input.windows[0],
      start: '2026-10-05T09:00',
      end: '2026-10-05T10:00',
    },
  ];
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(result.overlaps).toMatchObject([
    { kind: 'PROPOSAL_RECORDED_OVERLAP', minutes: 60 },
  ]);
  expect(
    result.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.recorded_minutes,
  ).toBe(510);
  await f.repo.estimates.recordTime(f.org, f.worker.worker_id, {
    job_id: f.order.source.job_id,
    overhead_center: null,
    task: 'PRIVATE local recorded narrative',
    kind: 'work',
    started_at: '2026-10-16T03:00:00Z',
    ended_at: '2026-10-16T07:00:00Z',
    billable: false,
    corrects_id: null,
  });
  f.input.day = '2026-10-16';
  f.input.windows = [];
  const clipped = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(
    clipped.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.recorded_minutes,
  ).toBe(120);
  expect(JSON.stringify(clipped)).not.toContain('PRIVATE');
});
it('open recorded ends stay UNKNOWN rather than silently extending or dropping a shift', async () => {
  const f = await fixture();
  await f.repo.estimates.recordTime(f.org, f.worker.worker_id, {
    job_id: f.order.source.job_id,
    overhead_center: null,
    task: 'Private clock',
    kind: 'work',
    started_at: '2026-10-16T13:00:00Z',
    ended_at: null,
    billable: false,
    corrects_id: null,
  });
  f.input.windows = [];
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(
    result.workers.find((w) => w.worker_id === f.worker.worker_id),
  ).toMatchObject({ recorded_minutes: null, recorded_coverage: 'UNKNOWN' });
  expect(result.recorded_issues[0]).toMatch(/End UNKNOWN/);
});
it('records malformed or conflicting time evidence as UNKNOWN, not fabricated duration', async () => {
  const f = await fixture(),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    value.entries[0].started_at = 'invalid';
    return value;
  });
  f.input.windows = [];
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(
    result.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.recorded_coverage,
  ).toBe('UNKNOWN');
});
it.each([
  'confirmation',
  'worker',
  'visit',
  'copy',
  'tenant',
  'customer',
  'property',
] as const)(
  'denies %s mismatch without creating business records',
  async (kind) => {
    const f = await fixture();
    if (kind === 'confirmation') f.input.confirmed = false;
    if (kind === 'worker') f.input.windows[0].worker_id = 'foreign-worker';
    if (kind === 'visit') f.input.windows[0].visit_id = 'foreign-visit';
    if (kind === 'copy') f.input.windows[0].order = structuredClone(f.order);
    if (kind === 'tenant')
      f.input.windows[0].order.source.organization_id = 'foreign';
    if (kind === 'customer') f.input.windows[0].order.customer.id = 'foreign';
    if (kind === 'property')
      f.input.windows[0].order.visits[0].location_id = 'foreign';
    const write = vi.spyOn(f.repo.estimates, 'assignJob');
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  },
);
it.each(['assignment', 'visit', 'job', 'revoked', 'worker'] as const)(
  'rejects stale actual %s source',
  async (kind) => {
    const f = await fixture();
    if (kind === 'assignment')
      await f.repo.estimates.assignJob(
        f.org,
        f.order.source.job_id,
        f.worker.user_id,
        false,
      );
    if (kind === 'visit') {
      const visit = f.repo.read(f.org).visits[0];
      f.repo.saveVisit(f.org, visit, visit.content);
    }
    if (kind === 'job') {
      const job = (await f.repo.estimates.jobs(f.org))[0];
      await f.repo.estimates.projection(f.org, job, job.projection);
    }
    if (kind === 'revoked') {
      f.actor = f.worker.user_id;
      await f.operations.manageMember(
        f.org,
        f.actor,
        true,
        'staff',
        'office_manager',
      );
      f.input.windows[0].order = (
        await readFieldWorkOrders(f.repo, f.org, f.actor)
      ).orders[0];
      await f.operations.manageMember(
        f.org,
        f.actor,
        false,
        'staff',
        'office_manager',
      );
    }
    if (kind === 'worker')
      await f.operations.manageMember(
        f.org,
        f.worker.user_id,
        false,
        'staff',
        'field_staff',
      );
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow();
  },
);
it('technicians and connected services cannot use office-only proposed capacity controls', async () => {
  const f = await fixture();
  f.input.windows[0].order = (
    await readFieldWorkOrders(f.repo, f.org, f.worker.user_id)
  ).orders[0];
  await expect(
    reviewCrewDayCapacity(f.repo, f.org, f.worker.user_id, f.input),
  ).rejects.toThrow(/office/);
  const repo = new PropertyRepository(new Operations(false));
  const read = vi.spyOn(repo.estimates, 'jobs');
  f.input.windows = [];
  f.input.hours = [];
  await expect(
    reviewCrewDayCapacity(repo, f.org, f.actor, f.input),
  ).rejects.toThrow(/Local/);
  expect(read).not.toHaveBeenCalled();
});
it.each([0, 1, 2])(
  'denies actual office classification drift across awaited reads for company %s',
  async (index) => {
    const f = await fixture(index),
      actor = f.worker.user_id;
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'staff',
      'office_manager',
    );
    const model = await readFieldWorkOrders(f.repo, f.org, actor);
    f.input.windows[0].order = model.orders[0];
    const original = f.repo.estimates.jobs.bind(f.repo.estimates);
    let count = 0;
    vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (++count === 5)
        await f.operations.manageMember(
          f.org,
          actor,
          true,
          'staff',
          'field_staff',
        );
      return result;
    });
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, actor, f.input),
    ).rejects.toThrow(/changed|office/);
  },
);
it('captures caller primitives and rejects mutation of retained card during an awaited read', async () => {
  const f = await fixture(),
    original = f.repo.estimates.jobs.bind(f.repo.estimates);
  let count = 0;
  vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (++count === 1) {
      f.input.day = '2026-12-31';
      f.input.hours[0].end = '2026-10-16T23:00';
    }
    return result;
  });
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(result.day).toBe('2026-10-16');
  expect(
    result.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.proposed_available_minutes,
  ).toBe(480);
  vi.restoreAllMocks();
  const jobs = f.repo.estimates.jobs.bind(f.repo.estimates);
  vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const value = await jobs(...args);
    f.order.customer.label = 'Tampered during await';
    return value;
  });
  await expect(
    reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
});
it('prior review is detached and immutable after later proposal changes; no command needs replay or retry', async () => {
  const f = await fixture();
  const first = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  const retained = JSON.stringify(first);
  f.input.hours[0].end = '2026-10-16T10:00';
  const second = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(JSON.stringify(first)).toBe(retained);
  expect(
    first.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.capacity_state,
  ).toBe('WITHIN_PROPOSED_HOURS');
  expect(
    second.workers.find((w) => w.worker_id === f.worker.worker_id)
      ?.capacity_state,
  ).toBe('OUTSIDE_PROPOSED_HOURS');
});
it('requires recorded visit date in its original timezone, not just the planning timezone', async () => {
  const f = await fixture();
  f.input.windows[0].visit_id = f.order.visits[0].id;
  f.input.windows[0].start = '2026-10-17T00:00';
  f.input.windows[0].end = '2026-10-17T01:00';
  f.input.day = '2026-10-17';
  f.input.hours = [];
  await expect(
    reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow(/recorded property date/);
});
it.each(['2026-02-30', '', '2026-1-1'])(
  'rejects invalid day %s',
  async (day) => {
    const f = await fixture();
    f.input.day = day;
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow();
  },
);
it('enforces bounded proposals, unambiguous local times and exact default-OFF preview gates', async () => {
  const f = await fixture();
  f.input.windows = Array.from({ length: 33 }, () => f.input.windows[0]);
  await expect(
    reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow(/32/);
  const on = {
    development: true,
    flag: 'true',
    hostname: '127.0.0.1',
    protocol: 'http:',
  };
  expect(fieldCrewCapacityEnabled(on)).toBe(true);
  for (const change of [
    { development: false },
    { flag: undefined },
    { flag: 'TRUE' },
    { hostname: 'example.com' },
    { protocol: 'file:' },
  ])
    expect(fieldCrewCapacityEnabled({ ...on, ...change })).toBe(false);
});
it('counts 23/25-hour civil days, rejects nonexistent/repeated DST local inputs and clips cross-day proposals', () => {
  expect(capacityDay('2026-03-08', 'America/Chicago').minutes).toBe(1380);
  expect(capacityDay('2026-11-01', 'America/Chicago').minutes).toBe(1500);
  expect(() =>
    capacityLocalInstant('2026-03-08T02:30', 'America/Chicago'),
  ).toThrow();
  expect(() =>
    capacityLocalInstant('2026-11-01T01:30', 'America/Chicago'),
  ).toThrow();
  expect(() =>
    capacityLocalInstant('2026-02-30T01:30', 'America/Chicago'),
  ).toThrow();
  expect(() => capacityDay('2026-10-16', 'Invalid/Zone')).toThrow();
  const day = capacityDay('2026-10-16', 'America/Chicago');
  const window = capacityWindow(
    '2026-10-15T23:00',
    '2026-10-16T02:00',
    'America/Chicago',
    day,
  );
  expect((window.end - window.start) / 60000).toBe(120);
  expect(() =>
    capacityWindow(
      '2026-10-16T12:00',
      '2026-10-16T09:00',
      'America/Chicago',
      day,
    ),
  ).toThrow();
  expect(() =>
    capacityWindow(
      '2026-10-17T09:00',
      '2026-10-17T10:00',
      'America/Chicago',
      day,
    ),
  ).toThrow();
});
it('duration/conflict arithmetic preserves independent workers and includes recorded overlap evidence', () => {
  const row = (
    key: string,
    worker_id: string,
    start: number,
    end: number,
  ): CapacityInterval => ({
    key,
    worker_id,
    job_id: key,
    visit_id: null,
    start: start * 60000,
    end: end * 60000,
  });
  const value = calculateCrewCapacity(
    ['one', 'two'],
    [row('job-a', 'one', 0, 60), row('job-b', 'two', 0, 60)],
    [],
    [row('entry-a', 'one', 60, 90), row('entry-b', 'one', 75, 120)],
    [],
  );
  expect(value.overlaps).toMatchObject([
    { kind: 'RECORDED_OVERLAP', minutes: 15 },
  ]);
  expect(value.workers[0].recorded_minutes).toBe(60);
  expect(() =>
    calculateCrewCapacity(['one'], [row('foreign', 'two', 0, 1)], [], [], []),
  ).toThrow(/Foreign/);
});
it('keeps a neighboring property date visible when its timezone day overlaps the chosen crew day', async () => {
  const f = await fixture(),
    plan = f.repo.read(f.org).plans[0];
  plan.timezone = 'Pacific/Kiritimati';
  f.repo.savePlan(f.org, plan);
  f.input.day = '2026-10-15';
  f.input.timezone = 'America/Los_Angeles';
  f.input.windows = [];
  f.input.hours = [];
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(result.dated_visits).toMatchObject([
    {
      date: '2026-10-16',
      timezone: 'Pacific/Kiritimati',
      timing: 'TIME_UNKNOWN',
    },
  ]);
});
it('rechecks a real crew relationship after the final awaited source read', async () => {
  const f = await fixture(),
    original = f.repo.estimates.jobs.bind(f.repo.estimates);
  let count = 0;
  vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (++count === 5)
      await f.repo.estimates.assignJob(
        f.org,
        f.order.source.job_id,
        f.worker.user_id,
        false,
      );
    return result;
  });
  await expect(
    reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow(/changed/);
});
it('retains UNKNOWN for one conflicting recorded ID and excludes duplicate evidence from arithmetic', async () => {
  const f = await fixture(),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    value.entries.push({
      ...value.entries[0],
      ended_at: '2026-10-05T22:00:00Z',
    });
    return value;
  });
  f.input.day = '2026-10-05';
  f.input.windows = [];
  f.input.hours = [];
  const result = await reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input);
  expect(result.recorded_issues[0]).toMatch(/Ambiguous recorded segment/);
  expect(
    result.workers.find((w) => w.worker_id === f.worker.worker_id),
  ).toMatchObject({
    recorded_minutes: null,
    known_recorded_minutes: 0,
    recorded_coverage: 'UNKNOWN',
  });
});
it.each(['yes', 1, {}, new Boolean(true), null])(
  'requires exact boolean confirmation, rejecting %j',
  async (confirmed) => {
    const f = await fixture();
    f.input.confirmed = confirmed as boolean;
    const jobs = vi.spyOn(f.repo.estimates, 'jobs');
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow(/confirmation/);
    expect(jobs).not.toHaveBeenCalled();
  },
);
it.each(['day', 'timezone', 'start', 'end', 'worker_id'] as const)(
  'rejects object-valued %s without implicit coercion or serialization',
  async (field) => {
    const f = await fixture(),
      toString = vi.fn(() =>
        field === 'day' ? '2026-10-16' : '2026-10-16T09:00',
      ),
      toJSON = vi.fn();
    const value = { toString, toJSON };
    if (field === 'day' || field === 'timezone')
      (f.input as unknown as Record<string, unknown>)[field] = value;
    else
      (f.input.windows[0] as unknown as Record<string, unknown>)[field] = value;
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow(/Primitive/);
    expect(toString).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  },
);
it.each([1, 3, 5])(
  'rejects input accessors and rechecks actual confirmation revocation at awaited boundary %s',
  async (boundary) => {
    const f = await fixture(),
      getter = vi.fn(() => '2026-10-16T09:00');
    Object.defineProperty(f.input.windows[0], 'start', {
      get: getter,
      configurable: true,
    });
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow(/data fields/);
    expect(getter).not.toHaveBeenCalled();
    Object.defineProperty(f.input.windows[0], 'start', {
      value: '2026-10-16T09:00',
      configurable: true,
    });
    const jobs = f.repo.estimates.jobs.bind(f.repo.estimates);
    let calls = 0;
    vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
      const result = await jobs(...args);
      if (++calls === boundary) f.input.confirmed = false;
      return result;
    });
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow(/confirmation/);
  },
);
it.each(['serializer', 'getter', 'symbol', 'inherited'] as const)(
  'rejects an actual retained card with added private %s without invocation',
  async (kind) => {
    const f = await fixture(),
      serializer = vi.fn(() => ({ PRIVATE: 'private content' })),
      getter = vi.fn(() => 'private content');
    if (kind === 'serializer')
      Object.defineProperty(f.order, 'toJSON', {
        value: serializer,
        enumerable: true,
      });
    if (kind === 'getter')
      Object.defineProperty(f.order, 'PRIVATE', {
        get: getter,
        enumerable: true,
      });
    if (kind === 'symbol')
      Object.defineProperty(f.order, Symbol('private'), { get: getter });
    if (kind === 'inherited')
      Object.setPrototypeOf(f.order, { toJSON: serializer });
    await expect(
      reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow(/data fields/);
    expect(serializer).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  },
);
it('rejects a retained-card accessor added while awaiting source read, without evaluating it', async () => {
  const f = await fixture(),
    getter = vi.fn(() => 'private source'),
    original = f.repo.estimates.jobs.bind(f.repo.estimates);
  let calls = 0;
  vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const value = await original(...args);
    if (++calls === 3)
      Object.defineProperty(f.order, 'PRIVATE', {
        get: getter,
        configurable: true,
      });
    return value;
  });
  await expect(
    reviewCrewDayCapacity(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow(/data fields/);
  expect(getter).not.toHaveBeenCalled();
});
