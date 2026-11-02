/** Hypothetical atomic consent authority TEST ONLY. No dispatch callback, outbox,
 * recipient resolver, message body, provider transport or operational adapter. */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, constants } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { AtomicConsentEnvelope } from '../../src/lib/workflows/atomic-consent-lab.ts';
export interface SyntheticConsentFacts {
  mode: 'TRUSTED_SYNTHETIC_FIXTURE';
  schema_revision: 1;
  organization_id: string;
  actor_id: string;
  customer_id: string;
  property_id: string;
  job_id: string;
  source_sha256: string;
  source_revision: number;
  purpose: AtomicConsentEnvelope['purpose'];
  channel: AtomicConsentEnvelope['channel'];
  recipient_reference: string;
  sender_reference: string;
  purpose_allowed: boolean | null;
  recipient_verified: boolean | null;
  enrollment_active: boolean | null;
  suppressed: boolean | null;
  sender_authorized: boolean | null;
  principal_active: boolean | null;
  source_revoked: boolean | null;
  observed_at: string;
  valid_from: string;
  expires_at: string;
}
export interface AtomicConsentCommand {
  command_id: string;
  expected_revision: number;
  envelope: AtomicConsentEnvelope;
  sha256: string;
  expected_at: string;
  max_age_ms: number;
}
export interface AtomicConsentAuthority {
  enabled?: boolean;
  test_only?: boolean;
  checkSource: (envelope: AtomicConsentEnvelope) => string;
  clock: () => string;
  afterClaim?: () => void;
  atBoundary?: () => void;
  afterCommit?: () => void;
}
export interface AtomicConsentReceipt {
  command_id: string;
  source_binding_sha256: string;
  organization_id: string;
  customer_id: string;
  property_id: string;
  job_id: string;
  fixture_revision: number;
  linearization_sequence: number;
  checked_at: string;
  boundary: 'WOULD_MEET_SYNTHETIC_REQUIREMENTS' | 'DENIED';
  denials: string[];
  fixture_only: true;
  send: false;
  provider: false;
  outbox: false;
  global_source_auth_atomicity: 'UNVERIFIED';
}
function exact(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Plain synthetic facts required');
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
    throw Error('Exact own-data facts required');
  return Object.fromEntries(keys.map((k) => [k, ds[k].value]));
}
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function timestamp(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw Error('Exact UTC timestamp required');
  return Date.parse(value);
}
const envkeys = [
  'mode',
  'organization_id',
  'actor_id',
  'customer_id',
  'property_id',
  'job_id',
  'issued_version_id',
  'candidate_key',
  'plan_id',
  'source_revision',
  'source_sha256',
  'blocked_review_sha256',
  'purpose',
  'channel',
  'proposed_on',
  'operational_authority',
];
function envelope(value: unknown) {
  const e = exact(value, envkeys);
  if (
    e.mode !== 'LOCAL_ATOMIC_CONSENT_REQUIREMENTS_SOURCE' ||
    e.operational_authority !== 'BLOCKED' ||
    !Number.isSafeInteger(e.source_revision) ||
    Number(e.source_revision) < 1 ||
    !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
      e.purpose as string,
    ) ||
    !['email', 'sms'].includes(e.channel as string)
  )
    throw Error('Exact blocked source required');
  for (const k of [
    'organization_id',
    'actor_id',
    'customer_id',
    'property_id',
    'job_id',
    'issued_version_id',
    'candidate_key',
    'plan_id',
  ])
    if (
      typeof e[k] !== 'string' ||
      !(e[k] as string).trim() ||
      (e[k] as string).length > 2000
    )
      throw Error('Primitive source identity required');
  for (const k of ['source_sha256', 'blocked_review_sha256'])
    if (typeof e[k] !== 'string' || !/^[a-f0-9]{64}$/.test(e[k] as string))
      throw Error('Exact source hash required');
  if (
    typeof e.proposed_on !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(e.proposed_on)
  )
    throw Error('Exact proposal day required');
  return Object.freeze(e) as unknown as AtomicConsentEnvelope;
}
function pin(command: AtomicConsentCommand) {
  const f = exact(command, [
    'command_id',
    'expected_revision',
    'envelope',
    'sha256',
    'expected_at',
    'max_age_ms',
  ]);
  if (
    typeof f.command_id !== 'string' ||
    !/^lab-[a-zA-Z0-9-]{1,100}$/.test(f.command_id) ||
    !Number.isSafeInteger(f.expected_revision) ||
    Number(f.expected_revision) < 0 ||
    !Number.isSafeInteger(f.max_age_ms) ||
    Number(f.max_age_ms) < 1 ||
    Number(f.max_age_ms) > 60_000
  )
    throw Error('Exact bounded command required');
  timestamp(f.expected_at);
  const e = envelope(f.envelope);
  if (hash(e) !== f.sha256)
    throw Error('Exact blocked source binding required');
  const value = {
    command_id: f.command_id,
    expected_revision: Number(f.expected_revision),
    envelope: e,
    sha256: f.sha256 as string,
    expected_at: f.expected_at as string,
    max_age_ms: Number(f.max_age_ms),
  };
  return { value, signature: JSON.stringify(value) };
}
const factkeys = [
  'mode',
  'schema_revision',
  'organization_id',
  'actor_id',
  'customer_id',
  'property_id',
  'job_id',
  'source_sha256',
  'source_revision',
  'purpose',
  'channel',
  'recipient_reference',
  'sender_reference',
  'purpose_allowed',
  'recipient_verified',
  'enrollment_active',
  'suppressed',
  'sender_authorized',
  'principal_active',
  'source_revoked',
  'observed_at',
  'valid_from',
  'expires_at',
];
function facts(value: SyntheticConsentFacts) {
  const f = exact(value, factkeys);
  if (f.mode !== 'TRUSTED_SYNTHETIC_FIXTURE' || f.schema_revision !== 1)
    throw Error('Explicit current synthetic fixture schema required');
  for (const k of [
    'organization_id',
    'actor_id',
    'customer_id',
    'property_id',
    'job_id',
    'purpose',
    'channel',
    'source_sha256',
    'recipient_reference',
    'sender_reference',
  ])
    if (
      typeof f[k] !== 'string' ||
      !(f[k] as string).trim() ||
      (f[k] as string).length > 2000
    )
      throw Error('Primitive fixture reference required');
  if (
    !Number.isSafeInteger(f.source_revision) ||
    Number(f.source_revision) < 1 ||
    !/^[a-f0-9]{64}$/.test(f.source_sha256 as string) ||
    !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
      f.purpose as string,
    ) ||
    !['email', 'sms'].includes(f.channel as string) ||
    !String(f.recipient_reference).startsWith('synthetic-recipient:') ||
    !String(f.sender_reference).startsWith('synthetic-sender:')
  )
    throw Error('Explicit synthetic source/recipient/sender required');
  for (const k of [
    'purpose_allowed',
    'recipient_verified',
    'enrollment_active',
    'suppressed',
    'sender_authorized',
    'principal_active',
    'source_revoked',
  ])
    if (![true, false, null].includes(f[k] as boolean | null))
      throw Error('Boolean or UNKNOWN fixture state required');
  timestamp(f.observed_at);
  const start = timestamp(f.valid_from),
    end = timestamp(f.expires_at);
  if (end <= start) throw Error('Bounded authority interval required');
  return Object.freeze(f) as unknown as SyntheticConsentFacts;
}
function open(path: string, create: boolean) {
  const folder = dirname(resolve(path));
  const st = lstatSync(folder);
  if (
    !folder.startsWith(resolve(tmpdir()) + '/') ||
    !basename(folder).startsWith('propel-consent-lab-') ||
    basename(path) !== 'authority.sqlite' ||
    st.isSymbolicLink() ||
    !st.isDirectory() ||
    (st.mode & 0o077) !== 0
  )
    throw Error('Private disposable consent lab required');
  let fresh = false;
  if (create)
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
  const fs = lstatSync(path);
  if (
    fs.isSymbolicLink() ||
    !fs.isFile() ||
    fs.nlink !== 1 ||
    (fs.mode & 0o077) !== 0
  )
    throw Error('Private consent fixture file required');
  if (!fresh) {
    const probe = new DatabaseSync(path, { readOnly: true });
    try {
      probe.exec('PRAGMA busy_timeout=5000;');
      if (
        probe.prepare('PRAGMA application_id').get()?.application_id !==
          1129270338 ||
        probe.prepare('PRAGMA user_version').get()?.user_version !== 11
      )
        throw Error('Unrecognized consent lab');
      const names = probe
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
        )
        .all()
        .map((r) => r.name);
      if (
        JSON.stringify(names) !==
        JSON.stringify([
          'authority',
          'claims',
          'events',
          'receipts',
          'sqlite_sequence',
        ])
      )
        throw Error('Unexpected consent lab schema');
    } finally {
      probe.close();
    }
  }
  const db = new DatabaseSync(path, { readOnly: !create });
  db.exec('PRAGMA busy_timeout=5000;');
  if (fresh)
    db.exec(
      `PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA application_id=1129270338;PRAGMA user_version=11;CREATE TABLE authority(subject TEXT PRIMARY KEY,revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE claims(command_id TEXT PRIMARY KEY,subject TEXT NOT NULL UNIQUE,signature TEXT NOT NULL);CREATE TABLE receipts(command_id TEXT PRIMARY KEY,body TEXT NOT NULL,sha256 TEXT NOT NULL);CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,subject TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,command_id TEXT);`,
    );
  else if (create) db.exec('PRAGMA synchronous=FULL;');
  return db;
}
const subject = (e: AtomicConsentEnvelope) =>
  JSON.stringify([
    e.organization_id,
    e.customer_id,
    e.property_id,
    e.candidate_key,
  ]);
