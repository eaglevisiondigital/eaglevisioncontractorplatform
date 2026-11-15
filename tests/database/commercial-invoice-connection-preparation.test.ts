import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import type { CommercialDraft } from '../../server/invoices/commercial-draft-client';
import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import { captureIssuanceAuthorFixture } from '../../proposals/commercial-invoice-issuance/author-fixture';
import {
  prepareDisposableInvoiceConnection as prepare,
  type IssuanceTarget,
} from '../../proposals/commercial-invoice-connection/connection';
const native =
  !!process.env.EV_TEST_PG_SOCKET ||
  (process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true');
const db = createTestDatabase();
let authDb: TestDatabase;
let fixtureAdmin = 'postgres';
const peers: Client[] = [];
const companies = Array.from({ length: 2 }, () => ({
  org: randomUUID(),
  actor: randomUUID(),
  session: randomUUID(),
  customer: randomUUID(),
  location: randomUUID(),
  tax: randomUUID(),
  version: '',
  estimate: '',
}));
let draft: CommercialDraft, command: string;
function fixtureRoles(sql: string) {
  return sql
    .replaceAll(
      'propel_commercial_draft_owner',
      'propel_invoice_connection_test_owner',
    )
    .replaceAll(
      'propel_commercial_draft_runtime',
      'propel_invoice_connection_test_draft_runtime',
    )
    .replaceAll(
      'propel_commercial_issue_runtime',
      'propel_invoice_connection_test_issue_runtime',
    );
}
async function login(c = companies[0]) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: c.actor,
      session_id: c.session,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await db.exec('set role propel_invoice_connection_test_issue_runtime');
}
async function admin(sql: string, p: unknown[] = []) {
  await db.exec('reset role');
  const r = await db.query(sql, p);
  await login();
  return r;
}
beforeAll(async () => {
  if (!native) return;
  fixtureAdmin = String((await db.query('select current_user u')).rows[0].u);
  if (!/^[a-z_]+$/.test(fixtureAdmin)) throw Error('Unsafe fixture admin');
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  const original = captureIssuanceAuthorFixture().original;
  expect(createHash('sha256').update(original).digest('hex')).toBe(
    'da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e',
  );
  const anchor =
    " if not found then raise exception 'Exact invoice draft unavailable' using errcode='42501';end if;";
  expect(original.split(anchor)).toHaveLength(2);
  // Qualify the proposed guard in a disposable DB only. Canonical source bytes
  // remain unchanged and require separate exact source-author authorization.
  const guarded = original.replace(
    anchor,
    anchor +
      "\n if to_jsonb(h)->>'issued_revision' is not null then raise exception 'Invoice already issued; use issued reader' using errcode='42501';end if;",
  );
  expect(createHash('sha256').update(guarded).digest('hex')).toBe(
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  );
  await db.exec(fixtureRoles(guarded));
  await db.exec(
    fixtureRoles(
      readFileSync(
        'proposals/commercial-invoice-issuance/issuance.proposed.sql',
        'utf8',
      ),
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
      "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL ISSUANCE LAB',$2,'construction','active')",
      [c.org, 'issue-' + c.org],
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
      "insert into public.service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Fictional','Fixture','ZZ','00000','US')",
      [c.location, c.org, c.customer],
    );
    await db.query(
      "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Fixture','TEST','Fixture','Fixture',1000,'reviewed')",
      [c.tax, c.org],
    );
    await db.query(
      "insert into private.commercial_draft_authorities values($1,$2,clock_timestamp()+interval '1 hour',null,'DISPOSABLE ONLY')",
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
    payload.internal_notes = 'PRIVATE SOURCE SECRET';
    payload.lines[0] = {
      ...payload.lines[0],
      description: 'Fictional scope',
      quantity_milli: 1000,
      unit_price_minor: 1000,
      unit_cost_minor: 500,
      taxable: true,
    };
    const b = (
      await db.query<{ v: EstimateBundle }>(
        'select public.create_estimate($1,$2,$3) v',
        [c.org, payload, randomUUID()],
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
    await db.exec('reset role');
  }
  await db.exec(`create role propel_invoice_connection_test_draft_login login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-ci-only';grant propel_invoice_connection_test_draft_runtime to propel_invoice_connection_test_draft_login;
create role propel_invoice_connection_test_issue_login login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-ci-only';grant propel_invoice_connection_test_issue_runtime to propel_invoice_connection_test_issue_login;`);
  authDb = await db.fork!();
});
beforeEach(async () => {
  if (!native) return;
  await db.exec('rollback; reset role');
  await db.exec(
    'truncate private.commercial_issue_authorities,private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts cascade',
  );
  const c = companies[0];
  // Each test receives an independent immutable issued source. Permanent source
  // fences MUST NOT be reset to make unrelated test cases appear reusable.
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: c.actor, aal: 'aal2' }),
  ]);
  await db.exec('set role authenticated');
  const payload = blankEstimate(c.customer);
  payload.location_id = c.location;
  payload.tax_policy_id = c.tax;
  payload.expires_on = '2099-12-31';
  payload.lines[0] = {
    ...payload.lines[0],
    description: 'Independent fictional source',
    quantity_milli: 1000,
    unit_price_minor: 1000,
    unit_cost_minor: 500,
    taxable: true,
  };
  const created = (
    await db.query<{ v: EstimateBundle }>(
      'select public.create_estimate($1,$2,$3) v',
      [c.org, payload, randomUUID()],
    )
  ).rows[0].v;
  const issued = (
    await db.query<{ v: EstimateBundle }>(
      'select public.issue_estimate($1,$2,$3,$4) v',
      [
        c.org,
        created.estimate.id,
        created.version.id,
        created.version.lock_revision,
      ],
    )
  ).rows[0].v;
  c.version = issued.version.id;
  c.estimate = issued.estimate.id;
  await db.exec('reset role');

  await db.query(
    "update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",
    [c.session],
  );
  await db.query(
    'update public.memberships set active=true where organization_id=$1 and user_id=$2',
    [c.org, c.actor],
  );
  await db.query(
    'update private.commercial_draft_authorities set revoked_at=null where organization_id=$1 and actor_id=$2',
    [c.org, c.actor],
  );
  await db.query(
    "update public.estimates set status='issued',current_version_id=$1 where id=$2",
    [c.version, c.estimate],
  );
  await login();
  await db.exec('set role propel_invoice_connection_test_draft_runtime');
  draft = (
    await db.query<{ result: CommercialDraft }>(
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,$5,$6,$7,$8) result',
      [
        c.org,
        randomUUID(),
        randomUUID(),
        c.customer,
        c.location,
        c.version,
        'Fictional invoice <safe>',
        'PRIVATE STAFF MEMO',
      ],
    )
  ).rows[0].result;
  command = randomUUID();
  await admin(
    "insert into private.commercial_issue_authorities values($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour',null,'DISPOSABLE ISSUANCE REVIEW')",
    [c.org, draft.invoiceId, c.actor, draft.revision, draft.sourceHash],
  );
});

