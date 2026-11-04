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
function changeVisit(f: Fixture) {
  const visit = f.sources.property
    .read(f.sources.company.id)
    .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
  f.sources.property.saveVisit(f.sources.company.id, visit, {
    ...visit.content,
    summary: 'New native saved field observation',
  });
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
  it(`brand ${brand}: unchanged exact comparison stays read-only and does not invent an ambiguity reason`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      writer = vi.spyOn(f.sources.property, 'saveVisit'),
      digest = vi.spyOn(crypto.subtle, 'digest');
    const out = await reconcile(f, result);
    expect(out.status).toBe('CURRENT_EXACT_READ_ONLY');
    expect(out).not.toHaveProperty('reason');
    expect(out).toMatchObject({
      replay: 'FORBIDDEN',
      replacement: null,
      operational_ready: false,
      durable_receipt: false,
    });
    expect(writer).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
  });
  it(`brand ${brand}: already saved native visit drift denies at the original comparison fence before capture inspection`, async () => {
    const f = await fixture(brand),
      result = await comparison(f);
    changeVisit(f);
    expect(await reconcile(f, result)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
    });
  });
  it(`brand ${brand}: original human proposal drift stays distinct from a canonical write`, async () => {
    const f = await fixture(brand),
      result = await comparison(f);
    f.input.capture.note += ' changed proposal';
    expect(await reconcile(f, result)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_CAPTURE_PROPOSAL_CHANGED',
      replay: 'FORBIDDEN',
    });
  });
  it(`brand ${brand}: revoked staff is an unavailable original owner, never failed execution or a new claim`, async () => {
    const f = await fixture(brand),
      result = await comparison(f);
    revoke(f);
    expect(await reconcile(f, result)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
      replacement: null,
    });
  });
}
it('OFF identifies admission denial before any external or original-handle getter', async () => {
  const getter = vi.fn(() => {
      throw Error('private getter');
    }),
    bad = Object.defineProperty({}, 'offline_capture', { get: getter });
  const out = await reconcileOfflineSourceAdmission(
    bad as never,
    bad as never,
    bad as never,
    bad,
  );
  expect(out).toMatchObject({
    status: 'UNKNOWN',
    reason: 'LOCAL_REVIEW_NOT_ADMITTED',
    replay: 'FORBIDDEN',
  });
  expect(getter).not.toHaveBeenCalled();
});
it('malformed external protocol has a narrow diagnostic and does not poison the original valid comparison', async () => {
  const f = await fixture(),
    result = await comparison(f),
    getter = vi.fn(() => f.envelope.visit),
    bad = Object.defineProperty({ ...f.envelope }, 'visit', { get: getter });
  expect(await reconcile(f, result, bad)).toMatchObject({
    status: 'UNKNOWN',
    reason: 'EXTERNAL_PROTOCOL_INVALID',
  });
  expect(getter).not.toHaveBeenCalled();
  expect((await reconcile(f, result)).status).toBe('CURRENT_EXACT_READ_ONLY');
});
it('unretained comparison identifies missing original ownership without accepting copied evidence', async () => {
  const f = await fixture(),
    result = await comparison(f);
  expect(await reconcile(f, structuredClone(result))).toMatchObject({
    status: 'UNKNOWN',
    reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
  });
});
it('unretained native capture identifies missing original capture without executing its getter', async () => {
  const f = await fixture(),
    result = await comparison(f),
    getter = vi.fn(() => f.experiment.offline_capture),
    bad = Object.defineProperty({}, 'offline_capture', { get: getter });
  expect(
    await reconcileOfflineSourceAdmission(
      result,
      f.requirements,
      bad as never,
      f.envelope,
      f.gate,
    ),
  ).toMatchObject({
    status: 'UNKNOWN',
    reason: 'ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED',
  });
  expect(getter).not.toHaveBeenCalled();
});
it('a lost native read acknowledgment remains unverified rather than asserting execution failure', async () => {
  const f = await fixture(),
    result = await comparison(f);
  vi.spyOn(f.sources.estimates, 'jobs').mockRejectedValue(
    Error('private unexpected provider detail'),
  );
  const out = await reconcile(f, result);
  expect(out).toMatchObject({
    status: 'UNKNOWN',
    reason: 'ORIGINAL_CAPTURE_CURRENTNESS_UNVERIFIED',
    replay: 'FORBIDDEN',
    replacement: null,
  });
  expect(JSON.stringify(out)).not.toContain('private unexpected');
});
for (const field of [
  'visit_id',
  'visit_revision',
  'plan_id',
  'plan_revision',
] as const)
  it(`exact native ${field} mismatch is unverified binding, not a failed write`, async () => {
    const f = await fixture(),
      result = await comparison(f),
      bad = structuredClone(f.envelope);
    if (field === 'visit_revision' || field === 'plan_revision')
      bad.visit[field]++;
    else bad.visit[field] = crypto.randomUUID();
    expect(await reconcile(f, result, bad)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'EXACT_BINDING_OR_LIVE_PROTOCOL_UNVERIFIED',
    });
    expect((await reconcile(f, result)).status).toBe('CURRENT_EXACT_READ_ONLY');
  });
it('a source change during read remains the original owners source-changed diagnosis', async () => {
  const f = await fixture(),
    result = await comparison(f),
    native = f.sources.estimates.jobs.bind(f.sources.estimates);
  let changed = false;
  vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(async (...args) => {
    const rows = await native(...args);
    if (!changed) {
      changed = true;
      changeVisit(f);
    }
    return rows;
  });
  expect(await reconcile(f, result)).toMatchObject({
    status: 'UNKNOWN',
    reason: 'ORIGINAL_CAPTURE_SOURCE_CHANGED',
  });
  expect(changed).toBe(true);
});
it('a protocol change during original read has no claim or retry side effect', async () => {
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
  const digest = vi.spyOn(crypto.subtle, 'digest'),
    out = await reconcile(f, result);
  expect(out).toMatchObject({
    status: 'UNKNOWN',
    reason: 'EXACT_BINDING_OR_LIVE_PROTOCOL_UNVERIFIED',
    replay: 'FORBIDDEN',
    replacement: null,
  });
  expect(digest).not.toHaveBeenCalled();
});
