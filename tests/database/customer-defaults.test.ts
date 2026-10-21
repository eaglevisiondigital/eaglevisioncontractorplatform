import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, it, expect } from 'vitest';
import { createTestDatabase } from './engine';
const db = createTestDatabase();
let previous: { name: string; definition: string; acl: string | null }[] = [];
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  const files = readdirSync('supabase/migrations').sort();
  for (const f of files.slice(0, 13))
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  previous = (
    await db.query<{ name: string; definition: string; acl: string | null }>(
      "select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'",
    )
  ).rows;
  await db.exec(readFileSync('supabase/migrations/' + files[13], 'utf8'));
}, 30000);
afterAll(() => db.close());
it('formal migration installs empty/RLS/default-deny and cannot activate new customer workflows', async () => {
  expect(
    (
      await db.query<{ v: unknown }>(
        'select private.customer_runtime_status() v',
      )
    ).rows[0].v,
  ).toEqual({
    reads: false,
    publishing: false,
    decisions: false,
    login: false,
  });
  for (const table of [
    'customer_estimate_access',
    'customer_review_decisions',
  ]) {
    expect(
      (await db.query(`select count(*) n from private.${table}`)).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query(
          'select relrowsecurity from pg_class where oid=$1::regclass',
          ['private.' + table],
        )
      ).rows[0].relrowsecurity,
    ).toBe(true);
    for (const role of ['anon', 'authenticated', 'service_role'])
      expect(
        (
          await db.query(
            "select has_table_privilege($1,$2,'select,insert,update,delete') ok",
            [role, 'private.' + table],
          )
        ).rows[0].ok,
      ).toBe(false);
  }
  expect(
    (
      await db.query(
        "select * from pg_policies where schemaname='private' and tablename like 'customer_%'",
      )
    ).rows,
  ).toHaveLength(0);
  const functions = (
    await db.query<{ name: string }>(
      "select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname like 'customer_%'",
    )
  ).rows;
  for (const f of functions)
    for (const role of ['anon', 'authenticated', 'service_role'])
      expect(
        (
          await db.query("select has_function_privilege($1,$2,'execute') ok", [
            role,
            f.name,
          ])
        ).rows[0].ok,
      ).toBe(false);
  for (const cap of ['reads', 'publishing', 'decisions'])
    await expect(
      db.query('select private.customer_runtime_guard($1)', [cap]),
    ).rejects.toThrow('disabled');
});
it('only the documented legacy report implementation changes; every previous function ACL is preserved', async () => {
  const changed: string[] = [];
  for (const p of previous) {
    const now = (
      await db.query<{ definition: string; acl: string | null }>(
        'select pg_get_functiondef($1::regprocedure) definition,proacl::text acl from pg_proc where oid=$1::regprocedure',
        [p.name],
      )
    ).rows[0];
    expect(now.acl).toBe(p.acl);
    if (now.definition !== p.definition) changed.push(p.name);
  }
  expect(changed).toEqual([
    'private.property_published_reports(uuid,uuid,uuid,uuid)',
  ]);
  expect(
    (
      await db.query(
        "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef",
      )
    ).rows,
  ).toEqual([]);
});
it('session maintenance can verify only the signed caller session; closure leaves unrelated sessions intact', async () => {
  const users = [crypto.randomUUID(), crypto.randomUUID()],
    sessions = [crypto.randomUUID(), crypto.randomUUID()];
  for (let i = 0; i < 2; i++) {
    await db.query('insert into auth.users(id) values($1)', [users[i]]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      sessions[i],
      users[i],
    ]);
  }
  const claim = async (i: number, sid = sessions[i]) =>
    db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: users[i],
        session_id: sid,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aal: 'aal1',
      }),
    ]);
  await claim(0);
  expect(
    (
      await db.query<{ v: { active: boolean } }>(
        'select private.customer_session_status() v',
      )
    ).rows[0].v.active,
  ).toBe(true);
  await db.query('delete from auth.sessions where id=$1', [sessions[0]]);
  expect(
    (
      await db.query<{ v: { active: boolean } }>(
        'select private.customer_session_status() v',
      )
    ).rows[0].v.active,
  ).toBe(false);
  await claim(1);
  expect(
    (
      await db.query<{ v: { active: boolean } }>(
        'select private.customer_session_status() v',
      )
    ).rows[0].v.active,
  ).toBe(true);
  await claim(0, sessions[1]);
  expect(
    (
      await db.query<{ v: { active: boolean } }>(
        'select private.customer_session_status() v',
      )
    ).rows[0].v.active,
  ).toBe(false);
});
