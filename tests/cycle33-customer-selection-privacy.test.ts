import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  readServiceRequestEvidence,
  inspectServiceRequestEvidence,
  inspectServiceRequestReport,
} from '../src/lib/workflows/service-request-actions';
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
  const job = entry.target.job_id!,
    view = await readServiceRequestActions(sources, job, gate),
    expected = inspectServiceRequestActions(view),
    evidence = await readServiceRequestEvidence(
      view,
      sources,
      job,
      expected,
      gate,
    );
  return { gate, sources, entry, org, job, view, expected, evidence };
}
for (const brand of [0, 1, 2])
  it(`brand ${brand}: executable retained selection cannot revoke native access after the final guard and return private lineage`, async () => {
    const f = await fixture(brand);
    let captures = 0,
      revoked: Promise<void> | undefined;
    const selection = new Proxy(
      { ...f.expected },
      {
        getOwnPropertyDescriptor(target, key) {
          const d = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'request_id' && ++captures === 2)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return d;
        },
      },
    );
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, selection),
    ).toThrow();
    if (revoked) await revoked;
    expect(captures).toBeLessThan(2);
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
    ).not.toThrow();
  });

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: ordinary retained selection preserves exact published identity without manufacturing request-to-job or completion evidence`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      selection = { ...f.expected },
      lineage = inspectServiceRequestEvidence(f.view, f.evidence, selection);
    expect(lineage.request.id).toBe(f.expected.request_id);
    expect(lineage.property.organization_id).toBe(f.org);
    expect(lineage.scope.job_id).toBe(f.job);
    expect(lineage.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(lineage.customer_acceptance).toBe('UNKNOWN');
    expect(lineage.physical_completion).toBe('UNKNOWN');
    expect(JSON.stringify(lineage)).not.toMatch(
      /unit_cost_minor|payroll|internal_notes|hourly_rate_minor/,
    );
    selection.customer_id = 'foreign-customer';
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, selection),
    ).toThrow();
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
    ).not.toThrow();
    expect(f.sources.property.read(f.org)).toEqual(before);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
  });
  it(`brand ${brand}: a valid copied selection never overrides actual later native membership revocation`, async () => {
    const f = await fixture(brand);
    await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, { ...f.expected }),
    ).toThrow();
  });
  it(`brand ${brand}: published-report read fails closed when genuine native membership is revoked while hashing`, async () => {
    const f = await fixture(brand),
      reference = inspectServiceRequestEvidence(f.view, f.evidence, f.expected)
        .reports[0].reference,
      native = crypto.subtle.digest.bind(crypto.subtle);
    let revoked = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await native(...args);
      if (!revoked) {
        revoked = true;
        await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
      }
      return result;
    });
    await expect(
      inspectServiceRequestReport(f.view, f.evidence, f.expected, reference),
    ).rejects.toThrow();
    expect(revoked).toBe(true);
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
    ).toThrow();
  });
}
