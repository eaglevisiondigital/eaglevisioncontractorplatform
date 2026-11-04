import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
  reconcileTaskCorrectionReview,
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
  const id = await sources.estimates.recordTime(org, entry.worker_id, {
    job_id: job,
    overhead_center: null,
    task: 'Actual original technician work',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Native ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(
    org,
    id,
    'approved',
    'Private native review',
  );
  const review = await readTaskCorrectionReview(sources, job, gate, id),
    input = {
      source_entry_id: id,
      task: 'Explicit confirmed correction',
      started_at: review.source.started_at,
      ended_at: review.source.ended_at,
      billable: false,
    };
  return { sources, org, entry, job, id, review, input };
}
function substitute(
  input: Awaited<ReturnType<typeof fixture>>['input'],
  field: 'task' | 'billable',
) {
  let captures = 0;
  return new Proxy(input, {
    getOwnPropertyDescriptor(target, key) {
      const d = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === field) {
        captures++;
        return {
          ...d,
          value:
            captures <= 2
              ? input[field]
              : field === 'task'
                ? 'Unconfirmed substituted correction'
                : true,
        };
      }
      return d;
    },
  });
}
it.each(
  [0, 1, 2].flatMap((brand) =>
    (['task', 'billable'] as const).map((field) => [brand, field] as const),
  ),
)(
  'brand %i descriptor-proxy %s cannot replace confirmed correction at native admission',
  async (brand, field) => {
    const f = await fixture(brand),
      input = substitute(f.input, field),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    await saveTaskCorrectionReview(f.review, input, true).catch(
      () => undefined,
    );
    const receipt = await reconcileTaskCorrectionReview(f.review),
      rows = f.sources.estimates
        .readSyntheticPrototypeSources(f.entry.target)
        .workforce.entries.filter((row) => row.corrects_id === f.id),
      observed = {
        original_state: receipt.state,
        writer_calls: writer.mock.calls.length,
        admitted_task: rows[0]?.task ?? null,
        admitted_billable: rows[0]?.billable ?? null,
      };
    expect(observed, JSON.stringify(observed)).toEqual({
      original_state: 'NOT_ATTEMPTED',
      writer_calls: 0,
      admitted_task: null,
      admitted_billable: null,
    });
  },
);

it('transparent correction Proxy is denied before any original claim or canonical writer', async () => {
  const f = await fixture(0),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  await expect(
    saveTaskCorrectionReview(f.review, new Proxy(f.input, {}), true),
  ).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
  expect((await reconcileTaskCorrectionReview(f.review)).state).toBe(
    'NOT_ATTEMPTED',
  );
});
it.each([0, 1, 2])(
  'brand %i rejected Proxy consumes no claim and an ordinary confirmed correction still saves exactly once',
  async (brand) => {
    const f = await fixture(brand),
      before = f.sources.estimates.readSyntheticPrototypeSources(f.entry.target)
        .workforce.entries,
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    await expect(
      saveTaskCorrectionReview(f.review, substitute(f.input, 'task'), true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
    const actual = await saveTaskCorrectionReview(f.review, f.input, true),
      after = f.sources.estimates.readSyntheticPrototypeSources(f.entry.target)
        .workforce.entries,
      appended = after.filter(
        (row) => !before.some((original) => original.id === row.id),
      );
    expect(actual.status).toBe('SYNTHETIC_SOURCE_SAVED');
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      corrects_id: f.id,
      task: f.input.task,
      billable: false,
      worker_id: f.entry.worker_id,
      job_id: f.job,
    });
    expect(
      after.filter((row) => before.some((original) => original.id === row.id)),
    ).toEqual(before);
    await expect(
      saveTaskCorrectionReview(f.review, f.input, true),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
    expect((await reconcileTaskCorrectionReview(f.review)).state).toBe(
      'KNOWN_SAVED',
    );
  },
);
it('ordinary reversed-property null-prototype correction input is supported without changing canonical identity', async () => {
  const f = await fixture(0),
    input = Object.assign(Object.create(null), {
      billable: f.input.billable,
      ended_at: f.input.ended_at,
      started_at: f.input.started_at,
      task: f.input.task,
      source_entry_id: f.input.source_entry_id,
    });
  const actual = await saveTaskCorrectionReview(f.review, input, true),
    receipt = await reconcileTaskCorrectionReview(f.review);
  expect(actual.status).toBe('SYNTHETIC_SOURCE_SAVED');
  expect(receipt.state).toBe('KNOWN_SAVED');
  expect(receipt.source_id).toBe(f.id);
  expect(
    f.sources.estimates
      .readSyntheticPrototypeSources(f.entry.target)
      .workforce.entries.find((row) => row.id === receipt.result_id),
  ).toMatchObject({
    task: input.task,
    billable: input.billable,
    corrects_id: f.id,
  });
});
