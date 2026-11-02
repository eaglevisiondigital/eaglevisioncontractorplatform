import { expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  readTechnicianDayBoard,
  openTechnicianDayBoardSource,
  technicianDayBoardEnabled,
  type TechnicianDayInput,
} from '../src/lib/field-day-board';
async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner',
    operations = new Operations(true),
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
  const input: TechnicianDayInput = {
    day: '2026-10-16',
    timezone: 'America/Chicago',
    worker_id: worker.worker_id,
    proposal: null,
  };
  return { company, org, actor, operations, repo, worker, model, order, input };
}
function proposal(f: Awaited<ReturnType<typeof fixture>>) {
  f.input.proposal = {
    day: f.input.day,
    timezone: f.input.timezone,
    confirmed: true,
    windows: [
      {
        order: f.order,
        worker_id: f.worker.worker_id,
        visit_id: null,
        start: f.input.day + 'T09:00',
        end: f.input.day + 'T11:00',
      },
    ],
    hours: [
      {
        worker_id: f.worker.worker_id,
        start: f.input.day + 'T08:00',
        end: f.input.day + 'T16:00',
      },
    ],
  };
  return f.input.proposal;
}
it.each([0, 1, 2])(
  'composes actual company %s job/crew/property sources without writes or availability claims',
  async (index) => {
    const f = await fixture(index),
      state = f.repo.read(f.org),
      jobs = await f.repo.estimates.jobs(f.org),
      assignments = f.repo.estimates.syntheticJobAssignments(f.org, f.actor);
    const writers = [
      vi.spyOn(f.repo.estimates, 'assignJob'),
      vi.spyOn(f.repo.estimates, 'recordTime'),
      vi.spyOn(f.repo, 'saveVisit'),
      vi.spyOn(f.repo.estimates, 'approveJob'),
    ];
    const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
    expect(board).toMatchObject({
      organization_id: f.org,
      actual_availability: 'UNKNOWN',
      authority: 'READ_ONLY_LOCAL_REVIEW',
      coverage: 'AVAILABLE_RECORDS_ONLY',
      proposal_review: 'NOT_REQUESTED',
    });
    expect(board.lanes).toHaveLength(1);
    expect(board.lanes[0].capacity).toBeNull();
    expect(
      board.lanes[0].events.find((e) => e.kind === 'DATE_ONLY_VISIT'),
    ).toMatchObject({
      customer_id: f.order.customer.id,
      property_id: f.order.visits[0].location_id,
      visit_id: f.order.visits[0].id,
      visit_revision: f.order.visits[0].revision,
      plan_id: f.order.visits[0].plan_id,
      plan_revision: f.order.visits[0].plan_revision,
      timing: 'TIME_UNKNOWN',
      start: null,
    });
    expect(Object.isFrozen(board.lanes[0].events)).toBe(true);
    expect(JSON.stringify(board)).not.toMatch(
      /unit_cost|supplier|payroll|internal_notes|PRIVATE|cash_hour_minor|margin/,
    );
    expect(writers.every((s) => s.mock.calls.length === 0)).toBe(true);
    expect(f.repo.read(f.org)).toEqual(state);
    expect(await f.repo.estimates.jobs(f.org)).toEqual(jobs);
    expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual(
      assignments,
    );
    const source = await openTechnicianDayBoardSource(
      board,
      f.order.source.job_id,
    );
    expect(source.source).toEqual(f.order.source);
  },
);
it('reuses canonical C4 union and conflicts while preserving date-only visit uncertainty', async () => {
  const f = await fixture(),
    p = proposal(f);
  p.windows.push({
    ...p.windows[0],
    visit_id: f.order.visits[0].id,
    start: '2026-10-16T10:00',
    end: '2026-10-16T12:00',
  });
  p.hours[0].end = '2026-10-16T10:00';
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
    lane = board.lanes[0];
  expect(lane.capacity).toMatchObject({
    planned_minutes: 180,
    proposed_available_minutes: 120,
    outside_proposed_hours_minutes: 120,
  });
  expect(lane.conflicts).toMatchObject([
    { kind: 'VISIT_OVERLAP', minutes: 60 },
  ]);
  expect(lane.events.filter((e) => e.kind === 'PROPOSED_WINDOW')).toHaveLength(
    2,
  );
  expect(lane.events.find((e) => e.kind === 'DATE_ONLY_VISIT')?.timing).toBe(
    'TIME_UNKNOWN',
  );
});
it('keeps adjacent windows conflict-free and delegates exact duplicate counting', async () => {
  const f = await fixture(),
    p = proposal(f);
  p.windows.push(
    { ...p.windows[0] },
    { ...p.windows[0], start: '2026-10-16T11:00', end: '2026-10-16T12:00' },
  );
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
  expect(board.duplicate_proposals_ignored).toBe(1);
  expect(board.lanes[0].capacity?.planned_minutes).toBe(180);
  expect(board.lanes[0].conflicts).toEqual([]);
});
it('clips cross-midnight human windows to the selected civil day using C4', async () => {
  const f = await fixture(),
    p = proposal(f);
  p.windows[0].start = '2026-10-15T23:00';
  p.windows[0].end = '2026-10-16T02:00';
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
  expect(board.lanes[0].capacity?.planned_minutes).toBe(120);
  expect(board.lanes[0].events[0].start).toBe('2026-10-15T23:00');
});
it.each([
  ['2026-03-08', 1380],
  ['2026-11-01', 1500],
])('preserves actual DST civil-day length %s', async (day, minutes) => {
  const f = await fixture();
  f.input.day = day as string;
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
  expect(board.civil_day_minutes).toBe(minutes);
});
it.each([
  ['2026-03-08', '02:15', '03:30'],
  ['2026-11-01', '01:15', '02:30'],
])('rejects ambiguous or missing DST proposal %s', async (day, start, end) => {
  const f = await fixture();
  f.input.day = day;
  const p = proposal(f);
  p.windows[0].start = day + 'T' + start;
  p.windows[0].end = day + 'T' + end;
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
});
it('reads actual assigned technician evidence only and denies office proposal review', async () => {
  const f = await fixture(),
    actor = f.org + '-field';
  const board = await readTechnicianDayBoard(f.repo, f.org, actor, f.input);
  expect(board.manager).toBe(false);
  expect(board.lanes.map((l) => l.worker_id)).toEqual([f.worker.worker_id]);
  f.input.worker_id = f.model.crew.find((w) => w.user_id !== actor)!.worker_id;
  await expect(
    readTechnicianDayBoard(f.repo, f.org, actor, f.input),
  ).rejects.toThrow('authorized technician');
  f.input.worker_id = f.worker.worker_id;
  proposal(f);
  await expect(
    readTechnicianDayBoard(f.repo, f.org, actor, f.input),
  ).rejects.toThrow();
});
it.each(['foreign-worker', 'sample-construction-field'])(
  'denies foreign worker %s',
  async (worker) => {
    const f = await fixture();
    f.input.worker_id = worker;
    await expect(
      readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow('authorized technician');
  },
);
it('denies foreign retained work-order proposals and unbound cloned source cards', async () => {
  const f = await fixture(),
    foreign = await fixture(1),
    p = proposal(f);
  p.windows[0].order = foreign.order;
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
  p.windows[0].order = structuredClone(f.order);
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
});
it('denies wrong property visit association', async () => {
  const f = await fixture(),
    p = proposal(f);
  p.windows[0].visit_id = 'foreign-property-visit';
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow('linked property visit');
});
it('denies proposal source changed after retained card creation', async () => {
  const f = await fixture();
  proposal(f);
  const visit = f.repo.read(f.org).visits[0];
  f.repo.saveVisit(f.org, visit, visit.content);
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
});
it('denies old source navigation after crew changes without replay', async () => {
  const f = await fixture(),
    board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
  await f.repo.estimates.assignJob(
    f.org,
    f.order.source.job_id,
    f.worker.user_id,
    false,
  );
  await expect(
    openTechnicianDayBoardSource(board, f.order.source.job_id),
  ).rejects.toThrow('source changed');
});
it('never substitutes newest, foreign, hidden or cloned board source', async () => {
  const f = await fixture(),
    board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
  await expect(openTechnicianDayBoardSource(board, 'foreign')).rejects.toThrow(
    'displayed',
  );
  await expect(
    openTechnicianDayBoardSource(structuredClone(board), f.order.source.job_id),
  ).rejects.toThrow('retained');
});
it('blocks changed live input and confirmation during a real awaited read', async () => {
  const f = await fixture();
  proposal(f);
  const original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let once = true;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    if (once) {
      once = false;
      f.input.proposal!.confirmed = false;
    }
    return value;
  });
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow('confirmation');
});
it.each(['day', 'timezone', 'worker_id', 'window'])(
  'blocks changed live %s during a real awaited read',
  async (key) => {
    const f = await fixture();
    const p = proposal(f),
      original = f.repo.estimates.workforce.bind(f.repo.estimates);
    let once = true;
    vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
      const value = await original(org);
      if (once) {
        once = false;
        if (key === 'window') p.windows[0].end = '2026-10-16T13:00';
        else f.input[key as 'day' | 'timezone' | 'worker_id'] = 'changed';
      }
      return value;
    });
    await expect(
      readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow();
  },
);
it('blocks actual staff downgrade during read', async () => {
  const f = await fixture();
  f.actor = f.worker.user_id;
  await f.operations.manageMember(
    f.org,
    f.actor,
    true,
    'staff',
    'office_manager',
  );
  const original = f.repo.estimates.workforce.bind(f.repo.estimates);
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    await f.operations.manageMember(
      f.org,
      f.actor,
      true,
      'staff',
      'field_staff',
    );
    return value;
  });
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
});
it('blocks actual source drift on final read', async () => {
  const f = await fixture(),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let reads = 0;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    if (++reads === 2)
      await f.repo.estimates.assignJob(
        f.org,
        f.order.source.job_id,
        f.worker.user_id,
        false,
      );
    return value;
  });
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow('changed');
});
it.each(['2026-02-30', 'invalid'])('rejects invalid date %s', async (day) => {
  const f = await fixture();
  f.input.day = day;
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
});
it('rejects invalid timezone and mismatched proposal day', async () => {
  const f = await fixture();
  f.input.timezone = 'Invalid/Zone';
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow();
  f.input.timezone = 'America/Chicago';
  proposal(f).day = '2026-10-17';
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow('Exact board/proposal');
});
it('does not invoke caller getters or serializers', async () => {
  const f = await fixture(),
    getter = vi.fn(() => f.input.day);
  Object.defineProperty(f.input, 'day', { get: getter });
  await expect(
    readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
  ).rejects.toThrow('own-data');
  expect(getter).not.toHaveBeenCalled();
});
it.each([false, 1, 'true'])(
  'requires exact proposal confirmation %s',
  async (confirmed) => {
    const f = await fixture();
    const p = proposal(f);
    p.confirmed = confirmed as boolean;
    await expect(
      readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
    ).rejects.toThrow('confirmation');
  },
);
it('shows available empty evidence without asserting free capacity', async () => {
  const f = await fixture();
  f.input.day = '2026-12-31';
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
  expect(board.lanes[0].events).toEqual([]);
  expect(board.lanes[0].actual_availability).toBe('UNKNOWN');
  expect(board.lanes[0].capacity).toBeNull();
});
it('gates new presentation with exact DEV flag and literal loopback only', () => {
  const input = {
    development: true,
    flag: 'true',
    hostname: '127.0.0.1',
    protocol: 'http:',
  };
  expect(technicianDayBoardEnabled(input)).toBe(true);
  for (const patch of [
    { development: false },
    { flag: undefined },
    { flag: 'TRUE' },
    { hostname: '127.0.0.1.example.com' },
    { protocol: 'file:' },
  ])
    expect(technicianDayBoardEnabled({ ...input, ...patch })).toBe(false);
});

