import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';

const db = createTestDatabase();
const role = 'expiry_' + crypto.randomUUID().replaceAll('-', '');
let originalRole: string;
const digest = 'a'.repeat(64);
type Boundary =
  'workload' | 'authorization' | 'intent' | 'sender' | 'domain' | 'agreement';
type Service = 'payment' | 'email' | 'agreement';
const peers: TestDatabase[] = [];
beforeAll(async () => {
  originalRole = String((await db.query('select session_user u')).rows[0].u);
  expect(originalRole).toMatch(/^[a-z_]+$/);
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
  await db.exec(`create role ${role} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    grant usage on schema private to ${role};
    grant execute on function private.sandbox_gateway_control(uuid,uuid,text,jsonb),private.provider_email_control(uuid,uuid,text,jsonb),private.provider_agreement_control(uuid,uuid,text,jsonb) to ${role}`);
});
afterEach(async () => {
  await db.exec(`set session authorization ${originalRole}; reset role`);
  for (const peer of peers.splice(0)) {
    await peer.exec('rollback');
    await peer.close();
  }
  await db.exec(
    'drop trigger if exists expiry_wait on private.sandbox_gateway_attempts; drop function if exists private.expiry_wait()',
  );
});
afterAll(async () => {
  await db.exec(`drop owned by ${role}; drop role ${role}`);
  await db.close();
});
async function peer() {
  const p = await db.fork!();
  peers.push(p);
  return p;
}
async function fixture(service: Service = 'payment', boundary?: Boundary) {
  const org = crypto.randomUUID(),
    customer = crypto.randomUUID(),
    scope = crypto.randomUUID(),
    user = crypto.randomUUID(),
    version = crypto.randomUUID(),
    estimate = crypto.randomUUID();
  await db.query(
    "insert into organizations(id,name,slug,industry,status) values($1,'LOCAL SYNTHETIC',$2,'construction','active')",
    [org, 'expiry-' + org],
  );
  await db.query(
    "insert into customers(id,organization_id,display_name) values($1,$2,'LOCAL SYNTHETIC')",
    [customer, org],
  );
  // Database time is authoritative; no transaction-start timestamps or JS clock assumptions.
  const times = (
    await db.query<{ soon: Date; later: Date }>(
      "select clock_timestamp()+interval '2 seconds' soon,clock_timestamp()+interval '20 minutes' later",
    )
  ).rows[0];
  const expires = (b: Boundary) => (b === boundary ? times.soon : times.later);
  const intent = {
    provider: 'nmi',
    key: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    invoiceId: crypto.randomUUID(),
    kind: 'capture',
    amountMinor: 10000,
    digest,
    expiresAt: expires('intent'),
  };
  const domainId = crypto.randomUUID();
  if (service === 'payment') {
    await db.query(
      "insert into private.merchant_configurations(id,organization_id,provider,merchant_reference,environment,status) values($1,$2,'nmi','LOCAL SYNTHETIC','sandbox','approved')",
      [scope, org],
    );
    await db.query(
      "insert into private.sandbox_gateway_authorizations(organization_id,id,merchant_id,customer_id,invoice_id,provider,kind,amount_minor,currency,request_digest,evidence_reference,expires_at) values($1,$2,$3,$4,$5,'nmi','capture',10000,'USD',$6,'LOCAL ONLY',$7)",
      [
        org,
        intent.authorizationId,
        scope,
        customer,
        intent.invoiceId,
        digest,
        expires('authorization'),
      ],
    );
  } else if (service === 'email') {
    await db.query(
      'insert into private.provider_email_sender_bindings(organization_id,configuration_id,version,profile_digest,provider_account_id,domain_id,expires_at) values($1,$2,1,$3,$4,$5,$6)',
      [org, scope, digest, 'synthetic-account', domainId, expires('sender')],
    );
    await db.query(
      "insert into private.provider_email_domains(organization_id,id,configuration_id,version,profile_digest,provider_account_id,domain_id,checked_at,expires_at,evidence_sha256) values($1,$2,$3,1,$4,'synthetic-account',$5,clock_timestamp(),$6,$4)",
      [
        org,
        domainId,
        scope,
        digest,
        domainId,
        boundary === 'domain'
          ? times.soon
          : new Date(times.later.getTime() - 6 * 60000),
      ],
    );
  } else {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'expiry@example.test',clock_timestamp())",
      [user],
    );
    await db.query(
      "insert into estimates(id,organization_id,estimate_number,project_name,customer_id,currency,creation_key,creation_hash) values($1::uuid,$2,$1::text,'LOCAL SYNTHETIC',$3,'USD',$4,'synthetic')",
      [estimate, org, customer, crypto.randomUUID()],
    );
    await db.query(
      "insert into estimate_versions(id,organization_id,estimate_id,version_number,status,customer_id,payload,calculation,company_snapshot,customer_snapshot,created_by,issued_by,issued_at) values($1,$2,$3,1,'issued',$4,'{}','{}','{}','{}',$5,$5,clock_timestamp())",
      [version, org, estimate, customer, user],
    );
    await db.query('insert into portal_identities values($1,$2,$3,true)', [
      org,
      customer,
      user,
    ]);
    const binding = {
      mode: 'sandbox',
      organizationId: org,
      agreementId: scope,
      customerId: customer,
      estimateVersionId: version,
      signerUserId: user,
      signerEmail: 'expiry@example.test',
      expiresAt: expires('agreement'),
      originalSha256: digest,
      providerAccountId: crypto.randomUUID(),
      envelopeId: crypto.randomUUID(),
      acceptedDecisionId: crypto.randomUUID(),
    };
    await db.query(
      'insert into private.provider_agreement_bindings(organization_id,agreement_id,customer_id,estimate_version_id,signer_user_id,binding,binding_digest,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        org,
        scope,
        customer,
        version,
        user,
        JSON.stringify(binding),
        digest,
        expires('agreement'),
      ],
    );
  }
  const cap = (
    await db.query<{ id: string }>(
      'insert into private.provider_workloads(organization_id,db_role,service,scope_id,expires_at,approval_sha256) values($1,$2,$3,$4,$5,$6) returning id',
      [org, role, service, scope, expires('workload'), digest],
    )
  ).rows[0].id;
  const fn = {
    payment: 'sandbox_gateway_control',
    email: 'provider_email_control',
    agreement: 'provider_agreement_control',
  }[service];
  async function command(
    connection: TestDatabase,
    action: string,
    payload: unknown,
  ) {
    await connection.exec(`set session authorization ${role}`);
    return connection.query(`select private.${fn}($1,$2,$3,$4::jsonb) result`, [
      org,
      scope,
      action,
      JSON.stringify(payload),
    ]);
  }
  return {
    org,
    customer,
    scope,
    user,
    intent,
    domainId,
    cap,
    command,
    deadline: times.soon,
    action:
      service === 'payment'
        ? 'reserve'
        : service === 'email'
          ? 'prepare'
          : 'complete',
    payload:
      service === 'payment'
        ? intent
        : service === 'email'
          ? {
              domainId,
              customerId: customer,
              documentId: crypto.randomUUID(),
              purpose: 'estimate_ready',
              key: digest,
              digest,
            }
          : {
              bindingDigest: digest,
              signedSha256: 'b'.repeat(64),
              certificateSha256: 'c'.repeat(64),
              recordDigest: 'd'.repeat(64),
            },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function counts(f: Fixture) {
  return (
    await db.query(
      `select
    (select count(*)::int from private.sandbox_gateway_attempts where organization_id=$1) attempts,
    (select count(*)::int from private.provider_email_outbox where organization_id=$1) outbox,
    (select count(*)::int from private.provider_agreement_evidence where organization_id=$1) agreements,
    (select count(*)::int from public.activity_events where organization_id=$1) audit`,
      [f.org],
    )
  ).rows[0];
}
// Observe the real wait, then cross expiry using the database clock. No mocked time.
async function expireWhileBlocked(
  f: Fixture,
  lock: (b: TestDatabase) => Promise<unknown>,
  action = f.action,
  payload: unknown = f.payload,
) {
  const blocker = await peer(),
    worker = await peer();
  const pid = (
    await worker.query<{ pid: number }>('select pg_backend_pid() pid')
  ).rows[0].pid;
  const before = await counts(f);
  await blocker.exec('begin');
  await lock(blocker);
  // Keep transaction_timestamp() stale across the wait. Replacing the guard's
  // wall clock with now()/CURRENT_TIMESTAMP must make these tests fail.
  await worker.exec('begin');
  const pending = f.command(worker, action, payload).then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ error, value: undefined }),
  );
  try {
    let waiting = false;
    for (let n = 0; n < 500; n++) {
      if (
        (
          await db.query(
            'select wait_event_type from pg_stat_activity where pid=$1',
            [pid],
          )
        ).rows[0].wait_event_type === 'Lock'
      ) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting, 'command must really be blocked before expiry').toBe(true);
    await db.query(
      'select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.03)',
      [f.deadline],
    );
  } finally {
    await blocker.exec('commit');
  }
  const outcome = await pending;
  expect(
    outcome.error,
    'expired operation must be denied, not just duplicated',
  ).toBeDefined();
  expect(String(outcome.error)).toMatch(
    /expired|authorization required|authority required|sender binding required|domain verification required|workload denied/i,
  );
  expect(
    await counts(f),
    'all financial/provider/audit effects must roll back',
  ).toEqual(before);
}

