import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readServiceRequestActions,
  inspectServiceRequestActions,
  readServiceRequestEvidence,
  assertServiceRequestObservationAccess,
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
function input(f: Fixture) {
  return {
    request_id: f.expected.request_id,
    status: 'reviewing',
    assigned_to: null,
    expected_status: f.expected.status,
    expected_assigned_to: f.expected.assigned_to,
    expected_updated_at: f.expected.updated_at,
  };
}
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: an observed original request remains under current original authority`, async () => {
    const f = await fixture(brand),
      observation = await reconcileServiceRequestAction(f.view),
      before = f.sources.property.read(f.sources.company.id),
      writer = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(observation.current?.request_id).toBe(f.expected.request_id);
    expect(() => assertServiceRequestObservationAccess(f.view)).not.toThrow();
    expect(observation).toMatchObject({
      durable_receipt: false,
      native_cas: false,
      attribution: 'CURRENT_ROW_OBSERVATION_ONLY',
      replay: 'FORBIDDEN',
    });
    expect(writer).not.toHaveBeenCalled();
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
  });
  it(`brand ${brand}: later staff revocation withholds retained observation access`, async () => {
    const f = await fixture(brand),
      observation = await reconcileServiceRequestAction(f.view);
    expect(observation.current).toBeTruthy();
    revoke(f);
    expect(() => assertServiceRequestObservationAccess(f.view)).toThrow();
    await expect(reconcileServiceRequestAction(f.view)).rejects.toThrow();
  });
  it(`brand ${brand}: exact saved request is still observable without requiring its old version to be current`, async () => {
    const f = await fixture(brand),
      original = await reconcileServiceRequestAction(f.view);
    await saveServiceRequestAction(f.view, input(f), true);
    const observed = await reconcileServiceRequestAction(f.view),
      writer = vi.spyOn(f.sources.operations, 'assignIntake');
    expect(() => assertServiceRequestObservationAccess(f.view)).not.toThrow();
    expect(observed).toMatchObject({
      state: 'KNOWN_SAVED',
      observed: 'EXACT_CURRENT_ROW_OBSERVED',
      durable_receipt: false,
      replay: 'FORBIDDEN',
    });
    expect(original.current?.status).toBe(f.expected.status);
    expect(observed.current?.status).toBe('reviewing');
    await expect(
      saveServiceRequestAction(f.view, input(f), true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: a lost original ACK stays UNKNOWN through allowed observation and later revocation`, async () => {
    const f = await fixture(brand),
      native = f.sources.operations.assignIntake.bind(f.sources.operations),
      writer = vi
        .spyOn(f.sources.operations, 'assignIntake')
        .mockImplementation(async (...args) => {
          await native(...args);
          throw Error('lost ACK');
        });
    await expect(
      saveServiceRequestAction(f.view, input(f), true),
    ).rejects.toThrow('lost ACK');
    const observation = await reconcileServiceRequestAction(f.view);
    expect(() => assertServiceRequestObservationAccess(f.view)).not.toThrow();
    expect(observation).toMatchObject({
      state: 'UNKNOWN',
      replay: 'FORBIDDEN',
      durable_receipt: false,
    });
    revoke(f);
    expect(() => assertServiceRequestObservationAccess(f.view)).toThrow();
    await expect(
      saveServiceRequestAction(f.view, input(f), true),
    ).rejects.toThrow();
    expect(writer).toHaveBeenCalledTimes(1);
  });
}
it('gate loss withholds observation access without renewing original eligibility', async () => {
  const f = await fixture(),
    observation = await reconcileServiceRequestAction(f.view);
  expect(observation.current?.request_id).toBe(f.expected.request_id);
  f.gate.confirmed = false;
  expect(() => assertServiceRequestObservationAccess(f.view)).toThrow();
});
it('copied observation view cannot replace the original registered access owner', async () => {
  const f = await fixture();
  expect(() =>
    assertServiceRequestObservationAccess(structuredClone(f.view)),
  ).toThrow();
  expect(() => assertServiceRequestObservationAccess(f.view)).not.toThrow();
});
it('production/non-loopback/OFF admission cannot expose retained row detail', async () => {
  const f = await fixture();
  vi.stubGlobal('window', {
    location: { hostname: 'example.invalid', protocol: 'https:' },
  });
  expect(() => assertServiceRequestObservationAccess(f.view)).toThrow();
});
