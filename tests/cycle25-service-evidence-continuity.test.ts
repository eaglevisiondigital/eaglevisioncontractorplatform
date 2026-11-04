import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readServiceSourceReview } from '../src/lib/workflows/service-source-review';
import { ServiceRequestActions } from '../src/components/workflows/ServiceRequestActions';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  readServiceRequestEvidence,
  inspectServiceRequestEvidence,
  inspectServiceRequestReport,
  saveServiceRequestAction,
  reconcileServiceRequestAction,
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
type Fixture = Awaited<ReturnType<typeof fixture>>;
function inspect(f: Fixture) {
  return inspectServiceRequestEvidence(f.view, f.evidence, f.expected);
}
function native(f: Fixture) {
  return f.sources.operations.syntheticIntakeRequest(
    f.sources.company.id,
    f.entry.target.customer_id,
    f.entry.target.location_id,
    f.entry.intake_request_id,
  );
}
function revoke(f: Fixture) {
  const fn = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      fn(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: native request content, exact issued scope and four completion requirements share the original form context`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.sources.company.id),
      row = native(f),
      result = inspect(f);
    expect(result.request).toEqual({
      id: row.id,
      status: row.status,
      summary: row.summary,
    });
    expect(result.property).toMatchObject({
      organization_id: f.sources.company.id,
      customer_id: f.expected.customer_id,
      location_id: f.expected.location_id,
    });
    expect(result.scope).toMatchObject({
      job_id: f.job,
      estimate_id: f.view.identity.estimate_id,
      issued_version_id: f.view.identity.version_id,
    });
    expect(result.required_proof).toHaveLength(4);
    expect(result.required_proof.every((r) => r.status === 'UNKNOWN')).toBe(
      true,
    );
    expect(result.request_job_link).toBe(
      'UNKNOWN_ABSENT_FROM_CURRENT_SOURCE_CONTRACT',
    );
    expect(result.physical_completion).toBe('UNKNOWN');
    expect(result.customer_acceptance).toBe('UNKNOWN');
    expect(result.history_completeness).toBe('UNKNOWN');
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    expect(f.expected.can_edit).toBe(true);
  });
  it(`brand ${brand}: exact published report versions expose native finding IDs and positions without completion inference`, async () => {
    const f = await fixture(brand),
      row = inspect(f).reports[0];
    expect(row).toBeTruthy();
    const result = await inspectServiceRequestReport(
      f.view,
      f.evidence,
      f.expected,
      row.reference,
    );
    expect(result.report.reference).toEqual(row.reference);
    expect(result.completion?.job.reference.job_id).toBe(f.job);
    expect(result.completion?.job.reference.issued_version_id).toBe(
      f.view.identity.version_id,
    );
    expect(result.report.observations.length).toBeGreaterThan(0);
    for (const [index, finding] of result.report.observations.entries()) {
      expect(finding.reference).toMatchObject({
        ...row.reference,
        kind: 'finding',
        source_index: index,
      });
      expect(finding.reference.finding_id).toBeTruthy();
    }
    expect(result.completion?.interpretation.physical_completion).toBe(
      'UNVERIFIED',
    );
    expect(JSON.stringify(result)).not.toMatch(
      /unit_cost|internal_notes|cash_hour|margin|deduction/,
    );
  });
  it(`brand ${brand}: same-property sibling job cannot replace the selected original scope`, async () => {
    const f = await fixture(brand),
      sibling = f.sources.entries.find(
        (e) =>
          e.target.job_id !== f.job &&
          e.target.location_id === f.entry.target.location_id,
      )!;
    expect(sibling).toBeTruthy();
    const other = await readServiceSourceReview(
      f.sources,
      { job_id: sibling.target.job_id!, staff_context_confirmed: true },
      f.gate,
    );
    expect(() =>
      inspectServiceRequestEvidence(f.view, other, f.expected),
    ).toThrow();
    expect(() => inspect(f)).not.toThrow();
  });
  it(`brand ${brand}: changed responsibility or status withholds old evidence without writing`, async () => {
    const f = await fixture(brand);
    await f.sources.operations.assignIntake(
      f.sources.company.id,
      f.expected.request_id,
      f.entry.target.actor_id,
      'qualified',
    );
    const writer = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(() => inspect(f)).toThrow();
    expect(writer).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: revoked reviewer cannot inspect retained concern or published report`, async () => {
    const f = await fixture(brand),
      ref = inspect(f).reports[0].reference;
    revoke(f);
    expect(() => inspect(f)).toThrow();
    await expect(
      inspectServiceRequestReport(f.view, f.evidence, f.expected, ref),
    ).rejects.toThrow();
  });
  it(`brand ${brand}: concurrent read-only report actions share original state and never consume request attempt`, async () => {
    const f = await fixture(brand),
      ref = inspect(f).reports[0].reference,
      writer = vi.spyOn(f.sources.operations, 'assignIntake'),
      results = await Promise.all([
        inspectServiceRequestReport(f.view, f.evidence, f.expected, ref),
        inspectServiceRequestReport(f.view, f.evidence, f.expected, ref),
      ]);
    expect(results[0]).toEqual(results[1]);
    expect(writer).not.toHaveBeenCalled();
    expect(inspectServiceRequestActions(f.view).can_edit).toBe(true);
  });
}
for (const field of [
  'request_id',
  'organization_id',
  'customer_id',
  'location_id',
  'status',
  'assigned_to',
  'updated_at',
] as const)
  it(`foreign expected ${field} cannot join an otherwise current original reader`, async () => {
    const f = await fixture();
    expect(() =>
      inspectServiceRequestEvidence(f.view, f.evidence, {
        ...f.expected,
        [field]: 'foreign',
      }),
    ).toThrow();
  });
