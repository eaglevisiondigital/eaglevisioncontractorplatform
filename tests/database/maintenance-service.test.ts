import {
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { Client } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'vite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { NativeMaintenanceFixture } from '../helpers/maintenance-native-store';
import { NativeRepairService } from '../helpers/repair-native-service';
import type { RepairReservationRequest } from '../../server/property/repair-persistence';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import {
  recordRepairReadiness,
  repairReadinessSnapshot,
  type RepairReadinessRequest,
} from '../../src/domain/property/repair-readiness';
import {
  CommandCustody,
  custodyIdentity,
  type CustodyCommand,
} from '../../server/property/command-custody';
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

let bundleDir: string;
const roles: string[] = [],
  roots: string[] = [],
  children = new Set<ChildProcessWithoutNullStreams>();
const privateRoot = () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'propel-2c-custody-'));
  roots.push(root);
  return root;
};
async function connectRole(role: string) {
  const socket = process.env.EV_TEST_PG_SOCKET;
  const c = new Client(
    socket
      ? { host: socket, port: 55477, user: role, database }
      : {
          host: '127.0.0.1',
          port: 5432,
          user: role,
          password: 'synthetic-2c-only',
          database,
        },
  );
  await c.connect();
  return c;
}
async function capability(
  f: Fixture,
  value: CustodyCommand,
  user = owners[f.index],
  seconds = 300,
) {
  const id = uid(),
    role = 'maintenance_2c_user_' + uid().replaceAll('-', '');
  roles.push(role);
  await db.exec(
    `create role ${role} login password 'synthetic-2c-only' nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  );
  await db.exec(
    `grant usage on schema maintenance_2c_test to ${role};grant execute on function maintenance_2c_test.command(uuid,text,jsonb) to ${role}`,
  );
  let approved = null;
  if (value.kind === 'readiness') {
    await actor(db, user);
    const state = await new NativeRepairService(db).read(
      value.command.reservation,
    );
    approved = recordRepairReadiness(
      state.context,
      state.history,
      state.actor,
      value.command.review,
    ).review;
  }
  await db.query(
    "insert into maintenance_2c_test.capabilities(id,organization_id,login_name,actor_id,session_id,aal,purpose,command,approved_review,expires_at) values($1,$2,$3,$4,$5,'aal2',$6,$7,$8,clock_timestamp()+make_interval(secs=>$9))",
    [
      id,
      f.org,
      role,
      user,
      sessions.get(user),
      value.kind,
      value.command,
      approved,
      seconds,
    ],
  );
  return { id, role };
}
function editCommand(f: Fixture): CustodyCommand {
  return {
    kind: 'maintenance',
    command: {
      request_id: uid(),
      source: f.c.source,
      expected_revision: 1,
      action: 'edit',
      input: {
        priority: 'high',
        assignee_id: staff[f.index],
        follow_up_on: '2026-11-20',
        review: 'reviewed',
        note: 'PRIVATE 2C follow-up evidence; no repair authority',
      },
    },
  };
}
interface Message {
  status: string;
  boundary?: string;
  receipt?: Record<string, unknown>;
  current_review?: { confirmed: number; ready: boolean };
}
async function service(
  cap: { id: string; role: string },
  root = privateRoot(),
  fault = '',
) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    EV_TEST_PG_SOCKET: process.env.EV_TEST_PG_SOCKET,
    CI: process.env.CI,
    EV_TEST_PG_CI: process.env.EV_TEST_PG_CI,
    MAINT_SERVICE_DATABASE: database,
    MAINT_SERVICE_ROLE: cap.role,
    MAINT_SERVICE_CAPABILITY: cap.id,
    MAINT_SERVICE_CUSTODY: root,
    MAINT_SERVICE_PASSWORD: 'synthetic-2c-only',
    MAINT_SERVICE_FAULT: fault,
  };
  const p = spawn(process.execPath, [join(bundleDir, 'service.mjs')], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(p);
  const exited = once(p, 'exit');
  let stderr = '';
  p.stderr.on('data', (b) => (stderr += b));
  const queue: Message[] = [],
    waiters: ((v: Message) => void)[] = [];
  createInterface({ input: p.stdout }).on('line', (line) => {
    const m = JSON.parse(line) as Message;
    if (waiters.length) waiters.shift()!(m);
    else queue.push(m);
  });
  const next = () =>
    new Promise<Message>((resolve, reject) => {
      if (queue.length) {
        resolve(queue.shift()!);
        return;
      }
      const timer = setTimeout(
        () => reject(Error('Local service protocol timeout: ' + stderr)),
        12000,
      );
      waiters.push((v) => {
        clearTimeout(timer);
        resolve(v);
      });
    });
  const first = await next();
  expect(first.status).toBe('ready');
  return {
    root,
    p,
    next,
    send(operation: 'execute' | 'reconcile', command: CustodyCommand) {
      p.stdin.write(JSON.stringify({ operation, command }) + '\n');
      return next();
    },
    async stop() {
      p.stdin.end();
      await exited;
      children.delete(p);
    },
    async kill() {
      p.kill('SIGKILL');
      await exited;
      children.delete(p);
    },
  };
}
async function count(f: Fixture) {
  return (
    await db.query<{
      estimates: number;
      reviews: number;
      visits: number;
      maintenance: number;
    }>(
      `select (select count(*)::integer from public.estimates where organization_id=$1 and id=$2) estimates,(select count(*)::integer from maintenance_2b_test.reviews where organization_id=$1 and reservation_id=$3) reviews,(select count(*)::integer from private.inspection_visits where organization_id=$1 and plan_id=$4) visits,(select revision from maintenance_2a_test.items where organization_id=$1 and report_id=$5) maintenance`,
      [f.org, f.c.estimate_id, f.c.request_id, f.plan, f.c.source.report_id],
    )
  ).rows[0];
}
function custody(root: string, id: string) {
  const j = new CommandCustody(root);
  try {
    return j.read(id);
  } finally {
    j.close();
  }
}
async function waitLock(d: TestDatabase, pid: number) {
  for (let n = 0; n < 150; n++) {
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
  throw Error('Real resource lock wait required');
}

describe.skipIf(!native)(
  'native PostgreSQL17 · Workstream2C local service/custody',
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
      for (const f of [
        'maintenance-contract.sql',
        'repair-contract.sql',
        'maintenance-service.sql',
      ])
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

      mkdirSync('artifacts', { recursive: true });
      bundleDir = mkdtempSync(resolve('artifacts/maintenance-service-'));
      await build({
        configFile: false,
        envDir: false,
        logLevel: 'silent',
        build: {
          ssr: resolve('tests/helpers/maintenance-command-process.ts'),
          target: 'node24',
          outDir: bundleDir,
          emptyOutDir: false,
          rolldownOptions: { output: { entryFileNames: 'service.mjs' } },
        },
      });
    }, 30000);
    afterAll(async () => {
      for (const p of children) {
        p.kill('SIGKILL');
        await once(p, 'exit');
      }
      children.clear();
      for (const r of roles) {
        await db.exec('drop owned by ' + r);
        await db.exec('drop role ' + r);
      }
      if (database) {
        const role = 'maintenance_2c_exec_' + database.slice(8);
        await db.exec('drop owned by ' + role + ' cascade');
        await db.exec('drop role ' + role);
      }
      await db?.close();
      if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    });
    it.each([0, 1, 2])(
      'runs a restricted maintenance process with durable custody for company %s',
      async (index) => {
        const f = await fixture(index),
          value = editCommand(f),
          cap = await capability(f, value),
          s = await service(cap);
        try {
          const result = await s.send('execute', value);
          expect(result.status).toBe('committed');
          expect(result.receipt?.actor_id).toBe(owners[index]);
          expect((await count(f)).maintenance).toBe(2);
          const saved = custody(s.root, custodyIdentity(value).id);
          expect(saved?.events.map((e) => e.kind)).toEqual([
            'retained',
            'transmitting',
            'acknowledged',
          ]);
        } finally {
          await s.stop();
        }
      },
    );
    it('composes explicit follow-up once, including exact duplicate reconciliation', async () => {
      const f = await fixture();
      await new NativeMaintenanceFixture(db).execute({
        request_id: uid(),
        source: f.c.source,
        expected_revision: 1,
        action: 'edit',
        input: {
          priority: 'normal',
          assignee_id: null,
          follow_up_on: '',
          review: 'pending',
          note: 'Explicit pending follow-up review',
        },
      });
      const value: CustodyCommand = {
        kind: 'maintenance',
        command: {
          request_id: uid(),
          source: f.c.source,
          expected_revision: 2,
          action: 'follow_up',
          input: {
            plan_id: f.plan,
            plan_revision: 1,
            visited_on: '2026-11-21',
          },
        },
      };
      const cap = await capability(f, value),
        s = await service(cap);
      try {
        expect((await s.send('execute', value)).status).toBe('committed');
        const before = await count(f);
        expect((await s.send('execute', value)).status).toBe('committed');
        expect(await count(f)).toEqual(before);
        expect(before.visits).toBe(2);
      } finally {
        await s.stop();
      }
    });
    it('composes reservation/create and reconciles after complete process restart with no second estimate', async () => {
      const f = await fixture(),
        value: CustodyCommand = { kind: 'repair', command: f.c },
        cap = await capability(f, value),
        root = privateRoot(),
        s = await service(cap, root);
      expect((await s.send('execute', value)).status).toBe('committed');
      await s.kill();
      const restarted = await service(cap, root);
      try {
        expect((await restarted.send('execute', value)).status).toBe(
          'committed',
        );
        expect((await count(f)).estimates).toBe(1);
        expect(
          custody(root, f.c.request_id)
            ?.events.filter((e) => e.kind === 'transmitting')
            .map((e) => e.stage),
        ).toEqual(['reserve', 'prepare']);
      } finally {
        await restarted.stop();
      }
    });
    it('runs canonical readiness validation through the restricted SQL gateway', async () => {
      const f = await prepared(),
        r = await request(f),
        value: CustodyCommand = {
          kind: 'readiness',
          command: { reservation: f.c, review: r },
        },
        cap = await capability(f, value),
        s = await service(cap);
      try {
        expect((await s.send('execute', value)).status).toBe('committed');
        expect((await count(f)).reviews).toBe(1);
        expect((await s.send('reconcile', value)).status).toBe('committed');
      } finally {
        await s.stop();
      }
    });
    it('service LOGIN cannot reach application/private tables, raw functions, roles, DDL or capability grants', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        client = await connectRole(cap.role);
      try {
        const role = (
          await client.query(
            'select rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname=session_user',
          )
        ).rows[0];
        expect(Object.values(role).every((v) => v === false)).toBe(true);
        for (const sql of [
          'select * from public.customers',
          'select * from private.inspection_reports',
          'select * from maintenance_2a_test.items',
          'select * from maintenance_2b_test.reviews',
          'select * from maintenance_2c_test.capabilities',
          "select maintenance_2b_test.finish('{}')",
          'set role authenticated',
          'set role ev_test',
          'create role should_never_exist',
          'create table maintenance_2c_test.injected(x int)',
        ])
          await expect(client.query(sql)).rejects.toThrow();
        const executor = 'maintenance_2c_exec_' + database.slice(8);
        await expect(client.query('set role ' + executor)).rejects.toThrow();
        await expect(
          client.query('select maintenance_2c_test.capability($1)', [cap.id]),
        ).rejects.toThrow(/permission/);
        await expect(
          client.query('select maintenance_2c_test.command($1,$2,$3)', [
            cap.id,
            'issue_estimate',
            JSON.stringify([value.command]),
          ]),
        ).rejects.toThrow();
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await client.end();
      }
    });
    it('caller GUC/role/organization/actor substitution and temporary search-path shadowing confer no authority', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        client = await connectRole(cap.role);
      try {
        await client.query("select set_config('request.jwt.claims',$1,false)", [
          claims(owners[1]),
        ]);
        await client.query(
          "select set_config('search_path','pg_temp,public',false)",
        );
        const result = (
          await client.query('select maintenance_2c_test.command($1,$2,$3) v', [
            cap.id,
            'execute',
            JSON.stringify([value.command]),
          ])
        ).rows[0].v;
        expect(result.actor_id).toBe(owners[0]);
        const changed = { ...value.command, actor_id: owners[1] };
        await expect(
          client.query('select maintenance_2c_test.command($1,$2,$3)', [
            cap.id,
            'execute',
            JSON.stringify([changed]),
          ]),
        ).rejects.toThrow();
        await expect(
          client.query('select maintenance_2c_test.command($1,$2,$3)', [
            cap.id,
            'execute',
            JSON.stringify([
              {
                ...value.command,
                source: { ...f.c.source, organization_id: orgs[1] },
              },
            ]),
          ]),
        ).rejects.toThrow();
      } finally {
        await client.end();
      }
    });
    it('another restricted LOGIN cannot use an exact capability bound to the original connection identity', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        other = await capability(f, value, staff[0]),
        client = await connectRole(other.role);
      try {
        await expect(
          client.query('select maintenance_2c_test.command($1,$2,$3)', [
            cap.id,
            'execute',
            JSON.stringify([value.command]),
          ]),
        ).rejects.toThrow(/capability/);
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await client.end();
      }
    });
    it.each(['before_intent', 'after_intent', 'after_transmit'])(
      'actual service loss at %s retains original edit custody without replay',
      async (fault) => {
        const f = await fixture(),
          value = editCommand(f),
          cap = await capability(f, value),
          root = privateRoot(),
          s = await service(cap, root, fault),
          id = custodyIdentity(value).id;
        expect((await s.send('execute', value)).boundary).toBe(fault);
        await s.kill();
        const before = await count(f),
          saved = custody(root, id);
        expect(saved === null).toBe(fault === 'before_intent');
        const restarted = await service(cap, root);
        try {
          const result = await restarted.send('reconcile', value);
          expect(result.status).toBe(
            fault === 'before_intent'
              ? 'rejected'
              : fault === 'after_transmit'
                ? 'committed'
                : 'undetermined',
          );
          expect(await count(f)).toEqual(before);
          if (fault !== 'before_intent') {
            await restarted.send('execute', value);
            expect(await count(f)).toEqual(before);
          }
        } finally {
          await restarted.stop();
        }
      },
    );
    it.each([
      'after_reservation_commit',
      'after_reserve',
      'during_creation',
      'after_creation_commit',
    ])(
      'repair service termination at %s never manufactures a second target',
      async (fault) => {
        const f = await fixture(),
          value: CustodyCommand = { kind: 'repair', command: f.c },
          cap = await capability(f, value),
          root = privateRoot(),
          s = await service(cap, root, fault);
        expect((await s.send('execute', value)).boundary).toBe(fault);
        await s.kill();
        const restarted = await service(cap, root);
        try {
          const result = await restarted.send('reconcile', value);
          expect(result.status).toBe(
            fault === 'after_creation_commit' ? 'committed' : 'undetermined',
          );
          const before = await count(f);
          expect(before.estimates).toBe(
            fault === 'after_creation_commit' ? 1 : 0,
          );
          await restarted.send('execute', value);
          expect(await count(f)).toEqual(before);
          expect(custody(root, f.c.request_id)?.intent.command_text).toContain(
            f.c.estimate_id,
          );
        } finally {
          await restarted.stop();
        }
      },
    );
    it('open readiness append rolls back on whole-service SIGKILL; retained intent blocks replacement IDs', async () => {
      const f = await prepared(),
        r = await request(f),
        value: CustodyCommand = {
          kind: 'readiness',
          command: { reservation: f.c, review: r },
        },
        cap = await capability(f, value),
        root = privateRoot(),
        s = await service(cap, root, 'during_readiness');
      expect((await s.send('execute', value)).boundary).toBe(
        'during_readiness',
      );
      await s.kill();
      const restarted = await service(cap, root);
      try {
        expect((await restarted.send('reconcile', value)).status).toBe(
          'undetermined',
        );
        await restarted.send('execute', value);
        expect((await count(f)).reviews).toBe(0);
      } finally {
        await restarted.stop();
      }
      const replacement: CustodyCommand = {
          kind: 'readiness',
          command: { ...value.command, review: { ...r, request_id: uid() } },
        },
        nextCap = await capability(f, replacement),
        next = await service(nextCap, root);
      try {
        expect((await next.send('execute', replacement)).status).toBe(
          'rejected',
        );
        expect((await count(f)).reviews).toBe(0);
      } finally {
        await next.stop();
      }
    });
    it('committed readiness remains historical after restart and saved-draft change; no cached 6/6 authority', async () => {
      const f = await prepared(),
        r = await request(f),
        value: CustodyCommand = {
          kind: 'readiness',
          command: { reservation: f.c, review: r },
        },
        cap = await capability(f, value),
        root = privateRoot(),
        s = await service(cap, root, 'after_transmit');
      expect((await s.send('execute', value)).boundary).toBe('after_transmit');
      await s.kill();
      await actor();
      await f.service.save(f.c, 1, {
        ...f.c.payload,
        terms: 'Explicit changed synthetic proposed terms',
      });
      const restarted = await service(cap, root);
      try {
        const result = await restarted.send('reconcile', value);
        expect(result.status).toBe('committed');
        expect(result.current_review).toMatchObject({
          confirmed: 0,
          ready: false,
        });
        expect((await count(f)).reviews).toBe(1);
      } finally {
        await restarted.stop();
      }
    });
    it('restart after staff revocation denies reconciliation without changing retained evidence', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        root = privateRoot(),
        s = await service(cap, root, 'after_transmit');
      expect((await s.send('execute', value)).boundary).toBe('after_transmit');
      await s.kill();
      await db.query(
        'update public.memberships set active=false where organization_id=$1 and user_id=$2',
        [f.org, owners[0]],
      );
      try {
        const restarted = await service(cap, root);
        try {
          expect((await restarted.send('reconcile', value)).status).toBe(
            'rejected',
          );
          expect(
            custody(root, custodyIdentity(value).id)?.events.at(-1)?.kind,
          ).toBe('transmitting');
          expect((await count(f)).maintenance).toBe(2);
        } finally {
          await restarted.stop();
        }
      } finally {
        await db.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, owners[0]],
        );
      }
    });
    it.each(['membership', 'ban', 'session', 'capability'])(
      'administrative %s revocation committed during a real prelocked item wait denies completion',
      async (kind) => {
        const f = await fixture(),
          value = editCommand(f),
          cap = await capability(f, value),
          hold = await db.fork!(),
          client = await connectRole(cap.role);
        try {
          await hold.exec('begin');
          await hold.query(
            'select id from maintenance_2a_test.items where organization_id=$1 and report_id=$2 for update',
            [f.org, f.c.source.report_id],
          );
          const pid = (await client.query('select pg_backend_pid() id')).rows[0]
            .id;
          const pending = client
            .query('select maintenance_2c_test.command($1,$2,$3)', [
              cap.id,
              'execute',
              JSON.stringify([value.command]),
            ])
            .then(
              () => true,
              () => false,
            );
          await waitLock(db, pid);
          if (kind === 'membership')
            await hold.query(
              'update public.memberships set active=false where organization_id=$1 and user_id=$2',
              [f.org, owners[0]],
            );
          else if (kind === 'ban')
            await hold.query(
              "update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1",
              [owners[0]],
            );
          else if (kind === 'session')
            await hold.query(
              "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
              [sessions.get(owners[0])],
            );
          else
            await hold.query(
              'update maintenance_2c_test.capabilities set revoked_at=clock_timestamp() where id=$1',
              [cap.id],
            );
          await hold.exec('commit');
          expect(await pending).toBe(false);
          expect((await count(f)).maintenance).toBe(1);
        } finally {
          await hold.exec('rollback');
          await client.end();
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
    it('a real SQLite writer lock makes custody fail closed before any remote mutation', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        root = privateRoot(),
        s = await service(cap, root),
        lock = new DatabaseSync(join(root, 'commands.sqlite'));
      try {
        lock.exec('begin immediate');
        expect((await s.send('execute', value)).status).toBe('rejected');
        expect((await count(f)).maintenance).toBe(1);
        lock.exec('rollback');
        expect(custody(root, custodyIdentity(value).id)).toBeNull();
      } finally {
        try {
          lock.exec('rollback');
        } catch {
          /* Already rolled back. */
        }
        lock.close();
        await s.stop();
      }
    });
    it('two independent processes sharing custody can transmit an edit only once', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        root = privateRoot(),
        first = await service(cap, root),
        second = await service(cap, root);
      try {
        const r = await Promise.all([
          first.send('execute', value),
          second.send('execute', value),
        ]);
        expect(r.some((v) => v.status === 'committed')).toBe(true);
        expect((await count(f)).maintenance).toBe(2);
        expect(
          custody(root, custodyIdentity(value).id)?.events.filter(
            (e) => e.kind === 'transmitting',
          ),
        ).toHaveLength(1);
      } finally {
        await first.stop();
        await second.stop();
      }
    });
    it('a lost follow-up acknowledgment reconciles the original one visit after process restart', async () => {
      const f = await fixture();
      await new NativeMaintenanceFixture(db).execute({
        request_id: uid(),
        source: f.c.source,
        expected_revision: 1,
        action: 'edit',
        input: {
          priority: 'normal',
          assignee_id: null,
          follow_up_on: '',
          review: 'pending',
          note: 'Explicit pending synthetic follow-up',
        },
      });
      const value: CustodyCommand = {
          kind: 'maintenance',
          command: {
            request_id: uid(),
            source: f.c.source,
            expected_revision: 2,
            action: 'follow_up',
            input: {
              plan_id: f.plan,
              plan_revision: 1,
              visited_on: '2026-11-25',
            },
          },
        },
        cap = await capability(f, value),
        root = privateRoot(),
        s = await service(cap, root, 'after_transmit');
      expect((await s.send('execute', value)).boundary).toBe('after_transmit');
      await s.kill();
      const restarted = await service(cap, root);
      try {
        expect((await restarted.send('reconcile', value)).status).toBe(
          'committed',
        );
        await restarted.send('execute', value);
        expect((await count(f)).visits).toBe(2);
      } finally {
        await restarted.stop();
      }
    });
    it('a changed inspection-plan revision committed during the shared lock order stops reservation', async () => {
      const f = await fixture(),
        value: CustodyCommand = { kind: 'repair', command: f.c },
        cap = await capability(f, value),
        hold = await db.fork!(),
        client = await connectRole(cap.role);
      try {
        await hold.exec('begin');
        await hold.query(
          'select id from private.inspection_plans where id=$1 for update',
          [f.plan],
        );
        const pid = (await client.query('select pg_backend_pid() id')).rows[0]
          .id;
        const pending = client
          .query('select maintenance_2c_test.command($1,$2,$3)', [
            cap.id,
            'reserve',
            JSON.stringify([value.command]),
          ])
          .then(
            () => true,
            () => false,
          );
        await waitLock(db, pid);
        await hold.query(
          'update private.inspection_plans set lock_revision=lock_revision+1 where id=$1',
          [f.plan],
        );
        await hold.exec('commit');
        expect(await pending).toBe(false);
        expect((await count(f)).estimates).toBe(0);
      } finally {
        await hold.exec('rollback');
        await client.end();
        await hold.close();
      }
    });
    it('actual capability wall-clock expiry while waiting prevents completion', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value, owners[0], 2),
        hold = await db.fork!(),
        client = await connectRole(cap.role);
      try {
        await hold.exec('begin');
        await hold.query(
          'select id from maintenance_2a_test.items where report_id=$1 for update',
          [f.c.source.report_id],
        );
        const pid = (await client.query('select pg_backend_pid() id')).rows[0]
          .id;
        const pending = client
          .query('select maintenance_2c_test.command($1,$2,$3)', [
            cap.id,
            'execute',
            JSON.stringify([value.command]),
          ])
          .then(
            () => true,
            () => false,
          );
        await waitLock(db, pid);
        await new Promise((v) => setTimeout(v, 2100));
        await hold.exec('commit');
        expect(await pending).toBe(false);
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await hold.exec('rollback');
        await client.end();
        await hold.close();
      }
    });
    it('raw SQL cannot forge a different readiness section, measurements or a stored ready counter', async () => {
      const f = await prepared(),
        r = await request(f),
        value: CustodyCommand = {
          kind: 'readiness',
          command: { reservation: f.c, review: r },
        },
        cap = await capability(f, value),
        client = await connectRole(cap.role);
      try {
        await actor();
        const state = await f.service.read(f.c),
          review = recordRepairReadiness(
            state.context,
            state.history,
            state.actor,
            r,
          ).review;
        await client.query('select maintenance_2c_test.command($1,$2,$3)', [
          cap.id,
          'review_intent',
          JSON.stringify([f.c, r]),
        ]);
        for (const forged of [
          { ...review, ready: 6 },
          { ...review, actor: staff[0] },
          { ...review, request: { ...r, section: 'terms' } },
          {
            ...review,
            request: {
              ...r,
              input: { ...r.input, note: 'Different internal review' },
            },
          },
        ])
          await expect(
            client.query('select maintenance_2c_test.command($1,$2,$3)', [
              cap.id,
              'append_review',
              JSON.stringify([f.c, state, forged]),
            ]),
          ).rejects.toThrow();
        expect((await count(f)).reviews).toBe(0);
      } finally {
        await client.end();
      }
    });
    it('ordinary client roles cannot use the gateway; its NOLOGIN owner has no application DML or grant authority', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value);
      for (const role of ['authenticated', 'anon', 'service_role']) {
        await db.exec('set role ' + role);
        try {
          await expect(
            db.query('select maintenance_2c_test.command($1,$2,$3)', [
              cap.id,
              'execute',
              JSON.stringify([value.command]),
            ]),
          ).rejects.toThrow(/permission/);
        } finally {
          await db.exec('reset role');
        }
      }
      const owner = (
        await db.query<{
          rolcanlogin: boolean;
          rolsuper: boolean;
          rolcreaterole: boolean;
          rolbypassrls: boolean;
          dml: boolean;
          proconfig: string[];
        }>(
          `select r.rolcanlogin,r.rolsuper,r.rolcreaterole,r.rolbypassrls,has_table_privilege(r.oid,'public.estimates','INSERT,UPDATE,DELETE') dml,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='maintenance_2c_test' and p.proname='command'`,
        )
      ).rows[0];
      expect(owner).toMatchObject({
        rolcanlogin: false,
        rolsuper: false,
        rolcreaterole: false,
        rolbypassrls: false,
        dml: false,
      });
      expect(owner.proconfig).toContain('search_path=""');
    });
    it('current same-company membership is required even for a valid restricted test capability', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value, field),
        s = await service(cap);
      try {
        expect((await s.send('execute', value)).status).toBe('undetermined');
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await s.stop();
      }
    });
    it('internal custody, notes and costs do not mutate or enter the exact published report', async () => {
      const f = await fixture(),
        before = (
          await db.query<{ snapshot: unknown }>(
            'select snapshot from private.inspection_reports where id=$1',
            [f.c.source.report_id],
          )
        ).rows[0].snapshot,
        value = editCommand(f),
        cap = await capability(f, value),
        s = await service(cap);
      try {
        expect((await s.send('execute', value)).status).toBe('committed');
        const after = (
          await db.query<{ snapshot: unknown }>(
            'select snapshot from private.inspection_reports where id=$1',
            [f.c.source.report_id],
          )
        ).rows[0].snapshot;
        expect(after).toEqual(before);
        expect(JSON.stringify(after)).not.toMatch(
          /PRIVATE|custody|unit_cost_minor|payroll|capability/,
        );
      } finally {
        await s.stop();
      }
    });
    it('maintenance and readiness resource commands serialize without partial or duplicate evidence', async () => {
      const f = await prepared(),
        edit = editCommand(f),
        r = await request(f),
        review: CustodyCommand = {
          kind: 'readiness',
          command: { reservation: f.c, review: r },
        },
        editCap = await capability(f, edit),
        reviewCap = await capability(f, review),
        one = await service(editCap),
        two = await service(reviewCap);
      try {
        const [a, b] = await Promise.all([
          one.send('execute', edit),
          two.send('execute', review),
        ]);
        expect(a.status).toBe('committed');
        expect(['committed', 'undetermined']).toContain(b.status);
        const state = await count(f);
        expect(state.maintenance).toBe(2);
        expect(state.estimates).toBe(1);
        expect(state.reviews).toBe(b.status === 'committed' ? 1 : 0);
      } finally {
        await one.stop();
        await two.stop();
      }
    });
    it.each(['tax', 'catalog'])(
      'current %s evidence changed during an actual resource wait cannot append old readiness',
      async (kind) => {
        const f = await prepared();
        let target = f.policy;
        if (kind === 'catalog') {
          target = uid();
          await db.query(
            "insert into public.catalog_items(id,organization_id,name,description,kind,unit,unit_cost_minor,unit_price_minor) values($1,$2,'Synthetic service','Replace measured exterior joint seal','service','linear_ft',1000,2000)",
            [target, f.org],
          );
          const payload = structuredClone(f.c.payload);
          payload.lines[0].catalog_item_id = target;
          await f.service.save(f.c, 1, payload);
        }
        const r = await request(f),
          value: CustodyCommand = {
            kind: 'readiness',
            command: { reservation: f.c, review: r },
          },
          cap = await capability(f, value),
          hold = await db.fork!(),
          s = await service(cap);
        try {
          await hold.exec('begin');
          const table =
            kind === 'tax' ? 'estimate_tax_policies' : 'catalog_items';
          await hold.query(
            `select id from public.${table} where id=$1 for update`,
            [target],
          );
          const pid = (
            await db.query<{ pid: number }>(
              'select pid from pg_stat_activity where usename=$1 and datname=current_database()',
              [cap.role],
            )
          ).rows[0].pid;
          const pending = s.send('execute', value);
          await waitLock(db, pid);
          await hold.query(
            `update public.${table} set ${kind === 'tax' ? 'rate_bps=500' : 'unit_cost_minor=1200'} where id=$1`,
            [target],
          );
          await hold.exec('commit');
          expect((await pending).status).toBe('undetermined');
          expect((await count(f)).reviews).toBe(0);
        } finally {
          await hold.exec('rollback');
          await hold.close();
          await s.stop();
        }
      },
    );
    it('a guarded estimate save using the composed resource-lock protocol invalidates a waiting review', async () => {
      const f = await prepared(),
        r = await request(f),
        value: CustodyCommand = {
          kind: 'readiness',
          command: { reservation: f.c, review: r },
        },
        cap = await capability(f, value),
        hold = await db.fork!(),
        s = await service(cap);
      try {
        await actor(hold);
        await hold.exec('begin');
        await hold.query(
          "select pg_advisory_xact_lock(hashtextextended('maintenance2c:'||$1,0))",
          [f.org],
        );
        const pid = (
          await db.query<{ pid: number }>(
            'select pid from pg_stat_activity where usename=$1 and datname=current_database()',
            [cap.role],
          )
        ).rows[0].pid;
        const pending = s.send('execute', value);
        await waitLock(db, pid);
        await hold.query('select maintenance_2b_test.save_draft($1,$2,$3)', [
          f.c,
          1,
          {
            ...f.c.payload,
            terms: 'Guarded changed synthetic terms during review wait',
          },
        ]);
        await hold.exec('commit');
        expect((await pending).status).toBe('undetermined');
        expect((await count(f)).reviews).toBe(0);
      } finally {
        await hold.exec('rollback');
        await hold.close();
        await s.stop();
      }
    });
    it('oversized stdio input is bounded/rejected without custody or source mutation and preserves framing', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        s = await service(cap);
      try {
        s.p.stdin.write('x'.repeat(2097153) + '\n');
        expect((await s.next()).status).toBe('rejected');
        expect((await count(f)).maintenance).toBe(1);
        expect(custody(s.root, custodyIdentity(value).id)).toBeNull();
        expect((await s.send('execute', value)).status).toBe('committed');
      } finally {
        await s.stop();
      }
    });
    it('revocation at the final capability lock rolls back the entire already-executed command', async () => {
      const f = await fixture(),
        value = editCommand(f),
        cap = await capability(f, value),
        hold = await db.fork!(),
        client = await connectRole(cap.role),
        before = await count(f);
      try {
        await hold.exec('begin');
        await hold.query(
          'select id from maintenance_2c_test.capabilities where id=$1 for update',
          [cap.id],
        );
        const pid = (await client.query('select pg_backend_pid() id')).rows[0]
          .id;
        const pending = client
          .query('select maintenance_2c_test.command($1,$2,$3)', [
            cap.id,
            'execute',
            JSON.stringify([value.command]),
          ])
          .then(
            () => true,
            () => false,
          );
        await waitLock(db, pid);
        await hold.query(
          'update maintenance_2c_test.capabilities set revoked_at=clock_timestamp() where id=$1',
          [cap.id],
        );
        await hold.exec('commit');
        expect(await pending).toBe(false);
        expect(await count(f)).toEqual(before);
        const receipts = (
          await db.query<{ n: number }>(
            'select count(*)::integer n from maintenance_2a_test.receipts where request_id=$1',
            [custodyIdentity(value).id],
          )
        ).rows[0].n;
        expect(receipts).toBe(0);
      } finally {
        await hold.exec('rollback');
        await client.end();
        await hold.close();
      }
    });
  },
);
