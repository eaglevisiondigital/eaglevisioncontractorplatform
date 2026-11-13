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
import {
  SandboxGateway,
  type SandboxIntent,
} from '../../server/payments/sandbox';
import { receiveSandboxPaymentWebhook } from '../../server/payments/webhook-inbox';
import type { GatewaySql } from '../../server/payments/postgres-store';

// Existing SQL and adapters only. These fictional approvals are trusted test
// provisioning, never real merchant boarding, customer consent or provider facts.
const db = createTestDatabase();
const until = new Date(Date.now() + 29 * 60_000).toISOString();
const launches = fictionalLaunchMerchants(until).map((launch) => ({
  ...launch,
  role: 'nmi_refund_' + crypto.randomUUID().replaceAll('-', ''),
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
      [f.merchant.organizationId, 'nmi-refund-' + f.launchOrder],
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

it.each([0, 1])(
  'fictional merchant %i persists uncertain refund capacity through actual adapter and SQL without a replacement dispatch',
  async (index) => {
    const i = refund(index);
    await authorize(index, i, 'refund', refundDigest(i));
    const transport = vi.fn<typeof fetch>(async (url, options) => {
      expect(url).toBe(
        `https://sandbox.nmi.com/api/v5/payments/${i.providerTransactionId}/refund`,
      );
      expect(options?.redirect).toBe('error');
      expect(JSON.parse(String(options?.body))).toEqual({
        amount: 60,
        payment: 'creditcard',
      });
      throw Error('FICTIONAL provider outcome lost after submission');
    });
    expect(await gateway(index, transport).refund(i)).toEqual({
      status: 'unknown',
      provider: 'nmi',
      mode: 'sandbox',
      transactionId: null,
      amountMinor: 6000,
      currency: 'USD',
    });
    const persisted = await nativeRead(index, i.idempotencyKey);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      organization_id: i.organizationId,
      merchant_id: i.merchantConfigId,
      idempotency_key: i.idempotencyKey,
      authorization_id: i.authorizationId,
      capture_key: captureKey,
      amount_minor: '6000',
      status: 'unknown',
      request_digest: refundDigest(i),
      result: { status: 'unknown', transactionId: null },
    });
    // Fresh adapter/store instances must observe the existing SQL hold.
    await login(index);
    await expect(gateway(index, transport).refund(i)).rejects.toThrow(
      /reconciliation/,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    const replacement = refund(index, 4001);
    await authorize(index, replacement, 'refund', refundDigest(replacement));
    await expect(gateway(index, transport).refund(replacement)).rejects.toThrow(
      /capacity/,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await nativeRead(index, replacement.idempotencyKey)).toEqual([]);
    expect(await nativeRead(index, i.idempotencyKey)).toEqual(persisted);
    await login(1 - index);
    expect(
      (await store(1 - index).transactions(launches[1 - index].merchant))
        .transactions,
    ).toHaveLength(1);
  },
);

it('identical refund command UUIDs across the two fictional merchants remain separate and cannot borrow the other capture transaction', async () => {
  const sharedKey = crypto.randomUUID();
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      response: '1',
      id: 'fictional_refund',
      amount: '60.00',
      currency: 'USD',
    }),
  );
  const requests = [refund(0), refund(1)].map((i) => ({
    ...i,
    idempotencyKey: sharedKey,
  }));
  for (const [index, i] of requests.entries()) {
    await authorize(index, i, 'refund', refundDigest(i));
    expect((await gateway(index, transport).refund(i)).status).toBe(
      'succeeded',
    );
    expect(await nativeRead(index, sharedKey)).toMatchObject([
      {
        organization_id: i.organizationId,
        merchant_id: i.merchantConfigId,
        request_digest: refundDigest(i),
        status: 'succeeded',
      },
    ]);
  }
  expect(transport).toHaveBeenCalledTimes(2);
  const foreign = {
    ...refund(1, 1000),
    providerTransactionId: launches[0].transactionId,
  };
  await authorize(1, foreign, 'refund', refundDigest(foreign));
  await expect(gateway(1, transport).refund(foreign)).rejects.toThrow(
    /Settled matching/,
  );
  expect(transport).toHaveBeenCalledTimes(2);
  expect(await nativeRead(1, foreign.idempotencyKey)).toEqual([]);
});