function enabled(a: Pick<AtomicConsentAuthority, 'enabled' | 'test_only'>) {
  if (a.enabled !== true || a.test_only !== true)
    throw Error('Synthetic atomic lab is OFF');
}
function bound(f: SyntheticConsentFacts, e: AtomicConsentEnvelope) {
  return (
    [
      'organization_id',
      'actor_id',
      'customer_id',
      'property_id',
      'job_id',
      'source_sha256',
      'source_revision',
      'purpose',
      'channel',
    ].every(
      (k) =>
        f[k as keyof SyntheticConsentFacts] ===
        e[k as keyof AtomicConsentEnvelope],
    ) &&
    f.recipient_reference === 'synthetic-recipient:' + e.customer_id &&
    f.sender_reference === 'synthetic-sender:' + e.organization_id
  );
}
/** Explicit fixture setup, not a canonical consent writer. Initial authority is never inferred. */
export function installSyntheticConsent(
  path: string,
  e: AtomicConsentEnvelope,
  input: SyntheticConsentFacts,
  a: AtomicConsentAuthority,
) {
  enabled(a);
  const source = envelope(e),
    f = facts(input);
  if (!bound(f, source) || a.checkSource(source) !== hash(source))
    throw Error('Exact fixture source required');
  const db = open(path, true);
  try {
    db.exec('BEGIN IMMEDIATE');
    enabled(a);
    if (a.checkSource(source) !== hash(source))
      throw Error('Source changed after fixture lock wait');
    db.prepare('INSERT INTO authority VALUES(?,?,?)').run(
      subject(source),
      0,
      JSON.stringify(f),
    );
    db.prepare(
      'INSERT INTO events(subject,kind,revision,command_id) VALUES(?,?,?,NULL)',
    ).run(subject(source), 'FIXTURE_INSTALLED', 0);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* No replay. */
    }
    throw error;
  } finally {
    db.close();
  }
}
/** Participating fixture withdrawals serialize with boundary checks in this same DB. */
export function changeSyntheticConsent(
  path: string,
  e: AtomicConsentEnvelope,
  expectedRevision: number,
  input: SyntheticConsentFacts,
  a: AtomicConsentAuthority,
) {
  enabled(a);
  const source = envelope(e),
    f = facts(input);
  if (
    !bound(f, source) ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    a.checkSource(source) !== hash(source)
  )
    throw Error('Exact fixture update required');
  const db = open(path, true);
  try {
    db.exec('BEGIN IMMEDIATE');
    enabled(a);
    if (a.checkSource(source) !== hash(source))
      throw Error('Source changed after withdrawal lock wait');
    const row = db
      .prepare('SELECT revision FROM authority WHERE subject=?')
      .get(subject(source));
    if (!row || row.revision !== expectedRevision)
      throw Error('Stale fixture CAS');
    const revision = expectedRevision + 1;
    db.prepare('UPDATE authority SET revision=?,body=? WHERE subject=?').run(
      revision,
      JSON.stringify(f),
      subject(source),
    );
    const event = db
      .prepare(
        'INSERT INTO events(subject,kind,revision,command_id) VALUES(?,?,?,NULL)',
      )
      .run(subject(source), 'FIXTURE_CHANGED', revision);
    db.exec('COMMIT');
    return {
      revision,
      linearization_sequence: Number(event.lastInsertRowid),
      operational_send: false,
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* Caller may not infer outcome. */
    }
    throw error;
  } finally {
    db.close();
  }
}
const unknown = () => ({
  status: 'UNKNOWN' as const,
  receipt: null,
  replay: 'FORBIDDEN' as const,
  replacement: null,
  send: false as const,
});
function receipt(db: DatabaseSync, c: AtomicConsentCommand) {
  const claim = db
    .prepare('SELECT signature FROM claims WHERE command_id=? AND subject=?')
    .get(c.command_id, subject(c.envelope));
  if (!claim || claim.signature !== JSON.stringify(c)) return unknown();
  const row = db
    .prepare('SELECT body,sha256 FROM receipts WHERE command_id=?')
    .get(c.command_id);
  if (
    !row ||
    typeof row.body !== 'string' ||
    hash(JSON.parse(row.body)) !== row.sha256
  )
    return unknown();
  const r = exact(JSON.parse(row.body), [
    'command_id',
    'source_binding_sha256',
    'organization_id',
    'customer_id',
    'property_id',
    'job_id',
    'fixture_revision',
    'linearization_sequence',
    'checked_at',
    'boundary',
    'denials',
    'fixture_only',
    'send',
    'provider',
    'outbox',
    'global_source_auth_atomicity',
  ]) as unknown as AtomicConsentReceipt;
  if (
    r.command_id !== c.command_id ||
    r.source_binding_sha256 !== c.sha256 ||
    r.organization_id !== c.envelope.organization_id ||
    r.customer_id !== c.envelope.customer_id ||
    r.property_id !== c.envelope.property_id ||
    r.job_id !== c.envelope.job_id ||
    r.send !== false ||
    r.provider !== false ||
    r.outbox !== false ||
    r.fixture_only !== true ||
    r.global_source_auth_atomicity !== 'UNVERIFIED' ||
    !['DENIED', 'WOULD_MEET_SYNTHETIC_REQUIREMENTS'].includes(r.boundary) ||
    !Number.isSafeInteger(r.fixture_revision) ||
    !Number.isSafeInteger(r.linearization_sequence) ||
    !Array.isArray(r.denials) ||
    r.denials.some((x) => typeof x !== 'string') ||
    (r.boundary === 'WOULD_MEET_SYNTHETIC_REQUIREMENTS') !==
      (r.denials.length === 0)
  )
    return unknown();
  timestamp(r.checked_at);
  return {
    status: 'EXACT_RECEIPT' as const,
    receipt: Object.freeze({ ...r, denials: Object.freeze(r.denials) }),
    currentness:
      db
        .prepare('SELECT revision FROM authority WHERE subject=?')
        .get(subject(c.envelope))?.revision === r.fixture_revision
        ? ('MATCHES_FIXTURE_REVISION' as const)
        : ('STALE_FIXTURE_REVISION' as const),
    replay: 'FORBIDDEN' as const,
    replacement: null,
    send: false as const,
  };
}
export function reconcileAtomicBoundary(
  path: string,
  command: AtomicConsentCommand,
  a: AtomicConsentAuthority,
) {
  let db: DatabaseSync | undefined;
  try {
    enabled(a);
    const c = pin(command).value;
    if (a.checkSource(c.envelope) !== c.sha256) throw Error('Source UNKNOWN');
    db = open(path, false);
    const r = receipt(db, c);
    if (
      a.checkSource(c.envelope) !== c.sha256 ||
      pin(command).signature !== JSON.stringify(c)
    )
      return unknown();
    return r;
  } catch {
    return unknown();
  } finally {
    db?.close();
  }
}
/** One hypothetical check, never an executable messaging capability. */
export function evaluateAtomicBoundary(
  path: string,
  command: AtomicConsentCommand,
  a: AtomicConsentAuthority,
) {
  enabled(a);
  const p = pin(command),
    c = p.value,
    e = c.envelope;
  const check = () => {
    enabled(a);
    if (pin(command).signature !== p.signature || a.checkSource(e) !== c.sha256)
      throw Error('Original command/principal/source changed');
  };
  check();
  const db = open(path, true);
  let transaction = false;
  try {
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    check();
    const prior = db
      .prepare('SELECT command_id FROM claims WHERE command_id=? OR subject=?')
      .get(c.command_id, subject(e));
    if (prior) {
      db.exec('COMMIT');
      transaction = false;
      return receipt(db, c);
    }
    db.prepare('INSERT INTO claims VALUES(?,?,?)').run(
      c.command_id,
      subject(e),
      p.signature,
    );
    db.exec('COMMIT');
    transaction = false;
    a.afterClaim?.();
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    check();
    a.atBoundary?.();
    check();
    const now = a.clock();
    const time = timestamp(now),
      expected = timestamp(c.expected_at);
    const row = db
      .prepare('SELECT revision,body FROM authority WHERE subject=?')
      .get(subject(e));
    const denials: string[] = [];
    const revision = Number(row?.revision ?? -1);
    if (!row) denials.push('MISSING_FIXTURE');
    if (revision !== c.expected_revision) denials.push('STALE_REVISION');
    if (time < expected || time - expected > c.max_age_ms)
      denials.push('CLOCK_OR_COMMAND_AGE');
    if (row) {
      const f = facts(JSON.parse(String(row.body)));
      if (!bound(f, e))
        denials.push('SOURCE_PURPOSE_RECIPIENT_OR_SENDER_MISMATCH');
      if (f.purpose_allowed !== true) denials.push('PURPOSE');
      if (f.recipient_verified !== true) denials.push('RECIPIENT');
      if (f.enrollment_active !== true) denials.push('ENROLLMENT');
      if (f.suppressed !== false) denials.push('SUPPRESSION');
      if (f.sender_authorized !== true) denials.push('SENDER');
      if (f.principal_active !== true) denials.push('PRINCIPAL');
      if (f.source_revoked !== false) denials.push('SOURCE_REVOKED');
      if (
        timestamp(f.valid_from) > time ||
        timestamp(f.expires_at) <= time ||
        timestamp(f.observed_at) > time ||
        time - timestamp(f.observed_at) > c.max_age_ms
      )
        denials.push('AUTHORITY_TIME');
    }
    const event = db
      .prepare(
        'INSERT INTO events(subject,kind,revision,command_id) VALUES(?,?,?,?)',
      )
      .run(subject(e), 'BOUNDARY_CHECKED', revision, c.command_id);
    const r: AtomicConsentReceipt = {
      command_id: c.command_id,
      source_binding_sha256: c.sha256,
      organization_id: e.organization_id,
      customer_id: e.customer_id,
      property_id: e.property_id,
      job_id: e.job_id,
      fixture_revision: revision,
      linearization_sequence: Number(event.lastInsertRowid),
      checked_at: now,
      boundary: denials.length ? 'DENIED' : 'WOULD_MEET_SYNTHETIC_REQUIREMENTS',
      denials,
      fixture_only: true,
      send: false,
      provider: false,
      outbox: false,
      global_source_auth_atomicity: 'UNVERIFIED',
    };
    db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(
      c.command_id,
      JSON.stringify(r),
      hash(r),
    );
    check();
    if (a.clock() !== now) throw Error('Clock changed before boundary commit');
    db.exec('COMMIT');
    transaction = false;
    a.afterCommit?.();
    check();
    return receipt(db, c);
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
