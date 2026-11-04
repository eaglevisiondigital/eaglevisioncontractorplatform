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
  planCancellationOccurrenceFacts,
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
function markup(f: F) {
  ui.index = 0;
  ui.seeds = new Map<number, unknown>([
    [2, f.review],
    [3, f.selected],
    [4, f.key],
    [5, '2026-11-19'],
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
it.each([0, 1, 2])(
  'brand %i revoked native staff cannot retain exact maintenance key or proposed source date',
  async (brand) => {
    const f = await fixture(brand);
    expect(markup(f)).toContain(f.key.replaceAll('"', '&quot;'));
    await f.sources.operations.manageMember(
      f.org,
      f.actor,
      false,
      'admin',
      'office_manager',
    );
    expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
    const html = markup(f);
    expect(html).not.toContain(f.key.replaceAll('"', '&quot;'));
    expect(html).not.toContain('2026-11-19');
  },
);
it.each([0, 1, 2])(
  'brand %i demoted staff cannot retain occurrence reference or date controls',
  async (brand) => {
    const f = await fixture(brand);
    await f.sources.operations.manageMember(
      f.org,
      f.actor,
      true,
      'staff',
      'estimator',
    );
    const html = markup(f);
    expect(html).not.toContain(f.key.replaceAll('"', '&quot;'));
    expect(html).not.toContain('2026-11-19');
    expect(html).toContain('Access unavailable');
  },
);
it('channel revocation with unchanged staff keeps the exact stale source context but clears confirmation', async () => {
  const f = await fixture(0);
  await f.sources.operations.recordConsent(
    f.org,
    f.review.view.identity.customer_id,
    false,
    false,
  );
  const html = markup(f);
  expect(html).toContain(f.key.replaceAll('"', '&quot;'));
  expect(html).toContain('Exact maintenance source or staff access changed');
  expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
});
it.each(['customer_id', 'location_id', 'version_id'] as const)(
  'render-time maintenance access rejects immutable %s rebinding without retaining private occurrence',
  async (key) => {
    const f = await fixture(0);
    f.sources.entries[0].target[key] = crypto.randomUUID();
    const html = markup(f);
    expect(html).not.toContain(f.key.replaceAll('"', '&quot;'));
    expect(html).not.toContain('2026-11-19');
    expect(html).toContain('Access unavailable');
  },
);
it('default-OFF does not inspect foreign source getters or render private controls', () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  ui.index = 0;
  ui.seeds.clear();
  expect(
    renderToStaticMarkup(
      createElement(MaintenanceCancellationActions, {
        sources,
        selectedJobId: 'private-job',
        enabled: false,
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
