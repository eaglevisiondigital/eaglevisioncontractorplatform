import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import type { CommercialDraft } from '../../server/invoices/commercial-draft-client';
import {
  loadNumberDecoder,
  type NumberPresenter,
  type NumberExpected,
} from '../fixtures/number-decoder-proposal';
import { captureIssuanceAuthorFixture } from '../../proposals/commercial-invoice-issuance/author-fixture';

const db = createTestDatabase();
let present: NumberPresenter;
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
      'propel_number_decoder_fixture_owner',
    )
    .replaceAll(
      'propel_commercial_draft_runtime',
      'propel_number_decoder_fixture_runtime',
    )
    .replaceAll(
      'propel_commercial_issue_runtime',
      'propel_number_decoder_fixture_issuer',
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
  await connection.exec('set role propel_number_decoder_fixture_issuer');
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
beforeAll(async () => {
  present = (await loadNumberDecoder()).present;
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
  await db.exec('set role propel_number_decoder_fixture_runtime');
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
    "select rolname from pg_roles where rolname in ('propel_number_decoder_fixture_owner','propel_number_decoder_fixture_runtime','propel_number_decoder_fixture_issuer')",
  );
  for (const { rolname } of roles.rows) {
    // Finite fixture-owned names only; do not adopt/drop the original suite roles.
    if (
      ![
        'propel_number_decoder_fixture_owner',
        'propel_number_decoder_fixture_runtime',
        'propel_number_decoder_fixture_issuer',
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
  await db.exec('set role propel_number_decoder_fixture_runtime');
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

function expected(d: CommercialDraft = draft): NumberExpected {
  return {
    organizationId: d.organizationId,
    invoiceId: d.invoiceId,
    customerId: d.customerId,
    locationId: d.locationId,
    sourceVersionId: d.sourceVersionId,
    revision: d.revision,
    sourceHash: d.sourceHash,
  };
}
function originalAnchor(
  packet: Record<string, unknown>,
  d: CommercialDraft = draft,
): NumberExpected {
  return {
    ...expected(d),
    issuedNumber: packet.number as string,
    issuanceReceiptId: (packet.receipt as { commandId: string }).commandId,
  };
}
it('projects an actual canonical yearly issued packet only against the retained trusted original receipt anchor', async () => {
  const first = await issue();
  const packet = await read();
  const v = present(packet, originalAnchor(first));
  expect(v.number).toBe('INV-2026-000001');
  expect(v.issuanceReceiptId).toBe(command);
  expect(v.paymentState).toBe('unverified');
  expect(v.paymentLink).toBeNull();
  expect(JSON.stringify(v)).not.toMatch(
    /PRIVATE|sourceHash|requestHash|actorId/,
  );
  expect(() => present(packet, expected())).toThrow();
});
it('presents retained UUID history through the actual private reader without renumbering or changing original receipt/header bytes', async () => {
  const number = 'INV-' + draft.invoiceId.replaceAll('-', '');
  // Explicit pre-upgrade retained historical fixture, never a new issuance path.
  await admin(
    "update private.commercial_invoice_drafts set issued_revision=current_revision,invoice_number=$1,issue_command_id=$2,issued_actor_id=$3,issued_at=clock_timestamp(),issue_request_hash=repeat('a',64) where organization_id=$4 and id=$5",
    [
      number,
      command,
      companies[0].actor,
      draft.organizationId,
      draft.invoiceId,
    ],
  );
  const before = (
    await admin(
      'select to_jsonb(h) v from private.commercial_invoice_drafts h where id=$1',
      [draft.invoiceId],
    )
  ).rows;
  const packet = await read();
  expect(present(packet, expected()).number).toBe(number);
  expect(present(packet, originalAnchor(packet)).issuanceReceiptId).toBe(
    command,
  );
  expect(
    (
      await admin(
        'select to_jsonb(h) v from private.commercial_invoice_drafts h where id=$1',
        [draft.invoiceId],
      )
    ).rows,
  ).toEqual(before);
});
it('current trusted tenant identity remains independent when two canonical issued invoices share the public display', async () => {
  const a = await issue();
  const other = await another(companies[1], 'FICTB');
  await login(companies[1]);
  const b = await issue(db, identity(other));
  expect(a.number).toBe(b.number);
  expect(present(a, originalAnchor(a)).organizationId).not.toBe(
    present(b, originalAnchor(b, other)).organizationId,
  );
  expect(() => present(a, originalAnchor(b, other))).toThrow();
  expect(() => present(b, originalAnchor(a))).toThrow();
});
it('retains the earlier year number and exact original receipt after committed SQL ACK loss, then read-only reopening across year transition', async () => {
  let mutations = 0;
  const lost: TestDatabase = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) {
      const response = await db.query<T>(sql, params);
      if (sql.includes('private.commercial_invoice_issue(')) {
        mutations++;
        throw Error('FICTIONAL COMMITTED ACK WITHHELD');
      }
      return response;
    },
    exec: db.exec.bind(db),
    async close() {
      throw Error('Fixture does not own database');
    },
  };
  await expect(issue(lost)).rejects.toThrow('ACK WITHHELD');
  await at('2027-01-01T00:00:00Z');
  const original = await read();
  const anchor = originalAnchor(original);
  const reopened = await read();
  expect(present(reopened, anchor).number).toBe('INV-2026-000001');
  expect(present(reopened, anchor).issuanceReceiptId).toBe(command);
  expect(mutations).toBe(1);
  expect(() =>
    present({ ...reopened, number: 'INV-2027-000001' }, anchor),
  ).toThrow();
});
it('stale revision/customer/source and replaced original command stay denied even with the correct public display', async () => {
  const packet = await issue();
  const anchor = originalAnchor(packet);
  for (const wrong of [
    { ...anchor, revision: anchor.revision + 1 },
    { ...anchor, customerId: randomUUID() },
    { ...anchor, sourceHash: 'e'.repeat(64) },
    { ...anchor, issuanceReceiptId: randomUUID() },
  ])
    expect(() => present(packet, wrong)).toThrow();
  await expect(read(db, randomUUID())).rejects.toThrow();
});
it('current authorization revocation blocks a fresh original read before any safe presentation', async () => {
  await issue();
  await admin(
    'update public.memberships set active=false where organization_id=$1 and user_id=$2',
    [companies[0].org, companies[0].actor],
  );
  await expect(read()).rejects.toThrow();
});
it('an uncommitted candidate creates no issued receipt/view; only that never-committed number may later be reused', async () => {
  await login();
  await db.exec('begin');
  const uncommitted = await issue();
  expect(uncommitted.number).toBe('INV-2026-000001');
  await db.exec('rollback');
  await expect(read()).rejects.toThrow();
  const committed = await issue();
  expect(present(committed, originalAnchor(committed)).number).toBe(
    uncommitted.number,
  );
});
it('allocation year transitions and committed immutability survive the new pure customer-safe decoder', async () => {
  const first = await issue();
  const firstView = present(first, originalAnchor(first));
  await at('2027-01-01T00:00:00Z');
  const other = await another();
  const second = await issue(db, identity(other));
  expect(present(second, originalAnchor(second, other)).number).toBe(
    'INV-2027-000001',
  );
  expect(present(await read(), originalAnchor(first))).toEqual(firstView);
  await expect(
    admin(
      'update private.commercial_invoice_drafts set invoice_number=$1 where id=$2',
      ['INV-2027-000002', draft.invoiceId],
    ),
  ).rejects.toThrow();
});
