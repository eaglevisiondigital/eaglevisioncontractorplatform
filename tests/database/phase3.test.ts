import { createTestDatabase } from './engine';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
import {
  blankEstimate,
  calculateEstimate,
} from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { syntheticMaterials } from '../../src/domain/materials/fixtures';
import {
  preparePayroll,
  type Worker,
  type LaborRate,
  type TimeEntry,
  type WorkforcePolicy,
  type PayrollRow,
} from '../../src/domain/workforce/payroll';
const db = createTestDatabase();
const id = (n: number) =>
  `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  other = id(2),
  owner = id(3),
  otherOwner = id(4),
  estimator = id(5),
  field = id(6),
  supervisor = id(7),
  stranger = id(8),
  customer = id(9),
  otherCustomer = id(10),
  worker = id(11),
  otherWorker = id(12);
async function asUser(user: string | null = owner, aal = 'aal2') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(user ? { sub: user, aal } : {}),
  ]);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
}
async function call<T = unknown>(name: string, args: unknown[] = []) {
  return (
    await db.query<{ value: T }>(
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`,
      args.map((v) => (Array.isArray(v) ? JSON.stringify(v) : v)),
    )
  ).rows[0].value;
}
async function denied(sql: string, args: unknown[] = []) {
  await db.exec('savepoint attack');
  try {
    await expect(db.query(sql, args)).rejects.toThrow();
  } finally {
    await db.exec('rollback to savepoint attack;release savepoint attack');
  }
}
const p = () => {
  const p = blankEstimate(customer);
  p.tax_policy_id = id(13);
  p.expires_on = '2030-01-01';
  p.lines[0] = {
    ...p.lines[0],
    description: 'Fence panels',
    quantity_milli: 12000,
    unit_cost_minor: 6825,
    unit_price_minor: null,
    markup_bps: 2000,
    unit: 'each',
  };
  return p;
};
async function create() {
  return call<EstimateBundle>('create_estimate', [
    org,
    p(),
    crypto.randomUUID(),
  ]);
}
async function issued() {
  const b = await create();
  return call<EstimateBundle>('issue_estimate', [
    org,
    b.estimate.id,
    b.version.id,
    b.version.lock_revision,
  ]);
}
async function job() {
  const b = await issued();
  return call<string>('approve_job', [org, b.version.id]);
}
const policy = {
  timezone: 'America/Chicago',
  week_start: 7,
  overtime_after_seconds: 144000,
  overtime_multiplier_bps: 15000,
  review_reference: 'Synthetic independently reviewed test policy',
  overhead_centers: ['Administration', 'Purchasing'],
};
const rate = {
  effective_from: '2026-01-01T00:00:00Z',
  cash_hour_minor: 2800,
  salary_week_minor: 0,
  burden_bps: 2000,
  estimated_loaded_hour_minor: 3600,
  billing_hour_minor: 6500,
  imputed_hour_minor: 0,
  overtime_eligible: true,
  classification_review_reference: 'Synthetic classification and rate review',
};
function entry(
  start = '2026-10-05T13:00:00Z',
  end: string | null = '2026-10-05T21:00:00Z',
) {
  return {
    job_id: null,
    overhead_center: 'Administration',
    task: 'Synthetic bookkeeping',
    kind: 'work',
    started_at: start,
    ended_at: end,
    billable: false,
    corrects_id: null,
  };
}
function expense() {
  return {
    purchase_key: 'PO-001',
    supplier: 'Synthetic Supply',
    reference: crypto.randomUUID(),
    category: 'materials',
    kind: 'payment',
    amount_minor: 10000,
    description: 'Fence panels',
    estimate_line_id: null,
    quantity_milli: null,
    unit: null,
    unit_cost_minor: null,
    document_ids: [],
    material_approval_id: null,
    adjusts_expense_id: null,
  };
}
async function approveTime(e: Record<string, unknown> = entry()) {
  await asUser(field, 'aal1');
  const tid = await call<string>('record_time', [org, worker, e]);
  await call('submit_time', [org, tid]);
  await asUser(owner);
  await call('review_time', [
    org,
    tid,
    'approved',
    'Synthetic supervisor review',
  ]);
  return tid;
}
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  for (const uid of [owner, otherOwner, estimator, field, supervisor, stranger])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
      [uid, `${uid}@example.test`],
    );
  for (const [oid, name, slug] of [
    [org, 'Synthetic A', 'test-a'],
    [other, 'Synthetic B', 'test-b'],
  ])
    await db.query(
      "insert into organizations(id,name,slug,industry,status) values($1,$2,$3,'construction','active')",
      [oid, name, slug],
    );
  await db.query(
    "insert into memberships(organization_id,user_id,role,staff_type) values($1,$2,'owner','office_manager'),($3,$4,'owner','office_manager'),($1,$5,'staff','estimator'),($1,$6,'staff','field_staff'),($1,$7,'staff','office_manager')",
    [org, owner, other, otherOwner, estimator, field, supervisor],
  );
  await db.query(
    "insert into customers(id,organization_id,display_name,customer_type) values($1,$2,'Synthetic A Customer','residential'),($3,$4,'Synthetic B Customer','residential')",
    [customer, org, otherCustomer, other],
  );
  await db.query(
    "insert into estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Synthetic zero tax','Synthetic review','Synthetic jurisdiction','Synthetic contract',0,'reviewed')",
    [id(13), org],
  );
  await db.query(
    'insert into workforce_policies(organization_id,timezone,week_start,overtime_after_seconds,overtime_multiplier_bps,review_reference,overhead_centers) values($1,$2,$3,$4,$5,$6,$7)',
    [
      org,
      policy.timezone,
      7,
      144000,
      15000,
      policy.review_reference,
      policy.overhead_centers,
    ],
  );
  await db.query(
    "insert into worker_profiles(id,organization_id,user_id,display_name,worker_type,cost_source) values($1,$2,$3,'Synthetic field','w2_hourly','time'),($4,$5,$6,'Other worker','w2_hourly','time')",
    [worker, org, field, otherWorker, other, otherOwner],
  );
  await db.query(
    'insert into labor_rates(organization_id,worker_id,effective_from,cash_hour_minor,salary_week_minor,burden_bps,estimated_loaded_hour_minor,billing_hour_minor,imputed_hour_minor,overtime_eligible,classification_review_reference) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [org, worker, ...Object.values(rate)],
  );
});
beforeEach(async () => {
  await db.exec('begin');
  await asUser();
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(() => db.close());
it('server calculates exact estimate values and idempotent creation', async () => {
  const input = p(),
    key = crypto.randomUUID();
  const a = await call<EstimateBundle>('create_estimate', [org, input, key]);
  const b = await call<EstimateBundle>('create_estimate', [org, input, key]);
  expect(a.estimate.id).toBe(b.estimate.id);
  expect(a.version.calculation).toEqual(calculateEstimate(input));
  expect((await create()).estimate.estimate_number).not.toBe(
    a.estimate.estimate_number,
  );
});
it('denies idempotency key reuse with changed pricing', async () => {
  const key = crypto.randomUUID();
  await call('create_estimate', [org, p(), key]);
  const next = p();
  next.lines[0].unit_cost_minor++;
  await denied('select create_estimate($1,$2,$3)', [org, next, key]);
});
it.each([otherOwner, field, stranger, null])(
  'denies estimate creation by unauthorized actor %s',
  async (user) => {
    await asUser(user, 'aal1');
    await denied('select create_estimate($1,$2,$3)', [
      org,
      p(),
      crypto.randomUUID(),
    ]);
  },
);
it('allows estimator drafts but denies internal issue and payroll data', async () => {
  await asUser(estimator, 'aal1');
  const b = await create();
  await denied('select issue_estimate($1,$2,$3,$4)', [
    org,
    b.estimate.id,
    b.version.id,
    1,
  ]);
  expect((await db.query('select * from labor_rates')).rows).toHaveLength(0);
});
it('denies owner AAL1 and revoked estimator tokens', async () => {
  await asUser(owner, 'aal1');
  await denied('select create_estimate($1,$2,$3)', [
    org,
    p(),
    crypto.randomUUID(),
  ]);
  await db.exec('reset role');
  await db.query(
    'update memberships set active=false where organization_id=$1 and user_id=$2',
    [org, estimator],
  );
  await asUser(estimator, 'aal2');
  await denied('select create_estimate($1,$2,$3)', [
    org,
    p(),
    crypto.randomUUID(),
  ]);
});
it('denies disabled-module estimating', async () => {
  await db.exec('reset role');
  await db.query(
    "update company_modules set enabled=false where organization_id=$1 and module='estimates'",
    [org],
  );
  await asUser();
  await denied('select create_estimate($1,$2,$3)', [
    org,
    p(),
    crypto.randomUUID(),
  ]);
});
it('rejects cross-tenant customer, catalog and attachment references', async () => {
  const input = p();
  input.customer_id = otherCustomer;
  await denied('select create_estimate($1,$2,$3)', [
    org,
    input,
    crypto.randomUUID(),
  ]);
  input.customer_id = customer;
  input.lines[0].catalog_item_id = crypto.randomUUID();
  await denied('select create_estimate($1,$2,$3)', [
    org,
    input,
    crypto.randomUUID(),
  ]);
  input.lines[0].catalog_item_id = null;
  input.attachments = [
    { document_id: crypto.randomUUID(), customer_visible: true },
  ];
  await denied('select create_estimate($1,$2,$3)', [
    org,
    input,
    crypto.randomUUID(),
  ]);
});
it('denies stale draft updates and preserves previous value', async () => {
  const b = await create();
  const next = p();
  next.project.name = 'Updated project';
  const saved = await call<EstimateBundle>('save_estimate', [
    org,
    b.estimate.id,
    b.version.id,
    1,
    next,
  ]);
  expect(saved.version.lock_revision).toBe(2);
  await denied('select save_estimate($1,$2,$3,$4,$5)', [
    org,
    b.estimate.id,
    b.version.id,
    1,
    p(),
  ]);
});
it('issued versions and children remain immutable through new revisions', async () => {
  const b = await issued();
  await denied('select save_estimate($1,$2,$3,$4,$5)', [
    org,
    b.estimate.id,
    b.version.id,
    1,
    p(),
  ]);
  await db.exec('reset role');
  await denied('update estimate_versions set payload=$1 where id=$2', [
    p(),
    b.version.id,
  ]);
  await denied("update estimate_lines set content='{}' where version_id=$1", [
    b.version.id,
  ]);
  await asUser();
  const r = await call<EstimateBundle>('revise_estimate', [
    org,
    b.estimate.id,
    b.version.id,
  ]);
  expect(r.version.version_number).toBe(2);
  expect(r.version.supersedes_version_id).toBe(b.version.id);
  expect(
    (
      await db.query('select payload from estimate_versions where id=$1', [
        b.version.id,
      ])
    ).rows[0].payload,
  ).toEqual(b.version.payload);
});
it('rejects cross-tenant reads across all estimate and import records', async () => {
  await create();
  await asUser(otherOwner);
  for (const table of [
    'estimates',
    'estimate_versions',
    'estimate_lines',
    'estimate_options',
    'estimate_schedule_proposals',
    'estimate_attachments',
    'material_import_batches',
    'material_import_sources',
    'material_import_approvals',
  ])
    expect(
      (await db.query(`select * from ${table} where organization_id=$1`, [org]))
        .rows,
    ).toHaveLength(0);
});
it('forged import approvals cannot enter a draft', async () => {
  const b = await create();
  const input = p();
  input.lines[0].import_approval_id = crypto.randomUUID();
  input.lines[0].material_import_line_ids = [crypto.randomUUID()];
  await denied('select save_estimate($1,$2,$3,$4,$5)', [
    org,
    b.estimate.id,
    b.version.id,
    1,
    input,
  ]);
});
async function materialBatch() {
  const b = await create();
  const review = syntheticMaterials();
  const files = review.sources.map((s) => ({
    filename: s.filename,
    mime: s.filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    byte_size: 100,
    sha256: s.sha256,
  }));
  const batch = await call<{
    batch_id: string;
    sources: { id: string; sha256: string }[];
  }>('begin_material_import', [org, b.estimate.id, files]);
  await db.exec('reset role');
  for (const source of batch.sources) {
    const original = review.sources.find((s) => s.sha256 === source.sha256)!;
    const old = original.id;
    original.id = source.id;
    review.lines
      .filter((l) => l.source_id === old)
      .forEach((l) => (l.source_id = source.id));
    await db.query(
      "update material_import_sources set status='clean',provenance='synthetic_fixture',scan_evidence=$1,extraction=$2 where id=$3",
      [
        { verdict: 'clean', sha256: source.sha256, engine: 'synthetic' },
        original.extraction,
        source.id,
      ],
    );
  }
  await asUser();
  return { b, batch, review };
}
it('quarantines sources; clients cannot mark clean, read objects or extract', async () => {
  const b = await create();
  const batch = await call<{ batch_id: string }>('begin_material_import', [
    org,
    b.estimate.id,
    [
      {
        filename: 'quote.pdf',
        mime: 'application/pdf',
        byte_size: 100,
        sha256: 'a'.repeat(64),
      },
    ],
  ]);
  await denied(
    "update material_import_sources set status='clean' where batch_id=$1",
    [batch.batch_id],
  );
  await denied('select approve_material_import($1,$2,$3,$4)', [
    org,
    batch.batch_id,
    1,
    { ...syntheticMaterials(), reviewed: true },
  ]);
  expect(
    (
      await db.query(
        "select * from storage.objects where bucket_id='material-quarantine'",
      )
    ).rows,
  ).toHaveLength(0);
  await denied(
    "insert into storage.objects(bucket_id,name) values('material-quarantine',$1)",
    [`${org}/${crypto.randomUUID()}`],
  );
});
it('requires per-line acknowledgement and preserves approved provenance', async () => {
  const { b, batch, review } = await materialBatch();
  review.reviewed = true;
  await denied('select approve_material_import($1,$2,$3,$4)', [
    org,
    batch.batch_id,
    1,
    review,
  ]);
  review.lines.forEach((l) => (l.acknowledged = true));
  const approval = await call<{ approval_id: string; price_minor: number }>(
    'approve_material_import',
    [org, batch.batch_id, 1, review],
  );
  expect(approval.price_minor).toBe(108720);
  const applied = await call<EstimateBundle>('apply_material_import', [
    org,
    b.estimate.id,
    b.version.id,
    1,
    approval.approval_id,
  ]);
  expect(applied.version.payload.lines).toHaveLength(3);
  expect(applied.version.payload.lines[1].import_approval_id).toBe(
    approval.approval_id,
  );
  await denied('select issue_estimate($1,$2,$3,$4)', [
    org,
    b.estimate.id,
    b.version.id,
    2,
  ]);
  await denied('select apply_material_import($1,$2,$3,$4,$5)', [
    org,
    b.estimate.id,
    b.version.id,
    2,
    approval.approval_id,
  ]);
  await db.exec('reset role');
  await denied(
    'update material_import_approvals set price_minor=1 where id=$1',
    [approval.approval_id],
  );
});
it('rejects forged source rows, currencies and cross-tenant batch approval', async () => {
  const { batch, review } = await materialBatch();
  review.reviewed = true;
  review.lines.forEach((l) => (l.acknowledged = true));
  review.lines[0].source_id = crypto.randomUUID();
  await denied('select approve_material_import($1,$2,$3,$4)', [
    org,
    batch.batch_id,
    1,
    review,
  ]);
  await asUser(otherOwner);
  await denied('select approve_material_import($1,$2,$3,$4)', [
    org,
    batch.batch_id,
    1,
    review,
  ]);
});
it('job baseline is immutable and cross-tenant reports are denied', async () => {
  const jid = await job();
  await db.exec('reset role');
  await denied("update jobs set baseline='{}' where id=$1", [jid]);
  await asUser(otherOwner);
  expect(
    (await db.query('select * from jobs where id=$1', [jid])).rows,
  ).toHaveLength(0);
  await denied('select job_labor_summary($1,$2)', [org, jid]);
});
it('field expenses require assignment and expose no budgets or payroll rates', async () => {
  const jid = await job();
  await asUser(field, 'aal1');
  await denied('select submit_job_expense($1,$2,$3)', [org, jid, expense()]);
  await asUser();
  await call('assign_job', [org, jid, field, true]);
  await asUser(field, 'aal1');
  await call('submit_job_expense', [org, jid, expense()]);
  expect((await db.query('select * from jobs')).rows).toHaveLength(0);
  expect((await db.query('select * from labor_rates')).rows).toHaveLength(0);
  const labels = await call<unknown[]>('assigned_job_labels', [org]);
  expect(labels).toHaveLength(1);
  expect(JSON.stringify(labels)).not.toMatch(/baseline|cost|revenue/);
});
it('duplicate supplier references and duplicate review are rejected', async () => {
  const jid = await job();
  const e = expense();
  const eid = await call<string>('submit_job_expense', [org, jid, e]);
  await denied('select submit_job_expense($1,$2,$3)', [org, jid, e]);
  await call('review_job_expense', [org, jid, eid, 'approved', 'Reviewed']);
  await denied('select review_job_expense($1,$2,$3,$4,$5)', [
    org,
    jid,
    eid,
    'approved',
    'Again',
  ]);
});
it('direct financial mutations and field approval are denied', async () => {
  const jid = await job();
  const eid = await call<string>('submit_job_expense', [org, jid, expense()]);
  await denied('update job_expenses set amount_minor=1 where id=$1', [eid]);
  await asUser(field, 'aal1');
  await denied('select review_job_expense($1,$2,$3,$4,$5)', [
    org,
    jid,
    eid,
    'approved',
    'Forged',
  ]);
});
it('proposed changes do not authorize billing and require manager reference', async () => {
  const jid = await job();
  const cid = await call<string>('propose_job_change', [
    org,
    jid,
    {
      description: 'Gate addition',
      revenue_minor: 50000,
      cost_minor: 30000,
      category: 'materials',
      status: 'proposed',
    },
  ]);
  expect(
    (await db.query('select * from job_change_approvals')).rows,
  ).toHaveLength(0);
  await denied('select approve_job_change($1,$2,$3)', [org, cid, '']);
  await asUser(estimator, 'aal1');
  await denied('select approve_job_change($1,$2,$3)', [org, cid, 'Forged']);
  await asUser();
  await call('approve_job_change', [
    org,
    cid,
    'Synthetic exact scope authorization reference',
  ]);
  expect(
    (await db.query('select * from job_change_approvals')).rows,
  ).toHaveLength(1);
});
it('job forecast rejects stale optimistic revisions', async () => {
  const jid = await job();
  const projection = {
    remaining: {
      materials: 1,
      labor: 2,
      subcontractors: 0,
      equipment: 0,
      other: 0,
    },
    overrun_bps: 1000,
    erosion_bps: 500,
    costs_complete: false,
  };
  await call('update_job_projection', [org, jid, 1, projection]);
  await denied('select update_job_projection($1,$2,$3,$4)', [
    org,
    jid,
    1,
    projection,
  ]);
});
it('denies double-counting direct labor expenses', async () => {
  const jid = await job();
  await denied('select submit_job_expense($1,$2,$3)', [
    org,
    jid,
    { ...expense(), category: 'labor' },
  ]);
});
it('own time is visible; other workers and payroll-sensitive rates are isolated', async () => {
  await asUser(field, 'aal1');
  expect(
    (await db.query('select id from worker_profiles')).rows.map((r) => r.id),
  ).toEqual([worker]);
  expect((await db.query('select * from labor_rates')).rows).toHaveLength(0);
  await denied('select record_time($1,$2,$3)', [other, otherWorker, entry()]);
  await denied('select prepare_payroll($1,$2,$3,$4,$5)', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    false,
  ]);
});
it('rejects overlapping entries, timestamps without offsets and long segments', async () => {
  await asUser(field, 'aal1');
  await call('record_time', [org, worker, entry()]);
  await denied('select record_time($1,$2,$3)', [
    org,
    worker,
    entry('2026-10-05T14:00:00Z', '2026-10-05T15:00:00Z'),
  ]);
  await denied('select record_time($1,$2,$3)', [
    org,
    worker,
    entry('2026-10-06T13:00:00', '2026-10-06T14:00:00Z'),
  ]);
  await denied('select record_time($1,$2,$3)', [
    org,
    worker,
    entry('2026-10-06T13:00:00Z', '2026-10-07T13:00:00Z'),
  ]);
});
it('worker cannot record on unassigned jobs or unapproved overhead', async () => {
  const jid = await job();
  await asUser(field, 'aal1');
  await denied('select record_time($1,$2,$3)', [
    org,
    worker,
    { ...entry(), job_id: jid, overhead_center: null },
  ]);
  await denied('select record_time($1,$2,$3)', [
    org,
    worker,
    { ...entry(), overhead_center: 'Unauthorized' },
  ]);
});
it('time submission is immutable and only assigned supervisors can review', async () => {
  await asUser(field, 'aal1');
  const eid = await call<string>('record_time', [org, worker, entry()]);
  await call('submit_time', [org, eid]);
  await denied('select review_time($1,$2,$3,$4)', [
    org,
    eid,
    'approved',
    'Self approval',
  ]);
  await asUser(supervisor, 'aal1');
  await denied('select review_time($1,$2,$3,$4)', [
    org,
    eid,
    'approved',
    'Unassigned',
  ]);
  await asUser();
  await call('assign_supervisor', [org, worker, supervisor, true]);
  await asUser(supervisor, 'aal1');
  expect((await db.query('select * from time_entries')).rows).toHaveLength(1);
  expect((await db.query('select * from labor_rates')).rows).toHaveLength(0);
  await call('review_time', [
    org,
    eid,
    'approved',
    'Assigned supervisor review',
  ]);
  await db.exec('reset role');
  await denied(
    "update time_entries set ended_at=ended_at+interval '1 hour' where id=$1",
    [eid],
  );
});
it('revoked membership or supervisor assignment immediately denies access', async () => {
  await asUser();
  await call('assign_supervisor', [org, worker, supervisor, true]);
  const eid = await approveTime();
  await call('assign_supervisor', [org, worker, supervisor, false]);
  await asUser(supervisor, 'aal1');
  expect((await db.query('select * from time_entries')).rows).toHaveLength(0);
  await db.exec('reset role');
  await db.query(
    'update memberships set active=false where organization_id=$1 and user_id=$2',
    [org, field],
  );
  await asUser(field, 'aal1');
  await denied('select record_time($1,$2,$3)', [
    org,
    worker,
    entry('2026-10-06T13:00:00Z', '2026-10-06T14:00:00Z'),
  ]);
  expect(eid).toBeTruthy();
});
it('payroll combines overtime over jobs, matches TS, and locks costs once', async () => {
  for (let d = 5; d <= 9; d++)
    await approveTime(
      entry(`2026-10-0${d}T13:00:00Z`, `2026-10-0${d}T22:00:00Z`),
    );
  const preview = await call<{ rows: PayrollRow[] }>('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    false,
  ]);
  expect(preview.rows.reduce((s, r) => s + r.overtime_seconds, 0)).toBe(18000);
  const es = (
    await db.query('select * from time_entries order by started_at')
  ).rows.map((e) => ({
    ...e,
    started_at: new Date(e.started_at as string).toISOString(),
    ended_at: new Date(e.ended_at as string).toISOString(),
  })) as unknown as TimeEntry[];
  const ws = (
    await db.query('select * from worker_profiles where id=$1', [worker])
  ).rows as unknown as Worker[];
  const rs = (await db.query('select * from labor_rates')).rows.map((r) => ({
    ...r,
    effective_from: new Date(r.effective_from as string).toISOString(),
  })) as unknown as LaborRate[];
  const calculated = preparePayroll(
    ws,
    rs,
    es,
    es.map((e) => ({
      entry_id: e.id,
      decision: 'approved',
      reason: 'Reviewed',
    })),
    policy as WorkforcePolicy,
  );
  expect(preview.rows.map((r) => r.cash_minor)).toEqual(
    calculated.map((r) => r.cash_minor),
  );
  await call('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    true,
  ]);
  await denied('select prepare_payroll($1,$2,$3,$4,$5)', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    true,
  ]);
  await asUser(field, 'aal1');
  await denied('select record_time($1,$2,$3)', [
    org,
    worker,
    entry('2026-10-10T13:00:00Z', '2026-10-10T15:00:00Z'),
  ]);
});
it('unreviewed or open time blocks period locking', async () => {
  await asUser(field, 'aal1');
  await call('record_time', [org, worker, entry()]);
  await asUser();
  await denied('select prepare_payroll($1,$2,$3,$4,$5)', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    true,
  ]);
});
it('corrections append to approved unlocked time; original remains unchanged', async () => {
  const eid = await approveTime();
  await asUser(field, 'aal1');
  const correction = await call<string>('record_time', [
    org,
    worker,
    {
      ...entry('2026-10-05T13:00:00Z', '2026-10-05T17:00:00Z'),
      corrects_id: eid,
    },
  ]);
  await call('submit_time', [org, correction]);
  await asUser();
  await call('review_time', [
    org,
    correction,
    'approved',
    'Corrected after supervisor review',
  ]);
  const preview = await call<{ rows: PayrollRow[] }>('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    false,
  ]);
  expect(preview.rows.reduce((s, r) => s + r.regular_seconds, 0)).toBe(14400);
  expect((await db.query('select * from time_entries')).rows).toHaveLength(2);
});
it('payroll adjustment is append-only, later-dated and restricted', async () => {
  const eid = await approveTime();
  const locked = await call<{ period_id: string }>('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    true,
  ]);
  const adjustment = {
    source_period_id: locked.period_id,
    entry_id: eid,
    effective_at: '2026-10-12T13:00:00Z',
    cash_minor: 100,
    burden_minor: 20,
    imputed_minor: 0,
    reason: 'Synthetic correction after locked preparation',
  };
  await call('adjust_payroll', [org, adjustment]);
  await db.exec('reset role');
  await denied('delete from payroll_adjustments');
  await asUser(field, 'aal1');
  await denied('select adjust_payroll($1,$2)', [org, adjustment]);
});
it('SQL and TypeScript agree over varied quantities, discounts, taxes and schedules', async () => {
  await db.exec('reset role');
  for (let n = 1; n <= 40; n++) {
    const input = p();
    input.lines[0].quantity_milli = 997 * n;
    input.lines[0].unit_cost_minor = 123 + n;
    input.lines[0].markup_bps = n * 57;
    input.lines[0].taxable = n % 2 === 0;
    input.lines[0].fixed_markup_minor = n;
    input.discount = { kind: 'percent', value: n * 31 };
    const calc = (
      await db.query<{ value: unknown }>(
        'select private.calculate_estimate($1,$2) value',
        [input, n * 13],
      )
    ).rows[0].value;
    expect(calc).toEqual(calculateEstimate(input, n * 13));
  }
});
it('salary allocation reconciles exact weekly minor units', async () => {
  await db.exec('reset role');
  await db.query(
    "update worker_profiles set worker_type='salaried' where id=$1",
    [worker],
  );
  await db.exec('alter table labor_rates disable trigger immutable_record');
  await db.query(
    'update labor_rates set salary_week_minor=10000,overtime_eligible=false where worker_id=$1',
    [worker],
  );
  await db.exec('alter table labor_rates enable trigger immutable_record');
  for (let d = 5; d <= 7; d++)
    await approveTime(
      entry(`2026-10-0${d}T13:00:00Z`, `2026-10-0${d}T14:00:00Z`),
    );
  const preview = await call<{ rows: PayrollRow[] }>('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    false,
  ]);
  expect(preview.rows.map((r) => r.cash_minor)).toEqual([3333, 3333, 3334]);
});
it('time-costed contractor invoices are denied to prevent duplicate labor costs', async () => {
  const jid = await job();
  await denied('select submit_job_expense($1,$2,$3)', [
    org,
    jid,
    { ...expense(), category: 'subcontractors', labor_worker_id: worker },
  ]);
});
it('later locked-period corrections appear in the next preparation exactly once', async () => {
  const eid = await approveTime(
    entry('2026-09-28T13:00:00Z', '2026-09-28T21:00:00Z'),
  );
  const locked = await call<{ period_id: string }>('prepare_payroll', [
    org,
    '2026-09-27T05:00:00Z',
    '2026-10-04T05:00:00Z',
    {},
    true,
  ]);
  await call('adjust_payroll', [
    org,
    {
      source_period_id: locked.period_id,
      entry_id: eid,
      effective_at: '2026-10-05T13:00:00Z',
      cash_minor: -100,
      burden_minor: -20,
      imputed_minor: 0,
      reason: 'Synthetic correction',
    },
  ]);
  const next = await call<{ rows: PayrollRow[] }>('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    false,
  ]);
  expect(next.rows).toHaveLength(1);
  expect(next.rows[0].cash_minor).toBe(-100);
});
it('reviewed receipt imports retain supplier rows and reject duplicate job source digests', async () => {
  const jid = await job();
  const review = syntheticMaterials();
  const files = review.sources.map((s) => ({
    filename: s.filename,
    mime: s.filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    byte_size: 100,
    sha256: s.sha256,
  }));
  const batch = await call<{ batch_id: string }>('begin_job_material_import', [
    org,
    jid,
    files,
  ]);
  await db.exec('reset role');
  const sources = (
    await db.query<{ id: string; sha256: string }>(
      'select id,sha256 from material_import_sources where batch_id=$1',
      [batch.batch_id],
    )
  ).rows;
  for (const source of sources) {
    const raw = review.sources.find((s) => s.sha256 === source.sha256)!;
    const old = raw.id;
    raw.id = source.id;
    review.lines
      .filter((l) => l.source_id === old)
      .forEach((l) => {
        l.source_id = source.id;
        l.acknowledged = true;
      });
    await db.query(
      "update material_import_sources set status='clean',provenance='synthetic_fixture',scan_evidence=$1,extraction=$2 where id=$3",
      [{ verdict: 'clean', sha256: source.sha256 }, raw.extraction, source.id],
    );
  }
  review.reviewed = true;
  await asUser();
  const results = await call<string[]>('record_reviewed_purchase', [
    org,
    jid,
    batch.batch_id,
    1,
    review,
    'payment',
  ]);
  expect(results).toHaveLength(2);
  const expenses = (
    await db.query<{
      supplier: string;
      amount_minor: number;
      material_approval_id: string;
      material_import_line_ids: string[];
    }>('select * from job_expenses where job_id=$1 order by supplier', [jid])
  ).rows;
  expect(new Set(expenses.map((e) => e.supplier)).size).toBe(2);
  expect(expenses.reduce((s, e) => s + Number(e.amount_minor), 0)).toBe(90600);
  expect(
    expenses.every(
      (e) => e.material_approval_id && e.material_import_line_ids.length === 1,
    ),
  ).toBe(true);
  await denied('select begin_job_material_import($1,$2,$3)', [
    org,
    jid,
    JSON.stringify(files),
  ]);
  await denied('select record_reviewed_purchase($1,$2,$3,$4,$5,$6)', [
    org,
    jid,
    batch.batch_id,
    1,
    review,
    'payment',
  ]);
});
it('invalid import application rolls back approval atomically', async () => {
  const { b, batch, review } = await materialBatch();
  review.reviewed = true;
  review.lines.forEach((l) => (l.acknowledged = true));
  await denied(
    'select approve_and_apply_material_import($1,$2,$3,$4,$5,$6,$7)',
    [org, batch.batch_id, 1, b.estimate.id, b.version.id, 999, review],
  );
  expect(
    (
      await db.query(
        'select * from material_import_approvals where batch_id=$1',
        [batch.batch_id],
      )
    ).rows,
  ).toHaveLength(0);
});
it('worker configuration appends rates and rejects backdating into locked payroll', async () => {
  const created = await call<string>('save_worker', [
    org,
    {
      id: null,
      user_id: owner,
      display_name: 'Owner synthetic',
      worker_type: 'owner',
      cost_source: 'imputed',
      active: true,
    },
    { ...rate, cash_hour_minor: 0, imputed_hour_minor: 4500 },
  ]);
  expect(created).toBeTruthy();
  await approveTime();
  await call('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    true,
  ]);
  await denied('select save_worker($1,$2,$3)', [
    org,
    {
      id: created,
      user_id: owner,
      display_name: 'Owner synthetic',
      worker_type: 'owner',
      cost_source: 'imputed',
      active: true,
    },
    { ...rate, effective_from: '2026-10-01T00:00:00Z' },
  ]);
});
it('SQL handles midnight shifts and daylight-saving elapsed time', async () => {
  await approveTime(
    entry('2026-03-08T00:00:00-06:00', '2026-03-08T03:00:00-05:00'),
  );
  const preview = await call<{ rows: PayrollRow[] }>('prepare_payroll', [
    org,
    '2026-03-08T06:00:00Z',
    '2026-03-15T05:00:00Z',
    {},
    false,
  ]);
  expect(preview.rows[0].regular_seconds).toBe(7200);
  await approveTime(
    entry('2026-10-05T23:00:00-05:00', '2026-10-06T01:00:00-05:00'),
  );
});
it('SQL pays paid breaks and excludes unpaid breaks', async () => {
  await approveTime({
    ...entry('2026-10-05T13:00:00Z', '2026-10-05T13:15:00Z'),
    kind: 'break_paid',
  });
  await approveTime({
    ...entry('2026-10-05T13:15:00Z', '2026-10-05T13:45:00Z'),
    kind: 'break',
  });
  const preview = await call<{ rows: PayrollRow[] }>('prepare_payroll', [
    org,
    '2026-10-04T05:00:00Z',
    '2026-10-11T05:00:00Z',
    {},
    false,
  ]);
  expect(preview.rows).toHaveLength(1);
  expect(preview.rows[0].cash_minor).toBe(700);
});
it('missed clock-outs require an audited payroll-admin correction', async () => {
  await asUser(field, 'aal1');
  const eid = await call<string>('time_clock', [
    org,
    worker,
    'start',
    {
      job_id: null,
      overhead_center: 'Administration',
      task: 'Synthetic clock recovery',
      billable: false,
    },
  ]);
  await db.exec('reset role');
  const start = (
    await db.query<{ started_at: string }>(
      "update time_entries set started_at=date_trunc('second',clock_timestamp())-interval '20 hours' where id=$1 returning started_at",
      [eid],
    )
  ).rows[0].started_at;
  const end = new Date(new Date(start).getTime() + 8 * 3600000).toISOString();
  await asUser(field, 'aal1');
  await denied('select resolve_clock($1,$2,$3,$4)', [
    org,
    worker,
    end,
    'Self correction',
  ]);
  await asUser();
  await call('resolve_clock', [
    org,
    worker,
    end,
    'Supervisor verified missed punch against job records',
  ]);
  const records = (
    await db.query<{ submitted: boolean; ended_at: string }>(
      'select * from time_entries where id=$1',
      [eid],
    )
  ).rows;
  expect(records[0].submitted).toBe(true);
  expect(new Date(records[0].ended_at).toISOString()).toBe(end);
  expect(
    (await db.query('select * from time_reviews where entry_id=$1', [eid]))
      .rows,
  ).toHaveLength(1);
});
it('estimators cannot change company material pricing defaults', async () => {
  await asUser(estimator, 'aal1');
  await denied(
    "insert into material_import_preferences(organization_id,mode,value) values($1,'percent',2000)",
    [org],
  );
  await asUser();
  await db.query(
    "insert into material_import_preferences(organization_id,mode,value) values($1,'fixed',500)",
    [org],
  );
  await asUser(otherOwner);
  expect(
    (
      await db.query(
        'select * from material_import_preferences where organization_id=$1',
        [org],
      )
    ).rows,
  ).toHaveLength(0);
});
