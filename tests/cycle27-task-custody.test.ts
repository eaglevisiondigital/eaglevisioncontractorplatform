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
  readTaskReceiptContinuity,
  inspectTaskReceiptTask,
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
  const id = await sources.estimates.recordTime(org, entry.worker_id, {
    job_id: job,
    overhead_center: null,
    task: 'Exact original private task',
    kind: 'work',
    started_at: '2026-10-01T08:00:00Z',
    ended_at: '2026-10-01T09:00:00Z',
    billable: false,
    corrects_id: null,
  });
  if (typeof id !== 'string') throw Error('Native ID required');
  await sources.estimates.submitTime(org, id);
  await sources.estimates.reviewTime(org, id, 'approved', 'Private review');
  const continuity = await readTaskReceiptContinuity(sources, job, gate);
  return { sources, org, actor, job, id, continuity };
}
type F = Awaited<ReturnType<typeof fixture>>;
function markup(f: F) {
  ui.index = 0;
  ui.seeds = new Map<number, unknown>([
    [1, f.continuity],
    [2, f.id],
    [
      3,
      'Original field controls retained for task ' +
        f.id +
        '. Select this exact ID in the original form; nothing was saved.',
    ],
    [4, f.continuity.receipt],
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
it.each([0, 1, 2])(
  'brand %i revoked native staff cannot retain exact task IDs in prior status text',
  async (brand) => {
    const f = await fixture(brand);
    expect(markup(f)).toContain(f.id);
    await f.sources.operations.manageMember(
      f.org,
      f.actor,
      false,
      'admin',
      'office_manager',
    );
    expect(() => inspectTaskReceiptTask(f.continuity, f.id)).toThrow();
    expect(markup(f)).not.toContain(f.id);
  },
);
it.each([0, 1, 2])(
  'brand %i demotion removes retained status provenance without implying failed execution',
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
    expect(html).not.toContain(f.id);
    expect(html).toContain('Access unavailable');
    expect(html).toContain('UNKNOWN');
  },
);
it('same authorized staff may retain point-in-time context after native plan changes, but not current eligibility', async () => {
  const f = await fixture(0),
    p = f.sources.property.read(f.org).plans[0];
  f.sources.property.savePlan(f.org, {
    ...p,
    name: 'Actually changed native plan',
  });
  const html = markup(f);
  expect(html).not.toContain('Original field controls retained for task');
  expect(html).toContain('Current task sources changed');
});
it.each(['customer_id', 'location_id', 'version_id'] as const)(
  'render-time receipt access rejects immutable %s rebinding without showing old private status',
  async (key) => {
    const f = await fixture(0);
    f.sources.entries[0].target[key] = crypto.randomUUID();
    const html = markup(f);
    expect(html).not.toContain(f.id);
    expect(html).toContain('Access unavailable');
  },
);
it('default-OFF still withholds even retained presentation state without executing foreign source getters', () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  ui.index = 0;
  ui.seeds.clear();
  expect(
    renderToStaticMarkup(
      createElement(TaskReceiptActions, {
        sources,
        selectedJobId: 'private-job',
        enabled: false,
      }),
    ),
  ).toBe('');
  expect(getter).not.toHaveBeenCalled();
});
