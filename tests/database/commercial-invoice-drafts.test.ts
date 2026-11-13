import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { SandboxGateway } from '../../server/payments/sandbox';
import { RestrictedSandboxStore } from '../../server/payments/control-store';
import { ProviderControl } from '../../server/providers/control';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import {
  CommercialDraftClient,
  type CommercialDraft,
} from '../../server/invoices/commercial-draft-client';
const db = createTestDatabase();
let admin = 'postgres';
const companies = Array.from({ length: 2 }, () => ({
  org: crypto.randomUUID(),
  actor: crypto.randomUUID(),
  session: crypto.randomUUID(),
  customer: crypto.randomUUID(),
  location: crypto.randomUUID(),
  tax: crypto.randomUUID(),
  version: '',
  estimate: '',
}));
async function reset(connection: TestDatabase = db) {
  await connection.exec('reset role');
}
async function login(
  c = companies[0],
  patch: Record<string, unknown> = {},
  connection: TestDatabase = db,
) {
  await reset(connection);
  await connection.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: c.actor,
      session_id: c.session,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...patch,
    }),
  ]);
  await connection.exec('set role propel_commercial_draft_runtime');
}
function command(c = companies[0]): {
  org: string;
  invoice: string;
  command: string;
  customer: string;
  location: string | null;
  version: string;
  title: string;
  memo: string;
} {
  return {
    org: c.org,
    invoice: crypto.randomUUID(),
    command: crypto.randomUUID(),
    customer: c.customer,
    location: c.location,
    version: c.version,
    title: 'Prepared draft scope',
    memo: 'Draft only; no billing or delivery authority',
  };
}
async function create(p = command(), connection: TestDatabase = db) {
  return (
    await connection.query<{ result: CommercialDraft }>(
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,$5,$6,$7,$8) result',
      [
        p.org,
        p.invoice,
        p.command,
        p.customer,
        p.location,
        p.version,
        p.title,
        p.memo,
      ],
    )
  ).rows[0].result;
}
async function read(
  p: ReturnType<typeof command>,
  receipt: string | null = null,
  connection: TestDatabase = db,
) {
  return (
    await connection.query<{ result: CommercialDraft }>(
      'select private.commercial_invoice_draft_read($1,$2,$3) result',
      [p.org, p.invoice, receipt],
    )
  ).rows[0].result;
}
async function save(
  p: ReturnType<typeof command>,
  revision = 1,
  connection: TestDatabase = db,
) {
  return (
    await connection.query<{ result: CommercialDraft }>(
      'select private.commercial_invoice_draft_save($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
      [
        p.org,
        p.invoice,
        p.command,
        revision,
        p.customer,
        p.location,
        p.version,
        p.title,
        p.memo,
      ],
    )
  ).rows[0].result;
}

