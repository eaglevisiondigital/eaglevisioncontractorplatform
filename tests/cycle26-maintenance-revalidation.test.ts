import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const retainedUI = vi.hoisted(() => ({
  enabled: false,
  index: 0,
  seeds: new Map<number, unknown>(),
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      const index = retainedUI.index++;
      return actual.useState(
        retainedUI.enabled && retainedUI.seeds.has(index)
          ? retainedUI.seeds.get(index)
          : initial,
      );
    }) as typeof actual.useState,
  };
});
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPlanCancellationReview,
  rereadPlanCancellationReview,
  planCancellationOccurrenceFacts,
  selectPlanCancellationOccurrence,
  verifyPlanCancellationRequirements,
  preparePlanCancellationReview,
  closePlanCancellationReview,
  reconcilePlanCancellationReview,
} from '../src/lib/workflows/plan-cancellation-review';
import { MaintenanceCancellationActions } from '../src/components/workflows/MaintenanceCancellationActions';
beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  retainedUI.enabled = false;
  retainedUI.index = 0;
  retainedUI.seeds.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!,
    review = await readPlanCancellationReview(
      sources,
      job,
      'recurring_maintenance',
      gate,
    ),
    key = review.desk.rows[0].key,
    selected = await selectPlanCancellationOccurrence(review, key),
    proposal = {
      proposed_on: review.desk.rows[0].recorded_due_on,
      plan_kind: 'follow_up' as const,
    };
  return {
    gate,
    all,
    entry,
    sources,
    org,
    job,
    review,
    key,
    selected,
    proposal,
  };
}
type F = Awaited<ReturnType<typeof fixture>>;
function retainedMarkup(f: F, prepared = false) {
  retainedUI.enabled = true;
  retainedUI.index = 0;
  retainedUI.seeds = new Map<number, unknown>([
    [2, f.review],
    [3, f.selected],
    [4, f.key],
    [5, f.proposal.proposed_on],
    [7, true],
    [8, prepared],
    [9, true],
    [10, prepared],
  ]);
  return renderToStaticMarkup(
    createElement(MaintenanceCancellationActions, {
      sources: f.sources,
      enabled: true,
      selectedJobId: f.job,
    }),
  );
}
it.each(
  [0, 1, 2].flatMap((brand) =>
    ['unattempted', 'prepared'].map((mode) => ({ brand, mode })),
  ),
)(
  'brand $brand $mode stale native plan immediately withholds retained confirmation and all staff-review actions',
  async ({ brand, mode }) => {
    const f = await fixture(brand);
    await verifyPlanCancellationRequirements(f.selected);
    if (mode === 'prepared')
      await preparePlanCancellationReview(f.selected, f.proposal, true);
    const p = f.sources.property
      .read(f.org)
      .plans.find((p) => p.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...p,
      name: 'Actual changed native revision',
    });
    const html = retainedMarkup(f, mode === 'prepared');
    for (const text of [
      'Prepare blocked staff review',
      'Cancel this staff review',
      'Revoke this staff review',
    ])
      expect(html).toMatch(
        new RegExp('<button[^>]*disabled=""[^>]*>' + text + '</button>'),
      );
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(html).toContain('Exact maintenance source or staff access changed');
  },
);

