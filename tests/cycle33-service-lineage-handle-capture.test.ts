import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceSourceReview,
  readServiceSourceLineage,
  assertServiceSourceReview,
  inspectServiceSourceReport,
  reconcileServiceSourceReview,
} from '../src/lib/workflows/service-source-review';

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
    org = sources.company.id;
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const entry = sources.entries[0],
    first = await readServiceSourceReview(
      sources,
      {
        job_id: entry.target.job_id!,
        staff_context_confirmed: true,
      },
      gate,
    ),
    second = await readServiceSourceReview(
      sources,
      {
        job_id: sources.entries[2].target.job_id!,
        staff_context_confirmed: true,
      },
      gate,
    );
  return { gate, sources, org, entry, first, second };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: a late property selector cannot graft another original job's published history into this request lineage`, async () => {
    const { first, second } = await fixture(brand);
    let gets = 0;
    const facade = new Proxy(
      { ...first },
      {
        get(target, key, receiver) {
          if (key === 'property') {
            gets++;
            return second.property;
          }
          return Reflect.get(target, key, receiver);
        },
      },
    );
    let result: ReturnType<typeof readServiceSourceLineage> | undefined;
    try {
      result = readServiceSourceLineage(facade);
    } catch {
      // Rejecting the executable wrapper is also safe.
    }
    if (result) {
      expect(result.scope.job_id).toBe(
        first.context.customer_safe.scope.job_id,
      );
      expect(result.reports.length).toBeGreaterThan(0);
      expect(
        result.reports.every((row) => row.job_id === result!.scope.job_id),
      ).toBe(true);
    }
    expect(gets).toBe(0);
  });
  it(`brand ${brand}: async report inspection uses the captured original handles and rejects another job's reference`, async () => {
    const f = await fixture(brand),
      foreign = readServiceSourceLineage(f.second).reports[0].reference;
    let gets = 0;
    const facade = new Proxy(
      { ...f.first },
      {
        get(target, key, receiver) {
          if (key === 'context') {
            gets++;
            return f.second.context;
          }
          if (key === 'property') {
            gets++;
            return f.second.property;
          }
          return Reflect.get(target, key, receiver);
        },
      },
    );
    await expect(inspectServiceSourceReport(facade, foreign)).rejects.toThrow();
    expect(gets).toBe(0);
    expect(() => assertServiceSourceReview(f.first)).not.toThrow();
  });
  it(`brand ${brand}: an own handle accessor is denied without invocation`, async () => {
    const f = await fixture(brand),
      getter = vi.fn(() => f.second.property),
      facade = Object.defineProperty({ ...f.first }, 'property', {
        enumerable: true,
        get: getter,
      });
    expect(() => readServiceSourceLineage(facade)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => assertServiceSourceReview(f.first)).not.toThrow();
  });
  it(`brand ${brand}: native revocation during original handle capture withholds all private lineage`, async () => {
    const f = await fixture(brand);
    let revoked: Promise<void> | undefined;
    const facade = new Proxy(
      { ...f.first },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'property' && !revoked)
            revoked = f.sources.operations.revokeOwner(
              f.org,
              f.entry.target.actor_id,
            );
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    expect(() => readServiceSourceLineage(facade)).toThrow();
    expect(revoked).toBeDefined();
    await revoked;
    expect(reconcileServiceSourceReview(f.first)).toEqual({
      status: 'UNKNOWN',
      replay: false,
      replacement: null,
    });
  });
  it(`brand ${brand}: ordinary original handles retain exact published identities and unverified completion without writes`, async () => {
    const f = await fixture(brand),
      property = f.sources.property.read(f.org),
      before = JSON.stringify(f.first),
      original = readServiceSourceLineage(f.first),
      lineage = readServiceSourceLineage({ ...f.first });
    expect(lineage).toEqual(original);
    expect(lineage.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(lineage.physical_completion).toBe('UNKNOWN');
    expect(lineage.customer_acceptance).toBe('UNKNOWN');
    expect(lineage.history_completeness).toBe('UNKNOWN');
    expect(
      lineage.reports.every((r) => r.job_id === lineage.scope.job_id),
    ).toBe(true);
    const selected = lineage.reports[0],
      report = await inspectServiceSourceReport(
        { ...f.first },
        selected.reference,
      );
    expect(report.report.reference).toEqual(selected.reference);
    expect(report.selected_job_association).toBe('EXACT_RECORDED_JOB_LINK');
    expect(report.completion?.interpretation).toMatchObject({
      physical_completion: 'UNVERIFIED',
      customer_acceptance: 'UNVERIFIED',
      delivery: 'NOT_SENT',
    });
    await expect(
      inspectServiceSourceReport({ ...f.first }, { ...selected.reference }),
    ).rejects.toThrow('Exact retained published report reference required');
    expect(JSON.stringify(f.first)).toBe(before);
    expect(f.sources.property.read(f.org)).toEqual(property);
  });
  it(`brand ${brand}: a stale native job source cannot be replaced by another retained job handle`, async () => {
    const f = await fixture(brand),
      job = f.sources.estimates.syntheticJob(f.org, f.entry.target.job_id!)!;
    await f.sources.estimates.projection(f.org, job, {
      ...job.projection,
      remaining: {
        ...job.projection.remaining,
        other: job.projection.remaining.other + 900,
      },
    });
    expect(() => readServiceSourceLineage(f.first)).toThrow();
    expect(() =>
      readServiceSourceLineage({ ...f.first, property: f.second.property }),
    ).toThrow();
    // The original container observes every captured job revision. Another old
    // reader is not a refresh or a replacement for that shared native fence.
    expect(() => readServiceSourceLineage(f.second)).toThrow();
  });
}
it('ordinary foreign-tenant handles cannot graft a published source into an original request context', async () => {
  const first = await fixture(0),
    second = await fixture(1);
  expect(() =>
    readServiceSourceLineage({
      ...first.first,
      property: second.first.property,
    }),
  ).toThrow();
  expect(() => readServiceSourceLineage(first.first)).not.toThrow();
  expect(() => readServiceSourceLineage(second.first)).not.toThrow();
});
