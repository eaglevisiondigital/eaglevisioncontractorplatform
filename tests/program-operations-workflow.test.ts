import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareLocalJourney } from '../src/lib/workflows/journey-runtime';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import {
  readOperationsWorkflow,
  reconcileOperationsWorkflow,
  type OperationsWorkflowInput,
} from '../src/lib/workflows/operations-workflow';
afterEach(() => vi.restoreAllMocks());
async function fixture(index = 0) {
  const gate = { enabled: true, confirmed: true },
    journey = await prepareLocalJourney(sampleCompanies[index], gate);
  const model = await readFieldWorkOrders(
      journey.property,
      journey.company.id,
      journey.target.actor_id,
    ),
    order = model.orders.find(
      (o) => o.source.job_id === journey.target.job_id,
    )!,
    worker = order.crew.find((w) => w.worker_id === journey.worker_id)!;
  const matchingVisits = order.visits.filter((v) => v.date === journey.day);
  if (matchingVisits.length !== 1)
    throw Error('Exact selected civil-day visit required');
  const selectedVisit = matchingVisits[0].id;
  const input: OperationsWorkflowInput = {
    operations: {
      day: journey.day,
      timezone: journey.timezone,
      booking: {
        order,
        worker_id: worker.worker_id,
        visit_id: selectedVisit,
        start: journey.day + 'T09:00',
        end: journey.day + 'T11:00',
      },
      other_windows: [],
      proposed_hours: [
        {
          worker_id: worker.worker_id,
          start: journey.day + 'T08:00',
          end: journey.day + 'T16:00',
        },
      ],
      route: [{ order, visit_id: selectedVisit }],
      capture: {
        order,
        visit_id: selectedVisit,
        note: 'Explicit synthetic unsaved observation proposal',
      },
    },
    incident: {
      incident_label: 'Explicit synthetic source review',
      reported_on: journey.day,
      manual_priority: 'normal',
      conditions: ['CONDITION_NOT_YET_ASSESSED'],
      scope_line_ids: [
        journey.issued.version.calculation.lines.find((line) => line.included)!
          .id,
      ],
      sharing_purpose: 'INTERNAL_COORDINATION_REVIEW',
    },
  };
  return { ...journey, visit_id: selectedVisit, input, order, gate };
}
const read = (f: Awaited<ReturnType<typeof fixture>>) =>
  readOperationsWorkflow(f.property, f.target, f.input, f.gate);
