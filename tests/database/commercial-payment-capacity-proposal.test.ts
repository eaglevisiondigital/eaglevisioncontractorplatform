import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { ProviderControl } from '../../server/providers/control';
import { sha256 } from '../../server/providers/safety';
import { readCommercialCapacityProposal } from '../../proposals/commercial-payment-capacity/qualification';
import type {
  SandboxIntent,
  SandboxMerchant,
  SandboxResult,
} from '../../server/payments/sandbox';
import { receiveSandboxPaymentWebhook } from '../../server/payments/webhook-inbox';
import type { SandboxRefund } from '../../server/payments/refunds';

// Actual original writers, local synthetic principals. No provider port is used.
const db = createTestDatabase();
let owner = 'postgres';
let originalUnlinkedReservation: Record<string, unknown> | undefined;
let retainedLegacyReservation: Record<string, unknown> | undefined;
const until = new Date(Date.now() + 29 * 60000).toISOString();
const companies = Array.from({ length: 2 }, () => ({
  org: randomUUID(),
  actor: randomUUID(),
  session: randomUUID(),
  customer: randomUUID(),
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
const fixtureRoleNames = [
  'propel_capacity_test_owner',
  'propel_capacity_test_draft',
  'propel_capacity_test_issuer',
  'propel_capacity_test_guard',
];
function fixtureRoles(sql: string) {
  return sql
    .replaceAll('propel_commercial_draft_owner', fixtureRoleNames[0])
    .replaceAll('propel_commercial_draft_runtime', fixtureRoleNames[1])
    .replaceAll('propel_commercial_issue_runtime', fixtureRoleNames[2])
    .replaceAll('propel_commercial_payment_guard_owner', fixtureRoleNames[3]);
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
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at,invoice_source_version_id,invoice_source_hash,invoice_revision,invoice_issue_command_id) values($1,$2,$3,$4,$5,$13,'capture',$6,'USD',$7,'FICTIONAL AUTHORIZATION NOT CUSTOMER CONSENT',$8,$9,$10,$11,$12)",
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
async function attempts() {
  await admin();
  return (
    await db.query(
      'select idempotency_key,authorization_id,merchant_id,invoice_id,kind,amount_minor,status from private.sandbox_gateway_attempts order by idempotency_key',
    )
  ).rows;
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
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,null,$5,$6,$7) v',
      [
        c.org,
        randomUUID(),
        randomUUID(),
        c.customer,
        c.version,
        'Fictional issued invoice',
        'STAFF PRIVATE',
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
      'select private.commercial_invoice_issue($1,$2,$3,$4,$5,null,$6,$7)',
      [c.org, c.invoice, c.receipt, c.revision, c.customer, c.version, c.hash],
    );
    await admin();
  }
}
beforeAll(async () => {
  owner = String((await db.query('select session_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(owner)) throw Error('Unsafe fixture owner');
  const p = readCommercialCapacityProposal();
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
    const payload = blankEstimate(c.customer);
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
  // Characterize the actual original control before installing the proposal in
  // this disposable DB: an authorization alone admits a nonexistent invoice.
  const m = merchants[0],
    invoice = randomUUID(),
    authorization = randomUUID(),
    key = randomUUID(),
    digest = sha256('ORIGINAL UNLINKED RESERVATION');
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi','capture',10000,'USD',$6,'CHARACTERIZATION ONLY NO DISPATCH',$7)",
    [
      m.organizationId,
      authorization,
      m.merchantConfigId,
      companies[0].customer,
      invoice,
      digest,
      until,
    ],
  );
  const originalStore = await pay(0);
  expect(
    (
      await originalStore.reserve(
        m,
        {
          organizationId: m.organizationId,
          merchantConfigId: m.merchantConfigId,
          invoiceId: invoice,
          authorizationId: authorization,
          idempotencyKey: key,
          amountMinor: 10000,
          currency: 'USD',
          expiresAt: until,
        },
        digest,
      )
    ).status,
  ).toBe('reserved');
  await admin();
  originalUnlinkedReservation = (
    await db.query(
      'select idempotency_key,authorization_id,invoice_id,status from private.sandbox_gateway_attempts where organization_id=$1 and idempotency_key=$2',
      [m.organizationId, key],
    )
  ).rows[0];
  await db.exec(fixtureRoles(p.capacitySql));
  retainedLegacyReservation = (
    await db.query(
      'select idempotency_key,authorization_id,invoice_id,status from private.sandbox_gateway_attempts where organization_id=$1 and idempotency_key=$2',
      [m.organizationId, key],
    )
  ).rows[0];
});
beforeEach(async () => {
  await admin();
  await db.exec(
    'truncate private.commercial_issue_authorities,private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts,private.sandbox_gateway_authorizations,private.sandbox_gateway_attempts cascade',
  );
  for (let i = 0; i < companies.length; i++) await newInvoice(i);
});
afterAll(async () => {
  await admin();
  for (const role of [...roles, ...fixtureRoleNames]) {
    if (!/^[a-z0-9_]+$/.test(role)) throw Error('Unsafe fixture role');
    if (
      !(await db.query('select 1 from pg_roles where rolname=$1', [role])).rows
        .length
    )
      continue;
    await db.exec(
      `reassign owned by ${role} to ${owner};drop owned by ${role};drop role ${role}`,
    );
  }
  await db.close();
});

it('characterizes the original missing invoice admission and preserves that historical attempt without rewriting it', () => {
  expect(originalUnlinkedReservation).toBeDefined();
  expect(originalUnlinkedReservation?.status).toBe('pending');
  expect(retainedLegacyReservation).toEqual(originalUnlinkedReservation);
});
it('keeps the new owner NOLOGIN, ordinary roles without DML/EXECUTE and invoice source writes denied', async () => {
  await admin();
  const role = (
    await db.query(
      'select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname=$1',
      [fixtureRoleNames[3]],
    )
  ).rows[0];
  expect(role).toEqual({
    rolcanlogin: false,
    rolsuper: false,
    rolbypassrls: false,
  });
  for (const r of ['anon', 'authenticated', 'service_role', ...roles]) {
    const row = (
      await db.query(
        "select has_function_privilege($1,'private.commercial_payment_capture_guard()','EXECUTE') fn,has_table_privilege($1,'private.sandbox_gateway_attempts','INSERT') ins,has_table_privilege($1,'private.commercial_invoice_drafts','SELECT') rd",
        [r],
      )
    ).rows[0];
    expect(row).toEqual({ fn: false, ins: false, rd: false });
  }
  await db.exec('set role ' + fixtureRoleNames[3]);
  expect(
    (await db.query('select id from private.commercial_invoice_drafts')).rows,
  ).toHaveLength(2);
  await expect(
    db.query('update private.commercial_invoice_drafts set id=id'),
  ).rejects.toThrow();
});
it.each([0, 2])(
  'merchant%i persists exact partial captures without exceeding the original issued total',
  async (index) => {
    const a = scenario(index, 4000);
    await authorize(a);
    expect((await reserve(a)).status).toBe('reserved');
    await finish(a, 'succeeded');
    const b = scenario(index, 6000);
    await authorize(b);
    expect((await reserve(b)).status).toBe('reserved');
    await finish(b, 'succeeded');
    expect(await attempts()).toHaveLength(2);
    await admin();
    const row = (
      await db.query(
        'select amount_minor,issued_revision,issue_command_id from private.commercial_invoice_drafts where organization_id=$1 and id=$2',
        [a.company.org, a.company.invoice],
      )
    ).rows[0];
    expect(Number(row.amount_minor)).toBe(10000);
    expect(row.issue_command_id).toBe(a.company.receipt);
  },
);
it('original-key receipt recovery is read-only while a replacement key cannot reuse the authorization', async () => {
  const s = scenario(0, 10000);
  await authorize(s);
  await reserve(s);
  await finish(s, 'succeeded');
  const before = await attempts();
  expect((await reserve(s)).status).toBe('existing');
  await expect(
    reserve({ ...s, intent: { ...s.intent, idempotencyKey: randomUUID() } }),
  ).rejects.toThrow();
  expect(await attempts()).toEqual(before);
});
it('reserves capacity across distinct same-tenant merchant configurations', async () => {
  const a = scenario(0, 6000),
    b = scenario(1, 4001);
  await authorize(a);
  await reserve(a);
  await finish(a, 'succeeded');
  await authorize(b);
  await expect(reserve(b)).rejects.toThrow('capacity exceeded');
  expect(await attempts()).toHaveLength(1);
});
it.each(['pending', 'unknown', 'succeeded'] as const)(
  '%s capture holds its full amount against further admission',
  async (status) => {
    const a = scenario(0, 10000);
    await authorize(a);
    await reserve(a);
    if (status !== 'pending') await finish(a, status);
    const b = scenario(1, 1);
    await authorize(b);
    await expect(reserve(b)).rejects.toThrow(
      status === 'succeeded'
        ? 'capacity exceeded'
        : 'Unresolved original invoice payment',
    );
  },
);
it('only a definite canonical decline releases the original capture reservation amount', async () => {
  const a = scenario(0, 10000);
  await authorize(a);
  await reserve(a);
  await finish(a, 'declined');
  const b = scenario(1, 10000);
  await authorize(b);
  expect((await reserve(b)).status).toBe('reserved');
});
it.each(['version', 'hash', 'receipt'] as const)(
  'a substituted original invoice %s is denied before any capture attempt',
  async (field) => {
    const s = scenario();
    await authorize(s, {
      [field]: field === 'hash' ? 'b'.repeat(64) : randomUUID(),
    });
    await expect(reserve(s)).rejects.toThrow('Exact original issued invoice');
    expect(await attempts()).toHaveLength(0);
  },
);
it('a different same-tenant customer cannot use an otherwise exact issued invoice', async () => {
  const s = scenario();
  const customer = randomUUID();
  await admin();
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'FICTIONAL OTHER')",
    [customer, s.company.org],
  );
  await authorize(s, { customer });
  await expect(reserve(s)).rejects.toThrow('Exact original issued invoice');
  expect(await attempts()).toHaveLength(0);
});
it('missing structured invoice fields cannot be inferred from an evidence note', async () => {
  const s = scenario();
  await authorize(s, {
    version: null,
    hash: null,
    revision: null,
    receipt: null,
  });
  await expect(reserve(s)).rejects.toThrow(
    'Exact issued invoice payment authority',
  );
});
it('a nonexistent invoice revision is denied by the composite source foreign key', async () => {
  const s = scenario();
  await expect(authorize(s, { revision: 2 })).rejects.toThrow('foreign key');
  expect(await attempts()).toHaveLength(0);
});
it('source-bound payment authorization fields stay immutable after their original creation', async () => {
  const s = scenario();
  await authorize(s);
  await admin();
  await expect(
    db.query(
      'update private.sandbox_gateway_authorizations set invoice_source_hash=$3 where organization_id=$1 and id=$2',
      [s.company.org, s.intent.authorizationId, 'b'.repeat(64)],
    ),
  ).rejects.toThrow('Immutable gateway authorization');
  expect((await reserve(s)).status).toBe('reserved');
});
it('an unissued draft never grants payment authority', async () => {
  await admin();
  await db.exec(
    'truncate private.commercial_issue_authorities,private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts cascade',
  );
  await newInvoice(0, false);
  const s = scenario();
  await authorize(s);
  await expect(reserve(s)).rejects.toThrow('Exact original issued invoice');
});
it('wrong tenant/merchant input stays denied by the original canonical control', async () => {
  const s = scenario(2);
  await authorize(s);
  const store = await pay(0);
  await expect(store.reserve(s.merchant, s.intent, s.digest)).rejects.toThrow(
    'Provider scope denied',
  );
  expect(await attempts()).toHaveLength(0);
});
it('revoked authorization and changed request digest deny before reservation', async () => {
  const s = scenario();
  await authorize(s);
  await admin();
  await db.query(
    'update private.sandbox_gateway_authorizations set revoked_at=clock_timestamp() where organization_id=$1 and id=$2',
    [s.intent.organizationId, s.intent.authorizationId],
  );
  await expect(reserve(s)).rejects.toThrow(
    'Independent provider authorization',
  );
  const other = scenario();
  await authorize(other);
  await expect(reserve({ ...other, digest: '0'.repeat(64) })).rejects.toThrow(
    'Independent provider authorization',
  );
});
it('a committed reservation with lost ACK remains UNKNOWN and cannot be replaced or overreserved', async () => {
  const s = scenario(0, 10000);
  await authorize(s);
  const store = await pay(0);
  const original = store.reserve.bind(store);
  await expect(
    (async () => {
      await original(s.merchant, s.intent, s.digest);
      throw Error('FICTIONAL lost commit acknowledgment');
    })(),
  ).rejects.toThrow();
  expect((await reserve(s)).status).toBe('unknown');
  const b = scenario(1, 1);
  await authorize(b);
  await expect(reserve(b)).rejects.toThrow(
    'Unresolved original invoice payment',
  );
  expect(await attempts()).toHaveLength(1);
});
it.each(['repeatable read', 'serializable'])(
  'denies %s rather than using a stale capacity snapshot',
  async (isolation) => {
    const s = scenario();
    await authorize(s);
    const store = await pay(0);
    await db.exec('begin isolation level ' + isolation);
    try {
      await expect(
        store.reserve(s.merchant, s.intent, s.digest),
      ).rejects.toThrow('read committed');
    } finally {
      await db.exec('rollback');
    }
    expect(await attempts()).toHaveLength(0);
  },
);
it.each(['succeeded', 'unknown'] as const)(
  'even a %s refund cannot automatically reopen the original invoice capture ceiling',
  async (status) => {
    const s = scenario(0, 4000);
    await authorize(s);
    await reserve(s);
    await finish(s, 'succeeded');
    let store = await pay(0);
    await store.recordObservation(s.merchant, {
      observationId: randomUUID(),
      key: s.intent.idempotencyKey,
      transactionId: 'fictional_' + s.intent.idempotencyKey,
      kind: 'capture',
      amountMinor: 4000,
      currency: 'USD',
      state: 'settled',
      digest: sha256('FICTIONAL TRUSTED OBSERVATION NOT BANK EVIDENCE'),
      observedAt: new Date().toISOString(),
    });
    const refund: SandboxRefund = {
      ...s.intent,
      authorizationId: randomUUID(),
      idempotencyKey: randomUUID(),
      amountMinor: 4000,
      captureKey: s.intent.idempotencyKey,
      providerTransactionId: 'fictional_' + s.intent.idempotencyKey,
    };
    const d = sha256('FICTIONAL REFUND ' + refund.idempotencyKey);
    await admin();
    await db.query(
      "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi','refund',4000,'USD',$6,'FICTIONAL REFUND AUTHORITY',$7)",
      [
        s.company.org,
        refund.authorizationId,
        s.merchant.merchantConfigId,
        s.company.customer,
        s.company.invoice,
        d,
        until,
      ],
    );
    store = await pay(0);
    expect((await store.reserveRefund(s.merchant, refund, d)).status).toBe(
      'reserved',
    );
    await store.finishRefund(s.merchant, refund, {
      status,
      provider: 'nmi',
      mode: 'sandbox',
      transactionId:
        status === 'succeeded'
          ? 'fictional_refund_' + refund.idempotencyKey
          : null,
      amountMinor: 4000,
      currency: 'USD',
    });
    const next = scenario(1, status === 'unknown' ? 1 : 6001);
    await authorize(next);
    await expect(reserve(next)).rejects.toThrow(
      status === 'unknown'
        ? 'Unresolved original invoice payment'
        : 'capacity exceeded',
    );
    expect(await attempts()).toHaveLength(2);
  },
);
it('a signed void-like callback is inbox evidence only and cannot release invoice capacity', async () => {
  const s = scenario(0, 10000);
  await authorize(s);
  await reserve(s);
  await finish(s, 'unknown');
  const store = await pay(0);
  const raw = Buffer.from(
    JSON.stringify({
      event_id: 'fictional_capacity_void',
      event_body: { transaction_id: 'fictional_unverified', state: 'voided' },
    }),
  );
  const value = 'FICTIONAL_CALLBACK_KEY';
  const signature =
    't=fictional_nonce,s=' +
    createHmac('sha256', value)
      .update('fictional_nonce.')
      .update(raw)
      .digest('hex');
  expect(
    await receiveSandboxPaymentWebhook(
      raw,
      signature,
      s.merchant,
      {
        organizationId: s.company.org,
        merchantConfigId: s.merchant.merchantConfigId,
        provider: 'nmi',
        value,
      },
      store,
    ),
  ).toBe('recorded');
  const next = scenario(1, 1);
  await authorize(next);
  await expect(reserve(next)).rejects.toThrow(
    'Unresolved original invoice payment',
  );
  expect(await attempts()).toHaveLength(1);
});
it('known local rollback before any external dispatch leaves no committed reservation; independent custody is not claimed', async () => {
  const s = scenario();
  await authorize(s);
  const store = await pay();
  await db.exec('begin');
  try {
    expect((await store.reserve(s.merchant, s.intent, s.digest)).status).toBe(
      'reserved',
    );
  } finally {
    await db.exec('rollback');
  }
  expect(await attempts()).toHaveLength(0);
});
it.each(['pending', 'unknown'] as const)(
  'a partial %s capture quarantines new identities even below the remaining nominal ceiling',
  async (status) => {
    const s = scenario(0, 4000);
    await authorize(s);
    await reserve(s);
    if (status === 'unknown') await finish(s, status);
    const before = await attempts();
    expect((await reserve(s)).status).toBe('unknown');
    const next = scenario(1, 1000);
    await authorize(next);
    await expect(reserve(next)).rejects.toThrow(
      'Unresolved original invoice payment',
    );
    expect(await attempts()).toEqual(before);
  },
);
async function waitForLocks(pids: number[]) {
  for (let n = 0; n < 100; n++) {
    const row = (
      await db.query<{ waiting: number }>(
        "select count(*)::int waiting from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'",
        [pids],
      )
    ).rows[0];
    if (row.waiting === pids.length) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error('Required native lock contention not observed');
}
it.skipIf(!db.fork)(
  'separate native workers cannot reserve two overlapping partial amounts through different merchants',
  async () => {
    const a = scenario(0, 6000),
      b = scenario(1, 6000);
    await authorize(a);
    await authorize(b);
    const x = await db.fork!(),
      y = await db.fork!();
    try {
      const one = await pay(0, x),
        two = await pay(1, y);
      const pids = [
        Number((await x.query('select pg_backend_pid() pid')).rows[0].pid),
        Number((await y.query('select pg_backend_pid() pid')).rows[0].pid),
      ];
      expect(pids[0]).not.toBe(pids[1]);
      await admin();
      await db.exec('begin');
      await db.query(
        'select id from private.commercial_invoice_drafts where organization_id=$1 and id=$2 for update',
        [a.company.org, a.company.invoice],
      );
      const pending = Promise.allSettled([
        one.reserve(a.merchant, a.intent, a.digest),
        two.reserve(b.merchant, b.intent, b.digest),
      ]);
      await waitForLocks(pids);
      await db.exec('commit');
      const results = await pending;
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await attempts()).toHaveLength(1);
    } finally {
      await admin();
      await db.exec('rollback');
      await x.close();
      await y.close();
    }
  },
);
it.skipIf(!db.fork)(
  'authorization expiry during the observed invoice wait prevents any new capture reservation',
  async () => {
    const s = scenario();
    await authorize(s, { expiresAt: new Date(Date.now() + 400).toISOString() });
    const peer = await db.fork!();
    let pending: Promise<unknown> | undefined;
    try {
      const store = await pay(0, peer);
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await admin();
      await db.exec('begin');
      await db.query(
        'select id from private.commercial_invoice_drafts where organization_id=$1 and id=$2 for update',
        [s.company.org, s.company.invoice],
      );
      pending = store.reserve(s.merchant, s.intent, s.digest);
      const denied = expect(pending).rejects.toThrow(/expired|authorization/);
      await waitForLocks([pid]);
      await new Promise((resolve) => setTimeout(resolve, 450));
      await db.exec('commit');
      await denied;
      expect(await attempts()).toHaveLength(0);
    } finally {
      await admin();
      await db.exec('rollback');
      if (pending) await pending.catch(() => {});
      await peer.close();
    }
  },
);
