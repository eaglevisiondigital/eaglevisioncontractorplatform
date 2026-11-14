import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { CustomerBrokerAuth } from '../server/customer/broker-auth';
import type { GatewaySql } from '../server/payments/postgres-store';
import {
  prepareDisposableInvoiceConnection as prepare,
  type IssuanceTarget,
} from '../proposals/commercial-invoice-connection/connection';
const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_fictional_only',
};
function fixture() {
  const actor = randomUUID(),
    session = randomUUID(),
    now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: actor,
    session_id: session,
    aal: 'aal2',
    exp: now + 3600,
    iat: now,
    iss: config.url + '/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
  };
  const bearer =
    Buffer.from('{}').toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.fictional';
  const target: IssuanceTarget = {
    organizationId: randomUUID(),
    invoiceId: randomUUID(),
    customerId: randomUUID(),
    locationId: randomUUID(),
    sourceVersionId: randomUUID(),
    revision: 1,
    sourceHash: 'a'.repeat(64),
  };
  let catalog: Record<string, unknown> = {};
  let active = true,
    permitted = true,
    writes = 0,
    destroyed = 0,
    acquired = 0,
    lose = false,
    mutationHook = () => {};
  const scope = {
    database: 'ev_test_' + randomUUID().replaceAll('-', ''),
    pid: 100,
    backend_start: '2026-11-14 00:00:00+00',
    login: 'propel_invoice_connection_test_issue_login',
    current_role: 'propel_invoice_connection_test_issue_login',
  };
  let connectionClaims = '';
  let evidence: unknown;
  const port: GatewaySql = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) {
      let rows: Record<string, unknown>[];
      if (sql.includes('pg_roles'))
        rows = [
          {
            rolsuper: false,
            rolbypassrls: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            memberships: permitted ? 1 : 0,
            runtime_name: params![0],
            current_name: scope.current_role,
            login_inherit: true,
            runtime_super: false,
            runtime_bypass: false,
            runtime_createdb: false,
            runtime_createrole: false,
            runtime_replication: false,
            runtime_login: false,
            runtime_memberships: 0,
            permitted,
            ...catalog,
          },
        ];
      else if (sql.includes('pg_stat_activity'))
        rows = [
          {
            ...scope,
            ...(sql.includes('request.jwt.claims')
              ? { claims: connectionClaims }
              : {}),
          },
        ];
      else if (sql.includes('set_config')) {
        connectionClaims = String(params![0]);
        rows = [{}];
      } else if (sql.includes(' request_hash'))
        rows = [{ request_hash: 'b'.repeat(64) }];
      else if (sql.includes('private.commercial_invoice_issue(')) {
        writes++;
        evidence = {
          state: 'issued',
          paymentState: 'unverified',
          invoiceId: target.invoiceId,
          organizationId: target.organizationId,
          customerId: target.customerId,
          locationId: target.locationId,
          sourceVersionId: target.sourceVersionId,
          sourceHash: target.sourceHash,
          revision: target.revision,
          number: 'INV-' + target.invoiceId.replaceAll('-', ''),
          title: 'Fictional invoice',
          currency: 'USD',
          amountMinor: 1100,
          issuedAt: '2026-11-14T00:00:00.000000Z',
          receipt: {
            commandId: params![2],
            actorId: actor,
            requestHash: 'b'.repeat(64),
          },
        };
        mutationHook();
        if (lose) {
          lose = false;
          throw Error('Fictional missing ACK');
        }
        rows = [{ result: evidence }];
      } else if (sql.includes('private.commercial_invoice_issued_read('))
        rows = [{ result: evidence }];
      else throw Error('Unexpected SQL in controlled fixture');
      return { rows: rows as T[] };
    },
  };
  const auth = new CustomerBrokerAuth(config, async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: actor });
    if (path === '/rest/v1/rpc/customer_session_status')
      return Response.json({ user_id: actor, session_id: session, active });
    throw Error('No network in fictional Auth');
  });
  const ports = {
    auth,
    bearer,
    async acquire() {
      acquired++;
      return {
        sql: port,
        async destroy() {
          destroyed++;
        },
      };
    },
  };
  const binding = {
    organizationId: target.organizationId,
    workload: 'issue' as const,
    target,
    numbering: 'FICTIONAL_FULL_UUID_ONLY' as const,
  };
  return {
    ports,
    binding,
    scope,
    target,
    actor,
    session,
    bearer,
    catalog: (patch: Record<string, unknown>) => {
      catalog = patch;
    },
    counts: () => ({ writes, destroyed, acquired }),
    revoke: () => {
      active = false;
    },
    restore: () => {
      active = true;
    },
    revokeRole: () => {
      permitted = false;
    },
    restoreRole: () => {
      permitted = true;
    },
    lose: () => {
      lose = true;
    },
    afterMutation: (fn: () => void) => {
      mutationHook = fn;
    },
    changeEvidence: (fn: (v: unknown) => unknown) => {
      evidence = fn(evidence);
    },
  };
}
it('defaults off without touching Auth or a connection', async () => {
  const f = fixture();
  expect(await prepare(f.ports, f.binding)).toBeNull();
  expect(f.counts().acquired).toBe(0);
});
it.each(['production', 'ev_test_wrong', 'other_test_db'])(
  'denies non-disposable database %s before a mutation',
  async (database) => {
    const f = fixture();
    f.scope.database = database;
    await expect(prepare(f.ports, f.binding, true)).rejects.toThrow();
    expect(f.counts()).toEqual({ acquired: 1, destroyed: 1, writes: 0 });
  },
);
it.each(['postgres', 'authenticated', 'service_role'])(
  'denies an unreviewed login %s',
  async (login) => {
    const f = fixture();
    f.scope.login = login;
    await expect(prepare(f.ports, f.binding, true)).rejects.toThrow();
    expect(f.counts().writes).toBe(0);
  },
);
it('requires current opaque Auth before opening a lease', async () => {
  const f = fixture();
  f.revoke();
  await expect(prepare(f.ports, f.binding, true)).rejects.toThrow();
  expect(f.counts().acquired).toBe(0);
});
it('rejects inherited/accessor/extra caller binding fields without invoking them', async () => {
  const f = fixture();
  let called = false;
  const binding = { ...f.binding };
  Object.defineProperty(binding, 'organizationId', {
    get() {
      called = true;
      return f.target.organizationId;
    },
  });
  await expect(prepare(f.ports, binding, true)).rejects.toThrow();
  expect(called).toBe(false);
  expect(f.counts().acquired).toBe(0);
  await expect(
    prepare(f.ports, { ...f.binding, admin: true } as typeof binding, true),
  ).rejects.toThrow();
});
it('cannot issue under unaccepted numbering policy', async () => {
  const f = fixture(),
    handle = await prepare(
      f.ports,
      { ...f.binding, numbering: 'NOT_ACCEPTED' },
      true,
    );
  await expect(handle!.issuer!.issue(randomUUID())).rejects.toThrow('UNKNOWN');
  expect(f.counts().writes).toBe(0);
  await handle!.close();
});
it('returns only the original safe issuance and permanently denies duplicate dispatch', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true),
    command = randomUUID();
  const result = await handle!.issuer!.issue(command);
  expect(result.issuanceReceiptId).toBe(command);
  expect(result.paymentState).toBe('unverified');
  expect(handle!.issuer!.status()).toBe('CONFIRMED_ISSUANCE_ONLY');
  for (const secret of [f.bearer, f.actor, f.session, f.target.sourceHash])
    expect(JSON.stringify(result)).not.toContain(secret);
  await expect(handle!.issuer!.issue(command)).rejects.toThrow('UNKNOWN');
  await expect(handle!.issuer!.issue(randomUUID())).rejects.toThrow('UNKNOWN');
  expect(f.counts().writes).toBe(1);
  await handle!.close();
  expect(handle!.issuer!.status()).toBe('UNKNOWN');
});
it('lost ACK permits only an exact original receipt read and never repeats the mutation', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true),
    command = randomUUID();
  f.lose();
  await expect(handle!.issuer!.issue(command)).rejects.toThrow('UNKNOWN');
  expect(handle!.issuer!.status()).toBe('UNKNOWN');
  expect((await handle!.issuer!.reconcile()).issuanceReceiptId).toBe(command);
  expect(f.counts().writes).toBe(1);
  await handle!.close();
});
it('post-dispatch revocation remains UNKNOWN until exact current-authorized read', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true),
    command = randomUUID();
  f.afterMutation(f.revoke);
  await expect(handle!.issuer!.issue(command)).rejects.toThrow('UNKNOWN');
  await expect(handle!.issuer!.reconcile()).rejects.toThrow('UNKNOWN');
  f.restore();
  expect((await handle!.issuer!.reconcile()).issuanceReceiptId).toBe(command);
  expect(f.counts().writes).toBe(1);
  await handle!.close();
});
it('role withdrawal after preparation denies before dispatch', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true);
  f.revokeRole();
  await expect(handle!.issuer!.issue(randomUUID())).rejects.toThrow('UNKNOWN');
  expect(f.counts().writes).toBe(0);
  await handle!.close();
});
it('wrong original receipt digest never clears UNKNOWN', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true);
  f.lose();
  await expect(handle!.issuer!.issue(randomUUID())).rejects.toThrow();
  f.changeEvidence((v) => ({
    ...(v as object),
    receipt: {
      commandId: randomUUID(),
      actorId: f.actor,
      requestHash: 'c'.repeat(64),
    },
  }));
  await expect(handle!.issuer!.reconcile()).rejects.toThrow('UNKNOWN');
  expect(handle!.issuer!.status()).toBe('UNKNOWN');
  await handle!.close();
});
it('different port wrappers cannot alias an already-owned physical backend', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true);
  const same = f.ports.acquire;
  const aliasPorts = {
    ...f.ports,
    async acquire() {
      const lease = await same();
      return { ...lease, sql: { query: lease.sql.query.bind(lease.sql) } };
    },
  };
  await expect(prepare(aliasPorts, f.binding, true)).rejects.toThrow();
  expect(f.counts().destroyed).toBe(0);
  expect((await handle!.issuer!.issue(randomUUID())).state).toBe('issued');
  await handle!.close();
});
it('an UNKNOWN command cannot be rebound to a different invoice on a new lease', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true),
    command = randomUUID();
  f.lose();
  await expect(handle!.issuer!.issue(command)).rejects.toThrow();
  await handle!.close();
  const target = { ...f.target, invoiceId: randomUUID() };
  const next = await prepare(f.ports, { ...f.binding, target }, true);
  await expect(next!.issuer!.issue(command)).rejects.toThrow('UNKNOWN');
  expect(f.counts().writes).toBe(1);
  await next!.close();
});
it('new factories cannot mistake another exact target for a confirmed original', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true);
  await handle!.issuer!.issue(randomUUID());
  await handle!.close();
  const target = { ...f.target, revision: 2 };
  const next = await prepare(f.ports, { ...f.binding, target }, true);
  expect(next!.issuer!.status()).toBe('UNKNOWN');
  await expect(next!.issuer!.reconcile()).rejects.toThrow();
  await next!.close();
});
it.each([
  'runtime_super',
  'runtime_bypass',
  'runtime_createdb',
  'runtime_createrole',
  'runtime_replication',
  'runtime_login',
])(
  'runtime privilege escalation %s denies even with the original LOGIN membership',
  async (key) => {
    const f = fixture(),
      handle = await prepare(f.ports, f.binding, true);
    f.catalog({ [key]: true });
    await expect(handle!.issuer!.issue(randomUUID())).rejects.toThrow();
    expect(f.counts().writes).toBe(0);
    await handle!.close();
  },
);
it('unexpected inherited runtime membership denies before dispatch', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true);
  f.catalog({ runtime_memberships: 1 });
  await expect(handle!.issuer!.issue(randomUUID())).rejects.toThrow();
  expect(f.counts().writes).toBe(0);
  await handle!.close();
});
it('cross-workload backend alias denial does not destroy the first lease', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true);
  const aliasPorts = {
    ...f.ports,
    async acquire() {
      const lease = await f.ports.acquire();
      return { ...lease, sql: { query: lease.sql.query.bind(lease.sql) } };
    },
  };
  await expect(
    prepare(
      aliasPorts,
      {
        organizationId: f.target.organizationId,
        workload: 'draft',
        numbering: 'NOT_ACCEPTED',
      },
      true,
    ),
  ).rejects.toThrow();
  expect(f.counts().destroyed).toBe(0);
  await handle!.issuer!.issue(randomUUID());
  await handle!.close();
});
it('command objects never run coercion or become original intent identities', async () => {
  const f = fixture(),
    handle = await prepare(f.ports, f.binding, true);
  let coerced = false;
  const command = {
    toString() {
      coerced = true;
      return randomUUID();
    },
  } as unknown as string;
  await expect(handle!.issuer!.issue(command)).rejects.toThrow();
  await expect(handle!.issuer!.readOriginal(command)).rejects.toThrow();
  expect(coerced).toBe(false);
  expect(f.counts().writes).toBe(0);
  expect((await handle!.issuer!.issue(randomUUID())).state).toBe('issued');
  await handle!.close();
});
// Last: an unknown destruction acknowledgment permanently quarantines this module.
it('unknown connection cleanup denies all later preparation without retries', async () => {
  const f = fixture();
  let closes = 0;
  const original = f.ports.acquire;
  const ports = {
    ...f.ports,
    async acquire() {
      const lease = await original();
      return {
        ...lease,
        async destroy() {
          closes++;
          throw Error('Fictional cleanup ACK missing');
        },
      };
    },
  };
  const handle = await prepare(ports, f.binding, true);
  await expect(handle!.close()).rejects.toThrow();
  const next = fixture();
  await expect(prepare(next.ports, next.binding, true)).rejects.toThrow();
  expect(next.counts().acquired).toBe(0);
  expect(closes).toBe(1);
  await expect(handle!.issuer!.issue(randomUUID())).rejects.toThrow();
});
