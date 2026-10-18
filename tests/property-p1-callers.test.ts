import { it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { rmSync } from 'node:fs';
import { verifyCleanupSession } from '../server/property/execution/cleanup-auth';
import { executionPackage } from './helpers/p1-execution';
import {
  SupabaseP1Callers,
  type P1Identity,
} from '../server/property/execution/callers';
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
const token = (claims: Record<string, unknown>) => {
  const b = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString('base64url'),
    unsigned = b({ alg: 'HS256', typ: 'JWT' }) + '.' + b(claims);
  return (
    unsigned +
    '.' +
    createHmac('sha256', 'local-fixture-only-never-a-provider-key')
      .update(unsigned)
      .digest('base64url')
  );
};
function setup() {
  const p = executionPackage();
  roots.push(p.root);
  const custody = {
    register: vi.fn(async () => {}),
    assertAcknowledged: vi.fn(),
  };
  const calls: {
    path: string;
    method: string;
    authorization: string | null;
  }[] = [];
  const people = new Map(
    p.evidence.actors.map((a) => [
      a.user_id,
      {
        id: a.user_id,
        email: a.alias + '@example.test',
        email_confirmed_at: new Date().toISOString(),
        is_anonymous: false,
        factors:
          a.role === 'owner'
            ? [
                {
                  id: 'existing-factor',
                  factor_type: 'totp',
                  status: 'verified',
                },
              ]
            : [],
      },
    ]),
  );
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)),
      headers = new Headers(init?.headers),
      auth = headers.get('authorization');
    calls.push({
      path: url.pathname + url.search,
      method: init?.method ?? 'GET',
      authorization: auth,
    });
    if (url.pathname === '/auth/v1/user') {
      const c = JSON.parse(
        Buffer.from(auth!.split('.')[1], 'base64url').toString(),
      );
      const user = people.get(c.sub);
      return new Response(JSON.stringify(user), {
        status: user ? 200 : 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/auth/v1/logout')
      return new Response(null, { status: 204 });
    if (url.pathname === '/rest/v1/rpc/property_workspace')
      return new Response(JSON.stringify({ plans: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    throw Error('Unexpected fixture endpoint');
  };
  const actors = new SupabaseP1Callers(
    p.frozen,
    'sb_publishable_fixture_only',
    custody,
    transport,
  );
  const identity = (index = 0): P1Identity => {
    const a = p.evidence.actors[index];
    return {
      alias: a.alias,
      userId: a.user_id,
      organizationId: a.organization_id,
      owner: a.role === 'owner',
      email: a.alias + '@example.test',
      factorId: a.role === 'owner' ? 'existing-factor' : undefined,
    };
  };
  const claims = (
    i: P1Identity,
    aal = i.owner ? 'aal2' : 'aal1',
    sid = crypto.randomUUID(),
  ) => ({
    sub: i.userId,
    role: 'authenticated',
    aud: 'authenticated',
    aal,
    session_id: sid,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: 'https://' + 'a'.repeat(20) + '.supabase.co/auth/v1',
  });
  return { p, actors, calls, custody, people, identity, claims, transport };
}
it('uses SDK Auth verification and exact normal-user Bearer tokens, preserves original AAL1 and same-session owner MFA', async () => {
  const s = setup(),
    i = s.identity(),
    c = s.claims(i),
    high = token(c),
    low = token({ ...c, aal: 'aal1' });
  await s.actors.add(i, high, low);
  expect(s.custody.register).toHaveBeenCalledWith(i.alias, high, i.factorId);
  const owner = s.actors.get(i.organizationId, 'owner');
  expect((await owner.verify()).aal).toBe('aal2');
  expect(
    (await s.actors.get(i.organizationId, 'owner-original-aal1').verify()).aal,
  ).toBe('aal1');
  await owner.rpc(
    'property_workspace',
    { p_org: i.organizationId },
    new AbortController().signal,
  );
  expect(s.custody.assertAcknowledged).toHaveBeenCalledWith(i.alias, high);
  expect(
    s.calls.find((x) => x.path === '/rest/v1/rpc/property_workspace')
      ?.authorization,
  ).toBe('Bearer ' + high);
  await owner.signOut();
  expect(s.calls.at(-1)?.path).toBe('/auth/v1/logout?scope=local');
  await expect(
    owner.rpc('provider_payment_command', {}, new AbortController().signal),
  ).rejects.toThrow('allowlist');
});
it('denies an RPC when independent backup acknowledgment is absent', async () => {
  const s = setup(),
    i = s.identity(),
    c = s.claims(i);
  await s.actors.add(i, token(c), token({ ...c, aal: 'aal1' }));
  s.custody.assertAcknowledged.mockImplementation(() => {
    throw Error('Backup missing');
  });
  const before = s.calls.length;
  await expect(
    s.actors
      .get(i.organizationId, 'owner')
      .rpc(
        'property_workspace',
        { p_org: i.organizationId },
        new AbortController().signal,
      ),
  ).rejects.toThrow('Backup missing');
  expect(s.calls).toHaveLength(before);
});
it.each([
  'foreign identity',
  'expired',
  'AAL1 owner',
  'wrong factor',
  'different low session',
  'service role',
  'forged metadata',
])('rejects %s before independent session handoff', async (mode) => {
  const s = setup(),
    i = s.identity(),
    c = s.claims(i);
  let low = token({ ...c, aal: 'aal1' });
  if (mode === 'foreign identity') i.userId = crypto.randomUUID();
  if (mode === 'expired') c.exp = 0;
  if (mode === 'AAL1 owner') c.aal = 'aal1';
  if (mode === 'wrong factor') i.factorId = 'not-the-existing-factor';
  if (mode === 'different low session')
    low = token({ ...c, aal: 'aal1', session_id: crypto.randomUUID() });
  if (mode === 'service role') c.role = 'service_role';
  if (mode === 'forged metadata') {
    c.aal = 'aal1';
    (c as Record<string, unknown>).user_metadata = {
      role: 'owner',
      aal: 'aal2',
    };
  }
  await expect(s.actors.add(i, token(c), low)).rejects.toThrow();
  expect(s.custody.register).not.toHaveBeenCalled();
});
it('requires all15 staff callers, rejects customers, and refuses service credentials', async () => {
  const s = setup();
  await expect(s.actors.verifyAll()).rejects.toThrow('15');
  const customer = s.identity(5);
  await expect(
    s.actors.add(customer, token(s.claims(customer))),
  ).rejects.toThrow();
  expect(
    () => new SupabaseP1Callers(s.p.frozen, 'sb_secret_forbidden', s.custody),
  ).toThrow();
});
it('hands all15 exact staff identities to independent custody and preserves three original owner sessions', async () => {
  const s = setup();
  for (let n = 0; n < s.p.evidence.actors.length; n++) {
    if (s.p.evidence.actors[n].alias.endsWith('-customer')) continue;
    const i = s.identity(n),
      c = s.claims(i);
    await s.actors.add(
      i,
      token(c),
      i.owner ? token({ ...c, aal: 'aal1' }) : undefined,
    );
  }
  await s.actors.verifyAll();
  expect(s.custody.register).toHaveBeenCalledTimes(15);
  await s.actors.closeAll();
  expect(
    s.calls.filter((c) => c.path === '/auth/v1/logout?scope=local'),
  ).toHaveLength(15);
});

it('independent custody tracks genuine pending AAL1 only for owners, and cannot treat it as executable AAL2', async () => {
  const s = setup(),
    i = s.identity(),
    c = s.claims(i);
  const low = token({ ...c, aal: 'aal1' });
  const pending = await verifyCleanupSession(
    s.p.frozen,
    'sb_publishable_fixture_only',
    i.alias,
    low,
    undefined,
    true,
    s.transport,
  );
  expect(pending).toMatchObject({
    uid: i.userId,
    owner: true,
    pending: true,
    sessionId: c.session_id,
  });
  await expect(
    verifyCleanupSession(
      s.p.frozen,
      'sb_publishable_fixture_only',
      i.alias,
      low,
      'existing-factor',
      false,
      s.transport,
    ),
  ).rejects.toThrow();
  const high = await verifyCleanupSession(
    s.p.frozen,
    'sb_publishable_fixture_only',
    i.alias,
    token(c),
    'existing-factor',
    false,
    s.transport,
  );
  expect(high).toMatchObject({
    owner: true,
    pending: false,
    sessionId: pending.sessionId,
  });
  const staff = s.identity(1);
  await expect(
    verifyCleanupSession(
      s.p.frozen,
      'sb_publishable_fixture_only',
      staff.alias,
      token(s.claims(staff)),
      undefined,
      true,
      s.transport,
    ),
  ).rejects.toThrow();
});