it.each([0, 1, 2])(
  'brand %i explicit reread retains exact occurrence purpose and observes current native revision',
  async (brand) => {
    const f = await fixture(brand),
      p = f.sources.property
        .read(f.org)
        .plans.find((p) => p.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...p,
      name: 'Actual saved maintenance revision',
    });
    const next = await rereadPlanCancellationReview(
        f.review,
        f.sources,
        f.job,
        f.gate,
      ),
      selected = await selectPlanCancellationOccurrence(next, f.key),
      facts = planCancellationOccurrenceFacts(selected);
    expect(next.purpose).toBe('recurring_maintenance');
    expect(facts.occurrence_key).toBe(f.key);
    expect(facts.plan.revision).toBe(p.revision + 1);
    expect(facts.requested_purpose).toBe(f.review.purpose);
    expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
    expect((await verifyPlanCancellationRequirements(selected)).status).toBe(
      'CURRENT_REQUIREMENTS_CAPTURED_NOT_ATOMIC',
    );
  },
);
it.each([0, 1, 2])(
  'brand %i current channel withdrawal withholds old UI confirmation and fresh source remains nonauthorizing',
  async (brand) => {
    const f = await fixture(brand);
    await verifyPlanCancellationRequirements(f.selected);
    await f.sources.operations.recordConsent(
      f.org,
      f.entry.target.customer_id,
      false,
      false,
    );
    const html = retainedMarkup(f);
    expect(html).toContain('Exact maintenance source or staff access changed');
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Prepare blocked staff review<\/button>/,
    );
    retainedUI.enabled = false;
    const next = await rereadPlanCancellationReview(
        f.review,
        f.sources,
        f.job,
        f.gate,
      ),
      selected = await selectPlanCancellationOccurrence(next, f.key),
      facts = planCancellationOccurrenceFacts(selected);
    expect(facts.recorded_channel).toBe('RECORDED_DENIED');
    expect(facts.purpose_consent).toBe('UNVERIFIED');
    expect(facts.send).toBe(false);
    expect(facts.renew).toBe(false);
  },
);
it.each(['inactive', 'demoted'] as const)(
  'current %s staff loses retained confirmation immediately and cannot reread into renewed authority',
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
    f.review = await readPlanCancellationReview(
      f.sources,
      f.job,
      'recurring_maintenance',
      f.gate,
    );
    f.selected = await selectPlanCancellationOccurrence(f.review, f.key);
    await verifyPlanCancellationRequirements(f.selected);
    await f.sources.operations.manageMember(
      f.org,
      actor,
      mode !== 'inactive',
      mode === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    const html = retainedMarkup(f);
    expect(html).toContain('Exact maintenance source or staff access changed');
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    await expect(
      rereadPlanCancellationReview(f.review, f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it('a disappeared exact occurrence does not become the first or newest current source', async () => {
  const f = await fixture(),
    p = f.sources.property
      .read(f.org)
      .plans.find((p) => p.id === f.entry.plan_id)!;
  f.sources.property.savePlan(f.org, { ...p, starts_on: '2027-12-01' });
  const next = await rereadPlanCancellationReview(
    f.review,
    f.sources,
    f.job,
    f.gate,
  );
  expect(next.desk.rows.some((row) => row.key === f.key)).toBe(false);
  await expect(selectPlanCancellationOccurrence(next, f.key)).rejects.toThrow();
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'rereading source after native staff-review %s cannot reset the original terminal claim',
  async (action) => {
    const f = await fixture();
    await preparePlanCancellationReview(f.selected, f.proposal, true);
    await closePlanCancellationReview(f.selected, action, true);
    const before = await reconcilePlanCancellationReview(f.selected),
      next = await rereadPlanCancellationReview(
        f.review,
        f.sources,
        f.job,
        f.gate,
      ),
      selected = await selectPlanCancellationOccurrence(next, f.key);
    await expect(
      preparePlanCancellationReview(
        selected,
        { ...f.proposal, proposed_on: '2027-01-01' },
        true,
      ),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      before.status,
    );
  },
);
it('lost preparation ACK remains UNKNOWN across an exact source reread with no retry or new purpose', async () => {
  const f = await fixture();
  vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
    Error('Lost native prepare ACK'),
  );
  await expect(
    preparePlanCancellationReview(f.selected, f.proposal, true),
  ).rejects.toThrow();
  vi.restoreAllMocks();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
  const next = await rereadPlanCancellationReview(
      f.review,
      f.sources,
      f.job,
      f.gate,
    ),
    selected = await selectPlanCancellationOccurrence(next, f.key);
  expect(next.purpose).toBe('recurring_maintenance');
  await expect(
    preparePlanCancellationReview(selected, f.proposal, true),
  ).rejects.toThrow();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
});
it('concurrent exact source rereads acquire no command claim and original native preparation still has one winner', async () => {
  const f = await fixture(),
    reads = await Promise.all([
      rereadPlanCancellationReview(f.review, f.sources, f.job, f.gate),
      rereadPlanCancellationReview(f.review, f.sources, f.job, f.gate),
    ]),
    selected = await Promise.all(
      reads.map((r) => selectPlanCancellationOccurrence(r, f.key)),
    ),
    outcomes = await Promise.allSettled(
      selected.map((s) => preparePlanCancellationReview(s, f.proposal, true)),
    );
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
it.each(['customer_id', 'location_id', 'version_id', 'job_id'] as const)(
  'immutable %s cannot be rebound through an explicit maintenance reread',
  async (key) => {
    const f = await fixture();
    f.entry.target[key] = crypto.randomUUID();
    await expect(
      rereadPlanCancellationReview(f.review, f.sources, f.job, f.gate),
    ).rejects.toThrow();
  },
);
it('foreign company and sibling job do not substitute current source or purpose', async () => {
  const f = await fixture(),
    other = await fixture(1);
  await expect(
    rereadPlanCancellationReview(
      f.review,
      other.sources,
      other.job,
      other.gate,
    ),
  ).rejects.toThrow();
  await expect(
    rereadPlanCancellationReview(
      f.review,
      f.sources,
      f.all.entries[1].target.job_id!,
      f.gate,
    ),
  ).rejects.toThrow();
});
it('source gate withdrawal at async contact await prevents current maintenance reread', async () => {
  const f = await fixture(),
    native = f.sources.operations.customerHistory.bind(f.sources.operations);
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const result = await native(...args);
      f.gate.enabled = false;
      return result;
    },
  );
  await expect(
    rereadPlanCancellationReview(f.review, f.sources, f.job, f.gate),
  ).rejects.toThrow();
});
it('unconfirmed/default-OFF maintenance reread rejects before executing new source getters', async () => {
  const f = await fixture(),
    getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    rereadPlanCancellationReview(f.review, sources, f.job),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});

it('untrusted nested desk getters never execute during exact maintenance reread', async () => {
  const f = await fixture(),
    getter = vi.fn(),
    desk = Object.create(null);
  Object.defineProperty(desk, 'requested_purpose', {
    get: getter,
    enumerable: true,
  });
  await expect(
    rereadPlanCancellationReview(
      { ...f.review, desk },
      f.sources,
      f.job,
      f.gate,
    ),
  ).rejects.toThrow();
  expect(getter).not.toHaveBeenCalled();
});
