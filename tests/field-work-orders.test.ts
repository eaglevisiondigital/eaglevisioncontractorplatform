import { expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { PropertyRepository } from '../src/lib/property';
import {
  confirmCrewAssignment,
  dailyCrewSchedule,
  fieldWorkOrdersEnabled,
  openFieldWorkOrder,
  readFieldWorkOrders,
  reconcileCrewAssignment,
  reviewCrewAssignment,
} from '../src/lib/field-work-orders';

async function fixture(index = 0) {
  const company = sampleCompanies[index],
    org = company.id,
    actor = org + '-owner';
  const operations = new Operations(true),
    repo = new PropertyRepository(operations);
  await repo.initialize(company);
  const model = await readFieldWorkOrders(repo, org, actor),
    order = model.orders[0];
  const target = model.crew.find((w) => w.user_id === org + '-field')!;
  return { company, org, actor, operations, repo, model, order, target };
}
async function assignment(index = 0) {
  const f = await fixture(index);
  const review = await reviewCrewAssignment(
    f.repo,
    f.org,
    f.actor,
    f.order,
    f.target.user_id,
  );
  return { ...f, review };
}
it.each([0, 1, 2])(
  'projects actual company %s jobs, immutable source and exact inspection identities without mutation',
  async (index) => {
    const f = await fixture(index);
    const before = f.repo.read(f.org),
      jobs = await f.repo.estimates.jobs(f.org),
      workforce = await f.repo.estimates.workforce(f.org);
    expect(f.model.orders).toHaveLength(1);
    expect(f.order.source).toMatchObject({
      organization_id: f.org,
      job_id: jobs[0].id,
      job_revision: jobs[0].lock_revision,
      issued_version_id: jobs[0].baseline.issued_version_id,
    });
    expect(f.order.baseline_property).toBeNull();
    expect(f.order.assignment_state).toBe('UNKNOWN');
    expect(f.order.visits).toMatchObject([
      {
        id: before.visits[0].id,
        plan_id: before.plans[0].id,
        customer_id: before.plans[0].customer_id,
        location_id: before.plans[0].location_id,
      },
    ]);
    expect(await openFieldWorkOrder(f.repo, f.org, f.actor, f.order)).toEqual(
      f.order,
    );
    expect(f.repo.read(f.org)).toEqual(before);
    expect(await f.repo.estimates.jobs(f.org)).toEqual(jobs);
    expect(await f.repo.estimates.workforce(f.org)).toEqual(workforce);
    expect(JSON.stringify(f.model)).not.toMatch(
      /unit_cost|minor|payroll|margin|rates|internal_note|supplier|INTERNAL|classification|deductions/,
    );
  },
);
it.each([0, 1, 2])(
  'retains one existing company %s assignment and restricts technician reads to own current crew relationship',
  async (index) => {
    const f = await assignment(index);
    expect(
      (await readFieldWorkOrders(f.repo, f.org, f.target.user_id)).orders,
    ).toEqual([]);
    const invoke = vi.spyOn(f.repo.estimates, 'assignJob');
    expect(await confirmCrewAssignment(f.review, true)).toMatchObject({
      status: 'PREPARED',
      job_id: f.order.source.job_id,
      user_id: f.target.user_id,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    const model = await readFieldWorkOrders(f.repo, f.org, f.target.user_id);
    expect(model.manager).toBe(false);
    expect(model.crew).toEqual([f.target]);
    expect(model.orders).toHaveLength(1);
    expect(model.orders[0].crew).toEqual([f.target]);
    expect(
      f.repo.estimates.syntheticJobAssignments(f.org, f.target.user_id),
    ).toEqual([
      {
        organization_id: f.org,
        job_id: f.order.source.job_id,
        user_id: f.target.user_id,
        active: true,
      },
    ]);
    await expect(confirmCrewAssignment(f.review, true)).rejects.toThrow(
      /already attempted|changed/,
    );
    const fresh = (await readFieldWorkOrders(f.repo, f.org, f.actor)).orders[0];
    await expect(
      reviewCrewAssignment(f.repo, f.org, f.actor, fresh, f.target.user_id),
    ).rejects.toThrow(/already attempted/);
    expect(await reconcileCrewAssignment(f.review)).toMatchObject({
      status: 'PREPARED',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  },
);
it('filters dated inspections separately from exact recorded crew time, using source timezones and IDs', async () => {
  const f = await assignment();
  await confirmCrewAssignment(f.review, true);
  const model = await readFieldWorkOrders(f.repo, f.org, f.actor);
  const day = dailyCrewSchedule(model, '2026-10-16', f.target.worker_id);
  expect(day.visits).toHaveLength(1);
  expect(day.recorded).toEqual([]);
  const recorded = dailyCrewSchedule(model, '2026-10-05', f.target.worker_id);
  expect(recorded.visits).toEqual([]);
  expect(recorded.recorded).toHaveLength(1);
  expect(recorded.recorded[0].entry.worker_id).toBe(f.target.worker_id);
  expect(
    dailyCrewSchedule(model, '2026-10-05', '', f.order.visits[0].location_id)
      .recorded,
  ).toEqual([]); // no inferred baseline property
  expect(dailyCrewSchedule(model, '2026-10-16', 'foreign').visits).toEqual([]);
  expect(dailyCrewSchedule(model, '2026-10-16', '', 'foreign').visits).toEqual(
    [],
  );
  expect(() => dailyCrewSchedule(model, '2026-02-30')).toThrow();
  expect(() => dailyCrewSchedule(model, '')).toThrow();
});
it('reads the actual issued customer beyond the first CRM page without a replacement identity', async () => {
  const f = await fixture();
  for (let i = 0; i < 13; i++)
    await f.operations.saveCustomer(f.org, {
      display_name: 'Extra sample ' + i,
      customer_type: 'residential',
      email: null,
      phone: null,
      preferred_contact: 'email',
    });
  const model = await readFieldWorkOrders(f.repo, f.org, f.actor);
  expect(model.orders[0].customer).toEqual(f.order.customer);
  expect(model.orders[0].source).toEqual(f.order.source);
});
it('returned source fields are detached and raw financial/private state never crosses the allowlist', async () => {
  const f = await fixture();
  const read = f.repo.estimates.workforce.bind(f.repo.estimates);
  vi.spyOn(f.repo.estimates, 'workforce').mockImplementation(async (org) => {
    const data = await read(org);
    data.rates[0].classification_review_reference = 'PRIVATE payroll sentinel';
    data.entries[0].task = 'PRIVATE time narrative';
    return data;
  });
  const model = await readFieldWorkOrders(f.repo, f.org, f.actor);
  const order = model.orders[0];
  expect(Object.keys(order.scope[0]).sort()).toEqual([
    'description',
    'id',
    'quantity_milli',
    'unit',
  ]);
  expect(Object.keys(order.visits[0]).sort()).toEqual([
    'customer_id',
    'date',
    'id',
    'location_id',
    'plan_id',
    'plan_name',
    'plan_revision',
    'property_label',
    'revision',
    'status',
    'timezone',
  ]);
  expect(JSON.stringify(model)).not.toContain('PRIVATE');
  order.scope[0].description = 'Changed detached display';
  await expect(
    openFieldWorkOrder(f.repo, f.org, f.actor, order),
  ).rejects.toThrow(/retained/);
  expect(
    (await readFieldWorkOrders(f.repo, f.org, f.actor)).orders[0].scope[0]
      .description,
  ).toBe(f.order.scope[0].description);
});
it('source changes during asynchronous reads fail closed instead of mixing job snapshots', async () => {
  const f = await fixture();
  const list = f.operations.listLocations.bind(f.operations);
  vi.spyOn(f.operations, 'listLocations').mockImplementation(
    async (org, customer) => {
      const result = await list(org, customer);
      const job = (await f.repo.estimates.jobs(f.org))[0];
      await f.repo.estimates.projection(f.org, job, job.projection);
      return result;
    },
  );
  await expect(readFieldWorkOrders(f.repo, f.org, f.actor)).rejects.toThrow(
    /source changed/,
  );
});
it.each([0, 1, 2])(
  'aborts company %s office-to-field downgrade during the actual first job read instead of exposing unassigned jobs',
  async (index) => {
    const f = await fixture(index),
      actor = f.target.user_id;
    expect(
      (await readFieldWorkOrders(f.repo, f.org, actor)).orders,
    ).toHaveLength(0);
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'staff',
      'office_manager',
    );
    const original = f.repo.estimates.jobs.bind(f.repo.estimates);
    let calls = 0;
    const jobs = vi
      .spyOn(f.repo.estimates, 'jobs')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++calls === 1)
          await f.operations.manageMember(
            f.org,
            actor,
            true,
            'staff',
            'field_staff',
          );
        return result;
      });
    const writer = vi.spyOn(f.repo.estimates, 'assignJob');
    await expect(readFieldWorkOrders(f.repo, f.org, actor)).rejects.toThrow(
      /access changed/,
    );
    expect(
      f.operations.syntheticMemberships(f.org).find((m) => m.user_id === actor)
        ?.staff_type,
    ).toBe('field_staff');
    expect(f.repo.estimates.syntheticJobAssignments(f.org, actor)).toEqual([]);
    expect(writer).not.toHaveBeenCalled();
    jobs.mockRestore();
    const current = await readFieldWorkOrders(f.repo, f.org, actor);
    expect(current.manager).toBe(false);
    expect(current.orders).toEqual([]);
  },
);
it.each(['history', 'locations', 'final-jobs'] as const)(
  'aborts an actual membership downgrade at the %s await boundary',
  async (boundary) => {
    const f = await fixture(),
      actor = f.target.user_id;
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'staff',
      'office_manager',
    );
    const downgrade = () =>
      f.operations.manageMember(f.org, actor, true, 'staff', 'field_staff');
    if (boundary === 'history') {
      const original = f.repo.estimates.history.bind(f.repo.estimates);
      vi.spyOn(f.repo.estimates, 'history').mockImplementation(
        async (...args) => {
          const result = await original(...args);
          await downgrade();
          return result;
        },
      );
    } else if (boundary === 'locations') {
      const original = f.operations.listLocations.bind(f.operations);
      vi.spyOn(f.operations, 'listLocations').mockImplementation(
        async (...args) => {
          const result = await original(...args);
          await downgrade();
          return result;
        },
      );
    } else {
      const original = f.repo.estimates.jobs.bind(f.repo.estimates);
      let calls = 0;
      vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++calls === 2) await downgrade();
        return result;
      });
    }
    await expect(readFieldWorkOrders(f.repo, f.org, actor)).rejects.toThrow(
      /access changed/,
    );
    expect(f.repo.estimates.syntheticJobAssignments(f.org, actor)).toEqual([]);
  },
);
it.each([1, 3])(
  'does not create an assignment review after an actual downgrade in nested read %s',
  async (atCall) => {
    const f = await fixture(),
      actor = f.target.user_id;
    await f.operations.manageMember(
      f.org,
      actor,
      true,
      'staff',
      'office_manager',
    );
    const order = (await readFieldWorkOrders(f.repo, f.org, actor)).orders[0];
    const original = f.repo.estimates.jobs.bind(f.repo.estimates);
    let calls = 0;
    vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (++calls === atCall)
        await f.operations.manageMember(
          f.org,
          actor,
          true,
          'staff',
          'field_staff',
        );
      return result;
    });
    const writer = vi.spyOn(f.repo.estimates, 'assignJob');
    await expect(
      reviewCrewAssignment(f.repo, f.org, actor, order, f.actor),
    ).rejects.toThrow(/access changed|office reviewer/);
    expect(writer).not.toHaveBeenCalled();
    expect(f.repo.estimates.syntheticJobAssignments(f.org, actor)).toEqual([]);
  },
);
it('role downgrade during exact assignment reconciliation remains UNKNOWN without replay', async () => {
  const f = await fixture(),
    actor = f.target.user_id;
  await f.operations.manageMember(
    f.org,
    actor,
    true,
    'staff',
    'office_manager',
  );
  const order = (await readFieldWorkOrders(f.repo, f.org, actor)).orders[0];
  const review = await reviewCrewAssignment(
    f.repo,
    f.org,
    actor,
    order,
    f.actor,
  );
  expect(await confirmCrewAssignment(review, true)).toMatchObject({
    status: 'PREPARED',
  });
  const original = f.repo.estimates.jobs.bind(f.repo.estimates);
  let calls = 0;
  vi.spyOn(f.repo.estimates, 'jobs').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (++calls === 1)
      await f.operations.manageMember(
        f.org,
        actor,
        true,
        'staff',
        'field_staff',
      );
    return result;
  });
  const writer = vi.spyOn(f.repo.estimates, 'assignJob');
  expect(await reconcileCrewAssignment(review)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(writer).not.toHaveBeenCalled();
});
it('role downgrade after the actual sample assignment write cannot return office-only success', async () => {
  const f = await fixture(),
    actor = f.target.user_id;
  await f.operations.manageMember(
    f.org,
    actor,
    true,
    'staff',
    'office_manager',
  );
  const order = (await readFieldWorkOrders(f.repo, f.org, actor)).orders[0];
  const review = await reviewCrewAssignment(
    f.repo,
    f.org,
    actor,
    order,
    f.actor,
  );
  const original = f.repo.estimates.assignJob.bind(f.repo.estimates);
  const writer = vi
    .spyOn(f.repo.estimates, 'assignJob')
    .mockImplementation(async (...args) => {
      const result = await original(...args);
      await f.operations.manageMember(
        f.org,
        actor,
        true,
        'staff',
        'field_staff',
      );
      return result;
    });
  expect(await confirmCrewAssignment(review, true)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(await reconcileCrewAssignment(review)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(writer).toHaveBeenCalledTimes(1);
  expect((await readFieldWorkOrders(f.repo, f.org, actor)).orders).toEqual([]);
});
it('legacy four-argument assignment accepts an actual existing active estimator without a Worker profile', async () => {
  const f = await fixture(),
    user = f.org + '-estimator';
  const member = (await f.operations.listMembers(f.org)).find(
    (m) => m.user_id === user,
  );
  expect(member).toMatchObject({
    active: true,
    role: 'staff',
    staff_type: 'estimator',
  });
  expect(
    (await f.repo.estimates.workforce(f.org)).workers.some(
      (w) => w.user_id === user,
    ),
  ).toBe(false);
  await f.repo.estimates.assignJob(f.org, f.order.source.job_id, user, true);
  expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual([
    {
      organization_id: f.org,
      job_id: f.order.source.job_id,
      user_id: user,
      active: true,
    },
  ]);
  await f.repo.estimates.assignJob(f.org, f.order.source.job_id, user, false);
  expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual([
    {
      organization_id: f.org,
      job_id: f.order.source.job_id,
      user_id: user,
      active: false,
    },
  ]);
  await f.operations.manageMember(f.org, user, false, 'staff', 'estimator');
  await expect(
    f.repo.estimates.assignJob(f.org, f.order.source.job_id, user, true),
  ).rejects.toThrow(/active member/);
});
it.each(['estimator', 'field_staff'] as const)(
  'reviewed fifth-argument crew assignment still rejects an actual %s role or missing Worker',
  async (staffType) => {
    const f = await fixture(),
      user = f.org + '-estimator';
    if (staffType === 'field_staff')
      await f.operations.manageMember(
        f.org,
        user,
        true,
        'staff',
        'field_staff',
      );
    else {
      const data = await f.repo.estimates.workforce(f.org),
        worker = data.workers.find((w) => w.id === f.target.worker_id)!;
      await f.repo.estimates.saveWorker(
        f.org,
        {
          user_id: user,
          display_name: 'Existing sample estimator',
          worker_type: worker.worker_type,
          cost_source: worker.cost_source,
          active: true,
        },
        data.rates.find((r) => r.worker_id === worker.id)!,
      );
    }
    const guard = vi.fn();
    await expect(
      f.repo.estimates.assignJob(f.org, f.order.source.job_id, user, true, {
        reviewer: f.actor,
        job_revision: f.order.source.job_revision,
        issued_version_id: f.order.source.issued_version_id,
        expected_active: null,
        assertCurrent: guard,
      }),
    ).rejects.toThrow(/eligible active sample worker/);
    expect(guard).not.toHaveBeenCalled();
    expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual(
      [],
    );
  },
);
it('preserves old four-argument sample assignment calls, detached rows and exact composite update semantics', async () => {
  const f = await fixture();
  await f.repo.estimates.assignJob(
    f.org,
    f.order.source.job_id,
    f.target.user_id,
    true,
  );
  const rows = f.repo.estimates.syntheticJobAssignments(f.org, f.actor);
  rows[0].active = false;
  expect(
    f.repo.estimates.syntheticJobAssignments(f.org, f.actor)[0].active,
  ).toBe(true);
  await f.repo.estimates.assignJob(
    f.org,
    f.order.source.job_id,
    f.target.user_id,
    false,
  );
  expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toHaveLength(
    1,
  );
  expect(
    (await readFieldWorkOrders(f.repo, f.org, f.target.user_id)).orders,
  ).toEqual([]);
});
it('technicians cannot read another assigned crew member’s recorded segments', async () => {
  const f = await assignment();
  await confirmCrewAssignment(f.review, true);
  const owner = f.model.crew.find((w) => w.user_id === f.actor)!;
  await f.repo.estimates.assignJob(f.org, f.order.source.job_id, f.actor, true);
  await f.repo.estimates.recordTime(f.org, owner.worker_id, {
    job_id: f.order.source.job_id,
    overhead_center: null,
    task: 'PRIVATE office time narrative',
    kind: 'work',
    started_at: '2026-10-05T15:00:00Z',
    ended_at: '2026-10-05T16:00:00Z',
    billable: false,
    corrects_id: null,
  });
  const office = await readFieldWorkOrders(f.repo, f.org, f.actor);
  const field = await readFieldWorkOrders(f.repo, f.org, f.target.user_id);
  expect(dailyCrewSchedule(office, '2026-10-05').recorded).toHaveLength(2);
  expect(dailyCrewSchedule(field, '2026-10-05').recorded).toHaveLength(1);
  expect(
    field.orders[0].recorded_time.every(
      (e) => e.worker_id === f.target.worker_id,
    ),
  ).toBe(true);
  expect(JSON.stringify(field)).not.toContain('PRIVATE');
});
it('rejects copied or tampered source/review objects and missing explicit confirmation before mutation', async () => {
  const f = await assignment();
  const invoke = vi.spyOn(f.repo.estimates, 'assignJob');
  await expect(
    openFieldWorkOrder(f.repo, f.org, f.actor, structuredClone(f.order)),
  ).rejects.toThrow(/retained/);
  await expect(
    confirmCrewAssignment(structuredClone(f.review), true),
  ).rejects.toThrow(/retained/);
  await expect(confirmCrewAssignment(f.review, false)).rejects.toThrow(
    /confirmation/,
  );
  f.review.target.user_id = f.org + '-owner';
  await expect(confirmCrewAssignment(f.review, true)).rejects.toThrow(
    /retained/,
  );
  expect(invoke).not.toHaveBeenCalled();
});
it('does not join by customer wording, property labels or job title', async () => {
  const f = await fixture();
  const read = f.repo.read.bind(f.repo);
  vi.spyOn(f.repo, 'read').mockImplementation((org) => {
    const state = read(org);
    state.plans[0].job_id = 'unrelated-job';
    return state;
  });
  const model = await readFieldWorkOrders(f.repo, f.org, f.actor);
  expect(model.orders[0].visits).toEqual([]);
  expect(model.orders[0].baseline_property).toBeNull();
});
it.each(['foreign-tenant', 'foreign-customer', 'foreign-property'] as const)(
  'rejects %s inspection association rather than inferring or rebinding',
  async (kind) => {
    const f = await fixture();
    const read = f.repo.read.bind(f.repo);
    vi.spyOn(f.repo, 'read').mockImplementation((org) => {
      const state = read(org);
      if (kind === 'foreign-tenant') state.plans[0].organization_id = 'foreign';
      if (kind === 'foreign-customer') state.plans[0].customer_id = 'foreign';
      if (kind === 'foreign-property') state.plans[0].location_id = 'foreign';
      return state;
    });
    await expect(readFieldWorkOrders(f.repo, f.org, f.actor)).rejects.toThrow(
      /association UNKNOWN/,
    );
  },
);
it('rejects foreign crew, wrong tenant actor and ineligible sample roles', async () => {
  const f = await fixture();
  await expect(
    readFieldWorkOrders(f.repo, f.org, 'sample-roofing-owner'),
  ).rejects.toThrow(/eligible/);
  await expect(
    readFieldWorkOrders(f.repo, f.org, f.org + '-estimator'),
  ).rejects.toThrow(/eligible/);
  await expect(
    reviewCrewAssignment(
      f.repo,
      f.org,
      f.actor,
      f.order,
      'sample-roofing-field',
    ),
  ).rejects.toThrow(/worker/);
  await expect(
    f.repo.estimates.assignJob(f.org, 'foreign-job', f.target.user_id, true),
  ).rejects.toThrow(/exact tenant/);
});
it('revoked membership immediately hides technician records and stale cards cannot reopen', async () => {
  const f = await assignment();
  await confirmCrewAssignment(f.review, true);
  const order = (await readFieldWorkOrders(f.repo, f.org, f.target.user_id))
    .orders[0];
  await f.operations.manageMember(
    f.org,
    f.target.user_id,
    false,
    'staff',
    'field_staff',
  );
  await expect(
    readFieldWorkOrders(f.repo, f.org, f.target.user_id),
  ).rejects.toThrow(/eligible/);
  await expect(
    openFieldWorkOrder(f.repo, f.org, f.target.user_id, order),
  ).rejects.toThrow(/eligible/);
  expect(await reconcileCrewAssignment(f.review)).toMatchObject({
    status: 'UNKNOWN',
  });
});
it('inactive worker rejects assignment and technician reads even with an active membership', async () => {
  const f = await assignment();
  const data = await f.repo.estimates.workforce(f.org),
    worker = data.workers.find((w) => w.id === f.target.worker_id)!;
  await f.repo.estimates.saveWorker(
    f.org,
    { ...worker, active: false },
    data.rates.find((r) => r.worker_id === worker.id)!,
    worker.id,
  );
  expect(await confirmCrewAssignment(f.review, true)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual([]);
  await expect(
    readFieldWorkOrders(f.repo, f.org, f.target.user_id),
  ).rejects.toThrow(/worker/);
});
it('rechecks target/reviewer membership after repository await before retaining a relationship', async () => {
  const f = await assignment();
  const list = f.operations.listMembers.bind(f.operations);
  vi.spyOn(f.operations, 'listMembers').mockImplementation(async (org) => {
    const old = await list(org);
    await f.operations.manageMember(
      f.org,
      f.target.user_id,
      false,
      'staff',
      'field_staff',
    );
    return old;
  });
  expect(await confirmCrewAssignment(f.review, true)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual([]);
});
it('changed assignment rejects old technician cards and cannot become repair completion', async () => {
  const f = await assignment();
  await confirmCrewAssignment(f.review, true);
  const order = (await readFieldWorkOrders(f.repo, f.org, f.target.user_id))
    .orders[0];
  await f.repo.estimates.assignJob(
    f.org,
    f.order.source.job_id,
    f.target.user_id,
    false,
  );
  await expect(
    openFieldWorkOrder(f.repo, f.org, f.target.user_id, order),
  ).rejects.toThrow(/changed|unavailable/);
  expect(await reconcileCrewAssignment(f.review)).toMatchObject({
    status: 'UNKNOWN',
  });
});
it('stale visit revision prevents source navigation and reviewed assignment, preserving source and jobs', async () => {
  const f = await assignment(),
    visit = f.repo.read(f.org).visits[0];
  f.repo.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Changed current source',
  });
  await expect(
    openFieldWorkOrder(f.repo, f.org, f.actor, f.order),
  ).rejects.toThrow(/changed/);
  await expect(confirmCrewAssignment(f.review, true)).rejects.toThrow(
    /inspection source changed/,
  );
  expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual([]);
});
it('job lock/CAS change during repository await leaves a permanent UNKNOWN hold and no assignment', async () => {
  const f = await assignment();
  const list = f.operations.listMembers.bind(f.operations);
  vi.spyOn(f.operations, 'listMembers').mockImplementation(async (org) => {
    const old = await list(org);
    const job = (await f.repo.estimates.jobs(f.org))[0];
    await f.repo.estimates.projection(f.org, job, job.projection);
    return old;
  });
  expect(await confirmCrewAssignment(f.review, true)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(f.repo.estimates.syntheticJobAssignments(f.org, f.actor)).toEqual([]);
  await expect(confirmCrewAssignment(f.review, true)).rejects.toThrow(
    /already attempted/,
  );
});
it('lost acknowledgement reserves before await; concurrent/recreated attempts never replay and exact reads reconcile', async () => {
  const f = await assignment(),
    original = f.repo.estimates.assignJob.bind(f.repo.estimates);
  const invoke = vi
    .spyOn(f.repo.estimates, 'assignJob')
    .mockImplementation(async (...args) => {
      await original(...args);
      throw Error('Lost local acknowledgement');
    });
  const first = confirmCrewAssignment(f.review, true);
  await expect(confirmCrewAssignment(f.review, true)).rejects.toThrow(
    /already attempted/,
  );
  expect(await first).toMatchObject({ status: 'UNKNOWN' });
  expect(await reconcileCrewAssignment(f.review)).toMatchObject({
    status: 'UNKNOWN',
    current_relationship: 'ACTIVE',
  });
  const fresh = (await readFieldWorkOrders(f.repo, f.org, f.actor)).orders[0];
  await expect(
    reviewCrewAssignment(f.repo, f.org, f.actor, fresh, f.target.user_id),
  ).rejects.toThrow(/already attempted/);
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('missing acknowledgement and absent relationship stays UNKNOWN without invoking a writer on reconciliation', async () => {
  const f = await assignment();
  const invoke = vi
    .spyOn(f.repo.estimates, 'assignJob')
    .mockResolvedValue(undefined);
  expect(await confirmCrewAssignment(f.review, true)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(await reconcileCrewAssignment(f.review)).toMatchObject({
    status: 'UNKNOWN',
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('connected repositories reject before any connected reader or mutator', async () => {
  const operations = new Operations(false),
    repo = new PropertyRepository(operations);
  const jobs = vi.spyOn(repo.estimates, 'jobs'),
    workforce = vi.spyOn(repo.estimates, 'workforce');
  await expect(readFieldWorkOrders(repo, 'org', 'user')).rejects.toThrow(
    /Local synthetic/,
  );
  expect(jobs).not.toHaveBeenCalled();
  expect(workforce).not.toHaveBeenCalled();
  expect(() => repo.estimates.syntheticJobAssignments('org', 'user')).toThrow(
    /workspace/,
  );
  await expect(
    repo.estimates.assignJob('org', 'job', 'user', true, {
      reviewer: 'user',
      job_revision: 1,
      issued_version_id: 'version',
      expected_active: null,
      assertCurrent() {},
    }),
  ).rejects.toThrow(/connected RPC/);
});
it.each([
  {
    development: false,
    flag: 'true',
    hostname: '127.0.0.1',
    protocol: 'http:',
  },
  {
    development: true,
    flag: undefined,
    hostname: '127.0.0.1',
    protocol: 'http:',
  },
  { development: true, flag: 'TRUE', hostname: 'localhost', protocol: 'http:' },
  {
    development: true,
    flag: 'true',
    hostname: '127.0.0.1.example.test',
    protocol: 'http:',
  },
  {
    development: true,
    flag: 'true',
    hostname: '192.168.1.5',
    protocol: 'http:',
  },
  { development: true, flag: 'true', hostname: 'localhost', protocol: 'file:' },
])('default-OFF flag/DEV/literal-loopback gate rejects %j', (input) => {
  expect(fieldWorkOrdersEnabled(input)).toBe(false);
});
it('accepts only exact explicitly enabled local development context', () => {
  expect(
    fieldWorkOrdersEnabled({
      development: true,
      flag: 'true',
      hostname: '127.0.0.1',
      protocol: 'http:',
    }),
  ).toBe(true);
});