afterEach(async () => {
  for (const peer of peers.splice(0)) await peer.end();
});
afterAll(async () => {
  if (native) {
    await authDb.close();
    await db.exec('reset role');
    for (const role of [
      'propel_invoice_connection_test_draft_login',
      'propel_invoice_connection_test_issue_login',
      'propel_invoice_connection_test_owner',
      'propel_invoice_connection_test_draft_runtime',
      'propel_invoice_connection_test_issue_runtime',
    ])
      await db.exec(
        `reassign owned by ${role} to ${fixtureAdmin};drop owned by ${role};drop role ${role}`,
      );
  }
  await db.close();
});
const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_fictional_only',
};
const tokens = new Map<
  string,
  { claims: Record<string, unknown>; bearer: string }
>();
function token(c: (typeof companies)[number]) {
  if (!tokens.has(c.actor)) {
    const now = Math.floor(Date.now() / 1000),
      claims = {
        sub: c.actor,
        session_id: c.session,
        aal: 'aal2',
        exp: now + 3600,
        iat: now,
        iss: config.url + '/auth/v1',
        aud: 'authenticated',
        role: 'authenticated',
      };
    tokens.set(c.actor, {
      claims,
      bearer:
        Buffer.from('{}').toString('base64url') +
        '.' +
        Buffer.from(JSON.stringify(claims)).toString('base64url') +
        '.fictional',
    });
  }
  return tokens.get(c.actor)!;
}
const target = (): IssuanceTarget => ({
  organizationId: draft.organizationId,
  invoiceId: draft.invoiceId,
  customerId: draft.customerId,
  locationId: draft.locationId,
  sourceVersionId: draft.sourceVersionId,
  revision: draft.revision,
  sourceHash: draft.sourceHash,
});
async function connect(
  workload: 'draft' | 'issue' = 'issue',
  c = companies[0],
  override: Partial<IssuanceTarget> = {},
  numbering:
    'NOT_ACCEPTED' | 'FICTIONAL_FULL_UUID_ONLY' = 'FICTIONAL_FULL_UUID_ONLY',
) {
  const database = String(
    (await authDb.query('select current_database() d')).rows[0].d,
  );
  if (!/^ev_test_[a-f0-9]{32}$/.test(database))
    throw Error('Disposable native database required');
  const user =
    workload === 'draft'
      ? 'propel_invoice_connection_test_draft_login'
      : 'propel_invoice_connection_test_issue_login';
  const socket = process.env.EV_TEST_PG_SOCKET;
  const raw = new Client({
    host: socket ?? '127.0.0.1',
    port: socket ? 55477 : 5432,
    user,
    password: socket ? undefined : 'synthetic-ci-only',
    database,
  });
  await raw.connect();
  peers.push(raw);
  const { bearer } = token(c);
  let writes = 0,
    lose = false,
    hook: undefined | (() => Promise<void>);
  const port = {
    async query<T extends Record<string, unknown>>(
      text: string,
      p?: unknown[],
    ) {
      const mutation =
        text.startsWith('select private.commercial_invoice_issue(') ||
        text.startsWith('select private.commercial_invoice_draft_create(') ||
        text.startsWith('select private.commercial_invoice_draft_save(');
      if (mutation) writes++;
      const result = await raw.query<T>(text, p);
      if (mutation) {
        if (hook) await hook();
        if (lose) {
          lose = false;
          throw Error('Controlled ACK loss after native commit');
        }
      }
      return { rows: result.rows };
    },
  };
  const auth = new CustomerBrokerAuth(config, async (input, init) => {
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer ' + bearer,
    );
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: c.actor });
    if (path === '/rest/v1/rpc/customer_session_status') {
      const active = Boolean(
        (
          await authDb.query(
            'select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2 and u.email_confirmed_at is not null and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=clock_timestamp()) and (s.not_after is null or s.not_after>clock_timestamp())) active',
            [c.actor, c.session],
          )
        ).rows[0].active,
      );
      return Response.json({ user_id: c.actor, session_id: c.session, active });
    }
    throw Error('No hosted Auth in native fixture');
  });
  const handle = await prepare(
    {
      auth,
      bearer,
      async acquire() {
        return {
          sql: port,
          async destroy() {
            await raw.end();
          },
        };
      },
    },
    {
      organizationId: c.org,
      workload,
      ...(workload === 'issue' ? { target: { ...target(), ...override } } : {}),
      numbering,
    },
    true,
  );
  return {
    handle: handle!,
    raw,
    writes: () => writes,
    lose: () => {
      lose = true;
    },
    after: (fn: () => Promise<void>) => {
      hook = fn;
    },
  };
}
const test = it.skipIf(!native);
test('qualified dedicated draft connection saves/reopens then preserves its source fence across leases', async () => {
  const a = await connect('draft');
  const identity = {
    invoiceId: draft.invoiceId,
    customerId: draft.customerId,
    locationId: draft.locationId,
    sourceVersionId: draft.sourceVersionId,
  };
  const next = await a.handle.drafts!.save({
    ...identity,
    commandId: randomUUID(),
    expectedRevision: 1,
    title: 'Revised via original writer',
    memo: 'Private review',
  });
  expect(next.revision).toBe(2);
  expect((await a.handle.drafts!.read(identity)).revision).toBe(2);
  await a.handle.close();
  const b = await connect('draft');
  expect((await b.handle.drafts!.read(identity)).title).toBe(next.title);
  await expect(
    b.handle.drafts!.save({
      ...identity,
      commandId: randomUUID(),
      expectedRevision: 2,
      title: 'Replacement writer',
      memo: '',
    }),
  ).rejects.toThrow();
  expect(b.writes()).toBe(0);
  await b.handle.close();
});
test('numbering remains a separate decision before native issue dispatch', async () => {
  const a = await connect('issue', companies[0], {}, 'NOT_ACCEPTED');
  await expect(a.handle.issuer!.issue(command)).rejects.toThrow();
  expect(a.writes()).toBe(0);
  await a.handle.close();
});
test('native issue persists immutable number/original receipt and reopens on a new restricted connection', async () => {
  const a = await connect();
  const first = await a.handle.issuer!.issue(command);
  expect(first).toMatchObject({
    state: 'issued',
    paymentState: 'unverified',
    amountMinor: 1100,
    issuanceReceiptId: command,
  });
  await a.handle.close();
  const b = await connect();
  expect(await b.handle.issuer!.readOriginal(command)).toEqual(first);
  expect(b.writes()).toBe(0);
  await expect(b.handle.issuer!.issue(randomUUID())).rejects.toThrow();
  await b.handle.close();
});
test('committed native lost ACK reconciles exact original across leases without dispatch replay', async () => {
  const a = await connect();
  a.lose();
  await expect(a.handle.issuer!.issue(command)).rejects.toThrow('UNKNOWN');
  await a.handle.close();
  const b = await connect();
  expect(b.handle.issuer!.status()).toBe('UNKNOWN');
  expect((await b.handle.issuer!.readOriginal(command)).issuanceReceiptId).toBe(
    command,
  );
  expect(b.handle.issuer!.status()).toBe('UNKNOWN');
  expect((await b.handle.issuer!.reconcile()).issuanceReceiptId).toBe(command);
  expect(b.writes()).toBe(0);
  await b.handle.close();
});
test('competing native connections admit only one original issuance command', async () => {
  const a = await connect(),
    b = await connect();
  const results = await Promise.allSettled([
    a.handle.issuer!.issue(command),
    b.handle.issuer!.issue(randomUUID()),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(a.writes() + b.writes()).toBe(1);
  await a.handle.close();
  await b.handle.close();
});
test.each(['customerId', 'sourceVersionId', 'revision'] as const)(
  'native current source/authority denies wrong %s',
  async (key) => {
    const a = await connect('issue', companies[0], {
      [key]: key === 'revision' ? 2 : randomUUID(),
    });
    await expect(a.handle.issuer!.issue(command)).rejects.toThrow();
    expect(
      (
        await admin(
          'select issued_revision from private.commercial_invoice_drafts where id=$1',
          [draft.invoiceId],
        )
      ).rows[0].issued_revision,
    ).toBeNull();
    await a.handle.close();
  },
);
test('post-await current-session revocation preserves committed UNKNOWN', async () => {
  const a = await connect();
  a.after(async () => {
    await authDb.query(
      "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
      [companies[0].session],
    );
  });
  await expect(a.handle.issuer!.issue(command)).rejects.toThrow('UNKNOWN');
  await expect(a.handle.issuer!.reconcile()).rejects.toThrow();
  expect(a.writes()).toBe(1);
  await authDb.query(
    "update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",
    [companies[0].session],
  );
  expect((await a.handle.issuer!.reconcile()).issuanceReceiptId).toBe(command);
  expect(a.writes()).toBe(1);
  await a.handle.close();
});
test('revoked inherited runtime membership is denied before dispatch', async () => {
  const a = await connect();
  await admin(
    'revoke propel_invoice_connection_test_issue_runtime from propel_invoice_connection_test_issue_login',
  );
  try {
    await expect(a.handle.issuer!.issue(command)).rejects.toThrow();
    expect(a.writes()).toBe(0);
  } finally {
    await admin(
      'grant propel_invoice_connection_test_issue_runtime to propel_invoice_connection_test_issue_login',
    );
    await a.handle.close();
  }
});
test('revoked invoice-specific issue authority denies native dispatch effect', async () => {
  const a = await connect();
  await admin(
    'update private.commercial_issue_authorities set revoked_at=clock_timestamp() where organization_id=$1 and invoice_id=$2',
    [draft.organizationId, draft.invoiceId],
  );
  await expect(a.handle.issuer!.issue(command)).rejects.toThrow();
  expect(
    (
      await admin(
        'select issued_revision from private.commercial_invoice_drafts where id=$1',
        [draft.invoiceId],
      )
    ).rows[0].issued_revision,
  ).toBeNull();
  await a.handle.close();
});
test('wrong tenant cannot issue another company invoice', async () => {
  const a = await connect('issue', companies[1], {
    organizationId: companies[1].org,
  });
  await expect(a.handle.issuer!.issue(command)).rejects.toThrow();
  expect(
    (
      await admin(
        'select issued_revision from private.commercial_invoice_drafts where id=$1',
        [draft.invoiceId],
      )
    ).rows[0].issued_revision,
  ).toBeNull();
  await a.handle.close();
});
test('lost draft ACK blocks issuance until original-client receipt reconciliation, then exact revised issue succeeds', async () => {
  const a = await connect('draft'),
    write = {
      invoiceId: draft.invoiceId,
      customerId: draft.customerId,
      locationId: draft.locationId,
      sourceVersionId: draft.sourceVersionId,
      commandId: randomUUID(),
      expectedRevision: 1,
      title: 'Reviewed revision two',
      memo: 'Private review only',
    };
  a.lose();
  await expect(a.handle.drafts!.save(write)).rejects.toThrow();
  expect(a.writes()).toBe(1);
  const blocked = await connect();
  await expect(blocked.handle.issuer!.issue(randomUUID())).rejects.toThrow(
    'UNKNOWN',
  );
  expect(blocked.writes()).toBe(0);
  // A current latest read is permitted, but is not exact receipt reconciliation.
  expect((await a.handle.drafts!.read(write)).revision).toBe(2);
  expect(
    (await a.handle.drafts!.read(write, draft.receipt.commandId)).revision,
  ).toBe(1);
  await expect(blocked.handle.issuer!.issue(randomUUID())).rejects.toThrow(
    'UNKNOWN',
  );
  expect(blocked.writes()).toBe(0);
  await expect(blocked.handle.issuer!.issue(randomUUID())).rejects.toThrow(
    'UNKNOWN',
  );
  expect(blocked.writes()).toBe(0);
  await blocked.handle.close();
  const recovered = await a.handle.drafts!.read(write, write.commandId);
  expect(recovered.revision).toBe(2);
  draft = recovered;
  await admin(
    'update private.commercial_issue_authorities set revision=$1,source_hash=$2 where organization_id=$3 and invoice_id=$4',
    [draft.revision, draft.sourceHash, draft.organizationId, draft.invoiceId],
  );
  const issuer = await connect();
  expect((await issuer.handle.issuer!.issue(command)).revision).toBe(2);
  expect(a.writes()).toBe(1);
  await issuer.handle.close();
  await a.handle.close();
});
test('new lease original draft read cannot silently reset the original UNKNOWN write fence', async () => {
  const a = await connect('draft'),
    write = {
      invoiceId: draft.invoiceId,
      customerId: draft.customerId,
      locationId: draft.locationId,
      sourceVersionId: draft.sourceVersionId,
      commandId: randomUUID(),
      expectedRevision: 1,
      title: 'Original uncertain save',
      memo: '',
    };
  a.lose();
  await expect(a.handle.drafts!.save(write)).rejects.toThrow();
  expect(a.writes()).toBe(1);
  await a.handle.close();
  const b = await connect('draft');
  expect((await b.handle.drafts!.read(write, write.commandId)).revision).toBe(
    2,
  );
  await expect(
    b.handle.drafts!.save({
      ...write,
      commandId: randomUUID(),
      expectedRevision: 2,
    }),
  ).rejects.toThrow();
  expect(b.writes()).toBe(0);
  const issuer = await connect();
  await expect(issuer.handle.issuer!.issue(randomUUID())).rejects.toThrow(
    'UNKNOWN',
  );
  expect(issuer.writes()).toBe(0);
  await issuer.handle.close();
  await b.handle.close();
});
test('another current owner cannot clear the original actor/session issuance UNKNOWN', async () => {
  const a = await connect();
  a.lose();
  await expect(a.handle.issuer!.issue(command)).rejects.toThrow();
  const other = { ...companies[0], actor: randomUUID(), session: randomUUID() };
  await admin(
    'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
    [other.actor, other.actor + '@example.test'],
  );
  await admin(
    "insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 hour')",
    [other.session, other.actor],
  );
  await admin(
    "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
    [other.org, other.actor],
  );
  await admin(
    "insert into private.commercial_draft_authorities values($1,$2,clock_timestamp()+interval '1 hour',null,'DISPOSABLE ONLY')",
    [other.org, other.actor],
  );
  const b = await connect('issue', other);
  expect(b.handle.issuer!.status()).toBe('UNKNOWN');
  await expect(b.handle.issuer!.reconcile()).rejects.toThrow();
  await expect(b.handle.issuer!.readOriginal(command)).rejects.toThrow();
  expect(b.writes()).toBe(0);
  expect((await a.handle.issuer!.reconcile()).issuanceReceiptId).toBe(command);
  await b.handle.close();
  await a.handle.close();
});
test('native runtime BYPASSRLS escalation is denied without weakening forced RLS', async () => {
  const a = await connect();
  await admin(
    'alter role propel_invoice_connection_test_issue_runtime bypassrls',
  );
  try {
    await expect(a.handle.issuer!.issue(command)).rejects.toThrow();
    expect(a.writes()).toBe(0);
  } finally {
    await admin(
      'alter role propel_invoice_connection_test_issue_runtime nobypassrls',
    );
    await a.handle.close();
  }
});

test('dedicated draft factory creates once and preserves original revisions through Save/reopen', async () => {
  await admin(
    'truncate private.commercial_issue_authorities,private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts cascade',
  );
  const a = await connect('draft'),
    write = {
      invoiceId: randomUUID(),
      customerId: draft.customerId,
      locationId: draft.locationId,
      sourceVersionId: draft.sourceVersionId,
      commandId: randomUUID(),
      expectedRevision: 0,
      title: 'Created through original client',
      memo: 'Private staff input',
    };
  const first = await a.handle.drafts!.create(write);
  expect(first.revision).toBe(1);
  expect(first.amountMinor).toBe(1100);
  const next = await a.handle.drafts!.save({
    ...write,
    commandId: randomUUID(),
    expectedRevision: 1,
    title: 'Explicit next revision',
  });
  expect(next.revision).toBe(2);
  expect((await a.handle.drafts!.read(write)).revision).toBe(2);
  expect((await a.handle.drafts!.read(write, write.commandId)).title).toBe(
    first.title,
  );
  await expect(a.handle.drafts!.create(write)).rejects.toThrow();
  expect(a.writes()).toBe(2);
  await a.handle.close();
});
