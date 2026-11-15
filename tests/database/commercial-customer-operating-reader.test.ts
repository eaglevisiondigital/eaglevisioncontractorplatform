import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateVersion } from '../../src/domain/estimating/types';
import { customerPreview } from '../../src/domain/estimating/customer-preview';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import type { CommercialDraft } from '../../server/invoices/commercial-draft-client';
import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
const native =
  !!process.env.EV_TEST_PG_SOCKET ||
  (process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true');
const db = createTestDatabase();
let authDb: TestDatabase;
let fixtureAdmin = 'postgres';
const roleTag = randomUUID().replaceAll('-', '').slice(0, 12);
const ownerRole = `ccyear_${roleTag}_owner`,
  draftRole = `ccyear_${roleTag}_draft`,
  issueRole = `ccyear_${roleTag}_issue`;
const companies = Array.from({ length: 2 }, () => ({
  org: randomUUID(),
  actor: randomUUID(),
  session: randomUUID(),
  customer: randomUUID(),
  location: randomUUID(),
  tax: randomUUID(),
  user: randomUUID(),
  customerSession: randomUUID(),
  version: '',
  estimate: '',
}));
let draft: CommercialDraft, command: string;
function fixtureRoles(sql: string) {
  return sql
    .replaceAll('propel_commercial_draft_owner', ownerRole)
    .replaceAll('propel_commercial_draft_runtime', draftRole)
    .replaceAll('propel_commercial_issue_runtime', issueRole);
}
async function login(c = companies[0]) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: c.actor,
      session_id: c.session,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await db.exec('set role ' + issueRole);
}
async function admin(sql: string, p: unknown[] = []) {
  await db.exec('reset role');
  const r = await db.query(sql, p);
  await login();
  return r;
}
beforeAll(async () => {
  if (!native) return;
  fixtureAdmin = String((await db.query('select current_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(fixtureAdmin)) throw Error('Unsafe fixture admin');
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  const guarded = readFileSync(
    'server/invoices/commercial-drafts.proposed.sql',
    'utf8',
  );
  expect(createHash('sha256').update(guarded).digest('hex')).toBe(
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  );
  await db.exec(fixtureRoles(guarded));
  await db.exec(
    fixtureRoles(
      readFileSync(
        'proposals/commercial-invoice-issuance/issuance.proposed.sql',
        'utf8',
      ),
    ),
  );
  await db.exec(
    fixtureRoles(
      readFileSync(
        'proposals/commercial-invoice-numbering/numbering.proposed.sql',
        'utf8',
      ),
    ),
  );
  await db.exec(
    fixtureRoles(
      readFileSync(
        'proposals/commercial-invoice-year-numbering/numbering.proposed.sql',
        'utf8',
      ),
    ),
  );
  for (const c of companies) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [c.user, c.user + '@example.test'],
    );
    await db.query(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 hour')",
      [c.customerSession, c.user],
    );
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [c.actor, c.actor + '@example.test'],
    );
    await db.query(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 hour')",
      [c.session, c.actor],
    );
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL ISSUANCE LAB',$2,'construction','active')",
      [c.org, 'issue-' + c.org],
    );
    await db.query(
      "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
      [c.org, c.actor],
    );
    await db.query(
      "update public.company_modules set enabled=true where organization_id=$1 and module='estimates'",
      [c.org],
    );
    await db.query(
      "insert into public.customers(id,organization_id,display_name) values($1,$2,'FICTIONAL CUSTOMER')",
      [c.customer, c.org],
    );
    await db.query(
      "insert into public.service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Fictional','Fixture','ZZ','00000','US')",
      [c.location, c.org, c.customer],
    );
    await db.query(
      'insert into public.portal_identities(organization_id,customer_id,user_id) values($1,$2,$3)',
      [c.org, c.customer, c.user],
    );
    await db.query(
      "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Fixture','TEST','Fixture','Fixture',1000,'reviewed')",
      [c.tax, c.org],
    );
    await db.query(
      "insert into private.commercial_draft_authorities values($1,$2,clock_timestamp()+interval '1 hour',null,'DISPOSABLE ONLY')",
      [c.org, c.actor],
    );
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: c.actor, aal: 'aal2' }),
    ]);
    await db.exec('set role authenticated');
    const payload = blankEstimate(c.customer);
    payload.location_id = c.location;
    payload.tax_policy_id = c.tax;
    payload.expires_on = '2099-12-31';
    payload.internal_notes = 'PRIVATE SOURCE SECRET';
    payload.lines[0] = {
      ...payload.lines[0],
      description: 'Fictional scope',
      quantity_milli: 1000,
      unit_price_minor: 1000,
      unit_cost_minor: 500,
      taxable: true,
    };
    const b = (
      await db.query<{ v: EstimateBundle }>(
        'select public.create_estimate($1,$2,$3) v',
        [c.org, payload, randomUUID()],
      )
    ).rows[0].v;
    const issued = (
      await db.query<{ v: EstimateBundle }>(
        'select public.issue_estimate($1,$2,$3,$4) v',
        [c.org, b.estimate.id, b.version.id, b.version.lock_revision],
      )
    ).rows[0].v;
    c.version = issued.version.id;
    c.estimate = issued.estimate.id;
    await db.exec('reset role');
  }
  authDb = await db.fork!();
});
beforeEach(async () => {
  if (!native) return;
  await db.exec('rollback; reset role');
  await db.exec(
    'truncate private.commercial_issue_authorities,private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts cascade',
  );
  const c = companies[0];
  // Each test receives an independent immutable issued source. Permanent source
  // fences MUST NOT be reset to make unrelated test cases appear reusable.
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: c.actor, aal: 'aal2' }),
  ]);
  await db.exec('set role authenticated');
  const payload = blankEstimate(c.customer);
  payload.location_id = c.location;
  payload.tax_policy_id = c.tax;
  payload.expires_on = '2099-12-31';
  payload.lines[0] = {
    ...payload.lines[0],
    description: 'Independent fictional source',
    quantity_milli: 1000,
    unit_price_minor: 1000,
    unit_cost_minor: 500,
    taxable: true,
  };
  const created = (
    await db.query<{ v: EstimateBundle }>(
      'select public.create_estimate($1,$2,$3) v',
      [c.org, payload, randomUUID()],
    )
  ).rows[0].v;
  const issued = (
    await db.query<{ v: EstimateBundle }>(
      'select public.issue_estimate($1,$2,$3,$4) v',
      [
        c.org,
        created.estimate.id,
        created.version.id,
        created.version.lock_revision,
      ],
    )
  ).rows[0].v;
  c.version = issued.version.id;
  c.estimate = issued.estimate.id;
  await db.exec('reset role');

  await db.query(
    "update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",
    [c.session],
  );
  await db.query(
    'update public.memberships set active=true where organization_id=$1 and user_id=$2',
    [c.org, c.actor],
  );
  await db.query(
    'update private.commercial_draft_authorities set revoked_at=null where organization_id=$1 and actor_id=$2',
    [c.org, c.actor],
  );
  await db.query(
    "update public.estimates set status='issued',current_version_id=$1 where id=$2",
    [c.version, c.estimate],
  );
  await db.query(
    "update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",
    [c.customerSession],
  );
  await db.query(
    'update public.portal_identities set active=true where user_id=$1',
    [c.user],
  );
  await login();
  await db.exec('set role ' + draftRole);
  draft = (
    await db.query<{ result: CommercialDraft }>(
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,$5,$6,$7,$8) result',
      [
        c.org,
        randomUUID(),
        randomUUID(),
        c.customer,
        c.location,
        c.version,
        'Fictional invoice <safe>',
        'PRIVATE STAFF MEMO',
      ],
    )
  ).rows[0].result;
  command = randomUUID();
  await admin(
    "insert into private.commercial_issue_authorities values($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour',null,'DISPOSABLE ISSUANCE REVIEW','FICTA')",
    [c.org, draft.invoiceId, c.actor, draft.revision, draft.sourceHash],
  );
  await db.query(
    'select private.commercial_invoice_issue($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      c.org,
      draft.invoiceId,
      command,
      draft.revision,
      c.customer,
      c.location,
      c.version,
      draft.sourceHash,
    ],
  );
});

