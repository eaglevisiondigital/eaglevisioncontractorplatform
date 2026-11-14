import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { fictionalLaunchMerchants } from '../fixtures/first-launch-merchants';
import { ProviderControl } from '../../server/providers/control';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { NmiSandboxPaymentReader } from '../../server/payments/nmi-payment-lookup';
import type { SandboxIntent } from '../../server/payments/sandbox';
import type { SandboxRefund } from '../../server/payments/refunds';
import type { StatementRow } from '../../server/payments/reconciliation';

// Existing protected SQL/engines only; all identities and GET responses fictional.
const db = createTestDatabase(),
  until = new Date(Date.now() + 29 * 60_000).toISOString();
const digest = 'a'.repeat(64);
const launches = fictionalLaunchMerchants(until).map((launch) => ({
  ...launch,
  role: 'nmi_lookup_' + crypto.randomUUID().replaceAll('-', ''),
  customerId: crypto.randomUUID(),
  transactionId: 'fictional_lookup_' + launch.launchOrder,
  intent: {
    organizationId: launch.merchant.organizationId,
    merchantConfigId: launch.merchant.merchantConfigId,
    authorizationId: crypto.randomUUID(),
    invoiceId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 10000,
    currency: 'USD' as const,
    expiresAt: until,
  },
}));
let owner = 'postgres';
async function logout(connection: TestDatabase = db) {
  await connection.exec(`set session authorization ${owner}; reset role`);
}
async function login(index: number) {
  await db.exec(`set session authorization ${launches[index].role}`);
}
function store(index: number) {
  const m = launches[index].merchant;
  return new RestrictedSandboxStore(
    new ProviderControl(db, {
      organizationId: m.organizationId,
      scopeId: m.merchantConfigId,
      service: 'payment',
    }),
  );
}
async function authorize(
  index: number,
  intent: SandboxIntent,
  kind: 'capture' | 'refund',
) {
  const f = launches[index];
  await logout();
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi',$6,$7,'USD',$8,'FICTIONAL ONLY NOT PROVIDER AUTHORITY',$9)",
    [
      f.merchant.organizationId,
      intent.authorizationId,
      f.merchant.merchantConfigId,
      f.customerId,
      intent.invoiceId,
      kind,
      intent.amountMinor,
      digest,
      until,
    ],
  );
  await login(index);
}
async function seed(index: number, status: 'succeeded' | 'unknown') {
  const f = launches[index];
  await authorize(index, f.intent, 'capture');
  expect(await store(index).reserve(f.merchant, f.intent, digest)).toEqual({
    status: 'reserved',
  });
  await store(index).finish(f.merchant, f.intent, {
    provider: 'nmi',
    mode: 'sandbox',
    amountMinor: 10000,
    currency: 'USD',
    status,
    transactionId: status === 'succeeded' ? f.transactionId : null,
  });
}
async function snapshot(index: number) {
  const f = launches[index],
    peer = db.fork ? await db.fork() : db;
  try {
    await logout(peer);
    if (peer !== db)
      expect(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      ).not.toBe((await db.query('select pg_backend_pid() pid')).rows[0].pid);
    return (
      await peer.query(
        'select idempotency_key,status,result,(select count(*) from private.sandbox_gateway_observations where organization_id=$1) observations,(select count(*) from private.sandbox_gateway_settlements where organization_id=$1) settlements from private.sandbox_gateway_attempts where organization_id=$1 order by idempotency_key',
        [f.merchant.organizationId],
      )
    ).rows;
  } finally {
    if (peer !== db) await peer.close();
    await login(index);
  }
}
function expectation(index: number): StatementRow {
  const f = launches[index];
  return {
    organizationId: f.merchant.organizationId,
    merchantConfigId: f.merchant.merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    transactionId: f.transactionId,
    kind: 'capture',
    amountMinor: 10000,
    currency: 'USD',
  };
}
function reader(index: number, status = 'settled') {
  const f = launches[index],
    transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        object: 'transaction',
        id: f.transactionId,
        amount: '100.00',
        currency: 'USD',
        processor_id: 'fictional_processor_' + index,
        status,
        response: '1',
        actions: [
          {
            id: 'fictional_action_' + index,
            type: status === 'voided' ? 'void' : 'sale',
            amount: '100.00',
            success: true,
            response: '1',
          },
        ],
      }),
    );
  return {
    transport,
    value: new NmiSandboxPaymentReader(
      f.merchant,
      {
        organizationId: f.merchant.organizationId,
        merchantConfigId: f.merchant.merchantConfigId,
        provider: 'nmi',
        mode: 'sandbox',
        apiKey: 'fictional_only_lookup_key_' + index,
        processorId: 'fictional_processor_' + index,
      },
      transport,
    ),
  };
}
beforeAll(async () => {
  owner = String((await db.query('select session_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(owner)) throw Error('Unsafe fixture owner');
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  for (const f of launches) {
    await db.exec(
      `create role ${f.role} login nosuperuser nocreatedb nocreaterole nobypassrls; grant usage on schema private to ${f.role}; grant execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb) to ${f.role}`,
    );
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL ONLY',$2,'construction','active')",
      [f.merchant.organizationId, 'nmi-lookup-' + f.launchOrder],
    );
    await db.query(
      "insert into public.customers(id,organization_id,display_name) values($1,$2,'FICTIONAL ONLY')",
      [f.customerId, f.merchant.organizationId],
    );
    await db.query(
      "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,'nmi','FICTIONAL ONLY','sandbox','approved')",
      [f.merchant.merchantConfigId, f.merchant.organizationId],
    );
  }
});
beforeEach(async () => {
  await logout();
  await db.exec(
    'truncate private.provider_workloads,private.sandbox_gateway_authorizations,private.sandbox_gateway_attempts,private.sandbox_gateway_settlements cascade',
  );
  for (const f of launches)
    await db.query(
      "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
      [
        f.merchant.organizationId,
        f.role,
        f.merchant.merchantConfigId,
        until,
        digest,
      ],
    );
});
afterAll(async () => {
  await logout();
  for (const f of launches)
    await db.exec(`drop owned by ${f.role}; drop role ${f.role}`);
  await db.close();
});
it.each([0, 1])(
  'merchant%i lookup claiming settlement cannot create refund capacity or a canonical observation',
  async (index) => {
    const f = launches[index];
    await seed(index, 'succeeded');
    const before = await snapshot(index),
      r = reader(index);
    expect(String(before[0].observations)).toBe('0');
    expect(String(before[0].settlements)).toBe('0');
    expect(await r.value.read(expectation(index))).toMatchObject({
      reportedStatus: 'settled',
      settlement: 'UNVERIFIED',
      financialEffect: false,
    });
    expect(await snapshot(index)).toEqual(before);
    expect(r.transport).toHaveBeenCalledOnce();
    const refund: SandboxRefund = {
      ...f.intent,
      authorizationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      amountMinor: 2500,
      captureKey: f.intent.idempotencyKey,
      providerTransactionId: f.transactionId,
    };
    await authorize(index, refund, 'refund');
    await expect(
      store(index).reserveRefund(f.merchant, refund, digest),
    ).rejects.toThrow();
    expect(await snapshot(index)).toEqual(before);
  },
);
it.each([0, 1])(
  'merchant%i lookup claiming void cannot resolve canonical UNKNOWN or permit a replacement reservation',
  async (index) => {
    const f = launches[index];
    await seed(index, 'unknown');
    const before = await snapshot(index),
      r = reader(index, 'voided');
    expect(await r.value.read(expectation(index))).toMatchObject({
      reportedStatus: 'voided',
      settlement: 'UNVERIFIED',
      financialEffect: false,
    });
    expect(await snapshot(index)).toEqual(before);
    expect(await store(index).reserve(f.merchant, f.intent, digest)).toEqual({
      status: 'unknown',
    });
    expect(await snapshot(index)).toEqual(before);
    expect(r.transport).toHaveBeenCalledOnce();
  },
);
it('foreign merchant lookup fails before GET and leaves both canonical snapshots unchanged', async () => {
  await seed(0, 'unknown');
  await seed(1, 'succeeded');
  const before = [await snapshot(0), await snapshot(1)],
    r = reader(0);
  await expect(r.value.read(expectation(1))).rejects.toThrow();
  expect(r.transport).not.toHaveBeenCalled();
  expect([await snapshot(0), await snapshot(1)]).toEqual(before);
});
