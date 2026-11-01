import { createTestDatabase, type TestDatabase } from './engine';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { blankEstimate } from '../../src/domain/estimating/calculation';
import type { EstimateBundle } from '../../src/domain/estimating/types';
const db = createTestDatabase();
let org: string, user: string, worker: string, customer: string;
const peers: TestDatabase[] = [];
async function caller(peer: TestDatabase) {
  await peer.exec('reset role');
  await peer.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: user, aal: 'aal2' }),
  ]);
  await peer.exec('set role authenticated');
}
async function peer() {
  const p = await db.fork!();
  peers.push(p);
  await caller(p);
  return p;
}
describe.skipIf(!db.fork)('native PostgreSQL concurrent transactions', () => {
  beforeAll(async () => {
    await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
    for (const f of readdirSync('supabase/migrations').sort())
      await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  });
  beforeEach(async () => {
    await db.exec('reset role');
    org = crypto.randomUUID();
    user = crypto.randomUUID();
    worker = crypto.randomUUID();
    customer = crypto.randomUUID();
    await db.query('insert into auth.users(id) values($1)', [user]);
    await db.query(
      "insert into organizations(id,name,slug,industry,status) values($1,'Concurrent synthetic',$2,'construction','active')",
      [org, `test-${org}`],
    );
    await db.query(
      "insert into memberships(organization_id,user_id,role) values($1,$2,'owner')",
      [org, user],
    );
    await db.query(
      "insert into customers(id,organization_id,display_name) values($1,$2,'Synthetic')",
      [customer, org],
    );
    await db.query(
      "insert into workforce_policies(organization_id,review_reference) values($1,'Synthetic reviewed policy')",
      [org],
    );
    await db.query(
      "insert into worker_profiles(id,organization_id,user_id,display_name,worker_type,cost_source) values($1,$2,$3,'Synthetic owner','owner','imputed')",
      [worker, org, user],
    );
    await caller(db);
  });
  afterAll(async () => {
    for (const p of peers) await p.close();
    await db.close();
  });
  it('allocates distinct estimate numbers under simultaneous creation', async () => {
    const a = await peer(),
      b = await peer();
    const input = blankEstimate(customer);
    const results = await Promise.all(
      [a, b].map((p) =>
        p.query<{ value: EstimateBundle }>(
          'select create_estimate($1,$2,$3) value',
          [org, input, crypto.randomUUID()],
        ),
      ),
    );
    expect(
      new Set(results.map((r) => r.rows[0].value.estimate.estimate_number))
        .size,
    ).toBe(2);
  });
  it('allows only one writer for an optimistic estimate revision', async () => {
    const input = blankEstimate(customer);
    const value = (
      await db.query<{ value: EstimateBundle }>(
        'select create_estimate($1,$2,$3) value',
        [org, input, crypto.randomUUID()],
      )
    ).rows[0].value;
    const a = await peer(),
      b = await peer();
    const results = await Promise.allSettled(
      [a, b].map((p) =>
        p.query('select save_estimate($1,$2,$3,$4,$5)', [
          org,
          value.estimate.id,
          value.version.id,
          1,
          input,
        ]),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('rejects concurrent overlapping time across projects or overhead', async () => {
    const a = await peer(),
      b = await peer();
    const input = {
      job_id: null,
      overhead_center: 'Administration',
      task: 'Synthetic concurrent time',
      kind: 'work',
      started_at: '2026-10-05T13:00:00Z',
      ended_at: '2026-10-05T15:00:00Z',
      billable: false,
      corrects_id: null,
    };
    const results = await Promise.allSettled(
      [a, b].map((p) =>
        p.query('select record_time($1,$2,$3)', [org, worker, input]),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('locks the same payroll period once under simultaneous preparation', async () => {
    const a = await peer(),
      b = await peer();
    const results = await Promise.allSettled(
      [a, b].map((p) =>
        p.query('select prepare_payroll($1,$2,$3,$4,$5)', [
          org,
          '2026-10-04T05:00:00Z',
          '2026-10-11T05:00:00Z',
          {},
          true,
        ]),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('permits one open clock under simultaneous clock-in', async () => {
    const a = await peer(),
      b = await peer();
    const target = {
      job_id: null,
      overhead_center: 'Administration',
      task: 'Synthetic concurrent clock',
      billable: false,
    };
    const results = await Promise.allSettled(
      [a, b].map((p) =>
        p.query('select time_clock($1,$2,$3,$4)', [
          org,
          worker,
          'start',
          target,
        ]),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
