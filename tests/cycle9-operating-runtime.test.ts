import { afterEach, expect, it, vi } from 'vitest';
import { sampleCompanies } from '../src/domain/platform';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import {
  prepareOperatingSources,
  captureOperatingSources,
} from '../src/lib/workflows/operating-center-runtime';
const gate = () => ({ enabled: true, confirmed: true });
afterEach(() => vi.restoreAllMocks());
for (const company of sampleCompanies)
  it(`one canonical multi-job environment: ${company.slug}`, async () => {
    const g = gate(),
      s = await prepareOperatingSources(company, g);
    expect(s.entries).toHaveLength(4);
    expect(new Set(s.entries.map((e) => e.target.job_id)).size).toBe(4);
    expect(new Set(s.entries.map((e) => e.target.customer_id)).size).toBe(3);
    expect(new Set(s.entries.map((e) => e.target.location_id)).size).toBe(3);
    expect(new Set(s.entries.map((e) => e.worker_id)).size).toBe(2);
    for (const e of s.entries) {
      expect(e.operations).toBe(s.operations);
      expect(e.estimates).toBe(s.estimates);
      expect(e.property).toBe(s.property);
      const live = s.estimates.readSyntheticPrototypeSources(e.target);
      expect(live.job?.baseline.issued_version_id).toBe(e.target.version_id);
      expect(live.bundle.version.status).toBe('issued');
      const ledger = e.release.read('staff');
      expect(ledger.release_invoices).toHaveLength(0);
      expect(ledger.release_contracts).toHaveLength(0);
      expect(ledger.release_ledger_entries).toHaveLength(0);
      expect(ledger.release_payment_events).toHaveLength(0);
    }
    const c = captureOperatingSources(s, g);
    c.check();
    expect(Object.keys(c).sort()).toEqual([
      'actor_id',
      'check',
      'entries',
      'organization_id',
    ]);
    expect(s.entries[0].target.location_id).toBe(
      s.entries[3].target.location_id,
    );
  });
