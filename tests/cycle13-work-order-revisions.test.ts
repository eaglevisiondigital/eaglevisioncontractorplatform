import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  admitCrewAssignment,
  assertCrewAssignmentCurrentNow,
  type CrewAssignmentInput,
} from '../src/lib/workflows/crew-assignment-lab';
import { type ScheduleProposalRevisionInput } from '../src/lib/workflows/schedule-proposal-revisions';
import {
  prepareCrewLab,
  executeCrewTransaction,
  type CrewLabCommand,
} from '../server/field-lab/crew-transaction';
import {
  prepareScheduleRevisionLab,
  type ScheduleRevisionCommand,
  type ScheduleRevisionAuthority,
} from '../server/field-lab/proposal-revisions';
import { readFieldWorkOrders } from '../src/lib/field-work-orders';
import {
  reviewWorkOrderRevision,
  assertWorkOrderRevisionCurrentNow,
  reconcileWorkOrderRevision as reconcileBrowser,
  closeWorkOrderRevision,
  openWorkOrderRevisionSource,
  type WorkOrderRevisionInput,
} from '../src/lib/workflows/work-order-revisions';
import { WorkOrderRevisions } from '../src/components/workflows/WorkOrderRevisions';
import {
  bindWorkOrderRevisionCommand,
  executeWorkOrderRevision,
  reconcileWorkOrderRevision,
  type WorkOrderRevisionCommand,
  type WorkOrderRevisionAuthority,
} from '../server/field-lab/work-order-revisions';
const folders: string[] = [],
  children: ChildProcess[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  children.splice(0).forEach((c) => {
    if (c.exitCode === null) c.kill('SIGKILL');
  });
  folders.splice(0).forEach((f) => rmSync(f, { recursive: true, force: true }));
});
function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
async function fixture(brand = 0, commitOriginal = true) {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    e = sources.entries[0];
  const original: CrewAssignmentInput = {
    week_start: e.day,
    timezone: e.timezone,
    proposal: {
      job_id: e.target.job_id!,
      source_visit_id: e.scheduled_visit_id,
      worker_id: e.worker_id,
      day: e.day,
      start: e.day + 'T09:00',
      end: e.day + 'T11:00',
      hours_start: e.day + 'T08:00',
      hours_end: e.day + 'T16:00',
    },
  };
  const proposed: CrewAssignmentInput = {
    ...original,
    proposal: {
      ...original.proposal,
      start: e.day + 'T11:00',
      end: e.day + 'T13:00',
    },
  };
  const a = await admitCrewAssignment(sources, original, gate),
    b = await admitCrewAssignment(sources, proposed, gate);
  const folder = mkdtempSync(join(tmpdir(), 'propel-crew-lab-'));
  folders.push(folder);
  const crewPath = join(folder, 'custody.sqlite'),
    path = join(folder, 'proposal-revisions.sqlite'),
    clock = { now: Date.now() };
  const base: CrewLabCommand = {
    command_id: 'lab-original',
    expected_revision: 0,
    envelope: a.envelope,
    sha256: a.integrity.sha256,
  };
  const authority: ScheduleRevisionAuthority = {
    enabled: true,
    test_only: true,
    clock: () => clock.now,
    checkSource(envelope) {
      const match = [a, b].find(
        (x) => JSON.stringify(x.envelope) === JSON.stringify(envelope),
      );
      if (!match) throw Error('No independent exact witness');
      assertCrewAssignmentCurrentNow(match);
      return match.integrity.sha256;
    },
  };
  prepareCrewLab(crewPath, authority);
  if (commitOriginal)
    expect(
      executeCrewTransaction(crewPath, base, authority).receipt?.status,
    ).toBe('RESERVED_LAB_ONLY');
  const command: ScheduleRevisionCommand = {
    command_id: 'lab-revision-one',
    expected_revision: 0,
    previous_receipt_id: null,
    original: base,
    proposal: b.envelope,
    proposal_sha256: b.integrity.sha256,
    action: 'REVISE',
    expires_at: clock.now + 30 * 60_000,
  };
  const input: ScheduleProposalRevisionInput = {
    original,
    proposed,
    expected_revision: 0,
    expires_at: command.expires_at,
  };
  return {
    gate,
    sources,
    original,
    proposed,
    a,
    b,
    base,
    folder,
    path,
    crewPath,
    clock,
    authority,
    command,
    input,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function counts(f: Fixture) {
  const db = new DatabaseSync(f.path, { readOnly: true });
  try {
    return {
      attempts: db.prepare('SELECT count(*) AS n FROM attempts').get()?.n,
      receipts: db.prepare('SELECT count(*) AS n FROM receipts').get()?.n,
      series: db.prepare('SELECT revision,state FROM series').get(),
    };
  } finally {
    db.close();
  }
}
async function workFixture(brand = 0, original = true) {
  const f = await fixture(brand, original);
  const model = await readFieldWorkOrders(
    f.sources.property,
    f.sources.company.id,
    f.base.envelope.actor_id,
  );
  const order = model.orders.find(
    (o) => o.source.job_id === f.base.envelope.job_id,
  )!;
  const scope = digest(order.scope);
  const command = bindWorkOrderRevisionCommand(
    f.command,
    'Protect the access path; review the revised human window with staff.',
    scope,
    f.authority,
  );
  const authority: WorkOrderRevisionAuthority = {
    ...f.authority,
    checkWorkOrder(c) {
      f.sources.estimates.readSyntheticPrototypeSources(
        f.sources.entries[0].target,
      );
      if (
        c.issued_scope_sha256 !== scope ||
        JSON.stringify(c.schedule.original) !== JSON.stringify(f.base)
      )
        throw Error('Independent exact issued work-order witness required');
      return scope;
    },
  };
  const input: WorkOrderRevisionInput = {
    schedule: f.input,
    instructions: command.instructions,
  };
  return { ...f, scope, order, wc: command, wa: authority, wi: input };
}
type WorkFixture = Awaited<ReturnType<typeof workFixture>>;
function run(f: WorkFixture, c = f.wc, a = f.wa) {
  return executeWorkOrderRevision(f.crewPath, f.path, c, a);
}
function read(f: WorkFixture, c = f.wc, a = f.wa) {
  return reconcileWorkOrderRevision(f.crewPath, f.path, c, a);
}
function next(
  f: WorkFixture,
  action: ScheduleRevisionCommand['action'] = 'REVISE',
  instructions = 'Keep the original issued scope; staff proposes revised access instructions.',
) {
  const prior = read(f).receipt!;
  return bindWorkOrderRevisionCommand(
    {
      ...f.command,
      expected_revision: prior.revision,
      previous_receipt_id: prior.receipt_id,
      action,
    },
    instructions,
    f.scope,
    f.wa,
  );
}
function worker(f: WorkFixture, command = f.wc, mode = 'normal') {
  prepareScheduleRevisionLab(f.crewPath, f.path, f.authority);
  const cmd = join(f.folder, command.schedule.command_id + '-command.json'),
    witness = join(f.folder, command.schedule.command_id + '-witness.json');
  writeFileSync(cmd, JSON.stringify(command));
  writeFileSync(
    witness,
    JSON.stringify({
      now: f.clock.now,
      scope: f.scope,
      payloads: [JSON.stringify(command)],
      envelopes: [
        command.schedule.original.envelope,
        command.schedule.proposal,
      ],
    }),
  );
  const child = fork(
    new URL('./helpers/cycle13-work-order-worker.ts', import.meta.url),
    [f.crewPath, f.path, cmd, witness, mode],
    {
      execArgv: ['--experimental-strip-types'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  children.push(child);
  const inbox: { event: string; result: ReturnType<typeof run> }[] = [];
  let stderr = '';
  child.on('message', (m) => inbox.push(m as (typeof inbox)[number]));
  child.stderr?.on('data', (d) => {
    stderr += String(d);
  });
  const event = (name: string) =>
    new Promise<(typeof inbox)[number]>((resolve, reject) => {
      const find = () => inbox.find((x) => x.event === name);
      const found = find();
      if (found) {
        resolve(found);
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Worker timeout ' + name + stderr));
      }, 10_000);
      const listener = () => {
        const result = find();
        if (result) {
          cleanup();
          resolve(result);
        }
      };
      const exited = () => {
        if (!find()) {
          cleanup();
          reject(Error('Worker exit ' + stderr));
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        child.off('message', listener);
        child.off('exit', exited);
      };
      child.on('message', listener);
      child.on('exit', exited);
    });
  return { child, witness, event };
}
it.each([0, 1, 2])(
  'brand %s composes actual issued work order, proposed instructions and original C12 receipts without business writes',
  async (brand) => {
    const f = await workFixture(brand),
      snapshot = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      originalBytes = readFileSync(f.crewPath),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
      ];
    const view = await reviewWorkOrderRevision(f.sources, f.wi, f.gate),
      result = run(f);
    expect(view.issued_scope).toEqual(f.order.scope);
    expect(view.instructions).toBe(f.wi.instructions);
    expect(view.history).toHaveLength(1);
    expect(view.durable_receipt).toBe('UNKNOWN');
    expect(view.authority).toEqual({
      dispatch: false,
      schedule: false,
      scope_change: false,
      financial: false,
      communicate: false,
    });
    expect(result.receipt).toMatchObject({
      status: 'REVISED_LAB_ONLY',
      revision: 1,
      business_write: false,
    });
    expect(result.lineage).toMatchObject({
      instructions: f.wi.instructions,
      saved_revision: 1,
      previous_receipt_id: null,
      issued_version_id: f.base.envelope.issued_version_id,
      visit_id: f.base.envelope.visit_id,
      full_content_persisted: false,
      dispatch: false,
    });
    expect(read(f)).toEqual(result);
    expect(readFileSync(f.crewPath)).toEqual(originalBytes);
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      snapshot,
    );
    expect(writers.every((w) => w.mock.calls.length === 0)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /unit_cost|supplier|payroll|PRIVATE|@example.invalid/,
    );
    expect(await openWorkOrderRevisionSource(view)).toMatchObject({
      job_id: f.base.envelope.job_id,
      version_id: f.base.envelope.issued_version_id,
    });
  },
);
it('immutable browser history retains each exact proposed instruction without rewriting issued scope', async () => {
  const f = await workFixture(),
    one = await reviewWorkOrderRevision(f.sources, f.wi, f.gate),
    bytes = JSON.stringify(one);
  const two = await reviewWorkOrderRevision(
    f.sources,
    {
      ...f.wi,
      instructions: 'Staff proposes a different access sequence.',
      schedule: { ...f.input, expected_revision: 1 },
    },
    f.gate,
  );
  expect(two.history.map((h) => h.instructions)).toEqual([
    one.instructions,
    two.instructions,
  ]);
  expect(two.issued_scope).toEqual(one.issued_scope);
  expect(Object.isFrozen(two.history[0])).toBe(true);
  expect(JSON.stringify(one)).toBe(bytes);
  expect((await reconcileBrowser(one)).status).toBe('UNKNOWN');
  expect((await reconcileBrowser(two)).status).toBe('CURRENT_REVIEW_ONLY');
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'browser %s uses original terminal C12 withdrawal and cannot reopen with a note or new view',
  async (action) => {
    const f = await workFixture(),
      view = await reviewWorkOrderRevision(f.sources, f.wi, f.gate);
    expect(closeWorkOrderRevision(view, action).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    expect((await reconcileBrowser(view)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    await expect(
      reviewWorkOrderRevision(
        f.sources,
        {
          ...f.wi,
          instructions: 'New label cannot reopen.',
          schedule: { ...f.input, expected_revision: 1 },
        },
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it('browser default OFF rejects before source and instruction getters', async () => {
  const getter = vi.fn(() => {
    throw Error('must not read');
  });
  const sources = Object.defineProperty({}, 'entries', {
    get: getter,
  }) as WorkFixture['sources'];
  const input = Object.defineProperty({}, 'instructions', {
    get: getter,
  }) as WorkOrderRevisionInput;
  await expect(reviewWorkOrderRevision(sources, input)).rejects.toThrow(
    'Explicit',
  );
  expect(
    renderToStaticMarkup(createElement(WorkOrderRevisions, { sources })),
  ).toContain('revisions are off');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['https:', 'file:'])(
  'protocol %s withholds all sources before getters',
  (protocol) => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    const getter = vi.fn();
    const sources = Object.defineProperty({}, 'entries', {
      get: getter,
    }) as WorkFixture['sources'];
    expect(
      renderToStaticMarkup(
        createElement(WorkOrderRevisions, { sources, enabled: true }),
      ),
    ).toContain('revisions are off');
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s markup has visible action names, explicit note proposal and no server writer',
  async (brand) => {
    const f = await workFixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', protocol: 'http:' },
    });
    const html = renderToStaticMarkup(
      createElement(WorkOrderRevisions, { sources: f.sources, enabled: true }),
    );
    expect(html).toContain('Review work-order revision');
    expect(html).toContain('Proposed operational instructions');
    expect(html).toContain('human proposals');
    expect(html).toContain('durable receipt UNKNOWN');
    expect(html).not.toMatch(/PRIVATE|unit_cost|supplier/);
  },
);
it.each(['instructions', 'gate', 'root', 'staff'] as const)(
  'late %s drift after hashing is terminal and cannot be bypassed by a fresh note',
  async (kind) => {
    const f = await workFixture(),
      originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await originalDigest(...args);
      if (!changed) {
        changed = true;
        if (kind === 'instructions')
          f.wi.instructions = 'Mutated during review';
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
        if (kind === 'staff')
          vi.spyOn(
            f.sources.operations,
            'syntheticMemberships',
          ).mockReturnValue([]);
      }
      return result;
    });
    await expect(
      reviewWorkOrderRevision(f.sources, f.wi, f.gate),
    ).rejects.toThrow();
  },
);
it('exact source navigation and reconciliation reject copied views and revoked current staff', async () => {
  const f = await workFixture(),
    view = await reviewWorkOrderRevision(f.sources, f.wi, f.gate);
  expect((await reconcileBrowser(structuredClone(view))).status).toBe(
    'UNKNOWN',
  );
  vi.spyOn(f.sources.operations, 'syntheticMemberships').mockReturnValue([]);
  expect(() => assertWorkOrderRevisionCurrentNow(view)).toThrow();
  await expect(openWorkOrderRevisionSource(view)).rejects.toThrow();
  expect((await reconcileBrowser(view)).status).toBe('UNKNOWN');
});
it('foreign customer/property/job selectors do not admit work-order proposals', async () => {
  const f = await workFixture();
  const input = structuredClone(f.wi);
  input.schedule.original.proposal.job_id = f.sources.entries[1].target.job_id!;
  await expect(
    reviewWorkOrderRevision(f.sources, input, f.gate),
  ).rejects.toThrow();
});
it('two concurrent instruction reviews cannot both consume the original same-tab C12 revision', async () => {
  const f = await workFixture();
  const r = await Promise.allSettled([
    reviewWorkOrderRevision(f.sources, f.wi, f.gate),
    reviewWorkOrderRevision(
      f.sources,
      { ...f.wi, instructions: 'Competing note' },
      f.gate,
    ),
  ]);
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
});
it('durable full-payload digest binds note, source, predecessor and actual saved C12 revision without persisting text', async () => {
  const f = await workFixture(),
    first = run(f),
    second = next(f),
    result = run(f, second);
  expect(result.lineage).toMatchObject({
    previous_receipt_id: first.receipt!.receipt_id,
    saved_revision: 2,
    instructions: second.instructions,
  });
  expect(read(f)).toEqual(first);
  const db = new DatabaseSync(f.path, { readOnly: true });
  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  expect(tables).toEqual(['attempts', 'receipts', 'series']);
  const rows = JSON.stringify(
    ['attempts', 'receipts', 'series'].map((t) =>
      db.prepare('SELECT * FROM ' + t).all(),
    ),
  );
  expect(rows).not.toContain(f.wc.instructions);
  expect(rows).not.toContain(second.instructions);
  expect(rows).toContain(f.wc.schedule.command_id);
  db.close();
});
it.each(['instructions', 'issued_scope_sha256', 'schedule'] as const)(
  'changed or missing caller-held %s is UNKNOWN and never writes a replacement',
  async (field) => {
    const f = await workFixture();
    run(f);
    const before = counts(f);
    const changed = structuredClone(f.wc);
    if (field === 'instructions') changed.instructions += ' changed';
    if (field === 'issued_scope_sha256')
      changed.issued_scope_sha256 = '0'.repeat(64);
    if (field === 'schedule')
      delete (changed as Partial<WorkOrderRevisionCommand>).schedule;
    expect(read(f, changed).status).toBe('UNKNOWN');
    expect(run(f, changed).status).toBe('UNKNOWN');
    expect(counts(f)).toEqual(before);
  },
);
it('server OFF precedes command getters and payload serialization', async () => {
  const getter = vi.fn();
  const c = Object.defineProperty({}, 'schedule', {
    get: getter,
  }) as WorkOrderRevisionCommand;
  expect(() =>
    executeWorkOrderRevision('unused', 'unused', c, {
      enabled: false,
    } as WorkOrderRevisionAuthority),
  ).toThrow('OFF');
  expect(
    reconcileWorkOrderRevision('unused', 'unused', c, {
      enabled: false,
    } as WorkOrderRevisionAuthority).status,
  ).toBe('UNKNOWN');
  expect(getter).not.toHaveBeenCalled();
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'durable %s goes through original C12 functions and cannot reopen with new instructions or deadline',
  async (action) => {
    const f = await workFixture();
    run(f);
    const c = next(f, action),
      r = run(f, c);
    expect(r.receipt?.status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LAB_ONLY' : 'REVOKED_LAB_ONLY',
    );
    expect(read(f, c)).toEqual(r);
    const reopen = bindWorkOrderRevisionCommand(
      {
        ...c.schedule,
        action: 'REVISE',
        expected_revision: 2,
        previous_receipt_id: r.receipt!.receipt_id,
        expires_at: c.schedule.expires_at + 60000,
      },
      'New note cannot reopen.',
      f.scope,
      f.wa,
    );
    expect(run(f, reopen).status).toBe('UNKNOWN');
    expect(counts(f).attempts).toBe(2);
  },
);
it('actual competing process payloads cannot both claim the same work-order CAS revision', async () => {
  const f = await workFixture(),
    competing = bindWorkOrderRevisionCommand(
      f.command,
      'Competing staff instruction',
      f.scope,
      f.wa,
    ),
    a = worker(f),
    b = worker(f, competing);
  await Promise.all([a.event('READY'), b.event('READY')]);
  a.child.send('GO');
  b.child.send('GO');
  const results = await Promise.all([a.event('RESULT'), b.event('RESULT')]);
  expect(results.map((r) => r.result.status).sort()).toEqual([
    'EXACT_RECEIPT',
    'UNKNOWN',
  ]);
  expect(counts(f)).toMatchObject({
    attempts: 1,
    receipts: 1,
    series: { revision: 1 },
  });
}, 20000);
it.each(['interrupt-claim', 'interrupt-commit'])(
  'actual process loss %s preserves original C12 hold or exact digest receipt after restart',
  async (mode) => {
    const f = await workFixture(),
      w = worker(f, f.wc, mode);
    await w.event('READY');
    w.child.send('GO');
    await w.event(
      mode === 'interrupt-claim' ? 'CLAIM_COMMITTED' : 'RECEIPT_COMMITTED',
    );
    w.child.kill('SIGKILL');
    await new Promise<void>((resolve) => w.child.once('exit', () => resolve()));
    const restarted = worker(f, f.wc, 'read');
    await restarted.event('READY');
    restarted.child.send('GO');
    const r = (await restarted.event('RESULT')).result;
    expect(r.status).toBe(
      mode === 'interrupt-claim' ? 'UNKNOWN' : 'EXACT_RECEIPT',
    );
    const bypass = bindWorkOrderRevisionCommand(
      {
        ...f.command,
        expected_revision: 1,
        expires_at: f.command.expires_at + 60000,
      },
      'New note after interruption',
      f.scope,
      f.wa,
    );
    expect(run(f, bypass).status).toBe('UNKNOWN');
    expect(counts(f).attempts).toBe(1);
  },
  20000,
);
it('lost ACK requires the exact full caller-held payload and predecessor receipt before another instruction revision', async () => {
  const f = await workFixture();
  f.wa.afterCommit = () => {
    throw Error('lost ACK');
  };
  expect(run(f).status).toBe('UNKNOWN');
  delete f.wa.afterCommit;
  const blind = bindWorkOrderRevisionCommand(
    { ...f.command, expected_revision: 1 },
    'Blind next revision',
    f.scope,
    f.wa,
  );
  expect(run(f, blind).status).toBe('UNKNOWN');
  expect(read(f).lineage?.instructions).toBe(f.wc.instructions);
  expect(run(f, next(f)).lineage?.saved_revision).toBe(2);
});
it.each(['scope', 'staff', 'payload'] as const)(
  'actual lock wait rechecks work-order %s witness before original C12 claim',
  async (kind) => {
    const f = await workFixture(),
      w = worker(f),
      lock = new DatabaseSync(f.path);
    lock.exec('BEGIN IMMEDIATE');
    await w.event('READY');
    w.child.send('GO');
    await w.event('SOURCE_CHECKED');
    const witness = JSON.parse(readFileSync(w.witness, 'utf8'));
    if (kind === 'scope') witness.scope = '0'.repeat(64);
    if (kind === 'staff') witness.revoked = true;
    if (kind === 'payload') witness.payloads = [];
    writeFileSync(w.witness, JSON.stringify(witness));
    lock.exec('COMMIT');
    lock.close();
    expect((await w.event('RESULT')).result.status).toBe('UNKNOWN');
    expect(counts(f).attempts).toBe(0);
  },
  20000,
);
it('original C11 UNKNOWN stays held through C13 instruction/digest commands and a fresh C12 metadata path', async () => {
  const f = await workFixture(0, false);
  executeCrewTransaction(f.crewPath, f.base, {
    ...f.authority,
    afterClaim: () => {
      throw Error('original UNKNOWN');
    },
  });
  expect(run(f).status).toBe('UNKNOWN');
  const bypass = bindWorkOrderRevisionCommand(
    f.command,
    'New instruction cannot bypass original custody.',
    f.scope,
    f.wa,
  );
  expect(run(f, bypass).status).toBe('UNKNOWN');
});
it('C12 claimed UNKNOWN cannot be bypassed by C13 note/digest wrapper after restart', async () => {
  const f = await workFixture();
  f.wa.afterClaim = () => {
    throw Error('uncertain');
  };
  expect(run(f).status).toBe('UNKNOWN');
  delete f.wa.afterClaim;
  const fresh = bindWorkOrderRevisionCommand(
    { ...f.command, expected_revision: 1 },
    'New digest remains held.',
    f.scope,
    f.wa,
  );
  expect(run(f, fresh).status).toBe('UNKNOWN');
  expect(counts(f)).toMatchObject({ attempts: 1, receipts: 0 });
});
it('expiry, factual stale CAS, and read-only receipt status retain canonical C12 semantics', async () => {
  const f = await workFixture(),
    stale = bindWorkOrderRevisionCommand(
      { ...f.command, expected_revision: 8 },
      'Stale CAS proposal',
      f.scope,
      f.wa,
    );
  expect(run(f, stale).receipt?.status).toBe('REJECTED_CAS');
  const before = counts(f);
  f.clock.now = f.command.expires_at;
  expect(read(f, stale).effective_state).toBe('EXPIRED_LAB_ONLY');
  expect(counts(f)).toEqual(before);
});
it('duplicate exact payloads reconcile the same immutable receipt without another attempt', async () => {
  const f = await workFixture(),
    first = run(f),
    before = counts(f);
  expect(run(f)).toEqual(first);
  expect(counts(f)).toEqual(before);
});
it('late trusted callback replacement and source witness mutation fail before durable claim', async () => {
  const f = await workFixture();
  f.wa.checkWorkOrder = (c) => {
    f.wa.checkSource = () => c.schedule.proposal_sha256;
    return f.scope;
  };
  expect(run(f).status).toBe('UNKNOWN');
});
it('full payload getters, nested serializers and missing instructions never execute during read-only reconciliation', async () => {
  const f = await workFixture();
  run(f);
  const getter = vi.fn();
  const malformed = Object.defineProperty({ ...f.wc }, 'instructions', {
    get: getter,
  });
  expect(read(f, malformed).status).toBe('UNKNOWN');
  const serialized = {
    ...f.wc,
    schedule: { ...f.wc.schedule, toJSON: getter },
  };
  expect(read(f, serialized).status).toBe('UNKNOWN');
  expect(getter).not.toHaveBeenCalled();
  expect(
    read(f, { schedule: f.wc.schedule } as WorkOrderRevisionCommand).status,
  ).toBe('UNKNOWN');
});
it('staff proposal text renders literally and never enters canonical issued scope', async () => {
  const f = await workFixture();
  f.wi.instructions = '<script>dispatch()</script>';
  const view = await reviewWorkOrderRevision(f.sources, f.wi, f.gate);
  expect(view.instructions).toBe('<script>dispatch()</script>');
  expect(view.issued_scope).toEqual(f.order.scope);
  expect(JSON.stringify(view.issued_scope)).not.toContain('<script>');
});