it.each([0, 1, 2])(
  'company %s composes actual same-engine booking/capture/incident sources and has no business effects',
  async (index) => {
    const f = await fixture(index),
      property = f.property.read(f.company.id),
      jobs = await f.estimates.jobs(f.company.id),
      history = await f.estimates.history(f.company.id, f.target.estimate_id),
      ledger = f.release.read('staff');
    const writers = [
      vi.spyOn(f.property, 'addVisit'),
      vi.spyOn(f.property, 'saveVisit'),
      vi.spyOn(f.property, 'publish'),
      vi.spyOn(f.estimates, 'assignJob'),
      vi.spyOn(f.estimates, 'recordTime'),
      vi.spyOn(f.estimates, 'approveJob'),
    ];
    const view = await read(f);
    expect(view.source).toMatchObject({
      organization_id: f.company.id,
      customer_id: f.target.customer_id,
      location_id: f.target.location_id,
      estimate_id: f.target.estimate_id,
      issued_version_id: f.target.version_id,
      job_id: f.target.job_id,
    });
    expect(view.operations.booking.source).toMatchObject({
      job_id: f.target.job_id,
      issued_version_id: f.target.version_id,
      customer_id: f.target.customer_id,
      property_id: f.target.location_id,
      visit_id: f.visit_id,
    });
    expect(view.operations.booking).toMatchObject({
      day_review: 'NO_REPORTED_DAY_CONFLICT',
      timing: 'HUMAN_PROPOSAL',
      actual_availability: 'UNKNOWN',
      booking_authority: 'BLOCKED',
    });
    expect(view.operations.offline_capture).toMatchObject({
      status: 'UNSAVED_FIELD_NOTE_PROPOSAL',
      crash_durability: 'NOT_PROVIDED',
      replay: 'FORBIDDEN',
    });
    expect(view.operations.route).toMatchObject({
      ordering: 'EXPLICIT_HUMAN_INPUT_ORDER',
      optimization: 'NOT_PERFORMED',
      travel_time: 'UNKNOWN',
    });
    expect(view.incident.source.content_sha256).toBe(view.source.source_sha256);
    expect(view.incident.source).toMatchObject({
      job_id: f.target.job_id,
      version_id: f.target.version_id,
      property_id: f.target.location_id,
    });
    expect(view.incident.sharing_preview).toMatchObject({
      recipient: null,
      delivery: 'BLOCKED',
      cross_tenant_access: 'BLOCKED',
    });
    expect(view.linkage.contractor_network).toBe(
      'SOURCE_REFERENCE_ONLY_NOT_ENDORSEMENT_OR_ACCESS',
    );
    expect(Object.values(view.authority).every((v) => v === false)).toBe(true);
    expect(Object.isFrozen(view.operations.offline_capture.source)).toBe(true);
    const { integrity, ...body } = view;
    expect(integrity.sha256).toBe(
      Buffer.from(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ).toString('hex'),
    );
    expect(
      JSON.stringify({
        source: view.source,
        capture: view.operations.offline_capture,
        sharing: view.incident.sharing_preview.content,
      }),
    ).not.toMatch(
      /PRIVATE|unit_cost|internal_notes|supplier|payroll|cash_hour|margin|@example.invalid|555010/,
    );
    expect(await reconcileOperationsWorkflow(view)).toEqual({
      status: 'CURRENT_TARGET_REVIEW_ONLY',
      replacement: null,
      replay: 'FORBIDDEN',
    });
    expect(writers.every((writer) => writer.mock.calls.length === 0)).toBe(
      true,
    );
    expect(f.property.read(f.company.id)).toEqual(property);
    expect(await f.estimates.jobs(f.company.id)).toEqual(jobs);
    expect(
      await f.estimates.history(f.company.id, f.target.estimate_id),
    ).toEqual(history);
    expect(f.release.read('staff')).toEqual(ledger);
  },
);
it('retains date-only uncertainty rather than inventing a timed booking', async () => {
  const f = await fixture();
  f.input.operations.booking.start = f.input.operations.booking.end = null;
  const view = await read(f);
  expect(view.operations.booking).toMatchObject({
    timing: 'DATE_ONLY_UNKNOWN',
    day_review: 'UNKNOWN',
    actual_availability: 'UNKNOWN',
  });
});
it('uses existing canonical conflict arithmetic rather than a new capacity engine', async () => {
  const f = await fixture();
  f.input.operations.other_windows.push({
    order: f.order,
    visit_id: null,
    worker_id: f.worker_id,
    start: f.day + 'T10:00',
    end: f.day + 'T12:00',
  });
  const view = await read(f);
  expect(view.operations.booking.day_review).toBe('REPORTED_DAY_CONFLICT');
  expect(view.operations.booking.conflicts[0].minutes).toBe(60);
  expect(view.operations.booking.capacity.planned_minutes).toBe(180);
});
it('same explicit source and input yield identical content identity without a new record', async () => {
  const f = await fixture(),
    first = await read(f),
    second = await read(f);
  expect(second.integrity).toEqual(first.integrity);
});
it.each([
  undefined,
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])('rejects default-off %s before sources', async (gate) => {
  const f = await fixture(),
    source = vi.spyOn(f.estimates, 'readSyntheticPrototypeSources');
  await expect(
    readOperationsWorkflow(f.property, f.target, f.input, gate),
  ).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
});
it('rejects connected repositories and non-repository objects without operational reads', async () => {
  const f = await fixture(),
    connected = new PropertyRepository(new Operations(false)),
    source = vi.spyOn(connected.estimates, 'readSyntheticPrototypeSources');
  await expect(
    readOperationsWorkflow(connected, f.target, f.input, f.gate),
  ).rejects.toThrow();
  expect(source).not.toHaveBeenCalled();
  await expect(
    readOperationsWorkflow(
      { ...f.property } as PropertyRepository,
      f.target,
      f.input,
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
] as const)('denies foreign exact %s', async (key) => {
  const f = await fixture();
  f.target[key] = 'foreign';
  await expect(read(f)).rejects.toThrow();
});
it.each(['booking', 'capture', 'route', 'other_windows'])(
  'cannot substitute another retained company work order in %s',
  async (key) => {
    const f = await fixture(),
      foreign = await fixture(1);
    if (key === 'booking') f.input.operations.booking.order = foreign.order;
    if (key === 'capture') f.input.operations.capture.order = foreign.order;
    if (key === 'route') f.input.operations.route[0].order = foreign.order;
    if (key === 'other_windows')
      f.input.operations.other_windows.push({
        order: foreign.order,
        worker_id: foreign.worker_id,
        visit_id: foreign.visit_id,
        start: f.day + 'T09:00',
        end: f.day + 'T11:00',
      });
    await expect(read(f)).rejects.toThrow();
  },
);
it('does not allow a different same-company job merely because its property matches', async () => {
  const f = await fixture(),
    model = await readFieldWorkOrders(
      f.property,
      f.company.id,
      f.target.actor_id,
    ),
    other = model.orders.find((o) => o.source.job_id !== f.target.job_id)!;
  f.input.operations.capture.order = other;
  await expect(read(f)).rejects.toThrow('exact target');
});
it('rejects cloned source cards and wrong visits', async () => {
  const f = await fixture();
  f.input.operations.booking.order = structuredClone(f.order);
  await expect(read(f)).rejects.toThrow('retained');
  f.input.operations.booking.order = f.order;
  f.input.operations.capture.visit_id = 'wrong-property-visit';
  await expect(read(f)).rejects.toThrow('property visit');
});
it.each(['field', 'estimator'])(
  'does not promote %s into owner/admin authority',
  async (role) => {
    const f = await fixture();
    f.target.actor_id = f.company.id + '-' + role;
    await expect(read(f)).rejects.toThrow();
  },
);
it('actual admin revocation blocks retained reconciliation without replacing or replaying', async () => {
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
  const model = await readFieldWorkOrders(f.property, f.company.id, actor),
    order = model.orders.find((o) => o.source.job_id === f.target.job_id)!;
  f.input.operations.booking.order =
    f.input.operations.capture.order =
    f.input.operations.route[0].order =
      order;
  const view = await read(f);
  await f.operations.manageMember(
    f.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect(await reconcileOperationsWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
it('retains immutable bytes after exact plan or human-input changes', async () => {
  const f = await fixture(),
    view = await read(f),
    before = JSON.stringify(view);
  f.input.operations.capture.note = 'Changed original proposal';
  expect(await reconcileOperationsWorkflow(view)).toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
  });
  expect(JSON.stringify(view)).toBe(before);
});
it('a later visit revision invalidates the target review without rewriting historical reports', async () => {
  const f = await fixture(),
    view = await read(f),
    before = JSON.stringify(view);
  const visit = f.property
    .read(f.company.id)
    .visits.find((v) => v.id === f.visit_id)!;
  if (visit.status === 'published') f.property.revise(f.company.id, visit);
  else
    f.property.saveVisit(f.company.id, visit, {
      ...visit.content,
      summary: 'Explicit revised synthetic scheduling draft',
    });
  expect(await reconcileOperationsWorkflow(view)).toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
  expect(JSON.stringify(view)).toBe(before);
});
it('cloned or lost/uncertain retained evidence remains UNKNOWN without an ID replacement', async () => {
  const f = await fixture(),
    view = await read(f);
  expect(
    await reconcileOperationsWorkflow(structuredClone(view)),
  ).toMatchObject({ status: 'UNKNOWN', replacement: null });
  vi.spyOn(f.estimates, 'readSyntheticPrototypeSources').mockImplementation(
    () => {
      throw Error('Lost read acknowledgment');
    },
  );
  expect(await reconcileOperationsWorkflow(view)).toMatchObject({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
it.each([
  'getter',
  'serializer',
  'symbol',
  'array-getter',
  'prototype',
  'oversize',
])('rejects malformed %s without invoking evidence hooks', async (kind) => {
  const f = await fixture(),
    getter = vi.fn();
  if (kind === 'getter')
    Object.defineProperty(f.input.operations.booking, 'start', { get: getter });
  if (kind === 'serializer')
    Object.assign(f.input.incident, { toJSON: getter });
  if (kind === 'symbol') Object.assign(f.input, { [Symbol('extra')]: true });
  if (kind === 'array-getter')
    Object.defineProperty(f.input.operations.route, 0, { get: getter });
  if (kind === 'prototype')
    Object.setPrototypeOf(f.input.incident, { inherited: true });
  if (kind === 'oversize') f.input.operations.capture.note = 'x'.repeat(10001);
  await expect(read(f)).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each(['target', 'incident', 'operations', 'confirmation'])(
  'checks live %s after actual awaited provider-free reads',
  async (kind) => {
    const f = await fixture(),
      original = f.estimates.workforce.bind(f.estimates);
    let once = true;
    vi.spyOn(f.estimates, 'workforce').mockImplementation(async (org) => {
      const value = await original(org);
      if (once) {
        once = false;
        if (kind === 'target') f.target.location_id = 'foreign';
        else if (kind === 'incident')
          f.input.incident.manual_priority = 'urgent';
        else if (kind === 'operations')
          f.input.operations.booking.end = f.day + 'T13:00';
        else f.gate.confirmed = false;
      }
      return value;
    });
    await expect(read(f)).rejects.toThrow();
  },
);
it('last source-hash wait cannot hide a real job edit from the synchronous final guard', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 8) {
      const job = f.estimates.syntheticJob(f.company.id, f.target.job_id!)!;
      await f.estimates.projection(f.company.id, job, {
        ...job.projection,
        costs_complete: !job.projection.costs_complete,
      });
    }
    return value;
  });
  await expect(read(f)).rejects.toThrow();
  expect(calls).toBe(8);
});
it('last source-hash wait cannot hide an actual visit/plan edit', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 8) {
      const plan = f.property
        .read(f.company.id)
        .plans.find((p) => p.id === f.plan_id)!;
      f.property.savePlan(f.company.id, {
        ...plan,
        name: 'Changed during final source wait',
      });
    }
    return value;
  });
  await expect(read(f)).rejects.toThrow();
});
it('characterizes other-job time as captured rather than claiming an atomic global capacity check', async () => {
  const f = await fixture(),
    model = await readFieldWorkOrders(
      f.property,
      f.company.id,
      f.target.actor_id,
    ),
    other = model.orders.find(
      (order) => order.source.job_id !== f.target.job_id,
    )!;
  await f.estimates.assignJob(
    f.company.id,
    other.source.job_id,
    f.company.id + '-field',
    true,
  );
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const value = await digest(...args);
    if (++calls === 8)
      await f.estimates.recordTime(f.company.id, f.worker_id, {
        job_id: other.source.job_id,
        overhead_center: null,
        task: 'Synthetic recorded work on another assigned job',
        kind: 'work',
        started_at: f.day + 'T15:00:00Z',
        ended_at: f.day + 'T16:00:00Z',
        billable: false,
        corrects_id: null,
      });
    return value;
  });
  const view = await read(f);
  expect(view.linkage).toMatchObject({
    workforce_currentness: 'CAPTURED_NOT_ATOMIC',
    capacity_authority: 'UNVERIFIED',
    actual_availability: 'UNKNOWN',
  });
  expect(Object.values(view.authority).every((value) => value === false)).toBe(
    true,
  );
  expect(await reconcileOperationsWorkflow(view)).toEqual({
    status: 'UNKNOWN',
    replacement: null,
    replay: 'FORBIDDEN',
  });
});
