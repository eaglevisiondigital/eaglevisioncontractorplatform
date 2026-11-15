import { afterEach, expect, it, vi } from 'vitest';
import type { GatewaySql } from '../server/payments/postgres-store';
import {
  readOriginalInvoicePayment,
  type OriginalInvoicePayment,
} from '../proposals/invoice-payment-receipt/reader';
import { fictionalLaunchMerchants } from './fixtures/first-launch-merchants';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture(index = 0) {
  const merchant = fictionalLaunchMerchants(
    new Date(Date.now() + 60000).toISOString(),
  )[index].merchant;
  const id: OriginalInvoicePayment = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    invoiceId: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    sourceVersionId: crypto.randomUUID(),
    sourceHash: 'a'.repeat(64),
    revision: 1,
    issueCommandId: crypto.randomUUID(),
    attemptKey: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    requestDigest: 'b'.repeat(64),
    kind: 'capture',
    captureKey: null,
  };
  const value = {
    outcome: 'LINKED',
    ...id,
    status: 'succeeded',
    amountMinor: 4000,
    currency: 'USD',
    attemptedAt: new Date().toISOString(),
  };
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    expect(sql).toMatch(
      /^select private\.commercial_invoice_payment_receipt\(/,
    );
    expect(params).toHaveLength(14);
    return { rows: [{ receipt: value }] };
  });
  const connection = { query } as unknown as GatewaySql;
  const read = (original = id, signal: AbortSignal | null = null) =>
    readOriginalInvoicePayment(connection, merchant, original, {
      testOnly: true,
      signal,
    });
  return { merchant, id, value, query, connection, read };
}
it.each([0, 1])(
  'contractor%i exact original links without customer delivery/balance/settlement/hold authority',
  async (index) => {
    const s = fixture(index),
      r = await s.read();
    expect(r).toMatchObject({
      outcome: 'LINKED',
      paymentReceipt: 'RECORDED_GATEWAY_OUTCOME',
      receipt: { ...s.id, amountMinor: 4000 },
      financialEffect: false,
      holdRelease: false,
      balance: 'NOT_ESTABLISHED',
      settlement: 'UNVERIFIED',
      customerDelivery: 'BLOCKED',
      dispute: 'UNVERIFIED',
      cancellation: 'UNVERIFIED',
    });
    expect(s.query).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(r)).toBe(true);
    if (r.outcome === 'LINKED') expect(Object.isFrozen(r.receipt)).toBe(true);
  },
);
it.each([
  'organizationId',
  'merchantConfigId',
  'invoiceId',
  'customerId',
  'sourceVersionId',
  'issueCommandId',
  'attemptKey',
  'authorizationId',
  'sourceHash',
  'requestDigest',
  'revision',
  'provider',
  'mode',
  'kind',
  'captureKey',
] as const)('rejects mismatched returned %s', async (key) => {
  const s = fixture();
  Object.assign(s.value, {
    [key]:
      key === 'revision'
        ? 2
        : key.endsWith('Hash') || key.endsWith('Digest')
          ? 'c'.repeat(64)
          : key === 'provider'
            ? 'authorize_net'
            : key === 'mode'
              ? 'production'
              : key === 'kind'
                ? 'refund'
                : crypto.randomUUID(),
  });
  expect((await s.read()).outcome).toBe('UNKNOWN');
});
it.each(['pending', 'unknown', 'declined'] as const)(
  '%s cannot masquerade as successful payment',
  async (status) => {
    const s = fixture();
    s.value.status = status;
    expect(await s.read()).toMatchObject({
      outcome: 'LINKED',
      paymentReceipt:
        status === 'declined' ? 'DECLINED_GATEWAY_OUTCOME' : 'UNRESOLVED',
      holdRelease: false,
    });
  },
);
it.each(['cancelled', 'disputed', 'settled', 'voided'])(
  'unsupported state %s is UNKNOWN, not invented financial acceptance',
  async (status) => {
    const s = fixture();
    s.value.status = status;
    expect((await s.read()).outcome).toBe('UNKNOWN');
  },
);
it.each(['amountMinor', 'currency', 'attemptedAt', 'privateNote'] as const)(
  'malformed or expanded %s is not disclosed',
  async (key) => {
    const s = fixture();
    Object.assign(s.value, {
      [key]:
        key === 'amountMinor'
          ? 1.5
          : key === 'attemptedAt'
            ? '2099-01-01T00:00:00Z'
            : key === 'currency'
              ? 'CAD'
              : 'PRIVATE',
    });
    expect((await s.read()).outcome).toBe('UNKNOWN');
  },
);
it('refund requires its exact original capture identity', async () => {
  const s = fixture();
  const id = {
    ...s.id,
    kind: 'refund' as const,
    captureKey: crypto.randomUUID(),
  };
  Object.assign(s.value, id);
  expect((await s.read(id)).outcome).toBe('LINKED');
  expect((await s.read({ ...id, captureKey: null })).outcome).toBe('UNKNOWN');
});
it('scope mismatch and test gate disabled do not reach SQL', async () => {
  const s = fixture();
  expect(
    (await s.read({ ...s.id, merchantConfigId: crypto.randomUUID() })).outcome,
  ).toBe('UNKNOWN');
  expect(
    (
      await readOriginalInvoicePayment(s.connection, s.merchant, s.id, {
        testOnly: false as unknown as true,
        signal: null,
      })
    ).outcome,
  ).toBe('UNKNOWN');
  expect(s.query).not.toHaveBeenCalled();
});
it('UUID case variations keep original receipt identity', async () => {
  const s = fixture();
  expect(
    (await s.read({ ...s.id, attemptKey: s.id.attemptKey.toUpperCase() }))
      .outcome,
  ).toBe('LINKED');
  expect(s.query.mock.calls[0][1]?.[9]).toBe(s.id.attemptKey);
});
it('getter/proxy identity is rejected without evaluating private getters or SQL', async () => {
  const s = fixture();
  const spy = vi.fn(() => s.id.customerId);
  const bad = { ...s.id };
  Object.defineProperty(bad, 'customerId', { get: spy });
  expect((await s.read(bad)).outcome).toBe('UNKNOWN');
  expect((await s.read(new Proxy(s.id, {}))).outcome).toBe('UNKNOWN');
  expect(spy).not.toHaveBeenCalled();
  expect(s.query).not.toHaveBeenCalled();
});
it('cancellation before read never runs SQL', async () => {
  const s = fixture(),
    c = new AbortController();
  c.abort();
  expect((await s.read(s.id, c.signal)).outcome).toBe('UNKNOWN');
  expect(s.query).not.toHaveBeenCalled();
});
it('late ACK after cancellation cannot produce an accepted receipt', async () => {
  const s = fixture(),
    c = new AbortController();
  let done!: (v: Awaited<ReturnType<typeof s.query>>) => void;
  s.query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }) as ReturnType<typeof s.query>,
  );
  const result = s.read(s.id, c.signal);
  c.abort();
  expect((await result).outcome).toBe('UNKNOWN');
  done({ rows: [{ receipt: s.value }] });
});
it('five second deadline suppresses unavailable SQL without mutation or replay', async () => {
  vi.useFakeTimers();
  const s = fixture();
  s.query.mockImplementationOnce(() => new Promise(() => {}));
  const r = s.read();
  await vi.advanceTimersByTimeAsync(5000);
  expect((await r).outcome).toBe('UNKNOWN');
  expect(s.query).toHaveBeenCalledTimes(1);
});
it('missing/malformed envelopes and unavailable evidence remain UNKNOWN', async () => {
  const s = fixture();
  for (const x of [
    { rows: [] },
    { rows: [{ receipt: { outcome: 'UNKNOWN' } }] },
    { rows: [{ receipt: s.value }], private: 'secret' },
  ]) {
    s.query.mockResolvedValueOnce(x as never);
    expect((await s.read()).outcome).toBe('UNKNOWN');
  }
  s.query.mockRejectedValueOnce(Error('SECRET'));
  expect((await s.read()).outcome).toBe('UNKNOWN');
});