import { Client } from 'pg';
import { afterEach } from 'vitest';
import { operatingCustomerInvoiceRead } from '../../proposals/commercial-customer-operating-reader/reader';
import {
  renderReaderSQL,
  type ReaderScope,
} from '../../proposals/commercial-customer-operating-reader/binding';
import type { InvoiceConnectionScope } from '../../server/invoices/commercial-caller-connection';
import type { GatewaySql } from '../../server/payments/postgres-store';
const folder = 'proposals/commercial-customer-operating-reader/';
const readerRole = 'operating_read_' + roleTag;
const sockets: Client[] = [];
let binding: ReaderScope;
let initialOwnerDenied = false;
let originalPolicyFlags: unknown;
const test = it.skipIf(!native);
beforeAll(async () => {
  if (!native) return;
  await db.exec('reset role');
  originalPolicyFlags = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid='public.portal_identities'::regclass",
    )
  ).rows;
  try {
    await db.exec('set role ' + ownerRole);
    await db.query('select active from public.portal_identities');
  } catch (e) {
    initialOwnerDenied = (e as { code?: string }).code === '42501';
  } finally {
    await db.exec('reset role');
  }
  await db.exec(
    `create role ${readerRole} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-ci-only'`,
  );
});
beforeEach(async () => {
  if (!native) return;
  await db.exec('reset role');
  await db.query(
    "update public.organizations set status='active' where id=$1",
    [companies[0].org],
  );
  await db.query(
    'update auth.users set deleted_at=null,banned_until=null,is_anonymous=false where id=$1',
    [companies[0].user],
  );
  await db.query(
    "update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",
    [companies[0].customerSession],
  );
  await db.exec(
    `revoke ${ownerRole} from ${readerRole};revoke all on schema private from public;drop function if exists public.commercial_customer_invoice_authorize(uuid);drop function if exists private.commercial_customer_invoice_read_issued();drop function if exists private.commercial_customer_invoice_authorize();drop policy if exists commercial_customer_identity_read on public.portal_identities;`,
  );
  const c = companies[0];
  binding = {
    login: readerRole,
    owner: ownerRole,
    userId: c.user,
    sessionId: c.customerSession,
    organizationId: c.org,
    customerId: c.customer,
    locationId: c.location,
    invoiceId: draft.invoiceId,
    sourceVersionId: c.version,
    sourceHash: draft.sourceHash,
    revision: draft.revision,
    issuanceReceiptId: command,
    reviewId: randomUUID(),
    expiresAt: Date.now() + 120000,
  };
  const rendered = renderReaderSQL(
    readFileSync(folder + 'read.proposed.sql.in', 'utf8'),
    readFileSync(folder + 'runtime-grants.sql.in', 'utf8'),
    binding,
  );
  await db.exec(rendered.sql);
  await db.exec(rendered.runtimeGrants);
});
afterEach(async () => {
  while (sockets.length) await sockets.pop()!.end();
  if (native) {
    await db.exec('reset role');
    await db.query('delete from public.memberships where user_id=$1', [
      companies[0].user,
    ]);
    await db.query('delete from private.platform_admins where user_id=$1', [
      companies[0].user,
    ]);
    await db.query(
      "update public.organizations set status='active' where id=$1",
      [companies[0].org],
    );
  }
});
afterAll(async () => {
  if (native) {
    await authDb.close();
    await db.exec('reset role');
    await db.exec(`drop owned by ${readerRole};drop role ${readerRole}`);
    for (const role of [ownerRole, draftRole, issueRole])
      await db.exec(
        `reassign owned by ${role} to ${fixtureAdmin};drop owned by ${role};drop role ${role}`,
      );
  }
  await db.close();
});
async function client() {
  const socket = process.env.EV_TEST_PG_SOCKET;
  const database = String(
    (await db.query('select current_database() d')).rows[0].d,
  );
  if (!/^ev_test_[a-f0-9]{32}$/.test(database)) throw Error('Disposable only');
  const c = new Client({
    host: socket ?? '127.0.0.1',
    port: socket ? 55477 : 5432,
    user: readerRole,
    password: socket ? undefined : 'synthetic-ci-only',
    database,
  });
  await c.connect();
  sockets.push(c);
  return c;
}
async function setup() {
  const c = companies[0],
    raw = await client();
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: c.user,
    session_id: c.customerSession,
    aal: 'aal2',
    exp: now + 3600,
    iat: now,
    iss: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
  };
  await raw.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(claims),
  ]);
  const bearer =
    Buffer.from('{}').toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.controlled_native_fixture';
  const auth = new CustomerBrokerAuth(
    {
      url: 'https://abcdefghijklmnopqrst.supabase.co',
      publishableKey: 'sb_publishable_controlled_only',
    },
    async (input, init) => {
      if (
        new Headers(init?.headers).get('authorization') !==
        'Bearer ' + bearer
      )
        throw Error('Exact fixture bearer');
      const active = Boolean(
        (
          await authDb.query<{ a: boolean }>(
            'select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2 and u.email_confirmed_at is not null and u.deleted_at is null and not u.is_anonymous and(u.banned_until is null or u.banned_until<=clock_timestamp()) and(s.not_after is null or s.not_after>clock_timestamp())) a',
            [c.user, c.customerSession],
          )
        ).rows[0].a,
      );
      const p = new URL(String(input)).pathname;
      if (p === '/auth/v1/user')
        return active
          ? Response.json({ id: c.user })
          : Response.json({ error: 'revoked' }, { status: 401 });
      if (p === '/rest/v1/rpc/customer_session_status')
        return Response.json({
          user_id: c.user,
          session_id: c.customerSession,
          active,
        });
      throw Error('No real Auth path');
    },
  );
  const backend = (
    await raw.query<InvoiceConnectionScope>(
      'select current_database() database,pg_backend_pid() pid,backend_start::text,session_user::text login,current_user::text current_role from pg_stat_activity where pid=pg_backend_pid()',
    )
  ).rows[0];
  const hooks = { afterRead: async () => {} };
  const calls: string[] = [];
  const sql: GatewaySql = {
    async query<T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) {
      calls.push(text);
      const v = await raw.query<T>(text, params);
      if (
        text ===
        'select private.commercial_customer_invoice_read_issued() result'
      )
        await hooks.afterRead();
      return { rows: v.rows };
    },
  };
  const v = (
    await db.query<{ v: EstimateVersion }>(
      'select to_jsonb(v) v from public.estimate_versions v where id=$1',
      [c.version],
    )
  ).rows[0].v;
  const pv = customerPreview(v),
    l = pv.location!;
  const viewer = {
    invoice: {
      organizationId: c.org,
      customerId: c.customer,
      locationId: c.location,
      invoiceId: draft.invoiceId,
      sourceVersionId: c.version,
      revision: draft.revision,
    },
    companyName: pv.company.name,
    customerName: pv.customer.display_name,
    primaryColor: pv.company.primary_color,
    propertyLabel: [
      l.address_line1,
      l.city,
      l.region + ' ' + l.postal_code,
    ].join(', '),
  };
  const make = () =>
    operatingCustomerInvoiceRead(auth, bearer, sql, backend, binding, {
      enabled: true,
      mode: 'disposable-proposal',
    });
  return {
    c,
    raw,
    auth,
    sql,
    backend,
    hooks,
    calls,
    viewer,
    make,
    load: make(),
  };
}
const sig = () => new AbortController().signal;
test('owner portal read was42501 before the explicit proposed owner ACL/policy', () => {
  expect(initialOwnerDenied).toBe(true);
});
test('restricted actual LOGIN returns original yearly receipt and canonical safe display, no write/PII leaks', async () => {
  const f = await setup();
  const r = await f.load(f.viewer, sig());
  expect(r.invoice.number).toMatch(/^INV-\d{4}-\d{6}$/);
  expect(r.invoice.issuanceReceiptId).toBe(command);
  expect(r.invoice.amountMinor).toBe(1100);
  expect(r.payment.status).toBe('UNKNOWN');
  expect(r.link.href).toBeNull();
  expect(JSON.stringify(r)).not.toMatch(
    /PRIVATE|sourceHash|requestHash|actorId|sessionId|unit_cost|memo/,
  );
  expect(f.calls.every((s) => s.startsWith('select '))).toBe(true);
});
test('owner-only policy and exactfour columnACLs preserve original RLS flags', async () => {
  expect(
    (
      await db.query(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid='public.portal_identities'::regclass",
      )
    ).rows,
  ).toEqual(originalPolicyFlags);
  const a = await db.query<{ attname: string }>(
    "select a.attname from pg_attribute a cross join lateral aclexplode(a.attacl) x where a.attrelid='public.portal_identities'::regclass and x.grantee=$1::regrole and x.privilege_type='SELECT' and not x.is_grantable order by a.attname",
    [ownerRole],
  );
  expect(a.rows.map((x) => x.attname)).toEqual([
    'active',
    'customer_id',
    'organization_id',
    'user_id',
  ]);
});
test('runtime has no raw invoice/customer/auth/table read or DML, no issue/grant execution', async () => {
  const f = await setup();
  for (const q of [
    'select * from private.commercial_invoice_drafts',
    'select * from public.portal_identities',
    'select * from auth.users',
    "update private.commercial_invoice_drafts set currency='EUR'",
    'set role ' + ownerRole,
  ])
    await expect(f.raw.query(q)).rejects.toMatchObject({ code: '42501' });
  expect(
    (
      await db.query(
        "select has_function_privilege($1,'private.commercial_invoice_issue(uuid,uuid,uuid,integer,uuid,uuid,uuid,text)','EXECUTE') a",
        [readerRole],
      )
    ).rows[0].a,
  ).toBe(false);
});
test('foreign customer/tenant publictarget and private expected scope cannot select another authority', async () => {
  const f = await setup();
  await expect(
    f.load(
      {
        ...f.viewer,
        invoice: { ...f.viewer.invoice, customerId: companies[1].customer },
      },
      sig(),
    ),
  ).rejects.toThrow('UNKNOWN');
  const bad = operatingCustomerInvoiceRead(
    f.auth,
    'bad',
    f.sql,
    f.backend,
    { ...binding, customerId: companies[1].customer },
    { enabled: true, mode: 'disposable-proposal' },
  );
  await expect(bad(f.viewer, sig())).rejects.toThrow('UNKNOWN');
});
test('current session revocation after SQL result suppresses response', async () => {
  const f = await setup();
  f.hooks.afterRead = async () => {
    await authDb.query(
      'update auth.sessions set not_after=clock_timestamp() where id=$1',
      [f.c.customerSession],
    );
  };
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
});
test('portal revocation after result suppresses response and same connection cannot reopen', async () => {
  const f = await setup();
  f.hooks.afterRead = async () => {
    await authDb.query(
      'update public.portal_identities set active=false where user_id=$1',
      [f.c.user],
    );
  };
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
  await authDb.query(
    'update public.portal_identities set active=true where user_id=$1',
    [f.c.user],
  );
  f.hooks.afterRead = async () => {};
  const n = f.calls.length;
  await expect(f.make()(f.viewer, sig())).rejects.toThrow('UNKNOWN');
  expect(f.calls.length).toBe(n);
});
test('post-read privilege revocation suppresses output', async () => {
  const f = await setup();
  f.hooks.afterRead = async () => {
    await authDb.exec(
      `revoke execute on function private.commercial_customer_invoice_read_issued() from ${readerRole}`,
    );
  };
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
});
test('PUBLIC fallback is denied even when SQL function remains callable', async () => {
  const f = await setup();
  await db.exec(
    `revoke execute on function private.commercial_customer_invoice_read_issued() from ${readerRole};grant execute on function private.commercial_customer_invoice_read_issued() to public`,
  );
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
});
test('other reachable definer with colliding name is not mistaken for permitted privatezeroarg function', async () => {
  const f = await setup();
  await db.exec(
    `create function public.commercial_customer_invoice_authorize(uuid) returns integer language sql security definer as 'select 1';grant execute on function public.commercial_customer_invoice_authorize(uuid) to ${readerRole}`,
  );
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
});
test('role membership/SETROLE path denies before private data', async () => {
  const f = await setup();
  await db.exec(`grant ${ownerRole} to ${readerRole}`);
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
});
test('changed installed function body cannot be admitted by caller hashes', async () => {
  const f = await setup();
  await db.exec(
    "create or replace function private.commercial_customer_invoice_read_issued() returns jsonb language plpgsql volatile security definer set search_path='' as $$begin return '{}'::jsonb;end$$",
  );
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
  expect(
    f.calls.includes(
      'select private.commercial_customer_invoice_read_issued() result',
    ),
  ).toBe(false);
});
test('repeatable-read retained snapshot is denied', async () => {
  const f = await setup();
  await f.raw.query('begin isolation level repeatable read');
  try {
    await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
  } finally {
    await f.raw.query('rollback');
  }
});
test('read/cancel/lostack paths preserve original header and immutable receipt counts', async () => {
  const f = await setup();
  const snapshot = async () =>
    (
      await db.query(
        'select md5(row_to_json(h)::text) h,(select count(*)::int from private.commercial_invoice_draft_receipts r where r.invoice_id=h.id) n from private.commercial_invoice_drafts h where h.id=$1',
        [draft.invoiceId],
      )
    ).rows;
  const before = await snapshot();
  const a = new AbortController();
  f.hooks.afterRead = async () => a.abort();
  await expect(f.load(f.viewer, a.signal)).rejects.toThrow('UNKNOWN');
  expect(await snapshot()).toEqual(before);
});
test('raw dedicated LOGIN/GUC is a trusted SQL capability, not signed customerAuth proof', async () => {
  const f = await setup();
  const row = await f.raw.query(
    'select private.commercial_customer_invoice_authorize() result',
  );
  expect(row.rows[0].result.userId).toBe(
    f.c.user,
  ); /* Intentionallycharacterizes trustedserverLOGIN/GUC boundary. SDKproof stillmandatory inadapter. */
});

