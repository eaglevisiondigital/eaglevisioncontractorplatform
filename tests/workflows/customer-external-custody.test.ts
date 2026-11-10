import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, renameSync, existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import {
  OfflineCustodyAttempt,
  ackPlan,
  custodyBinding,
  custodyKeys,
  expectedFence,
  holdPlan,
  readPlan,
  spendPlan,
  type CustodyBinding,
  type OfflineCustodyPort,
} from '../../server/customer/custody-lab/protocol';
import { createCustodyFixture } from '../fixtures/customer-custody/sqlite';
import { openCustodyFixturePort } from '../fixtures/customer-custody/sqlite';

const fixtures: ReturnType<typeof createCustodyFixture>[] = [];
const children = new Set<ChildProcess>();
afterEach(async () => {
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
    }),
  );
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
  expect(plan.TransactItems.slice(0, 3).map((v) => Object.keys(v)[0])).toEqual([
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
  expect(plan.TransactItems.slice(3).map((v) => Object.keys(v)[0])).toEqual([
    'ConditionCheck',
    'ConditionCheck',
  ]);
  expect(ackPlan(f.binding, f.status).TransactItems).toHaveLength(6);
  expect(readPlan(f.binding).TransactItems).toHaveLength(6);
});
it('same-turn duplicate invocation permanently holds both continuations, no second mutation', async () => {
  const f = setup(),
    write = vi.spyOn(f.fixture.port, 'write');
  const results = await Promise.allSettled([
    f.attempt.spend(),
    f.attempt.spend(),
  ]);
  expect(results.every((v) => v.status === 'rejected')).toBe(true);
  expect(write).not.toHaveBeenCalled();
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
  await f.fixture.port.hold(holdPlan(f.binding));
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
it('closes the original pre-dispatch UNKNOWN gap after object loss without execution authority', async () => {
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
  // The original #348 characterization permitted a fresh-instance claim here.
  // Durable source holds now deny it before the claim transport is called.
  const afterObjectLoss = new OfflineCustodyAttempt(
    f.fixture.reopen(),
    f.binding,
    f.current,
  );
  await expect(afterObjectLoss.spend()).rejects.toThrow(/UNKNOWN/);
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

type ProcessMessage = {
  phase: string;
  error?: string;
  writes?: number;
  holds?: number;
  result?: { outcome: string; writes_allowed: false };
};
function processAttempt(
  f: ReturnType<typeof setup>,
  mode: string,
  barrier = false,
) {
  const child = fork(
    new URL('../fixtures/customer-custody/process.mjs', import.meta.url),
    [],
    { env: {}, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  children.add(child);
  const seen = new Map<string, ProcessMessage>(),
    waiting = new Map<
      string,
      { resolve: (v: ProcessMessage) => void; reject: (e: Error) => void }
    >();
  let failure: Error | undefined,
    stderr = '';
  child.stderr?.on('data', (data) => {
    stderr = (stderr + String(data)).slice(-3000);
  });
  child.on('message', (message: ProcessMessage) => {
    seen.set(message.phase, message);
    waiting.get(message.phase)?.resolve(message);
    waiting.delete(message.phase);
  });
  child.on('error', (error) => {
    failure = error;
    for (const pending of waiting.values()) pending.reject(error);
  });
  child.on('exit', () => {
    children.delete(child);
    failure ??= Error(`Disposable process exited: ${stderr}`);
    for (const pending of waiting.values()) pending.reject(failure);
  });
  child.send({
    descriptor: f.fixture.descriptor,
    binding: f.binding,
    status: f.status,
    mode,
    barrier,
  });
  return {
    child,
    wait(phase: string) {
      const existing = seen.get(phase);
      if (existing) return Promise.resolve(existing);
      if (failure) return Promise.reject(failure);
      return new Promise<ProcessMessage>((resolve, reject) =>
        waiting.set(phase, { resolve, reject }),
      );
    },
  };
}
it.each(['after-hold', 'before-claim', 'after-claim', 'after-ack'] as const)(
  'SIGKILL at %s retains original quarantine across a genuine process restart',
  async (mode) => {
    const f = setup(),
      original = processAttempt(f, mode);
    await original.wait(mode);
    expect(f.fixture.db.prepare('select count(*) n from holds').get()?.n).toBe(
      2,
    );
    // A live competitor is denied even before the original process is killed.
    const competitor = processAttempt(f, 'spend');
    const denied = await competitor.wait('result');
    expect(denied.error).toMatch(/UNKNOWN/);
    expect(denied.writes).toBe(0);
    expect(original.child.exitCode).toBeNull();
    expect(original.child.signalCode).toBeNull();
    const exited = once(original.child, 'exit');
    expect(original.child.kill('SIGKILL')).toBe(true);
    expect((await exited)[1]).toBe('SIGKILL');
    const restarted = processAttempt(f, 'spend'),
      result = await restarted.wait('result');
    expect(result.error).toMatch(/UNKNOWN/);
    expect(result.writes).toBe(0);
    const read = processAttempt(f, 'reconcile'),
      observed = await read.wait('result');
    expect(observed.writes).toBe(0);
    expect(observed.holds).toBe(0);
    if (mode === 'after-ack')
      expect(observed.result).toEqual({
        outcome: 'RECEIPT_MATCHED',
        writes_allowed: false,
      });
    else expect(observed.error).toMatch(/UNKNOWN/);
  },
);
it('two genuine worker processes compete for one durable pre-dispatch hold', async () => {
  const f = setup(),
    a = processAttempt(f, 'spend', true),
    b = processAttempt(f, 'spend', true);
  await Promise.all([a.wait('ready'), b.wait('ready')]);
  a.child.send('go');
  b.child.send('go');
  const results = await Promise.all([a.wait('result'), b.wait('result')]);
  expect(
    results.filter((r) => r.result?.outcome === 'CLAIM_RECORDED'),
  ).toHaveLength(1);
  expect(results.filter((r) => /UNKNOWN/.test(r.error ?? ''))).toHaveLength(1);
  expect(results.reduce((n, r) => n + (r.writes ?? 0), 0)).toBe(1);
  expect(f.fixture.db.prepare('select count(*) n from holds').get()?.n).toBe(2);
});
it.each(['before', 'after'] as const)(
  'uncertain hold acknowledgment %s commit never calls the claim transport',
  async (when) => {
    const f = setup(),
      write = vi.spyOn(f.fixture.port, 'write');
    const port: OfflineCustodyPort = {
      ...f.fixture.port,
      async hold(plan) {
        if (when === 'after') await f.fixture.port.hold(plan);
        throw Error('Hold ACK lost');
      },
    };
    const original = new OfflineCustodyAttempt(port, f.binding, f.current);
    await expect(original.spend()).rejects.toThrow(/UNKNOWN/);
    expect(write).not.toHaveBeenCalled();
    if (when === 'after')
      await expect(
        new OfflineCustodyAttempt(
          f.fixture.reopen(),
          f.binding,
          f.current,
        ).spend(),
      ).rejects.toThrow(/UNKNOWN/);
    // If the hold did not commit, no claim dispatch happened at all. No external outcome exists to replay.
  },
);
it('missing durable store is denied, never silently recreated', async () => {
  const f = setup(),
    moved = f.fixture.path + '.missing';
  renameSync(f.fixture.path, moved);
  expect(() => openCustodyFixturePort(f.fixture.descriptor)).toThrow();
  await expect(f.attempt.spend()).rejects.toThrow(/UNKNOWN/);
  expect(existsSync(f.fixture.path)).toBe(false);
  renameSync(moved, f.fixture.path);
});
it('the disposable claim port denies a legacy plan missing durable hold conditions', async () => {
  const f = setup(),
    plan = spendPlan(f.binding);
  plan.TransactItems = plan.TransactItems.slice(0, 3);
  await expect(f.fixture.port.write(plan)).rejects.toThrow(/hold/);
  expect(f.fixture.db.prepare('select count(*) n from markers').get()?.n).toBe(
    0,
  );
});
it.each(['identity', 'schema'] as const)(
  'missing %s evidence denies a reopened custody handle',
  async (field) => {
    const f = setup();
    if (field === 'identity') f.fixture.db.exec('delete from fixture_identity');
    else f.fixture.db.exec('drop trigger holds_no_update');
    expect(() => openCustodyFixturePort(f.fixture.descriptor)).toThrow(
      /custody/,
    );
    await expect(f.attempt.spend()).rejects.toThrow(/UNKNOWN/);
    expect(
      f.fixture.db.prepare('select count(*) n from markers').get()?.n,
    ).toBe(0);
  },
);
it.each(['request', 'source'] as const)(
  'incomplete %s hold never permits restart or exact receipt acceptance',
  async (which) => {
    const f = setup();
    await f.attempt.spend();
    await f.attempt.acknowledge(f.status);
    const trigger = String(
      f.fixture.db
        .prepare("select sql from sqlite_schema where name='holds_no_delete'")
        .get()?.sql,
    );
    f.fixture.db.exec('drop trigger holds_no_delete');
    const key =
      which === 'request'
        ? `hold#${custodyKeys(f.binding).claim}`
        : `hold#${custodyKeys(f.binding).source}`;
    f.fixture.db.prepare('delete from holds where id=?').run(key);
    f.fixture.db.exec(trigger);
    const fresh = new OfflineCustodyAttempt(
      f.fixture.reopen(),
      f.binding,
      f.current,
    );
    await expect(fresh.spend()).rejects.toThrow(/UNKNOWN/);
    await expect(fresh.reconcile(async () => f.status)).rejects.toThrow(
      /UNKNOWN/,
    );
  },
);
it('lost claim ACK before marker commit denies replacement request/publication/epoch after restart', async () => {
  const f = setup(),
    port: OfflineCustodyPort = {
      ...f.fixture.port,
      async write() {
        throw Error('Claim not observed');
      },
    };
  await expect(
    new OfflineCustodyAttempt(port, f.binding, f.current).spend(),
  ).rejects.toThrow(/UNKNOWN/);
  const updated = { ...f.binding, epoch: 2, revision: 2 };
  f.fixture.fence(expectedFence(updated));
  for (const binding of [
    f.binding,
    updated,
    {
      ...updated,
      reference: {
        ...updated.reference,
        request_id: id(90),
        publication_id: id(91),
      },
    },
  ]) {
    const freshPort = f.fixture.reopen(),
      write = vi.spyOn(freshPort, 'write');
    await expect(
      new OfflineCustodyAttempt(freshPort, binding, f.current).spend(),
    ).rejects.toThrow(/UNKNOWN/);
    expect(write).not.toHaveBeenCalled();
  }
});
it.each(['claim', 'ack'] as const)(
  'a local stop during the final %s authority await forbids dispatch',
  async (action) => {
    const f = setup();
    let calls = 0,
      release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arm = false;
    const current = async () => {
      if (arm && ++calls === (action === 'claim' ? 2 : 1)) await blocked;
      return true;
    };
    const attempt = new OfflineCustodyAttempt(
      f.fixture.port,
      f.binding,
      current,
    );
    if (action === 'ack') await attempt.spend();
    arm = true;
    calls = 0;
    const write = vi.spyOn(f.fixture.port, 'write');
    const pending =
      action === 'claim' ? attempt.spend() : attempt.acknowledge(f.status);
    await vi.waitFor(() => expect(calls).toBe(action === 'claim' ? 2 : 1));
    await expect(
      action === 'claim' ? attempt.spend() : attempt.acknowledge(f.status),
    ).rejects.toThrow(/UNKNOWN/);
    release();
    await expect(pending).rejects.toThrow(/UNKNOWN/);
    expect(write).not.toHaveBeenCalled();
  },
);
