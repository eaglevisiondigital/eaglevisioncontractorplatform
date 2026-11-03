import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
  readSavedTaskCorrection,
  executeSavedTaskCorrection,
  readSavedPlanCorrection,
  executeSavedPlanCorrection,
  readSavedMaterialCorrection,
  executeSavedMaterialCorrection,
  reconcileSavedSourceCorrection,
} from '../src/lib/workflows/saved-revision-exercise';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    org = sources.company.id;
  const view = () => readSavedSourceExercise(sources, job, gate);
  return { gate, all, entry, sources, job, org, view };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function task(
  f: F,
  start = '2026-02-03T14:00:00.000Z',
  end = '2026-02-03T15:00:00.000Z',
) {
  const id = await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
    job_id: f.job,
    overhead_center: null,
    task: 'Original recorded task',
    kind: 'work',
    started_at: start,
    ended_at: end,
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Exact native time UUID required');
  await f.sources.estimates.submitTime(f.org, id);
  await f.sources.estimates.reviewTime(
    f.org,
    id,
    'approved',
    'Original internal review',
  );
  return id;
}
async function material(
  f: F,
  kind: 'commitment' | 'payment' | 'credit' = 'commitment',
  adjusts: string | null = null,
) {
  return f.sources.estimates.submitExpense(f.org, f.job, {
    purchase_key: 'C21-CANONICAL',
    supplier: 'Existing synthetic supplier',
    reference: 'C21-PENDING-' + kind,
    category: 'materials',
    kind,
    amount_minor: 2500,
    description: 'Original pending internal cost document',
    estimate_line_id: null,
    quantity_milli: null,
    unit: null,
    unit_cost_minor: null,
    document_ids: [],
    material_approval_id: null,
    adjusts_expense_id: adjusts,
  });
}
function input(id: string) {
  return {
    source_entry_id: id,
    task: 'Explicit corrected task description',
    started_at: '2026-02-03T14:00:00.000Z',
    ended_at: '2026-02-03T15:30:00.000Z',
    billable: true,
  };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand} exact task correction appends original native records and read-only receipt`, async () => {
    const f = await fixture(brand),
      id = await task(f),
      before = await f.sources.estimates.workforce(f.org),
      jobs = JSON.stringify(await f.sources.estimates.jobs(f.org)),
      v = await f.view();
    expect((await readSavedTaskCorrection(v, id)).can_edit).toBe(true);
    await executeSavedTaskCorrection(v, input(id), true);
    const after = await f.sources.estimates.workforce(f.org),
      result = after.entries.find((e) => e.corrects_id === id)!;
    expect(after.entries.find((e) => e.id === id)).toEqual(
      before.entries.find((e) => e.id === id),
    );
    expect(result).toMatchObject({
      task: input(id).task,
      started_at: input(id).started_at,
      ended_at: input(id).ended_at,
      billable: input(id).billable,
      corrects_id: id,
      worker_id: f.entry.worker_id,
      submitted: true,
      kind: 'work',
      job_id: f.job,
    });
    expect(after.reviews.find((r) => r.entry_id === result.id)?.decision).toBe(
      'approved',
    );
    expect(JSON.stringify(await f.sources.estimates.jobs(f.org))).toBe(jobs);
    expect(
      await reconcileSavedSourceCorrection(v, 'time-correction'),
    ).toMatchObject({
      state: 'KNOWN_SAVED',
      source_id: id,
      result_id: result.id,
      observed: 'EXACT_RESULT_OBSERVED',
      replay: 'FORBIDDEN',
    });
  });
  it(`brand ${brand} exact plan correction uses original CAS and preserves published history`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      v = await f.view(),
      p = readSavedPlanCorrection(v),
      desired = {
        plan_id: p.plan_id,
        revision: p.revision,
        name: 'Reviewed custom maintenance plan',
        cadence: 'custom' as const,
        interval_days: 21,
      };
    await executeSavedPlanCorrection(v, desired, true);
    const after = f.sources.property.read(f.org),
      result = after.plans.find((x) => x.id === p.plan_id)!;
    expect(result).toMatchObject({
      name: desired.name,
      cadence: 'custom',
      interval_days: 21,
      revision: p.revision + 1,
    });
    expect(after.reports).toEqual(before.reports);
    expect(after.visits).toEqual(before.visits);
    expect(
      await reconcileSavedSourceCorrection(v, 'plan-revision'),
    ).toMatchObject({
      state: 'KNOWN_SAVED',
      source_id: p.plan_id,
      result_id: p.plan_id,
      observed: 'EXACT_RESULT_OBSERVED',
    });
  });
  it(`brand ${brand} exact pending material rejection records only original event and job revision`, async () => {
    const f = await fixture(brand),
      id = await material(f),
      v = await f.view(),
      before = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ).job!;
    expect(readSavedMaterialCorrection(v, id).can_review).toBe(true);
    await executeSavedMaterialCorrection(
      v,
      {
        expense_id: id,
        decision: 'rejected',
        reason:
          'Incorrect recorded quantity; staff review rejects this pending document',
      },
      true,
    );
    const after = f.sources.estimates.readSyntheticPrototypeSources(
      f.entry.target,
    ).job!;
    expect(after.expenses).toEqual(before.expenses);
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.lock_revision).toBe(before.lock_revision + 1);
    expect(
      await reconcileSavedSourceCorrection(v, 'material-review'),
    ).toMatchObject({
      state: 'KNOWN_SAVED',
      source_id: id,
      observed: 'EXACT_RESULT_OBSERVED',
    });
  });
}
it('pending material approval affects canonical commitment and never creates cost/payment rows', async () => {
  const f = await fixture(),
    id = await material(f),
    v = await f.view(),
    before = f.sources.estimates.readSyntheticPrototypeSources(
      f.entry.target,
    ).job!;
  await executeSavedMaterialCorrection(
    v,
    {
      expense_id: id,
      decision: 'approved',
      reason: 'Exact original source reviewed',
    },
    true,
  );
  const after = f.sources.estimates.readSyntheticPrototypeSources(
    f.entry.target,
  ).job!;
  expect(after.expenses).toEqual(before.expenses);
  expect(after.events.at(-1)).toMatchObject({
    submission_id: id,
    decision: 'approved',
  });
  expect(after.labor).toEqual(before.labor);
  expect(after.changes).toEqual(before.changes);
});
it('no pending material is a useful empty state, exact wrong ID never falls back', async () => {
  const f = await fixture(),
    v = await f.view();
  expect(readSavedMaterialCorrection(v)).toMatchObject({
    expense_id: null,
    can_review: false,
    blocked_reason: 'NO_PENDING_MATERIAL',
    eligible_expenses: [],
  });
  expect(() => readSavedMaterialCorrection(v, crypto.randomUUID())).toThrow();
});
it.each(['payment', 'credit'] as const)(
  'pending %s is never admitted for material correction',
  async (kind) => {
    const f = await fixture(),
      id = await material(f, kind),
      v = await f.view();
    expect(() => readSavedMaterialCorrection(v, id)).toThrow();
    expect(readSavedMaterialCorrection(v).can_review).toBe(false);
  },
);
it('ambiguous or foreign adjusts_expense_id is not material correction provenance', async () => {
  const f = await fixture(),
    id = await material(f, 'commitment', crypto.randomUUID()),
    v = await f.view();
  expect(() => readSavedMaterialCorrection(v, id)).toThrow();
  await expect(
    executeSavedMaterialCorrection(
      v,
      {
        expense_id: id,
        decision: 'approved',
        reason: 'Cannot authorize foreign link',
      },
      true,
    ),
  ).rejects.toThrow();
});
it('invalid fields and getters are rejected before any canonical writer', async () => {
  const f = await fixture(),
    id = await task(f),
    v = await f.view(),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  for (const wrong of [
    { ...input(id), private_note: 'x' },
    { ...input(id), task: ' ' },
    { ...input(id), ended_at: input(id).started_at },
    { ...input(id), billable: 'yes' },
  ])
    await expect(
      executeSavedTaskCorrection(v, wrong as never, true),
    ).rejects.toThrow();
  let touched = 0;
  const bad = { ...input(id) };
  Object.defineProperty(bad, 'task', {
    get() {
      touched++;
      throw Error('untrusted');
    },
  });
  await expect(executeSavedTaskCorrection(v, bad, true)).rejects.toThrow();
  expect(touched).toBe(0);
  expect(writer).not.toHaveBeenCalled();
});
it('explicit review confirmation is required and does not consume custody', async () => {
  const f = await fixture(),
    id = await task(f),
    v = await f.view();
  await expect(
    executeSavedTaskCorrection(v, input(id), false),
  ).rejects.toThrow();
  expect((await readSavedTaskCorrection(v, id)).can_edit).toBe(true);
});
it('another job task ID or plan ID cannot substitute for selected exact source', async () => {
  const f = await fixture(),
    other = f.all.entries[1],
    id = await f.sources.estimates.recordTime(f.org, other.worker_id, {
      job_id: other.target.job_id!,
      overhead_center: null,
      task: 'Other job task',
      kind: 'work',
      started_at: '2026-02-03T10:00:00Z',
      ended_at: '2026-02-03T11:00:00Z',
      billable: false,
      corrects_id: null,
    });
  if (typeof id !== 'string') throw Error('Exact native time UUID required');
  await f.sources.estimates.submitTime(f.org, id);
  await f.sources.estimates.reviewTime(
    f.org,
    id,
    'approved',
    'Other job review',
  );
  const v = await f.view();
  await expect(readSavedTaskCorrection(v, id)).rejects.toThrow();
  const p = readSavedPlanCorrection(v);
  await expect(
    executeSavedPlanCorrection(
      v,
      { ...p, plan_id: other.plan_id } as never,
      true,
    ),
  ).rejects.toThrow();
});
it.each(['task', 'plan', 'material'] as const)(
  '%s duplicate/concurrent confirmations invoke the native writer once',
  async (kind) => {
    const f = await fixture(),
      id =
        kind === 'task'
          ? await task(f)
          : kind === 'material'
            ? await material(f)
            : '',
      v = await f.view();
    const p = readSavedPlanCorrection(v),
      native =
        kind === 'plan'
          ? vi.spyOn(f.sources.property, 'savePlan')
          : kind === 'task'
            ? vi.spyOn(f.sources.estimates, 'recordTime')
            : vi.spyOn(f.sources.estimates, 'reviewExpense');
    const act = () =>
      kind === 'task'
        ? executeSavedTaskCorrection(v, input(id), true)
        : kind === 'plan'
          ? executeSavedPlanCorrection(
              v,
              {
                plan_id: p.plan_id,
                revision: p.revision,
                name: 'Changed explicit plan',
                cadence: 'weekly',
                interval_days: 7,
              },
              true,
            )
          : executeSavedMaterialCorrection(
              v,
              { expense_id: id, decision: 'approved', reason: 'Exact review' },
              true,
            );
    const results = await Promise.allSettled([act(), act()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(native).toHaveBeenCalledTimes(1);
  },
);
it.each(['task', 'plan', 'material'] as const)(
  '%s lost native acknowledgment retains UNKNOWN across fresh views with no replay',
  async (kind) => {
    const f = await fixture(),
      id =
        kind === 'task'
          ? await task(f)
          : kind === 'material'
            ? await material(f)
            : '',
      v = await f.view(),
      p = readSavedPlanCorrection(v);
    let restore: () => void;
    if (kind === 'task') {
      const original = f.sources.estimates.recordTime.bind(f.sources.estimates);
      const spy = vi
        .spyOn(f.sources.estimates, 'recordTime')
        .mockImplementation(async (...args) => {
          await original(...args);
          throw Error('lost ACK');
        });
      restore = () => spy.mockRestore();
    } else if (kind === 'plan') {
      const original = f.sources.property.savePlan.bind(f.sources.property);
      const spy = vi
        .spyOn(f.sources.property, 'savePlan')
        .mockImplementation((...args) => {
          original(...args);
          throw Error('lost ACK');
        });
      restore = () => spy.mockRestore();
    } else {
      const original = f.sources.estimates.reviewExpense.bind(
        f.sources.estimates,
      );
      const spy = vi
        .spyOn(f.sources.estimates, 'reviewExpense')
        .mockImplementation(async (...args) => {
          await original(...args);
          throw Error('lost ACK');
        });
      restore = () => spy.mockRestore();
    }
    const action = () =>
      kind === 'task'
        ? executeSavedTaskCorrection(v, input(id), true)
        : kind === 'plan'
          ? executeSavedPlanCorrection(
              v,
              {
                plan_id: p.plan_id,
                revision: p.revision,
                name: 'Exact correction',
                cadence: 'weekly',
                interval_days: 7,
              },
              true,
            )
          : executeSavedMaterialCorrection(
              v,
              { expense_id: id, decision: 'approved', reason: 'Exact review' },
              true,
            );
    await expect(action()).rejects.toThrow();
    restore();
    const key =
      kind === 'task'
        ? 'time-correction'
        : kind === 'plan'
          ? 'plan-revision'
          : 'material-review';
    expect(await reconcileSavedSourceCorrection(v, key)).toMatchObject({
      state: 'UNKNOWN',
      result_id: null,
      observed: 'SOURCE_CHANGED_UNATTRIBUTED',
      replay: 'FORBIDDEN',
    });
    const fresh = await f.view();
    await expect(
      executeSavedSourceExercise(fresh, 'visit-draft', true),
    ).rejects.toThrow(/UNKNOWN/);
  },
);
it('actual locked source cannot be shifted outside its locked native period', async () => {
  const f = await fixture(),
    id = await task(f);
  await f.sources.estimates.payroll(
    f.org,
    '2026-02-03T00:00:00.000Z',
    '2026-02-04T00:00:00.000Z',
    {},
    true,
  );
  const v = await f.view();
  expect(await readSavedTaskCorrection(v, id)).toMatchObject({
    locked: true,
    can_edit: false,
    blocked_reason: 'LOCKED_PERIOD',
  });
  await expect(
    executeSavedTaskCorrection(
      v,
      {
        ...input(id),
        started_at: '2026-02-05T14:00:00.000Z',
        ended_at: '2026-02-05T15:00:00.000Z',
      },
      true,
    ),
  ).rejects.toThrow();
});
it('stale plan revision cannot overwrite a competing original save', async () => {
  const f = await fixture(),
    v = await f.view(),
    p = readSavedPlanCorrection(v),
    raw = f.sources.property.read(f.org).plans.find((x) => x.id === p.plan_id)!;
  f.sources.property.savePlan(f.org, {
    ...raw,
    name: 'Competing original edit',
  });
  await expect(
    executeSavedPlanCorrection(
      v,
      {
        plan_id: p.plan_id,
        revision: p.revision,
        name: 'Stale attempted name',
        cadence: 'weekly',
        interval_days: 7,
      },
      true,
    ),
  ).rejects.toThrow();
});
it('revocation during an async task read prevents command invocation and exact reconciliation', async () => {
  const f = await fixture(),
    id = await task(f),
    v = await f.view(),
    original = f.sources.estimates.workforce.bind(f.sources.estimates),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
    async (...args) => {
      const value = await original(...args);
      f.gate.confirmed = false;
      return value;
    },
  );
  await expect(
    executeSavedTaskCorrection(v, input(id), true),
  ).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
  await expect(
    reconcileSavedSourceCorrection(v, 'time-correction'),
  ).rejects.toThrow();
});
it('new confirmed forms share original fixed-exercise duplicate custody', async () => {
  const f = await fixture(),
    v = await f.view();
  await executeSavedSourceExercise(v, 'plan-revision', true);
  const fresh = await f.view();
  expect(readSavedPlanCorrection(fresh).can_edit).toBe(false);
});
it('live task edits during source await are rejected before canonical mutation', async () => {
  const f = await fixture(),
    id = await task(f),
    v = await f.view(),
    draft = input(id),
    original = f.sources.estimates.workforce.bind(f.sources.estimates),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  vi.spyOn(f.sources.estimates, 'workforce').mockImplementationOnce(
    async (...args) => {
      const value = await original(...args);
      draft.task = 'Edited after confirmation';
      return value;
    },
  );
  await expect(executeSavedTaskCorrection(v, draft, true)).rejects.toThrow(
    /Live/,
  );
  expect(writer).not.toHaveBeenCalled();
});
it('live task edit after native append stops submission/review and retains UNKNOWN', async () => {
  const f = await fixture(),
    id = await task(f),
    v = await f.view(),
    draft = input(id),
    original = f.sources.estimates.recordTime.bind(f.sources.estimates),
    submit = vi.spyOn(f.sources.estimates, 'submitTime');
  vi.spyOn(f.sources.estimates, 'recordTime').mockImplementationOnce(
    async (...args) => {
      const result = await original(...args);
      draft.task = 'Changed after append';
      return result;
    },
  );
  await expect(executeSavedTaskCorrection(v, draft, true)).rejects.toThrow(
    /Live/,
  );
  expect(submit).not.toHaveBeenCalled();
  expect(
    await reconcileSavedSourceCorrection(v, 'time-correction'),
  ).toMatchObject({
    state: 'UNKNOWN',
    observed: 'SOURCE_CHANGED_UNATTRIBUTED',
    replay: 'FORBIDDEN',
  });
});
it('live material change after native event never fabricates a known receipt', async () => {
  const f = await fixture(),
    id = await material(f),
    v = await f.view(),
    draft = {
      expense_id: id,
      decision: 'approved' as const,
      reason: 'Original reviewed reason',
    },
    original = f.sources.estimates.reviewExpense.bind(f.sources.estimates);
  vi.spyOn(f.sources.estimates, 'reviewExpense').mockImplementationOnce(
    async (...args) => {
      await original(...args);
      draft.reason = 'Changed while awaiting receipt';
    },
  );
  await expect(executeSavedMaterialCorrection(v, draft, true)).rejects.toThrow(
    /Live/,
  );
  expect(
    await reconcileSavedSourceCorrection(v, 'material-review'),
  ).toMatchObject({
    state: 'UNKNOWN',
    observed: 'SOURCE_CHANGED_UNATTRIBUTED',
  });
});
it('nonprimitive plan cadence cannot invoke caller coercion', async () => {
  const f = await fixture(),
    v = await f.view(),
    p = readSavedPlanCorrection(v);
  let touched = 0;
  await expect(
    executeSavedPlanCorrection(
      v,
      {
        plan_id: p.plan_id,
        revision: p.revision,
        name: 'Explicit name',
        cadence: {
          toString() {
            touched++;
            return 'weekly';
          },
        },
        interval_days: 7,
      } as never,
      true,
    ),
  ).rejects.toThrow();
  expect(touched).toBe(0);
});
