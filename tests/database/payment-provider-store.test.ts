import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import {
  PostgresSandboxIntentStore,
  type GatewayDatabase,
} from '../../server/payments/postgres-store';
import type {
  SandboxIntent,
  SandboxMerchant,
  SandboxResult,
} from '../../server/payments/sandbox';
import type { SandboxRefund } from '../../server/payments/refunds';
const db = createTestDatabase(),
  org = crypto.randomUUID(),
  other = crypto.randomUUID(),
  customer = crypto.randomUUID(),
  merchantId = crypto.randomUUID();
const digest = 'a'.repeat(64);
const merchant: SandboxMerchant = {
  organizationId: org,
  merchantConfigId: merchantId,
  provider: 'nmi',
  mode: 'sandbox',
  approvalReference: 'Synthetic local fixture only',
  approvedUntil: new Date(Date.now() + 3600000).toISOString(),
};
function database(connection: TestDatabase): GatewayDatabase {
  return {
    async transaction(operation) {
      await connection.exec('begin');
      try {
        const value = await operation(connection);
        await connection.exec('commit');
        return value;
      } catch (e) {
        await connection.exec('rollback');
        throw e;
      }
    },
  };
}
const store = new PostgresSandboxIntentStore(database(db), org, merchantId);
function intent(amountMinor = 10000): SandboxIntent {
  return {
    organizationId: org,
    merchantConfigId: merchantId,
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    invoiceId: crypto.randomUUID(),
    amountMinor,
    currency: 'USD',
    expiresAt: merchant.approvedUntil,
  };
}
async function authorize(i: SandboxIntent, kind = 'capture', d = digest) {
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi',$6,$7,'USD',$8,'Synthetic local fixture NOT genuine provider consent',$9)",
    [
      org,
      i.authorizationId,
      merchantId,
      customer,
      i.invoiceId,
      kind,
      i.amountMinor,
      d,
      i.expiresAt,
    ],
  );
}
function result(
  i: SandboxIntent,
  status: SandboxResult['status'] = 'succeeded',
): SandboxResult {
  return {
    provider: 'nmi',
    mode: 'sandbox',
    currency: 'USD',
    status,
    amountMinor: i.amountMinor,
    transactionId: status === 'succeeded' ? 'synthetic_transaction' : null,
  };
}
async function capture() {
  const i = intent();
  await authorize(i);
  await store.reserve(merchant, i, digest);
  await store.finish(merchant, i, result(i));
  await db.query(
    'insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) values($1,$2,$3)',
    [org, i.idempotencyKey, 'b'.repeat(64)],
  );
  return i;
}
function refund(original: SandboxIntent, amountMinor: number): SandboxRefund {
  return {
    ...intent(amountMinor),
    invoiceId: original.invoiceId,
    captureKey: original.idempotencyKey,
    providerTransactionId: 'synthetic_transaction',
  };
}
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  await db.exec(readFileSync('server/payments/schema.proposed.sql', 'utf8'));
  for (const id of [org, other])
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'Synthetic provider fixture',$2,'construction','active')",
      [id, 'provider-' + id],
    );
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'Synthetic customer')",
    [customer, org],
  );
  await db.query(
    "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,'nmi','synthetic-account','sandbox','approved')",
    [merchantId, org],
  );
});
beforeEach(async () => {
  await db.exec(
    'reset role; truncate private.sandbox_gateway_settlements,private.sandbox_gateway_attempts,private.sandbox_gateway_authorizations cascade',
  );
  await db.query(
    "update private.merchant_configurations set status='approved' where id=$1",
    [merchantId],
  );
});
afterAll(async () => {
  await db.exec('reset role');
  await db.close();
});
it('durably replays an outcome through a new store without executing a second attempt', async () => {
  const i = intent();
  await authorize(i);
  expect(await store.reserve(merchant, i, digest)).toEqual({
    status: 'reserved',
  });
  await store.finish(merchant, i, result(i));
  const restarted = new PostgresSandboxIntentStore(
    database(db),
    org,
    merchantId,
  );
  expect(await restarted.reserve(merchant, i, digest)).toEqual({
    status: 'existing',
    result: result(i),
  });
  expect(
    (await db.query('select count(*) n from private.sandbox_gateway_attempts'))
      .rows[0].n,
  ).toBe(1);
});
it.each([
  'missing',
  'revoked',
  'expired',
  'changed-digest',
  'wrong-tenant',
  'wrong-merchant',
  'suspended',
])('denies %s authority before reserving', async (mode) => {
  const i = intent();
  if (mode !== 'missing') await authorize(i);
  if (mode === 'revoked')
    await db.query(
      'update private.sandbox_gateway_authorizations set revoked_at=now() where id=$1',
      [i.authorizationId],
    );
  if (mode === 'expired') i.expiresAt = '2020-01-01';
  if (mode === 'wrong-tenant') i.organizationId = other;
  if (mode === 'wrong-merchant') i.merchantConfigId = crypto.randomUUID();
  if (mode === 'suspended')
    await db.query(
      "update private.merchant_configurations set status='suspended' where id=$1",
      [merchantId],
    );
  await expect(
    store.reserve(
      merchant,
      i,
      mode === 'changed-digest' ? 'c'.repeat(64) : digest,
    ),
  ).rejects.toThrow();
  expect(
    (await db.query('select count(*) n from private.sandbox_gateway_attempts'))
      .rows[0].n,
  ).toBe(0);
});
it.each(['pending', 'unknown'])(
  'never retries a durable %s attempt',
  async (status) => {
    const i = intent();
    await authorize(i);
    await store.reserve(merchant, i, digest);
    if (status === 'unknown')
      await store.finish(merchant, i, result(i, 'unknown'));
    expect(await store.reserve(merchant, i, digest)).toEqual({
      status: 'unknown',
    });
  },
);
it('prevents authorization reuse under a different key', async () => {
  const i = intent();
  await authorize(i);
  await store.reserve(merchant, i, digest);
  await expect(
    store.reserve(
      merchant,
      { ...i, idempotencyKey: crypto.randomUUID() },
      digest,
    ),
  ).rejects.toThrow();
});
it('holds uncertain refund capacity and requires settled original merchant/invoice', async () => {
  const original = await capture(),
    a = refund(original, 6000);
  await authorize(a, 'refund');
  await store.reserveRefund(merchant, a, digest);
  await store.finishRefund(merchant, a, result(a, 'unknown'));
  const b = refund(original, 5000);
  await authorize(b, 'refund');
  await expect(store.reserveRefund(merchant, b, digest)).rejects.toThrow(
    /exceeds/,
  );
  const bad = refund(original, 100);
  bad.providerTransactionId = 'foreign_transaction';
  await authorize(bad, 'refund');
  await expect(store.reserveRefund(merchant, bad, digest)).rejects.toThrow(
    /matching/,
  );
});
it('declined refund releases capacity without mutating its immutable record', async () => {
  const original = await capture(),
    a = refund(original, 10000);
  await authorize(a, 'refund');
  await store.reserveRefund(merchant, a, digest);
  await store.finishRefund(merchant, a, result(a, 'declined'));
  const b = refund(original, 10000);
  await authorize(b, 'refund');
  expect(await store.reserveRefund(merchant, b, digest)).toEqual({
    status: 'reserved',
  });
  await expect(
    db.query(
      "update private.sandbox_gateway_attempts set status='succeeded' where idempotency_key=$1",
      [a.idempotencyKey],
    ),
  ).rejects.toThrow(/Immutable/);
});
it('does not equate successful capture response with settlement', async () => {
  const i = intent();
  await authorize(i);
  await store.reserve(merchant, i, digest);
  await store.finish(merchant, i, result(i));
  const r = refund(i, 100);
  await authorize(r, 'refund');
  await expect(store.reserveRefund(merchant, r, digest)).rejects.toThrow(
    /Settled/,
  );
});
it('rejects conflicting final outcomes and records revocation-after-submission outcome safely', async () => {
  const i = intent();
  await authorize(i);
  await store.reserve(merchant, i, digest);
  await db.query(
    'update private.sandbox_gateway_authorizations set revoked_at=now() where id=$1',
    [i.authorizationId],
  );
  await store.finish(merchant, i, result(i));
  await store.finish(merchant, i, result(i));
  await expect(
    store.finish(merchant, i, result(i, 'declined')),
  ).rejects.toThrow(/Immutable/);
  await expect(
    db.exec('delete from private.sandbox_gateway_attempts'),
  ).rejects.toThrow(/Immutable/);
});
it.each(['anon', 'authenticated'])(
  'private provider tables deny %s even after an accidental read grant via default-deny RLS',
  async (role) => {
    await capture();
    await db.exec('begin');
    try {
      await db.exec(
        `grant usage on schema private to ${role};grant select on private.sandbox_gateway_attempts to ${role}; set role ${role}`,
      );
      expect(
        (await db.query('select * from private.sandbox_gateway_attempts')).rows,
      ).toHaveLength(0);
      await expect(
        db.exec(
          'insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) select organization_id,idempotency_key,request_digest from private.sandbox_gateway_attempts',
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec('rollback;reset role');
    }
  },
);
it('foreign customer/merchant references cannot be inserted and audit events omit authorization payloads', async () => {
  const i = intent();
  await authorize(i);
  await store.reserve(merchant, i, digest);
  const events = (
    await db.query(
      "select * from public.activity_events where entity_type='sandbox_gateway_attempts'",
    )
  ).rows;
  expect(events.length).toBeGreaterThan(0);
  expect(JSON.stringify(events)).not.toContain(digest);
  await expect(
    db.query(
      'insert into private.sandbox_gateway_authorizations select $1,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at,revoked_at from private.sandbox_gateway_authorizations limit 1',
      [other],
    ),
  ).rejects.toThrow();
});
it.skipIf(!db.fork)(
  'native concurrent claims reserve once and concurrent partial refunds cannot overrun capture',
  async () => {
    const peer = await db.fork!(),
      otherStore = new PostgresSandboxIntentStore(
        database(peer),
        org,
        merchantId,
      );
    try {
      const i = intent();
      await authorize(i);
      const claims = await Promise.all([
        store.reserve(merchant, i, digest),
        otherStore.reserve(merchant, i, digest),
      ]);
      expect(claims.map((r) => r.status).sort()).toEqual([
        'reserved',
        'unknown',
      ]);
      await store.finish(merchant, i, result(i));
      await db.query(
        'insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) values($1,$2,$3)',
        [org, i.idempotencyKey, 'b'.repeat(64)],
      );
      const a = refund(i, 6000),
        b = refund(i, 6000);
      await authorize(a, 'refund');
      await authorize(b, 'refund');
      const outcomes = await Promise.allSettled([
        store.reserveRefund(merchant, a, digest),
        otherStore.reserveRefund(merchant, b, digest),
      ]);
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    } finally {
      await peer.close();
    }
  },
);

it('durably deduplicates signed webhook identity and rejects changed-payload replays', async () => {
  const event = crypto.randomUUID();
  expect(await store.recordWebhook(merchant, event, digest)).toBe('recorded');
  expect(
    await new PostgresSandboxIntentStore(
      database(db),
      org,
      merchantId,
    ).recordWebhook(merchant, event, digest),
  ).toBe('duplicate');
  await expect(
    store.recordWebhook(merchant, event, 'b'.repeat(64)),
  ).rejects.toThrow(/Conflicting/);
  await expect(
    store.recordWebhook({ ...merchant, organizationId: other }, event, digest),
  ).rejects.toThrow();
  await expect(
    db.exec('delete from private.sandbox_gateway_inbox'),
  ).rejects.toThrow(/immutable/i);
});
it('refund authority for another customer cannot reuse a matching invoice label', async () => {
  const original = await capture(),
    r = refund(original, 100),
    foreignCustomer = crypto.randomUUID();
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'Other synthetic customer')",
    [foreignCustomer, org],
  );
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi','refund',$6,'USD',$7,'Synthetic customer mismatch fixture',$8)",
    [
      org,
      r.authorizationId,
      merchantId,
      foreignCustomer,
      r.invoiceId,
      r.amountMinor,
      digest,
      r.expiresAt,
    ],
  );
  await expect(store.reserveRefund(merchant, r, digest)).rejects.toThrow(
    /matching/,
  );
});

it('SQL rejects sensitive/invalid result payloads and all four proposal tables retain RLS with no client grants', async () => {
  const i = intent();
  await authorize(i);
  await store.reserve(merchant, i, digest);
  await expect(
    db.query(
      "update private.sandbox_gateway_attempts set status='succeeded',result=$2::jsonb where idempotency_key=$1",
      [i.idempotencyKey, JSON.stringify({ ...result(i), supplier_cost: 123 })],
    ),
  ).rejects.toThrow();
  for (const table of [
    'sandbox_gateway_authorizations',
    'sandbox_gateway_attempts',
    'sandbox_gateway_settlements',
    'sandbox_gateway_inbox',
  ]) {
    expect(
      (
        await db.query(
          'select relrowsecurity from pg_class where oid=$1::regclass',
          ['private.' + table],
        )
      ).rows[0].relrowsecurity,
    ).toBe(true);
    for (const role of ['anon', 'authenticated'])
      expect(
        (
          await db.query(
            "select has_table_privilege($1,$2,'select,insert,update,delete') allowed",
            [role, 'private.' + table],
          )
        ).rows[0].allowed,
      ).toBe(false);
  }
});
