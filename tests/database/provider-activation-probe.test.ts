import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { createTestDatabase } from './engine';
import { compileWorkloadProbe } from '../../server/providers/activation-plan';
const db = createTestDatabase();
const organizationId = crypto.randomUUID(),
  scopeId = crypto.randomUUID(),
  capabilityId = crypto.randomUUID();
const role =
  'propel_provider_anet_probe_' +
  crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const proposal = compileWorkloadProbe({
  organizationId,
  scopeId,
  capabilityId,
  role,
  ttlSeconds: 900,
});
let operator = '';
beforeAll(async () => {
  operator = String((await db.query('select session_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(operator))
    throw new Error('Unsafe local test operator');
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  await db.query(
    "insert into public.organizations(id,name,slug,industry,status) values($1,'LOCAL PROBE ONLY',$2,'construction','active')",
    [organizationId, 'probe-' + organizationId],
  );
});
beforeEach(async () => {
  await db.exec(proposal.grant);
});
afterEach(async () => {
  await db.exec(`set session authorization ${operator}; reset role`);
  await db.exec(proposal.revoke);
  // Disposable local fixture cleanup only; never part of hosted containment.
  await db.exec(`truncate private.provider_workloads;drop role ${role}`);
});
afterAll(async () => {
  await db.close();
});
it('exact compiled preparation leaves a NOLOGIN role and one 15-minute capability', async () => {
  const { rows } = await db.query<{
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolinherit: boolean;
    rolbypassrls: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolreplication: boolean;
    rolconnlimit: number;
  }>(
    `select rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolconnlimit from pg_roles where rolname=$1`,
    [role],
  );
  expect(rows[0]).toEqual({
    rolcanlogin: false,
    rolsuper: false,
    rolinherit: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolconnlimit: 1,
  });
  expect(
    (
      await db.query(
        'select extract(epoch from expires_at-created_at)::int seconds from private.provider_workloads',
      )
    ).rows[0].seconds,
  ).toBe(900);
  expect(
    (
      await db.query(
        'select count(*)::int n from private.merchant_configurations',
      )
    ).rows[0].n,
  ).toBe(0);
});
it('NOLOGIN preparation cannot exercise the guard', async () => {
  await db.exec(`set session authorization ${role}`);
  await expect(
    db.query('select private.require_provider_workload($1,$2,$3)', [
      organizationId,
      scopeId,
      'payment',
    ]),
  ).rejects.toThrow(/denied/);
});
it('only separately enabled local fixture login can prove current exact scope', async () => {
  // SQL harness identity simulation, not genuine hosted password authentication.
  await db.exec(`alter role ${role} login; set session authorization ${role}`);
  expect(
    (
      await db.query('select private.require_provider_workload($1,$2,$3) id', [
        organizationId,
        scopeId,
        'payment',
      ])
    ).rows[0].id,
  ).toBe(capabilityId);
  for (const [org, scope, service] of [
    [crypto.randomUUID(), scopeId, 'payment'],
    [organizationId, crypto.randomUUID(), 'payment'],
    [organizationId, scopeId, 'email'],
  ])
    await expect(
      db.query('select private.require_provider_workload($1,$2,$3)', [
        org,
        scope,
        service,
      ]),
    ).rejects.toThrow(/denied/);
});
it('diagnostic role has no payment/email/agreement commands or private table access', async () => {
  await db.exec(`alter role ${role} login; set session authorization ${role}`);
  for (const f of [
    'sandbox_gateway_control',
    'provider_email_control',
    'provider_agreement_control',
  ])
    await expect(
      db.query(`select private.${f}($1,$2,'load','{}')`, [
        organizationId,
        scopeId,
      ]),
    ).rejects.toThrow(/permission/);
  await expect(
    db.query('select * from private.provider_workloads'),
  ).rejects.toThrow(/permission/);
  await expect(
    db.query(
      'insert into private.sandbox_gateway_authorizations default values',
    ),
  ).rejects.toThrow(/permission/);
});
it('containment removes access, clears credentials and revokes exact lease without deletion', async () => {
  await db.exec(proposal.revoke);
  expect(
    (
      await db.query(
        'select count(*)::int n from private.provider_workloads where revoked_at is not null',
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query('select rolcanlogin from pg_roles where rolname=$1', [
        role,
      ])
    ).rows[0].rolcanlogin,
  ).toBe(false);
  expect(
    (
      await db.query(
        "select has_schema_privilege($1,'private','USAGE') allowed",
        [role],
      )
    ).rows[0].allowed,
  ).toBe(false);
  expect(
    (
      await db.query(
        "select has_function_privilege($1,'private.require_provider_workload(uuid,uuid,text)','EXECUTE') allowed",
        [role],
      )
    ).rows[0].allowed,
  ).toBe(false);
  // Repeated containment is idempotent; the revoked evidence row stays intact.
  await db.exec(proposal.revoke);
});
it('SET ROLE from operator is not the real diagnostic identity', async () => {
  await db.exec(`alter role ${role} login; set role ${role}`);
  await expect(
    db.query('select private.require_provider_workload($1,$2,$3)', [
      organizationId,
      scopeId,
      'payment',
    ]),
  ).rejects.toThrow(/denied/);
});
