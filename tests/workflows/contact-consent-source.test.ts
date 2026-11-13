import { expect, it, vi } from 'vitest';
import { Operations } from '../../src/lib/operations';
import { sampleCompanies } from '../../src/domain/platform';
import { recordCurrentContactConsent } from '../../src/components/crm/contact-consent-source';
async function fixture() {
  const org = sampleCompanies[0].id,
    repo = new Operations(true),
    customer = (await repo.listCustomers(org)).rows[0];
  await repo.recordConsent(org, customer.id, true, false);
  const shown = await repo.customerHistory(org, customer.id),
    writer = vi.spyOn(repo, 'recordConsent');
  const run = (
    email = true,
    sms = true,
    current = () => true,
    confirmed = true,
    rows = shown.consents,
  ) =>
    recordCurrentContactConsent(
      repo,
      org,
      customer,
      rows,
      email,
      sms,
      confirmed,
      current,
    );
  return { org, repo, customer, shown, writer, run };
}
it('blocks stale email restoration while recording a new SMS choice', async () => {
  const f = await fixture();
  await f.repo.recordConsent(f.org, f.customer.id, false, false);
  f.writer.mockClear();
  await expect(f.run()).rejects.toThrow(/Stored consent changed/);
  expect(f.writer).not.toHaveBeenCalled();
  expect(
    (await f.repo.customerHistory(f.org, f.customer.id)).consents[0]
      .email_allowed,
  ).toBe(false);
});
it('explicit current source and confirmed choices append and reopen without modifying original records', async () => {
  const f = await fixture();
  await f.repo.recordConsent(f.org, f.customer.id, false, false);
  const current = await f.repo.customerHistory(f.org, f.customer.id);
  f.writer.mockClear();
  await f.run(false, true, () => true, true, current.consents);
  const after = await f.repo.customerHistory(f.org, f.customer.id);
  expect(after.consents[0]).toMatchObject({
    organization_id: f.org,
    customer_id: f.customer.id,
    email_allowed: false,
    sms_allowed: true,
  });
  expect(after.consents.slice(1)).toEqual(current.consents);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('denies a customer selected under another company before any writer call', async () => {
  const f = await fixture();
  await expect(
    recordCurrentContactConsent(
      f.repo,
      sampleCompanies[1].id,
      f.customer,
      f.shown.consents,
      true,
      true,
      true,
      () => true,
    ),
  ).rejects.toThrow(/exact current customer/);
  expect(f.writer).not.toHaveBeenCalled();
});
it.each([
  'foreign-organization',
  'foreign-customer',
  'duplicate',
  'invalid-flags',
] as const)('denies %s history as UNKNOWN', async (mode) => {
  const f = await fixture(),
    rows = structuredClone(f.shown.consents);
  if (mode === 'foreign-organization')
    rows[0].organization_id = sampleCompanies[1].id;
  if (mode === 'foreign-customer') rows[0].customer_id = crypto.randomUUID();
  if (mode === 'duplicate') rows.push({ ...rows[0] });
  if (mode === 'invalid-flags')
    Object.assign(rows[0], { email_allowed: 'true' });
  await expect(f.run(true, true, () => true, true, rows)).rejects.toThrow(
    /UNKNOWN/,
  );
  expect(f.writer).not.toHaveBeenCalled();
});
it('denies absent loaded history rather than manufacturing default choices', async () => {
  const f = await fixture();
  await expect(
    recordCurrentContactConsent(
      f.repo,
      f.org,
      f.customer,
      undefined as never,
      true,
      true,
      true,
      () => true,
    ),
  ).rejects.toThrow(/UNKNOWN/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('requires explicit current-source confirmation and keeps unconfirmed inputs unwritten', async () => {
  const f = await fixture();
  await expect(f.run(true, true, () => true, false)).rejects.toThrow(
    /Review the exact/,
  );
  expect(f.writer).not.toHaveBeenCalled();
});
it('denies revoked CRM access without appointing or requiring a new administrator role', async () => {
  const f = await fixture(),
    access = await f.repo.companyAccess(f.org);
  vi.spyOn(f.repo, 'companyAccess').mockResolvedValue({
    ...access,
    crm: false,
  });
  await expect(f.run()).rejects.toThrow(/CRM consent-recording access/);
  expect(f.writer).not.toHaveBeenCalled();
});
it('withholds unavailable exact customer and sanitizes read diagnostics', async () => {
  const f = await fixture();
  vi.spyOn(f.repo, 'getCustomer').mockRejectedValue(
    Error('Fictional private database detail'),
  );
  await expect(f.run()).rejects.toThrow(
    'Current consent source unavailable · UNKNOWN',
  );
  expect(f.writer).not.toHaveBeenCalled();
});
it('company/navigation changes during history read cancel the original customer command', async () => {
  const f = await fixture();
  let current = true;
  vi.spyOn(f.repo, 'customerHistory').mockImplementation(async () => {
    current = false;
    return f.shown;
  });
  await expect(f.run(true, true, () => current)).rejects.toThrow(
    /context changed/,
  );
  expect(f.writer).not.toHaveBeenCalled();
});
it('excludes concurrent duplicate records through the same existing control', async () => {
  const f = await fixture(),
    results = await Promise.allSettled([f.run(), f.run()]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(f.writer).toHaveBeenCalledTimes(1);
  expect(
    (await f.repo.customerHistory(f.org, f.customer.id)).consents,
  ).toHaveLength(2);
});
it('retains UNKNOWN after lost acknowledgment even when fresh source is supplied', async () => {
  const f = await fixture(),
    raw = Operations.prototype.recordConsent;
  f.writer.mockImplementation(async (...args) => {
    await raw.apply(f.repo, args);
    throw Error('Fictional private transport detail');
  });
  await expect(f.run()).rejects.toThrow(/outcome UNKNOWN/);
  const fresh = await f.repo.customerHistory(f.org, f.customer.id);
  await expect(
    f.run(false, false, () => true, true, fresh.consents),
  ).rejects.toThrow(/outcome UNKNOWN/);
  expect(f.writer).toHaveBeenCalledTimes(1);
});
it('the canonical sample writer appends before its returned promise is awaited', async () => {
  const f = await fixture();
  const pending = f.repo.recordConsent(f.org, f.customer.id, false, false);
  const captured = f.repo.customerHistory(f.org, f.customer.id);
  await pending;
  expect((await captured).consents[0]).toMatchObject({
    email_allowed: false,
    sms_allowed: false,
  });
});

it('missing current customer is UNKNOWN rather than a dereference or a new permission', async () => {
  const f = await fixture();
  vi.spyOn(f.repo, 'getCustomer').mockResolvedValue(null as never);
  await expect(f.run()).rejects.toThrow(
    /Exact current customer unavailable · UNKNOWN/,
  );
  expect(f.writer).not.toHaveBeenCalled();
});
it('missing current history is UNKNOWN without a writer call', async () => {
  const f = await fixture();
  vi.spyOn(f.repo, 'customerHistory').mockResolvedValue(null as never);
  await expect(f.run()).rejects.toThrow(
    /Current consent history unavailable · UNKNOWN/,
  );
  expect(f.writer).not.toHaveBeenCalled();
});
