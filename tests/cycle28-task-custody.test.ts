import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskReceiptActions } from '../src/components/workflows/TaskReceiptActions';
import * as originalExercise from '../src/lib/workflows/saved-revision-exercise';
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
} from '../src/lib/workflows/task-receipt-reconciliation';
const ui = vi.hoisted(() => ({ index: 0, seeds: new Map<number, unknown>() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      const i = ui.index++;
      return actual.useState(ui.seeds.has(i) ? ui.seeds.get(i) : initial);
    }) as typeof actual.useState,
  };
});
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  ui.index = 0;
  ui.seeds.clear();
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
  'brand %i mixed original receipt and graph custody after a lost native ACK is rejected',
  async (brand) => {
    const f = await fixture(brand),
      native = originalExercise.reconcileSavedTaskReceipt;
    vi.spyOn(
      originalExercise,
      'reconcileSavedTaskReceipt',
    ).mockImplementationOnce(async (view) => {
      const before = await native(view);
      vi.spyOn(f.sources.estimates, 'recordTime').mockRejectedValueOnce(
        Error('Lost concurrent native correction ACK'),
      );
      await expect(
        saveTaskCorrectionReview(f.original, f.input, true),
      ).rejects.toThrow();
      return before;
    });
    await expect(
      readTaskReceiptContinuity(f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i an unavailable previously selected task does not hide a valid current picker or substitute another ID',
  async (brand) => {
    const f = await fixture(brand),
      native = f.sources.estimates.readSyntheticPrototypeSources.bind(
        f.sources.estimates,
      );
    const other = await f.sources.estimates.recordTime(
      f.org,
      f.entry.worker_id,
      {
        job_id: f.job,
        overhead_center: null,
        task: 'Other actual task',
        kind: 'work',
        started_at: '2026-10-01T10:00:00Z',
        ended_at: '2026-10-01T11:00:00Z',
        billable: false,
        corrects_id: null,
      },
    );
    if (typeof other !== 'string') throw Error('Native task ID required');
    const before = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    expect(inspectTaskReceiptTask(before, f.id).task.id).toBe(f.id);
    // Controlled absence at the ORIGINAL reader; approved rows have no native delete API.
    vi.spyOn(
      f.sources.estimates,
      'readSyntheticPrototypeSources',
    ).mockImplementation((...args) => {
      const current = native(...args);
      current.workforce.entries = current.workforce.entries.filter(
        (row) => row.id !== f.id,
      );
      return current;
    });
    const continuity = await readTaskReceiptContinuity(
      f.sources,
      f.job,
      f.gate,
    );
    ui.index = 0;
    ui.seeds = new Map<number, unknown>([
      [1, continuity],
      [2, f.id],
    ]);
    const html = renderToStaticMarkup(
      createElement(TaskReceiptActions, {
        sources: f.sources,
        enabled: true,
        selectedJobId: f.job,
      }),
    );
    expect(html).toContain('Unavailable exact task');
    expect(html).toContain(f.id);
    expect(html).toContain(other);
    expect(html).not.toContain('Verify original task source');
  },
);
it.each([0, 1, 2])(
  'brand %i rejected mixed custody allows only a fresh exact UNKNOWN read and never another correction',
  async (brand) => {
    const f = await fixture(brand),
      native = originalExercise.reconcileSavedTaskReceipt;
    vi.spyOn(
      originalExercise,
      'reconcileSavedTaskReceipt',
    ).mockImplementationOnce(async (view) => {
      const before = await native(view);
      vi.spyOn(f.sources.estimates, 'recordTime').mockRejectedValueOnce(
        Error('Lost original ACK'),
      );
      await expect(
        saveTaskCorrectionReview(f.original, f.input, true),
      ).rejects.toThrow();
      return before;
    });
    await expect(
      readTaskReceiptContinuity(f.sources, f.job, f.gate),
    ).rejects.toThrow();
    const fresh = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      selected = inspectTaskReceiptTask(fresh, f.id);
    expect(selected.custody).toBe('UNKNOWN');
    expect(selected.correction_requirement).toBe('ORIGINAL_CUSTODY_HELD');
    expect(
      (await verifyTaskReceiptCorrectionSource(fresh, f.id)).can_edit,
    ).toBe(false);
    await expect(
      saveTaskCorrectionReview(f.original, f.input, true),
    ).rejects.toThrow();
    expect(
      f.sources.estimates
        .readSyntheticPrototypeSources(f.entry.target)
        .workforce.entries.filter((r) => r.job_id === f.job),
    ).toHaveLength(1);
  },
);
it('receipt accessor cannot execute while testing original custody consistency', async () => {
  const f = await fixture(),
    review = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
    getter = vi.fn(),
    receipt = { ...review.receipt.receipt };
  Object.defineProperty(receipt, 'state', { get: getter });
  expect(() =>
    inspectTaskReceiptContinuity({
      ...review,
      receipt: { ...review.receipt, receipt },
    }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
