import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import {
  prepareOperatingSources,
  type OperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
import {
  readSavedRevision,
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  compareSavedRevisions,
  adoptSavedRevision,
} from '../src/lib/workflows/saved-revision-runtime';
import {
  readSavedSourceExercise,
  executeSavedSourceExercise,
  inspectSavedSourceExercise,
} from '../src/lib/workflows/saved-revision-exercise';
import { readFieldSavedRevision } from '../src/lib/workflows/field-saved-revisions';
import { readCostSavedRevision } from '../src/lib/workflows/cost-saved-revisions';
import {
  readCostInvoiceReview,
  openCostInvoiceReview,
  continueCostInvoiceReview,
  returnCostInvoiceReview,
} from '../src/lib/workflows/cost-invoice-review';
import {
  readServiceRevisionReview,
  readServiceRevisionUpdates,
  inspectServiceRevisionComparison,
  assertServiceRevisionAccess,
} from '../src/lib/workflows/service-revision-review';
import {
  readMaintenanceSavedRevision,
  compareMaintenanceSavedRevisions,
} from '../src/lib/workflows/maintenance-saved-revisions';
import { readPrioritySavedRevision } from '../src/lib/workflows/priority-saved-revisions';
import { SavedRevisionWorkbench } from '../src/components/workflows/SavedRevisionWorkbench';

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
async function fixture(brand = 0, index = 2) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[index],
    sources = { ...all, entries: [entry] };
  return {
    gate,
    all,
    entry,
    sources,
    job: entry.target.job_id!,
    org: all.company.id,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function simple(f: Fixture, fence?: () => void) {
  return readSavedRevision(
    f.sources,
    f.job,
    'field',
    f.gate,
    (e) => ({
      selected: e.target.job_id,
      visit_revision: e.property
        .read(f.org)
        .visits.find((v) => v.id === e.scheduled_visit_id)!.revision,
    }),
    fence,
  );
}
function saveVisit(f: Fixture) {
  const visit = f.sources.property
    .read(f.org)
    .visits.find((v) => v.id === f.entry.scheduled_visit_id)!;
  f.sources.property.saveVisit(f.org, visit, {
    ...visit.content,
    summary: 'Independent actual saved revision',
  });
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it.each([0, 1, 2])(
  'brand %i retains immutable source evidence and compare/adopt CAS over an actual saved edit',
  async (brand) => {
    const f = await fixture(brand),
      before = await simple(f),
      serialized = JSON.stringify(before),
      selection = createSavedRevisionSelection(before);
    saveVisit(f);
    expect(() => assertSavedRevisionCurrent(before)).toThrow();
    expect(() => assertSavedRevisionAccess(before)).not.toThrow();
    const current = await simple(f),
      first = compareSavedRevisions(before, current),
      competing = compareSavedRevisions(before, current);
    expect(current.identity).toEqual(f.entry.target);
    expect(current.evidence.visit_revision).toBe(
      before.evidence.visit_revision + 1,
    );
    expect(first.changed).toBe(true);
    expect(() => adoptSavedRevision(selection, first, 0, false)).toThrow();
    const results = await Promise.allSettled([
      Promise.resolve().then(() =>
        adoptSavedRevision(selection, first, 0, true),
      ),
      Promise.resolve().then(() =>
        adoptSavedRevision(selection, competing, 0, true),
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(readSavedRevisionSelection(selection)).toMatchObject({
      generation: 1,
      snapshot: current,
    });
    expect(JSON.stringify(before)).toBe(serialized);
    expect(Object.isFrozen(before.evidence)).toBe(true);
    expect(() => assertSavedRevisionAccess({ ...before })).toThrow();
  },
);

it.each(['entries', 'gate', 'company', 'entry-gate', 'entry-model'] as const)(
  'historical access refuses substituted original %s handles even when IDs and values match',
  async (kind) => {
    const f = await fixture(),
      view = await simple(f);
    if (kind === 'entries') f.sources.entries = [...f.sources.entries];
    if (kind === 'gate') f.sources.gate = { ...f.sources.gate };
    if (kind === 'company') f.sources.company = { ...f.sources.company };
    if (kind === 'entry-gate') f.entry.gate = { ...f.entry.gate };
    if (kind === 'entry-model')
      f.entry.customerModel = Object.create(
        f.entry.customerModel,
      ) as typeof f.entry.customerModel;
    expect(() => assertSavedRevisionAccess(view)).toThrow();
    expect(() => assertSavedRevisionCurrent(view)).toThrow();
  },
);

it.each(['customer_id', 'location_id', 'job_id', 'version_id'] as const)(
  'a changed immutable %s cannot become a saved-source replacement',
  async (field) => {
    const f = await fixture(),
      before = await simple(f);
    f.entry.target[field] = crypto.randomUUID();
    expect(() => assertSavedRevisionAccess(before)).toThrow();
    await expect(simple(f)).rejects.toThrow();
  },
);

it('same-property sibling job cannot replace comparison or selection identity', async () => {
  const f = await fixture(0, 0),
    sibling = f.all.entries[3];
  expect(sibling.target.location_id).toBe(f.entry.target.location_id);
  expect(sibling.target.job_id).not.toBe(f.job);
  const sources = { ...f.all, entries: [f.entry, sibling] },
    a = await readSavedRevision(sources, f.job, 'field', f.gate, (e) => ({
      job: e.target.job_id,
    })),
    b = await readSavedRevision(
      sources,
      sibling.target.job_id!,
      'field',
      f.gate,
      (e) => ({ job: e.target.job_id }),
    );
  expect(() => compareSavedRevisions(a, b)).toThrow();
  expect(() =>
    adoptSavedRevision(
      createSavedRevisionSelection(a),
      {
        before: a,
        current: b,
        changed: true,
        meaning: 'OBSERVED_DIFFERENCES_ONLY',
      },
      0,
      true,
    ),
  ).toThrow();
});

it('fresh staff revocation denies historical access, new reads and adoption', async () => {
  const f = await fixture(),
    a = await simple(f),
    s = createSavedRevisionSelection(a),
    b = await simple(f),
    comparison = compareSavedRevisions(a, b),
    members = f.sources.operations.syntheticMemberships.bind(
      f.sources.operations,
    );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockImplementation(
    (org) =>
      members(org).map((m) =>
        m.user_id === f.entry.target.actor_id ? { ...m, active: false } : m,
      ),
  );
  expect(() => assertSavedRevisionAccess(a)).toThrow();
  expect(() => adoptSavedRevision(s, comparison, 0, true)).toThrow();
  await expect(simple(f)).rejects.toThrow();
});

it('an actual source edit during the final evidence hash cannot admit mixed evidence', async () => {
  const f = await fixture(),
    digest = crypto.subtle.digest.bind(crypto.subtle);
  let changed = false;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args);
    if (!changed) {
      changed = true;
      saveVisit(f);
    }
    return result;
  });
  await expect(simple(f)).rejects.toThrow();
  expect(changed).toBe(true);
});

it('sixth synchronous domain fence protects generic comparison/adoption without hiding historical evidence', async () => {
  const f = await fixture();
  let revision = 1;
  const fence = () => {
      if (revision !== 1) throw Error('Private source changed');
    },
    a = await simple(f, fence),
    s = createSavedRevisionSelection(a),
    b = await simple(f, fence),
    comparison = compareSavedRevisions(a, b);
  revision = 2;
  expect(() => assertSavedRevisionAccess(a)).not.toThrow();
  expect(() => assertSavedRevisionCurrent(b)).toThrow();
  expect(() => adoptSavedRevision(s, comparison, 0, true)).toThrow();
  expect(readSavedRevisionSelection(s)).toMatchObject({
    generation: 0,
    snapshot: a,
  });
});

it('unexpected async domain fence is rejected and its rejection is observed', async () => {
  const f = await fixture(),
    fence = vi.fn(() => Promise.reject(Error('Async fence forbidden')));
  await expect(simple(f, fence as unknown as () => void)).rejects.toThrow(
    /Synchronous/,
  );
  await Promise.resolve();
  expect(fence).toHaveBeenCalledOnce();
});

it.each([0, 1, 2])(
  'brand %i shares exact canonical IDs across all five source-bound projections without a writer or network call',
  async (brand) => {
    const f = await fixture(brand),
      beforeProperty = JSON.stringify(f.sources.property.read(f.org)),
      beforeJob = JSON.stringify(
        f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      ),
      network = vi.spyOn(globalThis, 'fetch'),
      writers = [
        vi.spyOn(f.sources.property, 'publish'),
        vi.spyOn(f.sources.property, 'savePlan'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
        vi.spyOn(f.sources.estimates, 'submitExpense'),
        vi.spyOn(f.sources.operations, 'recordConsent'),
      ];
    const views = [
      await readFieldSavedRevision(f.sources, f.job, f.gate),
      await readCostSavedRevision(f.sources, f.job, f.gate),
      await readServiceRevisionReview(f.sources, f.job, f.gate),
      await readMaintenanceSavedRevision(f.sources, f.job, f.gate),
      await readPrioritySavedRevision(f.sources, f.job, f.gate),
    ];
    for (const view of views) {
      expect(view.identity).toEqual(f.entry.target);
      expect(view.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(view.operational_ready).toBe(false);
      expect(Object.isFrozen(view.evidence)).toBe(true);
    }
    expect(JSON.stringify(views[2])).not.toMatch(
      /unit_cost|supplier|payroll|staff_type|internal_notes|review_reason|cash_hour|burden_bps/,
    );
    expect(JSON.stringify(views[3])).not.toMatch(
      /recipient_address|provider_request":"[^n]|@example|555010/,
    );
    expect(JSON.stringify(f.sources.property.read(f.org))).toBe(beforeProperty);
    expect(
      JSON.stringify(
        f.sources.estimates.readSyntheticPrototypeSources(f.entry.target),
      ),
    ).toBe(beforeJob);
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  },
);

it('an original recorded contact revocation invalidates generic adoption and a fresh read retains blocked sending', async () => {
  const f = await fixture(),
    a = await readMaintenanceSavedRevision(f.sources, f.job, f.gate),
    s = createSavedRevisionSelection(a),
    b = await readMaintenanceSavedRevision(f.sources, f.job, f.gate),
    diff = compareMaintenanceSavedRevisions(a, b);
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  expect(() => assertSavedRevisionAccess(a)).not.toThrow();
  expect(() => adoptSavedRevision(s, diff.comparison, 0, true)).toThrow();
  const current = await readMaintenanceSavedRevision(f.sources, f.job, f.gate);
  expect(current.evidence.recorded_channel.state).toBe('RECORDED_DENIED');
  expect(current.evidence.authority.send).toBe(false);
  expect(current.evidence.purpose_consent).toBe('UNVERIFIED');
  expect(current.evidence.suppression).toBe('UNVERIFIED');
});

it('the synchronous consent reader rejects foreign customer/actor/non-synthetic repositories and returns isolated copies', async () => {
  const f = await fixture(),
    ops = f.sources.operations,
    first = ops.syntheticContactConsentSources(
      f.org,
      f.entry.target.customer_id,
      f.entry.target.actor_id,
    ),
    encoded = JSON.stringify(first);
  first.length = 0;
  expect(
    JSON.stringify(
      ops.syntheticContactConsentSources(
        f.org,
        f.entry.target.customer_id,
        f.entry.target.actor_id,
      ),
    ),
  ).toBe(encoded);
  expect(() =>
    ops.syntheticContactConsentSources(
      f.org,
      crypto.randomUUID(),
      f.entry.target.actor_id,
    ),
  ).toThrow();
  expect(() =>
    ops.syntheticContactConsentSources(
      f.org,
      f.entry.target.customer_id,
      crypto.randomUUID(),
    ),
  ).toThrow();
  expect(() =>
    new Operations(false).syntheticContactConsentSources(
      f.org,
      f.entry.target.customer_id,
      f.entry.target.actor_id,
    ),
  ).toThrow();
});

it.each(['off', 'production', 'remote', 'https'] as const)(
  '%s source exercise is denied before source getter access and UI contains no exercise controls',
  async (mode) => {
    if (mode === 'production') vi.stubEnv('DEV', false);
    if (mode === 'remote')
      vi.stubGlobal('window', {
        location: { hostname: 'example.invalid', protocol: 'http:' },
      });
    if (mode === 'https')
      vi.stubGlobal('window', {
        location: { hostname: '127.0.0.1', protocol: 'https:' },
      });
    const getter = vi.fn(() => {
        throw Error('Source accessed');
      }),
      source = Object.defineProperty({}, 'company', {
        get: getter,
      }) as OperatingSources,
      enabled = mode !== 'off';
    await expect(
      readSavedSourceExercise(source, 'job', { enabled, confirmed: true }),
    ).rejects.toThrow();
    const html = renderToStaticMarkup(
      createElement(SavedRevisionWorkbench, { sources: source, enabled }),
    );
    expect(html).not.toContain('Disposable saved-source exercise');
    expect(getter).not.toHaveBeenCalled();
  },
);

it('canonical pending exercise blocks a competing fresh wrapper and a different exercise kind before any second command', async () => {
  const f = await fixture(),
    entered = deferred(),
    release = deferred(),
    record = f.sources.estimates.recordTime.bind(f.sources.estimates),
    recordSpy = vi
      .spyOn(f.sources.estimates, 'recordTime')
      .mockImplementation(async (...args) => {
        const id = await record(...args);
        entered.release();
        await release.promise;
        return id;
      }),
    first = await readSavedSourceExercise(f.sources, f.job, f.gate),
    execution = executeSavedSourceExercise(first, 'time-record', true);
  await entered.promise;
  const second = await readSavedSourceExercise({ ...f.sources }, f.job, f.gate);
  expect(inspectSavedSourceExercise(second).state).toBe('PENDING');
  await expect(
    executeSavedSourceExercise(second, 'plan-revision', true),
  ).rejects.toThrow(/already attempted|UNKNOWN/);
  expect(recordSpy).toHaveBeenCalledOnce();
  release.release();
  await expect(execution).resolves.toMatchObject({
    status: 'SYNTHETIC_SOURCE_SAVED',
    operational_ready: false,
  });
  const current = await readSavedSourceExercise(
    { ...f.sources },
    f.job,
    f.gate,
  );
  expect(inspectSavedSourceExercise(current).done).toContain('time-record');
  await expect(
    executeSavedSourceExercise(current, 'time-record', true),
  ).rejects.toThrow(/already attempted|UNKNOWN/);
  expect(recordSpy).toHaveBeenCalledOnce();
});

it('lost actual write acknowledgment holds UNKNOWN across fresh wrappers and forbids any replay or replacement kind', async () => {
  const f = await fixture(),
    record = f.sources.estimates.recordTime.bind(f.sources.estimates),
    spy = vi
      .spyOn(f.sources.estimates, 'recordTime')
      .mockImplementation(async (...args) => {
        await record(...args);
        throw Error('ACK lost');
      }),
    view = await readSavedSourceExercise(f.sources, f.job, f.gate);
  await expect(
    executeSavedSourceExercise(view, 'time-record', true),
  ).rejects.toThrow(/ACK lost/);
  const fresh = await readSavedSourceExercise({ ...f.sources }, f.job, f.gate);
  expect(inspectSavedSourceExercise(fresh)).toMatchObject({
    state: 'UNKNOWN',
    replay: 'FORBIDDEN',
  });
  await expect(
    executeSavedSourceExercise(fresh, 'plan-revision', true),
  ).rejects.toThrow(/UNKNOWN/);
  expect(spy).toHaveBeenCalledOnce();
  expect(
    f.sources.estimates.readSyntheticPrototypeSources(f.entry.target).workforce
      .entries,
  ).toHaveLength(1);
});

it('revoking the actual context gate after record ACK blocks all later submit/review stages and retains UNKNOWN', async () => {
  const f = await fixture(),
    entered = deferred(),
    release = deferred(),
    record = f.sources.estimates.recordTime.bind(f.sources.estimates),
    submit = vi.spyOn(f.sources.estimates, 'submitTime'),
    review = vi.spyOn(f.sources.estimates, 'reviewTime');
  vi.spyOn(f.sources.estimates, 'recordTime').mockImplementation(
    async (...args) => {
      const id = await record(...args);
      entered.release();
      await release.promise;
      return id;
    },
  );
  const view = await readSavedSourceExercise(f.sources, f.job, f.gate),
    pending = executeSavedSourceExercise(view, 'time-record', true);
  await entered.promise;
  f.gate.enabled = false;
  release.release();
  await expect(pending).rejects.toThrow();
  expect(submit).not.toHaveBeenCalled();
  expect(review).not.toHaveBeenCalled();
  f.gate.enabled = true;
  const fresh = await readSavedSourceExercise({ ...f.sources }, f.job, f.gate);
  expect(inspectSavedSourceExercise(fresh).state).toBe('UNKNOWN');
});

it.each(['no-write', 'wrong-id', 'wrong-void'] as const)(
  'malformed %s acknowledgment fails closed with one UNKNOWN exercise claim',
  async (mode) => {
    const f = await fixture(),
      view = await readSavedSourceExercise(f.sources, f.job, f.gate);
    if (mode === 'wrong-void')
      vi.spyOn(f.sources.property, 'savePlan').mockReturnValue(
        'not void' as never,
      );
    else
      vi.spyOn(f.sources.estimates, 'recordTime').mockResolvedValue(
        mode === 'wrong-id' ? 'invalid' : crypto.randomUUID(),
      );
    await expect(
      executeSavedSourceExercise(
        view,
        mode === 'wrong-void' ? 'plan-revision' : 'time-record',
        true,
      ),
    ).rejects.toThrow();
    const fresh = await readSavedSourceExercise(f.sources, f.job, f.gate);
    expect(inspectSavedSourceExercise(fresh).state).toBe('UNKNOWN');
  },
);

it('explicit disposable publication appends a new exact sibling and preserves every old customer-safe published byte', async () => {
  const f = await fixture(),
    before = await readServiceRevisionReview(f.sources, f.job, f.gate),
    serialized = JSON.stringify(before),
    oldReports = JSON.stringify(f.sources.property.read(f.org).reports),
    view = await readSavedSourceExercise(f.sources, f.job, f.gate),
    network = vi.spyOn(globalThis, 'fetch');
  await executeSavedSourceExercise(view, 'report-revision', true);
  const next = await readServiceRevisionUpdates(before),
    inspection = inspectServiceRevisionComparison(before, next),
    reports = f.sources.property.read(f.org).reports;
  expect(next.evidence.selected.visit_id).toBe(
    before.evidence.selected.visit_id,
  );
  expect(next.evidence.selected.reference.report_id).not.toBe(
    before.evidence.selected.reference.report_id,
  );
  expect(next.evidence.selected.reference.published_version).toBe(
    before.evidence.selected.reference.published_version + 1,
  );
  expect(JSON.stringify(reports.slice(0, -1))).toBe(oldReports);
  expect(JSON.stringify(before)).toBe(serialized);
  expect(inspection.physical_completion).toBe('UNVERIFIED');
  expect(next.evidence.delivery).toBe('NOT_SENT');
  expect(() => assertServiceRevisionAccess(before)).not.toThrow();
  expect(network).not.toHaveBeenCalled();
});

it.each([0, 1, 2])(
  'brand %i saved material review and local adoption cannot reset an original canonical UNKNOWN control',
  async (brand) => {
    const f = await fixture(brand),
      original = openCostInvoiceReview(
        await readCostInvoiceReview(
          f.sources,
          { as_of: new Date().toISOString(), input_revision: 1 },
          f.gate,
        ),
        f.job,
      ),
      lost = () => {
        throw Error('Original navigation ACK lost');
      },
      lease = { current: lost, generation: 0 };
    expect(
      continueCostInvoiceReview(original, 'invoice', lease, lease).status,
    ).toBe('UNKNOWN');
    const before = await readCostSavedRevision(f.sources, f.job, f.gate),
      s = createSavedRevisionSelection(before),
      frozen = JSON.stringify(before),
      exercise = await readSavedSourceExercise(f.sources, f.job, f.gate);
    await executeSavedSourceExercise(exercise, 'material-review', true);
    const current = await readCostSavedRevision(f.sources, f.job, f.gate),
      comparison = compareSavedRevisions(before, current);
    expect(comparison.changed).toBe(true);
    expect(current.evidence.expenses).toHaveLength(
      before.evidence.expenses.length + 1,
    );
    expect(adoptSavedRevision(s, comparison, 0, true).snapshot).toBe(current);
    expect(JSON.stringify(before)).toBe(frozen);
    const fresh = openCostInvoiceReview(
      await readCostInvoiceReview(
        { ...f.sources, entries: [f.entry] },
        { as_of: new Date().toISOString(), input_revision: 2 },
        f.gate,
      ),
      f.job,
    );
    expect(returnCostInvoiceReview(fresh).status).toBe('UNKNOWN');
    const callback = vi.fn(),
      currentLease = { current: callback, generation: 0 };
    expect(
      continueCostInvoiceReview(fresh, 'invoice', currentLease, currentLease)
        .status,
    ).toBe('UNKNOWN');
    expect(callback).not.toHaveBeenCalled();
  },
);
