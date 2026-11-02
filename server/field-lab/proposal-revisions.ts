/** Disposable Node24 metadata lab only. No business schedule, route or browser writer. */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, openSync, closeSync, constants } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  calculateCrewCapacity,
  capacityDay,
} from '../../src/domain/field/crew-capacity.ts';
import type { CrewAssignmentEnvelope } from '../../src/lib/workflows/crew-assignment-lab.ts';
import {
  reconcileCrewTransaction,
  type CrewLabCommand,
} from './crew-transaction.ts';

export interface ScheduleRevisionCommand {
  command_id: string;
  expected_revision: number;
  previous_receipt_id: string | null;
  original: CrewLabCommand;
  proposal: CrewAssignmentEnvelope;
  proposal_sha256: string;
  action: 'REVISE' | 'CANCEL' | 'REVOKE';
  expires_at: number;
}
export interface ScheduleRevisionAuthority {
  enabled?: boolean;
  test_only?: boolean;
  /** Independently retained synthetic source admission, never command self-attestation. */
  checkSource: (envelope: CrewAssignmentEnvelope) => string;
  /** Independently controlled synthetic wall clock; not genuine Auth/time attestation. */
  clock: () => number;
  afterClaim?: () => void;
  beforeCommit?: () => void;
  afterCommit?: () => void;
}
type State =
  'OPEN' | 'CANCELLED_LAB_ONLY' | 'REVOKED_LAB_ONLY' | 'EXPIRED_LAB_ONLY';
