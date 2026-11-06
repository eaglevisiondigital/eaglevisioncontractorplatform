import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  reviewOperationsExperiments,
  type OperationsExperimentInput,
} from '../src/lib/operations-experiments';
import {
  inspectSyncReviewHandoff,
  prepareSyncReviewHandoff,
  readSyncAdmissionSource,
  syncSourceReference,
} from '../src/lib/workflows/sync-admission-review';
import {
  parseOfflineSourceProtocol,
  reconcileOfflineSourceAdmission,
  reviewOfflineSourceAdmission,
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
});
async function fixture(brand: number) {
  const gate = { enabled: true, confirmed: true },
    reviewGate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[0],
    org = sources.company.id;
  // Native membership owner remains available for actual revocation cases.
  await sources.operations.configure(
    org,
    'active',
    'synthetic',
    {},
    org + '-remaining-owner',
  );
  const model = await readFieldWorkOrders(
      sources.property,
      org,
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
      note: 'Unposted synthetic offline observation; no completion evidence.',
    },
  };
  const experiment = await reviewOperationsExperiments(
      sources.property,
      org,
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
        note: 'Exact original offline source review only.',
        review_on: entry.day,
        manual_priority: 'normal',
      },
      gate,
    ),
    native = experiment.offline_capture.source,
    envelope: OfflineSourceProtocol = {
      mode: 'OFFLINE_SOURCE_ADMISSION_V1',
      external_reference: 'cycle33-next-offline-protocol',
      source: syncSourceReference(
        requirements,
      ) as OfflineSourceProtocol['source'],
      visit: {
        visit_id: native.visit_id,
        visit_revision: native.visit_revision,
        plan_id: native.plan_id,
        plan_revision: native.plan_revision,
      },
    };
  return {
    gate,
    reviewGate,
    sources,
    entry,
    org,
    requirements,
    experiment,
    envelope,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const review = (f: Fixture, input: unknown = f.envelope) =>
  reviewOfflineSourceAdmission(
    f.requirements,
    f.experiment,
    input,
    f.reviewGate,
  );
const reconcile = (
  f: Fixture,
  comparison: Awaited<ReturnType<typeof review>>,
  input: unknown = f.envelope,
) =>
  reconcileOfflineSourceAdmission(
    comparison,
    f.requirements,
    f.experiment,
    input,
    f.reviewGate,
  );

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: executable protocol cannot withdraw separate confirmation at its final capture and return private comparison facts`, async () => {
    const f = await fixture(brand);
    let captures = 0;
    const executable = new Proxy(f.envelope, {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === 'mode' && ++captures === 4) f.reviewGate.confirmed = false;
        return descriptor;
      },
    });
    await expect(review(f, executable)).rejects.toThrow();
    expect(captures).toBeLessThan(4);
    expect(f.reviewGate.confirmed).toBe(true);
    expect(f.gate.confirmed).toBe(true);
    // Rejected executable data never consumes the ordinary native reference.
    expect((await review(f)).exact_reference).toBe(true);
  });

  it(`brand ${brand}: nested executable source is rejected before a later capture can replace its same-job customer identity`, async () => {
    const f = await fixture(brand);
    let captures = 0;
    const source = new Proxy(
      { ...f.envelope.source },
      {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === 'customer_id' && ++captures === 4)
            f.reviewGate.confirmed = false;
          return descriptor;
        },
      },
    );
    await expect(review(f, { ...f.envelope, source })).rejects.toThrow();
    expect(captures).toBeLessThan(4);
    expect(f.reviewGate.confirmed).toBe(true);
    expect((await review(f)).source).toEqual(f.envelope.source);
  });

  it(`brand ${brand}: ordinary reordered proposal preserves original identities and concurrent read-only reconciliation without a writer`, async () => {
    const f = await fixture(brand),
      before = f.sources.property.read(f.org),
      jobs = await f.sources.estimates.jobs(f.org),
      writers = [
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'assignJob'),
      ],
      reordered = {
        visit: Object.fromEntries(Object.entries(f.envelope.visit).reverse()),
        source: Object.fromEntries(Object.entries(f.envelope.source).reverse()),
        external_reference: f.envelope.external_reference,
        mode: f.envelope.mode,
      },
      comparison = await review(f, reordered);
    expect(comparison.source).toEqual(f.envelope.source);
    expect(comparison.exact_reference).toBe(true);
    expect(Object.values(comparison.authority).every((v) => v === false)).toBe(
      true,
    );
    const current = await Promise.all([
      reconcile(f, comparison, reordered),
      reconcile(f, comparison, reordered),
    ]);
    expect(current[0]).toEqual(current[1]);
    expect(current[0]).toMatchObject({
      status: 'CURRENT_EXACT_READ_ONLY',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
      operational_ready: false,
    });
    expect(f.sources.property.read(f.org)).toEqual(before);
    expect(await f.sources.estimates.jobs(f.org)).toEqual(jobs);
    writers.forEach((writer) => expect(writer).not.toHaveBeenCalled());
  });

  it(`brand ${brand}: outer confirmation remains live and withdrawn data yields UNKNOWN without replacing the original comparison`, async () => {
    const f = await fixture(brand),
      comparison = await review(f);
    f.reviewGate.confirmed = false;
    expect(await reconcile(f, comparison)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'LOCAL_REVIEW_NOT_ADMITTED',
      replay: 'FORBIDDEN',
      replacement: null,
      durable_receipt: false,
    });
    f.reviewGate.confirmed = true;
    expect((await reconcile(f, comparison)).status).toBe(
      'CURRENT_EXACT_READ_ONLY',
    );
  });

  it(`brand ${brand}: actual native owner revocation withholds original comparison and regrant cannot clear original UNKNOWN custody`, async () => {
    const f = await fixture(brand),
      comparison = await review(f);
    await f.sources.operations.revokeOwner(f.org, f.entry.target.actor_id);
    expect(await reconcile(f, comparison)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
      replay: 'FORBIDDEN',
      replacement: null,
    });
    await f.sources.operations.configure(
      f.org,
      'active',
      'synthetic',
      {},
      f.entry.target.actor_id,
    );
    expect(await reconcile(f, comparison)).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
    });
    await expect(review(f)).rejects.toThrow('UNKNOWN');
  });

  it(`brand ${brand}: same-job foreign source and native-visit substitutions cannot replace exact ordinary reconciliation`, async () => {
    const f = await fixture(brand),
      comparison = await review(f);
    for (const field of [
      'organization_id',
      'customer_id',
      'location_id',
    ] as const) {
      const graft = structuredClone(f.envelope);
      graft.source[field] = `foreign-${field}`;
      expect(graft.source.job_id).toBe(f.envelope.source.job_id);
      expect(await reconcile(f, comparison, graft)).toMatchObject({
        status: 'UNKNOWN',
        replay: 'FORBIDDEN',
        replacement: null,
        mismatches: [`source.${field}`],
      });
    }
    for (const field of ['visit_id', 'plan_id'] as const) {
      const graft = structuredClone(f.envelope);
      graft.visit[field] = `foreign-${field}`;
      expect(await reconcile(f, comparison, graft)).toMatchObject({
        status: 'UNKNOWN',
        replay: 'FORBIDDEN',
        replacement: null,
        mismatches: [`visit.${field}`],
      });
    }
    expect((await reconcile(f, comparison)).status).toBe(
      'CURRENT_EXACT_READ_ONLY',
    );
  });

  it(`brand ${brand}: recorded native visit change remains stale and cannot be repaired by copying a newer revision into the proposal`, async () => {
    const f = await fixture(brand),
      comparison = await review(f),
      visit = f.sources.property
        .read(f.org)
        .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
    f.sources.property.saveVisit(f.org, visit, {
      ...visit.content,
      summary: 'New canonical observation requires new staff review.',
    });
    const newer = structuredClone(f.envelope);
    newer.visit.visit_revision = f.sources.property
      .read(f.org)
      .visits.find((v) => v.id === visit.id)!.revision;
    expect(await reconcile(f, comparison, newer)).toMatchObject({
      status: 'UNKNOWN',
      replay: 'FORBIDDEN',
      replacement: null,
      reason: 'ORIGINAL_COMPARISON_OR_REQUIREMENTS_UNAVAILABLE',
    });
    await expect(review(f, newer)).rejects.toThrow();
  });

  it(`brand ${brand}: simulated loss of local handoff acknowledgment preserves original read-only custody and denies duplicate preparation`, async () => {
    const f = await fixture(brand),
      comparison = await review(f),
      property = f.sources.property.read(f.org),
      confirmation = {
        confirmed: true,
        reviewed_comparison_sha256: comparison.integrity.sha256,
      },
      writer = vi.spyOn(f.sources.property, 'saveVisit');
    let retained:
      Awaited<ReturnType<typeof prepareSyncReviewHandoff>> | undefined;
    await expect(
      (async () => {
        retained = await prepareSyncReviewHandoff(comparison, confirmation);
        throw Error('Synthetic local caller acknowledgment lost');
      })(),
    ).rejects.toThrow('Synthetic local caller acknowledgment lost');
    expect(retained).toBeDefined();
    expect(Object.isFrozen(retained)).toBe(true);
    expect(await inspectSyncReviewHandoff(retained!)).toEqual({
      status: 'CURRENT_REVIEW_ONLY',
      replay: false,
      replacement: null,
    });
    expect((await reconcile(f, comparison)).status).toBe(
      'CURRENT_EXACT_READ_ONLY',
    );
    await expect(
      prepareSyncReviewHandoff(comparison, confirmation),
    ).rejects.toThrow('no replay');
    expect(f.sources.property.read(f.org)).toEqual(property);
    expect(writer).not.toHaveBeenCalled();
    expect(retained).toMatchObject({
      imported: false,
      synchronized: false,
      operational_ready: false,
      delivery: 'NOT_SENT',
    });
  });
}

it('OFF denies external access before descriptor traps or original source reads', async () => {
  const trap = vi.fn(() => {
      throw Error('Private external detail');
    }),
    executable = new Proxy({}, { getOwnPropertyDescriptor: trap });
  await expect(
    reviewOfflineSourceAdmission(
      executable as never,
      executable as never,
      executable,
    ),
  ).rejects.toThrow('OFF');
  expect(trap).not.toHaveBeenCalled();
});

it('strict parser rejects an own accessor without invoking it before clone validation', () => {
  const getter = vi.fn(() => {
      throw Error('Private getter');
    }),
    value = Object.defineProperty({}, 'source', { get: getter });
  expect(() => parseOfflineSourceProtocol(value)).toThrow(
    'Own primitive review fields required',
  );
  expect(getter).not.toHaveBeenCalled();
});
