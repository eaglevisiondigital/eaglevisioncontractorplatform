import { expect, it, vi } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { sampleCompanies } from '../../src/domain/platform';
import { saveCurrentLocation } from '../../src/components/crm/location-source';
async function fixture() {
  const repo = new Operations(true),
    org = sampleCompanies[0].id,
    customer = (await repo.listCustomers(org)).rows[0];
  const draft = {
    address_line1: '10 Original',
    address_line2: 'Suite Fictional',
    city: 'Fictional',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
  };
  await repo.saveLocation(org, customer.id, draft);
  const shown = (await repo.listLocations(org, customer.id)).find(
      (l) => l.address_line1 === '10 Original',
    )!,
    writer = vi.spyOn(repo, 'saveLocation');
  const run = (current = () => true, reviewed = true) =>
    saveCurrentLocation(
      repo,
      org,
      customer.id,
      shown,
      { ...draft, city: 'Reviewed city' },
      reviewed,
      current,
    );
  return { repo, org, customer, draft, shown, writer, run };
}
it('denies stale displayed address without replacing a newer saved address', async () => {
  const f = await fixture();
  await f.repo.saveLocation(
    f.org,
    f.customer.id,
    { ...f.draft, address_line1: '20 Newer' },
    f.shown.id,
  );
  f.writer.mockClear();
  await expect(f.run()).rejects.toThrow(/Saved location changed/);
  expect(f.writer).not.toHaveBeenCalled();
  expect(
    (await f.repo.listLocations(f.org, f.customer.id)).find(
      (l) => l.id === f.shown.id,
    )?.address_line1,
  ).toBe('20 Newer');
});
it('saves and reopens the exact reviewed address without replacing location identity', async () => {
  const f = await fixture();
  await f.run();
  const rows = await f.repo.listLocations(f.org, f.customer.id);
  expect(rows.find((l) => l.id === f.shown.id)).toEqual({
    ...f.shown,
    city: 'Reviewed city',
  });
  expect(f.writer).toHaveBeenCalledTimes(1);
  expect(rows.filter((l) => l.id === f.shown.id)).toHaveLength(1);
});
it('requires explicit current source review', async () => {
  const f = await fixture();
  await expect(f.run(() => true, false)).rejects.toThrow(/Review the current/);
  expect(f.writer).not.toHaveBeenCalled();
});
it.each(['org', 'customer', 'missing', 'duplicate', 'timestamp'] as const)(
  'denies %s source mismatch',
  async (mode) => {
    const f = await fixture();
    if (mode === 'org') f.shown.organization_id = sampleCompanies[1].id;
    if (mode === 'customer') f.shown.customer_id = 'foreign-customer';
    if (mode === 'timestamp') f.shown.created_at = 'unknown';
    if (mode === 'missing')
      vi.spyOn(f.repo, 'listLocations').mockResolvedValue([]);
    if (mode === 'duplicate')
      vi.spyOn(f.repo, 'listLocations').mockResolvedValue([f.shown, f.shown]);
    await expect(f.run()).rejects.toThrow(/UNKNOWN|changed/);
    expect(f.writer).not.toHaveBeenCalled();
  },
);
it('denies missing current customer', async () => {
  const f = await fixture();
  vi.spyOn(f.repo, 'getCustomer').mockResolvedValue(null as never);
  await expect(f.run()).rejects.toThrow(/UNKNOWN/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('denies revoked CRM while preserving original role rules', async () => {
  const f = await fixture();
  const access = await f.repo.companyAccess(f.org);
  vi.spyOn(f.repo, 'companyAccess').mockResolvedValue({
    ...access,
    crm: false,
  });
  await expect(f.run()).rejects.toThrow(/CRM location access/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('cancels changed company/location context after awaited source read', async () => {
  const f = await fixture();
  let current = true;
  const read = f.repo.listLocations.bind(f.repo);
  vi.spyOn(f.repo, 'listLocations').mockImplementation(async (...args) => {
    const r = await read(...args);
    current = false;
    return r;
  });
  await expect(f.run(() => current)).rejects.toThrow(/context changed/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('sanitizes private source failure and permits deliberate later corrected attempt', async () => {
  const f = await fixture();
  const spy = vi
    .spyOn(f.repo, 'listLocations')
    .mockRejectedValueOnce(Error('Fictional private DB diagnostic'));
  await expect(f.run()).rejects.toThrow(
    'Current location source unavailable · UNKNOWN',
  );
  expect(f.writer).not.toHaveBeenCalled();
  spy.mockRestore();
  await f.run();
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('excludes overlapping identical control saves', async () => {
  const f = await fixture();
  const result = await Promise.allSettled([f.run(), f.run()]);
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('retains UNKNOWN after committed save and lost ACK, including refreshed supplied source', async () => {
  const f = await fixture(),
    raw = Operations.prototype.saveLocation;
  f.writer.mockImplementation(async (...args) => {
    await raw.apply(f.repo, args);
    throw Error('Fictional lost ACK');
  });
  await expect(f.run()).rejects.toThrow(/outcome UNKNOWN/);
  const latest = (await f.repo.listLocations(f.org, f.customer.id)).find(
    (l) => l.id === f.shown.id,
  )!;
  await expect(
    saveCurrentLocation(
      f.repo,
      f.org,
      f.customer.id,
      latest,
      f.draft,
      true,
      () => true,
    ),
  ).rejects.toThrow(/outcome UNKNOWN/);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('ordinary new location uses original writer and exact current customer', async () => {
  const f = await fixture();
  await saveCurrentLocation(
    f.repo,
    f.org,
    f.customer.id,
    undefined,
    { ...f.draft, address_line1: '30 New' },
    false,
    () => true,
  );
  expect(f.writer).toHaveBeenCalledWith(
    f.org,
    f.customer.id,
    { ...f.draft, address_line1: '30 New' },
    undefined,
  );
});

it.each(['id', 'organization_id', 'customer_id', 'created_at'])(
  'rejects hidden %s replacement in an address payload',
  async (key) => {
    const f = await fixture();
    await expect(
      saveCurrentLocation(
        f.repo,
        f.org,
        f.customer.id,
        f.shown,
        { ...f.draft, [key]: 'foreign' },
        true,
        () => true,
      ),
    ).rejects.toThrow(/identity changes/);
    expect(f.writer).not.toHaveBeenCalled();
  },
);
