import { randomUUID } from 'node:crypto';
import type {
  SandboxMerchant,
  SandboxIntent,
  SandboxResult,
} from '../../server/payments/sandbox';
import type { SandboxRefund } from '../../server/payments/refunds';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { ProviderControl } from '../../server/providers/control';
import { sha256 } from '../../server/providers/safety';
import { captureCustomerPaymentPublicationProposal } from '../../proposals/customer-payment-publication/qualification';
import { customerPaymentPublicationReader } from '../../proposals/customer-payment-publication/reader';

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
async function customer(
  p: Publication,
  index = p.s.index === 2 ? 1 : 0,
  c: TestDatabase = db,
) {
  await admin(c);
  const user = companies[index];
  await c.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: user.user,
      session_id: user.customerSession,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await c.exec('set role authenticated');
  return customerPaymentPublicationReader(
    {
      query: async <T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) => ({ rows: (await c.query<T>(sql, params)).rows }),
    },
    { enabled: true, mode: 'disposable-proposal' },
  );
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
async function open(p: Publication, index = p.s.index === 2 ? 1 : 0) {
  const reader = await customer(p, index);
  return reader(target(p), new AbortController().signal);
}
it('publishes only an original successful receipt under explicit source and customer authority', async () => {
  const p = await publication(await prepared());
  expect(await publish(p)).toMatchObject({
    publicationId: p.id,
    financialEffect: false,
    delivery: 'DISABLED',
  });
  const value = await open(p);
  expect(value).toMatchObject({
    invoiceId: p.s.company.invoice,
    kind: 'capture',
    amountMinor: 4000,
    invoiceAmountMinor: 10000,
    balance: 'NOT_ESTABLISHED',
    settlement: 'UNVERIFIED',
    financialEffect: false,
    holdRelease: false,
  });
});

