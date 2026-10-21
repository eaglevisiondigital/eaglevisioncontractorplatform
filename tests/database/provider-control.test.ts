import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { ProviderControl } from '../../server/providers/control';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import type {
  SandboxIntent,
  SandboxMerchant,
} from '../../server/payments/sandbox';
const db = createTestDatabase();
let originalRole = 'postgres';
const org = crypto.randomUUID(),
  other = crypto.randomUUID(),
  customer = crypto.randomUUID(),
  merchantId = crypto.randomUUID(),
  config = crypto.randomUUID();
const role = 'provider_' + crypto.randomUUID().replaceAll('-', '');
const senderDomainId = crypto.randomUUID();
const digest = 'a'.repeat(64),
  until = new Date(Date.now() + 29 * 60000).toISOString();
const m: SandboxMerchant = {
  organizationId: org,
  merchantConfigId: merchantId,
  provider: 'nmi',
  mode: 'sandbox',
  approvalReference: 'local synthetic ONLY',
  approvedUntil: until,
};
function store(connection: TestDatabase = db) {
  return new RestrictedSandboxStore(
    new ProviderControl(connection, {
      organizationId: org,
      scopeId: merchantId,
      service: 'payment',
    }),
  );
}
function email(connection: TestDatabase = db) {
  return new ProviderControl(connection, {
    organizationId: org,
    scopeId: config,
    service: 'email',
  });
}
function intent(): SandboxIntent {
  return {
    organizationId: org,
    merchantConfigId: merchantId,
    idempotencyKey: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    invoiceId: crypto.randomUUID(),
    amountMinor: 10000,
    currency: 'USD',
    expiresAt: until,
  };
}
async function authorize(i: SandboxIntent, kind = 'capture') {
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi',$6,$7,'USD',$8,'LOCAL SYNTHETIC NOT PROVIDER CONSENT',$9)",
    [
      org,
      i.authorizationId,
      merchantId,
      customer,
      i.invoiceId,
      kind,
      i.amountMinor,
      digest,
      until,
    ],
  );
}
async function login(connection: TestDatabase = db) {
  await connection.exec(`set session authorization ${role}`);
}
async function logout(connection: TestDatabase = db) {
  await connection.exec(
    `set session authorization ${originalRole}; reset role`,
  );
}
const result = {
  provider: 'nmi' as const,
  mode: 'sandbox' as const,
  currency: 'USD' as const,
  status: 'succeeded' as const,
  amountMinor: 10000,
  transactionId: 'synthetic_capture',
};
async function domain() {
  const d = {
    id: crypto.randomUUID(),
    version: 1,
    profileDigest: digest,
    accountId: 'synthetic-account',
    domainId: senderDomainId,
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    digest,
  };
  await email().command('domain', d);
  return d;
}
async function outbox(d: Awaited<ReturnType<typeof domain>>) {
  const p = {
    domainId: d.id,
    customerId: customer,
    documentId: crypto.randomUUID(),
    purpose: 'invoice_ready',
    key: digest,
    digest,
  };
  return { p, r: await email().command('prepare', p) };
}
beforeAll(async () => {
  originalRole = String((await db.query('select session_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(originalRole)) throw new Error('Unsafe test role');
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  await db.exec(
    `create role ${role} login nosuperuser nocreatedb nocreaterole nobypassrls; grant usage on schema private to ${role}; grant execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb),private.provider_email_control(uuid,uuid,text,jsonb) to ${role}`,
  );
  for (const id of [org, other])
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'LOCAL ONLY',$2,'construction','active')",
      [id, 'synthetic-' + id],
    );
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'LOCAL ONLY')",
    [customer, org],
  );
  await db.query(
    "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,'nmi','synthetic','sandbox','approved')",
    [merchantId, org],
  );
});
beforeEach(async () => {
  await logout();
  await db.exec(
    'truncate private.provider_workloads,private.sandbox_gateway_authorizations,private.sandbox_gateway_attempts,private.sandbox_gateway_settlements,private.sandbox_gateway_inbox,private.provider_email_sender_bindings,private.provider_email_domains cascade',
  );
  await db.query(
    'insert into private.provider_email_sender_bindings(organization_id,configuration_id,version,profile_digest,provider_account_id,domain_id,expires_at) values($1,$2,1,$3,$4,$5,$6)',
    [org, config, digest, 'synthetic-account', senderDomainId, until],
  );
  for (const [service, scope] of [
    ['payment', merchantId],
    ['email', config],
  ])
    await db.query(
      'insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,$3,$4,$5,$6)',
      [org, role, service, scope, until, digest],
    );
});
afterAll(async () => {
  await logout();
  await db.exec(`drop owned by ${role}; drop role ${role}`);
  await db.close();
});
it('migration creates no workload grants or public provider functions', async () => {
  const sql = readFileSync(
    'supabase/migrations/20261016185108_provider_sandbox_persistence.sql',
    'utf8',
  );
  expect(sql).not.toMatch(
    /create role|grant (?:execute|select|insert|update|usage) /i,
  );
  const r = await db.query<{ n: number }>(
    "select count(*)::int n from information_schema.routine_privileges where routine_schema='private' and routine_name in ('sandbox_gateway_control','provider_email_control') and grantee in ('PUBLIC','anon','authenticated')",
  );
  expect(r.rows[0].n).toBe(0);
});
it('dedicated workload has no direct table read or authorization creation', async () => {
  await login();
  await expect(
    db.query('select * from private.sandbox_gateway_authorizations'),
  ).rejects.toThrow(/permission/);
  await expect(
    db.query('insert into private.provider_workloads default values'),
  ).rejects.toThrow();
});
it('ordinary authenticated sessions cannot execute even after accidental execute grant', async () => {
  await db.exec(
    'grant execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb) to authenticated; set session authorization authenticated',
  );
  await expect(
    store().recordWebhook(m, 'synthetic_event', digest),
  ).rejects.toThrow(/workload denied/);
  await logout();
  await db.exec(
    'revoke execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb) from authenticated',
  );
});
it('owner database connection is not an application workload', async () => {
  await expect(
    store().recordWebhook(m, 'synthetic_event', digest),
  ).rejects.toThrow(/workload denied/);
});
it('SET ROLE or spoofed JWT cannot impersonate database login', async () => {
  await db.exec(
    `set role ${role}; set request.jwt.claims='{"role":"authenticated","organization_id":"${org}"}'`,
  );
  await expect(
    store().recordWebhook(m, 'synthetic_event', digest),
  ).rejects.toThrow(/workload denied/);
});
it('separate company and merchant workloads fail closed', async () => {
  await login();
  const c = new ProviderControl(db, {
    organizationId: other,
    scopeId: merchantId,
    service: 'payment',
  });
  await expect(
    c.command('webhook', { eventId: 'synthetic_event', digest }),
  ).rejects.toThrow(/workload denied/);
});
it('revoked workload cannot record or execute another command', async () => {
  await db.query(
    "update private.provider_workloads set revoked_at=clock_timestamp() where service='payment'",
  );
  await login();
  await expect(
    store().recordWebhook(m, 'synthetic_event', digest),
  ).rejects.toThrow(/workload denied/);
});
it('expired workload cannot act', async () => {
  await db.exec('truncate private.provider_workloads');
  await db.query(
    "insert into private.provider_workloads(organization_id,db_role,service,scope_id,created_at,expires_at,approval_sha256) values($1,$2,'payment',$3,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 second',$4)",
    [org, role, merchantId, digest],
  );
  await login();
  await expect(
    store().recordWebhook(m, 'synthetic_event', digest),
  ).rejects.toThrow(/workload denied/);
});
it('reserves once, holds UNKNOWN after restart, persists immutable terminal result', async () => {
  const i = intent();
  await authorize(i);
  await login();
  expect(await store().reserve(m, i, digest)).toEqual({ status: 'reserved' });
  expect(await store().reserve(m, i, digest)).toEqual({ status: 'unknown' });
  await store().finish(m, i, result);
  expect(await store().reserve(m, i, digest)).toEqual({
    status: 'existing',
    result,
  });
  await store().finish(m, i, result);
  await expect(
    store().finish(m, i, {
      ...result,
      status: 'declined',
      transactionId: null,
    }),
  ).rejects.toThrow(/Immutable/);
});
it('rejects independent authorization mismatch and laboratory consent', async () => {
  const i = intent();
  await login();
  await expect(store().reserve(m, i, digest)).rejects.toThrow(
    /Independent provider/,
  );
});
it('deduplicates verified webhook and rejects changed replay', async () => {
  await login();
  expect(await store().recordWebhook(m, 'synthetic_event', digest)).toBe(
    'recorded',
  );
  expect(await store().recordWebhook(m, 'synthetic_event', digest)).toBe(
    'duplicate',
  );
  await expect(
    store().recordWebhook(m, 'synthetic_event', 'b'.repeat(64)),
  ).rejects.toThrow(/Conflicting/);
});
it('settlement observations are append-only and enable only bounded refund capacity', async () => {
  const i = intent();
  await authorize(i);
  const refund = {
    ...intent(),
    invoiceId: i.invoiceId,
    captureKey: i.idempotencyKey,
    providerTransactionId: result.transactionId,
    amountMinor: 6000,
  };
  await authorize(refund, 'refund');
  await login();
  await store().reserve(m, i, digest);
  await store().finish(m, i, result);
  await expect(store().reserveRefund(m, refund, digest)).rejects.toThrow(
    /Settled/,
  );
  const observation = {
    observationId: crypto.randomUUID(),
    key: i.idempotencyKey,
    transactionId: result.transactionId,
    kind: 'capture' as const,
    amountMinor: 10000,
    currency: 'USD' as const,
    state: 'settled' as const,
    digest,
    observedAt: new Date().toISOString(),
  };
  expect((await store().recordObservation(m, observation)).status).toBe(
    'recorded',
  );
  expect((await store().recordObservation(m, observation)).status).toBe(
    'duplicate',
  );
  await expect(
    store().recordObservation(m, { ...observation, state: 'pending' }),
  ).rejects.toThrow(/replay conflict/);
  expect(await store().reserveRefund(m, refund, digest)).toEqual({
    status: 'reserved',
  });
  await logout();
  const second = {
    ...refund,
    authorizationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  };
  await authorize(second, 'refund');
  await login();
  await expect(store().reserveRefund(m, second, digest)).rejects.toThrow(
    /capacity/,
  );
});
it('domain/outbox persistence deduplicates without a sendable state', async () => {
  await login();
  const d = await domain(),
    { p, r } = await outbox(d);
  expect(r.status).toBe('recorded');
  expect((await email().command('prepare', p)).status).toBe('duplicate');
  await logout();
  expect(
    (await db.query('select delivery from private.provider_email_outbox'))
      .rows[0].delivery,
  ).toBe('disabled');
});
it('changed content or cross-company customer cannot enter the outbox', async () => {
  await login();
  const d = await domain(),
    { p } = await outbox(d);
  await expect(
    email().command('prepare', { ...p, digest: 'b'.repeat(64) }),
  ).rejects.toThrow(/replay conflict/);
  await expect(
    email().command('prepare', {
      ...p,
      key: 'c'.repeat(64),
      customerId: crypto.randomUUID(),
    }),
  ).rejects.toThrow(/foreign key/);
});
it('requires current domain verification and rejects arbitrary domain facts', async () => {
  await login();
  await expect(email().command('domain', { bad: 'test' })).rejects.toThrow(
    /Invalid domain/,
  );
  const d = await domain();
  await domain();
  await expect(outbox(d)).rejects.toThrow(/Current domain/);
});
it('unsigned or unbound delivery events cannot create suppression', async () => {
  await login();
  await expect(
    email().command('event', {
      accountId: 'synthetic-account',
      messageId: crypto.randomUUID(),
      eventId: 'synthetic-event',
      digest,
      type: 'email.bounced',
    }),
  ).rejects.toThrow(/binding required/);
});
it('bounce suppression persists through older delivered events and blocks new preparations', async () => {
  await login();
  const d = await domain(),
    { r, p } = await outbox(d);
  await logout();
  const messageId = crypto.randomUUID();
  await db.query(
    'insert into private.provider_email_bindings(organization_id,outbox_id,provider_account_id,provider_message_id) values($1,$2,$3,$4)',
    [org, r.id, 'synthetic-account', messageId],
  );
  await login();
  const e = {
    accountId: 'synthetic-account',
    messageId,
    eventId: 'synthetic-bounce',
    digest,
    type: 'email.bounced',
  };
  await email().command('event', e);
  expect((await email().command('event', e)).status).toBe('duplicate');
  await email().command('event', {
    ...e,
    eventId: 'synthetic-delivered',
    type: 'email.delivered',
  });
  await expect(
    email().command('prepare', { ...p, key: 'c'.repeat(64) }),
  ).rejects.toThrow(/suppressed/);
  await logout();
  expect(
    (
      await db.query(
        'select count(*)::int n from private.provider_email_suppressions',
      )
    ).rows[0].n,
  ).toBe(1);
});
it('private provider tables retain RLS and immutable audit-safe facts', async () => {
  const r = await db.query<{ n: number }>(
    "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'provider_%' and c.relkind='r' and not c.relrowsecurity",
  );
  expect(r.rows[0].n).toBe(0);
  await login();
  await domain();
  await logout();
  await expect(
    db.query('delete from private.provider_email_domains'),
  ).rejects.toThrow(/immutable/i);
});
it.skipIf(!db.fork)(
  'native independent connections serialize duplicate reserve and refund capacity',
  async () => {
    const i = intent();
    await authorize(i);
    const peer = await db.fork!();
    try {
      await login();
      await login(peer);
      const r = await Promise.all([
        store().reserve(m, i, digest),
        store(peer).reserve(m, i, digest),
      ]);
      expect(r.map((x) => x.status).sort()).toEqual(['reserved', 'unknown']);
      await store().finish(m, i, result);
      await store().recordObservation(m, {
        observationId: crypto.randomUUID(),
        key: i.idempotencyKey,
        transactionId: result.transactionId,
        kind: 'capture',
        amountMinor: 10000,
        currency: 'USD',
        state: 'settled',
        digest,
        observedAt: new Date().toISOString(),
      });
      const refunds = [1, 2].map(() => ({
        ...intent(),
        invoiceId: i.invoiceId,
        captureKey: i.idempotencyKey,
        providerTransactionId: result.transactionId,
        amountMinor: 6000,
      }));
      await logout();
      for (const refund of refunds) await authorize(refund, 'refund');
      await login();
      const outcomes = await Promise.allSettled([
        store().reserveRefund(m, refunds[0], digest),
        store(peer).reserveRefund(m, refunds[1], digest),
      ]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
      expect(
        String(
          (
            outcomes.find(
              (x) => x.status === 'rejected',
            ) as PromiseRejectedResult
          ).reason,
        ),
      ).toMatch(/capacity/);
    } finally {
      await logout(peer);
      await peer.close();
    }
  },
);
it('reconciliation persists exact statement comparison and rejects stale snapshots', async () => {
  const i = intent();
  await authorize(i);
  await login();
  await store().reserve(m, i, digest);
  await store().finish(m, i, result);
  const snapshot = (await store().transactions(m)).snapshot as string;
  const report = {
    reportId: crypto.randomUUID(),
    digest,
    snapshot,
    rows: [
      {
        organizationId: org,
        merchantConfigId: merchantId,
        provider: 'nmi' as const,
        mode: 'sandbox' as const,
        currency: 'USD' as const,
        kind: 'capture' as const,
        transactionId: result.transactionId,
        amountMinor: 10000,
      },
    ],
  };
  const r = await store().reconcile(m, report);
  expect(r.status).toBe('recorded');
  expect(r.report).toMatchObject({
    balanced: true,
    expectedNetMinor: '10000',
    reportedNetMinor: '10000',
    unresolved: 0,
  });
  expect((await store().reconcile(m, report)).status).toBe('duplicate');
  await expect(
    store().reconcile(m, {
      ...report,
      rows: [{ ...report.rows[0], organizationId: other }],
    }),
  ).rejects.toThrow(/tenant denied/);
  const more = intent();
  await logout();
  await authorize(more);
  await login();
  await store().reserve(m, more, digest);
  await expect(
    store().reconcile(m, { ...report, reportId: crypto.randomUUID() }),
  ).rejects.toThrow(/snapshot changed/);
  const updated = (await store().transactions(m)).snapshot as string;
  const held = await store().reconcile(m, {
    ...report,
    snapshot: updated,
    reportId: crypto.randomUUID(),
  });
  expect(held.report).toMatchObject({ balanced: false, unresolved: 1 });
});
it('reconciliation distinguishes missing/conflicting rows, duplicate imports and arithmetic precision', async () => {
  const i = intent();
  await authorize(i);
  await login();
  await store().reserve(m, i, digest);
  await store().finish(m, i, result);
  const snapshot = (await store().transactions(m)).snapshot as string;
  const base = { reportId: crypto.randomUUID(), digest, snapshot, rows: [] };
  expect((await store().reconcile(m, base)).report).toMatchObject({
    balanced: false,
    missing: 1,
    reportedNetMinor: '0',
  });
  const row = {
    organizationId: org,
    merchantConfigId: merchantId,
    provider: 'nmi' as const,
    mode: 'sandbox' as const,
    currency: 'USD' as const,
    kind: 'capture' as const,
    transactionId: result.transactionId,
    amountMinor: 10001,
  };
  expect(
    (
      await store().reconcile(m, {
        ...base,
        reportId: crypto.randomUUID(),
        rows: [row],
      })
    ).report,
  ).toMatchObject({
    conflicts: 1,
    balanced: false,
    expectedNetMinor: '10000',
    reportedNetMinor: '10001',
  });
  await expect(
    store().reconcile(m, {
      ...base,
      reportId: crypto.randomUUID(),
      rows: [row, row],
    }),
  ).rejects.toThrow(/Duplicate statement/);
  await expect(
    store().reconcile(m, {
      ...base,
      reportId: crypto.randomUUID(),
      rows: [{ ...row, amountMinor: 100.1 }],
    }),
  ).rejects.toThrow(/Invalid statement/);
});
it('all provider tables deny cross-tenant rows even with accidental SELECT privileges', async () => {
  await login();
  await domain();
  await logout();
  const tables = (
    await db.query<{ name: string }>(
      "select tablename name from pg_tables where schemaname='private' and (tablename like 'provider_%' or tablename like 'sandbox_gateway_%')",
    )
  ).rows;
  for (const { name } of tables) {
    expect(name).toMatch(/^[a-z_]+$/);
    await db.exec(`grant select on private.${name} to authenticated`);
  }
  await db.exec('set session authorization authenticated');
  for (const { name } of tables)
    expect((await db.query(`select * from private.${name}`)).rows).toEqual([]);
  await logout();
  for (const { name } of tables)
    await db.exec(`revoke select on private.${name} from authenticated`);
});
async function agreementFixture() {
  const user = crypto.randomUUID(),
    estimate = crypto.randomUUID(),
    version = crypto.randomUUID(),
    agreement = crypto.randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'signer@example.test',clock_timestamp())",
    [user],
  );
  await db.query(
    "insert into public.estimates(id,organization_id,estimate_number,project_name,customer_id,currency,creation_key,creation_hash) values($1,$2,$3,'LOCAL SYNTHETIC',$4,'USD',$5,'synthetic')",
    [estimate, org, 'LOCAL-' + estimate, customer, crypto.randomUUID()],
  );
  await db.query(
    "insert into public.estimate_versions(id,organization_id,estimate_id,version_number,status,customer_id,payload,calculation,company_snapshot,customer_snapshot,created_by,issued_by,issued_at) values($1,$2,$3,1,'issued',$4,'{}','{}','{}','{}',$5,$5,clock_timestamp())",
    [version, org, estimate, customer, user],
  );
  await db.query(
    'insert into public.portal_identities(organization_id,customer_id,user_id,active) values($1,$2,$3,true)',
    [org, customer, user],
  );
  const b = {
    providerId: 'docusign-demo-v1',
    organizationId: org,
    agreementId: agreement,
    customerId: customer,
    estimateVersionId: version,
    acceptedDecisionId: crypto.randomUUID(),
    templateVersion: 'synthetic-v1',
    consentVersion: 'synthetic-v1',
    originalSha256: digest,
    providerAccountId: crypto.randomUUID(),
    envelopeId: crypto.randomUUID(),
    recipientId: '1',
    signerUserId: user,
    signerEmail: 'signer@example.test',
    preparedAt: new Date().toISOString(),
    expiresAt: until,
    mode: 'sandbox',
  };
  await db.query(
    'insert into private.provider_agreement_bindings(organization_id,agreement_id,customer_id,estimate_version_id,signer_user_id,binding,binding_digest,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
    [org, agreement, customer, version, user, JSON.stringify(b), digest, until],
  );
  await db.query(
    "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'agreement',$3,$4,$5)",
    [org, role, agreement, until, digest],
  );
  await db.exec(
    `grant execute on function private.provider_agreement_control(uuid,uuid,text,jsonb) to ${role}`,
  );
  return {
    b,
    control: new ProviderControl(db, {
      organizationId: org,
      scopeId: agreement,
      service: 'agreement',
    }),
  };
}
it('agreement evidence uses current accepted-scope CAS and append-only completion', async () => {
  const { b, control } = await agreementFixture();
  await login();
  expect((await control.command('load', {})).binding).toEqual(b);
  expect(
    (await control.command('checkpoint', { bindingDigest: digest })).status,
  ).toBe('current');
  const p = {
    bindingDigest: digest,
    signedSha256: 'b'.repeat(64),
    certificateSha256: 'c'.repeat(64),
    recordDigest: 'd'.repeat(64),
  };
  expect((await control.command('complete', p)).status).toBe('recorded');
  expect((await control.command('complete', p)).status).toBe('duplicate');
  await expect(
    control.command('complete', { ...p, recordDigest: 'e'.repeat(64) }),
  ).rejects.toThrow(/Immutable agreement/);
  await expect(
    control.command('checkpoint', { bindingDigest: 'e'.repeat(64) }),
  ).rejects.toThrow(/binding changed/);
  await logout();
  expect(
    (
      await db.query(
        'select legal_execution_enabled from private.provider_agreement_evidence where agreement_id=$1',
        [b.agreementId],
      )
    ).rows[0].legal_execution_enabled,
  ).toBe(false);
});
it('portal revocation blocks agreement completion and Connect cannot cross envelopes', async () => {
  const { b, control } = await agreementFixture();
  await login();
  const event = {
    bindingDigest: digest,
    eventId: 'b'.repeat(64),
    digest,
    accountId: b.providerAccountId,
    envelopeId: b.envelopeId,
  };
  expect((await control.command('event', event)).status).toBe('recorded');
  expect((await control.command('event', event)).status).toBe('duplicate');
  await expect(
    control.command('event', { ...event, envelopeId: crypto.randomUUID() }),
  ).rejects.toThrow(/binding conflict/);
  await logout();
  await db.query(
    'update public.portal_identities set active=false where user_id=$1',
    [b.signerUserId],
  );
  await login();
  await expect(
    control.command('checkpoint', { bindingDigest: digest }),
  ).rejects.toThrow(/authority required/);
});

