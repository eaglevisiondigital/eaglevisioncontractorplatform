import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { reportUuid } from '../src/domain/property/report-page';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readSavedSourceExercise,
  readSavedTaskCorrection,
} from '../src/lib/workflows/saved-revision-exercise';
import {
  readTaskCorrectionReview,
  parseTaskCorrectionInput,
  assertTaskCorrectionReviewCurrent,
  saveTaskCorrectionReview,
  reconcileTaskCorrectionReview,
  selectTaskCorrectionSource,
} from '../src/lib/workflows/task-correction-review';
import { TaskCorrectionReview } from '../src/components/workflows/TaskCorrectionReview';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function timeId(value: unknown) {
  if (typeof value !== 'string' || !reportUuid(value))
    throw Error('Exact native time UUID acknowledgment required');
  return value;
}
async function fixture(brand = 0, seed = true) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!;
  let source = '';
  if (seed) {
    source = timeId(
      await sources.estimates.recordTime(org, entry.worker_id, {
        job_id: job,
        overhead_center: null,
        task: 'Actual original property work',
        kind: 'work',
        started_at: '2026-10-01T08:00:00Z',
        ended_at: '2026-10-01T09:00:00Z',
        billable: false,
        corrects_id: null,
      }),
    );
    await sources.estimates.submitTime(org, source);
    await sources.estimates.reviewTime(
      org,
      source,
      'approved',
      'Explicit synthetic source fixture; no payroll execution.',
    );
  }
  return { all, entry, sources, org, job, gate, source };
}
type F = Awaited<ReturnType<typeof fixture>>;
const workforce = (f: F) =>
  f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).workforce;
const edit = (r: Awaited<ReturnType<typeof readTaskCorrectionReview>>) => ({
  source_entry_id: r.source.source_entry_id,
  task: 'Reviewed corrected task scope',
  started_at: r.source.started_at,
  ended_at: r.source.ended_at,
  billable: true,
});

