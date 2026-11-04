import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareCorrectionPreviewSources } from '../src/lib/workflows/correction-preview-sources';
import { assertSavedRevisionCurrent } from '../src/lib/workflows/saved-revision-runtime';
import {
  readRecordedOwnerActions,
  recordedOwnerActionCards,
  assertRecordedOwnerActionsCurrent,
  inspectRecordedOwnerAction,
  continueRecordedOwnerAction,
} from '../src/lib/workflows/recorded-owner-actions';
import {
  assertRecordedPriorityNavigationCurrent,
  inspectRecordedPrioritySource,
  continueRecordedPrioritySource,
} from '../src/lib/workflows/recorded-priority-navigation';
import type { PriorityLiveCallback } from '../src/lib/workflows/priority-actions';

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
    sources = await prepareCorrectionPreviewSources(
      sampleCompanies[brand],
      gate,
    ),
    entry = sources.entries[2],
    job = entry.target.job_id!,
    view = await readRecordedOwnerActions(sources, job, gate),
    key = recordedOwnerActionCards(view)[0].key;
  return { gate, sources, entry, job, view, key };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((member) =>
        member.user_id === f.entry.target.actor_id
          ? { ...member, active: false }
          : member,
      ),
  );
}
function callback(f: Fixture) {
  const calls: { job: string; step: string }[] = [],
    fn: NonNullable<PriorityLiveCallback['current']> = (job, step) => {
      expect(job).toBe(f.job);
      calls.push({ job, step });
    },
    live: PriorityLiveCallback = { current: fn, generation: 0 };
  return { calls, fn, live };
}
async function measure<T>(f: Fixture, run: () => T | Promise<T>) {
  const reader = vi.spyOn(f.sources.estimates, 'readSyntheticPrototypeSources'),
    start = performance.now(),
    value = await run(),
    result = {
      value,
      native_calls: reader.mock.calls.length,
      duration_ms: performance.now() - start,
    };
  reader.mockRestore();
  return result;
}
function record(name: string, measurement: Record<string, unknown>) {
  if (!process.env.CYCLE31_MEASURE_DIRECTORY) return;
  mkdirSync(process.env.CYCLE31_MEASURE_DIRECTORY, { recursive: true });
  writeFileSync(
    `${process.env.CYCLE31_MEASURE_DIRECTORY}/${name}.json`,
    JSON.stringify(measurement, null, 2) + '\n',
  );
}

it.each([0, 1, 2])(
  'brand %i inspection performs distinct snapshot and native navigation checks without an immediate duplicate navigation guard',
  async (brand) => {
    const expected = await fixture(brand),
      native = await measure(expected, async () => {
        assertSavedRevisionCurrent(expected.view.snapshot);
        const selected = await inspectRecordedPrioritySource(
          expected.view.navigation,
          expected.key,
        );
        assertRecordedOwnerActionsCurrent(expected.view);
        return selected;
      }),
      actual = await fixture(brand),
      wrapper = await measure(actual, () =>
        inspectRecordedOwnerAction(actual.view, actual.key),
      ),
      guard = await measure(actual, () =>
        assertRecordedPriorityNavigationCurrent(actual.view.navigation),
      );
    record(`inspection-${brand}`, {
      jobs: actual.sources.entries.length,
      native_calls: native.native_calls,
      wrapper_calls: wrapper.native_calls,
      one_navigation_guard_calls: guard.native_calls,
      native_ms: native.duration_ms,
      wrapper_ms: wrapper.duration_ms,
    });
    expect(actual.sources.entries).toHaveLength(4);
    expect(native.native_calls).toBeGreaterThan(0);
    expect(guard.native_calls).toBeGreaterThan(0);
    expect(wrapper.value.key).toBe(actual.key);
    expect(wrapper.value.job_id).toBe(actual.job);
    expect(wrapper.value.step).toBe(native.value.step);
    expect(wrapper.native_calls).toBe(native.native_calls);
  },
);

