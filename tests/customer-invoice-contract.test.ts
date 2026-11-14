import { expect, it } from 'vitest';
import {
  customerInvoiceSnapshot,
  invoiceActionBoundaries,
} from '../src/components/invoices/customer-invoice-contract';
import { fictionalCustomerInvoice } from './fixtures/customer-issued-invoice';

it('uses canonical included selling lines and integer totals from the exact issued source', () => {
  const f = fictionalCustomerInvoice(),
    snapshot = customerInvoiceSnapshot(f.value, f.viewer);
  expect(snapshot.scope?.lines).toEqual(f.value.source.review.scope.lines);
  expect(snapshot.scope?.totalMinor).toBe(f.version.calculation.total_minor);
  expect(snapshot.scope?.discountMinor).toBe(1000);
  expect(snapshot.paymentState).toBe('unverified');
  expect(snapshot.paymentLink).toBeNull();
});
it.each([
  'organization_id',
  'customer_id',
  'location_id',
  'version_id',
] as const)(
  'denies a foreign line-source %s even with the same invoice header',
  (key) => {
    const f = fictionalCustomerInvoice();
    f.value.source.review[key] = 'foreign';
    expect(() => customerInvoiceSnapshot(f.value, f.viewer)).toThrow();
  },
);
it('denies conflicting line-source digest rather than substituting another issued version', () => {
  const f = fictionalCustomerInvoice();
  f.value.source.sourceHash = 'c'.repeat(64);
  expect(() => customerInvoiceSnapshot(f.value, f.viewer)).toThrow();
});
it('denies a positive but altered invoice total against the canonical source total', () => {
  const f = fictionalCustomerInvoice();
  f.value.invoice.amountMinor++;
  expect(() => customerInvoiceSnapshot(f.value, f.viewer)).toThrow(
    /totals conflict/,
  );
});
it('does not invent line items or tax from a title when the source is absent', () => {
  const f = fictionalCustomerInvoice();
  expect(
    customerInvoiceSnapshot({ ...f.value, source: null }, f.viewer).scope,
  ).toBeNull();
});
it.each([
  'companyName',
  'customerName',
  'propertyLabel',
  'primaryColor',
] as const)(
  'denies conflicting displayed %s rather than carrying another viewer branding',
  (key) => {
    const f = fictionalCustomerInvoice();
    expect(() =>
      customerInvoiceSnapshot({ ...f.value, [key]: 'other' }, f.viewer),
    ).toThrow();
  },
);
it('hides a retained response when the customer/tenant context switches', () => {
  const first = fictionalCustomerInvoice(),
    second = fictionalCustomerInvoice(1);
  expect(() => customerInvoiceSnapshot(first.value, second.viewer)).toThrow();
});
it('returns a detached deeply immutable customer-safe snapshot', () => {
  const f = fictionalCustomerInvoice(),
    snapshot = customerInvoiceSnapshot(f.value, f.viewer);
  f.value.source.review.scope.lines[0].description = 'changed';
  expect(snapshot.scope?.lines[0].description).toBe('Fictional repair work');
  expect(Object.isFrozen(snapshot.scope?.lines)).toBe(true);
  expect(JSON.stringify(snapshot)).not.toMatch(
    /PRIVATE|memo|actorId|requestHash|sourceHash|unit_cost|markup|contact_email/,
  );
});
it('rejects executable getters before invoking them', () => {
  const f = fictionalCustomerInvoice();
  let called = false;
  Object.defineProperty(f.value.source.review.scope, 'notes', {
    enumerable: true,
    get() {
      called = true;
      return 'PRIVATE';
    },
  });
  expect(() => customerInvoiceSnapshot(f.value, f.viewer)).toThrow();
  expect(called).toBe(false);
});
it('rejects private source expansion rather than serializing it', () => {
  const f = fictionalCustomerInvoice();
  expect(() =>
    customerInvoiceSnapshot(
      { ...f.value, source: { ...f.value.source, memo: 'PRIVATE' } },
      f.viewer,
    ),
  ).toThrow();
});
it('does not admit connected data or advertise a sending/correction/payment capability', () => {
  const f = fictionalCustomerInvoice();
  expect(() =>
    customerInvoiceSnapshot({ ...f.value, mode: 'connected' }, f.viewer),
  ).toThrow();
  expect(invoiceActionBoundaries.map((a) => a.id)).toEqual([
    'delivery',
    'resend',
    'cancel',
    'correction',
  ]);
  expect(invoiceActionBoundaries.every((a) => a.execution === 'disabled')).toBe(
    true,
  );
});
