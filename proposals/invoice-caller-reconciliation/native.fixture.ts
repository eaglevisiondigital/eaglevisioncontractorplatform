import { Client } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
import {
  createTestDatabase,
  type TestDatabase,
} from '../../tests/database/engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import type {
  CommercialDraft,
  DraftWrite,
  DraftIdentity,
} from '../../server/invoices/commercial-draft-client';
// Isolated qualifier loads only patched disposable copies.
import { qualify } from './qualify.mjs';
interface DraftClient {
  create(v: DraftWrite): Promise<CommercialDraft>;
  save(v: DraftWrite): Promise<CommercialDraft>;
  read(v: DraftIdentity, command?: string | null): Promise<CommercialDraft>;
}
interface Scope {
  database: string;
  pid: number;
  backend_start: string;
  login: string;
  current_role: string;
}
interface Candidate {
  CommercialDraftClient: new (
    sql: TestDatabase,
    org: string,
    caller?: unknown,
  ) => DraftClient;
  CommercialCallerConnection: new (
    sql: TestDatabase,
    auth: unknown,
    bearer: string,
    scope: Scope,
  ) => unknown;
  CustomerBrokerAuth: new (
    config: { url: string; publishableKey: string },
    transport: typeof fetch,
  ) => unknown;
}
const candidate = qualify().candidate as unknown as Candidate;
const db = createTestDatabase();
let authDb: TestDatabase | undefined;
const leases: { raw: Client; role: string }[] = [];
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
  await connection.exec('set role propel_invoice_caller_runtime');
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
      .replaceAll(
        'propel_commercial_draft_owner',
        'propel_invoice_caller_owner',
      )
      .replaceAll(
        'propel_commercial_draft_runtime',
        'propel_invoice_caller_runtime',
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
    `reassign owned by propel_invoice_caller_owner to ${admin};drop owned by propel_invoice_caller_owner;drop owned by propel_invoice_caller_runtime;drop role propel_invoice_caller_runtime;drop role propel_invoice_caller_owner`,
  );
  await authDb?.close();
  await db.close();
});

