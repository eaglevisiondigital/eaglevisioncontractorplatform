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
  preparePlanCancellationReview,
  closePlanCancellationReview,
  reconcilePlanCancellationReview,
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
    org = sources.company.id,
    actor = org + '-estimator',
    job = entry.target.job_id!;
  await sources.operations.manageMember(
    org,
    actor,
    true,
    'admin',
    'office_manager',
  );
  entry.target.actor_id = actor;
  const review = await readPlanCancellationReview(
      sources,
      job,
      'recurring_maintenance',
      gate,
    ),
    key = review.desk.rows[0].key,
    selected = await selectPlanCancellationOccurrence(review, key);
  return { sources, org, actor, job, review, key, selected };
}
type F = Awaited<ReturnType<typeof fixture>>;
function markup(f: F, attempted = false, terminal = false) {
  ui.index = 0;
  ui.seeds = new Map<number, unknown>([
    [2, f.review],
    [3, f.selected],
    [4, f.key],
    [5, '2026-11-19'],
    [7, true],
    [9, true],
    [10, attempted],
    [11, terminal],
  ]);
  return renderToStaticMarkup(
    createElement(MaintenanceCancellationActions, {
      sources: f.sources,
      selectedJobId: f.job,
      enabled: true,
    }),
  );
}

it.each([0, 1, 2])(
  'brand %i staff can explicitly correct occurrence or purpose before any original admission',
  async (brand) => {
    const f = await fixture(brand),
      html = markup(f);
    expect(html).toMatch(/<select[^>]*>[^]*?service_follow_up/);
    expect(html).not.toMatch(/<select[^>]*disabled=""/);
  },
);
it.each(['PREPARED', 'CANCEL', 'REVOKE', 'UNKNOWN'] as const)(
  'selection corrections cannot replace original %s custody',
  async (state) => {
    const f = await fixture(0),
      proposal = {
        proposed_on: f.review.desk.rows[0].recorded_due_on,
        plan_kind: 'follow_up' as const,
      };
    if (state === 'UNKNOWN')
      vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
        Error('Lost original preparation ACK'),
      );
    if (state === 'UNKNOWN')
      await expect(
        preparePlanCancellationReview(f.selected, proposal, true),
      ).rejects.toThrow();
    else await preparePlanCancellationReview(f.selected, proposal, true);
    vi.restoreAllMocks();
    if (state === 'CANCEL' || state === 'REVOKE')
      await closePlanCancellationReview(f.selected, state, true);
    const before = await reconcilePlanCancellationReview(f.selected),
      html = markup(f, true, state === 'CANCEL' || state === 'REVOKE');
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Read staff cancellation sources<\/button>/,
    );
    const other = await selectPlanCancellationOccurrence(f.review, f.key);
    await expect(
      preparePlanCancellationReview(
        other,
        { ...proposal, plan_kind: 'renewal' },
        true,
      ),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      before.status,
    );
  },
);
it('competing explicit unattempted selections retain only one original preparation admission', async () => {
  const f = await fixture(0),
    other = await selectPlanCancellationOccurrence(f.review, f.key),
    proposal = {
      proposed_on: f.review.desk.rows[0].recorded_due_on,
      plan_kind: 'follow_up' as const,
    };
  const outcomes = await Promise.allSettled(
    [f.selected, other].map((s) =>
      preparePlanCancellationReview(s, proposal, true),
    ),
  );
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
