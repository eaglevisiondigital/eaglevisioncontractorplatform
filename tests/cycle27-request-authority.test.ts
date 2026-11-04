import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  readServiceRequestEvidence,
  inspectServiceRequestEvidence,
  inspectServiceRequestReport,
  reconcileServiceRequestAction,
  saveServiceRequestAction,
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
  it(`brand ${brand}: exact own original request snapshot joins only the original published source without consuming custody`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.sources.company.id),
      writer = vi.spyOn(f.sources.operations, 'assignIntake'),
      lineage = inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
      report = await inspectServiceRequestReport(
        f.view,
        f.evidence,
        f.expected,
        lineage.reports[0].reference,
      );
    expect(lineage.request.id).toBe(f.expected.request_id);
    expect(report.report.reference).toEqual(lineage.reports[0].reference);
    expect(report.completion?.job.reference.job_id).toBe(f.job);
    expect(lineage.physical_completion).toBe('UNKNOWN');
    expect(lineage.customer_acceptance).toBe('UNKNOWN');
    expect(inspectServiceRequestActions(f.view).can_edit).toBe(true);
    expect(writer).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
  });
  for (const key of ['request_id', 'status', 'eligible_assignees'] as const)
    it(`brand ${brand}: expected ${key} accessor is denied without executing its hook`, async () => {
      const f = await fixture(brand),
        hook = vi.fn(() => f.expected[key]),
        supplied = Object.defineProperty({ ...f.expected }, key, { get: hook });
      expect(() =>
        inspectServiceRequestEvidence(f.view, f.evidence, supplied),
      ).toThrow();
      expect(hook).not.toHaveBeenCalled();
      expect(() =>
        inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
      ).not.toThrow();
    });
  it(`brand ${brand}: inherited or extra fields cannot impersonate the exact own request snapshot`, async () => {
    const f = await fixture(brand);
    expect(() =>
      inspectServiceRequestEvidence(
        f.view,
        f.evidence,
        Object.create(f.expected),
      ),
    ).toThrow();
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, {
        ...f.expected,
        customer_approval: true,
      } as never),
    ).toThrow();
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
    ).not.toThrow();
  });
  it(`brand ${brand}: stale request state denies exact original report continuity and never chooses a newer request`, async () => {
    const f = await fixture(brand),
      reference = inspectServiceRequestEvidence(f.view, f.evidence, f.expected)
        .reports[0].reference;
    await f.sources.operations.assignIntake(
      f.sources.company.id,
      f.expected.request_id,
      null,
      'qualified',
    );
    const writer = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, f.expected),
    ).toThrow();
    await expect(
      inspectServiceRequestReport(f.view, f.evidence, f.expected, reference),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: revoked original authorization denies before untrusted expected hooks`, async () => {
    const f = await fixture(brand),
      original = f.sources.operations.syntheticMemberships.bind(
        f.sources.operations,
      ),
      hook = vi.fn(() => f.expected.request_id);
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        original(org).map((m) =>
          m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
        ),
    );
    const supplied = Object.defineProperty({ ...f.expected }, 'request_id', {
      get: hook,
    });
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, supplied),
    ).toThrow();
    expect(hook).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: a lost original ACK remains UNKNOWN after rejected expected input and exact read-only observation`, async () => {
    const f = await fixture(brand),
      native = f.sources.operations.assignIntake.bind(f.sources.operations),
      writer = vi
        .spyOn(f.sources.operations, 'assignIntake')
        .mockImplementation(async (...args) => {
          await native(...args);
          throw Error('lost original ACK');
        }),
      input = {
        request_id: f.expected.request_id,
        status: 'reviewing',
        assigned_to: null,
        expected_status: f.expected.status,
        expected_assigned_to: f.expected.assigned_to,
        expected_updated_at: f.expected.updated_at,
      };
    await expect(saveServiceRequestAction(f.view, input, true)).rejects.toThrow(
      'lost original ACK',
    );
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, {
        ...f.expected,
        status: 'reviewing',
      }),
    ).toThrow();
    expect(await reconcileServiceRequestAction(f.view)).toMatchObject({
      state: 'UNKNOWN',
      replay: 'FORBIDDEN',
      durable_receipt: false,
    });
    await expect(
      saveServiceRequestAction(f.view, input, true),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
  });
}
it('default OFF denies before expected/source hooks', async () => {
  const hook = vi.fn(),
    supplied = Object.defineProperty({}, 'request_id', { get: hook });
  await expect(
    readServiceRequestEvidence(
      supplied as never,
      supplied as never,
      'not-a-job',
      supplied as never,
    ),
  ).rejects.toThrow('OFF');
  expect(hook).not.toHaveBeenCalled();
});
it('foreign company evidence remains denied under an otherwise exact snapshot', async () => {
  const first = await fixture(),
    foreign = await fixture(1);
  expect(() =>
    inspectServiceRequestEvidence(first.view, foreign.evidence, first.expected),
  ).toThrow();
});
