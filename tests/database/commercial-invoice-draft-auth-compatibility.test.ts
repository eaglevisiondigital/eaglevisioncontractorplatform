import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { createTestDatabase } from './engine';

// Synthetic SQL/GUC identities are trusted fixtures, never bearer verification.
// Use QA-only role names in this isolated database to avoid cluster-global role
// collisions with the exact-proposal native test running in another worker.
// No SQL policy/function/table logic is altered by this test-only name mapping.
const db = createTestDatabase();
const org = crypto.randomUUID(),
  customer = crypto.randomUUID(),
  tax = crypto.randomUUID();
const actors = Array.from({ length: 2 }, () => ({
  id: crypto.randomUUID(),
  session: crypto.randomUUID(),
}));
let estimate = '',
  version = '',
  admin = '';
async function reset() {
  await db.exec('reset role');
}
async function login(index = 0) {
  await reset();
  const actor = actors[index];
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: actor.id,
      session_id: actor.session,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await db.exec('set role propel_commercial_draft_compat_runtime');
}
function command() {
  return {
    invoice: crypto.randomUUID(),
    command: crypto.randomUUID(),
    title: 'Exact draft evidence',
    memo: 'No issue, debt or payment authority',
  };
}
async function create(p: ReturnType<typeof command>) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      'select private.commercial_invoice_draft_create($1,$2,$3,$4,null,$5,$6,$7) result',
      [org, p.invoice, p.command, customer, version, p.title, p.memo],
    )
  ).rows[0].result;
}
async function read(p: ReturnType<typeof command>) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      'select private.commercial_invoice_draft_read($1,$2,$3) result',
      [org, p.invoice, p.command],
    )
  ).rows[0].result;
}
beforeAll(async () => {
  admin = String((await db.query('select current_user u')).rows[0].u);
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  // Disposable compatibility fixture of the official Supabase Auth UID helper:
  // https://github.com/supabase/auth/blob/master/migrations/20220224000811_update_auth_functions.up.sql
  // Only this test database helper changes; historical bootstrap/source files do not.
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
      (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid
  $$`);
  for (const path of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + path, 'utf8'));
  await db.exec(
    readFileSync('server/invoices/commercial-drafts.proposed.sql', 'utf8')
      .replaceAll(
        'propel_commercial_draft_owner',
        'propel_commercial_draft_compat_owner',
      )
      .replaceAll(
        'propel_commercial_draft_runtime',
        'propel_commercial_draft_compat_runtime',
      ),
  );
  await db.query(
    "insert into public.organizations(id,name,slug,industry,status) values($1,'FICTIONAL QA ONLY',$2,'construction','active')",
    [org, 'adversarial-' + org],
  );
  await db.query(
    "update public.company_modules set enabled=true where organization_id=$1 and module='estimates'",
    [org],
  );
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'FICTIONAL QA CUSTOMER')",
    [customer, org],
  );
  await db.query(
    "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Fixture tax','TEST ONLY','Fixture','Fixture',1000,'reviewed')",
    [tax, org],
  );
  for (const actor of actors) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [actor.id, actor.id + '@example.test'],
    );
    await db.query(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 hour')",
      [actor.session, actor.id],
    );
    await db.query(
      "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
      [org, actor.id],
    );
    await db.query(
      "insert into private.commercial_draft_authorities values($1,$2,clock_timestamp()+interval '1 hour',null,'SYNTHETIC QA ONLY')",
      [org, actor.id],
    );
  }
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: actors[0].id, aal: 'aal2' }),
  ]);
  await db.exec('set role authenticated');
  const payload = blankEstimate(customer);
  payload.tax_policy_id = tax;
  payload.expires_on = '2099-12-31';
  payload.lines[0] = {
    ...payload.lines[0],
    description: 'Exact original scope',
    quantity_milli: 1000,
    unit_price_minor: 1000,
    unit_cost_minor: 500,
    taxable: true,
  };
  const bundle = (
    await db.query<{ value: EstimateBundle }>(
      'select public.create_estimate($1,$2,$3) value',
      [org, payload, crypto.randomUUID()],
    )
  ).rows[0].value;
  const issued = (
    await db.query<{ value: EstimateBundle }>(
      'select public.issue_estimate($1,$2,$3,$4) value',
      [
        org,
        bundle.estimate.id,
        bundle.version.id,
        bundle.version.lock_revision,
      ],
    )
  ).rows[0].value;
  estimate = issued.estimate.id;
  version = issued.version.id;
  await reset();
});
beforeEach(async () => {
  await reset();
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec(
    'truncate private.commercial_invoice_draft_receipts,private.commercial_invoice_draft_revisions,private.commercial_invoice_drafts cascade',
  );
  await db.query(
    "update public.estimates set status='issued',current_version_id=$1 where organization_id=$2 and id=$3",
    [version, org, estimate],
  );
  await db.query(
    'update private.commercial_draft_authorities set revoked_at=null where organization_id=$1',
    [org],
  );
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
    `reassign owned by propel_commercial_draft_compat_owner to ${admin};drop owned by propel_commercial_draft_compat_owner;drop owned by propel_commercial_draft_compat_runtime;drop role propel_commercial_draft_compat_runtime;drop role propel_commercial_draft_compat_owner`,
  );
  await db.close();
});

it.each(['create', 'read', 'original-ack'] as const)(
  'contradictory legacy UID and aggregate JWT sub denies %s before returning data or receipt',
  async (operation) => {
    const p = command();
    if (operation !== 'create') await create(p);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      actors[0].id,
    ]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: actors[1].id,
        session_id: actors[0].session,
        aal: 'aal2',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ]);
    await expect(operation === 'read' ? read(p) : create(p)).rejects.toThrow(
      /identity/,
    );
    await reset();
    expect(
      (
        await db.query(
          'select count(*)::int n from private.commercial_invoice_draft_receipts',
        )
      ).rows[0].n,
    ).toBe(operation === 'create' ? 0 : 1);
  },
);
it('legacy UID alone cannot substitute for absent aggregate JWT subject', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actors[0].id,
  ]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      session_id: actors[0].session,
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await expect(create(command())).rejects.toThrow(/identity/);
});
it.each(['aggregate-only', 'matching-legacy'] as const)(
  'consistent %s current source identity remains usable',
  async (mode) => {
    if (mode === 'matching-legacy')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        actors[0].id,
      ]);
    const p = command(),
      first = await create(p);
    expect(first.state).toBe('draft');
    expect((await read(p)).receipt).toEqual(first.receipt);
  },
);
it('runtime cannot assume owner or API roles and API roles cannot invoke private draft entry points', async () => {
  const owner = 'propel_commercial_draft_compat_owner',
    runtime = 'propel_commercial_draft_compat_runtime';
  for (const target of [owner, 'authenticated', 'anon', 'service_role'])
    expect(
      (
        await db.query("select pg_has_role($1,$2,'MEMBER') allowed", [
          runtime,
          target,
        ])
      ).rows[0].allowed,
    ).toBe(false);
  for (const role of ['authenticated', 'anon', 'service_role'])
    expect(
      (
        await db.query(
          "select has_function_privilege($1,'private.commercial_invoice_draft_read(uuid,uuid,uuid)','EXECUTE') allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
});
it.skipIf(!db.fork)(
  'source withdrawal committed while parent lock blocks a command prevents its draft and receipt',
  async () => {
    const locker = await db.fork!(),
      p = command();
    try {
      await locker.exec('begin');
      await locker.query(
        "update public.estimates set status='archived' where organization_id=$1 and id=$2",
        [org, estimate],
      );
      let settled = false;
      const pending = create(p).finally(() => {
        settled = true;
      });
      const denied = expect(pending).rejects.toThrow(/parent/);
      await new Promise((r) => setTimeout(r, 40));
      expect(settled).toBe(false);
      await locker.exec('commit');
      await denied;
      await reset();
      expect(
        (
          await db.query(
            'select count(*)::int n from private.commercial_invoice_draft_receipts',
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await locker.exec('rollback');
      await locker.close();
    }
  },
);
it('new owner remains NOLOGIN without schema CREATE or auth email access; runtime has no raw source grants', async () => {
  await reset();
  const owner = 'propel_commercial_draft_compat_owner',
    runtime = 'propel_commercial_draft_compat_runtime';
  expect(
    (
      await db.query(
        'select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls from pg_roles where rolname=$1',
        [owner],
      )
    ).rows[0],
  ).toEqual({
    rolcanlogin: false,
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolbypassrls: false,
  });
  expect(
    (
      await db.query(
        "select has_schema_privilege($1,'private','CREATE') allowed",
        [owner],
      )
    ).rows[0].allowed,
  ).toBe(false);
  expect(
    (
      await db.query(
        "select has_column_privilege($1,'auth.users','email','SELECT') allowed",
        [owner],
      )
    ).rows[0].allowed,
  ).toBe(false);
  for (const table of [
    'auth.users',
    'auth.sessions',
    'public.estimates',
    'public.estimate_versions',
    'private.commercial_invoice_drafts',
  ])
    for (const operation of ['SELECT', 'UPDATE', 'INSERT', 'DELETE'])
      expect(
        (
          await db.query('select has_table_privilege($1,$2,$3) allowed', [
            runtime,
            table,
            operation,
          ])
        ).rows[0].allowed,
      ).toBe(false);
});
