import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import type { CommercialDraft } from '../../server/invoices/commercial-draft-client';
import { presentIssuedInvoice } from '../../proposals/commercial-invoice-issuance/presentation';

const db = createTestDatabase();
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
  await connection.exec('set role propel_commercial_issue_runtime');
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
async function save(connection = db) {
  await connection.exec('set role propel_commercial_draft_runtime');
  return connection.query(
    'select private.commercial_invoice_draft_save($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      draft.organizationId,
      draft.invoiceId,
      randomUUID(),
      draft.revision,
      draft.customerId,
      draft.locationId,
      draft.sourceVersionId,
      'Changed title',
      'PRIVATE changed memo',
    ],
  );
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
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  const original = readFileSync(
    'server/invoices/commercial-drafts.proposed.sql',
    'utf8',
  );
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
  await db.exec(guarded);
  await db.exec(
    readFileSync(
      'proposals/commercial-invoice-issuance/issuance.proposed.sql',
      'utf8',
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
  await db.exec('set role propel_commercial_draft_runtime');
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
afterAll(async () => {
  await db.exec('rollback; reset role');
  await db.close();
});

it('does not expose a draft as issued or paid', async () => {
  expect(draft.state).toBe('draft');
  await expect(read()).rejects.toThrow('Exact original issuance receipt');
});
it('requires separate exact issuance authority rather than draft permission', async () => {
  await admin('delete from private.commercial_issue_authorities');
  await expect(issue()).rejects.toThrow('separately reviewed');
});
it.each([
  'anon',
  'authenticated',
  'service_role',
  'propel_commercial_draft_runtime',
])('denies issuance to %s', async (role) => {
  await db.exec('reset role; set role ' + role);
  await expect(issue()).rejects.toThrow(/permission denied/);
});
it.each(['org', 'customer', 'location', 'invoice', 'version'])(
  'denies substituted %s identity',
  async (key) => {
    const foreign = companies[1];
    const p = {
      org: foreign.org,
      customer: foreign.customer,
      location: foreign.location,
      invoice: randomUUID(),
      version: foreign.version,
    };
    await expect(
      issue(db, { [key]: p[key as keyof typeof p] }),
    ).rejects.toThrow();
  },
);
it.each(['revision', 'hash'])('denies stale %s', async (key) => {
  await expect(
    issue(db, key === 'revision' ? { revision: 2 } : { hash: 'a'.repeat(64) }),
  ).rejects.toThrow();
});
it('denies AAL1, revoked membership, expired session and revoked issue authority', async () => {
  await login(companies[0], db, 'aal1');
  await expect(issue()).rejects.toThrow();
  await login();
  await admin(
    'update public.memberships set active=false where organization_id=$1',
    [draft.organizationId],
  );
  await expect(issue()).rejects.toThrow();
  await admin(
    'update public.memberships set active=true where organization_id=$1',
    [draft.organizationId],
  );
  await admin(
    "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
    [companies[0].session],
  );
  await expect(issue()).rejects.toThrow();
  await admin(
    "update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",
    [companies[0].session],
  );
  await admin(
    'update private.commercial_issue_authorities set revoked_at=clock_timestamp()',
  );
  await expect(issue()).rejects.toThrow();
});
it('rejects a changed estimate parent rather than issuing retained stale scope', async () => {
  await admin("update public.estimates set status='draft' where id=$1", [
    companies[0].estimate,
  ]);
  await expect(issue()).rejects.toThrow('Current exact draft');
});
it('issues once, reopens the exact immutable receipt and never claims payment or delivery', async () => {
  const result = await issue();
  expect(presentIssuedInvoice(result, draft)).toMatchObject({
    state: 'issued',
    paymentState: 'unverified',
    paymentLink: null,
  });
  expect(result).toMatchObject({
    state: 'issued',
    paymentState: 'unverified',
    revision: 1,
    number: 'INV-' + draft.invoiceId.replaceAll('-', ''),
    amountMinor: 1100,
  });
  expect(await read()).toEqual(result);
  expect(await issue()).toEqual(result);
  await expect(issue(db, { command: randomUUID() })).rejects.toThrow(
    'Original issuance identity',
  );
  const text = JSON.stringify(result);
  expect(text).not.toMatch(
    /PRIVATE|memo|unit_cost|internal_notes|paymentLink|paid|delivered/,
  );
  const counts = await admin(
    'select (select count(*)::int from public.release_invoices) invoices,(select count(*)::int from public.release_payment_events) payments',
  );
  expect(counts.rows[0]).toEqual({ invoices: 0, payments: 0 });
});
it('rejects reuse of the draft command as an issuance command', async () => {
  await expect(issue(db, { command: draft.receipt.commandId })).rejects.toThrow(
    'Draft command cannot',
  );
});
it('keeps issuance evidence and presentation stable across non-UTC session reopening', async () => {
  await db.exec("set timezone='America/Chicago'");
  const original = await issue();
  expect(presentIssuedInvoice(original, draft).issuedAt).toMatch(/Z$/);
  await db.exec("set timezone='UTC'");
  expect(await read()).toEqual(original);
});
it('blocks legacy draft projection, duplicate old writes and edits after issuance', async () => {
  await issue();
  await db.exec('set role propel_commercial_draft_runtime');
  await expect(
    db.query('select private.commercial_invoice_draft_read($1,$2,$3)', [
      draft.organizationId,
      draft.invoiceId,
      draft.receipt.commandId,
    ]),
  ).rejects.toThrow('already issued');
  await expect(
    db.query(
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        draft.organizationId,
        draft.invoiceId,
        draft.receipt.commandId,
        draft.customerId,
        draft.locationId,
        draft.sourceVersionId,
        draft.title,
        draft.memo,
      ],
    ),
  ).rejects.toThrow('already issued');
  await expect(save()).rejects.toThrow('Issued invoice is immutable');
  const counts = await admin(
    'select count(*)::int n from private.commercial_invoice_draft_revisions',
  );
  expect(counts.rows[0].n).toBe(1);
});
it('saves and reopens a revised draft, then issues only that exact approved revision', async () => {
  await save();
  const reopened = (
    await db.query<{ result: CommercialDraft }>(
      'select private.commercial_invoice_draft_read($1,$2,null) result',
      [draft.organizationId, draft.invoiceId],
    )
  ).rows[0].result;
  expect(reopened).toMatchObject({
    state: 'draft',
    revision: 2,
    title: 'Changed title',
  });
  draft = reopened;
  await login();
  await expect(issue()).rejects.toThrow('separately reviewed');
  await admin('update private.commercial_issue_authorities set revision=2');
  const issued = await issue();
  expect(issued).toMatchObject({ revision: 2, title: 'Changed title' });
  expect(await read()).toEqual(issued);
  expect(presentIssuedInvoice(issued, draft).revision).toBe(2);
});
it('keeps issued header, receipt and original revisions immutable even for the trusted owner', async () => {
  await issue();
  await db.exec('set role propel_commercial_draft_owner');
  await expect(
    db.query(
      'update private.commercial_invoice_drafts set issued_revision=null,invoice_number=null,issue_command_id=null,issued_actor_id=null,issued_at=null,issue_request_hash=null',
    ),
  ).rejects.toThrow('immutable');
  await expect(
    db.query('delete from private.commercial_invoice_drafts'),
  ).rejects.toThrow('immutable');
  await expect(
    db.query(
      "update private.commercial_invoice_draft_revisions set memo='changed'",
    ),
  ).rejects.toThrow('immutable');
});
it('does not clear an original actor receipt with a different authorized actor', async () => {
  await issue();
  const c = companies[1];
  await admin(
    "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
    [draft.organizationId, c.actor],
  );
  await admin(
    "insert into private.commercial_draft_authorities values($1,$2,clock_timestamp()+interval '1 hour',null,'READER FIXTURE')",
    [draft.organizationId, c.actor],
  );
  await login(c);
  await expect(read()).rejects.toThrow('Exact original issuance receipt');
  expect((await read(db, null)).invoiceId).toBe(draft.invoiceId);
});
it('rollback consumes no issuance identity and leaves draft evidence intact', async () => {
  await db.exec('begin');
  await issue();
  await db.exec('rollback');
  await expect(read()).rejects.toThrow();
  expect((await issue()).state).toBe('issued');
});
const native = Boolean(process.env.EV_TEST_PG_SOCKET);
it.each(['invoice_number', 'issue_request_hash'])(
  'rejects a partially populated issued header with NULL %s',
  async (column) => {
    await db.exec('reset role');
    await expect(
      db.query(
        `update private.commercial_invoice_drafts set issued_revision=1,invoice_number=${column === 'invoice_number' ? 'null' : "'INV-'||replace(id::text,'-','')"},issue_command_id=$1,issued_actor_id=$2,issued_at=clock_timestamp(),issue_request_hash=$3 where organization_id=$4`,
        [
          command,
          companies[0].actor,
          column === 'issue_request_hash' ? null : 'a'.repeat(64),
          draft.organizationId,
        ],
      ),
    ).rejects.toThrow('commercial_issue_complete');
  },
);
it.each(['missing', 'expired', 'revoked'])(
  'requires current separate %s issuance authority even on exact command retry',
  async (kind) => {
    await issue();
    if (kind === 'missing')
      await admin('delete from private.commercial_issue_authorities');
    if (kind === 'expired')
      await admin(
        "update private.commercial_issue_authorities set expires_at=clock_timestamp()-interval '1 second'",
      );
    if (kind === 'revoked')
      await admin(
        'update private.commercial_issue_authorities set revoked_at=clock_timestamp()',
      );
    await expect(issue()).rejects.toThrow('separately reviewed');
    expect((await read()).state).toBe('issued');
  },
);
it('rejects the reverse reuse of an issue command as a draft command', async () => {
  await issue();
  await db.exec('set role propel_commercial_draft_owner');
  await expect(
    db.query(
      'insert into private.commercial_invoice_draft_receipts(organization_id,command_id,invoice_id,revision,actor_id,request_hash) values($1,$2,$3,$4,$5,$6)',
      [
        draft.organizationId,
        command,
        draft.invoiceId,
        draft.revision,
        companies[0].actor,
        'a'.repeat(64),
      ],
    ),
  ).rejects.toThrow('Issue command cannot become draft command');
});
it('retains forced RLS, client/table denial and finite function grants', async () => {
  const result = await admin(
    "select relrowsecurity,relforcerowsecurity from pg_class where oid='private.commercial_issue_authorities'::regclass",
  );
  expect(result.rows[0]).toEqual({
    relrowsecurity: true,
    relforcerowsecurity: true,
  });
  const flags = await admin(
    "select has_table_privilege('propel_commercial_issue_runtime','private.commercial_invoice_drafts','UPDATE') dml,has_table_privilege('propel_commercial_issue_runtime','private.commercial_issue_authorities','INSERT') provision,has_schema_privilege('propel_commercial_draft_owner','private','CREATE') create_schema",
  );
  expect(flags.rows[0]).toEqual({
    dml: false,
    provision: false,
    create_schema: false,
  });
});
it.runIf(native)(
  'survives connection completion and lost acknowledgment through original receipt read only',
  async () => {
    const peer = await db.fork!();
    await login(companies[0], peer);
    await issue(peer);
    await peer.close();
    expect((await read()).receipt).toMatchObject({
      commandId: command,
      actorId: companies[0].actor,
    });
  },
);
it.runIf(native)(
  'concurrent duplicate workers return one issuance and one receipt',
  async () => {
    const peer = await db.fork!();
    try {
      await login(companies[0], peer);
      const [a, b] = await Promise.all([issue(), issue(peer)]);
      expect(a).toEqual(b);
    } finally {
      await peer.close();
    }
  },
);
it.runIf(native)(
  'queued issuance denies a revision committed by a competing draft save',
  async () => {
    const peer = await db.fork!();
    try {
      await login(companies[0], peer);
      await peer.exec('begin');
      await save(peer);
      const pid = Number(
        (await db.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      const pending = issue().then(
        (v) => ({ v }),
        (e) => ({ e }),
      );
      await waitForAdvisory(peer, pid);
      await peer.exec('commit');
      expect(await pending).toHaveProperty('e');
      await expect(read()).rejects.toThrow();
    } finally {
      await peer.exec('rollback');
      await peer.close();
    }
  },
);
it.runIf(native)(
  'expired authority after lock wait leaves no issued header',
  async () => {
    const peer = await db.fork!();
    try {
      await admin(
        "update private.commercial_issue_authorities set expires_at=clock_timestamp()+interval '400 milliseconds'",
      );
      await peer.exec('begin');
      await peer.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        draft.organizationId + '/' + draft.invoiceId,
      ]);
      const pid = Number(
        (await db.query('select pg_backend_pid() pid')).rows[0].pid,
      );
      const pending = issue().then(
        (v) => ({ v }),
        (e) => ({ e }),
      );
      await waitForAdvisory(peer, pid);
      await peer.query('select pg_sleep(0.45)');
      await peer.exec('commit');
      expect(await pending).toHaveProperty('e');
      await expect(read()).rejects.toThrow();
    } finally {
      await peer.exec('rollback');
      await peer.close();
    }
  },
);
