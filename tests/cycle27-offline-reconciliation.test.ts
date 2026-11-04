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
  for (const field of [
    'visit_id',
    'visit_revision',
    'plan_id',
    'plan_revision',
  ] as const)
    it(`brand ${brand}: UNKNOWN native ${field} conflict names only the exact differing field`, async () => {
      const f = await fixture(brand),
        result = await comparison(f),
        bad = structuredClone(f.envelope);
      if (field === 'visit_revision' || field === 'plan_revision')
        bad.visit[field]++;
      else bad.visit[field] = crypto.randomUUID();
      const writer = vi.spyOn(f.sources.property, 'saveVisit'),
        digest = vi.spyOn(crypto.subtle, 'digest'),
        out = await reconcile(f, result, bad);
      expect(out).toMatchObject({
        status: 'UNKNOWN',
        reason: 'EXACT_BINDING_OR_LIVE_PROTOCOL_UNVERIFIED',
        mismatches: [`visit.${field}`],
        replay: 'FORBIDDEN',
        replacement: null,
        durable_receipt: false,
        operational_ready: false,
      });
      expect(JSON.stringify(out)).not.toContain(String(bad.visit[field]));
      expect(writer).not.toHaveBeenCalled();
      expect(digest).not.toHaveBeenCalled();
      expect((await reconcile(f, result)).status).toBe(
        'CURRENT_EXACT_READ_ONLY',
      );
    });
  it(`brand ${brand}: multiple canonical and native conflicts stay finite, ordered and value-free`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      bad = structuredClone(f.envelope);
    bad.source.customer_id = crypto.randomUUID();
    bad.source.saved_lock_revision++;
    bad.visit.visit_revision++;
    bad.visit.plan_id = crypto.randomUUID();
    const out = await reconcile(f, result, bad);
    expect(out).toMatchObject({
      status: 'UNKNOWN',
      mismatches: [
        'source.customer_id',
        'source.saved_lock_revision',
        'visit.visit_revision',
        'visit.plan_id',
      ],
      replay: 'FORBIDDEN',
    });
    expect(JSON.stringify(out)).not.toContain(bad.source.customer_id);
    expect(JSON.stringify(out)).not.toContain(bad.visit.plan_id);
  });
  it(`brand ${brand}: valid exact read has no conflict list and no preparation or execution authority`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      out = await reconcile(f, result);
    expect(out.status).toBe('CURRENT_EXACT_READ_ONLY');
    expect(out).not.toHaveProperty('mismatches');
    expect(out).not.toHaveProperty('reason');
    expect(out).toMatchObject({
      replay: 'FORBIDDEN',
      replacement: null,
      operational_ready: false,
      durable_receipt: false,
    });
  });
  it(`brand ${brand}: revocation does not read mismatching private source or claim a field diagnosis`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      hook = vi.fn(() => f.envelope.source);
    revoke(f);
    const bad = Object.defineProperty({ ...f.envelope }, 'source', {
        get: hook,
      }),
      out = await reconcile(f, result, bad);
    expect(out).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
    });
    expect(out).not.toHaveProperty('mismatches');
    expect(hook).not.toHaveBeenCalled();
  });
}
it('invalid external accessors produce only the existing protocol denial, with no hook or mismatch inference', async () => {
  const f = await fixture(),
    result = await comparison(f),
    hook = vi.fn(() => f.envelope.visit),
    bad = Object.defineProperty({ ...f.envelope }, 'visit', { get: hook }),
    out = await reconcile(f, result, bad);
  expect(out).toMatchObject({
    status: 'UNKNOWN',
    reason: 'EXTERNAL_PROTOCOL_INVALID',
  });
  expect(out).not.toHaveProperty('mismatches');
  expect(hook).not.toHaveBeenCalled();
});
it('a changed external reference is identified without revealing the untrusted label', async () => {
  const f = await fixture(),
    result = await comparison(f),
    bad = { ...f.envelope, external_reference: 'private-external-label' },
    out = await reconcile(f, result, bad);
  expect(out).toMatchObject({
    status: 'UNKNOWN',
    mismatches: ['external_reference'],
  });
  expect(JSON.stringify(out)).not.toContain(bad.external_reference);
});
it('a during-read external proposal change remains UNKNOWN with finite live-protocol diagnosis', async () => {
  const f = await fixture(),
    result = await comparison(f),
    native = f.sources.estimates.jobs.bind(f.sources.estimates);
  let changed = false;
  vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(async (...args) => {
    const rows = await native(...args);
    if (!changed) {
      changed = true;
      f.envelope.external_reference += '-changed';
    }
    return rows;
  });
  const out = await reconcile(f, result);
  expect(out).toMatchObject({
    status: 'UNKNOWN',
    mismatches: ['live_protocol'],
    replay: 'FORBIDDEN',
    replacement: null,
  });
  expect(changed).toBe(true);
});
