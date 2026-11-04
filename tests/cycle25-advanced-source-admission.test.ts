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
  it(`brand ${brand}: original comparison reconciles all eight canonical and four native references with no writer or new comparison`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      before = f.sources.property.read(f.sources.company.id),
      jobs = await f.sources.estimates.jobs(f.sources.company.id),
      ledger = f.entry.release.read('staff'),
      writers = [
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
      ],
      digest = vi.spyOn(crypto.subtle, 'digest');
    expect(await reconcile(f, result)).toEqual({
      status: 'CURRENT_EXACT_READ_ONLY',
      replay: 'FORBIDDEN',
      replacement: null,
      operational_ready: false,
      durable_receipt: false,
      scope: 'ORIGINAL_COMPARISON_AND_NATIVE_VISIT_PLAN_AT_THIS_READ',
    });
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(f.sources.property.read(f.sources.company.id)).toEqual(before);
    expect(await f.sources.estimates.jobs(f.sources.company.id)).toEqual(jobs);
    expect(f.entry.release.read('staff')).toEqual(ledger);
    expect(digest).not.toHaveBeenCalled();
    expect(JSON.stringify(await reconcile(f, result))).not.toMatch(
      /Unsaved synthetic|unit_cost|supplier|payroll|internal_notes|@example.invalid/,
    );
  });
  it(`brand ${brand}: native visit revision invalidates later reconciliation of the original eight-field comparison`, async () => {
    const f = await fixture(brand),
      result = await comparison(f);
    changeVisit(f);
    expect(await reconcile(f, result)).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      durable_receipt: false,
    });
  });
  it(`brand ${brand}: saved plan revision cannot be replaced by a matching job identity`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      plan = f.sources.property
        .read(f.sources.company.id)
        .plans.find((p) => p.id === f.entry.plan_id)!;
    f.sources.property.savePlan(f.sources.company.id, {
      ...plan,
      name: plan.name + ' changed',
    });
    expect((await reconcile(f, result)).status).toBe('UNKNOWN');
  });
  it(`brand ${brand}: revoked original reviewer denies read-only admission`, async () => {
    const f = await fixture(brand),
      result = await comparison(f);
    revoke(f);
    expect((await reconcile(f, result)).status).toBe('UNKNOWN');
  });
  it(`brand ${brand}: simultaneous exact reads never create or replay an admission claim`, async () => {
    const f = await fixture(brand),
      result = await comparison(f),
      out = await Promise.all([reconcile(f, result), reconcile(f, result)]);
    expect(out.every((r) => r.status === 'CURRENT_EXACT_READ_ONLY')).toBe(true);
    expect(result.persistence).toBe('SAME_TAB_REVIEW_ONLY');
    expect(Object.values(result.authority).every((v) => v === false)).toBe(
      true,
    );
  });
}
for (const field of [
  'visit_id',
  'visit_revision',
  'plan_id',
  'plan_revision',
] as const)
  it(`later protocol ${field} substitution remains UNKNOWN without creating a replacement`, async () => {
    const f = await fixture(),
      result = await comparison(f),
      bad = structuredClone(f.envelope);
    if (field === 'visit_revision' || field === 'plan_revision')
      bad.visit[field]++;
    else bad.visit[field] = crypto.randomUUID();
    expect((await reconcile(f, result, bad)).status).toBe('UNKNOWN');
    expect((await reconcile(f, result)).status).toBe('CURRENT_EXACT_READ_ONLY');
  });
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
  it(`later canonical ${field} substitution cannot replace a retained comparison`, async () => {
    const f = await fixture(),
      result = await comparison(f),
      bad = structuredClone(f.envelope);
    if (field === 'saved_lock_revision') bad.source[field]++;
    else
      bad.source[field] =
        field === 'source_sha256' ? '0'.repeat(64) : 'foreign';
    expect((await reconcile(f, result, bad)).status).toBe('UNKNOWN');
  });
