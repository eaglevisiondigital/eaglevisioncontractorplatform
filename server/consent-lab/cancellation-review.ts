/** Node24 disposable participating fixture/custody only. No outbound callback or adapter. */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, openSync, closeSync, constants } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  installSyntheticConsent,
  changeSyntheticConsent,
  evaluateAtomicBoundary,
  reconcileAtomicBoundary,
  type AtomicConsentCommand,
  type SyntheticConsentFacts,
  type AtomicConsentReceipt,
} from './atomic-boundary.ts';
import type { AtomicConsentEnvelope } from '../../src/lib/workflows/atomic-consent-lab.ts';

export interface CancellationLabCommand {
  command_id: string;
  original: AtomicConsentCommand;
  operation: 'CHECK' | 'CANCEL' | 'REVOKE' | 'SUPPRESS';
  expected_fixture_revision: number;
  recipient_reference: string;
  sender_reference: string;
  expected_at: string;
  max_age_ms: number;
  original_receipt_id: string | null;
}
export interface CancellationLabAuthority {
  enabled?: boolean;
  test_only?: boolean;
  checkSource: (envelope: AtomicConsentEnvelope) => string;
  clock: () => string;
  afterClaim?: () => void;
  atBoundary?: () => void;
  afterLegacyCommit?: () => void;
  beforeCommit?: () => void;
  afterCommit?: () => void;
}
export interface CancellationLabReceipt {
  receipt_id: string;
  command_id: string;
  operation: CancellationLabCommand['operation'];
  source_binding_sha256: string;
  organization_id: string;
  customer_id: string;
  property_id: string;
  job_id: string;
  recorded_at: string;
  fixture_revision: number;
  linearization_sequence: number;
  original_receipt: AtomicConsentReceipt | null;
  cancellation: 'CANCELLED' | 'REVOKED' | 'SUPPRESSED' | null;
  fixture_only: true;
  send: false;
  provider: false;
  outbox: false;
  source_auth_atomicity: 'UNVERIFIED';
}
const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fields(value: unknown, required: string[], optional: string[] = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw Error('Plain exact custody data required');
  const ds = Object.getOwnPropertyDescriptors(value),
    own = Reflect.ownKeys(value);
  if (
    required.some((k) => !Object.hasOwn(ds[k] ?? {}, 'value')) ||
    own.some(
      (k) =>
        typeof k !== 'string' ||
        ![...required, ...optional].includes(k) ||
        !Object.hasOwn(ds[k], 'value'),
    )
  )
    throw Error('Exact own-data custody fields required');
  return Object.fromEntries((own as string[]).map((k) => [k, ds[k].value]));
}
function time(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw Error('Exact UTC clock required');
  return Date.parse(value);
}
const envelopeKeys = [
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
function pin(command: CancellationLabCommand) {
  const f = fields(command, [
    'command_id',
    'original',
    'operation',
    'expected_fixture_revision',
    'recipient_reference',
    'sender_reference',
    'expected_at',
    'max_age_ms',
    'original_receipt_id',
  ]);
  const b = fields(f.original, [
    'command_id',
    'expected_revision',
    'envelope',
    'sha256',
    'expected_at',
    'max_age_ms',
  ]);
  const raw = fields(b.envelope, envelopeKeys),
    e = Object.fromEntries(envelopeKeys.map((k) => [k, raw[k]]));
  for (const id of [f.command_id, b.command_id])
    if (typeof id !== 'string' || !/^lab-[a-zA-Z0-9-]{1,100}$/.test(id))
      throw Error('Finite exact lab command required');
  for (const n of [f.expected_fixture_revision, b.expected_revision])
    if (!Number.isSafeInteger(n) || Number(n) < 0)
      throw Error('Exact fixture CAS required');
  for (const n of [f.max_age_ms, b.max_age_ms])
    if (!Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > 60_000)
      throw Error('Bounded command age required');
  time(f.expected_at);
  time(b.expected_at);
  if (
    !['CHECK', 'CANCEL', 'REVOKE', 'SUPPRESS'].includes(
      f.operation as string,
    ) ||
    e.mode !== 'LOCAL_ATOMIC_CONSENT_REQUIREMENTS_SOURCE' ||
    e.operational_authority !== 'BLOCKED' ||
    !Number.isSafeInteger(e.source_revision) ||
    Number(e.source_revision) < 1 ||
    !['service_follow_up', 'recurring_maintenance', 'marketing'].includes(
      e.purpose as string,
    ) ||
    !['email', 'sms'].includes(e.channel as string)
  )
    throw Error('Blocked original source required');
  for (const k of envelopeKeys.filter((k) => k !== 'source_revision'))
    if (
      typeof e[k] !== 'string' ||
      !(e[k] as string).trim() ||
      (e[k] as string).length > 2000
    )
      throw Error('Primitive blocked source fields required');
  for (const k of ['source_sha256', 'blocked_review_sha256'])
    if (!/^[a-f0-9]{64}$/.test(e[k] as string))
      throw Error('Source digest required');
  if (
    sha(e) !== b.sha256 ||
    f.recipient_reference !== 'synthetic-recipient:' + e.customer_id ||
    f.sender_reference !== 'synthetic-sender:' + e.organization_id
  )
    throw Error('Exact source/opaque recipient/sender binding required');
  if (
    f.original_receipt_id !== null &&
    (typeof f.original_receipt_id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(f.original_receipt_id))
  )
    throw Error('Exact original receipt ID required');
  if (f.operation === 'CHECK' && f.original_receipt_id !== null)
    throw Error('No replacement check allowed');
  if (
    f.operation === 'CHECK' &&
    f.expected_fixture_revision !== b.expected_revision
  )
    throw Error('Exact original fixture revision required');
  const original: AtomicConsentCommand = {
    command_id: b.command_id as string,
    expected_revision: Number(b.expected_revision),
    envelope: Object.freeze(e) as unknown as AtomicConsentEnvelope,
    sha256: b.sha256 as string,
    expected_at: b.expected_at as string,
    max_age_ms: Number(b.max_age_ms),
  };
  const value: CancellationLabCommand = {
    command_id: f.command_id as string,
    original,
    operation: f.operation as CancellationLabCommand['operation'],
    expected_fixture_revision: Number(f.expected_fixture_revision),
    recipient_reference: f.recipient_reference as string,
    sender_reference: f.sender_reference as string,
    expected_at: f.expected_at as string,
    max_age_ms: Number(f.max_age_ms),
    original_receipt_id: f.original_receipt_id as string | null,
  };
  const subject = JSON.stringify([
    e.organization_id,
    e.customer_id,
    e.property_id,
    e.candidate_key,
  ]);
  return {
    value,
    signature: JSON.stringify(value),
    base: JSON.stringify(original),
    subject,
    logical: JSON.stringify([
      subject,
      value.operation === 'CHECK' ? 'CHECK' : 'WITHDRAWAL',
    ]),
  };
}
function on(a: Pick<CancellationLabAuthority, 'enabled' | 'test_only'>) {
  return (
    Object.getOwnPropertyDescriptor(a, 'enabled')?.value === true &&
    Object.getOwnPropertyDescriptor(a, 'test_only')?.value === true
  );
}
function callbacks(a: CancellationLabAuthority) {
  const f = fields(
    a,
    ['enabled', 'test_only', 'checkSource', 'clock'],
    [
      'afterClaim',
      'atBoundary',
      'afterLegacyCommit',
      'beforeCommit',
      'afterCommit',
    ],
  );
  if (
    ['checkSource', 'clock'].some((k) => typeof f[k] !== 'function') ||
    [
      'afterClaim',
      'atBoundary',
      'afterLegacyCommit',
      'beforeCommit',
      'afterCommit',
    ].some((k) => f[k] !== undefined && typeof f[k] !== 'function')
  )
    throw Error('Trusted synthetic callbacks required');
}
function privatePath(path: string, name: string) {
  const folder = dirname(resolve(path)),
    st = lstatSync(folder);
  if (
    !folder.startsWith(resolve(tmpdir()) + '/') ||
    !basename(folder).startsWith('propel-consent-lab-') ||
    basename(path) !== name ||
    st.isSymbolicLink() ||
    !st.isDirectory() ||
    (st.mode & 0o077) !== 0
  )
    throw Error('Private disposable consent path required');
  const f = lstatSync(path);
  if (
    f.isSymbolicLink() ||
    !f.isFile() ||
    f.nlink !== 1 ||
    (f.mode & 0o077) !== 0
  )
    throw Error('Private regular custody file required');
}
function legacy(path: string) {
  privatePath(path, 'authority.sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=5000;');
    if (
      db.prepare('PRAGMA application_id').get()?.application_id !==
        1129270338 ||
      db.prepare('PRAGMA user_version').get()?.user_version !== 11 ||
      JSON.stringify(
        db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
          )
          .all()
          .map((r) => r.name),
      ) !==
        JSON.stringify([
          'authority',
          'claims',
          'events',
          'receipts',
          'sqlite_sequence',
        ])
    )
      throw Error('Exact unchanged C11 consent lab required');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function open(legacyPath: string, path: string, create: boolean) {
  legacy(legacyPath).close();
  if (
    dirname(resolve(legacyPath)) !== dirname(resolve(path)) ||
    basename(path) !== 'cancellation.sqlite'
  )
    throw Error('Same disposable lab folder required');
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
  privatePath(path, 'cancellation.sqlite');
  const db = new DatabaseSync(path, { readOnly: !create });
  try {
    db.exec('PRAGMA busy_timeout=5000;');
    if (fresh)
      db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA application_id=1129271602;PRAGMA user_version=12;
      CREATE TABLE custody(subject TEXT PRIMARY KEY,base_signature TEXT NOT NULL,last_clock INTEGER NOT NULL);
      CREATE TABLE claims(command_id TEXT PRIMARY KEY,logical_key TEXT NOT NULL UNIQUE,subject TEXT NOT NULL,signature TEXT NOT NULL);
      CREATE TABLE receipts(command_id TEXT PRIMARY KEY,body TEXT NOT NULL,sha256 TEXT NOT NULL);`);
    else if (
      db.prepare('PRAGMA application_id').get()?.application_id !==
        1129271602 ||
      db.prepare('PRAGMA user_version').get()?.user_version !== 12 ||
      JSON.stringify(
        db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
          )
          .all()
          .map((r) => r.name),
      ) !== JSON.stringify(['claims', 'custody', 'receipts'])
    )
      throw Error('Exact cancellation custody lab required');
    if (create) db.exec('PRAGMA synchronous=FULL;');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
export function prepareCancellationReviewLab(
  legacyPath: string,
  path: string,
  gate: Pick<CancellationLabAuthority, 'enabled' | 'test_only'>,
) {
  if (!on(gate)) throw Error('Cancellation lab is OFF');
  open(legacyPath, path, true).close();
}
/** Explicit fixture provision only; never inferred from actual browser consent records. */
export function installConsentCancellationFixture(
  legacyPath: string,
  path: string,
  command: CancellationLabCommand,
  facts: SyntheticConsentFacts,
  a: CancellationLabAuthority,
) {
  if (!on(a)) throw Error('Cancellation lab is OFF');
  const c = pin(command).value;
  callbacks(a);
  installSyntheticConsent(legacyPath, c.original.envelope, facts, a);
  prepareCancellationReviewLab(legacyPath, path, a);
}
function fence(command: CancellationLabCommand, a: CancellationLabAuthority) {
  callbacks(a);
  const p = pin(command);
  let previous = -1;
  return {
    ...p,
    check(withdrawal = false) {
      if (!on(a) || pin(command).signature !== p.signature)
        throw Error('Live gate or command changed');
      callbacks(a);
      const now = a.clock(),
        epoch = time(now);
      if (
        epoch < previous ||
        a.checkSource(p.value.original.envelope) !== p.value.original.sha256
      )
        throw Error('Current staff/source/clock witness changed');
      previous = epoch;
      if (
        withdrawal &&
        (epoch < time(p.value.expected_at) ||
          epoch - time(p.value.expected_at) > p.value.max_age_ms)
      )
        throw Error('Withdrawal expired');
      return { now, epoch };
    },
  };
}
function snapshot(legacyPath: string, p: ReturnType<typeof pin>) {
  const db = legacy(legacyPath);
  try {
    const row = db
      .prepare('SELECT revision,body FROM authority WHERE subject=?')
      .get(p.subject);
    if (!row) throw Error('Exact installed fixture required');
    const f = JSON.parse(String(row.body)) as SyntheticConsentFacts,
      e = p.value.original.envelope;
    if (
      f.mode !== 'TRUSTED_SYNTHETIC_FIXTURE' ||
      f.schema_revision !== 1 ||
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
      ].some(
        (k) =>
          f[k as keyof SyntheticConsentFacts] !==
          e[k as keyof AtomicConsentEnvelope],
      ) ||
      f.recipient_reference !== p.value.recipient_reference ||
      f.sender_reference !== p.value.sender_reference
    )
      throw Error('Fixture subject/purpose/recipient/sender drift');
    return {
      facts: f,
      revision: Number(row.revision),
      claim: db
        .prepare('SELECT command_id FROM claims WHERE subject=?')
        .get(p.subject),
      sequence: Number(
        db
          .prepare('SELECT max(seq) AS n FROM events WHERE subject=?')
          .get(p.subject)?.n ?? 0,
      ),
    };
  } finally {
    db.close();
  }
}
const unknown = () => ({
  status: 'UNKNOWN' as const,
  receipt: null,
  current_cancellation: 'UNKNOWN' as string,
  original_receipt: null,
  replay: 'FORBIDDEN' as const,
  replacement: null,
  send: false as const,
  provider: false as const,
  outbox: false as const,
});
function exactReceipt(db: DatabaseSync, p: ReturnType<typeof pin>) {
  const claim = db
      .prepare(
        'SELECT signature FROM claims WHERE command_id=? AND logical_key=?',
      )
      .get(p.value.command_id, p.logical),
    row = db
      .prepare('SELECT body,sha256 FROM receipts WHERE command_id=?')
      .get(p.value.command_id);
  if (
    !claim ||
    claim.signature !== p.signature ||
    !row ||
    typeof row.body !== 'string'
  )
    return null;
  const raw = JSON.parse(row.body);
  if (sha(raw) !== row.sha256) return null;
  const r = fields(raw, [
      'receipt_id',
      'command_id',
      'operation',
      'source_binding_sha256',
      'organization_id',
      'customer_id',
      'property_id',
      'job_id',
      'recorded_at',
      'fixture_revision',
      'linearization_sequence',
      'original_receipt',
      'cancellation',
      'fixture_only',
      'send',
      'provider',
      'outbox',
      'source_auth_atomicity',
    ]) as unknown as CancellationLabReceipt,
    e = p.value.original.envelope;
  if (
    typeof r.receipt_id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(r.receipt_id) ||
    r.command_id !== p.value.command_id ||
    r.operation !== p.value.operation ||
    r.source_binding_sha256 !== p.value.original.sha256 ||
    r.organization_id !== e.organization_id ||
    r.customer_id !== e.customer_id ||
    r.property_id !== e.property_id ||
    r.job_id !== e.job_id ||
    r.fixture_only !== true ||
    r.send !== false ||
    r.provider !== false ||
    r.outbox !== false ||
    r.source_auth_atomicity !== 'UNVERIFIED' ||
    !Number.isSafeInteger(r.fixture_revision) ||
    r.fixture_revision < 0 ||
    !Number.isSafeInteger(r.linearization_sequence) ||
    r.linearization_sequence < 1 ||
    r.cancellation !==
      {
        CHECK: null,
        CANCEL: 'CANCELLED',
        REVOKE: 'REVOKED',
        SUPPRESS: 'SUPPRESSED',
      }[p.value.operation]
  )
    return null;
  time(r.recorded_at);
  return r;
}
function result(
  legacyPath: string,
  db: DatabaseSync,
  p: ReturnType<typeof pin>,
  a: CancellationLabAuthority,
  epoch: number,
) {
  const custody = db
      .prepare('SELECT * FROM custody WHERE subject=?')
      .get(p.subject),
    r = exactReceipt(db, p);
  if (
    !custody ||
    custody.base_signature !== p.base ||
    epoch < Number(custody.last_clock) ||
    !r
  )
    return unknown();
  const original = reconcileAtomicBoundary(legacyPath, p.value.original, a),
    state = snapshot(legacyPath, p);
  if (
    r.original_receipt &&
    (!original.receipt ||
      JSON.stringify(original.receipt) !== JSON.stringify(r.original_receipt))
  )
    return unknown();
  const withdraw = db
    .prepare(
      'SELECT c.signature,r.body,r.sha256 FROM claims c LEFT JOIN receipts r ON r.command_id=c.command_id WHERE c.logical_key=?',
    )
    .get(JSON.stringify([p.subject, 'WITHDRAWAL']));
  let cancellation = 'NONE';
  if (withdraw) {
    if (!withdraw.body) cancellation = 'PENDING_UNKNOWN';
    else {
      const request = pin(JSON.parse(String(withdraw.signature))),
        evidence = exactReceipt(db, request);
      if (
        !evidence ||
        state.revision < evidence.fixture_revision ||
        state.facts.suppressed !== true ||
        (evidence.cancellation === 'CANCELLED' &&
          state.facts.enrollment_active !== false) ||
        (evidence.cancellation === 'REVOKED' &&
          (state.facts.purpose_allowed !== false ||
            state.facts.source_revoked !== true))
      )
        return unknown();
      cancellation = evidence.cancellation!;
    }
  } else if (
    state.facts.suppressed === true ||
    state.facts.source_revoked === true ||
    state.facts.purpose_allowed === false ||
    state.facts.enrollment_active === false
  )
    cancellation = 'C11_WITHDRAWN_FIXTURE';
  return {
    status: 'EXACT_RECEIPT' as const,
    receipt: Object.freeze(r),
    current_cancellation: cancellation,
    original_receipt: original.receipt,
    replay: 'FORBIDDEN' as const,
    replacement: null,
    send: false as const,
    provider: false as const,
    outbox: false as const,
  };
}
/** Opens custody read-only. Missing acknowledgments are never synthesized or continued. */
export function reconcileConsentCancellation(
  legacyPath: string,
  path: string,
  command: CancellationLabCommand,
  a: CancellationLabAuthority,
) {
  if (!on(a)) return unknown();
  let db: DatabaseSync | undefined;
  try {
    const p = fence(command, a);
    p.check();
    db = open(legacyPath, path, false);
    const r = result(legacyPath, db, p, a, p.check().epoch);
    p.check();
    return r;
  } catch {
    return unknown();
  } finally {
    db?.close();
  }
}
/** One explicit hypothetical check or irreversible participating fixture withdrawal. */
export function executeConsentCancellation(
  legacyPath: string,
  path: string,
  command: CancellationLabCommand,
  a: CancellationLabAuthority,
) {
  if (!on(a)) throw Error('Cancellation lab is OFF');
  const p = fence(command, a),
    c = p.value;
  p.check();
  const db = open(legacyPath, path, true);
  let transaction = false;
  let claimed = false;
  const claim = () => {
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    const current = p.check(c.operation !== 'CHECK');
    const existing = db
        .prepare(
          'SELECT command_id FROM claims WHERE command_id=? OR logical_key=?',
        )
        .get(c.command_id, p.logical),
      custody = db
        .prepare('SELECT * FROM custody WHERE subject=?')
        .get(p.subject);
    if (
      existing ||
      (custody &&
        (custody.base_signature !== p.base ||
          current.epoch < Number(custody.last_clock)))
    )
      throw Error('Permanent logical custody hold');
    if (!custody)
      db.prepare('INSERT INTO custody VALUES(?,?,?)').run(
        p.subject,
        p.base,
        current.epoch,
      );
    db.prepare('INSERT INTO claims VALUES(?,?,?,?)').run(
      c.command_id,
      p.logical,
      p.subject,
      p.signature,
    );
    db.prepare('UPDATE custody SET last_clock=? WHERE subject=?').run(
      p.check(c.operation !== 'CHECK').epoch,
      p.subject,
    );
    db.exec('COMMIT');
    transaction = false;
    claimed = true;
    a.afterClaim?.();
  };
  const nativeAuthority = {
    enabled: true,
    test_only: true,
    clock: () => a.clock(),
    checkSource: () => {
      p.check(c.operation !== 'CHECK');
      return c.original.sha256;
    },
    atBoundary: a.atBoundary,
    afterClaim: claim,
  };
  try {
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    const checked = p.check(c.operation !== 'CHECK');
    const prior = db
        .prepare(
          'SELECT command_id FROM claims WHERE command_id=? OR logical_key=?',
        )
        .get(c.command_id, p.logical),
      custody = db
        .prepare('SELECT * FROM custody WHERE subject=?')
        .get(p.subject),
      state = snapshot(legacyPath, p);
    const original = reconcileAtomicBoundary(
      legacyPath,
      c.original,
      nativeAuthority,
    );
    if (
      prior ||
      (custody &&
        (custody.base_signature !== p.base ||
          checked.epoch < Number(custody.last_clock))) ||
      (c.operation === 'CHECK' && state.claim && !original.receipt)
    ) {
      const r = result(legacyPath, db, p, nativeAuthority, checked.epoch);
      db.exec('COMMIT');
      transaction = false;
      return r;
    }
    if (c.operation !== 'CHECK') {
      const check = db
        .prepare('SELECT c.signature FROM claims c WHERE c.logical_key=?')
        .get(JSON.stringify([p.subject, 'CHECK']));
      if (check) {
        const known = exactReceipt(
          db,
          pin(JSON.parse(String(check.signature))),
        );
        if ((known?.receipt_id ?? null) !== c.original_receipt_id)
          throw Error(
            'Exact unpredictable original receipt required before withdrawal',
          );
      } else if (c.original_receipt_id !== null)
        throw Error('Foreign original receipt');
    }
    db.exec('COMMIT');
    transaction = false;
    // New checks first acquire C11's permanent same-table claim. Its afterClaim
    // callback commits C12 custody before the uncertain native boundary continues.
    if (c.operation !== 'CHECK' || state.claim) claim();
    let captured: AtomicConsentReceipt | null = null,
      revision: number,
      sequence: number;
    if (c.operation === 'CHECK') {
      const observed = state.claim
        ? reconcileAtomicBoundary(legacyPath, c.original, nativeAuthority)
        : evaluateAtomicBoundary(legacyPath, c.original, nativeAuthority);
      if (!observed.receipt)
        throw Error('Original C11 UNKNOWN; no replacement');
      captured = observed.receipt as AtomicConsentReceipt;
      if (!claimed) claim();
      revision = captured.fixture_revision;
      sequence = captured.linearization_sequence;
    } else {
      p.check(true);
      const current = snapshot(legacyPath, p);
      const withdrawn: SyntheticConsentFacts = {
        ...current.facts,
        suppressed: true,
      };
      if (c.operation === 'CANCEL') withdrawn.enrollment_active = false;
      if (c.operation === 'REVOKE') {
        withdrawn.purpose_allowed = false;
        withdrawn.source_revoked = true;
        withdrawn.sender_authorized = false;
      }
      const change = changeSyntheticConsent(
        legacyPath,
        c.original.envelope,
        c.expected_fixture_revision,
        withdrawn,
        nativeAuthority,
      );
      revision = change.revision;
      sequence = change.linearization_sequence;
      captured = reconcileAtomicBoundary(
        legacyPath,
        c.original,
        nativeAuthority,
      ).receipt as AtomicConsentReceipt | null;
    }
    a.afterLegacyCommit?.();
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    const checkedAt = p.check(c.operation !== 'CHECK'),
      current = snapshot(legacyPath, p);
    if (
      c.operation !== 'CHECK' &&
      (current.revision !== revision || current.facts.suppressed !== true)
    )
      throw Error('Withdrawal fixture changed');
    const r: CancellationLabReceipt = {
      receipt_id: randomUUID(),
      command_id: c.command_id,
      operation: c.operation,
      source_binding_sha256: c.original.sha256,
      organization_id: c.original.envelope.organization_id,
      customer_id: c.original.envelope.customer_id,
      property_id: c.original.envelope.property_id,
      job_id: c.original.envelope.job_id,
      recorded_at: checkedAt.now,
      fixture_revision: revision,
      linearization_sequence: sequence,
      original_receipt: captured,
      cancellation:
        c.operation === 'CANCEL'
          ? 'CANCELLED'
          : c.operation === 'REVOKE'
            ? 'REVOKED'
            : c.operation === 'SUPPRESS'
              ? 'SUPPRESSED'
              : null,
      fixture_only: true,
      send: false,
      provider: false,
      outbox: false,
      source_auth_atomicity: 'UNVERIFIED',
    };
    db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(
      c.command_id,
      JSON.stringify(r),
      sha(r),
    );
    a.beforeCommit?.();
    const final = p.check(c.operation !== 'CHECK');
    if (final.now !== checkedAt.now)
      throw Error('Clock changed before receipt commit');
    db.prepare('UPDATE custody SET last_clock=? WHERE subject=?').run(
      final.epoch,
      p.subject,
    );
    db.exec('COMMIT');
    transaction = false;
    a.afterCommit?.();
    return result(legacyPath, db, p, nativeAuthority, p.check().epoch);
  } catch {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Permanent custody remains UNKNOWN. */
      }
    return unknown();
  } finally {
    db.close();
  }
}
