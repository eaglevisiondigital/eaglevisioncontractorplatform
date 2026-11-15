// Fixture setup reused from qualified494 native source3194f274; actual original SQL only.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateVersion } from '../../src/domain/estimating/types';
import { projectIssuedReview } from '../../src/domain/customer/review';
import { commercialCustomerReadProposal } from '../../proposals/commercial-customer-bridge/reader';
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
const guardRole = `ccpay_${roleTag}_guard`;

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
    .replaceAll('propel_commercial_issue_runtime', issueRole)
    .replaceAll('propel_commercial_payment_guard_owner', guardRole);
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
  const capacity = readFileSync(
    'server/payments/commercial-capacity.proposed.sql',
    'utf8',
  );
  expect(createHash('sha256').update(capacity).digest('hex')).toBe(
    'a9fc788d6ea486a21207868088c56ca1d45a1b9b15ef29feb4f6d62b018a8aa4',
  );
  await db.exec(fixtureRoles(capacity));
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

afterAll(async () => {
  if (native) {
    await authDb.close();
    await db.exec('reset role');
    for (const role of [guardRole, ownerRole, draftRole, issueRole])
      await db.exec(
        `reassign owned by ${role} to ${fixtureAdmin};drop owned by ${role};drop role ${role}`,
      );
  }
  await db.close();
});

const test = it.skipIf(!native);
async function observer<
  T extends Record<string, unknown> = Record<string, unknown>,
