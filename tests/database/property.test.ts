import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
const db = createTestDatabase();
const uid = () => crypto.randomUUID();
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
async function actor(d: TestDatabase = db, user = owners[0], aal = 'aal2') {
  await d.exec('reset role');
  await d.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: user, aal }),
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
  await db.exec(readFileSync('server/property/schema.proposed.sql', 'utf8'));
  for (const u of [...owners, field, estimator])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
      [u, `${u}@example.test`],
    );
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
