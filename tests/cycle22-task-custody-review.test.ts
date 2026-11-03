import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { reportUuid } from '../src/domain/property/report-page';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readTaskCustodyReview,
  inspectTaskCustodyReview,
  taskCustodyDestination,
} from '../src/lib/workflows/task-custody-review';
import { TaskCustodyReview } from '../src/components/workflows/TaskCustodyReview';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0, seed = true) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[0],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!;
  let id = '';
  if (seed) {
    const result = await sources.estimates.recordTime(org, entry.worker_id, {
      job_id: job,
      overhead_center: null,
      task: 'Actual original task <text>',
      kind: 'work',
      started_at: '2026-10-01T08:00:00Z',
      ended_at: '2026-10-01T09:00:00Z',
      billable: false,
      corrects_id: null,
    });
    if (typeof result !== 'string' || !reportUuid(result))
      throw Error('Native UUID required');
    id = result;
    await sources.estimates.submitTime(org, id);
    await sources.estimates.reviewTime(
      org,
      id,
      'approved',
      'PRIVATE internal review reason',
    );
  }
  return { gate, all, entry, sources, org, job, id };
}
type F = Awaited<ReturnType<typeof fixture>>;
const rows = (f: F) =>
  f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).workforce;
async function correction(f: F) {
  const review = await readTaskCorrectionReview(f.sources, f.job, f.gate, f.id);
  return {
    review,
    input: {
      source_entry_id: f.id,
      task: 'Explicit corrected task',
      started_at: review.source.started_at,
      ended_at: review.source.ended_at,
      billable: true,
    },
  };
}
it.each([0, 1, 2])(
  'brand %i compares exact canonical original with actual saved receipt result',
  async (brand) => {
    const f = await fixture(brand),
      prior = rows(f),
      r = await correction(f);
    await saveTaskCorrectionReview(r.review, r.input, true);
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      network = vi.spyOn(globalThis, 'fetch'),
      snapshot = await readTaskCustodyReview(f.sources, f.job, f.gate),
      d = inspectTaskCustodyReview(snapshot);
    expect(d.status).toBe('KNOWN_SAVED');
    expect(d.original?.id).toBe(f.id);
    expect(d.recorded?.id).toBe(d.receipt.result_id);
    expect(d.recorded?.corrects_id).toBe(f.id);
    expect(d.original?.task).toBe(
      prior.entries.find((t) => t.id === f.id)?.task,
    );
    expect(d.differences.find((x) => x.field === 'task')?.comparison).toBe(
      'CHANGED',
    );
    expect(d.differences.find((x) => x.field === 'kind')?.comparison).toBe(
      'UNCHANGED',
    );
    expect(taskCustodyDestination(snapshot)).toEqual({
      job_id: f.job,
      step: 'field',
    });
    expect(d.replay).toBe('FORBIDDEN');
    expect(d.dispatch).toBe(false);
    expect(d.payroll).toBe(false);
    expect(writer).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(Object.isFrozen(d.original)).toBe(true);
  },
);
it('available original records do not fabricate an attempted correction', async () => {
  const f = await fixture(),
    d = inspectTaskCustodyReview(
      await readTaskCustodyReview(f.sources, f.job, f.gate),
    );
  expect(d.status).toBe('NOT_ATTEMPTED');
  expect(d.original).toBeNull();
  expect(d.recorded).toBeNull();
  expect(d.available_tasks.some((t) => t.id === f.id)).toBe(true);
  expect(d.differences.every((x) => x.comparison === 'NOT_COMPARABLE')).toBe(
    true,
  );
});
it('empty canonical task history is unavailable rather than failed or repaired', async () => {
  const f = await fixture(0, false),
    d = inspectTaskCustodyReview(
      await readTaskCustodyReview(f.sources, f.job, f.gate),
    );
  expect(d.available_tasks).toHaveLength(0);
  expect(d.receipt.observed).toBe('UNAVAILABLE');
  expect(d.status).toBe('NOT_ATTEMPTED');
});
it('an in-flight original correction is PENDING and a later acknowledgment stales its read-only view', async () => {
  const f = await fixture(),
    r = await correction(f),
    native = f.sources.estimates.recordTime.bind(f.sources.estimates);
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((resolve) => {
      release = resolve;
    }),
    start = new Promise<void>((resolve) => {
      entered = resolve;
    });
  vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
    async (...args) => {
      entered();
      await wait;
      return native(...args);
    },
  );
  const action = saveTaskCorrectionReview(r.review, r.input, true);
  await start;
  const snapshot = await readTaskCustodyReview(f.sources, f.job, f.gate);
  expect(inspectTaskCustodyReview(snapshot).status).toBe('PENDING');
  release();
  await action;
  expect(() => inspectTaskCustodyReview(snapshot)).toThrow();
  expect(
    inspectTaskCustodyReview(
      await readTaskCustodyReview(f.sources, f.job, f.gate),
    ).status,
  ).toBe('KNOWN_SAVED');
});
it('same wording and direct native provenance never fabricate an original command receipt', async () => {
  const f = await fixture(),
    old = rows(f).entries.find((t) => t.id === f.id)!;
  await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
    job_id: f.job,
    overhead_center: null,
    task: old.task,
    kind: old.kind,
    started_at: old.started_at,
    ended_at: old.ended_at,
    billable: old.billable,
    corrects_id: f.id,
  });
  const d = inspectTaskCustodyReview(
    await readTaskCustodyReview(f.sources, f.job, f.gate),
  );
  expect(d.status).toBe('NOT_ATTEMPTED');
  expect(d.original).toBeNull();
  expect(d.recorded).toBeNull();
  expect(d.available_tasks).toHaveLength(2);
});
it('lost initial acknowledgment stays UNKNOWN without guessing an observed child ID', async () => {
  const f = await fixture(),
    r = await correction(f),
    native = f.sources.estimates.recordTime.bind(f.sources.estimates);
  const writer = vi
    .spyOn(f.sources.estimates, 'recordTime')
    .mockImplementation(async (...args) => {
      await native(...args);
      throw Error('Lost ACK');
    });
  await expect(
    saveTaskCorrectionReview(r.review, r.input, true),
  ).rejects.toThrow();
  writer.mockRestore();
  const retry = vi.spyOn(f.sources.estimates, 'recordTime'),
    d = inspectTaskCustodyReview(
      await readTaskCustodyReview(f.sources, f.job, f.gate),
    );
  expect(d.status).toBe('HELD_UNKNOWN');
  expect(d.receipt.observed).toBe('SOURCE_CHANGED_UNATTRIBUTED');
  expect(d.recorded).toBeNull();
  expect(d.available_tasks.some((t) => t.corrects_id === f.id)).toBe(true);
  expect(d.receipt.result_id).toBeNull();
  expect(retry).not.toHaveBeenCalled();
});
it('lost final acknowledgment retains UNKNOWN despite exact approved result observation', async () => {
  const f = await fixture(),
    r = await correction(f),
    native = f.sources.estimates.reviewTime.bind(f.sources.estimates);
  const writer = vi
    .spyOn(f.sources.estimates, 'reviewTime')
    .mockImplementation(async (...args) => {
      await native(...args);
      throw Error('Lost review ACK');
    });
  await expect(
    saveTaskCorrectionReview(r.review, r.input, true),
  ).rejects.toThrow();
  writer.mockRestore();
  const d = inspectTaskCustodyReview(
    await readTaskCustodyReview(f.sources, f.job, f.gate),
  );
  expect(d.receipt.observed).toBe('EXACT_RESULT_OBSERVED');
  expect(d.status).toBe('HELD_UNKNOWN');
  expect(d.recorded?.corrects_id).toBe(f.id);
  await expect(
    saveTaskCorrectionReview(r.review, r.input, true),
  ).rejects.toThrow();
});
it('pre-boundary failure leaves UNKNOWN and absence never becomes failed execution', async () => {
  const f = await fixture(),
    r = await correction(f);
  vi.spyOn(f.sources.estimates, 'recordTime').mockRejectedValue(
    Error('No ACK'),
  );
  await expect(
    saveTaskCorrectionReview(r.review, r.input, true),
  ).rejects.toThrow();
  const d = inspectTaskCustodyReview(
    await readTaskCustodyReview(f.sources, f.job, f.gate),
  );
  expect(d.status).toBe('HELD_UNKNOWN');
  expect(d.recorded_evidence).toBe('UNAVAILABLE');
  expect(d.replay).toBe('FORBIDDEN');
});
it('concurrent original actions and repeated custody reads do not create a second correction', async () => {
  const f = await fixture(),
    r = await correction(f),
    writer = vi.spyOn(f.sources.estimates, 'recordTime');
  const outcomes = await Promise.allSettled([
    saveTaskCorrectionReview(r.review, r.input, true),
    saveTaskCorrectionReview(r.review, r.input, true),
  ]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  const reads = await Promise.all([
    readTaskCustodyReview(f.sources, f.job, f.gate),
    readTaskCustodyReview(f.sources, f.job, f.gate),
  ]);
  expect(reads[0].evidence.receipt).toEqual(reads[1].evidence.receipt);
  expect(writer).toHaveBeenCalledTimes(1);
});
it('canonical change withholds stale custody facts and destination', async () => {
  const f = await fixture(),
    before = await readTaskCustodyReview(f.sources, f.job, f.gate),
    r = await correction(f);
  await saveTaskCorrectionReview(r.review, r.input, true);
  expect(() => inspectTaskCustodyReview(before)).toThrow();
  expect(() => taskCustodyDestination(before)).toThrow();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
  'job_id',
] as const)(
  'identity %s mismatch never substitutes a current task',
  async (key) => {
    const f = await fixture(),
      snapshot = await readTaskCustodyReview(f.sources, f.job, f.gate);
    f.entry.target[key] =
      key === 'organization_id' ? sampleCompanies[1].id : crypto.randomUUID();
    expect(() => inspectTaskCustodyReview(snapshot)).toThrow();
    await expect(
      readTaskCustodyReview(f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each(['inactive', 'demoted'] as const)(
  'current %s membership withholds captured task details',
  async (mode) => {
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
    const snapshot = await readTaskCustodyReview(f.sources, f.job, f.gate);
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    expect(() => inspectTaskCustodyReview(snapshot)).toThrow();
  },
);
it.each(['gate', 'selector', 'source'] as const)(
  'final hash await checks live %s without returning stale evidence',
  async (mode) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      if (!changed) {
        changed = true;
        if (mode === 'gate') f.gate.enabled = false;
        if (mode === 'selector')
          f.entry.target.location_id = crypto.randomUUID();
        if (mode === 'source') {
          const p = f.sources.property
            .read(f.org)
            .plans.find((x) => x.id === f.entry.plan_id)!;
          f.sources.property.savePlan(f.org, { ...p, name: 'Concurrent plan' });
        }
      }
      return result;
    });
    await expect(
      readTaskCustodyReview(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('another job with similar task wording is never selected as a correction', async () => {
  const f = await fixture(),
    other = f.all.entries[1];
  const d = inspectTaskCustodyReview(
    await readTaskCustodyReview(f.all, other.target.job_id!, f.gate),
  );
  expect(d.available_tasks.some((t) => t.id === f.id)).toBe(false);
  expect(d.original).toBeNull();
});
it('private rates, supplier costs, payroll and review reasons are excluded by allowlist', async () => {
  const f = await fixture(),
    d = inspectTaskCustodyReview(
      await readTaskCustodyReview(f.sources, f.job, f.gate),
    );
  expect(JSON.stringify(d)).not.toMatch(
    /PRIVATE|cash_minor|cash_hour|burden|supplier|unit_cost|salary|deduction/,
  );
  expect(Object.keys(d.available_tasks[0])).toEqual([
    'id',
    'job_id',
    'worker_id',
    'corrects_id',
    'task',
    'kind',
    'started_at',
    'ended_at',
    'billable',
    'submitted',
    'review',
  ]);
});
it('OFF rejects before source getters and renders no workflow controls', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(readTaskCustodyReview(sources, 'untrusted')).rejects.toThrow();
  expect(
    renderToStaticMarkup(
      createElement(TaskCustodyReview, {
        sources,
        enabled: false,
        selectedJobId: 'untrusted',
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:'])(
  'protocol %s keeps browser review closed',
  async (protocol) => {
    const f = await fixture();
    vi.stubGlobal('window', { location: { hostname: '127.0.0.1', protocol } });
    expect(
      renderToStaticMarkup(
        createElement(TaskCustodyReview, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      ),
    ).toBe('');
  },
);
it.each([0, 1, 2])(
  'brand %i retains original correction controls and accessible labelled review',
  async (brand) => {
    const f = await fixture(brand),
      html = renderToStaticMarkup(
        createElement(TaskCustodyReview, {
          sources: f.sources,
          enabled: true,
          selectedJobId: f.job,
        }),
      );
    expect(html).toContain('Task custody and correction comparison');
    expect(html).toContain('Read exact task custody');
    expect(html).toContain('Original task correction controls');
    expect(html).toContain('Load current approved task');
    expect(html).toContain('aria-live="polite"');
  },
);
