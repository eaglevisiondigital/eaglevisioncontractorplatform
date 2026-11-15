import { Client } from 'pg';
import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import {
  CommercialCallerConnection,
  type InvoiceConnectionScope,
} from '../../server/invoices/commercial-caller-connection';
import { restrictedPublicationRead } from '../../proposals/customer-publication-admission/read-only';
import { randomUUID } from 'node:crypto';
import type {
  SandboxMerchant,
  SandboxIntent,
  SandboxResult,
} from '../../server/payments/sandbox';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { ProviderControl } from '../../server/providers/control';
import { sha256 } from '../../server/providers/safety';
import { captureCustomerPaymentPublicationProposal } from '../../proposals/customer-payment-publication/qualification';

// Actual original writers, local synthetic principals. No provider port is used.
const db = createTestDatabase();
let owner = 'postgres';
const until = new Date(Date.now() + 29 * 60000).toISOString();
const companies = Array.from({ length: 2 }, () => ({
  org: randomUUID(),
  actor: randomUUID(),
  session: randomUUID(),
  customer: randomUUID(),
  location: randomUUID(),
  user: randomUUID(),
  customerSession: randomUUID(),
  tax: randomUUID(),
  version: '',
  invoice: '',
  hash: '',
  receipt: '',
  revision: 1,
}));
const merchants: SandboxMerchant[] = [0, 0, 1].map((index, merchantIndex) => ({
  organizationId: companies[index].org,
  merchantConfigId: randomUUID(),
  provider: merchantIndex === 1 ? 'authorize_net' : 'nmi',
  mode: 'sandbox',
  approvalReference: 'FICTIONAL SOURCE ONLY',
  approvedUntil: until,
}));
const roles = merchants.map(
  () => 'capacity_pay_' + randomUUID().replaceAll('-', ''),
);
const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
const fixtureRoleNames = [
  'cpp_owner_' + suffix,
  'cpp_draft_' + suffix,
  'cpp_issue_' + suffix,
  'cpp_capacity_' + suffix,
  'cpp_link_' + suffix,
  'cpp_publication_' + suffix,
];
function fixtureRoles(sql: string) {
  return sql
    .replaceAll('propel_commercial_draft_owner', fixtureRoleNames[0])
    .replaceAll('propel_commercial_draft_runtime', fixtureRoleNames[1])
    .replaceAll('propel_commercial_issue_runtime', fixtureRoleNames[2])
    .replaceAll('propel_commercial_payment_guard_owner', fixtureRoleNames[3])
    .replaceAll('propel_invoice_payment_reader_owner', fixtureRoleNames[4])
    .replaceAll('propel_customer_payment_owner', fixtureRoleNames[5]);
}
async function admin(c: TestDatabase = db) {
  await c.exec(`set session authorization ${owner};reset role`);
}
async function pay(index = 0, c: TestDatabase = db) {
  await c.exec('set session authorization ' + roles[index]);
  return new RestrictedSandboxStore(
    new ProviderControl(c, {
      organizationId: merchants[index].organizationId,
      scopeId: merchants[index].merchantConfigId,
      service: 'payment',
    }),
  );
}
function scenario(index = 0, amount = 4000) {
  const company = companies[index === 2 ? 1 : 0],
    merchant = merchants[index];
  const intent: SandboxIntent = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    invoiceId: company.invoice,
    authorizationId: randomUUID(),
    idempotencyKey: randomUUID(),
    amountMinor: amount,
    currency: 'USD',
    expiresAt: until,
  };
  return {
    company,
    merchant,
    intent,
    digest: sha256('FICTIONAL CAPACITY ' + intent.idempotencyKey),
    index,
  };
}
type Scenario = ReturnType<typeof scenario>;
async function authorize(s: Scenario, overrides: Record<string, unknown> = {}) {
  await admin();
  const row = {
    customer: s.company.customer,
    version: s.company.version,
    hash: s.company.hash,
    revision: s.company.revision,
    receipt: s.company.receipt,
    expiresAt: until,
    ...overrides,
  };
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at,invoice_source_version_id,invoice_source_hash,invoice_revision,invoice_issue_command_id) values($1,$2,$3,$4,$5,$13,$14,$6,'USD',$7,'FICTIONAL AUTHORIZATION NOT CUSTOMER CONSENT',$8,$9,$10,$11,$12)",
    [
      s.intent.organizationId,
      s.intent.authorizationId,
      s.intent.merchantConfigId,
      row.customer,
      s.intent.invoiceId,
      s.intent.amountMinor,
      s.digest,
      row.expiresAt,
      row.version,
      row.hash,
      row.revision,
      row.receipt,
      s.merchant.provider,
      overrides.kind ?? 'capture',
    ],
  );
}
async function reserve(s: Scenario, c: TestDatabase = db) {
  const store = await pay(s.index, c);
  return store.reserve(s.merchant, s.intent, s.digest);
}
async function finish(s: Scenario, status: SandboxResult['status']) {
  const store = await pay(s.index);
  return store.finish(s.merchant, s.intent, {
    status,
    provider: s.merchant.provider,
    mode: 'sandbox',
    transactionId:
      status === 'succeeded' ? 'fictional_' + s.intent.idempotencyKey : null,
    amountMinor: s.intent.amountMinor,
    currency: 'USD',
  });
}
async function claims(index: number) {
  const c = companies[index];
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: c.actor,
      session_id: c.session,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
}
async function newInvoice(index: number, issued = true) {
  await admin();
  await claims(index);
  await db.exec('set role ' + fixtureRoleNames[1]);
  const c = companies[index];
  const draft = (
    await db.query<{
      v: { invoiceId: string; sourceHash: string; revision: number };
    }>(
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,$8,$5,$6,$7) v',
      [
        c.org,
        randomUUID(),
        randomUUID(),
        c.customer,
        c.version,
        'Fictional issued invoice',
        'STAFF PRIVATE',
        c.location,
      ],
    )
  ).rows[0].v;
  c.invoice = draft.invoiceId;
  c.hash = draft.sourceHash;
  c.revision = draft.revision;
  c.receipt = randomUUID();
  await admin();
  if (issued) {
    await db.query(
      "insert into private.commercial_issue_authorities values($1,$2,$3,$4,$5,$6,null,'FICTIONAL ISSUE ONLY')",
      [c.org, c.invoice, c.actor, c.revision, c.hash, until],
    );
    await claims(index);
    await db.exec('set role ' + fixtureRoleNames[2]);
    await db.query(
      'select private.commercial_invoice_issue($1,$2,$3,$4,$5,$8,$6,$7)',
      [
        c.org,
        c.invoice,
        c.receipt,
        c.revision,
        c.customer,
        c.version,
        c.hash,
        c.location,
      ],
    );
    await admin();
  }
}
beforeAll(async () => {
  owner = String((await db.query('select session_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(owner)) throw Error('Unsafe fixture owner');
  const p = await captureCustomerPaymentPublicationProposal();
  expect(p.installationAuthorized).toBe(false);
  expect(p.financialExecutionAuthorized).toBe(false);
  await db.exec(p.bootstrapSql);
  for (const migration of p.migrations) await db.exec(migration.sql);
  await db.exec(fixtureRoles(p.draftSql));
  await db.exec(fixtureRoles(p.issuanceSql));
  for (const [index, c] of companies.entries()) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [c.actor, c.actor + '@example.test'],
    );
    await db.query(
      'insert into auth.sessions(id,user_id,not_after) values($1,$2,$3)',
      [c.session, c.actor, until],
    );
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL CAPACITY',$2,'construction','active')",
      [c.org, 'capacity-' + c.org],
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
      "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Fixture','TEST','Fixture','Fixture',0,'reviewed')",
      [c.tax, c.org],
    );
    await db.query(
      "insert into private.commercial_draft_authorities values($1,$2,$3,null,'FICTIONAL DRAFT AUTHORITY')",
      [c.org, c.actor, until],
    );
    await claims(index);
    await db.exec('set role authenticated');
    await db.exec('reset role');
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [c.user, c.user + '@example.test'],
    );
    await db.query(
      'insert into auth.sessions(id,user_id,not_after) values($1,$2,$3)',
      [c.customerSession, c.user, until],
    );
    await db.query(
      "insert into public.service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'FICTIONAL','TEST','TS','00000','US')",
      [c.location, c.org, c.customer],
    );
    await db.query(
      'insert into public.portal_identities(organization_id,customer_id,user_id) values($1,$2,$3)',
      [c.org, c.customer, c.user],
    );
    await db.query(
      'insert into private.property_features(organization_id,enabled) values($1,true)',
      [c.org],
    );
    await db.exec('set role authenticated');
    const payload = blankEstimate(c.customer);
    payload.location_id = c.location;
    payload.tax_policy_id = c.tax;
    payload.expires_on = '2099-12-31';
    payload.lines[0] = {
      ...payload.lines[0],
      description: 'Original fictional scope',
      quantity_milli: 1000,
      unit_price_minor: 10000,
      unit_cost_minor: 5000,
      taxable: true,
    };
    const b = (
      await db.query<{ v: EstimateBundle }>(
        'select public.create_estimate($1,$2,$3) v',
        [c.org, payload, randomUUID()],
      )
    ).rows[0].v;
    c.version = (
      await db.query<{ v: EstimateBundle }>(
        'select public.issue_estimate($1,$2,$3,$4) v',
        [c.org, b.estimate.id, b.version.id, b.version.lock_revision],
      )
    ).rows[0].v.version.id;
    await admin();
  }
  for (const [index, m] of merchants.entries()) {
    await db.query(
      "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,$3,'FICTIONAL ONLY','sandbox','approved')",
      [m.merchantConfigId, m.organizationId, m.provider],
    );
    await db.exec(
      `create role ${roles[index]} login nosuperuser nocreatedb nocreaterole nobypassrls;grant usage on schema private to ${roles[index]};grant execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb) to ${roles[index]}`,
    );
    await db.query(
      "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
      [
        m.organizationId,
        roles[index],
        m.merchantConfigId,
        until,
        sha256('FICTIONAL LEASE'),
      ],
    );
  }
  await db.exec(fixtureRoles(p.capacitySql));
  await db.exec(fixtureRoles(p.receiptSql));
  await db.exec(fixtureRoles(p.publicationSql));
  for (const r of roles)
    await db.exec(
      `grant execute on function private.customer_payment_publish(uuid,uuid,jsonb),private.customer_payment_revoke(uuid,uuid),private.customer_payment_publication_receipt(uuid,uuid) to ${r}`,
    );
  await db.exec(
    'grant usage on schema private to authenticated;grant execute on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) to authenticated',
  );

  for (let i = 0; i < merchants.length; i++) {
    const r = 'invoice_read_' + randomUUID().replaceAll('-', '');
    readers.push(r);
    await db.exec(
      `create role ${r} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls;grant usage on schema private to ${r};grant execute on function private.commercial_invoice_payment_receipt(uuid,uuid,text,uuid,uuid,uuid,text,integer,uuid,uuid,uuid,text,text,uuid) to ${r}`,
    );
    await db.query(
      "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
      [
        merchants[i].organizationId,
        r,
        merchants[i].merchantConfigId,
        until,
        sha256('FICTIONAL READER'),
      ],
    );
  }
});
const readers: string[] = [];
async function gates(enabled: boolean) {
  await admin();
  await db.exec(
    `create or replace function private.customer_capability(p_name text) returns boolean language sql volatile security definer set search_path='' as $$select ${enabled}$$`,
  );
  await db.exec(
    `create or replace function private.customer_payment_publication_enabled() returns boolean language sql volatile security definer set search_path='' as $$select ${enabled}$$`,
  );
}

