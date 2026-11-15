import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import { loadCustomerNumberDecoder } from './fixtures/number-decoder-proposal';
let loaded: Awaited<ReturnType<typeof loadCustomerNumberDecoder>>;
beforeAll(async () => {
  loaded = await loadCustomerNumberDecoder();
});
function fixture(number = 'INV-2026-000001') {
  const invoice = {
    organizationId: randomUUID(),
    customerId: randomUUID(),
    locationId: randomUUID(),
    sourceVersionId: randomUUID(),
    invoiceId: randomUUID(),
    revision: 1,
  };
  const target = {
    invoice,
    companyName: 'FICTIONAL CONTRACTOR',
    customerName: 'FICTIONAL CUSTOMER',
    propertyLabel: 'FICTIONAL PROPERTY',
    primaryColor: '#123456',
  };
  const now = Date.now();
  const response = {
    schema: 'commercial-customer-issued-read-v1',
    mode: 'fictional-local',
    sourceCategory: 'commercial-issued-proposal',
    invoice: {
      ...invoice,
      number,
      title: 'Fixture <text only>',
      currency: 'USD',
      amountMinor: 1100,
      issuedAt: '2026-12-31T23:59:59Z',
      issuanceReceiptId: randomUUID(),
    },
    observedAt: now,
    expiresAt: now + 25000,
    payment: { status: 'UNKNOWN', balanceMinor: null, receipt: null },
    link: { status: 'DISABLED', href: null, expiresAt: now + 25000 },
    delivery: 'DISABLED',
    resend: 'DISABLED',
  };
  return { target, response, now };
}
it('decodes the approved yearly public content while payment, links and delivery remain disabled', () => {
  const f = fixture();
  const r = loaded.commercialCustomerResponse(f.response, f.target, f.now);
  expect((r.invoice as { number: string }).number).toBe('INV-2026-000001');
  expect(r.payment).toEqual({
    status: 'UNKNOWN',
    balanceMinor: null,
    receipt: null,
  });
  expect(r.delivery).toBe('DISABLED');
});
it('preserves the original exact UUID-derived customer display', () => {
  const f = fixture();
  f.response.invoice.number =
    'INV-' + f.target.invoice.invoiceId.replaceAll('-', '');
  expect(() =>
    loaded.commercialCustomerResponse(f.response, f.target, f.now),
  ).not.toThrow();
  f.response.invoice.number = 'INV-' + randomUUID().replaceAll('-', '');
  expect(() =>
    loaded.commercialCustomerResponse(f.response, f.target, f.now),
  ).toThrow();
});
it.each([
  'INV-0000-000001',
  'INV-2026-000000',
  'INV-2026-1000000',
  'FICTA-00000001',
  'INV-2026-00001',
  'inv-2026-000001',
])('denies invalid public content %s', (number) => {
  const f = fixture(number);
  expect(() =>
    loaded.commercialCustomerResponse(f.response, f.target, f.now),
  ).toThrow();
});
it.each([
  'organizationId',
  'customerId',
  'locationId',
  'sourceVersionId',
  'invoiceId',
  'revision',
] as const)('same display never substitutes independent current %s', (key) => {
  const f = fixture();
  const invoice = {
    ...f.response.invoice,
    [key]: key === 'revision' ? 2 : randomUUID(),
  };
  expect(() =>
    loaded.commercialCustomerResponse(
      { ...f.response, invoice },
      f.target,
      f.now,
    ),
  ).toThrow();
});
it('denies expired/stale content and does not infer a balance or payment receipt', () => {
  const f = fixture();
  expect(() =>
    loaded.commercialCustomerResponse(f.response, f.target, f.now + 25000),
  ).toThrow();
  expect(() =>
    loaded.commercialCustomerResponse(
      { ...f.response, observedAt: f.now - 30001 },
      f.target,
      f.now,
    ),
  ).toThrow();
  expect(() =>
    loaded.commercialCustomerResponse(
      {
        ...f.response,
        payment: { status: 'PAID', balanceMinor: 0, receipt: 'made-up' },
      },
      f.target,
      f.now,
    ),
  ).toThrow();
});
it('public request target rejects number/private-source fields rather than using them as identity', async () => {
  const f = fixture();
  const controller = new loaded.CommercialCustomerReadController(
    () => ({
      ...f.target,
      invoice: { ...f.target.invoice, number: f.response.invoice.number },
    }),
    async () => f.response,
    false,
  );
  expect(controller.getSnapshot().status).toBe('disabled');
  expect(
    () =>
      new loaded.CommercialCustomerReadController(
        () => ({
          ...f.target,
          invoice: { ...f.target.invoice, number: f.response.invoice.number },
        }),
        async () => f.response,
        true,
      ),
  ).toThrow();
});
it('retains defaultOFF and post-await wrong-customer/UNKNOWN suppression in the actual controller', async () => {
  const f = fixture();
  let calls = 0;
  const off = new loaded.CommercialCustomerReadController(
    () => f.target,
    async () => {
      calls++;
      return f.response;
    },
  );
  await off.open();
  expect(calls).toBe(0);
  expect(off.getSnapshot().status).toBe('disabled');
  let resolve!: (v: unknown) => void;
  const c = new loaded.CommercialCustomerReadController(
    () => f.target,
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    true,
  );
  const pending = c.open();
  f.target.invoice.customerId = randomUUID();
  resolve(f.response);
  await pending;
  expect(c.getSnapshot().status).toBe('unknown');
  c.close();
});
it('supports explicit fresh reads without resurrecting withdrawn/late original content', async () => {
  const f = fixture();
  let denied = false;
  const c = new loaded.CommercialCustomerReadController(
    () => f.target,
    async () => {
      if (denied) throw Error('Current grant/session withdrawn');
      return f.response;
    },
    true,
  );
  await c.open();
  expect(c.getSnapshot().status).toBe('ready');
  denied = true;
  await c.open();
  expect(c.getSnapshot().status).toBe('unknown');
  c.close();
});
it('does not evaluate getters or coercions while copying customer content', () => {
  const f = fixture();
  let calls = 0;
  Object.defineProperty(f.response.invoice, 'number', {
    enumerable: true,
    get() {
      calls++;
      return 'INV-2026-000001';
    },
  });
  expect(() =>
    loaded.commercialCustomerResponse(f.response, f.target, f.now),
  ).toThrow();
  expect(calls).toBe(0);
});
