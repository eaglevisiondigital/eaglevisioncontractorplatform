import { execFileSync } from 'node:child_process';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createTestDatabase } from './engine';
import { p1Evidence, p1Now } from '../helpers/property-p1-fixture';
import { prepareP1, featureSql } from '../../server/property/p1-readiness';

// Disposable Auth/control fixtures only. No hosted credentials or SQL mocks hosted.
const db = createTestDatabase();
const plan = prepareP1(p1Evidence(), 'p1-recovery-sql-fixture', p1Now);
const orgs = plan.companies.map((x) => x.organization_id);
const unrelated = crypto.randomUUID();
const user = crypto.randomUUID();
const pendingUser = crypto.randomUUID();
const session = crypto.randomUUID();
const factor = crypto.randomUUID();
const observe = execFileSync(
  'python3',
  [
    '-B',
    '-c',
    "import sys,json;sys.path.insert(0,'recovery/monterey');from p1_recovery import Capsule,Commands;c=Capsule('a'*20,tuple(json.loads(sys.stdin.read())),{},'', 'fixture');print(Commands(c).observe().body['query'])",
  ],
  { input: JSON.stringify(orgs), encoding: 'utf8' },
);
beforeAll(async () => {
  await db.exec(`create schema private;create schema auth;
    create table private.property_features(organization_id uuid primary key,enabled boolean not null);
    create table auth.sessions(id uuid primary key,user_id uuid not null);
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text);`);
  for (const id of [...orgs, unrelated])
    await db.query('insert into private.property_features values($1,true)', [
      id,
    ]);
  await db.query('insert into auth.users values($1,now()),($2,null)', [
    user,
    pendingUser,
  ]);
  await db.query('insert into auth.sessions values($1,$2)', [session, user]);
  await db.query(
    "insert into auth.mfa_factors values($1,$2,'totp','verified')",
    [factor, user],
  );
});
afterAll(() => db.close());
async function state() {
  return (
    await db.query<{
      state: {
        features: { organization_id: string; enabled: boolean }[];
        unrelated_features: string[];
        sessions: { id: string; user_id: string }[];
        identity_factor_digest: string;
      };
    }>(observe)
  ).rows[0].state;
}
it('executes the fixed recovery observation in PostgreSQL without reading Auth secrets', async () => {
  const s = await state();
  expect(s.features).toHaveLength(3);
  expect(s.unrelated_features).toHaveLength(1);
  expect(s.sessions).toEqual([{ id: session, user_id: user }]);
  expect(s.identity_factor_digest).toMatch(/^[a-f0-9]{64}$/);
  expect(observe).not.toMatch(
    /encrypted_password|secret|refresh_token|delete|update|grant/i,
  );
});
it('preserves unrelated controls and sessions when the unchanged cleanup template deactivates only approved tenants', async () => {
  const before = await state();
  await db.exec(featureSql(plan).cleanup);
  const after = await state();
  expect(after.features.every((x) => !x.enabled)).toBe(true);
  expect(after.unrelated_features).toEqual(before.unrelated_features);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.identity_factor_digest).toBe(before.identity_factor_digest);
});
it('includes unconfirmed users and existing factor status in the identity fingerprint', async () => {
  const before = await state();
  await db.query('update auth.users set id=$1 where id=$2', [
    crypto.randomUUID(),
    pendingUser,
  ]);
  const changed = await state();
  expect(changed.identity_factor_digest).not.toBe(
    before.identity_factor_digest,
  );
  await db.query(
    "update auth.mfa_factors set status='unverified' where id=$1",
    [factor],
  );
  expect((await state()).identity_factor_digest).not.toBe(
    changed.identity_factor_digest,
  );
});