test('table-level owner SELECT is not the reviewed four-column ACL', async () => {
  const f = await setup();
  await db.exec(`grant select on public.portal_identities to ${ownerRole}`);
  try {
    await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
  } finally {
    await db.exec(
      `revoke select on public.portal_identities from ${ownerRole}`,
    );
  }
});
test('an original source withdrawn after data cannot be shown from a stale receipt', async () => {
  const f = await setup();
  f.hooks.afterRead = async () => {
    await authDb.query(
      "update public.estimates set status='draft' where id=$1",
      [f.c.estimate],
    );
  };
  await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
});

test.each(['organization', 'source'])(
  'actual observed header wait rechecks withdrawn %s before mapping',
  async (kind) => {
    const f = await setup(),
      blocker = await db.fork!();
    let pending: Promise<{ ok: boolean; code?: string }> | undefined;
    try {
      await blocker.exec(
        'begin;lock table private.commercial_invoice_drafts in access exclusive mode',
      );
      pending = f.raw
        .query('select private.commercial_customer_invoice_authorize() result')
        .then(
          () => ({ ok: true }),
          (e: unknown) => ({ ok: false, code: (e as { code?: string }).code }),
        );
      let observed = false;
      for (let i = 0; i < 200; i++) {
        const r = await authDb.query<{ w: string }>(
          'select wait_event_type w from pg_stat_activity where pid=$1',
          [f.backend.pid],
        );
        if (r.rows[0]?.w === 'Lock') {
          observed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(observed).toBe(true);
      if (kind === 'organization')
        await authDb.query(
          "update public.organizations set status='suspended' where id=$1",
          [f.c.org],
        );
      else
        await authDb.query(
          "update public.estimates set status='draft' where id=$1",
          [f.c.estimate],
        );
      await blocker.exec('rollback');
      expect(await pending).toEqual({ ok: false, code: '42501' });
    } finally {
      await blocker.exec('rollback');
      await pending;
      await blocker.close();
    }
  },
);

test.each(['staff', 'platform'])(
  'fixed invoice grant does not override initial %s identity exclusion',
  async (kind) => {
    const f = await setup();
    if (kind === 'staff')
      await authDb.query(
        "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
        [companies[1].org, f.c.user],
      );
    else
      await authDb.query(
        'insert into private.platform_admins(user_id) values($1)',
        [f.c.user],
      );
    await expect(f.load(f.viewer, sig())).rejects.toThrow('UNKNOWN');
  },
);
test.each(['staff', 'platform'])(
  'observed source wait rechecks late %s activation',
  async (kind) => {
    const f = await setup(),
      blocker = await db.fork!();
    let pending: Promise<{ ok: boolean; code?: string }> | undefined;
    try {
      await blocker.exec(
        'begin;lock table private.commercial_invoice_drafts in access exclusive mode',
      );
      pending = f.raw
        .query('select private.commercial_customer_invoice_authorize() result')
        .then(
          () => ({ ok: true }),
          (e: unknown) => ({ ok: false, code: (e as { code?: string }).code }),
        );
      let observed = false;
      for (let i = 0; i < 200; i++) {
        const r = await authDb.query<{ w: string }>(
          'select wait_event_type w from pg_stat_activity where pid=$1',
          [f.backend.pid],
        );
        if (r.rows[0]?.w === 'Lock') {
          observed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(observed).toBe(true);
      if (kind === 'staff')
        await authDb.query(
          "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
          [companies[1].org, f.c.user],
        );
      else
        await authDb.query(
          'insert into private.platform_admins(user_id) values($1)',
          [f.c.user],
        );
      await blocker.exec('rollback');
      expect(await pending).toEqual({ ok: false, code: '42501' });
    } finally {
      await blocker.exec('rollback');
      await pending;
      await blocker.close();
    }
  },
);