beforeAll(async () => {
  if (db.fork) authDb = await db.fork();
});
afterEach(async () => {
  await reset();
  for (const lease of leases.splice(0).reverse()) {
    await lease.raw.end();
    await db.exec(`drop owned by ${lease.role};drop role ${lease.role}`);
  }
});
const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_synthetic_only',
};
type Company = (typeof companies)[number];
function token(c: Company) {
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    sub: c.actor,
    session_id: c.session,
    aal: 'aal2',
    exp: iat + 3600,
    iat,
    iss: config.url + '/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
  };
  return {
    claims,
    bearer:
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
        'base64url',
      ) +
      '.' +
      Buffer.from(JSON.stringify(claims)).toString('base64url') +
      '.controlled_signature',
  };
}
async function additionalOwner(): Promise<Company> {
  const c = {
    ...companies[0],
    actor: crypto.randomUUID(),
    session: crypto.randomUUID(),
  };
  await reset();
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
    [c.actor, c.actor + '@example.test'],
  );
  await db.query(
    "insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 hour')",
    [c.session, c.actor],
  );
  await db.query(
    "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
    [c.org, c.actor],
  );
  await db.query(
    "insert into private.commercial_draft_authorities values($1,$2,clock_timestamp()+interval '1 hour',null,'SYNTHETIC TEST ONLY')",
    [c.org, c.actor],
  );
  return c;
}
async function connection(c: Company) {
  if (!authDb)
    throw Error('Native independent Auth fixture connection required');
  const database = String(
    (await db.query('select current_database() name')).rows[0].name,
  );
  if (!/^ev_test_[a-f0-9]{32}$/.test(database))
    throw Error('Disposable native database required');
  await reset();
  const role = 'invoice_caller_' + crypto.randomUUID().replaceAll('-', '');
  await db.exec(
    `create role ${role} login inherit nosuperuser nocreatedb nocreaterole nobypassrls password 'synthetic-ci-only';grant propel_invoice_caller_runtime to ${role}`,
  );
  const localSocket = process.env.EV_TEST_PG_SOCKET;
  const raw = new Client({
    host: localSocket ?? '127.0.0.1',
    port: localSocket ? 55477 : 5432,
    user: role,
    password: localSocket ? undefined : 'synthetic-ci-only',
    database,
  });
  await raw.connect();
  leases.push({ raw, role });
  const { claims, bearer } = token(c);
  await raw.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(claims),
  ]);
  let writes = 0,
    reads = 0,
    loseWrite = false;
  let afterWrite:
    ((draft: CommercialDraft) => void | Promise<void>) | undefined;
  let afterRead: ((draft: CommercialDraft) => void | Promise<void>) | undefined;
  const port: TestDatabase = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) {
      const isWrite =
        sql.includes('private.commercial_invoice_draft_create(') ||
        sql.includes('private.commercial_invoice_draft_save(');
      if (isWrite) writes++;
      const result = await raw.query<T>(sql, params);
      if (
        sql.includes('private.commercial_invoice_draft_create(') ||
        sql.includes('private.commercial_invoice_draft_save(')
      ) {
        if (afterWrite)
          await afterWrite(result.rows[0].result as CommercialDraft);
        if (loseWrite) {
          loseWrite = false;
          throw Error('Synthetic ACK loss after actual SQL commit');
        }
      }
      if (sql.includes('private.commercial_invoice_draft_read(')) {
        reads++;
        if (afterRead)
          await afterRead(result.rows[0].result as CommercialDraft);
      }
      return { rows: result.rows };
    },
    async exec(sql: string) {
      return raw.query(sql);
    },
    async close() {},
  };
  const scope = (
    await raw.query<Scope>(
      'select current_database() database,pg_backend_pid() pid,backend_start::text,session_user::text login,current_user::text current_role from pg_stat_activity where pid=pg_backend_pid()',
    )
  ).rows[0];
  // This controlled provider exercises the actual pinned SDK and opaque Auth proof.
  // Native DB rows supply current-session truth; no signature or hosted Auth is claimed.
  const auth = new candidate.CustomerBrokerAuth(config, async (input, init) => {
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer ' + bearer,
    );
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: c.actor });
    if (path === '/rest/v1/rpc/customer_session_status') {
      const active = (
        await authDb!.query<{ active: boolean }>(
          'select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2 and u.email_confirmed_at is not null and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=clock_timestamp()) and (s.not_after is null or s.not_after>clock_timestamp())) active',
          [c.actor, c.session],
        )
      ).rows[0].active;
      return Response.json({ user_id: c.actor, session_id: c.session, active });
    }
    throw Error('Forbidden controlled Auth provider path');
  });
  const caller = new candidate.CommercialCallerConnection(
    port,
    auth,
    bearer,
    scope,
  );
  const client = new candidate.CommercialDraftClient(port, c.org, caller);
  return {
    port,
    caller,
    client,
    claims,
    raw,
    writes: () => writes,
    reads: () => reads,
    newCaller() {
      return new candidate.CommercialCallerConnection(
        port,
        auth,
        bearer,
        scope,
      );
    },
    afterWrite(fn: (draft: CommercialDraft) => void | Promise<void>) {
      afterWrite = fn;
    },
    loseNextWrite() {
      loseWrite = true;
    },
    afterRead(fn: (draft: CommercialDraft) => void | Promise<void>) {
      afterRead = fn;
    },
  };
}
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

it.skipIf(!db.fork)(
  'native actor B cannot release UNKNOWN with actor A receipt or rebind to a replacement command',
  async () => {
    const a = companies[0],
      p = command(),
      original = await create(p),
      b = await additionalOwner();
    const other = await connection(b);
    await expect(other.client.create(input(p))).rejects.toThrow('UNKNOWN');
    await expect(other.client.read(input(p), p.command)).rejects.toThrow(
      'UNKNOWN',
    );
    await expect(
      other.client.save({
        ...input(p),
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
        title: 'Must remain held',
      }),
    ).rejects.toThrow('UNKNOWN');
    expect(other.writes()).toBe(1);
    await login(a);
    expect((await read(p, p.command)).receipt).toEqual(original.receipt);
    const own = await connection(a);
    expect((await own.client.read(input(p), p.command)).receipt).toEqual(
      original.receipt,
    );
    await reset();
    expect(
      (
        await db.query(
          'select count(*)::int n from private.commercial_invoice_draft_receipts where organization_id=$1',
          [a.org],
        )
      ).rows[0].n,
    ).toBe(1);
  },
);

