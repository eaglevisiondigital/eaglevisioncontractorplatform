import { expect, it, vi } from 'vitest';
import {
  SandboxGateway,
  minorDecimal,
  type SandboxMerchant,
  type SandboxIntent,
  type SandboxIntentStore,
} from '../server/payments/sandbox';
function setup(provider: 'authorize_net' | 'nmi' = 'authorize_net') {
  const merchant: SandboxMerchant = {
    organizationId: crypto.randomUUID(),
    merchantConfigId: crypto.randomUUID(),
    provider,
    mode: 'sandbox',
    approvalReference: 'Synthetic approved sandbox test',
    approvedUntil: new Date(Date.now() + 3600000).toISOString(),
  };
  const intent: SandboxIntent = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    invoiceId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 12345,
    currency: 'USD',
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  };
  const store = {
    reserve: vi.fn<SandboxIntentStore['reserve']>(async () => ({
      status: 'reserved',
    })),
    finish: vi.fn<SandboxIntentStore['finish']>(async () => {}),
  };
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json(
      provider === 'authorize_net'
        ? {
            messages: { resultCode: 'Ok' },
            transactionResponse: {
              responseCode: '1',
              transId: 'synthetic-transaction',
            },
          }
        : {
            id: 'synthetic-transaction',
            response: '1',
            amount: '123.45',
            currency: 'USD',
          },
    ),
  );
  const credentials =
    provider === 'authorize_net'
      ? { apiLoginId: 'synthetic-only', transactionKey: 'synthetic-only' }
      : { apiKey: 'synthetic-only' };
  return {
    merchant,
    intent,
    store,
    transport,
    credentials,
    token:
      provider === 'authorize_net'
        ? {
            provider,
            descriptor: 'COMMON.ACCEPT.INAPP.PAYMENT' as const,
            value: 'synthetic-token',
          }
        : { provider, value: 'synthetic-token' },
  };
}
it.each(['authorize_net', 'nmi'] as const)(
  'uses only the fixed %s sandbox endpoint and normalized metadata',
  async (provider) => {
    const s = setup(provider),
      gateway = new SandboxGateway(
        s.merchant,
        s.credentials,
        s.store,
        s.transport,
      );
    const r = await gateway.capture(s.intent, s.token);
    expect(r.status).toBe('succeeded');
    expect(r.mode).toBe('sandbox');
    expect(s.transport.mock.calls[0][0]).toBe(
      provider === 'authorize_net'
        ? 'https://apitest.authorize.net/xml/v1/request.api'
        : 'https://sandbox.nmi.com/api/v5/payments/sale',
    );
    expect(s.transport.mock.calls[0][1]?.redirect).toBe('error');
    const body = String(s.transport.mock.calls[0][1]?.body);
    expect(body).toContain('123.45');
    expect(body).not.toContain('card_number');
    expect(body).not.toContain('surcharge');
    expect(body).not.toContain('cvv');
    expect(s.store.finish).toHaveBeenCalledOnce();
  },
);
it('formats currency exactly without floating-point multiplication', () => {
  expect(minorDecimal(10001)).toBe('100.01');
  expect(minorDecimal(9000000000000)).toBe('90000000000.00');
  for (const n of [0, 1.5, NaN, 9000000000001])
    expect(() => minorDecimal(n)).toThrow();
});
it.each([
  'live-mode',
  'cross-tenant',
  'wrong-merchant',
  'expired',
  'non-usd',
  'raw-card',
  'raw-field',
])('rejects %s before any reservation/provider call', async (mode) => {
  const s = setup();
  if (mode === 'live-mode') s.merchant.mode = 'production' as 'sandbox';
  if (mode === 'cross-tenant') s.intent.organizationId = crypto.randomUUID();
  if (mode === 'wrong-merchant')
    s.intent.merchantConfigId = crypto.randomUUID();
  if (mode === 'expired') s.intent.expiresAt = '2020-01-01';
  if (mode === 'non-usd') s.intent.currency = 'EUR' as 'USD';
  if (mode === 'raw-card') s.token.value = '4111111111111111';
  if (mode === 'raw-field') Object.assign(s.intent, { cvv: '123' });
  await expect(async () =>
    new SandboxGateway(s.merchant, s.credentials, s.store, s.transport).capture(
      s.intent,
      s.token,
    ),
  ).rejects.toThrow();
  expect(s.transport).not.toHaveBeenCalled();
  expect(s.store.reserve).not.toHaveBeenCalled();
});
it.each([
  'timeout',
  'http-error',
  'oversized',
  'malformed',
  'provider-error',
  'mismatched-currency',
  'mismatched-amount',
])(
  'retains %s as UNKNOWN instead of inventing success or retrying',
  async (mode) => {
    const s = setup('nmi');
    s.transport.mockImplementation(async () => {
      if (mode === 'timeout') throw new Error('sensitive response');
      if (mode === 'http-error') return new Response('', { status: 500 });
      if (mode === 'malformed') return new Response('{');
      if (mode === 'oversized')
        return Response.json({ value: 'x'.repeat(70000) });
      return Response.json({
        id: 'test',
        response: mode === 'provider-error' ? '3' : '1',
        amount: mode === 'mismatched-amount' ? '1.00' : '123.45',
        currency: mode === 'mismatched-currency' ? 'EUR' : 'USD',
      });
    });
    const result = await new SandboxGateway(
      s.merchant,
      s.credentials,
      s.store,
      s.transport,
    ).capture(s.intent, s.token);
    expect(result.status).toBe('unknown');
    expect(result.transactionId).toBeNull();
    expect(s.transport).toHaveBeenCalledOnce();
    expect(s.store.finish).toHaveBeenCalledWith(s.merchant, s.intent, result);
  },
);
it('replays a stored result without provider execution and blocks an uncertain prior attempt', async () => {
  const s = setup();
  s.store.reserve.mockResolvedValue({
    status: 'existing',
    result: {
      status: 'succeeded',
      provider: 'authorize_net',
      transactionId: 'test',
      amountMinor: s.intent.amountMinor,
      currency: 'USD',
      mode: 'sandbox',
    },
  });
  expect(
    (
      await new SandboxGateway(
        s.merchant,
        s.credentials,
        s.store,
        s.transport,
      ).capture(s.intent, s.token)
    ).transactionId,
  ).toBe('test');
  expect(s.transport).not.toHaveBeenCalled();
  s.store.reserve.mockResolvedValue({ status: 'unknown' });
  await expect(
    new SandboxGateway(s.merchant, s.credentials, s.store, s.transport).capture(
      s.intent,
      s.token,
    ),
  ).rejects.toThrow(/reconciliation/);
});
it('normalizes explicit decline without retaining sensitive provider details', async () => {
  const s = setup();
  s.transport.mockResolvedValue(
    Response.json({
      transactionResponse: {
        responseCode: '2',
        error: 'sensitive',
        accountNumber: 'secret',
      },
    }),
  );
  const result = await new SandboxGateway(
    s.merchant,
    s.credentials,
    s.store,
    s.transport,
  ).capture(s.intent, s.token);
  expect(result.status).toBe('declined');
  expect(JSON.stringify(result)).not.toContain('secret');
});
it.each(['zero-transaction', 'inconsistent-message'])(
  'does not call Authorize.Net %s an actual sandbox capture',
  async (mode) => {
    const s = setup();
    s.transport.mockResolvedValue(
      Response.json({
        messages: {
          resultCode: mode === 'inconsistent-message' ? 'Error' : 'Ok',
        },
        transactionResponse: {
          responseCode: '1',
          transId: mode === 'zero-transaction' ? '0' : 'synthetic-transaction',
        },
      }),
    );
    expect(
      (
        await new SandboxGateway(
          s.merchant,
          s.credentials,
          s.store,
          s.transport,
        ).capture(s.intent, s.token)
      ).status,
    ).toBe('unknown');
  },
);
