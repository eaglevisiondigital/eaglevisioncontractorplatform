import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../../src/domain/platform';
import { prepareLocalJourney } from '../../src/lib/workflows/journey-runtime';
import { readProcurementJobEvidence } from '../../src/components/workflows/procurement-job-evidence';
afterEach(() => vi.restoreAllMocks());
const fixture = (i = 0) =>
  prepareLocalJourney(sampleCompanies[i], { enabled: true, confirmed: true });
it.each([0, 1, 2])(
  'brand %i: original issued material quantities beside procurement gaps and canonical costs',
  async (i) => {
    const j = await fixture(i);
    const before = JSON.stringify(
      j.estimates.readSyntheticPrototypeSources(j.target),
    );
    const view = await readProcurementJobEvidence(j);
    expect(view.cost.scope.jobId).toBe(j.target.job_id);
    expect(view.cost.scope.issuedVersionId).toBe(j.target.version_id);
    const included = j.issued.version.payload.lines.filter(
      (l) =>
        ['material', 'product'].includes(l.kind) &&
        j.issued.version.calculation.lines.find((c) => c.id === l.id)?.included,
    );
    expect(
      view.materials.map((l) => [l.id, l.quantity_milli, l.catalog_item_id]),
    ).toEqual(included.map((l) => [l.id, l.quantity_milli, l.catalog_item_id]));
    expect(view.requirements.kind).toBe('procurement');
    expect(view.requirements.operational_ready).toBe(false);
    expect(view.requirements.prior_attempt).toBe(
      'NO_ATTEMPT_OBSERVED_IN_THIS_ADAPTER',
    );
    const cost = await view.cost.reader.read(
      view.cost.scope,
      j.target.actor_id,
    );
    expect(cost.status).toBe('UNKNOWN');
    expect(cost.totals).toBeNull();
    view.check();
    expect(
      JSON.stringify(j.estimates.readSyntheticPrototypeSources(j.target)),
    ).toBe(before);
    const second = await readProcurementJobEvidence(j);
    expect(second.requirements.prior_attempt).toBe(
      view.requirements.prior_attempt,
    );
  },
);
it('withdrawn confirmation denies read and retained evidence', async () => {
  const j = await fixture();
  const view = await readProcurementJobEvidence(j);
  j.gate.confirmed = false;
  expect(() => view.check()).toThrow();
  await expect(readProcurementJobEvidence(j)).rejects.toThrow();
});
it('revocation denies retained cost reads', async () => {
  const j = await fixture();
  const view = await readProcurementJobEvidence(j);
  const members = j.operations.syntheticMemberships.bind(j.operations);
  vi.spyOn(j.operations, 'syntheticMemberships').mockImplementation((org) =>
    members(org).map((m) => ({ ...m, active: false })),
  );
  expect(() => view.check()).toThrow();
  await expect(
    view.cost.reader.read(view.cost.scope, j.target.actor_id),
  ).rejects.toThrow();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'version_id',
] as const)('foreign %s denied', async (key) => {
  const j = await fixture();
  j.target[key] = crypto.randomUUID();
  await expect(readProcurementJobEvidence(j)).rejects.toThrow();
});
it('revocation during async source hashing denies disclosure', async () => {
  const j = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    j.gate.enabled = false;
    return digest(...args);
  });
  await expect(readProcurementJobEvidence(j)).rejects.toThrow();
});
