import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertTaskCorrectionDisplayCurrent,
  readTaskCorrectionReview,
  reconcileTaskCorrectionReview,
  saveTaskCorrectionReview,
  selectTaskCorrectionSource,
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
    org + '-task-display-remaining-owner',
  );
  const id = await sources.estimates.recordTime(org, entry.worker_id, {
    job_id: job,
    overhead_center: null,
    task: 'Exact original private technician task',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Exact native task ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(org, id, 'approved', 'Staff-only review');
  const review = await readTaskCorrectionReview(sources, job, gate, id);
  return { gate, sources, entry, org, job, id, review };
}

it.each([0, 1, 2])(
  'brand %i: task display cannot disclose retained private task details after a late source read revokes its actual owner',
  async (brand) => {
    const f = await fixture(brand);
    let sourceReads = 0,
      revoked: Promise<void> | undefined,
      result: ReturnType<typeof assertTaskCorrectionDisplayCurrent> | undefined;
    const wrapper = new Proxy(
      { ...f.review },
      {
        get(target, key, receiver) {
          if (key === 'source') {
            sourceReads++;
            revoked ??= f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          }
          return Reflect.get(target, key, receiver);
        },
      },
    );
    try {
      result = assertTaskCorrectionDisplayCurrent(wrapper);
    } catch {
      // A revoked original source must not return private task details.
    }
    if (revoked) {
      await revoked;
      expect(() => assertTaskCorrectionDisplayCurrent(f.review)).toThrow();
      expect(result).toBeUndefined();
    } else {
      // Safe own-data capture can avoid the executable property read entirely.
      expect(sourceReads).toBe(0);
      expect(result).toBe(f.review.source);
      expect(result?.source_entry_id).toBe(f.id);
      expect(result?.task).toBe('Exact original private technician task');
    }
  },
);

it.each([0, 1, 2])(
  'brand %i: captured task display references deny confirmation withdrawal during own-data capture',
  async (brand) => {
    const f = await fixture(brand);
    let captures = 0;
    const wrapper = new Proxy(
      { ...f.review },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'source') {
            captures++;
            f.gate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => assertTaskCorrectionDisplayCurrent(wrapper)).toThrow();
    expect(captures).toBeGreaterThan(0);
    expect(() => assertTaskCorrectionDisplayCurrent(f.review)).toThrow();
  },
);

it.each([0, 1, 2])(
  'brand %i: captured task display references preserve exact current source and reject copied foreign-identity views without writes',
  async (brand) => {
    const f = await fixture(brand),
      foreign = await fixture((brand + 1) % 3),
      writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      fetcher = vi.spyOn(globalThis, 'fetch'),
      source = assertTaskCorrectionDisplayCurrent({
        source: f.review.source,
        view: f.review.view,
      });
    expect(source).toBe(f.review.source);
    expect(source.source_entry_id).toBe(f.id);
    expect(source.worker_id).toBe(f.entry.worker_id);
    expect(source.can_edit).toBe(true);
    expect(f.review.view.identity.organization_id).toBe(f.org);
    expect(f.review.view.identity.job_id).toBe(f.job);
    expect(f.review.view.identity.customer_id).toBe(f.entry.target.customer_id);
    expect(f.review.view.identity.location_id).toBe(f.entry.target.location_id);
    expect(() =>
      assertTaskCorrectionDisplayCurrent({
        ...f.review,
        view: {
          ...f.review.view,
          identity: foreign.review.view.identity,
        },
      }),
    ).toThrow();
    expect(writer).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it.each([0, 1, 2])(
  'brand %i: captured task display references do not revive stale native plan state and permit only an explicit current reread',
  async (brand) => {
    const f = await fixture(brand),
      plan = f.sources.property
        .read(f.org)
        .plans.find((row) => row.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...plan,
      name: 'Explicit native plan revision after task review',
    });
    expect(() => assertTaskCorrectionDisplayCurrent({ ...f.review })).toThrow();
    const fresh = await readTaskCorrectionReview(
        f.sources,
        f.job,
        f.gate,
        f.id,
      ),
      source = assertTaskCorrectionDisplayCurrent(fresh);
    expect(source.source_entry_id).toBe(f.id);
    expect(source.task).toBe(f.review.source.task);
    expect(fresh.view.identity).toEqual(f.review.view.identity);
    expect(
      f.sources.property.read(f.org).plans.find((row) => row.id === plan.id)
        ?.revision,
    ).toBe(plan.revision + 1);
  },
);

it.each([0, 1, 2])(
  'brand %i: captured task display references retain an explicit native task selection without fallback or new entry',
  async (brand) => {
    const f = await fixture(brand),
      secondId = await f.sources.estimates.recordTime(
        f.org,
        f.entry.worker_id,
        {
          job_id: f.job,
          overhead_center: null,
          task: 'Second exact original technician task',
          kind: 'work',
          started_at: '2026-10-01T10:00:00Z',
          ended_at: '2026-10-01T11:00:00Z',
          billable: false,
          corrects_id: null,
        },
      );
    if (typeof secondId !== 'string')
      throw Error('Exact second native task ID required');
    await f.sources.estimates.submitTime(f.org, secondId);
    await f.sources.estimates.reviewTime(
      f.org,
      secondId,
      'approved',
      'Staff-only second review',
    );
    const current = await readTaskCorrectionReview(
        f.sources,
        f.job,
        f.gate,
        f.id,
      ),
      selected = await selectTaskCorrectionSource(current, secondId),
      writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      shown = assertTaskCorrectionDisplayCurrent({ ...selected });
    expect(shown).toBe(selected.source);
    expect(shown.source_entry_id).toBe(secondId);
    expect(shown.source_entry_id).not.toBe(f.id);
    expect(shown.task).toBe('Second exact original technician task');
    expect(selected.view).toBe(current.view);
    expect(selected.view.identity).toEqual(current.view.identity);
    await expect(
      selectTaskCorrectionSource(current, 'missing-exact-native-task'),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);

it.each(
  [0, 1, 2].flatMap((brand) =>
    (['before', 'after'] as const).map((phase) => [brand, phase] as const),
  ),
)(
  'brand %i: captured task display references preserve original UNKNOWN after %s native acknowledgment loss and deny replay',
  async (brand, phase) => {
    const f = await fixture(brand),
      native = f.sources.estimates.recordTime.bind(f.sources.estimates),
      input = {
        source_entry_id: f.id,
        task: 'Explicit corrected private technician task',
        started_at: f.review.source.started_at,
        ended_at: f.review.source.ended_at,
        billable: true,
      };
    vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
      async (...args) => {
        if (phase === 'after') await native(...args);
        throw Error('Synthetic native append acknowledgment lost');
      },
    );
    await expect(
      saveTaskCorrectionReview(f.review, input, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      before = await reconcileTaskCorrectionReview(f.review);
    expect(before.state).toBe('UNKNOWN');
    expect(before.source_id).toBe(f.id);
    expect(before.result_id).toBeNull();
    expect(before.replay).toBe('FORBIDDEN');
    expect(() => assertTaskCorrectionDisplayCurrent({ ...f.review })).toThrow();
    await expect(
      saveTaskCorrectionReview({ ...f.review }, input, true),
    ).rejects.toThrow();
    const after = await reconcileTaskCorrectionReview(f.review);
    expect(after).toEqual(before);
    expect(writer).not.toHaveBeenCalled();
  },
);
