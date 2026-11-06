import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  assertPlanCancellationCurrent,
  closePlanCancellationReview,
  planCancellationFacts,
  preparePlanCancellationReview,
  readPlanCancellationReview,
  reconcilePlanCancellationReview,
  selectPlanCancellationOccurrence,
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

async function currentFixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    review = await readPlanCancellationReview(
      sources,
      entry.target.job_id!,
      'recurring_maintenance',
      gate,
    );
  return { gate, sources, entry, org, review };
}

it.each([0, 1, 2])(
  'brand %i: captured maintenance references still deny confirmation withdrawal during own-data capture',
  async (brand) => {
    const f = await currentFixture(brand);
    let captures = 0;
    const wrapper = new Proxy(
      { ...f.review },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'purpose') {
            captures++;
            f.gate.confirmed = false;
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => planCancellationFacts(wrapper)).toThrow();
    expect(captures).toBeGreaterThan(0);
    expect(() => assertPlanCancellationCurrent(f.review)).toThrow();
  },
);

it.each([0, 1, 2])(
  'brand %i: captured maintenance references retain exact ordinary identities and reject foreign-tenant handles without writes',
  async (brand) => {
    const f = await currentFixture(brand),
      foreign = await currentFixture((brand + 1) % 3),
      before = f.sources.property.read(f.org),
      writer = vi.spyOn(f.sources.property, 'savePlan'),
      consent = vi.spyOn(f.sources.operations, 'recordConsent'),
      network = vi.spyOn(globalThis, 'fetch'),
      facts = planCancellationFacts({
        gate: f.review.gate,
        purpose: f.review.purpose,
        desk: f.review.desk,
        saved: f.review.saved,
        view: f.review.view,
      });
    expect(facts.identity).toBe(f.review.view.identity);
    expect(facts.identity.organization_id).toBe(f.org);
    expect(facts.identity.job_id).toBe(f.entry.target.job_id);
    expect(facts.identity.customer_id).toBe(f.entry.target.customer_id);
    expect(facts.identity.location_id).toBe(f.entry.target.location_id);
    expect(facts.purpose).toBe('recurring_maintenance');
    expect(facts.plans).toBe(f.review.saved.evidence.plans);
    expect(facts.rows.map((row) => row.key)).toEqual(
      f.review.desk.rows.map((row) => row.key),
    );
    expect(() =>
      planCancellationFacts({ ...f.review, desk: foreign.review.desk }),
    ).toThrow();
    expect(facts.send).toBe(false);
    expect(facts.renew).toBe(false);
    expect(facts.native_plan_cancellation).toBe('UNSUPPORTED');
    expect(facts.consent_mutation).toBe(false);
    expect(f.sources.property.read(f.org)).toEqual(before);
    expect(writer).not.toHaveBeenCalled();
    expect(consent).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  },
);

it.each([0, 1, 2])(
  'brand %i: captured maintenance references cannot revive stale native plan revisions or replace the source context',
  async (brand) => {
    const f = await currentFixture(brand),
      plan = f.sources.property
        .read(f.org)
        .plans.find((row) => row.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.org, {
      ...plan,
      name: 'Explicit native maintenance revision',
    });
    expect(() => planCancellationFacts({ ...f.review })).toThrow();
    const fresh = await readPlanCancellationReview(
        f.sources,
        f.entry.target.job_id!,
        f.review.purpose,
        f.gate,
      ),
      facts = planCancellationFacts(fresh),
      currentPlan = facts.plans.find((row) => row.id === plan.id)!;
    expect(facts.identity).toEqual(f.review.view.identity);
    expect(currentPlan.revision).toBe(plan.revision + 1);
    expect(currentPlan.name).toBe('Explicit native maintenance revision');
    expect(facts.send).toBe(false);
    expect(facts.renew).toBe(false);
  },
);

