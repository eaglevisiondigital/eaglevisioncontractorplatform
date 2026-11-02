/** TEST ONLY: disposable local SQLite command/reservation metadata. No business writer,
 * network adapter, hosted schema or browser import. The source callback is trusted TCB. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { lstatSync, chmodSync, openSync, closeSync, constants } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { calculateCrewCapacity } from '../../src/domain/field/crew-capacity.ts';
import type { CrewAssignmentEnvelope } from '../../src/lib/workflows/crew-assignment-lab.ts';

export interface CrewLabCommand {
  command_id: string;
  expected_revision: number;
  envelope: CrewAssignmentEnvelope;
  sha256: string;
}
export interface CrewLabAuthority {
  enabled?: boolean;
  test_only?: boolean;
  checkSource: (envelope: CrewAssignmentEnvelope) => string;
  afterClaim?: () => void;
  beforeCommit?: () => void;
  afterCommit?: () => void;
}
export interface CrewLabReceipt {
  command_id: string;
  envelope_sha256: string;
  organization_id: string;
  job_id: string;
  worker_id: string;
  day: string;
  status:
    | 'RESERVED_LAB_ONLY'
    | 'REJECTED_CAS'
    | 'REJECTED_CONFLICT'
    | 'REJECTED_SOURCE'
    | 'REJECTED_REQUIREMENTS';
  prior_revision: number;
  revision: number;
  canonical_conflict_count: number;
  dispatch: false;
  business_write: false;
}
function exact(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Plain lab fields required');
  const ds = Object.getOwnPropertyDescriptors(value),
    own = Reflect.ownKeys(value);
  if (
    own.length !== keys.length ||
    own.some(
      (k) =>
        typeof k !== 'string' ||
        !keys.includes(k) ||
        !Object.hasOwn(ds[k], 'value'),
    )
  )
    throw Error('Exact own-data lab fields required');
  return Object.fromEntries(keys.map((k) => [k, ds[k].value]));
}
function pin(command: CrewLabCommand) {
  const f = exact(command, [
    'command_id',
    'expected_revision',
    'envelope',
    'sha256',
  ]);
  if (
    typeof f.command_id !== 'string' ||
    !/^lab-[a-zA-Z0-9-]{1,100}$/.test(f.command_id) ||
    !Number.isSafeInteger(f.expected_revision) ||
    Number(f.expected_revision) < 0
  )
    throw Error('Exact lab command and CAS required');
  const keys = [
    'mode',
    'organization_id',
    'actor_id',
    'customer_id',
    'property_id',
    'job_id',
    'job_revision',
    'estimate_id',
    'issued_version_id',
    'issued_version_number',
    'visit_id',
    'visit_revision',
    'plan_id',
    'plan_revision',
    'worker_id',
    'day',
    'timezone',
    'start',
    'end',
    'hours_start',
    'hours_end',
    'source_sha256',
    'canonical_conflict_count',
    'canonical_capacity_state',
    'source_atomicity',
    'actual_availability',
    'authority',
  ];
  const e = exact(f.envelope, keys);
  const a = exact(e.authority, [
    'assign',
    'dispatch',
    'schedule',
    'communicate',
    'financial',
  ]);
  if (
    Object.values(a).some((v) => v !== false) ||
    e.mode !== 'DISPOSABLE_CREW_RESERVATION_ADMISSION' ||
    e.source_atomicity !== 'CAPTURED_NOT_ATOMIC' ||
    e.actual_availability !== 'UNKNOWN'
  )
    throw Error('No operational authority');
  for (const k of [
    'organization_id',
    'actor_id',
    'customer_id',
    'property_id',
    'job_id',
    'estimate_id',
    'issued_version_id',
    'visit_id',
    'plan_id',
    'worker_id',
    'timezone',
  ])
    if (
      typeof e[k] !== 'string' ||
      !(e[k] as string).trim() ||
      (e[k] as string).length > 200
    )
      throw Error('Primitive exact source IDs required');
  for (const k of [
    'job_revision',
    'issued_version_number',
    'visit_revision',
    'plan_revision',
  ])
    if (!Number.isSafeInteger(e[k]) || Number(e[k]) < 1)
      throw Error('Exact source revision required');
  if (
    typeof e.day !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(e.day) ||
    typeof e.source_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(e.source_sha256) ||
    !Number.isSafeInteger(e.canonical_conflict_count) ||
    Number(e.canonical_conflict_count) < 0 ||
    !['UNKNOWN', 'WITHIN_PROPOSED_HOURS', 'OUTSIDE_PROPOSED_HOURS'].includes(
      e.canonical_capacity_state as string,
    )
  )
    throw Error('Exact canonical source evidence required');
  for (const k of ['start', 'end', 'hours_start', 'hours_end'])
    if (e[k] !== null && (!Number.isSafeInteger(e[k]) || Number(e[k]) < 0))
      throw Error('Canonical time required');
  if (
    (e.start === null) !== (e.end === null) ||
    (e.hours_start === null) !== (e.hours_end === null) ||
    (e.start !== null && Number(e.end) <= Number(e.start)) ||
    (e.hours_start !== null && Number(e.hours_end) <= Number(e.hours_start))
  )
    throw Error('Paired canonical windows required');
  e.authority = Object.freeze(a);
  Object.freeze(e);
  const sha256 = createHash('sha256').update(JSON.stringify(e)).digest('hex');
  if (f.sha256 !== sha256) throw Error('Exact envelope integrity required');
  const value = {
    command_id: f.command_id,
    expected_revision: Number(f.expected_revision),
    envelope: e as unknown as CrewAssignmentEnvelope,
    sha256,
  };
  return { value, signature: JSON.stringify(value) };
}
function connect(path: string, create: boolean) {
  const folder = dirname(resolve(path)),
    tmp = resolve(tmpdir());
  if (
    !folder.startsWith(tmp + '/') ||
    !basename(folder).startsWith('propel-crew-lab-') ||
    basename(path) !== 'custody.sqlite' ||
    lstatSync(folder).isSymbolicLink() ||
    !lstatSync(folder).isDirectory() ||
    (lstatSync(folder).mode & 0o077) !== 0
  )
    throw Error('Disposable crew lab path required');
  let fresh = false;
  if (create) {
    try {
      const fd = openSync(
        path,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_RDWR |
          constants.O_NOFOLLOW,
        0o600,
      );
      closeSync(fd);
      fresh = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  const stat = lstatSync(path);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o077) !== 0
  )
    throw Error('Private lab file required');
  if (!fresh) {
    const probe = new DatabaseSync(path, { readOnly: true });
    probe.exec('PRAGMA busy_timeout=5000;');
    try {
      if (
        probe.prepare('PRAGMA application_id').get()?.application_id !==
          1129466946 ||
        probe.prepare('PRAGMA user_version').get()?.user_version !== 11
      )
        throw Error('Existing file is not an admitted crew lab');
      const names = probe
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
        )
        .all()
        .map((r) => r.name);
      if (
        JSON.stringify(names) !==
        JSON.stringify(['claims', 'lane_revision', 'receipts', 'reservations'])
      )
        throw Error('Unexpected lab schema');
    } finally {
      probe.close();
    }
  }
  const db = new DatabaseSync(path, { readOnly: !create });
  db.exec('PRAGMA busy_timeout=5000;');
  if (fresh) {
    chmodSync(path, 0o600);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA application_id=1129466946; PRAGMA user_version=11;
      CREATE TABLE claims(command_id TEXT PRIMARY KEY, logical_key TEXT NOT NULL UNIQUE, signature TEXT NOT NULL, envelope TEXT NOT NULL, org TEXT NOT NULL);
      CREATE TABLE lane_revision(org TEXT NOT NULL,worker TEXT NOT NULL,day TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(org,worker,day));
      CREATE TABLE reservations(command_id TEXT PRIMARY KEY,org TEXT NOT NULL,job TEXT NOT NULL,worker TEXT NOT NULL,day TEXT NOT NULL,visit TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL);
      CREATE TABLE receipts(command_id TEXT PRIMARY KEY,body TEXT NOT NULL,sha256 TEXT NOT NULL);`);
  } else if (create) db.exec('PRAGMA synchronous=FULL;');
  return db;
}
/** Explicit one-time initialization before concurrent disposable workers start. */
export function prepareCrewLab(
  path: string,
  gate: { enabled?: boolean; test_only?: boolean },
) {
  if (gate.enabled !== true || gate.test_only !== true)
    throw Error('Disposable lab is OFF');
  const db = connect(path, true);
  db.close();
}
const unknown = () => ({
  status: 'UNKNOWN' as const,
  receipt: null,
  replay: 'FORBIDDEN' as const,
  replacement: null,
});
function readReceipt(db: DatabaseSync, c: CrewLabCommand) {
  const claim = db
    .prepare('SELECT signature FROM claims WHERE command_id=? AND org=?')
    .get(c.command_id, c.envelope.organization_id);
  if (!claim || claim.signature !== JSON.stringify(c)) return unknown();
  const row = db
    .prepare('SELECT body,sha256 FROM receipts WHERE command_id=?')
    .get(c.command_id);
  if (
    !row ||
    typeof row.body !== 'string' ||
    createHash('sha256').update(row.body).digest('hex') !== row.sha256
  )
    return unknown();
  const raw = exact(JSON.parse(row.body), [
    'command_id',
    'envelope_sha256',
    'organization_id',
    'job_id',
    'worker_id',
    'day',
    'status',
    'prior_revision',
    'revision',
    'canonical_conflict_count',
    'dispatch',
    'business_write',
  ]);
  const receipt = raw as unknown as CrewLabReceipt;
  if (
    receipt.command_id !== c.command_id ||
    receipt.envelope_sha256 !== c.sha256 ||
    receipt.organization_id !== c.envelope.organization_id ||
    receipt.job_id !== c.envelope.job_id ||
    receipt.worker_id !== c.envelope.worker_id ||
    receipt.day !== c.envelope.day ||
    receipt.dispatch !== false ||
    receipt.business_write !== false ||
    ![
      'RESERVED_LAB_ONLY',
      'REJECTED_CAS',
      'REJECTED_CONFLICT',
      'REJECTED_SOURCE',
      'REJECTED_REQUIREMENTS',
    ].includes(receipt.status) ||
    ![
      receipt.prior_revision,
      receipt.revision,
      receipt.canonical_conflict_count,
    ].every((v) => Number.isSafeInteger(v) && v >= 0) ||
    receipt.revision !==
      receipt.prior_revision + (receipt.status === 'RESERVED_LAB_ONLY' ? 1 : 0)
  )
    return unknown();
  return {
    status: 'EXACT_RECEIPT' as const,
    receipt: Object.freeze(receipt),
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
}
export function reconcileCrewTransaction(
  path: string,
  command: CrewLabCommand,
  authority: CrewLabAuthority,
) {
  if (authority.enabled !== true || authority.test_only !== true)
    return unknown();
  let db: DatabaseSync | undefined;
  try {
    const c = pin(command).value;
    if (authority.checkSource(c.envelope) !== c.sha256)
      throw Error('Exact trusted source witness required');
    db = connect(path, false);
    const result = readReceipt(db, c);
    if (authority.checkSource(c.envelope) !== c.sha256)
      throw Error('Exact trusted source witness required');
    return result;
  } catch {
    return unknown();
  } finally {
    db?.close();
  }
}
/** One permanently claimed local attempt. Existing/ambiguous attempts are read-only. */
export function executeCrewTransaction(
  path: string,
  command: CrewLabCommand,
  authority: CrewLabAuthority,
) {
  if (authority.enabled !== true || authority.test_only !== true)
    throw Error('Disposable lab is OFF');
  const original = pin(command),
    c = original.value,
    e = c.envelope;
  const current = () => {
    if (
      authority.enabled !== true ||
      authority.test_only !== true ||
      pin(command).signature !== original.signature
    )
      throw Error('Live command or authority changed');
    if (authority.checkSource(e) !== c.sha256)
      throw Error('Exact trusted source witness required');
  };
  current();
  const db = connect(path, true);
  let transaction = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    current();
    const prior = db
      .prepare(
        'SELECT command_id FROM claims WHERE command_id=? OR logical_key=?',
      )
      .get(
        c.command_id,
        JSON.stringify([e.organization_id, e.job_id, e.visit_id]),
      );
    if (prior) {
      db.exec('COMMIT');
      transaction = false;
      return readReceipt(db, c);
    }
    db.prepare('INSERT INTO claims VALUES(?,?,?,?,?)').run(
      c.command_id,
      JSON.stringify([e.organization_id, e.job_id, e.visit_id]),
      original.signature,
      JSON.stringify(e),
      e.organization_id,
    );
    db.exec('COMMIT');
    transaction = false;
    authority.afterClaim?.();
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    let sourceCurrent = true;
    try {
      current();
    } catch {
      sourceCurrent = false;
    }
    const row = db
        .prepare(
          'SELECT revision FROM lane_revision WHERE org=? AND worker=? AND day=?',
        )
        .get(e.organization_id, e.worker_id, e.day),
      revision = Number(row?.revision ?? 0);
    const existing = db
      .prepare(
        'SELECT command_id,job,visit,start,end FROM reservations WHERE org=? AND worker=? AND day=?',
      )
      .all(e.organization_id, e.worker_id, e.day);
    const intervals = existing.map((r) => ({
      key: String(r.command_id),
      worker_id: e.worker_id,
      job_id: String(r.job),
      visit_id: String(r.visit),
      start: Number(r.start),
      end: Number(r.end),
    }));
    const capacity =
      e.start === null
        ? null
        : calculateCrewCapacity(
            [e.worker_id],
            [
              ...intervals,
              {
                key: c.command_id,
                worker_id: e.worker_id,
                job_id: e.job_id,
                visit_id: e.visit_id,
                start: e.start,
                end: e.end!,
              },
            ],
            e.hours_start === null
              ? []
              : [
                  {
                    worker_id: e.worker_id,
                    start: e.hours_start,
                    end: e.hours_end!,
                  },
                ],
            [],
            [e.worker_id],
          );
    const status: CrewLabReceipt['status'] = !sourceCurrent
      ? 'REJECTED_SOURCE'
      : revision !== c.expected_revision
        ? 'REJECTED_CAS'
        : e.start === null ||
            e.hours_start === null ||
            e.canonical_capacity_state !== 'WITHIN_PROPOSED_HOURS'
          ? 'REJECTED_REQUIREMENTS'
          : e.canonical_conflict_count > 0 || capacity!.overlaps.length > 0
            ? 'REJECTED_CONFLICT'
            : 'RESERVED_LAB_ONLY';
    const next = status === 'RESERVED_LAB_ONLY' ? revision + 1 : revision;
    if (status === 'RESERVED_LAB_ONLY') {
      db.prepare('INSERT INTO reservations VALUES(?,?,?,?,?,?,?,?)').run(
        c.command_id,
        e.organization_id,
        e.job_id,
        e.worker_id,
        e.day,
        e.visit_id,
        e.start!,
        e.end!,
      );
      db.prepare(
        'INSERT INTO lane_revision VALUES(?,?,?,?) ON CONFLICT(org,worker,day) DO UPDATE SET revision=excluded.revision',
      ).run(e.organization_id, e.worker_id, e.day, next);
    }
    const receipt: CrewLabReceipt = {
      command_id: c.command_id,
      envelope_sha256: c.sha256,
      organization_id: e.organization_id,
      job_id: e.job_id,
      worker_id: e.worker_id,
      day: e.day,
      status,
      prior_revision: revision,
      revision: next,
      canonical_conflict_count:
        (capacity?.overlaps.length ?? 0) + e.canonical_conflict_count,
      dispatch: false,
      business_write: false,
    };
    const body = JSON.stringify(receipt);
    db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(
      c.command_id,
      body,
      createHash('sha256').update(body).digest('hex'),
    );
    authority.beforeCommit?.();
    current();
    db.exec('COMMIT');
    transaction = false;
    authority.afterCommit?.();
    current();
    return readReceipt(db, c);
  } catch {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* UNKNOWN remains held. */
      }
    return unknown();
  } finally {
    db.close();
  }
}
