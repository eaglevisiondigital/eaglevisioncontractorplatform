import { beforeAll, afterAll, afterEach, expect, it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDatabase, type TestDatabase } from './engine';
import { sampleCompanies } from '../../src/domain/platform';

// Original SQL and explicitly synthetic JWT fixtures only; no genuine Auth,
// hosted target, alternate authorization function or production adapter.
let db: TestDatabase;
const peers: TestDatabase[] = [];
const platform = crypto.randomUUID();
const gateway = 'synthetic-intake-current-authority-fixture-only-0000';
const diagnostics = 'test-results/v1-intake-current-authority/native';
type Rpc =
  | 'provision_company'
  | 'configure_company'
  | 'manage_member'
  | 'assign_intake'
  | 'submit_intake_gateway';
type Inquiry = Record<string, unknown> & {
  id: string;
  organization_id: string;
  customer_id: string;
  service_location_id: string;
  assigned_to: string | null;
  status: string;
};
interface Fixture {
  org: string;
  owner: string;
  actor: string;
  assignee: string;
  inquiry: Inquiry;
}
async function identity(peer: TestDatabase, user: string | null, aal = 'aal2') {
  await peer.exec('reset role');
  await peer.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(user ? { sub: user, aal } : {}),
  ]);
  await peer.exec(`set role ${user ? 'authenticated' : 'anon'}`);
}
async function call<T = unknown>(
  peer: TestDatabase,
  name: Rpc,
  values: unknown[],
) {
  const result = await peer.query<{ value: T }>(
    `select public.${name}(${values.map((_, index) => '$' + (index + 1)).join(',')}) as value`,
    values,
  );
  return result.rows[0].value;
}
async function peer(user: string, aal = 'aal2') {
  if (!db.fork)
    throw Error(
      'Disposable native PostgreSQL17 with independent sessions is required; no skip or PGlite concurrency claim',
    );
  const value = await db.fork();
  peers.push(value);
  await identity(value, user, aal);
  return value;
}
async function canonical(f: Fixture) {
  const result = await db.query<Inquiry>(
    'select * from public.intake_requests where organization_id=$1 and id=$2',
    [f.org, f.inquiry.id],
  );
  expect(result.rows).toHaveLength(1);
  return result.rows[0];
}
async function state(f: Fixture) {
  return {
    request: await canonical(f),
    caller: (
      await db.query(
        'select user_id,role,staff_type,active from public.memberships where organization_id=$1 and user_id=$2',
        [f.org, f.actor],
      )
    ).rows[0],
    assignee: (
      await db.query(
        'select user_id,role,staff_type,active from public.memberships where organization_id=$1 and user_id=$2',
        [f.org, f.assignee],
      )
    ).rows[0],
    module: (
      await db.query(
        'select enabled from public.company_modules where organization_id=$1 and module=$2',
        [f.org, 'intake'],
      )
    ).rows[0],
  };
}
function witness(brand: number, kind: string, value: unknown) {
  mkdirSync(diagnostics, { recursive: true });
  writeFileSync(
    join(diagnostics, `${brand}-${kind}.json`),
    JSON.stringify(
      {
        brand,
        kind,
        identity: 'SYNTHETIC_SQL_FIXTURE_NOT_GENUINE_AUTH',
        receipt: 'VOID_RPC_ACK_NOT_CAS_OR_DURABLE_CUSTODY',
        value,
      },
      null,
      2,
    ) + '\n',
  );
}
async function fixture(brand: number): Promise<Fixture> {
  const company = sampleCompanies[brand];
  const owner = crypto.randomUUID(),
    actor = crypto.randomUUID(),
    assignee = crypto.randomUUID();
  const slug = company.slug + '-' + crypto.randomUUID().slice(0, 8);
  await db.exec('reset role');
  for (const user of [owner, actor, assignee])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
      [user, `${user}@example.test`],
    );
  await identity(db, platform);
  const org = await call<string>(db, 'provision_company', [
    company.name,
    slug,
    company.industry,
    owner,
  ]);
  await call(db, 'configure_company', [org, 'active', 'synthetic', {}, null]);
  await db.exec('reset role');
  await db.query(
    "insert into public.memberships(organization_id,user_id,role,staff_type) values($1,$2,'staff','estimator'),($1,$3,'staff','field_staff')",
    [org, actor, assignee],
  );
  await db.query(
    'update public.company_settings set intake_enabled=true where organization_id=$1',
    [org],
  );
  await identity(db, null);
  const submitted = await call<{ status: string }>(
    db,
    'submit_intake_gateway',
    [
      gateway,
      slug,
      {
        name: 'Synthetic current-source inquiry',
        email: `${actor}@example.test`,
        phone: '555-0100',
        address: '10 Example Street',
        city: 'Example',
        region: 'IL',
        postal_code: '00000',
        country_code: 'US',
        property_type: 'residential',
        service_category: 'General inquiry',
        description: 'Synthetic original intake authority regression.',
        preferred_appointment: '',
        contact_preference: 'email',
        email_consent: true,
        sms_consent: false,
        consent_version: 'contact-v1',
      },
      'a'.repeat(64),
      crypto.randomUUID(),
    ],
  );
  expect(submitted.status).toBe('accepted');
  await db.exec('reset role');
  const rows = (
    await db.query<Inquiry>(
      'select * from public.intake_requests where organization_id=$1',
      [org],
    )
  ).rows;
  expect(rows).toHaveLength(1);
  return { org, owner, actor, assignee, inquiry: rows[0] };
}
async function revoked(peer: TestDatabase, f: Fixture, user: string) {
  await call(peer, 'manage_member', [
    f.org,
    user,
    false,
    'staff',
    user === f.actor ? 'estimator' : 'field_staff',
  ]);
}
async function denied(work: Promise<unknown>) {
  await expect(work).rejects.toMatchObject({ code: '42501' });
}
async function waitForLock(pid: number, blocker: number) {
  const deadline = Date.now() + 5000;
  let observed: Record<string, unknown> | undefined;
  while (Date.now() < deadline) {
    observed = (
      await db.query(
        'select pid,wait_event_type,wait_event,state,query,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',
        [pid],
      )
    ).rows[0];
    if (
      observed?.wait_event_type === 'Lock' &&
      Array.isArray(observed.blockers) &&
      observed.blockers.includes(blocker)
    )
      return observed;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error(
    'Exact assignment RPC backend was not observed blocked by the original intake row: ' +
      JSON.stringify(observed),
  );
}
beforeAll(async () => {
  db = createTestDatabase();
  if (!db.fork)
    throw Error(
      'Native PostgreSQL17/fork is required for this file; no skipped required-denial cases',
    );
  const version = Number(
    (await db.query('show server_version_num')).rows[0].server_version_num,
  );
  expect(version).toBeGreaterThanOrEqual(170000);
  expect(version).toBeLessThan(180000);
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(join('supabase/migrations', file), 'utf8'));
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
    [platform, 'synthetic-platform@example.test'],
  );
  await db.query('insert into private.platform_admins(user_id) values($1)', [
    platform,
  ]);
  await db.query(
    "insert into private.intake_gateway_keys(key_hash) values(sha256(convert_to($1,'UTF8')))",
    [gateway],
  );
});
afterEach(async () => {
  for (const value of peers.splice(0)) await value.close();
});
afterAll(async () => {
  if (db) await db.close();
});