describe.skipIf(!db.fork)(
  'native wall-clock expiration after actual lock waits',
  () => {
    it.each(['workload', 'merchant', 'authorization', 'refund'] as const)(
      'workload expiry at payment %s lock denies reservation',
      async (lock) => {
        const f = await fixture('payment', 'workload');
        if (lock === 'refund') {
          const capture = crypto.randomUUID();
          await db.query(
            "insert into private.sandbox_gateway_attempts(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,amount_minor,request_digest,status,result) values($1,$2,$3,$4,$5,'capture',10000,$6,'succeeded',$7)",
            [
              f.org,
              capture,
              f.intent.authorizationId,
              f.scope,
              f.intent.invoiceId,
              digest,
              JSON.stringify(validResult('succeeded')),
            ],
          );
          await db.query(
            'insert into private.sandbox_gateway_settlements(organization_id,capture_key,evidence_sha256) values($1,$2,$3)',
            [f.org, capture, digest],
          );
          const auth = crypto.randomUUID();
          await db.query(
            "insert into private.sandbox_gateway_authorizations select organization_id,$2,merchant_id,customer_id,invoice_id,provider,'refund',amount_minor,currency,request_digest,evidence_reference,expires_at,revoked_at from private.sandbox_gateway_authorizations where organization_id=$1",
            [f.org, auth],
          );
          await expireWhileBlocked(
            f,
            (b) =>
              b.query(
                'select * from private.sandbox_gateway_attempts where organization_id=$1 for update',
                [f.org],
              ),
            'reserve',
            {
              ...f.intent,
              authorizationId: auth,
              kind: 'refund',
              captureKey: capture,
              transactionId: 'synthetic_txn',
            },
          );
        } else {
          const table =
            lock === 'workload'
              ? 'provider_workloads'
              : lock === 'merchant'
                ? 'merchant_configurations'
                : 'sandbox_gateway_authorizations';
          await expireWhileBlocked(f, (b) =>
            b.query(
              `select * from private.${table} where organization_id=$1 for update`,
              [f.org],
            ),
          );
        }
      },
    );
    it.each(['authorization', 'intent'] as const)(
      '%s expiry while payment authority is locked denies reservation',
      async (boundary) => {
        const f = await fixture('payment', boundary);
        await expireWhileBlocked(f, (b) =>
          b.query(
            'select * from private.sandbox_gateway_authorizations where organization_id=$1 for update',
            [f.org],
          ),
        );
      },
    );
    it('post-DML checkpoint rolls back a reservation blocked inside an INSERT trigger', async () => {
      const f = await fixture('payment', 'workload');
      await db.exec(`create function private.expiry_wait() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(841958);return new;end$$;
      create trigger expiry_wait before insert on private.sandbox_gateway_attempts for each row execute function private.expiry_wait()`);
      await expireWhileBlocked(f, (b) =>
        b.query('select pg_advisory_xact_lock(841958)'),
      );
    });
    it('expired finish leaves the existing pending attempt and audit unchanged', async () => {
      const f = await fixture('payment', 'workload');
      const worker = await peer();
      await f.command(worker, 'reserve', f.intent);
      await expireWhileBlocked(
        f,
        (b) =>
          b.query(
            'select * from private.sandbox_gateway_attempts where organization_id=$1 for update',
            [f.org],
          ),
        'finish',
        {
          ...f.intent,
          amountMinor: undefined,
          digest: undefined,
          expiresAt: undefined,
          result: validResult('succeeded'),
        },
      );
      expect(
        (
          await db.query(
            'select status,result from private.sandbox_gateway_attempts where organization_id=$1',
            [f.org],
          )
        ).rows,
      ).toEqual([{ status: 'pending', result: null }]);
    });
    it.each(['workload', 'sender', 'domain'] as const)(
      '%s expiry while email sender is locked prevents outbox preparation',
      async (boundary) => {
        const f = await fixture('email', boundary);
        await expireWhileBlocked(f, (b) =>
          b.query(
            'select * from private.provider_email_sender_bindings where organization_id=$1 for update',
            [f.org],
          ),
        );
      },
    );
    it('email workload expiry during its own capability lock wait is denied', async () => {
      const f = await fixture('email', 'workload');
      await expireWhileBlocked(f, (b) =>
        b.query(
          'select * from private.provider_workloads where organization_id=$1 for update',
          [f.org],
        ),
      );
    });
    it('expired email domain after a customer FK wait rolls back outbox and audit', async () => {
      const f = await fixture('email', 'domain');
      await expireWhileBlocked(f, (b) =>
        b.query(
          'select * from public.customers where organization_id=$1 for update',
          [f.org],
        ),
      );
    });
    it.each([
      'workload',
      'binding',
      'portal',
      'signer',
      'organization',
    ] as const)(
      'workload expiry while agreement %s is locked denies evidence',
      async (lock) => {
        const f = await fixture('agreement', 'workload');
        const table = {
          workload: 'private.provider_workloads',
          binding: 'private.provider_agreement_bindings',
          portal: 'public.portal_identities',
          signer: 'auth.users',
          organization: 'public.organizations',
        }[lock];
        await expireWhileBlocked(f, (b) =>
          b.query(
            `select * from ${table} where ${lock === 'signer' || lock === 'organization' ? 'id' : 'organization_id'}=$1 for update`,
            [lock === 'signer' ? f.user : f.org],
          ),
        );
      },
    );
    it.each(['binding', 'portal', 'signer', 'organization'] as const)(
      'agreement binding expiry at %s wait denies even a read',
      async (lock) => {
        const f = await fixture('agreement', 'agreement');
        const table = {
          binding: 'private.provider_agreement_bindings',
          portal: 'public.portal_identities',
          signer: 'auth.users',
          organization: 'public.organizations',
        }[lock];
        await expireWhileBlocked(
          f,
          (b) =>
            b.query(
              `select * from ${table} where ${lock === 'signer' || lock === 'organization' ? 'id' : 'organization_id'}=$1 for update`,
              [lock === 'signer' ? f.user : f.org],
            ),
          'load',
          {},
        );
      },
    );
  },
);

