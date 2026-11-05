import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readSyncAdmissionSource,
  reviewSyncAdmission,
  syncSourceReference,
  assertSyncAdmissionCurrentNow,
  selectSyncAdmissionJob,
} from '../src/lib/workflows/sync-admission-review';
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
    entry = sources.entries[0],
    org = sources.company.id;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const requirements = await readSyncAdmissionSource(
      sources,
      {
        job_id: entry.target.job_id!,
        kind: 'offline',
        note: 'Exact source comparison only',
        review_on: '2026-12-28',
        manual_priority: 'normal',
        edition: 'property_services',
      },
      gate,
    ),
    input = {
      external_reference: 'cycle33-exact-review',
      source: syncSourceReference(requirements),
    };
  return { gate, sources, entry, org, requirements, input };
}
for (const brand of [0, 1, 2])
  it(`brand ${brand}: executable external reference cannot revoke original authority after its final check and obtain comparison facts`, async () => {
    const f = await fixture(brand);
    let captures = 0,
      revoked: Promise<void> | undefined;
    const input = new Proxy(f.input, {
      getOwnPropertyDescriptor(target, key) {
        const d = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === 'external_reference' && ++captures === 2)
          revoked = f.sources.operations.revokeOwner(
            f.org,
            f.entry.target.actor_id,
          );
        return d;
      },
    });
    await expect(reviewSyncAdmission(f.requirements, input)).rejects.toThrow();
    if (revoked) await revoked;
    expect(captures).toBeLessThan(2);
  });

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: ordinary reference retains exact original source and read-only authority without introducing any business effects`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      input = {
        source: { ...f.input.source },
        external_reference: f.input.external_reference,
      };
    const compared = await reviewSyncAdmission(f.requirements, input);
    expect(compared.exact_reference).toBe(true);
    expect(compared.source).toEqual(f.input.source);
    expect(selectSyncAdmissionJob(compared)).toBe(f.entry.target.job_id);
    expect(Object.values(compared.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(compared.operational_ready).toBe(false);
    expect(f.sources.property.read(f.org)).toEqual(before);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
    input.source.customer_id = 'foreign-customer';
    expect(() => assertSyncAdmissionCurrentNow(compared)).toThrow();
    input.source.customer_id = f.input.source.customer_id;
    expect(() => assertSyncAdmissionCurrentNow(compared)).toThrow('UNKNOWN');
  });
  it(`brand ${brand}: actual native membership revocation during digest denies private comparison and preserves original source UNKNOWN`, async () => {
    const f = await fixture(brand),
      native = crypto.subtle.digest.bind(crypto.subtle);
    let revoked = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const out = await native(...args);
      if (!revoked) {
        revoked = true;
        await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
      }
      return out;
    });
    await expect(
      reviewSyncAdmission(f.requirements, f.input),
    ).rejects.toThrow();
    expect(revoked).toBe(true);
    await f.sources.operations.configure(
      f.org,
      'active',
      'synthetic',
      {},
      f.entry.target.actor_id,
    );
    expect(() => syncSourceReference(f.requirements)).toThrow('UNKNOWN');
  });
  it(`brand ${brand}: nested executable source fields cannot withdraw the gate after the current-source check`, async () => {
    const f = await fixture(brand);
    let captures = 0;
    const source = new Proxy(f.input.source, {
      getOwnPropertyDescriptor(target, key) {
        const d = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === 'organization_id' && ++captures === 2)
          f.gate.confirmed = false;
        return d;
      },
    });
    await expect(
      reviewSyncAdmission(f.requirements, { ...f.input, source }),
    ).rejects.toThrow();
    expect(captures).toBeLessThan(2);
    expect(f.gate.confirmed).toBe(true);
  });
}
