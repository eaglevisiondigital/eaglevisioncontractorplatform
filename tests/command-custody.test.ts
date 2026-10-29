import {
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, it, expect } from 'vitest';
import {
  CommandCustody,
  canonical,
  custodyIdentity,
  type CustodyCommand,
} from '../server/property/command-custody';
import type { MaintenanceCommand } from '../server/property/maintenance-persistence';
import { blankEstimate } from '../src/domain/estimating/calculation';
const uid = () => crypto.randomUUID();
const roots: string[] = [],
  journals: CommandCustody[] = [];
function root() {
  const p = mkdtempSync(join(realpathSync(tmpdir()), 'propel-custody-unit-'));
  roots.push(p);
  return p;
}
function journal(path = root()) {
  const j = new CommandCustody(path);
  journals.push(j);
  return j;
}
function command(): {
  kind: 'maintenance';
  command: Extract<MaintenanceCommand, { action: 'edit' }>;
} {
  return {
    kind: 'maintenance',
    command: {
      request_id: uid(),
      source: {
        organization_id: uid(),
        customer_id: uid(),
        location_id: uid(),
        report_id: uid(),
        report_version: 2,
        finding_id: 'exact synthetic source',
      },
      expected_revision: 1,
      action: 'edit',
      input: {
        priority: 'normal',
        assignee_id: null,
        follow_up_on: '',
        review: 'reviewed',
        note: 'PRIVATE synthetic follow-up note',
      },
    },
  };
}
afterEach(() => {
  for (const j of journals) j.close();
  journals.length = 0;
  for (const p of roots) rmSync(p, { recursive: true, force: true });
  roots.length = 0;
});
it('durably retains complete immutable intent/source/CAS/purpose before any transmitting event', () => {
  const j = journal(),
    c = command(),
    cap = uid(),
    id = custodyIdentity(c).id;
  j.retain(c, cap);
  const read = j.read(id)!;
  expect(read.value).toEqual(c);
  expect(read.intent).toMatchObject({
    request_id: id,
    capability_id: cap,
    purpose: 'maintenance',
    expected_revision: 1,
  });
  expect(read.events.map((e) => e.kind)).toEqual(['retained']);
  expect(statSync(j.root).mode & 0o777).toBe(0o700);
  expect(statSync(join(j.root, 'commands.sqlite')).mode & 0o777).toBe(0o600);
});
it('new process-style reader reopens exact retained records without transmitting', () => {
  const path = root(),
    c = command(),
    cap = uid(),
    j = journal(path);
  j.retain(c, cap);
  j.transmitting(c.command.request_id, 'command');
  const second = journal(path);
  expect(second.read(c.command.request_id)!.events.at(-1)?.kind).toBe(
    'transmitting',
  );
});
it('same request/capability returns its original intent; different payload or capability rejects', () => {
  const j = journal(),
    c = command(),
    cap = uid();
  j.retain(c, cap);
  expect(j.retain(c, cap).existing).toBe(true);
  expect(() =>
    j.retain(
      {
        ...c,
        command: {
          ...c.command,
          input: { ...c.command.input, note: 'Different exact private note' },
        },
      },
      cap,
    ),
  ).toThrow(/replaced/);
  expect(() => j.retain(c, uid())).toThrow(/replaced/);
});
it('pre-transmission custody failure is surfaced and retains no executable intent', () => {
  const j = journal(),
    c = command();
  expect(() => j.retain(c, 'not-a-UUID')).toThrow();
  expect(j.read(c.command.request_id)).toBeNull();
});
it('a transmission claim is append-only and cannot be repeated after uncertainty', () => {
  const j = journal(),
    c = command();
  j.retain(c, uid());
  j.transmitting(c.command.request_id, 'command');
  j.uncertain(c.command.request_id, 'command');
  expect(() => j.transmitting(c.command.request_id, 'command')).toThrow(
    /never retries/,
  );
  expect(j.read(c.command.request_id)!.events.map((e) => e.kind)).toEqual([
    'retained',
    'transmitting',
    'uncertain',
  ]);
});
it('absent remote receipt is undetermined and cannot unlock the source with another request ID', () => {
  const j = journal(),
    c = command(),
    cap = uid();
  j.retain(c, cap);
  j.transmitting(c.command.request_id, 'command');
  j.reconcile(c.command.request_id, 'command', { status: 'undetermined' });
  expect(() =>
    j.retain(
      {
        ...c,
        command: { ...c.command, request_id: uid(), expected_revision: 2 },
      },
      uid(),
    ),
  ).toThrow(/UNKNOWN/);
  expect(j.read(c.command.request_id)!.events).toHaveLength(2);
});
it('acknowledged earlier command permits an explicit new revision but confers no authority', () => {
  const j = journal(),
    c = command();
  j.retain(c, uid());
  j.transmitting(c.command.request_id, 'command');
  j.acknowledge(c.command.request_id, 'command', {
    request_id: c.command.request_id,
    revision: 2,
  });
  expect(
    j.retain(
      {
        ...c,
        command: { ...c.command, request_id: uid(), expected_revision: 2 },
      },
      uid(),
    ).existing,
  ).toBe(false);
});
it('repair preparation cannot transmit until its reservation acknowledgment is retained', () => {
  const j = journal(),
    base = command().command,
    payload = blankEstimate(base.source.customer_id);
  payload.location_id = base.source.location_id;
  const c: CustodyCommand = {
    kind: 'repair',
    command: {
      request_id: uid(),
      source: base.source,
      maintenance_revision: 1,
      plan_id: uid(),
      plan_revision: 1,
      job_id: null,
      job_baseline_version_id: null,
      estimate_id: uid(),
      draft_version_id: uid(),
      line_id: payload.lines[0].id,
      payload,
    },
  };
  j.retain(c, uid());
  expect(() => j.transmitting(c.command.request_id, 'prepare')).toThrow(
    /acknowledgment/,
  );
  j.transmitting(c.command.request_id, 'reserve');
  j.acknowledge(c.command.request_id, 'reserve', {
    estimate_id: c.command.estimate_id,
  });
  j.transmitting(c.command.request_id, 'prepare');
  expect(j.read(c.command.request_id)!.value).toEqual(c);
});
it('local intent and event SQL updates/deletes are rejected, including by another connection', () => {
  const j = journal(),
    c = command();
  j.retain(c, uid());
  const d = new DatabaseSync(join(j.root, 'commands.sqlite'));
  try {
    for (const sql of [
      'update intents set purpose=purpose',
      'delete from intents',
      'update events set evidence=evidence',
      'delete from events',
    ])
      expect(() => d.exec(sql)).toThrow(/append-only/);
  } finally {
    d.close();
  }
});
it('unexpected file corruption fails closed before dispatch instead of silently repairing history', () => {
  const j = journal(),
    c = command();
  j.retain(c, uid());
  const d = new DatabaseSync(join(j.root, 'commands.sqlite'));
  try {
    d.exec(
      "drop trigger immutable_intent_update;update intents set source_key='corrupt'",
    );
    expect(() => j.read(c.command.request_id)).toThrow(/integrity/);
    expect(() => j.retain(command(), uid())).toThrow(/integrity/);
  } finally {
    d.close();
  }
});
it('custody requires private owned directories and rejects symlink substitution', () => {
  const path = root();
  chmodSync(path, 0o755);
  expect(() => new CommandCustody(path)).toThrow(/private/);
  chmodSync(path, 0o700);
  const other = root();
  symlinkSync(other, join(path, 'link'));
  expect(() => new CommandCustody(join(path, 'link'))).toThrow(/private/);
});
it('database symlinks are rejected before a journal is opened', () => {
  const path = root(),
    other = root(),
    j = journal(other);
  symlinkSync(join(j.root, 'commands.sqlite'), join(path, 'commands.sqlite'));
  expect(() => new CommandCustody(path)).toThrow(/regular/);
});
it('canonical evidence ignores object key order and preserves array order', () => {
  expect(canonical({ b: 2, a: [1, 2] })).toBe(canonical({ a: [1, 2], b: 2 }));
  expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
});
it.each([NaN, Infinity, new Date(), undefined])(
  'non-JSON custody values fail closed (%s)',
  (value) => expect(() => canonical(value)).toThrow(),
);
it('private command and receipt size limits reject instead of truncating', () => {
  const j = journal(),
    c = command();
  expect(() =>
    j.retain(
      {
        ...c,
        command: {
          ...c.command,
          input: { ...c.command.input, note: 'x'.repeat(1048576) },
        },
      },
      uid(),
    ),
  ).toThrow();
  j.retain(c, uid());
  j.transmitting(c.command.request_id, 'command');
  expect(() =>
    j.acknowledge(c.command.request_id, 'command', {
      value: 'x'.repeat(1048576),
    }),
  ).toThrow(/bound/);
  expect(j.read(c.command.request_id)!.events.at(-1)?.kind).toBe(
    'transmitting',
  );
});
it('unknown operations and caller actor fields cannot enter the custody protocol', () => {
  const c = command();
  expect(() =>
    custodyIdentity({ ...c, actor_id: uid() } as CustodyCommand),
  ).toThrow();
  expect(() =>
    custodyIdentity({
      ...c,
      kind: 'issue_estimate',
    } as unknown as CustodyCommand),
  ).toThrow();
});
it('a journal opened concurrently retains SQLite FULL/WAL and private-file limits', () => {
  const j = journal();
  const d = new DatabaseSync(join(j.root, 'commands.sqlite'));
  try {
    expect(d.prepare('pragma journal_mode').get()!.journal_mode).toBe('wal');
    const check = journal(j.root);
    expect(check.root).toBe(j.root);
    expect(statSync(join(j.root, 'commands.sqlite-wal')).mode & 0o077).toBe(0);
  } finally {
    d.close();
  }
});
