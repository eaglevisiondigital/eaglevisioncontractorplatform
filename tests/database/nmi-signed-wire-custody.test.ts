import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { fictionalLaunchMerchants } from '../fixtures/first-launch-merchants';
import { ProviderControl } from '../../server/providers/control';
import { sha256 } from '../../server/providers/safety';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import {
  SandboxRefundGateway,
  type SandboxRefund,
} from '../../server/payments/refunds';
import type { SandboxIntent } from '../../server/payments/sandbox';
import { receiveSandboxPaymentWebhook } from '../../server/payments/webhook-inbox';

// Fixture setup reuses the original native NMI test contracts.
// Existing SQL and adapters only. These fictional approvals are trusted test
// provisioning, never real merchant boarding, customer consent or provider facts.
const native =
  !!process.env.EV_TEST_PG_SOCKET ||
  (process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true');
const db = createTestDatabase();
const until = new Date(Date.now() + 29 * 60_000).toISOString();
const launches = fictionalLaunchMerchants(until).map((launch) => ({
  ...launch,
  role: 'nmi_wire_' + crypto.randomUUID().replaceAll('-', ''),
  customerId: crypto.randomUUID(),
  transactionId: `fictional_capture_${launch.launchOrder}`,
}));
const invoiceId = crypto.randomUUID(),
  captureKey = crypto.randomUUID();
const fixtureDigest = 'a'.repeat(64);
let owner = 'postgres';

async function logout(connection: TestDatabase = db) {
  await connection.exec(`set session authorization ${owner}; reset role`);
}
async function login(index: number) {
  await db.exec(`set session authorization ${launches[index].role}`);
}
function store(index: number, connection: TestDatabase = db) {
  const m = launches[index].merchant;
  return new RestrictedSandboxStore(
    new ProviderControl(connection, {
      organizationId: m.organizationId,
      scopeId: m.merchantConfigId,
      service: 'payment',
    }),
  );
}
function refund(index: number, amountMinor = 6000): SandboxRefund {
  const m = launches[index].merchant;
  return {
    organizationId: m.organizationId,
    merchantConfigId: m.merchantConfigId,
    invoiceId,
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor,
    currency: 'USD',
    expiresAt: until,
    captureKey,
    providerTransactionId: launches[index].transactionId,
  };
}
function refundDigest(i: SandboxRefund) {
  // Exact existing public adapter request contract; source stays unchanged.
  return sha256(
    JSON.stringify([
      'nmi',
      i.organizationId,
      i.merchantConfigId,
      i.invoiceId,
      i.authorizationId,
      i.idempotencyKey,
      i.captureKey,
      i.providerTransactionId,
      i.amountMinor,
      i.currency,
      i.expiresAt,
      null,
      null,
    ]),
  );
}
async function authorize(
  index: number,
  i: SandboxIntent,
  kind: 'capture' | 'refund',
  digest: string,
) {
  await logout();
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi',$6,$7,'USD',$8,'FICTIONAL LOCAL ONLY NOT PROVIDER CONSENT',$9)",
    [
      i.organizationId,
      i.authorizationId,
      i.merchantConfigId,
      launches[index].customerId,
      i.invoiceId,
      kind,
      i.amountMinor,
      digest,
      until,
    ],
  );
  await login(index);
}
async function seededCapture(index: number) {
  const m = launches[index].merchant;
  const i: SandboxIntent = {
    organizationId: m.organizationId,
    merchantConfigId: m.merchantConfigId,
    invoiceId,
    authorizationId: crypto.randomUUID(),
    idempotencyKey: captureKey,
    amountMinor: 10000,
    currency: 'USD',
    expiresAt: until,
  };
  await authorize(index, i, 'capture', fixtureDigest);
  expect(await store(index).reserve(m, i, fixtureDigest)).toEqual({
    status: 'reserved',
  });
  await store(index).finish(m, i, {
    provider: 'nmi',
    mode: 'sandbox',
    currency: 'USD',
    status: 'succeeded',
    amountMinor: i.amountMinor,
    transactionId: launches[index].transactionId,
  });
  await store(index).recordObservation(m, {
    observationId: crypto.randomUUID(),
    key: captureKey,
    transactionId: launches[index].transactionId,
    kind: 'capture',
    amountMinor: 10000,
    currency: 'USD',
    state: 'settled',
    digest: fixtureDigest,
    observedAt: new Date().toISOString(),
  });
}
async function nativeRead(index: number, key: string) {
  // Fresh independent connection after autocommit, not a cached adapter result.
  const observer = db.fork ? await db.fork() : db;
  try {
    await logout(observer);
    return (
      await observer.query(
        'select organization_id,merchant_id,idempotency_key,authorization_id,capture_key,amount_minor::text,status,result,request_digest from private.sandbox_gateway_attempts where organization_id=$1 and idempotency_key=$2',
        [launches[index].merchant.organizationId, key],
      )
    ).rows;
  } finally {
    if (observer !== db) await observer.close();
  }
}
function gateway(index: number, transport: typeof fetch) {
  return new SandboxRefundGateway(
    launches[index].merchant,
    { apiKey: 'fictional-only-not-a-credential' },
    store(index),
    transport,
  );
}

