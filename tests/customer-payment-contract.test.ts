import { expect, it, vi } from 'vitest';
import {
  readCustomerPayment,
  inspectCustomerPayment,
} from '../src/components/invoices/customer-payment-contract';
import { customerPaymentFixture } from './fixtures/customer-payment';

it('complete original invoice postings prove unpaid with no invented payment receipt', async () => {
  const f = await customerPaymentFixture(),
    before = f.source.release.read('staff');
  const p = await readCustomerPayment(f.source);
  expect(p.status).toBe('UNPAID');
  expect(p.balanceMinor).toBe(f.invoice.total_minor);
  expect(p.receipts).toEqual([]);
  expect(p.commercialBridge).toBe('HELD');
  expect(p.link).toMatchObject({
    href: null,
    execution: 'disabled',
    kind: 'synthetic-non-navigable',
  });
  expect(f.source.release.read('staff')).toEqual(before);
});
it('canonical capture, second capture and refund update balance while originals remain immutable', async () => {
  const f = await customerPaymentFixture();
  await f.capture(10_000);
  const partial = await readCustomerPayment(f.source);
  expect(partial.status).toBe('PARTIALLY_PAID');
  expect(partial.balanceMinor).toBe(21_900);
  await f.capture(21_900);
  expect(() => inspectCustomerPayment(partial)).toThrow(/UNKNOWN/);
  const paid = await readCustomerPayment(f.source);
  expect(paid.status).toBe('PAID');
  expect(paid.receipts).toHaveLength(2);
  const original = JSON.stringify(paid.receipts[0]);
  await f.refund(2500);
  const refunded = await readCustomerPayment(f.source);
  expect(refunded.status).toBe('PARTIALLY_PAID');
  expect(refunded.balanceMinor).toBe(2500);
  expect(refunded.refundedMinor).toBe(2500);
  expect(refunded.receipts.at(-1)?.adjustsEventId).toBe(
    refunded.receipts[0].eventId,
  );
  expect(JSON.stringify(refunded.receipts[0])).toBe(original);
  expect(() => inspectCustomerPayment(paid)).toThrow(/UNKNOWN/);
});
it.each([
  'organizationId',
  'customerId',
  'propertyId',
  'sourceVersionId',
  'invoiceId',
  'sessionId',
] as const)('changed %s invalidates old content permanently', async (field) => {
  const f = await customerPaymentFixture(),
    p = await readCustomerPayment(f.source),
    original = f.source.current();
  f.setAccess({ [field]: 'other-context' });
  expect(() => inspectCustomerPayment(p)).toThrow(/UNKNOWN/);
  f.setAccess(original);
  expect(() => inspectCustomerPayment(p)).toThrow(/UNKNOWN/);
});
it('revoked, expired, rolled-back-clock and overlong local sessions never retain a balance', async () => {
  const f = await customerPaymentFixture();
  const p = await readCustomerPayment(f.source);
  f.setAccess({ active: false });
  expect(() => inspectCustomerPayment(p)).toThrow(/UNKNOWN/);
  await expect(readCustomerPayment(f.source)).rejects.toThrow();
  f.setAccess({ active: true, expiresAt: Date.now() });
  await expect(readCustomerPayment(f.source)).rejects.toThrow();
  const time = Date.now();
  f.setAccess({ expiresAt: time + 300_001 });
  await expect(
    readCustomerPayment({ ...f.source, now: () => time }),
  ).rejects.toThrow();
  f.setAccess({ expiresAt: time + 1000 });
  let clock = time;
  const current = await readCustomerPayment({ ...f.source, now: () => clock });
  clock--;
  expect(() => inspectCustomerPayment(current)).toThrow();
});
it.each([
  'missing-posting',
  'missing-event-posting',
  'duplicate-event',
  'foreign-event',
  'wrong-authorization',
  'wrong-source',
  'extra-posting',
] as const)(
  'fails closed for %s without a balance fallback',
  async (defect) => {
    const f = await customerPaymentFixture();
    await f.capture(10_000);
    const workspace = f.source.release.read('customer');
    switch (defect) {
      case 'missing-posting':
        workspace.release_ledger_entries = [];
        break;
      case 'missing-event-posting':
        workspace.release_ledger_entries =
          workspace.release_ledger_entries.filter((r) => !r.event_id);
        break;
      case 'duplicate-event':
        workspace.release_payment_events.push(
          workspace.release_payment_events[0],
        );
        break;
      case 'foreign-event':
        workspace.release_payment_events[0].customer_id = crypto.randomUUID();
        break;
      case 'wrong-authorization':
        workspace.release_authorizations[0].amount_minor++;
        break;
      case 'wrong-source':
        workspace.release_invoices[0].snapshot.lines[0].description =
          'Substituted source';
        break;
      case 'extra-posting':
        workspace.release_ledger_entries.push({
          ...workspace.release_ledger_entries[0],
          id: crypto.randomUUID(),
        });
        break;
    }
    vi.spyOn(f.source.release, 'read').mockReturnValue(workspace);
    await expect(readCustomerPayment(f.source)).rejects.toThrow();
  },
);
it('revocation during awaited hashing denies and detached/forged snapshots cannot claim paid', async () => {
  const f = await customerPaymentFixture();
  const read = readCustomerPayment(f.source);
  f.setAccess({ active: false });
  await expect(read).rejects.toThrow(/UNKNOWN/);
  f.setAccess({ active: true });
  const snapshot = await readCustomerPayment(f.source);
  expect(() => inspectCustomerPayment(structuredClone(snapshot))).toThrow();
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.receipts)).toBe(true);
  expect(JSON.stringify(snapshot)).not.toMatch(
    /unit_cost|PRIVATE|terms|authorization_id|idempotency_key|document_hash|sessionId/,
  );
});
it('a full refund returns unpaid while preserving capture and refund receipts', async () => {
  const f = await customerPaymentFixture();
  await f.capture(f.invoice.total_minor);
  await f.refund(f.invoice.total_minor);
  const p = await readCustomerPayment(f.source);
  expect(p.status).toBe('UNPAID');
  expect(p.capturedMinor).toBe(p.refundedMinor);
  expect(p.receipts).toHaveLength(2);
});
it.each([
  'organizationId',
  'customerId',
  'propertyId',
  'sourceVersionId',
  'invoiceId',
] as const)(
  'initial foreign %s cannot open canonical invoice evidence',
  async (field) => {
    const f = await customerPaymentFixture();
    f.setAccess({ [field]: crypto.randomUUID() });
    await expect(readCustomerPayment(f.source)).rejects.toThrow();
  },
);
