import { readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { NativeMaintenanceFixture } from '../helpers/maintenance-native-store';
import type { MaintenanceCommand } from '../../server/property/maintenance-persistence';
import type { MaintenanceSource } from '../../src/domain/property/maintenance';
import type {
  EstimateBundle,
  TaxPolicy,
} from '../../src/domain/estimating/types';
import {
  blankEstimate,
  calculateEstimate,
} from '../../src/domain/estimating/calculation';
import {
  encodeRepairEvidence,
  restoreRepairEvidence,
} from '../../server/property/repair-evidence-archive';
import {
  evaluateRepairReadiness,
  recordRepairReadiness,
  repairReviewSections,
  type RepairReadinessContext,
  type RepairReadinessReview,
} from '../../src/domain/property/repair-readiness';
const native =
  !!process.env.EV_TEST_PG_SOCKET ||
  (process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true');
const uid = () => crypto.randomUUID();
let db: TestDatabase, database: string;
const orgs = [uid(), uid(), uid()],
  owners = [uid(), uid(), uid()],
  employees = [uid(), uid(), uid()],
  field = uid(),
  outsider = uid();
const sessions = new Map<string, string>();
function claims(user: string, exp = Math.floor(Date.now() / 1000) + 3600) {
  return JSON.stringify({
    sub: user,
    session_id: sessions.get(user),
    aal: 'aal2',
    exp,
  });
}
async function actor(d = db, user = owners[0], exp?: number) {
  await d.exec('reset role');
  await d.query("select set_config('request.jwt.claims',$1,false)", [
    claims(user, exp),
  ]);
  await d.exec('set role authenticated');
  return new NativeMaintenanceFixture(d);
}
async function admin(d = db) {
  await d.exec('reset role');
}
async function prop(
  action: string,
  id: string | null,
  p: unknown,
  org: string,
  lock: number | null = null,
) {
  return (
    await db.query<{ v: { id: string } }>(
      'select private.property_command($1,$2,$3,$4,$5) v',
      [org, action, id, lock, p],
    )
  ).rows[0].v.id;
}
async function fixture(index = 0) {
  const org = orgs[index],
    owner = owners[index],
    customer = uid(),
    location = uid();
  await admin();
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    claims(owner),
  ]);
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'Synthetic 2A customer')",
    [customer, org],
  );
  await db.query(
    "insert into public.service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Synthetic 2A lane','Example','IL','00000','US')",
    [location, org, customer],
  );
  const plan = await prop(
    'create_plan',
    null,
    {
      customer_id: customer,
      location_id: location,
      job_id: null,
      name: 'Synthetic 2A inspection',
      cadence: 'weekly',
      interval_days: 7,
      timezone: 'UTC',
      starts_on: '2026-10-01',
      checklist: [],
    },
    org,
  );
  const visit = await prop(
    'create_visit',
    plan,
    { visited_on: '2026-10-02', phase: 'before' },
    org,
  );
  const finding = uid(),
    second = uid();
  await prop(
    'save_visit',
    visit,
    {
      summary: 'Synthetic published observations',
      internal_notes: 'PRIVATE contractor note never published',
      checklist: [],
      findings: [finding, second].map((id, n) => ({
        id,
        category: 'Maintenance',
        location: n ? 'West joint' : 'East joint',
        severity: 'moderate',
        description: 'Observed synthetic seal gap',
        recommendation: 'Review proposed joint replacement',
        customer_visible: true,
      })),
    },
    org,
    1,
  );
  await prop('submit_visit', visit, {}, org, 2);
  const report = await prop('publish_visit', visit, {}, org, 3);
  const source: MaintenanceSource = {
    organization_id: org,
    customer_id: customer,
    location_id: location,
    report_id: report,
    report_version: 1,
    finding_id: finding,
  };
  const store = await actor(db, owner);
  return {
    org,
    owner,
    customer,
    location,
    plan,
    visit,
    source,
    second: { ...source, finding_id: second },
    store,
    index,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function edit(
  f: Fixture,
  expected_revision = 0,
  note = 'Private staff follow-up note',
): MaintenanceCommand {
  return {
    request_id: uid(),
    source: f.source,
    expected_revision,
    action: 'edit',
    input: {
      priority: 'high',
      assignee_id: employees[f.index],
      follow_up_on: '2026-11-20',
      review: 'pending',
      note,
    },
  };
}
function follow(
  f: Fixture,
  expected_revision: number,
  day = '2026-11-21',
): MaintenanceCommand {
  return {
    request_id: uid(),
    source: f.source,
    expected_revision,
    action: 'follow_up',
    input: { plan_id: f.plan, plan_revision: 1, visited_on: day },
  };
}
async function count(table: string) {
  return Number(
    (
      await db.query<{ n: string }>(
        `select count(*) n from maintenance_2a_test.${table}`,
      )
    ).rows[0].n,
  );
}
async function waiting(d: TestDatabase, pid: number) {
  for (let i = 0; i < 100; i++) {
    const r = await d.query<{ waiting: boolean }>(
      "select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') waiting",
      [pid],
    );
    if (r.rows[0].waiting) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('Expected native lock wait did not occur');
}
async function pid(d: TestDatabase) {
  return (await d.query<{ id: number }>('select pg_backend_pid() id')).rows[0]
    .id;
}
async function child(
  c: MaintenanceCommand,
  user: string,
  mode: string,
  archiveId?: string,
) {
  const env: NodeJS.ProcessEnv = {
    MAINT_TEST_DATABASE: database,
    MAINT_TEST_COMMAND: JSON.stringify(c),
    MAINT_TEST_CLAIMS: claims(user),
    MAINT_TEST_MODE: mode,
    MAINT_TEST_ARCHIVE: archiveId,
  };
  if (process.env.EV_TEST_PG_SOCKET)
    env.EV_TEST_PG_SOCKET = process.env.EV_TEST_PG_SOCKET;
  else {
    env.CI = 'true';
    env.EV_TEST_PG_CI = 'true';
  }
  const processChild = spawn(
    process.execPath,
    ['tests/database/fixtures/maintenance-worker.mjs'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '',
    stderr = '';
  processChild.stdout.on('data', (b) => (stdout += b.toString()));
  processChild.stderr.on('data', (b) => (stderr += b.toString()));
  const done = once(processChild, 'exit');
  return { processChild, done, output: () => ({ stdout, stderr }) };
}

async function evidenceFixture(f: Fixture) {
  await f.store.execute(edit(f));
  await admin();
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    claims(f.owner),
  ]);
  const policyId = uid();
  await db.query(
    "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Synthetic 2A tax','Test-only reviewed reference','Synthetic jurisdiction','Synthetic repair',0,'reviewed')",
    [policyId, f.org],
  );
  const payload = blankEstimate(f.customer);
  payload.location_id = f.location;
  payload.tax_policy_id = policyId;
  payload.expires_on = '2099-01-01';
  payload.project.description =
    'Replace only the measured exterior joint; concealed work is excluded.';
  payload.terms =
    'Synthetic contractor terms require separate authority before any work.';
  Object.assign(payload.lines[0], {
    description: 'Replace measured exterior joint seal',
    unit: 'linear_ft',
    quantity_milli: 8000,
    unit_cost_minor: 1000,
    unit_price_minor: 2000,
  });
  const bundle = (
    await db.query<{ v: EstimateBundle }>(
      'select private.create_estimate($1,$2,$3) v',
      [f.org, payload, uid()],
    )
  ).rows[0].v;
  const policy = (
    await db.query<{ v: TaxPolicy }>(
      "select to_jsonb(t)-'created_at' v from public.estimate_tax_policies t where id=$1",
      [policyId],
    )
  ).rows[0].v;
  // Canonicalize the existing engine output after proving equality with native SQL calculation.
  const calculated = calculateEstimate(bundle.version.payload, policy.rate_bps);
  expect(calculated).toEqual(bundle.version.calculation);
  bundle.version.calculation = calculated;
  const report = (
    await db.query<{
      snapshot: {
        findings: RepairReadinessContext['evidence']['finding'][];
        visited_on: string;
      };
    }>('select snapshot from private.inspection_reports where id=$1', [
      f.source.report_id,
    ])
  ).rows[0].snapshot;
  const context: RepairReadinessContext = {
    bundle,
    origin: {
      source: f.source,
      job_id: null,
      estimate_id: bundle.estimate.id,
      draft_version_id: bundle.version.id,
      draft_version_number: bundle.version.version_number,
      line_id: payload.lines[0].id,
      prepared_by: f.owner,
      prepared_at: new Date().toISOString(),
      preparation_id: uid(),
    },
    evidence: {
      finding: report.findings[0],
      visited_on: report.visited_on,
      suggested_scope: report.findings[0].recommendation,
      job_baseline_version_id: null,
    },
    policy,
    catalog: [],
    as_of: new Date().toISOString().slice(0, 10),
  };
  const history: RepairReadinessReview[] = [];
  for (const section of repairReviewSections) {
    const current = evaluateRepairReadiness(context, history);
    if (section.id !== 'measurements')
      expect(
        current.sections.find((s) => s.id === section.id)?.blockers,
        section.id,
      ).toEqual([]);
    history.push(
      recordRepairReadiness(context, history, f.owner, {
        request_id: uid(),
        draft_version_id: bundle.version.id,
        lock_revision: bundle.version.lock_revision,
        expected_sequence: history.length,
        snapshot: current.snapshot,
        section: section.id,
        input: {
          decision: 'confirmed',
          attested: true,
          note: 'Synthetic current internal evidence reviewed; no issue authority.',
          measurements:
            section.id === 'measurements'
              ? payload.lines.map((l) => ({
                  line_id: l.id,
                  quantity_milli: l.quantity_milli,
                  unit: l.unit,
                  basis: 'measured',
                  reference:
                    'Synthetic tape record M-2A; no independent measurement claim.',
                }))
              : [],
        },
      }).review,
    );
  }
  const text = encodeRepairEvidence(context, history);
  const item = (
    await db.query<{ id: string }>(
      'select id from maintenance_2a_test.items where organization_id=$1 and report_id=$2 and finding_id=$3',
      [f.org, f.source.report_id, f.source.finding_id],
    )
  ).rows[0].id;
  const args = [
    f.org,
    item,
    bundle.estimate.id,
    bundle.version.id,
    bundle.version.lock_revision,
    payload.lines[0].id,
    context.origin.preparation_id,
    text,
  ];
  const sql =
    'insert into maintenance_2a_test.repair_archives(organization_id,item_id,estimate_id,draft_version_id,draft_revision,source_line_id,preparation_id,archive_text) values($1,$2,$3,$4,$5,$6,$7,$8) returning id';
  const archiveId = (await db.query<{ id: string }>(sql, args)).rows[0].id;
  return { context, history, text, archiveId, args, sql };
}

describe.skipIf(!native)(
  'native PostgreSQL 17 · disposable Workstream 2A persistence contract',
  () => {
    beforeAll(async () => {
      db = createTestDatabase();
      database = (
        await db.query<{ name: string }>('select current_database() name')
      ).rows[0].name;
      await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
      const migrations = readdirSync('supabase/migrations')
        .filter(
          (f) =>
            f.endsWith('.sql') &&
            !f.includes('customer_authorization_release_readiness'),
        )
        .sort();
      expect(migrations).toHaveLength(13);
      for (const f of migrations)
        await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
      await db.exec(
        readFileSync(
          'tests/database/fixtures/maintenance-contract.sql',
          'utf8',
        ),
      );
      for (const u of [...owners, ...employees, field, outsider]) {
        await db.query(
          'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
          [u, u + '@example.test'],
        );
        const session = uid();
        sessions.set(u, session);
        await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
          session,
          u,
        ]);
      }
      for (let n = 0; n < 3; n++) {
        await db.query(
          "insert into public.organizations(id,name,slug,industry,status) values($1,$2,$3,$4,'active')",
          [
            orgs[n],
            'Synthetic 2A company ' + n,
            'maintenance-2a-' + n,
            ['property_services', 'construction', 'roofing'][n],
          ],
        );
        await db.query(
          "insert into public.memberships(organization_id,user_id,role,staff_type) values($1,$2,'owner','office_manager'),($1,$3,'staff','office_manager')",
          [orgs[n], owners[n], employees[n]],
        );
        await db.query(
          'insert into private.property_features values($1,true)',
          [orgs[n]],
        );
        await db.query(
          "update public.company_modules set enabled=true where organization_id=$1 and module='estimates'",
          [orgs[n]],
        );
      }
      await db.query(
        "insert into public.memberships(organization_id,user_id,role,staff_type) values($1,$2,'staff','field_staff')",
        [orgs[0], field],
      );
    }, 30000);
    afterAll(async () => {
      await db?.close();
    });
    it.each([0, 1, 2])(
      'retains manual priority, responsibility, date, review and exact private note for contractor %s',
      async (index) => {
        const f = await fixture(index),
          c = edit(f);
        const initial = await f.store.read(f.source);
        expect(initial.record.revision).toBe(0);
        const receipt = await f.store.execute(c);
        const retained = await f.store.read(f.source);
        expect(retained.source).toEqual(f.source);
        expect(retained.record).toMatchObject({
          revision: 1,
          priority: 'high',
          assignee_id: employees[index],
          follow_up_on: '2026-11-20',
          review: 'pending',
          scheduled_visit_id: null,
        });
        expect(retained.record.notes[0]).toMatchObject({
          author_id: f.owner,
          text: 'Private staff follow-up note',
        });
        expect(receipt.actor_id).toBe(f.owner);
        expect(Number.isFinite(Date.parse(receipt.recorded_at))).toBe(true);
        const foreign = await actor(db, owners[(index + 1) % 3]);
        await expect(foreign.read(f.source)).rejects.toThrow();
        await expect(
          foreign.execute({ ...c, request_id: uid(), expected_revision: 1 }),
        ).rejects.toThrow();
      },
    );
    it.each([
      'customer_id',
      'location_id',
      'report_id',
      'report_version',
      'finding_id',
    ] as const)(
      'rejects substituted %s even with an authorized same-company actor',
      async (key) => {
        const f = await fixture(),
          g = await fixture();
        await actor();
        const c = edit(f);
        const source = {
          ...f.source,
          [key]:
            key === 'report_version'
              ? 2
              : key === 'finding_id'
                ? 'absent'
                : g.source[key],
        };
        await expect(f.store.execute({ ...c, source })).rejects.toThrow();
        await expect(f.store.read(source)).rejects.toThrow();
      },
    );
    it('rejects caller fields, SQL NULL revisions, completion states and invalid dates before any durable effects', async () => {
      const f = await fixture(),
        c = edit(f);
      await admin();
      const before = await count('items');
      await actor();
      for (const bad of [
        { ...c, expected_revision: null },
        { ...c, input: { ...c.input, review: 'resolved' } },
        { ...c, input: { ...c.input, paid: true } },
        { ...c, input: { ...c.input, follow_up_on: '2026-02-30' } },
      ])
        await expect(
          db.query('select maintenance_2a_test.execute($1::jsonb)', [
            JSON.stringify(bad),
          ]),
        ).rejects.toThrow();
      await admin();
      expect(await count('items')).toBe(before);
    });
    it('two simultaneous employees have one CAS winner and no lost update', async () => {
      const f = await fixture(),
        peer = await db.fork!();
      try {
        const other = await actor(peer, employees[0]);
        const results = await Promise.allSettled([
          f.store.execute(edit(f, 0, 'First employee review')),
          other.execute(edit(f, 0, 'Second employee review')),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
        expect((await f.store.read(f.source)).record.notes).toHaveLength(1);
      } finally {
        await peer.close();
      }
    });
    it('concurrent exact duplicates return one original receipt; changed payload or actor UUID reuse rejects', async () => {
      const f = await fixture(),
        c = edit(f),
        peer = await db.fork!();
      try {
        const same = await actor(peer, f.owner);
        const results = await Promise.all([
          f.store.execute(c),
          same.execute(c),
        ]);
        expect(results[0]).toEqual(results[1]);
        expect((await f.store.read(f.source)).record.revision).toBe(1);
        expect((await f.store.read(f.source)).record.notes).toHaveLength(1);
        await expect(
          f.store.execute({
            ...c,
            input: { ...c.input, priority: 'urgent' },
          } as MaintenanceCommand),
        ).rejects.toThrow(/reused/);
        const other = await actor(peer, employees[0]);
        await expect(other.execute(c)).rejects.toThrow(/actor/);
        await expect(other.reconcile(c)).rejects.toThrow(/actor/);
      } finally {
        await peer.close();
      }
    });
    it('old revisions and repeated private notes reject, and notes/receipts are append-only even for fixture owner DML', async () => {
      const f = await fixture(),
        c = edit(f);
      await f.store.execute(c);
      await expect(f.store.execute(edit(f))).rejects.toThrow(/changed/);
      await expect(f.store.execute(edit(f, 1))).rejects.toThrow(/Identical/);
      await f.store.execute(edit(f, 1, 'Second explicit follow-up note'));
      expect((await f.store.read(f.source)).record.notes).toHaveLength(2);
      await admin();
      for (const table of ['notes', 'receipts']) {
        await expect(
          db.query(
            `update maintenance_2a_test.${table} set recorded_at=clock_timestamp()`,
          ),
        ).rejects.toThrow();
        await expect(
          db.query(`delete from maintenance_2a_test.${table}`),
        ).rejects.toThrow();
      }
      await expect(
        db.query(
          'update maintenance_2a_test.items set report_version=report_version+1,revision=revision+1',
        ),
      ).rejects.toThrow(/Immutable/);
    });
    it('current staff authority denies unassigned field staff, customers, revoked users and AAL1 management', async () => {
      const f = await fixture(),
        c = edit(f);
      for (const user of [field, outsider]) {
        const denied = await actor(db, user);
        await expect(denied.read(f.source)).rejects.toThrow();
        await expect(denied.execute(c)).rejects.toThrow();
      }
      await actor();
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ ...JSON.parse(claims(f.owner)), aal: 'aal1' }),
      ]);
      await expect(f.store.execute(c)).rejects.toThrow();
    });
    it('read then membership revocation denies write AND receipt replay/reconciliation', async () => {
      const f = await fixture(),
        c = edit(f),
        peer = await db.fork!();
      try {
        await f.store.read(f.source);
        await f.store.execute(c);
        await peer.query(
          'update public.memberships set active=false where organization_id=$1 and user_id=$2',
          [f.org, f.owner],
        );
        await expect(f.store.execute(c)).rejects.toThrow();
        await expect(f.store.reconcile(c)).rejects.toThrow();
        await expect(
          f.store.execute(edit(f, 1, 'Forbidden post-revocation write')),
        ).rejects.toThrow();
      } finally {
        await peer.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, f.owner],
        );
        await peer.close();
      }
    });
    it('revocation committed while a writer waits is checked after the actual native lock wait', async () => {
      const f = await fixture(),
        block = await db.fork!(),
        observer = await db.fork!();
      try {
        await block.exec('begin');
        await block.query(
          'select pg_advisory_xact_lock(hashtextextended($1::jsonb::text,0))',
          [JSON.stringify(f.source)],
        );
        const writerPid = await pid(db);
        const pending = f.store.execute(edit(f));
        const result = pending.then(
          (v) => ({ v }),
          (e) => ({ e }),
        );
        await waiting(observer, writerPid);
        await observer.query(
          'update public.memberships set active=false where organization_id=$1 and user_id=$2',
          [f.org, f.owner],
        );
        await block.exec('rollback');
        expect(await result).toHaveProperty('e');
        await observer.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, f.owner],
        );
        expect((await f.store.read(f.source)).record.revision).toBe(0);
      } finally {
        await block.exec('rollback');
        await observer.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, f.owner],
        );
        await block.close();
        await observer.close();
      }
    });
    it('real wall-clock expiry while blocked rolls back every item/note/receipt effect', async () => {
      const f = await fixture(),
        block = await db.fork!(),
        observer = await db.fork!();
      try {
        await actor(db, f.owner, Math.floor(Date.now() / 1000) + 1);
        await block.exec('begin');
        await block.query(
          'select pg_advisory_xact_lock(hashtextextended($1::jsonb::text,0))',
          [JSON.stringify(f.source)],
        );
        const writerPid = await pid(db);
        const result = f.store.execute(edit(f)).then(
          (v) => ({ v }),
          (e) => ({ e }),
        );
        await waiting(observer, writerPid);
        await new Promise((r) => setTimeout(r, 1200));
        await block.exec('rollback');
        expect(await result).toHaveProperty('e');
        await actor();
        expect((await f.store.read(f.source)).record.revision).toBe(0);
      } finally {
        await block.exec('rollback');
        await block.close();
        await observer.close();
      }
    });
    it('responsibility requires an active same-company relationship at write time', async () => {
      const f = await fixture(),
        c = edit(f);
      if (c.action !== 'edit') throw Error();
      await expect(
        f.store.execute({
          ...c,
          input: { ...c.input, assignee_id: employees[1] },
        }),
      ).rejects.toThrow();
      const peer = await db.fork!();
      try {
        await peer.query(
          'update public.memberships set active=false where organization_id=$1 and user_id=$2',
          [f.org, employees[0]],
        );
        await expect(f.store.execute(c)).rejects.toThrow();
      } finally {
        await peer.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, employees[0]],
        );
        await peer.close();
      }
    });
    it('prepares exactly one existing-workflow inspection draft atomically; duplicates and plan/date conflicts roll back', async () => {
      const f = await fixture();
      await f.store.execute(edit(f));
      const c = follow(f, 1),
        receipt = await f.store.execute(c);
      expect(receipt.scheduled_visit_id).toBeTruthy();
      expect(await f.store.execute(c)).toEqual(receipt);
      await expect(f.store.execute(follow(f, 2, '2026-11-22'))).rejects.toThrow(
        /unscheduled/,
      );
      await expect(
        f.store.execute({ ...follow(f, 0), source: f.second }),
      ).rejects.toThrow();
      expect((await f.store.read(f.second)).record.revision).toBe(0);
      await admin();
      const v = (
        await db.query<{
          status: string;
          content: { internal_notes: string; findings: unknown[] };
        }>('select status,content from private.inspection_visits where id=$1', [
          receipt.scheduled_visit_id,
        ])
      ).rows[0];
      expect(v.status).toBe('draft');
      expect(v.content.internal_notes).toBe('');
      expect(v.content.findings).toEqual([]);
    });
    it('reviewed status and stale plan revision cannot schedule; manual reopening does not assert repair', async () => {
      const f = await fixture(),
        c = edit(f);
      if (c.action !== 'edit') throw Error();
      await f.store.execute({
        ...c,
        input: { ...c.input, review: 'reviewed' },
      });
      await expect(f.store.execute(follow(f, 1))).rejects.toThrow();
      await f.store.execute(
        edit(f, 1, 'Explicit staff reopening, no repair assertion'),
      );
      const scheduled = follow(f, 2);
      if (scheduled.action !== 'follow_up') throw Error();
      await expect(
        f.store.execute({
          ...scheduled,
          input: { ...scheduled.input, plan_revision: 2 },
        }),
      ).rejects.toThrow();
      await f.store.execute(scheduled);
      const r = await f.store.read(f.source);
      expect(r.record.review).toBe('pending');
      expect(r.record).not.toHaveProperty('resolved');
      expect(r.record).not.toHaveProperty('paid');
    });
    it.each(['edit', 'follow_up'])(
      'retains a committed %s request across two actual child processes and reconciles read-only after receipt loss',
      async (action) => {
        const f = await fixture(),
          c = action === 'edit' ? edit(f) : follow(f, 0);
        const writer = await child(c, f.owner, 'commit_exit');
        expect((await writer.done)[0]).toBe(0);
        expect(writer.output().stderr).toBe('');
        expect(writer.output().stdout).toBe('');
        const reader = await child(c, f.owner, 'read');
        expect((await reader.done)[0]).toBe(0);
        const result = JSON.parse(reader.output().stdout);
        expect(result.receipt.status).toBe('committed');
        expect(result.item.record.notes).toHaveLength(
          action === 'edit' ? 1 : 0,
        );
        expect(result.item.record.revision).toBe(1);
        await admin();
        const before = await count('receipts');
        await actor();
        expect((await f.store.reconcile(c)).status).toBe('committed');
        await admin();
        expect(await count('receipts')).toBe(before);
      },
    );
    it.each(['edit', 'follow_up'])(
      'SIGKILL during %s before commit rolls back; absent receipt remains undetermined, never retry permission',
      async (action) => {
        const f = await fixture(),
          c = action === 'edit' ? edit(f) : follow(f, 0),
          writer = await child(c, f.owner, 'uncommitted');
        for (
          let n = 0;
          n < 500 && !writer.output().stdout.includes('UNCOMMITTED');
          n++
        )
          await new Promise((r) => setTimeout(r, 20));
        expect(writer.output().stdout).toContain('UNCOMMITTED');
        writer.processChild.kill('SIGKILL');
        expect((await writer.done)[1]).toBe('SIGKILL');
        expect((await f.store.reconcile(c)).status).toBe('undetermined');
        expect((await f.store.read(f.source)).record.revision).toBe(0);
      },
    );
    it('no direct client DML/private export grants; RLS filters actual company rows independently of the test commands', async () => {
      const f = await fixture(),
        g = await fixture(1);
      await actor();
      await f.store.execute(edit(f));
      await actor(db, owners[1]);
      await g.store.execute(edit(g));
      await actor();
      for (const table of ['items', 'notes', 'receipts', 'repair_archives'])
        await expect(
          db.query(`select * from maintenance_2a_test.${table}`),
        ).rejects.toThrow();
      await admin();
      await db.exec(
        'begin;grant select on maintenance_2a_test.items to authenticated',
      );
      try {
        await actor();
        const rows = await db.query<{ organization_id: string }>(
          'select organization_id from maintenance_2a_test.items',
        );
        expect(rows.rows.length).toBeGreaterThan(0);
        expect(rows.rows.every((r) => r.organization_id === orgs[0])).toBe(
          true,
        );
        await actor(db, outsider);
        expect(
          (await db.query('select * from maintenance_2a_test.items')).rows,
        ).toEqual([]);
      } finally {
        await admin();
        await db.exec('rollback');
      }
      expect(
        (
          await db.query(
            "select relrowsecurity,relforcerowsecurity from pg_class where relnamespace='maintenance_2a_test'::regnamespace and relkind='r'",
          )
        ).rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
      ).toBe(true);
    });
    it('source reports stay immutable and original financial tables remain unaffected by triage', async () => {
      const f = await fixture();
      await admin();
      const before = (
        await db.query(
          'select snapshot from private.inspection_reports where id=$1',
          [f.source.report_id],
        )
      ).rows[0];
      const amounts = (
        await db.query(
          'select (select count(*) from public.jobs) jobs,(select count(*) from public.estimates) estimates,(select count(*) from private.supplemental_invoice_drafts) invoices',
        )
      ).rows[0];
      await actor();
      await f.store.execute(edit(f));
      await f.store.execute(follow(f, 1));
      await admin();
      expect(
        (
          await db.query(
            'select snapshot from private.inspection_reports where id=$1',
            [f.source.report_id],
          )
        ).rows[0],
      ).toEqual(before);
      expect(
        (
          await db.query(
            'select (select count(*) from public.jobs) jobs,(select count(*) from public.estimates) estimates,(select count(*) from private.supplemental_invoice_drafts) invoices',
          )
        ).rows[0],
      ).toEqual(amounts);
      await expect(
        db.query(
          "update private.inspection_reports set snapshot='{}' where id=$1",
          [f.source.report_id],
        ),
      ).rejects.toThrow();
      const audit = await db.query(
        "select * from public.activity_events where entity_type in ('items','notes','receipts')",
      );
      expect(JSON.stringify(audit.rows)).not.toContain(
        'Private staff follow-up',
      );
    });
    it('retains six current sections, measurements and calculation snapshots across a real reader process restart', async () => {
      const f = await fixture(),
        a = await evidenceFixture(f);
      await actor();
      const command = { ...edit(f), expected_revision: 1 };
      const reader = await child(command, f.owner, 'read', a.archiveId);
      expect((await reader.done)[0]).toBe(0);
      expect(reader.output().stderr).toBe('');
      const read = JSON.parse(reader.output().stdout);
      expect(read.archive).toBe(a.text);
      const restored = restoreRepairEvidence(read.archive, a.context);
      expect(restored.current.confirmed).toBe(6);
      expect(restored.current.history).toEqual(a.history);
      expect(
        restored.current.sections[1].last?.request.input.measurements[0]
          .reference,
      ).toContain('M-2A');
      expect(read.receipt.status).toBe('undetermined');
    });
    it('restored old receipts remain historical when the actual saved estimate or tax policy changes', async () => {
      const f = await fixture(),
        a = await evidenceFixture(f);
      const original = a.text;
      const payload = structuredClone(a.context.bundle.version.payload);
      payload.lines[0].unit_price_minor!++;
      const bundle = (
        await db.query<{ v: EstimateBundle }>(
          'select private.save_estimate($1,$2,$3,$4,$5) v',
          [
            f.org,
            a.context.bundle.estimate.id,
            a.context.bundle.version.id,
            a.context.bundle.version.lock_revision,
            payload,
          ],
        )
      ).rows[0].v;
      bundle.version.calculation = calculateEstimate(
        bundle.version.payload,
        a.context.policy!.rate_bps,
      );
      const current = { ...structuredClone(a.context), bundle };
      const r = restoreRepairEvidence(original, current);
      expect(r.current.confirmed).toBe(0);
      expect(r.current.sections.every((s) => s.stale)).toBe(true);
      expect(r.historical.confirmed).toBe(6);
      await db.query(
        'update public.estimate_tax_policies set policy_version=policy_version+1 where id=$1',
        [a.context.policy!.id],
      );
      const policy = (
        await db.query<{ v: TaxPolicy }>(
          "select to_jsonb(t)-'created_at' v from public.estimate_tax_policies t where id=$1",
          [a.context.policy!.id],
        )
      ).rows[0].v;
      expect(
        restoreRepairEvidence(original, { ...a.context, policy }).current
          .confirmed,
      ).toBe(0);
      expect(
        (
          await db.query<{ text: string }>(
            'select archive_text text from maintenance_2a_test.repair_archives where id=$1',
            [a.archiveId],
          )
        ).rows[0].text,
      ).toBe(original);
    });
    it('archive FKs/current-source checks reject cross-property targets and source lines; archive history cannot be edited or exported to customers', async () => {
      const f = await fixture(),
        g = await fixture(),
        a = await evidenceFixture(f);
      await admin();
      for (const [index, value] of [
        [0, orgs[1]],
        [5, uid()],
      ] as const) {
        const args = [...a.args];
        args[index] = value;
        await expect(db.query(a.sql, args)).rejects.toThrow();
      }
      await expect(
        db.query(
          'update maintenance_2a_test.repair_archives set archive_text=archive_text where id=$1',
          [a.archiveId],
        ),
      ).rejects.toThrow();
      await actor();
      expect(
        (
          await db.query<{ v: string }>(
            'select maintenance_2a_test.read_archive($1,$2) v',
            [f.source, a.archiveId],
          )
        ).rows[0].v,
      ).toBe(a.text);
      await expect(
        db.query('select maintenance_2a_test.read_archive($1,$2)', [
          g.source,
          a.archiveId,
        ]),
      ).rejects.toThrow();
      await expect(db.query(a.sql, a.args)).rejects.toThrow(); // no authenticated archive confirmation writer exists
      await actor(db, outsider);
      await expect(
        db.query('select maintenance_2a_test.read_archive($1,$2)', [
          f.source,
          a.archiveId,
        ]),
      ).rejects.toThrow();
    });
    it.each(['session', 'banned', 'deleted', 'anonymous', 'unconfirmed'])(
      'current %s revocation denies both fresh commands and receipt replay',
      async (kind) => {
        const f = await fixture(),
          c = edit(f);
        await f.store.execute(c);
        const peer = await db.fork!();
        try {
          if (kind === 'session')
            await peer.query(
              'update auth.sessions set not_after=clock_timestamp() where id=$1',
              [sessions.get(f.owner)],
            );
          else
            await peer.query(
              'update auth.users set ' +
                (kind === 'banned'
                  ? "banned_until=clock_timestamp()+interval '1 hour'"
                  : kind === 'anonymous'
                    ? 'is_anonymous=true'
                    : kind === 'unconfirmed'
                      ? 'email_confirmed_at=null'
                      : 'deleted_at=clock_timestamp()') +
                ' where id=$1',
              [f.owner],
            );
          await expect(f.store.read(f.source)).rejects.toThrow();
          await expect(f.store.execute(c)).rejects.toThrow();
          await expect(f.store.reconcile(c)).rejects.toThrow();
        } finally {
          await peer.query(
            'update auth.sessions set not_after=null where id=$1',
            [sessions.get(f.owner)],
          );
          await peer.query(
            'update auth.users set banned_until=null,deleted_at=null,is_anonymous=false,email_confirmed_at=clock_timestamp() where id=$1',
            [f.owner],
          );
          await peer.close();
        }
      },
    );
    it.each(['office_manager', 'estimator'])(
      'current %s employee can edit without acquiring management or financial authority',
      async (staffType) => {
        const f = await fixture(),
          peer = await db.fork!();
        try {
          await peer.query(
            'update public.memberships set staff_type=$3 where organization_id=$1 and user_id=$2',
            [f.org, employees[0], staffType],
          );
          const employee = await actor(db, employees[0]);
          const receipt = await employee.execute(edit(f));
          expect(receipt.actor_id).toBe(employees[0]);
          expect(
            (await employee.read(f.source)).record.notes[0].author_id,
          ).toBe(employees[0]);
        } finally {
          await peer.query(
            "update public.memberships set staff_type='office_manager' where organization_id=$1 and user_id=$2",
            [f.org, employees[0]],
          );
          await peer.close();
        }
      },
    );
    it('later report omission cannot erase the exact earlier finding or infer physical resolution', async () => {
      const f = await fixture(),
        c = edit(f);
      if (c.action !== 'edit') throw Error();
      await f.store.execute({
        ...c,
        input: { ...c.input, review: 'reviewed' },
      });
      await admin();
      await prop('revise_visit', f.visit, {}, f.org, 4);
      await prop(
        'save_visit',
        f.visit,
        {
          summary: 'Synthetic later publication with no reported findings',
          internal_notes: '',
          checklist: [],
          findings: [],
        },
        f.org,
        5,
      );
      await prop('submit_visit', f.visit, {}, f.org, 6);
      const report2 = await prop('publish_visit', f.visit, {}, f.org, 7);
      await actor();
      const old = await f.store.read(f.source);
      expect(old.record.review).toBe('reviewed');
      expect(old.record.revision).toBe(1);
      expect(old.record).not.toHaveProperty('resolved');
      await expect(
        f.store.read({ ...f.source, report_id: report2, report_version: 2 }),
      ).rejects.toThrow(/published/);
    });
    it.each(['feature', 'crm', 'estimates'])(
      'disabled %s gate denies commands and receipt reconciliation',
      async (gate) => {
        const f = await fixture(),
          c = edit(f);
        await f.store.execute(c);
        const peer = await db.fork!();
        try {
          if (gate === 'feature')
            await peer.query(
              'update private.property_features set enabled=false where organization_id=$1',
              [f.org],
            );
          else
            await peer.query(
              'update public.company_modules set enabled=false where organization_id=$1 and module=$2',
              [f.org, gate],
            );
          await expect(f.store.read(f.source)).rejects.toThrow();
          await expect(f.store.execute(c)).rejects.toThrow();
          await expect(f.store.reconcile(c)).rejects.toThrow();
        } finally {
          await peer.query(
            'update private.property_features set enabled=true where organization_id=$1',
            [f.org],
          );
          await peer.query(
            "update public.company_modules set enabled=true where organization_id=$1 and module in ('crm','estimates')",
            [f.org],
          );
          await peer.close();
        }
      },
    );
    it('every new composite foreign key has a usable tenant-leading index prefix', async () => {
      await admin();
      const missing = await db.query(
        "select c.conname from pg_constraint c where c.contype='f' and c.connamespace='maintenance_2a_test'::regnamespace and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey)",
      );
      expect(missing.rows).toEqual([]);
    });
  },
);
