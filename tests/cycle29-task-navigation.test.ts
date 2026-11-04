import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { TaskReceiptActions } from '../src/components/workflows/TaskReceiptActions';
import {
  readTaskCorrectionReview,
  saveTaskCorrectionReview,
} from '../src/lib/workflows/task-correction-review';
import {
  readTaskReceiptContinuity,
  inspectTaskReceiptTask,
  inspectTaskReceiptContinuity,
  taskReceiptControlsDestination,
} from '../src/lib/workflows/task-receipt-reconciliation';
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
    task: 'Exact existing closed task',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Exact native task required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(org, id, 'approved', 'Private review');
  const review = await readTaskCorrectionReview(sources, job, gate, id),
    input = {
      source_entry_id: id,
      task: 'Staff confirmed correction',
      started_at: review.source.started_at,
      ended_at: review.source.ended_at,
      billable: true,
    };
  return { gate, sources, entry, org, job, id, review, input };
}
type F = Awaited<ReturnType<typeof fixture>>;
type C = Awaited<ReturnType<typeof readTaskReceiptContinuity>>;
function markup(f: F, continuity: C, id: string) {
  ui.index = 0;
  ui.seeds = new Map<number, unknown>([
    [1, continuity],
    [2, id],
  ]);
  return renderToStaticMarkup(
    createElement(TaskReceiptActions, {
      sources: f.sources,
      selectedJobId: f.job,
      enabled: true,
      onContinue: async () => {},
    }),
  );
}
const button = (html: string) =>
  html.match(
    /<button[^>]*>Open original task correction controls<\/button>/,
  )?.[0];
it.each([0, 1, 2])(
  'brand %i an unattempted exact eligible source keeps explicit original-control navigation',
  async (brand) => {
    const f = await fixture(brand),
      continuity = await readTaskReceiptContinuity(f.sources, f.job, f.gate);
    expect(
      inspectTaskReceiptTask(continuity, f.id).correction_requirement,
    ).toBe('VERIFY_ORIGINAL_SOURCE');
    expect(button(markup(f, continuity, f.id))).not.toContain('disabled');
    expect(await taskReceiptControlsDestination(continuity, f.id)).toEqual({
      job_id: f.job,
      step: 'field',
      source_entry_id: f.id,
      meaning: 'OPEN_ORIGINAL_CONTROLS_ONLY',
    });
  },
);
it.each([0, 1, 2])(
  'brand %i acknowledged approved result keeps spent custody and denies the misleading open action',
  async (brand) => {
    const f = await fixture(brand);
    await saveTaskCorrectionReview(f.review, f.input, true);
    const continuity = await readTaskReceiptContinuity(
        f.sources,
        f.job,
        f.gate,
      ),
      result = inspectTaskReceiptContinuity(continuity).receipt.result_id!;
    expect(
      inspectTaskReceiptTask(continuity, result).correction_requirement,
    ).toBe('ORIGINAL_CUSTODY_HELD');
    await expect(
      taskReceiptControlsDestination(continuity, result),
    ).rejects.toThrow();
    expect(button(markup(f, continuity, result))).toContain('disabled');
  },
);
it.each([0, 1, 2])(
  'brand %i lost original ACK retains UNKNOWN and read-only verification without offering replay navigation',
  async (brand) => {
    const f = await fixture(brand);
    vi.spyOn(f.sources.estimates, 'recordTime').mockRejectedValueOnce(
      Error('Lost ACK'),
    );
    await expect(
      saveTaskCorrectionReview(f.review, f.input, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    const write = vi.spyOn(f.sources.estimates, 'recordTime'),
      continuity = await readTaskReceiptContinuity(f.sources, f.job, f.gate),
      html = markup(f, continuity, f.id);
    expect(inspectTaskReceiptTask(continuity, f.id).custody).toBe('UNKNOWN');
    expect(button(html)).toContain('disabled');
    expect(html).toContain('Verify original task source');
    await expect(
      taskReceiptControlsDestination(continuity, f.id),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %i superseded original task cannot offer correction-control navigation',
  async (brand) => {
    const f = await fixture(brand);
    await saveTaskCorrectionReview(f.review, f.input, true);
    const continuity = await readTaskReceiptContinuity(
      f.sources,
      f.job,
      f.gate,
    );
    expect(
      inspectTaskReceiptTask(continuity, f.id).correction_requirement,
    ).toBe('NATIVE_SOURCE_NOT_ELIGIBLE');
    expect(button(markup(f, continuity, f.id))).toContain('disabled');
    await expect(
      taskReceiptControlsDestination(continuity, f.id),
    ).rejects.toThrow();
  },
);
