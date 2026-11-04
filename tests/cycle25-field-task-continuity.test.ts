import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readTaskReceiptContinuity,
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
  'brand %i native assigned worker and exact field handoff preserve one job without writes',
  async (brand) => {
    const f = await fixture(brand),
      record = vi.spyOn(f.sources.estimates, 'recordTime'),
      fetcher = vi.spyOn(globalThis, 'fetch'),
      c = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      selected = inspectTaskReceiptTask(c, f.id),
      source = await verifyTaskReceiptCorrectionSource(c, f.id),
      target = await taskReceiptControlsDestination(c, f.id);
    expect(selected.identity).toEqual(f.entry.target);
    expect(selected.assigned_worker.worker_id).toBe(f.entry.worker_id);
    expect(selected.task.id).toBe(f.id);
    expect(selected.receipt_role).toBe('NOT_ATTRIBUTED_TO_RECEIPT');
    expect(selected.correction_requirement).toBe('VERIFY_ORIGINAL_SOURCE');
    expect(selected.durable_receipt).toBe('NOT_IMPLEMENTED');
    expect(selected.availability).toBe('UNKNOWN');
    expect(source.can_edit).toBe(true);
    expect(target).toEqual({
      job_id: f.job,
      step: 'field',
      source_entry_id: f.id,
      meaning: 'OPEN_ORIGINAL_CONTROLS_ONLY',
    });
    expect(record).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(selected)).not.toMatch(
      /PRIVATE|hourly|salary|rate_minor|supplier|margin/,
    );
  },
);
it.each([0, 1, 2])(
  'brand %i saved successor keeps exact original versus result roles and never selects a winner',
  async (brand) => {
    const f = await fixture(brand);
    await saveTaskCorrectionReview(f.original, f.input, true);
    const c = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      r = inspectTaskReceiptContinuity(c).receipt,
      original = inspectTaskReceiptTask(c, f.id),
      result = inspectTaskReceiptTask(c, r.result_id!);
    expect(original.receipt_role).toBe('EXACT_RECEIPT_SOURCE');
    expect(result.receipt_role).toBe('EXACT_RECEIPT_RESULT');
    expect(result.task.corrects_id).toBe(f.id);
    expect(original.correction_requirement).toBe('NATIVE_SOURCE_NOT_ELIGIBLE');
    expect(result.custody).toBe('KNOWN_SAVED');
    await expect(
      taskReceiptControlsDestination(c, result.task.id),
    ).rejects.toThrow();
  },
);
it.each(['missing', 'foreign', 'same-text'] as const)(
  'selection %s never substitutes another task',
  async (mode) => {
    const f = await fixture(),
      c = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    expect(() =>
      inspectTaskReceiptTask(
        c,
        mode === 'same-text' ? 'Exact original technician task' : mode + '-id',
      ),
    ).toThrow();
  },
);
it('native plan CAS invalidates retained task display and handoff', async () => {
  const f = await fixture(),
    c = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    p = f.sources.property
      .read(f.org)
      .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.org, { ...p, name: 'Actual later revision' });
  expect(() => inspectTaskReceiptTask(c, f.id)).toThrow();
  await expect(taskReceiptControlsDestination(c, f.id)).rejects.toThrow();
});
it('a recorded competing task invalidates the retained source, not a new freshest fallback', async () => {
  const f = await fixture(),
    c = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
  await f.sources.estimates.recordTime(f.org, f.entry.worker_id, {
    ...f.input,
    job_id: f.job,
    overhead_center: null,
    kind: 'work',
    corrects_id: f.id,
  });
  expect(() => inspectTaskReceiptTask(c, f.id)).toThrow();
});
it.each(['inactive', 'downgraded'] as const)(
  'current %s staff cannot inspect or open retained sources',
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
    const c = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    expect(() => inspectTaskReceiptTask(c, f.id)).toThrow();
    await expect(taskReceiptControlsDestination(c, f.id)).rejects.toThrow();
  },
);
it('foreign company source is denied before any selected task can escape', async () => {
  const f = await fixture(),
    other = await fixture(1);
  await expect(
    readTaskReceiptContinuity(other.sources, f.job, other.gate),
  ).rejects.toThrow();
});
it('OFF does not execute untrusted source getters', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(readTaskReceiptContinuity(sources, 'unknown')).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('post-await staff revocation blocks explicit eligibility verification', async () => {
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
  const c = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    native = f.sources.estimates.workforce.bind(f.sources.estimates);
  vi.spyOn(f.sources.estimates, 'workforce').mockImplementation(
    async (...args) => {
      const result = await native(...args);
      await f.sources.operations.manageMember(
        f.org,
        actor,
        false,
        'admin',
        'office_manager',
      );
      return result;
    },
  );
  await expect(verifyTaskReceiptCorrectionSource(c, f.id)).rejects.toThrow();
});
it.each(['before', 'after'] as const)(
  'lost native record ACK %s retains UNKNOWN through fresh continuity without replay',
  async (mode) => {
    const f = await fixture(),
      native = f.sources.estimates.recordTime.bind(f.sources.estimates);
    vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
      async (...args) => {
        if (mode === 'after') await native(...args);
        throw Error('Lost ACK');
      },
    );
    await expect(
      saveTaskCorrectionReview(f.original, f.input, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
      c = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      s = inspectTaskReceiptTask(c, f.id);
    expect(s.custody).toBe('UNKNOWN');
    expect(s.acknowledged_result_id).toBeNull();
    await expect(taskReceiptControlsDestination(c, f.id)).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it('two read-only eligibility checks create no claim and original concurrent writers still admit only one correction', async () => {
  const f = await fixture(),
    c = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
  const checks = await Promise.all([
    verifyTaskReceiptCorrectionSource(c, f.id),
    verifyTaskReceiptCorrectionSource(c, f.id),
  ]);
  expect(checks.every((x) => x.can_edit)).toBe(true);
  const writer = vi.spyOn(f.sources.estimates, 'recordTime'),
    outcomes = await Promise.allSettled([
      saveTaskCorrectionReview(f.original, f.input, true),
      saveTaskCorrectionReview(f.original, f.input, true),
    ]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(writer).toHaveBeenCalledTimes(1);
});
it('a forged cross-job continuity composite cannot use independently valid original handles', async () => {
  const f = await fixture(),
    other = await fixture(),
    c = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    d = await readTaskReceiptContinuity(other.sources, other.job, other.gate);
  expect(() =>
    inspectTaskReceiptContinuity({ ...c, order: d.order }),
  ).toThrow();
});
