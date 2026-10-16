import { expect, it, vi } from 'vitest';
import {
  SandboxRefundGateway,
  type SandboxRefund,
  type SandboxRefundStore,
} from '../server/payments/refunds';
import type { SandboxMerchant } from '../server/payments/sandbox';
import {
  reconcileStatement,
  type StatementRow,
} from '../server/payments/reconciliation';
function setup(provider: SandboxMerchant['provider'] = 'authorize_net') {
  const merchant: SandboxMerchant = {
    organizationId: crypto.randomUUID(),
    merchantConfigId: crypto.randomUUID(),
    provider,
    mode: 'sandbox',
    approvalReference: 'Synthetic local authorization only',
    approvedUntil: new Date(Date.now() + 60000).toISOString(),
  };
  const intent: SandboxRefund = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    invoiceId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 1001,
    currency: 'USD',
    expiresAt: merchant.approvedUntil,
    captureKey: crypto.randomUUID(),
    providerTransactionId: 'original_transaction',
    ...(provider === 'authorize_net'
      ? { customerProfileId: '12345', paymentProfileId: '67890' }
      : {}),
  };
  const store = {
    reserveRefund: vi.fn<SandboxRefundStore['reserveRefund']>(async () => ({
      status: 'reserved',
    })),
    finishRefund: vi.fn<SandboxRefundStore['finishRefund']>(async () => {}),
  };
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json(
      provider === 'authorize_net'
        ? {
            messages: { resultCode: 'Ok' },
            transactionResponse: {
              responseCode: '1',
              transId: 'refund_transaction',
            },
          }
        : {
            response: '1',
            id: 'refund_transaction',
            amount: '10.01',
            currency: 'USD',
          },
    ),
  );
  const gateway = new SandboxRefundGateway(
    merchant,
    provider === 'authorize_net'
      ? { apiLoginId: 'synthetic', transactionKey: 'synthetic' }
      : { apiKey: 'synthetic' },
    store,
    transport,
  );
  return { merchant, intent, store, transport, gateway };
}
it.each(['authorize_net', 'nmi'] as const)(
  'prepares exact %s refund with original transaction/profile references and no card data',
  async (p) => {
    const s = setup(p);
    expect((await s.gateway.refund(s.intent)).status).toBe('succeeded');
    const [url, init] = s.transport.mock.calls[0];
    expect(String(url)).toContain(
      p === 'nmi' ? 'sandbox.nmi.com' : 'apitest.authorize.net',
    );
    expect(init?.redirect).toBe('error');
    expect(String(init?.body)).toContain('10.01');
    expect(String(init?.body)).not.toMatch(/cardNumber|cvv|surcharge/);
    if (p === 'authorize_net')
      expect(
        JSON.parse(String(init?.body)).createTransactionRequest
          .transactionRequest.profile.paymentProfile.paymentProfileId,
      ).toBe('67890');
    else expect(String(url)).toContain('original_transaction/refund');
  },
);
it.each([
  'zero',
  'foreign-tenant',
  'wrong-merchant',
  'expired',
  'raw-field',
  'missing-profile',
  'live-mode',
  'zero-original',
])('denies refund %s before execution', async (mode) => {
  const s = setup();
  if (mode === 'zero') s.intent.amountMinor = 0;
  if (mode === 'foreign-tenant') s.intent.organizationId = crypto.randomUUID();
  if (mode === 'wrong-merchant')
    s.intent.merchantConfigId = crypto.randomUUID();
  if (mode === 'expired') s.intent.expiresAt = '2020-01-01';
  if (mode === 'raw-field') Object.assign(s.intent, { cvv: 'synthetic' });
  if (mode === 'missing-profile') delete s.intent.paymentProfileId;
  if (mode === 'zero-original') s.intent.providerTransactionId = '0';
  if (mode === 'live-mode')
    expect(
      () =>
        new SandboxRefundGateway(
          { ...s.merchant, mode: 'live' as 'sandbox' },
          { apiKey: 'synthetic' },
          s.store,
          s.transport,
        ),
    ).toThrow();
  else await expect(s.gateway.refund(s.intent)).rejects.toThrow();
  expect(s.transport).not.toHaveBeenCalled();
});
it.each(['timeout', '500', 'malformed', 'over-limit', 'mismatch', 'zero-id'])(
  'keeps refund %s UNKNOWN without retry',
  async (mode) => {
    const s = setup('nmi');
    s.transport.mockImplementation(async () => {
      if (mode === 'timeout') throw new Error('sensitive provider data');
      return mode === '500'
        ? new Response('', { status: 500 })
        : mode === 'malformed'
          ? new Response('{')
          : mode === 'over-limit'
            ? Response.json({ x: 'a'.repeat(66000) })
            : Response.json({
                response: '1',
                id: mode === 'zero-id' ? '0' : 'refund',
                currency: 'USD',
                amount: '999.00',
              });
    });
    expect((await s.gateway.refund(s.intent)).status).toBe('unknown');
    expect(s.transport).toHaveBeenCalledOnce();
    expect(s.store.finishRefund).toHaveBeenCalledOnce();
  },
);
it('never retries a previous pending/unknown refund', async () => {
  const s = setup();
  s.store.reserveRefund.mockResolvedValue({ status: 'unknown' });
  await expect(s.gateway.refund(s.intent)).rejects.toThrow(/reconciliation/);
  expect(s.transport).not.toHaveBeenCalled();
});
it('freezes refund authority and profile identifiers across reservation wait', async () => {
  const s = setup();
  s.store.reserveRefund.mockImplementation(async (m, i) => {
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(i)).toBe(true);
    s.intent.amountMinor = 9000;
    s.intent.providerTransactionId = 'changed';
    s.intent.paymentProfileId = '99999';
    return { status: 'reserved' };
  });
  expect((await s.gateway.refund(s.intent)).amountMinor).toBe(1001);
  expect(String(s.transport.mock.calls[0][1]?.body)).not.toContain('99999');
});
it('reconciles captures/refunds exactly and detects missing/duplicate/foreign statements', () => {
  const { merchant: m } = setup();
  const row: StatementRow = {
      organizationId: m.organizationId,
      merchantConfigId: m.merchantConfigId,
      provider: m.provider,
      mode: 'sandbox',
      transactionId: 'capture',
      kind: 'capture',
      amountMinor: 10001,
      currency: 'USD',
    },
    refund = {
      ...row,
      transactionId: 'refund',
      kind: 'refund' as const,
      amountMinor: 1001,
    };
  const result = reconcileStatement(m, [row, refund], [refund, row]);
  expect(result.balanced).toBe(true);
  expect(result.expectedNetMinor).toBe('9000');
  expect(
    reconcileStatement(m, [row], [{ ...row, amountMinor: 10000 }]).conflicts,
  ).toEqual(['capture']);
  expect(reconcileStatement(m, [row], []).missing).toEqual(['capture']);
  expect(() => reconcileStatement(m, [row], [row, row])).toThrow(/Duplicate/);
  expect(() =>
    reconcileStatement(
      m,
      [row],
      [{ ...row, organizationId: crypto.randomUUID() }],
    ),
  ).toThrow();
});

it('Authorize.Net refund redirect cannot fall back to a production endpoint', async () => {
  const s = setup('authorize_net');
  s.transport.mockImplementation(async () =>
    Response.redirect('https://api.authorize.net/xml/v1/request.api', 307),
  );
  const result = await s.gateway.refund(s.intent);
  expect(result.status).toBe('unknown');
  expect(s.transport).toHaveBeenCalledOnce();
  expect(s.transport.mock.calls[0][0]).toBe(
    'https://apitest.authorize.net/xml/v1/request.api',
  );
  expect(s.transport.mock.calls[0][1]?.redirect).toBe('error');
});