it.each([0, 1, 2])(
  'brand %i: captured maintenance references preserve recorded withdrawal, UNKNOWN custody and denied replay',
  async (brand) => {
    const f = await currentFixture(brand),
      selected = await selectPlanCancellationOccurrence(
        f.review,
        f.review.desk.rows[0].key,
      ),
      proposal = {
        proposed_on: f.review.desk.rows[0].recorded_due_on,
        plan_kind: 'follow_up' as const,
      };
    await preparePlanCancellationReview(selected, proposal, true);
    await f.sources.operations.recordConsent(
      f.org,
      f.entry.target.customer_id,
      false,
      false,
    );
    expect(() => planCancellationFacts({ ...f.review })).toThrow();
    expect((await reconcilePlanCancellationReview(selected)).status).toBe(
      'UNKNOWN',
    );
    await expect(
      closePlanCancellationReview(selected, 'CANCEL', true),
    ).rejects.toThrow();
    const fresh = await readPlanCancellationReview(
        f.sources,
        f.entry.target.job_id!,
        f.review.purpose,
        f.gate,
      ),
      facts = planCancellationFacts(fresh);
    expect(facts.rows.length).toBeGreaterThan(0);
    expect(
      facts.rows.every((row) => row.recorded_channel === 'RECORDED_DENIED'),
    ).toBe(true);
    expect(facts.send).toBe(false);
    expect(facts.consent_mutation).toBe(false);
    await expect(
      preparePlanCancellationReview(selected, proposal, true),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(selected)).status).toBe(
      'UNKNOWN',
    );
  },
);

it.each(
  [0, 1, 2].flatMap((brand) =>
    (['CANCEL', 'REVOKE'] as const).map((action) => [brand, action] as const),
  ),
)(
  'brand %i: captured maintenance references distinguish terminal staff %s from native plan or consent cancellation',
  async (brand, action) => {
    const f = await currentFixture(brand),
      before = f.sources.property.read(f.org),
      selected = await selectPlanCancellationOccurrence(
        f.review,
        f.review.desk.rows[0].key,
      );
    await preparePlanCancellationReview(
      selected,
      {
        proposed_on: f.review.desk.rows[0].recorded_due_on,
        plan_kind: 'follow_up',
      },
      true,
    );
    const result = await closePlanCancellationReview(selected, action, true),
      observed = await reconcilePlanCancellationReview(selected),
      facts = planCancellationFacts({ ...f.review });
    expect(result.status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LOCAL_REVIEW' : 'REVOKED_LOCAL_REVIEW',
    );
    expect(observed.status).toBe(result.status);
    expect(observed.plan_mutation_performed).toBe(false);
    expect(observed.consent_mutation).toBe(false);
    expect(observed.replay).toBe('FORBIDDEN');
    expect(facts.native_plan_cancellation).toBe('UNSUPPORTED');
    expect(facts.enrollment_cancellation).toBe('UNSUPPORTED');
    expect(facts.send).toBe(false);
    expect(facts.renew).toBe(false);
    expect(f.sources.property.read(f.org)).toEqual(before);
    await expect(
      preparePlanCancellationReview(
        selected,
        {
          proposed_on: f.review.desk.rows[0].recorded_due_on,
          plan_kind: 'follow_up',
        },
        true,
      ),
    ).rejects.toThrow();
  },
);
it.each([0, 1, 2])(
  'brand %i: maintenance facts cannot disclose retained private evidence after a caller reference read revokes the original owner',
  async (brand) => {
    const gate = { enabled: true, confirmed: true },
      all = await prepareOperatingSources(sampleCompanies[brand], gate),
      entry = all.entries[2],
      sources = { ...all, entries: [entry] },
      org = sources.company.id;
    await sources.operations.configure(
      org,
      'active',
      'synthetic',
      {},
      org + '-maintenance-remaining-owner',
    );
    const review = await readPlanCancellationReview(
        sources,
        entry.target.job_id!,
        'recurring_maintenance',
        gate,
      ),
      purposeReads = vi.fn();
    let revoked: Promise<void> | undefined;
    const wrapper = new Proxy(
      { ...review },
      {
        get(target, key, receiver) {
          if (key === 'purpose') {
            purposeReads();
            revoked ??= sources.operations.revokeOwner(
              org,
              entry.target.actor_id,
            );
          }
          return Reflect.get(target, key, receiver);
        },
      },
    );
    let observed: ReturnType<typeof planCancellationFacts> | undefined;
    try {
      observed = planCancellationFacts(wrapper);
    } catch {
      // Current native authorization remains the only private-read boundary.
    }
    if (revoked) {
      await revoked;
      expect(() => assertPlanCancellationCurrent(review)).toThrow();
      expect(
        observed,
        'A revoked original owner must not receive retained plan or consent facts',
      ).toBeUndefined();
    } else {
      // Capturing plain own-data references may safely avoid the executable read.
      expect(purposeReads).not.toHaveBeenCalled();
      expect(observed).toEqual(planCancellationFacts(review));
    }
  },
);
