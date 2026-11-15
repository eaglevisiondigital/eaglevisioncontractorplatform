import { afterEach, expect, it, vi } from 'vitest';
import type { GatewaySql } from '../server/payments/postgres-store';
import { customerPaymentPublicationReader } from '../proposals/customer-payment-publication/reader';
import { customerPaymentReceipt } from '../proposals/customer-payment-publication/contract';
import { customerPaymentPublicationFixture } from './fixtures/customer-payment-publication';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture() {
  const f = customerPaymentPublicationFixture();
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    expect(sql).toMatch(/^select private\.customer_payment_receipt\(/);
    expect(params).toEqual(Object.values(f.target));
    return {
      rows: [
        {
          receipt: {
            ...f.value,
            observedAt: Date.now(),
            expiresAt: Date.now() + 30000,
          },
        },
      ],
    };
  });
  const options = { enabled: true, mode: 'disposable-proposal' as const };
  const read = customerPaymentPublicationReader(
    { query } as unknown as GatewaySql,
    options,
  );
  return { ...f, query, options, read };
}
it('defaultOFF never reads; no caller flag grants backend publication access', async () => {
  const s = fixture();
  await expect(
    customerPaymentPublicationReader({
      query: s.query,
    } as unknown as GatewaySql)(s.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(s.query).not.toHaveBeenCalled();
});
it.each(['capture', 'refund'] as const)(
  'strictly presents original %s with no balance, settlement or delivery authority',
  async (kind) => {
    const f = fixture();
    f.query.mockImplementationOnce(async () => ({
      rows: [
        {
          receipt: {
            ...f.value,
            kind,
            observedAt: Date.now(),
            expiresAt: Date.now() + 30000,
          },
        },
      ],
    }));
    expect(await f.read(f.target, new AbortController().signal)).toMatchObject({
      kind,
      amountMinor: 4000,
      balance: 'NOT_ESTABLISHED',
      settlement: 'UNVERIFIED',
      delivery: 'DISABLED',
      financialEffect: false,
      holdRelease: false,
    });
  },
);
it.each([
  'organizationId',
  'customerId',
  'locationId',
  'invoiceId',
  'publicationId',
] as const)(
  'wrong returned %s cannot disclose another receipt',
  async (field) => {
    const f = fixture();
    f.query.mockResolvedValueOnce({
      rows: [{ receipt: { ...f.value, [field]: crypto.randomUUID() } }],
    });
    await expect(
      f.read(f.target, new AbortController().signal),
    ).rejects.toThrow();
  },
);
it.each([
  'sourceHash',
  'sessionId',
  'merchantConfigId',
  'providerTransactionId',
  'requestDigest',
  'privateNote',
] as const)('expanded private %s is rejected', async (key) => {
  const f = fixture();
  f.query.mockResolvedValueOnce({
    rows: [{ receipt: { ...f.value, [key]: 'PRIVATE' } }],
  });
  await expect(
    f.read(f.target, new AbortController().signal),
  ).rejects.toThrow();
});
it.each([
  'pending',
  'unknown',
  'declined',
  'cancelled',
  'disputed',
  'settled',
  'paid',
])(
  'unsupported/uncertain %s is withheld, never relabeled as a receipt',
  async (kind) => {
    const f = fixture();
    f.query.mockResolvedValueOnce({
      rows: [{ receipt: { ...f.value, kind } }],
    } as never);
    await expect(
      f.read(f.target, new AbortController().signal),
    ).rejects.toThrow();
  },
);
it.each([
  'balance',
  'settlement',
  'delivery',
  'financialEffect',
  'holdRelease',
] as const)('supplied %s authority is denied', async (key) => {
  const f = fixture();
  f.query.mockResolvedValueOnce({
    rows: [{ receipt: { ...f.value, [key]: true } }],
  } as never);
  await expect(
    f.read(f.target, new AbortController().signal),
  ).rejects.toThrow();
});
it('expired or cached response cannot establish current access', async () => {
  const f = fixture();
  f.query.mockResolvedValueOnce({
    rows: [{ receipt: { ...f.value, expiresAt: Date.now() - 1 } }],
  });
  await expect(
    f.read(f.target, new AbortController().signal),
  ).rejects.toThrow();
  f.query.mockResolvedValueOnce({
    rows: [{ receipt: { ...f.value, observedAt: Date.now() - 1000 } }],
  });
  await expect(
    f.read(f.target, new AbortController().signal),
  ).rejects.toThrow();
});
it('malformed amounts never gain numerical precision', () => {
  const f = fixture();
  for (const amountMinor of [0, 0.5, NaN, Infinity, 9_000_000_000_001])
    expect(() =>
      customerPaymentReceipt({ ...f.value, amountMinor }, f.target),
    ).toThrow();
});
it('nested enum coercion/getters/proxies are rejected without hook execution', async () => {
  const f = fixture(),
    hook = vi.fn(() => 'capture');
  for (const kind of [{ toString: hook }, new Proxy({}, { get: hook })])
    expect(() =>
      customerPaymentReceipt({ ...f.value, kind }, f.target),
    ).toThrow();
  const bad = { ...f.value };
  Object.defineProperty(bad, 'amountMinor', { get: hook });
  expect(() => customerPaymentReceipt(bad, f.target)).toThrow();
  f.query.mockResolvedValueOnce({
    rows: [
      {
        receipt: new Proxy(f.value, {
          getOwnPropertyDescriptor: () => {
            hook();
            return undefined;
          },
        }),
      },
    ],
  } as never);
  await expect(
    f.read(f.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(hook).not.toHaveBeenCalled();
});
it('unavailable or malformed evidence has no fallback/retry/writer', async () => {
  const f = fixture();
  for (const result of [
    { rows: [] },
    { rows: [{ receipt: null }] },
    { rows: [{ receipt: f.value }], extra: 'PRIVATE' },
  ]) {
    f.query.mockResolvedValueOnce(result as never);
    await expect(
      f.read(f.target, new AbortController().signal),
    ).rejects.toThrow();
  }
  f.query.mockRejectedValueOnce(Error('PRIVATE BACKEND ERROR'));
  await expect(f.read(f.target, new AbortController().signal)).rejects.toThrow(
    'Current payment receipt unavailable',
  );
  expect(f.query).toHaveBeenCalledTimes(4);
});
it('caller context drift or disabling mode during read suppresses a late result', async () => {
  const f = fixture();
  let done!: (x: Awaited<ReturnType<typeof f.query>>) => void;
  f.query.mockImplementationOnce(
    () =>
      new Promise((r) => {
        done = r;
      }),
  );
  const result = f.read(f.target, new AbortController().signal);
  f.options.enabled = false;
  done({ rows: [{ receipt: f.value }] });
  await expect(result).rejects.toThrow();
});
it('cancelled or timed-out read never publishes a late original result', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.query.mockImplementationOnce(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = f.read(f.target, controller.signal);
  const checked = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(5000);
  await checked;
  const stopped = new AbortController();
  stopped.abort();
  await expect(f.read(f.target, stopped.signal)).rejects.toThrow();
  expect(f.query).toHaveBeenCalledTimes(1);
});

it('synchronous and asynchronous driver details are both redacted, with no automatic retry', async () => {
  const f = fixture();
  f.query.mockImplementationOnce(() => {
    throw Error('PRIVATE_SYNCHRONOUS_DRIVER_DETAIL');
  });
  await expect(f.read(f.target, new AbortController().signal)).rejects.toThrow(
    /^Current payment receipt unavailable$/,
  );
  f.query.mockRejectedValueOnce(Error('PRIVATE_ASYNC_DRIVER_DETAIL'));
  await expect(f.read(f.target, new AbortController().signal)).rejects.toThrow(
    /^Current payment receipt unavailable$/,
  );
  expect(f.query).toHaveBeenCalledTimes(2);
});
it('live or missing source mode is rejected instead of relabeling sandbox evidence', () => {
  const f = fixture();
  expect(() =>
    customerPaymentReceipt({ ...f.value, mode: 'live' }, f.target),
  ).toThrow();
  const bad = { ...f.value } as Partial<typeof f.value>;
  delete bad.mode;
  expect(() => customerPaymentReceipt(bad, f.target)).toThrow();
});
