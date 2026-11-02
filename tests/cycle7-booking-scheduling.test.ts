import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  readBookingSchedulingSource,
  readBookingScheduling,
  reconcileBookingScheduling,
  type BookingSchedulingInput,
} from '../src/lib/workflows/booking-scheduling';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const sourceGate = { enabled: true, confirmed: true },
    gate = { enabled: true, confirmed: true },
    journey = await prepareLocalJourney(sampleCompanies[index], sourceGate);
  const source = await readBookingSchedulingSource(
    journey.property,
    journey.target,
    journey.scheduled_visit_id,
    sourceGate,
  );
  const input: BookingSchedulingInput = {
    source,
    source_visit_id: journey.scheduled_visit_id,
    day: journey.day,
    timezone: journey.timezone,
    worker_id: journey.worker_id,
    review_note: 'Explicit synthetic unsaved booking review context',
    start: journey.day + 'T09:00',
    end: journey.day + 'T11:00',
    hours_start: journey.day + 'T08:00',
    hours_end: journey.day + 'T16:00',
  };
  return { ...journey, source, input, gate, sourceGate };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const read = (f: Fixture) =>
  readBookingScheduling(f.property, f.target, f.input, f.gate);
function alternate(f: Fixture, day = '2026-12-29') {
  f.input.day = day;
  f.input.start = day + 'T09:00';
  f.input.end = day + 'T11:00';
  f.input.hours_start = day + 'T08:00';
  f.input.hours_end = day + 'T16:00';
}
it.each([0, 1, 2])(
  'company %s reviews exact source and unsaved alternate day without side effects',
  async (index) => {
    const f = await fixture(index),
      state = f.property.read(f.company.id),
      jobs = await f.estimates.jobs(f.company.id),
      workforce = await f.estimates.workforce(f.company.id),
      assignments = f.estimates.syntheticJobAssignments(
        f.company.id,
        f.target.actor_id,
      ),
      history = await f.estimates.history(f.company.id, f.target.estimate_id),
      release = f.release.read('staff');
    const writers = [
      vi.spyOn(f.property, 'addVisit'),
      vi.spyOn(f.property, 'saveVisit'),
      vi.spyOn(f.property, 'savePlan'),
      vi.spyOn(f.property, 'publish'),
      vi.spyOn(f.estimates, 'assignJob'),
      vi.spyOn(f.estimates, 'recordTime'),
      vi.spyOn(f.estimates, 'approveJob'),
    ];
    expect(f.source.source).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
      job_id: f.target.job_id,
      estimate_id: f.target.estimate_id,
      issued_version_id: f.target.version_id,
    });
    expect(f.source.original_visit.id).toBe(f.scheduled_visit_id);
    const same = await read(f);
    expect(same.proposal).toMatchObject({
      kind: 'SAME_DAY_VISIT_WINDOW',
      timing: 'EXPLICIT_HUMAN_PROPOSAL',
      visit_moved: false,
    });
    expect(same.capacity).toMatchObject({
      review: 'NO_REPORTED_CONFLICT',
      actual_availability: 'UNKNOWN',
      workforce_currentness: 'CAPTURED_NOT_ATOMIC',
    });
    expect(same.capacity.worker).toMatchObject({
      planned_minutes: 120,
      proposed_available_minutes: 480,
      outside_proposed_hours_minutes: 0,
    });
    expect(same.capacity.dated_visits).toContainEqual(
      expect.objectContaining({
        visit_id: f.scheduled_visit_id,
        timing: 'HUMAN_PROPOSED_WINDOW',
      }),
    );
    expect(await reconcileBookingScheduling(same)).toEqual({
      status: 'CURRENT_REVIEW_ONLY',
      replacement: null,
      replay: 'FORBIDDEN',
    });
    const bytes = JSON.stringify(same);
    alternate(f);
    expect(await reconcileBookingScheduling(same)).toMatchObject({
      status: 'UNKNOWN',
      replacement: null,
    });
    expect(JSON.stringify(same)).toBe(bytes);
    const next = await read(f);
    expect(next.proposal).toMatchObject({
      kind: 'UNSAVED_JOB_WINDOW_RESCHEDULE',
      day: '2026-12-29',
      visit_moved: false,
    });
    expect(next.original_visit).toEqual(f.source.original_visit);
    expect(next.capacity.dated_visits).toEqual([]);
    expect(Object.isFrozen(next.original_visit)).toBe(true);
    expect(
      Object.values(next.authority).every((value) => value === false),
    ).toBe(true);
    const { integrity, ...body } = next;
    expect(integrity.sha256).toBe(
      Buffer.from(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ).toString('hex'),
    );
    expect(JSON.stringify(next)).not.toMatch(
      /unit_cost|supplier|payroll|margin|internal_notes|cash_hour|@example.invalid|555010|Private/,
    );
    expect(writers.every((writer) => writer.mock.calls.length === 0)).toBe(
      true,
    );
    expect(f.property.read(f.company.id)).toEqual(state);
    expect(await f.estimates.jobs(f.company.id)).toEqual(jobs);
    expect(await f.estimates.workforce(f.company.id)).toEqual(workforce);
    expect(
      f.estimates.syntheticJobAssignments(f.company.id, f.target.actor_id),
    ).toEqual(assignments);
    expect(
      await f.estimates.history(f.company.id, f.target.estimate_id),
    ).toEqual(history);
    expect(f.release.read('staff')).toEqual(release);
  },
);
it('same source/input retains stable integrity without IDs or persistence', async () => {
  const f = await fixture(),
    first = await read(f),
    second = await read(f);
  expect(first.integrity).toEqual(second.integrity);
  expect(first.persistence).toBe('IMMUTABLE_SESSION_REVIEW_ONLY');
  expect(first).not.toHaveProperty('booking_id');
});
it.each([false, true])(
  'date-only and absent working hours remain UNKNOWN (alternate %s)',
  async (other) => {
    const f = await fixture();
    if (other) alternate(f);
    f.input.start =
      f.input.end =
      f.input.hours_start =
      f.input.hours_end =
        null;
    const view = await read(f);
    expect(view.capacity.review).toBe('UNKNOWN');
    expect(view.proposal.timing).toBe('DATE_ONLY_UNKNOWN');
    expect(view.capacity.worker.proposed_available_minutes).toBeNull();
    expect(view.capacity.actual_availability).toBe('UNKNOWN');
  },
);
it('uses canonical outside-hours arithmetic and reports missing proposed hours separately', async () => {
  const f = await fixture();
  f.input.hours_start = f.day + 'T10:00';
  f.input.hours_end = f.day + 'T12:00';
  const outside = await read(f);
  expect(outside.capacity.review).toBe('OUTSIDE_PROPOSED_HOURS');
  expect(outside.capacity.worker.outside_proposed_hours_minutes).toBe(60);
  f.input.hours_start = f.input.hours_end = null;
  expect((await read(f)).capacity.review).toBe('HOURS_UNKNOWN');
});
it('uses actual recorded job-time evidence for conflict detection', async () => {
  const f = await fixture();
  await f.estimates.recordTime(f.company.id, f.worker_id, {
    job_id: f.target.job_id!,
    overhead_center: null,
    task: 'Recorded synthetic job evidence',
    kind: 'work',
    started_at: f.day + 'T15:30:00Z',
    ended_at: f.day + 'T16:30:00Z',
    billable: false,
    corrects_id: null,
  });
  f.input.source = await readBookingSchedulingSource(
    f.property,
    f.target,
    f.scheduled_visit_id,
    f.sourceGate,
  );
  const view = await read(f);
  expect(view.capacity.review).toBe('RECORDED_CONFLICT');
  expect(view.capacity.conflicts).toContainEqual(
    expect.objectContaining({ kind: 'PROPOSAL_RECORDED_OVERLAP', minutes: 60 }),
  );
});
it('an open recorded segment cannot yield a no-conflict coverage claim', async () => {
  const f = await fixture();
  await f.estimates.recordTime(f.company.id, f.worker_id, {
    job_id: f.target.job_id!,
    overhead_center: null,
    task: 'Open synthetic recorded segment',
    kind: 'work',
    started_at: f.day + 'T15:30:00Z',
    ended_at: null,
    billable: false,
    corrects_id: null,
  });
  f.input.source = await readBookingSchedulingSource(
    f.property,
    f.target,
    f.scheduled_visit_id,
    f.sourceGate,
  );
  expect((await read(f)).capacity.review).toBe('RECORDED_TIME_UNKNOWN');
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('default OFF %s rejects before source access', async (gate) => {
  const f = await fixture(),
    source = vi.spyOn(f.estimates, 'readSyntheticPrototypeSources');
  await expect(
    readBookingSchedulingSource(
      f.property,
      f.target,
      f.scheduled_visit_id,
      gate,
    ),
  ).rejects.toThrow();
  await expect(
    readBookingScheduling(f.property, f.target, f.input, gate),
  ).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
});
it('cannot substitute connected or copied repositories', async () => {
  const f = await fixture(),
    connected = new PropertyRepository(new Operations(false));
  const source = vi.spyOn(connected.estimates, 'readSyntheticPrototypeSources');
  await expect(
    readBookingSchedulingSource(
      connected,
      f.target,
      f.scheduled_visit_id,
      f.gate,
    ),
  ).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
  await expect(
    readBookingSchedulingSource(
      { ...f.property } as PropertyRepository,
      f.target,
      f.scheduled_visit_id,
      f.gate,
    ),
  ).rejects.toThrow('PropertyRepository');
});
it.each([
  'organization_id',
  'actor_id',
  'customer_id',
  'location_id',
  'estimate_id',
  'version_id',
  'job_id',
] as const)('rejects foreign exact target %s', async (key) => {
  const f = await fixture();
  f.target[key] = 'foreign';
  await expect(read(f)).rejects.toThrow();
  await expect(
    readBookingSchedulingSource(
      f.property,
      f.target,
      f.scheduled_visit_id,
      f.sourceGate,
    ),
  ).rejects.toThrow();
});
it('rejects another tenant source, copied source, wrong visit and wrong worker', async () => {
  const f = await fixture(),
    foreign = await fixture(1);
  f.input.source = foreign.source;
  await expect(read(f)).rejects.toThrow('exact current target');
  f.input.source = structuredClone(f.source);
  await expect(read(f)).rejects.toThrow('retained');
  f.input.source = f.source;
  f.input.source_visit_id = foreign.scheduled_visit_id;
  await expect(read(f)).rejects.toThrow('original visit');
  f.input.source_visit_id = f.scheduled_visit_id;
  f.input.worker_id = foreign.worker_id;
  await expect(read(f)).rejects.toThrow('technician');
});
it('does not associate an unrelated same-company visit or job by similar location', async () => {
  const f = await fixture(),
    state = f.property.read(f.company.id),
    other = state.visits.find(
      (v) => ![f.visit_id, f.scheduled_visit_id].includes(v.id),
    )!;
  expect(other).toBeTruthy();
  await expect(
    readBookingSchedulingSource(f.property, f.target, other.id, f.sourceGate),
  ).rejects.toThrow('Exact existing property visit');
  const orders = await readFieldWorkOrders(
    f.property,
    f.company.id,
    f.target.actor_id,
  );
  const wrong = orders.orders.find((o) => o.source.job_id !== f.target.job_id)!;
  await expect(
    readBookingScheduling(
      f.property,
      { ...f.target, job_id: wrong.source.job_id },
      f.input,
      f.gate,
    ),
  ).rejects.toThrow();
});
it.each(['field', 'estimator'])(
  'does not promote %s staff to the synthetic owner/admin review boundary',
  async (role) => {
    const f = await fixture();
    f.target.actor_id = f.company.id + '-' + role;
    await expect(
      readBookingSchedulingSource(
        f.property,
        f.target,
        f.scheduled_visit_id,
        f.sourceGate,
      ),
    ).rejects.toThrow();
  },
);
it('current admin revocation denies retained review and exact reconciliation', async () => {
  const f = await fixture(),
    actor = f.company.id + '-estimator';
  await f.operations.manageMember(
    f.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.target.actor_id = actor;
  f.input.source = await readBookingSchedulingSource(
    f.property,
    f.target,
    f.scheduled_visit_id,
    f.sourceGate,
  );
  const view = await read(f);
  await f.operations.manageMember(
    f.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  await expect(read(f)).rejects.toThrow();
  expect(await reconcileBookingScheduling(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
it('changed visit revision blocks preparation without altering historical published evidence', async () => {
  const f = await fixture(),
    reports = f.property.read(f.company.id).reports;
  const visit = f.property
    .read(f.company.id)
    .visits.find((v) => v.id === f.scheduled_visit_id)!;
  f.property.saveVisit(f.company.id, visit, {
    ...visit.content,
    summary: 'Saved scheduling source edit',
  });
  await expect(read(f)).rejects.toThrow();
  expect(f.property.read(f.company.id).reports).toEqual(reports);
});
it('changing an actual assigned crew relationship invalidates the source', async () => {
  const f = await fixture(),
    view = await read(f);
  await f.estimates.assignJob(
    f.company.id,
    f.target.job_id!,
    f.company.id + '-field',
    false,
  );
  await expect(read(f)).rejects.toThrow();
  expect((await reconcileBookingScheduling(view)).status).toBe('UNKNOWN');
});
it.each([
  ['day', '2026-02-30'],
  ['day', '2026-12-2'],
  ['timezone', 'UTC'],
  ['worker_id', ''],
  ['start', '2026-12-28T25:00'],
  ['start', '2026-12-29T09:00'],
  ['end', '2026-12-28T08:00'],
  ['start', null],
  ['hours_start', null],
] as const)('rejects invalid %s %s', async (key, value) => {
  const f = await fixture();
  Object.assign(f.input, { [key]: value });
  await expect(read(f)).rejects.toThrow();
});
it.each([
  ['2026-03-08', '02:15', '03:30'],
  ['2026-11-01', '01:15', '02:30'],
])(
  'rejects nonexistent or repeated DST wall time on %s',
  async (day, start, end) => {
    const f = await fixture();
    alternate(f, day);
    f.input.start = `${day}T${start}`;
    f.input.end = `${day}T${end}`;
    await expect(read(f)).rejects.toThrow();
  },
);
it.each([
  ['2026-03-08', 1380],
  ['2026-11-01', 1500],
] as const)(
  'canonical valid civil day %s contains %s minutes',
  async (day, minutes) => {
    const f = await fixture();
    alternate(f, day);
    const view = await read(f);
    expect(view.capacity.civil_day_minutes).toBe(minutes);
    expect(view.capacity.worker.planned_minutes).toBe(120);
  },
);
it.each(['getter', 'serializer', 'symbol', 'prototype', 'source-getter'])(
  'rejects %s without executing caller hooks',
  async (kind) => {
    const f = await fixture(),
      hook = vi.fn();
    if (kind === 'getter')
      Object.defineProperty(f.input, 'start', { get: hook });
    if (kind === 'serializer') Object.assign(f.input, { toJSON: hook });
    if (kind === 'symbol') Object.assign(f.input, { [Symbol('extra')]: true });
    if (kind === 'prototype')
      Object.setPrototypeOf(f.input, { inherited: true });
    if (kind === 'source-getter')
      Object.defineProperty(f.input, 'source', { get: hook });
    await expect(read(f)).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
  },
);
it.each(['target', 'input', 'confirmation', 'source-confirmation'] as const)(
  'checks live %s after awaited canonical reads',
  async (kind) => {
    const f = await fixture(),
      original = f.estimates.workforce.bind(f.estimates);
    let once = true;
    vi.spyOn(f.estimates, 'workforce').mockImplementation(async (org) => {
      const result = await original(org);
      if (once) {
        once = false;
        if (kind === 'target') f.target.location_id = 'foreign';
        if (kind === 'input') f.input.end = f.day + 'T13:00';
        if (kind === 'confirmation') f.gate.confirmed = false;
        if (kind === 'source-confirmation') f.sourceGate.confirmed = false;
      }
      return result;
    });
    await expect(read(f)).rejects.toThrow();
  },
);
it.each(['plan', 'target', 'confirmation'] as const)(
  'final awaited source hash cannot hide %s mutation',
  async (kind) => {
    const f = await fixture();
    alternate(f);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (++calls === 2) {
        if (kind === 'plan') {
          const plan = f.property
            .read(f.company.id)
            .plans.find((p) => p.id === f.plan_id)!;
          f.property.savePlan(f.company.id, {
            ...plan,
            name: 'Edited during last source hash',
          });
        }
        if (kind === 'target') f.target.job_id = 'foreign';
        if (kind === 'confirmation') f.gate.confirmed = false;
      }
      return result;
    });
    await expect(read(f)).rejects.toThrow();
    expect(calls).toBe(2);
  },
);
it('frozen review survives subsequent edits without replacement or automatic application', async () => {
  const f = await fixture(),
    view = await read(f),
    before = JSON.stringify(view);
  f.input.end = f.day + 'T12:00';
  expect(await reconcileBookingScheduling(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(JSON.stringify(view)).toBe(before);
  expect(await reconcileBookingScheduling(structuredClone(view))).toMatchObject(
    { status: 'UNKNOWN', replacement: null },
  );
});
it('a separate caller target object stays live during later exact reconciliation', async () => {
  const f = await fixture(),
    selected = { ...f.target };
  const view = await readBookingScheduling(
    f.property,
    selected,
    f.input,
    f.gate,
  );
  selected.location_id = 'foreign';
  expect((await reconcileBookingScheduling(view)).status).toBe('UNKNOWN');
});
it('lost read acknowledgment retains UNKNOWN without writer, new source ID or replay', async () => {
  const f = await fixture(),
    view = await read(f),
    writer = vi.spyOn(f.property, 'addVisit');
  vi.spyOn(f.estimates, 'readSyntheticPrototypeSources').mockImplementation(
    () => {
      throw Error('Lost read acknowledgment');
    },
  );
  expect(await reconcileBookingScheduling(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(writer).not.toHaveBeenCalled();
});
it('source load cannot hide an actual visit edit during its last awaited source hash', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (++calls === 3) {
      const visit = f.property
        .read(f.company.id)
        .visits.find((v) => v.id === f.scheduled_visit_id)!;
      f.property.saveVisit(f.company.id, visit, {
        ...visit.content,
        summary: 'Actual last-hash visit edit',
      });
    }
    return result;
  });
  await expect(
    readBookingSchedulingSource(
      f.property,
      f.target,
      f.scheduled_visit_id,
      f.sourceGate,
    ),
  ).rejects.toThrow();
  expect(calls).toBe(3);
});
it('characterizes final other-job time capture without claiming atomic workforce availability', async () => {
  const f = await fixture(),
    model = await readFieldWorkOrders(
      f.property,
      f.company.id,
      f.target.actor_id,
    ),
    other = model.orders.find((o) => o.source.job_id !== f.target.job_id)!;
  await f.estimates.assignJob(
    f.company.id,
    other.source.job_id,
    f.company.id + '-field',
    true,
  );
  f.input.source = await readBookingSchedulingSource(
    f.property,
    f.target,
    f.scheduled_visit_id,
    f.sourceGate,
  );
  alternate(f);
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (++calls === 2)
      await f.estimates.recordTime(f.company.id, f.worker_id, {
        job_id: other.source.job_id,
        overhead_center: null,
        task: 'Other-job final capture race',
        kind: 'work',
        started_at: '2026-12-29T15:00:00Z',
        ended_at: '2026-12-29T16:00:00Z',
        billable: false,
        corrects_id: null,
      });
    return result;
  });
  const view = await read(f);
  expect(view.capacity.workforce_currentness).toBe('CAPTURED_NOT_ATOMIC');
  expect(view.capacity.actual_availability).toBe('UNKNOWN');
  expect(Object.values(view.authority).every((value) => value === false)).toBe(
    true,
  );
  expect(await reconcileBookingScheduling(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
