import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  assertTaskCorrectionReviewCurrent,
  selectTaskCorrectionSource,
  saveTaskCorrectionReview,
  reconcileTaskCorrectionReview,
  type TaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    org = sources.company.id,
    entry = sources.entries[0],
    other = sources.entries[1],
    ids: string[] = [];
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-task-selection-remaining-owner',
  );
  for (const [index, target] of [entry, entry, other].entries()) {
    const day = index + 1,
      id = await sources.estimates.recordTime(org, target.worker_id, {
        job_id: target.target.job_id!,
        overhead_center: null,
        task: `Exact recorded task selection ${index}`,
        kind: 'work',
        started_at: `2026-10-0${day}T08:00:00Z`,
        ended_at: `2026-10-0${day}T09:00:00Z`,
        billable: false,
        corrects_id: null,
      });
    if (typeof id !== 'string') throw Error('Exact native task ID required');
    await sources.estimates.submitTime(org, id);
    await sources.estimates.reviewTime(org, id, 'approved', 'Synthetic review');
    ids.push(id);
  }
  const review = await readTaskCorrectionReview(
      sources,
      entry.target.job_id!,
      gate,
      ids[0],
    ),
    otherReview = await readTaskCorrectionReview(
      sources,
      other.target.job_id!,
      gate,
      ids[2],
    );
  return { gate, sources, org, entry, other, ids, review, otherReview };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const state = (f: Fixture) =>
  [f.entry, f.other].map((entry) =>
    f.sources.estimates.readSyntheticPrototypeSources(entry.target),
  );
