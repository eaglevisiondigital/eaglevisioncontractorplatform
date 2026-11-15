import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { ProviderControl } from '../../server/providers/control';
import { sha256 } from '../../server/providers/safety';
import type {
  SandboxIntent,
  SandboxMerchant,
} from '../../server/payments/sandbox';
import { captureReconciliationReceiptProposal } from '../../proposals/payment-reconciliation-receipt/qualification';
import {
  ProposedReconciliationReceiptReader,
  type OriginalReconciliation,
} from '../../proposals/payment-reconciliation-receipt/reader';

const db = createTestDatabase();
let owner = 'postgres';
const until = new Date(Date.now() + 29 * 60000).toISOString();
const cases = Array.from({ length: 2 }, () => ({
  organizationId: randomUUID(),
  merchantConfigId: randomUUID(),
  customerId: randomUUID(),
  writer: 'recon_writer_' + randomUUID().replaceAll('-', ''),
  reader: 'recon_reader_' + randomUUID().replaceAll('-', ''),
}));
const additionalRoles: string[] = [];
const sqlOwner = 'propel_reconciliation_receipt_test_owner';
let original: OriginalReconciliation;
let storedReport: Record<string, unknown>;
async function admin(c: TestDatabase = db) {
  await c.exec(`set session authorization ${owner};reset role`);
}
function merchant(index = 0): SandboxMerchant {
  return {
    organizationId: cases[index].organizationId,
    merchantConfigId: cases[index].merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    approvalReference: 'FICTIONAL LOCAL REVIEW ONLY',
    approvedUntil: until,
  };
}
async function writer(index = 0, c: TestDatabase = db) {
  await c.exec('set session authorization ' + cases[index].writer);
  return new RestrictedSandboxStore(
    new ProviderControl(c, {
      organizationId: cases[index].organizationId,
      scopeId: cases[index].merchantConfigId,
      service: 'payment',
    }),
  );
}
async function reader(
  index = 0,
  c: TestDatabase = db,
  role = cases[index].reader,
) {
  await c.exec('set session authorization ' + role);
  return new ProposedReconciliationReceiptReader(c, merchant(index), {
    testOnly: true,
  });
}
async function role(
  name: string,
  index: number,
  read: boolean,
  expiry = until,
) {
  if (!/^(recon_writer|recon_reader|recon_short)_[a-f0-9]{32}$/.test(name))
    throw Error('Unsafe fixture role');
  await db.exec(
    `create role ${name} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls;grant usage on schema private to ${name};grant execute on function private.${read ? 'sandbox_reconciliation_receipt(uuid,uuid,text,uuid,text,text)' : 'sandbox_gateway_control(uuid,uuid,text,jsonb)'} to ${name}`,
  );
  await db.query(
    "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
    [
      cases[index].organizationId,
      name,
      cases[index].merchantConfigId,
      expiry,
      sha256('FICTIONAL EXACT WORKLOAD'),
    ],
  );
}
async function capturePending(index = 0) {
  await admin();
  const c = cases[index],
    m = merchant(index);
  const intent: SandboxIntent = {
    organizationId: c.organizationId,
    merchantConfigId: c.merchantConfigId,
    invoiceId: randomUUID(),
    authorizationId: randomUUID(),
    idempotencyKey: randomUUID(),
    amountMinor: 123,
    currency: 'USD',
    expiresAt: until,
  };
  const digest = sha256('FICTIONAL ' + intent.idempotencyKey);
  await db.query(
    "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi','capture',123,'USD',$6,'FICTIONAL NO DISPATCH',$7)",
    [
      c.organizationId,
      intent.authorizationId,
      c.merchantConfigId,
      c.customerId,
      intent.invoiceId,
      digest,
      until,
    ],
  );
  const store = await writer(index);
  expect((await store.reserve(m, intent, digest)).status).toBe('reserved');
  return intent;
}
async function snapshot() {
  await admin();
  return (
    await db.query(
      'select (select count(*)::int from private.sandbox_gateway_reconciliations) reports,(select count(*)::int from private.sandbox_gateway_attempts) attempts,(select count(*)::int from public.activity_events) activity,(select jsonb_agg(to_jsonb(a) order by idempotency_key) from private.sandbox_gateway_attempts a) attempt_rows',
    )
  ).rows[0];
}
beforeAll(async () => {
  owner = String((await db.query('select session_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(owner)) throw Error('Unsafe fixture owner');
  const proposal = await captureReconciliationReceiptProposal();
  expect(proposal.installationAuthorized).toBe(false);
  await db.exec(proposal.bootstrapSql);
  for (const migration of proposal.migrations) await db.exec(migration.sql);
  await db.exec(
    proposal.receiptSql.replaceAll(
      'propel_reconciliation_receipt_owner',
      sqlOwner,
    ),
  );
  for (const [index, c] of cases.entries()) {
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL RECONCILIATION',$2,'construction','active')",
      [c.organizationId, 'recon-' + c.organizationId],
    );
    await db.query(
      "insert into public.customers(id,organization_id,display_name) values($1,$2,'FICTIONAL CUSTOMER')",
      [c.customerId, c.organizationId],
    );
    await db.query(
      "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,'nmi','FICTIONAL ONLY','sandbox','approved')",
      [c.merchantConfigId, c.organizationId],
    );
    await role(c.writer, index, false);
    await role(c.reader, index, true);
  }
});
beforeEach(async () => {
  await admin();
  await db.exec(
    'truncate private.sandbox_gateway_authorizations,private.sandbox_gateway_attempts,private.sandbox_gateway_reconciliations cascade',
  );
  await db.query(
    "update private.merchant_configurations set status='approved' where organization_id=any($1::uuid[])",
    [cases.map((c) => c.organizationId)],
  );
  const store = await writer();
  const state = await store.transactions(merchant());
  original = {
    organizationId: cases[0].organizationId,
    merchantConfigId: cases[0].merchantConfigId,
    provider: 'nmi',
    mode: 'sandbox',
    reportId: randomUUID(),
    evidenceDigest: sha256('FICTIONAL ORIGINAL REPORT'),
    snapshotDigest: String(state.snapshot),
  };
  const lost = new RestrictedSandboxStore(
    new ProviderControl(
      {
        async query<T extends Record<string, unknown>>(
          sql: string,
          params: unknown[] = [],
        ) {
          const response = await db.query<T>(sql, params);
          if (params[2] === 'reconcile')
            throw Error('FICTIONAL ORIGINAL COMMIT ACK LOST');
          return response;
        },
      },
      {
        organizationId: original.organizationId,
        scopeId: original.merchantConfigId,
        service: 'payment',
      },
    ),
  );
  await expect(
    lost.reconcile(merchant(), {
      reportId: original.reportId,
      digest: original.evidenceDigest,
      snapshot: original.snapshotDigest,
      rows: [],
    }),
  ).rejects.toThrow('FICTIONAL ORIGINAL COMMIT ACK LOST');
  // Privileged fixture inspection supplies expected assertions only. The actual
  // consumer has no table SELECT, writer permission, or successful original ACK.
  await admin();
  storedReport = (
    await db.query<{ result: Record<string, unknown> }>(
      'select result from private.sandbox_gateway_reconciliations where organization_id=$1 and report_id=$2',
      [original.organizationId, original.reportId],
    )
  ).rows[0].result;
});
afterAll(async () => {
  await admin();
  for (const r of [
    ...cases.flatMap((c) => [c.writer, c.reader]),
    ...additionalRoles,
    sqlOwner,
  ]) {
    if (!/^[a-z0-9_]+$/.test(r)) throw Error('Unsafe fixture cleanup');
    if (
      !(await db.query('select 1 from pg_roles where rolname=$1', [r])).rows
        .length
    )
      continue;
    await db.exec(
      `reassign owned by ${r} to ${owner};drop owned by ${r};drop role ${r}`,
    );
  }
  await db.close();
});

it('recovers the exact committed report read-only after a lost ACK and ledger change rejects the old writer route', async () => {
  // The actual writer's committed acknowledgment was withheld in beforeEach.
  const before = await snapshot();
  const pending = await capturePending();
  const store = await writer();
  await expect(
    store.reconcile(merchant(), {
      reportId: original.reportId,
      digest: original.evidenceDigest,
      snapshot: original.snapshotDigest,
      rows: [],
    }),
  ).rejects.toThrow('Reconciliation snapshot changed');
  const current = await snapshot(),
    read = await reader();
  const result = await read.read(original);
  expect(result.outcome).toBe('RECORDED');
  if (result.outcome === 'RECORDED') {
    expect(result.receipt.report).toEqual(storedReport);
    expect(result.receipt.snapshotDigest).toBe(original.snapshotDigest);
    expect(result.receipt.report.balanced).toBe(true);
  }
  expect(result).toMatchObject({
    financialEffect: false,
    settlement: 'UNVERIFIED',
    holdRelease: false,
    currentLedgerMatch: 'NOT_ASSERTED',
  });
  expect(await snapshot()).toEqual(current);
  expect(current.reports).toBe(before.reports);
  await admin();
  const row = (
    await db.query(
      'select status from private.sandbox_gateway_attempts where organization_id=$1 and idempotency_key=$2',
      [pending.organizationId, pending.idempotencyKey],
    )
  ).rows[0];
  expect(row.status).toBe('pending');
});
it('repeated exact reopening reads the same receipt and creates no report, attempt or activity event', async () => {
  const before = await snapshot();
  const read = await reader();
  const a = await read.read(original),
    b = await read.read(original);
  expect(a).toEqual(b);
  expect(a.outcome).toBe('RECORDED');
  expect(await snapshot()).toEqual(before);
});
it.each(['reportId', 'evidenceDigest', 'snapshotDigest'] as const)(
  'a different original %s returns UNKNOWN without replacement writes',
  async (field) => {
    const before = await snapshot(),
      read = await reader();
    const result = await read.read({
      ...original,
      [field]: field === 'reportId' ? randomUUID() : '0'.repeat(64),
    });
    expect(result.outcome).toBe('UNKNOWN');
    expect(JSON.stringify(result)).not.toMatch(/reportId|receipt|expectedNet/);
    expect(await snapshot()).toEqual(before);
  },
);
it('reader-only principals cannot submit/re-submit reconciliation or read private rows directly', async () => {
  await reader();
  await expect(
    db.query('select * from private.sandbox_gateway_reconciliations'),
  ).rejects.toThrow('permission denied');
  const store = new RestrictedSandboxStore(
    new ProviderControl(db, {
      organizationId: original.organizationId,
      scopeId: original.merchantConfigId,
      service: 'payment',
    }),
  );
  await expect(
    store.reconcile(merchant(), {
      reportId: randomUUID(),
      digest: original.evidenceDigest,
      snapshot: original.snapshotDigest,
      rows: [],
    }),
  ).rejects.toThrow('permission denied');
});
it.each(['anon', 'authenticated', 'service_role'])(
  'ordinary %s has neither read function nor private table access',
  async (r) => {
    await admin();
    await db.exec('set role ' + r);
    await expect(
      db.query(
        'select private.sandbox_reconciliation_receipt($1,$2,$3,$4,$5,$6)',
        [
          original.organizationId,
          original.merchantConfigId,
          'nmi',
          original.reportId,
          original.evidenceDigest,
          original.snapshotDigest,
        ],
      ),
    ).rejects.toThrow('permission denied');
  },
);
it('a configured writer without the separately granted read function cannot use the new reader', async () => {
  await writer();
  const read = new ProposedReconciliationReceiptReader(db, merchant(), {
    testOnly: true,
  });
  expect((await read.read(original)).outcome).toBe('UNKNOWN');
});
it('another tenant reader cannot recover a foreign receipt even with all original identifiers', async () => {
  const read = await reader(1);
  expect((await read.read(original)).outcome).toBe('UNKNOWN');
  const forged = new ProposedReconciliationReceiptReader(db, merchant(), {
    testOnly: true,
  });
  expect((await forged.read(original)).outcome).toBe('UNKNOWN');
});
it('current merchant revocation denies the original report without reissuing it', async () => {
  await admin();
  await db.query(
    "update private.merchant_configurations set status='suspended' where organization_id=$1 and id=$2",
    [original.organizationId, original.merchantConfigId],
  );
  const read = await reader();
  expect((await read.read(original)).outcome).toBe('UNKNOWN');
});
it('a revoked current workload cannot use an old receipt or JWT identity substitution', async () => {
  const r = 'recon_short_' + randomUUID().replaceAll('-', '');
  additionalRoles.push(r);
  await admin();
  await role(r, 0, true);
  await db.query(
    'update private.provider_workloads set revoked_at=clock_timestamp() where db_role=$1',
    [r],
  );
  await db.exec('set session authorization ' + r);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: randomUUID(), role: 'service_role', aal: 'aal2' }),
  ]);
  const read = new ProposedReconciliationReceiptReader(db, merchant(), {
    testOnly: true,
  });
  expect((await read.read(original)).outcome).toBe('UNKNOWN');
});
it.each([
  'extra',
  'wrong-type',
  'contradiction',
  'oversize-net',
  'primitive',
] as const)(
  'malformed persisted %s result is withheld in SQL before decoding',
  async (kind) => {
    const reportId = randomUUID();
    let result: unknown = { ...storedReport };
    if (kind === 'extra')
      Object.assign(result as object, { privatePayload: 'FORBIDDEN PII' });
    if (kind === 'wrong-type')
      Object.assign(result as object, { missing: 'PRIVATE' });
    if (kind === 'contradiction')
      Object.assign(result as object, { missing: 1 });
    if (kind === 'oversize-net')
      Object.assign(result as object, { expectedNetMinor: '9000000000000001' });
    if (kind === 'primitive') result = 'FORBIDDEN PII';
    await admin();
    await db.query(
      'insert into private.sandbox_gateway_reconciliations(organization_id,merchant_id,report_id,evidence_sha256,snapshot_sha256,result) values($1,$2,$3,$4,$5,$6)',
      [
        original.organizationId,
        original.merchantConfigId,
        reportId,
        original.evidenceDigest,
        original.snapshotDigest,
        JSON.stringify(result),
      ],
    );
    await reader();
    const raw = (
      await db.query<{ receipt: unknown }>(
        'select private.sandbox_reconciliation_receipt($1,$2,$3,$4,$5,$6) receipt',
        [
          original.organizationId,
          original.merchantConfigId,
          'nmi',
          reportId,
          original.evidenceDigest,
          original.snapshotDigest,
        ],
      )
    ).rows[0].receipt;
    expect(raw).toEqual({ outcome: 'UNKNOWN' });
  },
);
it('the old reconciliation record and its metadata remain immutable', async () => {
  await admin();
  await expect(
    db.query(
      'update private.sandbox_gateway_reconciliations set snapshot_sha256=$3 where organization_id=$1 and report_id=$2',
      [original.organizationId, original.reportId, '0'.repeat(64)],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      'delete from private.sandbox_gateway_reconciliations where organization_id=$1 and report_id=$2',
      [original.organizationId, original.reportId],
    ),
  ).rejects.toThrow();
  const read = await reader();
  expect((await read.read(original)).outcome).toBe('RECORDED');
});
it.skipIf(!db.fork)(
  'current workload expiry during the observed merchant wait withholds even an existing receipt',
  async () => {
    const r = 'recon_short_' + randomUUID().replaceAll('-', '');
    additionalRoles.push(r);
    await admin();
    await role(r, 0, true, new Date(Date.now() + 400).toISOString());
    const peer = await db.fork!();
    let pending:
      ReturnType<ProposedReconciliationReceiptReader['read']> | undefined;
    try {
      const read = await reader(0, peer, r),
        pid = Number(
          (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
        );
      await admin();
      await db.exec('begin');
      await db.query(
        'select id from private.merchant_configurations where organization_id=$1 and id=$2 for update',
        [original.organizationId, original.merchantConfigId],
      );
      pending = read.read(original);
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
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(observed).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 450));
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
