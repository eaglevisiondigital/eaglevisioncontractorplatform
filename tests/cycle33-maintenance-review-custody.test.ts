import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readMaintenancePlanCorrectionReview,
  maintenancePlanRenewalReview,
  saveMaintenancePlanCorrectionReview,
  reconcileMaintenancePlanCorrectionReview,
} from '../src/lib/workflows/maintenance-plan-correction';

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
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[2],
    org = sources.company.id;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const review = await readMaintenancePlanCorrectionReview(
    sources,
    entry.target.job_id!,
    gate,
  );
  return { gate, sources, entry, org, review };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: a late outer get cannot revoke actual access and return retained renewal detail`, async () => {
    const f = await fixture(brand);
    let reads = 0,
      revoked: Promise<void> | undefined;
    const review = new Proxy(f.review, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key === 'source' && ++reads === 2)
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        return value;
      },
    });
    let result: unknown;
    try {
      result = maintenancePlanRenewalReview(review);
    } catch {
      // Rejection cannot disclose private detail or restore any native hold.
    }
    if (revoked) {
      await revoked;
      expect(() => maintenancePlanRenewalReview(f.review)).toThrow();
      expect(result).toBeUndefined();
    } else {
      expect(reads).toBeLessThan(2);
      expect(maintenancePlanRenewalReview(f.review).plan_id).toBe(
        f.review.source.plan_id,
      );
    }
  });
  it(`brand ${brand}: an outer source getter is rejected before invocation or private disclosure`, async () => {
    const f = await fixture(brand);
    let reads = 0,
      revoked: Promise<void> | undefined;
    const review = Object.defineProperty({ ...f.review }, 'source', {
      enumerable: true,
      get() {
        if (++reads === 2)
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        return f.review.source;
      },
    });
    let result: unknown;
    try {
      result = maintenancePlanRenewalReview(review);
    } catch {
      // An accessor is not an original source handle or a confirmation.
    }
    if (revoked) await revoked;
    expect(result).toBeUndefined();
    expect(reads).toBe(0);
    expect(() => maintenancePlanRenewalReview(f.review)).not.toThrow();
  });
  it(`brand ${brand}: nested selection getters cannot revoke access during source comparison`, async () => {
    const f = await fixture(brand);
    let reads = 0,
      revoked: Promise<void> | undefined;
    const source = Object.defineProperty({ ...f.review.source }, 'revision', {
      enumerable: true,
      get() {
        reads++;
        if (!revoked)
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        return f.review.source.revision;
      },
    });
    let result: unknown;
    try {
      result = maintenancePlanRenewalReview({ ...f.review, source });
    } catch {
      // Only inert primitive selection fields may precede native reads.
    }
    if (revoked) await revoked;
    expect(result).toBeUndefined();
    expect(reads).toBe(0);
    expect(() => maintenancePlanRenewalReview(f.review)).not.toThrow();
  });
  for (const nth of [1, 2])
    it(`brand ${brand}: descriptor capture ${nth} cannot return detail after actual revocation`, async () => {
      const f = await fixture(brand);
      let captures = 0,
        revoked: Promise<void> | undefined;
      const review = new Proxy(f.review, {
        getOwnPropertyDescriptor(target, key) {
          const value = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'source' && ++captures === nth)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return value;
        },
      });
      let result: unknown;
      try {
        result = maintenancePlanRenewalReview(review);
      } catch {
        // Descriptor side effects must precede the original access guards.
      }
      if (revoked) {
        await revoked;
        expect(result).toBeUndefined();
        expect(() => maintenancePlanRenewalReview(f.review)).toThrow();
      } else {
        expect(captures).toBeLessThan(nth);
        expect(maintenancePlanRenewalReview(f.review).plan_id).toBe(
          f.review.source.plan_id,
        );
      }
    });
  it(`brand ${brand}: ordinary copied review retains exact native plan and blocked renewal authorities`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org);
    expect(maintenancePlanRenewalReview({ ...f.review })).toMatchObject({
      plan_id: f.review.source.plan_id,
      revision: f.review.source.revision,
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
      enrollment: 'UNVERIFIED',
      renewal_terms: 'UNKNOWN',
      send: false,
      renew: false,
    });
    expect(f.sources.property.read(f.org)).toEqual(before);
  });
  it(`brand ${brand}: current native membership revocation withholds an ordinary retained review`, async () => {
    const f = await fixture(brand);
    await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
    expect(() => maintenancePlanRenewalReview({ ...f.review })).toThrow();
  });
  it(`brand ${brand}: an original plan save stales the old renewal without restoring one-use custody`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      input = {
        plan_id: f.review.source.plan_id,
        revision: f.review.source.revision,
        name: 'Explicit native saved maintenance revision',
        cadence: 'custom' as const,
        interval_days: 10,
      };
    await saveMaintenancePlanCorrectionReview(f.review, input, true);
    expect(() => maintenancePlanRenewalReview(f.review)).toThrow();
    await expect(
      saveMaintenancePlanCorrectionReview(f.review, input, true),
    ).rejects.toThrow();
    expect(
      await reconcileMaintenancePlanCorrectionReview(f.review),
    ).toMatchObject({
      state: 'KNOWN_SAVED',
      replay: 'FORBIDDEN',
      source_id: input.plan_id,
    });
    const after = f.sources.property.read(f.org);
    expect(after.visits).toEqual(before.visits);
    expect(after.reports).toEqual(before.reports);
    expect(after.plans.find((p) => p.id === input.plan_id)?.revision).toBe(
      input.revision + 1,
    );
  });
  it(`brand ${brand}: another original job renewal cannot substitute for this plan review`, async () => {
    const f = await fixture(brand),
      other = await readMaintenancePlanCorrectionReview(
        f.sources,
        f.sources.entries[0].target.job_id!,
        f.gate,
      );
    expect(other.view.identity.job_id).not.toBe(f.review.view.identity.job_id);
    expect(() =>
      maintenancePlanRenewalReview({ ...f.review, renewal: other.renewal }),
    ).toThrow();
    expect(() => maintenancePlanRenewalReview(f.review)).not.toThrow();
  });
  it(`brand ${brand}: currently authorized foreign-tenant renewal never joins this original plan`, async () => {
    const f = await fixture(brand),
      foreign = await fixture((brand + 1) % 3);
    expect(foreign.review.renewal.identity.organization_id).not.toBe(
      f.review.view.identity.organization_id,
    );
    expect(() =>
      maintenancePlanRenewalReview({
        ...f.review,
        renewal: foreign.review.renewal,
      }),
    ).toThrow();
    expect(() => maintenancePlanRenewalReview(f.review)).not.toThrow();
    expect(() => maintenancePlanRenewalReview(foreign.review)).not.toThrow();
  });
}
