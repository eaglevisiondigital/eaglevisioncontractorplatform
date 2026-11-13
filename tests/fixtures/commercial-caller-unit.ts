import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import { CommercialCallerConnection } from '../../server/invoices/commercial-caller-connection';
import type { GatewaySql } from '../../server/payments/postgres-store';

/** Deterministic unit-only connection metadata and Auth responses. Not a native
 * backend, signature verification, hosted Auth or operational connection factory.
 * The existing mock still sees EVERY business query/argument and owns all ACKs.
 */
export function unitCommercialCaller(
  business: GatewaySql,
  actorId: string,
  expectedHash: string,
) {
  const session = crypto.randomUUID();
  const config = {
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    publishableKey: 'sb_publishable_synthetic_only',
  };
  const claims = {
    sub: actorId,
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
    login: 'UNIT_SIMULATED_LOGIN',
    current_role: 'UNIT_SIMULATED_ROLE',
  };
  const sql: GatewaySql = {
    async query<T extends Record<string, unknown>>(
      text: string,
      parameters?: unknown[],
    ) {
      if (text.includes('from pg_stat_activity where pid=pg_backend_pid()'))
        return {
          rows: [
            { ...scope, claims: JSON.stringify(claims) },
          ] as unknown as T[],
        };
      if (text.includes('jsonb_build_array('))
        return { rows: [{ request_hash: expectedHash }] as unknown as T[] };
      return business.query<T>(text, parameters);
    },
  };
  const auth = new CustomerBrokerAuth(config, async (input, init) => {
    if (new Headers(init?.headers).get('authorization') !== 'Bearer ' + bearer)
      throw Error('Wrong unit bearer');
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: actorId });
    if (path === '/rest/v1/rpc/customer_session_status')
      return Response.json({
        user_id: actorId,
        session_id: session,
        active: true,
      });
    throw Error('Unexpected unit provider path');
  });
  return {
    sql,
    caller: new CommercialCallerConnection(sql, auth, bearer, scope),
  };
}
