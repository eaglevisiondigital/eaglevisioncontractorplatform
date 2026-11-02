import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
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
import {
  reviewScheduleProposalRevision,
  assertScheduleProposalRevisionCurrentNow,
  reconcileScheduleProposalRevision,
  openScheduleProposalRevisionSource,
  closeScheduleProposalRevision,
  type ScheduleProposalRevisionInput,
} from '../src/lib/workflows/schedule-proposal-revisions';
import { ScheduleProposalRevisions } from '../src/components/workflows/ScheduleProposalRevisions';
import {
  prepareCrewLab,
  executeCrewTransaction,
  type CrewLabCommand,
} from '../server/field-lab/crew-transaction';
import {
  prepareScheduleRevisionLab,
  executeScheduleRevision,
  reconcileScheduleRevision,
  type ScheduleRevisionCommand,
  type ScheduleRevisionAuthority,
} from '../server/field-lab/proposal-revisions';
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
function run(f: Fixture, c = f.command, a = f.authority) {
  return executeScheduleRevision(f.crewPath, f.path, c, a);
}
function read(f: Fixture, c = f.command) {
  return reconcileScheduleRevision(f.crewPath, f.path, c, f.authority);
}
function next(
  f: Fixture,
  id: string,
  action: ScheduleRevisionCommand['action'] = 'REVISE',
): ScheduleRevisionCommand {
  const previous = read(f).receipt!;
  return {
    ...f.command,
    command_id: id,
    expected_revision: previous.revision,
    previous_receipt_id: previous.receipt_id,
    action,
  };
}
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
function worker(f: Fixture, command = f.command, mode = 'normal') {
  prepareScheduleRevisionLab(f.crewPath, f.path, f.authority);
  const cmd = join(f.folder, command.command_id + '-command.json'),
    witness = join(f.folder, command.command_id + '-witness.json');
  writeFileSync(cmd, JSON.stringify(command));
  writeFileSync(
    witness,
    JSON.stringify({
      now: f.clock.now,
      envelopes: [command.original.envelope, command.proposal],
    }),
  );
  const child = fork(
    new URL('./helpers/cycle12-schedule-worker.ts', import.meta.url),
    [f.crewPath, f.path, cmd, witness, mode],
    {
      execArgv: ['--experimental-strip-types'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  children.push(child);
  const inbox: Record<string, unknown>[] = [];
  let stderr = '';
  child.on('message', (m) => inbox.push(m as Record<string, unknown>));
  child.stderr?.on('data', (d) => (stderr += String(d)));
  const event = (name: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const find = () => inbox.find((x) => x.event === name),
        found = find();
      if (found) {
        resolve(found);
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Worker timeout ' + name + ' ' + stderr));
      }, 10_000);
      const listener = () => {
        const v = find();
        if (v) {
          cleanup();
          resolve(v);
        }
      };
      const exit = () => {
        if (!find()) {
          cleanup();
          reject(Error('Worker exit ' + stderr));
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
  return { child, witness, event };
}
it.each([0, 1, 2])(
  'brand %s reviews actual C11 sources and modifies only disposable revision metadata',
  async (brand) => {
    const f = await fixture(brand),
      before = JSON.stringify(f.sources.property.read(f.sources.company.id)),
      writers = [
        vi.spyOn(f.sources.estimates, 'assignJob'),
        vi.spyOn(f.sources.property, 'saveVisit'),
        vi.spyOn(f.sources.estimates, 'recordTime'),
      ];
    const view = await reviewScheduleProposalRevision(
        f.sources,
        f.input,
        f.gate,
      ),
      result = run(f);
    expect(view.proposed.envelope).toEqual(f.b.envelope);
    expect(Object.isFrozen(view.proposed.envelope)).toBe(true);
    expect(result.receipt).toMatchObject({
      status: 'REVISED_LAB_ONLY',
      revision: 1,
      dispatch: false,
      business_write: false,
    });
    expect(result.receipt?.receipt_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(read(f)).toEqual(result);
    expect(run(f)).toEqual(result);
    const detail = await openScheduleProposalRevisionSource(view);
    expect(detail).toMatchObject({
      job_id: f.base.envelope.job_id,
      location_id: f.base.envelope.property_id,
      version_id: f.base.envelope.issued_version_id,
    });
    expect(JSON.stringify(view)).not.toMatch(
      /payroll|unit_cost|private_notes|supplier|@example.invalid/,
    );
    expect(JSON.stringify(f.sources.property.read(f.sources.company.id))).toBe(
      before,
    );
    expect(writers.every((w) => !w.mock.calls.length)).toBe(true);
    expect(view.actual_availability).toBe('UNKNOWN');
    expect(view.durable_writer).toBe('NOT_CONNECTED');
    expect(Object.values(view.authority).every((v) => v === false)).toBe(true);
  },
);
it('known exact predecessor receipt permits a next CAS revision without changing the C11 original', async () => {
  const f = await fixture(),
    original = readFileSync(f.crewPath),
    first = run(f),
    second = next(f, 'lab-next');
  const result = run(f, second);
  expect(result.receipt).toMatchObject({
    status: 'REVISED_LAB_ONLY',
    prior_revision: 1,
    revision: 2,
  });
  expect(read(f)).toEqual(first);
  expect(readFileSync(f.crewPath)).toEqual(original);
  expect(counts(f).attempts).toBe(2);
});
it('competing real processes cannot both claim the same logical CAS revision', async () => {
  const f = await fixture(),
    a = worker(f),
    b = worker(f, { ...f.command, command_id: 'lab-competing' });
  await Promise.all([a.event('READY'), b.event('READY')]);
  a.child.send('GO');
  b.child.send('GO');
  const values = await Promise.all([a.event('RESULT'), b.event('RESULT')]);
  expect(
    values.map((v) => (v.result as ReturnType<typeof run>).status).sort(),
  ).toEqual(['EXACT_RECEIPT', 'UNKNOWN']);
  expect(counts(f)).toMatchObject({
    attempts: 1,
    receipts: 1,
    series: { revision: 1, state: 'OPEN' },
  });
}, 20_000);
it('wrong expected revision yields factual CAS rejection and no metadata reschedule', async () => {
  const f = await fixture();
  f.command.expected_revision = 4;
  expect(run(f).receipt).toMatchObject({ status: 'REJECTED_CAS', revision: 0 });
  expect(counts(f).series).toMatchObject({ revision: 0 });
});
it.each(['interrupt-claim', 'interrupt-commit'])(
  'actual SIGKILL %s retains exact receipts or permanent UNKNOWN after restart',
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
    const result = read(f);
    expect(result.status).toBe(
      mode === 'interrupt-claim' ? 'UNKNOWN' : 'EXACT_RECEIPT',
    );
    expect(run(f)).toEqual(result);
    const bypass = {
      ...f.command,
      command_id: 'lab-no-new-id',
      expected_revision: 1,
      expires_at: f.command.expires_at + 60000,
    };
    expect(run(f, bypass).status).toBe('UNKNOWN');
    expect(counts(f).attempts).toBe(1);
  },
  20_000,
);
it('lost ACK requires exact read-only receipt reconciliation before a later revision', async () => {
  const f = await fixture();
  f.authority.afterCommit = () => {
    throw Error('lost acknowledgment');
  };
  expect(run(f).status).toBe('UNKNOWN');
  delete f.authority.afterCommit;
  expect(
    run(f, {
      ...f.command,
      command_id: 'lab-blind-revision',
      expected_revision: 1,
    }).status,
  ).toBe('UNKNOWN');
  const exact = read(f);
  expect(exact.receipt?.status).toBe('REVISED_LAB_ONLY');
  expect(run(f, next(f, 'lab-after-exact-read')).receipt?.revision).toBe(2);
});
it.each(['source', 'staff', 'clock'] as const)(
  'actual SQLite lock wait rechecks %s before claiming',
  async (kind) => {
    const f = await fixture(),
      w = worker(f),
      lock = new DatabaseSync(f.path);
    lock.exec('BEGIN IMMEDIATE');
    await w.event('READY');
    w.child.send('GO');
    await w.event('SOURCE_CHECKED');
    const witness = JSON.parse(readFileSync(w.witness, 'utf8'));
    if (kind === 'source') witness.envelopes = [];
    if (kind === 'staff') witness.revoked = true;
    if (kind === 'clock') witness.now--;
    writeFileSync(w.witness, JSON.stringify(witness));
    lock.exec('COMMIT');
    lock.close();
    expect(
      ((await w.event('RESULT')).result as ReturnType<typeof run>).status,
    ).toBe('UNKNOWN');
    expect(counts(f).attempts).toBe(0);
  },
  20_000,
);
it('the original C11 file is also locked during revision admission', async () => {
  const f = await fixture(),
    w = worker(f),
    lock = new DatabaseSync(f.crewPath);
  lock.exec('BEGIN IMMEDIATE');
  await w.event('READY');
  w.child.send('GO');
  await w.event('SOURCE_CHECKED');
  writeFileSync(
    w.witness,
    JSON.stringify({ revoked: true, now: f.clock.now, envelopes: [] }),
  );
  lock.exec('COMMIT');
  lock.close();
  expect(
    ((await w.event('RESULT')).result as ReturnType<typeof run>).status,
  ).toBe('UNKNOWN');
  expect(counts(f).attempts).toBe(0);
}, 20_000);
it('an original C11 UNKNOWN cannot be bypassed by C12, a new ID, different time or a fresh metadata database', async () => {
  const f = await fixture(0, false);
  executeCrewTransaction(f.crewPath, f.base, {
    ...f.authority,
    afterClaim: () => {
      throw Error('interrupted original');
    },
  });
  expect(() => run(f)).toThrow('C11 permanent hold');
  expect(() =>
    run(f, {
      ...f.command,
      command_id: 'lab-new-attempt',
      expires_at: f.command.expires_at + 60000,
    }),
  ).toThrow('C11 permanent hold');
  expect(existsSync(f.path)).toBe(false);
  const db = new DatabaseSync(f.crewPath, { readOnly: true });
  expect(db.prepare('SELECT count(*) AS n FROM claims').get()?.n).toBe(1);
  expect(db.prepare('SELECT count(*) AS n FROM receipts').get()?.n).toBe(0);
  db.close();
});
it.each(['CANCEL', 'REVOKE'] as const)(
  '%s is irrevocable and cannot be reopened by new IDs, expiration or CAS',
  async (action) => {
    const f = await fixture();
    run(f);
    const command = next(f, 'lab-terminal', action),
      r = run(f, command);
    expect(r.receipt?.status).toBe(
      action === 'CANCEL' ? 'CANCELLED_LAB_ONLY' : 'REVOKED_LAB_ONLY',
    );
    expect(read(f, command)).toEqual(r);
    expect(
      run(f, {
        ...command,
        command_id: 'lab-reopen',
        action: 'REVISE',
        expected_revision: 2,
        previous_receipt_id: r.receipt!.receipt_id,
        expires_at: command.expires_at + 60000,
      }).status,
    ).toBe('UNKNOWN');
    expect(counts(f).attempts).toBe(2);
  },
);
it('expiration after a claim is terminal and changing the deadline never reopens a lineage', async () => {
  const f = await fixture();
  f.command.expires_at = f.clock.now + 1000;
  f.authority.afterClaim = () => {
    f.clock.now += 1000;
  };
  const expired = run(f);
  expect(expired.receipt?.status).toBe('EXPIRED_LAB_ONLY');
  delete f.authority.afterClaim;
  expect(
    run(f, {
      ...f.command,
      command_id: 'lab-after-expiry',
      expected_revision: 1,
      previous_receipt_id: expired.receipt!.receipt_id,
      expires_at: f.clock.now + 60000,
    }).status,
  ).toBe('UNKNOWN');
  expect(counts(f).series).toMatchObject({ state: 'EXPIRED_LAB_ONLY' });
});
it('read-only expiration observes the fixed deadline without mutating; clock rollback fails closed', async () => {
  const f = await fixture();
  run(f);
  const before = counts(f);
  f.clock.now = f.command.expires_at;
  expect(read(f).effective_state).toBe('EXPIRED_LAB_ONLY');
  expect(counts(f)).toEqual(before);
  const later = next(f, 'lab-expired-later');
  later.expires_at += 100000;
  expect(run(f, later).receipt?.status).toBe('EXPIRED_LAB_ONLY');
  f.clock.now--;
  expect(read(f).status).toBe('UNKNOWN');
  expect(counts(f).series).toMatchObject({ state: 'EXPIRED_LAB_ONLY' });
});
it.each(['source', 'input', 'gate', 'clock'] as const)(
  'post-claim %s drift leaves permanent UNKNOWN with no changed-time bypass',
  async (kind) => {
    const f = await fixture();
    f.authority.afterClaim = () => {
      if (kind === 'source') f.sources.entries = [...f.sources.entries];
      if (kind === 'input') f.command.expires_at++;
      if (kind === 'gate') f.authority.enabled = false;
      if (kind === 'clock') f.clock.now--;
    };
    expect(run(f).status).toBe('UNKNOWN');
    delete f.authority.afterClaim;
    f.authority.enabled = true;
    expect(counts(f)).toMatchObject({
      attempts: 1,
      receipts: 0,
      series: { revision: 0 },
    });
    if (kind !== 'source')
      expect(
        run(f, { ...f.command, command_id: 'lab-bypass', expected_revision: 1 })
          .status,
      ).toBe('UNKNOWN');
  },
);
it('actual SQLite receipt refusal rolls back revision and preserves the claimed logical attempt', async () => {
  const f = await fixture();
  prepareScheduleRevisionLab(f.crewPath, f.path, f.authority);
  const db = new DatabaseSync(f.path);
  db.exec(
    "CREATE TRIGGER refuse_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(FAIL,'receipt write refused');END;",
  );
  db.close();
  expect(run(f).status).toBe('UNKNOWN');
  expect(counts(f)).toMatchObject({
    attempts: 1,
    receipts: 0,
    series: { revision: 0 },
  });
  const repair = new DatabaseSync(f.path);
  repair.exec('DROP TRIGGER refuse_receipt');
  repair.close();
  expect(run(f).status).toBe('UNKNOWN');
  expect(run(f, { ...f.command, command_id: 'lab-cannot-retry' }).status).toBe(
    'UNKNOWN',
  );
});
it('canonical cross-job capacity rejects overlap with another exact C11 reservation', async () => {
  const f = await fixture(),
    e = f.sources.entries[2];
  const input = {
    ...f.original,
    proposal: {
      ...f.original.proposal,
      job_id: e.target.job_id!,
      source_visit_id: e.scheduled_visit_id,
      worker_id: e.worker_id,
      start: e.day + 'T11:00',
      end: e.day + 'T13:00',
    },
  };
  const a = await admitCrewAssignment(f.sources, input, f.gate);
  expect(
    executeCrewTransaction(
      f.crewPath,
      {
        command_id: 'lab-other-job',
        expected_revision: 1,
        envelope: a.envelope,
        sha256: a.integrity.sha256,
      },
      {
        enabled: true,
        test_only: true,
        checkSource: () => {
          assertCrewAssignmentCurrentNow(a);
          return a.integrity.sha256;
        },
      },
    ).receipt?.status,
  ).toBe('RESERVED_LAB_ONLY');
  expect(run(f).receipt).toMatchObject({
    status: 'REJECTED_CONFLICT',
    canonical_conflict_count: 1,
    revision: 0,
  });
});
it('date-only and missing-hours evidence stays UNKNOWN and cannot produce an accepted revision', async () => {
  const f = await fixture();
  f.proposed.proposal.start = null;
  f.proposed.proposal.end = null;
  f.proposed.proposal.hours_start = null;
  f.proposed.proposal.hours_end = null;
  const a = await admitCrewAssignment(f.sources, f.proposed, f.gate);
  const command = {
    ...f.command,
    proposal: a.envelope,
    proposal_sha256: a.integrity.sha256,
  };
  const originalCheck = f.authority.checkSource;
  const authority = {
    ...f.authority,
    checkSource: (e: typeof a.envelope) =>
      e === a.envelope || JSON.stringify(e) === JSON.stringify(a.envelope)
        ? a.integrity.sha256
        : originalCheck(e),
  };
  expect(a.envelope.canonical_capacity_state).toBe('UNKNOWN');
  expect(run(f, command, authority).receipt?.status).toBe(
    'REJECTED_REQUIREMENTS',
  );
});
it('strict own-data inputs and envelopes reject getters/toJSON without invocation', async () => {
  const f = await fixture(),
    hook = vi.fn();
  Object.defineProperty(f.input.proposed.proposal, 'start', { get: hook });
  await expect(
    reviewScheduleProposalRevision(f.sources, f.input, f.gate),
  ).rejects.toThrow();
  const command = {
    ...f.command,
    proposal: { ...f.command.proposal, toJSON: hook },
  };
  expect(() => run(f, command)).toThrow();
  const coercion = { ...f.command, proposal: { ...f.command.proposal } };
  Object.assign(coercion.proposal, {
    canonical_capacity_state: { toString: hook },
  });
  expect(() => run(f, coercion)).toThrow();
  expect(hook).not.toHaveBeenCalled();
});
it('default OFF precedes source/input getters and source callbacks in browser and lab', async () => {
  const hook = vi.fn(),
    sources = Object.create(null),
    input = Object.create(null),
    command = Object.create(null);
  Object.defineProperty(sources, 'entries', { get: hook });
  Object.defineProperty(input, 'original', { get: hook });
  Object.defineProperty(command, 'original', { get: hook });
  await expect(
    reviewScheduleProposalRevision(sources, input),
  ).rejects.toThrow();
  expect(() =>
    executeScheduleRevision('/invalid', '/invalid', command, {
      checkSource: hook,
      clock: hook,
    }),
  ).toThrow('OFF');
  const markup = renderToStaticMarkup(
    createElement(ScheduleProposalRevisions, { sources, enabled: false }),
  );
  expect(markup).toContain('are off');
  expect(hook).not.toHaveBeenCalled();
});
it.each(['https:', 'file:'])(
  'browser protocol %s cannot inspect source getters even when explicitly enabled',
  (protocol) => {
    const hook = vi.fn(),
      sources = Object.create(null);
    Object.defineProperty(sources, 'entries', { get: hook });
    vi.stubGlobal('window', { location: { hostname: 'localhost', protocol } });
    expect(
      renderToStaticMarkup(
        createElement(ScheduleProposalRevisions, { sources, enabled: true }),
      ),
    ).toContain('are off');
    expect(hook).not.toHaveBeenCalled();
  },
);
it.each([0, 1, 2])(
  'brand %s live form labels reflect visible names and no source/network writer',
  async (brand) => {
    const f = await fixture(brand);
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1', protocol: 'http:' },
    });
    const markup = renderToStaticMarkup(
      createElement(ScheduleProposalRevisions, {
        sources: f.sources,
        enabled: true,
      }),
    );
    expect(markup).toContain('Review schedule proposal revision');
    expect(markup).toContain('Revised proposed start');
    expect(markup).toContain('Proposal expiration in minutes');
    expect(markup).not.toContain('aria-label="Review');
    expect(markup).toContain('actual availability UNKNOWN');
  },
);
it.each(['input', 'gate', 'root', 'model', 'repository'] as const)(
  'final C12 hash await rechecks original %s and leaves a terminal UNKNOWN hold',
  async (kind) => {
    const f = await fixture(),
      originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await originalDigest(...args);
      if (
        !changed &&
        new TextDecoder()
          .decode(args[1] as ArrayBuffer)
          .includes('LOCAL_SCHEDULE_PROPOSAL_REVISION_REVIEW')
      ) {
        changed = true;
        if (kind === 'input')
          f.input.proposed.proposal.end = f.original.proposal.day + 'T14:00';
        if (kind === 'gate') f.gate.confirmed = false;
        if (kind === 'root') f.sources.entries = [...f.sources.entries];
        if (kind === 'model')
          f.sources.entries[0].customerModel =
            f.sources.entries[1].customerModel;
        if (kind === 'repository')
          f.sources.property = (await fixture()).sources.property;
      }
      return result;
    });
    await expect(
      reviewScheduleProposalRevision(f.sources, f.input, f.gate),
    ).rejects.toThrow();
    expect(changed).toBe(true);
    f.gate.confirmed = true;
    await expect(
      reviewScheduleProposalRevision(
        f.sources,
        { ...f.input, expires_at: f.input.expires_at + 1000 },
        f.gate,
      ),
    ).rejects.toThrow();
  },
);
it('competing same-tab reviews and changed expiration cannot bypass a pending hold', async () => {
  const f = await fixture(),
    first = reviewScheduleProposalRevision(f.sources, f.input, f.gate);
  await expect(
    reviewScheduleProposalRevision(
      f.sources,
      { ...f.input, expires_at: f.input.expires_at + 1000 },
      f.gate,
    ),
  ).rejects.toThrow('hold');
  const view = await first;
  expect((await reconcileScheduleProposalRevision(view)).status).toBe(
    'CURRENT_REVIEW_ONLY',
  );
  await expect(
    reviewScheduleProposalRevision(
      f.sources,
      {
        ...f.input,
        expected_revision: 1,
        expires_at: f.input.expires_at + 1000,
      },
      f.gate,
    ),
  ).rejects.toThrow('hold');
});
it('a later explicit same-tab review uses exact revision CAS and preserves the immutable original source', async () => {
  const f = await fixture(),
    first = await reviewScheduleProposalRevision(f.sources, f.input, f.gate);
  const input = {
    ...f.input,
    expected_revision: 1,
    proposed: {
      ...f.proposed,
      proposal: {
        ...f.proposed.proposal,
        start: f.original.proposal.day + 'T13:00',
        end: f.original.proposal.day + 'T15:00',
      },
    },
  };
  const second = await reviewScheduleProposalRevision(f.sources, input, f.gate);
  expect(second.revision).toBe(2);
  expect(second.original).toEqual(first.original);
  expect((await reconcileScheduleProposalRevision(first)).status).toBe(
    'UNKNOWN',
  );
  expect((await reconcileScheduleProposalRevision(second)).status).toBe(
    'CURRENT_REVIEW_ONLY',
  );
});
it.each(['CANCEL', 'REVOKE'] as const)(
  'same-tab %s withdrawal is irrevocable and copied reviews grant no source access',
  async (action) => {
    const f = await fixture(),
      view = await reviewScheduleProposalRevision(f.sources, f.input, f.gate);
    expect(
      (await reconcileScheduleProposalRevision(structuredClone(view))).status,
    ).toBe('UNKNOWN');
    await expect(
      openScheduleProposalRevisionSource(structuredClone(view)),
    ).rejects.toThrow();
    expect(closeScheduleProposalRevision(view, action).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    expect((await reconcileScheduleProposalRevision(view)).status).toBe(
      action === 'CANCEL' ? 'CANCELLED' : 'REVOKED',
    );
    await expect(
      reviewScheduleProposalRevision(
        f.sources,
        { ...f.input, expected_revision: 1 },
        f.gate,
      ),
    ).rejects.toThrow('hold');
  },
);
it('browser expiration is terminal even if the local clock subsequently moves back', async () => {
  const f = await fixture(),
    view = await reviewScheduleProposalRevision(f.sources, f.input, f.gate);
  vi.spyOn(Date, 'now').mockReturnValue(f.input.expires_at);
  expect((await reconcileScheduleProposalRevision(view)).status).toBe(
    'EXPIRED',
  );
  vi.spyOn(Date, 'now').mockReturnValue(f.input.expires_at - 1000);
  expect((await reconcileScheduleProposalRevision(view)).status).toBe(
    'UNKNOWN',
  );
  expect(() => assertScheduleProposalRevisionCurrentNow(view)).toThrow();
});
it('current staff revocation and source container replacement permanently withhold a retained browser view', async () => {
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
  const view = await reviewScheduleProposalRevision(f.sources, f.input, f.gate);
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    false,
    'admin',
    'office_manager',
  );
  expect((await reconcileScheduleProposalRevision(view)).status).toBe(
    'UNKNOWN',
  );
  await f.sources.operations.manageMember(
    f.sources.company.id,
    actor,
    true,
    'admin',
    'office_manager',
  );
  expect((await reconcileScheduleProposalRevision(view)).status).toBe(
    'UNKNOWN',
  );
});
it('foreign job/property proposal and self-attested source witnesses fail closed', async () => {
  const f = await fixture(),
    other = await fixture(1);
  await expect(
    reviewScheduleProposalRevision(
      f.sources,
      { ...f.input, proposed: other.proposed },
      f.gate,
    ),
  ).rejects.toThrow();
  expect(() =>
    run(f, {
      ...f.command,
      proposal: other.b.envelope,
      proposal_sha256: other.b.integrity.sha256,
    }),
  ).toThrow('lineage');
  expect(() =>
    run(f, f.command, { ...f.authority, checkSource: () => '0'.repeat(64) }),
  ).toThrow('witness');
});
it('missing database/receipt or corrupted exact identity remains UNKNOWN without replay', async () => {
  const f = await fixture();
  expect(read(f).status).toBe('UNKNOWN');
  run(f);
  const db = new DatabaseSync(f.path),
    row = db.prepare('SELECT body FROM receipts').get()!;
  const body = JSON.stringify({
    ...JSON.parse(String(row.body)),
    worker_id: 'foreign-worker',
  });
  db.prepare('UPDATE receipts SET body=?,sha256=?').run(
    body,
    createHash('sha256').update(body).digest('hex'),
  );
  db.close();
  expect(read(f).status).toBe('UNKNOWN');
  expect(run(f).status).toBe('UNKNOWN');
  expect(
    run(f, { ...f.command, command_id: 'lab-corrupt-bypass' }).status,
  ).toBe('UNKNOWN');
});
it('arbitrary private files and symlinks cannot be initialized as revision metadata', async () => {
  const f = await fixture();
  writeFileSync(f.path, 'retain original', { mode: 0o600 });
  expect(() => run(f)).toThrow();
  expect(readFileSync(f.path, 'utf8')).toBe('retain original');
  rmSync(f.path);
  const target = join(f.folder, 'private-original');
  writeFileSync(target, 'unchanged', { mode: 0o600 });
  symlinkSync(target, f.path);
  expect(() => run(f)).toThrow();
  expect(readFileSync(target, 'utf8')).toBe('unchanged');
});
it('browser source graph has no server writer, provider, storage or network mutation and uses scoped tokens', () => {
  const module = readFileSync(
      new URL(
        '../src/lib/workflows/schedule-proposal-revisions.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    ui = readFileSync(
      new URL(
        '../src/components/workflows/ScheduleProposalRevisions.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    css = readFileSync(
      new URL(
        '../src/components/workflows/schedule-proposal-revisions.css',
        import.meta.url,
      ),
      'utf8',
    );
  expect(module + ui).not.toMatch(
    /node:sqlite|field-lab\/proposal-revisions|fetch\(|localStorage|indexedDB|sendMessage|assignJob\(/,
  );
  expect(css).toContain('--journey-primary');
  expect(css).toContain('--journey-accent');
  expect(css).toContain('44px');
  expect(digest(module)).toHaveLength(64);
});