function signedCallback(index: number, eventId: string, state = 'settled') {
  const merchant = launches[index].merchant;
  const key = {
    organizationId: merchant.organizationId,
    merchantConfigId: merchant.merchantConfigId,
    provider: 'nmi' as const,
    value: `fictional-private-signing-key-${index}-not-live`,
  };
  const raw = Buffer.from(
    JSON.stringify({
      event_id: eventId,
      organizationId: launches[1 - index].merchant.organizationId,
      merchantConfigId: launches[1 - index].merchant.merchantConfigId,
      event_body: {
        state,
        amount: '50.00',
        currency: 'USD',
        transaction_id: `fictional_unknown_transaction_${index}`,
        private: 'FICTIONAL do not persist raw callback data',
      },
    }),
  );
  const signature =
    't=fictional_native_nonce,s=' +
    createHmac('sha256', key.value)
      .update('fictional_native_nonce.')
      .update(raw)
      .digest('hex');
  return { merchant, key, raw, signature };
}
async function inboxRead(index: number, eventId: string) {
  const observer = db.fork ? await db.fork() : db;
  try {
    await logout(observer);
    return (
      await observer.query(
        'select organization_id,merchant_id,event_id,body_digest from private.sandbox_gateway_inbox where organization_id=$1 and merchant_id=$2 and event_id=$3',
        [
          launches[index].merchant.organizationId,
          launches[index].merchant.merchantConfigId,
          eventId,
        ],
      )
    ).rows;
  } finally {
    if (observer !== db) await observer.close();
  }
}

it.each([0, 1])(
  'signed settled callback for fictional merchant %i cannot resolve UNKNOWN or create refund capacity through actual SQL',
  async (index) => {
    const m = launches[index].merchant;
    const i: SandboxIntent = {
      organizationId: m.organizationId,
      merchantConfigId: m.merchantConfigId,
      invoiceId: crypto.randomUUID(),
      authorizationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      amountMinor: 5000,
      currency: 'USD',
      expiresAt: until,
    };
    const token = {
      provider: 'nmi' as const,
      value: 'fictional-one-use-token-not-live',
    };
    const digest = sha256(
      JSON.stringify({
        ...i,
        provider: token.provider,
        tokenDigest: sha256(token.value),
      }),
    );
    await authorize(index, i, 'capture', digest);
    const transport = vi.fn<typeof fetch>(async () => {
      throw Error('FICTIONAL capture transport loss after request submission');
    });
    const capture = new SandboxGateway(
      m,
      { apiKey: 'fictional-only' },
      store(index),
      transport,
    );
    expect((await capture.capture(i, token)).status).toBe('unknown');
    const original = await nativeRead(index, i.idempotencyKey);
    expect(original).toHaveLength(1);
    expect(original[0]).toMatchObject({
      status: 'unknown',
      request_digest: digest,
    });

    const eventId = 'fictional_settled_for_unknown';
    const callback = signedCallback(index, eventId);
    const commands: unknown[][] = [];
    const callbackPort: GatewaySql = {
      async query<T extends Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ) {
        commands.push(params);
        return db.query<T>(sql, params);
      },
    };
    const inbox = new RestrictedSandboxStore(
      new ProviderControl(callbackPort, {
        organizationId: m.organizationId,
        scopeId: m.merchantConfigId,
        service: 'payment',
      }),
    );
    await login(index);
    for (const changed of [
      {
        raw: Buffer.concat([callback.raw, Buffer.from(' ')]),
        key: callback.key,
      },
      {
        raw: callback.raw,
        key: {
          ...callback.key,
          value: signedCallback(1 - index, eventId).key.value,
        },
      },
    ]) {
      await expect(
        receiveSandboxPaymentWebhook(
          changed.raw,
          callback.signature,
          m,
          changed.key,
          inbox,
        ),
      ).rejects.toThrow(/signature/);
      expect(commands).toEqual([]);
    }
    expect(await inboxRead(index, eventId)).toEqual([]);
    await login(index);
    expect(
      await receiveSandboxPaymentWebhook(
        callback.raw,
        callback.signature,
        m,
        callback.key,
        inbox,
      ),
    ).toBe('recorded');
    expect(commands.map((p) => p[2])).toEqual(['webhook']);
    expect(await inboxRead(index, eventId)).toEqual([
      {
        organization_id: m.organizationId,
        merchant_id: m.merchantConfigId,
        event_id: eventId,
        body_digest: sha256(callback.raw),
      },
    ]);
    expect(JSON.stringify(commands)).not.toContain('do not persist');
    expect(await nativeRead(index, i.idempotencyKey)).toEqual(original);

    // Explicit separate read/reconciliation, never a callback-driven money transition.
    await login(index);
    const current = await store(index).transactions(m);
    const report = await store(index).reconcile(m, {
      reportId: crypto.randomUUID(),
      digest: sha256('FICTIONAL provider statement'),
      snapshot: String(current.snapshot),
      rows: [
        {
          organizationId: m.organizationId,
          merchantConfigId: m.merchantConfigId,
          provider: 'nmi',
          mode: 'sandbox',
          currency: 'USD',
          kind: 'capture',
          transactionId: launches[index].transactionId,
          amountMinor: 10000,
        },
        {
          organizationId: m.organizationId,
          merchantConfigId: m.merchantConfigId,
          provider: 'nmi',
          mode: 'sandbox',
          currency: 'USD',
          kind: 'capture',
          transactionId: `fictional_unknown_transaction_${index}`,
          amountMinor: 5000,
        },
      ],
    });
    expect(report.report).toMatchObject({
      balanced: false,
      unresolved: 1,
      missing: 0,
      unexpected: 1,
      conflicts: 0,
      expectedNetMinor: '10000',
      reportedNetMinor: '15000',
    });
    // Even a separately submitted synthetic observation cannot rewrite UNKNOWN or
    // manufacture a settled successful capture. It is not genuine provider proof.
    await store(index).recordObservation(m, {
      observationId: crypto.randomUUID(),
      key: i.idempotencyKey,
      transactionId: `fictional_unknown_transaction_${index}`,
      kind: 'capture',
      amountMinor: 5000,
      currency: 'USD',
      state: 'settled',
      digest: sha256('FICTIONAL observation'),
      observedAt: new Date().toISOString(),
    });
    const requestedRefund = {
      ...refund(index, 1000),
      invoiceId: i.invoiceId,
      captureKey: i.idempotencyKey,
      providerTransactionId: `fictional_unknown_transaction_${index}`,
    };
    await authorize(
      index,
      requestedRefund,
      'refund',
      refundDigest(requestedRefund),
    );
    await expect(
      gateway(index, transport).refund(requestedRefund),
    ).rejects.toThrow(/Settled matching/);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await nativeRead(index, requestedRefund.idempotencyKey)).toEqual([]);
    expect(await nativeRead(index, i.idempotencyKey)).toEqual(original);
    await logout();
    expect(
      (
        await db.query(
          'select count(*)::int n from private.sandbox_gateway_settlements where organization_id=$1 and capture_key=$2',
          [m.organizationId, i.idempotencyKey],
        )
      ).rows[0].n,
    ).toBe(0);
  },
);