it('requires explicit current confirmation before fixture preparation', async () => {
  await expect(
    prepareOperatingSources(sampleCompanies[0], {
      enabled: true,
      confirmed: false,
    }),
  ).rejects.toThrow();
});
it('current source checker rejects revoked staff and withdrawn gates', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    c = captureOperatingSources(s, g);
  g.confirmed = false;
  expect(c.check).toThrow();
  g.confirmed = true;
  const original = s.operations.syntheticMemberships.bind(s.operations);
  vi.spyOn(s.operations, 'syntheticMemberships').mockImplementation((org) =>
    original(org).map((m) => ({ ...m, active: false })),
  );
  expect(c.check).toThrow();
});
it('rejects duplicate job handles and a foreign company handle', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g);
  expect(() =>
    captureOperatingSources({ ...s, entries: [s.entries[0], s.entries[0]] }, g),
  ).toThrow();
  const foreign = await prepareOperatingSources(sampleCompanies[1], g);
  expect(() =>
    captureOperatingSources(
      { ...s, entries: [s.entries[0], foreign.entries[0]] },
      g,
    ),
  ).toThrow();
});
it('rejects a substituted same-company repository and changed original array', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    c = captureOperatingSources(s, g);
  expect(() =>
    captureOperatingSources({ ...s, operations: new Operations(true) }, g),
  ).toThrow();
  (s.entries as (typeof s.entries)[number][]).reverse();
  expect(c.check).toThrow();
});
it('retains exact selectors and detects canonical assignment/source changes', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    c = captureOperatingSources(s, g),
    e = s.entries[0];
  e.report_id = crypto.randomUUID();
  expect(c.check).toThrow();
});
it('never evaluates accessor source handles', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    getter = vi.fn(() => s.entries[0]);
  const entries = [s.entries[0]];
  Object.defineProperty(entries, '0', { get: getter, enumerable: true });
  expect(() => captureOperatingSources({ ...s, entries }, g)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
it('detects actual CRM changes after a retained read', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    c = captureOperatingSources(s, g),
    e = s.entries[0];
  const customer = await s.operations.getCustomer(
    s.company.id,
    e.target.customer_id,
  );
  await s.operations.saveCustomer(
    s.company.id,
    {
      display_name: 'Changed synthetic source',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      customer_type: customer.customer_type,
      preferred_contact: customer.preferred_contact,
    },
    customer.id,
  );
  expect(c.check).toThrow();
});
for (const field of ['day', 'report_id', 'published_version', 'issued'])
  it(`rejects executable serializer in ${field} without invocation`, async () => {
    const g = gate(),
      s = await prepareOperatingSources(sampleCompanies[0], g),
      spy = vi.fn(() => (field === 'published_version' ? 1 : 'hidden'));
    Object.assign(s.entries[0], { [field]: { toJSON: spy } });
    expect(() => captureOperatingSources(s, g)).toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
it('rejects noncanonical company serializers before calling them', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    spy = vi.fn(() => s.company),
    company = { ...s.company, toJSON: spy };
  const entries = s.entries.map((e) => ({ ...e, company }));
  expect(() =>
    captureOperatingSources({ ...s, company, entries }, g),
  ).toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('terminal source check rejects newly installed serializers', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    capture = captureOperatingSources(s, g),
    spy = vi.fn();
  Object.assign(s.entries[0].issued.version.payload.project, { toJSON: spy });
  expect(capture.check).toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('requires own-data company admission before fixture setup', async () => {
  const spy = vi.fn(() => sampleCompanies[0].id),
    company = { ...sampleCompanies[0] };
  Object.defineProperty(company, 'id', { get: spy });
  await expect(prepareOperatingSources(company, gate())).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('rechecks company data after fixture initialization awaits', async () => {
  const company = { ...sampleCompanies[0], business_info: {} },
    serializer = vi.fn(),
    initialize = Phase3Repository.prototype.initialize;
  vi.spyOn(Phase3Repository.prototype, 'initialize').mockImplementation(
    async function (this: Phase3Repository, c) {
      await initialize.call(this, c);
      Object.assign(company, { toJSON: serializer });
    },
  );
  await expect(prepareOperatingSources(company, gate())).rejects.toThrow();
  expect(serializer).not.toHaveBeenCalled();
});
it('terminal descriptor admission never evaluates a replaced root gate getter', async () => {
  const g = gate(),
    s = await prepareOperatingSources(sampleCompanies[0], g),
    capture = captureOperatingSources(s, g),
    spy = vi.fn(() => g);
  Object.defineProperty(s, 'gate', { get: spy, enumerable: true });
  expect(capture.check).toThrow();
  expect(spy).not.toHaveBeenCalled();
});
for (const field of ['id', 'version_number'])
  it(`issued handle ${field} must match the exact immutable canonical version`, async () => {
    const g = gate(),
      s = await prepareOperatingSources(sampleCompanies[0], g),
      issued = structuredClone(s.entries[0].issued);
    if (field === 'id') issued.version.id = s.entries[1].target.version_id;
    else issued.version.version_number += 40;
    const entries = s.entries.map((e, i) => (i === 0 ? { ...e, issued } : e));
    expect(() => captureOperatingSources({ ...s, entries }, g)).toThrow();
  });
for (const field of [
  'plan_id',
  'visit_id',
  'scheduled_visit_id',
  'report_id',
  'worker_id',
  'day',
  'timezone',
] as const)
  it(`initial ${field} must belong to the exact job source`, async () => {
    const g = gate(),
      s = await prepareOperatingSources(sampleCompanies[0], g);
    const value = field === 'timezone' ? 'Europe/London' : s.entries[1][field];
    const entries = s.entries.map((e, i) =>
      i === 0 ? { ...e, [field]: value } : e,
    );
    expect(() => captureOperatingSources({ ...s, entries }, g)).toThrow();
  });
