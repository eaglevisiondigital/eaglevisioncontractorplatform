import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { sampleCompanies } from '../src/domain/platform';
import { prepareOperatingSources } from '../src/lib/workflows/operating-center-runtime';
import {
  admitCrewAssignment,
  assertCrewAssignmentCurrentNow,
  reconcileCrewAssignment,
  openCrewAssignmentJob,
  type CrewAssignmentInput,
} from '../src/lib/workflows/crew-assignment-lab';
import {
  prepareCrewLab,
  executeCrewTransaction,
  reconcileCrewTransaction,
  type CrewLabCommand,
  type CrewLabAuthority,
} from '../server/field-lab/crew-transaction';
const folders: string[] = [],
  children: ChildProcess[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  children.forEach((c) => {
    if (c.exitCode === null) c.kill('SIGKILL');
  });
  folders.splice(0).forEach((f) => rmSync(f, { recursive: true, force: true }));
});
async function fixture(brand = 0, index = 0, start = '09:00', end = '11:00') {
  const gate = { enabled: true, confirmed: true },
    sources = await prepareOperatingSources(sampleCompanies[brand], gate),
    entry = sources.entries[index];
  const input: CrewAssignmentInput = {
    week_start: entry.day,
    timezone: entry.timezone,
    proposal: {
      job_id: entry.target.job_id!,
      worker_id: entry.worker_id,
      source_visit_id: entry.scheduled_visit_id,
      day: entry.day,
      start: entry.day + 'T' + start,
      end: entry.day + 'T' + end,
      hours_start: entry.day + 'T08:00',
      hours_end: entry.day + 'T16:00',
    },
  };
  const admission = await admitCrewAssignment(sources, input, gate);
  const folder = mkdtempSync(join(tmpdir(), 'propel-crew-lab-'));
  folders.push(folder);
  const path = join(folder, 'custody.sqlite');
  const command: CrewLabCommand = {
    command_id: 'lab-first',
    expected_revision: 0,
    envelope: admission.envelope,
    sha256: admission.integrity.sha256,
  };
  const authority: CrewLabAuthority = {
    enabled: true,
    test_only: true,
    checkSource: () => {
      assertCrewAssignmentCurrentNow(admission);
      return admission.integrity.sha256;
    },
  };
  return { sources, gate, input, admission, folder, path, command, authority };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function commandFor(
  admission: Fixture['admission'],
  id = 'lab-second',
  revision = 0,
): CrewLabCommand {
  return {
    command_id: id,
    expected_revision: revision,
    envelope: admission.envelope,
    sha256: admission.integrity.sha256,
  };
}
async function second(f: Fixture, index = 2, start = '10:00', end = '12:00') {
  const e = f.sources.entries[index],
    input: CrewAssignmentInput = {
      week_start: e.day,
      timezone: e.timezone,
      proposal: {
        ...f.input.proposal,
        job_id: e.target.job_id!,
        source_visit_id: e.scheduled_visit_id,
        worker_id: e.worker_id,
        start: e.day + 'T' + start,
        end: e.day + 'T' + end,
      },
    };
  const admission = await admitCrewAssignment(f.sources, input, f.gate);
  return {
    admission,
    command: commandFor(admission),
    authority: {
      enabled: true,
      test_only: true,
      checkSource: () => {
        assertCrewAssignmentCurrentNow(admission);
        return admission.integrity.sha256;
      },
    },
  };
}
function worker(f: Fixture, command: CrewLabCommand, mode = 'normal') {
  prepareCrewLab(f.path, { enabled: true, test_only: true });
  const cmd = join(f.folder, command.command_id + '.json'),
    witness = join(f.folder, command.command_id + '-witness.json');
  writeFileSync(cmd, JSON.stringify(command));
  writeFileSync(witness, JSON.stringify({ envelope: command.envelope }));
  const child = fork(
    new URL('./helpers/cycle11-crew-worker.ts', import.meta.url),
    [f.path, cmd, witness, mode],
    {
      execArgv: ['--experimental-strip-types'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  children.push(child);
  const inbox: unknown[] = [];
  child.on('message', (m) => inbox.push(m));
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr += String(d)));
  const event = (name: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const find = () =>
        inbox.find((x) => (x as { event: string }).event === name) as
          Record<string, unknown> | undefined;
      const found = find();
      if (found) {
        resolve(found);
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Worker timeout ' + name + ' ' + stderr));
      }, 10_000);
      const listener = () => {
        const value = find();
        if (value) {
          cleanup();
          resolve(value);
        }
      };
      const exit = () => {
        if (!find()) {
          cleanup();
          reject(Error('Worker exited ' + stderr));
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        child.off('message', listener);
        child.off('exit', exit);
      };
      child.on('message', listener);
      child.on('exit', exit);
    });
  return { child, event, witness };
}
it.each([0, 1, 2])(
  'brand %s exact source admission and durable metadata never writes business objects',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
      ];
    const result = executeCrewTransaction(f.path, f.command, f.authority);
    expect(result.status).toBe('EXACT_RECEIPT');
    expect(result.receipt).toMatchObject({
      status: 'RESERVED_LAB_ONLY',
      revision: 1,
      dispatch: false,
      business_write: false,
    });
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(f.admission.browser_persistence).toBe('NONE');
    expect(f.admission.durable_writer).toBe('NOT_CONNECTED');
    expect(
      Object.values(f.admission.envelope.authority).every((v) => v === false),
    ).toBe(true);
    const target = await openCrewAssignmentJob(f.admission);
    expect(target.job_id).toBe(f.command.envelope.job_id);
    expect(target.location_id).toBe(f.command.envelope.property_id);
    expect(target.version_id).toBe(f.command.envelope.issued_version_id);
    expect(JSON.stringify(f.admission)).not.toMatch(
      /unit_cost|payroll|supplier|private_notes|@example.invalid/,
    );
    expect(Object.isFrozen(f.admission.envelope)).toBe(true);
    expect(reconcileCrewTransaction(f.path, f.command, f.authority)).toEqual(
      result,
    );
    expect(executeCrewTransaction(f.path, f.command, f.authority)).toEqual(
      result,
    );
  },
);
it('cross-job same-worker overlap uses canonical capacity and rejects exact revision1 proposal', async () => {
  const f = await fixture(),
    s = await second(f);
  expect(s.command.envelope.worker_id).toBe(f.command.envelope.worker_id);
  executeCrewTransaction(f.path, f.command, f.authority);
  s.command.expected_revision = 1;
  const result = executeCrewTransaction(f.path, s.command, s.authority);
  expect(result.receipt).toMatchObject({
    status: 'REJECTED_CONFLICT',
    revision: 1,
    canonical_conflict_count: 1,
  });
});
it('nonoverlapping source-admitted proposals increment CAS without moving visits', async () => {
  const f = await fixture(),
    s = await second(f, 2, '11:00', '13:00');
  executeCrewTransaction(f.path, f.command, f.authority);
  s.command.expected_revision = 1;
  expect(
    executeCrewTransaction(f.path, s.command, s.authority).receipt,
  ).toMatchObject({ status: 'RESERVED_LAB_ONLY', revision: 2 });
});
it('stale lane revision rejects without silent reschedule', async () => {
  const f = await fixture(),
    s = await second(f, 2, '12:00', '13:00');
  executeCrewTransaction(f.path, f.command, f.authority);
  expect(
    executeCrewTransaction(f.path, s.command, s.authority).receipt?.status,
  ).toBe('REJECTED_CAS');
});
it('real concurrent child processes admit only one expected-revision0 reservation', async () => {
  const f = await fixture(),
    s = await second(f),
    a = worker(f, f.command),
    b = worker(f, s.command);
  await Promise.all([a.event('READY'), b.event('READY')]);
  a.child.send('GO');
  b.child.send('GO');
  const values = await Promise.all([a.event('RESULT'), b.event('RESULT')]);
  const statuses = values
    .map(
      (v) =>
        (v.result as ReturnType<typeof executeCrewTransaction>).receipt?.status,
    )
    .sort();
  expect(statuses).toEqual(['REJECTED_CAS', 'RESERVED_LAB_ONLY']);
}, 20_000);
it.each(['interrupt-claim', 'interrupt-commit'])(
  'actual process interruption %s survives restart and never replays',
  async (mode) => {
    const f = await fixture(),
      w = worker(f, f.command, mode);
    await w.event('READY');
    w.child.send('GO');
    await w.event(
      mode === 'interrupt-claim' ? 'CLAIM_COMMITTED' : 'RECEIPT_COMMITTED',
    );
    w.child.kill('SIGKILL');
    await new Promise<void>((resolve) => w.child.once('exit', () => resolve()));
    const r = reconcileCrewTransaction(f.path, f.command, f.authority);
    expect(r.status).toBe(
      mode === 'interrupt-claim' ? 'UNKNOWN' : 'EXACT_RECEIPT',
    );
    expect(
      executeCrewTransaction(
        f.path,
        { ...f.command, command_id: 'lab-replacement' },
        f.authority,
      ).status,
    ).toBe('UNKNOWN');
    expect(executeCrewTransaction(f.path, f.command, f.authority)).toEqual(r);
  },
  20_000,
);
it('source revocation after actual database lock wait blocks claim', async () => {
  const f = await fixture();
  executeCrewTransaction(f.path, f.command, f.authority);
  const s = await second(f, 2, '12:00', '13:00');
  s.command.expected_revision = 1;
  const db = new DatabaseSync(f.path);
  db.exec('BEGIN IMMEDIATE');
  const w = worker(f, s.command);
  await w.event('READY');
  w.child.send('GO');
  await w.event('SOURCE_CHECKED');
  await new Promise((resolve) => setTimeout(resolve, 150));
  writeFileSync(
    w.witness,
    JSON.stringify({ envelope: s.command.envelope, revoked: true }),
  );
  db.exec('COMMIT');
  db.close();
  const result = await w.event('RESULT');
  expect(
    (result.result as ReturnType<typeof executeCrewTransaction>).status,
  ).toBe('UNKNOWN');
  expect(reconcileCrewTransaction(f.path, s.command, s.authority).status).toBe(
    'UNKNOWN',
  );
}, 20_000);
it.each(['afterClaim', 'beforeCommit', 'afterCommit'] as const)(
  'lost acknowledgment/journal boundary %s remains UNKNOWN with exact receipt only when committed',
  async (hook) => {
    const f = await fixture();
    f.authority[hook] = () => {
      throw Error('synthetic loss');
    };
    expect(executeCrewTransaction(f.path, f.command, f.authority).status).toBe(
      'UNKNOWN',
    );
    delete f.authority[hook];
    const r = reconcileCrewTransaction(f.path, f.command, f.authority);
    expect(r.status).toBe(hook === 'afterCommit' ? 'EXACT_RECEIPT' : 'UNKNOWN');
    expect(executeCrewTransaction(f.path, f.command, f.authority)).toEqual(r);
    expect(
      executeCrewTransaction(
        f.path,
        { ...f.command, command_id: 'lab-fresh' },
        f.authority,
      ).status,
    ).toBe('UNKNOWN');
  },
);
it('missing database or receipt is UNKNOWN, never failed execution', async () => {
  const f = await fixture();
  expect(reconcileCrewTransaction(f.path, f.command, f.authority)).toEqual({
    status: 'UNKNOWN',
    receipt: null,
    replay: 'FORBIDDEN',
    replacement: null,
  });
});
it('foreign command/source or copied review does not grant admission', async () => {
  const f = await fixture(),
    g = await fixture(1);
  expect(
    (await reconcileCrewAssignment(structuredClone(f.admission))).status,
  ).toBe('UNKNOWN');
  await expect(
    openCrewAssignmentJob(structuredClone(f.admission)),
  ).rejects.toThrow();
  const c = {
    ...f.command,
    envelope: g.admission.envelope,
    sha256: g.admission.integrity.sha256,
  };
  expect(reconcileCrewTransaction(f.path, c, f.authority).status).toBe(
    'UNKNOWN',
  );
  await expect(
    admitCrewAssignment(
      f.sources,
      {
        ...f.input,
        proposal: { ...f.input.proposal, job_id: g.input.proposal.job_id },
      },
      f.gate,
    ),
  ).rejects.toThrow();
});
it.each(['input', 'gate', 'source-container', 'model'] as const)(
  'final hash revalidates live %s',
  async (kind) => {
    const f = await fixture(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const r = await digest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('DISPOSABLE_CREW_RESERVATION_ADMISSION')
      ) {
        changed = true;
        if (kind === 'input')
          f.input.proposal.start = f.input.proposal.day + 'T12:00';
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'source-container')
          f.sources.entries = [...f.sources.entries];
        if (kind === 'model')
          f.sources.entries[0].customerModel =
            f.sources.entries[1].customerModel;
      }
      return r;
    });
    await expect(
      admitCrewAssignment(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
  },
);
it('revoked actual synthetic staff and source visit edits withdraw admission', async () => {
  const f = await fixture(),
    actor = f.sources.company.id + '-estimator';
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  f.sources.entries.forEach((e) => (e.target.actor_id = actor));
  const admission = await admitCrewAssignment(f.sources, f.input, f.gate);
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect((await reconcileCrewAssignment(admission)).status).toBe('UNKNOWN');
  expect(() => assertCrewAssignmentCurrentNow(admission)).toThrow();
});
it.each(['source', 'input', 'gate'] as const)(
  'post-claim %s drift becomes permanent UNKNOWN rather than retry',
  async (kind) => {
    const f = await fixture();
    f.authority.afterClaim = () => {
      if (kind === 'source') f.sources.entries = [...f.sources.entries];
      if (kind === 'input') f.command.expected_revision = 2;
      if (kind === 'gate') f.authority.enabled = false;
    };
    expect(executeCrewTransaction(f.path, f.command, f.authority).status).toBe(
      'UNKNOWN',
    );
  },
);
it('unknown working hours/date-only windows remain reviewable but cannot reserve', async () => {
  const f = await fixture();
  f.input.proposal.hours_start = null;
  f.input.proposal.hours_end = null;
  const a = await admitCrewAssignment(f.sources, f.input, f.gate);
  const authority = {
    enabled: true,
    test_only: true,
    checkSource: () => {
      assertCrewAssignmentCurrentNow(a);
      return a.integrity.sha256;
    },
  };
  expect(a.envelope.canonical_capacity_state).toBe('UNKNOWN');
  expect(
    executeCrewTransaction(f.path, commandFor(a), authority).receipt?.status,
  ).toBe('REJECTED_REQUIREMENTS');
});
it('strict input getters and serializers reject without invocation', async () => {
  const f = await fixture(),
    hook = vi.fn();
  Object.defineProperty(f.input.proposal, 'start', { get: hook });
  await expect(
    admitCrewAssignment(f.sources, f.input, f.gate),
  ).rejects.toThrow();
  expect(hook).not.toHaveBeenCalled();
  const c = { ...f.command };
  Object.assign(c, { toJSON: hook });
  expect(() => executeCrewTransaction(f.path, c, f.authority)).toThrow();
  expect(hook).not.toHaveBeenCalled();
});
it('OFF lab rejects before command getters or source checks', async () => {
  const f = await fixture(),
    hook = vi.fn(),
    command = Object.create(null);
  Object.defineProperty(command, 'envelope', { get: hook });
  expect(() =>
    executeCrewTransaction(f.path, command, { checkSource: hook }),
  ).toThrow('OFF');
  expect(hook).not.toHaveBeenCalled();
});
it('integrity alterations and foreign revisions fail closed', async () => {
  const f = await fixture();
  expect(() =>
    executeCrewTransaction(
      f.path,
      { ...f.command, sha256: 'a'.repeat(64) },
      f.authority,
    ),
  ).toThrow('integrity');
  expect(() =>
    executeCrewTransaction(
      f.path,
      { ...f.command, expected_revision: -1 },
      f.authority,
    ),
  ).toThrow();
});
it('private custody refuses arbitrary paths and symlink files', async () => {
  const f = await fixture();
  expect(() =>
    executeCrewTransaction(
      join(f.folder, 'other.sqlite'),
      f.command,
      f.authority,
    ),
  ).toThrow();
  const target = join(f.folder, 'original.txt');
  writeFileSync(target, 'preserve original');
  symlinkSync(target, f.path);
  expect(() =>
    executeCrewTransaction(f.path, f.command, f.authority),
  ).toThrow();
  expect(readFileSync(target, 'utf8')).toBe('preserve original');
});
it('receipt integrity corruption stays UNKNOWN and never replays', async () => {
  const f = await fixture();
  executeCrewTransaction(f.path, f.command, f.authority);
  const db = new DatabaseSync(f.path);
  db.prepare('UPDATE receipts SET body=?').run('{}');
  db.close();
  expect(reconcileCrewTransaction(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
  expect(executeCrewTransaction(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
});
it('application source import graph never imports the Node SQLite writer', () => {
  const source = readFileSync(
      new URL('../src/lib/workflows/crew-assignment-lab.ts', import.meta.url),
      'utf8',
    ),
    component = readFileSync(
      new URL(
        '../src/components/workflows/CrewAssignmentLab.tsx',
        import.meta.url,
      ),
      'utf8',
    );
  expect(source + component).not.toMatch(
    /node:sqlite|field-lab\/crew-transaction|fetch\(|localStorage|indexedDB/,
  );
});

it('actual SQLite receipt write failure rolls back reservation but preserves permanent claim', async () => {
  const f = await fixture();
  prepareCrewLab(f.path, { enabled: true, test_only: true });
  const db = new DatabaseSync(f.path);
  db.exec(
    "CREATE TRIGGER deny_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(FAIL,'synthetic disk receipt refusal');END;",
  );
  db.close();
  expect(executeCrewTransaction(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
  const check = new DatabaseSync(f.path);
  expect(check.prepare('SELECT COUNT(*) AS n FROM claims').get()?.n).toBe(1);
  expect(check.prepare('SELECT COUNT(*) AS n FROM reservations').get()?.n).toBe(
    0,
  );
  check.exec('DROP TRIGGER deny_receipt');
  check.close();
  expect(executeCrewTransaction(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
  expect(
    executeCrewTransaction(
      f.path,
      { ...f.command, command_id: 'lab-no-bypass' },
      f.authority,
    ).status,
  ).toBe('UNKNOWN');
});
it('existing arbitrary private file is not opened or modified as a lab', async () => {
  const f = await fixture();
  writeFileSync(f.path, 'original private file', { mode: 0o600 });
  expect(() =>
    executeCrewTransaction(f.path, f.command, f.authority),
  ).toThrow();
  expect(readFileSync(f.path, 'utf8')).toBe('original private file');
});
it('trusted callback must return the exact independently retained admission hash', async () => {
  const f = await fixture(),
    g = await fixture(1);
  expect(() =>
    executeCrewTransaction(
      f.path,
      {
        ...f.command,
        envelope: g.admission.envelope,
        sha256: g.admission.integrity.sha256,
      },
      f.authority,
    ),
  ).toThrow('witness');
});
it('new command/worker/day cannot bypass a permanent original-visit UNKNOWN hold', async () => {
  const f = await fixture();
  f.authority.afterClaim = () => {
    throw Error('lost');
  };
  executeCrewTransaction(f.path, f.command, f.authority);
  delete f.authority.afterClaim;
  const altered = {
    ...f.command.envelope,
    worker_id: 'different-worker',
    day: '2026-11-03',
  };
  const sha = createHash('sha256')
    .update(JSON.stringify(altered))
    .digest('hex');
  const authority = { enabled: true, test_only: true, checkSource: () => sha };
  const c = {
    ...f.command,
    command_id: 'lab-new-worker',
    envelope: altered,
    sha256: sha,
  };
  expect(executeCrewTransaction(f.path, c, authority).status).toBe('UNKNOWN');
});
it('matching receipt hash with wrong exact worker identity remains UNKNOWN', async () => {
  const f = await fixture();
  executeCrewTransaction(f.path, f.command, f.authority);
  const db = new DatabaseSync(f.path);
  const r = db.prepare('SELECT body FROM receipts').get()!;
  const body = JSON.stringify({
    ...JSON.parse(String(r.body)),
    worker_id: 'foreign-worker',
  });
  db.prepare('UPDATE receipts SET body=?,sha256=?').run(
    body,
    createHash('sha256').update(body).digest('hex'),
  );
  db.close();
  expect(reconcileCrewTransaction(f.path, f.command, f.authority).status).toBe(
    'UNKNOWN',
  );
});