const statuses = ['succeeded', 'declined', 'unknown'] as const;
function validResult(status: (typeof statuses)[number]) {
  return {
    status,
    provider: 'nmi',
    mode: 'sandbox',
    currency: 'USD',
    amountMinor: 10000,
    transactionId: status === 'succeeded' ? 'synthetic_txn' : null,
  };
}
const malformed = [
  ['SQL NULL', null],
  ['JSON null', 'null'],
  ['array', '[]'],
  ['scalar', '1'],
  ['empty object', '{}'],
  [
    'invalid projection',
    JSON.stringify({
      ...validResult('succeeded'),
      rawCard: 'REJECT THIS SYNTHETIC FIELD',
    }),
  ],
] as const;
describe.each(statuses)('terminal %s result invariant', (status) => {
  it.each(malformed)(
    'owner INSERT and UPDATE reject %s without state changes',
    async (_label, value) => {
      const f = await fixture();
      const params = [
        f.org,
        f.intent.key,
        f.intent.authorizationId,
        f.scope,
        f.intent.invoiceId,
        digest,
      ];
      const insert =
        "insert into private.sandbox_gateway_attempts(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,amount_minor,request_digest,status,result) values($1,$2,$3,$4,$5,'capture',10000,$6,$7,$8::jsonb)";
      const before = await counts(f);
      await expect(
        db.query(insert, [...params, status, value]),
      ).rejects.toThrow(/check constraint/);
      expect(await counts(f)).toEqual(before);
      await db.query(insert, [...params, 'pending', null]);
      const pending = await counts(f);
      await expect(
        db.query(
          'update private.sandbox_gateway_attempts set status=$3,result=$4::jsonb where organization_id=$1 and idempotency_key=$2',
          [f.org, f.intent.key, status, value],
        ),
      ).rejects.toThrow(/check constraint/);
      expect(
        (
          await db.query(
            'select status,result from private.sandbox_gateway_attempts where organization_id=$1',
            [f.org],
          )
        ).rows,
      ).toEqual([{ status: 'pending', result: null }]);
      expect(await counts(f)).toEqual(pending);
    },
  );
  it('valid owner transition is preserved and terminal outcome cannot be rewritten', async () => {
    const f = await fixture();
    await db.query(
      "insert into private.sandbox_gateway_attempts(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,amount_minor,request_digest) values($1,$2,$3,$4,$5,'capture',10000,$6)",
      [
        f.org,
        f.intent.key,
        f.intent.authorizationId,
        f.scope,
        f.intent.invoiceId,
        digest,
      ],
    );
    await db.query(
      'update private.sandbox_gateway_attempts set status=$2,result=$3 where organization_id=$1',
      [f.org, status, JSON.stringify(validResult(status))],
    );
    await expect(
      db.query(
        'update private.sandbox_gateway_attempts set result=null where organization_id=$1',
        [f.org],
      ),
    ).rejects.toThrow(/Immutable/);
    await expect(
      db.query(
        'delete from private.sandbox_gateway_attempts where organization_id=$1',
        [f.org],
      ),
    ).rejects.toThrow(/Immutable/);
  });
});

it.each(malformed)(
  'restricted finish rejects %s; no direct INSERT/UPDATE capability',
  async (_label, value) => {
    const f = await fixture(),
      worker = db.fork ? await peer() : db;
    await f.command(worker, 'reserve', f.intent);
    await worker.exec(`set session authorization ${originalRole}`);
    const before = await counts(f);
    await expect(
      f.command(worker, 'finish', {
        provider: 'nmi',
        key: f.intent.key,
        authorizationId: f.intent.authorizationId,
        invoiceId: f.intent.invoiceId,
        kind: 'capture',
        result: value === null ? null : JSON.parse(value),
      }),
    ).rejects.toThrow();
    await expect(
      worker.exec(
        'insert into private.sandbox_gateway_attempts default values',
      ),
    ).rejects.toThrow(/permission/);
    await expect(
      worker.exec('update private.sandbox_gateway_attempts set result=null'),
    ).rejects.toThrow(/permission/);
    await worker.exec(`set session authorization ${originalRole}`);
    expect(await counts(f)).toEqual(before);
    expect(
      (
        await db.query(
          'select status,result from private.sandbox_gateway_attempts where organization_id=$1',
          [f.org],
        )
      ).rows,
    ).toEqual([{ status: 'pending', result: null }]);
  },
);
