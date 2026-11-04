import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  reviewOperationsExperiments,
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
  for (const invalidation of [
    'accessor',
    'missing',
    'extra',
    'negative-revision',
    'invalid-digest',
  ] as const)
    it(`brand ${brand}: ${invalidation} live protocol after original read is invalid, never a source-conflict diagnosis`, async () => {
      const f = await fixture(brand),
        result = await comparison(f),
        native = f.sources.estimates.jobs.bind(f.sources.estimates),
        hook = vi.fn(() => f.envelope.visit);
      let changed = false;
      vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(
        async (...args) => {
          const rows = await native(...args);
          if (!changed) {
            changed = true;
            if (invalidation === 'accessor')
              Object.defineProperty(f.envelope, 'visit', {
                get: hook,
                configurable: true,
              });
            else if (invalidation === 'missing')
              Reflect.deleteProperty(f.envelope.visit, 'plan_id');
            else if (invalidation === 'extra')
              Object.assign(f.envelope.visit, { retry: true });
            else if (invalidation === 'negative-revision')
              f.envelope.visit.visit_revision = -1;
            else f.envelope.source.source_sha256 = 'not-a-digest';
          }
          return rows;
        },
      );
      const writer = vi.spyOn(f.sources.property, 'saveVisit'),
        digest = vi.spyOn(crypto.subtle, 'digest'),
        out = await reconcile(f, result);
      expect(changed).toBe(true);
      expect(out).toMatchObject({
        status: 'UNKNOWN',
        reason: 'EXTERNAL_PROTOCOL_INVALID',
        replay: 'FORBIDDEN',
        replacement: null,
        operational_ready: false,
        durable_receipt: false,
      });
      expect(out).not.toHaveProperty('mismatches');
      expect(hook).not.toHaveBeenCalled();
      expect(writer).not.toHaveBeenCalled();
      expect(digest).not.toHaveBeenCalled();
    });
  it(`brand ${brand}: gate withdrawal during original native read stays explicitly not admitted`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      native = f.sources.estimates.jobs.bind(f.sources.estimates);
    let changed = false;
    vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(
      async (...args) => {
        const rows = await native(...args);
        if (!changed) {
          changed = true;
          f.gate.enabled = false;
        }
        return rows;
      },
    );
    const out = await reconcile(f, result);
    expect(out).toMatchObject({
      status: 'UNKNOWN',
      reason: 'LOCAL_REVIEW_NOT_ADMITTED',
      replay: 'FORBIDDEN',
    });
    expect(out).not.toHaveProperty('mismatches');
  });
  it(`brand ${brand}: malformed external input does not create an execution outcome or replace the retained exact comparison`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      invalid = {
        ...f.envelope,
        visit: { ...f.envelope.visit, plan_revision: -1 },
      },
      before = f.sources.property.read(f.sources.company.id);
    expect(await reconcile(f, result, invalid)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'EXTERNAL_PROTOCOL_INVALID',
    });
    expect(await reconcile(f, result)).toMatchObject({
      status: 'CURRENT_EXACT_READ_ONLY',
      replay: 'FORBIDDEN',
      durable_receipt: false,
      operational_ready: false,
      replacement: null,
    });
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
  });
  it(`brand ${brand}: revoked original reader takes precedence before malformed external access`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      hook = vi.fn(() => f.envelope.source);
    revoke(f);
    const input = Object.defineProperty({ ...f.envelope }, 'source', {
      get: hook,
    });
    expect(await reconcile(f, result, input)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
    });
    expect(hook).not.toHaveBeenCalled();
  });
}
it('default-OFF reconciliation does not read an external proposal or copied comparison', async () => {
  const hook = vi.fn(),
    bad = Object.defineProperty({}, 'source', { get: hook });
  expect(
    await reconcileOfflineSourceAdmission(
      bad as never,
      bad as never,
      bad as never,
      bad,
    ),
  ).toMatchObject({
    status: 'UNKNOWN',
    reason: 'LOCAL_REVIEW_NOT_ADMITTED',
    replay: 'FORBIDDEN',
  });
  expect(hook).not.toHaveBeenCalled();
});
