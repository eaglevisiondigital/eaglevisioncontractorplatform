import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import type { CommercialDraft } from '../../server/invoices/commercial-draft-client';
import { captureIssuanceAuthorFixture } from '../../proposals/commercial-invoice-issuance/author-fixture';

const db = createTestDatabase();
const yearSql = readFileSync(
  'proposals/commercial-invoice-year-numbering/numbering.proposed.sql',
  'utf8',
);
const realIssuer = yearSql.slice(
  yearSql.indexOf(
    'create or replace function private.commercial_invoice_issue(',
  ),
  yearSql.lastIndexOf('commit;'),
);
const fixtureClock =
  'issued_now:=(select fixture_at from private.year_numbering_test_clock);';
if (realIssuer.split('issued_now:=pg_catalog.clock_timestamp();').length !== 2)
  throw Error('Exact fixture-only timestamp anchor required');
const fixtureIssuer = realIssuer.replace(
  'issued_now:=pg_catalog.clock_timestamp();',
  fixtureClock,
);
let fixtureAdmin = 'postgres';
function fixtureRoles(sql: string) {
  return sql
    .replaceAll(
      'propel_commercial_draft_owner',
      'propel_year_numbering_test_owner',
    )
    .replaceAll(
      'propel_commercial_draft_runtime',
      'propel_year_numbering_test_runtime',
    )
    .replaceAll(
      'propel_commercial_issue_runtime',
      'propel_year_numbering_test_issuer',
    );
}

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
let draft: CommercialDraft;
let command: string;
async function login(c = companies[0], connection = db, aal = 'aal2') {
  await connection.exec('reset role');
  await connection.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: c.actor,
      session_id: c.session,
      aal,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await connection.exec('set role propel_year_numbering_test_issuer');
}
async function issue(
  connection = db,
  patch: Partial<{
    org: string;
    invoice: string;
    command: string;
    revision: number;
    customer: string;
    location: string;
    version: string;
    hash: string;
  }> = {},
) {
  const p = {
    org: draft.organizationId,
    invoice: draft.invoiceId,
    command,
    revision: draft.revision,
    customer: draft.customerId,
    location: draft.locationId,
    version: draft.sourceVersionId,
    hash: draft.sourceHash,
    ...patch,
  };
  return (
    await connection.query<{ result: Record<string, unknown> }>(
      'select private.commercial_invoice_issue($1,$2,$3,$4,$5,$6,$7,$8) result',
      [
        p.org,
        p.invoice,
        p.command,
        p.revision,
        p.customer,
        p.location,
        p.version,
        p.hash,
      ],
    )
  ).rows[0].result;
}
async function read(connection = db, receipt: string | null = command) {
  return (
    await connection.query<{ result: Record<string, unknown> }>(
      'select private.commercial_invoice_issued_read($1,$2,$3) result',
      [draft.organizationId, draft.invoiceId, receipt],
    )
  ).rows[0].result;
}
async function admin(sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  const result = await db.query(sql, params);
  await login();
  return result;
}
async function waitForAdvisory(connection: TestDatabase, pid: number) {
  await connection.exec('reset role');
  for (let i = 0; i < 50; i++) {
    const status = await connection.query<{ waiting: boolean }>(
      "select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock' and wait_event='advisory') waiting",
      [pid],
    );
    if (status.rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error('Required native advisory wait was not observed');
}
beforeAll(async () => {
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
  const originalIssuance = readFileSync(
    'proposals/commercial-invoice-issuance/issuance.proposed.sql',
    'utf8',
  );
  expect(createHash('sha256').update(originalIssuance).digest('hex')).toBe(
    '961c2dc380695ed2d910108d09303fff9b9018fe8d159beb9b958ddb2725d022',
  );
  await db.exec(fixtureRoles(originalIssuance));
  const oldNumbering = readFileSync(
    'proposals/commercial-invoice-numbering/numbering.proposed.sql',
    'utf8',
  );
  expect(createHash('sha256').update(oldNumbering).digest('hex')).toBe(
    '49fbbde015b9cf7a92f2bbdb74f7f5c347a63246d63cc7c9a47724858b11922e',
  );
  await db.exec(fixtureRoles(oldNumbering));
  expect(createHash('sha256').update(yearSql).digest('hex')).toBe(
    '89cf71e709d94cb9d0c14bd7822f2dec613315dcbac24b05299b3b0ae15ae9f7',
  );
  await db.exec(fixtureRoles(yearSql));
  // Disposable test clock only, never part of the proposed business SQL.
  await db.exec(
    fixtureRoles(
      "create table private.year_numbering_test_clock(fixture_at timestamptz not null);insert into private.year_numbering_test_clock values('2026-12-31T23:59:59Z');grant select on private.year_numbering_test_clock to propel_commercial_draft_owner",
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
});
beforeEach(async () => {
  await db.exec('rollback; reset role');
  await db.exec(fixtureRoles(fixtureIssuer));
  await db.query('update private.year_numbering_test_clock set fixture_at=$1', [
    '2026-12-31T23:59:59Z',
  ]);
  await db.exec(
    'truncate private.commercial_issue_authorities,private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts cascade',
  );
  const c = companies[0];
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
  await db.exec('set role propel_year_numbering_test_runtime');
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
    "insert into private.commercial_issue_authorities values($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour',null,'DISPOSABLE ISSUANCE REVIEW','FICTA')",
    [c.org, draft.invoiceId, c.actor, draft.revision, draft.sourceHash],
  );
});
afterAll(async () => {
  await db.exec('rollback; reset role');
  const roles = await db.query<{ rolname: string }>(
    "select rolname from pg_roles where rolname in ('propel_year_numbering_test_owner','propel_year_numbering_test_runtime','propel_year_numbering_test_issuer')",
  );
  for (const { rolname } of roles.rows) {
    // Finite fixture-owned names only; do not adopt/drop the original suite roles.
    if (
      ![
        'propel_year_numbering_test_owner',
        'propel_year_numbering_test_runtime',
        'propel_year_numbering_test_issuer',
      ].includes(rolname)
    )
      throw Error('Unknown fixture role');
    await db.exec(
      `reassign owned by ${rolname} to ${fixtureAdmin};drop owned by ${rolname};drop role ${rolname}`,
    );
  }
  await db.close();
});

async function another(c = companies[0], namespace = 'FICTA') {
  await db.exec('reset role');
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
    description: 'Fictional second scope',
    quantity_milli: 1000,
    unit_price_minor: 1000,
    unit_cost_minor: 500,
    taxable: true,
  };
  const bundle = (
    await db.query<{ v: EstimateBundle }>(
      'select public.create_estimate($1,$2,$3) v',
      [c.org, payload, randomUUID()],
    )
  ).rows[0].v;
  await db.query('select public.issue_estimate($1,$2,$3,$4)', [
    c.org,
    bundle.estimate.id,
    bundle.version.id,
    bundle.version.lock_revision,
  ]);
  await login(c);
  await db.exec('set role propel_year_numbering_test_runtime');
  const d = (
    await db.query<{ result: CommercialDraft }>(
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,$5,$6,$7,$8) result',
      [
        c.org,
        randomUUID(),
        randomUUID(),
        c.customer,
        c.location,
        bundle.version.id,
        'Fictional',
        'PRIVATE',
      ],
    )
  ).rows[0].result;
  await db.exec('reset role');
  await db.query(
    "insert into private.commercial_issue_authorities values($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour',null,'DISPOSABLE NUMBER POLICY',$6)",
    [c.org, d.invoiceId, c.actor, d.revision, d.sourceHash, namespace],
  );
  await login();
  return d;
}
function identity(d: CommercialDraft) {
  return {
    org: d.organizationId,
    invoice: d.invoiceId,
    command: randomUUID(),
    revision: d.revision,
    customer: d.customerId,
    location: d.locationId!,
    version: d.sourceVersionId,
    hash: d.sourceHash,
  };
}
async function at(value: string) {
  await admin('update private.year_numbering_test_clock set fixture_at=$1', [
    value,
  ]);
}
it('uses the approved INV-YYYY-NNNNNN display while keeping trusted tenant identity separate', async () => {
  const r = await issue();
  expect(r.number).toBe('INV-2026-000001');
  expect(r.organizationId).toBe(draft.organizationId);
  expect(r.invoiceId).toBe(draft.invoiceId);
  expect(r.paymentState).toBe('unverified');
  expect(await read()).toEqual(r);
});
it('allocates six-digit ordinals within one tenant-year', async () => {
  await issue();
  expect((await issue(db, identity(await another()))).number).toBe(
    'INV-2026-000002',
  );
});
it('permits identical public displays for independent contractors without mixing tenants or receipts', async () => {
  const first = await issue();
  const other = await another(companies[1], 'FICTB');
  await login(companies[1]);
  const second = await issue(db, identity(other));
  expect(second.number).toBe(first.number);
  expect(second.organizationId).not.toBe(first.organizationId);
  await expect(read()).rejects.toThrow();
});
it('retains private namespace collision denial even though namespaces are not displayed', async () => {
  await expect(another(companies[1], 'FICTA')).rejects.toThrow(
    'namespace already bound',
  );
});
it('restarts only the new UTC calendar year and retains all earlier issued numbers', async () => {
  const first = await issue();
  await at('2027-01-01T00:00:00Z');
  expect((await issue(db, identity(await another()))).number).toBe(
    'INV-2027-000001',
  );
  expect(await read()).toEqual(first);
});
it.each(['Pacific/Honolulu', 'Pacific/Kiritimati'])(
  'UTC allocation does not change with session timezone %s',
  async (zone) => {
    await db.query("select set_config('TimeZone',$1,false)", [zone]);
    await at('2026-12-31T23:30:00-01:00');
    const r = await issue();
    expect(r.number).toBe('INV-2027-000001');
    expect(r.issuedAt).toBe('2027-01-01T00:30:00.000000Z');
    await db.exec("set timezone='UTC'");
  },
);
it('fails closed on UTC year regression rather than backdating or reusing a series', async () => {
  await at('2027-01-01T00:00:00Z');
  await issue();
  await at('2026-12-31T23:59:59Z');
  await expect(issue(db, identity(await another()))).rejects.toThrow(
    'year regressed',
  );
});
it('stops at999999 without wrapping or allocating a seventh digit', async () => {
  await admin(
    "update private.commercial_invoice_drafts set issued_revision=current_revision,number_namespace='FICTA',number_year=2026,number_ordinal=999999,invoice_number='INV-2026-999999',issue_command_id=$1,issued_actor_id=$2,issued_at='2026-12-31T23:59:59Z',issue_request_hash=repeat('a',64)",
    [command, companies[0].actor],
  );
  await expect(issue(db, identity(await another()))).rejects.toThrow(
    'year exhausted',
  );
  expect((await read()).number).toBe('INV-2026-999999');
});
it('rolls back only an uncommitted candidate, then can reuse that never-committed number', async () => {
  await db.exec('begin');
  expect((await issue()).number).toBe('INV-2026-000001');
  await db.exec('rollback');
  expect((await issue()).number).toBe('INV-2026-000001');
});
it('never reuses a committed number after attempted deletion or mutation', async () => {
  await issue();
  await expect(
    admin('delete from private.commercial_invoice_drafts'),
  ).rejects.toThrow('immutable');
  await expect(
    admin(
      "update private.commercial_invoice_drafts set number_year=2027,invoice_number='INV-2027-000001'",
    ),
  ).rejects.toThrow('immutable');
  expect((await issue(db, identity(await another()))).number).toBe(
    'INV-2026-000002',
  );
});
it('recovers the exact original committed receipt after a lost acknowledgment and year transition without a new allocation', async () => {
  const before = await admin(
    'select count(*) n from private.commercial_invoice_drafts',
  );
  const withheld: TestDatabase = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) {
      const response = await db.query<T>(sql, params);
      if (sql.includes('private.commercial_invoice_issue('))
        throw Error('FICTIONAL COMMITTED ACK WITHHELD');
      return response;
    },
    exec: db.exec.bind(db),
    async close() {
      throw Error('Fixture adapter does not own the database');
    },
  };
  const lost = issue(withheld);
  await expect(lost).rejects.toThrow('ACK WITHHELD');
  await at('2027-01-01T00:00:00Z');
  const r = await read();
  expect(r.number).toBe('INV-2026-000001');
  expect((r.receipt as { commandId: string }).commandId).toBe(command);
  expect(
    (await admin('select count(*) n from private.commercial_invoice_drafts'))
      .rows,
  ).toEqual(before.rows);
  expect(await read()).toEqual(r);
});
it('original-command duplicate returns the retained earlier-year receipt, never the current-year number', async () => {
  const first = await issue();
  await at('2027-01-01T00:00:00Z');
  expect(await issue()).toEqual(first);
  await expect(issue(db, { command: randomUUID() })).rejects.toThrow(
    'Original issuance identity',
  );
});
it.each(['uuid', 'eight-digit'])(
  'preserves %s history byte-for-byte without resequencing',
  async (kind) => {
    const number =
      kind === 'uuid'
        ? 'INV-' + draft.invoiceId.replaceAll('-', '')
        : 'FICTA-00000042';
    await admin(
      "update private.commercial_invoice_drafts set issued_revision=current_revision,number_namespace=$1,number_ordinal=$2,invoice_number=$3,issue_command_id=$4,issued_actor_id=$5,issued_at=clock_timestamp(),issue_request_hash=repeat('a',64)",
      [
        kind === 'uuid' ? null : 'FICTA',
        kind === 'uuid' ? null : 42,
        number,
        command,
        companies[0].actor,
      ],
    );
    const snapshot = await admin(
      'select to_jsonb(h) v from private.commercial_invoice_drafts h where id=$1',
      [draft.invoiceId],
    );
    expect((await read()).number).toBe(number);
    expect((await issue(db, identity(await another()))).number).toBe(
      'INV-2026-000001',
    );
    expect(
      (
        await admin(
          'select to_jsonb(h) v from private.commercial_invoice_drafts h where id=$1',
          [draft.invoiceId],
        )
      ).rows,
    ).toEqual(snapshot.rows);
  },
);
it('uses the production server clock rather than a caller-provided year or fixture setting', async () => {
  await db.exec('reset role');
  await db.exec(fixtureRoles(realIssuer));
  await at('2099-01-01T00:00:00Z');
  await login();
  const year = new Date().getUTCFullYear();
  const r = await issue();
  expect(r.number).toBe(`INV-${year}-000001`);
  expect(new Date(String(r.issuedAt)).getUTCFullYear()).toBe(year);
});
it('rejects new allocation under snapshot isolation and wrong original source', async () => {
  await db.exec('begin isolation level repeatable read');
  await expect(issue()).rejects.toThrow('READ COMMITTED');
  await db.exec('rollback');
  await expect(issue(db, { hash: 'f'.repeat(64) })).rejects.toThrow(
    'separately reviewed',
  );
});
it('does not issue under AAL1 or revoked current membership', async () => {
  await login(companies[0], db, 'aal1');
  await expect(issue()).rejects.toThrow();
  await login();
  await admin(
    'update public.memberships set active=false where organization_id=$1',
    [draft.organizationId],
  );
  await expect(issue()).rejects.toThrow();
});
it.skipIf(!db.fork)(
  'serializes simultaneous same-year allocations with an observed tenant lock wait',
  async () => {
    const second = identity(await another());
    const peer = await db.fork!();
    try {
      await login(companies[0], peer);

      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await db.exec('begin');
      expect((await issue()).number).toBe('INV-2026-000001');
      const pending = issue(peer, second);
      await waitForAdvisory(db, pid);
      await db.exec('commit');
      expect((await pending).number).toBe('INV-2026-000002');
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'captures the new year after a real allocation wait, not before it',
  async () => {
    const second = identity(await another());
    const peer = await db.fork!();
    try {
      await login(companies[0], peer);

      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await db.exec('begin');
      expect((await issue()).number).toBe('INV-2026-000001');
      const pending = issue(peer, second);
      await waitForAdvisory(db, pid);
      await at('2027-01-01T00:00:00Z');
      await db.exec('commit');
      expect((await pending).number).toBe('INV-2027-000001');
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
