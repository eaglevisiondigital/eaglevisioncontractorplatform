import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTestDatabase, type TestDatabase } from './engine';

// Isolated SQL contract fixtures only. NEVER execute these Auth mocks on Supabase.
const uid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const factor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const email = 'platform-operator-synthetic@example.test';
const sql = (name: string) =>
  readFileSync(`docs/operations/platform-admin-c1-${name}.sql`, 'utf8')
    .replaceAll('__OPERATOR_UID__', uid)
    .replaceAll('__OPERATOR_EMAIL__', email);
let db: TestDatabase;
beforeEach(async () => {
  db = createTestDatabase();
  await db.exec(`
    create schema auth; create schema private;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean);
    create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text);
    create table auth.sessions(id uuid primary key,user_id uuid,factor_id uuid,aal text,created_at timestamptz,not_after timestamptz);
    create table private.platform_admins(user_id uuid primary key,active boolean not null default true);
    create table public.memberships(user_id uuid,organization_id uuid);
    create table public.organizations(id uuid primary key);
    create table private.release_test_users(user_id uuid);
    create table private.material_worker_grants(user_id uuid);
    insert into auth.users values('${uid}','${email}',now(),false);
    insert into auth.users select md5(i::text)::uuid,'synthetic-'||i||'@example.test',now(),false from generate_series(1,21) i;
    insert into auth.mfa_factors values('${factor}','${uid}','totp','verified');
    insert into auth.mfa_factors select md5(('factor'||i)::text)::uuid,md5(i::text)::uuid,'totp','verified' from generate_series(1,3) i;
    insert into auth.sessions values('${other}','${uid}','${factor}','aal2',now(),null);
  `);
});
afterEach(async () => {
  await db.close();
});
async function denied(change: string) {
  await db.exec(change);
  await expect(db.exec(sql('grant'))).rejects.toThrow(/C1/);
  await db.exec('rollback');
}
describe('review-only C1 SQL', () => {
  it('adds exactly one authorization and no tenant membership; no automatic expiry is claimed', async () => {
    await db.exec(sql('grant'));
    expect(
      (await db.query('select * from private.platform_admins')).rows,
    ).toEqual([{ user_id: uid, active: true }]);
    expect(
      (await db.query('select count(*)::int as n from public.memberships'))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await db.query('select count(*)::int as n from auth.users')).rows[0].n,
    ).toBe(22);
    expect(
      (await db.query('select count(*)::int as n from auth.mfa_factors'))
        .rows[0].n,
    ).toBe(4);
  });
  it.each([
    ['missing session', 'delete from auth.sessions'],
    ['AAL1', "update auth.sessions set aal='aal1'"],
    [
      'stale session',
      "update auth.sessions set created_at=now()-interval '6 minutes'",
    ],
    [
      'expired session',
      "update auth.sessions set not_after=now()-interval '1 second'",
    ],
    [
      'future session',
      "update auth.sessions set created_at=now()+interval '1 minute'",
    ],
    ['wrong factor', `update auth.sessions set factor_id='${other}'`],
    [
      'multiple sessions',
      `insert into auth.sessions select '${factor}',user_id,factor_id,aal,created_at,not_after from auth.sessions`,
    ],
    [
      'unconfirmed identity',
      `update auth.users set email_confirmed_at=null where id='${uid}'`,
    ],
    [
      'anonymous identity',
      `update auth.users set is_anonymous=true where id='${uid}'`,
    ],
    [
      'wrong email',
      `update auth.users set email='unexpected@example.test' where id='${uid}'`,
    ],
    [
      'factor reset',
      `update auth.mfa_factors set status='unverified' where user_id='${uid}'`,
    ],
    [
      'existing inactive row',
      `insert into private.platform_admins values('${uid}',false)`,
    ],
    [
      'other active grant',
      `insert into private.platform_admins values('${other}',true)`,
    ],
    [
      'tenant membership',
      `insert into public.memberships values('${uid}','${other}')`,
    ],
    [
      'organization drift',
      `insert into public.organizations values('${other}')`,
    ],
    [
      'release grant',
      `insert into private.release_test_users values('${other}')`,
    ],
    [
      'worker grant',
      `insert into private.material_worker_grants values('${other}')`,
    ],
  ])('fails closed on %s', async (_label, change) => {
    await denied(change);
  });
  it('refuses duplicate execution rather than upserting', async () => {
    await db.exec(sql('grant'));
    await expect(db.exec(sql('grant'))).rejects.toThrow(/C1 grant or tenant/);
    await db.exec('rollback');
    expect(
      (await db.query('select count(*)::int as n from private.platform_admins'))
        .rows[0].n,
    ).toBe(1);
  });
  it('revokes only the exact operator, retaining other rows and tolerating unrelated drift', async () => {
    await db.exec(sql('grant'));
    await db.exec(
      `insert into private.platform_admins values('${other}',true); insert into public.memberships values('${other}','${factor}')`,
    );
    await db.exec(sql('revoke'));
    expect(
      (await db.query('select * from private.platform_admins order by user_id'))
        .rows,
    ).toEqual([
      { user_id: uid, active: false },
      { user_id: other, active: true },
    ]);
    await db.exec(sql('revoke'));
    expect(
      (await db.query('select count(*)::int as n from auth.sessions')).rows[0]
        .n,
    ).toBe(1);
    expect(
      (await db.query('select count(*)::int as n from auth.mfa_factors'))
        .rows[0].n,
    ).toBe(4);
  });
  it('safely reports an absent row without granting or deleting anything', async () => {
    await db.exec(sql('revoke'));
    expect(
      (await db.query('select count(*)::int as n from private.platform_admins'))
        .rows[0].n,
    ).toBe(0);
  });
});