>(sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  return db.query<T>(sql, params);
}
async function original(c = companies[0]) {
  const result = await observer<{
    invoice: Record<string, unknown>;
    version: EstimateVersion;
    source_current: boolean;
  }>(
    `select private.commercial_issue_projection(h.organization_id,h.id) invoice,to_jsonb(v) version,
  (p.status='issued' and p.current_version_id=v.id and v.status='issued' and v.customer_id=h.customer_id and v.location_id is not distinct from h.location_id and
    encode(sha256(convert_to(jsonb_build_object('version',v.id,'customer',v.customer_id,'location',v.location_id,'payload',v.payload,'calculation',v.calculation,'tax_policy',v.tax_policy_snapshot)::text,'UTF8')),'hex')=h.source_hash and not exists(select 1 from public.estimate_versions n where n.organization_id=v.organization_id and n.estimate_id=v.estimate_id and n.status='issued' and n.version_number>v.version_number)) source_current
  from private.commercial_invoice_drafts h join public.estimate_versions v on v.organization_id=h.organization_id and v.id=h.source_version_id join public.estimates p on p.organization_id=v.organization_id and p.id=v.estimate_id where h.organization_id=$1 and h.id=$2`,
    [c.org, draft.invoiceId],
  );
  if (result.rows.length !== 1 || result.rows[0].source_current !== true)
    throw Error('Fixture original source unavailable');
  return result.rows[0];
}
async function customer() {
  const c = companies[0],
    stored = await original(),
    invoice = stored.invoice;
  const preview = customerPreview(stored.version),
    context = {
      organization_id: c.org,
      customer_id: c.customer,
      location_id: c.location,
      company_name: preview.company.name,
      primary_color: preview.company.primary_color,
      property_label: 'Fictional native property',
      reports: false,
      version_ids: [c.version],
    };
  const viewer = {
    invoice: {
      organizationId: c.org,
      invoiceId: draft.invoiceId,
      customerId: c.customer,
      locationId: c.location,
      sourceVersionId: c.version,
      revision: draft.revision,
    },
    companyName: context.company_name,
    customerName: preview.customer.display_name,
    propertyLabel: context.property_label,
    primaryColor: context.primary_color,
  };
  const config = {
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    publishableKey: 'sb_publishable_controlled_fixture_only',
  };
  const claims = {
    sub: c.user,
    session_id: c.customerSession,
    aal: 'aal2',
    role: 'authenticated',
    aud: 'authenticated',
    iss: config.url + '/auth/v1',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const bearer =
    Buffer.from('{}').toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(claims)).toString('base64url') +
    '.controlled_fixture';
  const auth = new CustomerBrokerAuth(config, async (input, init) => {
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer ' + bearer,
    );
    const active = Boolean(
      (
        await authDb.query<{ active: boolean }>(
          'select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2 and u.email_confirmed_at is not null and u.deleted_at is null and not u.is_anonymous and(s.not_after is null or s.not_after>clock_timestamp())) active',
          [c.user, c.customerSession],
        )
      ).rows[0].active,
    );
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user')
      return active
        ? Response.json({ id: c.user })
        : Response.json({ error: 'controlled revoked' }, { status: 401 });
    if (path === '/rest/v1/rpc/customer_session_status')
      return Response.json({
        user_id: c.user,
        session_id: c.customerSession,
        active,
      });
    throw Error('No hosted Auth fixture path');
  });
  // This is an explicit in-memory permission fixture, not installed commercial access.
  const permission = {
    active: true,
    expiresAt: Date.now() + 120000,
    revision: 'controlled-native-r1',
  };
  const hooks = {
    afterRead: async () => {},
    map: (mapping: Record<string, unknown>) => mapping,
    packet: (value: unknown) => value,
  };
  const calls = { mapping: 0, source: 0 };
  const port = {
    kind: 'unwired-test-port' as const,
    async authorize(
      actor: { user_id: string; session_id: string },
      target: typeof viewer.invoice,
    ) {
      calls.mapping++;
      const access = await observer(
        'select active from public.portal_identities where organization_id=$1 and customer_id=$2 and user_id=$3',
        [target.organizationId, target.customerId, actor.user_id],
      );
      if (
        !permission.active ||
        permission.expiresAt <= Date.now() ||
        actor.user_id !== c.user ||
        actor.session_id !== c.customerSession ||
        access.rows.length !== 1 ||
        access.rows[0].active !== true
      )
        throw Error('Controlled customer permission unavailable');
      const h = (await original()).invoice,
        receipt = h.receipt as Record<string, unknown>;
      return hooks.map({
        mode: 'fictional-local',
        active: true,
        userId: c.user,
        sessionId: c.customerSession,
        ...viewer.invoice,
        sourceHash: h.sourceHash,
        mappingRevision: permission.revision,
        expiresAt: permission.expiresAt,
        issuedNumber: h.number,
        issuanceReceiptId: receipt.commandId,
      });
    },
    async readIssued() {
      calls.source++;
      const h = await original();
      const packet = hooks.packet({
        mode: 'fictional-local',
        invoice: h.invoice,
        companyName: viewer.companyName,
        customerName: viewer.customerName,
        propertyLabel: viewer.propertyLabel,
        primaryColor: viewer.primaryColor,
        source: {
          sourceHash: h.invoice.sourceHash,
          review: projectIssuedReview(h.version, context),
        },
      });
      await hooks.afterRead();
      return packet;
    },
  };
  const load = commercialCustomerReadProposal(auth, bearer, port, {
    enabled: true,
    mode: 'fictional-local',
  });
  return {
    c,
    viewer,
    permission,
    hooks,
    calls,
    load,
    invoice,
    auth,
    bearer,
    port,
  };
}

