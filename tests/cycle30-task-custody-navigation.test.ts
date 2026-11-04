import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import * as originalExercise from '../src/lib/workflows/saved-revision-exercise';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readTaskReceiptContinuity,
  taskReceiptControlsDestination,
  verifyTaskReceiptCorrectionSource,
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
    task: 'Exact original technician task',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Native ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(org, id, 'approved', 'Private review');
  const original = await readTaskCorrectionReview(sources, job, gate, id),
    continuity = await readTaskReceiptContinuity(sources, job, gate),
    input = {
      source_entry_id: id,
      task: 'Explicit native correction',
      started_at: original.source.started_at,
      ended_at: original.source.ended_at,
      billable: true,
    };
  return { gate, sources, org, job, id, original, continuity, input };
}
it.each([0, 1, 2])(
  'brand %i a source eligibility read cannot navigate after another original correction loses its ACK at the final read boundary',
  async (brand) => {
    const f = await fixture(brand),
      native = originalExercise.readSavedTaskCorrection;
    let observedEligible = false;
    vi.spyOn(
      originalExercise,
      'readSavedTaskCorrection',
    ).mockImplementationOnce(async (...args) => {
      const before = await native(...args);
      observedEligible = before.can_edit;
      vi.spyOn(f.sources.estimates, 'recordTime').mockRejectedValueOnce(
        Error('Lost original correction ACK'),
      );
      await expect(
        saveTaskCorrectionReview(f.original, f.input, true),
      ).rejects.toThrow();
      return before;
    });
    await expect(
      taskReceiptControlsDestination(f.continuity, f.id),
    ).rejects.toThrow();
    expect(observedEligible).toBe(true);
    expect(
      originalExercise.inspectSavedSourceExercise(f.continuity.receipt.view)
        .state,
    ).toBe('UNKNOWN');
    const writer = vi.spyOn(f.sources.estimates, 'recordTime').mockClear();
    const fresh = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    expect(
      (await verifyTaskReceiptCorrectionSource(fresh, f.id)).can_edit,
    ).toBe(false);
    await expect(taskReceiptControlsDestination(fresh, f.id)).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
