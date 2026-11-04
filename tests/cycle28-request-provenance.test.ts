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
  vi.unstubAllEnvs();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    job = entry.target.job_id!,
    view = await readServiceRequestActions(sources, job, gate),
    expected = inspectServiceRequestActions(view),
    evidence = await readServiceRequestEvidence(
      view,
      sources,
      job,
      expected,
      gate,
    );
  return { gate, sources, entry, job, view, expected, evidence };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: inquiry and issued job sources stay exact without inventing a request-to-job foreign key`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.sources.company.id),
      canonical = f.sources.estimates.readSyntheticPrototypeSources(
        f.entry.target,
      ),
      writer = vi.spyOn(f.sources.operations, 'assignIntake');
    const lineage = inspectServiceRequestEvidence(
        f.view,
        f.evidence,
        f.expected,
      ),
      request = f.sources.operations.syntheticIntakeRequest(
        f.sources.company.id,
        f.entry.target.customer_id,
        f.entry.target.location_id,
        f.expected.request_id,
      );
    expect(lineage.request.id).toBe(request.id);
    expect(lineage.request.summary).toBe(request.summary);
    expect(lineage.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(lineage.scope).toMatchObject({
      job_id: f.job,
      estimate_id: f.entry.target.estimate_id,
      issued_version_id: f.entry.target.version_id,
    });
    expect(lineage.physical_completion).toBe('UNKNOWN');
    expect(lineage.customer_acceptance).toBe('UNKNOWN');
    expect(writer).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    expect(
      f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
    ).toEqual(canonical);
  });
  it(`brand ${brand}: another actual selected job cannot replace the original request evidence context`, async () => {
    const f = await fixture(brand),
      other = f.sources.entries.find((e) => e.target.job_id !== f.job)!;
    await expect(
      readServiceRequestEvidence(
        f.view,
        f.sources,
        other.target.job_id!,
        f.expected,
        f.gate,
      ),
    ).rejects.toThrow('Exact original selected request job');
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
    ).not.toThrow();
  });
  it(`brand ${brand}: a real same-property sibling job report cannot substitute for the original issued-job report`, async () => {
    const f = await fixture(brand),
      other = f.sources.entries.find(
        (e) =>
          e.target.job_id !== f.job &&
          e.target.location_id === f.entry.target.location_id,
      )!;
    expect(other).toBeDefined();
    const view = await readServiceRequestActions(
        f.sources,
        other.target.job_id!,
        f.gate,
      ),
      expected = inspectServiceRequestActions(view),
      evidence = await readServiceRequestEvidence(
        view,
        f.sources,
        other.target.job_id!,
        expected,
        f.gate,
      ),
      foreign = inspectServiceRequestEvidence(view, evidence, expected)
        .reports[0].reference;
    await expect(
      inspectServiceRequestReport(f.view, f.evidence, f.expected, foreign),
    ).rejects.toThrow('Exact retained published report reference');
    const original = inspectServiceRequestEvidence(
      f.view,
      f.evidence,
      f.expected,
    ).reports[0].reference;
    expect(
      (
        await inspectServiceRequestReport(
          f.view,
          f.evidence,
          f.expected,
          original,
        )
      ).report.reference,
    ).toEqual(original);
  });
  it(`brand ${brand}: copied or accessor-bearing report references are not retained publication authority`, async () => {
    const f = await fixture(brand),
      reference = inspectServiceRequestEvidence(f.view, f.evidence, f.expected)
        .reports[0].reference,
      hook = vi.fn(() => reference.report_id),
      bad = Object.defineProperty({ ...reference }, 'report_id', { get: hook });
    await expect(
      inspectServiceRequestReport(f.view, f.evidence, f.expected, {
        ...reference,
      }),
    ).rejects.toThrow();
    await expect(
      inspectServiceRequestReport(f.view, f.evidence, f.expected, bad),
    ).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
    expect(
      (
        await inspectServiceRequestReport(
          f.view,
          f.evidence,
          f.expected,
          reference,
        )
      ).report.reference,
    ).toEqual(reference);
  });
  it(`brand ${brand}: current revocation denies retained source/report detail without executing supplied hooks`, async () => {
    const f = await fixture(brand),
      reference = inspectServiceRequestEvidence(f.view, f.evidence, f.expected)
        .reports[0].reference,
      hook = vi.fn(() => reference.report_id),
      native = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      );
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        native(org).map((m) =>
          m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
        ),
    );
    await expect(
      inspectServiceRequestReport(
        f.view,
        f.evidence,
        f.expected,
        Object.defineProperty({ ...reference }, 'report_id', { get: hook }),
      ),
    ).rejects.toThrow();
    expect(hook).not.toHaveBeenCalled();
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
    ).toThrow();
  });
  it(`brand ${brand}: a current native reported-concern change invalidates earlier report continuity`, async () => {
    const f = await fixture(brand),
      reference = inspectServiceRequestEvidence(f.view, f.evidence, f.expected)
        .reports[0].reference;
    const rows = (
      f.sources.operations as unknown as {
        requests: { id: string; summary: string }[];
      }
    ).requests;
    rows.find((r) => r.id === f.expected.request_id)!.summary +=
      ' changed actual intake concern';
    await expect(
      inspectServiceRequestReport(f.view, f.evidence, f.expected, reference),
    ).rejects.toThrow();
  });
}
it('default-OFF inquiry continuity rejects all untrusted source hooks before original readers', async () => {
  const hook = vi.fn(),
    bad = Object.defineProperty({}, 'company', { get: hook });
  await expect(
    readServiceRequestEvidence(
      bad as never,
      bad as never,
      'foreign',
      bad as never,
    ),
  ).rejects.toThrow('OFF');
  expect(hook).not.toHaveBeenCalled();
});
