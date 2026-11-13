import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import {
  CommercialDraftClient,
  type CommercialDraft,
  type DraftWrite,
} from '../../server/invoices/commercial-draft-client';

// Native-only interleavings over the actual unchanged proposal/client. Auth/GUC
// fixtures and the monitor are trusted; this is not bearer or installed grant proof.
// Role-name-only fixture remapping avoids cross-file cluster role collisions.
const db = createTestDatabase();
function observed<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}
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
  await connection.exec('set role propel_invoice_race_runtime');
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
beforeAll(async () => {
  admin = String((await db.query('select current_user u')).rows[0].u);
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const path of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + path, 'utf8'));
  await db.exec(
    readFileSync('server/invoices/commercial-drafts.proposed.sql', 'utf8')
      .replaceAll('propel_commercial_draft_owner', 'propel_invoice_race_owner')
      .replaceAll(
        'propel_commercial_draft_runtime',
        'propel_invoice_race_runtime',
      ),
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
    `reassign owned by propel_invoice_race_owner to ${admin};drop owned by propel_invoice_race_owner;drop owned by propel_invoice_race_runtime;drop role propel_invoice_race_runtime;drop role propel_invoice_race_owner`,
  );
  await db.close();
});

function input(p: ReturnType<typeof command>): DraftWrite {
  return {
    invoiceId: p.invoice,
    customerId: p.customer,
    locationId: p.location,
    sourceVersionId: p.version,
    commandId: p.command,
    expectedRevision: 0,
    title: p.title,
    memo: p.memo,
  };
}
function caller(connection: TestDatabase, org: string) {
  let queries = 0;
  let sqlError: unknown;
  const client = new CommercialDraftClient(
    {
      async query<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) {
        queries++;
        try {
          return await connection.query<T>(sql, params);
        } catch (error) {
          sqlError = error;
          throw error;
        }
      },
    },
    org,
  );
  return { client, queries: () => queries, sqlError: () => sqlError };
}
async function backend(connection: TestDatabase) {
  return Number(
    (await connection.query('select pg_backend_pid() pid')).rows[0].pid,
  );
}
async function blocked(
  monitor: TestDatabase,
  waiter: number,
  holder: number,
  settled: () => boolean,
) {
  // Wait for an actual database lock witness, not a sleep-only inference. The
  // unchanged SQL's 1500ms lock timeout and original test budget stay authoritative.
  while (!settled()) {
    const row = (
      await monitor.query<{
        wait_event_type: string | null;
        wait_event: string | null;
        blockers: number[];
      }>(
        'select wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1',
        [waiter],
      )
    ).rows[0];
    if (row?.wait_event_type === 'Lock' && row.blockers.includes(holder))
      return row;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error(
    'Concurrent command settled before the required native lock witness',
  );
}
async function onlyWinner(
  monitor: TestDatabase,
  p: ReturnType<typeof command>,
) {
  for (const table of [
    'commercial_invoice_drafts',
    'commercial_invoice_draft_revisions',
    'commercial_invoice_draft_receipts',
  ]) {
    expect(
      (
        await monitor.query(
          'select count(*)::int n from private.' +
            table +
            ' where organization_id=$1',
          [p.org],
        )
      ).rows[0].n,
    ).toBe(1);
  }
  const row = (
    await monitor.query(
      'select invoice_id,command_id,revision from private.commercial_invoice_draft_receipts where organization_id=$1',
      [p.org],
    )
  ).rows[0];
  expect(row).toEqual({
    invoice_id: p.invoice,
    command_id: p.command,
    revision: 1,
  });
}

it.skipIf(!db.fork)(
  'concurrent distinct invoice IDs for one issued source have one durable winner and retain the loser UNKNOWN hold',
  async () => {
    const peer = await db.fork!(),
      monitor = await db.fork!();
    let pending: ReturnType<typeof observed<CommercialDraft>> | undefined;
    try {
      const first = command(),
        second = command();
      const holder = await backend(db),
        waiter = await backend(peer);
      await login(companies[0], {}, peer);
      await db.exec('begin');
      const beforeCommit = await create(first);
      const loser = caller(peer, first.org);
      let settled = false;
      pending = observed(loser.client.create(input(second))).finally(() => {
        settled = true;
      });
      expect(
        (await blocked(monitor, waiter, holder, () => settled)).wait_event,
      ).toBe('transactionid');
      await db.exec('commit');
      expect(await pending).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('UNKNOWN') },
      });
      expect(loser.sqlError()).toMatchObject({ code: '23505' });
      expect((await read(first, first.command)).receipt).toEqual(
        beforeCommit.receipt,
      );
      await onlyWinner(monitor, first);
      await expect(loser.client.create(input(command()))).rejects.toThrow(
        'UNKNOWN',
      );
      expect(loser.queries()).toBe(1);
    } finally {
      await db.exec('rollback');
      await pending;
      await peer.close();
      await monitor.close();
    }
  },
);