it('closed default publication and canonical customer capability remain OFF outside controlled disposable fixtures', async () => {
  const p = await publication(await prepared());
  await gates(false);
  await expect(publish(p)).rejects.toThrow('disabled');
  await expect(open(p)).rejects.toThrow();
  await admin();
  expect(
    (await db.query('select private.customer_runtime_status() v')).rows[0].v,
  ).toMatchObject({ reads: false, publishing: false });
});
it.each(['pending', 'unknown', 'declined'] as const)(
  'suppresses %s original attempts, never publishing an uncertain/nonpayment as a receipt',
  async (status) => {
    const p = await publication(await prepared(status));
    await expect(publish(p)).rejects.toThrow();
    await expect(open(p)).rejects.toThrow();
    await admin();
    expect(
      (
        await db.query(
          'select count(*)::int n from private.commercial_payment_access',
        )
      ).rows[0].n,
    ).toBe(0);
  },
);
it.each([
  'customerId',
  'locationId',
  'userId',
  'invoiceId',
  'sourceVersionId',
  'issueCommandId',
  'merchantConfigId',
  'attemptKey',
] as const)('wrong original %s cannot create a customer grant', async (key) => {
  const p = await publication(await prepared());
  p.body[key] = randomUUID();
  await expect(publish(p)).rejects.toThrow();
});
it.each(['sourceHash', 'resultDigest'] as const)(
  'changed %s cannot publish substituted evidence',
  async (key) => {
    const p = await publication(await prepared());
    p.body[key] = 'f'.repeat(64);
    await expect(publish(p)).rejects.toThrow();
  },
);
it('another customer/tenant or publication reference cannot read a foreign receipt', async () => {
  const p = await publication(await prepared());
  await publish(p);
  await expect(open(p, 1)).rejects.toThrow();
  const reader = await customer(p);
  await expect(
    reader(
      { ...target(p), publicationId: randomUUID() },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  await expect(
    reader(
      { ...target(p), customerId: companies[1].customer },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
it('current customer session revocation and expiry suppress the original receipt', async () => {
  const p = await publication(await prepared());
  await publish(p);
  await admin();
  await db.query(
    "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
    [p.s.company.customerSession],
  );
  await expect(open(p)).rejects.toThrow();
});
it('current portal mapping revocation suppresses an otherwise immutable original receipt', async () => {
  const p = await publication(await prepared());
  await publish(p);
  await admin();
  await db.query(
    'update public.portal_identities set active=false where user_id=$1',
    [p.s.company.user],
  );
  await expect(open(p)).rejects.toThrow();
});
it('separate publication revoke authority hides receipt without editing invoice, payment or original receipt', async () => {
  const p = await publication(await prepared());
  await publish(p);
  const before = await counts();
  await publisher(p);
  await db.query('select private.customer_payment_revoke($1,$2)', [
    p.s.company.org,
    p.id,
  ]);
  await expect(open(p)).rejects.toThrow();
  expect(await counts()).toEqual(before);
  await admin();
  await expect(
    db.query('delete from private.commercial_payment_access'),
  ).rejects.toThrow();
  await expect(
    db.query('update private.commercial_payment_access set revoked_at=null'),
  ).rejects.toThrow();
});
it('expiry cannot be extended or rebound through the original publication id', async () => {
  const p = await publication(await prepared());
  await publish(p);
  p.body.expiresAt = new Date(Date.now() + 400000).toISOString();
  await expect(publish(p)).rejects.toThrow('no rebind');
  await admin();
  await expect(
    db.query(
      "update private.commercial_payment_access set expires_at=expires_at+interval '1 minute'",
    ),
  ).rejects.toThrow();
});
it('an expired customer grant withholds visibility', async () => {
  const p = await publication(
    await prepared(),
    new Date(Date.now() + 150).toISOString(),
  );
  await publish(p);
  await new Promise((r) => setTimeout(r, 180));
  await expect(open(p)).rejects.toThrow();
});
it('stale issued-source status denies without weakening the existing issued-draft guard', async () => {
  const p = await publication(await prepared());
  await publish(p);
  await admin();
  await db.query(
    "update public.estimates set status='draft' where organization_id=$1 and current_version_id=$2",
    [p.s.company.org, p.s.company.version],
  );
  await expect(open(p)).rejects.toThrow();
});
it('AAL1 customer and AAL1 publisher never gain receipt authority', async () => {
  const p = await publication(await prepared());
  await publisher(p);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: p.s.company.actor,
      session_id: p.s.company.session,
      aal: 'aal1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await expect(
    db.query('select private.customer_payment_publish($1,$2,$3)', [
      p.s.company.org,
      p.id,
      p.body,
    ]),
  ).rejects.toThrow();
  await publish(p);
  const r = await customer(p);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: p.s.company.user,
      session_id: p.s.company.customerSession,
      aal: 'aal1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await expect(r(target(p), new AbortController().signal)).rejects.toThrow();
});
it('actual publication ACK loss is recovered by exact creator status read, never by another payment/grant', async () => {
  const p = await publication(await prepared());
  const before = await counts();
  await publisher(p);
  const lost = async () => {
    await db.query('select private.customer_payment_publish($1,$2,$3)', [
      p.s.company.org,
      p.id,
      p.body,
    ]);
    throw Error('ACK LOST AFTER SQL COMMIT');
  };
  await expect(lost()).rejects.toThrow('ACK LOST');
  const status = (
    await db.query(
      'select private.customer_payment_publication_receipt($1,$2) v',
      [p.s.company.org, p.id],
    )
  ).rows[0].v;
  expect(status).toMatchObject({
    publicationId: p.id,
    state: 'RECORDED',
    financialEffect: false,
  });
  expect(await counts()).toEqual(before);
  expect((await open(p)).amountMinor).toBe(4000);
});
it('records a refund separately from original capture without netting a balance or claiming settlement', async () => {
  const capture = await prepared();
  await admin();
  await db.query(
    'insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) values($1,$2,$3)',
    [
      capture.company.org,
      capture.intent.idempotencyKey,
      sha256('FICTIONAL NOT BANK'),
    ],
  );
  const f = scenario(0, 1000);
  await authorize(f, { kind: 'refund' });
  const store = await pay();
  const refund: SandboxRefund = {
    ...f.intent,
    captureKey: capture.intent.idempotencyKey,
    providerTransactionId: 'fictional_' + capture.intent.idempotencyKey,
  };
  expect((await store.reserveRefund(f.merchant, refund, f.digest)).status).toBe(
    'reserved',
  );
  await store.finishRefund(f.merchant, refund, {
    status: 'succeeded',
    provider: 'nmi',
    mode: 'sandbox',
    transactionId: 'fictional_customer_refund',
    amountMinor: 1000,
    currency: 'USD',
  });
  const p = await publication(f);
  await publish(p);
  expect(await open(p)).toMatchObject({
    kind: 'refund',
    amountMinor: 1000,
    invoiceAmountMinor: 10000,
    balance: 'NOT_ESTABLISHED',
    settlement: 'UNVERIFIED',
  });
});
it('customer output excludes internal source, session, merchant/provider ids, digests, notes and mutable commands', async () => {
  const p = await publication(await prepared());
  await publish(p);
  const value = await open(p);
  expect(JSON.stringify(value)).not.toMatch(
    /sourceHash|session|merchant|provider|digest|attemptKey|authorization|PRIVATE|actor|requestHash|href|bearer|token/i,
  );
  expect(value).toMatchObject({
    delivery: 'DISABLED',
    holdRelease: false,
    financialEffect: false,
  });
});
it('ordinary roles have no mapping DML/private table read; customer cannot call publisher, revoke or original workload reader', async () => {
  await admin();
  for (const role of ['anon', 'authenticated', 'service_role', ...roles]) {
    expect(
      (
        await db.query(
          "select has_table_privilege($1,'private.commercial_payment_access','SELECT') s,has_table_privilege($1,'private.commercial_payment_access','INSERT') i,has_table_privilege($1,'private.commercial_payment_access','UPDATE') u,has_table_privilege($1,'private.commercial_payment_access','DELETE') d",
          [role],
        )
      ).rows[0],
    ).toEqual({ s: false, i: false, u: false, d: false });
  }
  await db.exec('set role authenticated');
  await expect(
    db.query('select private.customer_payment_publish(null,null,null)'),
  ).rejects.toThrow('permission denied');
  await expect(
    db.query('select private.customer_payment_revoke(null,null)'),
  ).rejects.toThrow('permission denied');
});
async function publisherOn(c: TestDatabase, p: Publication) {
  await admin(c);
  const company = p.s.company;
  await c.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: company.actor,
      session_id: company.session,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await c.exec('set session authorization ' + roles[p.s.index]);
}
async function blocked(c: TestDatabase, pid: number, blocker: number) {
  for (let i = 0; i < 75; i++) {
    if (
      (
        await c.query<{ waiting: boolean }>(
          'select $2::integer=any(pg_blocking_pids($1)) waiting',
          [pid, blocker],
        )
      ).rows[0].waiting
    )
      return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error('Required native resource wait not observed');
}
it.skipIf(!db.fork)(
  'exact duplicate publish and revoke use a common workload-to-grant order without deadlock',
  async () => {
    const p = await publication(await prepared());
    await publish(p);
    await admin();
    const pub = await db.fork!(),
      revoke = await db.fork!();
    let a: Promise<{ ok: boolean; code?: string }> | undefined, b: typeof a;
    try {
      await publisherOn(pub, p);
      await publisherOn(revoke, p);
      const pubPid = Number(
          (await pub.query('select pg_backend_pid() pid')).rows[0].pid,
        ),
        revokePid = Number(
          (await revoke.query('select pg_backend_pid() pid')).rows[0].pid,
        ),
        adminPid = Number(
          (await db.query('select pg_backend_pid() pid')).rows[0].pid,
        );
      await db.exec('begin');
      await db.query(
        'select id from public.estimates where organization_id=$1 and current_version_id=$2 for update',
        [p.s.company.org, p.s.company.version],
      );
      a = pub
        .query('select private.customer_payment_publish($1,$2,$3)', [
          p.s.company.org,
          p.id,
          p.body,
        ])
        .then(
          () => ({ ok: true }),
          (e: unknown) => ({
            ok: false,
            code: String((e as { code?: string }).code),
          }),
        );
      await blocked(db, pubPid, adminPid);
      b = revoke
        .query('select private.customer_payment_revoke($1,$2)', [
          p.s.company.org,
          p.id,
        ])
        .then(
          () => ({ ok: true }),
          (e: unknown) => ({
            ok: false,
            code: String((e as { code?: string }).code),
          }),
        );
      await blocked(db, revokePid, pubPid);
      await db.exec('commit');
      expect(await a).toEqual({ ok: true });
      expect(await b).toEqual({ ok: true });
      await expect(open(p)).rejects.toThrow();
    } finally {
      await admin();
      await db.exec('rollback');
      if (a) await a;
      if (b) await b;
      await pub.close();
      await revoke.close();
    }
  },
);
it.skipIf(!db.fork).each(['session', 'grant'] as const)(
  '%s expiry during an observed source wait suppresses the original customer receipt',
  async (kind) => {
    const p = await publication(
      await prepared(),
      new Date(Date.now() + (kind === 'grant' ? 600 : 300000)).toISOString(),
    );
    await publish(p);
    await admin();
    if (kind === 'session')
      await db.query('update auth.sessions set not_after=$1 where id=$2', [
        new Date(Date.now() + 600).toISOString(),
        p.s.company.customerSession,
      ]);
    const peer = await db.fork!();
    let pending: Promise<{ ok: boolean }> | undefined;
    try {
      const read = await customer(p, 0, peer);
      const pid = Number(
          (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
        ),
        adminPid = Number(
          (await db.query('select pg_backend_pid() pid')).rows[0].pid,
        );
      await db.exec('begin');
      await db.query(
        'select id from public.estimates where organization_id=$1 and current_version_id=$2 for update',
        [p.s.company.org, p.s.company.version],
      );
      pending = read(target(p), new AbortController().signal).then(
        () => ({ ok: true }),
        () => ({ ok: false }),
      );
      await blocked(db, pid, adminPid);
      await new Promise((r) => setTimeout(r, 650));
      await db.exec('commit');
      expect(await pending).toEqual({ ok: false });
    } finally {
      await admin();
      await db.exec('rollback');
      if (pending) await pending;
      await peer.close();
    }
  },
);