it('signed inbox ACK loss commits only exact event identity and preserves conflicting replay denial independently per merchant', async () => {
  const eventId = 'fictional_same_event_two_merchants';
  for (const index of [0, 1]) {
    const callback = signedCallback(index, eventId);
    const actions: unknown[] = [];
    let lose = true;
    const port: GatewaySql = {
      async query<T extends Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ) {
        actions.push(params[2]);
        const response = await db.query<T>(sql, params);
        if (lose) {
          lose = false;
          throw Error('FICTIONAL ACK loss after actual inbox COMMIT');
        }
        return response;
      },
    };
    const inbox = new RestrictedSandboxStore(
      new ProviderControl(port, {
        organizationId: callback.merchant.organizationId,
        scopeId: callback.merchant.merchantConfigId,
        service: 'payment',
      }),
    );
    const receive = (event = callback) =>
      receiveSandboxPaymentWebhook(
        event.raw,
        event.signature,
        event.merchant,
        event.key,
        inbox,
      );
    await login(index);
    await expect(receive()).rejects.toThrow(
      'Webhook acknowledgment UNKNOWN; reconcile original event',
    );
    expect(actions).toEqual(['webhook']);
    const persisted = await inboxRead(index, eventId);
    expect(persisted).toEqual([
      {
        organization_id: callback.merchant.organizationId,
        merchant_id: callback.merchant.merchantConfigId,
        event_id: eventId,
        body_digest: sha256(callback.raw),
      },
    ]);
    // Simulate explicit provider duplicate delivery with identical authenticated
    // identity. This is not an automatic mutator retry after UNKNOWN.
    await login(index);
    expect(await receive()).toBe('duplicate');
    await expect(
      receive(signedCallback(index, eventId, 'declined')),
    ).rejects.toThrow(/UNKNOWN/);
    expect(actions).toEqual(['webhook', 'webhook', 'webhook']);
    expect(await inboxRead(index, eventId)).toEqual(persisted);
    await login(index);
    expect(
      (await store(index).transactions(callback.merchant)).transactions,
    ).toHaveLength(1);
  }
});

function signal() {
  let complete!: () => void;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, complete: () => complete() };
}
function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
async function nativeBlockedBy(blockedPid: number, blockerPid: number) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const result = await db.query<{
      blocked: boolean;
      wait_event_type: string;
    }>(
      'select $1::int=any(pg_blocking_pids(pid)) blocked,wait_event_type from pg_stat_activity where pid=$2::int',
      [blockerPid, blockedPid],
    );
    if (result.rows[0]?.blocked && result.rows[0].wait_event_type === 'Lock')
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error(
    'Independent native callback did not wait for the exact first backend',
  );
}