for (const brand of [0, 1, 2]) {
  it(`brand ${brand}: active original caller reads exact inquiry/customer/property and assigns through original RPC`, async () => {
    const f = await fixture(brand),
      actor = await peer(f.actor, 'aal1');
    const before = await state(f);
    expect(
      (
        await actor.query(
          'select * from public.intake_requests where organization_id=$1 and id=$2',
          [f.org, f.inquiry.id],
        )
      ).rows,
    ).toEqual([f.inquiry]);
    expect(
      (
        await actor.query(
          'select id from public.customers where organization_id=$1 and id=$2',
          [f.org, f.inquiry.customer_id],
        )
      ).rows,
    ).toEqual([{ id: f.inquiry.customer_id }]);
    expect(
      (
        await actor.query(
          'select id,customer_id from public.service_locations where organization_id=$1 and id=$2',
          [f.org, f.inquiry.service_location_id],
        )
      ).rows,
    ).toEqual([
      { id: f.inquiry.service_location_id, customer_id: f.inquiry.customer_id },
    ]);
    await call(actor, 'assign_intake', [
      f.org,
      f.inquiry.id,
      f.assignee,
      'reviewing',
    ]);
    const after = await state(f);
    expect(after.request).toEqual({
      ...f.inquiry,
      assigned_to: f.assignee,
      status: 'reviewing',
      updated_at: after.request.updated_at,
    });
    witness(brand, 'ordinary', { before, after });
  });
  it(`brand ${brand}: actual caller revocation before table reads and assignment denies original access without mutation`, async () => {
    const f = await fixture(brand),
      actor = await peer(f.actor, 'aal1'),
      owner = await peer(f.owner);
    const before = await state(f);
    await revoked(owner, f, f.actor);
    expect(
      (
        await actor.query(
          'select id from public.intake_requests where organization_id=$1',
          [f.org],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await actor.query(
          'select id from public.customers where organization_id=$1',
          [f.org],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await actor.query(
          'select id from public.service_locations where organization_id=$1',
          [f.org],
        )
      ).rows,
    ).toEqual([]);
    await denied(
      call(actor, 'assign_intake', [
        f.org,
        f.inquiry.id,
        f.assignee,
        'reviewing',
      ]),
    );
    const after = await state(f);
    expect(after.request).toEqual(before.request);
    expect(after.caller.active).toBe(false);
    witness(brand, 'revoked-before-read', { before, after });
  });
  it(`brand ${brand}: an actual prior read cannot renew caller authority revoked before assignment`, async () => {
    const f = await fixture(brand),
      actor = await peer(f.actor, 'aal1'),
      owner = await peer(f.owner);
    const captured = (
      await actor.query(
        'select * from public.intake_requests where organization_id=$1 and id=$2',
        [f.org, f.inquiry.id],
      )
    ).rows;
    expect(captured).toEqual([f.inquiry]);
    await revoked(owner, f, f.actor);
    expect(
      (
        await actor.query(
          'select id from public.intake_requests where organization_id=$1',
          [f.org],
        )
      ).rows,
    ).toEqual([]);
    await denied(
      call(actor, 'assign_intake', [
        f.org,
        f.inquiry.id,
        f.assignee,
        'reviewing',
      ]),
    );
    const after = await state(f);
    expect(after.request).toEqual(f.inquiry);
    expect(after.caller.active).toBe(false);
    witness(brand, 'revoked-after-read', {
      captured_point_in_time_only: captured,
      after,
    });
  });
  it(`brand ${brand}: real assignee revocation after selection is rejected by the original writer without mutation`, async () => {
    const f = await fixture(brand),
      actor = await peer(f.actor, 'aal1'),
      owner = await peer(f.owner);
    const before = await state(f);
    expect(before.assignee.active).toBe(true);
    await revoked(owner, f, f.assignee);
    await expect(
      call(actor, 'assign_intake', [
        f.org,
        f.inquiry.id,
        f.assignee,
        'reviewing',
      ]),
    ).rejects.toThrow('Assignee unavailable');
    const after = await state(f);
    expect(after.request).toEqual(before.request);
    expect(after.assignee.active).toBe(false);
    witness(brand, 'revoked-assignee', { before, after });
  });
  it(`brand ${brand}: original assigned field read and foreign tenant remain separate from assignment authority`, async () => {
    const f = await fixture(brand),
      owner = await peer(f.owner),
      field = await peer(f.assignee, 'aal1');
    const foreign = await fixture((brand + 1) % 3);
    await call(owner, 'assign_intake', [
      f.org,
      f.inquiry.id,
      f.assignee,
      'reviewing',
    ]);
    const before = await state(f);
    expect(
      (
        await field.query(
          'select id,customer_id,service_location_id from public.intake_requests where organization_id=$1',
          [f.org],
        )
      ).rows,
    ).toEqual([
      {
        id: f.inquiry.id,
        customer_id: f.inquiry.customer_id,
        service_location_id: f.inquiry.service_location_id,
      },
    ]);
    expect(
      (
        await field.query(
          'select id from public.customers where organization_id=$1',
          [f.org],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await field.query(
          'select id from public.intake_requests where organization_id=$1',
          [foreign.org],
        )
      ).rows,
    ).toEqual([]);
    await denied(
      call(field, 'assign_intake', [f.org, f.inquiry.id, null, 'closed']),
    );
    await denied(
      call(field, 'assign_intake', [
        foreign.org,
        foreign.inquiry.id,
        null,
        'closed',
      ]),
    );
    const after = await state(f);
    expect(after.request).toEqual(before.request);
    expect(await canonical(foreign)).toEqual(foreign.inquiry);
    witness(brand, 'field-foreign', {
      before,
      after,
      foreign_request_unchanged: await canonical(foreign),
    });
  });
  for (const withdrawal of ['caller', 'module'] as const) {
    it(`brand ${brand}: original assignment denied after ${withdrawal} withdrawal commits during its exact row-lock wait`, async () => {
      const f = await fixture(brand),
        blocker = await peer(f.owner),
        actor = await peer(f.actor, 'aal1'),
        owner = await peer(f.owner);
      const before = await state(f);
      const actorPid = Number(
        (await actor.query('select pg_backend_pid() as pid')).rows[0].pid,
      );
      const blockerPid = Number(
        (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid,
      );
      expect(actorPid).not.toBe(blockerPid);
      await blocker.exec('begin');
      await blocker.query(
        'select id from public.intake_requests where organization_id=$1 and id=$2 for update',
        [f.org, f.inquiry.id],
      );
      let released = false;
      const pending = call(actor, 'assign_intake', [
        f.org,
        f.inquiry.id,
        f.assignee,
        'reviewing',
      ]).then(
        () => ({ status: 'fulfilled' as const }),
        (error: Error & { code?: string }) => ({
          status: 'rejected' as const,
          code: error.code,
          message: error.message,
        }),
      );
      try {
        const wait = await waitForLock(actorPid, blockerPid);
        expect(String(wait.query)).toContain('public.assign_intake');
        if (withdrawal === 'caller') await revoked(owner, f, f.actor);
        else {
          await identity(owner, platform);
          await call(owner, 'configure_company', [
            f.org,
            'active',
            'synthetic',
            { intake: false },
            null,
          ]);
        }
        const withdrawn = await state(f);
        expect(
          withdrawal === 'caller'
            ? withdrawn.caller.active
            : withdrawn.module.enabled,
        ).toBe(false);
        expect(withdrawn.request).toEqual(before.request);
        await blocker.exec('commit');
        released = true;
        const outcome = await pending;
        const after = await state(f);
        witness(brand, `row-wait-${withdrawal}`, {
          actor_backend: actorPid,
          blocker_backend: blockerPid,
          wait,
          before,
          withdrawn,
          outcome,
          after,
        });
        // Required denial remains an ordinary assertion. A failure is a security
        // blocker, never an expected-permissive characterization or test.fails.
        expect(outcome).toMatchObject({ status: 'rejected', code: '42501' });
        expect(after.request).toEqual(before.request);
      } finally {
        if (!released) await blocker.exec('rollback');
        await pending;
      }
    });
  }
}