export interface ScheduleRevisionReceipt {
  receipt_id: string;
  command_id: string;
  original_command_id: string;
  original_sha256: string;
  proposal_sha256: string;
  organization_id: string;
  job_id: string;
  visit_id: string;
  worker_id: string;
  day: string;
  action: ScheduleRevisionCommand['action'];
  status:
    | 'REVISED_LAB_ONLY'
    | 'CANCELLED_LAB_ONLY'
    | 'REVOKED_LAB_ONLY'
    | 'EXPIRED_LAB_ONLY'
    | 'REJECTED_CAS'
    | 'REJECTED_CONFLICT'
    | 'REJECTED_REQUIREMENTS';
  prior_revision: number;
  revision: number;
  expires_at: number;
  canonical_conflict_count: number;
  business_write: false;
  dispatch: false;
  source_atomicity: 'CAPTURED_NOT_ATOMIC';
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const envelopeKeys = [
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
function fields(value: unknown, keys: string[], optional: string[] = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Plain exact metadata fields required');
  const ds = Object.getOwnPropertyDescriptors(value),
    own = Reflect.ownKeys(value);
  if (
    keys.some((k) => !Object.hasOwn(ds[k] ?? {}, 'value')) ||
    own.some(
      (k) =>
        typeof k !== 'string' ||
        ![...keys, ...optional].includes(k) ||
        !Object.hasOwn(ds[k], 'value'),
    )
  )
    throw Error('Exact own-data metadata required');
  return Object.fromEntries((own as string[]).map((k) => [k, ds[k].value]));
}
function envelope(value: unknown, sha256: unknown) {
  const f = fields(value, envelopeKeys);
  // Preserve C11's canonical envelope key order without serializing caller objects.
  const e = Object.fromEntries(envelopeKeys.map((k) => [k, f[k]]));
  const a = fields(e.authority, [
    'assign',
    'dispatch',
    'schedule',
    'communicate',
    'financial',
  ]);
  e.authority = Object.fromEntries(
    ['assign', 'dispatch', 'schedule', 'communicate', 'financial'].map((k) => [
      k,
      a[k],
    ]),
  );
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
      throw Error('Exact primitive source identities required');
  for (const k of [
    'job_revision',
    'issued_version_number',
    'visit_revision',
    'plan_revision',
  ])
    if (!Number.isSafeInteger(e[k]) || Number(e[k]) < 1)
      throw Error('Source revision required');
  if (
    typeof e.source_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(e.source_sha256) ||
    !Number.isSafeInteger(e.canonical_conflict_count) ||
    Number(e.canonical_conflict_count) < 0 ||
    typeof e.canonical_capacity_state !== 'string' ||
    !['UNKNOWN', 'WITHIN_PROPOSED_HOURS', 'OUTSIDE_PROPOSED_HOURS'].includes(
      e.canonical_capacity_state,
    )
  )
    throw Error('Canonical source evidence required');
  if (typeof e.day !== 'string') throw Error('Crew day required');
  const bounds = capacityDay(e.day, e.timezone as string);
  for (const [start, end] of [
    ['start', 'end'],
    ['hours_start', 'hours_end'],
  ]) {
    if ((e[start] === null) !== (e[end] === null))
      throw Error('Paired windows required');
    if (
      e[start] !== null &&
      (!Number.isSafeInteger(e[start]) ||
        !Number.isSafeInteger(e[end]) ||
        Number(e[start]) < bounds.start ||
        Number(e[end]) > bounds.end ||
        Number(e[end]) <= Number(e[start]))
    )
      throw Error('Canonical day windows required');
  }
  if (typeof sha256 !== 'string' || hash(JSON.stringify(e)) !== sha256)
    throw Error('Exact admission integrity required');
  Object.freeze(e.authority);
  return Object.freeze(e) as unknown as CrewAssignmentEnvelope;
}
function pin(command: ScheduleRevisionCommand) {
  const c = fields(command, [
    'command_id',
    'expected_revision',
    'previous_receipt_id',
    'original',
    'proposal',
    'proposal_sha256',
    'action',
    'expires_at',
  ]);
  const b = fields(c.original, [
    'command_id',
    'expected_revision',
    'envelope',
    'sha256',
  ]);
  for (const id of [c.command_id, b.command_id])
    if (typeof id !== 'string' || !/^lab-[a-zA-Z0-9-]{1,100}$/.test(id))
      throw Error('Finite lab command required');
  for (const v of [c.expected_revision, b.expected_revision, c.expires_at])
    if (!Number.isSafeInteger(v) || Number(v) < 0)
      throw Error('Exact CAS and expiration required');
  if (!['REVISE', 'CANCEL', 'REVOKE'].includes(c.action as string))
    throw Error('Explicit human action required');
  if (
    c.previous_receipt_id !== null &&
    (typeof c.previous_receipt_id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(c.previous_receipt_id))
  )
    throw Error('Exact predecessor receipt required');
  const original: CrewLabCommand = {
    command_id: b.command_id as string,
    expected_revision: Number(b.expected_revision),
    envelope: envelope(b.envelope, b.sha256),
    sha256: b.sha256 as string,
  };
  const proposal = envelope(c.proposal, c.proposal_sha256);
  for (const k of [
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
    'timezone',
  ] as const)
    if (proposal[k] !== original.envelope[k])
      throw Error('Original immutable source lineage required');
  const value: ScheduleRevisionCommand = {
    command_id: c.command_id as string,
    expected_revision: Number(c.expected_revision),
    previous_receipt_id: c.previous_receipt_id as string | null,
    original,
    proposal,
    proposal_sha256: c.proposal_sha256 as string,
    action: c.action as ScheduleRevisionCommand['action'],
    expires_at: Number(c.expires_at),
  };
  return {
    value,
    signature: JSON.stringify(value),
    base: JSON.stringify(original),
    key: JSON.stringify([
      proposal.organization_id,
      proposal.job_id,
      proposal.visit_id,
    ]),
  };
}
function on(authority: ScheduleRevisionAuthority) {
  return (
    Object.getOwnPropertyDescriptor(authority, 'enabled')?.value === true &&
    Object.getOwnPropertyDescriptor(authority, 'test_only')?.value === true
  );
}
function authorityFields(authority: ScheduleRevisionAuthority) {
  const f = fields(
    authority,
    ['enabled', 'test_only', 'checkSource', 'clock'],
    ['afterClaim', 'beforeCommit', 'afterCommit'],
  );
  if (
    typeof f.checkSource !== 'function' ||
    typeof f.clock !== 'function' ||
    ['afterClaim', 'beforeCommit', 'afterCommit'].some(
      (k) => f[k] !== undefined && typeof f[k] !== 'function',
    )
  )
    throw Error('Explicit trusted synthetic callbacks required');
}
function privateFile(path: string, name: string) {
  const folder = dirname(resolve(path)),
    stat = lstatSync(folder);
  if (
    !folder.startsWith(resolve(tmpdir()) + '/') ||
    !basename(folder).startsWith('propel-crew-lab-') ||
    basename(path) !== name ||
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0
  )
    throw Error('Private disposable crew-lab path required');
  const f = lstatSync(path);
  if (
    f.isSymbolicLink() ||
    !f.isFile() ||
    f.nlink !== 1 ||
    (f.mode & 0o077) !== 0
  )
    throw Error('Private exact lab file required');
}
function checkCrew(path: string) {
  privateFile(path, 'custody.sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=5000;');
    if (
      db.prepare('PRAGMA application_id').get()?.application_id !==
        1129466946 ||
      db.prepare('PRAGMA user_version').get()?.user_version !== 11 ||
      JSON.stringify(
        db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
          )
          .all()
          .map((r) => r.name),
      ) !==
        JSON.stringify(['claims', 'lane_revision', 'receipts', 'reservations'])
    )
      throw Error('Exact unchanged C11 lab required');
  } finally {
    db.close();
  }
}
function connect(crewPath: string, path: string, create: boolean) {
  checkCrew(crewPath);
  if (
    dirname(resolve(crewPath)) !== dirname(resolve(path)) ||
    basename(path) !== 'proposal-revisions.sqlite'
  )
    throw Error('Same disposable lab folder required');
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
  privateFile(path, 'proposal-revisions.sqlite');
  const db = new DatabaseSync(path, { readOnly: !create });
  try {
    db.exec('PRAGMA busy_timeout=5000;');
    if (fresh)
      db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA application_id=1129468466; PRAGMA user_version=12;
      CREATE TABLE series(logical_key TEXT PRIMARY KEY,base_signature TEXT NOT NULL,revision INTEGER NOT NULL,state TEXT NOT NULL,expires_at INTEGER NOT NULL,last_clock INTEGER NOT NULL,proposal TEXT NOT NULL,receipt_id TEXT);
      CREATE TABLE attempts(command_id TEXT PRIMARY KEY,logical_key TEXT NOT NULL,attempt_key TEXT NOT NULL UNIQUE,signature TEXT NOT NULL);
      CREATE TABLE receipts(command_id TEXT PRIMARY KEY,body TEXT NOT NULL,sha256 TEXT NOT NULL);`);
    else if (
      db.prepare('PRAGMA application_id').get()?.application_id !==
        1129468466 ||
      db.prepare('PRAGMA user_version').get()?.user_version !== 12 ||
      JSON.stringify(
        db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
          )
          .all()
          .map((r) => r.name),
      ) !== JSON.stringify(['attempts', 'receipts', 'series'])
    )
      throw Error('Exact proposal metadata lab required');
    if (create) {
      db.exec('PRAGMA synchronous=FULL;');
      // BEGIN IMMEDIATE locks both files. No statement writes the attached C11 database.
      db.prepare('ATTACH DATABASE ? AS crew').run(resolve(crewPath));
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
export function prepareScheduleRevisionLab(
  crewPath: string,
  path: string,
  gate: { enabled?: boolean; test_only?: boolean },
) {
  if (!on(gate as ScheduleRevisionAuthority))
    throw Error('Disposable revision lab is OFF');
  const db = connect(crewPath, path, true);
  db.close();
}
const unknown = () => ({
  status: 'UNKNOWN' as const,
  receipt: null,
  effective_state: 'UNKNOWN' as const,
  replay: 'FORBIDDEN' as const,
  replacement: null,
});
function fence(
  crewPath: string,
  command: ScheduleRevisionCommand,
  authority: ScheduleRevisionAuthority,
) {
  authorityFields(authority);
  const initial = pin(command),
    c = initial.value;
  let last = -1;
  return {
    ...initial,
    check() {
      if (!on(authority) || pin(command).signature !== initial.signature)
        throw Error('Live command or gate changed');
      authorityFields(authority);
      const now = authority.clock();
      if (!Number.isSafeInteger(now) || now < 0 || now < last)
        throw Error('Synthetic clock drift');
      last = now;
      if (
        authority.checkSource(c.proposal) !== c.proposal_sha256 ||
        authority.checkSource(c.original.envelope) !== c.original.sha256
      )
        throw Error('Independent exact source witness required');
      const prior = reconcileCrewTransaction(crewPath, c.original, {
        enabled: true,
        test_only: true,
        checkSource: authority.checkSource,
      });
      if (prior.receipt?.status !== 'RESERVED_LAB_ONLY')
        throw Error(
          'C11 permanent hold: exact successful original receipt required',
        );
      return now;
    },
  };
}
function receipt(db: DatabaseSync, c: ReturnType<typeof pin>, now: number) {
  const a = db
      .prepare(
        'SELECT signature FROM attempts WHERE command_id=? AND logical_key=?',
      )
      .get(c.value.command_id, c.key),
    s = db.prepare('SELECT * FROM series WHERE logical_key=?').get(c.key),
    r = db
      .prepare('SELECT body,sha256 FROM receipts WHERE command_id=?')
      .get(c.value.command_id);
  if (
    !a ||
    a.signature !== c.signature ||
    !s ||
    s.base_signature !== c.base ||
    now < Number(s.last_clock) ||
    !r ||
    typeof r.body !== 'string' ||
    hash(r.body) !== r.sha256
  )
    return unknown();
  const raw = fields(JSON.parse(r.body), [
    'receipt_id',
    'command_id',
    'original_command_id',
    'original_sha256',
    'proposal_sha256',
    'organization_id',
    'job_id',
    'visit_id',
    'worker_id',
    'day',
    'action',
    'status',
    'prior_revision',
    'revision',
    'expires_at',
    'canonical_conflict_count',
    'business_write',
    'dispatch',
    'source_atomicity',
  ]);
  const e = c.value.proposal,
    result = raw as unknown as ScheduleRevisionReceipt;
  if (
    result.command_id !== c.value.command_id ||
    result.original_command_id !== c.value.original.command_id ||
    result.original_sha256 !== c.value.original.sha256 ||
    result.proposal_sha256 !== c.value.proposal_sha256 ||
    result.organization_id !== e.organization_id ||
    result.job_id !== e.job_id ||
    result.visit_id !== e.visit_id ||
    result.worker_id !== e.worker_id ||
    result.day !== e.day ||
    result.action !== c.value.action ||
    typeof result.receipt_id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(result.receipt_id) ||
    result.expires_at > c.value.expires_at ||
    result.expires_at < Number(s.expires_at) ||
    result.dispatch !== false ||
    result.business_write !== false ||
    result.source_atomicity !== 'CAPTURED_NOT_ATOMIC' ||
    ![
      'REVISED_LAB_ONLY',
      'CANCELLED_LAB_ONLY',
      'REVOKED_LAB_ONLY',
      'EXPIRED_LAB_ONLY',
      'REJECTED_CAS',
      'REJECTED_CONFLICT',
      'REJECTED_REQUIREMENTS',
    ].includes(result.status) ||
    ![
      result.prior_revision,
      result.revision,
      result.canonical_conflict_count,
    ].every((v) => Number.isSafeInteger(v) && v >= 0) ||
    result.revision !==
      result.prior_revision + (result.status.startsWith('REJECTED_') ? 0 : 1) ||
    result.revision > Number(s.revision)
  )
    return unknown();
  const state = s.state as State;
  if (
    ![
      'OPEN',
      'CANCELLED_LAB_ONLY',
      'REVOKED_LAB_ONLY',
      'EXPIRED_LAB_ONLY',
    ].includes(state)
  )
    return unknown();
  return {
    status: 'EXACT_RECEIPT' as const,
    receipt: Object.freeze(result),
    effective_state:
      state === 'OPEN' && now >= Number(s.expires_at)
        ? ('EXPIRED_LAB_ONLY' as const)
        : state,
    replay: 'FORBIDDEN' as const,
    replacement: null,
  };
}
/** Exact read-only reconciliation never claims, continues, revokes or rewrites metadata. */
export function reconcileScheduleRevision(
  crewPath: string,
  path: string,
  command: ScheduleRevisionCommand,
  authority: ScheduleRevisionAuthority,
) {
  if (!on(authority)) return unknown();
  let db: DatabaseSync | undefined;
  try {
    const f = fence(crewPath, command, authority);
    f.check();
    db = connect(crewPath, path, false);
    const result = receipt(db, f, f.check());
    f.check();
    return result;
  } catch {
    return unknown();
  } finally {
    db?.close();
  }
}
/** Explicit finite test call only. Existing/unknown logical attempts are never replayed. */
export function executeScheduleRevision(
  crewPath: string,
  path: string,
  command: ScheduleRevisionCommand,
  authority: ScheduleRevisionAuthority,
) {
  if (!on(authority)) throw Error('Disposable revision lab is OFF');
  const f = fence(crewPath, command, authority),
    c = f.value,
    e = c.proposal;
  f.check();
  const db = connect(crewPath, path, true);
  let transaction = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    const now = f.check(); // source, staff, caller input and clock rechecked after the real lock wait
    const existing = db
      .prepare(
        'SELECT command_id FROM attempts WHERE command_id=? OR attempt_key=?',
      )
      .get(c.command_id, JSON.stringify([f.key, c.expected_revision]));
    const series = db
      .prepare('SELECT * FROM series WHERE logical_key=?')
      .get(f.key);
    const pending = db
      .prepare(
        'SELECT a.command_id FROM attempts a LEFT JOIN receipts r ON r.command_id=a.command_id WHERE a.logical_key=? AND r.command_id IS NULL',
      )
      .get(f.key);
    if (
      existing ||
      pending ||
      (!series && c.previous_receipt_id !== null) ||
      (series &&
        (series.base_signature !== f.base ||
          series.state !== 'OPEN' ||
          now < Number(series.last_clock) ||
          c.previous_receipt_id !== series.receipt_id))
    ) {
      const result = receipt(db, f, now);
      f.check();
      db.exec('COMMIT');
      transaction = false;
      return result;
    }
    if (!series)
      db.prepare('INSERT INTO series VALUES(?,?,?,?,?,?,?,?)').run(
        f.key,
        f.base,
        0,
        'OPEN',
        c.expires_at,
        now,
        JSON.stringify(c.original.envelope),
        null,
      );
    db.prepare('INSERT INTO attempts VALUES(?,?,?,?)').run(
      c.command_id,
      f.key,
      JSON.stringify([f.key, c.expected_revision]),
      f.signature,
    );
    const claimTime = f.check();
    db.prepare('UPDATE series SET last_clock=? WHERE logical_key=?').run(
      claimTime,
      f.key,
    );
    db.exec('COMMIT');
    transaction = false;
    authority.afterClaim?.();
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    const appliedAt = f.check(),
      s = db.prepare('SELECT * FROM series WHERE logical_key=?').get(f.key)!;
    if (
      s.base_signature !== f.base ||
      s.state !== 'OPEN' ||
      appliedAt < Number(s.last_clock)
    )
      throw Error('Series changed');
    const revision = Number(s.revision),
      deadline = Math.min(Number(s.expires_at), c.expires_at);
    const originalIntervals = db
      .prepare(
        'SELECT command_id,job,visit,start,end FROM crew.reservations WHERE org=? AND worker=? AND day=? AND command_id<>?',
      )
      .all(e.organization_id, e.worker_id, e.day, c.original.command_id);
    const otherSeries = db
      .prepare('SELECT * FROM series WHERE logical_key<>? AND revision>0')
      .all(f.key);
    const revisions = otherSeries
      .filter((r) => r.state === 'OPEN' && Number(r.expires_at) > appliedAt)
      .map((r) => JSON.parse(String(r.proposal)) as CrewAssignmentEnvelope);
    // A revised lab proposal replaces its own original metadata interval, never a business visit.
    const revisedOriginals = new Set(
      otherSeries.map(
        (r) =>
          (JSON.parse(String(r.base_signature)) as CrewLabCommand).command_id,
      ),
    );
    const intervals = originalIntervals
      .filter((r) => !revisedOriginals.has(String(r.command_id)))
      .map((r) => ({
        key: String(r.command_id),
        worker_id: e.worker_id,
        job_id: String(r.job),
        visit_id: String(r.visit),
        start: Number(r.start),
        end: Number(r.end),
      }));
    for (const p of revisions)
      if (
        p.organization_id === e.organization_id &&
        p.worker_id === e.worker_id &&
        p.day === e.day &&
        p.start !== null
      )
        intervals.push({
          key: 'revision-' + p.job_id + p.visit_id,
          worker_id: e.worker_id,
          job_id: p.job_id,
          visit_id: p.visit_id,
          start: p.start,
          end: p.end!,
        });
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
    const conflictCount =
      e.canonical_conflict_count + (capacity?.overlaps.length ?? 0);
    const status: ScheduleRevisionReceipt['status'] =
      appliedAt >= Number(s.expires_at) || appliedAt >= c.expires_at
        ? 'EXPIRED_LAB_ONLY'
        : revision !== c.expected_revision
          ? 'REJECTED_CAS'
          : c.action === 'CANCEL'
            ? 'CANCELLED_LAB_ONLY'
            : c.action === 'REVOKE'
              ? 'REVOKED_LAB_ONLY'
              : e.start === null ||
                  e.hours_start === null ||
                  e.canonical_capacity_state !== 'WITHIN_PROPOSED_HOURS' ||
                  capacity?.workers[0].capacity_state !==
                    'WITHIN_PROPOSED_HOURS'
                ? 'REJECTED_REQUIREMENTS'
                : conflictCount > 0
                  ? 'REJECTED_CONFLICT'
                  : 'REVISED_LAB_ONLY';
    const next = revision + (status.startsWith('REJECTED_') ? 0 : 1);
    const body: ScheduleRevisionReceipt = {
      receipt_id: randomUUID(),
      command_id: c.command_id,
      original_command_id: c.original.command_id,
      original_sha256: c.original.sha256,
      proposal_sha256: c.proposal_sha256,
      organization_id: e.organization_id,
      job_id: e.job_id,
      visit_id: e.visit_id,
      worker_id: e.worker_id,
      day: e.day,
      action: c.action,
      status,
      prior_revision: revision,
      revision: next,
      expires_at: deadline,
      canonical_conflict_count: conflictCount,
      business_write: false,
      dispatch: false,
      source_atomicity: 'CAPTURED_NOT_ATOMIC',
    };
    db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(
      c.command_id,
      JSON.stringify(body),
      hash(JSON.stringify(body)),
    );
    const state: State =
      status === 'CANCELLED_LAB_ONLY' ||
      status === 'REVOKED_LAB_ONLY' ||
      status === 'EXPIRED_LAB_ONLY'
        ? status
        : 'OPEN';
    authority.beforeCommit?.();
    const finalTime = f.check();
    if (
      finalTime < appliedAt ||
      (status !== 'EXPIRED_LAB_ONLY' && finalTime >= deadline)
    )
      throw Error('Clock crossed expiration before commit');
    db.prepare(
      'UPDATE series SET revision=?,state=?,expires_at=?,last_clock=?,proposal=?,receipt_id=? WHERE logical_key=?',
    ).run(
      next,
      state,
      deadline,
      finalTime,
      status === 'REVISED_LAB_ONLY' ? JSON.stringify(e) : String(s.proposal),
      body.receipt_id,
      f.key,
    );
    db.exec('COMMIT');
    transaction = false;
    authority.afterCommit?.();
    return receipt(db, f, f.check());
  } catch {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Permanent claim remains UNKNOWN. */
      }
    return unknown();
  } finally {
    db.close();
  }
}
