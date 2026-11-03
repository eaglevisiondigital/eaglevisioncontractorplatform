import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { occurrence } from '../src/domain/property/inspections';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  readMaintenancePlanCorrectionReview,
  parsePlanCorrectionInput,
  assertMaintenancePlanCorrectionCurrent,
  maintenancePlanRenewalReview,
  saveMaintenancePlanCorrectionReview,
  reconcileMaintenancePlanCorrectionReview,
} from '../src/lib/workflows/maintenance-plan-correction';
import { MaintenancePlanCorrection } from '../src/components/workflows/MaintenancePlanCorrection';

beforeEach(() =>
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1', protocol: 'http:' },
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(brand = 0) {
  const gate = { enabled: true, confirmed: true },
    all = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = all.entries[2],
    sources = { ...all, entries: [entry] },
    org = sources.company.id,
    job = entry.target.job_id!;
  return { gate, all, sources, entry, org, job };
}
type F = Awaited<ReturnType<typeof fixture>>;
const plan = (f: F) =>
  f.sources.property.read(f.org).plans.find((p) => p.id === f.entry.plan_id)!;
const edit = (
  r: Awaited<ReturnType<typeof readMaintenancePlanCorrectionReview>>,
) => ({
  plan_id: r.source.plan_id,
  revision: r.source.revision,
  name: 'Reviewed original maintenance plan',
  cadence: 'custom' as const,
  interval_days: 10,
});

it.each([0, 1, 2])(
  'brand %i saves the actual original plan revision and retains canonical recurrence and ownership',
  async (brand) => {
    const f = await fixture(brand),
      original = plan(f),
      before = f.sources.property.read(f.org),
      r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
      oldRenewal = maintenancePlanRenewalReview(r),
      writer = vi.spyOn(f.sources.property, 'savePlan'),
      network = vi.spyOn(globalThis, 'fetch');
    expect(r.source).toMatchObject({
      plan_id: original.id,
      revision: original.revision,
      can_edit: true,
    });
    expect(oldRenewal.send).toBe(false);
    expect(oldRenewal.renew).toBe(false);
    expect(oldRenewal.purpose_consent).toBe('UNVERIFIED');
    expect(oldRenewal.suppression).toBe('UNVERIFIED');
    await saveMaintenancePlanCorrectionReview(r, edit(r), true);
    expect(writer).toHaveBeenCalledTimes(1);
    const next = plan(f),
      after = f.sources.property.read(f.org);
    expect(next).toEqual({
      ...original,
      name: 'Reviewed original maintenance plan',
      cadence: 'custom',
      interval_days: 10,
      revision: original.revision + 1,
    });
    expect(occurrence(next, 1)).toBe(
      occurrence({ ...original, cadence: 'custom', interval_days: 10 }, 1),
    );
    expect(after.visits).toEqual(before.visits);
    expect(after.reports).toEqual(before.reports);
    expect(after.plans.filter((p) => p.id !== next.id)).toEqual(
      before.plans.filter((p) => p.id !== next.id),
    );
    expect(network).not.toHaveBeenCalled();
    expect(() => assertMaintenancePlanCorrectionCurrent(r)).toThrow();
    const result = await reconcileMaintenancePlanCorrectionReview(r);
    expect(result).toMatchObject({
      state: 'KNOWN_SAVED',
      source_id: original.id,
      result_id: original.id,
      replay: 'FORBIDDEN',
    });
    const fresh = await readMaintenancePlanCorrectionReview(
        f.sources,
        f.job,
        f.gate,
      ),
      newRenewal = maintenancePlanRenewalReview(fresh);
    expect(fresh.source.can_edit).toBe(false);
    expect(newRenewal.revision).toBe(original.revision + 1);
    expect(oldRenewal.revision).toBe(original.revision);
    expect(
      newRenewal.occurrences.every(
        (o) =>
          o.message_authority === 'BLOCKED' &&
          o.billing_authority === 'BLOCKED' &&
          o.scheduling_authority === 'BLOCKED',
      ),
    ).toBe(true);
  },
);
it.each(['once', 'weekly', 'monthly', 'custom'] as const)(
  'native %s cadence is saved through the existing plan engine',
  async (cadence) => {
    const f = await fixture(),
      r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
      original = plan(f);
    await saveMaintenancePlanCorrectionReview(r, { ...edit(r), cadence }, true);
    expect(plan(f).cadence).toBe(cadence);
    expect(plan(f).starts_on).toBe(original.starts_on);
    expect(plan(f).timezone).toBe(original.timezone);
  },
);
it('unconfirmed review neither writes nor consumes the original command', async () => {
  const f = await fixture(),
    r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    before = plan(f),
    writer = vi.spyOn(f.sources.property, 'savePlan');
  await expect(
    saveMaintenancePlanCorrectionReview(r, edit(r), false),
  ).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
  expect(plan(f)).toEqual(before);
  await expect(
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
  ).resolves.toBeDefined();
});
it.each([
  ['plan_id', 'foreign'],
  ['revision', 999],
  ['name', '  '],
  ['name', ' padded '],
  ['name', 'x'.repeat(201)],
  ['cadence', 'daily'],
  ['interval_days', 0],
  ['interval_days', 366],
  ['interval_days', 1.5],
  ['interval_days', '14'],
  ['private_notes', 'PRIVATE'],
] as const)(
  'invalid %s field never reaches the original plan writer',
  async (key, value) => {
    const f = await fixture(),
      r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
      writer = vi.spyOn(f.sources.property, 'savePlan');
    await expect(
      saveMaintenancePlanCorrectionReview(
        r,
        { ...edit(r), [key]: value },
        true,
      ),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it('input accessors and serializers are rejected without executing them', async () => {
  const f = await fixture(),
    r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    input = edit(r),
    getter = vi.fn(() => 'PRIVATE');
  Object.defineProperty(input, 'name', { get: getter, enumerable: true });
  expect(() => parsePlanCorrectionInput(input, r.source)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it.each([
  'customer_id',
  'location_id',
  'organization_id',
  'version_id',
] as const)(
  'exact source %s mismatch denies correction before a write',
  async (key) => {
    const f = await fixture(),
      r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
      writer = vi.spyOn(f.sources.property, 'savePlan');
    f.entry.target[key] =
      key === 'organization_id' ? sampleCompanies[1].id : crypto.randomUUID();
    await expect(
      saveMaintenancePlanCorrectionReview(r, edit(r), true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it.each(['inactive', 'nonreviewer'] as const)(
  'current %s staff cannot save a retained plan review',
  async (kind) => {
    const f = await fixture(),
      actor = f.org + '-estimator';
    await f.sources.operations.manageMember(
      f.org,
      actor,
      true,
      'admin',
      'office_manager',
    );
    f.entry.target.actor_id = actor;
    const r = await readMaintenancePlanCorrectionReview(
        f.sources,
        f.job,
        f.gate,
      ),
      writer = vi.spyOn(f.sources.property, 'savePlan');
    await f.sources.operations.manageMember(
      f.org,
      actor,
      kind !== 'inactive',
      kind === 'inactive' ? 'admin' : 'staff',
      'estimator',
    );
    await expect(
      saveMaintenancePlanCorrectionReview(r, edit(r), true),
    ).rejects.toThrow();
    expect(writer).not.toHaveBeenCalled();
  },
);
it('actual plan CAS stales previous correction and original renewal occurrence references', async () => {
  const f = await fixture(),
    r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    old = plan(f);
  f.sources.property.savePlan(f.org, {
    ...old,
    name: 'Actual independent current plan revision',
  });
  const writer = vi.spyOn(f.sources.property, 'savePlan');
  await expect(
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
  ).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
});
it('recorded contact withdrawal blocks the old review and remains no sending permission', async () => {
  const f = await fixture();
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    true,
    true,
  );
  const r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    writer = vi.spyOn(f.sources.property, 'savePlan');
  await f.sources.operations.recordConsent(
    f.org,
    f.entry.target.customer_id,
    false,
    false,
  );
  await expect(
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
  ).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
  const fresh = await readMaintenancePlanCorrectionReview(
      f.sources,
      f.job,
      f.gate,
    ),
    preview = maintenancePlanRenewalReview(fresh);
  expect(preview.recorded_channel).toBe('RECORDED_DENIED');
  expect(preview.send).toBe(false);
  expect(preview.enrollment).toBe('UNVERIFIED');
});
it('withdrawal during the original asynchronous consent review denies the final plan write', async () => {
  const f = await fixture(),
    r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.operations.customerHistory.bind(f.sources.operations),
    writer = vi.spyOn(f.sources.property, 'savePlan');
  let changed = false;
  vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
    async (...args) => {
      const history = await original(...args);
      if (!changed) {
        changed = true;
        await f.sources.operations.recordConsent(
          f.org,
          f.entry.target.customer_id,
          false,
          false,
        );
      }
      return history;
    },
  );
  await expect(
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
  ).rejects.toThrow();
  expect(changed).toBe(true);
  expect(writer).not.toHaveBeenCalled();
});
it('concurrent corrections share the original sole attempt and cannot replay through a new review', async () => {
  const f = await fixture(),
    r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    writer = vi.spyOn(f.sources.property, 'savePlan');
  const results = await Promise.allSettled([
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(writer).toHaveBeenCalledTimes(1);
  const fresh = await readMaintenancePlanCorrectionReview(
    f.sources,
    f.job,
    f.gate,
  );
  expect(fresh.source.can_edit).toBe(false);
  await expect(
    saveMaintenancePlanCorrectionReview(fresh, edit(fresh), true),
  ).rejects.toThrow();
  expect(writer).toHaveBeenCalledTimes(1);
});
it.each(['input', 'gate', 'container'] as const)(
  'original live %s change during consent await denies a plan save',
  async (kind) => {
    const f = await fixture(),
      r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
      input = edit(r),
      original = f.sources.operations.customerHistory.bind(
        f.sources.operations,
      ),
      writer = vi.spyOn(f.sources.property, 'savePlan');
    let changed = false;
    vi.spyOn(f.sources.operations, 'customerHistory').mockImplementation(
      async (...args) => {
        const rows = await original(...args);
        if (!changed) {
          changed = true;
          if (kind === 'input') input.name = 'Changed after exact confirmation';
          if (kind === 'gate') f.gate.confirmed = false;
          if (kind === 'container') f.sources.entries = [...f.sources.entries];
        }
        return rows;
      },
    );
    await expect(
      saveMaintenancePlanCorrectionReview(r, input, true),
    ).rejects.toThrow();
    expect(changed).toBe(true);
    expect(writer).not.toHaveBeenCalled();
  },
);
it('lost save acknowledgment remains UNKNOWN and reconciliation never retries the writer', async () => {
  const f = await fixture(),
    r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    original = f.sources.property.savePlan.bind(f.sources.property);
  vi.spyOn(f.sources.property, 'savePlan').mockImplementation((...args) => {
    original(...args);
    throw Error('lost acknowledgment');
  });
  await expect(
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
  ).rejects.toThrow();
  vi.restoreAllMocks();
  const writer = vi.spyOn(f.sources.property, 'savePlan'),
    reconciled = await reconcileMaintenancePlanCorrectionReview(r);
  expect(reconciled).toMatchObject({ state: 'UNKNOWN', replay: 'FORBIDDEN' });
  const current = plan(f);
  await expect(
    saveMaintenancePlanCorrectionReview(r, edit(r), true),
  ).rejects.toThrow();
  expect(plan(f)).toEqual(current);
  expect(writer).not.toHaveBeenCalled();
});
it('private contact data, rates and notes are excluded from the renewal requirements view', async () => {
  const f = await fixture(),
    r = await readMaintenancePlanCorrectionReview(f.sources, f.job, f.gate),
    data = maintenancePlanRenewalReview(r);
  expect(JSON.stringify(data)).not.toMatch(
    /@example|555010|private_notes|supplier|unit_cost|cash_minor|staff_note/,
  );
  expect((await reconcileMaintenancePlanCorrectionReview(r)).state).toBe(
    'NOT_ATTEMPTED',
  );
});
it('OFF precedes source getters and renders no corrective action or file interface', async () => {
  const getter = vi.fn(),
    sources = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: getter });
  await expect(
    readMaintenancePlanCorrectionReview(sources, 'untrusted', {
      enabled: false,
      confirmed: true,
    }),
  ).rejects.toThrow();
  const html = renderToStaticMarkup(
    createElement(MaintenancePlanCorrection, {
      sources,
      enabled: false,
      selectedJobId: 'untrusted',
    }),
  );
  expect(html).not.toContain('Save exact maintenance plan correction');
  expect(html).not.toContain('Download maintenance renewal evidence');
  expect(getter).not.toHaveBeenCalled();
});
