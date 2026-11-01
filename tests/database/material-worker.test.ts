import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from './engine';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import { syntheticMaterials } from '../../src/domain/materials/fixtures';
const db = createTestDatabase();
const org = crypto.randomUUID(),
  other = crypto.randomUUID(),
  owner = crypto.randomUUID(),
  worker = crypto.randomUUID(),
  customer = crypto.randomUUID();
let source: string;
const bytes = Buffer.from(
  'Synthetic control-store fixture, not an actual scanner verdict.',
);
const sha256 = createHash('sha256').update(bytes).digest('hex');
async function caller(d: TestDatabase, user = worker) {
  await d.exec('reset role');
  await d.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: user, aal: 'aal2' }),
  ]);
  await d.exec('set role authenticated');
}
async function control(
  operation: string,
  lease: string | null = null,
  payload: unknown = {},
  d = db,
  tenant = org,
) {
  return (
    await d.query<{ v: unknown }>(
      'select public.material_worker_control($1,$2,$3,$4,$5) v',
      [tenant, operation, source, lease, payload],
    )
  ).rows[0].v;
}
async function denied(
  operation: string,
  lease: string | null = null,
  payload: unknown = {},
  tenant = org,
) {
  await db.exec('savepoint attack');
  try {
    await expect(
      control(operation, lease, payload, db, tenant),
    ).rejects.toThrow();
  } finally {
    await db.exec('rollback to savepoint attack;release savepoint attack');
  }
}
async function object(bucket = 'material-quarantine') {
  await db.exec('reset role');
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
    bucket,
    `${org}/${source}`,
  ]);
  await caller(db);
}
interface Lease {
  token: string;
  attempt: number;
  job: {
    organizationId: string;
    sourceId: string;
    objectKey: string;
    sha256: string;
    size: number;
  };
}
const evidence = () => ({
  scan: {
    verdict: 'clean',
    sha256,
    engine: 'synthetic-contract-engine',
    signatureVersion: 'synthetic-no-real-scan',
    scannedAt: new Date().toISOString(),
  },
  validator: { id: 'synthetic-validator', sha256 },
});
const extraction = () => ({
  extraction: syntheticMaterials().sources[0].extraction!,
  provider: {
    id: 'synthetic-contract-provider',
    model: 'synthetic-contract-model',
  },
});
async function claimed() {
  return (await control('claim')) as Lease;
}
beforeAll(async () => {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const f of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  for (const u of [owner, worker])
    await db.query(
      'insert into auth.users(id,email_confirmed_at) values($1,now())',
      [u],
    );
  for (const [o, name] of [
    [org, 'Synthetic document company'],
    [other, 'Other company'],
  ])
    await db.query(
      "insert into public.organizations(id,name,slug,industry,status) values($1,$2,$3,'construction','active')",
      [o, name, `worker-${o}`],
    );
  await db.query(
    "insert into public.memberships(organization_id,user_id,role) values($1,$2,'owner')",
    [org, owner],
  );
  await db.query(
    "insert into public.customers(id,organization_id,display_name) values($1,$2,'Synthetic Customer')",
    [customer, org],
  );
  await db.exec(
    "update private.release_environment set mode='internal-development',approval_reference='Synthetic local test approval'",
  );
  await db.query(
    "insert into private.material_worker_grants values($1,$2,true,now()+interval '1 day','Synthetic worker approval',array['synthetic-contract-engine'],array['synthetic-validator'],array['synthetic-contract-provider:synthetic-contract-model'])",
    [org, worker],
  );
});
beforeEach(async () => {
  await db.exec('begin');
  await caller(db, owner);
  const b = (
    await db.query<{ v: { estimate: { id: string } } }>(
      'select public.create_estimate($1,$2,$3) v',
      [org, blankEstimate(customer), crypto.randomUUID()],
    )
  ).rows[0].v;
  const batch = (
    await db.query<{ v: { sources: { id: string }[] } }>(
      'select public.begin_material_import($1,$2,$3) v',
      [
        org,
        b.estimate.id,
        JSON.stringify([
          {
            filename: 'synthetic.csv',
            mime: 'text/csv',
            byte_size: bytes.length,
            sha256,
          },
        ]),
      ],
    )
  ).rows[0].v;
  source = batch.sources[0].id;
  await object();
  await caller(db, owner);
  await db.query('select public.queue_material_source($1,$2)', [org, source]);
  await caller(db);
});
afterEach(() => db.exec('rollback'));
afterAll(() => db.close());
it('claims a durable scoped lease and exposes no bytes/credentials', async () => {
  const l = await claimed();
  expect(l.attempt).toBe(1);
  expect(l.job).toMatchObject({
    organizationId: org,
    sourceId: source,
    objectKey: `${org}/${source}`,
    sha256,
    size: bytes.length,
  });
  expect(await control('claim')).toBeNull();
  expect(await control('checkpoint', l.token)).toBe(true);
});
it('rejects staff impersonating a worker and cross-tenant workload use', async () => {
  await caller(db, owner);
  await denied('claim');
  await caller(db);
  await denied('claim', null, {}, other);
});
it('requires an approved development environment, not just a worker credential', async () => {
  await db.exec('reset role');
  await db.exec("update private.release_environment set mode='disabled'");
  await caller(db);
  await denied('claim');
});
it('denies stale tokens and expiry, replacing leases with a new fencing token', async () => {
  const first = await claimed();
  await denied('checkpoint', crypto.randomUUID());
  await db.exec('reset role');
  await db.query(
    "update private.material_processing_jobs set expires_at=now()-interval '1 second' where organization_id=$1 and source_id=$2",
    [org, source],
  );
  await caller(db);
  await denied('checkpoint', first.token);
  expect(await control('retry', first.token)).toBe(false);
  const second = await claimed();
  expect(second.attempt).toBe(2);
  expect(second.token).not.toBe(first.token);
  await denied('checkpoint', first.token);
});
it.each(['membership', 'module', 'worker'])(
  'revocation of %s prevents publication after claim',
  async (mode) => {
    const l = await claimed();
    await db.exec('reset role');
    if (mode === 'membership')
      await db.query(
        'update public.memberships set active=false where organization_id=$1',
        [org],
      );
    if (mode === 'module')
      await db.query(
        "update public.company_modules set enabled=false where organization_id=$1 and module='estimates'",
        [org],
      );
    if (mode === 'worker')
      await db.query(
        'update private.material_worker_grants set active=false where organization_id=$1',
        [org],
      );
    await caller(db);
    await denied('release', l.token, evidence());
  },
);
it.each(['infected', 'stale', 'engine', 'digest', 'validator'])(
  'rejects %s evidence and retains quarantine',
  async (mode) => {
    const l = await claimed(),
      e = evidence();
    if (mode === 'infected') e.scan.verdict = 'infected';
    if (mode === 'stale') e.scan.scannedAt = '2020-01-01';
    if (mode === 'engine') e.scan.engine = 'not-approved';
    if (mode === 'digest') e.scan.sha256 = '0'.repeat(64);
    if (mode === 'validator') e.validator.id = 'not-approved';
    await denied('release', l.token, e);
    await caller(db, owner);
    expect(
      (
        await db.query<{ status: string }>(
          'select status from public.material_import_sources where id=$1',
          [source],
        )
      ).rows[0].status,
    ).toBe('quarantined');
  },
);
it('does not release staff access until clean object and validated extraction commit', async () => {
  const l = await claimed();
  await control('release', l.token, evidence());
  await denied('save', l.token, extraction());
  await caller(db, owner);
  expect((await db.query('select * from storage.objects')).rows).toEqual([]);
  expect(
    (
      await db.query<{ status: string }>(
        'select status from public.material_import_sources where id=$1',
        [source],
      )
    ).rows[0].status,
  ).toBe('quarantined');
  await object('material-clean');
  await control('save', l.token, extraction());
  await control('complete', l.token);
  await caller(db, owner);
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(
    1,
  );
  expect(
    (
      await db.query<{ status: string }>(
        'select status from public.material_import_sources where id=$1',
        [source],
      )
    ).rows[0].status,
  ).toBe('clean');
  await caller(db);
  expect(await control('claim')).toBeNull();
});
it('requires schema validation and approved provider metadata before publication', async () => {
  const l = await claimed();
  await control('release', l.token, evidence());
  await object('material-clean');
  const e = extraction();
  e.provider.model = 'unapproved';
  await denied('save', l.token, e);
  const bad = extraction();
  Object.assign(bad.extraction, { secret_debug: 'unapproved' });
  await denied('save', l.token, bad);
  await denied('complete', l.token);
});
it('caps durable retries at three attempts without a clean fallback', async () => {
  for (let n = 1; n <= 3; n++) {
    const l = await claimed();
    expect(l.attempt).toBe(n);
    await control('fail', l.token);
    await control('retry', l.token);
    await db.exec('reset role');
    await db.query(
      "update private.material_processing_jobs set not_before=now()-interval '1 second' where organization_id=$1 and source_id=$2",
      [org, source],
    );
    await caller(db);
  }
  expect(await control('claim')).toBeNull();
  await caller(db, owner);
  expect(
    (
      await db.query<{ status: string }>(
        'select status from public.material_import_sources where id=$1',
        [source],
      )
    ).rows[0].status,
  ).toBe('failed');
});
it('metadata queueing is idempotent and authenticated clients cannot read private grants', async () => {
  await caller(db, owner);
  await db.query('select public.queue_material_source($1,$2)', [org, source]);
  await db.exec('savepoint attack');
  await expect(
    db.query('select * from private.material_worker_grants'),
  ).rejects.toThrow();
  await db.exec('rollback to savepoint attack');
  await db.exec('reset role');
  expect(
    (
      await db.query(
        'select * from private.material_processing_jobs where organization_id=$1 and source_id=$2',
        [org, source],
      )
    ).rows,
  ).toHaveLength(1);
});
it.skipIf(!db.fork)(
  'native concurrent claims grant only one worker lease',
  async () => {
    await db.exec('commit');
    const a = await db.fork!(),
      b = await db.fork!();
    try {
      await caller(a);
      await caller(b);
      const r = await Promise.all([
        control('claim', null, {}, a),
        control('claim', null, {}, b),
      ]);
      expect(r.filter(Boolean)).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
      await db.exec('begin');
    }
  },
);
it.skipIf(!db.fork)(
  'native duplicate publication permits exactly one compare-and-set writer',
  async () => {
    const l = await claimed();
    await control('release', l.token, evidence());
    await object('material-clean');
    await db.exec('commit');
    const a = await db.fork!(),
      b = await db.fork!();
    try {
      await caller(a);
      await caller(b);
      const results = await Promise.allSettled([
        control('save', l.token, extraction(), a),
        control('save', l.token, extraction(), b),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
      await db.exec('begin');
    }
  },
);