it('a foreign company reader cannot expose another company concern or evidence', async () => {
  const f = await fixture(),
    other = await fixture(1);
  expect(() =>
    inspectServiceRequestEvidence(f.view, other.evidence, f.expected),
  ).toThrow();
});
it('unretained copied readers are not a request or published-evidence capability', async () => {
  const f = await fixture();
  expect(() =>
    inspectServiceRequestEvidence({ ...f.view }, f.evidence, f.expected),
  ).toThrow();
  expect(() =>
    inspectServiceRequestEvidence(
      f.view,
      structuredClone(f.evidence),
      f.expected,
    ),
  ).toThrow();
});
it('default OFF rejects before source getters and mounts no customer concern', async () => {
  const getter = vi.fn(() => {
      throw Error('source getter');
    }),
    bad = Object.defineProperty({}, 'identity', { get: getter });
  await expect(
    readServiceRequestEvidence(bad as never, bad as never, 'job', bad as never),
  ).rejects.toThrow('OFF');
  expect(getter).not.toHaveBeenCalled();
  const markup = renderToStaticMarkup(
    createElement(ServiceRequestActions, {
      enabled: false,
      sources: bad as never,
      selectedJobId: 'job',
    }),
  );
  expect(markup).toContain('Local request actions are OFF');
  expect(markup).not.toContain('Reported concern');
});
it('a lost native ACK remains UNKNOWN after exact service read and never permits replay', async () => {
  const f = await fixture(),
    original = f.sources.operations.assignIntake.bind(f.sources.operations),
    writer = vi
      .spyOn(f.sources.operations, 'assignIntake')
      .mockImplementation(async (...args) => {
        await original(...args);
        throw Error('lost ACK');
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
    'lost ACK',
  );
  expect(() => inspect(f)).toThrow();
  expect(await reconcileServiceRequestAction(f.view)).toMatchObject({
    state: 'UNKNOWN',
    durable_receipt: false,
    replay: 'FORBIDDEN',
  });
  await expect(saveServiceRequestAction(f.view, input, true)).rejects.toThrow();
  expect(writer).toHaveBeenCalledTimes(1);
});
it('wrong report version does not fall back to another available published version', async () => {
  const f = await fixture(),
    ref = inspect(f).reports[0].reference;
  await expect(
    inspectServiceRequestReport(f.view, f.evidence, f.expected, {
      ...ref,
      published_version: 999,
    }),
  ).rejects.toThrow();
});
it('source revocation during original evidence hashing denies before returning retained detail', async () => {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[0], gate),
    job = sources.entries[0].target.job_id!,
    view = await readServiceRequestActions(sources, job, gate),
    expected = inspectServiceRequestActions(view),
    original = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (!changed) {
      changed = true;
      gate.confirmed = false;
    }
    return result;
  });
  await expect(
    readServiceRequestEvidence(view, sources, job, expected, gate),
  ).rejects.toThrow();
  expect(changed).toBe(true);
});
