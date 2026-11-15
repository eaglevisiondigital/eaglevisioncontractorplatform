import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import type { CommercialDraft } from '../../server/invoices/commercial-draft-client';
import { captureIssuanceAuthorFixture } from '../../proposals/commercial-invoice-issuance/author-fixture';

const db = createTestDatabase();
let fixtureAdmin = 'postgres';
function fixtureRoles(sql: string) {
  return sql
    .replaceAll('propel_commercial_draft_owner', 'propel_numbering_test_owner')
    .replaceAll(
      'propel_commercial_draft_runtime',
      'propel_numbering_test_runtime',
    )
    .replaceAll(
      'propel_commercial_issue_runtime',
      'propel_numbering_test_issuer',
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
  await connection.exec('set role propel_numbering_test_issuer');
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
  await db.exec(
    fixtureRoles(
      readFileSync(
        'proposals/commercial-invoice-numbering/numbering.proposed.sql',
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
});
beforeEach(async () => {
  await db.exec('rollback; reset role');
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
  await db.exec('set role propel_numbering_test_runtime');
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
    "select rolname from pg_roles where rolname in ('propel_numbering_test_owner','propel_numbering_test_runtime','propel_numbering_test_issuer')",
  );
  for (const { rolname } of roles.rows) {
    // Finite fixture-owned names only; do not adopt/drop the original suite roles.
    if (
      ![
        'propel_numbering_test_owner',
        'propel_numbering_test_runtime',
        'propel_numbering_test_issuer',
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
  await db.exec('set role propel_numbering_test_runtime');
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
it('allocates an explicit fictional namespace and reopens the exact original number', async () => {
  const first = await issue();
  expect(first.number).toBe('FICTA-00000001');
  expect(first.paymentState).toBe('unverified');
  expect(await issue()).toEqual(first);
  expect(await read()).toEqual(first);
});
it('allocates the next number from immutable committed headers', async () => {
  await issue();
  const second = await another();
  expect((await issue(db, identity(second))).number).toBe('FICTA-00000002');
});
it('isolates independent contractor namespaces and counters', async () => {
  await issue();
  const other = await another(companies[1], 'FICTB');
  await login(companies[1]);
  expect((await issue(db, identity(other))).number).toBe('FICTB-00000001');
});
it('rejects the same namespace for a different contractor', async () => {
  await expect(another(companies[1], 'FICTA')).rejects.toThrow(
    'namespace already bound',
  );
});
it('rejects a second namespace within one contractor', async () => {
  await expect(another(companies[0], 'OTHER')).rejects.toThrow(
    'namespace already bound',
  );
});
it.each(['x', 'aBc', 'A-B', 'A B', 'A'.repeat(13)])(
  'rejects malformed namespace %s',
  async (ns) => {
    await expect(another(companies[1], ns)).rejects.toThrow();
  },
);
it('holds new issuance without an accepted namespace, preserving the draft', async () => {
  await admin('truncate private.commercial_issue_authorities');
  await admin(
    "insert into private.commercial_issue_authorities(organization_id,invoice_id,actor_id,revision,source_hash,expires_at,review_reference) values($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour','LEGACY')",
    [
      draft.organizationId,
      draft.invoiceId,
      companies[0].actor,
      draft.revision,
      draft.sourceHash,
    ],
  );
  await expect(issue()).rejects.toThrow('reviewed number namespace');
});
it('forbids mutation/deletion of retained namespace policy but permits revocation', async () => {
  await expect(
    admin(
      "update private.commercial_issue_authorities set number_namespace='OTHER'",
    ),
  ).rejects.toThrow('immutable');
  await expect(
    admin('delete from private.commercial_issue_authorities'),
  ).rejects.toThrow('Retain');
  await admin(
    'update private.commercial_issue_authorities set revoked_at=clock_timestamp()',
  );
  await expect(issue()).rejects.toThrow('separately reviewed');
});
it('does not reuse a committed number after attempted owner edit or deletion', async () => {
  await issue();
  await expect(
    admin('delete from private.commercial_invoice_drafts'),
  ).rejects.toThrow('immutable');
  await expect(
    admin(
      "update private.commercial_invoice_drafts set invoice_number='FICTA-00000002'",
    ),
  ).rejects.toThrow('immutable');
  expect((await issue(db, identity(await another()))).number).toBe(
    'FICTA-00000002',
  );
});
it('classifies rollback as uncommitted candidate reuse, never a durable burned allocation', async () => {
  await db.exec('begin');
  expect((await issue()).number).toBe('FICTA-00000001');
  await db.exec('rollback');
  expect((await issue()).number).toBe('FICTA-00000001');
});
it('fails closed under snapshot isolation rather than allocating from stale max', async () => {
  await db.exec('begin isolation level repeatable read');
  await expect(issue()).rejects.toThrow('READ COMMITTED');
  await db.exec('rollback');
  expect((await issue()).number).toBe('FICTA-00000001');
});
it('preserves a legacy UUID-issued header and original read receipt', async () => {
  const legacyNumber = 'INV-' + draft.invoiceId.replaceAll('-', '');
  await admin(
    "update private.commercial_invoice_drafts set issued_revision=current_revision,invoice_number=$1,issue_command_id=$2,issued_actor_id=$3,issued_at=clock_timestamp(),issue_request_hash=repeat('a',64) where id=$4",
    [legacyNumber, command, companies[0].actor, draft.invoiceId],
  );
  expect((await read()).number).toBe(legacyNumber);
  expect((await issue(db, identity(await another()))).number).toBe(
    'FICTA-00000001',
  );
  expect((await read()).number).toBe(legacyNumber);
});
it.each([
  'anon',
  'authenticated',
  'service_role',
  'propel_numbering_test_runtime',
])('does not grant allocation or policy DML to %s', async (role) => {
  await db.exec('reset role;set role ' + role);
  await expect(issue()).rejects.toThrow();
  await expect(
    db.exec(
      "update private.commercial_issue_authorities set number_namespace='BAD'",
    ),
  ).rejects.toThrow();
});
it('retains AAL2, current membership and exact source checks', async () => {
  await login(companies[0], db, 'aal1');
  await expect(issue()).rejects.toThrow();
  await login();
  await expect(issue(db, { hash: 'f'.repeat(64) })).rejects.toThrow(
    'separately reviewed',
  );
  await admin(
    'update public.memberships set active=false where organization_id=$1',
    [draft.organizationId],
  );
  await expect(issue()).rejects.toThrow();
});
it.skipIf(!db.fork)(
  'serializes simultaneous issue commands and observes the numbering wait',
  async () => {
    const second = identity(await another());
    const peer = await db.fork!();
    try {
      await login(companies[0], peer);
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await db.exec('begin');
      expect((await issue()).number).toBe('FICTA-00000001');
      const pending = issue(peer, second);
      await waitForAdvisory(db, pid);
      await db.exec('commit');
      expect((await pending).number).toBe('FICTA-00000002');
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'rechecks authority expiry after an observed number-allocation wait',
  async () => {
    const peer = await db.fork!();
    try {
      await admin(
        "update private.commercial_issue_authorities set expires_at=clock_timestamp()+interval '400 milliseconds'",
      );
      await login(companies[0], peer);
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await db.exec('begin');
      await db.query(
        "select pg_advisory_xact_lock(hashtextextended('commercial-numbering/'||$1::text,0))",
        [draft.organizationId],
      );
      const pending = issue(peer).then(
        (v) => ({ value: v }),
        (e) => ({ error: String(e) }),
      );
      await waitForAdvisory(db, pid);
      await db.exec('select pg_sleep(0.45);commit');
      expect((await pending) as { error: string }).toHaveProperty(
        'error',
        expect.stringContaining('separately reviewed'),
      );
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it('holds at the explicit maximum rather than wrapping or renumbering history', async () => {
  await admin(
    "update private.commercial_invoice_drafts set issued_revision=current_revision,number_namespace='FICTA',number_ordinal=99999999,invoice_number='FICTA-99999999',issue_command_id=$1,issued_actor_id=$2,issued_at=clock_timestamp(),issue_request_hash=repeat('a',64)",
    [command, companies[0].actor],
  );
  await expect(issue(db, identity(await another()))).rejects.toThrow(
    'exhausted',
  );
  expect((await read()).number).toBe('FICTA-99999999');
});
it('retains exact-command non-rebinding after a number was issued', async () => {
  await issue();
  await expect(issue(db, { command: randomUUID() })).rejects.toThrow(
    'Original issuance identity',
  );
  expect((await read()).number).toBe('FICTA-00000001');
});
it.skipIf(!db.fork)(
  'rechecks original membership after the numbering lock wait',
  async () => {
    const peer = await db.fork!();
    try {
      await login(companies[0], peer);
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await db.exec('begin');
      await db.query(
        "select pg_advisory_xact_lock(hashtextextended('commercial-numbering/'||$1::text,0))",
        [draft.organizationId],
      );
      const pending = issue(peer).then(
        (v) => ({ value: v }),
        (e) => ({ error: String(e) }),
      );
      await waitForAdvisory(db, pid);
      await db.query(
        'update public.memberships set active=false where organization_id=$1',
        [draft.organizationId],
      );
      await db.exec('commit');
      expect(await pending).toHaveProperty('error');
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'serializes concurrent namespace claims across contractors before either commits',
  async () => {
    const other = await another(companies[1], 'FICTB');
    await db.exec('reset role;truncate private.commercial_issue_authorities');
    const peer = await db.fork!();
    const insert =
      "insert into private.commercial_issue_authorities values($1,$2,$3,$4,$5,clock_timestamp()+interval '1 hour',null,'FICTIONAL RACE','RACE')";
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      await db.exec('begin');
      await db.query(insert, [
        draft.organizationId,
        draft.invoiceId,
        companies[0].actor,
        draft.revision,
        draft.sourceHash,
      ]);
      const pending = peer
        .query(insert, [
          other.organizationId,
          other.invoiceId,
          companies[1].actor,
          other.revision,
          other.sourceHash,
        ])
        .then(
          (v) => ({ value: v }),
          (e) => ({ error: String(e) }),
        );
      await waitForAdvisory(db, pid);
      await db.exec('commit');
      expect(await pending).toHaveProperty(
        'error',
        expect.stringContaining('namespace already bound'),
      );
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
