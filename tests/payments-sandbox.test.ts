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
it.each(['authorize_net', 'nmi'] as const)(
  'binds %s execution to immutable values across reservation waits',
  async (provider) => {
    const s = setup(provider);
    const original = { ...s.intent };
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    s.store.reserve.mockImplementation(async (merchant, intent) => {
      expect(Object.isFrozen(merchant)).toBe(true);
      expect(Object.isFrozen(intent)).toBe(true);
      await waiting;
      return { status: 'reserved' };
    });
    const gateway = new SandboxGateway(
      s.merchant,
      s.credentials,
      s.store,
      s.transport,
    );
    const capture = gateway.capture(s.intent, s.token);
    Object.assign(s.intent, {
      amountMinor: 999999,
      organizationId: crypto.randomUUID(),
      merchantConfigId: crypto.randomUUID(),
      authorizationId: crypto.randomUUID(),
      invoiceId: crypto.randomUUID(),
    });
    s.token.value = 'different-token';
    s.merchant.provider = provider === 'nmi' ? 'authorize_net' : 'nmi';
    s.merchant.mode = 'production' as 'sandbox';
    if ('apiKey' in s.credentials) s.credentials.apiKey = 'changed-secret';
    if ('transactionKey' in s.credentials)
      s.credentials.transactionKey = 'changed-secret';
    release();
    const result = await capture;
    expect(result.status).toBe('succeeded');
    expect(result.provider).toBe(provider);
    expect(result.amountMinor).toBe(12345);
    expect(Object.isFrozen(result)).toBe(true);
    const request = s.transport.mock.calls[0][1]!;
    expect(String(request.body)).toContain('synthetic-token');
    expect(String(request.body)).not.toContain('different-token');
    expect(String(request.body)).not.toContain('9999.99');
    expect(String(request.body)).not.toContain('changed-secret');
    expect(JSON.stringify(request.headers)).not.toContain('changed-secret');
    expect(s.store.finish.mock.calls[0][1]).toEqual(original);
  },
);
it('uses a canonical digest independent of caller property order', async () => {
  const s = setup();
  const gateway = new SandboxGateway(
    s.merchant,
    s.credentials,
    s.store,
    s.transport,
  );
  await gateway.capture(s.intent, s.token);
  const reversed = Object.fromEntries(
    Object.entries(s.intent).reverse(),
  ) as unknown as SandboxIntent;
  await gateway.capture(reversed, s.token);
  expect(s.store.reserve.mock.calls[0][2]).toBe(
    s.store.reserve.mock.calls[1][2],
  );
  await gateway.capture({ ...s.intent, amountMinor: 12346 }, s.token);
  expect(s.store.reserve.mock.calls[0][2]).not.toBe(
    s.store.reserve.mock.calls[2][2],
  );
});
it.each(['intent', 'merchant'] as const)(
  'does not extend %s expiry while waiting for a reservation',
  async (scope) => {
    const s = setup();
    const now = Date.now();
    s.store.reserve.mockImplementation(async () => {
      vi.spyOn(Date, 'now').mockReturnValue(
        now + (scope === 'intent' ? 1800001 : 3600001),
      );
      return { status: 'reserved' };
    });
    try {
      const result = await new SandboxGateway(
        s.merchant,
        s.credentials,
        s.store,
        s.transport,
      ).capture(s.intent, s.token);
      expect(result.status).toBe('unknown');
      expect(s.transport).not.toHaveBeenCalled();
      expect(s.store.finish).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        result,
      );
    } finally {
      vi.restoreAllMocks();
    }
  },
);
it('fails closed on an unrecognized reservation status', async () => {
  const s = setup();
  s.store.reserve.mockResolvedValue({ status: 'unexpected' } as never);
  await expect(
    new SandboxGateway(s.merchant, s.credentials, s.store, s.transport).capture(
      s.intent,
      s.token,
    ),
  ).rejects.toThrow(/Invalid payment reservation/);
  expect(s.transport).not.toHaveBeenCalled();
});
it.each([
  { status: 'succeeded', transactionId: 'invalid\nidentifier' },
  { status: 'succeeded', transactionId: 'x'.repeat(101) },
  { status: 'succeeded', transactionId: 123 },
  { status: 'declined', transactionId: 'unexpected' },
  { status: 'unknown', transactionId: 'unexpected' },
])(
  'rejects malformed stored metadata %j without provider execution',
  async (fields) => {
    const s = setup();
    s.store.reserve.mockResolvedValue({
      status: 'existing',
      result: {
        provider: 'authorize_net',
        mode: 'sandbox',
        amountMinor: s.intent.amountMinor,
        currency: 'USD',
        ...fields,
      },
    } as never);
    await expect(
      new SandboxGateway(
        s.merchant,
        s.credentials,
        s.store,
        s.transport,
      ).capture(s.intent, s.token),
    ).rejects.toThrow(/Invalid stored result/);
    expect(s.transport).not.toHaveBeenCalled();
  },
);