it.each(['provider', 'kind', 'status'] as const)(
  'nested response %s objects/Proxies reject without coercion or private output',
  async (key) => {
    for (const proxy of [false, true]) {
      const s = fixture();
      const hook = vi.fn(() =>
        key === 'provider' ? 'nmi' : key === 'kind' ? 'capture' : 'succeeded',
      );
      const v = { toString: hook, private: 'PRIVATE RESPONSE' };
      Object.assign(s.value, {
        [key]: proxy ? new Proxy(v, { get: hook }) : v,
      });
      const r = await s.read();
      expect(r.outcome).toBe('UNKNOWN');
      expect(hook).not.toHaveBeenCalled();
      expect(JSON.stringify(r)).not.toContain('PRIVATE');
    }
  },
);
it.each(['provider', 'kind'] as const)(
  'nested caller %s rejects without coercion or SQL',
  async (key) => {
    const s = fixture(),
      hook = vi.fn(() => (key === 'provider' ? 'nmi' : 'capture'));
    const r = await s.read({
      ...s.id,
      [key]: { toString: hook },
    } as unknown as OriginalInvoicePayment);
    expect(r.outcome).toBe('UNKNOWN');
    expect(hook).not.toHaveBeenCalled();
    expect(s.query).not.toHaveBeenCalled();
  },
);
