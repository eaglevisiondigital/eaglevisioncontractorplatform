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
  await db.exec('set role propel_commercial_draft_qa_runtime');
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
  for (const path of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + path, 'utf8'));
  await db.exec(
    readFileSync('server/invoices/commercial-drafts.proposed.sql', 'utf8')
      .replaceAll(
        'propel_commercial_draft_owner',
        'propel_commercial_draft_qa_owner',
      )
      .replaceAll(
        'propel_commercial_draft_runtime',
        'propel_commercial_draft_qa_runtime',
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
    `reassign owned by propel_commercial_draft_qa_owner to ${admin};drop owned by propel_commercial_draft_qa_owner;drop owned by propel_commercial_draft_qa_runtime;drop role propel_commercial_draft_qa_runtime;drop role propel_commercial_draft_qa_owner`,
  );
  await db.close();
});
it('another currently authorized owner cannot replay the original actor command', async () => {
  const p = command(),
    first = await create(p);
  await login(1);
  await expect(create(p)).rejects.toThrow(/identity conflict/);
  expect((await read(p)).receipt).toEqual(first.receipt);
  await reset();
  expect(
    (
      await db.query(
        'select count(*)::int n from private.commercial_invoice_draft_receipts where organization_id=$1',
        [org],
      )
    ).rows[0].n,
  ).toBe(1);
});
it('authority withdrawal denies exact old-command ACK and exact read, retaining immutable history', async () => {
  const p = command();
  await create(p);
  await reset();
  await db.query(
    'update private.commercial_draft_authorities set revoked_at=clock_timestamp() where organization_id=$1 and actor_id=$2',
    [org, actors[0].id],
  );
  await login();
  await expect(create(p)).rejects.toThrow(/authority/);
  await expect(read(p)).rejects.toThrow(/authority/);
  await reset();
  expect(
    (
      await db.query(
        'select count(*)::int n from private.commercial_invoice_draft_receipts where organization_id=$1',
        [org],
      )
    ).rows[0].n,
  ).toBe(1);
});
it('a replacement invoice and command cannot create a second draft from the same exact source', async () => {
  const p = command();
  await create(p);
  await expect(create(command())).rejects.toThrow(/unique|duplicate/);
  await reset();
  expect(
    (
      await db.query(
        'select count(*)::int n from private.commercial_invoice_drafts where organization_id=$1',
        [org],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query(
        'select count(*)::int n from private.commercial_invoice_draft_receipts where organization_id=$1',
        [org],
      )
    ).rows[0].n,
  ).toBe(1);
});
it.each(['archived', 'noncurrent'] as const)(
  'sourceCurrent is false for an %s parent without changing immutable issued evidence',
  async (mode) => {
    const p = command(),
      first = await create(p);
    await reset();
    if (mode === 'archived')
      await db.query(
        "update public.estimates set status='archived' where organization_id=$1 and id=$2",
        [org, estimate],
      );
    else
      await db.query(
        'update public.estimates set current_version_id=null where organization_id=$1 and id=$2',
        [org, estimate],
      );
    await login();
    const stale = await read(p);
    expect(stale.sourceCurrent).toBe(false);
    expect(stale.receipt).toEqual(first.receipt);
    expect(stale.sourceHash).toBe(first.sourceHash);
    expect(stale.state).toBe('draft');
  },
);
