import { readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { NativeMaintenanceFixture } from '../helpers/maintenance-native-store';
import { NativeRepairService } from '../helpers/repair-native-service';
import type { RepairReservationRequest } from '../../server/property/repair-persistence';
import {
  blankEstimate,
  calculateEstimate,
} from '../../src/domain/estimating/calculation';
import {
  recordRepairReadiness,
  repairReviewSections,
  repairReadinessSnapshot,
  type RepairReadinessRequest,
} from '../../src/domain/property/repair-readiness';
const native =
  !!process.env.EV_TEST_PG_SOCKET ||
  (process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true');
const uid = () => crypto.randomUUID();
let db: TestDatabase, database: string;
const orgs = [uid(), uid(), uid()],
  owners = [uid(), uid(), uid()],
  staff = [uid(), uid(), uid()],
  field = uid();
const sessions = new Map<string, string>();
function claims(
  user: string = owners[0],
  aal = 'aal2',
  exp = Math.floor(Date.now() / 1000) + 3600,
) {
  return JSON.stringify({
    sub: user,
    session_id: sessions.get(user),
    aal,
    exp,
  });
}
async function actor(
  d = db,
  user: string = owners[0],
  aal = 'aal2',
  exp?: number,
) {
  await d.exec('reset role');
  await d.query("select set_config('request.jwt.claims',$1,false)", [
    claims(user, aal, exp),
  ]);
  return new NativeRepairService(d);
}
async function call<T>(name: string, args: unknown[]) {
  return (
    await db.query<{ v: T }>(
      `select ${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) v`,
      args,
    )
  ).rows[0].v;
}
async function fixture(index = 0, withJob = false) {
  await actor(db, owners[index]);
  const org = orgs[index],
    customer = uid(),
    location = uid();
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'Synthetic 2B customer')",
    [customer, org],
  );
  await db.query(
    "insert into public.service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Synthetic 2B lane','Example','IL','00000','US')",
    [location, org, customer],
  );
  const policy = uid();
  await db.query(
    "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Synthetic 2B tax','Reviewed test-only reference','Synthetic jurisdiction','Synthetic repair',0,'reviewed')",
    [policy, org],
  );
  let job: string | null = null,
    baseline: string | null = null;
  if (withJob) {
    const payload = blankEstimate(customer);
    payload.location_id = location;
    payload.tax_policy_id = policy;
    payload.expires_on = '2099-01-01';
    payload.lines[0].unit_cost_minor = 1000;
    payload.lines[0].unit_price_minor = 2000;
    const bundle = await call<{
      estimate: { id: string };
      version: { id: string };
    }>('private.create_estimate', [org, payload, uid()]);
    await call('private.issue_estimate', [
      org,
      bundle.estimate.id,
      bundle.version.id,
      1,
    ]);
    baseline = bundle.version.id;
    job = await call<string>('private.approve_job', [org, baseline]);
  }
  const prop = async (
    action: string,
    id: string | null,
    p: unknown,
    lock: number | null = null,
  ) =>
    (
      await call<{ id: string }>('private.property_command', [
        org,
        action,
        id,
        lock,
        p,
      ])
    ).id;
  const plan = await prop('create_plan', null, {
    customer_id: customer,
    location_id: location,
    job_id: job,
    name: 'Synthetic 2B weekly',
    cadence: 'weekly',
    interval_days: 7,
    timezone: 'UTC',
    starts_on: '2026-10-01',
    checklist: [],
  });
  const visit = await prop('create_visit', plan, {
      visited_on: '2026-10-02',
      phase: 'before',
    }),
    finding = uid();
  await prop(
    'save_visit',
    visit,
    {
      summary: 'Synthetic report',
      internal_notes: 'PRIVATE source note',
      checklist: [],
      findings: [
        {
          id: finding,
          category: 'Maintenance',
          location: 'East joint',
          severity: 'moderate',
          description: 'Observed synthetic seal gap',
          recommendation: 'Review proposed joint replacement',
          customer_visible: true,
        },
      ],
    },
    1,
  );
  await prop('submit_visit', visit, {}, 2);
  const report = await prop('publish_visit', visit, {}, 3);
  const source = {
    organization_id: org,
    customer_id: customer,
    location_id: location,
    report_id: report,
    report_version: 1,
    finding_id: finding,
  };
  await new NativeMaintenanceFixture(db).execute({
    request_id: uid(),
    source,
    expected_revision: 0,
    action: 'edit',
    input: {
      priority: 'normal',
      assignee_id: staff[index],
      follow_up_on: '',
      review: 'reviewed',
      note: 'Reviewed source for synthetic preparation',
    },
  });
  const payload = blankEstimate(customer);
  payload.location_id = location;
  payload.tax_policy_id = policy;
  payload.expires_on = '2099-01-01';
  payload.project.description =
    'Replace the measured exterior joint only; concealed work is excluded.';
  payload.terms = 'Synthetic review only; no work or customer authority.';
  Object.assign(payload.lines[0], {
    description: 'Replace measured exterior joint seal',
    unit: 'linear_ft',
    quantity_milli: 8000,
    unit_cost_minor: 1000,
    unit_price_minor: 2000,
  });
  const c: RepairReservationRequest = {
    request_id: uid(),
    source,
    maintenance_revision: 1,
    plan_id: plan,
    plan_revision: 1,
    job_id: job,
    job_baseline_version_id: baseline,
    estimate_id: uid(),
    draft_version_id: uid(),
    line_id: payload.lines[0].id,
    payload,
  };
  return {
    org,
    customer,
    location,
    plan,
    visit,
    policy,
    c,
    index,
    service: new NativeRepairService(db),
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function prepared(index = 0) {
  const f = await fixture(index);
  await f.service.reserve(f.c);
  await f.service.prepareOnce(f.c);
  return f;
}
async function request(
  f: Fixture,
  section: RepairReadinessRequest['section'] = 'scope',
) {
  const state = await f.service.read(f.c);
  return {
    request_id: uid(),
    draft_version_id: f.c.draft_version_id,
    lock_revision: state.context.bundle.version.lock_revision,
    expected_sequence: state.history.length,
    snapshot: repairReadinessSnapshot(state.context),
    section,
    input: {
      decision: 'confirmed' as const,
      attested: true,
      note: 'Synthetic explicit contractor evidence reviewed; no authority to issue.',
      measurements:
        section === 'measurements'
          ? state.context.bundle.version.payload.lines.map((l) => ({
              line_id: l.id,
              quantity_milli: l.quantity_milli,
              unit: l.unit,
              basis: 'measured' as const,
              reference: 'Synthetic tape measure reference EAST-8',
            }))
          : [],
    },
  };
}
async function counts(f: Fixture) {
  const r = await db.query<{
    estimates: number;
    bindings: number;
    reviews: number;
    events: number;
    permits: number;
  }>(
    `select (select count(*)::integer from public.estimates where organization_id=$1 and id=$2) estimates,(select count(*)::integer from maintenance_2b_test.bindings where organization_id=$1 and reservation_id=$3) bindings,(select count(*)::integer from maintenance_2b_test.reviews where organization_id=$1 and reservation_id=$3) reviews,(select count(*)::integer from maintenance_2b_test.events where organization_id=$1 and reservation_id=$3) events,(select count(*)::integer from maintenance_2b_test.permits where organization_id=$1 and reservation_id=$3) permits`,
    [f.org, f.c.estimate_id, f.c.request_id],
  );
  return r.rows[0];
}
async function waitLock(d: TestDatabase, pid: number) {
  for (let n = 0; n < 100; n++) {
    if (
      (
        await d.query<{ v: boolean }>(
          "select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') v",
          [pid],
        )
      ).rows[0].v
    )
      return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('Real lock wait required');
}
async function child(f: Fixture, mode: string, review?: unknown) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    EV_TEST_PG_SOCKET: process.env.EV_TEST_PG_SOCKET,
    CI: process.env.CI,
    EV_TEST_PG_CI: process.env.EV_TEST_PG_CI,
    REPAIR_DATABASE: database,
    REPAIR_COMMAND: JSON.stringify(f.c),
    REPAIR_CLAIMS: claims(owners[f.index]),
    REPAIR_MODE: mode,
    REPAIR_REVIEW: review ? JSON.stringify(review) : undefined,
  };
  const p = spawn(
    process.execPath,
    ['tests/database/fixtures/repair-worker.mjs'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let out = '',
    err = '';
  p.stdout.on('data', (b) => (out += b));
  p.stderr.on('data', (b) => (err += b));
  const done = once(p, 'exit');
  return { p, done, out: () => out, err: () => err };
}
async function killOpen(f: Fixture, mode: string) {
  const w = await child(f, mode);
  try {
    for (let n = 0; n < 200 && !w.out().includes('UNCOMMITTED'); n++) {
      if (w.err()) throw Error(w.err());
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(w.out()).toContain('UNCOMMITTED');
    w.p.kill('SIGKILL');
    await w.done;
  } finally {
    if (w.p.exitCode === null && w.p.signalCode === null) w.p.kill('SIGKILL');
  }
}

describe.skipIf(!native)(
  'native PostgreSQL17 · Workstream 2B repair reservations/readiness',
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
      for (const f of ['maintenance-contract.sql', 'repair-contract.sql'])
        await db.exec(readFileSync('tests/database/fixtures/' + f, 'utf8'));
      for (const user of [...owners, ...staff, field]) {
        await db.query(
          'insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())',
          [user, user + '@example.test'],
        );
        const sid = uid();
        sessions.set(user, sid);
        await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
          sid,
          user,
        ]);
      }
      for (let i = 0; i < 3; i++) {
        await db.query(
          "insert into public.organizations(id,name,slug,industry,status) values($1,$2,$3,$4,'active')",
          [
            orgs[i],
            'Synthetic 2B company ' + i,
            'repair-2b-' + i,
            ['property_services', 'construction', 'roofing'][i],
          ],
        );
        await db.query(
          "insert into public.memberships(organization_id,user_id,role,staff_type) values($1,$2,'owner','office_manager'),($1,$3,'staff','office_manager')",
          [orgs[i], owners[i], staff[i]],
        );
        await db.query(
          'insert into private.property_features values($1,true)',
          [orgs[i]],
        );
        await db.query(
          "update public.company_modules set enabled=true where organization_id=$1 and module='estimates'",
          [orgs[i]],
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
      'reserves exact identities then creates one existing-engine draft for company %s',
      async (i) => {
        const f = await prepared(i);
        expect(await f.service.reconcile(f.c)).toMatchObject({
          status: 'committed',
          receipt: {
            estimate_id: f.c.estimate_id,
            draft_version_id: f.c.draft_version_id,
            line_id: f.c.line_id,
          },
        });
        const state = await f.service.read(f.c);
        expect(state.context.bundle.version.calculation).toEqual(
          calculateEstimate(f.c.payload, 0),
        );
        expect(state.context.origin.source).toEqual(f.c.source);
        expect(state.context.origin.prepared_by).toBe(owners[i]);
        expect(await counts(f)).toEqual({
          estimates: 1,
          bindings: 1,
          reviews: 0,
          events: 3,
          permits: 0,
        });
      },
    );
    it('identical reservation UUID replays one immutable receipt; changed input/actor rejects', async () => {
      const f = await fixture();
      const r = await f.service.reserve(f.c);
      expect(await f.service.reserve(f.c)).toEqual(r);
      await expect(
        f.service.reserve({
          ...f.c,
          payload: { ...f.c.payload, terms: 'Changed terms' },
        }),
      ).rejects.toThrow(/reused/);
      const other = await actor(db, staff[0]);
      await expect(other.reserve(f.c)).rejects.toThrow(/actor/);
      await actor();
    });
    it('two employees race the same source; exactly one immutable reservation wins', async () => {
      const f = await fixture(),
        peer = await db.fork!();
      try {
        const second = await actor(peer, staff[0]);
        const c = {
          ...f.c,
          request_id: uid(),
          estimate_id: uid(),
          draft_version_id: uid(),
        };
        const results = await Promise.allSettled([
          f.service.reserve(f.c),
          second.reserve(c),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect((await counts(f)).estimates).toBe(0);
      } finally {
        await peer.close();
      }
    });
    it('two same-actor identical requests serialize to the same reservation', async () => {
      const f = await fixture(),
        peer = await db.fork!();
      try {
        const second = await actor(peer);
        const [a, b] = await Promise.all([
          f.service.reserve(f.c),
          second.reserve(f.c),
        ]);
        expect(a).toEqual(b);
      } finally {
        await peer.close();
      }
    });
    it('preparation is one-shot even for identical input; receipt reads never create targets', async () => {
      const f = await prepared();
      await expect(f.service.prepareOnce(f.c)).rejects.toThrow(/never retries/);
      expect((await f.service.reconcile(f.c)).status).toBe('committed');
      expect((await counts(f)).estimates).toBe(1);
    });
    it('stale maintenance revision rejects before reservation', async () => {
      const f = await fixture();
      await expect(
        f.service.reserve({ ...f.c, maintenance_revision: 2 }),
      ).rejects.toThrow(/revision/);
      expect((await counts(f)).events).toBe(0);
    });
    it('stale plan and substituted baseline reject before reservation', async () => {
      const f = await fixture();
      await expect(
        f.service.reserve({ ...f.c, plan_revision: 2 }),
      ).rejects.toThrow(/revision/);
      await expect(
        f.service.reserve({
          ...f.c,
          job_id: uid(),
          job_baseline_version_id: uid(),
        }),
      ).rejects.toThrow();
    });
    it('maintenance change after durable claim prevents creation and preserves UNKNOWN', async () => {
      const f = await fixture();
      await f.service.reserve(f.c);
      await db.query('select maintenance_2b_test.claim($1::jsonb)', [
        JSON.stringify(f.c),
      ]);
      await new NativeMaintenanceFixture(db).execute({
        request_id: uid(),
        source: f.c.source,
        expected_revision: 1,
        action: 'edit',
        input: {
          priority: 'high',
          assignee_id: null,
          follow_up_on: '',
          review: 'reviewed',
          note: 'Subsequent manual review',
        },
      });
      await expect(call('maintenance_2b_test.finish', [f.c])).rejects.toThrow(
        /revision/,
      );
      expect((await f.service.reconcile(f.c)).status).toBe('undetermined');
      await expect(f.service.prepareOnce(f.c)).rejects.toThrow(/never retries/);
    });
    it('reserved target collision stays UNKNOWN; no replacement or name search', async () => {
      const f = await fixture();
      await f.service.reserve(f.c);
      await db.query('select maintenance_2b_test.claim($1::jsonb)', [
        JSON.stringify(f.c),
      ]);
      const other = await call<{ estimate: { id: string } }>(
        'private.create_estimate',
        [
          f.org,
          {
            ...f.c.payload,
            lines: f.c.payload.lines.map((l) => ({ ...l, id: uid() })),
          },
          f.c.request_id,
        ],
      );
      expect(other.estimate.id).not.toBe(f.c.estimate_id);
      await expect(call('maintenance_2b_test.finish', [f.c])).rejects.toThrow(
        /collision/,
      );
      expect((await f.service.reconcile(f.c)).status).toBe('undetermined');
    });
    it.each(['customer_id', 'location_id', 'report_id', 'finding_id'] as const)(
      'rejects substituted source %s',
      async (key) => {
        const f = await fixture();
        await expect(
          f.service.reserve({
            ...f.c,
            source: { ...f.c.source, [key]: uid() },
          }),
        ).rejects.toThrow();
      },
    );
    it('tenant, field staff and AAL1 owner cannot read or prepare', async () => {
      const f = await prepared();
      for (const [u, aal] of [
        [owners[1], 'aal2'],
        [field, 'aal2'],
        [owners[0], 'aal1'],
      ]) {
        const s = await actor(db, u, aal);
        await expect(s.read(f.c)).rejects.toThrow();
        await expect(s.reconcile(f.c)).rejects.toThrow();
      }
      await actor();
    });
    it.each(['banned', 'deleted', 'anonymous', 'unconfirmed'])(
      'rejects current %s principal on append',
      async (kind) => {
        const f = await prepared(),
          review = await request(f);
        const sql = {
          banned: "banned_until=clock_timestamp()+interval '1 hour'",
          deleted: 'deleted_at=clock_timestamp()',
          anonymous: 'is_anonymous=true',
          unconfirmed: 'email_confirmed_at=null',
        }[kind]!;
        await db.exec(`update auth.users set ${sql} where id='${owners[0]}'`);
        try {
          await expect(
            f.service.appendReadiness({ reservation: f.c, review }),
          ).rejects.toThrow();
          expect((await counts(f)).reviews).toBe(0);
        } finally {
          await db.query(
            'update auth.users set banned_until=null,deleted_at=null,is_anonymous=false,email_confirmed_at=clock_timestamp() where id=$1',
            [owners[0]],
          );
        }
      },
    );
    it('all six guarded appends survive independent reader restart, never confer issue authority', async () => {
      const f = await prepared();
      for (const section of repairReviewSections)
        await f.service.appendReadiness({
          reservation: f.c,
          review: await request(f, section.id),
        });
      expect(await f.service.readiness(f.c)).toMatchObject({
        ready: true,
        confirmed: 6,
      });
      const w = await child(f, 'read');
      expect((await w.done)[0], w.err()).toBe(0);
      const read = JSON.parse(w.out());
      expect(read.state.history).toHaveLength(6);
      expect(read.receipt.status).toBe('committed');
      await expect(
        call('private.issue_estimate', [
          f.org,
          f.c.estimate_id,
          f.c.draft_version_id,
          1,
        ]),
      ).rejects.toThrow(/repair/);
      expect((await counts(f)).reviews).toBe(6);
    });
    it('readiness UUID replay is exact; actor and payload substitution reject', async () => {
      const f = await prepared(),
        r = await request(f);
      const a = await f.service.appendReadiness({
        reservation: f.c,
        review: r,
      });
      expect(
        await f.service.appendReadiness({ reservation: f.c, review: r }),
      ).toEqual(a);
      await expect(
        f.service.appendReadiness({
          reservation: f.c,
          review: {
            ...r,
            input: { ...r.input, note: 'Different review evidence' },
          },
        }),
      ).rejects.toThrow(/reused/);
      const s = await actor(db, staff[0]);
      await expect(
        s.appendReadiness({ reservation: f.c, review: r }),
      ).rejects.toThrow(/reused/);
      await actor();
    });
    it('concurrent section reviewers at one sequence have exactly one winner', async () => {
      const f = await prepared(),
        peer = await db.fork!();
      try {
        const s = await actor(peer, staff[0]),
          a = await request(f),
          b = { ...a, request_id: uid(), section: 'terms' as const };
        const r = await Promise.allSettled([
          f.service.appendReadiness({ reservation: f.c, review: a }),
          s.appendReadiness({ reservation: f.c, review: b }),
        ]);
        expect(r.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
        expect((await counts(f)).reviews).toBe(1);
      } finally {
        await peer.close();
      }
    });
    it('ordinary save/duplicate/revise cannot bypass fixture bindings; checked save preserves source line', async () => {
      const f = await prepared();
      await expect(
        call('private.save_estimate', [
          f.org,
          f.c.estimate_id,
          f.c.draft_version_id,
          1,
          f.c.payload,
        ]),
      ).rejects.toThrow(/repair/);
      await expect(
        call('private.duplicate_estimate', [
          f.org,
          f.c.draft_version_id,
          uid(),
        ]),
      ).rejects.toThrow(/repair/);
      await expect(
        call('private.revise_estimate', [
          f.org,
          f.c.estimate_id,
          f.c.draft_version_id,
        ]),
      ).rejects.toThrow();
      await expect(
        f.service.save(f.c, 1, {
          ...f.c.payload,
          lines: f.c.payload.lines.map((l) => ({ ...l, id: uid() })),
        }),
      ).rejects.toThrow(/repair/);
      const saved = await f.service.save(f.c, 1, {
        ...f.c.payload,
        terms: 'Explicit changed synthetic terms',
      });
      expect(saved.version.lock_revision).toBe(2);
      await expect(f.service.save(f.c, 1, f.c.payload)).rejects.toThrow(
        /changed/,
      );
    });
    it('saved quantity/cost/scope change stales history and rejects old review without erasing it', async () => {
      const f = await prepared(),
        r = await request(f);
      await f.service.appendReadiness({ reservation: f.c, review: r });
      await f.service.save(f.c, 1, {
        ...f.c.payload,
        lines: f.c.payload.lines.map((l) => ({
          ...l,
          quantity_milli: 9000,
          unit_cost_minor: 1200,
          description: 'Explicit revised measured scope',
        })),
      });
      expect(await f.service.readiness(f.c)).toMatchObject({
        confirmed: 0,
        sequence: 1,
      });
      expect(
        (await f.service.readiness(f.c)).sections.find((s) => s.id === 'scope')!
          .stale,
      ).toBe(true);
      await expect(
        f.service.appendReadiness({ reservation: f.c, review: r }),
      ).rejects.toThrow(/changed/);
    });
    it('tax policy changes invalidate prior confirmations and block current tax confirmation', async () => {
      const f = await prepared();
      await f.service.appendReadiness({
        reservation: f.c,
        review: await request(f),
      });
      await db.query(
        'update public.estimate_tax_policies set rate_bps=500 where id=$1',
        [f.policy],
      );
      expect((await f.service.readiness(f.c)).confirmed).toBe(0);
      await expect(
        f.service.appendReadiness({
          reservation: f.c,
          review: await request(f, 'tax'),
        }),
      ).rejects.toThrow(/outstanding/);
    });
    it('forged snapshot, wrong revision/sequence and missing measurements fail closed', async () => {
      const f = await prepared(),
        r = await request(f);
      for (const changed of [
        { ...r, snapshot: '{}' },
        { ...r, lock_revision: 2 },
        { ...r, expected_sequence: 9 },
        { ...r, section: 'measurements' as const },
      ])
        await expect(
          f.service.appendReadiness({ reservation: f.c, review: changed }),
        ).rejects.toThrow();
      expect((await counts(f)).reviews).toBe(0);
    });
    it('authenticated/anonymous/service roles have no table DML or trusted-writer execution', async () => {
      const f = await prepared();
      for (const role of ['authenticated', 'anon', 'service_role']) {
        await db.exec('set role ' + role);
        try {
          await expect(
            db.query('select maintenance_2b_test.append_review($1,$2,$3)', [
              f.c,
              {},
              {},
            ]),
          ).rejects.toThrow(/permission/);
          await expect(
            db.query('select * from maintenance_2b_test.reviews'),
          ).rejects.toThrow(/permission/);
          await expect(
            db.query(
              'insert into maintenance_2b_test.permits values($1,$2,txid_current())',
              [f.org, f.c.request_id],
            ),
          ).rejects.toThrow(/permission/);
        } finally {
          await db.exec('reset role');
        }
      }
    });
    it('review/reservation/event/receipt rows are append-only even under fixture-owner DML', async () => {
      const f = await prepared();
      await f.service.appendReadiness({
        reservation: f.c,
        review: await request(f),
      });
      for (const table of [
        'reservations',
        'events',
        'bindings',
        'reviews',
        'review_intents',
      ]) {
        await expect(
          db.query(
            `delete from maintenance_2b_test.${table} where organization_id=$1`,
            [f.org],
          ),
        ).rejects.toThrow();
        await expect(
          db.query(
            `update maintenance_2b_test.${table} set organization_id=organization_id where organization_id=$1`,
            [f.org],
          ),
        ).rejects.toThrow();
      }
    });
    it('lost finish response is reconciled after process restart with exactly one target', async () => {
      const f = await fixture();
      await f.service.reserve(f.c);
      await db.query('select maintenance_2b_test.claim($1)', [f.c]);
      const w = await child(f, 'finish_exit');
      expect((await w.done)[0], w.err()).toBe(0);
      const reader = await child(f, 'read');
      expect((await reader.done)[0], reader.err()).toBe(0);
      expect(JSON.parse(reader.out()).receipt.status).toBe('committed');
      await expect(f.service.prepareOnce(f.c)).rejects.toThrow(/never retries/);
      expect((await counts(f)).estimates).toBe(1);
    });
    it('crash before target transaction leaves durable attempting and missing target UNDETERMINED', async () => {
      const f = await fixture();
      await f.service.reserve(f.c);
      const w = await child(f, 'claim_exit');
      expect((await w.done)[0], w.err()).toBe(0);
      expect((await f.service.reconcile(f.c)).status).toBe('undetermined');
      await expect(f.service.prepareOnce(f.c)).rejects.toThrow(/never retries/);
      expect(await counts(f)).toMatchObject({
        estimates: 0,
        events: 2,
        bindings: 0,
      });
    });
    it('SIGKILL in open creation transaction rolls back target but retains prior durable claim; no retry', async () => {
      const f = await fixture();
      await f.service.reserve(f.c);
      await db.query('select maintenance_2b_test.claim($1)', [f.c]);
      await killOpen(f, 'finish_open');
      expect((await f.service.reconcile(f.c)).status).toBe('undetermined');
      expect(await counts(f)).toMatchObject({
        estimates: 0,
        events: 2,
        bindings: 0,
        permits: 0,
      });
      await expect(f.service.prepareOnce(f.c)).rejects.toThrow(/never retries/);
    });
    it('SIGKILL before reservation commit leaves absent receipt undetermined, never automatic recreation', async () => {
      const f = await fixture();
      await killOpen(f, 'reserve_open');
      expect((await f.service.reconcile(f.c)).status).toBe('undetermined');
      expect(await counts(f)).toMatchObject({ estimates: 0, events: 0 });
    });
    it.each(['membership', 'ban', 'expiry'])(
      'revocation %s during actual target lock wait denies readiness with zero receipt',
      async (kind) => {
        const f = await prepared(),
          r = await request(f),
          peer = await db.fork!(),
          hold = await db.fork!();
        try {
          const s = await actor(peer);
          const pid = (
            await peer.query<{ p: number }>('select pg_backend_pid() p')
          ).rows[0].p;
          await hold.exec('begin');
          await hold.query(
            'select id from public.estimate_versions where id=$1 for update',
            [f.c.draft_version_id],
          );
          const pending = s
            .appendReadiness({ reservation: f.c, review: r })
            .then(
              () => ({ ok: true }),
              (e) => ({ ok: false, error: String(e) }),
            );
          await waitLock(db, pid);
          if (kind === 'membership')
            await db.query(
              'update public.memberships set active=false where organization_id=$1 and user_id=$2',
              [f.org, owners[0]],
            );
          else if (kind === 'ban')
            await db.query(
              "update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1",
              [owners[0]],
            );
          else
            await db.query(
              "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
              [sessions.get(owners[0])],
            );
          await hold.exec('commit');
          expect((await pending).ok).toBe(false);
          expect((await counts(f)).reviews).toBe(0);
        } finally {
          await hold.exec('rollback');
          await peer.close();
          await hold.close();
          await db.query(
            'update public.memberships set active=true where organization_id=$1 and user_id=$2',
            [f.org, owners[0]],
          );
          await db.query(
            'update auth.users set banned_until=null where id=$1',
            [owners[0]],
          );
          await db.query(
            'update auth.sessions set not_after=null where id=$1',
            [sessions.get(owners[0])],
          );
        }
      },
    );
    it('retains an exact existing issued job baseline without mutating or revising it', async () => {
      const f = await fixture(0, true);
      const before = (
        await db.query<{ v: unknown }>(
          'select to_jsonb(v) v from public.estimate_versions v where id=$1',
          [f.c.job_baseline_version_id],
        )
      ).rows[0].v;
      await expect(
        f.service.reserve({ ...f.c, job_baseline_version_id: uid() }),
      ).rejects.toThrow(/baseline/);
      await f.service.reserve(f.c);
      await f.service.prepareOnce(f.c);
      const state = await f.service.read(f.c);
      expect(state.context.origin.job_id).toBe(f.c.job_id);
      expect(state.context.evidence.job_baseline_version_id).toBe(
        f.c.job_baseline_version_id,
      );
      expect(
        (
          await db.query<{ v: unknown }>(
            'select to_jsonb(v) v from public.estimate_versions v where id=$1',
            [f.c.job_baseline_version_id],
          )
        ).rows[0].v,
      ).toEqual(before);
      await expect(
        db.query(
          'update public.estimate_versions set payload=payload where id=$1',
          [f.c.job_baseline_version_id],
        ),
      ).rejects.toThrow(/immutable/);
    });
    it('referenced catalog changes stale retained history; unrelated company catalog does not', async () => {
      const f = await prepared(),
        catalog = uid();
      await db.query(
        "insert into public.catalog_items(id,organization_id,name,description,kind,unit,unit_cost_minor,unit_price_minor) values($1,$2,'Synthetic seal','Replace measured exterior joint seal','service','linear_ft',1000,2000)",
        [catalog, f.org],
      );
      const payload = structuredClone(f.c.payload);
      payload.lines[0].catalog_item_id = catalog;
      await f.service.save(f.c, 1, payload);
      await f.service.appendReadiness({
        reservation: f.c,
        review: await request(f, 'resources'),
      });
      await db.query(
        "insert into public.catalog_items(organization_id,name,kind,unit,unit_cost_minor) values($1,'Unrelated catalog','material','each',1000)",
        [orgs[1]],
      );
      expect((await f.service.readiness(f.c)).confirmed).toBe(1);
      await db.query(
        'update public.catalog_items set unit_cost_minor=1200 where id=$1',
        [catalog],
      );
      expect((await f.service.readiness(f.c)).confirmed).toBe(0);
      await db.query(
        'update public.catalog_items set active=false where id=$1',
        [catalog],
      );
      await expect(
        f.service.appendReadiness({
          reservation: f.c,
          review: await request(f, 'resources'),
        }),
      ).rejects.toThrow(/outstanding/);
    });
    it('readiness intent is durable before append; lost response reconciles by exact request after process restart', async () => {
      const f = await prepared(),
        r = await request(f),
        state = await f.service.read(f.c),
        review = recordRepairReadiness(
          state.context,
          state.history,
          state.actor,
          r,
        ).review;
      await db.query('select maintenance_2b_test.review_intent($1,$2)', [
        f.c,
        r,
      ]);
      const w = await child(f, 'review_exit', review);
      expect((await w.done)[0], w.err()).toBe(0);
      const reader = await child(f, 'read');
      expect((await reader.done)[0], reader.err()).toBe(0);
      expect(JSON.parse(reader.out()).state.history).toHaveLength(1);
      expect(
        await f.service.reconcileReadiness({ reservation: f.c, review: r }),
      ).toMatchObject({
        status: 'committed',
        review: { sequence: 1, request: r },
      });
      expect((await counts(f)).reviews).toBe(1);
    });
    it('interrupted open readiness append retains UNKNOWN intent and rolls back evidence without retry', async () => {
      const f = await prepared(),
        r = await request(f),
        state = await f.service.read(f.c),
        review = recordRepairReadiness(
          state.context,
          state.history,
          state.actor,
          r,
        ).review;
      await db.query('select maintenance_2b_test.review_intent($1,$2)', [
        f.c,
        r,
      ]);
      const w = await child(f, 'review_open', review);
      try {
        for (let n = 0; n < 200 && !w.out().includes('UNCOMMITTED'); n++) {
          if (w.err()) throw Error(w.err());
          await new Promise((v) => setTimeout(v, 20));
        }
        expect(w.out()).toContain('UNCOMMITTED');
        w.p.kill('SIGKILL');
        await w.done;
      } finally {
        if (w.p.exitCode === null && w.p.signalCode === null)
          w.p.kill('SIGKILL');
      }
      expect(
        await f.service.reconcileReadiness({ reservation: f.c, review: r }),
      ).toEqual({ status: 'undetermined' });
      await expect(
        f.service.appendReadiness({ reservation: f.c, review: r }),
      ).rejects.toThrow(/UNKNOWN/);
      expect((await counts(f)).reviews).toBe(0);
    });
    it('account deletion committed during native preparation settings wait prevents target creation', async () => {
      const f = await fixture(),
        peer = await db.fork!(),
        hold = await db.fork!();
      await f.service.reserve(f.c);
      try {
        await actor(peer);
        await db.query('select maintenance_2b_test.claim($1)', [f.c]);
        await hold.exec('begin');
        await hold.query(
          'select organization_id from public.company_settings where organization_id=$1 for update',
          [f.org],
        );
        const pid = (
          await peer.query<{ p: number }>('select pg_backend_pid() p')
        ).rows[0].p;
        const pending = peer
          .query('select maintenance_2b_test.finish($1)', [f.c])
          .then(
            () => true,
            () => false,
          );
        await waitLock(db, pid);
        await db.query(
          'update auth.users set deleted_at=clock_timestamp() where id=$1',
          [owners[0]],
        );
        await hold.exec('commit');
        expect(await pending).toBe(false);
        expect((await counts(f)).estimates).toBe(0);
      } finally {
        await hold.exec('rollback');
        await peer.close();
        await hold.close();
        await db.query('update auth.users set deleted_at=null where id=$1', [
          owners[0],
        ]);
      }
      expect((await f.service.reconcile(f.c)).status).toBe('undetermined');
    });
    it('every fixture table is private/RLS forced; every FK has a tenant-leading index', async () => {
      const tables = (
        await db.query<{
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          `select relrowsecurity,relforcerowsecurity from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='maintenance_2b_test' and t.relkind='r'`,
        )
      ).rows;
      expect(tables).toHaveLength(6);
      expect(
        tables.every((t) => t.relrowsecurity && t.relforcerowsecurity),
      ).toBe(true);
      const missing = (
        await db.query<{ name: string }>(
          `select c.conname name from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='maintenance_2b_test' and c.contype='f' and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey)`,
        )
      ).rows;
      expect(missing).toEqual([]);
    });
    it('an outstanding readiness intent blocks replacement UUIDs and remains private published evidence is unchanged', async () => {
      const f = await prepared(),
        r = await request(f);
      const report = (
        await db.query<{ snapshot: unknown }>(
          'select snapshot from private.inspection_reports where id=$1',
          [f.c.source.report_id],
        )
      ).rows[0].snapshot;
      await db.query('select maintenance_2b_test.review_intent($1,$2)', [
        f.c,
        r,
      ]);
      await expect(
        f.service.appendReadiness({
          reservation: f.c,
          review: { ...r, request_id: uid() },
        }),
      ).rejects.toThrow(/UNKNOWN/);
      expect(
        (await f.service.reconcileReadiness({ reservation: f.c, review: r }))
          .status,
      ).toBe('undetermined');
      expect(
        (
          await db.query<{ snapshot: unknown }>(
            'select snapshot from private.inspection_reports where id=$1',
            [f.c.source.report_id],
          )
        ).rows[0].snapshot,
      ).toEqual(report);
      expect(JSON.stringify(report)).not.toMatch(
        /PRIVATE|attested|unit_cost_minor|staff_type|payroll|review_intents/,
      );
    });
    it('valid but unrelated property/customer/report identities cannot be recombined', async () => {
      const a = await fixture(),
        b = await fixture();
      const c = {
        ...a.c,
        source: {
          ...a.c.source,
          customer_id: b.customer,
          location_id: b.location,
        },
        payload: {
          ...a.c.payload,
          customer_id: b.customer,
          location_id: b.location,
        },
      };
      await expect(a.service.reserve(c)).rejects.toThrow(/source/);
      expect((await counts(a)).events).toBe(0);
    });
    it('same-company current office staff can append under existing AAL1 role rules; field staff cannot', async () => {
      const f = await prepared(),
        r = await request(f);
      const s = await actor(db, staff[0], 'aal1');
      expect(
        await s.appendReadiness({ reservation: f.c, review: r }),
      ).toMatchObject({ actor: staff[0], sequence: 1 });
      const second = await request(f, 'terms');
      await actor(db, field);
      await expect(
        f.service.appendReadiness({ reservation: f.c, review: second }),
      ).rejects.toThrow();
      await actor();
    });
    it('expired JWT after real native lock wait denies final readiness append', async () => {
      const f = await prepared(),
        r = await request(f),
        peer = await db.fork!(),
        hold = await db.fork!();
      try {
        const exp = Math.floor(Date.now() / 1000) + 2,
          s = await actor(peer, owners[0], 'aal2', exp);
        const pid = (
          await peer.query<{ p: number }>('select pg_backend_pid() p')
        ).rows[0].p;
        await hold.exec('begin');
        await hold.query(
          'select id from public.estimate_versions where id=$1 for update',
          [f.c.draft_version_id],
        );
        const pending = s.appendReadiness({ reservation: f.c, review: r }).then(
          () => true,
          () => false,
        );
        await waitLock(db, pid);
        await new Promise((v) =>
          setTimeout(v, Math.max(1, exp * 1000 - Date.now() + 100)),
        );
        await hold.exec('commit');
        expect(await pending).toBe(false);
        expect((await counts(f)).reviews).toBe(0);
      } finally {
        await hold.exec('rollback');
        await peer.close();
        await hold.close();
      }
    });
    it('ordinary parent archive and forged customer/saved-line replacement cannot escape repair hold', async () => {
      const f = await prepared();
      await expect(
        call('private.archive_estimate', [f.org, f.c.estimate_id, true]),
      ).rejects.toThrow(/repair/);
      const other = await fixture();
      await expect(
        f.service.save(f.c, 1, {
          ...f.c.payload,
          customer_id: other.customer,
          location_id: other.location,
        }),
      ).rejects.toThrow(/repair/);
      expect((await counts(f)).permits).toBe(0);
    });
    it('read-only exact-target reconciliation checks membership after its target lock wait without writes', async () => {
      const f = await prepared(),
        peer = await db.fork!(),
        hold = await db.fork!(),
        before = await counts(f);
      try {
        const service = await actor(peer),
          pid = (await peer.query<{ p: number }>('select pg_backend_pid() p'))
            .rows[0].p;
        await hold.exec('begin');
        await hold.query(
          'select id from public.estimate_versions where id=$1 for update',
          [f.c.draft_version_id],
        );
        const pending = service.reconcile(f.c).then(
          () => true,
          () => false,
        );
        await waitLock(db, pid);
        await db.query(
          'update public.memberships set active=false where organization_id=$1 and user_id=$2',
          [f.org, owners[0]],
        );
        await hold.exec('commit');
        expect(await pending).toBe(false);
        expect(await counts(f)).toEqual(before);
      } finally {
        await hold.exec('rollback');
        await peer.close();
        await hold.close();
        await db.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, owners[0]],
        );
      }
    });
  },
);
