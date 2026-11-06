import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertTaskCorrectionReviewCurrent,
  readTaskCorrectionReview,
  reconcileTaskCorrectionReview,
  saveTaskCorrectionReview,
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
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-task-currentness-remaining-owner',
  );
  const id = await sources.estimates.recordTime(org, entry.worker_id, {
    job_id: job,
    overhead_center: null,
    task: 'Exact canonical technician task for current-source review',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Exact native task ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(org, id, 'approved', 'Synthetic review');
  const review = await readTaskCorrectionReview(sources, job, gate, id);
  return { gate, sources, entry, org, job, id, review };
}

function correction(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    source_entry_id: f.id,
    task: 'Explicit same-source local technician correction',
    started_at: f.review.source.started_at,
    ended_at: f.review.source.ended_at,
    billable: true,
  };
}

it.each([0, 1, 2])(
  'brand %i: current task read cannot resolve after a late original-source get revokes its actual owner',
  async (brand) => {
    const f = await fixture(brand);
    let sourceGets = 0,
      revoked: Promise<void> | undefined,
      result:
        | Awaited<ReturnType<typeof assertTaskCorrectionReviewCurrent>>
        | undefined;
    const review = new Proxy(
      { ...f.review },
      {
        get(target, key, receiver) {
          if (key === 'source' && ++sourceGets === 2)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return Reflect.get(target, key, receiver);
        },
      },
    );
    try {
      result = await assertTaskCorrectionReviewCurrent(review);
    } catch {
      // A real revocation must not resolve the current-source reader.
    }
    if (revoked) {
      await revoked;
      await expect(
        assertTaskCorrectionReviewCurrent(f.review),
      ).rejects.toThrow();
      expect(result).toBeUndefined();
    } else {
      // Own-data capture avoids this executable get; it did not revoke access.
      expect(sourceGets).toBe(0);
      expect(result).toEqual(f.review.source);
      expect(result?.source_entry_id).toBe(f.id);
    }
  },
);

it.each([0, 1, 2])(
  'brand %i: ordinary current references and copied source data retain exact IDs without an action callback',
  async (brand) => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      submit = vi.spyOn(f.sources.estimates, 'submitTime'),
      approve = vi.spyOn(f.sources.estimates, 'reviewTime'),
      fetcher = vi.spyOn(globalThis, 'fetch'),
      result = await assertTaskCorrectionReviewCurrent({
        view: f.review.view,
        source: { ...f.review.source },
      });
    expect(result).toEqual(f.review.source);
    expect(result.source_entry_id).toBe(f.id);
    expect(result.worker_id).toBe(f.entry.worker_id);
    expect(result.can_edit).toBe(true);
    expect(f.review.view.identity).toMatchObject({
      organization_id: f.org,
      actor_id: f.entry.target.actor_id,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
      job_id: f.job,
    });
    expect(writer).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    const observation = await reconcileTaskCorrectionReview(f.review);
    expect(observation.state).toBe('NOT_ATTEMPTED');
    expect(observation.replay).toBe('FORBIDDEN');
  },
);

it.each([0, 1, 2])(
  'brand %i: actual native revocation during reference descriptor capture denies the read',
  async (brand) => {
    const f = await fixture(brand);
    let captures = 0,
      revoked: Promise<void> | undefined;
    const review = new Proxy(
      { ...f.review },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'source') {
            captures++;
            revoked ??= f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    await expect(assertTaskCorrectionReviewCurrent(review)).rejects.toThrow();
    expect(captures).toBeGreaterThan(0);
    expect(revoked).toBeDefined();
    await revoked;
    await expect(assertTaskCorrectionReviewCurrent(f.review)).rejects.toThrow();
  },
);

it.each([0, 1, 2])(
  'brand %i: actual native revocation during expected-source serialization denies the read',
  async (brand) => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined,
      taskGets = 0;
    const source = new Proxy(
      { ...f.review.source },
      {
        get(target, key, receiver) {
          if (key === 'task') {
            taskGets++;
            revoked ??= f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          }
          return Reflect.get(target, key, receiver);
        },
      },
    );
    await expect(
      assertTaskCorrectionReviewCurrent({ view: f.review.view, source }),
    ).rejects.toThrow();
    expect(taskGets).toBeGreaterThan(0);
    expect(revoked).toBeDefined();
    await revoked;
    await expect(assertTaskCorrectionReviewCurrent(f.review)).rejects.toThrow();
  },
);

it.each([0, 1, 2])(
  'brand %i: original native post-await authorization still rejects a genuinely revoked reader',
  async (brand) => {
    const f = await fixture(brand),
      original = f.sources.estimates.workforce.bind(f.sources.estimates);
    let calls = 0;
    vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
      async (...args) => {
        const value = await original(...args);
        calls++;
        await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
        return value;
      },
    );
    await expect(assertTaskCorrectionReviewCurrent(f.review)).rejects.toThrow();
    expect(calls).toBe(1);
  },
);