beforeEach(async () => {
  await gates(true);
  await db.query(
    "update public.estimates set status='issued' where organization_id=any($1::uuid[])",
    [companies.map((c) => c.org)],
  );
  await db.query('update public.portal_identities set active=true');
  await db.query('update auth.sessions set not_after=$1', [until]);
  await db.exec(
    'truncate private.commercial_issue_authorities,private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts,private.sandbox_gateway_authorizations,private.sandbox_gateway_attempts,private.provider_workloads cascade',
  );
  for (let i = 0; i < companies.length; i++) await newInvoice(i);
  await db.exec("update private.merchant_configurations set status='approved'");
  for (let i = 0; i < merchants.length; i++)
    for (const r of [roles[i], readers[i]])
      await db.query(
        "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
        [
          merchants[i].organizationId,
          r,
          merchants[i].merchantConfigId,
          until,
          sha256('FICTIONAL NEW TEST LEASE'),
        ],
      );
});
afterAll(async () => {
  await admin();
  for (const r of [...roles, ...readers, ...fixtureRoleNames]) {
    if (!/^[a-z0-9_]+$/.test(r)) throw Error('Unsafe fixture cleanup');
    await db.exec(
      `reassign owned by ${r} to ${owner};drop owned by ${r};drop role ${r}`,
    );
  }
  await db.close();
});
async function prepared(
  status: SandboxResult['status'] | 'pending' = 'succeeded',
  amount = 4000,
  index = 0,
) {
  const s = scenario(index, amount);
  await authorize(s);
  expect((await reserve(s)).status).toBe('reserved');
  if (status !== 'pending') await finish(s, status);
  return s;
}
async function counts() {
  await admin();
  return (
    await db.query(
      'select (select count(*)::int from private.sandbox_gateway_attempts) attempts,(select count(*)::int from public.activity_events) activity',
    )
  ).rows[0];
}
async function publication(
  s: Scenario,
  expiry = new Date(Date.now() + 300000).toISOString(),
) {
  await admin();
  const digest = String(
    (
      await db.query(
        "select encode(sha256(convert_to(result::text,'UTF8')),'hex') digest from private.sandbox_gateway_attempts where organization_id=$1 and idempotency_key=$2",
        [s.company.org, s.intent.idempotencyKey],
      )
    ).rows[0].digest,
  );
  const c = s.company;
  return {
    id: randomUUID(),
    body: {
      customerId: c.customer,
      locationId: c.location,
      userId: c.user,
      invoiceId: c.invoice,
      sourceVersionId: c.version,
      sourceHash: c.hash,
      revision: c.revision,
      issueCommandId: c.receipt,
      merchantConfigId: s.merchant.merchantConfigId,
      attemptKey: s.intent.idempotencyKey,
      resultDigest: digest,
      expiresAt: expiry,
    },
    s,
  };
}
type Publication = Awaited<ReturnType<typeof publication>>;
async function publisher(p: Publication) {
  await admin();
  await claims(p.s.index === 2 ? 1 : 0);
  await db.exec('set session authorization ' + roles[p.s.index]);
}
async function publish(p: Publication) {
  await publisher(p);
  return (
    await db.query<{ receipt: unknown }>(
      'select private.customer_payment_publish($1,$2,$3) receipt',
      [p.s.company.org, p.id, p.body],
    )
  ).rows[0].receipt;
}
function target(p: Publication) {
  const c = p.s.company;
  return {
    organizationId: c.org,
    customerId: c.customer,
    locationId: c.location,
    invoiceId: c.invoice,
    publicationId: p.id,
  };
}

