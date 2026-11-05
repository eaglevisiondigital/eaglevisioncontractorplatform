import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readMaintenancePlanCorrectionReview,
  saveMaintenancePlanCorrectionReview,
  reconcileMaintenancePlanCorrectionReview,
  maintenancePlanRenewalReview,
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
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!,
    review = await readMaintenancePlanCorrectionReview(sources, job, gate),
    input = {
      plan_id: review.source.plan_id,
      revision: review.source.revision,
      name: 'Explicitly reviewed maintenance name',
      cadence: 'custom' as const,
      interval_days: 10,
    };
  return { gate, sources, entry, org, job, review, input };
}
for (const brand of [0, 1, 2])
  it(`brand ${brand}: native writer cannot receive an unconfirmed third capture of the plan correction`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      writer = vi.spyOn(f.sources.property, 'savePlan');
    let captures = 0;
    const input = new Proxy(f.input, {
      getOwnPropertyDescriptor(target, key) {
        const d = Reflect.getOwnPropertyDescriptor(target, key);
        return d && key === 'name'
          ? {
              ...d,
              value:
                ++captures <= 2
                  ? f.input.name
                  : 'Unconfirmed third-capture name',
            }
          : d;
      },
    });
    await expect(
      saveMaintenancePlanCorrectionReview(f.review, input, true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.org)).toEqual(before);
  });

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: ordinary form ordering preserves confirmed native plan, exact receipt and blocked renewal requirements`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      original = before.plans.find((p) => p.id === f.input.plan_id)!,
      writer = vi.spyOn(f.sources.property, 'savePlan');
    const input = {
      interval_days: f.input.interval_days,
      cadence: f.input.cadence,
      name: f.input.name,
      revision: f.input.revision,
      plan_id: f.input.plan_id,
    };
    expect(maintenancePlanRenewalReview(f.review)).toMatchObject({
      send: false,
      renew: false,
      purpose_consent: 'UNVERIFIED',
      suppression: 'UNVERIFIED',
    });
    await saveMaintenancePlanCorrectionReview(f.review, input, true);
    expect(writer).toHaveBeenCalledTimes(1);
    const after = f.sources.property.read(f.org);
    expect(after.plans.find((p) => p.id === original.id)).toEqual({
      ...original,
      name: input.name,
      cadence: input.cadence,
      interval_days: input.interval_days,
      revision: original.revision + 1,
    });
    expect(after.visits).toEqual(before.visits);
    expect(after.reports).toEqual(before.reports);
    expect(
      await reconcileMaintenancePlanCorrectionReview(f.review),
    ).toMatchObject({
      state: 'KNOWN_SAVED',
      replay: 'FORBIDDEN',
      source_id: original.id,
      result_id: original.id,
    });
    await expect(
      saveMaintenancePlanCorrectionReview(f.review, input, true),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
  });
  it(`brand ${brand}: ordinary input mutation during source verification is rejected before native admission, with valid original correction still available`, async () => {
    const f = await fixture(brand),
      writer = vi.spyOn(f.sources.property, 'savePlan'),
      native = f.sources.operations.customerHistory.bind(f.sources.operations);
    let changed = false;
    vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const out = await native(...args);
        if (!changed) {
          changed = true;
          f.input.name = 'Changed after explicit confirmation';
        }
        return out;
      },
    );
    await expect(
      saveMaintenancePlanCorrectionReview(f.review, f.input, true),
    ).rejects.toThrow('Confirmed maintenance plan input changed');
    expect(changed).toBe(true);
    expect(writer).not.toHaveBeenCalled();
    f.input.name = 'Explicitly reviewed maintenance name';
    await expect(
      saveMaintenancePlanCorrectionReview(f.review, f.input, true),
    ).resolves.toBeDefined();
    expect(writer).toHaveBeenCalledTimes(1);
  });
  it(`brand ${brand}: revoked local admission during source verification neither writes nor confers messaging or renewal authority`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      writer = vi.spyOn(f.sources.property, 'savePlan'),
      native = f.sources.operations.customerHistory.bind(f.sources.operations);
    let revoked = false;
    vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const out = await native(...args);
        if (!revoked) {
          revoked = true;
          f.gate.confirmed = false;
        }
        return out;
      },
    );
    await expect(
      saveMaintenancePlanCorrectionReview(f.review, f.input, true),
    ).rejects.toThrow();
    expect(revoked).toBe(true);
    expect(writer).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.org)).toEqual(before);
  });
}
