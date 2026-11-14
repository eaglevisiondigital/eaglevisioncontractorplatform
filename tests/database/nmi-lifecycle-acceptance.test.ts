import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { fictionalLaunchMerchants } from '../fixtures/first-launch-merchants';
import { verifyNmiAcceptanceSources } from '../fixtures/nmi-lifecycle-sources';
import {
  SandboxGateway,
  type SandboxIntent,
} from '../../server/payments/sandbox';
import {
  captureReferencedToken,
  type SandboxTokenVault,
} from '../../server/payments/token-reference';
import {
  SandboxRefundGateway,
  type SandboxRefund,
} from '../../server/payments/refunds';
import { NmiSandboxPaymentReader } from '../../server/payments/nmi-payment-lookup';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { ProviderControl } from '../../server/providers/control';
import { receiveSandboxPaymentWebhook } from '../../server/payments/webhook-inbox';
import {
  reconcileStatement,
  type StatementRow,
} from '../../server/payments/reconciliation';
import { sha256 } from '../../server/providers/safety';

// Composes existing engines only. All permissions/keys/reports are FICTIONAL
// trusted fixtures, not operational Auth, tokenization, provider or bank evidence.
const db = createTestDatabase();
const until = new Date(Date.now() + 29 * 60_000).toISOString();
const launches = fictionalLaunchMerchants(until).map((f) => ({
  ...f,
  role: 'nmi_accept_' + crypto.randomUUID().replaceAll('-', ''),
  customerId: crypto.randomUUID(),
}));
let owner = 'postgres';
const leaseDigest = sha256('FICTIONAL LOCAL ACCEPTANCE LEASE');
async function logout(connection: TestDatabase = db) {
  await connection.exec(`set session authorization ${owner}; reset role`);
}
async function login(index: number) {
  await db.exec(`set session authorization ${launches[index].role}`);
}
function control(index: number) {
  const m = launches[index].merchant;
  return new ProviderControl(db, {
    organizationId: m.organizationId,
    scopeId: m.merchantConfigId,
    service: 'payment',
  });
}
function store(index: number) {
  return new RestrictedSandboxStore(control(index));
}
async function authorize(
  index: number,
  i: SandboxIntent,
  kind: 'capture' | 'refund',
  digest: string,
) {
  await logout();
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi',$6,$7,'USD',$8,'FICTIONAL ONLY NOT CONSENT OR AUTH-ONLY PROVIDER APPROVAL',$9)",
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
async function snapshot(index: number) {
  const peer = db.fork ? await db.fork() : db;
  try {
    await logout(peer);
    if (peer !== db)
      expect(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      ).not.toBe((await db.query('select pg_backend_pid() pid')).rows[0].pid);
    const org = launches[index].merchant.organizationId;
    const attempts = (
      await peer.query(
        'select idempotency_key,authorization_id,request_digest,kind,status,result from private.sandbox_gateway_attempts where organization_id=$1 order by idempotency_key',
        [org],
      )
    ).rows;
    const counts = (
      await peer.query(
        'select (select count(*)::int from private.sandbox_gateway_observations where organization_id=$1) observations,(select count(*)::int from private.sandbox_gateway_settlements where organization_id=$1) settlements,(select count(*)::int from private.sandbox_gateway_inbox where organization_id=$1) inbox,(select count(*)::int from private.sandbox_gateway_reconciliations where organization_id=$1) reconciliations',
        [org],
      )
    ).rows[0];
    return { attempts, ...counts };
  } finally {
    if (peer !== db) await peer.close();
    await login(index);
  }
}
function scenario(index: number) {
  const f = launches[index],
    m = f.merchant;
  const intent: SandboxIntent = {
    organizationId: m.organizationId,
    merchantConfigId: m.merchantConfigId,
    invoiceId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    amountMinor: 10000,
    currency: 'USD',
    expiresAt: until,
  };
  const token = {
    provider: 'nmi' as const,
    value: 'FICTIONAL_ONE_USE_TOKEN_' + index,
  };
  const reference = {
    id: crypto.randomUUID(),
    organizationId: m.organizationId,
    merchantConfigId: m.merchantConfigId,
    customerId: f.customerId,
    provider: 'nmi' as const,
    mode: 'sandbox' as const,
    expiresAt: until,
  };
  // Explicit prebound synthetic resolver; canonical SQL enforces durable one-use
  // authorization independently. This is not a token collection/vault writer.
  const resolve = vi.fn<SandboxTokenVault['resolve']>(async (scope) => {
    const { expiresAt: _expiresAt, ...binding } = reference;
    expect(_expiresAt).toBe(until);
    expect(scope).toEqual({
      ...binding,
      idempotencyKey: intent.idempotencyKey,
    });
    return { reference, token };
  });
  const digest = sha256(
    JSON.stringify({
      ...intent,
      provider: token.provider,
      tokenDigest: sha256(token.value),
    }),
  );
  const transactionId = 'fictional_sale_' + index;
  const expected: StatementRow = {
    organizationId: m.organizationId,
    merchantConfigId: m.merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    transactionId,
    kind: 'capture',
    amountMinor: intent.amountMinor,
    currency: 'USD',
  };
  const behavior = {
    sale: 'success' as 'success' | 'decline' | 'timeout',
    refund: 'success' as 'success' | 'timeout',
  };
  const facts = {
    object: 'transaction',
    id: transactionId,
    amount: '100.00',
    currency: 'USD',
    processor_id: 'fictional_processor_' + index,
    status: 'settled',
    response: '1',
    order_details: { order_id: intent.idempotencyKey },
    actions: [
      {
        id: 'fictional_action_' + index,
        type: 'sale',
        amount: '100.00',
        success: true,
        response: '1',
      },
    ],
    billing_address: { email: 'DO_NOT_RETAIN@example.invalid' },
  };
  const transport = vi.fn<typeof fetch>(async (url, options) => {
    expect(options?.redirect).toBe('error');
    if (options?.method === 'GET') {
      expect(url).toBe('https://sandbox.nmi.com/api/v5/payments/' + facts.id);
      return Response.json(facts);
    }
    expect(options?.method).toBe('POST');
    if (url === 'https://sandbox.nmi.com/api/v5/payments/sale') {
      expect(JSON.parse(String(options?.body))).toEqual({
        amount: 100,
        currency: 'USD',
        payment_details: { payment_token: token.value },
        order_details: { order_id: intent.idempotencyKey },
      });
      if (behavior.sale === 'timeout')
        throw Error('FICTIONAL ACK lost after submission');
      return Response.json({
        response: behavior.sale === 'decline' ? '2' : '1',
        id: transactionId,
        amount: '100.00',
        currency: 'USD',
        private: 'DO_NOT_RETAIN_PROVIDER_DETAIL',
      });
    }
    expect(url).toBe(
      'https://sandbox.nmi.com/api/v5/payments/' + transactionId + '/refund',
    );
    if (behavior.refund === 'timeout') throw Error('FICTIONAL REFUND ACK lost');
    return Response.json({
      response: '1',
      id: 'fictional_refund_' + index,
      amount: '25.00',
      currency: 'USD',
    });
  });
  const capture = new SandboxGateway(
    m,
    { apiKey: 'FICTIONAL_ONLY_KEY_' + index },
    store(index),
    transport,
  );
  const reader = new NmiSandboxPaymentReader(
    m,
    {
      organizationId: m.organizationId,
      merchantConfigId: m.merchantConfigId,
      provider: 'nmi',
      mode: 'sandbox',
      apiKey: 'FICTIONAL_ONLY_KEY_' + index,
      processorId: facts.processor_id,
    },
    transport,
  );
  return {
    f,
    m,
    intent,
    token,
    reference,
    resolve,
    digest,
    expected,
    facts,
    transport,
    behavior,
    capture,
    reader,
    run: (input = intent) =>
      captureReferencedToken(
        m,
        input,
        f.customerId,
        reference.id,
        { resolve },
        capture,
      ),
    refund: (): SandboxRefund => ({
      ...intent,
      authorizationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      amountMinor: 2500,
      captureKey: intent.idempotencyKey,
      providerTransactionId: transactionId,
    }),
    refundGateway: () =>
      new SandboxRefundGateway(
        m,
        { apiKey: 'FICTIONAL_ONLY_KEY_' + index },
        store(index),
        transport,
      ),
  };
}
function refundDigest(i: SandboxRefund) {
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
function signed(index: number, transactionId: string, state: string) {
  const m = launches[index].merchant,
    key = {
      organizationId: m.organizationId,
      merchantConfigId: m.merchantConfigId,
      provider: 'nmi' as const,
      value: 'FICTIONAL_CALLBACK_KEY_' + index,
    };
  const raw = Buffer.from(
    JSON.stringify({
      event_id: 'fictional_notice_' + transactionId,
      event_body: {
        transaction_id: transactionId,
        state,
        private: 'DO_NOT_RETAIN_CALLBACK_PRIVATE',
      },
    }),
  );
  const signature =
    't=fictional_accept_nonce,s=' +
    createHmac('sha256', key.value)
      .update('fictional_accept_nonce.')
      .update(raw)
      .digest('hex');
  return { raw, signature, key };
}
async function reconcile(index: number, rows: readonly StatementRow[]) {
  await login(index);
  const current = await store(index).transactions(launches[index].merchant);
  return store(index).reconcile(launches[index].merchant, {
    reportId: crypto.randomUUID(),
    digest: sha256('FICTIONAL STAFF-SUPPLIED REPORT ' + JSON.stringify(rows)),
    snapshot: String(current.snapshot),
    rows,
  });
}
async function settleFixture(index: number, s: ReturnType<typeof scenario>) {
  await login(index);
  return store(index).recordObservation(s.m, {
    observationId: crypto.randomUUID(),
    key: s.intent.idempotencyKey,
    transactionId: s.expected.transactionId,
    kind: 'capture',
    amountMinor: 10000,
    currency: 'USD',
    state: 'settled',
    digest: sha256('EXPLICIT TRUSTED SYNTHETIC OBSERVATION NOT PROVIDER PROOF'),
    observedAt: new Date().toISOString(),
  });
}
beforeAll(async () => {
  verifyNmiAcceptanceSources();
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
      [f.merchant.organizationId, 'nmi-accept-' + f.launchOrder],
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
    'truncate private.provider_workloads,private.sandbox_gateway_authorizations,private.sandbox_gateway_attempts,private.sandbox_gateway_settlements,private.sandbox_gateway_inbox,private.sandbox_gateway_reconciliations cascade',
  );
  for (const f of launches)
    await db.query(
      "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
      [
        f.merchant.organizationId,
        f.role,
        f.merchant.merchantConfigId,
        until,
        leaseDigest,
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
  'merchant%i SQL authorization feeds Sale, never auth-only/capture/void or customer receipt delivery',
  async (index) => {
    const s = scenario(index);
    await authorize(index, s.intent, 'capture', s.digest);
    await expect(
      s.run({ ...s.intent, operation: 'auth' } as SandboxIntent),
    ).rejects.toThrow('Unexpected payment fields');
    expect(s.resolve).not.toHaveBeenCalled();
    expect(s.transport).not.toHaveBeenCalled();
    expect((await s.run()).status).toBe('succeeded');
    expect(s.resolve).toHaveBeenCalledOnce();
    expect(s.transport).toHaveBeenCalledOnce();
    expect(await s.reader.read(s.expected)).toMatchObject({
      orderReference: s.intent.idempotencyKey,
      financialEffect: false,
      settlement: 'UNVERIFIED',
    });
    expect(s.transport.mock.calls.map(([url]) => String(url))).toEqual([
      'https://sandbox.nmi.com/api/v5/payments/sale',
      'https://sandbox.nmi.com/api/v5/payments/' + s.expected.transactionId,
    ]);
    const persisted = await snapshot(index);
    expect(persisted.attempts).toMatchObject([
      {
        status: 'succeeded',
        authorization_id: s.intent.authorizationId,
        result: { transactionId: s.expected.transactionId },
      },
    ]);
    expect(persisted).toMatchObject({
      observations: 0,
      settlements: 0,
      inbox: 0,
      reconciliations: 0,
    });
    expect(JSON.stringify(persisted)).not.toMatch(
      /FICTIONAL_ONE_USE_TOKEN|DO_NOT_RETAIN|FICTIONAL_ONLY_KEY/,
    );
  },
);
it.each([0, 1])(
  'merchant%i declined Sale plus contradictory successful GET cannot spend authorization twice',
  async (index) => {
    const s = scenario(index);
    s.behavior.sale = 'decline';
    await authorize(index, s.intent, 'capture', s.digest);
    expect((await s.run()).status).toBe('declined');
    const original = await snapshot(index);
    expect(await s.reader.read(s.expected)).toMatchObject({
      reportedStatus: 'settled',
      reportedResponse: '1',
      financialEffect: false,
    });
    expect((await s.run()).status).toBe('declined');
    await expect(
      s.capture.capture(
        { ...s.intent, idempotencyKey: crypto.randomUUID() },
        s.token,
      ),
    ).rejects.toThrow();
    expect(await snapshot(index)).toEqual(original);
    expect(s.transport).toHaveBeenCalledTimes(2); // one Sale, one GET; no replay POST
  },
);
it.each([0, 1])(
  'merchant%i lost Sale ACK plus signed void notice/GET/report keeps original UNKNOWN identity and refund denial',
  async (index) => {
    const s = scenario(index);
    s.behavior.sale = 'timeout';
    await authorize(index, s.intent, 'capture', s.digest);
    expect((await s.run()).status).toBe('unknown');
    const original = (await snapshot(index)).attempts;
    s.facts.status = 'voided';
    s.facts.actions[0].type = 'void';
    const cb = signed(index, s.expected.transactionId, 'voided');
    expect(
      await receiveSandboxPaymentWebhook(
        cb.raw,
        cb.signature,
        s.m,
        cb.key,
        store(index),
      ),
    ).toBe('recorded');
    expect(await s.reader.read(s.expected)).toMatchObject({
      reportedStatus: 'voided',
      financialEffect: false,
    });
    expect((await reconcile(index, [s.expected])).report).toMatchObject({
      balanced: false,
      unresolved: 1,
      unexpected: 1,
    });
    await expect(s.run()).rejects.toThrow(/reconciliation/);
    await expect(
      s.capture.capture(
        { ...s.intent, idempotencyKey: crypto.randomUUID() },
        s.token,
      ),
    ).rejects.toThrow();
    const refund = s.refund();
    await authorize(index, refund, 'refund', refundDigest(refund));
    await expect(s.refundGateway().refund(refund)).rejects.toThrow(
      /Settled matching/,
    );
    expect((await snapshot(index)).attempts).toEqual(original);
    expect(await snapshot(index)).toMatchObject({
      observations: 0,
      settlements: 0,
      inbox: 1,
      reconciliations: 1,
    });
    expect(s.transport).toHaveBeenCalledTimes(2);
  },
);
it.each([0, 1])(
  'merchant%i balanced report/signed settled notice/GET stays nonfinancial until separate fixture observation, then exact partial refund reconciles',
  async (index) => {
    const s = scenario(index);
    await authorize(index, s.intent, 'capture', s.digest);
    expect((await s.run()).status).toBe('succeeded');
    const cb = signed(index, s.expected.transactionId, 'settled');
    expect(
      await receiveSandboxPaymentWebhook(
        cb.raw,
        cb.signature,
        s.m,
        cb.key,
        store(index),
      ),
    ).toBe('recorded');
    expect((await s.reader.read(s.expected)).settlement).toBe('UNVERIFIED');
    const report = await reconcile(index, [s.expected]);
    expect(report.report).toMatchObject({
      balanced: true,
      unresolved: 0,
      expectedNetMinor: '10000',
      reportedNetMinor: '10000',
    });
    expect(reconcileStatement(s.m, [s.expected], [s.expected])).toMatchObject({
      balanced: true,
    });
    const held = s.refund();
    await authorize(index, held, 'refund', refundDigest(held));
    await expect(s.refundGateway().refund(held)).rejects.toThrow(
      /Settled matching/,
    );
    expect(await snapshot(index)).toMatchObject({
      observations: 0,
      settlements: 0,
    });
    expect(s.transport).toHaveBeenCalledTimes(2);
    await settleFixture(index, s);
    const refund = s.refund();
    await authorize(index, refund, 'refund', refundDigest(refund));
    expect((await s.refundGateway().refund(refund)).status).toBe('succeeded');
    const refundRow: StatementRow = {
      ...s.expected,
      transactionId: 'fictional_refund_' + index,
      kind: 'refund',
      amountMinor: 2500,
    };
    Object.assign(s.facts, {
      id: refundRow.transactionId,
      amount: '25.00',
      order_details: { order_id: refund.idempotencyKey },
    });
    Object.assign(s.facts.actions[0], { type: 'refund', amount: '25.00' });
    expect(await s.reader.read(refundRow)).toMatchObject({
      expectation: refundRow,
      financialEffect: false,
      settlement: 'UNVERIFIED',
    });
    expect(
      (await reconcile(index, [s.expected, refundRow])).report,
    ).toMatchObject({
      balanced: true,
      expectedNetMinor: '7500',
      reportedNetMinor: '7500',
    });
    const original = await snapshot(index);
    expect((await s.refundGateway().refund(refund)).status).toBe('succeeded');
    expect(await snapshot(index)).toEqual(original);
    expect(original).toMatchObject({
      observations: 1,
      settlements: 1,
      inbox: 1,
      reconciliations: 2,
    });
    expect(s.transport).toHaveBeenCalledTimes(4); // Sale, capture GET, refund, refund GET
  },
);
it.each([0, 1])(
  'merchant%i refund ACK loss cannot be released by later void GET or callback, and reconciliation stays unresolved',
  async (index) => {
    const s = scenario(index);
    await authorize(index, s.intent, 'capture', s.digest);
    await s.run();
    await settleFixture(index, s);
    const refund = s.refund();
    await authorize(index, refund, 'refund', refundDigest(refund));
    s.behavior.refund = 'timeout';
    expect((await s.refundGateway().refund(refund)).status).toBe('unknown');
    const original = (await snapshot(index)).attempts;
    const refundRow: StatementRow = {
      ...s.expected,
      transactionId: 'fictional_unknown_refund_' + index,
      kind: 'refund',
      amountMinor: 2500,
    };
    Object.assign(s.facts, {
      id: refundRow.transactionId,
      amount: '25.00',
      status: 'voided',
    });
    s.facts.actions[0].type = 'void';
    expect((await s.reader.read(refundRow)).financialEffect).toBe(false);
    const cb = signed(index, refundRow.transactionId, 'voided');
    expect(
      await receiveSandboxPaymentWebhook(
        cb.raw,
        cb.signature,
        s.m,
        cb.key,
        store(index),
      ),
    ).toBe('recorded');
    expect(
      (await reconcile(index, [s.expected, refundRow])).report,
    ).toMatchObject({ balanced: false, unresolved: 1, unexpected: 1 });
    await expect(s.refundGateway().refund(refund)).rejects.toThrow(
      /reconciliation/,
    );
    const replacement = { ...s.refund(), amountMinor: 7501 };
    await authorize(index, replacement, 'refund', refundDigest(replacement));
    await expect(s.refundGateway().refund(replacement)).rejects.toThrow(
      /capacity/,
    );
    expect((await snapshot(index)).attempts).toEqual(original);
    expect(s.transport).toHaveBeenCalledTimes(3); // Sale, one refund submission, one GET
  },
);
it.each([0, 1])(
  'merchant%i rejects changed transaction/foreign report rows and stale reconciliation snapshot across a new refund',
  async (index) => {
    const s = scenario(index);
    await authorize(index, s.intent, 'capture', s.digest);
    await s.run();
    await settleFixture(index, s);
    s.facts.id = 'fictional_changed_id';
    // The transport receives the original request but returns a different ID.
    s.transport.mockImplementationOnce(async () => Response.json(s.facts));
    await expect(s.reader.read(s.expected)).rejects.toThrow(
      'no financial conclusion',
    );
    const original = await snapshot(index);
    await expect(
      reconcile(index, [
        {
          ...s.expected,
          organizationId: launches[1 - index].merchant.organizationId,
        },
      ]),
    ).rejects.toThrow('Statement tenant denied');
    expect(await snapshot(index)).toEqual(original);
    const current = await store(index).transactions(s.m);
    const refund = s.refund();
    await authorize(index, refund, 'refund', refundDigest(refund));
    await s.refundGateway().refund(refund);
    await expect(
      store(index).reconcile(s.m, {
        reportId: crypto.randomUUID(),
        digest: sha256('FICTIONAL STALE REPORT'),
        snapshot: String(current.snapshot),
        rows: [s.expected],
      }),
    ).rejects.toThrow('Reconciliation snapshot changed');
    const conflict = await reconcile(index, [
      { ...s.expected, amountMinor: 9999 },
      { ...s.expected, transactionId: 'fictional_unexpected', amountMinor: 1 },
    ]);
    expect(conflict.report).toMatchObject({
      balanced: false,
      missing: 1,
      unexpected: 1,
      conflicts: 1,
    });
    expect(s.transport).toHaveBeenCalledTimes(3);
  },
);
it.each([0, 1])(
  'merchant%i committed finish with lost ACK reconciles through read-only transactions without another token resolution or Sale',
  async (index) => {
    const s = scenario(index);
    await authorize(index, s.intent, 'capture', s.digest);
    let loseFinishAck = true;
    const lost = new RestrictedSandboxStore(
      new ProviderControl(
        {
          async query<T extends Record<string, unknown>>(
            sql: string,
            params: unknown[] = [],
          ) {
            const result = await db.query<T>(sql, params);
            if (params[2] === 'finish' && loseFinishAck) {
              loseFinishAck = false;
              throw Error('FICTIONAL database commit ACK lost');
            }
            return result;
          },
        },
        {
          organizationId: s.m.organizationId,
          scopeId: s.m.merchantConfigId,
          service: 'payment',
        },
      ),
    );
    const capture = new SandboxGateway(
      s.m,
      { apiKey: 'FICTIONAL_ONLY_KEY_' + index },
      lost,
      s.transport,
    );
    await expect(
      captureReferencedToken(
        s.m,
        s.intent,
        s.f.customerId,
        s.reference.id,
        { resolve: s.resolve },
        capture,
      ),
    ).rejects.toThrow(
      'Payment acknowledgment UNKNOWN; reconcile original intent',
    );
    const committed = await snapshot(index);
    expect(committed.attempts).toMatchObject([
      {
        status: 'succeeded',
        authorization_id: s.intent.authorizationId,
        request_digest: s.digest,
        result: { transactionId: s.expected.transactionId },
      },
    ]);
    expect((await s.reader.read(s.expected)).settlement).toBe('UNVERIFIED');
    const current = await store(index).transactions(s.m);
    expect(current.transactions).toEqual([
      {
        key: s.intent.idempotencyKey,
        status: 'succeeded',
        kind: 'capture',
        amountMinor: s.intent.amountMinor,
        transactionId: s.expected.transactionId,
      },
    ]);
    expect(s.resolve).toHaveBeenCalledOnce();
    expect(s.transport.mock.calls.map(([url]) => String(url))).toEqual([
      'https://sandbox.nmi.com/api/v5/payments/sale',
      'https://sandbox.nmi.com/api/v5/payments/' + s.expected.transactionId,
    ]);
    expect(await snapshot(index)).toEqual(committed);
    expect(committed).toMatchObject({
      observations: 0,
      settlements: 0,
      inbox: 0,
      reconciliations: 0,
    });
    expect(s.transport).toHaveBeenCalledTimes(2);
  },
);
