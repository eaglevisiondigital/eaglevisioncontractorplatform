import { it, expect, vi } from 'vitest';
import {
  CustomerBrokerAuth,
  brokerActor,
} from '../server/customer/broker-auth';
import { brokerIntent, CustomerRequestBroker } from '../server/customer/broker';
const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_synthetic_only',
};
const user = crypto.randomUUID(),
  session = crypto.randomUUID();
const claims = () => ({
  sub: user,
  session_id: session,
  aal: 'aal2',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  iss: config.url + '/auth/v1',
  aud: 'authenticated',
  role: 'authenticated',
});
function fixture(
  change: Record<string, unknown> = {},
  options: {
    authDenied?: boolean;
    sessionDenied?: boolean;
    wrongSession?: boolean;
  } = {},
) {
  const c = { ...claims(), ...change },
    bearer =
      Buffer.from('{"alg":"RS256"}').toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify(c)).toString('base64url') +
      '.controlled_signature';
  const calls: string[] = [];
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer ' + bearer,
    );
    if (path === '/auth/v1/user')
      return options.authDenied
        ? Response.json({ message: 'denied' }, { status: 401 })
        : Response.json({ id: user });
    if (path === '/rest/v1/rpc/customer_session_status')
      return Response.json({
        user_id: user,
        session_id: options.wrongSession ? crypto.randomUUID() : session,
        active: !options.sessionDenied,
      });
    throw Error('Forbidden provider path');
  });
  return {
    bearer,
    auth: new CustomerBrokerAuth(config, transport),
    calls,
    transport,
  };
}
it('actual SDK getUser plus live session creates only an opaque server proof', async () => {
  const f = fixture(),
    proof = await f.auth.verify(f.bearer);
  expect(f.calls).toEqual([
    '/auth/v1/user',
    '/rest/v1/rpc/customer_session_status',
  ]);
  expect(brokerActor(proof)).toMatchObject({
    user_id: user,
    session_id: session,
    aal: 'aal2',
  });
  expect(JSON.stringify(proof)).not.toContain(user);
  expect(() => brokerActor(JSON.parse(JSON.stringify(proof)))).toThrow();
});
it.each([
  { sub: crypto.randomUUID() },
  { session_id: crypto.randomUUID() },
  { iss: 'https://foreign.invalid/auth/v1' },
  { aud: 'service_role' },
  { role: 'service_role' },
  { aal: 'aal3' },
  { exp: 0 },
  { iat: Math.floor(Date.now() / 1000) + 3600 },
  { exp: '99999999999' },
])('verified token claims still fail strict binding %j', async (change) => {
  const f = fixture(change);
  await expect(f.auth.verify(f.bearer)).rejects.toThrow();
});
it.each([
  { authDenied: true },
  { sessionDenied: true },
  { wrongSession: true },
])(
  'Auth/session denial is never repaired by browser claims %j',
  async (option) => {
    const f = fixture({}, option);
    await expect(f.auth.verify(f.bearer)).rejects.toThrow();
    expect(
      f.calls.every(
        (x) =>
          x === '/auth/v1/user' || x === '/rest/v1/rpc/customer_session_status',
      ),
    ).toBe(true);
  },
);
const intent = () => ({
  organization_id: crypto.randomUUID(),
  publication_id: crypto.randomUUID(),
  choice: 'request_changes_review',
  note: '  exact 😀 text  ',
  acknowledgment: 'review-only-v2',
  confirmed: true,
});
it('review intent canonicalizes text without accepting authority fields', () => {
  const p = intent();
  expect(brokerIntent(p).note).toBe('exact 😀 text');
  for (const key of [
    'request_id',
    'user_id',
    'session_id',
    'principal',
    'issuer',
    'executor',
    'scope_sha256',
  ])
    expect(() => brokerIntent({ ...p, [key]: 'forged' })).toThrow();
});
it.each(['', '  ', '😀'.repeat(2001), '\uD800', '\0'])(
  'invalid note %j is rejected before dispatch',
  (note) => {
    expect(() => brokerIntent({ ...intent(), note })).toThrow();
  },
);
it('2,000 Unicode code points and literal markup stay text', () => {
  expect(
    brokerIntent({ ...intent(), note: '😀'.repeat(2000) }).note,
  ).toHaveLength(4000);
  expect(
    brokerIntent({ ...intent(), note: '<script>literal</script>' }).note,
  ).toBe('<script>literal</script>');
});
it('default-off broker does not initialize a network operation', async () => {
  const f = fixture();
  await expect(
    new CustomerRequestBroker(f.auth).submit(f.bearer, intent()),
  ).rejects.toThrow(/disabled/);
  expect(f.calls).toEqual([]);
});
it('opaque identity expires as a broker proof without refreshing the bearer', async () => {
  const f = fixture(),
    proof = await f.auth.verify(f.bearer),
    now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 30001);
  try {
    expect(() => brokerActor(proof)).toThrow();
  } finally {
    clock.mockRestore();
  }
});