it('default OFF returns UNKNOWN without touching protocol or retained-handle getters', async () => {
  const getter = vi.fn(() => {
      throw Error('getter');
    }),
    bad = Object.defineProperty({}, 'offline_capture', { get: getter });
  expect(
    (
      await reconcileOfflineSourceAdmission(
        bad as never,
        bad as never,
        bad as never,
        bad,
      )
    ).status,
  ).toBe('UNKNOWN');
  expect(getter).not.toHaveBeenCalled();
});
it('copied comparison and capture are not original retained handles', async () => {
  const f = await fixture(),
    result = await comparison(f);
  expect((await reconcile(f, structuredClone(result))).status).toBe('UNKNOWN');
  expect(
    (
      await reconcileOfflineSourceAdmission(
        result,
        f.requirements,
        structuredClone(f.experiment),
        f.envelope,
        f.gate,
      )
    ).status,
  ).toBe('UNKNOWN');
});
it('unretained capture accessor is rejected without executing external code', async () => {
  const f = await fixture(),
    result = await comparison(f),
    getter = vi.fn(() => f.experiment.offline_capture),
    bad = Object.defineProperty({}, 'offline_capture', { get: getter });
  expect(
    (
      await reconcileOfflineSourceAdmission(
        result,
        f.requirements,
        bad as never,
        f.envelope,
        f.gate,
      )
    ).status,
  ).toBe('UNKNOWN');
  expect(getter).not.toHaveBeenCalled();
});
it('an original comparison permanently held UNKNOWN cannot be revived by restoring its proposal', async () => {
  const f = await fixture(),
    result = await comparison(f);
  // The original comparison owns its retained proposal; its immutable result is not editable.
  f.gate.confirmed = false;
  expect((await reconcile(f, result)).status).toBe('UNKNOWN');
  // Original current-owner denial is observed while admitted to mark the same original handle.
  expect(() => assertSyncAdmissionCurrentNow(result)).toThrow();
  f.gate.confirmed = true;
  expect((await reconcile(f, result)).status).toBe('UNKNOWN');
});
it('foreign company sources cannot reconcile another company comparison', async () => {
  const f = await fixture(),
    other = await fixture(1),
    result = await comparison(f);
  expect(
    (
      await reconcileOfflineSourceAdmission(
        result,
        other.requirements,
        other.experiment,
        other.envelope,
        other.gate,
      )
    ).status,
  ).toBe('UNKNOWN');
});
it('reference relabeling is not exact reconciliation and makes no replacement claim', async () => {
  const f = await fixture(),
    result = await comparison(f),
    bad = { ...f.envelope, external_reference: 'new-label' };
  expect((await reconcile(f, result, bad)).status).toBe('UNKNOWN');
  expect(result.external_reference).toBe(f.envelope.external_reference);
  expect((await reconcile(f, result)).status).toBe('CURRENT_EXACT_READ_ONLY');
});
it('source drift between native read awaits cannot return CURRENT', async () => {
  const f = await fixture(),
    result = await comparison(f),
    original = f.sources.estimates.jobs.bind(f.sources.estimates);
  let changed = false;
  vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(async (...args) => {
    const out = await original(...args);
    if (!changed) {
      changed = true;
      changeVisit(f);
    }
    return out;
  });
  expect((await reconcile(f, result)).status).toBe('UNKNOWN');
  expect(changed).toBe(true);
});
it('live envelope drift while the original native reader awaits returns UNKNOWN', async () => {
  const f = await fixture(),
    result = await comparison(f),
    original = f.sources.estimates.jobs.bind(f.sources.estimates);
  let changed = false;
  vi.spyOn(f.sources.estimates, 'jobs').mockImplementation(async (...args) => {
    const out = await original(...args);
    if (!changed) {
      changed = true;
      f.envelope.visit.visit_revision++;
    }
    return out;
  });
  expect((await reconcile(f, result)).status).toBe('UNKNOWN');
  expect(changed).toBe(true);
});
it('read-only native-reader failure retains the original comparison and grants no replay', async () => {
  const f = await fixture(),
    result = await comparison(f);
  vi.spyOn(f.sources.estimates, 'jobs').mockRejectedValue(
    Error('lost read acknowledgment'),
  );
  expect(await reconcile(f, result)).toMatchObject({
    status: 'UNKNOWN',
    replay: 'FORBIDDEN',
    replacement: null,
  });
  expect(Object.values(result.authority).every((v) => v === false)).toBe(true);
});
it('missing or accessor protocol fields cannot enter reconciliation', async () => {
  const f = await fixture(),
    result = await comparison(f),
    getter = vi.fn(() => f.envelope.visit),
    bad = Object.defineProperty({ ...f.envelope }, 'visit', { get: getter });
  expect((await reconcile(f, result, bad)).status).toBe('UNKNOWN');
  expect(
    (await reconcile(f, result, { ...f.envelope, visit: null })).status,
  ).toBe('UNKNOWN');
  expect(getter).not.toHaveBeenCalled();
});
