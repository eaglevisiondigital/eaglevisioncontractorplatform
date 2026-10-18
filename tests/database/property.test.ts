import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { preparePropertyAcceptance } from '../../server/property/acceptance-plan';
const db = createTestDatabase();
const uid = () => crypto.randomUUID();
const reportUsers = [uid(), uid(), uid()];
const sessions = new Map<string, string>();
const orgs = [uid(), uid(), uid()],
  owners = [uid(), uid(), uid()],
  customers = [uid(), uid(), uid()],
  locations = [uid(), uid(), uid()],
  field = uid(),
  estimator = uid(),
  plans: string[] = [],
  jobs: string[] = [],
  versions: EstimateBundle[] = [],
  expenses: string[] = [],
  visits: string[] = [];
async function actor(
  d: TestDatabase = db,
  user: string = owners[0],
  aal = 'aal2',
) {
  await d.exec('reset role');
  await d.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: user,
      session_id: sessions.get(user),
      aal,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
  await d.exec('set role authenticated');
}
async function rpc<T = string>(name: string, args: unknown[], d = db) {
  return (
    await d.query<{ v: T }>(
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) v`,
      args,
    )
  ).rows[0].v;
}
async function command(
  action: string,
  id: string | null = null,
  lock: number | null = null,
  p: unknown = {},
  org = orgs[0],
  d = db,
) {
  return (
    await d.query<{ v: { id: string } }>(
      'select private.property_command($1,$2,$3,$4,$5) v',
      [org, action, id, lock, p],
    )
  ).rows[0].v.id;
}
async function denied(sql: string, p: unknown[] = []) {
  await db.exec('savepoint negative');
  try {
    await expect(db.query(sql, p)).rejects.toThrow();
  } finally {
    await db.exec('rollback to savepoint negative;release savepoint negative');
  }
}
async function reject(
  action: string,
  id = visits[0],
  lock = 1,
  p: unknown = {},
  org = orgs[0],
) {
  await denied('select private.property_command($1,$2,$3,$4,$5)', [
    org,
    action,
    id,
    lock,
    p,
  ]);
}
const content = () => ({
  summary: 'Synthetic inspection',
  internal_notes: 'SECRET rates and costs',
  checklist: [
    { id: 'check', label: 'Exterior', required: true, completed: true },
  ],
  findings: [
    {
      id: 'public',
      category: 'Damage',
      location: 'Roof',
      severity: 'moderate',
      description: 'Visible damage',
      recommendation: 'Review repair scope',
      customer_visible: true,
    },
    {
      id: 'private',
      category: 'Office',
      location: 'Office',
      severity: 'low',
      description: 'SECRET margin',
      recommendation: 'Private cost review',
      customer_visible: false,
    },
  ],
});
const decision = (disposition = 'proposed') => ({
  expense_id: expenses[0],
  disposition,
  reason: 'Synthetic management scope review',
  scope_line_id: null,
  pricing: { mode: 'percent', value: 1250 },
  presentation: 'package',
  description: 'Reviewed supplemental materials',
});
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  await db.exec(
    "do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;end$$;",
  );
  if (
    !(await db.query("select to_regclass('private.property_features') present"))
      .rows[0].present
  )
    await db.exec(readFileSync('server/property/schema.proposed.sql', 'utf8'));
  else {
    const { createHash } = await import('node:crypto');
    const manifest = JSON.parse(
      readFileSync('docs/PROPERTY_MIGRATION_REVIEW.json', 'utf8'),
    );
    expect(
      createHash('sha256')
        .update(readFileSync('server/property/schema.proposed.sql'))
        .digest('hex'),
    ).toBe(manifest.migrations[0].sha256);
  }
  // Additional customer-review SQL is LOCAL ONLY; never added to hosted migration history.
  await db.exec(readFileSync('server/customer/schema.proposed.sql', 'utf8'));
  await db.exec(readFileSync('server/customer/workflow.proposed.sql', 'utf8'));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select has_function_privilege($1,'public.customer_portal_discover()','execute') ok",
          [role],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select has_table_privilege($1,'private.customer_estimate_access','select') ok",
          [role],
        )
      ).rows[0].ok,
    ).toBe(false);
  }
  // Disposable test-only EXECUTE, absent from the proposed SQL itself.
  await db.exec(
    'grant execute on function public.customer_portal_discover(), private.customer_portal_discover(), public.customer_estimate_review(uuid,uuid,uuid,uuid), private.customer_estimate_review(uuid,uuid,uuid,uuid) to authenticated',
  );
  // These five dormant workflow wrappers are granted ONLY in this disposable fixture.
  for (const signature of [
    'customer_publication_preview(uuid,jsonb)',
    'customer_publish_estimate(uuid,jsonb)',
    'customer_revoke_publication(uuid,uuid)',
    'customer_decision_context(uuid,uuid,uuid,uuid)',
    'customer_record_decision(uuid,uuid,text,text,text,uuid)',
  ]) {
    for (const role of ['anon', 'authenticated', 'service_role'])
      expect(
        (
          await db.query<{ ok: boolean }>(
            "select has_function_privilege($1,$2,'execute') ok",
            [role, 'public.' + signature],
          )
        ).rows[0].ok,
      ).toBe(false);
    await db.exec(
      'grant execute on function public.' +
        signature +
        ',private.' +
        signature +
        ' to authenticated',
    );
  }
  for (const u of [...owners, field, estimator, ...reportUsers]) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [u, `${u}@example.test`],
    );
    const session = uid();
    sessions.set(u, session);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      session,
      u,
    ]);
  }
  for (let i = 0; i < 3; i++) {
    await db.query(
      "insert into organizations(id,name,slug,industry,status) values($1,$2,$3,'construction','active')",
      [orgs[i], `Synthetic company ${i}`, `property-${i}`],
    );
    await db.query(
      "insert into memberships(organization_id,user_id,role) values($1,$2,'owner')",
      [orgs[i], owners[i]],
    );
    await db.query(
      "insert into customers(id,organization_id,display_name) values($1,$2,'Synthetic customer')",
      [customers[i], orgs[i]],
    );
    await db.query(
      "insert into service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Synthetic location','Example','FL','00000','US')",
      [locations[i], orgs[i], customers[i]],
    );
    await db.query('insert into private.property_features values($1,true)', [
      orgs[i],
    ]);
    const tax = uid();
    await db.query(
      "insert into estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Test','Synthetic review','Synthetic jurisdiction','Synthetic contract',0,'reviewed')",
      [tax, orgs[i]],
    );
    await actor(db, owners[i]);
    const p = blankEstimate(customers[i]);
    p.tax_policy_id = tax;
    p.expires_on = '2030-01-01';
    p.lines[0] = {
      ...p.lines[0],
      description: 'Panels',
      unit: 'each',
      kind: 'material',
      quantity_milli: 2000,
      unit_cost_minor: 100,
      unit_price_minor: 200,
    };
    let b = await rpc<EstimateBundle>('create_estimate', [orgs[i], p, uid()]);
    b = await rpc<EstimateBundle>('issue_estimate', [
      orgs[i],
      b.estimate.id,
      b.version.id,
      b.version.lock_revision,
    ]);
    versions.push(b);
    const job = await rpc('approve_job', [orgs[i], b.version.id]);
    jobs.push(job);
    plans.push(
      await command(
        'create_plan',
        null,
        null,
        {
          customer_id: customers[i],
          location_id: locations[i],
          job_id: job,
          name: 'Monthly survey',
          cadence: 'monthly',
          interval_days: 14,
          timezone: 'America/Chicago',
          starts_on: '2026-10-16',
          checklist: content().checklist,
        },
        orgs[i],
      ),
    );
    visits.push(
      await command(
        'create_visit',
        plans[i],
        null,
        { visited_on: '2026-10-16', phase: 'before' },
        orgs[i],
      ),
    );
    const exp = await rpc('submit_job_expense', [
      orgs[i],
      job,
      {
        purchase_key: 'PO-1',
        supplier: 'Synthetic supplier',
        reference: 'INV-1',
        category: 'materials',
        kind: 'payment',
        amount_minor: 10001,
        description: 'Additional panels',
        estimate_line_id: null,
        quantity_milli: 2000,
        unit: 'each',
        unit_cost_minor: 5000,
        document_ids: [],
        material_approval_id: null,
        adjusts_expense_id: null,
      },
    ]);
    expenses.push(exp);
    await rpc('review_job_expense', [
      orgs[i],
      job,
      exp,
      'approved',
      'Synthetic review',
    ]);
    await db.exec('reset role');
  }
  await db.query(
    "insert into memberships(organization_id,user_id,role,staff_type) values($1,$2,'staff','field_staff'),($1,$3,'staff','estimator')",
    [orgs[0], field, estimator],
  );
});
beforeEach(async () => {
  await db.exec('begin');
  await actor();
});
afterEach(async () => {
  await db.exec('rollback;reset role');
});
afterAll(() => db.close());
it('all eight private tables deny direct access to every client role and enable RLS', async () => {
  const tables = [
    'property_features',
    'inspection_plans',
    'inspection_visits',
    'inspection_reports',
    'property_media',
    'supplier_comparisons',
    'unbilled_decisions',
    'supplemental_invoice_drafts',
  ];
  for (const t of tables) {
    await denied(`select * from private.${t}`);
    await db.exec('reset role');
    const row = (
      await db.query(
        'select relrowsecurity from pg_class where oid=$1::regclass',
        ['private.' + t],
      )
    ).rows[0];
    expect(row.relrowsecurity).toBe(true);
    await actor();
  }
  await db.exec('reset role;set role service_role');
  await denied('select * from private.inspection_visits');
});
it.each([1, 2])(
  'company %s cannot read, edit or reference company zero records',
  async (i) => {
    await actor(db, owners[i]);
    await reject('save_visit', visits[0], 1, content());
    await reject('save_visit', visits[0], 1, content(), orgs[i]);
    await reject(
      'create_plan',
      plans[i],
      1,
      {
        customer_id: customers[0],
        location_id: locations[0],
        job_id: jobs[i],
        name: 'Attack',
        cadence: 'once',
        interval_days: 1,
        timezone: 'UTC',
        starts_on: '2026-10-16',
        checklist: [],
      },
      orgs[i],
    );
    await reject('unbilled_review', jobs[0], 2, decision());
  },
);
it('owner requires AAL2; revoked and unassigned field access fail', async () => {
  await actor(db, owners[0], 'aal1');
  await reject('save_visit', visits[0], 1, content());
  await actor(db, field, 'aal1');
  await reject('save_visit', visits[0], 1, content());
  await db.exec('reset role');
  await db.query(
    'update memberships set active=false where organization_id=$1 and user_id=$2',
    [orgs[0], owners[0]],
  );
  await actor();
  await reject('save_visit', visits[0], 1, content());
});
it('field staff may submit an assigned survey, but cannot publish or review finances', async () => {
  await rpc('assign_job', [orgs[0], jobs[0], field, true]);
  await actor(db, field, 'aal1');
  await command('save_visit', visits[0], 1, content());
  await command('submit_visit', visits[0], 2);
  await reject('publish_visit', visits[0], 3);
  await reject('unbilled_review', jobs[0], 2, decision());
});
it('estimators can draft but only management can publish; internal fields never publish', async () => {
  await actor(db, estimator, 'aal1');
  await command('save_visit', visits[0], 1, content());
  await command('submit_visit', visits[0], 2);
  await reject('publish_visit', visits[0], 3);
  await actor();
  const r = await command('publish_visit', visits[0], 3);
  await db.exec('reset role');
  const snapshot = (
    await db.query(
      'select snapshot from private.inspection_reports where id=$1',
      [r],
    )
  ).rows[0].snapshot;
  expect(JSON.stringify(snapshot)).not.toContain('SECRET');
  expect(JSON.stringify(snapshot)).not.toContain('internal_notes');
  await denied('update private.inspection_reports set version=2 where id=$1', [
    r,
  ]);
  await denied('delete from private.inspection_reports where id=$1', [r]);
});
it('required checklist, malformed values, duplicate dates and stale revisions are denied', async () => {
  const c = content();
  c.checklist[0].completed = false;
  await command('save_visit', visits[0], 1, c);
  await command('submit_visit', visits[0], 2);
  await reject('publish_visit', visits[0], 3);
  await reject('create_visit', plans[0], 1, {
    visited_on: '2026-10-16',
    phase: 'during',
  });
  await reject('save_visit', visits[0], 1, content());
  await reject('create_visit', plans[0], 1, {
    visited_on: 'invalid',
    phase: 'during',
  });
});
it('published revisions preserve previous snapshots', async () => {
  await command('save_visit', visits[0], 1, content());
  await command('submit_visit', visits[0], 2);
  await command('publish_visit', visits[0], 3);
  await command('revise_visit', visits[0], 4);
  await command('save_visit', visits[0], 5, {
    ...content(),
    summary: 'Revised condition',
  });
  await command('submit_visit', visits[0], 6);
  await command('publish_visit', visits[0], 7);
  await db.exec('reset role');
  const r = (
    await db.query(
      'select version,snapshot from private.inspection_reports where visit_id=$1 order by version',
      [visits[0]],
    )
  ).rows;
  expect(r).toHaveLength(2);
  expect((r[0].snapshot as { summary: string }).summary).toBe(
    'Synthetic inspection',
  );
});
it('supplemental pricing is exact, append-only and creates no receivable or duplicate cost', async () => {
  const b = (
    await db.query('select lock_revision from jobs where id=$1', [jobs[0]])
  ).rows[0];
  await command(
    'unbilled_review',
    jobs[0],
    b.lock_revision as number,
    decision(),
  );
  await db.exec('reset role');
  const d = (
    await db.query('select * from private.unbilled_decisions where job_id=$1', [
      jobs[0],
    ])
  ).rows[0];
  expect(Number(d.selling_minor)).toBe(11251);
  const change = (
    await db.query('select * from job_change_orders where id=$1', [d.change_id])
  ).rows[0];
  expect(change.status).toBe('proposed');
  expect(Number(change.cost_minor)).toBe(0);
  expect(
    (await db.query('select * from private.supplemental_invoice_drafts')).rows,
  ).toHaveLength(1);
  expect(
    (await db.query('select * from public.release_invoices')).rows,
  ).toHaveLength(0);
  await denied(
    'update private.unbilled_decisions set selling_minor=1 where id=$1',
    [d.id],
  );
  await actor();
  await reject(
    'unbilled_review',
    jobs[0],
    (b.lock_revision as number) + 1,
    decision(),
  );
});
it('disabled feature and customer mapping cannot be bypassed by an organization selector', async () => {
  await denied('select private.property_portal($1,$2)', [
    orgs[0],
    customers[0],
  ]);
  await db.exec('reset role');
  await db.query(
    'update private.property_features set enabled=false where organization_id=$1',
    [orgs[0]],
  );
  await actor();
  await reject('save_visit', visits[0], 1, content());
});
it('all definer functions use a fixed empty search path and have no anonymous execution', async () => {
  await db.exec('reset role');
  const r = (
    await db.query(
      "select proname,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon from pg_proc where pronamespace='private'::regnamespace and proname in ('property_command','property_portal','property_guard')",
    )
  ).rows;
  expect(r).toHaveLength(3);
  for (const x of r) {
    expect(x.anon).toBe(false);
    expect(x.proconfig).toContain('search_path=""');
  }
});
function quotes() {
  const b = versions[0];
  return {
    quotes: [
      {
        id: 'supplier-one',
        name: 'Synthetic supplier',
        store: 'Example branch',
        account_price_note: 'Manual quotation',
        source_reference: 'Synthetic quote file',
        quoted_at: '2020-01-01T00:00:00Z',
        expires_at: '2099-01-01T00:00:00Z',
        currency: 'USD',
        shipping_minor: 0,
        pickup_minor: 0,
        tax_bps: 0,
        lines: [
          {
            line_id: b.version.payload.lines[0].id,
            sku: 'SKU-1',
            specification: 'Panels',
            unit: 'each',
            pack_quantity_milli: 1000,
            pack_price_minor: 100,
            available_packs: 10,
            equivalent_approved: false,
          },
        ],
      },
    ],
  };
}
it('immutable supplier snapshots require current estimating permission and exact issued scope', async () => {
  await command('quote_snapshot', versions[0].version.id, null, quotes());
  await db.exec('reset role');
  const q = (await db.query('select * from private.supplier_comparisons'))
    .rows[0];
  await denied('delete from private.supplier_comparisons where id=$1', [q.id]);
  await actor(db, field, 'aal1');
  await reject('quote_snapshot', versions[0].version.id, 1, quotes());
});
it.each([
  'foreign-line',
  'null-expiry',
  'bad-equivalence',
  'missing-tax',
  'fifth-supplier',
  'currency',
  'duplicate-line',
])('quote snapshot rejects %s without side effects', async (attack) => {
  const p = quotes(),
    q = p.quotes[0];
  if (attack === 'foreign-line')
    q.lines[0].line_id = versions[1].version.payload.lines[0].id;
  if (attack === 'null-expiry') q.expires_at = null!;
  if (attack === 'bad-equivalence') q.lines[0].equivalent_approved = null!;
  if (attack === 'missing-tax') delete (q as Partial<typeof q>).tax_bps;
  if (attack === 'fifth-supplier')
    p.quotes = Array.from({ length: 5 }, (_, i) => ({ ...q, id: 'q' + i }));
  if (attack === 'currency') q.currency = 'EUR';
  if (attack === 'duplicate-line') q.lines.push(q.lines[0]);
  await reject('quote_snapshot', versions[0].version.id, 1, p);
  await db.exec('reset role');
  expect(
    (await db.query('select * from private.supplier_comparisons')).rows,
  ).toHaveLength(0);
});
it('management plan edits preserve customer/property binding and use CAS', async () => {
  const p = {
    name: 'Weekly survey',
    cadence: 'weekly',
    interval_days: 7,
    timezone: 'America/Chicago',
    starts_on: '2026-11-01',
    checklist: content().checklist,
  };
  await command('update_plan', plans[0], 1, p);
  await reject('update_plan', plans[0], 1, p);
  await reject('update_plan', plans[0], 2, { ...p, customer_id: customers[1] });
});
it('assigned staff workspace omits prices and unrelated visits; current assignment revocation is enforced', async () => {
  await actor(db, field, 'aal1');
  expect(
    (
      await db.query<{ v: { plans: unknown[] } }>(
        'select private.property_workspace($1) v',
        [orgs[0]],
      )
    ).rows[0].v.plans,
  ).toHaveLength(0);
  await actor();
  await rpc('assign_job', [orgs[0], jobs[0], field, true]);
  await actor(db, field, 'aal1');
  let v = (
    await db.query<{ v: Record<string, unknown> }>(
      'select private.property_workspace($1) v',
      [orgs[0]],
    )
  ).rows[0].v;
  expect(v.plans).toHaveLength(1);
  expect(v).not.toHaveProperty('material_reviews');
  expect(v).not.toHaveProperty('comparisons');
  await actor();
  await rpc('assign_job', [orgs[0], jobs[0], field, false]);
  await actor(db, field, 'aal1');
  v = (
    await db.query<{ v: Record<string, unknown> }>(
      'select private.property_workspace($1) v',
      [orgs[0]],
    )
  ).rows[0].v;
  expect(v.plans).toHaveLength(0);
  await denied('select private.property_workspace($1)', [orgs[1]]);
});
it('client reports require both active exact customer mapping and expiring internal release grant', async () => {
  await command('save_visit', visits[0], 1, content());
  await command('submit_visit', visits[0], 2);
  await command('publish_visit', visits[0], 3);
  await db.exec('reset role');
  const viewer = uid();
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
    [viewer, `${viewer}@example.test`],
  );
  await db.exec(
    "update private.release_environment set mode='internal-development',approval_reference='DISPOSABLE LOCAL TEST ONLY'",
  );
  await db.query(
    "insert into private.release_test_users values($1,$2,'customer',clock_timestamp()+interval '10 minutes')",
    [orgs[0], viewer],
  );
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    viewer,
  ]);
  await actor(db, viewer, 'aal1');
  const v = (
    await db.query<{
      v: { reports: unknown[]; estimates: unknown[]; invoices: unknown[] };
    }>('select private.property_portal($1,$2) v', [orgs[0], customers[0]])
  ).rows[0].v;
  expect(v.reports).toHaveLength(1);
  expect(v.estimates).toHaveLength(0);
  expect(v.invoices).toHaveLength(0);
  expect(JSON.stringify(v)).not.toContain('SECRET');
  await denied('select private.property_portal($1,$2)', [
    orgs[0],
    customers[1],
  ]);
  await denied('select private.property_portal($1,$2)', [
    orgs[1],
    customers[1],
  ]);
  await db.exec('reset role');
  await db.query(
    'update portal_identities set active=false where organization_id=$1',
    [orgs[0]],
  );
  await actor(db, viewer, 'aal1');
  await denied('select private.property_portal($1,$2)', [
    orgs[0],
    customers[0],
  ]);
});
it('audit trail is append-only and contains identities, not report or pricing payloads', async () => {
  await command('save_visit', visits[0], 1, content());
  await db.exec('reset role');
  const events = (
    await db.query(
      "select * from activity_events where organization_id=$1 and entity_type='inspection_visits'",
      [orgs[0]],
    )
  ).rows;
  expect(events.length).toBeGreaterThan(0);
  expect(JSON.stringify(events)).not.toContain('SECRET');
  await denied('delete from activity_events where organization_id=$1', [
    orgs[0],
  ]);
});
it('quarantined media cannot become clean or cross-reference another tenant even with maintenance SQL', async () => {
  await db.exec('reset role');
  const sql =
    "insert into private.property_media(organization_id,visit_id,filename,sha256,mime,byte_size,kind,phase,visibility) values($1,$2,'synthetic.png',$3,'image/png',1000,'photo','before','customer')";
  await db.query(sql, [orgs[0], visits[0], 'a'.repeat(64)]);
  await denied(sql, [orgs[1], visits[0], 'b'.repeat(64)]);
  await denied(
    "update private.property_media set status='clean' where organization_id=$1",
    [orgs[0]],
  );
  await denied(sql, [orgs[0], visits[0], 'invalid digest']);
});
it.each([
  'save_visit',
  'submit_visit',
  'update_plan',
  'unbilled_review',
  'publish_visit',
  'revise_visit',
])('review regression: NULL revision cannot authorize %s', async (action) => {
  let id = visits[0],
    p: unknown = content();
  if (action === 'update_plan') {
    id = plans[0];
    p = {
      name: 'Changed plan',
      cadence: 'weekly',
      interval_days: 7,
      timezone: 'UTC',
      starts_on: '2026-11-01',
      checklist: content().checklist,
    };
  }
  if (action === 'unbilled_review') {
    id = jobs[0];
    p = decision();
  }
  if (action === 'submit_visit') p = {};
  if (action === 'publish_visit' || action === 'revise_visit') {
    await command('save_visit', visits[0], 1, content());
    await command('submit_visit', visits[0], 2);
    p = {};
    if (action === 'revise_visit') await command('publish_visit', visits[0], 3);
  }
  await denied('select private.property_command($1,$2,$3,$4,$5)', [
    orgs[0],
    action,
    id,
    null,
    p,
  ]);
});
it('review regression: disabled estimating denies the complete property workspace', async () => {
  const rev = (
    await db.query('select lock_revision from jobs where id=$1', [jobs[0]])
  ).rows[0].lock_revision;
  await command('unbilled_review', jobs[0], Number(rev), decision());
  await db.exec('reset role');
  await db.query(
    "update company_modules set enabled=false where organization_id=$1 and module='estimates'",
    [orgs[0]],
  );
  await actor();
  await denied('select private.property_workspace($1)', [orgs[0]]);
});
it('review regression: report customer and property must match the actual visit even for maintenance', async () => {
  await db.exec('reset role');
  const c = uid(),
    l = uid();
  await db.query(
    "insert into customers(id,organization_id,display_name) values($1,$2,'Other synthetic customer')",
    [c, orgs[0]],
  );
  await db.query(
    "insert into service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Other synthetic property','Example','FL','00000','US')",
    [l, orgs[0], c],
  );
  await denied(
    "insert into private.inspection_reports(organization_id,visit_id,customer_id,location_id,version,snapshot) values($1,$2,$3,$4,1,'{}')",
    [orgs[0], visits[0], c, l],
  );
});
it('review regression: supplemental invoice maintenance cannot diverge from approved review amount', async () => {
  const change = await rpc('propose_job_change', [
    orgs[0],
    jobs[0],
    {
      description: 'Synthetic reviewed supplemental',
      revenue_minor: 11251,
      cost_minor: 0,
      category: 'materials',
      status: 'proposed',
    },
  ]);
  await db.exec('reset role');
  const d = (
    await db.query<{ id: string }>(
      "insert into private.unbilled_decisions(organization_id,job_id,expense_id,revision,disposition,reason,pricing,selling_minor,presentation,description,change_id) values($1,$2,$3,1,'proposed','Synthetic reviewed scope',$4,11251,'package','Synthetic reviewed supplemental',$5) returning id",
      [orgs[0], jobs[0], expenses[0], { mode: 'percent', value: 1250 }, change],
    )
  ).rows[0].id;
  await denied(
    "insert into private.supplemental_invoice_drafts(organization_id,decision_id,change_id,customer_id,currency,selling_minor,description,presentation) values($1,$2,$3,$4,'USD',1,'Synthetic reviewed supplemental','package')",
    [orgs[0], d, change, customers[0]],
  );
});
it('review: every new foreign key has a covering tenant index', async () => {
  await db.exec('reset role');
  const rows = (
    await db.query(
      "select c.conname from pg_constraint c where c.contype='f' and c.conrelid in (select oid from pg_class where relnamespace='private'::regnamespace and relname in ('property_features','inspection_plans','inspection_visits','inspection_reports','property_media','supplier_comparisons','unbilled_decisions','supplemental_invoice_drafts')) and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null and (select array_agg(k order by ord) from unnest(i.indkey) with ordinality x(k,ord) where ord<=cardinality(c.conkey))=c.conkey)",
    )
  ).rows;
  expect(rows).toEqual([]);
});
it('review: malformed maintenance content and mutable tenant/parent transfers are denied', async () => {
  await db.exec('reset role');
  await denied(
    'update private.inspection_visits set organization_id=$1,plan_id=$2 where id=$3',
    [orgs[1], plans[1], visits[0]],
  );
  await denied(
    "update private.inspection_visits set content=jsonb_set(content,'{internal_secret}',to_jsonb('SECRET'::text)) where id=$1",
    [visits[0]],
  );
  await denied(
    "update private.inspection_plans set starts_on='infinity' where id=$1",
    [plans[0]],
  );
  await denied(
    'update private.inspection_plans set customer_id=$1,location_id=$2,job_id=$3,organization_id=$4 where id=$5',
    [customers[1], locations[1], jobs[1], orgs[1], plans[0]],
  );
});
it('review: invoice currency, customer and presentation are locked to the reviewed existing job', async () => {
  const change = await rpc('propose_job_change', [
    orgs[0],
    jobs[0],
    {
      description: 'Synthetic reviewed supplemental',
      revenue_minor: 11251,
      cost_minor: 0,
      category: 'materials',
      status: 'proposed',
    },
  ]);
  await db.exec('reset role');
  const d = (
    await db.query<{ id: string }>(
      "insert into private.unbilled_decisions(organization_id,job_id,expense_id,revision,disposition,reason,pricing,selling_minor,presentation,description,change_id) values($1,$2,$3,1,'proposed','Synthetic reviewed scope',$4,11251,'package','Synthetic reviewed supplemental',$5) returning id",
      [orgs[0], jobs[0], expenses[0], { mode: 'percent', value: 1250 }, change],
    )
  ).rows[0].id;
  await denied(
    "insert into private.supplemental_invoice_drafts(organization_id,decision_id,change_id,customer_id,currency,selling_minor,description,presentation) values($1,$2,$3,$4,'EUR',11251,'Synthetic reviewed supplemental','package')",
    [orgs[0], d, change, customers[0]],
  );
});
it('review: missing or expired signed session expiry cannot open property data', async () => {
  for (const exp of [null, 0, Math.floor(Date.now() / 1000) - 1]) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: owners[0], aal: 'aal2', exp }),
    ]);
    await db.exec('set role authenticated');
    await denied('select private.property_workspace($1)', [orgs[0]]);
  }
});

async function reportAccess(
  index = 0,
  expires = "clock_timestamp()+interval '10 minutes'",
) {
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[index],
    customers[index],
    reportUsers[index],
  ]);
  await db.query(
    'insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,' +
      expires +
      ",'DISPOSABLE LOCAL ONLY')",
    [orgs[index], customers[index], locations[index], reportUsers[index]],
  );
  await actor(db, reportUsers[index], 'aal1');
}
async function reportRead(d = db, index = 0) {
  return (
    await d.query<{ v: Record<string, unknown> }>(
      'select public.property_reports($1,$2,$3) v',
      [orgs[index], customers[index], locations[index]],
    )
  ).rows[0].v;
}
it('P0 invoker wrappers preserve caller membership, MFA and default-off controls', async () => {
  const value = await rpc<{ plans: unknown[] }>('property_workspace', [
    orgs[0],
  ]);
  expect(value.plans.length).toBeGreaterThan(0);
  await actor(db, owners[0], 'aal1');
  await denied('select public.property_workspace($1)', [orgs[0]]);
  await actor();
  await denied('select public.property_workspace($1)', [orgs[1]]);
  await db.exec('reset role');
  await db.query(
    'update private.property_features set enabled=false where organization_id=$1',
    [orgs[0]],
  );
  await actor();
  await denied('select public.property_workspace($1)', [orgs[0]]);
});
it('P0 public entry points are invoker only; report access is private/default deny', async () => {
  await db.exec('reset role');
  const f = (
    await db.query(
      "select proname,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('property_command','property_workspace','property_reports')",
    )
  ).rows;
  expect(f).toHaveLength(3);
  expect(f.every((x) => x.prosecdef === false)).toBe(true);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec('reset role;set role ' + role);
    await denied('select * from private.property_report_access');
  }
});
it('P0 report-only access works with release mode off and cannot enable financial RPCs', async () => {
  await command('save_visit', visits[0], 1, content());
  await command('submit_visit', visits[0], 2);
  await command('publish_visit', visits[0], 3);
  await reportAccess();
  const page = await reportRead();
  expect(Object.keys(page).sort()).toEqual(
    [
      'organization_id',
      'customer_id',
      'location_id',
      'reports',
      'media',
      'mode',
      'report_only',
    ].sort(),
  );
  expect(page.reports).toHaveLength(1);
  expect(JSON.stringify(page)).not.toContain('SECRET');
  expect(page.media).toEqual([]);
  await denied('select public.release_workspace($1)', [orgs[0]]);
  await denied('select public.property_workspace($1)', [orgs[0]]);
  await denied('select public.property_reports($1,$2,$3)', [
    orgs[1],
    customers[1],
    locations[1],
  ]);
  await denied('select public.property_reports($1,$2,$3)', [
    orgs[0],
    customers[0],
    locations[1],
  ]);
});
it('P0 broad release grants cannot substitute for dedicated report authorization', async () => {
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    reportUsers[0],
  ]);
  await db.exec(
    "update private.release_environment set mode='internal-development',approval_reference='DISPOSABLE ONLY'",
  );
  await db.query(
    "insert into private.release_test_users values($1,$2,'customer',clock_timestamp()+interval '10 minutes')",
    [orgs[0], reportUsers[0]],
  );
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.property_reports($1,$2,$3)', [
    orgs[0],
    customers[0],
    locations[0],
  ]);
});
it('P0 revoked customer mapping and revoked report lease are immediately denied', async () => {
  await reportAccess();
  await reportRead();
  await db.exec('reset role');
  await db.query(
    'update portal_identities set active=false where organization_id=$1',
    [orgs[0]],
  );
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.property_reports($1,$2,$3)', [
    orgs[0],
    customers[0],
    locations[0],
  ]);
  await db.exec('reset role');
  await db.query(
    'update portal_identities set active=true where organization_id=$1',
    [orgs[0]],
  );
  await db.query(
    'update private.property_report_access set revoked_at=clock_timestamp() where organization_id=$1',
    [orgs[0]],
  );
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.property_reports($1,$2,$3)', [
    orgs[0],
    customers[0],
    locations[0],
  ]);
});
it('P0 report leases cannot be extended, moved or deleted even through maintenance', async () => {
  await reportAccess();
  await db.exec('reset role');
  await denied(
    "update private.property_report_access set expires_at=expires_at+interval '1 minute'",
  );
  await denied('delete from private.property_report_access');
  await denied('update private.property_report_access set location_id=$1', [
    locations[1],
  ]);
});
it('P0 report access foreign keys reject cross-company/customer/property bindings', async () => {
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    reportUsers[0],
  ]);
  await denied(
    "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '10 minutes','DISPOSABLE ONLY')",
    [orgs[0], customers[0], locations[1], reportUsers[0]],
  );
});
it('P0 revoked sessions and expired not_after cannot invoke prepared application entry points', async () => {
  await db.exec('reset role');
  await db.query(
    "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
    [sessions.get(owners[0])],
  );
  await actor();
  await denied('select public.property_workspace($1)', [orgs[0]]);
  await db.exec('reset role');
  await db.query('delete from auth.sessions where id=$1', [
    sessions.get(owners[0]),
  ]);
  await actor();
  await denied('select public.property_workspace($1)', [orgs[0]]);
});
it('P0 malformed/missing session claims and unverified customers are denied', async () => {
  await reportAccess();
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=null where id=$1', [
    reportUsers[0],
  ]);
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.property_reports($1,$2,$3)', [
    orgs[0],
    customers[0],
    locations[0],
  ]);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: owners[0],
      aal: 'aal2',
      exp: Math.floor(Date.now() / 1000) + 3600,
      session_id: 'not-a-session',
    }),
  ]);
  await db.exec('set role authenticated');
  await denied('select public.property_workspace($1)', [orgs[0]]);
});
it('P0 report-only function has no financial or broad release dependency', async () => {
  await db.exec('reset role');
  const d = (
    await db.query(
      "select pg_get_functiondef('private.property_published_reports(uuid,uuid,uuid,uuid)'::regprocedure) body",
    )
  ).rows[0].body as string;
  expect(d).not.toMatch(/release_|invoice|payment|payroll/);
  await reportAccess();
  await denied('select public.property_reports($1,$2,$3,$4)', [
    orgs[0],
    customers[0],
    locations[0],
    uid(),
  ]);
});

it('P0 renewed access appends a new short lease only after audited revocation', async () => {
  await reportAccess();
  await db.exec('reset role');
  await denied(
    "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '10 minutes','DISPOSABLE RENEWAL')",
    [orgs[0], customers[0], locations[0], reportUsers[0]],
  );
  await db.query(
    'update private.property_report_access set revoked_at=clock_timestamp() where organization_id=$1',
    [orgs[0]],
  );
  await db.query(
    "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '10 minutes','DISPOSABLE RENEWAL')",
    [orgs[0], customers[0], locations[0], reportUsers[0]],
  );
  expect(
    Number(
      (await db.query('select count(*) n from private.property_report_access'))
        .rows[0].n,
    ),
  ).toBe(2);
  await actor(db, reportUsers[0], 'aal1');
  await reportRead();
});
it('P0 an owner who is also a report customer still needs AAL2', async () => {
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    owners[0],
  ]);
  await db.query(
    "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '10 minutes','DISPOSABLE OWNER CUSTOMER')",
    [orgs[0], customers[0], locations[0], owners[0]],
  );
  await actor(db, owners[0], 'aal1');
  await denied('select public.property_reports($1,$2,$3)', [
    orgs[0],
    customers[0],
    locations[0],
  ]);
  await actor();
  await reportRead();
});
it('P0 report pages are bounded and cursor-scoped to the authorized property', async () => {
  await command('save_visit', visits[0], 1, content());
  await command('submit_visit', visits[0], 2);
  await db.exec('reset role');
  for (let version = 1; version <= 60; version++)
    await db.query(
      'insert into private.inspection_reports(organization_id,visit_id,customer_id,location_id,version,snapshot) select $1,v.id,$3,$4,$5,private.property_report_snapshot(v.content,v.visited_on,v.phase) from private.inspection_visits v where v.id=$2',
      [orgs[0], visits[0], customers[0], locations[0], version],
    );
  await reportAccess();
  const page = await reportRead();
  const rows = page.reports as { id: string }[];
  expect(rows).toHaveLength(50);
  const next = (
    await db.query<{ v: { reports: { id: string }[] } }>(
      'select public.property_reports($1,$2,$3,$4) v',
      [orgs[0], customers[0], locations[0], rows.at(-1)!.id],
    )
  ).rows[0].v;
  expect(next.reports).toHaveLength(10);
  expect(new Set([...rows, ...next.reports].map((r) => r.id)).size).toBe(60);
});
it('P0 operator lease insertion cannot exceed the bounded hour window', async () => {
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    reportUsers[0],
  ]);
  await denied(
    "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '2 hours','DISPOSABLE TOO LONG')",
    [orgs[0], customers[0], locations[0], reportUsers[0]],
  );
});
async function estimateAccess(
  index = 0,
  extra: { report: string; finding: string; line: string } | null = null,
) {
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[index],
    customers[index],
    reportUsers[index],
  ]);
  await actor(db, owners[index]);
  const p = {
    customer_id: customers[index],
    location_id: locations[index],
    user_id: reportUsers[index],
    version_id: versions[index].version.id,
    source_report_id: extra?.report ?? null,
    finding_id: extra?.finding ?? null,
    source_line_id: extra?.line ?? null,
  };
  const preview = await rpc<{ scope_sha256: string }>(
    'customer_publication_preview',
    [orgs[index], p],
  );
  const value = await rpc<{ publication_id: string }>(
    'customer_publish_estimate',
    [
      orgs[index],
      {
        ...p,
        scope_sha256: preview.scope_sha256,
        request_id: uid(),
        expires_at: new Date(Date.now() + 600000).toISOString(),
        review_acknowledged: true,
        approval_reference: 'DISPOSABLE LOCAL ONLY',
      },
    ],
  );
  await db.exec('reset role');
  return value.publication_id;
}
const estimateRead = (index = 0, d = db) =>
  d.query<{ v: Record<string, unknown> }>(
    'select public.customer_estimate_review($1,$2,$3,$4) v',
    [
      orgs[index],
      customers[index],
      locations[index],
      versions[index].version.id,
    ],
  );
it.each([0, 1, 2])(
  'customer discovery/review proposal company %i: exact server binding, issued scope and no report/financial authority',
  async (index) => {
    await estimateAccess(index);
    await actor(db, reportUsers[index], 'aal1');
    const discovered = (
      await db.query<{ v: { contexts: Record<string, unknown>[] } }>(
        'select public.customer_portal_discover() v',
      )
    ).rows[0].v;
    expect(discovered.contexts).toHaveLength(1);
    expect(discovered.contexts[0]).toMatchObject({
      organization_id: orgs[index],
      customer_id: customers[index],
      location_id: locations[index],
      reports: false,
      version_ids: [versions[index].version.id],
    });
    const value = (await estimateRead(index)).rows[0].v;
    expect(value.review_state).toBe('awaiting_action');
    expect(value.read_only).toBe(true);
    expect(value.version_id).toBe(versions[index].version.id);
    for (const word of [
      'unit_cost_minor',
      'margin',
      'internal_notes',
      'markup',
      'payroll',
      'supplier',
      'deduction',
    ])
      expect(JSON.stringify(value)).not.toContain(word);
    await denied('select public.property_reports($1,$2,$3)', [
      orgs[index],
      customers[index],
      locations[index],
    ]);
    await denied('select public.release_workspace($1)', [orgs[index]]);
    for (let other = 0; other < 3; other++)
      if (other !== index) {
        await denied('select public.customer_estimate_review($1,$2,$3,$4)', [
          orgs[other],
          customers[other],
          locations[other],
          versions[other].version.id,
        ]);
        await denied('select public.customer_estimate_review($1,$2,$3,$4)', [
          orgs[index],
          customers[other],
          locations[index],
          versions[index].version.id,
        ]);
      }
  },
);
it('customer repair provenance binds published finding and included issued line; private findings cannot publish', async () => {
  const report = await publishP2(0);
  await estimateAccess(0, {
    report,
    finding: 'public',
    line: versions[0].version.payload.lines[0].id,
  });
  await actor(db, reportUsers[0], 'aal1');
  const value = (await estimateRead()).rows[0].v;
  expect(value.source_report_id).toBe(report);
  expect(value.source_line_id).toBe(versions[0].version.payload.lines[0].id);
  await db.exec('reset role');
  await db.query(
    'update private.customer_estimate_access set revoked_at=clock_timestamp() where organization_id=$1',
    [orgs[0]],
  );
  await denied(
    "insert into private.customer_estimate_access(organization_id,customer_id,location_id,user_id,version_id,source_report_id,finding_id,source_line_id,expires_at,approval_reference) values($1,$2,$3,$4,$5,$6,'private',$7,clock_timestamp()+interval '5 minutes','LOCAL')",
    [
      orgs[0],
      customers[0],
      locations[0],
      reportUsers[0],
      versions[0].version.id,
      report,
      versions[0].version.payload.lines[0].id,
    ],
  );
});
it('customer report leases cannot substitute for estimate review and anonymous discovery enumerates nothing', async () => {
  await reportAccess();
  expect(
    (
      await db.query<{ v: { contexts: { version_ids: string[] }[] } }>(
        'select public.customer_portal_discover() v',
      )
    ).rows[0].v.contexts[0].version_ids,
  ).toEqual([]);
  await denied('select public.customer_estimate_review($1,$2,$3,$4)', [
    orgs[0],
    customers[0],
    locations[0],
    versions[0].version.id,
  ]);
  await db.exec('reset role;set role anon');
  await denied('select public.customer_portal_discover()');
});
it('customer proposal table is RLS/default-deny and customer access cannot mutate grants or financial workflows', async () => {
  await db.exec('reset role');
  expect(
    (
      await db.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where oid='private.customer_estimate_access'::regclass",
      )
    ).rows[0].relrowsecurity,
  ).toBe(true);
  expect(
    (
      await db.query(
        "select * from pg_policies where schemaname='private' and tablename='customer_estimate_access'",
      )
    ).rows,
  ).toHaveLength(0);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec('reset role;set role ' + role);
    await denied('select * from private.customer_estimate_access');
    await denied('delete from private.customer_estimate_access');
  }
  await db.exec('reset role');
  await estimateAccess();
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.release_command($1,$2,$3)', [
    orgs[0],
    'decide_offer',
    {},
  ]);
  await denied('select public.approve_job_change($1,$2,$3)', [
    orgs[0],
    uid(),
    'NOT AUTHORIZED',
  ]);
});
it('customer estimate leases are revoke-only with tenant/property/issued/report provenance checks', async () => {
  const access = await estimateAccess();
  await denied(
    "update private.customer_estimate_access set expires_at=expires_at+interval '1 minute' where id=$1",
    [access],
  );
  await denied('delete from private.customer_estimate_access where id=$1', [
    access,
  ]);
  await denied(
    'update private.customer_estimate_access set location_id=$1 where id=$2',
    [locations[1], access],
  );
  await db.query(
    'update private.customer_estimate_access set revoked_at=clock_timestamp() where id=$1',
    [access],
  );
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.customer_estimate_review($1,$2,$3,$4)', [
    orgs[0],
    customers[0],
    locations[0],
    versions[0].version.id,
  ]);
});
it('customer discovery excludes staff even if maintenance supplied both a mapping and an estimate lease', async () => {
  await estimateAccess();
  await db.exec('reset role');
  await db.query(
    "insert into memberships(organization_id,user_id,role) values($1,$2,'staff')",
    [orgs[0], reportUsers[0]],
  );
  await actor(db, reportUsers[0], 'aal2');
  await denied('select public.customer_portal_discover()');
});
it('customer estimate access expires on the current session and revoked mapping without modifying financial state', async () => {
  await estimateAccess();
  await db.query('update portal_identities set active=false where user_id=$1', [
    reportUsers[0],
  ]);
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.customer_portal_discover()');
  await db.exec('reset role');
  await db.query('update portal_identities set active=true where user_id=$1', [
    reportUsers[0],
  ]);
  await db.query(
    'update auth.sessions set not_after=clock_timestamp() where id=$1',
    [sessions.get(reportUsers[0])],
  );
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.customer_portal_discover()');
});
it('customer estimate grant cannot bind an unrelated property of the same customer', async () => {
  await db.exec('reset role');
  const location = uid();
  await db.query(
    "insert into service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Other property','Example','FL','00000','US')",
    [location, orgs[0], customers[0]],
  );
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    reportUsers[0],
  ]);
  await denied(
    "insert into private.customer_estimate_access(organization_id,customer_id,location_id,user_id,version_id,expires_at,approval_reference) values($1,$2,$3,$4,$5,clock_timestamp()+interval '10 minutes','LOCAL')",
    [orgs[0], customers[0], location, reportUsers[0], versions[0].version.id],
  );
});
// P2 local acceptance mirrors the existing nine hosted case groups; no hosted fixture executor.
async function publishP2(index: number) {
  await actor(db, owners[index]);
  await command('save_visit', visits[index], 1, content(), orgs[index]);
  await command('submit_visit', visits[index], 2, {}, orgs[index]);
  return command('publish_visit', visits[index], 3, {}, orgs[index]);
}
it.each([0, 1, 2])(
  'P2 customer-report company %i: exact published versions only; financial and staff commands remain denied',
  async (index) => {
    const published = await publishP2(index);
    await reportAccess(index);
    const page = await reportRead(db, index);
    expect(page.reports).toHaveLength(1);
    expect((page.reports as { id: string }[])[0].id).toBe(published);
    expect(page.customer_id).toBe(customers[index]);
    expect(page.report_only).toBe(true);
    await denied('select public.release_workspace($1)', [orgs[index]]);
    await denied('select public.property_workspace($1)', [orgs[index]]);
    await denied('select public.property_command($1,$2,$3,$4,$5)', [
      orgs[index],
      'revise_visit',
      visits[index],
      4,
      {},
    ]);
  },
);
it.each([0, 1, 2])(
  'P2 foreign-customer company %i: every foreign company and property cursor is denied',
  async (index) => {
    const foreign = (index + 1) % 3;
    const foreignReport = await publishP2(foreign);
    await publishP2(index);
    await reportAccess(index);
    for (let other = 0; other < 3; other++)
      if (other !== index) {
        await denied('select public.property_reports($1,$2,$3)', [
          orgs[other],
          customers[other],
          locations[other],
        ]);
        await denied('select public.property_reports($1,$2,$3)', [
          orgs[index],
          customers[other],
          locations[index],
        ]);
        await denied('select public.property_reports($1,$2,$3)', [
          orgs[index],
          customers[index],
          locations[other],
        ]);
      }
    await denied('select public.property_reports($1,$2,$3,$4)', [
      orgs[index],
      customers[index],
      locations[index],
      foreignReport,
    ]);
  },
);
it.each([0, 1, 2])(
  'P2 private-projection company %i: no internal findings, costs, payroll, drafts or media; mapping revocation denies immediately',
  async (index) => {
    await publishP2(index);
    await reportAccess(index);
    const page = await reportRead(db, index);
    const serialized = JSON.stringify(page);
    for (const forbidden of [
      'SECRET',
      'internal_notes',
      'unit_cost_minor',
      'markup',
      'payroll',
      'deductions',
      'supplemental_drafts',
    ])
      expect(serialized).not.toContain(forbidden);
    expect(page.media).toEqual([]);
    const snapshot = (
      page.reports as { snapshot: { findings: unknown[]; media: unknown[] } }[]
    )[0].snapshot;
    expect(snapshot.findings).toHaveLength(1);
    expect(snapshot.media).toEqual([]);
    await db.exec('reset role');
    await db.query(
      'update portal_identities set active=false where organization_id=$1 and user_id=$2',
      [orgs[index], reportUsers[index]],
    );
    await actor(db, reportUsers[index], 'aal1');
    await denied('select public.property_reports($1,$2,$3)', [
      orgs[index],
      customers[index],
      locations[index],
    ]);
  },
);

async function decisionContext(index = 0, d = db) {
  return (
    await d.query<{
      v: {
        publication_id: string;
        scope_sha256: string;
        decision: unknown;
        review: Record<string, unknown>;
      };
    }>('select public.customer_decision_context($1,$2,$3,$4) v', [
      orgs[index],
      customers[index],
      locations[index],
      versions[index].version.id,
    ])
  ).rows[0].v;
}
async function recordReview(
  index = 0,
  choice = 'approve_review',
  request = uid(),
  d = db,
) {
  const c = await decisionContext(index, d);
  return (
    await d.query<{ v: { id: string; request_id: string; choice: string } }>(
      'select public.customer_record_decision($1,$2,$3,$4,$5,$6) v',
      [
        orgs[index],
        c.publication_id,
        c.scope_sha256,
        choice,
        'review-only-v1',
        request,
      ],
    )
  ).rows[0].v;
}
it.each([0, 1, 2])(
  'customer workflow company %i: explicit publication and immutable review preference never create financial authority',
  async (index) => {
    const publication = await estimateAccess(index);
    const before = (
      await db.query('select to_jsonb(j) v from public.jobs j where id=$1', [
        jobs[index],
      ])
    ).rows[0].v;
    const original = (
      await db.query(
        'select to_jsonb(v) v from public.estimate_versions v where id=$1',
        [versions[index].version.id],
      )
    ).rows[0].v;
    await actor(db, reportUsers[index], 'aal1');
    const c = await decisionContext(index);
    expect(c.publication_id).toBe(publication);
    expect(c.decision).toBeNull();
    const request = uid();
    const r = await recordReview(index, 'approve_review', request);
    expect(await recordReview(index, 'approve_review', request)).toEqual(r);
    await denied('select public.customer_record_decision($1,$2,$3,$4,$5,$6)', [
      orgs[index],
      publication,
      c.scope_sha256,
      'decline_review',
      'review-only-v1',
      request,
    ]);
    expect((await decisionContext(index)).decision).toMatchObject({
      id: r.id,
      choice: 'approve_review',
    });
    await denied('select public.approve_job_change($1,$2,$3)', [
      orgs[index],
      uid(),
      'Not financial authorization',
    ]);
    for (let other = 0; other < 3; other++)
      if (other !== index)
        await denied(
          'select public.customer_record_decision($1,$2,$3,$4,$5,$6)',
          [
            orgs[other],
            publication,
            c.scope_sha256,
            'approve_review',
            'review-only-v1',
            uid(),
          ],
        );
    await db.exec('reset role');
    expect(
      (
        await db.query('select to_jsonb(j) v from public.jobs j where id=$1', [
          jobs[index],
        ])
      ).rows[0].v,
    ).toEqual(before);
    expect(
      (
        await db.query(
          'select to_jsonb(v) v from public.estimate_versions v where id=$1',
          [versions[index].version.id],
        )
      ).rows[0].v,
    ).toEqual(original);
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_review_decisions where organization_id=$1',
          [orgs[index]],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query(
          "select count(*) n from activity_events where organization_id=$1 and entity_type='customer_review_decisions'",
          [orgs[index]],
        )
      ).rows[0].n,
    ).toBe(1);
    for (const table of [
      'release_invoices',
      'release_contracts',
      'release_signatures',
      'release_authorizations',
      'release_payment_events',
      'release_ledger_entries',
      'release_messages',
    ]) {
      expect(
        (await db.query('select count(*) n from public.' + table)).rows[0].n,
      ).toBe(0);
    }
    await denied(
      "update private.customer_review_decisions set choice='decline_review' where organization_id=$1",
      [orgs[index]],
    );
    await denied(
      'delete from private.customer_review_decisions where organization_id=$1',
      [orgs[index]],
    );
  },
);
it('customer workflow publisher requires owner/admin AAL2, exact sources, reviewed hash and explicit acknowledgment', async () => {
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    reportUsers[0],
  ]);
  const p = {
    customer_id: customers[0],
    location_id: locations[0],
    user_id: reportUsers[0],
    version_id: versions[0].version.id,
    source_report_id: null,
    finding_id: null,
    source_line_id: null,
  };
  for (const [user, aal] of [
    [owners[0], 'aal1'],
    [owners[1], 'aal2'],
    [field, 'aal2'],
    [estimator, 'aal2'],
    [reportUsers[0], 'aal2'],
  ]) {
    await actor(db, user, aal);
    await denied('select public.customer_publication_preview($1,$2)', [
      orgs[0],
      p,
    ]);
  }
  await actor();
  const preview = await rpc<{ scope_sha256: string }>(
    'customer_publication_preview',
    [orgs[0], p],
  );
  const payload = {
    ...p,
    scope_sha256: preview.scope_sha256,
    request_id: uid(),
    expires_at: new Date(Date.now() + 600000).toISOString(),
    review_acknowledged: true,
    approval_reference: 'LOCAL explicit scope review',
  };
  for (const change of [
    { review_acknowledged: false },
    { scope_sha256: '0'.repeat(64) },
    { customer_id: customers[1] },
    { location_id: locations[1] },
    { version_id: versions[1].version.id },
    { expires_at: new Date(Date.now() + 3600000).toISOString() },
    { unexpected: true },
  ])
    await denied('select public.customer_publish_estimate($1,$2)', [
      orgs[0],
      { ...payload, ...change },
    ]);
  const a = await rpc('customer_publish_estimate', [orgs[0], payload]);
  expect(await rpc('customer_publish_estimate', [orgs[0], payload])).toEqual(a);
  await denied('select public.customer_publish_estimate($1,$2)', [
    orgs[0],
    { ...payload, approval_reference: 'changed' },
  ]);
  await db.exec('reset role');
  expect(
    (
      await db.query(
        'select count(*) n from private.customer_estimate_access where request_id=$1',
        [payload.request_id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it('customer workflow approval evidence requires exact digest/consent and denies NULL, forged, missing and revoked authority', async () => {
  const pub = await estimateAccess();
  await actor(db, reportUsers[0], 'aal1');
  const c = await decisionContext();
  for (const args of [
    [orgs[0], pub, c.scope_sha256, 'approve_review', null, uid()],
    [orgs[0], pub, '0'.repeat(64), 'approve_review', 'review-only-v1', uid()],
    [orgs[0], pub, c.scope_sha256, null, 'review-only-v1', uid()],
    [orgs[0], uid(), c.scope_sha256, 'approve_review', 'review-only-v1', uid()],
    [orgs[0], pub, c.scope_sha256, 'approve_review', 'review-only-v1', null],
  ])
    await denied(
      'select public.customer_record_decision($1,$2,$3,$4,$5,$6)',
      args,
    );
  await db.exec('reset role');
  expect(
    (await db.query('select count(*) n from private.customer_review_decisions'))
      .rows[0].n,
  ).toBe(0);
  await actor();
  await rpc('customer_revoke_publication', [orgs[0], pub]);
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.customer_record_decision($1,$2,$3,$4,$5,$6)', [
    orgs[0],
    pub,
    c.scope_sha256,
    'approve_review',
    'review-only-v1',
    uid(),
  ]);
});
it('customer workflow review choices are independent per issued version; renewed leases cannot authorize a second decision', async () => {
  const pub = await estimateAccess();
  await actor(db, reportUsers[0], 'aal1');
  await recordReview(0, 'decline_review');
  await actor();
  await rpc('customer_revoke_publication', [orgs[0], pub]);
  const p = {
    customer_id: customers[0],
    location_id: locations[0],
    user_id: reportUsers[0],
    version_id: versions[0].version.id,
    source_report_id: null,
    finding_id: null,
    source_line_id: null,
  };
  const preview = await rpc<{ scope_sha256: string }>(
    'customer_publication_preview',
    [orgs[0], p],
  );
  const renewed = await rpc<{ publication_id: string }>(
    'customer_publish_estimate',
    [
      orgs[0],
      {
        ...p,
        scope_sha256: preview.scope_sha256,
        request_id: uid(),
        expires_at: new Date(Date.now() + 600000).toISOString(),
        review_acknowledged: true,
        approval_reference: 'LOCAL renewal',
      },
    ],
  );
  await actor(db, reportUsers[0], 'aal1');
  expect((await decisionContext()).decision).toMatchObject({
    choice: 'decline_review',
  });
  await denied('select public.customer_record_decision($1,$2,$3,$4,$5,$6)', [
    orgs[0],
    renewed.publication_id,
    preview.scope_sha256,
    'approve_review',
    'review-only-v1',
    uid(),
  ]);
});
it('customer workflow evidence tables remain private/default deny and function search paths are fixed', async () => {
  await db.exec('reset role');
  for (const role of ['anon', 'authenticated', 'service_role'])
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select has_table_privilege($1,'private.customer_review_decisions','select,insert,update,delete') ok",
          [role],
        )
      ).rows[0].ok,
    ).toBe(false);
  expect(
    (
      await db.query(
        "select relrowsecurity from pg_class where oid='private.customer_review_decisions'::regclass",
      )
    ).rows[0].relrowsecurity,
  ).toBe(true);
  expect(
    (
      await db.query(
        "select * from pg_policies where schemaname='private' and tablename='customer_review_decisions'",
      )
    ).rows,
  ).toHaveLength(0);
  const functions = (
    await db.query<{ prosecdef: boolean; proconfig: string[] }>(
      "select prosecdef,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('customer_publish_estimate','customer_record_decision','customer_decision_context','customer_revoke_publication','customer_publication_preview')",
    )
  ).rows;
  expect(functions).toHaveLength(5);
  for (const f of functions) {
    expect(f.prosecdef).toBe(false);
    expect(f.proconfig).toEqual(['search_path=""']);
  }
});

it('customer workflow maintenance cannot insert forged decision evidence or change immutable terminal preferences', async () => {
  await estimateAccess();
  await actor(db, reportUsers[0], 'aal1');
  const c = await decisionContext();
  await recordReview();
  await db.exec('reset role');
  for (const [choice, digestValue, customer] of [
    ['approve_review', '0'.repeat(64), customers[0]],
    ['charge_customer', c.scope_sha256, customers[0]],
    ['approve_review', c.scope_sha256, customers[1]],
  ]) {
    await denied(
      'insert into private.customer_review_decisions(organization_id,publication_id,customer_id,location_id,user_id,version_id,request_id,choice,acknowledgment,scope_sha256,scope_snapshot,auth_session_id) select organization_id,publication_id,$1,location_id,user_id,version_id,gen_random_uuid(),$2,acknowledgment,$3,scope_snapshot,auth_session_id from private.customer_review_decisions where publication_id=$4',
      [customer, choice, digestValue, c.publication_id],
    );
  }
  await denied(
    'update private.customer_estimate_access set published_by=$1 where id=$2',
    [owners[1], c.publication_id],
  );
  await actor();
  await rpc('customer_revoke_publication', [orgs[0], c.publication_id]);
  await actor(db, reportUsers[0], 'aal1');
  await denied('select public.customer_decision_context($1,$2,$3,$4)', [
    orgs[0],
    customers[0],
    locations[0],
    versions[0].version.id,
  ]);
  await db.exec('reset role');
  expect(
    (await db.query('select count(*) n from private.customer_review_decisions'))
      .rows[0].n,
  ).toBe(1);
});
it('customer workflow publisher receives only an explicit published repair recommendation and cannot substitute a private finding', async () => {
  const report = await publishP2(0);
  await db.exec('reset role');
  await db.query('insert into portal_identities values($1,$2,$3,true)', [
    orgs[0],
    customers[0],
    reportUsers[0],
  ]);
  await actor();
  const p = {
    customer_id: customers[0],
    location_id: locations[0],
    user_id: reportUsers[0],
    version_id: versions[0].version.id,
    source_report_id: report,
    finding_id: 'public',
    source_line_id: versions[0].version.payload.lines[0].id,
  };
  const preview = await rpc<{
    repair_recommendation: { id: string; recommendation: string };
  }>('customer_publication_preview', [orgs[0], p]);
  expect(preview.repair_recommendation.id).toBe('public');
  expect(JSON.stringify(preview)).not.toContain('SECRET');
  await denied('select public.customer_publication_preview($1,$2)', [
    orgs[0],
    { ...p, finding_id: 'private' },
  ]);
  await db.exec('reset role');
  expect(
    (await db.query('select count(*) n from private.customer_estimate_access'))
      .rows[0].n,
  ).toBe(0);
});
it.skipIf(!db.fork)(
  'customer proposal native: access expiry during a grant lock wait denies issued review',
  async () => {
    await db.exec('rollback;reset role');
    await estimateAccess(2);
    await db.query(
      'update private.customer_estimate_access set revoked_at=clock_timestamp() where organization_id=$1',
      [orgs[2]],
    );
    const grant = (
      await db.query<{ id: string }>(
        "insert into private.customer_estimate_access(organization_id,customer_id,location_id,user_id,version_id,expires_at,approval_reference,published_by,request_id,scope_sha256,scope_snapshot,repair_link_reviewed) select $1,$2,$3,$4,$5,clock_timestamp()+interval '2 seconds','LOCAL NATIVE WAIT',published_by,gen_random_uuid(),scope_sha256,scope_snapshot,true from private.customer_estimate_access where organization_id=$1 limit 1 returning id",
        [
          orgs[2],
          customers[2],
          locations[2],
          reportUsers[2],
          versions[2].version.id,
        ],
      )
    ).rows[0].id;
    await db.exec('begin');
    await db.query(
      'select id from private.customer_estimate_access where id=$1 for update',
      [grant],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, reportUsers[2], 'aal1');
      const pending = estimateRead(2, peer).then(
        () => false,
        () => true,
      );
      await blocked(db, pid);
      await db.exec('select pg_sleep(2.1);commit');
      expect(await pending).toBe(true);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'customer proposal native: mapping revocation during a lock wait denies discovery',
  async () => {
    await db.exec('rollback;reset role');
    await estimateAccess(1);
    await db.exec('begin');
    await db.query(
      'update portal_identities set active=false where user_id=$1',
      [reportUsers[1]],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, reportUsers[1], 'aal1');
      const pending = peer
        .query('select public.customer_portal_discover()')
        .then(
          () => false,
          () => true,
        );
      await blocked(db, pid);
      await db.exec('commit');
      expect(await pending).toBe(true);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'review native: JWT expiry during a visit lock wait rolls back all write/audit effects',
  async () => {
    await db.exec('rollback;reset role');
    await actor();
    const p = await command('create_plan', null, null, {
      customer_id: customers[0],
      location_id: locations[0],
      job_id: jobs[0],
      name: 'Native session expiry',
      cadence: 'once',
      interval_days: 1,
      timezone: 'UTC',
      starts_on: '2026-11-10',
      checklist: content().checklist,
    });
    const v = await command('create_visit', p, null, {
      visited_on: '2026-11-10',
      phase: 'after',
    });
    await db.exec('reset role;begin');
    await db.query(
      'select id from private.inspection_visits where id=$1 for update',
      [v],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
          (await peer.query('select pg_backend_pid() id')).rows[0].id,
        ),
        expiry = Number(
          (
            await db.query(
              'select floor(extract(epoch from clock_timestamp()))::bigint+2 exp',
            )
          ).rows[0].exp,
        );
      await actor(peer);
      await peer.exec('reset role');
      await peer.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: owners[0], aal: 'aal2', exp: expiry }),
      ]);
      await peer.exec('set role authenticated');
      const pending = command(
        'save_visit',
        v,
        1,
        content(),
        orgs[0],
        peer,
      ).then(
        () => false,
        () => true,
      );
      await blocked(db, pid);
      for (let i = 0; i < 160; i++) {
        if (
          (
            await db.query(
              'select extract(epoch from clock_timestamp()) >= $1 expired',
              [expiry],
            )
          ).rows[0].expired
        )
          break;
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(
        (
          await db.query(
            'select extract(epoch from clock_timestamp()) >= $1 expired',
            [expiry],
          )
        ).rows[0].expired,
      ).toBe(true);
      await db.exec('commit');
      expect(await pending).toBe(true);
      expect(
        (
          await db.query(
            'select lock_revision from private.inspection_visits where id=$1',
            [v],
          )
        ).rows[0].lock_revision,
      ).toBe(1);
      expect(
        (
          await db.query(
            "select id from activity_events where organization_id=$1 and entity_id=$2 and action='update'",
            [orgs[0], v],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'review native: two NULL-revision writers are both denied with no mutation',
  async () => {
    await db.exec('rollback;reset role');
    await actor();
    const p = await command('create_plan', null, null, {
      customer_id: customers[0],
      location_id: locations[0],
      job_id: jobs[0],
      name: 'Native null test',
      cadence: 'once',
      interval_days: 1,
      timezone: 'UTC',
      starts_on: '2026-11-01',
      checklist: content().checklist,
    });
    const v = await command('create_visit', p, null, {
      visited_on: '2026-11-01',
      phase: 'before',
    });
    await db.exec('reset role');
    const a = await db.fork!(),
      b = await db.fork!();
    try {
      await actor(a);
      await actor(b);
      const results = await Promise.allSettled([
        command('save_visit', v, null, content(), orgs[0], a),
        command('save_visit', v, null, content(), orgs[0], b),
      ]);
      expect(results.filter((x) => x.status === 'rejected')).toHaveLength(2);
      expect(
        (
          await db.query(
            'select lock_revision from private.inspection_visits where id=$1',
            [v],
          )
        ).rows[0].lock_revision,
      ).toBe(1);
    } finally {
      await a.close();
      await b.close();
    }
  },
);
it.skipIf(!db.fork)(
  'review native: assignment revoked while a field writer waits on a visit is denied',
  async () => {
    await db.exec('rollback;reset role');
    await actor();
    await rpc('assign_job', [orgs[0], jobs[0], field, true]);
    const p = await command('create_plan', null, null, {
      customer_id: customers[0],
      location_id: locations[0],
      job_id: jobs[0],
      name: 'Native assignment test',
      cadence: 'once',
      interval_days: 1,
      timezone: 'UTC',
      starts_on: '2026-11-02',
      checklist: content().checklist,
    });
    const v = await command('create_visit', p, null, {
      visited_on: '2026-11-02',
      phase: 'before',
    });
    await db.exec('reset role;begin');
    await db.query(
      'select id from private.inspection_visits where id=$1 for update',
      [v],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, field, 'aal1');
      const result = command('save_visit', v, 1, content(), orgs[0], peer).then(
        () => false,
        () => true,
      );
      await blocked(db, pid);
      await db.query(
        'update job_assignments set active=false where organization_id=$1 and job_id=$2 and user_id=$3',
        [orgs[0], jobs[0], field],
      );
      await db.exec('commit');
      expect(await result).toBe(true);
      expect(
        (
          await db.query(
            'select lock_revision from private.inspection_visits where id=$1',
            [v],
          )
        ).rows[0].lock_revision,
      ).toBe(1);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'review native: module disabled during feature-lock wait cannot return financial reviews',
  async () => {
    await db.exec('rollback;reset role;begin');
    await db.query(
      'select organization_id from private.property_features where organization_id=$1 for update',
      [orgs[0]],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer);
      const result = peer
        .query('select private.property_workspace($1)', [orgs[0]])
        .then(
          () => false,
          () => true,
        );
      await blocked(db, pid);
      await db.query(
        "update company_modules set enabled=false where organization_id=$1 and module='estimates'",
        [orgs[0]],
      );
      await db.exec('commit');
      expect(await result).toBe(true);
    } finally {
      await db.exec('rollback');
      await db.query(
        "update company_modules set enabled=true where organization_id=$1 and module='estimates'",
        [orgs[0]],
      );
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'review native: duplicate scheduled visits create exactly one record and audit event',
  async () => {
    await db.exec('rollback;reset role');
    const a = await db.fork!(),
      b = await db.fork!();
    try {
      await actor(a);
      await actor(b);
      const p = { visited_on: '2026-11-09', phase: 'after' };
      const results = await Promise.allSettled([
        command('create_visit', plans[0], null, p, orgs[0], a),
        command('create_visit', plans[0], null, p, orgs[0], b),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const rows = (
        await db.query<{ id: string }>(
          'select id from private.inspection_visits where organization_id=$1 and plan_id=$2 and visited_on=$3',
          [orgs[0], plans[0], p.visited_on],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(
        (
          await db.query(
            "select id from activity_events where organization_id=$1 and entity_type='inspection_visits' and entity_id=$2 and action='insert'",
            [orgs[0], rows[0].id],
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
    }
  },
);
it.skipIf(!db.fork)(
  'native concurrent visit writes have exactly one winner',
  async () => {
    await db.exec('rollback;reset role');
    const a = await db.fork!(),
      b = await db.fork!();
    try {
      await actor(a);
      await actor(b);
      const r = await Promise.allSettled([
        command('save_visit', visits[0], 1, content(), orgs[0], a),
        command('save_visit', visits[0], 1, content(), orgs[0], b),
      ]);
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(r.filter((x) => x.status === 'rejected')).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
    }
  },
);
it.skipIf(!db.fork)(
  'native concurrent purchase proposals create one change and one invoice draft',
  async () => {
    await db.exec('rollback;reset role');
    const rev = (
      await db.query('select lock_revision from jobs where id=$1', [jobs[0]])
    ).rows[0].lock_revision as number;
    const a = await db.fork!(),
      b = await db.fork!();
    try {
      await actor(a);
      await actor(b);
      const r = await Promise.allSettled([
        command('unbilled_review', jobs[0], rev, decision(), orgs[0], a),
        command('unbilled_review', jobs[0], rev, decision(), orgs[0], b),
      ]);
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(r.filter((x) => x.status === 'rejected')).toHaveLength(1);
      expect(
        (await db.query('select * from private.supplemental_invoice_drafts'))
          .rows,
      ).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
    }
  },
);
async function blocked(d: TestDatabase, pid: number) {
  for (let n = 0; n < 80; n++) {
    if (
      (
        await d.query(
          "select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",
          [pid],
        )
      ).rows.length
    )
      return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error('Expected native lock wait did not occur');
}
it.skipIf(!db.fork)(
  'native membership revoked during a feature-lock wait prevents all visit effects',
  async () => {
    await db.exec('rollback;reset role;begin');
    await db.query(
      'update private.property_features set enabled=true where organization_id=$1',
      [orgs[2]],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, owners[2]);
      const pending = command(
        'save_visit',
        visits[2],
        1,
        content(),
        orgs[2],
        peer,
      ).then(
        () => ({ denied: false }),
        () => ({ denied: true }),
      );
      await blocked(db, pid);
      await db.query(
        'update memberships set active=false where organization_id=$1 and user_id=$2',
        [orgs[2], owners[2]],
      );
      await db.exec('commit');
      expect((await pending).denied).toBe(true);
      expect(
        (
          await db.query(
            'select lock_revision from private.inspection_visits where id=$1',
            [visits[2]],
          )
        ).rows[0].lock_revision,
      ).toBe(1);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'native concurrent report publication permits one immutable version',
  async () => {
    await db.exec('rollback;reset role');
    await actor(db, owners[1]);
    await command('save_visit', visits[1], 1, content(), orgs[1]);
    await command('submit_visit', visits[1], 2, {}, orgs[1]);
    await db.exec('reset role');
    const a = await db.fork!(),
      b = await db.fork!();
    try {
      await actor(a, owners[1]);
      await actor(b, owners[1]);
      const result = await Promise.allSettled([
        command('publish_visit', visits[1], 3, {}, orgs[1], a),
        command('publish_visit', visits[1], 3, {}, orgs[1], b),
      ]);
      expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(
        (
          await db.query(
            'select * from private.inspection_reports where visit_id=$1',
            [visits[1]],
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
    }
  },
);
it.skipIf(!db.fork)(
  'native portal grant expiring during an identity lock wait cannot return a report',
  async () => {
    await db.exec('rollback;reset role');
    const viewer = uid();
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [viewer, `${viewer}@example.test`],
    );
    await db.exec(
      "update private.release_environment set mode='internal-development',approval_reference='DISPOSABLE LOCAL TEST ONLY'",
    );
    await db.query(
      "insert into private.release_test_users values($1,$2,'customer',clock_timestamp()+interval '1 second')",
      [orgs[1], viewer],
    );
    await db.query('insert into portal_identities values($1,$2,$3,true)', [
      orgs[1],
      customers[1],
      viewer,
    ]);
    await db.exec('begin');
    await db.query(
      'select 1 from portal_identities where organization_id=$1 and user_id=$2 for update',
      [orgs[1], viewer],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, viewer, 'aal1');
      const pending = peer
        .query('select private.property_portal($1,$2)', [orgs[1], customers[1]])
        .then(
          () => ({ denied: false }),
          () => ({ denied: true }),
        );
      await blocked(db, pid);
      for (let i = 0; i < 100; i++) {
        if (
          (
            await db.query(
              'select 1 from private.release_test_users where organization_id=$1 and user_id=$2 and expires_at<=clock_timestamp()',
              [orgs[1], viewer],
            )
          ).rows.length
        )
          break;
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(
        (
          await db.query(
            'select 1 from private.release_test_users where organization_id=$1 and user_id=$2 and expires_at<=clock_timestamp()',
            [orgs[1], viewer],
          )
        ).rows,
      ).toHaveLength(1);
      await db.exec('commit');
      expect((await pending).denied).toBe(true);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);

it.skipIf(!db.fork)(
  'P0 native: report lease expiry while blocked on its row denies the projection',
  async () => {
    await db.exec('rollback;reset role');
    const user = uid(),
      session = uid();
    sessions.set(user, session);
    await db.query('insert into auth.users values($1,$2,clock_timestamp())', [
      user,
      `${user}@example.test`,
    ]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      session,
      user,
    ]);
    await db.query('insert into portal_identities values($1,$2,$3,true)', [
      orgs[0],
      customers[0],
      user,
    ]);
    await db.query(
      "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '1 second','DISPOSABLE NATIVE WAIT')",
      [orgs[0], customers[0], locations[0], user],
    );
    await db.exec('begin');
    await db.query(
      'select id from private.property_report_access where user_id=$1 for update',
      [user],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, user, 'aal1');
      const pending = reportRead(peer).then(
        () => false,
        () => true,
      );
      await blocked(db, pid);
      await db.exec('select pg_sleep(1.1);commit');
      expect(await pending).toBe(true);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'P0 native: mapping revoked during a mapping lock wait denies customer report access',
  async () => {
    await db.exec('rollback;reset role');
    const user = uid(),
      session = uid();
    sessions.set(user, session);
    await db.query('insert into auth.users values($1,$2,clock_timestamp())', [
      user,
      `${user}@example.test`,
    ]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      session,
      user,
    ]);
    await db.query('insert into portal_identities values($1,$2,$3,true)', [
      orgs[0],
      customers[0],
      user,
    ]);
    await db.query(
      "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '10 minutes','DISPOSABLE NATIVE WAIT')",
      [orgs[0], customers[0], locations[0], user],
    );
    await db.exec('begin');
    await db.query(
      'update portal_identities set active=false where user_id=$1',
      [user],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, user, 'aal1');
      const pending = reportRead(peer).then(
        () => false,
        () => true,
      );
      await blocked(db, pid);
      await db.exec('commit');
      expect(await pending).toBe(true);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'P0 native: session not_after expiry while awaiting a visit lock rolls back every public command effect',
  async () => {
    await db.exec('rollback;reset role');
    await actor();
    const plan = await command('create_plan', null, null, {
      customer_id: customers[0],
      location_id: locations[0],
      job_id: jobs[0],
      name: 'Public session deadline',
      cadence: 'once',
      interval_days: 1,
      timezone: 'UTC',
      starts_on: '2027-01-01',
      checklist: content().checklist,
    });
    const visit = await command('create_visit', plan, null, {
      visited_on: '2027-01-01',
      phase: 'before',
    });
    await db.exec('reset role');
    const audit = Number(
      (await db.query('select count(*) n from activity_events')).rows[0].n,
    );
    await db.query(
      "update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id=$1",
      [sessions.get(owners[0])],
    );
    await db.exec('begin');
    await db.query(
      'select id from private.inspection_visits where id=$1 for update',
      [visit],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer);
      const pending = peer
        .query('select public.property_command($1,$2,$3,$4,$5)', [
          orgs[0],
          'save_visit',
          visit,
          1,
          content(),
        ])
        .then(
          () => false,
          () => true,
        );
      await blocked(db, pid);
      await db.exec('select pg_sleep(1.1);commit');
      expect(await pending).toBe(true);
      expect(
        (
          await db.query(
            'select lock_revision from private.inspection_visits where id=$1',
            [visit],
          )
        ).rows[0].lock_revision,
      ).toBe(1);
      expect(
        Number(
          (await db.query('select count(*) n from activity_events')).rows[0].n,
        ),
      ).toBe(audit);
    } finally {
      await db.exec('rollback');
      await db.query('update auth.sessions set not_after=null where id=$1', [
        sessions.get(owners[0]),
      ]);
      await peer.close();
    }
  },
);

it('executes the offline compiled three-company fixture proposals locally through the narrow RPCs', async () => {
  await db.exec('reset role');
  // Native revocation cases deliberately commit fixture changes. Restore only these
  // disposable positive-case owners; this is never a hosted acceptance operation.
  for (let i = 0; i < 3; i++)
    await db.query(
      'update memberships set active=true where organization_id=$1 and user_id=$2',
      [orgs[i], owners[i]],
    );
  const revisions: number[] = [],
    reportCounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    revisions.push(
      (
        await db.query<{ lock_revision: number }>(
          'select lock_revision from jobs where id=$1',
          [jobs[i]],
        )
      ).rows[0].lock_revision,
    );
    reportCounts.push(
      (
        await db.query<{ n: number }>(
          'select count(*)::int n from private.inspection_reports where organization_id=$1',
          [orgs[i]],
        )
      ).rows[0].n,
    );
  }
  await actor();
  const plan = preparePropertyAcceptance(
    orgs.map((organization_id, i) => ({
      organization_id,
      customer_id: customers[i],
      location_id: locations[i],
      job_id: jobs[i],
      estimate_version_id: versions[i].version.id,
      material_line_id: versions[i].version.payload.lines[0].id,
      expense_id: null,
      job_revision: revisions[i],
      existing_material_reviews: 0,
      net_approved_cost_minor: 10001,
      currency: 'USD',
      quoted_at: '2026-10-16T12:00:00Z',
      quote_expires_at: '2026-11-16T12:00:00Z',
      baseline_fingerprints: { original: 'a'.repeat(32) },
    })),
    'local-p0-compiled',
  );
  await rpc('assign_job', [orgs[0], jobs[0], field, true]);
  for (let i = 0; i < 3; i++) {
    const results = new Map<string, unknown>();
    const resolve = (v: unknown): unknown => {
      if (v && typeof v === 'object' && 'result' in v && 'field' in v) {
        const ref = v as { result: string; field: string };
        const value = results.get(ref.result);
        return ref.field === '$value'
          ? value
          : (value as Record<string, unknown>)[ref.field];
      }
      if (Array.isArray(v)) return v.map(resolve);
      if (v && typeof v === 'object')
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, resolve(x)]),
        );
      return v;
    };
    for (const step of plan.companies[i].steps) {
      await actor(
        db,
        i === 0 && step.actor === 'assigned-field'
          ? field
          : i === 0 && step.actor === 'estimator'
            ? estimator
            : owners[i],
        i > 0 || step.actor === 'owner' ? 'aal2' : 'aal1',
      );
      try {
        results.set(
          step.id,
          await rpc(step.rpc, Object.values(step.args).map(resolve)),
        );
      } catch (error) {
        throw new Error(`Compiled fixture ${i}:${step.id} failed`, {
          cause: error,
        });
      }
    }
    await db.exec('reset role');
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int n from private.inspection_reports where organization_id=$1',
          [orgs[i]],
        )
      ).rows[0].n,
    ).toBe(reportCounts[i] + 4);
    expect(
      (
        await db.query<{ selling_minor: number }>(
          'select selling_minor from private.supplemental_invoice_drafts where organization_id=$1 and decision_id=$2',
          [orgs[i], (results.get('decision-proposed') as { id: string }).id],
        )
      ).rows[0].selling_minor,
    ).toBe(11251);
    expect(
      (
        await db.query<{ lock_revision: number }>(
          'select lock_revision from jobs where organization_id=$1 and id=$2',
          [orgs[i], jobs[i]],
        )
      ).rows[0].lock_revision,
    ).toBe(revisions[i] + 5);
  }
});

it.each(['banned', 'deleted', 'anonymous'])(
  'customer audit: a %s confirmed identity cannot read an issued estimate',
  async (state) => {
    await estimateAccess();
    if (state === 'banned')
      await db.query(
        "update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=$1",
        [reportUsers[0]],
      );
    if (state === 'deleted')
      await db.query(
        'update auth.users set deleted_at=clock_timestamp() where id=$1',
        [reportUsers[0]],
      );
    if (state === 'anonymous')
      await db.query('update auth.users set is_anonymous=true where id=$1', [
        reportUsers[0],
      ]);
    await actor(db, reportUsers[0], 'aal1');
    await denied('select public.customer_estimate_review($1,$2,$3,$4)', [
      orgs[0],
      customers[0],
      locations[0],
      versions[0].version.id,
    ]);
  },
);
it.skipIf(!db.fork).each(['staff', 'platform'])(
  'customer audit native: %s role promotion while report discovery waits must deny discovery',
  async (promotion) => {
    await db.exec('rollback;reset role');
    const customerActor = uid();
    const session = uid();
    sessions.set(customerActor, session);
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [customerActor, customerActor + '@example.test'],
    );
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      session,
      customerActor,
    ]);
    await db.query('insert into portal_identities values($1,$2,$3,true)', [
      orgs[2],
      customers[2],
      customerActor,
    ]);
    await db.query(
      "insert into private.property_report_access(organization_id,customer_id,location_id,user_id,expires_at,approval_reference) values($1,$2,$3,$4,clock_timestamp()+interval '10 minutes','LOCAL AUDIT ONLY')",
      [orgs[2], customers[2], locations[2], customerActor],
    );
    await db.exec('reset role;begin');
    await db.query(
      'select id from private.property_report_access where user_id=$1 for update',
      [customerActor],
    );
    const peer = await db.fork!();
    try {
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      await actor(peer, customerActor, 'aal1');
      const pending = peer
        .query('select public.customer_portal_discover()')
        .then(
          () => false,
          () => true,
        );
      await blocked(db, pid);
      if (promotion === 'staff')
        await db.query(
          "insert into memberships(organization_id,user_id,role) values($1,$2,'staff')",
          [orgs[2], customerActor],
        );
      else
        await db.query(
          'insert into private.platform_admins(user_id,active) values($1,true)',
          [customerActor],
        );
      await db.exec('commit');
      expect(await pending).toBe(true);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
it.skipIf(!db.fork)(
  'customer workflow native: concurrent opposing decisions persist once with one audit and immutable source',
  async () => {
    await db.exec('rollback;reset role');
    await estimateAccess(0);
    const peers = await Promise.all([db.fork!(), db.fork!()]);
    try {
      await Promise.all(peers.map((d) => actor(d, reportUsers[0], 'aal1')));
      const outcomes = await Promise.allSettled(
        peers.map((d, i) =>
          recordReview(0, i ? 'decline_review' : 'approve_review', uid(), d),
        ),
      );
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
      expect(
        (
          await db.query(
            'select count(*) n from private.customer_review_decisions where organization_id=$1',
            [orgs[0]],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await db.query(
            "select count(*) n from activity_events where organization_id=$1 and entity_type='customer_review_decisions'",
            [orgs[0]],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await Promise.all(peers.map((p) => p.close()));
    }
  },
);
it.skipIf(!db.fork).each(['session', 'publication', 'jwt'])(
  'customer workflow native: %s expires while decision waits, no preference or audit is inserted',
  async (expiring) => {
    await db.exec('rollback;reset role');
    // Existing baseline native cases use customer0; choose a fresh authorized customer user.
    const user = uid(),
      session = uid();
    sessions.set(user, session);
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [user, user + '@example.test'],
    );
    await db.query(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+case when $3 then interval '2 seconds' else interval '1 hour' end)",
      [session, user, expiring === 'session'],
    );
    await db.query('insert into portal_identities values($1,$2,$3,true)', [
      orgs[1],
      customers[1],
      user,
    ]);
    await actor(db, owners[1]);
    const p = {
      customer_id: customers[1],
      location_id: locations[1],
      user_id: user,
      version_id: versions[1].version.id,
      source_report_id: null,
      finding_id: null,
      source_line_id: null,
    };
    const preview = await rpc<{ scope_sha256: string }>(
      'customer_publication_preview',
      [orgs[1], p],
    );
    const pub = await rpc<{ publication_id: string }>(
      'customer_publish_estimate',
      [
        orgs[1],
        {
          ...p,
          scope_sha256: preview.scope_sha256,
          request_id: uid(),
          expires_at: new Date(
            Date.now() + (expiring === 'publication' ? 2000 : 600000),
          ).toISOString(),
          review_acknowledged: true,
          approval_reference: 'LOCAL expiry test',
        },
      ],
    );
    await db.exec('reset role;begin');
    await db.query(
      'select id from private.customer_estimate_access where id=$1 for update',
      [pub.publication_id],
    );
    const peer = await db.fork!();
    try {
      await actor(peer, user, 'aal1');
      if (expiring === 'jwt')
        await peer.query("select set_config('request.jwt.claims',$1,false)", [
          JSON.stringify({
            sub: user,
            session_id: session,
            aal: 'aal1',
            exp: Math.floor(Date.now() / 1000) + 2,
          }),
        ]);
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      const pending = peer
        .query('select public.customer_record_decision($1,$2,$3,$4,$5,$6)', [
          orgs[1],
          pub.publication_id,
          preview.scope_sha256,
          'approve_review',
          'review-only-v1',
          uid(),
        ])
        .then(
          () => false,
          () => true,
        );
      await blocked(db, pid);
      await db.exec('select pg_sleep(2.1);commit');
      expect(await pending).toBe(true);
      expect(
        (
          await db.query(
            'select count(*) n from private.customer_review_decisions where user_id=$1',
            [user],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);

it.skipIf(!db.fork)(
  'customer workflow native: publisher JWT expires during issued-version lock wait, no publication or audit',
  async () => {
    await db.exec('rollback;reset role');
    const staff = uid(),
      session = uid(),
      customer = uid();
    sessions.set(staff, session);
    for (const user of [staff, customer])
      await db.query(
        'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
        [user, user + '@example.test'],
      );
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      session,
      staff,
    ]);
    await db.query(
      "insert into memberships(organization_id,user_id,role) values($1,$2,'admin')",
      [orgs[0], staff],
    );
    await db.query('insert into portal_identities values($1,$2,$3,true)', [
      orgs[0],
      customers[0],
      customer,
    ]);
    await actor(db, staff);
    const p = {
      customer_id: customers[0],
      location_id: locations[0],
      user_id: customer,
      version_id: versions[0].version.id,
      source_report_id: null,
      finding_id: null,
      source_line_id: null,
    };
    const preview = await rpc<{ scope_sha256: string }>(
      'customer_publication_preview',
      [orgs[0], p],
    );
    const request = uid();
    await db.exec('reset role;begin');
    await db.query('select id from estimate_versions where id=$1 for update', [
      versions[0].version.id,
    ]);
    const peer = await db.fork!();
    try {
      await actor(peer, staff);
      await peer.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({
          sub: staff,
          session_id: session,
          aal: 'aal2',
          exp: Math.floor(Date.now() / 1000) + 2,
        }),
      ]);
      const pid = Number(
        (await peer.query('select pg_backend_pid() id')).rows[0].id,
      );
      const pending = peer
        .query('select public.customer_publish_estimate($1,$2)', [
          orgs[0],
          {
            ...p,
            scope_sha256: preview.scope_sha256,
            request_id: request,
            expires_at: new Date(Date.now() + 600000).toISOString(),
            review_acknowledged: true,
            approval_reference: 'LOCAL publisher expiry',
          },
        ])
        .then(
          () => false,
          () => true,
        );
      await blocked(db, pid);
      await db.exec('select pg_sleep(2.1);commit');
      expect(await pending).toBe(true);
      expect(
        (
          await db.query(
            'select count(*) n from private.customer_estimate_access where request_id=$1',
            [request],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await db.query(
            "select count(*) n from activity_events where actor_id=$1 and entity_type='customer_estimate_access'",
            [staff],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await db.exec('rollback');
      await peer.close();
    }
  },
);