it.skipIf(!db.fork)(
  'same command cannot acquire a substituted invoice identity while the original command commits',
  async () => {
    const peer = await db.fork!(),
      monitor = await db.fork!();
    let pending: ReturnType<typeof observed<CommercialDraft>> | undefined;
    try {
      const first = command(),
        substituted = {
          ...command(),
          command: first.command,
          title: 'Different invoice and payload',
        };
      const holder = await backend(db),
        waiter = await backend(peer);
      await login(companies[0], {}, peer);
      await db.exec('begin');
      const beforeCommit = await create(first);
      const loser = caller(peer, first.org);
      let settled = false;
      pending = observed(loser.client.create(input(substituted))).finally(
        () => {
          settled = true;
        },
      );
      expect(
        (await blocked(monitor, waiter, holder, () => settled)).wait_event,
      ).toBe('advisory');
      await db.exec('commit');
      expect(await pending).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('UNKNOWN') },
      });
      expect(loser.sqlError()).toMatchObject({
        code: '40001',
        message: expect.stringContaining('identity conflict'),
      });
      expect(
        (await loser.client.read(input(first), first.command)).receipt,
      ).toEqual(beforeCommit.receipt);
      await onlyWinner(monitor, first);
      // Another invoice's valid receipt does not reconcile this loser's exact hold.
      await expect(loser.client.create(input(command()))).rejects.toThrow(
        'UNKNOWN',
      );
      expect(loser.queries()).toBe(2);
    } finally {
      await db.exec('rollback');
      await pending;
      await peer.close();
      await monitor.close();
    }
  },
);

it.skipIf(!db.fork)(
  'the same command UUID remains tenant-scoped across simultaneous companies and cannot read the foreign receipt',
  async () => {
    const peer = await db.fork!(),
      monitor = await db.fork!();
    try {
      const first = command(),
        second = { ...command(companies[1]), command: first.command };
      await login(companies[1], {}, peer);
      await db.exec('begin');
      const beforeCommit = await create(first);
      const other = caller(peer, second.org);
      // Must finish while tenant one's transaction is still open. A global key or
      // advisory namespace would wait and hit the unchanged SQL lock timeout.
      const independentlyCommitted = await other.client.create(input(second));
      expect(independentlyCommitted.receipt).toMatchObject({
        commandId: first.command,
        organizationId: second.org,
        invoiceId: second.invoice,
        customerId: second.customer,
        sourceVersionId: second.version,
      });
      await db.exec('commit');
      expect((await read(first, first.command)).receipt).toEqual(
        beforeCommit.receipt,
      );
      expect(
        (await other.client.read(input(second), second.command)).receipt,
      ).toEqual(independentlyCommitted.receipt);
      await expect(
        other.client.read(input(first), first.command),
      ).rejects.toThrow('UNKNOWN');
      expect(other.sqlError()).toMatchObject({ code: '42501' });
      await onlyWinner(monitor, first);
      await onlyWinner(monitor, second);
    } finally {
      await db.exec('rollback');
      await peer.close();
      await monitor.close();
    }
  },
);
