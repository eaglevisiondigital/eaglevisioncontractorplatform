import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { ProviderControl } from '../../server/providers/control';
import { sha256 } from '../../server/providers/safety';
import { captureInvoicePaymentReceiptProposal } from '../../proposals/invoice-payment-receipt/qualification';
import {
  readOriginalInvoicePayment,
  type OriginalInvoicePayment,
} from '../../proposals/invoice-payment-receipt/reader';
import type {
  SandboxIntent,
  SandboxMerchant,
  SandboxResult,
} from '../../server/payments/sandbox';
import type { SandboxRefund } from '../../server/payments/refunds';

// Actual original writers, local synthetic principals. No provider port is used.
const db = createTestDatabase();
let owner = 'postgres';
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
  'propel_invoice_payment_test_owner',
];
function fixtureRoles(sql: string) {
  return sql
    .replaceAll('propel_commercial_draft_owner', fixtureRoleNames[0])
    .replaceAll('propel_commercial_draft_runtime', fixtureRoleNames[1])
    .replaceAll('propel_commercial_issue_runtime', fixtureRoleNames[2])
    .replaceAll('propel_commercial_payment_guard_owner', fixtureRoleNames[3])
    .replaceAll('propel_invoice_payment_reader_owner', fixtureRoleNames[4]);
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
  const p = await captureInvoicePaymentReceiptProposal();
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
  await db.exec(fixtureRoles(p.capacitySql));
  await db.exec(fixtureRoles(p.receiptSql));
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
beforeEach(async () => {
  await admin();
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
function original(
  s: Scenario,
  kind: 'capture' | 'refund' = 'capture',
  captureKey: string | null = null,
): OriginalInvoicePayment {
  return {
    organizationId: s.company.org,
    merchantConfigId: s.merchant.merchantConfigId,
    provider: s.merchant.provider,
    mode: 'sandbox',
    invoiceId: s.company.invoice,
    customerId: s.company.customer,
    sourceVersionId: s.company.version,
    sourceHash: s.company.hash,
    revision: s.company.revision,
    issueCommandId: s.company.receipt,
    attemptKey: s.intent.idempotencyKey,
    authorizationId: s.intent.authorizationId,
    requestDigest: s.digest,
    kind,
    captureKey,
  };
}
async function read(
  id: OriginalInvoicePayment,
  index = 0,
  c: TestDatabase = db,
) {
  await c.exec('set session authorization ' + readers[index]);
  return readOriginalInvoicePayment(
    {
      query: async <T extends Record<string, unknown>>(
        q: string,
        p?: unknown[],
      ) => {
        const result = await c.query<T>(q, p);
        return { rows: result.rows };
      },
    },
    merchants[index],
    id,
    {
      testOnly: true,
      signal: null,
    },
  );
}
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
it('links partial original capture to exact original issuance and never claims balance or settlement', async () => {
  const s = await prepared();
  const before = await counts();
  const r = await read(original(s));
  expect(r).toMatchObject({
    outcome: 'LINKED',
    paymentReceipt: 'RECORDED_GATEWAY_OUTCOME',
    receipt: { amountMinor: 4000, kind: 'capture', status: 'succeeded' },
    holdRelease: false,
    balance: 'NOT_ESTABLISHED',
    settlement: 'UNVERIFIED',
    cancellation: 'UNVERIFIED',
    dispute: 'UNVERIFIED',
    customerDelivery: 'BLOCKED',
  });
  expect(JSON.stringify(r)).not.toContain('fictional_');
  expect(await counts()).toEqual(before);
});
it('actual committed capture finish ACK loss reopens only original key without another writer or event', async () => {
  const s = await prepared('pending');
  await db.exec('set session authorization ' + roles[0]);
  const lost = new RestrictedSandboxStore(
    new ProviderControl(
      {
        query: async <T extends Record<string, unknown>>(
          q: string,
          p?: unknown[],
        ) => {
          const r = await db.query<T>(q, p);
          if (q.includes('sandbox_gateway_control') && p?.[2] === 'finish')
            throw Error('ACTUAL COMMIT ACK LOST');
          return r;
        },
      },
      {
        organizationId: s.company.org,
        scopeId: s.merchant.merchantConfigId,
        service: 'payment',
      },
    ),
  );
  await expect(
    lost.finish(s.merchant, s.intent, {
      status: 'succeeded',
      provider: 'nmi',
      mode: 'sandbox',
      amountMinor: 4000,
      currency: 'USD',
      transactionId: 'fictional_lost_ack',
    }),
  ).rejects.toThrow();
  const before = await counts();
  expect((await read(original(s))).outcome).toBe('LINKED');
  expect(
    (await read({ ...original(s), attemptKey: randomUUID() })).outcome,
  ).toBe('UNKNOWN');
  expect(await counts()).toEqual(before);
});
it.each(['pending', 'unknown', 'declined'] as const)(
  '%s remains unresolved/declined without a payment or replay grant',
  async (status) => {
    const s = await prepared(status);
    expect(await read(original(s))).toMatchObject({
      outcome: 'LINKED',
      paymentReceipt:
        status === 'declined' ? 'DECLINED_GATEWAY_OUTCOME' : 'UNRESOLVED',
      receipt: { status },
      holdRelease: false,
      financialEffect: false,
      balance: 'NOT_ESTABLISHED',
    });
  },
);
it.each([
  'customerId',
  'invoiceId',
  'sourceVersionId',
  'issueCommandId',
  'attemptKey',
  'authorizationId',
] as const)(
  'different original %s cannot select another receipt',
  async (key) => {
    const s = await prepared();
    expect((await read({ ...original(s), [key]: randomUUID() })).outcome).toBe(
      'UNKNOWN',
    );
  },
);
it.each(['sourceHash', 'requestDigest', 'revision'] as const)(
  'changed source %s denies',
  async (key) => {
    const s = await prepared();
    expect(
      (
        await read({
          ...original(s),
          [key]: key === 'revision' ? 2 : 'f'.repeat(64),
        })
      ).outcome,
    ).toBe('UNKNOWN');
  },
);
it('other tenant and merchant workloads cannot read or substitute the original evidence', async () => {
  const s = await prepared();
  expect((await read(original(s), 1)).outcome).toBe('UNKNOWN');
  expect((await read(original(s), 2)).outcome).toBe('UNKNOWN');
  expect(
    (
      await read(
        {
          ...original(s),
          organizationId: companies[1].org,
          merchantConfigId: merchants[2].merchantConfigId,
        },
        2,
      )
    ).outcome,
  ).toBe('UNKNOWN');
});
it('current workload revocation and suspended merchant deny historical receipt reads', async () => {
  const s = await prepared();
  await admin();
  await db.query(
    'update private.provider_workloads set revoked_at=clock_timestamp() where db_role=$1',
    [readers[0]],
  );
  expect((await read(original(s))).outcome).toBe('UNKNOWN');
  await admin();
});
it('suspended merchant denies historical reads', async () => {
  const s = await prepared();
  await admin();
  await db.query(
    "update private.merchant_configurations set status='suspended' where id=$1",
    [merchants[0].merchantConfigId],
  );
  expect((await read(original(s))).outcome).toBe('UNKNOWN');
});
it('old authorization revocation preserves historical outcome only, never renews payment authority', async () => {
  const s = await prepared();
  await admin();
  await db.query(
    'update private.sandbox_gateway_authorizations set revoked_at=clock_timestamp() where id=$1',
    [s.intent.authorizationId],
  );
  expect(await read(original(s))).toMatchObject({
    outcome: 'LINKED',
    financialEffect: false,
    holdRelease: false,
  });
  await expect(reserve(s)).rejects.toThrow();
});
it.each(['succeeded', 'unknown', 'declined'] as const)(
  'refund %s receipt links only original capture, never releases capacity or proves settlement',
  async (refundStatus) => {
    const s = await prepared();
    await admin();
    await db.query(
      'insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) values($1,$2,$3)',
      [
        s.company.org,
        s.intent.idempotencyKey,
        sha256('FICTIONAL SETTLEMENT FIXTURE NOT BANK PROOF'),
      ],
    );
    const f = scenario(0, 1000);
    await authorize(f, { kind: 'refund' });
    const store = await pay();
    const refund: SandboxRefund = {
      ...f.intent,
      captureKey: s.intent.idempotencyKey,
      providerTransactionId: 'fictional_' + s.intent.idempotencyKey,
    };
    expect(
      (await store.reserveRefund(f.merchant, refund, f.digest)).status,
    ).toBe('reserved');
    await store.finishRefund(f.merchant, refund, {
      status: refundStatus,
      provider: 'nmi',
      mode: 'sandbox',
      transactionId: refundStatus === 'succeeded' ? 'fictional_refund' : null,
      amountMinor: 1000,
      currency: 'USD',
    });
    expect(
      await read(original(f, 'refund', s.intent.idempotencyKey)),
    ).toMatchObject({
      outcome: 'LINKED',
      receipt: {
        amountMinor: 1000,
        kind: 'refund',
        captureKey: s.intent.idempotencyKey,
      },
      balance: 'NOT_ESTABLISHED',
      holdRelease: false,
      settlement: 'UNVERIFIED',
    });
    expect((await read(original(f, 'refund', randomUUID()))).outcome).toBe(
      'UNKNOWN',
    );
  },
);
it('no reader has table reads, old writer access or PUBLIC/customer execution; owner is NOLOGIN/NOBYPASSRLS', async () => {
  await admin();
  for (const r of ['anon', 'authenticated', 'service_role', ...readers]) {
    const row = (
      await db.query(
        "select has_table_privilege($1,'private.sandbox_gateway_attempts','SELECT') rd,has_function_privilege($1,'private.sandbox_gateway_control(uuid,uuid,text,jsonb)','EXECUTE') wr",
        [r],
      )
    ).rows[0];
    expect(row).toEqual({ rd: false, wr: false });
  }
  expect(
    (
      await db.query(
        'select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname=$1',
        [fixtureRoleNames[4]],
      )
    ).rows[0],
  ).toEqual({ rolcanlogin: false, rolsuper: false, rolbypassrls: false });
  await db.exec('set role authenticated');
  await expect(
    db.query(
      'select private.commercial_invoice_payment_receipt(null,null,null,null,null,null,null,null,null,null,null,null,null,null)',
    ),
  ).rejects.toThrow();
});
it('forged customer JWT claims never appoint a dedicated payment reader', async () => {
  const s = await prepared();
  await admin();
  await claims(0);
  await db.exec('set role authenticated');
  expect(
    (
      await readOriginalInvoicePayment(
        {
          query: async <T extends Record<string, unknown>>(
            q: string,
            p?: unknown[],
          ) => ({ rows: (await db.query<T>(q, p)).rows }),
        },
        merchants[0],
        original(s),
        {
          testOnly: true,
          signal: null,
        },
      )
    ).outcome,
  ).toBe('UNKNOWN');
});

it('separate partial captures retain separate original receipts without calculating a balance', async () => {
  const first = await prepared('succeeded', 3000),
    second = await prepared('succeeded', 2000);
  const before = await counts();
  expect(await read(original(first))).toMatchObject({
    outcome: 'LINKED',
    receipt: { amountMinor: 3000, attemptKey: first.intent.idempotencyKey },
    balance: 'NOT_ESTABLISHED',
  });
  expect(await read(original(second))).toMatchObject({
    outcome: 'LINKED',
    receipt: { amountMinor: 2000, attemptKey: second.intent.idempotencyKey },
    balance: 'NOT_ESTABLISHED',
  });
  expect(await counts()).toEqual(before);
});
it('a contradictory typed refund source is denied instead of being silently replaced by capture source', async () => {
  const s = await prepared();
  await admin();
  await db.query(
    'insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) values($1,$2,$3)',
    [s.company.org, s.intent.idempotencyKey, sha256('FICTIONAL ONLY')],
  );
  const f = scenario(0, 1000);
  await authorize(f, { kind: 'refund', hash: 'f'.repeat(64) });
  const store = await pay();
  const refund: SandboxRefund = {
    ...f.intent,
    captureKey: s.intent.idempotencyKey,
    providerTransactionId: 'fictional_' + s.intent.idempotencyKey,
  };
  expect((await store.reserveRefund(f.merchant, refund, f.digest)).status).toBe(
    'reserved',
  );
  expect(
    (await read(original(f, 'refund', s.intent.idempotencyKey))).outcome,
  ).toBe('UNKNOWN');
});
it('terminal original payment receipt remains immutable and rereads never update invoice or attempt state', async () => {
  const s = await prepared();
  await admin();
  await expect(
    db.query(
      "update private.sandbox_gateway_attempts set status='declined' where organization_id=$1 and idempotency_key=$2",
      [s.company.org, s.intent.idempotencyKey],
    ),
  ).rejects.toThrow();
  const a = await read(original(s)),
    b = await read(original(s));
  expect(a).toEqual(b);
  expect(a.outcome).toBe('LINKED');
});
it.skipIf(!db.fork)(
  'current workload expiry during observed merchant lock wait withholds the original receipt',
  async () => {
    const s = await prepared();
    await admin();
    await db.exec('truncate private.provider_workloads');
    await db.query(
      "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
      [
        s.company.org,
        readers[0],
        s.merchant.merchantConfigId,
        new Date(Date.now() + 500).toISOString(),
        sha256('FICTIONAL SHORT READ'),
      ],
    );
    const peer = await db.fork!();
    let pending: ReturnType<typeof read> | undefined;
    try {
      await peer.exec('set session authorization ' + readers[0]);
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await db.exec('begin');
      await db.query(
        'select id from private.merchant_configurations where organization_id=$1 and id=$2 for update',
        [s.company.org, s.merchant.merchantConfigId],
      );
      pending = read(original(s), 0, peer);
      let observed = false;
      for (let i = 0; i < 100; i++) {
        if (
          (
            await db.query<{ waiting: boolean }>(
              "select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') waiting",
              [pid],
            )
          ).rows[0].waiting
        ) {
          observed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(observed).toBe(true);
      await new Promise((r) => setTimeout(r, 550));
      await db.exec('commit');
      expect((await pending).outcome).toBe('UNKNOWN');
    } finally {
      await admin();
      await db.exec('rollback');
      if (pending) await pending;
      await peer.close();
    }
  },
);
