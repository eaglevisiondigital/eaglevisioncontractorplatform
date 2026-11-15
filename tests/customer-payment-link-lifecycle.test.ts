import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { commercialCustomerBridgeFixture } from './fixtures/commercial-customer-bridge';
import { customerCaptureLinkLifecycle } from '../proposals/customer-payment-link-lifecycle/read';
import { CUSTOMER_CAPTURE_LIFECYCLE_QUERY } from '../proposals/customer-payment-link-lifecycle/query';
import type { GatewaySql } from '../server/payments/postgres-store';
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());
function fixture() {
  const f = commercialCustomerBridgeFixture(),
    h = f.value.invoice,
    amount = Math.min(500, h.amountMinor),
    digest = 'd'.repeat(64);
  const merchant = {
    organizationId: h.organizationId,
    merchantConfigId: randomUUID(),
    provider: 'nmi' as const,
    mode: 'sandbox' as const,
    approvalReference: 'FICTIONAL ONLY',
    approvedUntil: new Date(Date.now() + 3600000).toISOString(),
  };
  const intent = {
    organizationId: h.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    invoiceId: h.invoiceId,
    authorizationId: randomUUID(),
    idempotencyKey: randomUUID(),
    amountMinor: amount,
    currency: 'USD' as const,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
  const row: Record<string, unknown> = {
    organizationId: h.organizationId,
    invoiceId: h.invoiceId,
    customerId: h.customerId,
    sourceVersionId: h.sourceVersionId,
    sourceHash: h.sourceHash,
    revision: h.revision,
    issuanceReceiptId: h.receipt.commandId,
    invoiceAmountMinor: String(h.amountMinor),
    authorizationId: intent.authorizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi',
    authorityKind: 'capture',
    amountMinor: String(amount),
    currency: 'USD',
    requestDigest: digest,
    authorityRevoked: false,
    authorityExpired: false,
    merchantApproved: true,
    uncertainInvoice: false,
    attempt: null,
  };
  let calls = 0,
    hook = async () => {};
  const connection = {
    async query(sql: string, args?: unknown[]) {
      calls++;
      expect(sql).toBe(CUSTOMER_CAPTURE_LIFECYCLE_QUERY);
      expect(args).toEqual([
        intent.organizationId,
        intent.invoiceId,
        intent.authorizationId,
        intent.merchantConfigId,
        h.customerId,
        h.sourceVersionId,
        h.revision,
        h.receipt.commandId,
        digest,
        amount,
      ]);
      await hook();
      return { rows: [{ result: structuredClone(row) }] };
    },
  } as GatewaySql;
  const input = { merchant, intent, requestDigest: digest };
  const load = () =>
    customerCaptureLinkLifecycle(f.auth, f.bearer, f.port, connection, input, {
      enabled: true,
      mode: 'disposable-proposal',
    })(f.viewer, signal());
  function attempt(status: string) {
    row.attempt = {
      key: intent.idempotencyKey,
      authorizationId: intent.authorizationId,
      merchantConfigId: merchant.merchantConfigId,
      invoiceId: h.invoiceId,
      kind: 'capture',
      amountMinor: String(amount),
      requestDigest: digest,
      status,
      result:
        status === 'pending'
          ? null
          : {
              status,
              provider: 'nmi',
              mode: 'sandbox',
              transactionId:
                status === 'succeeded' ? 'FICTIONAL_TRANSACTION' : null,
              amountMinor: amount,
              currency: 'USD',
            },
    };
    row.uncertainInvoice = ['pending', 'unknown'].includes(status);
  }
  return {
    f,
    h,
    merchant,
    intent,
    row,
    input,
    connection,
    load,
    attempt,
    calls: () => calls,
    hook: (fn: () => Promise<void>) => {
      hook = fn;
    },
  };
}
it('defaults OFF before touching Auth, SQL, input or target; no link can be issued', async () => {
  const f = fixture();
  let touched = false;
  const trap = new Proxy(
    {},
    {
      get() {
        touched = true;
        throw Error('PRIVATE');
      },
    },
  );
  const fn = customerCaptureLinkLifecycle(
    trap as never,
    '',
    trap as never,
    trap as never,
    trap as never,
  );
  await expect(fn(trap as never, signal())).rejects.toThrow('UNKNOWN');
  expect(touched).toBe(false);
  expect(f.calls()).toBe(0);
});
it('observes an exact partial existing capture intent but always keeps link/execution/balance/settlement disabled', async () => {
  const f = fixture(),
    r = await f.load();
  expect(r.reason).toBe('NO_ATTEMPT');
  expect(r.link).toEqual({ status: 'DISABLED', href: null, token: null });
  expect(r.executionAuthorized).toBe(false);
  expect(r.payment).toBe('UNKNOWN');
  expect(r.balanceMinor).toBeNull();
  expect(r.settlement).toBe('UNVERIFIED');
  expect(r.replay).toBe('PROHIBITED');
  expect(f.calls()).toBe(2);
  const text = JSON.stringify(r);
  for (const v of [
    f.input.requestDigest,
    f.h.sourceHash,
    f.intent.authorizationId,
    f.intent.idempotencyKey,
    f.merchant.merchantConfigId,
    f.f.bearer,
    'FICTIONAL_TRANSACTION',
  ])
    expect(text).not.toContain(v);
});
it.each([
  ['pending', 'ORIGINAL_PENDING'],
  ['unknown', 'ORIGINAL_UNKNOWN'],
  ['succeeded', 'ORIGINAL_RECORDED'],
  ['declined', 'ORIGINAL_DECLINED'],
])(
  'original %s holds remain read-only and never permit replay or replacement',
  async (status, reason) => {
    const f = fixture();
    f.attempt(status);
    const a = await f.load(),
      b = await f.load();
    expect(a.reason).toBe(reason);
    expect(b.reason).toBe(reason);
    expect(a.executionAuthorized).toBe(false);
    expect(a.link.href).toBeNull();
    expect(f.calls()).toBe(4);
  },
);
it.each([
  ['authorityRevoked', 'AUTHORITY_REVOKED'],
  ['authorityExpired', 'AUTHORITY_EXPIRED'],
  ['uncertainInvoice', 'ORIGINAL_UNKNOWN'],
])(
  'existing %s is held even without an attempt under this key',
  async (field, reason) => {
    const f = fixture();
    f.row[field] = true;
    expect((await f.load()).reason).toBe(reason);
  },
);
it.each([
  'organizationId',
  'invoiceId',
  'customerId',
  'sourceVersionId',
  'issuanceReceiptId',
  'authorizationId',
  'merchantConfigId',
])('foreign %s cannot map another original invoice/intent', async (field) => {
  const f = fixture();
  f.row[field] = randomUUID();
  await expect(f.load()).rejects.toThrow('UNKNOWN');
});
it.each([
  ['requestDigest', 'e'.repeat(64)],
  ['provider', 'authorize_net'],
  ['authorityKind', 'refund'],
  ['currency', 'EUR'],
  ['revision', 99],
  ['amountMinor', '501'],
  ['invoiceAmountMinor', '499'],
  ['merchantApproved', false],
])('contradictory private %s is denied', async (field, value) => {
  const f = fixture();
  f.row[field] = value;
  await expect(f.load()).rejects.toThrow('UNKNOWN');
});
it('consumption under another idempotency key cannot become a replacement intent', async () => {
  const f = fixture();
  f.attempt('succeeded');
  (f.row.attempt as Record<string, unknown>).key = randomUUID();
  await expect(f.load()).rejects.toThrow('UNKNOWN');
});
it('malformed success or ambiguous transaction metadata cannot become a recorded lifecycle', async () => {
  const f = fixture();
  f.attempt('succeeded');
  (
    (f.row.attempt as Record<string, unknown>).result as Record<string, unknown>
  ).transactionId = '0';
  await expect(f.load()).rejects.toThrow('UNKNOWN');
});
it('customer revocation after awaited authority lookup suppresses the result', async () => {
  const f = fixture();
  f.hook(async () => {
    f.f.setAuth(false);
  });
  await expect(f.load()).rejects.toThrow('UNKNOWN');
  expect(f.calls()).toBe(1);
});
it('changed customer issued evidence after lookup is denied rather than merged', async () => {
  const f = fixture();
  f.hook(async () => {
    f.f.setValue({
      ...f.f.value,
      invoice: { ...f.h, amountMinor: f.h.amountMinor + 1 },
    });
  });
  await expect(f.load()).rejects.toThrow('UNKNOWN');
  expect(f.calls()).toBe(1);
});
it('authority withdrawal between two reads cannot return the earlier state', async () => {
  const f = fixture();
  f.hook(async () => {
    if (f.calls() === 2) f.row.authorityRevoked = true;
  });
  await expect(f.load()).rejects.toThrow('UNKNOWN');
});
it('cancellation after lookup cannot produce a late receipt or link', async () => {
  const f = fixture(),
    abort = new AbortController();
  f.hook(async () => {
    abort.abort();
  });
  const load = customerCaptureLinkLifecycle(
    f.f.auth,
    f.f.bearer,
    f.f.port,
    f.connection,
    f.input,
    { enabled: true, mode: 'disposable-proposal' },
  );
  await expect(load(f.f.viewer, abort.signal)).rejects.toThrow('UNKNOWN');
});
it.each(['sync', 'async'])('redacts %s private driver errors', async (kind) => {
  const f = fixture(),
    query =
      kind === 'sync'
        ? () => {
            throw Error('PRIVATE_DRIVER_DETAIL');
          }
        : async () => {
            throw Error('PRIVATE_DRIVER_DETAIL');
          };
  const load = customerCaptureLinkLifecycle(
    f.f.auth,
    f.f.bearer,
    f.f.port,
    { query } as GatewaySql,
    f.input,
    { enabled: true, mode: 'disposable-proposal' },
  );
  await expect(load(f.f.viewer, signal())).rejects.toThrow(
    /^Customer payment link unavailable · UNKNOWN; exact original read only$/,
  );
});
it('nested status getters are never executed or returned', async () => {
  const f = fixture();
  f.attempt('succeeded');
  let invoked = false;
  Object.defineProperty(f.row.attempt, 'status', {
    get() {
      invoked = true;
      return 'succeeded';
    },
    enumerable: true,
  });
  const query = async () => ({ rows: [{ result: f.row }] });
  const load = customerCaptureLinkLifecycle(
    f.f.auth,
    f.f.bearer,
    f.f.port,
    { query } as GatewaySql,
    f.input,
    { enabled: true, mode: 'disposable-proposal' },
  );
  await expect(load(f.f.viewer, signal())).rejects.toThrow('UNKNOWN');
  expect(invoked).toBe(false);
});
it('a stalled lookup has a finite deadline and cannot issue anything after completion', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.hook(() => new Promise(() => {}));
  const result = expect(f.load()).rejects.toThrow('UNKNOWN');
  await vi.advanceTimersByTimeAsync(5001);
  await result;
  expect(f.calls()).toBe(1);
});
it('an own __proto__ property cannot disappear from exact response validation', async () => {
  const f = fixture();
  Object.defineProperty(f.row, '__proto__', {
    value: { PRIVATE: 'SECRET' },
    enumerable: true,
  });
  await expect(f.load()).rejects.toThrow('UNKNOWN');
});
it('oversized query arrays are rejected without returning any row', async () => {
  const f = fixture(),
    query = async () => ({
      rows: Array.from({ length: 5 }, () => ({ result: f.row })),
    });
  const load = customerCaptureLinkLifecycle(
    f.f.auth,
    f.f.bearer,
    f.f.port,
    { query } as GatewaySql,
    f.input,
    { enabled: true, mode: 'disposable-proposal' },
  );
  await expect(load(f.f.viewer, signal())).rejects.toThrow('UNKNOWN');
});
it('a proxy array is denied before length or any caller hook is read', async () => {
  const f = fixture();
  let touched = false;
  const rows = new Proxy([], {
    get() {
      touched = true;
      throw Error('PRIVATE_ARRAY_HOOK');
    },
  });
  const query = async () => ({ rows });
  const load = customerCaptureLinkLifecycle(
    f.f.auth,
    f.f.bearer,
    f.f.port,
    { query } as GatewaySql,
    f.input,
    { enabled: true, mode: 'disposable-proposal' },
  );
  await expect(load(f.f.viewer, signal())).rejects.toThrow('UNKNOWN');
  expect(touched).toBe(false);
});
it('a proxy signal is rejected before instanceof or method access can invoke traps', async () => {
  const f = fixture();
  let touched = false;
  const s = new Proxy(signal(), {
    getPrototypeOf() {
      touched = true;
      throw Error('PRIVATE_SIGNAL_HOOK');
    },
    get() {
      touched = true;
      throw Error('PRIVATE_SIGNAL_HOOK');
    },
  });
  const load = customerCaptureLinkLifecycle(
    f.f.auth,
    f.f.bearer,
    f.f.port,
    f.connection,
    f.input,
    { enabled: true, mode: 'disposable-proposal' },
  );
  await expect(load(f.f.viewer, s)).rejects.toThrow('UNKNOWN');
  expect(touched).toBe(false);
  expect(f.calls()).toBe(0);
});
