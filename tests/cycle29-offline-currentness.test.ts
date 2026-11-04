import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  reviewOperationsExperiments,
  reconcileOperationsExperiment,
  type OperationsExperimentInput,
} from '../src/lib/operations-experiments';
import {
  readSyncAdmissionSource,
  syncSourceReference,
} from '../src/lib/workflows/sync-admission-review';
import {
  reviewOfflineSourceAdmission,
  reconcileOfflineSourceAdmission,
  type OfflineSourceProtocol,
} from '../src/lib/workflows/offline-source-admission';
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
    model = await readFieldWorkOrders(
      sources.property,
      sources.company.id,
      entry.target.actor_id,
    ),
    order = model.orders.find((o) => o.source.job_id === entry.target.job_id)!,
    visit = order.visits.find((v) => v.id === entry.scheduled_visit_id)!;
  const input: OperationsExperimentInput = {
    day: entry.day,
    timezone: entry.timezone,
    booking: {
      order,
      worker_id: entry.worker_id,
      visit_id: visit.id,
      start: null,
      end: null,
    },
    other_windows: [],
    proposed_hours: [],
    route: [{ order, visit_id: visit.id }],
    capture: {
      order,
      visit_id: visit.id,
      note: 'Unsaved synthetic field observation; no completed work.',
    },
  };
  const experiment = await reviewOperationsExperiments(
      sources.property,
      sources.company.id,
      entry.target.actor_id,
      input,
      gate,
    ),
    requirements = await readSyncAdmissionSource(
      sources,
      {
        job_id: entry.target.job_id!,
        kind: 'offline',
        edition: 'property_services',
        note: 'Explicit offline protocol source review only.',
        review_on: entry.day,
        manual_priority: 'normal',
      },
      gate,
    ),
    native = experiment.offline_capture.source,
    envelope = {
      mode: 'OFFLINE_SOURCE_ADMISSION_V1',
      external_reference: 'synthetic-offline-visit-1',
      source: syncSourceReference(requirements),
      visit: {
        visit_id: native.visit_id,
        visit_revision: native.visit_revision,
        plan_id: native.plan_id,
        plan_revision: native.plan_revision,
      },
    } as OfflineSourceProtocol;
  return {
    gate,
    sources,
    entry,
    visit,
    input,
    experiment,
    requirements,
    envelope,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const run = (f: Fixture, input: unknown = f.envelope) =>
  reviewOfflineSourceAdmission(f.requirements, f.experiment, input, f.gate);
function revoke(f: Fixture) {
  const original = f.sources.operations.syntheticMemberships.bind(
    f.sources.operations,
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      original(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
}
async function comparison(f: Fixture) {
  return run(f);
}
const reconcile = (
  f: Fixture,
  result: Awaited<ReturnType<typeof run>>,
  input: unknown = f.envelope,
) =>
  reconcileOfflineSourceAdmission(
    result,
    f.requirements,
    f.experiment,
    input,
    f.gate,
  );
for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: concurrent exact original reads share no new claim or writer`, async () => {
    const f = await fixture(brand),
      original = await comparison(f),
      writer = vi.spyOn(f.sources.property, 'saveVisit'),
      digest = vi.spyOn(crypto.subtle, 'digest');
    const results = await Promise.all([
      reconcile(f, original),
      reconcile(f, original),
    ]);
    expect(results[0]).toEqual(results[1]);
    for (const out of results)
      expect(out).toMatchObject({
        status: 'CURRENT_EXACT_READ_ONLY',
        replay: 'FORBIDDEN',
        replacement: null,
        operational_ready: false,
        durable_receipt: false,
      });
    expect(writer).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: one malformed concurrent proposal cannot poison the valid original read`, async () => {
    const f = await fixture(brand),
      original = await comparison(f),
      bad = structuredClone(f.envelope),
      writer = vi.spyOn(f.sources.property, 'saveVisit'),
      digest = vi.spyOn(crypto.subtle, 'digest');
    bad.visit.plan_revision = -1;
    const [invalid, exact] = await Promise.all([
      reconcile(f, original, bad),
      reconcile(f, original),
    ]);
    expect(invalid).toMatchObject({
      status: 'UNKNOWN',
      reason: 'EXTERNAL_PROTOCOL_INVALID',
      replay: 'FORBIDDEN',
      replacement: null,
    });
    expect(invalid).not.toHaveProperty('mismatches');
    expect(exact).toMatchObject({
      status: 'CURRENT_EXACT_READ_ONLY',
      replay: 'FORBIDDEN',
      operational_ready: false,
      durable_receipt: false,
    });
    expect(writer).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: original revocation during the second native read remains UNKNOWN with no later replay`, async () => {
    const f = await fixture(brand),
      original = await comparison(f),
      native = f.sources.estimates.jobs.bind(f.sources.estimates);
    let reads = 0;
    vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(
      async (...args) => {
        const rows = await native(...args);
        if (++reads === 2) revoke(f);
        return rows;
      },
    );
    const out = await reconcile(f, original);
    expect(reads).toBe(2);
    expect(out).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED',
      replay: 'FORBIDDEN',
      replacement: null,
      operational_ready: false,
      durable_receipt: false,
    });
    expect(out).not.toHaveProperty('mismatches');
    expect(await reconcile(f, original)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
      replay: 'FORBIDDEN',
    });
    expect(reads).toBe(2);
  });
  it(`brand ${brand}: actual native visit drift during the second read preserves the original conservative UNKNOWN`, async () => {
    const f = await fixture(brand),
      original = await comparison(f),
      writer = vi.spyOn(f.sources.property, 'saveVisit'),
      digest = vi.spyOn(crypto.subtle, 'digest'),
      native = f.sources.estimates.jobs.bind(f.sources.estimates);
    let reads = 0;
    vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(
      async (...args) => {
        const rows = await native(...args);
        if (++reads === 2) {
          const visit = f.sources.property
            .read(f.sources.company.id)
            .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
          f.sources.property.saveVisit(f.sources.company.id, visit, {
            ...visit.content,
            summary: 'Explicit new synthetic source observation',
          });
        }
        return rows;
      },
    );
    const out = await reconcile(f, original);
    expect(reads).toBe(2);
    expect(out).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
    });
    expect(out).not.toHaveProperty('mismatches');
    expect(await reconcileOperationsExperiment(f.experiment)).toMatchObject({
      state: 'STALE',
      reason: 'SOURCE_CHANGED',
      replay: 'FORBIDDEN',
    });
    expect(await reconcile(f, original)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
      replay: 'FORBIDDEN',
    });
    expect(writer).toHaveBeenCalledTimes(1); // Only the explicit test source change.
    expect(digest).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: malformed live protocol after the second native read stays value-free and can only be reread exactly`, async () => {
    const f = await fixture(brand),
      original = await comparison(f),
      native = f.sources.estimates.jobs.bind(f.sources.estimates),
      visit = structuredClone(f.envelope.visit),
      hook = vi.fn(() => visit);
    let reads = 0;
    vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(
      async (...args) => {
        const rows = await native(...args);
        if (++reads === 2)
          Object.defineProperty(f.envelope, 'visit', {
            get: hook,
            configurable: true,
          });
        return rows;
      },
    );
    const out = await reconcile(f, original);
    expect(reads).toBe(2);
    expect(out).toMatchObject({
      status: 'UNKNOWN',
      reason: 'EXTERNAL_PROTOCOL_INVALID',
      replay: 'FORBIDDEN',
      replacement: null,
      operational_ready: false,
      durable_receipt: false,
    });
    expect(hook).not.toHaveBeenCalled();
    expect(out).not.toHaveProperty('mismatches');
    expect(JSON.stringify(out)).not.toContain(visit.visit_id);
    Object.defineProperty(f.envelope, 'visit', {
      value: visit,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    expect(await reconcile(f, original)).toMatchObject({
      status: 'CURRENT_EXACT_READ_ONLY',
      replay: 'FORBIDDEN',
      durable_receipt: false,
      operational_ready: false,
    });
  });
}
