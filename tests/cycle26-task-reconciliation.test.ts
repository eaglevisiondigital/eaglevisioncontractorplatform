import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readTaskReceiptContinuity,
  rereadTaskReceiptContinuity,
  inspectTaskReceiptTask,
  inspectTaskReceiptContinuity,
  verifyTaskReceiptCorrectionSource,
  taskReceiptControlsDestination,
} from '../src/lib/workflows/task-receipt-reconciliation';
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
    org = sources.company.id,
    job = entry.target.job_id!;
  const id = await sources.estimates.recordTime(org, entry.worker_id, {
    job_id: job,
    overhead_center: null,
    task: 'Exact original technician task',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Native ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(org, id, 'approved', 'PRIVATE review');
  const original = await readTaskCorrectionReview(sources, job, gate, id),
    input = {
      source_entry_id: id,
      task: 'Explicit corrected technician task',
      started_at: original.source.started_at,
      ended_at: original.source.ended_at,
      billable: true,
    };
  return { gate, all, entry, sources, org, job, id, original, input };
}
it.each([0, 1, 2])(
  'brand %i recorded result never suggests original correction eligibility after the original attempt was spent',
  async (brand) => {
    const f = await fixture(brand);
    await saveTaskCorrectionReview(f.original, f.input, true);
    const c = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      receipt = inspectTaskReceiptContinuity(c).receipt,
      result = inspectTaskReceiptTask(c, receipt.result_id!);
    expect(result.custody).toBe('KNOWN_SAVED');
    expect(result.correction_requirement).toBe('ORIGINAL_CUSTODY_HELD');
    await expect(
      taskReceiptControlsDestination(c, result.task.id),
    ).rejects.toThrow();
  },
);

it.each([0, 1, 2])(
  'brand %i explicit reread preserves exact original then result identity through actual source changes',
  async (brand) => {
    const f = await fixture(brand),
      before = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    expect(inspectTaskReceiptTask(before, f.id).receipt_role).toBe(
      'NOT_ATTRIBUTED_TO_RECEIPT',
    );
    await saveTaskCorrectionReview(f.original, f.input, true);
    const after = await rereadTaskReceiptContinuity(
        before,
        f.sources,
        f.job,
        f.gate,
      ),
      receipt = inspectTaskReceiptContinuity(after).receipt;
    expect(inspectTaskReceiptTask(after, f.id).receipt_role).toBe(
      'EXACT_RECEIPT_SOURCE',
    );
    expect(inspectTaskReceiptTask(after, receipt.result_id!).receipt_role).toBe(
      'EXACT_RECEIPT_RESULT',
    );
    const again = await rereadTaskReceiptContinuity(
      after,
      f.sources,
      f.job,
      f.gate,
    );
    expect(inspectTaskReceiptTask(again, receipt.result_id!).task.id).toBe(
      receipt.result_id,
    );
    expect(inspectTaskReceiptTask(again, f.id).task.id).toBe(f.id);
  },
);
it.each([0, 1, 2])(
  'brand %i mutable plan revision can be explicitly reread without reviving the old view or resetting source custody',
  async (brand) => {
    const f = await fixture(brand),
      old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      p = f.sources.property
        .read(f.org)
        .plans.find((p) => p.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...p,
      name: 'Explicit native plan change',
    });
    expect(() => inspectTaskReceiptTask(old, f.id)).toThrow();
    const next = await rereadTaskReceiptContinuity(
      old,
      f.sources,
      f.job,
      f.gate,
    );
    expect(inspectTaskReceiptTask(next, f.id).task.id).toBe(f.id);
    expect(() => inspectTaskReceiptTask(old, f.id)).toThrow();
    expect((await verifyTaskReceiptCorrectionSource(next, f.id)).can_edit).toBe(
      true,
    );
  },
);
it.each(['before', 'after'] as const)(
  'lost record ACK %s remains UNKNOWN through repeated exact source rereads',
  async (mode) => {
    const f = await fixture(),
      old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      native = f.sources.estimates.recordTime.bind(f.sources.estimates);
    vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
      async (...args) => {
        if (mode === 'after') await native(...args);
        throw Error('Lost record acknowledgment');
      },
    );
    await expect(
      saveTaskCorrectionReview(f.original, f.input, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      next = await rereadTaskReceiptContinuity(old, f.sources, f.job, f.gate),
      again = await rereadTaskReceiptContinuity(next, f.sources, f.job, f.gate),
      data = inspectTaskReceiptTask(again, f.id);
    expect(data.custody).toBe('UNKNOWN');
    expect(data.acknowledged_result_id).toBeNull();
    expect(data.correction_requirement).toBe(
      mode === 'before'
        ? 'ORIGINAL_CUSTODY_HELD'
        : 'NATIVE_SOURCE_NOT_ELIGIBLE',
    );
    await expect(taskReceiptControlsDestination(again, f.id)).rejects.toThrow();
    await expect(
      saveTaskCorrectionReview(f.original, f.input, true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it('missing acknowledged result evidence never substitutes a different newest entry', async () => {
  const f = await fixture();
  await saveTaskCorrectionReview(f.original, f.input, true);
  const old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    result = inspectTaskReceiptContinuity(old).receipt.result_id!,
    native = f.sources.estimates.readSyntheticPrototypeSources.bind(
      f.sources.estimates,
    );
  vi.spyOn(
    f.sources.estimates,
    'readSyntheticPrototypeSources',
  ).mockImplementation((target) => {
    const observed = native(target);
    observed.workforce.entries = observed.workforce.entries.filter(
      (row) => row.id !== result,
    );
    return observed;
  });
  const current = await rereadTaskReceiptContinuity(
    old,
    f.sources,
    f.job,
    f.gate,
  );
  expect(inspectTaskReceiptContinuity(current).receipt.result_id).toBe(result);
  expect(() => inspectTaskReceiptTask(current, result)).toThrow();
  expect(inspectTaskReceiptContinuity(current).receipt.classification).toBe(
    'ACKNOWLEDGED_RESULT_UNAVAILABLE',
  );
});
it.each(['inactive', 'demoted'] as const)(
  'current %s staff cannot turn stale source reread into renewed access',
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
    const old = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    await expect(
      rereadTaskReceiptContinuity(old, f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each(['customer_id', 'location_id', 'version_id'] as const)(
  'reread never substitutes immutable %s despite same selected job',
  async (key) => {
    const f = await fixture(),
      old = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    f.entry.target[key] = crypto.randomUUID();
    await expect(
      rereadTaskReceiptContinuity(old, f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it('wrong or foreign job reread cannot substitute a sibling source', async () => {
  const f = await fixture(),
    old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    foreign = await fixture(1);
  await expect(
    rereadTaskReceiptContinuity(
      old,
      foreign.sources,
      foreign.job,
      foreign.gate,
    ),
  ).rejects.toThrow();
  await expect(
    rereadTaskReceiptContinuity(
      old,
      f.sources,
      f.all.entries[1].target.job_id!,
      f.gate,
    ),
  ).rejects.toThrow();
});
it('source gates withdrawn at native workforce await block explicit reread', async () => {
  const f = await fixture(),
    old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    native = f.sources.estimates.workforce.bind(f.sources.estimates);
  vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
    async (...args) => {
      const result = await native(...args);
      f.gate.enabled = false;
      return result;
    },
  );
  await expect(
    rereadTaskReceiptContinuity(old, f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it('concurrent exact rereads do not add a correction command or renew a spent attempt', async () => {
  const f = await fixture();
  await saveTaskCorrectionReview(f.original, f.input, true);
  const old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    writer = vi.spyOn(f.sources.estimates, 'recordTime'),
    readers = await Promise.all([
      rereadTaskReceiptContinuity(old, f.sources, f.job, f.gate),
      rereadTaskReceiptContinuity(old, f.sources, f.job, f.gate),
    ]);
  for (const current of readers) {
    const id = inspectTaskReceiptContinuity(current).receipt.result_id!;
    expect(inspectTaskReceiptTask(current, id).correction_requirement).toBe(
      'ORIGINAL_CUSTODY_HELD',
    );
    await expect(taskReceiptControlsDestination(current, id)).rejects.toThrow();
  }
  expect(writer).not.toHaveBeenCalled();
});
it('default-OFF reread rejects executable source getters before the new source projection', async () => {
  const f = await fixture(),
    old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    rereadTaskReceiptContinuity(old, sources, f.job),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});

it('untrusted nested receipt getters are rejected before execution during reread', async () => {
  const f = await fixture(),
    old = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    getter = vi.fn(),
    receipt = Object.create(null);
  Object.defineProperty(receipt, 'view', { get: getter, enumerable: true });
  Object.defineProperty(receipt, 'receipt', {
    value: old.receipt.receipt,
    enumerable: true,
  });
  await expect(
    rereadTaskReceiptContinuity({ ...old, receipt }, f.sources, f.job, f.gate),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