it('sender revocation defeats an otherwise unexpired verification receipt', async () => {
  await login();
  const d = await domain();
  await logout();
  await db.query(
    'update private.provider_email_sender_bindings set revoked_at=clock_timestamp() where configuration_id=$1',
    [config],
  );
  await login();
  await expect(outbox(d)).rejects.toThrow(/sender binding required/);
});
it('malformed/null command values never create financial or email records', async () => {
  await login();
  const c = new ProviderControl(db, {
    organizationId: org,
    scopeId: merchantId,
    service: 'payment',
  });
  await expect(
    c.command('reserve', {
      key: null,
      authorizationId: null,
      invoiceId: null,
      kind: 'capture',
      amountMinor: 100,
      digest,
      expiresAt: until,
    }),
  ).rejects.toThrow(/Invalid command/);
  await expect(email().command('domain', { id: null })).rejects.toThrow(
    /Invalid email command/,
  );
});
it('cannot submit one provider through another provider merchant binding', async () => {
  const i = intent();
  await authorize(i);
  await login();
  await expect(
    store().reserve({ ...m, provider: 'authorize_net' }, i, digest),
  ).rejects.toThrow(/Provider merchant binding/);
});

it('workload activation cannot exceed its SQL-enforced thirty-minute window', async () => {
  await expect(
    db.query(
      "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,clock_timestamp()+interval '1 hour',$4)",
      [org, role, crypto.randomUUID(), digest],
    ),
  ).rejects.toThrow(/check constraint/);
});

it('provider audit binds the database capability and cannot forge a human through JWT settings', async () => {
  const fakeHuman = crypto.randomUUID();
  await login();
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: fakeHuman, role: 'authenticated' }),
  ]);
  await store().recordWebhook(m, 'synthetic_audit_event', digest);
  await logout();
  const events = (
    await db.query(
      "select actor_id,action,entity_id from public.activity_events where organization_id=$1 and action like 'provider.%'",
      [org],
    )
  ).rows;
  expect(events.length).toBeGreaterThan(0);
  expect(events.every((e) => e.actor_id === null)).toBe(true);
  const cap = (
    await db.query(
      "select id from private.provider_workloads where organization_id=$1 and db_role=$2 and service='payment'",
      [org, role],
    )
  ).rows[0].id;
  expect(
    events.some(
      (e) => e.action === 'provider.payment.authorized' && e.entity_id === cap,
    ),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toContain(fakeHuman);
});
