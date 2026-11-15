import { afterEach, expect, it, vi } from 'vitest';
import { CustomerBrokerAuth } from '../server/customer/broker-auth';
import { CommercialCallerConnection } from '../server/invoices/commercial-caller-connection';
import type { GatewaySql } from '../server/payments/postgres-store';
import {
  restrictedPublicationRead,
  customerPublicationRoleQuery,
} from '../proposals/customer-publication-admission/read-only';
import { customerPaymentPublicationFixture } from './fixtures/customer-payment-publication';
import { assertPublicationSources } from '../proposals/customer-publication-admission/source';
import { readFileSync, lstatSync } from 'node:fs';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture() {
  const f = customerPaymentPublicationFixture(),
    actor = crypto.randomUUID(),
    session = crypto.randomUUID();
  const config = {
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    publishableKey: 'sb_publishable_synthetic_only',
  };
  const claims = {
    sub: actor,
    session_id: session,
    aal: 'aal2',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: config.url + '/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
  };
  const bearer =
    Buffer.from('{"alg":"RS256"}').toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.controlled_unit_signature';
  const scope = {
    database: 'UNIT_SIMULATED_DATABASE',
    pid: 1,
    backend_start: 'UNIT_SIMULATED_BACKEND_START',
    login: 'unit_customer_reader',
    current_role: 'unit_customer_reader',
  };
  const profile = {
    login: scope.login,
    current_role: scope.login,
    rolcanlogin: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    memberships: 0,
    receipt_execute: true,
    schema_usage: true,
    schema_create: false,
    raw_table_access: false,
    other_definer: false,
  };
  const state = {
    active: true,
    auth: 0,
    receipt: 0,
    probes: 0,
    onReceipt: () => {},
    stall: false,
  };
  const auth = new CustomerBrokerAuth(config, async (input, init) => {
    state.auth++;
    if (state.stall) return new Promise(() => {});
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer ' + bearer,
    );
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: actor });
    if (path === '/rest/v1/rpc/customer_session_status')
      return Response.json({
        user_id: actor,
        session_id: session,
        active: state.active,
      });
    throw Error('Forbidden fake Auth path');
  });
  const query = vi.fn(
    async <T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) => {
      if (text.includes('from pg_stat_activity where pid=pg_backend_pid()'))
        return {
          rows: [
            { ...scope, claims: JSON.stringify(claims) },
          ] as unknown as T[],
        };
      if (text === customerPublicationRoleQuery) {
        state.probes++;
        return { rows: [{ ...profile }] as unknown as T[] };
      }
      if (text.startsWith('select private.customer_payment_receipt(')) {
        state.receipt++;
        expect(params).toEqual(Object.values(f.target));
        state.onReceipt();
        return {
          rows: [
            {
              receipt: {
                ...f.value,
                observedAt: Date.now(),
                expiresAt: Date.now() + 30000,
              },
            },
          ] as unknown as T[],
        };
      }
      throw Error('Unexpected SQL; no mutation allowed');
    },
  );
  const sql = { query } as unknown as GatewaySql,
    caller = new CommercialCallerConnection(sql, auth, bearer, scope),
    options = { enabled: true, mode: 'disposable-proposal' as const },
    read = restrictedPublicationRead(sql, caller, options);
  return { ...f, claims, scope, profile, state, sql, caller, options, read };
}
it('reuses opaque current Auth, bound backend and original exact receipt through a read-only catalog profile', async () => {
  const s = fixture();
  expect(await s.read(s.target, new AbortController().signal)).toMatchObject({
    publicationId: s.target.publicationId,
    financialEffect: false,
    holdRelease: false,
    balance: 'NOT_ESTABLISHED',
    settlement: 'UNVERIFIED',
  });
  expect(s.state.receipt).toBe(1);
  expect(s.state.probes).toBe(2);
  expect(s.state.auth).toBeGreaterThan(4);
});
it('defaultOFF performs no Auth/SQL and does not poison an otherwise unused port', async () => {
  const s = fixture();
  await expect(
    restrictedPublicationRead(s.sql, s.caller)(
      s.target,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(s.state.auth).toBe(0);
  expect(
    (await s.read(s.target, new AbortController().signal)).publicationId,
  ).toBe(s.target.publicationId);
});
it.each([
  'rolsuper',
  'rolbypassrls',
  'rolcreatedb',
  'rolcreaterole',
  'rolreplication',
  'schema_create',
  'raw_table_access',
  'other_definer',
] as const)('denies %s before reading customer data', async (flag) => {
  const s = fixture();
  s.profile[flag] = true;
  await expect(
    s.read(s.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(s.state.receipt).toBe(0);
});
it.each([
  'login',
  'current_role',
  'rolcanlogin',
  'memberships',
  'receipt_execute',
  'schema_usage',
] as const)('denies invalid %s before receipt SQL', async (key) => {
  const s = fixture();
  Object.assign(s.profile, {
    [key]:
      key === 'login'
        ? 'postgres'
        : key === 'current_role'
          ? 'service_role'
          : key === 'memberships'
            ? 1
            : false,
  });
  await expect(
    s.read(s.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(s.state.receipt).toBe(0);
});
it('catalog permissions granted during receipt await withhold the result and permanently retire this injected port', async () => {
  const s = fixture();
  s.state.onReceipt = () => {
    s.profile.raw_table_access = true;
  };
  await expect(
    s.read(s.target, new AbortController().signal),
  ).rejects.toThrow();
  s.profile.raw_table_access = false;
  s.state.onReceipt = () => {};
  await expect(
    s.read(s.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(s.state.receipt).toBe(1);
});
it('actual opaque Auth revocation during the read denies the late stored receipt', async () => {
  const s = fixture();
  s.state.onReceipt = () => {
    s.state.active = false;
  };
  await expect(
    s.read(s.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(s.state.receipt).toBe(1);
});
it('backend/claims replacement cannot reuse an original caller proof', async () => {
  const s = fixture();
  s.state.onReceipt = () => {
    s.claims.session_id = crypto.randomUUID();
  };
  await expect(
    s.read(s.target, new AbortController().signal),
  ).rejects.toThrow();
});
it('a serialized or other-port caller never reaches receipt or catalog SQL', async () => {
  const s = fixture();
  await expect(
    restrictedPublicationRead(
      s.sql,
      {} as CommercialCallerConnection,
      s.options,
    )(s.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(s.state.probes).toBe(0);
  expect(s.state.receipt).toBe(0);
});
it('overall deadline includes stalled Auth, and the timed-out object cannot be silently reused', async () => {
  vi.useFakeTimers();
  const s = fixture();
  s.state.stall = true;
  const pending = s.read(s.target, new AbortController().signal);
  const result = expect(pending).rejects.toThrow(
    'Current restricted customer publication unavailable',
  );
  await vi.advanceTimersByTimeAsync(5000);
  await result;
  s.state.stall = false;
  await expect(
    s.read(s.target, new AbortController().signal),
  ).rejects.toThrow();
  expect(s.state.receipt).toBe(0);
});
it('cancelled requests are denied before any Auth/SQL', async () => {
  const s = fixture(),
    cancel = new AbortController();
  cancel.abort();
  await expect(s.read(s.target, cancel.signal)).rejects.toThrow();
  expect(s.state.auth).toBe(0);
});
it.each([
  'server/customer/broker-auth.ts',
  'server/invoices/commercial-caller-connection.ts',
  'proposals/customer-payment-publication/reader.ts',
  'proposals/customer-payment-publication/source.json',
  'proposals/customer-payment-publication/publication.proposed.sql',
])('unknown %s cannot qualify as the exact admitted frame', (path) => {
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return String(p) === path ? Buffer.concat([b, Buffer.from('UNKNOWN')]) : b;
  }) as typeof readFileSync;
  expect(() => assertPublicationSources({ read })).toThrow();
});
it('mode/symlink substitutions cannot qualify', () => {
  const stat = ((p: Parameters<typeof lstatSync>[0]) => {
    const s = lstatSync(p);
    return String(p) === 'server/customer/broker-auth.ts'
      ? new Proxy(s, {
          get(t, k) {
            if (k === 'mode') return 0o755;
            return Reflect.get(t, k);
          },
        })
      : s;
  }) as typeof lstatSync;
  expect(() => assertPublicationSources({ stat })).toThrow();
});