it.each([0, 1, 2])(
  'brand %i saves an actual correction, internal review and exact original provenance without other side effects',
  async (brand) => {
    const f = await fixture(brand),
      original = workforce(f),
      property = JSON.stringify(f.sources.property.read(f.org)),
      periods = (await f.sources.estimates.workforce(f.org)).periods,
      r = await readTaskCorrectionReview(f.sources, f.job, f.gate, f.source),
      recorded = vi.spyOn(f.sources.estimates, 'recordTime'),
      submitted = vi.spyOn(f.sources.estimates, 'submitTime'),
      reviewed = vi.spyOn(f.sources.estimates, 'reviewTime'),
      network = vi.spyOn(globalThis, 'fetch');
    expect(r.source).toMatchObject({
      source_entry_id: f.source,
      task: 'Actual original property work',
      submitted: true,
      review: 'approved',
      can_edit: true,
    });
    expect(Object.isFrozen(r.source)).toBe(true);
    await saveTaskCorrectionReview(r, edit(r), true);
    const after = workforce(f),
      added = after.entries.filter(
        (e) => !original.entries.some((x) => x.id === e.id),
      );
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      corrects_id: f.source,
      worker_id: f.entry.worker_id,
      job_id: f.job,
      task: 'Reviewed corrected task scope',
      billable: true,
      submitted: true,
    });
    expect(
      after.entries.filter((e) => original.entries.some((x) => x.id === e.id)),
    ).toEqual(original.entries);
    expect(
      after.reviews.find((x) => x.entry_id === added[0].id)?.decision,
    ).toBe('approved');
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(reviewed).toHaveBeenCalledTimes(1);
    expect((await f.sources.estimates.workforce(f.org)).periods).toEqual(
      periods,
    );
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(property);
    expect(network).not.toHaveBeenCalled();
    const result = await reconcileTaskCorrectionReview(r);
    expect(result).toMatchObject({
      state: 'KNOWN_SAVED',
      source_id: f.source,
      result_id: added[0].id,
      replay: 'FORBIDDEN',
    });
    await expect(assertTaskCorrectionReviewCurrent(r)).rejects.toThrow();
  },
);
it('confirmation is explicit and missing confirmation does not claim or write', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    before = workforce(f);
  await expect(saveTaskCorrectionReview(r, edit(r), false)).rejects.toThrow();
  expect(workforce(f)).toEqual(before);
  await expect(
    saveTaskCorrectionReview(r, edit(r), true),
  ).resolves.toBeDefined();
});
it('no closed approved exact task is UNKNOWN instead of a fabricated source', async () => {
  const f = await fixture(0, false),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  await expect(
    readTaskCorrectionReview(f.sources, f.job, f.gate),
  ).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
});
it('explicit missing task selection never substitutes the newest available task', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate);
  await expect(
    readTaskCorrectionReview(f.sources, f.job, f.gate, crypto.randomUUID()),
  ).rejects.toThrow();
  await expect(
    selectTaskCorrectionSource(r, crypto.randomUUID()),
  ).rejects.toThrow();
  expect(
    (await selectTaskCorrectionSource(r, f.source)).source.source_entry_id,
  ).toBe(f.source);
});
it.each([
  ['source_entry_id', 'foreign'],
  ['task', '  '],
  ['task', ' padded '],
  ['task', 'x'.repeat(2001)],
  ['started_at', '2026-10-01T08:00:00'],
  ['ended_at', '2026-10-01T08:00:00Z'],
  ['ended_at', '2026-10-02T08:00:00Z'],
  ['billable', 'true'],
  ['private_notes', 'PRIVATE'],
] as const)(
  'case %# invalid %s form field is denied before the original writer',
  async (key, value) => {
    const f = await fixture(),
      r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
      before = workforce(f),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    await expect(
      saveTaskCorrectionReview(r, { ...edit(r), [key]: value }, true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
    expect(workforce(f)).toEqual(before);
  },
);
it('accessor form values are never evaluated or serialized', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    input = edit(r),
    getter = vi.fn(() => 'PRIVATE');
  Object.defineProperty(input, 'task', { get: getter, enumerable: true });
  expect(() => parseTaskCorrectionInput(input, r.source, f.job)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each([
  'customer_id',
  'location_id',
  'organization_id',
  'version_id',
] as const)(
  'exact current %s association cannot be substituted',
  async (key) => {
    const f = await fixture(),
      r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    f.entry.target[key] =
      key === 'organization_id' ? sampleCompanies[1].id : crypto.randomUUID();
    await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it.each(['inactive', 'nonreviewer'] as const)(
  'current %s reviewer is denied',
  async (kind) => {
    const f = await fixture(),
      actor = f.org + '-estimator';
    await f.sources.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    f.entry.target.actor_id = actor;
    const r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    await f.sources.operations.manageMember(
      f.org,
      actor,
      kind !== 'inactive',
      kind === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it('source revision changes invalidate the form before a canonical mutation', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    v = f.sources.property
      .read(f.org)
      .visits.find((v) => v.id === f.entry.scheduled_visit_id)!,
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  f.sources.property.saveVisit(f.org, v, {
    ...v.content,
    summary: 'Actual concurrent canonical source change',
  });
  await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
});
it('concurrent actions retain one canonical attempt and duplicate fresh reviews cannot replay', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  const results = await Promise.allSettled([
    saveTaskCorrectionReview(r, edit(r), true),
    saveTaskCorrectionReview(r, edit(r), true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(writer).toHaveBeenCalledTimes(1);
  const fresh = await readSavedSourceExercise(f.sources, f.job, f.gate);
  expect((await readSavedTaskCorrection(fresh)).can_edit).toBe(false);
  await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
  expect(writer).toHaveBeenCalledTimes(1);
});
it('lost record acknowledgment retains UNKNOWN after exact read-only reconciliation', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.estimates.recordTime.bind(f.sources.estimates),
    writer = vi
      .spyOn(f.sources.estimates, 'recordTime')
      .mockImplementation(async (...args) => {
        await original(...args);
        throw Error('lost record acknowledgment');
      });
  await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
  writer.mockRestore();
  const count = workforce(f).entries.length,
    reads = vi.spyOn(f.sources.estimates, 'recordTime');
  const reconciled = await reconcileTaskCorrectionReview(r);
  expect(reconciled.state).toBe('UNKNOWN');
  expect(reconciled.replay).toBe('FORBIDDEN');
  await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
  expect(workforce(f).entries).toHaveLength(count);
  expect(reads).not.toHaveBeenCalled();
});
it('revocation after native record await stops further submission and leaves UNKNOWN', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.estimates.recordTime.bind(f.sources.estimates),
    submitted = vi.spyOn(f.sources.estimates, 'submitTime');
  vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
    async (...args) => {
      const id = await original(...args);
      f.gate.confirmed = false;
      return id;
    },
  );
  await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
  expect(submitted).not.toHaveBeenCalled();
  f.gate.confirmed = true;
  expect((await reconcileTaskCorrectionReview(r)).state).toBe('UNKNOWN');
});
it('native payroll period lock withholds correction without changing immutable source', async () => {
  const f = await fixture();
  await f.sources.estimates.payroll(
    f.org,
    '2026-10-01T00:00:00Z',
    '2026-10-02T00:00:00Z',
    {},
    true,
  );
  const r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
    before = workforce(f);
  expect(r.source.locked).toBe(true);
  expect(r.source.can_edit).toBe(false);
  await expect(saveTaskCorrectionReview(r, edit(r), true)).rejects.toThrow();
  expect(workforce(f)).toEqual(before);
});
it.each(['input', 'gate', 'container'] as const)(
  'original live %s change during workforce eligibility await denies the write',
  async (kind) => {
    const f = await fixture(),
      r = await readTaskCorrectionReview(f.sources, f.job, f.gate),
      input = edit(r),
      original = f.sources.estimates.workforce.bind(f.sources.estimates),
      writer = vi.spyOn(f.sources.estimates, 'recordTime');
    let changed = false;
    vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
      async (...args) => {
        const rows = await original(...args);
        if (!changed) {
          changed = true;
          if (kind === 'input') input.task = 'Changed after exact confirmation';
          if (kind === 'gate') f.gate.confirmed = false;
          if (kind === 'container') f.sources.entries = [...f.sources.entries];
        }
        return rows;
      },
    );
    await expect(saveTaskCorrectionReview(r, input, true)).rejects.toThrow();
    expect(changed).toBe(true);
    expect(writer).not.toHaveBeenCalled();
  },
);
it.each(['unsubmitted', 'rejected'] as const)(
  'native %s time is not an eligible correction source',
  async (state) => {
    const f = await fixture(0, false),
      id = timeId(
        await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
          job_id: f.job,
          overhead_center: null,
          task: 'Actual unavailable source',
          kind: 'work',
          started_at: '2026-10-01T08:00:00Z',
          ended_at: '2026-10-01T09:00:00Z',
          billable: false,
          corrects_id: null,
        }),
      );
    if (state === 'rejected') {
      await f.sources.estimates.submitTime(f.org, id);
      await f.sources.estimates.reviewTime(
        f.org,
        id,
        'rejected',
        'Explicit synthetic rejected fixture.',
      );
    }
    await expect(
      readTaskCorrectionReview(f.sources, f.job, f.gate, id),
    ).rejects.toThrow();
  },
);
it('actual conflicting recorded time is rejected by native preflight before an attempt or writer', async () => {
  const f = await fixture(),
    id = timeId(
      await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
        job_id: f.job,
        overhead_center: null,
        task: 'Separate real recorded task',
        kind: 'work',
        started_at: '2026-10-01T09:00:00Z',
        ended_at: '2026-10-01T10:00:00Z',
        billable: false,
        corrects_id: null,
      }),
    );
  await f.sources.estimates.submitTime(f.org, id);
  await f.sources.estimates.reviewTime(
    f.org,
    id,
    'approved',
    'Explicit separate synthetic source.',
  );
  const r = await readTaskCorrectionReview(f.sources, f.job, f.gate, f.source),
    before = workforce(f),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  await expect(
    saveTaskCorrectionReview(
      r,
      { ...edit(r), ended_at: '2026-10-01T09:30:00Z' },
      true,
    ),
  ).rejects.toThrow();
  expect(workforce(f).entries).toEqual(before.entries);
  expect(writer).not.toHaveBeenCalled();
  expect((await reconcileTaskCorrectionReview(r)).state).toBe('NOT_ATTEMPTED');
});
it('read-only review excludes private rates, costs, payroll amounts and staff-only reasons', async () => {
  const f = await fixture(),
    r = await readTaskCorrectionReview(f.sources, f.job, f.gate);
  expect(JSON.stringify(r.source)).not.toMatch(
    /cash_minor|cash_hour|burden|unit_cost|supplier|private_reason|salary|deduction|PRIVATE/,
  );
  expect((await reconcileTaskCorrectionReview(r)).state).toBe('NOT_ATTEMPTED');
});
it('OFF fails before source getters and the disabled component exposes no correction control', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readTaskCorrectionReview(sources, 'untrusted', {
      enabled: false,
      confirmed: true,
    }),
  ).rejects.toThrow();
  const html = renderToStaticMarkup(
    createElement(TaskCorrectionReview, {
      sources,
      enabled: false,
      selectedJobId: 'untrusted',
    }),
  );
  expect(html).not.toContain('Save exact task correction');
  expect(getter).not.toHaveBeenCalled();
});