import { customerCaptureLinkLifecycle } from '../../proposals/customer-payment-link-lifecycle/read';
import { CUSTOMER_CAPTURE_LIFECYCLE_QUERY } from '../../proposals/customer-payment-link-lifecycle/query';
let merchantId: string, authorizationId: string, key: string;
const digest = 'd'.repeat(64);
const amount = 500;
beforeEach(async () => {
  if (!native) return;
  await observer(
    'truncate private.sandbox_gateway_attempts,private.sandbox_gateway_authorizations cascade',
  );
  await observer(
    'delete from private.merchant_configurations where organization_id=$1 and provider=$2 and environment=$3',
    [companies[0].org, 'nmi', 'sandbox'],
  );
  merchantId = randomUUID();
  authorizationId = randomUUID();
  key = randomUUID();
  const c = companies[0];
  await observer(
    "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,'nmi','FICTIONAL ONLY','sandbox','approved')",
    [merchantId, c.org],
  );
  await observer(
    `insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at,invoice_source_version_id,invoice_source_hash,invoice_revision,invoice_issue_command_id) values($1,$2,$3,$4,$5,'nmi','capture',$6,'USD',$7,'FICTIONAL CONSENT ONLY',clock_timestamp()+interval '1 hour',$8,$9,$10,$11)`,
    [
      c.org,
      authorizationId,
      merchantId,
      c.customer,
      draft.invoiceId,
      amount,
      digest,
      c.version,
      draft.sourceHash,
      draft.revision,
      command,
    ],
  );
});
async function payment() {
  const f = await customer(),
    c = f.c;
  const merchant = {
    organizationId: c.org,
    merchantConfigId: merchantId,
    provider: 'nmi' as const,
    mode: 'sandbox' as const,
    approvalReference: 'FICTIONAL ONLY',
    approvedUntil: new Date(Date.now() + 3600000).toISOString(),
  };
  const intent = {
    organizationId: c.org,
    merchantConfigId: merchantId,
    invoiceId: draft.invoiceId,
    authorizationId,
    idempotencyKey: key,
    amountMinor: amount,
    currency: 'USD' as const,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  };
  let calls = 0;
  const connection = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      args?: unknown[],
    ) {
      calls++;
      return { rows: (await observer<T>(sql, args)).rows };
    },
  };
  const input = { merchant, intent, requestDigest: digest };
  return {
    ...f,
    input,
    connection,
    calls: () => calls,
    load: () =>
      customerCaptureLinkLifecycle(
        f.auth,
        f.bearer,
        f.port,
        connection,
        input,
        { enabled: true, mode: 'disposable-proposal' },
      )(f.viewer, new AbortController().signal),
  };
}
async function reserve() {
  await observer(
    `insert into private.sandbox_gateway_attempts(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,amount_minor,request_digest) values($1,$2,$3,$4,$5,'capture',$6,$7)`,
    [
      companies[0].org,
      key,
      authorizationId,
      merchantId,
      draft.invoiceId,
      amount,
      digest,
    ],
  );
}
async function finish(status: string) {
  await reserve();
  await observer(
    'update private.sandbox_gateway_attempts set status=$3,result=$4::jsonb where organization_id=$1 and idempotency_key=$2',
    [
      companies[0].org,
      key,
      status,
      JSON.stringify({
        status,
        provider: 'nmi',
        mode: 'sandbox',
        transactionId: status === 'succeeded' ? 'FICTIONAL_TRANSACTION' : null,
        amountMinor: amount,
        currency: 'USD',
      }),
    ],
  );
}
test('actual original issued header and capture authority map to a disabled partial-payment lifecycle without a new attempt', async () => {
  const f = await payment();
  expect((await f.load()).reason).toBe('NO_ATTEMPT');
  expect(f.calls()).toBe(2);
  expect(
    (
      await observer(
        'select count(*)::int n from private.sandbox_gateway_attempts',
      )
    ).rows[0].n,
  ).toBe(0);
});
test.each([
  ['pending', 'ORIGINAL_PENDING'],
  ['unknown', 'ORIGINAL_UNKNOWN'],
  ['succeeded', 'ORIGINAL_RECORDED'],
  ['declined', 'ORIGINAL_DECLINED'],
])(
  'actual original %s attempt stays immutable/read-only',
  async (status, reason) => {
    if (status === 'pending') await reserve();
    else await finish(status);
    const f = await payment();
    const before = await observer(
      'select row_to_json(a)::text v from private.sandbox_gateway_attempts a',
    );
    const r = await f.load();
    expect(r.reason).toBe(reason);
    expect(r.executionAuthorized).toBe(false);
    expect(r.link.href).toBeNull();
    expect(
      (
        await observer(
          'select row_to_json(a)::text v from private.sandbox_gateway_attempts a',
        )
      ).rows,
    ).toEqual(before.rows);
  },
);
test('same authorization consumed under a foreign request key cannot be reclassified as unspent', async () => {
  await reserve();
  const f = await payment();
  f.input.intent.idempotencyKey = randomUUID();
  await expect(f.load()).rejects.toThrow('UNKNOWN');
});
test('wrong original issuance anchor yields no authorized query row', async () => {
  const f = await payment();
  const args = [
    f.c.org,
    draft.invoiceId,
    authorizationId,
    merchantId,
    f.c.customer,
    f.c.version,
    draft.revision,
    randomUUID(),
    digest,
    amount,
  ];
  expect(
    (await observer(CUSTOMER_CAPTURE_LIFECYCLE_QUERY, args)).rows,
  ).toHaveLength(0);
});
test('another tenant/customer cannot read the first authority', async () => {
  const f = await payment();
  const other = companies[1];
  expect(
    (
      await observer(CUSTOMER_CAPTURE_LIFECYCLE_QUERY, [
        other.org,
        draft.invoiceId,
        authorizationId,
        merchantId,
        other.customer,
        f.c.version,
        draft.revision,
        command,
        digest,
        amount,
      ])
    ).rows,
  ).toHaveLength(0);
});
test('different digest/amount cannot substitute the original request', async () => {
  const f = await payment();
  expect(
    (
      await observer(CUSTOMER_CAPTURE_LIFECYCLE_QUERY, [
        f.c.org,
        draft.invoiceId,
        authorizationId,
        merchantId,
        f.c.customer,
        f.c.version,
        draft.revision,
        command,
        'e'.repeat(64),
        amount,
      ])
    ).rows,
  ).toHaveLength(0);
});
test('native current customer revocation after SQL lookup denies the result', async () => {
  const f = await payment();
  const original = f.connection.query;
  f.connection.query = async <T extends Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ) => {
    const response = await original<T>(sql, args);
    await observer(
      'update public.portal_identities set active=false where organization_id=$1 and customer_id=$2',
      [f.c.org, f.c.customer],
    );
    return response;
  };
  await expect(f.load()).rejects.toThrow('UNKNOWN');
  expect(f.calls()).toBe(1);
});
test('native authority revocation is a held observation, never link eligibility', async () => {
  await observer(
    'update private.sandbox_gateway_authorizations set revoked_at=clock_timestamp() where organization_id=$1 and id=$2',
    [companies[0].org, authorizationId],
  );
  const f = await payment(),
    r = await f.load();
  expect(r.reason).toBe('AUTHORITY_REVOKED');
  expect(r.payment).toBe('UNKNOWN');
  expect(r.balanceMinor).toBeNull();
  expect(r.settlement).toBe('UNVERIFIED');
});
async function replacementAuthority(replacementAmount: number) {
  const replacement = randomUUID();
  await observer(
    `insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at,invoice_source_version_id,invoice_source_hash,invoice_revision,invoice_issue_command_id) values($1,$2,$3,$4,$5,'nmi','capture',$6,'USD',$7,'FICTIONAL SEPARATE AUTHORITY',clock_timestamp()+interval '1 hour',$8,$9,$10,$11)`,
    [
      companies[0].org,
      replacement,
      merchantId,
      companies[0].customer,
      draft.invoiceId,
      replacementAmount,
      'e'.repeat(64),
      companies[0].version,
      draft.sourceHash,
      draft.revision,
      command,
    ],
  );
  return () =>
    observer(
      `insert into private.sandbox_gateway_attempts(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,amount_minor,request_digest) values($1,$2,$3,$4,$5,'capture',$6,$7)`,
      [
        companies[0].org,
        randomUUID(),
        replacement,
        merchantId,
        draft.invoiceId,
        replacementAmount,
        'e'.repeat(64),
      ],
    );
}
test('read-only lifecycle cannot release cumulative capture capacity after a recorded partial payment', async () => {
  await finish('succeeded');
  const f = await payment();
  expect((await f.load()).reason).toBe('ORIGINAL_RECORDED');
  const over = await replacementAuthority(
    Number(draft.amountMinor) - amount + 1,
  );
  await expect(over()).rejects.toThrow(
    'Commercial invoice capture capacity exceeded',
  );
  expect(
    (
      await observer(
        'select count(*)::int n from private.sandbox_gateway_attempts',
      )
    ).rows[0].n,
  ).toBe(1);
});
test('UNKNOWN remains an invoice-wide no-replacement fence after lifecycle inspection', async () => {
  await finish('unknown');
  const f = await payment();
  expect((await f.load()).reason).toBe('ORIGINAL_UNKNOWN');
  const replacement = await replacementAuthority(1);
  await expect(replacement()).rejects.toThrow(
    'Unresolved original invoice payment',
  );
  expect(
    (
      await observer(
        'select count(*)::int n from private.sandbox_gateway_attempts',
      )
    ).rows[0].n,
  ).toBe(1);
});