it('retains exact recorded segment identity without private time narratives', async () => {
  const f = await fixture();
  f.input.day = '2026-10-05';
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input);
  const entry = board.lanes[0].events.find(
    (e) => e.kind === 'RECORDED_SEGMENT',
  )!;
  expect(entry).toMatchObject({
    recorded_id: f.order.recorded_time[0].id,
    issued_version_id: f.order.source.issued_version_id,
    estimate_id: f.order.source.estimate_id,
    timing: 'RECORDED_TIMESTAMPS',
    start: '2026-10-05T13:00:00Z',
    end: '2026-10-05T21:30:00Z',
  });
  expect(entry.property_id).toBeNull();
});
it('retains open recorded ends as UNKNOWN without fabricating a shift duration', async () => {
  const f = await fixture();
  await f.repo.estimates.recordTime(f.org, f.worker.worker_id, {
    job_id: f.order.source.job_id,
    overhead_center: null,
    task: 'PRIVATE time narrative',
    kind: 'work',
    started_at: '2026-10-16T13:00:00Z',
    ended_at: null,
    billable: false,
    corrects_id: null,
  });
  const p = proposal(f);
  p.windows = [];
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
    lane = board.lanes[0];
  expect(lane.events.find((e) => e.kind === 'RECORDED_SEGMENT')).toMatchObject({
    end: null,
    description: 'work · end UNKNOWN',
  });
  expect(lane.capacity?.recorded_minutes).toBeNull();
  expect(lane.capacity?.recorded_coverage).toBe('UNKNOWN');
  expect(JSON.stringify(board)).not.toContain('PRIVATE');
});
it('rejects a withdrawn confirmation while the final exact-source open is awaited', async () => {
  const f = await fixture();
  proposal(f);
  const board = await readTechnicianDayBoard(f.repo, f.org, f.actor, f.input),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let calls = 0;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    if (++calls === 2) f.input.proposal!.confirmed = false;
    return value;
  });
  await expect(
    openTechnicianDayBoardSource(board, f.order.source.job_id),
  ).rejects.toThrow('confirmation');
});
