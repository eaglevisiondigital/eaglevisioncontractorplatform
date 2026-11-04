import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readPlanCancellationReview,
  selectPlanCancellationOccurrence,
  preparePlanCancellationReview,
  reconcilePlanCancellationReview,
} from '../src/lib/workflows/plan-cancellation-review';
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
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    job = entry.target.job_id!,
    review = await readPlanCancellationReview(
      sources,
      job,
      'recurring_maintenance',
      gate,
    ),
    selected = await selectPlanCancellationOccurrence(
      review,
      review.desk.rows[0].key,
    ),
    proposal = { proposed_on: '2027-01-05', plan_kind: 'follow_up' as const };
  return { sources, job, selected, proposal };
}
function substitutingProxy(
  proposal: { proposed_on: string; plan_kind: 'follow_up' },
  field: 'proposed_on' | 'plan_kind',
) {
  let captures = 0;
  return new Proxy(proposal, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === field) {
        captures++;
        return {
          ...descriptor,
          value:
            captures <= 2
              ? proposal[field]
              : field === 'proposed_on'
                ? '2027-02-06'
                : 'renewal',
        };
      }
      return descriptor;
    },
  });
}
it.each(
  [0, 1, 2].flatMap((brand) =>
    (['proposed_on', 'plan_kind'] as const).map(
      (field) => [brand, field] as const,
    ),
  ),
)(
  'brand %i descriptor-proxy %s cannot substitute confirmed facade fields at original review admission',
  async (brand, field) => {
    const f = await fixture(brand),
      proxy = substitutingProxy(f.proposal, field),
      actual = await preparePlanCancellationReview(
        f.selected,
        proxy,
        true,
      ).catch(() => undefined);
    const observed = {
      admitted_date: actual?.proposed_on ?? null,
      admitted_kind: actual?.plan_kind ?? null,
      original_state: (await reconcilePlanCancellationReview(f.selected))
        .status,
    };
    expect(observed, JSON.stringify(observed)).toEqual({
      admitted_date: null,
      admitted_kind: null,
      original_state: 'READY_FOR_REQUIREMENTS',
    });
  },
);
it('a transparent proposal Proxy is rejected before native admission even if its current descriptors agree', async () => {
  const f = await fixture(0);
  await expect(
    preparePlanCancellationReview(f.selected, new Proxy(f.proposal, {}), true),
  ).rejects.toThrow();
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'READY_FOR_REQUIREMENTS',
  );
});
it.each([0, 1, 2])(
  'brand %i rejected Proxy consumes no original hold and one subsequent ordinary confirmed proposal is prepared exactly once',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id));
    await expect(
      preparePlanCancellationReview(
        f.selected,
        substitutingProxy(f.proposal, 'proposed_on'),
        true,
      ),
    ).rejects.toThrow();
    const actual = await preparePlanCancellationReview(
      f.selected,
      f.proposal,
      true,
    );
    expect(actual.proposed_on).toBe(f.proposal.proposed_on);
    expect(actual.plan_kind).toBe(f.proposal.plan_kind);
    expect(actual.original_control.envelope.candidate_key).toBe(
      f.selected.selection.occurrence.key,
    );
    expect(actual.operational_authority).toBe('BLOCKED');
    await expect(
      preparePlanCancellationReview(f.selected, f.proposal, true),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'BLOCKED_LOCAL_REVIEW',
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
  },
);
it('ordinary reverse property order and null prototype remain supported without replacing the original live input', async () => {
  const f = await fixture(0),
    proposal = Object.assign(Object.create(null), {
      plan_kind: 'follow_up',
      proposed_on: '2027-01-05',
    }),
    actual = await preparePlanCancellationReview(f.selected, proposal, true),
    before = JSON.stringify(actual);
  expect(actual.proposed_on).toBe(proposal.proposed_on);
  proposal.proposed_on = '2027-02-06';
  expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
    'UNKNOWN',
  );
  expect(JSON.stringify(actual)).toBe(before);
  await expect(
    preparePlanCancellationReview(
      f.selected,
      { proposed_on: '2027-01-05', plan_kind: 'follow_up' },
      true,
    ),
  ).rejects.toThrow();
});
