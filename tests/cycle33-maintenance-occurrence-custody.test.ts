import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  closePlanCancellationReview,
  planCancellationOccurrenceFacts,
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

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: inert own-reference capture preserves exact selected facts without late nested reads or business writes`, async () => {
    const f = await fixture(brand),
      property = f.sources.property.read(f.org),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      writers = [
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
        vi.spyOn(f.entry.release, 'command'),
        vi.spyOn(globalThis, 'fetch'),
      ];
    let rawGets = 0;
    const raw = <T extends object>(value: T) =>
      new Proxy(
        { ...value },
        {
          get() {
            rawGets++;
            throw Error('Caller wrapper must not be reread after capture');
          },
        },
      );
    const facts = planCancellationOccurrenceFacts({
        review: raw(f.review),
        selection: raw(f.selected.selection),
      }),
      original = planCancellationOccurrenceFacts(f.selected);
    expect(rawGets).toBe(0);
    expect(facts).toEqual(original);
    expect(facts.identity).toBe(f.review.view.identity);
    expect(facts.plan).toBe(
      f.review.saved.evidence.plans.find(
        (p) => p.id === f.row.plan_reference.id,
      ),
    );
    expect(facts).toMatchObject({
      occurrence_key: f.row.key,
      requested_purpose: 'recurring_maintenance',
      requested_purpose_is: 'REVIEW_CONTEXT_NOT_CONSENT',
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
      renewal_terms: 'UNKNOWN',
      native_plan_cancellation: 'UNSUPPORTED',
      enrollment_cancellation: 'UNSUPPORTED',
      source_atomicity: 'CAPTURED_NOT_ATOMIC',
      send: false,
      renew: false,
    });
    expect(facts.identity).toMatchObject({
      organization_id: f.org,
      job_id: f.entry.target.job_id,
      customer_id: f.entry.target.customer_id,
      location_id: f.entry.target.location_id,
    });
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    for (const writer of writers) expect(writer).not.toHaveBeenCalled();
  });

  it(`brand ${brand}: outer and nested accessors are rejected without invoking them or changing the original read`, async () => {
    const f = await fixture(brand),
      getter = vi.fn(() => f.selected.selection);
    const outer = Object.defineProperty({ ...f.selected }, 'selection', {
      enumerable: true,
      get: getter,
    });
    expect(() => planCancellationOccurrenceFacts(outer)).toThrow();
    const nested = Object.defineProperty(
      { ...f.selected.selection },
      'occurrence',
      { enumerable: true, get: getter },
    );
    expect(() =>
      planCancellationOccurrenceFacts({ ...f.selected, selection: nested }),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(planCancellationOccurrenceFacts(f.selected).occurrence_key).toBe(
      f.row.key,
    );
  });

  it(`brand ${brand}: selection descriptor capture revocation precedes native guards and private serialization`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const selection = new Proxy(
      { ...f.selected.selection },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'occurrence' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() =>
      planCancellationOccurrenceFacts({ ...f.selected, selection }),
    ).toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'UNKNOWN',
    );
  });

  it(`brand ${brand}: captured confirmation withdrawal withholds facts without inventing an original attempt`, async () => {
    const f = await fixture(brand),
      review = new Proxy(
        { ...f.review },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'purpose') f.gate.confirmed = false;
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
    expect(() =>
      planCancellationOccurrenceFacts({ ...f.selected, review }),
    ).toThrow();
    f.gate.confirmed = true;
    // Native admission rejected before an attempt or UNKNOWN was recorded.
    // Reopening this inert observation must not manufacture one-use custody.
    expect(planCancellationOccurrenceFacts(f.selected).occurrence_key).toBe(
      f.row.key,
    );
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'READY_FOR_REQUIREMENTS',
    );
  });

  it(`brand ${brand}: another currently authorized tenant occurrence cannot join the original native review`, async () => {
    const f = await fixture(brand),
      foreign = await fixture((brand + 1) % 3);
    expect(f.org).not.toBe(foreign.org);
    expect(() =>
      planCancellationOccurrenceFacts({
        ...f.selected,
        selection: foreign.selected.selection,
      }),
    ).toThrow();
    expect(() =>
      planCancellationOccurrenceFacts({
        ...f.selected,
        review: foreign.review,
      }),
    ).toThrow();
    expect(planCancellationOccurrenceFacts(f.selected).occurrence_key).toBe(
      f.row.key,
    );
    expect(
      planCancellationOccurrenceFacts(foreign.selected).identity
        .organization_id,
    ).toBe(foreign.org);
  });

  it(`brand ${brand}: a canonical plan revision stales the old occurrence and fresh selection retains only the exact new revision`, async () => {
    const f = await fixture(brand),
      plan = f.sources.property
        .read(f.org)
        .plans.find((p) => p.id === f.row.plan_reference.id)!;
    f.sources.property.savePlan(f.org, {
      ...plan,
      name: 'Explicit canonical plan revision for currentness review',
    });
    expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
    const fresh = await readPlanCancellationReview(
        f.sources,
        f.entry.target.job_id!,
        'recurring_maintenance',
        f.gate,
      ),
      row = fresh.desk.rows.find((r) => r.plan_reference.id === plan.id);
    if (!row) throw Error('Exact revised plan occurrence required');
    const selected = await selectPlanCancellationOccurrence(fresh, row.key),
      facts = planCancellationOccurrenceFacts(selected);
    expect(facts.identity).toEqual(f.review.view.identity);
    expect(facts.plan).toMatchObject({
      id: plan.id,
      revision: plan.revision + 1,
      name: 'Explicit canonical plan revision for currentness review',
    });
    expect(facts.send).toBe(false);
    expect(facts.renew).toBe(false);
  });

  it(`brand ${brand}: recorded contact withdrawal stales occurrence facts and never becomes cancellation or renewed consent`, async () => {
    const f = await fixture(brand),
      proposal = {
        proposed_on: f.row.recorded_due_on,
        plan_kind: 'follow_up' as const,
      };
    await preparePlanCancellationReview(f.selected, proposal, true);
    await f.sources.operations.recordConsent(
      f.org,
      f.entry.target.customer_id,
      false,
      false,
    );
    expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
    expect(await reconcilePlanCancellationReview(f.selected)).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      send: false,
      consent_mutation: false,
      plan_mutation_performed: false,
    });
    await expect(
      closePlanCancellationReview(f.selected, 'CANCEL', true),
    ).rejects.toThrow();
    await expect(
      preparePlanCancellationReview(f.selected, proposal, true),
    ).rejects.toThrow();
    const fresh = await readPlanCancellationReview(
        f.sources,
        f.entry.target.job_id!,
        'recurring_maintenance',
        f.gate,
      ),
      row = fresh.desk.rows.find(
        (r) => r.plan_reference.id === f.row.plan_reference.id,
      );
    if (!row)
      throw Error('Original plan remains reviewable after contact withdrawal');
    const facts = planCancellationOccurrenceFacts(
      await selectPlanCancellationOccurrence(fresh, row.key),
    );
    expect(facts.recorded_channel).toBe('RECORDED_DENIED');
    expect(facts.purpose_consent).toBe('UNVERIFIED');
    expect(facts.native_plan_cancellation).toBe('UNSUPPORTED');
    expect(facts.send).toBe(false);
    expect(facts.renew).toBe(false);
  });

  it(`brand ${brand}: read-only selected facts cannot clear an original uncertain preparation or permit replay`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      proposal = {
        proposed_on: f.row.recorded_due_on,
        plan_kind: 'follow_up' as const,
      };
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(
      Error('Original preparation acknowledgment unavailable'),
    );
    await expect(
      preparePlanCancellationReview(f.selected, proposal, true),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await reconcilePlanCancellationReview(f.selected)).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      send: false,
      plan_mutation_performed: false,
    });
    const facts = planCancellationOccurrenceFacts(f.selected);
    expect(facts.occurrence_key).toBe(f.row.key);
    expect(facts.send).toBe(false);
    expect(facts.renew).toBe(false);
    await expect(
      preparePlanCancellationReview(f.selected, proposal, true),
    ).rejects.toThrow();
    await expect(
      closePlanCancellationReview(f.selected, 'REVOKE', true),
    ).rejects.toThrow();
    expect((await reconcilePlanCancellationReview(f.selected)).status).toBe(
      'UNKNOWN',
    );
    expect(f.sources.property.read(f.org)).toEqual(before);
  });
}

it('default OFF maintenance occurrence admission rejects before touching private sources', async () => {
  const touched = vi.fn(() => {
      throw Error('Unadmitted source must remain private');
    }),
    sources = new Proxy({}, { get: touched });
  await expect(
    readPlanCancellationReview(
      sources as never,
      'unadmitted-job',
      'recurring_maintenance',
    ),
  ).rejects.toThrow('OFF');
  expect(() => planCancellationOccurrenceFacts({} as never)).toThrow();
  expect(touched).not.toHaveBeenCalled();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture(brand: number) {
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
    org + '-occurrence-remaining-owner',
  );
  const review = await readPlanCancellationReview(
      sources,
      entry.target.job_id!,
      'recurring_maintenance',
      gate,
    ),
    row = review.desk.rows[0];
  if (!row) throw Error('Original displayed maintenance occurrence required');
  const selected = await selectPlanCancellationOccurrence(review, row.key);
  return { gate, all, sources, entry, org, review, row, selected };
}

it.each([0, 1, 2])(
  'brand %i: late outer review access cannot revoke native authorization and disclose selected occurrence facts',
  async (brand) => {
    const f = await fixture(brand);
    let gets = 0,
      revoked: Promise<void> | undefined,
      result: unknown;
    const wrapper = new Proxy(
      { ...f.selected },
      {
        get(target, key, receiver) {
          const value = Reflect.get(target, key, receiver);
          if (key === 'review' && ++gets === 3)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return value;
        },
      },
    );
    try {
      result = planCancellationOccurrenceFacts(wrapper);
    } catch {
      // A rejected current read must not return private selected plan details.
    }
    if (revoked) {
      await revoked;
      expect(() => planCancellationOccurrenceFacts(f.selected)).toThrow();
      expect(result).toBeUndefined();
    } else {
      expect(gets).toBe(0);
      expect(result).toMatchObject({
        identity: f.review.view.identity,
        occurrence_key: f.row.key,
        send: false,
        renew: false,
      });
    }
  },
);