const input = (f: Fixture) => ({
  source_entry_id: f.ids[0],
  task: 'Explicit original task correction only',
  started_at: f.review.source.started_at,
  ended_at: f.review.source.ended_at,
  billable: true,
});

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: selection must not return the original job view paired with another job canonical task`, async () => {
    const f = await fixture(brand),
      before = state(f),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    let viewGets = 0,
      result: TaskCorrectionReview | undefined;
    const review = new Proxy(
      { ...f.review },
      {
        get(target, key, receiver) {
          if (key === 'view')
            return ++viewGets === 1 ? f.review.view : f.otherReview.view;
          return Reflect.get(target, key, receiver);
        },
      },
    );
    try {
      result = await selectTaskCorrectionSource(review, f.ids[2]);
    } catch {
      // The other job's task cannot be selected through the first native view.
    }
    expect(result).toBeUndefined();
    expect(viewGets).toBe(0);
    expect(state(f)).toEqual(before);
    expect(writer).not.toHaveBeenCalled();
    expect(
      (await assertTaskCorrectionReviewCurrent(f.review)).source_entry_id,
    ).toBe(f.ids[0]);
  });

  it(`brand ${brand}: ordinary same-job selection retains the original view and exact canonical source without writes`, async () => {
    const f = await fixture(brand),
      before = state(f),
      writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      submit = vi.spyOn(f.sources.estimates, 'submitTime'),
      review = vi.spyOn(f.sources.estimates, 'reviewTime'),
      fetcher = vi.spyOn(globalThis, 'fetch'),
      selected = await selectTaskCorrectionSource(f.review, f.ids[1]);
    expect(selected.view).toBe(f.review.view);
    expect(selected.view.identity).toEqual(f.review.view.identity);
    expect(selected.source.source_entry_id).toBe(f.ids[1]);
    expect(selected.source.worker_id).toBe(f.entry.worker_id);
    expect(selected.source.can_edit).toBe(true);
    expect(await assertTaskCorrectionReviewCurrent(selected)).toEqual(
      selected.source,
    );
    expect(Object.isFrozen(selected)).toBe(true);
    expect(state(f)).toEqual(before);
    for (const command of [writer, submit, review, fetcher])
      expect(command).not.toHaveBeenCalled();
    expect((await reconcileTaskCorrectionReview(selected)).state).toBe(
      'NOT_ATTEMPTED',
    );
  });

  it(`brand ${brand}: actual owner revocation during original reference capture denies selection`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const review = new Proxy(
      { ...f.review },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'view' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    await expect(
      selectTaskCorrectionSource(review, f.ids[1]),
    ).rejects.toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    await expect(
      selectTaskCorrectionSource(f.review, f.ids[1]),
    ).rejects.toThrow();
  });

  it(`brand ${brand}: original native post-await checks still deny actual owner revocation`, async () => {
    const f = await fixture(brand),
      original = f.sources.estimates.workforce.bind(f.sources.estimates);
    let captures = 0;
    vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
      async (...args) => {
        const value = await original(...args);
        captures++;
        await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
        return value;
      },
    );
    await expect(
      selectTaskCorrectionSource(f.review, f.ids[1]),
    ).rejects.toThrow();
    expect(captures).toBe(1);
  });

  it(`brand ${brand}: withdrawn admission during descriptor capture cannot select another source`, async () => {
    const f = await fixture(brand),
      review = new Proxy(
        { ...f.review },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'view') f.gate.confirmed = false;
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    await expect(
      selectTaskCorrectionSource(review, f.ids[1]),
    ).rejects.toThrow();
    await expect(assertTaskCorrectionReviewCurrent(f.review)).rejects.toThrow();
  });

  it(`brand ${brand}: stale native plan state cannot be replaced by another selected task`, async () => {
    const f = await fixture(brand),
      plan = f.sources.property
        .read(f.org)
        .plans.find((p) => p.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...plan,
      name: 'Explicit native plan revision after source capture',
    });
    const writer = vi.spyOn(f.sources.estimates, 'recordTime');
    await expect(
      selectTaskCorrectionSource(f.review, f.ids[1]),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  });
}

it('foreign company IDs, sibling IDs and copied opaque views cannot replace original custody', async () => {
  const first = await fixture(0),
    foreign = await fixture(1);
  for (const id of [first.ids[2], foreign.ids[0], 'missing-native-task'])
    await expect(
      selectTaskCorrectionSource(first.review, id),
    ).rejects.toThrow();
  await expect(
    selectTaskCorrectionSource(
      { view: { ...first.review.view }, source: first.review.source },
      first.ids[1],
    ),
  ).rejects.toThrow();
  await expect(
    selectTaskCorrectionSource(
      { view: foreign.review.view, source: first.review.source },
      first.ids[1],
    ),
  ).rejects.toThrow();
  expect(
    (await selectTaskCorrectionSource(first.review, first.ids[1])).view,
  ).toBe(first.review.view);
});

it.each(
  [0, 1, 2].flatMap((brand) =>
    (['before', 'after'] as const).map((phase) => [brand, phase] as const),
  ),
)(
  'brand %i: UNKNOWN after %s acknowledgment loss is not renewed by selecting another same-job task',
  async (brand, phase) => {
    const f = await fixture(brand),
      original = f.sources.estimates.recordTime.bind(f.sources.estimates);
    vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
      async (...args) => {
        if (phase === 'after') await original(...args);
        throw Error('Synthetic acknowledgment lost');
      },
    );
    await expect(
      saveTaskCorrectionReview(f.review, input(f), true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      receipt = await reconcileTaskCorrectionReview(f.review);
    expect(receipt.state).toBe('UNKNOWN');
    expect(receipt.source_id).toBe(f.ids[0]);
    expect(receipt.replay).toBe('FORBIDDEN');
    await expect(
      selectTaskCorrectionSource(f.review, f.ids[1]),
    ).rejects.toThrow();
    await expect(
      saveTaskCorrectionReview(f.review, input(f), true),
    ).rejects.toThrow();
    expect(await reconcileTaskCorrectionReview(f.review)).toEqual(receipt);
    expect(writer).not.toHaveBeenCalled();
  },
);

it.each([0, 1, 2])(
  'brand %i: selecting another task cannot bypass a completed original one-use correction',
  async (brand) => {
    const f = await fixture(brand);
    await saveTaskCorrectionReview(f.review, input(f), true);
    const receipt = await reconcileTaskCorrectionReview(f.review),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    expect(receipt.state).toBe('KNOWN_SAVED');
    expect(receipt.source_id).toBe(f.ids[0]);
    expect(receipt.result_id).toEqual(expect.any(String));
    expect(receipt.replay).toBe('FORBIDDEN');
    await expect(
      selectTaskCorrectionSource(f.review, f.ids[1]),
    ).rejects.toThrow();
    expect(await reconcileTaskCorrectionReview(f.review)).toEqual(receipt);
    expect(writer).not.toHaveBeenCalled();
  },
);

it('default-OFF keeps private repositories unread and accessor wrappers never execute their getters', async () => {
  const getter = vi.fn(() => {
      throw Error('No private source access');
    }),
    sources = new Proxy({}, { get: getter });
  await expect(
    readTaskCorrectionReview(sources as never, 'unadmitted'),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
  const f = await fixture(0),
    viewGetter = vi.fn(() => f.review.view),
    review = Object.defineProperty({ source: f.review.source }, 'view', {
      enumerable: true,
      get: viewGetter,
    });
  await expect(
    selectTaskCorrectionSource(review as never, f.ids[1]),
  ).rejects.toThrow();
  expect(viewGetter).not.toHaveBeenCalled();
});

it('missing or invented wrapper fields cannot supply a substitute original view', async () => {
  const f = await fixture(0);
  for (const review of [
    { view: f.review.view },
    { source: f.review.source },
    { ...f.review, invented: true },
  ])
    await expect(
      selectTaskCorrectionSource(review as never, f.ids[1]),
    ).rejects.toThrow();
  expect(
    (await selectTaskCorrectionSource(f.review, f.ids[1])).source
      .source_entry_id,
  ).toBe(f.ids[1]);
});
