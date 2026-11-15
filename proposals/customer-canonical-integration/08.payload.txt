import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import {
  commercialCustomerReadProposal,
  type CommercialCustomerReaderPort,
} from '../../proposals/commercial-customer-bridge/reader';
import { fictionalCustomerInvoice } from './customer-issued-invoice';

/** Controlled Auth transport/mapping/source DTOs, NOT hosted Auth or SQL reads. */
export function commercialCustomerBridgeFixture() {
  const fixture = fictionalCustomerInvoice();
  // Keep the private fixture digest only in the trusted mapping/source, never in
  // the browser target or a customer request.
  const { sourceHash: privateSourceHash, ...publicInvoice } =
    fixture.viewer.invoice;
  const viewer = { ...fixture.viewer, invoice: publicInvoice };
  const config = {
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    publishableKey: 'sb_publishable_synthetic_only',
  };
  const claims = {
    sub: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    aal: 'aal2',
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    iss: config.url + '/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
  };
  const bearer =
    Buffer.from('{"alg":"RS256"}').toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.controlled_test_signature';
  let active = true;
  const calls = { auth: 0, session: 0, mapping: 0, source: 0 };
  const auth = new CustomerBrokerAuth(config, async (input, init) => {
    if (new Headers(init?.headers).get('authorization') !== 'Bearer ' + bearer)
      throw Error('Wrong fixture bearer');
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') {
      calls.auth++;
      return active
        ? Response.json({ id: claims.sub })
        : Response.json({ error: 'revoked' }, { status: 401 });
    }
    if (path === '/rest/v1/rpc/customer_session_status') {
      calls.session++;
      return Response.json({
        user_id: claims.sub,
        session_id: claims.session_id,
        active,
      });
    }
    throw Error('No external fixture path permitted');
  });
  const mapping = {
    mode: 'fictional-local',
    active: true,
    userId: claims.sub,
    sessionId: claims.session_id,
    ...publicInvoice,
    sourceHash: privateSourceHash,
    mappingRevision: 'fictional-map-r1',
    expiresAt: Date.now() + 120_000,
  };
  let value: unknown = fixture.value;
  const port: CommercialCustomerReaderPort = {
    kind: 'unwired-test-port',
    async authorize() {
      calls.mapping++;
      return structuredClone(mapping);
    },
    async readIssued() {
      calls.source++;
      return structuredClone(value);
    },
  };
  return {
    ...fixture,
    viewer,
    auth,
    bearer,
    port,
    mapping,
    calls,
    setAuth: (v: boolean) => {
      active = v;
    },
    setValue: (v: unknown) => {
      value = v;
    },
    load: commercialCustomerReadProposal(auth, bearer, port, {
      enabled: true,
      mode: 'fictional-local',
    }),
  };
}