it.each([0, 1, 2])(
  'brand %i: stale, missing, foreign and copied view sources never substitute an authoritative task',
  async (brand) => {
    const f = await fixture(brand),
      foreign = await fixture((brand + 1) % 3),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    await expect(
      assertTaskCorrectionReviewCurrent({
        view: foreign.review.view,
        source: f.review.source,
      }),
    ).rejects.toThrow();
    await expect(
      assertTaskCorrectionReviewCurrent({
        view: { ...f.review.view },
        source: f.review.source,
      }),
    ).rejects.toThrow();
    await expect(
      assertTaskCorrectionReviewCurrent({
        view: f.review.view,
      } as TaskCorrectionReview),
    ).rejects.toThrow();
    await expect(
      assertTaskCorrectionReviewCurrent({
        view: f.review.view,
        source: { ...f.review.source, source_entry_id: 'missing-native-task' },
      }),
    ).rejects.toThrow();
    const plan = f.sources.property
      .read(f.org)
      .plans.find((row) => row.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...plan,
      name: 'Explicit native plan revision after review',
    });
    await expect(assertTaskCorrectionReviewCurrent(f.review)).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
    const fresh = await readTaskCorrectionReview(
      f.sources,
      f.job,
      f.gate,
      f.id,
    );
    expect(
      (await assertTaskCorrectionReviewCurrent(fresh)).source_entry_id,
    ).toBe(f.id);
    expect(fresh.view.identity).toEqual(f.review.view.identity);
  },
);

it.each([0, 1, 2])(
  'brand %i: withdrawing original local admission keeps source reads and actions OFF',
  async (brand) => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      workforce = vi.spyOn(f.sources.estimates, 'workforce');
    f.gate.enabled = false;
    await expect(assertTaskCorrectionReviewCurrent(f.review)).rejects.toThrow();
    await expect(
      saveTaskCorrectionReview(f.review, correction(f), true),
    ).rejects.toThrow();
    expect(workforce).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
  },
);

it.each(
  [0, 1, 2].flatMap((brand) =>
    (['before', 'after'] as const).map((phase) => [brand, phase] as const),
  ),
)(
  'brand %i: UNKNOWN after %s native acknowledgment loss denies an editor read but preserves exact read-only reconciliation',
  async (brand, phase) => {
    const f = await fixture(brand),
      native = f.sources.estimates.recordTime.bind(f.sources.estimates);
    vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
      async (...args) => {
        if (phase === 'after') await native(...args);
        throw Error('Synthetic task append acknowledgment lost');
      },
    );
    await expect(
      saveTaskCorrectionReview(f.review, correction(f), true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      before = await reconcileTaskCorrectionReview(f.review);
    expect(before.state).toBe('UNKNOWN');
    expect(before.source_id).toBe(f.id);
    expect(before.result_id).toBeNull();
    expect(before.replay).toBe('FORBIDDEN');
    await expect(assertTaskCorrectionReviewCurrent(f.review)).rejects.toThrow();
    if (phase === 'before') {
      const held = await readTaskCorrectionReview(
        f.sources,
        f.job,
        f.gate,
        f.id,
      );
      expect(held.source.blocked_reason).toBe('UNKNOWN');
      expect(held.source.can_edit).toBe(false);
      await expect(assertTaskCorrectionReviewCurrent(held)).rejects.toThrow();
    }
    await expect(
      saveTaskCorrectionReview(f.review, correction(f), true),
    ).rejects.toThrow();
    expect(await reconcileTaskCorrectionReview(f.review)).toEqual(before);
    expect(writer).not.toHaveBeenCalled();
  },
);

it.each([0, 1, 2])(
  'brand %i: completed original correction stays one-use while exact saved receipt remains readable',
  async (brand) => {
    const f = await fixture(brand);
    await saveTaskCorrectionReview(f.review, correction(f), true);
    const receipt = await reconcileTaskCorrectionReview(f.review),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    expect(receipt.state).toBe('KNOWN_SAVED');
    expect(receipt.source_id).toBe(f.id);
    expect(receipt.result_id).toEqual(expect.any(String));
    expect(receipt.observed).toBe('EXACT_RESULT_OBSERVED');
    expect(receipt.replay).toBe('FORBIDDEN');
    const held = await readTaskCorrectionReview(f.sources, f.job, f.gate);
    expect(held.source.source_entry_id).toBe(receipt.result_id);
    expect(held.source.blocked_reason).toBe('ALREADY_ATTEMPTED');
    await expect(assertTaskCorrectionReviewCurrent(held)).rejects.toThrow();
    await expect(
      saveTaskCorrectionReview(held, correction(f), true),
    ).rejects.toThrow();
    expect(await reconcileTaskCorrectionReview(f.review)).toEqual(receipt);
    expect(writer).not.toHaveBeenCalled();
  },
);
