import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  reviewOperationsExperiments,
  reconcileOperationsExperiment,
  type OperationsExperimentInput,
} from '../src/lib/operations-experiments';

afterEach(() => vi.restoreAllMocks());
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
    order = model.orders[0],
    visit = order.visits[0];
  const input: OperationsExperimentInput = {
    day: visit.date,
    timezone: visit.timezone,
    booking: {
      order,
      worker_id: worker.worker_id,
      visit_id: visit.id,
      start: visit.date + 'T09:00',
      end: visit.date + 'T11:00',
    },
    other_windows: [],
    proposed_hours: [
      {
        worker_id: worker.worker_id,
        start: visit.date + 'T08:00',
        end: visit.date + 'T16:00',
      },
    ],
    route: [{ order, visit_id: visit.id }],
    capture: {
      order,
      visit_id: visit.id,
      note: 'Synthetic observation proposal; not physical completion.',
    },
  };
  const gate = { enabled: true, confirmed: true };
  return {
    org,
    actor,
    operations,
    repo,
    worker,
    model,
    order,
    visit,
    input,
    gate,
  };
}
const review = (f: Awaited<ReturnType<typeof fixture>>) =>
  reviewOperationsExperiments(f.repo, f.org, f.actor, f.input, f.gate);
it.each([0, 1, 2])(
  'reviews actual company %s booking, route and unsaved capture without effects',
  async (index) => {
    const f = await fixture(index),
      before = f.repo.read(f.org),
      jobs = await f.repo.estimates.jobs(f.org),
      assignments = f.repo.estimates.syntheticJobAssignments(f.org, f.actor);
    const writes = [
      vi.spyOn(f.repo, 'addVisit'),
      vi.spyOn(f.repo, 'saveVisit'),
      vi.spyOn(f.repo.estimates, 'assignJob'),
      vi.spyOn(f.repo.estimates, 'recordTime'),
      vi.spyOn(f.repo.estimates, 'approveJob'),
    ];
    const result = await review(f);
    expect(result.booking).toMatchObject({
      source: {
        organization_id: f.org,
        job_id: f.order.source.job_id,
        issued_version_id: f.order.source.issued_version_id,
        customer_id: f.order.customer.id,
        property_id: f.visit.location_id,
        visit_id: f.visit.id,
        visit_revision: f.visit.revision,
        plan_id: f.visit.plan_id,
        plan_revision: f.visit.plan_revision,
      },
      day_review: 'NO_REPORTED_DAY_CONFLICT',
      actual_availability: 'UNKNOWN',
      booking_authority: 'BLOCKED',
    });
    expect(result.booking.capacity.planned_minutes).toBe(120);
    expect(result.route).toMatchObject({
      ordering: 'EXPLICIT_HUMAN_INPUT_ORDER',
      travel_time: 'UNKNOWN',
      geography: 'UNAVAILABLE',
      optimization: 'NOT_PERFORMED',
      dispatch_authority: 'BLOCKED',
    });
    expect(result.offline_capture).toMatchObject({
      status: 'UNSAVED_FIELD_NOTE_PROPOSAL',
      storage: 'SESSION_OBJECT_ONLY',
      crash_durability: 'NOT_PROVIDED',
      synchronization: 'EXACT_READ_ONLY_RECONCILIATION_ONLY',
      replay: 'FORBIDDEN',
      physical_completion: 'UNVERIFIED',
    });
    expect(result.integrity.content_sha256).toMatch(/^[a-f0-9]{64}$/);
    const { integrity, ...body } = result;
    expect(integrity.content_sha256).toBe(
      Buffer.from(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ).toString('hex'),
    );
    expect(
      Object.values(result.authority).every((value) => value === false),
    ).toBe(true);
    expect(Object.isFrozen(result.offline_capture.source)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /unit_cost|cash_hour|margin|internal_notes|supplier access|PRIVATE/,
    );
    expect(writes.every((s) => s.mock.calls.length === 0)).toBe(true);
    expect(f.repo.read(f.org)).toEqual(before);
    expect(await f.repo.estimates.jobs(f.org)).toEqual(jobs);
    expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual(
      assignments,
    );
    expect(await reconcileOperationsExperiment(result)).toMatchObject({
      state: 'CURRENT_REVIEW_ONLY',
      replay: 'FORBIDDEN',
      replacement: null,
    });
  },
);
it('composes canonical capacity overlap, union and outside-hours evidence', async () => {
  const f = await fixture();
  f.input.other_windows.push({
    order: f.order,
    worker_id: f.worker.worker_id,
    visit_id: null,
    start: f.input.day + 'T10:00',
    end: f.input.day + 'T12:00',
  });
  f.input.proposed_hours[0].end = f.input.day + 'T10:00';
  const result = await review(f);
  expect(result.booking.day_review).toBe('REPORTED_DAY_CONFLICT');
  expect(result.booking.conflicts).toMatchObject([
    { kind: 'VISIT_OVERLAP', minutes: 60 },
  ]);
  expect(result.booking.capacity).toMatchObject({
    planned_minutes: 180,
    proposed_available_minutes: 120,
    outside_proposed_hours_minutes: 120,
  });
});
it('retains outside proposed hours, without treating a conflict-free proposal as available', async () => {
  const f = await fixture();
  f.input.proposed_hours[0].end = f.input.day + 'T10:00';
  expect((await review(f)).booking.day_review).toBe('OUTSIDE_PROPOSED_HOURS');
  f.input.proposed_hours = [];
  expect((await review(f)).booking.day_review).toBe('HOURS_UNKNOWN');
});
it('preserves date-only booking timing as UNKNOWN', async () => {
  const f = await fixture();
  f.input.booking.start = f.input.booking.end = null;
  const result = await review(f);
  expect(result.booking).toMatchObject({
    timing: 'DATE_ONLY_UNKNOWN',
    day_review: 'UNKNOWN',
    proposed_start: null,
    proposed_end: null,
    actual_availability: 'UNKNOWN',
  });
});
it('preserves explicitly supplied two-stop order instead of claiming geographic optimization', async () => {
  const f = await fixture(),
    context = f.repo
      .read(f.org)
      .contexts.find((c) => c.job_id === f.order.source.job_id)!;
  const plan = f.repo.createPlan(f.org, context, 'Second synthetic visit'),
    second = f.repo.addVisit(f.org, plan.id, f.input.day);
  const model = await readFieldWorkOrders(f.repo, f.org, f.actor),
    order = model.orders.find(
      (o) => o.source.job_id === f.order.source.job_id,
    )!;
  f.input.booking.order = f.input.capture.order = order;
  f.input.route = [
    { order, visit_id: second.id },
    { order, visit_id: f.visit.id },
  ];
  const result = await review(f);
  expect(result.route.stops.map((s) => s.source.visit_id)).toEqual([
    second.id,
    f.visit.id,
  ]);
  expect(result.route.stops.map((s) => s.position)).toEqual([1, 2]);
  expect(result.route.travel_time).toBe('UNKNOWN');
});
it('permits an empty supplied route without inventing stops', async () => {
  const f = await fixture();
  f.input.route = [];
  expect((await review(f)).route.stops).toEqual([]);
});
it('keeps captures immutable and flags later human proposal edits without replay', async () => {
  const f = await fixture(),
    result = await review(f),
    original = JSON.stringify(result);
  f.input.capture.note = 'Changed proposal';
  expect(await reconcileOperationsExperiment(result)).toMatchObject({
    state: 'STALE',
    reason: 'HUMAN_PROPOSAL_CHANGED',
    replacement: null,
  });
  expect(JSON.stringify(result)).toBe(original);
});
it('retains exact source drift as stale or unknown and never replaces a capture', async () => {
  const f = await fixture(),
    result = await review(f),
    v = f.repo.read(f.org).visits.find((v) => v.id === f.visit.id)!;
  f.repo.saveVisit(f.org, v, { ...v.content, summary: 'Changed exact source' });
  expect(await reconcileOperationsExperiment(result)).toMatchObject({
    state: 'STALE',
    replay: 'FORBIDDEN',
    replacement: null,
  });
  expect(result.offline_capture.source.visit_revision).toBe(f.visit.revision);
});
it('treats refreshed/cloned or uncertain evidence as UNKNOWN without a new ID', async () => {
  const f = await fixture(),
    result = await review(f);
  expect(
    await reconcileOperationsExperiment(structuredClone(result)),
  ).toMatchObject({ state: 'UNKNOWN', replacement: null });
  vi.spyOn(f.repo.estimates, 'jobs').mockRejectedValue(
    Error('Lost source acknowledgement'),
  );
  expect(await reconcileOperationsExperiment(result)).toMatchObject({
    state: 'UNKNOWN',
    replay: 'FORBIDDEN',
    replacement: null,
  });
  expect(await reconcileOperationsExperiment(result)).toMatchObject({
    state: 'UNKNOWN',
    replacement: null,
  });
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
  { enabled: 'true', confirmed: true },
])('is default-off before any source read: %s', async (gate) => {
  const f = await fixture(),
    spy = vi.spyOn(f.repo.estimates, 'jobs');
  await expect(
    reviewOperationsExperiments(
      f.repo,
      f.org,
      f.actor,
      f.input,
      gate as typeof f.gate,
    ),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('denies connected repositories before hosted reads', async () => {
  const repo = new PropertyRepository(new Operations(false)),
    spy = vi.spyOn(repo.estimates, 'jobs'),
    f = await fixture();
  await expect(
    reviewOperationsExperiments(repo, f.org, f.actor, f.input, f.gate),
  ).rejects.toThrow('Local synthetic');
  expect(spy).not.toHaveBeenCalled();
});
it.each([
  'foreign-actor',
  'sample-construction-owner',
  'sample-property-field',
])('denies ineligible actor %s', async (actor) => {
  const f = await fixture();
  await expect(
    reviewOperationsExperiments(f.repo, f.org, actor, f.input, f.gate),
  ).rejects.toThrow();
});
it.each(['booking', 'capture', 'route'])(
  'denies foreign exact %s source',
  async (key) => {
    const f = await fixture(),
      foreign = await fixture(1);
    if (key === 'booking') f.input.booking.order = foreign.order;
    if (key === 'capture') f.input.capture.order = foreign.order;
    if (key === 'route') f.input.route[0].order = foreign.order;
    await expect(review(f)).rejects.toThrow('retained');
  },
);
it('denies cloned or mutated retained work orders', async () => {
  const f = await fixture();
  f.input.booking.order = structuredClone(f.order);
  await expect(review(f)).rejects.toThrow('retained');
  f.input.booking.order = f.order;
  f.order.visits[0].location_id = 'foreign-property';
  await expect(review(f)).rejects.toThrow('retained');
});
it.each(['booking', 'capture', 'route'])(
  'denies an unrelated property visit in %s',
  async (key) => {
    const f = await fixture();
    if (key === 'booking') f.input.booking.visit_id = 'foreign-visit';
    if (key === 'capture') f.input.capture.visit_id = 'foreign-visit';
    if (key === 'route') f.input.route[0].visit_id = 'foreign-visit';
    await expect(review(f)).rejects.toThrow('property visit');
  },
);
it('denies foreign technician identity', async () => {
  const f = await fixture();
  f.input.booking.worker_id = 'foreign-worker';
  await expect(review(f)).rejects.toThrow('technician');
});
it('denies duplicate route stops', async () => {
  const f = await fixture();
  f.input.route.push({ ...f.input.route[0] });
  await expect(review(f)).rejects.toThrow('Duplicate');
});
it.each(['2026-02-30', 'not-a-day', '2026-10-17'])(
  'denies invalid or mismatched day %s',
  async (day) => {
    const f = await fixture();
    f.input.day = day;
    await expect(review(f)).rejects.toThrow();
  },
);
it('denies invalid zone and incomplete booking times', async () => {
  const f = await fixture();
  f.input.timezone = 'invalid/zone';
  await expect(review(f)).rejects.toThrow();
  f.input.timezone = f.visit.timezone;
  f.input.booking.end = null;
  await expect(review(f)).rejects.toThrow('Both proposed');
});
it.each(['08:30', '2026-10-16T09:00Z', '2026-10-16T09:00<script>'])(
  'denies malformed booking time %s',
  async (start) => {
    const f = await fixture();
    f.input.booking.start = start;
    await expect(review(f)).rejects.toThrow();
  },
);
it('does not invoke malformed source/input accessors or serializers', async () => {
  const f = await fixture(),
    getter = vi.fn(() => f.input.day);
  Object.defineProperty(f.input, 'day', { get: getter });
  await expect(review(f)).rejects.toThrow('own-data');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['extra', 'symbol', 'array-getter', 'oversize', 'long-note'])(
  'rejects malformed %s without broadening source data',
  async (kind) => {
    const f = await fixture();
    if (kind === 'extra') Object.assign(f.input, { toJSON: () => ({}) });
    if (kind === 'symbol') Object.assign(f.input, { [Symbol('hidden')]: true });
    if (kind === 'array-getter')
      Object.defineProperty(f.input.route, 0, {
        get() {
          throw Error('must not invoke');
        },
      });
    if (kind === 'oversize')
      f.input.route = Array.from({ length: 17 }, () => f.input.route[0]);
    if (kind === 'long-note') f.input.capture.note = 'x'.repeat(1001);
    await expect(review(f)).rejects.toThrow();
  },
);
it.each(['confirmation', 'note', 'window', 'route'])(
  'rejects live %s changes during an actual awaited source read',
  async (kind) => {
    const f = await fixture(),
      original = f.repo.estimates.workforce.bind(f.repo.estimates);
    let once = true;
    vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
      const result = await original(org);
      if (once) {
        once = false;
        if (kind === 'confirmation') f.gate.confirmed = false;
        else if (kind === 'note') f.input.capture.note = 'Changed';
        else if (kind === 'window')
          f.input.booking.end = f.input.day + 'T13:00';
        else f.input.route = [];
      }
      return result;
    });
    await expect(review(f)).rejects.toThrow();
  },
);
it('rejects actual staff revocation during a read and leaves retained reconciliation UNKNOWN', async () => {
  const f = await fixture();
  f.actor = f.worker.user_id;
  await f.operations.manageMember(
    f.org,
    f.actor,
    true,
    'staff',
    'office_manager',
  );
  const officeModel = await readFieldWorkOrders(f.repo, f.org, f.actor);
  const officeOrder = officeModel.orders.find(
    (o) => o.source.job_id === f.order.source.job_id,
  )!;
  f.input.booking.order =
    f.input.capture.order =
    f.input.route[0].order =
      officeOrder;
  const result = await review(f),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let once = true;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    if (once) {
      once = false;
      await f.operations.manageMember(
        f.org,
        f.actor,
        false,
        'staff',
        'office_manager',
      );
    }
    return value;
  });
  expect(await reconcileOperationsExperiment(result)).toMatchObject({
    state: 'UNKNOWN',
    replacement: null,
  });
});
it('catches exact visit edits during the public digest wait', async () => {
  const f = await fixture(),
    original = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const digest = await original(...args),
      v = f.repo.read(f.org).visits.find((v) => v.id === f.visit.id)!;
    f.repo.saveVisit(f.org, v, v.content);
    return digest;
  });
  await expect(review(f)).rejects.toThrow();
});
it('rechecks a withdrawn confirmation after hashing', async () => {
  const f = await fixture(),
    original = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const digest = await original(...args);
    f.gate.confirmed = false;
    return digest;
  });
  await expect(review(f)).rejects.toThrow('confirmation');
});
it('synchronous source fence catches a visit edit in the last asynchronous reader', async () => {
  const f = await fixture(),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let calls = 0;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    // Existing reads repeat workforce twice; the final experiment verification read is #10.
    if (++calls === 10) {
      const v = f.repo.read(f.org).visits.find((v) => v.id === f.visit.id)!;
      f.repo.saveVisit(f.org, v, v.content);
    }
    return value;
  });
  await expect(review(f)).rejects.toThrow();
});
it('withdrawal during exact read-only reconciliation retains UNKNOWN without effects', async () => {
  const f = await fixture(),
    result = await review(f),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let once = true;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    if (once) {
      once = false;
      f.gate.confirmed = false;
    }
    return value;
  });
  expect(await reconcileOperationsExperiment(result)).toMatchObject({
    state: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
it('synchronous fence rejects actual job revision drift after the final jobs snapshot', async () => {
  const f = await fixture(),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let calls = 0;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    if (++calls === 10) {
      const job = f.repo.estimates.syntheticJob(f.org, f.order.source.job_id)!;
      await f.repo.estimates.projection(f.org, job, {
        ...job.projection,
        costs_complete: !job.projection.costs_complete,
      });
    }
    return value;
  });
  await expect(review(f)).rejects.toThrow('job source changed');
  expect(calls).toBe(10);
});
it('read-only reconciliation keeps late actual job-revision uncertainty UNKNOWN without replay', async () => {
  const f = await fixture(),
    result = await review(f),
    original = f.repo.estimates.workforce.bind(f.repo.estimates);
  let calls = 0;
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const value = await original(org);
    if (++calls === 2) {
      const job = f.repo.estimates.syntheticJob(f.org, f.order.source.job_id)!;
      await f.repo.estimates.projection(f.org, job, {
        ...job.projection,
        costs_complete: !job.projection.costs_complete,
      });
    }
    return value;
  });
  expect(await reconcileOperationsExperiment(result)).toMatchObject({
    state: 'UNKNOWN',
    replay: 'FORBIDDEN',
    replacement: null,
  });
  expect(calls).toBe(2);
});