it.each([0, 1, 2])(
  'brand %i continuation retains fresh original guards and exact one-use callback without repeating its immediate child navigation check',
  async (brand) => {
    const expected = await fixture(brand),
      source = await inspectRecordedOwnerAction(expected.view, expected.key),
      cb = callback(expected),
      native = await measure(expected, () => {
        assertSavedRevisionCurrent(expected.view.snapshot);
        return continueRecordedPrioritySource(
          expected.view.navigation,
          source,
          cb.fn,
          cb.live,
        );
      }),
      actual = await fixture(brand),
      selected = await inspectRecordedOwnerAction(actual.view, actual.key),
      current = callback(actual),
      wrapper = await measure(actual, () =>
        continueRecordedOwnerAction(
          actual.view,
          selected,
          current.fn,
          current.live,
        ),
      );
    record(`continuation-${brand}`, {
      jobs: actual.sources.entries.length,
      native_calls: native.native_calls,
      wrapper_calls: wrapper.native_calls,
      native_ms: native.duration_ms,
      wrapper_ms: wrapper.duration_ms,
    });
    expect(wrapper.value).toEqual(native.value);
    expect(wrapper.value.status).toBe('CURRENT_REVIEW_ONLY');
    expect(current.calls).toEqual([{ job: actual.job, step: selected.step }]);
    expect(wrapper.native_calls).toBe(native.native_calls);
    await continueRecordedOwnerAction(
      actual.view,
      selected,
      current.fn,
      current.live,
    );
    expect(current.calls).toHaveLength(1);
  },
);

it.each([0, 1, 2])(
  'brand %i staff revocation after inspection starts is still caught across the original await boundary',
  async (brand) => {
    const f = await fixture(brand),
      pending = inspectRecordedOwnerAction(f.view, f.key);
    revoke(f);
    await expect(pending).rejects.toThrow();
    expect(() => recordedOwnerActionCards(f.view)).toThrow();
  },
);

it.each([0, 1, 2])(
  'brand %i staff revocation after continuation starts withholds the callback and retains UNKNOWN',
  async (brand) => {
    const f = await fixture(brand),
      source = await inspectRecordedOwnerAction(f.view, f.key),
      cb = callback(f),
      pending = continueRecordedOwnerAction(f.view, source, cb.fn, cb.live);
    revoke(f);
    await expect(pending).resolves.toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
    });
    expect(cb.calls).toEqual([]);
    await continueRecordedOwnerAction(f.view, source, cb.fn, cb.live);
    expect(cb.calls).toEqual([]);
  },
);

it('a reconstructed wrapper cannot borrow original snapshot and navigation handles', async () => {
  const f = await fixture(),
    source = await inspectRecordedOwnerAction(f.view, f.key),
    cb = callback(f),
    forged = Object.freeze({ ...f.view });
  await expect(inspectRecordedOwnerAction(forged, f.key)).rejects.toThrow(
    'Original owner action read required',
  );
  await expect(
    continueRecordedOwnerAction(forged, source, cb.fn, cb.live),
  ).resolves.toMatchObject({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
  expect(cb.calls).toEqual([]);
});

it('the child navigation hold remains authoritative when the snapshot is otherwise current', async () => {
  const f = await fixture(),
    source = await inspectRecordedOwnerAction(f.view, f.key),
    cb = callback(f),
    lost: NonNullable<PriorityLiveCallback['current']> = () => {
      throw Error('Lost exact callback acknowledgment');
    };
  await expect(
    continueRecordedOwnerAction(f.view, source, lost, {
      current: lost,
      generation: 0,
    }),
  ).resolves.toMatchObject({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
  expect(() => assertSavedRevisionCurrent(f.view.snapshot)).not.toThrow();
  await expect(
    continueRecordedOwnerAction(f.view, source, cb.fn, cb.live),
  ).resolves.toMatchObject({ status: 'UNKNOWN', replay: 'FORBIDDEN' });
  expect(cb.calls).toEqual([]);
});

it('a foreign company inspection cannot borrow the selected company callback or navigation custody', async () => {
  const local = await fixture(0),
    foreign = await fixture(1),
    source = await inspectRecordedOwnerAction(foreign.view, foreign.key),
    cb = callback(local);
  await expect(
    continueRecordedOwnerAction(local.view, source, cb.fn, cb.live),
  ).resolves.toMatchObject({
    status: 'WITHHELD_NO_DISPATCH',
    replay: 'FORBIDDEN',
  });
  expect(cb.calls).toEqual([]);
});
