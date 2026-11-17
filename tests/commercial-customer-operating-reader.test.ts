import { expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { operatingReaderModel } from './fixtures/operating-customer-reader';
import { operatingCustomerInvoiceRead } from '../proposals/commercial-customer-operating-reader/reader';
import {
  renderReaderSQL,
  readerScope,
} from '../proposals/commercial-customer-operating-reader/binding';
const signal = () => new AbortController().signal;
it('default OFF invokes no SDK/SQL/reader', async () => {
  const f = operatingReaderModel();
  const read = operatingCustomerInvoiceRead(
    f.auth,
    f.bearer,
    f.connection,
    f.inspect,
    f.scope,
  );
  await expect(read(f.view, signal())).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it('actual original classes project original receipt without private source or payment authority', async () => {
  const f = operatingReaderModel();
  const r = await f.make()(f.view, signal());
  expect(r.invoice.number).toBe(f.value.invoice.number);
  expect(r.invoice.issuanceReceiptId).toBe(f.scope.issuanceReceiptId);
  expect(r.payment.status).toBe('UNKNOWN');
  expect(r.link.href).toBeNull();
  expect(JSON.stringify(r)).not.toMatch(
    /sourceHash|requestHash|actorId|sessionId|unit_cost|PRIVATE/,
  );
  expect(f.calls.every((s) => s.startsWith('select '))).toBe(true);
});
it('yearly number retains original issue-command pair', async () => {
  const f = operatingReaderModel();
  f.value.invoice.number = 'INV-2026-000001';
  f.hooks.mapping = (m) => ({
    ...(m as object),
    issuedNumber: 'INV-2026-000001',
  });
  f.hooks.packet = (p) => {
    const q = p as {
      invoice: { number: string };
      mapping: { issuedNumber: string };
    };
    q.invoice.number = 'INV-2026-000001';
    q.mapping.issuedNumber = 'INV-2026-000001';
    return q;
  };
  expect((await f.make()(f.view, signal())).invoice.number).toBe(
    'INV-2026-000001',
  );
});
it.each([
  'organizationId',
  'customerId',
  'locationId',
  'invoiceId',
  'sourceVersionId',
])('foreign public target %s denies before SQL', (k) => {
  const f = operatingReaderModel();
  const v = structuredClone(f.view);
  Object.assign(v.invoice, { [k]: randomUUID() });
  return expect(f.make()(v, signal())).rejects.toThrow('UNKNOWN');
});
it.each([
  'superuser',
  'bypassRls',
  'createDb',
  'createRole',
  'replication',
  'schemaFallback',
  'schemaCreate',
  'rawAccess',
  'otherDefiner',
])('unsafe catalog %s retires injected connection', async (k) => {
  const f = operatingReaderModel();
  Object.assign(f.profile, { [k]: true });
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  Object.assign(f.profile, { [k]: false });
  const n = f.calls.length;
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(n);
});
it.each([
  { memberships: 1 },
  { currentRole: 'wrong' },
  { login: 'wrong' },
  { schemaUsage: false },
  { canLogin: false },
  { isolation: 'repeatable read' },
])('incomplete/current-role profile %j denies', async (change) => {
  const f = operatingReaderModel();
  Object.assign(f.profile, change);
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
});
it.each([
  { bodyHash: '0'.repeat(64) },
  { owner: 'wrong' },
  { ownerLogin: true },
  { ownerSuper: true },
  { ownerBypass: true },
  { definer: false },
  { volatility: 's' },
  { args: 1 },
  { result: 'text' },
  { config: ['search_path=public'] },
  { directExecute: false },
  { publicExecute: true },
  { grantOption: true },
])('wrong installed body/owner/ACL %j denies', async (change) => {
  const f = operatingReaderModel();
  Object.assign(f.profile.functions[0], change);
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  expect(
    f.calls.some(
      (s) =>
        s === 'select private.commercial_customer_invoice_read_issued() result',
    ),
  ).toBe(false);
});
it('revoked Auth denies without SQL', async () => {
  const f = operatingReaderModel();
  f.setAuth(false);
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  expect(f.calls).toHaveLength(0);
});
it('session revocation during issued SQL suppresses late data', async () => {
  const f = operatingReaderModel();
  f.hooks.afterRead = async () => f.setAuth(false);
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
});
it('customer access withdrawal after data read suppresses response and cannot reopen object', async () => {
  const f = operatingReaderModel();
  f.hooks.afterRead = async () => f.revoke();
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  f.restore();
  f.hooks.afterRead = async () => {};
  const n = f.calls.length;
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  expect(f.calls.length).toBe(n);
});
it.each([
  { issuanceReceiptId: randomUUID() },
  { sourceHash: 'b'.repeat(64) },
  { userId: randomUUID() },
  { sessionId: randomUUID() },
  { expiresAt: 1 },
  { revision: 999 },
  { mappingRevision: randomUUID() },
])('contradictory original mapping %j denies', async (change) => {
  const f = operatingReaderModel();
  f.hooks.mapping = (m) => ({ ...(m as object), ...change });
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
});
it('catalog revocation after returned row still denies', async () => {
  const f = operatingReaderModel();
  f.hooks.afterRead = async () => {
    f.profile.functions[0].directExecute = false;
  };
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
});
it('malformed or ambiguous SQL acknowledgment never becomes evidence', async () => {
  const f = operatingReaderModel();
  f.hooks.packet = () => ({});
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
});
it('getter/private mutable response is denied without invoking accessor', async () => {
  const f = operatingReaderModel();
  let calls = 0;
  f.hooks.packet = () =>
    Object.defineProperty({}, 'invoice', {
      get() {
        calls++;
        throw Error('SECRET');
      },
      enumerable: true,
    });
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  expect(calls).toBe(0);
});
it('cancellation suppresses data and preserves object quarantine', async () => {
  const f = operatingReaderModel(),
    a = new AbortController();
  f.hooks.afterRead = async () => a.abort();
  await expect(f.make()(f.view, a.signal)).rejects.toThrow('UNKNOWN');
  const n = f.calls.length;
  await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  expect(f.calls.length).toBe(n);
});
it('deadline suppresses uncertain read without retry', async () => {
  vi.useFakeTimers();
  try {
    const f = operatingReaderModel();
    f.hooks.hang = true;
    const p = f
      .make()(f.view, signal())
      .then(
        () => false,
        () => true,
      );
    await vi.advanceTimersByTimeAsync(5100);
    expect(await p).toBe(true);
    expect(
      f.calls.filter(
        (s) =>
          s ===
          'select private.commercial_customer_invoice_read_issued() result',
      ),
    ).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
it('source withdrawal after awaited read denies', async () => {
  const p = 'proposals/commercial-customer-operating-reader/catalog.ts',
    b = readFileSync(p);
  try {
    const f = operatingReaderModel();
    f.hooks.afterRead = async () =>
      writeFileSync(p, Buffer.concat([b, Buffer.from('\n// WITHDRAWN')]));
    await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  } finally {
    writeFileSync(p, b);
  }
});
it.each(['public', 'postgres', 'pg_read_all_data'])(
  'private renderer rejects reserved principal %s',
  (r) => {
    const f = operatingReaderModel();
    expect(() => readerScope({ ...f.scope, login: r })).toThrow();
  },
);
it('renderer cannot accept altered authority SQL', () => {
  const f = operatingReaderModel();
  expect(() =>
    renderReaderSQL(
      readFileSync(
        'proposals/commercial-customer-operating-reader/read.proposed.sql.in',
        'utf8',
      ) + '--unknown',
      '',
      f.scope,
    ),
  ).toThrow();
});

it.each(['userId', 'login', 'owner', 'sourceHash'])(
  'binding primitive %s rejects coercion with zero hooks',
  (key) => {
    const f = operatingReaderModel();
    let calls = 0;
    const v = {
      toString() {
        calls++;
        return key === 'userId' ? f.scope.userId : "x'; SELECT 'BENIGN'; --";
      },
    };
    expect(() => readerScope({ ...f.scope, [key]: v } as never)).toThrow();
    expect(calls).toBe(0);
  },
);
it.each(['portalOwnerACL', 'portalPolicy', 'portalRls'])(
  'owner portal privilege/policy %s is independently required',
  async (k) => {
    const f = operatingReaderModel();
    Object.assign(f.profile, { [k]: false });
    await expect(f.make()(f.view, signal())).rejects.toThrow('UNKNOWN');
  },
);
it('proxy AbortSignal is rejected before any trap', async () => {
  const f = operatingReaderModel();
  let calls = 0;
  const p = new Proxy(signal(), {
    get() {
      calls++;
      throw Error('hook');
    },
    getPrototypeOf() {
      calls++;
      throw Error('hook');
    },
  });
  await expect(f.make()(f.view, p)).rejects.toThrow('UNKNOWN');
  expect(calls).toBe(0);
  expect(f.calls).toHaveLength(0);
});
it('concurrent reads quarantine both observers, never dispatch replacement', async () => {
  const f = operatingReaderModel();
  const read = f.make();
  const p = read(f.view, signal()).then(
      () => false,
      () => true,
    ),
    q = read(f.view, signal()).then(
      () => false,
      () => true,
    );
  expect(await p).toBe(true);
  expect(await q).toBe(true);
});
