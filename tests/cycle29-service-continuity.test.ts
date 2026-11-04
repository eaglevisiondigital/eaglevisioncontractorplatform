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
  it(`brand ${brand}: closed intake review retains exact published history without completing work or renewing its one-use action`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.sources.company.id),
      writer = vi.spyOn(f.sources.operations, 'assignIntake');
    await saveServiceRequestAction(
      f.view,
      {
        request_id: f.expected.request_id,
        status: 'closed',
        assigned_to: null,
        expected_status: f.expected.status,
        expected_assigned_to: f.expected.assigned_to,
        expected_updated_at: f.expected.updated_at,
      },
      true,
    );
    const view = await readServiceRequestActions(f.sources, f.job, f.gate),
      expected = inspectServiceRequestActions(view),
      evidence = await readServiceRequestEvidence(
        view,
        f.sources,
        f.job,
        expected,
        f.gate,
      ),
      lineage = inspectServiceRequestEvidence(view, evidence, expected),
      reference = lineage.reports[0].reference,
      report = await inspectServiceRequestReport(
        view,
        evidence,
        expected,
        reference,
      );
    expect(expected).toMatchObject({
      status: 'closed',
      state: 'KNOWN_SAVED',
      can_edit: false,
      durable_receipt: false,
    });
    expect(report.report.reference).toEqual(reference);
    expect(report.completion?.job.reference.job_id).toBe(f.job);
    expect(report.completion?.interpretation.physical_completion).toBe(
      'UNVERIFIED',
    );
    expect(lineage.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(lineage.customer_acceptance).toBe('UNKNOWN');
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    expect(writer).toHaveBeenCalledTimes(1);
    const native = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
    vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
      (org) =>
        native(org).map((m) =>
          m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
        ),
    );
    await expect(
      inspectServiceRequestReport(view, evidence, expected, reference),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
  });
  it(`brand ${brand}: lost intake ACK permits only exact current-authorized report reads and never clears original UNKNOWN`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.sources.company.id),
      native = f.sources.operations.assignIntake.bind(f.sources.operations),
      writer = vi
        .spyOn(f.sources.operations, 'assignIntake')
        .mockImplementation(async (...args) => {
          await native(...args);
          throw Error('Lost original intake ACK');
        });
    await expect(
      saveServiceRequestAction(
        f.view,
        {
          request_id: f.expected.request_id,
          status: 'closed',
          assigned_to: null,
          expected_status: f.expected.status,
          expected_assigned_to: f.expected.assigned_to,
          expected_updated_at: f.expected.updated_at,
        },
        true,
      ),
    ).rejects.toThrow('Lost original intake ACK');
    const view = await readServiceRequestActions(f.sources, f.job, f.gate),
      expected = inspectServiceRequestActions(view),
      evidence = await readServiceRequestEvidence(
        view,
        f.sources,
        f.job,
        expected,
        f.gate,
      ),
      lineage = inspectServiceRequestEvidence(view, evidence, expected),
      reference = lineage.reports[0].reference,
      report = await inspectServiceRequestReport(
        view,
        evidence,
        expected,
        reference,
      );
    expect(report.report.reference).toEqual(reference);
    expect(lineage.physical_completion).toBe('UNKNOWN');
    expect(lineage.customer_acceptance).toBe('UNKNOWN');
    expect(expected).toMatchObject({
      status: 'closed',
      state: 'UNKNOWN',
      can_edit: false,
      replay: 'FORBIDDEN',
      durable_receipt: false,
      native_cas: false,
    });
    expect(await reconcileServiceRequestAction(view)).toMatchObject({
      state: 'UNKNOWN',
      replay: 'FORBIDDEN',
      durable_receipt: false,
      attribution: 'CURRENT_ROW_OBSERVATION_ONLY',
    });
    await expect(
      saveServiceRequestAction(
        view,
        {
          request_id: expected.request_id,
          status: 'qualified',
          assigned_to: null,
          expected_status: expected.status,
          expected_assigned_to: expected.assigned_to,
          expected_updated_at: expected.updated_at,
        },
        true,
      ),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
  });
}
