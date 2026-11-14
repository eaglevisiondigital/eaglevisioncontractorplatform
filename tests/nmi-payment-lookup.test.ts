import { afterEach, expect, it, vi } from 'vitest';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';
import {
  NmiSandboxPaymentReader,
  type NmiLookupCredential,
} from '../server/payments/nmi-payment-lookup';
import type { StatementRow } from '../server/payments/reconciliation';
import { sha256 } from '../server/providers/safety';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function fixture(index = 0) {
  const merchant = fictionalLaunchMerchants(
    new Date(Date.now() + 60000).toISOString(),
  )[index].merchant;
  const credential: NmiLookupCredential = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    apiKey: 'fictional-only-key-' + index,
    processorId: 'fictional_processor_' + index,
  };
  const expected: StatementRow = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    transactionId: 'fictional_transaction_' + index,
    kind: 'capture',
    amountMinor: 1234,
    currency: 'USD',
  };
  const body = {
    object: 'transaction',
    id: expected.transactionId,
    amount: '12.34',
    currency: 'USD',
    processor_id: credential.processorId,
    status: 'settled',
    response: '1',
    order_details: { order_id: crypto.randomUUID() },
    actions: [
      {
        id: 'fictional_action',
        type: 'sale',
        amount: '12.34',
        success: true,
        response: '1',
      },
    ],
    payment_details: {
      card_number: 'MASKED_PRIVATE_CARD',
      card_exp: 'PRIVATE_EXPIRY',
    },
    billing_address: { email: 'private@example.invalid' },
    signature_image: 'PRIVATE_SIGNATURE',
  };
  const transport = vi.fn<typeof fetch>(async () => Response.json(body));
  return {
    merchant,
    credential,
    expected,
    body,
    transport,
    reader: () => new NmiSandboxPaymentReader(merchant, credential, transport),
  };
}
it.each([0, 1])(
  'reads exact fictional merchant%i GET facts without returning private payment data or financial authority',
  async (index) => {
    const s = fixture(index),
      result = await s.reader().read(s.expected);
    expect(s.transport).toHaveBeenCalledOnce();
    const [url, options] = s.transport.mock.calls[0];
    expect(url).toBe(
      'https://sandbox.nmi.com/api/v5/payments/' + s.expected.transactionId,
    );
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: s.credential.apiKey },
    });
    expect(options?.body).toBeUndefined();
    expect(result).toMatchObject({
      expectation: s.expected,
      reportedStatus: 'settled',
      reportedResponse: '1',
      settlement: 'UNVERIFIED',
      financialEffect: false,
      merchantIdentity: 'CONFIGURATION_BOUND_NOT_PROVIDER_ATTESTED',
    });
    expect(result.actions).toEqual(s.body.actions);
    for (const secret of [
      'MASKED_PRIVATE_CARD',
      'PRIVATE_EXPIRY',
      'PRIVATE_SIGNATURE',
      'private@example.invalid',
      s.credential.apiKey,
    ])
      expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.bodyDigest).toBe(sha256(JSON.stringify(s.body)));
    expect(
      Object.isFrozen(result) &&
        Object.isFrozen(result.expectation) &&
        Object.isFrozen(result.actions) &&
        Object.isFrozen(result.actions[0]),
    ).toBe(true);
  },
);
it.each([
  'pendingsettlement',
  'settled',
  'voided',
  'declined',
  'disputed',
  'future_status',
])(
  'preserves literal status%s without promoting a settlement/refund/receipt conclusion',
  async (status) => {
    const s = fixture();
    s.body.status = status;
    expect(await s.reader().read(s.expected)).toMatchObject({
      reportedStatus: status,
      settlement: 'UNVERIFIED',
      financialEffect: false,
    });
  },
);
it('requires an explicit transport and never falls back to global fetch', () => {
  const s = fixture(),
    network = vi.spyOn(globalThis, 'fetch');
  expect(
    () =>
      new NmiSandboxPaymentReader(
        s.merchant,
        s.credential,
        undefined as unknown as typeof fetch,
      ),
  ).toThrow();
  expect(network).not.toHaveBeenCalled();
});
it.each(['organizationId', 'merchantConfigId'] as const)(
  'denies foreign%s credential binding before GET',
  (field) => {
    const a = fixture(0),
      b = fixture(1);
    a.credential[field] = b.credential[field];
    expect(() => a.reader()).toThrow();
    expect(a.transport).not.toHaveBeenCalled();
  },
);
it.each([
  'organizationId',
  'merchantConfigId',
  'provider',
  'mode',
  'currency',
  'transactionId',
  'amountMinor',
] as const)('denies invalid request%s before GET', async (field) => {
  const s = fixture();
  Object.assign(s.expected, {
    [field]:
      field === 'amountMinor'
        ? 1.1
        : field === 'transactionId'
          ? '../foreign?secret'
          : 'foreign',
  });
  await expect(s.reader().read(s.expected)).rejects.toThrow();
  expect(s.transport).not.toHaveBeenCalled();
});
it.each(['id', 'amount', 'currency', 'processor_id', 'object'] as const)(
  'denies mismatched response%s',
  async (field) => {
    const s = fixture();
    s.body[field] = field === 'amount' ? '12.35' : 'foreign';
    await expect(s.reader().read(s.expected)).rejects.toThrow(
      'no financial conclusion',
    );
    expect(s.transport).toHaveBeenCalledOnce();
  },
);
it.each([401, 404, 503])(
  'HTTP%s remains unavailable, with no not-found/decline inference or automatic retry',
  async (status) => {
    const s = fixture();
    s.transport.mockImplementation(
      async () => new Response('secret provider detail', { status }),
    );
    await expect(s.reader().read(s.expected)).rejects.toThrow(
      'NMI payment lookup unavailable; no financial conclusion',
    );
    expect(s.transport).toHaveBeenCalledOnce();
  },
);
it.each([
  'duplicate-member',
  'invalid-utf8',
  'oversized',
  'duplicate-action',
  'wrong-action-shape',
])('rejects%s wire data instead of manufacturing evidence', async (mode) => {
  const s = fixture();
  if (mode === 'duplicate-member')
    s.transport.mockImplementation(
      async () => new Response('{"id":"a","id":"b"}'),
    );
  if (mode === 'invalid-utf8')
    s.transport.mockImplementation(
      async () => new Response(new Uint8Array([0xc3, 0x28])),
    );
  if (mode === 'oversized')
    s.transport.mockImplementation(async () => new Response('x'.repeat(65537)));
  if (mode === 'duplicate-action')
    s.body.actions.push({ ...s.body.actions[0] });
  if (mode === 'wrong-action-shape')
    Object.assign(s.body.actions[0], { success: 'true' });
  await expect(s.reader().read(s.expected)).rejects.toThrow();
  expect(s.transport).toHaveBeenCalledOnce();
});
it('captures credential, merchant and request primitives before awaits', async () => {
  const s = fixture(),
    reader = s.reader(),
    priorId = s.expected.transactionId;
  s.transport.mockImplementation(async (_url, options) => {
    expect(options?.headers).toMatchObject({
      Authorization: 'fictional-only-key-0',
    });
    s.credential.apiKey = 'changed';
    s.merchant.merchantConfigId = crypto.randomUUID();
    s.expected.transactionId = 'changed';
    return Response.json(s.body);
  });
  const result = await reader.read(s.expected);
  expect(result.expectation.transactionId).toBe(priorId);
  expect(result.expectation.merchantConfigId).not.toBe(
    s.merchant.merchantConfigId,
  );
});
it('rechecks approval after the transport await', async () => {
  const s = fixture(),
    now = Date.now();
  s.merchant.approvedUntil = new Date(now + 1000).toISOString();
  const reader = s.reader();
  s.transport.mockImplementation(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
    return Response.json(s.body);
  });
  await expect(reader.read(s.expected)).rejects.toThrow();
  expect(s.transport).toHaveBeenCalledOnce();
});
it('rechecks approval after a delayed body read', async () => {
  const s = fixture(),
    now = Date.now();
  s.merchant.approvedUntil = new Date(now + 1000).toISOString();
  const reader = s.reader();
  s.transport.mockImplementation(
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(s.body)),
            );
            controller.close();
          },
        }),
      ),
  );
  await expect(reader.read(s.expected)).rejects.toThrow();
  expect(s.transport).toHaveBeenCalledOnce();
});