beforeAll(async () => {
  admin = String((await db.query('select current_user u')).rows[0].u);
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const path of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + path, 'utf8'));
  await db.exec(
    readFileSync('server/invoices/commercial-drafts.proposed.sql', 'utf8'),
  );
  for (const c of companies) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [c.actor, c.actor + '@example.test'],
    );
    await db.query(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 hour')",
      [c.session, c.actor],
    );
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL DRAFT ONLY',$2,'construction','active')",
      [c.org, 'invoice-' + c.org],
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
      "insert into public.service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Fictional address','Fixture','ZZ','00000','US')",
      [c.location, c.org, c.customer],
    );
    await db.query(
      "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Fixture tax','TEST ONLY','Fixture','Fixture',1000,'reviewed')",
      [c.tax, c.org],
    );
    await db.query(
      "insert into private.commercial_draft_authorities values($1,$2,clock_timestamp()+interval '1 hour',null,'LOCAL TEST ONLY')",
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
    payload.internal_notes = 'PRIVATE DO NOT DISCLOSE';
    payload.lines[0] = {
      ...payload.lines[0],
      description: 'Original source scope',
      quantity_milli: 1000,
      unit_price_minor: 1000,
      unit_cost_minor: 500,
      taxable: true,
    };
    const b = (
      await db.query<{ v: EstimateBundle }>(
        'select public.create_estimate($1,$2,$3) v',
        [c.org, payload, crypto.randomUUID()],
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
    await reset();
  }
});
beforeEach(async () => {
  await db.exec('rollback');
  await reset();
  await db.exec(
    'truncate private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts cascade',
  );
  for (const c of companies) {
    await db.query(
      "update public.memberships set active=true,role='owner' where organization_id=$1 and user_id=$2",
      [c.org, c.actor],
    );
    await db.query(
      'update auth.users set email_confirmed_at=clock_timestamp(),deleted_at=null,banned_until=null,is_anonymous=false where id=$1',
      [c.actor],
    );
    await db.query(
      "update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",
      [c.session],
    );
    await db.query(
      "update public.estimates set status='issued',current_version_id=$2 where organization_id=$1 and id=$3",
      [c.org, c.version, c.estimate],
    );
    await db.query(
      "update private.commercial_draft_authorities set revoked_at=null,expires_at=clock_timestamp()+interval '1 hour' where organization_id=$1 and actor_id=$2",
      [c.org, c.actor],
    );
  }
  await login();
});
afterAll(async () => {
  await reset();
  for (const table of [
    'organizations',
    'memberships',
    'customers',
    'service_locations',
    'estimates',
    'estimate_versions',
  ])
    await db.exec(
      `drop policy if exists commercial_draft_source on public.${table};drop policy if exists commercial_draft_source_lock on public.${table}`,
    );
  await db.exec(
    `reassign owned by propel_commercial_draft_owner to ${admin};drop owned by propel_commercial_draft_owner;drop owned by propel_commercial_draft_runtime;drop role propel_commercial_draft_runtime;drop role propel_commercial_draft_owner`,
  );
  await db.close();
});
it.each([0, 1])(
  'tenant %i creates, revises and reopens source-bound draft with immutable command receipts',
  async (index) => {
    const c = companies[index];
    await login(c);
    const p = command(c),
      first = await create(p);
    expect(first).toMatchObject({
      invoiceId: p.invoice,
      organizationId: c.org,
      customerId: c.customer,
      sourceVersionId: c.version,
      revision: 1,
      state: 'draft',
      amountMinor: 1100,
      sourceCurrent: true,
    });
    expect(JSON.stringify(first)).not.toContain('PRIVATE DO NOT DISCLOSE');
    const next = {
      ...p,
      command: crypto.randomUUID(),
      title: 'Reviewed draft title',
      memo: 'Retained revised draft',
    };
    const second = await save(next);
    expect(second.revision).toBe(2);
    expect((await read(next)).title).toBe(next.title);
    expect((await read(next, p.command)).receipt).toEqual(first.receipt);
    expect((await read(next)).receipt.actorId).toBe(c.actor);
  },
);
it('same original command returns the original receipt and changed payload conflicts', async () => {
  const p = command(),
    first = await create(p);
  expect(await create(p)).toEqual(first);
  await expect(create({ ...p, title: 'Different' })).rejects.toThrow(
    /conflict/,
  );
  expect((await read(p)).revision).toBe(1);
});
it('stale CAS or source substitution cannot overwrite the committed revision', async () => {
  const p = command();
  await create(p);
  const next = { ...p, command: crypto.randomUUID(), title: 'Second' };
  await save(next);
  await expect(
    save({ ...next, command: crypto.randomUUID(), title: 'Stale' }, 1),
  ).rejects.toThrow(/revision changed/);
  await expect(
    save(
      { ...next, command: crypto.randomUUID(), version: companies[1].version },
      2,
    ),
  ).rejects.toThrow();
  expect((await read(p)).title).toBe('Second');
});
it('cross-tenant source, command or draft read is denied', async () => {
  const p = command();
  await create(p);
  await expect(
    create({ ...command(), version: companies[1].version }),
  ).rejects.toThrow();
  await login(companies[1]);
  await expect(read(p)).rejects.toThrow();
  await expect(
    create({ ...command(companies[1]), org: companies[0].org }),
  ).rejects.toThrow();
});
it.each([
  { aal: 'aal1' },
  { session_id: crypto.randomUUID() },
  { exp: 1 },
  { sub: crypto.randomUUID() },
])('requires current actor/session/MFA/expiry %j', async (patch) => {
  await login(companies[0], patch);
  await expect(create()).rejects.toThrow();
});
it.each([
  'inactive',
  'staff',
  'deleted',
  'banned',
  'anonymous',
  'unconfirmed',
  'expired-session',
  'revoked-authority',
] as const)(
  'denies current %s status before receipt creation',
  async (mode) => {
    const c = companies[0];
    await reset();
    if (mode === 'inactive')
      await db.query(
        'update public.memberships set active=false where organization_id=$1 and user_id=$2',
        [c.org, c.actor],
      );
    if (mode === 'staff')
      await db.query(
        "update public.memberships set role='staff' where organization_id=$1 and user_id=$2",
        [c.org, c.actor],
      );
    if (mode === 'deleted')
      await db.query(
        'update auth.users set deleted_at=clock_timestamp() where id=$1',
        [c.actor],
      );
    if (mode === 'banned')
      await db.query(
        "update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1",
        [c.actor],
      );
    if (mode === 'anonymous')
      await db.query('update auth.users set is_anonymous=true where id=$1', [
        c.actor,
      ]);
    if (mode === 'unconfirmed')
      await db.query(
        'update auth.users set email_confirmed_at=null where id=$1',
        [c.actor],
      );
    if (mode === 'expired-session')
      await db.query(
        "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
        [c.session],
      );
    if (mode === 'revoked-authority')
      await db.query(
        'update private.commercial_draft_authorities set revoked_at=clock_timestamp() where organization_id=$1 and actor_id=$2',
        [c.org, c.actor],
      );
    await login(c);
    await expect(create()).rejects.toThrow();
  },
);
it('runtime has no direct table access or grant creation; revisions and receipts reject mutation', async () => {
  await expect(
    db.query('select * from private.commercial_invoice_drafts'),
  ).rejects.toThrow(/permission/);
  await expect(
    db.query('insert into private.commercial_draft_authorities default values'),
  ).rejects.toThrow(/permission/);
  const p = command();
  await create(p);
  await reset();
  await expect(
    db.query(
      'update private.commercial_invoice_draft_receipts set request_hash=$1 where invoice_id=$2',
      ['f'.repeat(64), p.invoice],
    ),
  ).rejects.toThrow(/immutable/);
  await expect(
    db.query(
      'delete from private.commercial_invoice_draft_revisions where invoice_id=$1',
      [p.invoice],
    ),
  ).rejects.toThrow(/immutable/);
});
it('rollback removes draft and receipt together, commit persists across a new connection', async () => {
  const p = command();
  await db.exec('begin');
  await create(p);
  await db.exec('rollback');
  await expect(read(p)).rejects.toThrow();
  const committed = await create(p);
  if (db.fork) {
    const peer = await db.fork();
    try {
      await login(companies[0], {}, peer);
      expect((await read(p, p.command, peer)).receipt).toEqual(
        committed.receipt,
      );
    } finally {
      await peer.close();
    }
  }
});
it('actual TypeScript client creates/saves/reopens and reconciles lost ACK through the original SQL receipt', async () => {
  const c = companies[0],
    p = command();
  let lose = false;
  const port = {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => {
      const r = await db.query<T>(sql, params);
      if (lose) {
        lose = false;
        throw Error('Synthetic ACK loss after real SQL commit');
      }
      return r;
    },
  };
  const client = new CommercialDraftClient(port, c.org),
    identity = {
      invoiceId: p.invoice,
      customerId: c.customer,
      locationId: c.location,
      sourceVersionId: c.version,
    };
  const first = await client.create({
    ...identity,
    commandId: p.command,
    expectedRevision: 0,
    title: p.title,
    memo: p.memo,
  });
  expect(first.revision).toBe(1);
  const second = await client.save({
    ...identity,
    commandId: crypto.randomUUID(),
    expectedRevision: 1,
    title: 'Saved revision',
    memo: 'Draft evidence',
  });
  expect(second.revision).toBe(2);
  lose = true;
  const thirdCommand = crypto.randomUUID();
  await expect(
    client.save({
      ...identity,
      commandId: thirdCommand,
      expectedRevision: 2,
      title: 'ACK lost revision',
      memo: 'Retained',
    }),
  ).rejects.toThrow(/UNKNOWN/);
  expect((await client.read(identity, thirdCommand)).revision).toBe(3);
  expect((await client.read(identity)).title).toBe('ACK lost revision');
});
it.skipIf(!db.fork)(
  'concurrent creates and stale saves serialize with one revision winner',
  async () => {
    const peer = await db.fork!();
    try {
      await login(companies[0], {}, peer);
      const p = command();
      const creates = await Promise.allSettled([create(p), create(p, peer)]);
      expect(creates.every((r) => r.status === 'fulfilled')).toBe(true);
      const a = { ...p, command: crypto.randomUUID(), title: 'A' },
        b = { ...p, command: crypto.randomUUID(), title: 'B' };
      const saves = await Promise.allSettled([save(a, 1), save(b, 1, peer)]);
      expect(saves.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await read(p)).revision).toBe(2);
    } finally {
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'revocation committed before a blocked command resumes prevents draft and receipt',
  async () => {
    const locker = await db.fork!();
    try {
      const c = companies[0],
        p = command();
      await locker.exec('begin');
      await locker.query(
        'update public.memberships set active=false where organization_id=$1 and user_id=$2',
        [c.org, c.actor],
      );
      let settled = false;
      const pending = create(p).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(settled).toBe(false);
      await locker.exec('commit');
      await expect(pending).rejects.toThrow(/membership/);
      await reset();
      expect(
        (
          await db.query(
            'select count(*)::int n from private.commercial_invoice_draft_receipts where organization_id=$1 and command_id=$2',
            [c.org, p.command],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await locker.exec('rollback');
      await locker.close();
    }
  },
);

it('exact requested customer/property, bounded title and one source draft reject substitution or replacement identities', async () => {
  const p = command();
  for (const bad of [
    { customer: crypto.randomUUID() },
    { location: null },
    { location: companies[1].location },
    { title: ' '.repeat(201) + 'a' },
  ])
    await expect(create({ ...p, ...bad })).rejects.toThrow();
  await reset();
  expect(
    (
      await db.query(
        'select count(*)::int n from private.commercial_invoice_drafts',
      )
    ).rows[0].n,
  ).toBe(0);
  await login();
  await create(p);
  await expect(
    create({
      ...p,
      invoice: crypto.randomUUID(),
      command: crypto.randomUUID(),
    }),
  ).rejects.toThrow(/unique/);
  if (db.fork) {
    const peer = await db.fork();
    try {
      await login(companies[0], {}, peer);
      await expect(
        create(
          { ...p, invoice: crypto.randomUUID(), command: crypto.randomUUID() },
          peer,
        ),
      ).rejects.toThrow(/unique/);
    } finally {
      await peer.close();
    }
  }
  expect((await read(p)).revision).toBe(1);
});
it('archived or changed current estimate parent makes historical reads stale and blocks new revisions', async () => {
  const p = command();
  await create(p);
  await reset();
  await db.query("update public.estimates set status='archived' where id=$1", [
    companies[0].estimate,
  ]);
  await login();
  expect((await read(p)).sourceCurrent).toBe(false);
  await expect(save({ ...p, command: crypto.randomUUID() })).rejects.toThrow(
    /parent/,
  );
});
it.skipIf(!db.fork)(
  'JWT expiry while waiting for command lock denies receipt after wall-clock deadline',
  async () => {
    const peer = await db.fork!(),
      p = command();
    try {
      await peer.exec('begin');
      await peer.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        p.org + '/' + p.command,
      ]);
      await login(companies[0], { exp: Date.now() / 1000 + 0.15 });
      const pending = create(p);
      await new Promise((r) => setTimeout(r, 200));
      await peer.exec('commit');
      await expect(pending).rejects.toThrow(/expired/);
      await reset();
      expect(
        (
          await db.query(
            'select count(*)::int n from private.commercial_invoice_draft_receipts where command_id=$1',
            [p.command],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await peer.exec('rollback');
      await peer.close();
    }
  },
);

it.skipIf(!process.env.EV_TEST_PG_SOCKET)(
  'terminated backend rolls uncommitted draft and receipt back without a replacement command',
  async () => {
    const database = String(
      (await db.query('select current_database() name')).rows[0].name,
    );
    const raw = new Client({
      host: process.env.EV_TEST_PG_SOCKET,
      port: 55477,
      user: 'ev_test',
      database,
    });
    const failures: Error[] = [];
    raw.on('error', (e) => failures.push(e));
    await raw.connect();
    const peer: TestDatabase = {
      query: async <T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) => ({ rows: (await raw.query<T>(sql, params)).rows }),
      exec: async (sql) => raw.query(sql),
      close: async () => raw.end(),
    };
    const p = command();
    try {
      await login(companies[0], {}, peer);
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await peer.exec('begin');
      await create(p, peer);
      await reset();
      expect(
        (await db.query('select pg_terminate_backend($1) stopped', [pid]))
          .rows[0].stopped,
      ).toBe(true);
      await new Promise((r) => setTimeout(r, 25));
      expect(failures.some((e) => e.message.includes('terminat'))).toBe(true);
      await login();
      await expect(read(p, p.command)).rejects.toThrow(/unavailable/);
      await reset();
      expect(
        (
          await db.query(
            'select count(*)::int n from private.commercial_invoice_draft_receipts where command_id=$1',
            [p.command],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await peer.close().catch(() => {});
    }
  },
);

it.skipIf(!db.fork)(
  'bounded lock loss preserves UNKNOWN and denies replacement dispatch',
  async () => {
    const locker = await db.fork!();
    const c = companies[0],
      p = command();
    let dispatches = 0;
    let failureCode: unknown;
    const client = new CommercialDraftClient(
      {
        query: async <T extends Record<string, unknown>>(
          sql: string,
          params?: unknown[],
        ) => {
          dispatches++;
          try {
            return await db.query<T>(sql, params);
          } catch (error) {
            failureCode =
              error && typeof error === 'object' && 'code' in error
                ? error.code
                : null;
            throw error;
          }
        },
      },
      c.org,
    );
    const input = {
      invoiceId: p.invoice,
      customerId: c.customer,
      locationId: c.location,
      sourceVersionId: c.version,
      commandId: p.command,
      expectedRevision: 0,
      title: p.title,
      memo: p.memo,
    };
    try {
      await locker.exec('begin');
      await locker.query(
        'update public.memberships set active=true where organization_id=$1 and user_id=$2',
        [c.org, c.actor],
      );
      await expect(client.create(input)).rejects.toThrow('UNKNOWN');
      expect(failureCode).toBe('55P03');
      await locker.exec('rollback');
      await expect(
        client.create({
          ...input,
          invoiceId: crypto.randomUUID(),
          commandId: crypto.randomUUID(),
        }),
      ).rejects.toThrow('UNKNOWN');
      expect(dispatches).toBe(1);
      await reset();
      expect(
        (
          await db.query(
            'select count(*)::int n from private.commercial_invoice_draft_receipts where organization_id=$1 and command_id=$2',
            [c.org, p.command],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await locker.exec('rollback');
      await locker.close();
    }
  },
);

it.each([0, 1])(
  'fictional tenant %i draft receipt cannot authorize a sandbox payment',
  async (index) => {
    const c = companies[index];
    await login(c);
    const p = command(c);
    const draft = await create(p);
    await reset();
    const role = 'draft_payment_' + crypto.randomUUID().replaceAll('-', '');
    const merchantId = crypto.randomUUID();
    const until = new Date(Date.now() + 60_000).toISOString();
    await db.exec(`create role ${role} login nosuperuser nocreatedb nocreaterole nobypassrls;
    grant usage on schema private to ${role};
    grant execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb) to ${role}`);
    try {
      await db.query(
        "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,'nmi','FICTIONAL TEST ONLY','sandbox','approved')",
        [merchantId, c.org],
      );
      await db.query(
        "insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,'payment',$3,$4,$5)",
        [c.org, role, merchantId, until, 'a'.repeat(64)],
      );
      await db.exec(`set session authorization ${role}`);
      const transport = vi.fn<typeof fetch>();
      const gateway = new SandboxGateway(
        {
          organizationId: c.org,
          merchantConfigId: merchantId,
          provider: 'nmi',
          mode: 'sandbox',
          approvalReference: 'DISPOSABLE FICTIONAL FIXTURE ONLY',
          approvedUntil: until,
        },
        { apiKey: 'synthetic-only-not-a-credential' },
        new RestrictedSandboxStore(
          new ProviderControl(db, {
            organizationId: c.org,
            scopeId: merchantId,
            service: 'payment',
          }),
        ),
        transport,
      );
      await expect(
        gateway.capture(
          {
            organizationId: c.org,
            merchantConfigId: merchantId,
            invoiceId: draft.invoiceId,
            authorizationId: draft.receipt.id,
            idempotencyKey: crypto.randomUUID(),
            amountMinor: draft.amountMinor,
            currency: 'USD',
            expiresAt: until,
          },
          { provider: 'nmi', value: 'synthetic-only-no-provider-dispatch' },
        ),
      ).rejects.toThrow(/Independent provider authorization/);
      expect(transport).not.toHaveBeenCalled();
      await db.exec(`set session authorization ${admin}; reset role`);
      expect(
        (
          await db.query(
            'select count(*)::int n from private.sandbox_gateway_attempts where organization_id=$1 and invoice_id=$2',
            [c.org, draft.invoiceId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await db.query(
            'select count(*)::int n from private.commercial_invoice_draft_receipts where organization_id=$1 and invoice_id=$2',
            [c.org, draft.invoiceId],
          )
        ).rows[0].n,
      ).toBe(1);
      await login(c);
      expect((await read(p, p.command)).receipt).toEqual(draft.receipt);
    } finally {
      await db.exec(
        `set session authorization ${admin}; reset role; drop owned by ${role}; drop role ${role}`,
      );
    }
  },
);
