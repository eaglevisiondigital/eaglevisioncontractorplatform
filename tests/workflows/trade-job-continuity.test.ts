import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readPrototypeSource } from '../../src/lib/program/prototype-source';
import {
  prepareTradeEdition,
  type TradeEdition,
} from '../../src/lib/program/trade-editions';
import { readTradeJobContinuity } from '../../src/components/workflows/trade-job-continuity';
afterEach(() => vi.restoreAllMocks());
async function fixture(edition: TradeEdition = 'roofing', i = 0) {
  const j = await prepareLocalJourney(sampleCompanies[i], {
    enabled: true,
    confirmed: true,
  });
  const source = await readPrototypeSource(j.estimates, j.target, j.gate);
  const gate = { enabled: true, confirmed: true };
  const trade = await prepareTradeEdition(
    source,
    { edition, catalog_item_ids: [] },
    gate,
  );
  return { j, source, gate, trade };
}
it.each(['roofing', 'landscaping', 'remodeling', 'hvac'] as const)(
  '%s retained checklist uses exact issued scope without preparation replay',
  async (edition) => {
    const f = await fixture(edition);
    const before = JSON.stringify(
      f.j.estimates.readSyntheticPrototypeSources(f.j.target),
    );
    const v = await readTradeJobContinuity(
      f.j,
      f.trade,
      () => f.gate.confirmed,
    );
    expect(v.trade).toBe(f.trade);
    expect(v.work.scope.jobId).toBe(f.j.target.job_id);
    expect(
      v.trade.snapshot.checklist.every((c) => c.status === 'NOT_REVIEWED'),
    ).toBe(true);
    await v.inspect();
    expect(
      JSON.stringify(f.j.estimates.readSyntheticPrototypeSources(f.j.target)),
    ).toBe(before);
    await expect(
      prepareTradeEdition(f.source, { edition, catalog_item_ids: [] }, f.gate),
    ).rejects.toThrow(/replay/);
  },
);
it.each([1, 2])('brand %i preserves tenant identity', async (i) => {
  const f = await fixture('roofing', i);
  const v = await readTradeJobContinuity(f.j, f.trade, () => true);
  expect(v.trade.snapshot.target.organization_id).toBe(f.j.company.id);
});
it('withdrawal of original confirmation latches UNKNOWN', async () => {
  const f = await fixture();
  const v = await readTradeJobContinuity(f.j, f.trade, () => f.gate.confirmed);
  f.gate.confirmed = false;
  expect(() => v.check()).toThrow();
  f.gate.confirmed = true;
  await expect(v.inspect()).rejects.toThrow();
});
it('copied trade reviews are denied by native inspection', async () => {
  const f = await fixture();
  await expect(
    readTradeJobContinuity(f.j, structuredClone(f.trade), () => true),
  ).rejects.toThrow();
});
it('foreign property is denied', async () => {
  const f = await fixture();
  f.j.target.location_id = crypto.randomUUID();
  await expect(
    readTradeJobContinuity(f.j, f.trade, () => true),
  ).rejects.toThrow();
});
it('revocation during retained inspection denies disclosure', async () => {
  const f = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    f.gate.confirmed = false;
    return digest(...args);
  });
  await expect(
    readTradeJobContinuity(f.j, f.trade, () => f.gate.confirmed),
  ).rejects.toThrow();
});
