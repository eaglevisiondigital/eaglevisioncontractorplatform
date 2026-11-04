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
  assertSyncAdmissionCurrentNow,
} from '../src/lib/workflows/sync-admission-review';
import {
  reviewOfflineSourceAdmission,
  parseOfflineSourceProtocol,
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
for (const brand of [0, 1, 2]) {
  it(`brand ${brand} exact retained job and native visit-plan references delegate only the original read-only comparison`, async () => {
    const f = await fixture(brand),
      property = f.sources.property.read(f.sources.company.id),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      ledger = f.entry.release.read('staff'),
      writers = [
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
      ],
      result = await run(f);
    expect(result.mode).toBe('LOCAL_SYNC_REFERENCE_ADMISSION_REVIEW');
    expect(result.kind).toBe('offline');
    expect(result.exact_reference).toBe(true);
    expect(result.source).toEqual(syncSourceReference(f.requirements));
    expect(result.reference_status).toBe('EXACT_REFERENCE_REVIEW_ONLY');
    expect(() => assertSyncAdmissionCurrentNow(result)).not.toThrow();
    expect(Object.values(result.authority).every((v) => v === false)).toBe(
      true,
    );
    expect(result.operational_ready).toBe(false);
    expect(result.persistence).toBe('SAME_TAB_REVIEW_ONLY');
    expect(f.sources.property.read(f.sources.company.id)).toEqual(property);
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(f.entry.release.read('staff')).toEqual(ledger);
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /Unsaved synthetic|unit_cost|supplier|payroll|cash_hour|internal_notes|@example.invalid|555010/,
    );
  });
  for (const field of [
    'visit_id',
    'visit_revision',
    'plan_id',
    'plan_revision',
  ] as const)
    it(`brand ${brand} external ${field} mismatch rejects before original reference admission`, async () => {
      const f = await fixture(brand),
        bad = structuredClone(f.envelope);
      if (field === 'visit_revision' || field === 'plan_revision')
        bad.visit[field]++;
      else bad.visit[field] = crypto.randomUUID();
      await expect(run(f, bad)).rejects.toThrow();
      expect((await run(f)).exact_reference).toBe(true);
    });
  it(`brand ${brand} a genuine native visit revision makes old external references stale`, async () => {
    const f = await fixture(brand);
    changeVisit(f);
    await expect(run(f)).rejects.toThrow();
  });
  it(`brand ${brand} a genuine native plan revision makes old external references stale`, async () => {
    const f = await fixture(brand),
      plan = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.sources.company.id, {
      ...plan,
      name: plan.name + ' revised',
    });
    await expect(run(f)).rejects.toThrow();
  });
  it(`brand ${brand} revoked staff cannot admit an original retained offline proposal`, async () => {
    const f = await fixture(brand);
    revoke(f);
    await expect(run(f)).rejects.toThrow();
  });
}
for (const field of [
  'organization_id',
  'customer_id',
  'location_id',
  'job_id',
  'estimate_id',
  'issued_version_id',
  'source_sha256',
  'saved_lock_revision',
] as const)
  it(`foreign or stale canonical ${field} cannot pass a matching visit reference`, async () => {
    const f = await fixture(),
      bad = structuredClone(f.envelope);
    if (field === 'saved_lock_revision') bad.source[field]++;
    else
      bad.source[field] =
        field === 'source_sha256' ? '0'.repeat(64) : 'foreign';
    await expect(run(f, bad)).rejects.toThrow();
  });
it('plain reordered own fields normalize without creating a competing protocol identity', async () => {
  const f = await fixture(),
    input = {
      visit: Object.fromEntries(Object.entries(f.envelope.visit).reverse()),
      source: Object.fromEntries(Object.entries(f.envelope.source).reverse()),
      external_reference: f.envelope.external_reference,
      mode: f.envelope.mode,
    };
  expect((await run(f, input)).exact_reference).toBe(true);
});
it('missing and null references are not an exact match or a fallback', async () => {
  const f = await fixture();
  for (const field of Object.keys(f.envelope.source)) {
    const source = { ...f.envelope.source, [field]: null };
    expect(() =>
      parseOfflineSourceProtocol({ ...f.envelope, source }),
    ).toThrow();
  }
  expect(() =>
    parseOfflineSourceProtocol({
      ...f.envelope,
      visit: { visit_id: f.visit.id },
    }),
  ).toThrow();
});
it('duplicate/prototype/accessor protocol data never executes untrusted getter hooks', async () => {
  const f = await fixture(),
    getter = vi.fn(() => 'offline'),
    input = { ...f.envelope };
  Object.defineProperty(input, 'mode', { get: getter });
  expect(() => parseOfflineSourceProtocol(input)).toThrow();
  expect(() =>
    parseOfflineSourceProtocol(
      Object.assign(Object.create({ inherited: true }), f.envelope),
    ),
  ).toThrow();
  expect(() =>
    parseOfflineSourceProtocol({
      ...f.envelope,
      source: [f.envelope.source, f.envelope.source],
    }),
  ).toThrow();
  expect(() =>
    parseOfflineSourceProtocol({ ...f.envelope, imported_note: 'not allowed' }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('default OFF rejects before any protocol or retained-source getter', async () => {
  const getter = vi.fn(() => {
      throw Error('getter');
    }),
    value = Object.defineProperty({}, 'offline_capture', { get: getter });
  await expect(
    reviewOfflineSourceAdmission(value as never, value as never, value),
  ).rejects.toThrow('OFF');
  expect(getter).not.toHaveBeenCalled();
});
it('an unretained copied capture is UNKNOWN, never a substitute retained source', async () => {
  const f = await fixture();
  await expect(
    reviewOfflineSourceAdmission(
      f.requirements,
      structuredClone(f.experiment),
      f.envelope,
      f.gate,
    ),
  ).rejects.toThrow('UNKNOWN');
});
it('unretained capture accessors are rejected before evaluating their payload', async () => {
  const f = await fixture(),
    getter = vi.fn(() => f.experiment.offline_capture),
    forged = Object.defineProperty({}, 'offline_capture', { get: getter });
  await expect(
    reviewOfflineSourceAdmission(
      f.requirements,
      forged as never,
      f.envelope,
      f.gate,
    ),
  ).rejects.toThrow('UNKNOWN');
  expect(getter).not.toHaveBeenCalled();
});
it('source drift during delegated hash is rejected after the original comparison without sync or replay', async () => {
  const f = await fixture(),
    native = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await native(...args);
    if (!changed) {
      changed = true;
      changeVisit(f);
    }
    return result;
  });
  await expect(run(f)).rejects.toThrow();
  expect(changed).toBe(true);
});
it('live external reference mutation during delegated hash cannot replace its original source', async () => {
  const f = await fixture(),
    native = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await native(...args);
    if (!changed) {
      changed = true;
      f.envelope.visit.visit_revision++;
    }
    return result;
  });
  await expect(run(f)).rejects.toThrow();
  expect(changed).toBe(true);
});
