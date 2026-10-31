import { sampleCompanies } from '../../src/domain/platform';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { Client } from 'pg';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
const db = createTestDatabase(),
  uid = () => crypto.randomUUID();
const native =
  !!process.env.EV_TEST_PG_SOCKET ||
  (process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true');
const clients: Client[] = [],
  roles: string[] = [];
let database = '',
  defaults: unknown;
let legacy: Awaited<ReturnType<typeof fixture>>,
  legacyReceipt: unknown,
  legacyRow: unknown;
async function sql<T = unknown>(
  d: Pick<TestDatabase, 'query'>,
  name: string,
  args: unknown[] = [],
): Promise<T> {
  return (
    await d.query<{ v: T }>(
      `select ${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) v`,
      args,
    )
  ).rows[0].v;
}
async function actor(
  user: string,
  session: string,
  aal = 'aal2',
  d: TestDatabase = db,
) {
  await d.exec('reset role');
  await d.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: user,
      session_id: session,
      aal,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ]);
}
const organizations = [uid(), uid(), uid()],
  owners = [uid(), uid(), uid()],
  ownerSessions = [uid(), uid(), uid()];
async function connect(user: string) {
  const socket = process.env.EV_TEST_PG_SOCKET;
  const c = new Client(
    socket
      ? { host: socket, port: 55477, user, database }
      : {
          host: '127.0.0.1',
          port: 5432,
          user,
          password: 'synthetic-ci-only',
          database,
        },
  );
  await c.connect();
  clients.push(c);
  return c;
}
async function fixture(index = 0, ttl = 600000) {
  const org = organizations[index],
    customer = uid(),
    location = uid(),
    user = uid(),
    session = uid(),
    policy = uid();
  await actor(owners[index], ownerSessions[index]);
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'customer@example.test',clock_timestamp())",
    [user],
  );
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
    session,
    user,
  ]);
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'Synthetic request customer')",
    [customer, org],
  );
  await db.query(
    "insert into public.service_locations(id,organization_id,customer_id,address_line1,city,region,postal_code,country_code) values($1,$2,$3,'Synthetic request lane','Example','IL','00000','US')",
    [location, org, customer],
  );
  await db.query(
    'insert into public.portal_identities(organization_id,customer_id,user_id) values($1,$2,$3)',
    [org, customer, user],
  );
  await db.query(
    "insert into public.estimate_tax_policies(id,organization_id,name,reference,jurisdiction,contract_type,rate_bps,status) values($1,$2,'Synthetic tax','reviewed fixture','Synthetic','Synthetic',0,'reviewed')",
    [policy, org],
  );
  const payload = blankEstimate(customer);
  payload.location_id = location;
  payload.tax_policy_id = policy;
  payload.expires_on = '2099-01-01';
  payload.internal_notes = 'PRIVATE STAFF';
  payload.lines[0].unit_cost_minor = 1234;
  payload.lines[0].unit_price_minor = 5678;
  const b = await sql<EstimateBundle>(db, 'private.create_estimate', [
    org,
    payload,
    uid(),
  ]);
  await sql(db, 'private.issue_estimate', [
    org,
    b.estimate.id,
    b.version.id,
    1,
  ]);
  const p = {
    customer_id: customer,
    location_id: location,
    user_id: user,
    version_id: b.version.id,
    source_report_id: null,
    finding_id: null,
    source_line_id: null,
  };
  const preview = await sql<{ scope_sha256: string }>(
    db,
    'private.customer_publication_preview',
    [org, p],
  );
  const pub = await sql<{ publication_id: string }>(
    db,
    'private.customer_publish_estimate',
    [
      org,
      {
        ...p,
        scope_sha256: preview.scope_sha256,
        request_id: uid(),
        expires_at: new Date(Date.now() + ttl).toISOString(),
        review_acknowledged: true,
        approval_reference: 'explicit disposable fixture',
      },
    ],
  );
  const body = {
    organization_id: org,
    customer_id: customer,
    location_id: location,
    version_id: b.version.id,
    publication_id: pub.publication_id,
    scope_sha256: preview.scope_sha256,
    choice: 'request_changes_review',
    note: '  Please change the scope.  ',
    acknowledgment: 'review-only-v2',
    request_id: uid(),
  };
  return {
    org,
    customer,
    location,
    user,
    session,
    body,
    version: b.version.id,
  };
}
async function authority(f: Awaited<ReturnType<typeof fixture>>) {
  const suffix = uid().replaceAll('-', ''),
    issuer = 'cr_issuer_' + suffix,
    executor = 'cr_exec_' + suffix;
  roles.push(issuer, executor);
  for (const role of [issuer, executor])
    await db.exec(
      `create role ${role} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password 'synthetic-ci-only';grant usage on schema private to ${role};`,
    );
  await db.exec(
    `grant execute on function private.customer_request_claim(uuid,jsonb,jsonb) to ${issuer};grant execute on function private.customer_record_review_request(uuid,jsonb),private.customer_record_decision(uuid,uuid,text,text,text,uuid) to ${executor};`,
  );
  const principal = uid();
  await db.query(
    'insert into private.customer_request_principals(organization_id,id,customer_id,location_id,issuer_name,executor_name,user_id,session_id,expires_at,auth_expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      f.org,
      principal,
      f.customer,
      f.location,
      issuer,
      executor,
      f.user,
      f.session,
      new Date(Date.now() + 600000),
      new Date(Date.now() + 3600000),
    ],
  );
  return {
    principal,
    executorRole: executor,
    issuer: await connect(issuer),
    executor: await connect(executor),
  };
}
async function claim(
  f: Awaited<ReturnType<typeof fixture>>,
  a: Awaited<ReturnType<typeof authority>>,
) {
  await a.executor.query('begin');
  await a.executor.query("set local statement_timeout='5s'");
  const tx = (
    await a.executor.query(
      "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
    )
  ).rows[0].v;
  const ref = await sql<Record<string, unknown>>(
    a.issuer,
    'private.customer_request_claim',
    [a.principal, f.body, tx],
  );
  return ref;
}
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  database = (await db.query<{ d: string }>('select current_database() d'))
    .rows[0].d;
  defaults = await sql(db, 'private.customer_runtime_status');
  await db.exec(
    "create or replace function private.customer_capability(p_name text) returns boolean language sql volatile security definer set search_path='' as $$select true$$",
  );
  for (let i = 0; i < 3; i++) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',clock_timestamp())",
      [owners[i]],
    );
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      ownerSessions[i],
      owners[i],
    ]);
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status,primary_color,accent_color) values($1,$2,$3,$4,'active',$5,$6)",
      [
        organizations[i],
        sampleCompanies[i].name,
        'customer-request-' + i,
        sampleCompanies[i].industry,
        sampleCompanies[i].primary_color,
        sampleCompanies[i].accent_color,
      ],
    );
    await db.query(
      "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
      [organizations[i], owners[i]],
    );
    await db.query(
      'insert into private.property_features(organization_id,enabled) values($1,true)',
      [organizations[i]],
    );
  }
  // Seed real v1 evidence with fourteen before installing the forward extension.
  legacy = await fixture();
  await actor(legacy.user, legacy.session);
  legacyReceipt = await sql(db, 'private.customer_record_decision', [
    legacy.org,
    legacy.body.publication_id,
    legacy.body.scope_sha256,
    'approve_review',
    'review-only-v1',
    legacy.body.request_id,
  ]);
  legacyRow = (
    await db.query(
      'select to_jsonb(d) v from private.customer_review_decisions d where request_id=$1',
      [legacy.body.request_id],
    )
  ).rows[0].v;
  await db.exec(
    "create or replace function private.customer_capability(p_name text) returns boolean language sql volatile security definer set search_path='' as $$select false$$",
  );
  await db.exec(readFileSync('server/customer/requests.proposed.sql', 'utf8'));
  defaults = await sql(db, 'private.customer_runtime_status');
  await db.exec(
    "create or replace function private.customer_capability(p_name text) returns boolean language sql volatile security definer set search_path='' as $$select true$$",
  );
}, 30000);
afterAll(async () => {
  for (const c of clients) await c.end().catch(() => {});
  await db.close();
  if (native) {
    const socket = process.env.EV_TEST_PG_SOCKET;
    const admin = new Client(
      socket
        ? { host: socket, port: 55477, user: 'ev_test', database: 'postgres' }
        : {
            host: '127.0.0.1',
            port: 5432,
            user: 'ev_test',
            password: 'synthetic-ci-only',
            database: 'postgres',
          },
    );
    await admin.connect();
    for (const r of roles) await admin.query(`drop role if exists ${r}`);
    await admin.end();
  }
});
it('installs separately with default-off runtime and no general table or function grants', async () => {
  expect(defaults).toEqual({
    reads: false,
    publishing: false,
    decisions: false,
    login: false,
  });
  for (const role of ['anon', 'authenticated', 'service_role']) {
    expect(
      (
        await db.query<{ v: boolean }>(
          "select has_table_privilege($1,'private.customer_request_intents','select,insert,update,delete') v",
          [role],
        )
      ).rows[0].v,
    ).toBe(false);
    expect(
      (
        await db.query<{ v: boolean }>(
          "select has_function_privilege($1,'private.customer_request_claim(uuid,jsonb,jsonb)','execute') v",
          [role],
        )
      ).rows[0].v,
    ).toBe(false);
  }
});
it.each([0, 1, 2])(
  'canonicalizes safe Unicode notes without a new decision ledger in company %s',
  async (i) => {
    const f = await fixture(i);
    const value = await sql<{ note: string }>(
      db,
      'private.customer_request_body',
      [{ ...f.body, note: ' \u00a0😀 <script>text only</script> v\u3000' }],
    );
    expect(value.note).toBe('😀 <script>text only</script> v');
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_review_decisions where request_id=$1',
          [f.body.request_id],
        )
      ).rows[0].n,
    ).toBe(0);
  },
);
it.each(['', ' \u3000\t', '😀'.repeat(2001)])(
  'rejects invalid explanation (%s)',
  async (note) => {
    const f = await fixture();
    await expect(
      sql(db, 'private.customer_request_body', [{ ...f.body, note }]),
    ).rejects.toThrow();
  },
);
it.skipIf(!native).each([0, 1, 2])(
  'commits an actual request/receipt and eligible staff queue in native company %s',
  async (i) => {
    const f = await fixture(i),
      a = await authority(f),
      ref = await claim(f, a);
    const result = await sql<{ receipt: { note: string }; outcome: string }>(
      a.executor,
      'private.customer_record_review_request',
      [a.principal, f.body],
    );
    await a.executor.query('commit');
    expect(result.outcome).toBe('confirmed');
    expect(result.receipt.note).toBe('Please change the scope.');
    await actor(f.user, f.session);
    expect(
      (
        await sql<{ outcome: string }>(
          db,
          'private.customer_review_request_receipt',
          [f.org, ref],
        )
      ).outcome,
    ).toBe('confirmed');
    await actor(owners[i], ownerSessions[i]);
    const queue = await sql<{ requests: unknown[] }>(
      db,
      'private.customer_change_request_queue',
      [f.org],
    );
    expect(JSON.stringify(queue)).toContain(f.body.request_id);
    expect(JSON.stringify(queue)).not.toMatch(
      /PRIVATE STAFF|unit_cost|payroll|margin/,
    );
    await expect(
      sql(a.issuer, 'private.customer_request_claim', [
        a.principal,
        { ...f.body, request_id: uid() },
        {
          pid: 1,
          backend_start: new Date().toISOString(),
          transaction_id: '1',
        },
      ]),
    ).rejects.toThrow();
  },
);
it.skipIf(!native).each(['approve_review', 'decline_review'])(
  'preserves the v1 %s call and receipt shape under independent custody',
  async (choice) => {
    const f = await fixture();
    Object.assign(f.body, {
      choice,
      note: '',
      acknowledgment: 'review-only-v1',
    });
    const a = await authority(f);
    await claim(f, a);
    const r = await sql<Record<string, unknown>>(
      a.executor,
      'private.customer_record_decision',
      [
        f.org,
        f.body.publication_id,
        f.body.scope_sha256,
        choice,
        'review-only-v1',
        f.body.request_id,
      ],
    );
    await a.executor.query('commit');
    expect(Object.keys(r).sort()).toEqual(
      ['id', 'request_id', 'choice', 'recorded_at', 'scope_sha256'].sort(),
    );
    expect(r.choice).toBe(choice);
  },
);
it.skipIf(!native)(
  'rollback and savepoints cannot restore a consumed claim or permit a replacement ID',
  async () => {
    const f = await fixture(),
      a = await authority(f),
      ref = await claim(f, a);
    await a.executor.query('savepoint attempt');
    await sql(a.executor, 'private.customer_record_review_request', [
      a.principal,
      f.body,
    ]);
    await a.executor.query('rollback to savepoint attempt');
    await expect(
      sql(a.executor, 'private.customer_record_review_request', [
        a.principal,
        f.body,
      ]),
    ).rejects.toThrow(/spent|UNKNOWN/);
    await a.executor.query('rollback');
    await actor(f.user, f.session);
    const r = await sql<{ outcome: string; receipt: unknown }>(
      db,
      'private.customer_review_request_receipt',
      [f.org, ref],
    );
    expect(r).toMatchObject({ outcome: 'UNKNOWN', receipt: null });
    await a.executor.query('begin');
    const tx = (
      await a.executor.query(
        "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
      )
    ).rows[0].v;
    await expect(
      sql(a.issuer, 'private.customer_request_claim', [
        a.principal,
        { ...f.body, request_id: uid() },
        tx,
      ]),
    ).rejects.toThrow('Existing target');
    await a.executor.query('rollback');
  },
);
it.skipIf(!native)(
  'uncommitted issuer state never authorizes a protected mutation',
  async () => {
    const f = await fixture(),
      a = await authority(f);
    await a.issuer.query('begin');
    await claim(f, a);
    await expect(
      sql(a.executor, 'private.customer_record_review_request', [
        a.principal,
        f.body,
      ]),
    ).rejects.toThrow('Committed exact');
    await a.executor.query('rollback');
    await a.issuer.query('rollback');
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_review_decisions where request_id=$1',
          [f.body.request_id],
        )
      ).rows[0].n,
    ).toBe(0);
  },
);
it
  .skipIf(!native)
  .each([
    'scope_sha256',
    'version_id',
    'customer_id',
    'location_id',
    'organization_id',
  ])('rejects wrong exact %s before mutation', async (key) => {
  const f = await fixture(),
    a = await authority(f);
  Object.assign(f.body, {
    [key]: key === 'scope_sha256' ? 'b'.repeat(64) : uid(),
  });
  await expect(claim(f, a)).rejects.toThrow();
  await a.executor.query('rollback');
});
it.skipIf(!native)(
  'ordinary roles and the issuer cannot call the protected writer or access custody/sequence state',
  async () => {
    const f = await fixture(),
      a = await authority(f);
    await claim(f, a);
    await expect(
      sql(a.issuer, 'private.customer_record_review_request', [
        a.principal,
        f.body,
      ]),
    ).rejects.toThrow(/permission denied/);
    for (const client of [a.issuer, a.executor]) {
      await expect(
        client.query('select * from private.customer_request_intents'),
      ).rejects.toThrow(/permission denied/);
    }
    await a.executor.query('rollback');
    await actor(f.user, f.session);
    await db.exec('set role authenticated');
    await expect(
      sql(db, 'private.customer_record_decision', [
        f.org,
        f.body.publication_id,
        f.body.scope_sha256,
        'approve_review',
        'review-only-v1',
        uid(),
      ]),
    ).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  },
);
it.skipIf(!native).each(['mapping', 'session', 'banned-user', 'deleted-user'])(
  'revocation of %s during publication wait denies final mutation and retains UNKNOWN',
  async (kind) => {
    const f = await fixture(),
      a = await authority(f),
      ref = await claim(f, a),
      peer = await db.fork!();
    try {
      await peer.exec('begin');
      await peer.query(
        'select id from private.customer_estimate_access where id=$1 for update',
        [f.body.publication_id],
      );
      const running = sql(
        a.executor,
        'private.customer_record_review_request',
        [a.principal, f.body],
      ).then(
        () => false,
        () => true,
      );
      let observedWait = false;
      for (let i = 0; i < 50; i++) {
        const r = await db.query<{ waiting: boolean }>(
          "select exists(select 1 from pg_stat_activity where usename=$1 and wait_event_type='Lock') waiting",
          [a.executorRole],
        );
        if (r.rows[0].waiting) {
          observedWait = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(observedWait).toBe(true);
      if (kind === 'mapping')
        await db.query(
          'update public.portal_identities set active=false where organization_id=$1 and user_id=$2',
          [f.org, f.user],
        );
      if (kind === 'session')
        await db.query('delete from auth.sessions where id=$1', [f.session]);
      if (kind === 'banned-user')
        await db.query(
          "update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1",
          [f.user],
        );
      if (kind === 'deleted-user')
        await db.query(
          'update auth.users set deleted_at=clock_timestamp() where id=$1',
          [f.user],
        );
      await peer.exec('commit');
      expect(await running).toBe(true);
      await a.executor.query('rollback');
      await actor(f.user, f.session);
      await expect(
        sql(db, 'private.customer_review_request_receipt', [f.org, ref]),
      ).rejects.toThrow();
    } finally {
      await peer.exec('rollback').catch(() => {});
      await peer.close();
      await a.executor.query('rollback').catch(() => {});
    }
  },
);
it.skipIf(!native)(
  'two independently attempted commands on the same logical target cannot both claim',
  async () => {
    const f = await fixture(),
      a = await authority(f),
      ref = await claim(f, a);
    const other = await connect(
      (await a.executor.query('select session_user u')).rows[0].u,
    );
    await other.query('begin');
    const tx = (
      await other.query(
        "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
      )
    ).rows[0].v;
    await expect(
      sql(a.issuer, 'private.customer_request_claim', [
        a.principal,
        { ...f.body, request_id: uid() },
        tx,
      ]),
    ).rejects.toThrow('Existing target');
    await other.query('rollback');
    await sql(a.executor, 'private.customer_record_review_request', [
      a.principal,
      f.body,
    ]);
    await a.executor.query('commit');
    await actor(f.user, f.session);
    expect(
      (
        await sql<{ outcome: string }>(
          db,
          'private.customer_review_request_receipt',
          [f.org, ref],
        )
      ).outcome,
    ).toBe('confirmed');
  },
);
function processWorker() {
  const child = spawn(
    process.execPath,
    ['tests/helpers/customer-request-process.mjs'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const lines = createInterface({ input: child.stdout });
  const pending: {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  lines.on('line', (line) => {
    const p = pending.shift();
    if (!p) return;
    clearTimeout(p.timer);
    const v = JSON.parse(line);
    if (v.error) p.reject(Error(v.error));
    else p.resolve(v.value);
  });
  child.on('exit', () => {
    for (const p of pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(Error('process interrupted'));
    }
    lines.close();
  });
  return {
    child,
    call(action: string, extra: Record<string, unknown> = {}) {
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(Error('bounded worker timeout'));
        }, 6000);
        pending.push({ resolve, reject, timer });
        child.stdin.write(JSON.stringify({ action, ...extra }) + '\n');
      });
    },
    async kill() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    },
  };
}
it
  .skipIf(!native)
  .each(['before-claim', 'after-claim', 'after-mutation', 'after-commit'])(
  'actual process interruption %s reconciles without resubmission',
  async (phase) => {
    const f = await fixture(),
      a = await authority(f),
      worker = processWorker();
    const config = process.env.EV_TEST_PG_SOCKET
      ? {
          host: process.env.EV_TEST_PG_SOCKET,
          port: 55477,
          user: a.executorRole,
          database,
        }
      : {
          host: '127.0.0.1',
          port: 5432,
          user: a.executorRole,
          password: 'synthetic-ci-only',
          database,
        };
    try {
      const tx = await worker.call('open', { config });
      if (phase === 'before-claim') {
        await worker.kill();
        await actor(f.user, f.session);
        expect(
          (
            await sql<{ outcome: string }>(
              db,
              'private.customer_review_request_status',
              [f.org, f.body],
            )
          ).outcome,
        ).toBe('UNKNOWN');
        return;
      }
      const ref = await sql<Record<string, unknown>>(
        a.issuer,
        'private.customer_request_claim',
        [a.principal, f.body, tx],
      );
      if (phase !== 'after-claim')
        await worker.call('execute', { principal: a.principal, body: f.body });
      if (phase === 'after-commit')
        await expect(worker.call('commit-loss')).rejects.toThrow('interrupted');
      else await worker.kill();
      // A fresh read from the surviving customer identity, not continuation of the worker.
      await actor(f.user, f.session);
      const status = await sql<{ outcome: string }>(
        db,
        'private.customer_review_request_receipt',
        [f.org, ref],
      );
      expect(status.outcome).toBe(
        phase === 'after-commit' ? 'confirmed' : 'UNKNOWN',
      );
      await a.executor.query('begin');
      await expect(
        sql(a.executor, 'private.customer_record_review_request', [
          a.principal,
          f.body,
        ]),
      ).rejects.toThrow('Committed exact');
      await a.executor.query('rollback');
    } finally {
      await worker.kill();
    }
  },
);
it.skipIf(!native)(
  'the application gateway and prepared adapter use actual committed PostgreSQL records',
  async () => {
    const { disposableCustomerRequestGateway } =
      await import('../../server/customer/request-gateway');
    const { PreparedCustomerRequests } =
      await import('../../src/lib/customer-requests');
    const f = await fixture(),
      a = await authority(f),
      command = await disposableCustomerRequestGateway(
        a.issuer,
        a.executor,
        a.principal,
      );
    const auth = {
      getUser: async () => ({ data: { user: { id: f.user } }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    };
    await actor(f.user, f.session);
    const reader = new PreparedCustomerRequests(
      auth,
      {
        receipt: (org, ref) =>
          sql(db, 'private.customer_review_request_receipt', [org, ref]),
        status: (org, body) =>
          sql(db, 'private.customer_review_request_status', [org, body]),
        queue: (org) => sql(db, 'private.customer_change_request_queue', [org]),
      },
      command,
    );
    const original = (
      await db.query(
        'select to_jsonb(v) v from public.estimate_versions v where id=$1',
        [f.version],
      )
    ).rows[0].v;
    const result = await reader.submit(f.body, true);
    expect(result.outcome).toBe('confirmed');
    expect((await reader.reconcile(result.reference)).outcome).toBe(
      'confirmed',
    );
    expect(
      (
        await db.query(
          'select to_jsonb(v) v from public.estimate_versions v where id=$1',
          [f.version],
        )
      ).rows[0].v,
    ).toEqual(original);
    await expect(
      reader.submit({ ...f.body, request_id: uid() }, true),
    ).rejects.toThrow('Existing attempt');
    reader.close();
  },
);
it.skipIf(!native || process.env.EV_CUSTOMER_REQUEST_BROWSER !== 'true')(
  'actual native customer form to persisted staff queue is responsive and accessible across all brands',
  async () => {
    const { build } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    const { chromium } = await import('@playwright/test');
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const { resolve } = await import('node:path');
    const { mkdirSync } = await import('node:fs');
    const { sampleCompanies } = await import('../../src/domain/platform');
    const { disposableCustomerRequestGateway } =
      await import('../../server/customer/request-gateway');
    const { customerRequestBody } =
      await import('../../src/lib/customer-requests');
    const output = await build({
      configFile: false,
      plugins: [react()],
      oxc: { jsx: { development: false } },
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      logLevel: 'silent',
      build: {
        write: false,
        lib: {
          entry: resolve(
            'tests/browser/fixtures/customer-request-native-harness.tsx',
          ),
          formats: ['iife'],
          name: 'CustomerRequestNativeHarness',
        },
      },
    });
    const bundle = Array.isArray(output) ? output[0] : output;
    if (!('output' in bundle)) throw Error('Browser test bundle unavailable');
    const code = bundle.output.find((v) => v.type === 'chunk');
    if (!code || code.type !== 'chunk')
      throw Error('Browser test chunk unavailable');
    const browser = await chromium.launch();
    mkdirSync('artifacts/property', { recursive: true });
    try {
      for (const [name, size] of Object.entries({
        desktop: { width: 1440, height: 1050 },
        tablet: { width: 820, height: 1180 },
        mobile: { width: 390, height: 844 },
      }))
        for (let index = 0; index < 3; index++) {
          // Dedicated real local tenant per viewport; empty queue is actual SQL evidence.
          organizations[index] = uid();
          const brand = sampleCompanies[index];
          await db.query(
            "insert into public.organizations(id,name,slug,industry,status,primary_color,accent_color) values($1,$2,$3,$4,'active',$5,$6)",
            [
              organizations[index],
              brand.name,
              'browser-' + uid(),
              brand.industry,
              brand.primary_color,
              brand.accent_color,
            ],
          );
          await db.query(
            "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
            [organizations[index], owners[index]],
          );
          await db.query(
            'insert into private.property_features(organization_id,enabled) values($1,true)',
            [organizations[index]],
          );
          const f = await fixture(index),
            a = await authority(f),
            gateway = await disposableCustomerRequestGateway(
              a.issuer,
              a.executor,
              a.principal,
            );
          await actor(f.user, f.session);
          const review = await sql(db, 'private.customer_estimate_review', [
            f.org,
            f.customer,
            f.location,
            f.version,
          ]);
          const context = await browser.newContext({ viewport: size });
          const page = await context.newPage();
          let renderFailure = '';
          page.on('pageerror', (e) => {
            renderFailure = e.message;
          });
          const company = sampleCompanies[index];
          await page.exposeFunction(
            'recordNativeRequest',
            async (note: string) =>
              gateway.submit(customerRequestBody({ ...f.body, note })),
          );
          await page.exposeFunction('readNativeQueue', async () => {
            await actor(owners[index], ownerSessions[index]);
            return sql(db, 'private.customer_change_request_queue', [f.org]);
          });
          await page.setContent(
            '<!doctype html><html lang="en"><head><title>Local request validation</title></head><body><div id="root"></div></body></html>',
          );
          await page.addStyleTag({
            content:
              readFileSync('src/styles.css', 'utf8') +
              '\nmain{max-width:1100px;margin:auto;padding:20px;}p,summary{overflow-wrap:anywhere;}',
          });
          await page.evaluate(
            (json: string) => {
              Object.assign(window, { nativeReview: JSON.parse(json) });
            },
            JSON.stringify({
              review,
              customerName: 'Synthetic request customer',
              context: {
                organization_id: f.org,
                customer_id: f.customer,
                location_id: f.location,
                company_name: company.name,
                primary_color: company.primary_color,
                property_label: 'Synthetic request lane',
                reports: false,
                version_ids: [f.version],
              },
            }),
          );
          await page.evaluate((color: string) => {
            document.documentElement.style.setProperty(
              '--company-primary',
              color,
            );
            document.documentElement.style.setProperty(
              '--company-color',
              color,
            );
          }, company.primary_color);
          await page.addScriptTag({ content: code.code });
          await page.waitForTimeout(30);
          if (renderFailure) throw Error(renderFailure);
          await page
            .getByRole('button', { name: 'Read persisted requests' })
            .click();
          await page
            .getByText('No persisted change requests are available.')
            .waitFor();
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
          );
          const note =
            '<script>customer text only</script> Please adjust the scope.';
          await page.getByLabel('Requested changes').fill(note);
          await page
            .getByLabel('Confirm this is a local database review only')
            .check();
          await page
            .getByRole('button', { name: 'Review preference', exact: true })
            .click();
          await page.screenshot({
            path: `artifacts/property/customer-requests-native-${company.id}-${name}-customer.png`,
            fullPage: true,
          });
          await page
            .getByRole('button', {
              name: 'Record local database change request',
              exact: true,
            })
            .click();
          await page.getByText(/Persisted receipt .* confirmed/).waitFor();
          await page
            .getByRole('button', { name: 'Read persisted requests' })
            .click();
          await page.getByText(note, { exact: true }).waitFor();
          expect(await page.locator('section script').count()).toBe(0);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
          );
          await page.screenshot({
            path: `artifacts/property/customer-requests-native-${company.id}-${name}.png`,
            fullPage: true,
          });
          await context.close();
        }
    } finally {
      await browser.close();
    }
  },
  90000,
);
it('preserves actual pre-extension v1 rows and immutable receipt shape', async () => {
  await actor(legacy.user, legacy.session);
  const value = await sql<{ decision: unknown }>(
    db,
    'private.customer_decision_context',
    [legacy.org, legacy.customer, legacy.location, legacy.version],
  );
  expect(value.decision).toEqual(legacyReceipt);
  expect(
    (
      await db.query(
        "select to_jsonb(d)-'note'-'command_id'-'request_sha256' v from private.customer_review_decisions d where request_id=$1",
        [legacy.body.request_id],
      )
    ).rows[0].v,
  ).toEqual(legacyRow);
  await expect(
    db.query(
      "update private.customer_review_decisions set note='rewritten' where request_id=$1",
      [legacy.body.request_id],
    ),
  ).rejects.toThrow('immutable');
});
it.skipIf(!native)(
  'historical receipt remains readable after publication expiry without reopening issued scope',
  async () => {
    const f = await fixture(0, 2000),
      a = await authority(f),
      ref = await claim(f, a);
    await sql(a.executor, 'private.customer_record_review_request', [
      a.principal,
      f.body,
    ]);
    await a.executor.query('commit');
    await new Promise((r) => setTimeout(r, 2200));
    await actor(f.user, f.session);
    expect(
      (
        await sql<{ outcome: string }>(
          db,
          'private.customer_review_request_receipt',
          [f.org, ref],
        )
      ).outcome,
    ).toBe('confirmed');
    await expect(
      sql(db, 'private.customer_estimate_review', [
        f.org,
        f.customer,
        f.location,
        f.version,
      ]),
    ).rejects.toThrow();
    await expect(
      sql(db, 'private.customer_review_request_status', [
        f.org,
        { ...f.body, note: 'wrong request note' },
      ]),
    ).rejects.toThrow('Exact receipt');
  },
);
it
  .skipIf(!native)
  .each([
    'user_id',
    'publication_id',
    'scope_sha256',
    'request_sha256',
    'customer_id',
    'location_id',
  ])('retained %s mismatch cannot reveal another receipt', async (key) => {
  const f = await fixture(),
    a = await authority(f),
    ref = await claim(f, a);
  await sql(a.executor, 'private.customer_record_review_request', [
    a.principal,
    f.body,
  ]);
  await a.executor.query('commit');
  await actor(f.user, f.session);
  await expect(
    sql(db, 'private.customer_review_request_receipt', [
      f.org,
      { ...ref, [key]: key.endsWith('sha256') ? 'c'.repeat(64) : uid() },
    ]),
  ).rejects.toThrow();
});
it.skipIf(!native)(
  'a replacement publication and request ID cannot evade a committed unresolved target',
  async () => {
    const f = await fixture(),
      a = await authority(f);
    await claim(f, a);
    await actor(owners[0], ownerSessions[0]);
    await sql(db, 'private.customer_revoke_publication', [
      f.org,
      f.body.publication_id,
    ]);
    const next = await sql<{ publication_id: string }>(
      db,
      'private.customer_publish_estimate',
      [
        f.org,
        {
          customer_id: f.customer,
          location_id: f.location,
          user_id: f.user,
          version_id: f.version,
          source_report_id: null,
          finding_id: null,
          source_line_id: null,
          scope_sha256: f.body.scope_sha256,
          request_id: uid(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
          review_acknowledged: true,
          approval_reference: 'separate disposable publication',
        },
      ],
    );
    const other = await connect(a.executorRole);
    await other.query('begin');
    const tx = (
      await other.query(
        "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
      )
    ).rows[0].v;
    await expect(
      sql(a.issuer, 'private.customer_request_claim', [
        a.principal,
        { ...f.body, request_id: uid(), publication_id: next.publication_id },
        tx,
      ]),
    ).rejects.toThrow('Existing target');
    await other.query('rollback');
    await a.executor.query('rollback');
  },
);
it.skipIf(!native)(
  '2,000 Unicode code points persist exactly and do not trigger financial, work or communication effects',
  async () => {
    const f = await fixture(),
      a = await authority(f);
    f.body.note = '😀'.repeat(2000);
    const tables = [
      'public.jobs',
      'public.release_contracts',
      'public.release_signatures',
      'public.release_invoices',
      'public.release_authorizations',
      'public.release_payment_events',
      'public.release_ledger_entries',
      'public.release_messages',
      'private.provider_email_outbox',
    ];
    const counts = async () =>
      Promise.all(
        tables.map((t) =>
          db.query(`select count(*) n from ${t}`).then((r) => r.rows[0].n),
        ),
      );
    const before = await counts();
    await claim(f, a);
    const result = await sql<{ receipt: { note: string } }>(
      a.executor,
      'private.customer_record_review_request',
      [a.principal, f.body],
    );
    await a.executor.query('commit');
    expect(result.receipt.note).toBe(f.body.note);
    expect(await counts()).toEqual(before);
  },
);
it
  .skipIf(!native)
  .each([
    'estimator',
    'office_manager',
    'field_staff',
    'inactive',
    'owner-aal1',
    'foreign',
  ])('staff reader enforces current role %s and required MFA', async (kind) => {
  const f = await fixture(),
    user = uid(),
    session = uid();
  await db.query(
    'insert into auth.users(id,email_confirmed_at) values($1,clock_timestamp())',
    [user],
  );
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [
    session,
    user,
  ]);
  await db.query(
    'insert into public.memberships(organization_id,user_id,role,staff_type,active) values($1,$2,$3,$4,$5)',
    [
      kind === 'foreign' ? organizations[1] : f.org,
      user,
      kind === 'owner-aal1' ? 'owner' : 'staff',
      kind === 'owner-aal1'
        ? 'office_manager'
        : kind === 'inactive'
          ? 'estimator'
          : kind === 'foreign'
            ? 'estimator'
            : kind,
      kind !== 'inactive',
    ],
  );
  await actor(user, session, 'aal1');
  if (['estimator', 'office_manager'].includes(kind))
    expect(
      (
        await sql<{ organization_id: string }>(
          db,
          'private.customer_change_request_queue',
          [f.org],
        )
      ).organization_id,
    ).toBe(f.org);
  else
    await expect(
      sql(db, 'private.customer_change_request_queue', [f.org]),
    ).rejects.toThrow();
});
it.skipIf(!native)(
  'current staff revocation after an observed membership wait denies the queue',
  async () => {
    const f = await fixture();
    await actor(owners[0], ownerSessions[0]);
    const pid = (await db.query<{ pid: number }>('select pg_backend_pid() pid'))
      .rows[0].pid;
    const blocker = await db.fork!(),
      observer = await db.fork!();
    try {
      await blocker.exec('begin');
      await blocker.query(
        'update public.memberships set active=false where organization_id=$1 and user_id=$2',
        [f.org, owners[0]],
      );
      const result = sql(db, 'private.customer_change_request_queue', [
        f.org,
      ]).then(
        () => false,
        () => true,
      );
      let waited = false;
      for (let n = 0; n < 50; n++) {
        const r = await observer.query<{ waiting: boolean }>(
          "select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') waiting",
          [pid],
        );
        if (r.rows[0].waiting) {
          waited = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(waited).toBe(true);
      await blocker.exec('commit');
      expect(await result).toBe(true);
    } finally {
      await blocker.exec('rollback').catch(() => {});
      await observer.query(
        'update public.memberships set active=true where organization_id=$1 and user_id=$2',
        [f.org, owners[0]],
      );
      await blocker.close();
      await observer.close();
    }
  },
);

it('historical v1 receipt reads never fabricate retrospective custody claims', async () => {
  await actor(legacy.user, legacy.session);
  const r = await sql<{
    outcome: string;
    custody: string;
    receipt: { id: string };
  }>(db, 'private.customer_review_request_status', [
    legacy.org,
    {
      ...legacy.body,
      choice: 'approve_review',
      note: '',
      acknowledgment: 'review-only-v1',
    },
  ]);
  expect(r.outcome).toBe('confirmed');
  expect(r.custody).toBe('legacy-v1');
  expect(r.receipt.id).toBe((legacyReceipt as { id: string }).id);
  expect(
    (
      await db.query(
        'select count(*) n from private.customer_request_intents where id=$1',
        [legacy.body.request_id],
      )
    ).rows[0].n,
  ).toBe(0);
});
it.skipIf(!native)(
  'a wrong claimed body burns entry before validation and cannot be corrected through a savepoint',
  async () => {
    const f = await fixture(),
      a = await authority(f);
    await claim(f, a);
    await a.executor.query('savepoint wrong_body');
    await expect(
      sql(a.executor, 'private.customer_record_review_request', [
        a.principal,
        { ...f.body, scope_sha256: 'e'.repeat(64) },
      ]),
    ).rejects.toThrow('Exact claimed body');
    await a.executor.query('rollback to savepoint wrong_body');
    await expect(
      sql(a.executor, 'private.customer_record_review_request', [
        a.principal,
        f.body,
      ]),
    ).rejects.toThrow('spent');
    await a.executor.query('rollback');
  },
);
it.skipIf(!native)(
  'another current customer cannot retrieve an owned receipt even with its request ID',
  async () => {
    const f = await fixture(),
      a = await authority(f),
      ref = await claim(f, a);
    await sql(a.executor, 'private.customer_record_review_request', [
      a.principal,
      f.body,
    ]);
    await a.executor.query('commit');
    const foreign = await fixture();
    await actor(foreign.user, foreign.session);
    await expect(
      sql(db, 'private.customer_review_request_receipt', [f.org, ref]),
    ).rejects.toThrow();
    const probe = {
      ...ref,
      user_id: foreign.user,
      customer_id: foreign.customer,
      location_id: foreign.location,
      version_id: foreign.version,
      publication_id: foreign.body.publication_id,
    };
    const r = await sql<{ outcome: string; receipt: unknown }>(
      db,
      'private.customer_review_request_receipt',
      [f.org, probe],
    );
    expect(r).toMatchObject({ outcome: 'UNKNOWN', receipt: null });
  },
);
it.skipIf(!native)(
  'simultaneous conflicting claims on separate backends admit exactly one command',
  async () => {
    const f = await fixture(),
      a = await authority(f),
      issuer2 = await connect(
        (await a.issuer.query('select session_user u')).rows[0].u,
      ),
      executor2 = await connect(a.executorRole);
    const transaction = async (client: Client) => {
      await client.query('begin');
      return (
        await client.query(
          "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
        )
      ).rows[0].v;
    };
    const [tx1, tx2] = await Promise.all([
      transaction(a.executor),
      transaction(executor2),
    ]);
    const second = {
      ...f.body,
      request_id: uid(),
      choice: 'approve_review',
      note: '',
    };
    const outcomes = await Promise.allSettled([
      sql(a.issuer, 'private.customer_request_claim', [
        a.principal,
        f.body,
        tx1,
      ]),
      sql(issuer2, 'private.customer_request_claim', [
        a.principal,
        second,
        tx2,
      ]),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const first = outcomes[0].status === 'fulfilled',
      consumer = first ? a.executor : executor2,
      loser = first ? executor2 : a.executor;
    await loser.query('rollback');
    await sql(consumer, 'private.customer_record_review_request', [
      a.principal,
      first ? f.body : second,
    ]);
    await consumer.query('commit');
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_review_decisions where organization_id=$1 and user_id=$2 and version_id=$3',
          [f.org, f.user, f.version],
        )
      ).rows[0].n,
    ).toBe(1);
  },
);
