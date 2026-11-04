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
import { MaintenanceCancellationActions } from '../src/components/workflows/MaintenanceCancellationActions';
import {
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
  reconcilePlanCancellationReview,
  preparePlanCancellationReview,
} from '../src/lib/workflows/plan-cancellation-review';
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
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    review = await readPlanCancellationReview(
      sources,
      job,
      'recurring_maintenance',
      gate,
    ),
    key = review.desk.rows[0].key,
    selected = await selectPlanCancellationOccurrence(review, key);
  return { sources, job, review, key, selected };
}
type F = Awaited<ReturnType<typeof fixture>>;
function markup(f: F, date: string) {
  ui.index = 0;
  ui.seeds = new Map<number, unknown>([
    [2, f.review],
    [3, f.selected],
    [4, f.key],
    [5, date],
    [7, true],
    [9, true],
  ]);
  return renderToStaticMarkup(
    createElement(MaintenanceCancellationActions, {
      sources: f.sources,
      selectedJobId: f.job,
      enabled: true,
    }),
  );
}
const prepareButton = (html: string) =>
  html.match(/<button[^>]*>Prepare blocked staff review<\/button>/)?.[0];
it.each([0, 1, 2])(
  'brand %i empty proposed date cannot consume or strand original staff-review custody',
  async (brand) => {
    const f = await fixture(brand),
      html = markup(f, '');
    expect(prepareButton(html)).toContain('disabled');
    expect(html).toContain(
      'Enter a valid staff review date before preparation',
    );
    expect(html).not.toMatch(/<input[^>]*type="date"[^>]*disabled/);
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'READY_FOR_REQUIREMENTS',
    );
  },
);
it.each([0, 1, 2])(
  'brand %i corrected valid date remains eligible for the original blocked review only',
  async (brand) => {
    const f = await fixture(brand),
      date = f.selected.selection.occurrence.recorded_due_on,
      html = markup(f, date);
    expect(prepareButton(html)).not.toContain('disabled');
    const native = await preparePlanCancellationReview(
      f.selected,
      { proposed_on: date, plan_kind: 'follow_up' },
      true,
    );
    expect(native.proposed_on).toBe(date);
    expect(native.operational_authority).toBe('BLOCKED');
    expect(
      Object.values(native.authority).every((value) => value === false),
    ).toBe(true);
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'BLOCKED_LOCAL_REVIEW',
    );
  },
);
it.each(['2026-02-30', 'invalid-date'])(
  'canonical invalid date %s is not presented as an admissible staff review',
  async (date) => {
    const f = await fixture(0),
      html = markup(f, date);
    expect(prepareButton(html)).toContain('disabled');
    expect(html).toContain(
      'Enter a valid staff review date before preparation',
    );
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'READY_FOR_REQUIREMENTS',
    );
  },
);