async function boundCustomer(p: Publication) {
  if (!db.fork) throw Error('Native backend required');
  await admin();
  const role = 'cust_pub_read_' + randomUUID().replaceAll('-', '');
  await db.exec(
    `create role ${role} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-ci-only';grant usage on schema private to ${role};grant execute on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) to ${role}`,
  );
  const database = String(
      (await db.query('select current_database() name')).rows[0].name,
    ),
    socket = process.env.EV_TEST_PG_SOCKET;
  if (!/^ev_test_[a-f0-9]{32}$/.test(database))
    throw Error('Disposable native database required');
  const raw = new Client({
    host: socket ?? '127.0.0.1',
    port: socket ? 55477 : 5432,
    user: role,
    password: socket ? undefined : 'synthetic-ci-only',
    database,
  });
  await raw.connect();
  const observer = await db.fork();
  const c = p.s.company,
    config = {
      url: 'https://abcdefghijklmnopqrst.supabase.co',
      publishableKey: 'sb_publishable_synthetic_only',
    },
    iat = Math.floor(Date.now() / 1000),
    claims = {
      sub: c.user,
      session_id: c.customerSession,
      aal: 'aal2',
      exp: iat + 3600,
      iat,
      iss: config.url + '/auth/v1',
      aud: 'authenticated',
      role: 'authenticated',
    };
  const bearer =
    Buffer.from('{"alg":"RS256"}').toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.controlled_native_signature';
  await raw.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(claims),
  ]);
  const scope = (
    await raw.query<InvoiceConnectionScope>(
      'select current_database() database,pg_backend_pid() pid,backend_start::text,session_user::text login,current_user::text current_role from pg_stat_activity where pid=pg_backend_pid()',
    )
  ).rows[0];
  const state = { receipts: 0, onReceipt: async () => {} };
  const sql: import('../../server/payments/postgres-store').GatewaySql = {
    query: async <T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) => {
      const r = await raw.query<T>(text, params);
      if (text.startsWith('select private.customer_payment_receipt(')) {
        state.receipts++;
        await state.onReceipt();
      }
      return { rows: r.rows };
    },
  };
  const auth = new CustomerBrokerAuth(config, async (input, init) => {
    if (new Headers(init?.headers).get('authorization') !== 'Bearer ' + bearer)
      throw Error('Wrong controlled bearer');
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: c.user });
    if (path === '/rest/v1/rpc/customer_session_status') {
      const active = Boolean(
        (
          await observer.query<{ active: boolean }>(
            'select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2 and u.email_confirmed_at is not null and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=clock_timestamp()) and (s.not_after is null or s.not_after>clock_timestamp())) active',
            [c.user, c.customerSession],
          )
        ).rows[0].active,
      );
      return Response.json({
        user_id: c.user,
        session_id: c.customerSession,
        active,
      });
    }
    throw Error('Forbidden controlled Auth path');
  });
  const caller = new CommercialCallerConnection(sql, auth, bearer, scope),
    read = restrictedPublicationRead(sql, caller, {
      enabled: true,
      mode: 'disposable-proposal',
    });
  return {
    read,
    state,
    raw,
    observer,
    role,
    async close() {
      await raw.end();
      await observer.close();
      await admin();
      await db.exec(`drop owned by ${role};drop role ${role}`);
    },
  };
}
it.skipIf(!db.fork)(
  'binds actual restricted native backend, opaque current SDK Auth and exact customer grant without financial replay',
  async () => {
    const p = await publication(await prepared());
    await publish(p);
    const before = await counts();
    const c = await boundCustomer(p);
    try {
      expect(
        await c.read(target(p), new AbortController().signal),
      ).toMatchObject({
        publicationId: p.id,
        financialEffect: false,
        holdRelease: false,
      });
      expect(c.state.receipts).toBe(1);
      expect(await counts()).toEqual(before);
    } finally {
      await c.close();
    }
  },
);
it
  .skipIf(!db.fork)
  .each([
    'raw_table',
    'other_definer',
    'membership',
    'superuser',
    'public_execute',
    'public_schema',
    'execute_delegation',
    'schema_delegation',
  ] as const)(
  '%s permission pollution denies before customer data on actual native roles',
  async (mode) => {
    const p = await publication(await prepared());
    await publish(p);
    const c = await boundCustomer(p);
    try {
      await admin();
      if (mode === 'raw_table')
        await db.exec(
          `grant select(amount_minor) on private.sandbox_gateway_attempts to ${c.role}`,
        );
      if (mode === 'other_definer')
        await db.exec(
          `grant execute on function private.customer_payment_revoke(uuid,uuid) to ${c.role}`,
        );
      if (mode === 'membership')
        await db.exec(`grant ${fixtureRoleNames[1]} to ${c.role}`);
      if (mode === 'superuser') await db.exec(`alter role ${c.role} superuser`);
      if (mode === 'public_execute')
        await db.exec(
          `revoke execute on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) from ${c.role};grant execute on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) to public`,
        );
      if (mode === 'execute_delegation')
        await db.exec(
          `grant execute on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) to ${c.role} with grant option`,
        );
      if (mode === 'schema_delegation')
        await db.exec(
          `grant usage on schema private to ${c.role} with grant option`,
        );
      if (mode === 'public_schema')
        await db.exec(
          `revoke usage on schema private from ${c.role};grant usage on schema private to public`,
        );
      await expect(
        c.read(target(p), new AbortController().signal),
      ).rejects.toThrow();
      expect(c.state.receipts).toBe(0);
    } finally {
      await admin();
      if (mode === 'public_execute')
        await db.exec(
          'revoke execute on function private.customer_payment_receipt(uuid,uuid,uuid,uuid,uuid) from public',
        );
      if (mode === 'public_schema')
        await db.exec('revoke usage on schema private from public');
      await c.close();
    }
  },
);
it.skipIf(!db.fork)(
  'session revocation after actual original SQL result suppresses the late response',
  async () => {
    const p = await publication(await prepared());
    await publish(p);
    const c = await boundCustomer(p);
    try {
      c.state.onReceipt = async () => {
        await c.observer.query(
          "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
          [p.s.company.customerSession],
        );
      };
      await expect(
        c.read(target(p), new AbortController().signal),
      ).rejects.toThrow();
      expect(c.state.receipts).toBe(1);
    } finally {
      await c.close();
    }
  },
);
it.skipIf(!db.fork)(
  'post-read raw-table grant is detected and cannot be repaired to revive the retired object',
  async () => {
    const p = await publication(await prepared());
    await publish(p);
    const c = await boundCustomer(p);
    try {
      c.state.onReceipt = async () => {
        await c.observer.exec(
          `grant select on private.commercial_payment_access to ${c.role}`,
        );
      };
      await expect(
        c.read(target(p), new AbortController().signal),
      ).rejects.toThrow();
      await c.observer.exec(
        `revoke select on private.commercial_payment_access from ${c.role}`,
      );
      c.state.onReceipt = async () => {};
      await expect(
        c.read(target(p), new AbortController().signal),
      ).rejects.toThrow();
      expect(c.state.receipts).toBe(1);
    } finally {
      await c.close();
    }
  },
);
it.skipIf(!db.fork)(
  'wrong customer grant remains denied despite valid actual Auth and restricted profile',
  async () => {
    const p = await publication(await prepared());
    await publish(p);
    const c = await boundCustomer(p);
    try {
      await expect(
        c.read(
          { ...target(p), customerId: companies[1].customer },
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    } finally {
      await c.close();
    }
  },
);
