// Disposable test fixture only. Controlled Auth is NOT genuine hosted Auth.
import { Client } from 'pg';
import type { TestDatabase } from '../database/engine';
import type { GatewaySql } from '../../server/payments/postgres-store';
import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import {
  CommercialCallerConnection,
  type InvoiceConnectionScope,
} from '../../server/invoices/commercial-caller-connection';
const leases: { raw?: Client; auth?: TestDatabase; role?: string }[] = [];
const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_synthetic_only',
};
export const isCommercialDraftMutation = (sql: string) =>
  sql.includes('private.commercial_invoice_draft_create(') ||
  sql.includes('private.commercial_invoice_draft_save(');
export async function commercialCallerNativeFixture(
  db: TestDatabase,
  c: { actor: string; session: string },
) {
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    sub: c.actor,
    session_id: c.session,
    aal: 'aal2',
    exp: iat + 3600,
    iat,
    iss: config.url + '/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
  };
  const bearer =
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
      'base64url',
    ) +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.controlled_signature';
  let scope: InvoiceConnectionScope;
  let connection: GatewaySql;
  const lease: { raw?: Client; auth?: TestDatabase; role?: string } = {};
  leases.push(lease);
  if (db.fork) {
    await db.exec('reset role');
    const database = String(
      (await db.query('select current_database() name')).rows[0].name,
    );
    if (!/^ev_test_[a-f0-9]{32}$/.test(database))
      throw Error('Disposable native database required');
    const role = 'invoice_legacy_' + crypto.randomUUID().replaceAll('-', '');
    await db.exec(
      `create role ${role} login inherit nosuperuser nocreatedb nocreaterole nobypassrls password 'synthetic-ci-only';grant propel_commercial_draft_runtime to ${role}`,
    );
    lease.role = role;
    const localSocket = process.env.EV_TEST_PG_SOCKET;
    const raw = new Client({
      host: localSocket ?? '127.0.0.1',
      port: localSocket ? 55477 : 5432,
      user: role,
      password: localSocket ? undefined : 'synthetic-ci-only',
      database,
    });
    lease.raw = raw;
    await raw.connect();
    lease.auth = await db.fork();
    await raw.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify(claims),
    ]);
    scope = (
      await raw.query<InvoiceConnectionScope>(
        'select current_database() database,pg_backend_pid() pid,backend_start::text,session_user::text login,current_user::text current_role from pg_stat_activity where pid=pg_backend_pid()',
      )
    ).rows[0];
    connection = {
      async query<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) {
        const result = await raw.query<T>(sql, params);
        return { rows: result.rows };
      },
    };
  } else {
    // PGlite has no independently inspectable backend/login. This branch is an
    // explicitly SIMULATED inspection only; claims/hash/business SQL stay real.
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify(claims),
    ]);
    scope = {
      database: 'PGLITE_SIMULATED_ONLY',
      pid: 1,
      backend_start: 'PGLITE_SIMULATED_ONLY',
      login: 'PGLITE_SIMULATED_ONLY',
      current_role: 'PGLITE_SIMULATED_ONLY',
    };
    connection = {
      async query<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) {
        if (sql.includes('from pg_stat_activity where pid=pg_backend_pid()')) {
          const result = await db.query<{ claims: string }>(
            "select current_setting('request.jwt.claims',true) claims",
          );
          return {
            rows: [
              { ...scope, claims: result.rows[0].claims },
            ] as unknown as T[],
          };
        }
        return db.query<T>(sql, params);
      },
    };
  }
  const auth = new CustomerBrokerAuth(config, async (input, init) => {
    if (new Headers(init?.headers).get('authorization') !== 'Bearer ' + bearer)
      throw Error('Exact synthetic bearer required');
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: c.actor });
    if (path === '/rest/v1/rpc/customer_session_status') {
      const active = lease.auth
        ? (
            await lease.auth.query<{ active: boolean }>(
              'select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2 and u.email_confirmed_at is not null and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=clock_timestamp()) and (s.not_after is null or s.not_after>clock_timestamp())) active',
              [c.actor, c.session],
            )
          ).rows[0].active
        : true;
      // PGlite's true is controlled Auth simulation; real SQL guards still run.
      return Response.json({ user_id: c.actor, session_id: c.session, active });
    }
    throw Error('Forbidden controlled Auth provider path');
  });
  return {
    connection,
    caller: (port: GatewaySql) =>
      new CommercialCallerConnection(port, auth, bearer, scope),
  };
}
export async function closeCommercialCallerNativeFixtures(db: TestDatabase) {
  await db.exec('reset role');
  for (const lease of leases.splice(0).reverse()) {
    await lease.auth?.close();
    await lease.raw?.end();
    if (lease.role)
      await db.exec(`drop owned by ${lease.role};drop role ${lease.role}`);
  }
}
