import { sampleCompanies } from '../../src/domain/platform';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Client } from 'pg';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import {
  CustomerRequestBroker,
  CustomerBrokerDatabase,
  type BrokerConnection,
} from '../../server/customer/broker';
const native =
  !!process.env.EV_TEST_PG_SOCKET ||
  (process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true');
const test = it.skipIf(!native),
  uid = () => crypto.randomUUID();
let db: TestDatabase,
  database = '';
const clients: Client[] = [],
  roles: string[] = [];
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

const fixedRoles = [
  'customer4b_core',
  'customer4b_admission_owner',
  'customer4b_reader_owner',
  'customer4b_registrar',
  'customer4b_reader',
];
beforeAll(async () => {
  if (!native) return;
  db = createTestDatabase();
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
  await db.exec(readFileSync('server/customer/requests.proposed.sql', 'utf8'));
  await db.exec(readFileSync('server/customer/broker.proposed.sql', 'utf8'));
  for (const role of fixedRoles)
    await db.exec(
      `create role ${role} ${role.endsWith('registrar') || role === 'customer4b_reader' ? 'login' : 'nologin'} nosuperuser nocreatedb nocreaterole noinherit nobypassrls password 'synthetic-ci-only'`,
    );
  await db.exec(
    readFileSync('server/customer/broker-ownership.proposed.sql', 'utf8'),
  );
  database = (await db.query<{ d: string }>('select current_database() d'))
    .rows[0].d;
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
      "insert into public.organizations(id,name,slug,industry,status) values($1,$2,$3,$4,'active')",
      [
        organizations[i],
        sampleCompanies[i].name,
        'broker-' + i,
        sampleCompanies[i].industry,
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
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.end().catch(() => {})));
});
afterAll(async () => {
  if (!native) return;
  await Promise.all(clients.splice(0).map((c) => c.end().catch(() => {})));
  await db.close();
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
  for (const r of [...roles, ...fixedRoles])
    await admin.query(`drop role if exists ${r}`);
  await admin.end();
});
const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_synthetic_test_only',
};
function token(
  user: string,
  session: string,
  aal = 'aal1',
  exp = Math.floor(Date.now() / 1000) + 3600,
) {
  return (
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
      'base64url',
    ) +
    '.' +
    Buffer.from(
      JSON.stringify({
        sub: user,
        session_id: session,
        aal,
        exp,
        iat: Math.floor(Date.now() / 1000),
        iss: config.url + '/auth/v1',
        aud: 'authenticated',
        role: 'authenticated',
      }),
    ).toString('base64url') +
    '.controlled_signature'
  );
}
// Controlled provider exercises the ACTUAL pinned SDK. NOT genuine hosted Auth.
function verifier(
  tokens: Map<string, { user: string; session: string; aal: string }>,
) {
  return new CustomerBrokerAuth(config, async (input, init) => {
    const url = String(input),
      h = new Headers(init?.headers),
      bearer = (h.get('authorization') ?? '').replace(/^Bearer /, '');
    const x = tokens.get(bearer);
    if (!x)
      return new Response(JSON.stringify({ message: 'denied' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    if (url.endsWith('/auth/v1/user'))
      return Response.json({ id: x.user, email: 'synthetic@example.test' });
    if (url.endsWith('/rest/v1/rpc/customer_session_status')) {
      await actor(x.user, x.session, x.aal);
      return Response.json(await sql(db, 'private.customer_session_status'));
    }
    throw Error('Unexpected provider endpoint');
  });
}
async function composition(
  f: Awaited<ReturnType<typeof fixture>>,
  options: { executor?: BrokerConnection } = {},
) {
  const suffix = uid().replaceAll('-', ''),
    issuer = 'broker_i_' + suffix,
    executor = 'broker_e_' + suffix;
  roles.push(issuer, executor);
  for (const role of [issuer, executor])
    await db.exec(
      `create role ${role} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password 'synthetic-ci-only';grant usage on schema private to ${role}`,
    );
  await db.exec(
    `grant execute on function private.customer_request_claim(uuid,jsonb,jsonb) to ${issuer};grant execute on function private.customer_record_review_request(uuid,jsonb) to ${executor}`,
  );
  const wrap = async (role: string): Promise<BrokerConnection> => {
    const c = await connect(role);
    return { query: c.query.bind(c), destroy: () => c.end() };
  };
  const ports = {
    registrar: await wrap('customer4b_registrar'),
    issuer: await wrap(issuer),
    executor: options.executor ?? (await wrap(executor)),
    reader: await wrap('customer4b_reader'),
  };
  const storage = await CustomerBrokerDatabase.disposable(ports);
  const bearer = token(f.user, f.session),
    staff = token(
      owners[organizations.indexOf(f.org)],
      ownerSessions[organizations.indexOf(f.org)],
      'aal2',
    );
  const auth = verifier(
    new Map([
      [bearer, { user: f.user, session: f.session, aal: 'aal1' }],
      [
        staff,
        {
          user: owners[organizations.indexOf(f.org)],
          session: ownerSessions[organizations.indexOf(f.org)],
          aal: 'aal2',
        },
      ],
    ]),
  );
  return {
    broker: new CustomerRequestBroker(auth, storage),
    storage,
    bearer,
    staff,
    auth,
    ports,
    issuer,
    executor,
    intent: {
      organization_id: f.org,
      publication_id: f.body.publication_id,
      choice: 'request_changes_review',
      note: ' Please update the customer scope. ',
      acknowledgment: 'review-only-v2',
      confirmed: true,
    },
  };
}
test.each([0, 1, 2])(
  'restricted broker persists actual receipt and reads eligible staff queue for company %s',
  async (index) => {
    const f = await fixture(index),
      c = await composition(f);
    const result = await c.broker.submit(c.bearer, c.intent);
    expect(result.outcome).toBe('confirmed');
    expect(result.receipt?.note).toBe(c.intent.note.trim());
    expect(result.reference.request_id).not.toBe(f.body.request_id);
    const own = await c.broker.reconcile(
      c.bearer,
      f.org,
      f.body.publication_id,
    );
    expect(own).toEqual(result);
    const queue = await c.broker.staffQueue(c.staff, f.org);
    expect(
      queue.requests.some((x) => x.receipt.id === result.receipt?.id),
    ).toBe(true);
    await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow(/held/);
    await c.storage.close();
  },
);

test('browser authority fields and forged opaque proofs never dispatch', async () => {
  const f = await fixture(),
    c = await composition(f);
  for (const field of [
    'request_id',
    'principal',
    'user_id',
    'session_id',
    'issuer',
    'scope_sha256',
  ]) {
    await expect(
      new CustomerRequestBroker(c.auth, c.storage).submit(c.bearer, {
        ...c.intent,
        [field]: uid(),
      }),
    ).rejects.toThrow();
  }
  expect(
    (
      await db.query(
        'select count(*) n from private.customer_broker_admissions where publication_id=$1',
        [f.body.publication_id],
      )
    ).rows[0].n,
  ).toBe(0);
  const { brokerActor } = await import('../../server/customer/broker-auth');
  expect(() => brokerActor({ verified: true })).toThrow();
  await c.storage.close();
});
test('default-off broker does not call Auth or SQL', async () => {
  const auth = new CustomerBrokerAuth(config, async () => {
    throw Error('No network allowed');
  });
  await expect(
    new CustomerRequestBroker(auth).submit('never-send', {}),
  ).rejects.toThrow(/disabled/);
});
test('customer cannot use the staff reader and staff cannot submit customer requests', async () => {
  const f = await fixture(),
    c = await composition(f);
  await expect(c.broker.staffQueue(c.bearer, f.org)).rejects.toThrow();
  await expect(c.broker.submit(c.staff, c.intent)).rejects.toThrow(/UNKNOWN/);
  expect(
    (
      await db.query(
        'select count(*) n from private.customer_broker_admissions where publication_id=$1',
        [f.body.publication_id],
      )
    ).rows[0].n,
  ).toBe(0);
  await c.storage.close();
});
test.each(['mapping', 'session', 'publication', 'user'])(
  'revoked %s rejects admission without a decision',
  async (kind) => {
    const f = await fixture(),
      c = await composition(f);
    if (kind === 'mapping')
      await db.query(
        'update public.portal_identities set active=false where user_id=$1',
        [f.user],
      );
    if (kind === 'session')
      await db.query('delete from auth.sessions where id=$1', [f.session]);
    if (kind === 'publication')
      await db.query(
        'update private.customer_estimate_access set revoked_at=clock_timestamp() where id=$1',
        [f.body.publication_id],
      );
    if (kind === 'user')
      await db.query(
        "update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=$1",
        [f.user],
      );
    await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow();
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_review_decisions where publication_id=$1',
          [f.body.publication_id],
        )
      ).rows[0].n,
    ).toBe(0);
    await c.storage.close();
  },
);
test('foreign tenant/publication cannot be selected with a genuine fixture identity', async () => {
  const f = await fixture(),
    foreign = await fixture(1),
    c = await composition(f);
  await expect(
    c.broker.submit(c.bearer, {
      ...c.intent,
      organization_id: foreign.org,
      publication_id: foreign.body.publication_id,
    }),
  ).rejects.toThrow(/UNKNOWN/);
  await c.storage.close();
});
test('concurrent broker instances cannot admit two commands for the same issued version', async () => {
  const f = await fixture(),
    a = await composition(f),
    b = await composition(f);
  const results = await Promise.allSettled([
    a.broker.submit(a.bearer, a.intent),
    b.broker.submit(b.bearer, b.intent),
  ]);
  expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(
    (
      await db.query(
        'select count(*) n from private.customer_broker_admissions where publication_id=$1',
        [f.body.publication_id],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query(
        'select count(*) n from private.customer_review_decisions where publication_id=$1',
        [f.body.publication_id],
      )
    ).rows[0].n,
  ).toBe(1);
  await a.storage.close();
  await b.storage.close();
});
test('restricted runtime roles reject direct CRUD, inverse authority, SET ROLE and helper calls', async () => {
  const f = await fixture(),
    c = await composition(f);
  for (const role of [
    'customer4b_registrar',
    'customer4b_reader',
    c.issuer,
    c.executor,
  ]) {
    const client = await connect(role);
    for (const query of [
      'select * from private.customer_review_decisions',
      'select * from private.customer_broker_admissions',
      "select private.customer_broker_identity('{}')",
      'set role customer4b_core',
      'insert into private.customer_request_principals default values',
    ])
      await expect(client.query(query)).rejects.toThrow();
  }
  await expect(
    c.ports.issuer.query(
      "select private.customer_record_review_request($1,'{}')",
      [uid()],
    ),
  ).rejects.toThrow();
  await expect(
    c.ports.executor.query(
      "select private.customer_request_claim($1,'{}','{}')",
      [uid()],
    ),
  ).rejects.toThrow();
  await c.storage.close();
});
test('new function owners are NOLOGIN/NOBYPASS and cannot modify publication rows through lock grants', async () => {
  const f = await fixture();
  const owners = (
    await db.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
    }>(
      "select rolname,rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname in ('customer4b_core','customer4b_admission_owner','customer4b_reader_owner')",
    )
  ).rows;
  expect(owners).toHaveLength(3);
  expect(
    owners.every((r) => !r.rolsuper && !r.rolbypassrls && !r.rolcanlogin),
  ).toBe(true);
  await db.exec('set role customer4b_core');
  await expect(
    db.query(
      'update private.customer_estimate_access set scope_sha256=$1 where id=$2',
      ['a'.repeat(64), f.body.publication_id],
    ),
  ).rejects.toThrow();
  await db.exec('reset role');
  const catalog = (
    await db.query<{ owner: string }>(
      "select pg_get_userbyid(proowner) owner from pg_proc where oid='private.customer_request_claim(uuid,jsonb,jsonb)'::regprocedure",
    )
  ).rows[0];
  expect(catalog.owner).toBe('customer4b_core');
});
test('public API roles receive no new broker or private mutation privileges', async () => {
  for (const role of ['anon', 'authenticated', 'service_role'])
    for (const fn of [
      'private.customer_broker_admit(jsonb,jsonb,name,name,jsonb)',
      'private.customer_broker_identity(jsonb)',
      'private.customer_broker_staff_read(jsonb,uuid)',
      'private.customer_broker_receipt(jsonb,uuid,uuid)',
    ]) {
      expect(
        (
          await db.query<{ ok: boolean }>(
            'select has_function_privilege($1,$2,$3) ok',
            [role, fn, 'EXECUTE'],
          )
        ).rows[0].ok,
      ).toBe(false);
    }
});
test('definer column grants exclude private estimate payload and Auth email', async () => {
  const { reviewCustomerBrokerOwnership } =
    await import('../../server/customer/broker-ownership');
  await reviewCustomerBrokerOwnership(db);
  await db.exec('set role customer4b_core');
  try {
    await expect(
      db.query('select payload from public.estimate_versions'),
    ).rejects.toThrow();
    await expect(
      db.query('select id,version_number from public.estimate_versions'),
    ).resolves.toBeDefined();
  } finally {
    await db.exec('reset role');
  }
  await db.exec('set role customer4b_reader_owner');
  try {
    await expect(db.query('select email from auth.users')).rejects.toThrow();
    await expect(
      db.query('select id,email_confirmed_at from auth.users'),
    ).resolves.toBeDefined();
  } finally {
    await db.exec('reset role');
  }
});
test('new private payload grants fail the action-time ownership gate', async () => {
  const f = await fixture(),
    c = await composition(f);
  await db.exec(
    'grant select(payload) on public.estimate_versions to customer4b_core',
  );
  try {
    await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow(
      /UNKNOWN/,
    );
    expect(
      (
        await db.query(
          'select 1 from private.customer_broker_admissions where organization_id=$1 and version_id=$2',
          [f.org, f.body.version_id],
        )
      ).rows,
    ).toHaveLength(0);
  } finally {
    await db.exec(
      'revoke select(payload) on public.estimate_versions from customer4b_core',
    );
    await c.storage.close();
  }
});
test('inherited SET authority added to a runtime role prevents admission', async () => {
  const f = await fixture(),
    c = await composition(f);
  await db.exec(
    `grant authenticated to ${c.executor} with inherit false,set true`,
  );
  await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow(/UNKNOWN/);
  await c.storage.close();
});

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