beforeAll(async () => {
  owner = String((await db.query('select session_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(owner)) throw Error('Unsafe fixture owner');
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  for (const f of launches) {
    await db.exec(
      `create role ${f.role} login nosuperuser nocreatedb nocreaterole nobypassrls; grant usage on schema private to ${f.role}; grant execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb) to ${f.role}`,
    );
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL ONLY',$2,'construction','active')",
      [f.merchant.organizationId, 'nmi-wire-' + f.launchOrder],
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
    'truncate private.provider_workloads,private.sandbox_gateway_authorizations,private.sandbox_gateway_attempts,private.sandbox_gateway_settlements,private.sandbox_gateway_inbox cascade',
  );
  for (const f of launches) {
    await logout();
    await db.query(
      "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
      [
        f.merchant.organizationId,
        f.role,
        f.merchant.merchantConfigId,
        until,
        fixtureDigest,
      ],
    );
    await seededCapture(f.launchOrder - 1);
    expect(f).toMatchObject({ fictional: true, executionAuthorized: false });
  }
});
afterAll(async () => {
  await logout();
  for (const f of launches)
    await db.exec(`drop owned by ${f.role}; drop role ${f.role}`);
  await db.close();
});

async function readInbox(index: number) {
  const observer = db.fork ? await db.fork() : db;
  try {
    await logout(observer);
    return (
      await observer.query(
        'select event_id,body_digest from private.sandbox_gateway_inbox where organization_id=$1 and merchant_id=$2 order by event_id',
        [
          launches[index].merchant.organizationId,
          launches[index].merchant.merchantConfigId,
        ],
      )
    ).rows;
  } finally {
    if (observer !== db) await observer.close();
  }
}
async function financialCounts(index: number) {
  const observer = db.fork ? await db.fork() : db;
  try {
    await logout(observer);
    return (
      await observer.query(
        'select (select count(*)::int from private.sandbox_gateway_settlements where organization_id=$1) settlements,(select count(*)::int from private.sandbox_gateway_reconciliations where organization_id=$1) reconciliations',
        [launches[index].merchant.organizationId],
      )
    ).rows;
  } finally {
    if (observer !== db) await observer.close();
  }
}
const cases = [0, 1].flatMap((index) =>
  ['duplicate', 'escaped-duplicate', 'invalid-utf8'].map((mode) => ({
    index,
    mode,
  })),
);
it.runIf(native).each(cases)(
  'fictional merchant $index malformed signed $mode preserves durable UNKNOWN and cannot release capacity',
  async ({ index, mode }) => {
    const original = refund(index);
    await authorize(index, original, 'refund', refundDigest(original));
    const transport = vi.fn<typeof fetch>(async () => {
      throw Error('FICTIONAL acknowledgment lost after refund submission');
    });
    expect((await gateway(index, transport).refund(original)).status).toBe(
      'unknown',
    );
    const persisted = await nativeRead(index, original.idempotencyKey);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      organization_id: original.organizationId,
      merchant_id: original.merchantConfigId,
      idempotency_key: original.idempotencyKey,
      authorization_id: original.authorizationId,
      capture_key: original.captureKey,
      status: 'unknown',
      request_digest: refundDigest(original),
      result: { status: 'unknown', transactionId: null },
    });
    const before = await financialCounts(index);
    expect(before).toEqual([{ settlements: 1, reconciliations: 0 }]);
    const merchant = launches[index].merchant;
    const key = {
      organizationId: merchant.organizationId,
      merchantConfigId: merchant.merchantConfigId,
      provider: 'nmi' as const,
      value: `fictional-native-wire-signing-key-${index}`,
    };
    const valid = Buffer.from(
      JSON.stringify({
        event_id: 'fictional_decline_notice',
        organizationId: launches[1 - index].merchant.organizationId,
        event_body: {
          state: 'declined',
          transaction_id: launches[index].transactionId,
          private: 'FICTIONAL PRIVATE NOT FOR INBOX',
        },
      }),
    );
    const sign = (raw: Buffer) =>
      't=fictional_wire_nonce,s=' +
      createHmac('sha256', key.value)
        .update('fictional_wire_nonce.')
        .update(raw)
        .digest('hex');
    const raw =
      mode === 'invalid-utf8'
        ? Buffer.concat([
            Buffer.from(valid.toString().slice(0, -1) + ',"extra":"'),
            Buffer.from([0xc3, 0x28]),
            Buffer.from('"}'),
          ])
        : Buffer.from(
            mode === 'duplicate'
              ? '{"event_id":"fictional_original","event_id":"fictional_decline_notice","event_body":{"state":"declined"}}'
              : '{"event_id":"fictional_original","event_\\u0069d":"fictional_decline_notice","event_body":{"state":"declined"}}',
          );
    await login(1 - index);
    await expect(
      receiveSandboxPaymentWebhook(
        raw,
        sign(raw),
        launches[1 - index].merchant,
        key,
        store(1 - index),
      ),
    ).rejects.toThrow('Webhook merchant binding denied');
    expect(await readInbox(1 - index)).toEqual([]);
    await login(index);
    await expect(
      receiveSandboxPaymentWebhook(raw, sign(raw), merchant, key, store(index)),
    ).rejects.toThrow();
    expect(await readInbox(index)).toEqual([]);
    await login(index);
    expect(
      await receiveSandboxPaymentWebhook(
        valid,
        sign(valid),
        merchant,
        key,
        store(index),
      ),
    ).toBe('recorded');
    await login(index);
    expect(
      await receiveSandboxPaymentWebhook(
        valid,
        sign(valid),
        merchant,
        key,
        store(index),
      ),
    ).toBe('duplicate');
    expect(await readInbox(index)).toEqual([
      { event_id: 'fictional_decline_notice', body_digest: sha256(valid) },
    ]);
    expect(await readInbox(1 - index)).toEqual([]);
    expect(await financialCounts(index)).toEqual(before);
    expect(await nativeRead(index, original.idempotencyKey)).toEqual(persisted);
    const replacement = refund(index, 4001);
    await authorize(index, replacement, 'refund', refundDigest(replacement));
    await expect(gateway(index, transport).refund(replacement)).rejects.toThrow(
      /capacity/,
    );
    expect(transport).toHaveBeenCalledOnce();
    expect(await nativeRead(index, replacement.idempotencyKey)).toEqual([]);
    expect(await nativeRead(index, original.idempotencyKey)).toEqual(persisted);
  },
);