it
  .skipIf(!db.fork)
  .each(
    [0, 1].flatMap((index) =>
      ['duplicate', 'conflict'].map((variant) => ({ index, variant })),
    ),
  )(
  'native simultaneous signed callbacks merchant $index $variant retain one immutable event without a financial transition',
  async ({ index, variant }) => {
    const m = launches[index].merchant;
    await login(index);
    const prior = await store(index).transactions(m);
    await logout();
    const financialCounts =
      'select (select count(*)::int from private.sandbox_gateway_settlements where organization_id=$1) settlements,(select count(*)::int from private.sandbox_gateway_reconciliations where organization_id=$1) reconciliations';
    const priorFinancial = (await db.query(financialCounts, [m.organizationId]))
      .rows[0];
    const first = await db.fork!(),
      second = await db.fork!();
    const inserted = signal(),
      releaseCommit = signal();
    let firstSettled = false,
      secondSettled = false;
    let firstResult: ReturnType<typeof outcome<string>> | undefined;
    let secondResult: ReturnType<typeof outcome<string>> | undefined;
    const firstActions: unknown[] = [],
      secondActions: unknown[] = [];
    try {
      const firstPid = Number(
        (await first.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      const secondPid = Number(
        (await second.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      expect(firstPid).not.toBe(secondPid);
      for (const peer of [first, second])
        await peer.exec(`set session authorization ${launches[index].role}`);
      const eventId = 'fictional_parallel_' + crypto.randomUUID();
      const original = signedCallback(index, eventId);
      const next =
        variant === 'duplicate'
          ? original
          : signedCallback(index, eventId, 'declined');
      // Explicit trusted test transaction: the response cannot leave this port
      // until COMMIT. No operational connection factory or HTTP ACK is asserted.
      const firstPort: GatewaySql = {
        async query<T extends Record<string, unknown>>(
          sql: string,
          params: unknown[] = [],
        ) {
          firstActions.push(params[2]);
          await first.exec('begin');
          try {
            const result = await first.query<T>(sql, params);
            inserted.complete();
            await releaseCommit.promise;
            await first.exec('commit');
            return result;
          } catch (error) {
            await first.exec('rollback');
            throw error;
          }
        },
      };
      const secondPort: GatewaySql = {
        async query<T extends Record<string, unknown>>(
          sql: string,
          params: unknown[] = [],
        ) {
          secondActions.push(params[2]);
          return second.query<T>(sql, params);
        },
      };
      const inbox = (port: GatewaySql) =>
        new RestrictedSandboxStore(
          new ProviderControl(port, {
            organizationId: m.organizationId,
            scopeId: m.merchantConfigId,
            service: 'payment',
          }),
        );
      firstResult = outcome(
        receiveSandboxPaymentWebhook(
          original.raw,
          original.signature,
          m,
          original.key,
          inbox(firstPort),
        ),
      ).finally(() => {
        firstSettled = true;
      });
      await Promise.race([
        inserted.promise,
        firstResult.then(() => {
          throw Error(
            'First native inbox insert did not reach the commit gate',
          );
        }),
      ]);
      secondResult = outcome(
        receiveSandboxPaymentWebhook(
          next.raw,
          next.signature,
          m,
          next.key,
          inbox(secondPort),
        ),
      ).finally(() => {
        secondSettled = true;
      });
      await logout();
      await nativeBlockedBy(secondPid, firstPid);
      expect(firstSettled).toBe(false);
      expect(secondSettled).toBe(false);
      // The independent observer cannot see an uncommitted event or success ACK.
      expect(await inboxRead(index, eventId)).toEqual([]);
      releaseCommit.complete();
      expect(await firstResult).toEqual({ ok: true, value: 'recorded' });
      const delivered = await secondResult;
      if (variant === 'duplicate')
        expect(delivered).toEqual({ ok: true, value: 'duplicate' });
      else {
        expect(delivered.ok).toBe(false);
        if (delivered.ok) throw Error('Conflicting native event was accepted');
        expect(delivered.error).toBeInstanceOf(Error);
        expect((delivered.error as Error).message).toBe(
          'Webhook acknowledgment UNKNOWN; reconcile original event',
        );
      }
      expect(firstActions).toEqual(['webhook']);
      expect(secondActions).toEqual(['webhook']);
      expect(await inboxRead(index, eventId)).toEqual([
        {
          organization_id: m.organizationId,
          merchant_id: m.merchantConfigId,
          event_id: eventId,
          body_digest: sha256(original.raw),
        },
      ]);
      await login(index);
      expect(await store(index).transactions(m)).toEqual(prior);
      await logout();
      expect(
        (await db.query(financialCounts, [m.organizationId])).rows[0],
      ).toEqual(priorFinancial);
    } finally {
      releaseCommit.complete();
      await firstResult;
      await secondResult;
      for (const peer of [first, second]) {
        await peer.exec('rollback').catch(() => {});
        await peer.close();
      }
    }
  },
);
