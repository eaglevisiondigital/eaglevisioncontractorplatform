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
import { validateClaimRequest } from '../../server/property/command-authority';
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
      ? {
          options:
            '-c lock_timeout=3000 -c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000',
          connectionTimeoutMillis: 5000,
          host: socket,
          port: 55477,
          user: role,
          database,
        }
      : {
          options:
            '-c lock_timeout=3000 -c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000',
          connectionTimeoutMillis: 5000,
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
  cap: { id: string; role: string; issuer: string },
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
    MAINT_SERVICE_AUTHORITY: '2e',
  };
  const p = spawn(process.execPath, [join(bundleDir, 'service.mjs')], {
    env,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
  const issuer = await connectRole(cap.issuer);
  const channel = (p as unknown as { stdio: import('node:stream').Duplex[] })
    .stdio[3];
  let issued = 0;
  createInterface({ input: channel }).on('line', async (line) => {
    try {
      if (Buffer.byteLength(line) > 2097152) throw Error();
      const r = JSON.parse(line);
      validateClaimRequest(r);
      if (r.capability !== cap.id) throw Error();
      await issuer.query('select maintenance_2e_test.issue($1,$2,$3,$4)', [
        cap.id,
        r.step,
        JSON.stringify(r.args),
        JSON.stringify(r.tx),
      ]);
      issued++;
      channel.write('{"status":"issued"}\n');
    } catch {
      channel.write('{"status":"denied"}\n');
    }
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
    issued: () => issued,
    next,
    send(operation: 'execute' | 'reconcile', command: CustodyCommand) {
      p.stdin.write(JSON.stringify({ operation, command }) + '\n');
      return next();
    },
    async stop() {
      p.stdin.end();
      await exited;
      children.delete(p);
      channel.destroy();
      await issuer.end();
    },
    async kill() {
      p.kill('SIGKILL');
      await exited;
      children.delete(p);
      channel.destroy();
      await issuer.end();
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
  'native PostgreSQL17 · Workstream2E server-owned authority',
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
        'maintenance-authority.sql',
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
        const executor = 'maintenance_2e_exec_' + database.slice(8);
        await db.exec('drop owned by ' + executor + ' cascade');
        await db.exec('drop role ' + executor);
        const role = 'maintenance_2c_exec_' + database.slice(8);
        await db.exec('drop owned by ' + role + ' cascade');
        await db.exec('drop role ' + role);
      }
      await db?.close();
      if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    });
    // New2E cases below. Test setup reuses the exact existing synthetic2C scenario.
    async function authority(
      f: Fixture,
      value: CustodyCommand,
      user = owners[f.index],
    ) {
      const cap = await capability(f, value, user),
        issuer = 'maintenance_2e_issuer_' + uid().replaceAll('-', '');
      roles.push(issuer);
      await db.exec(
        `create role ${issuer} login password 'synthetic-2c-only' nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant usage on schema maintenance_2e_test to ${issuer};grant execute on function maintenance_2e_test.issue(uuid,text,jsonb,jsonb) to ${issuer};revoke all on function maintenance_2c_test.command(uuid,text,jsonb) from ${cap.role};grant usage on schema maintenance_2e_test to ${cap.role};grant execute on function maintenance_2e_test.command(uuid,text,jsonb) to ${cap.role}`,
      );
      await db.query(
        'insert into maintenance_2e_test.approvals values($1,$2,$3)',
        [f.org, cap.id, issuer],
      );
      return { ...cap, issuer };
    }
    const gateway = (c: Client, cap: string, step: string, args: unknown[]) =>
      c.query('select maintenance_2e_test.command($1,$2,$3) v', [
        cap,
        step,
        JSON.stringify(args),
      ]);
    async function tx(c: Client) {
      await c.query('begin');
      return (
        await c.query(
          'select pg_backend_pid() pid,backend_start::text,txid_current()::text transaction_id from pg_stat_activity where pid=pg_backend_pid()',
        )
      ).rows[0];
    }
    async function issue(
      c: Client,
      cap: string,
      step: string,
      args: unknown[],
      info: unknown,
    ) {
      return c.query('select maintenance_2e_test.issue($1,$2,$3,$4) v', [
        cap,
        step,
        JSON.stringify(args),
        JSON.stringify(info),
      ]);
    }
    it.each([0, 1, 2])(
      'D001 raw SQL without issuer claim denies for company%s; authorized service works',
      async (index) => {
        const f = await fixture(index),
          v = editCommand(f),
          cap = await authority(f, v),
          raw = await connectRole(cap.role);
        try {
          await expect(
            gateway(raw, cap.id, 'execute', [v.command]),
          ).rejects.toThrow(/claim/i);
          expect((await count(f)).maintenance).toBe(1);
          await expect(
            raw.query('select maintenance_2c_test.command($1,$2,$3)', [
              cap.id,
              'execute',
              JSON.stringify([v.command]),
            ]),
          ).rejects.toThrow(/permission/i);
        } finally {
          await raw.end();
        }
        const s = await service(cap);
        try {
          expect((await s.send('execute', v)).status).toBe('committed');
          expect(s.issued()).toBe(1);
          expect((await count(f)).maintenance).toBe(2);
        } finally {
          await s.stop();
        }
      },
    );
    it('D001 runtime and issuer cannot grant/reset claims or cross their permission boundary', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        runtime = await connectRole(cap.role),
        issuer = await connectRole(cap.issuer);
      try {
        for (const sql of [
          'select * from maintenance_2e_test.claims',
          'delete from maintenance_2e_test.claims',
          'update maintenance_2e_test.approvals set issuer_name=session_user',
          'select * from public.estimates',
          "select maintenance_2b_test.finish('{}')",
          'set role ' + cap.issuer,
          'set role maintenance_2e_exec_' + database.slice(8),
          'create role never_allowed',
        ])
          await expect(runtime.query(sql)).rejects.toThrow();
        await expect(
          issue(runtime, cap.id, 'execute', [v.command], {}),
        ).rejects.toThrow(/permission/i);
        await expect(
          gateway(issuer, cap.id, 'execute', [v.command]),
        ).rejects.toThrow(/permission/i);
        await expect(issuer.query('set role ' + cap.role)).rejects.toThrow();
        const a = (
          await runtime.query(
            "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('maintenance_2a_test','maintenance_2b_test','maintenance_2c_test','maintenance_2e_test') and has_schema_privilege(n.oid,'USAGE') and has_function_privilege(p.oid,'EXECUTE') order by 1",
          )
        ).rows;
        expect(a.map((x) => x.proname)).toEqual(['command']);
      } finally {
        await runtime.end();
        await issuer.end();
      }
    });
    it('D001 raw SQL cannot reuse an issued claim after top-level rollback or manufacture a new request', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer);
      try {
        const info = await tx(r);
        await issue(i, cap.id, 'execute', [v.command], info);
        await gateway(r, cap.id, 'execute', [v.command]);
        await r.query('rollback');
        await expect(
          gateway(r, cap.id, 'execute', [v.command]),
        ).rejects.toThrow(/claim/i);
        const next = await tx(r);
        await expect(
          issue(i, cap.id, 'execute', [v.command], next),
        ).rejects.toThrow(/claimed/i);
        await r.query('rollback');
        expect((await count(f)).maintenance).toBe(1);
        const replacement = structuredClone(v);
        if (replacement.kind !== 'maintenance') throw Error();
        replacement.command.request_id = uid();
        const other = await authority(f, replacement),
          oi = await connectRole(other.issuer),
          rr = await connectRole(other.role);
        try {
          const info = await tx(rr);
          await expect(
            issue(oi, other.id, 'execute', [replacement.command], info),
          ).rejects.toThrow(/UNKNOWN/i);
        } finally {
          await rr.query('rollback');
          await rr.end();
          await oi.end();
        }
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
      }
    });
    it('D001 savepoint rollback cannot resurrect a consumed one-shot claim', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer);
      try {
        const info = await tx(r);
        await issue(i, cap.id, 'execute', [v.command], info);
        await r.query('savepoint first_attempt');
        await gateway(r, cap.id, 'execute', [v.command]);
        await r.query('rollback to first_attempt');
        await expect(
          gateway(r, cap.id, 'execute', [v.command]),
        ).rejects.toThrow(/spent|maximum/i);
        await r.query('rollback');
        expect((await count(f)).maintenance).toBe(1);
        const state = (
          await db.query<{ n: number }>(
            'select count(*)::integer n from maintenance_2e_test.outcomes where capability_id=$1',
            [cap.id],
          )
        ).rows[0].n;
        expect(state).toBe(0);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
      }
    });
    it.each(['pid', 'backend_start', 'transaction_id', 'epoch', 'closed'])(
      'issuer rejects stale/substituted runtime metadata %s',
      async (field) => {
        const f = await fixture(),
          v = editCommand(f),
          cap = await authority(f, v),
          r = await connectRole(cap.role),
          i = await connectRole(cap.issuer);
        try {
          const info = await tx(r);
          if (field === 'pid') info.pid = -1;
          else if (field === 'backend_start') info.backend_start = '2000-01-01';
          else if (field === 'epoch')
            info.transaction_id = String(
              BigInt(info.transaction_id) + 4294967296n,
            );
          else if (field === 'transaction_id')
            info.transaction_id = String(BigInt(info.transaction_id) + 1n);
          else await r.query('commit');
          await expect(
            issue(i, cap.id, 'execute', [v.command], info),
          ).rejects.toThrow(/transaction/i);
          expect((await count(f)).maintenance).toBe(1);
        } finally {
          await r.query('rollback');
          await r.end();
          await i.end();
        }
      },
    );
    it('private claim sequences cannot be inspected, advanced, reset or altered by either LOGIN', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer);
      try {
        await issue(i, cap.id, 'execute', [v.command], await tx(r));
        const name = (
          await db.query<{ name: string }>(
            'select burn_sequence::text name from maintenance_2e_test.claims where capability_id=$1',
            [cap.id],
          )
        ).rows[0].name;
        for (const c of [i, r]) {
          for (const sql of [
            `select nextval('${name}')`,
            `select setval('${name}',1,false)`,
            `select * from ${name}`,
            `alter sequence ${name} restart with 1`,
          ]) {
            if (c === r) await r.query('savepoint denied_direct');
            await expect(c.query(sql)).rejects.toThrow();
            if (c === r)
              await r.query('rollback to denied_direct;release denied_direct');
          }
        }
        await gateway(r, cap.id, 'execute', [v.command]);
        await r.query('commit');
        expect((await count(f)).maintenance).toBe(2);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
      }
    });
    it('failed SQLite persistence prevents all server issuance and remote mutation', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        s = await service(cap),
        d = new DatabaseSync(join(s.root, 'commands.sqlite'));
      try {
        d.exec('begin immediate');
        expect((await s.send('execute', v)).status).toBe('rejected');
        expect(s.issued()).toBe(0);
        expect((await count(f)).maintenance).toBe(1);
        expect(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from maintenance_2e_test.claims where capability_id=$1',
              [cap.id],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        d.exec('rollback');
        d.close();
        await s.stop();
      }
    });
    it.each([
      'after_intent',
      'after_server_claim',
      'during_mutation',
      'after_transmit',
    ])(
      'service loss at%s preserves identity/UNKNOWN; restart only reconciles',
      async (fault) => {
        const f = await fixture(),
          v = editCommand(f),
          cap = await authority(f, v),
          s = await service(cap, privateRoot(), fault);
        expect((await s.send('execute', v)).status).toBe('boundary');
        await s.kill();
        const restart = await service(cap, s.root);
        try {
          const response = await restart.send('execute', v);
          expect(response.status).toBe(
            fault === 'after_transmit' ? 'committed' : 'undetermined',
          );
          expect(restart.issued()).toBe(0);
          expect((await count(f)).maintenance).toBe(
            fault === 'after_transmit' ? 2 : 1,
          );
          expect(custody(s.root, custodyIdentity(v).id)!.value).toEqual(v);
        } finally {
          await restart.stop();
        }
      },
    );
    it('repair reservation/preparation and canonical readiness compose through per-phase claims', async () => {
      const f = await fixture(),
        cap = await authority(f, { kind: 'repair', command: f.c }),
        s = await service(cap);
      try {
        expect(
          (await s.send('execute', { kind: 'repair', command: f.c })).status,
        ).toBe('committed');
        expect(s.issued()).toBe(3);
        expect((await count(f)).estimates).toBe(1);
      } finally {
        await s.stop();
      }
      for (const section of [
        'scope',
        'measurements',
        'resources',
        'pricing',
        'tax',
        'terms',
      ] as const) {
        const review = await request(f, section),
          v: CustodyCommand = {
            kind: 'readiness',
            command: { reservation: f.c, review },
          },
          rc = await authority(f, v),
          rs = await service(rc);
        try {
          expect((await rs.send('execute', v)).status).toBe('committed');
          expect(rs.issued()).toBe(2);
        } finally {
          await rs.stop();
        }
      }
      expect((await f.service.readiness(f.c)).confirmed).toBe(6);
      expect((await count(f)).reviews).toBe(6);
      const r = await connectRole(cap.role);
      try {
        for (const step of [
          'issue_estimate',
          'approve_job',
          'invoice',
          'payment',
          'refund',
          'complete',
          'customer_approval',
        ])
          await expect(gateway(r, cap.id, step, [f.c])).rejects.toThrow();
      } finally {
        await r.end();
      }
      await actor();
      await expect(
        call('private.issue_estimate', [
          f.org,
          f.c.estimate_id,
          f.c.draft_version_id,
          1,
        ]),
      ).rejects.toThrow();
    });
    it('a reservation-only loss retains original lifecycle; no replacement capability or automatic prepare', async () => {
      const f = await fixture(),
        v: CustodyCommand = { kind: 'repair', command: f.c },
        cap = await authority(f, v),
        s = await service(cap, privateRoot(), 'after_reserve');
      expect((await s.send('execute', v)).status).toBe('boundary');
      await s.kill();
      const restart = await service(cap, s.root);
      try {
        expect((await restart.send('execute', v)).status).toBe('undetermined');
        expect(restart.issued()).toBe(0);
        expect((await count(f)).estimates).toBe(0);
      } finally {
        await restart.stop();
      }
      const changed = {
          ...f.c,
          request_id: uid(),
          estimate_id: uid(),
          draft_version_id: uid(),
        },
        other = await authority(f, { kind: 'repair', command: changed }),
        r = await connectRole(other.role),
        i = await connectRole(other.issuer);
      try {
        await expect(
          issue(i, other.id, 'reserve', [changed], await tx(r)),
        ).rejects.toThrow(/UNKNOWN/i);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
      }
    });
    it('D002 coordinated standalone finish and gateway reads follow the same order without deadlock', async () => {
      const f = await fixture(),
        v: CustodyCommand = { kind: 'repair', command: f.c },
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer),
        b = await connectRole(cap.role);
      try {
        for (const step of ['reserve', 'claim']) {
          const info = await tx(r);
          await issue(i, cap.id, step, [f.c], info);
          await gateway(r, cap.id, step, [f.c]);
          await r.query('commit');
        }
        const info = await tx(r);
        await gateway(r, cap.id, 'coordinate', [f.c]);
        const pid = (await b.query('select pg_backend_pid() id')).rows[0].id;
        const pending = gateway(b, cap.id, 'reconcile', [f.c]);
        await waitLock(db, pid);
        await issue(i, cap.id, 'finish', [f.c], info);
        await gateway(r, cap.id, 'finish', [f.c]);
        await r.query('commit');
        expect((await pending).rows[0].v.status).toBe('committed');
        expect((await count(f)).estimates).toBe(1);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
        await b.end();
      }
    });
    it('final capability revocation rolls mutation/outcome back but keeps authoritative claim', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer),
        hold = await db.fork!();
      try {
        await issue(i, cap.id, 'execute', [v.command], await tx(r));
        await hold.exec('begin');
        await hold.query(
          'select id from maintenance_2c_test.capabilities where id=$1 for update',
          [cap.id],
        );
        const pid = (await r.query('select pg_backend_pid() id')).rows[0].id;
        const pending = gateway(r, cap.id, 'execute', [v.command]).then(
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
        await r.query('rollback');
        expect((await count(f)).maintenance).toBe(1);
        expect(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from maintenance_2e_test.claims where capability_id=$1',
              [cap.id],
            )
          ).rows[0].n,
        ).toBe(1);
        expect(
          (
            await db.query<{ n: number }>(
              'select count(*)::integer n from maintenance_2e_test.outcomes where capability_id=$1',
              [cap.id],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await hold.exec('rollback');
        await r.query('rollback');
        await hold.close();
        await r.end();
        await i.end();
      }
    });
    it('exception-subtransaction rollback also cannot replay a burned claim', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer);
      try {
        await issue(i, cap.id, 'execute', [v.command], await tx(r));
        // Data comes only from generated synthetic UUID/JSON here; use server-quoted literals.
        const q = (
          await db.query<{ literal: string }>(
            'select quote_literal($1::text) literal',
            [JSON.stringify([v.command])],
          )
        ).rows[0].literal;
        await r.query(
          `do $$begin perform maintenance_2e_test.command('${cap.id}'::uuid,'execute',${q}::jsonb);raise exception 'force nested rollback';exception when others then null;end$$`,
        );
        await expect(
          gateway(r, cap.id, 'execute', [v.command]),
        ).rejects.toThrow(/spent|maximum/);
        await r.query('rollback');
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
      }
    });
    it('resource-first admin revocation rejects a waiting mutation without an authority lock inversion', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v, staff[0]),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer),
        hold = await db.fork!();
      try {
        await issue(i, cap.id, 'execute', [v.command], await tx(r));
        await hold.exec("begin;set local statement_timeout='3s'");
        await hold.query(
          'select organization_id from public.company_settings where organization_id=$1 for update',
          [f.org],
        );
        const pid = (await r.query('select pg_backend_pid() id')).rows[0].id,
          pending = gateway(r, cap.id, 'execute', [v.command]).then(
            () => true,
            () => false,
          );
        await waitLock(db, pid);
        await hold.query(
          'update public.memberships set active=false where organization_id=$1 and user_id=$2',
          [f.org, staff[0]],
        );
        await hold.exec('commit');
        expect(await pending).toBe(false);
        await r.query('rollback');
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await hold.exec('rollback');
        await db.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, staff[0]],
        );
        await r.query('rollback');
        await hold.close();
        await r.end();
        await i.end();
      }
    });
    it('concurrent service requests share one server claim and cannot create duplicate notes or receipts', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        a = await service(cap),
        b = await service(cap);
      try {
        const result = await Promise.all([
          a.send('execute', v),
          b.send('execute', v),
        ]);
        expect(result.filter((x) => x.status === 'committed')).toHaveLength(1);
        expect((await count(f)).maintenance).toBe(2);
        expect((await a.send('reconcile', v)).status).toBe('committed');
        expect((await b.send('reconcile', v)).status).toBe('committed');
        expect(a.issued() + b.issued()).toBe(1);
      } finally {
        await a.stop();
        await b.stop();
      }
    });
    it('changed command/request and another backend cannot borrow an issued transaction claim', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer),
        other = await connectRole(cap.role);
      try {
        await issue(i, cap.id, 'execute', [v.command], await tx(r));
        await expect(
          gateway(other, cap.id, 'execute', [v.command]),
        ).rejects.toThrow(/claim/);
        await expect(
          gateway(r, cap.id, 'execute', [{ ...v.command, request_id: uid() }]),
        ).rejects.toThrow();
        await r.query('rollback');
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
        await other.end();
      }
    });
    it('new gateway and issuer reject foreign tenant capabilities without accepting caller claims', async () => {
      const a = await fixture(0),
        b = await fixture(1),
        av = editCommand(a),
        bv = editCommand(b),
        ac = await authority(a, av),
        bc = await authority(b, bv),
        r = await connectRole(ac.role),
        i = await connectRole(ac.issuer);
      try {
        await r.query("select set_config('request.jwt.claims',$1,false)", [
          claims(owners[1]),
        ]);
        await expect(
          gateway(r, bc.id, 'execute', [bv.command]),
        ).rejects.toThrow(/authority/i);
        await expect(
          issue(i, bc.id, 'execute', [bv.command], await tx(r)),
        ).rejects.toThrow(/authority/i);
        await r.query('rollback');
        expect((await count(a)).maintenance).toBe(1);
        expect((await count(b)).maintenance).toBe(1);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
      }
    });
    it('revoked staff cannot read a retained committed receipt after restart or obtain a new claim', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v, staff[0]),
        s = await service(cap, privateRoot(), 'after_transmit');
      expect((await s.send('execute', v)).status).toBe('boundary');
      await s.kill();
      await db.query(
        'update public.memberships set active=false where organization_id=$1 and user_id=$2',
        [f.org, staff[0]],
      );
      const restart = await service(cap, s.root);
      try {
        expect((await restart.send('reconcile', v)).status).toBe('rejected');
        expect(restart.issued()).toBe(0);
        expect(
          custody(s.root, custodyIdentity(v).id)!.events.at(-1)?.kind,
        ).toBe('transmitting');
      } finally {
        await restart.stop();
        await db.query(
          'update public.memberships set active=true where organization_id=$1 and user_id=$2',
          [f.org, staff[0]],
        );
      }
    });
    it('the new authority metadata is append-only/RLS and neither LOGIN has table or column access', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        s = await service(cap);
      try {
        expect((await s.send('execute', v)).status).toBe('committed');
      } finally {
        await s.stop();
      }
      for (const table of ['approvals', 'claims', 'outcomes']) {
        await expect(
          db.query(
            `delete from maintenance_2e_test.${table} where capability_id=$1`,
            [cap.id],
          ),
        ).rejects.toThrow(/immutable/i);
        await expect(
          db.query(
            `update maintenance_2e_test.${table} set capability_id=capability_id where capability_id=$1`,
            [cap.id],
          ),
        ).rejects.toThrow(/immutable/i);
      }
      const rolesToCheck = [
        cap.role,
        cap.issuer,
        'maintenance_2e_exec_' + database.slice(8),
      ];
      for (const role of rolesToCheck) {
        const rows = (
          await db.query(
            "select n.nspname,c.relname,has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') tbl,has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') col from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth','maintenance_2a_test','maintenance_2b_test','maintenance_2c_test','maintenance_2e_test') and c.relkind='r'",
            [role],
          )
        ).rows;
        expect(rows.some((r) => r.tbl || r.col)).toBe(false);
        const functions = (
          await db.query(
            "select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth','maintenance_2a_test','maintenance_2b_test','maintenance_2c_test','maintenance_2e_test') and has_schema_privilege($1,n.oid,'USAGE') and has_function_privilege($1,p.oid,'EXECUTE') order by 1,2",
            [role],
          )
        ).rows;
        expect(functions.map((x) => x.proname)).toEqual(
          role === cap.role
            ? ['command']
            : role === cap.issuer
              ? ['issue']
              : ['command', 'command_core'],
        );
      }
      const rls = (
        await db.query(
          "select relrowsecurity,relforcerowsecurity from pg_class where relnamespace='maintenance_2e_test'::regnamespace and relkind='r'",
        )
      ).rows;
      expect(rls).toHaveLength(3);
      expect(rls.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(
        true,
      );
    });
    it('an expired issued claim cannot authorize a later mutation', async () => {
      const f = await fixture(),
        v = editCommand(f),
        cap = await authority(f, v),
        r = await connectRole(cap.role),
        i = await connectRole(cap.issuer);
      // New exact expiring capability is seeded by trusted provisioning, never edited.
      const expiring = uid();
      await db.query(
        "insert into maintenance_2c_test.capabilities select $1,organization_id,login_name,actor_id,session_id,aal,purpose,command,approved_review,clock_timestamp()+interval '2seconds',null from maintenance_2c_test.capabilities where id=$2",
        [expiring, cap.id],
      );
      await db.query(
        'insert into maintenance_2e_test.approvals values($1,$2,$3)',
        [f.org, expiring, cap.issuer],
      );
      try {
        await issue(i, expiring, 'execute', [v.command], await tx(r));
        await new Promise((resolve) => setTimeout(resolve, 2100));
        await expect(
          gateway(r, expiring, 'execute', [v.command]),
        ).rejects.toThrow(/authority/i);
        await r.query('rollback');
        expect((await count(f)).maintenance).toBe(1);
      } finally {
        await r.query('rollback');
        await r.end();
        await i.end();
      }
    });
    it('explicit follow-up remains one existing inspection draft and duplicate execute only reconciles', async () => {
      const f = await fixture();
      await actor();
      await new NativeMaintenanceFixture(db).execute({
        request_id: uid(),
        source: f.c.source,
        expected_revision: 1,
        action: 'edit',
        input: {
          priority: 'normal',
          assignee_id: staff[0],
          follow_up_on: '',
          review: 'pending',
          note: 'Explicit follow-up pending',
        },
      });
      const v: CustodyCommand = {
          kind: 'maintenance',
          command: {
            request_id: uid(),
            source: f.c.source,
            expected_revision: 2,
            action: 'follow_up',
            input: {
              plan_id: f.plan,
              plan_revision: 1,
              visited_on: '2026-11-19',
            },
          },
        },
        cap = await authority(f, v),
        s = await service(cap),
        before = (await count(f)).visits;
      try {
        expect((await s.send('execute', v)).status).toBe('committed');
        expect((await s.send('execute', v)).status).toBe('committed');
        expect((await count(f)).visits).toBe(before + 1);
        expect(s.issued()).toBe(1);
      } finally {
        await s.stop();
      }
    });
  },
);