test.each(['after-admission', 'after-claim', 'after-mutation', 'after-commit'])(
  'actual consumer process loss %s permits exact read only',
  async (phase) => {
    const f = await fixture(),
      c = await composition(f),
      worker = processWorker();
    const socket = process.env.EV_TEST_PG_SOCKET;
    const connection = socket
      ? { host: socket, port: 55477, user: c.executor, database }
      : {
          host: '127.0.0.1',
          port: 5432,
          user: c.executor,
          password: 'synthetic-ci-only',
          database,
        };
    try {
      const tx = await worker.call('open', { config: connection });
      const { brokerActor } = await import('../../server/customer/broker-auth');
      const admitted = await sql<{
        principal: string;
        body: Record<string, unknown>;
      }>(c.ports.registrar, 'private.customer_broker_admit', [
        brokerActor(await c.auth.verify(c.bearer)),
        c.intent,
        c.issuer,
        c.executor,
        tx,
      ]);
      if (phase !== 'after-admission')
        await sql(c.ports.issuer, 'private.customer_request_claim', [
          admitted.principal,
          admitted.body,
          tx,
        ]);
      if (phase === 'after-mutation' || phase === 'after-commit')
        await worker.call('execute', {
          principal: admitted.principal,
          body: admitted.body,
        });
      if (phase === 'after-commit')
        await expect(worker.call('commit-loss')).rejects.toThrow(/interrupted/);
      else await worker.kill();
      const result = await c.broker.reconcile(
        c.bearer,
        f.org,
        f.body.publication_id,
      );
      expect(result.outcome).toBe(
        phase === 'after-commit' ? 'confirmed' : 'UNKNOWN',
      );
      const fresh = await composition(f);
      await expect(
        fresh.broker.submit(fresh.bearer, fresh.intent),
      ).rejects.toThrow(/UNKNOWN/);
      await fresh.storage.close();
      await c.ports.executor.query('begin');
      const freshTx = (
        await c.ports.executor.query(
          "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
        )
      ).rows[0].v;
      await expect(
        sql(c.ports.issuer, 'private.customer_request_claim', [
          admitted.principal,
          admitted.body,
          freshTx,
        ]),
      ).rejects.toThrow();
      await c.ports.executor.query('rollback');
      expect(
        (
          await db.query(
            'select count(*) n from private.customer_broker_admissions where publication_id=$1',
            [f.body.publication_id],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await worker.kill();
      await c.storage.close();
    }
  },
);
test.each(['admission-commit', 'mutation-ack', 'consumer-commit'])(
  'lost %s acknowledgment never dispatches again',
  async (phase) => {
    const f = await fixture(),
      c = await composition(f),
      port =
        phase === 'admission-commit' ? c.ports.registrar : c.ports.executor,
      original = port.query.bind(port);
    let lost = false;
    port.query = async <T extends Record<string, unknown>>(
      query: string,
      args?: unknown[],
    ) => {
      const value = await original<T>(query, args);
      if (
        !lost &&
        (phase === 'mutation-ack'
          ? query.startsWith('select private.customer_record_review_request')
          : query === 'commit')
      ) {
        lost = true;
        throw Error('lost test acknowledgment');
      }
      return value;
    };
    await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow(
      /UNKNOWN/,
    );
    expect(lost).toBe(true);
    const r = await c.broker.reconcile(c.bearer, f.org, f.body.publication_id);
    expect(r.outcome).toBe(
      phase === 'consumer-commit' ? 'confirmed' : 'UNKNOWN',
    );
    await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow(/held/);
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_broker_admissions where publication_id=$1',
          [f.body.publication_id],
        )
      ).rows[0].n,
    ).toBe(1);
    await c.storage.close();
  },
);
test('revoked mapping during an observed registrar publication lock wait denies admission', async () => {
  const f = await fixture(),
    c = await composition(f),
    lock = await db.fork!();
  try {
    await lock.exec('begin');
    await lock.query(
      'select id from private.customer_estimate_access where id=$1 for update',
      [f.body.publication_id],
    );
    const pending = c.broker.submit(c.bearer, c.intent).then(
      () => false,
      () => true,
    );
    let observed = false;
    for (let i = 0; i < 60; i++) {
      if (
        (
          await db.query<{ v: boolean }>(
            "select exists(select 1 from pg_stat_activity where datname=$1 and usename='customer4b_registrar' and wait_event_type='Lock') v",
            [database],
          )
        ).rows[0].v
      ) {
        observed = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(observed).toBe(true);
    await db.query(
      'update public.portal_identities set active=false where user_id=$1',
      [f.user],
    );
    await lock.exec('commit');
    expect(await pending).toBe(true);
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_broker_admissions where publication_id=$1',
          [f.body.publication_id],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await lock.exec('rollback').catch(() => {});
    await lock.close();
    await c.storage.close();
  }
});
test.each(['aal1', 'inactive', 'foreign'])(
  'staff %s fails exact queue authority',
  async (kind) => {
    const f = await fixture(),
      c = await composition(f);
    await c.broker.submit(c.bearer, c.intent);
    let bearer = c.staff,
      auth = c.auth;
    if (kind === 'aal1') {
      const t = token(owners[0], ownerSessions[0], 'aal1');
      auth = verifier(
        new Map([
          [t, { user: owners[0], session: ownerSessions[0], aal: 'aal1' }],
        ]),
      );
      bearer = t;
    }
    if (kind === 'inactive')
      await db.query(
        'update public.memberships set active=false where organization_id=$1 and user_id=$2',
        [f.org, owners[0]],
      );
    if (kind === 'foreign') {
      const t = token(owners[1], ownerSessions[1], 'aal2');
      auth = verifier(
        new Map([
          [t, { user: owners[1], session: ownerSessions[1], aal: 'aal2' }],
        ]),
      );
      bearer = t;
    }
    await expect(
      new CustomerRequestBroker(auth, c.storage).staffQueue(bearer, f.org),
    ).rejects.toThrow();
    if (kind === 'inactive')
      await db.query(
        'update public.memberships set active=true where organization_id=$1 and user_id=$2',
        [f.org, owners[0]],
      );
    await c.storage.close();
  },
);
test('actual connection pool backend replacement blocks before protected admission', async () => {
  const f = await fixture(),
    c = await composition(f),
    replacement = await connect('customer4b_registrar');
  c.ports.registrar.query = replacement.query.bind(replacement);
  await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow(/UNKNOWN/);
  expect(
    (
      await db.query(
        'select count(*) n from private.customer_broker_admissions where publication_id=$1',
        [f.body.publication_id],
      )
    ).rows[0].n,
  ).toBe(0);
  await c.storage.close();
});
test('separate reader transaction resets claims and excludes private financial fields', async () => {
  const f = await fixture(),
    c = await composition(f);
  await c.broker.submit(c.bearer, c.intent);
  const queue = await c.broker.staffQueue(c.staff, f.org),
    json = JSON.stringify(queue);
  for (const word of [
    'PRIVATE STAFF',
    'unit_cost',
    'margin',
    'payroll',
    'supplier',
  ])
    expect(json).not.toContain(word);
  const setting = await c.ports.reader.query<{ s: string | null }>(
    "select current_setting('request.jwt.claims',true) s",
  );
  expect([null, '']).toContain(setting.rows[0].s);
  await c.storage.close();
});

test('uncommitted registrar admission cannot authorize the independent issuer', async () => {
  const f = await fixture(),
    c = await composition(f),
    { brokerActor } = await import('../../server/customer/broker-auth');
  await c.ports.executor.query('begin');
  const tx = (
    await c.ports.executor.query(
      "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
    )
  ).rows[0].v;
  await c.ports.registrar.query('begin');
  const admitted = await sql<{ principal: string; body: unknown }>(
    c.ports.registrar,
    'private.customer_broker_admit',
    [
      brokerActor(await c.auth.verify(c.bearer)),
      c.intent,
      c.issuer,
      c.executor,
      tx,
    ],
  );
  await expect(
    sql(c.ports.issuer, 'private.customer_request_claim', [
      admitted.principal,
      admitted.body,
      tx,
    ]),
  ).rejects.toThrow();
  await c.ports.registrar.query('rollback');
  await c.ports.executor.query('rollback');
  await c.storage.close();
});
test('an altered body cannot cross the broker admission into the existing claim', async () => {
  const f = await fixture(),
    c = await composition(f),
    { brokerActor } = await import('../../server/customer/broker-auth');
  await c.ports.executor.query('begin');
  const tx = (
    await c.ports.executor.query(
      "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
    )
  ).rows[0].v;
  const a = await sql<{ principal: string; body: Record<string, unknown> }>(
    c.ports.registrar,
    'private.customer_broker_admit',
    [
      brokerActor(await c.auth.verify(c.bearer)),
      c.intent,
      c.issuer,
      c.executor,
      tx,
    ],
  );
  await expect(
    sql(c.ports.issuer, 'private.customer_request_claim', [
      a.principal,
      { ...a.body, note: 'changed after admission' },
      tx,
    ]),
  ).rejects.toThrow(/broker admission/);
  await c.ports.executor.query('rollback');
  expect(
    (await c.broker.reconcile(c.bearer, f.org, f.body.publication_id)).outcome,
  ).toBe('UNKNOWN');
  await c.storage.close();
});
test('original issued version and financial/work/communication records remain unchanged', async () => {
  const f = await fixture(),
    c = await composition(f);
  const tables = (
    await db.query<{ s: string; n: string }>(
      "select schemaname s,tablename n from pg_tables where schemaname in ('public','private') and (tablename like '%invoice%' or tablename like '%payment%' or tablename like '%contract%' or tablename like '%outbox%' or tablename in ('jobs','estimates','estimate_versions','sandbox_gateway_attempts')) order by schemaname,tablename",
    )
  ).rows;
  const counts = async () =>
    Promise.all(
      tables.map(
        async (t) =>
          (
            await db.query<{ n: number }>(
              `select count(*) n from ${t.s}.${t.n}`,
            )
          ).rows[0].n,
      ),
    );
  const before = await counts(),
    version = (
      await db.query(
        'select to_jsonb(v) v from public.estimate_versions v where id=$1',
        [f.version],
      )
    ).rows[0].v;
  await c.broker.submit(c.bearer, c.intent);
  expect(await counts()).toEqual(before);
  expect(
    (
      await db.query(
        'select to_jsonb(v) v from public.estimate_versions v where id=$1',
        [f.version],
      )
    ).rows[0].v,
  ).toEqual(version);
  await c.storage.close();
});

test('elevated function-owner drift at action time fails closed before admission', async () => {
  const f = await fixture(),
    c = await composition(f);
  await db.exec(
    'alter function private.customer_request_claim(uuid,jsonb,jsonb) owner to ev_test',
  );
  try {
    await expect(c.broker.submit(c.bearer, c.intent)).rejects.toThrow(
      /UNKNOWN/,
    );
    expect(
      (
        await db.query(
          'select count(*) n from private.customer_broker_admissions where publication_id=$1',
          [f.body.publication_id],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await db.exec(
      'alter function private.customer_request_claim(uuid,jsonb,jsonb) owner to customer4b_core',
    );
    await c.storage.close();
  }
});
test('catalog review reports unresolved historical TCB rather than operational PASS', async () => {
  const f = await fixture(),
    c = await composition(f),
    { reviewCustomerBrokerOwnership } =
      await import('../../server/customer/broker-ownership');
  const r = await reviewCustomerBrokerOwnership(c.ports.reader);
  expect(r.scopedOwnershipVerified).toBe(true);
  expect(r.operationalReady).toBe(false);
  expect(r.historicalPrivilegedDependencies).toContain('customer_portal_guard');
  expect(r.remainingTrust.join(' ')).toContain('restore');
  await c.storage.close();
});

test('expired publication preserves own historical receipt without reopening scope', async () => {
  const f = await fixture(0, 5000),
    c = await composition(f);
  const original = await c.broker.submit(c.bearer, c.intent);
  await db.query('select pg_sleep(5.1)');
  expect(
    (await c.broker.reconcile(c.bearer, f.org, f.body.publication_id)).receipt
      ?.id,
  ).toBe(original.receipt?.id);
  await actor(f.user, f.session, 'aal1');
  await expect(
    sql(db, 'private.customer_estimate_review', [
      f.org,
      f.customer,
      f.location,
      f.version,
    ]),
  ).rejects.toThrow();
  await c.storage.close();
});
test('post-commit customer session revocation denies historical receipt', async () => {
  const f = await fixture(),
    c = await composition(f);
  await c.broker.submit(c.bearer, c.intent);
  await db.query('delete from auth.sessions where id=$1', [f.session]);
  await expect(
    c.broker.reconcile(c.bearer, f.org, f.body.publication_id),
  ).rejects.toThrow();
  await c.storage.close();
});
test('revoked staff membership during an observed row-lock wait denies the bounded queue', async () => {
  const f = await fixture(),
    c = await composition(f);
  await c.broker.submit(c.bearer, c.intent);
  const lock = await db.fork!();
  try {
    await lock.exec('begin');
    await lock.query(
      'select user_id from public.memberships where organization_id=$1 and user_id=$2 for update',
      [f.org, owners[0]],
    );
    const pending = c.broker.staffQueue(c.staff, f.org).then(
      () => false,
      () => true,
    );
    let observed = false;
    for (let i = 0; i < 60; i++) {
      if (
        (
          await db.query<{ v: boolean }>(
            "select exists(select 1 from pg_stat_activity where datname=$1 and usename='customer4b_reader' and wait_event_type='Lock') v",
            [database],
          )
        ).rows[0].v
      ) {
        observed = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(observed).toBe(true);
    await lock.query(
      'update public.memberships set active=false where organization_id=$1 and user_id=$2',
      [f.org, owners[0]],
    );
    await lock.exec('commit');
    expect(await pending).toBe(true);
  } finally {
    await lock.exec('rollback').catch(() => {});
    await lock.close();
    await db.query(
      'update public.memberships set active=true where organization_id=$1 and user_id=$2',
      [f.org, owners[0]],
    );
    await c.storage.close();
  }
});