function fakeDeadline() {
  vi.useFakeTimers();
  const controller = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  return controller;
}
it('rejects a late ignored-abort transport and cancels its eventual body without retry', async () => {
  fakeDeadline();
  const s = fixture();
  let finish!: (value: Response) => void;
  s.transport.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = expect(s.reader().read(s.expected)).rejects.toThrow(
    'no financial conclusion',
  );
  await vi.advanceTimersByTimeAsync(30000);
  await pending;
  const cancel = vi.fn();
  finish(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledOnce();
  expect(s.transport).toHaveBeenCalledOnce();
});
it('aborts and cancels a stalled body at the actual deadline without retry', async () => {
  fakeDeadline();
  const s = fixture(),
    cancel = vi.fn();
  s.transport.mockImplementation(
    async () => new Response(new ReadableStream({ cancel })),
  );
  const pending = expect(s.reader().read(s.expected)).rejects.toThrow(
    'no financial conclusion',
  );
  await vi.advanceTimersByTimeAsync(30000);
  await pending;
  expect(cancel).toHaveBeenCalledOnce();
  expect(s.transport).toHaveBeenCalledOnce();
});
it('rejects a late body even if the clock advances before the timeout callback', async () => {
  const s = fixture(),
    now = Date.now();
  s.transport.mockImplementation(
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            vi.spyOn(Date, 'now').mockReturnValue(now + 30001);
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(s.body)),
            );
            controller.close();
          },
        }),
      ),
  );
  await expect(s.reader().read(s.expected)).rejects.toThrow(
    'no financial conclusion',
  );
  expect(s.transport).toHaveBeenCalledOnce();
});
it.each(['before', 'during'] as const)(
  'honors explicit cancellation %s transport completion',
  async (when) => {
    const s = fixture(),
      cancellation = new AbortController();
    if (when === 'before') cancellation.abort();
    else s.transport.mockImplementation(() => new Promise(() => {}));
    const pending = expect(
      s.reader().read(s.expected, cancellation.signal),
    ).rejects.toThrow('no financial conclusion');
    cancellation.abort();
    await pending;
    expect(s.transport).toHaveBeenCalledTimes(when === 'before' ? 0 : 1);
  },
);
it('denies a redirected response even when an injected transport ignores redirect:error', async () => {
  const s = fixture(),
    response = Response.json(s.body);
  Object.defineProperty(response, 'redirected', { value: true });
  s.transport.mockResolvedValue(response);
  await expect(s.reader().read(s.expected)).rejects.toThrow(
    'no financial conclusion',
  );
  expect(s.transport).toHaveBeenCalledOnce();
});
it('redacts a thrown transport error including keys, bindings and URLs', async () => {
  const s = fixture();
  s.transport.mockRejectedValue(
    Error(
      s.credential.apiKey +
        s.merchant.organizationId +
        ' https://example.invalid/private',
    ),
  );
  await expect(s.reader().read(s.expected)).rejects.toThrow(
    /^NMI payment lookup unavailable; no financial conclusion$/,
  );
  expect(s.transport).toHaveBeenCalledOnce();
});

it.each(['deadline', 'approval'] as const)(
  'cancels unread headers when %s expires before the timeout signal fires',
  async (which) => {
    const s = fixture(),
      now = Date.now(),
      cancel = vi.fn();
    if (which === 'approval')
      s.merchant.approvedUntil = new Date(now + 1000).toISOString();
    const reader = s.reader();
    s.transport.mockImplementation(async () => {
      vi.spyOn(Date, 'now').mockReturnValue(
        now + (which === 'deadline' ? 30001 : 2000),
      );
      return new Response(new ReadableStream({ cancel }));
    });
    await expect(reader.read(s.expected)).rejects.toThrow(
      'no financial conclusion',
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(s.transport).toHaveBeenCalledOnce();
  },
);