it.skipIf(!db.fork)(
  'native lost ACK reconciles only original actor and hash while case-alias replay remains held',
  async () => {
    const c = companies[0],
      p = command(),
      s = await connection(c);
    s.loseNextWrite();
    await expect(s.client.create(input(p))).rejects.toThrow('UNKNOWN');
    const alias = {
      ...input(p),
      invoiceId: p.invoice.toUpperCase(),
      sourceVersionId: p.version.toUpperCase(),
      commandId: p.command.toUpperCase(),
    };
    await expect(s.client.create(alias)).rejects.toThrow('UNKNOWN');
    expect(s.writes()).toBe(1);
    const original = await s.client.read(input(p), p.command);
    expect(original.receipt.actorId).toBe(c.actor);
    expect(original.revision).toBe(1);
    await expect(s.client.create(alias)).rejects.toThrow('UNKNOWN');
    expect(s.writes()).toBe(1);
    expect(
      (
        await s.client.save({
          ...input(p),
          commandId: crypto.randomUUID(),
          expectedRevision: 1,
          title: 'Separate current manual edit',
        })
      ).revision,
    ).toBe(2);
  },
);

it
  .skipIf(!db.fork)
  .each(['actor', 'hash', 'tenant', 'customer', 'version', 'command'] as const)(
  'native %s receipt substitution cannot clear original UNKNOWN',
  async (mode) => {
    const c = companies[0],
      p = command(),
      s = await connection(c);
    s.loseNextWrite();
    await expect(s.client.create(input(p))).rejects.toThrow('UNKNOWN');
    s.afterRead((d) => {
      if (mode === 'actor') d.receipt.actorId = crypto.randomUUID();
      if (mode === 'hash') d.receipt.requestHash = 'f'.repeat(64);
      if (mode === 'tenant') d.organizationId = crypto.randomUUID();
      if (mode === 'customer') d.customerId = crypto.randomUUID();
      if (mode === 'version') d.sourceVersionId = crypto.randomUUID();
      if (mode === 'command') {
        d.receipt.commandId = crypto.randomUUID();
        d.receipt.id = d.receipt.commandId;
      }
    });
    await expect(s.client.read(input(p), p.command)).rejects.toThrow('UNKNOWN');
    await expect(
      s.client.save({
        ...input(p),
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
        title: 'Must not dispatch',
      }),
    ).rejects.toThrow('UNKNOWN');
    expect(s.writes()).toBe(1);
    await login(c);
    expect((await read(p, p.command)).revision).toBe(1);
  },
);

it.skipIf(!db.fork)(
  'native session withdrawal after receipt SQL returns cannot release hold or expose the result',
  async () => {
    const c = companies[0],
      p = command(),
      s = await connection(c);
    s.loseNextWrite();
    await expect(s.client.create(input(p))).rejects.toThrow('UNKNOWN');
    s.afterRead(async () => {
      await authDb!.query(
        "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
        [c.session],
      );
    });
    await expect(s.client.read(input(p), p.command)).rejects.toThrow('UNKNOWN');
    await expect(
      s.client.save({
        ...input(p),
        commandId: crypto.randomUUID(),
        expectedRevision: 1,
        title: 'Held after revocation',
      }),
    ).rejects.toThrow('UNKNOWN');
    expect(s.writes()).toBe(1);
    await reset();
    expect(
      (
        await db.query(
          'select count(*)::int n from private.commercial_invoice_draft_receipts where command_id=$1',
          [p.command],
        )
      ).rows[0].n,
    ).toBe(1);
  },
);

it.skipIf(!db.fork)(
  'native committed ACK loss holds the shared connection lease across two participating client instances',
  async () => {
    const c = companies[0],
      p = command(),
      s = await connection(c);
    let release!: () => void, seen!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      committed = new Promise<void>((resolve) => {
        seen = resolve;
      });
    s.afterWrite(async () => {
      seen();
      await gate;
    });
    s.loseNextWrite();
    const pending = s.client.create(input(p)).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
    try {
      await committed;
      const other = new candidate.CommercialDraftClient(
        s.port,
        c.org,
        s.newCaller(),
      );
      const next = { ...input(command(c)), title: 'Competing new attempt' };
      await expect(other.create(next)).rejects.toThrow('UNKNOWN');
      expect(s.writes()).toBe(1);
      release();
      expect(await pending).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('UNKNOWN') },
      });
      const original = await s.client.read(input(p), p.command);
      expect(original.receipt.actorId).toBe(c.actor);
      expect(original.revision).toBe(1);
      await expect(s.client.create(input(p))).rejects.toThrow('UNKNOWN');
      await expect(
        other.create({ ...next, commandId: crypto.randomUUID() }),
      ).rejects.toThrow('UNKNOWN');
      expect(s.writes()).toBe(1);
    } finally {
      release();
      await pending;
    }
  },
);
