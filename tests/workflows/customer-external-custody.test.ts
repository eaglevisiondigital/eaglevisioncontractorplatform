import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import {
  OfflineCustodyAttempt,
  ackPlan,
  custodyBinding,
  custodyKeys,
  expectedFence,
  readPlan,
  spendPlan,
  type CustodyBinding,
  type OfflineCustodyPort,
} from '../../server/customer/custody-lab/protocol';
import { createCustodyFixture } from '../fixtures/customer-custody/sqlite';

const fixtures: ReturnType<typeof createCustodyFixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function setup() {
  const binding: CustodyBinding = {
    reference: {
      schema: 'customer-request-v2',
      organization_id: id(1),
      customer_id: id(2),
      location_id: id(3),
      version_id: id(4),
      publication_id: id(5),
      scope_sha256: 'a'.repeat(64),
      request_id: id(6),
      choice: 'request_changes_review',
      acknowledgment: 'review-only-v2',
      user_id: id(7),
      request_sha256: 'b'.repeat(64),
    },
    principal: id(8),
    session_id: id(9),
    consumer: {
      pid: 1234,
      backend_start: '2026-11-10T00:00:00.000Z',
      transaction_id: '4294967300',
    },
    target_sha256: 'c'.repeat(64),
    epoch: 1,
    revision: 1,
  };
  const r = binding.reference;
  const fields = {
    organization_id: r.organization_id,
    customer_id: r.customer_id,
    location_id: r.location_id,
    version_id: r.version_id,
    publication_id: r.publication_id,
    scope_sha256: r.scope_sha256,
    request_id: r.request_id,
    choice: r.choice,
    request_sha256: r.request_sha256,
  };
  const status = {
    reference: binding.reference,
    outcome: 'confirmed',
    custody: 'claimed-v2',
    replay_allowed: false,
    financial_execution: false,
    receipt: {
      ...fields,
      note: 'Synthetic request only',
      id: id(10),
      estimate_id: id(11),
      version_number: 2,
      recorded_at: '2026-11-10T00:00:01Z',
    },
  };
  const fixture = createCustodyFixture();
  fixtures.push(fixture);
  fixture.fence(expectedFence(binding));
  let active = true;
  const current = async () => active;
  return {
    binding,
    status,
    fixture,
    current,
    revoke() {
      active = false;
    },
    attempt: new OfflineCustodyAttempt(fixture.port, binding, current),
  };
}
it('records one exact claim and immutable receipt fingerprint, with no execution permission', async () => {
  const f = setup();
  expect(await f.attempt.spend()).toEqual({
    outcome: 'CLAIM_RECORDED',
    writes_allowed: false,
  });
  expect(await f.attempt.acknowledge(f.status)).toEqual({
    outcome: 'ACK_RECORDED',
    writes_allowed: false,
  });
  expect(await f.attempt.reconcile(async () => f.status)).toEqual({
    outcome: 'RECEIPT_MATCHED',
    writes_allowed: false,
  });
  const rows = await f.fixture.port.read(readPlan(f.binding));
  expect(JSON.stringify(rows)).not.toContain('Synthetic request only');
  expect(JSON.stringify(spendPlan(f.binding))).not.toMatch(
    /TTL|ClientRequestToken|Delete|Update/,
  );
});
it('emits only atomic DynamoDB conditions and absent-key puts on distinct items', () => {
  const f = setup(),
    plan = spendPlan(f.binding);
  expect(plan.TransactItems.map((v) => Object.keys(v)[0])).toEqual([
    'ConditionCheck',
    'Put',
    'Put',
  ]);
  expect(plan.TransactItems[0]).toMatchObject({
    ConditionCheck: {
      TableName: 'propel_disposable_custody',
      ExpressionAttributeValues: { ':v0': { BOOL: true } },
    },
  });
  expect(ackPlan(f.binding, f.status).TransactItems).toHaveLength(4);
  expect(readPlan(f.binding).TransactItems).toHaveLength(4);
});
it('same-turn duplicate invocation permanently holds both continuations, no second mutation', async () => {
  const f = setup(),
    write = vi.spyOn(f.fixture.port, 'write');
  const results = await Promise.allSettled([
    f.attempt.spend(),
    f.attempt.spend(),
  ]);
  expect(results.every((v) => v.status === 'rejected')).toBe(true);
  expect(write).toHaveBeenCalledTimes(1);
  expect(f.attempt.quarantined).toBe(true);
  await expect(f.attempt.acknowledge(f.status)).rejects.toThrow(/UNKNOWN/);
});
it('two instances on separate connections admit at most one original claim', async () => {
  const f = setup(),
    other = new OfflineCustodyAttempt(f.fixture.reopen(), f.binding, f.current);
  const result = await Promise.allSettled([f.attempt.spend(), other.spend()]);
  expect(result.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  expect(f.fixture.db.prepare('select count(*) n from markers').get()?.n).toBe(
    2,
  );
});
it('real worker-thread contention executes the same atomic fixture transaction once', async () => {
  const f = setup(),
    source = readFileSync(
      new URL('../fixtures/customer-custody/sqlite.ts', import.meta.url),
      'utf8',
    );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const shared = new SharedArrayBuffer(4),
    barrier = new Int32Array(shared);
  const code = `const {parentPort,workerData}=require('node:worker_threads');
    const exported={};new Function('require','exports',workerData.compiled)(require,exported);
    const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.path);
    db.exec('pragma busy_timeout=5000; pragma synchronous=FULL');
    const barrier=new Int32Array(workerData.shared);parentPort.postMessage('ready');Atomics.wait(barrier,0,0);
    try {exported.runFixtureWrite(db,workerData.plan);parentPort.postMessage('spent');}
    catch {parentPort.postMessage('denied');}finally{db.close();}`;
  const workers: Worker[] = [];
  let ready = 0;
  const contenders = [0, 1].map(
    () =>
      new Promise<string>((resolve, reject) => {
        const worker = new Worker(code, {
          eval: true,
          workerData: {
            compiled,
            path: f.fixture.path,
            shared,
            plan: spendPlan(f.binding),
          },
        });
        workers.push(worker);
        worker.on('error', reject);
        worker.on('message', (value) => {
          if (value === 'ready') {
            if (++ready === 2) {
              Atomics.store(barrier, 0, 1);
              Atomics.notify(barrier, 0);
            }
          } else resolve(String(value));
        });
        worker.on('exit', (status) => {
          if (status !== 0) reject(Error('Worker failed'));
        });
      }),
  );
  try {
    expect((await Promise.all(contenders)).sort()).toEqual(['denied', 'spent']);
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
});
it.each(['request_id', 'publication_id'] as const)(
  'new %s cannot bypass the original user/version spent admission',
  async (key) => {
    const f = setup();
    await f.attempt.spend();
    const changed = structuredClone(f.binding);
    changed.reference[key] = id(15);
    const other = new OfflineCustodyAttempt(
      f.fixture.reopen(),
      changed,
      f.current,
    );
    await expect(other.spend()).rejects.toThrow(/UNKNOWN/);
    expect(
      f.fixture.db.prepare('select count(*) n from markers').get()?.n,
    ).toBe(2);
  },
);
it('consumer rollback and savepoint rollback never roll back the separate spent marker', async () => {
  const f = setup(),
    consumer = new DatabaseSync(':memory:');
  try {
    consumer.exec(
      'create table scratch(value text); begin; savepoint before_write',
    );
    await f.attempt.spend();
    consumer.exec(
      "insert into scratch values('synthetic'); rollback to before_write; rollback",
    );
    expect(consumer.prepare('select count(*) n from scratch').get()?.n).toBe(0);
    const restored = new OfflineCustodyAttempt(
      f.fixture.reopen(),
      f.binding,
      f.current,
    );
    await expect(restored.spend()).rejects.toThrow(/UNKNOWN/);
    await expect(restored.reconcile(async () => f.status)).rejects.toThrow(
      /UNKNOWN/,
    );
  } finally {
    consumer.close();
  }
});
it.each(['before', 'after'] as const)(
  'ambiguous claim ACK %s commit stays UNKNOWN and never resumes after a read',
  async (when) => {
    const f = setup();
    const port: OfflineCustodyPort = {
      ...f.fixture.port,
      async write(plan) {
        if (when === 'after') await f.fixture.port.write(plan);
        throw Error('Connection lost');
      },
    };
    const attempt = new OfflineCustodyAttempt(port, f.binding, f.current);
    await expect(attempt.spend()).rejects.toThrow(/UNKNOWN/);
    const writes = vi.spyOn(port, 'write');
    await expect(attempt.reconcile(async () => f.status)).rejects.toThrow(
      /UNKNOWN/,
    );
    await expect(attempt.spend()).rejects.toThrow(/UNKNOWN/);
    await expect(attempt.acknowledge(f.status)).rejects.toThrow(/UNKNOWN/);
    expect(writes).not.toHaveBeenCalled();
    expect(attempt.quarantined).toBe(true);
  },
);
it('lost external receipt ACK permits exact read-only reconciliation, never another append', async () => {
  const f = setup();
  let writes = 0;
  const port: OfflineCustodyPort = {
    ...f.fixture.port,
    async write(plan) {
      await f.fixture.port.write(plan);
      if (++writes === 2) throw Error('ACK lost');
    },
  };
  const attempt = new OfflineCustodyAttempt(port, f.binding, f.current);
  await attempt.spend();
  await expect(attempt.acknowledge(f.status)).rejects.toThrow(/UNKNOWN/);
  expect(await attempt.reconcile(async () => f.status)).toEqual({
    outcome: 'RECEIPT_MATCHED',
    writes_allowed: false,
  });
  await expect(attempt.acknowledge(f.status)).rejects.toThrow(/UNKNOWN/);
  expect(writes).toBe(2);
  expect(attempt.quarantined).toBe(true);
});
it('revoked current authorization denies before any external mutation', async () => {
  const f = setup();
  f.revoke();
  const write = vi.spyOn(f.fixture.port, 'write');
  await expect(f.attempt.spend()).rejects.toThrow(/UNKNOWN/);
  expect(write).not.toHaveBeenCalled();
});
it('fence revocation during a delayed result quarantines the spent attempt', async () => {
  const f = setup();
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  const port: OfflineCustodyPort = {
    ...f.fixture.port,
    async write(plan) {
      await f.fixture.port.write(plan);
      await pending;
    },
  };
  const attempt = new OfflineCustodyAttempt(port, f.binding, f.current),
    result = attempt.spend();
  await vi.waitFor(() =>
    expect(
      f.fixture.db.prepare('select count(*) n from markers').get()?.n,
    ).toBe(2),
  );
  f.fixture.fence({
    ...expectedFence(f.binding),
    active: { BOOL: false },
    revision: { N: '2' },
  });
  release();
  await expect(result).rejects.toThrow(/UNKNOWN/);
  expect(attempt.quarantined).toBe(true);
});
it.each(['epoch', 'revision', 'target', 'active'] as const)(
  'stale or revoked %s fails the atomic condition without partial markers',
  async (field) => {
    const f = setup(),
      fence = expectedFence(f.binding);
    f.fixture.fence({
      ...fence,
      revision: { N: '2' },
      [field]:
        field === 'target'
          ? { S: 'd'.repeat(64) }
          : field === 'active'
            ? { BOOL: false }
            : { N: '2' },
    });
    await expect(f.attempt.spend()).rejects.toThrow(/UNKNOWN/);
    expect(
      f.fixture.db.prepare('select count(*) n from markers').get()?.n,
    ).toBe(0);
  },
);
it('a newer epoch cannot recycle a spent original source; older fence cannot be restored', async () => {
  const f = setup();
  await f.attempt.spend();
  const newer = { ...f.binding, epoch: 2, revision: 2 };
  f.fixture.fence(expectedFence(newer));
  await expect(
    new OfflineCustodyAttempt(f.fixture.reopen(), newer, f.current).spend(),
  ).rejects.toThrow(/UNKNOWN/);
  expect(() => f.fixture.fence(expectedFence(f.binding))).toThrow(/roll back/);
});
it('unavailable custody quarantines without a canonical or external replay path', async () => {
  const f = setup();
  f.fixture.unavailable();
  await expect(f.attempt.spend()).rejects.toThrow(/UNKNOWN/);
  await expect(f.attempt.reconcile(async () => f.status)).rejects.toThrow(
    /UNKNOWN/,
  );
  expect(f.attempt.quarantined).toBe(true);
});
it.each(['tenant', 'request', 'receipt', 'legacy', 'unknown'] as const)(
  'wrong %s receipt cannot append an ACK',
  async (field) => {
    const f = setup();
    await f.attempt.spend();
    const bad = structuredClone(f.status);
    if (field === 'tenant') bad.receipt.organization_id = id(22);
    if (field === 'request') bad.receipt.request_id = id(22);
    if (field === 'receipt') bad.receipt.scope_sha256 = 'd'.repeat(64);
    if (field === 'legacy') bad.custody = 'legacy-v1';
    if (field === 'unknown') bad.outcome = 'UNKNOWN';
    const write = vi.spyOn(f.fixture.port, 'write');
    await expect(f.attempt.acknowledge(bad)).rejects.toThrow(/UNKNOWN/);
    expect(write).not.toHaveBeenCalled();
  },
);
it('source, session and full-XID substitutions cannot reconcile the retained exact receipt', async () => {
  const f = setup();
  await f.attempt.spend();
  await f.attempt.acknowledge(f.status);
  for (const change of [
    { session_id: id(31) },
    { principal: id(32) },
    { consumer: { ...f.binding.consumer, pid: 1235 } },
    {
      consumer: {
        ...f.binding.consumer,
        backend_start: '2026-11-10T00:00:02.000Z',
      },
    },
    { consumer: { ...f.binding.consumer, transaction_id: '8589934596' } },
    { target_sha256: 'e'.repeat(64) },
    { revision: 2 },
  ]) {
    const other = new OfflineCustodyAttempt(
      f.fixture.port,
      { ...f.binding, ...change },
      f.current,
    );
    await expect(other.reconcile(async () => f.status)).rejects.toThrow(
      /UNKNOWN/,
    );
  }
});
it('missing or contradictory external receipt evidence never becomes a business success', async () => {
  const f = setup();
  await f.attempt.spend();
  await f.attempt.acknowledge(f.status);
  const altered = structuredClone(f.status);
  altered.receipt.note = 'Changed note';
  await expect(f.attempt.reconcile(async () => altered)).rejects.toThrow(
    /UNKNOWN/,
  );
  await expect(f.attempt.spend()).rejects.toThrow(/UNKNOWN/);
});
it('retained binding cannot be changed across an await', async () => {
  const f = setup(),
    before = custodyKeys(f.binding);
  f.binding.reference.request_id = id(40);
  await f.attempt.spend();
  expect(
    f.fixture.db.prepare('select id from markers where id=?').get(before.claim)
      ?.id,
  ).toBe(before.claim);
});
it.each([
  { epoch: 0 },
  { revision: -1 },
  { session_id: 'not-a-session' },
  { consumer: { pid: 1, backend_start: 'invalid', transaction_id: '1' } },
  {
    consumer: {
      pid: 1,
      backend_start: '2026-11-10T00:00:00Z',
      transaction_id: '18446744073709551616',
    },
  },
])('rejects malformed binding %j before custody', (change) => {
  const f = setup();
  expect(() => custodyBinding({ ...f.binding, ...change })).toThrow();
});
it('spent records reject direct update/delete in the disposable store', async () => {
  const f = setup();
  await f.attempt.spend();
  expect(() => f.fixture.db.exec("update markers set value='{}'")).toThrow(
    /append-only/,
  );
  expect(() => f.fixture.db.exec('delete from markers')).toThrow(/append-only/);
});
it.each(['outer', 'consumer'] as const)(
  'rejects named-property %s arrays before canonical hashing or port access',
  (kind) => {
    const f = setup();
    const malformed =
      kind === 'outer'
        ? Object.assign([], f.binding)
        : { ...f.binding, consumer: Object.assign([], f.binding.consumer) };
    const write = vi.spyOn(f.fixture.port, 'write');
    expect(() =>
      custodyBinding(malformed as unknown as CustodyBinding),
    ).toThrow(/Exact custody/);
    expect(
      () =>
        new OfflineCustodyAttempt(
          f.fixture.port,
          malformed as unknown as CustodyBinding,
          f.current,
        ),
    ).toThrow(/Exact custody/);
    expect(write).not.toHaveBeenCalled();
  },
);
it.each(['backend_start', 'transaction_id', 'target_sha256'] as const)(
  'rejects non-string %s rather than regex coercion',
  (field) => {
    const f = setup(),
      malformed = structuredClone(f.binding) as unknown as Record<
        string,
        unknown
      >;
    if (field === 'target_sha256')
      malformed[field] = { toString: 'not a string' };
    else (malformed.consumer as Record<string, unknown>)[field] = 4294967300;
    expect(() =>
      custodyBinding(malformed as unknown as CustodyBinding),
    ).toThrow();
  },
);
it('contradictory preexisting ACK quarantines a newly observed claim', async () => {
  const f = setup(),
    item = {
      pk: { S: custodyKeys(f.binding).ack },
      digest: { S: 'd'.repeat(64) },
      receipt: { S: 'e'.repeat(64) },
    };
  f.fixture.db
    .prepare('insert into markers(id,value) values(?,?)')
    .run(item.pk.S, JSON.stringify(item));
  await expect(f.attempt.spend()).rejects.toThrow(/UNKNOWN/);
  await expect(f.attempt.acknowledge(f.status)).rejects.toThrow(/UNKNOWN/);
});
it('post-commit read unavailability preserves the external spend and permits no continuation', async () => {
  const f = setup();
  const port: OfflineCustodyPort = {
    ...f.fixture.port,
    async read() {
      throw Error('Read unavailable');
    },
  };
  const attempt = new OfflineCustodyAttempt(port, f.binding, f.current);
  await expect(attempt.spend()).rejects.toThrow(/UNKNOWN/);
  expect(f.fixture.db.prepare('select count(*) n from markers').get()?.n).toBe(
    2,
  );
  await expect(
    new OfflineCustodyAttempt(f.fixture.reopen(), f.binding, f.current).spend(),
  ).rejects.toThrow(/UNKNOWN/);
});
it('characterizes the OPEN pre-dispatch durability gap after object loss: no execution authority follows', async () => {
  const f = setup();
  const port: OfflineCustodyPort = {
    ...f.fixture.port,
    async write() {
      throw Error('No marker committed');
    },
  };
  const old = new OfflineCustodyAttempt(port, f.binding, f.current);
  await expect(old.spend()).rejects.toThrow(/UNKNOWN/);
  expect(old.quarantined).toBe(true);
  // The lab does NOT implement durable pre-dispatch admission/global restart quarantine.
  // This characterization is an operational blocker, never a business retry flow.
  const afterObjectLoss = new OfflineCustodyAttempt(
    f.fixture.reopen(),
    f.binding,
    f.current,
  );
  expect(await afterObjectLoss.spend()).toEqual({
    outcome: 'CLAIM_RECORDED',
    writes_allowed: false,
  });
  await expect(afterObjectLoss.reconcile(async () => f.status)).rejects.toThrow(
    /UNKNOWN/,
  );
});
it('revocation after read but before observation return denies private reconciliation', async () => {
  const f = setup();
  await f.attempt.spend();
  await f.attempt.acknowledge(f.status);
  const port: OfflineCustodyPort = {
    ...f.fixture.port,
    async read(plan) {
      const rows = await f.fixture.port.read(plan);
      f.revoke();
      return rows;
    },
  };
  await expect(
    new OfflineCustodyAttempt(port, f.binding, f.current).reconcile(
      async () => f.status,
    ),
  ).rejects.toThrow(/UNKNOWN/);
});
