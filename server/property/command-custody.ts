import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  lstatSync,
  realpathSync,
  chmodSync,
  openSync,
  fsyncSync,
  closeSync,
  constants,
} from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { uuidPattern } from '../../src/domain/intake';
import {
  validateMaintenanceCommand,
  type MaintenanceCommand,
} from './maintenance-persistence';
import {
  validateRepairReservation,
  type ReadinessAppendCommand,
  type RepairReservationRequest,
} from './repair-persistence';

/** Private caller journal ONLY. No property/estimate store, transport or application binding. */
export type CustodyCommand =
  | { kind: 'maintenance'; command: MaintenanceCommand }
  | { kind: 'repair'; command: RepairReservationRequest }
  | { kind: 'readiness'; command: ReadinessAppendCommand };
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (
    value &&
    typeof value === 'object' &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Plain custody objects required.');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw Error('Finite custody numbers required.');
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  const result = JSON.stringify(value);
  if (result === undefined)
    throw Error('Serializable custody evidence required.');
  return result;
}
export const fingerprint = (v: unknown) =>
  createHash('sha256').update(canonical(v)).digest('hex');
export function custodyIdentity(value: CustodyCommand) {
  if (!value || Object.keys(value).sort().join(',') !== 'command,kind')
    throw Error('Exact custody envelope required.');
  if (value.kind === 'maintenance') validateMaintenanceCommand(value.command);
  else if (value.kind === 'repair') validateRepairReservation(value.command);
  else if (value.kind === 'readiness') {
    const c = value.command;
    if (!c || Object.keys(c).sort().join(',') !== 'reservation,review')
      throw Error('Exact readiness command required.');
    validateRepairReservation(c.reservation);
    const r = c.review;
    if (
      !r ||
      typeof r.request_id !== 'string' ||
      !uuidPattern.test(r.request_id) ||
      r.draft_version_id !== c.reservation.draft_version_id ||
      !Number.isSafeInteger(r.lock_revision) ||
      r.lock_revision < 1 ||
      !Number.isSafeInteger(r.expected_sequence) ||
      r.expected_sequence < 0 ||
      typeof r.snapshot !== 'string'
    )
      throw Error('Exact readiness intent required.');
  } else throw Error('Unsupported command purpose; no financial authority.');
  const command =
    value.kind === 'readiness' ? value.command.reservation : value.command;
  const id =
    value.kind === 'readiness'
      ? value.command.review.request_id
      : value.command.request_id;
  if (Buffer.byteLength(canonical(value), 'utf8') > 1048576)
    throw Error('Custody command exceeds private bound.');
  return {
    id,
    source: command.source,
    sourceKey: fingerprint(command.source),
    expectedRevision:
      value.kind === 'maintenance'
        ? value.command.expected_revision
        : value.kind === 'repair'
          ? value.command.maintenance_revision
          : value.command.review.lock_revision,
  };
}
export interface CustodyEvent {
  sequence: number;
  stage: 'command' | 'reserve' | 'prepare';
  kind:
    'retained' | 'transmitting' | 'acknowledged' | 'uncertain' | 'reconciled';
  evidence: unknown;
  recorded_at: string;
}
interface StoredIntent {
  request_id: string;
  capability_id: string;
  source_key: string;
  purpose: CustodyCommand['kind'];
  command_text: string;
  fingerprint: string;
  expected_revision: number;
  created_at: string;
}
function syncDirectory(root: string) {
  const fd = openSync(root, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
/** FULL SQLite transactions make custody commits precede dispatch. Startup only reads:
 * no queue draining/replay, request-ID replacement, UNKNOWN clearing or delete API.
 * Local filesystem ownership is trusted; this is not encrypted/operator-resistant storage.
 */
export class CommandCustody {
  private readonly db: DatabaseSync;
  constructor(readonly root: string) {
    if (!isAbsolute(root))
      throw Error('Private absolute custody directory required.');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const stat = lstatSync(root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      realpathSync(root) !== resolve(root) ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw Error('Owned private custody directory required.');
    const file = join(root, 'commands.sqlite');
    this.checkFiles();
    try {
      const fd = openSync(
        file,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_RDWR |
          constants.O_NOFOLLOW,
        0o600,
      );
      closeSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db
      .exec(`pragma journal_mode=WAL;pragma synchronous=FULL;pragma fullfsync=ON;pragma checkpoint_fullfsync=ON;pragma foreign_keys=ON;pragma busy_timeout=1500;pragma trusted_schema=OFF;
   create table if not exists intents(request_id text primary key,capability_id text not null,source_key text not null,purpose text not null,command_text text not null,fingerprint text not null,expected_revision integer not null,created_at text not null);
   create index if not exists custody_source on intents(source_key);
   create table if not exists events(request_id text not null references intents(request_id),sequence integer not null,stage text not null,kind text not null,evidence text not null,recorded_at text not null,primary key(request_id,sequence));
   create trigger if not exists immutable_intent_update before update on intents begin select raise(abort,'append-only custody');end;
   create trigger if not exists immutable_intent_delete before delete on intents begin select raise(abort,'append-only custody');end;
   create trigger if not exists immutable_event_update before update on events begin select raise(abort,'append-only custody');end;
   create trigger if not exists immutable_event_delete before delete on events begin select raise(abort,'append-only custody');end;`);
    const pageSize = Number(
      this.db.prepare('pragma page_size').get()!.page_size,
    );
    this.db.exec(`pragma max_page_count=${Math.floor(67108864 / pageSize)}`);
    syncDirectory(root);
    this.checkFiles();
  }
  private checkFiles() {
    const stat = lstatSync(this.root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      realpathSync(this.root) !== resolve(this.root) ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw Error('Owned private custody directory required.');
    let bytes = 0;
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      try {
        const f = lstatSync(join(this.root, 'commands.sqlite' + suffix));
        if (
          !f.isFile() ||
          f.isSymbolicLink() ||
          f.nlink !== 1 ||
          (f.mode & 0o077) !== 0 ||
          (process.getuid && f.uid !== process.getuid())
        )
          throw Error('Private regular single-link custody file required.');
        bytes += f.size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return bytes;
  }
  private validateEvents(value: CustodyCommand, events: CustodyEvent[]) {
    const identity = custodyIdentity(value);
    if (events.length < 1 || events.length > 64)
      throw Error('Custody history integrity mismatch.');
    const seen: CustodyEvent[] = [];
    for (const e of events) {
      const stageOK =
        value.kind === 'repair'
          ? ['reserve', 'prepare'].includes(e.stage)
          : e.stage === 'command';
      if (
        !stageOK ||
        e.sequence !== seen.length + 1 ||
        typeof e.recorded_at !== 'string' ||
        !Number.isFinite(Date.parse(e.recorded_at)) ||
        Buffer.byteLength(canonical(e.evidence), 'utf8') > 1048576
      )
        throw Error('Custody history integrity mismatch.');
      if (
        ['transmitting', 'uncertain', 'acknowledged'].includes(e.kind) &&
        seen.some(
          (x) =>
            x.kind === 'reconciled' &&
            (x.stage === e.stage ||
              (value.kind === 'repair' && x.stage === 'prepare')),
        )
      )
        throw Error('Committed reconciliation never resumes transmission.');
      const transmitted = seen.some(
        (x) => x.stage === e.stage && x.kind === 'transmitting',
      );
      if (e.kind === 'retained') {
        if (
          seen.length ||
          e.stage === (value.kind === 'repair' ? 'prepare' : 'reserve') ||
          canonical(e.evidence) !==
            canonical({ expected_revision: identity.expectedRevision })
        )
          throw Error('Custody retained integrity mismatch.');
      } else if (!seen.length)
        throw Error('Original retained history required.');
      else if (e.kind === 'transmitting') {
        if (
          transmitted ||
          (e.stage === 'prepare' &&
            !seen.some(
              (x) => x.stage === 'reserve' && x.kind === 'acknowledged',
            ))
        )
          throw Error(
            'Claimed transmission never retries; durable reservation acknowledgment required.',
          );
        if (e.evidence !== null) throw Error('Transmission evidence mismatch.');
      } else if (e.kind === 'uncertain') {
        if (
          !transmitted ||
          canonical(e.evidence) !== canonical({ status: 'undetermined' })
        )
          throw Error('Uncertain custody integrity mismatch.');
      } else if (e.kind === 'acknowledged' || e.kind === 'reconciled') {
        if (
          e.kind === 'acknowledged' &&
          (!transmitted ||
            seen.some((x) => x.stage === e.stage && x.kind === 'acknowledged'))
        )
          throw Error(
            'Exact transmission required; acknowledgment already retained.',
          );
        this.validateReceipt(value, e.stage, e.kind, e.evidence);
      } else throw Error('Unknown custody event.');
      seen.push(e);
    }
  }
  private validateReceipt(
    value: CustodyCommand,
    stage: CustodyEvent['stage'],
    kind: CustodyEvent['kind'],
    evidence: unknown,
  ) {
    const obj = (v: unknown): Record<string, unknown> => {
      if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error('Exact custody receipt required.');
      return v as Record<string, unknown>;
    };
    let receipt = obj(evidence);
    if (kind === 'reconciled') {
      if (receipt.status !== 'committed')
        throw Error('Committed reconciliation required.');
      receipt = obj(
        value.kind === 'readiness' ? receipt.review : receipt.receipt,
      );
    }
    const uuid = (v: unknown) => typeof v === 'string' && uuidPattern.test(v);
    const date = (v: unknown) =>
      typeof v === 'string' && Number.isFinite(Date.parse(v));
    if (value.kind === 'maintenance') {
      const c = value.command;
      if (
        receipt.request_id !== c.request_id ||
        canonical(receipt.source) !== canonical(c.source) ||
        receipt.revision !== c.expected_revision + 1 ||
        !uuid(receipt.actor_id) ||
        !date(receipt.recorded_at) ||
        !(
          receipt.scheduled_visit_id === null ||
          uuid(receipt.scheduled_visit_id)
        )
      )
        throw Error('Exact maintenance receipt integrity mismatch.');
    } else if (value.kind === 'repair') {
      const c = value.command;
      if (stage === 'reserve') {
        if (
          receipt.id !== c.request_id ||
          canonical(receipt.command) !== canonical(c) ||
          !uuid(receipt.actor_id)
        )
          throw Error('Exact reservation receipt integrity mismatch.');
      } else if (
        receipt.request_id !== c.request_id ||
        receipt.estimate_id !== c.estimate_id ||
        receipt.draft_version_id !== c.draft_version_id ||
        receipt.line_id !== c.line_id
      )
        throw Error('Exact preparation receipt integrity mismatch.');
    } else if (
      canonical(receipt.request) !== canonical(value.command.review) ||
      receipt.sequence !== value.command.review.expected_sequence + 1 ||
      !uuid(receipt.actor) ||
      !date(receipt.recorded_at)
    )
      throw Error('Exact readiness receipt integrity mismatch.');
  }
  private transaction<T>(work: () => T) {
    if (this.checkFiles() >= 67108864)
      throw Error('Custody storage watermark exceeded; retain hold.');
    this.db.exec('begin immediate');
    try {
      const value = work();
      this.db.exec('commit');
      syncDirectory(this.root);
      if (this.checkFiles() >= 67108864)
        throw Error('Custody storage watermark exceeded; retain hold.');
      return value;
    } catch (e) {
      try {
        this.db.exec('rollback');
      } catch {
        /* Commit uncertainty stays held by retained rows; never transmit on error. */
      }
      throw e;
    }
  }
  private row(id: string) {
    return this.db
      .prepare('select * from intents where request_id=?')
      .get(id) as unknown as StoredIntent | undefined;
  }
  private append(
    id: string,
    stage: CustodyEvent['stage'],
    kind: CustodyEvent['kind'],
    evidence: unknown,
  ) {
    const n = Number(
      this.db
        .prepare('select count(*) n from events where request_id=?')
        .get(id)!.n,
    );
    if (n >= 64)
      throw Error('Bounded custody event history exceeded; retain hold.');
    const text = canonical(evidence);
    if (Buffer.byteLength(text, 'utf8') > 1048576)
      throw Error('Private receipt bound exceeded.');
    const retained = this.readStored(id, true);
    if (retained)
      this.validateEvents(retained.value, [
        ...retained.events,
        {
          sequence: n + 1,
          stage,
          kind,
          evidence,
          recorded_at: new Date().toISOString(),
        },
      ]);
    else throw Error('Original custody required.');
    this.db
      .prepare(
        'insert into events values(?,coalesce((select max(sequence)+1 from events where request_id=?),1),?,?,?,?)',
      )
      .run(id, id, stage, kind, text, new Date().toISOString());
  }
  read(id: string) {
    return this.readStored(id);
  }
  private readStored(id: string, initializing = false) {
    this.checkFiles();
    const intent = this.row(id);
    if (!intent) return null;
    const value = JSON.parse(intent.command_text) as CustodyCommand;
    const identity = custodyIdentity(value);
    if (
      fingerprint(value) !== intent.fingerprint ||
      identity.id !== id ||
      identity.sourceKey !== intent.source_key ||
      identity.expectedRevision !== intent.expected_revision ||
      value.kind !== intent.purpose ||
      !uuidPattern.test(intent.capability_id) ||
      !Number.isFinite(Date.parse(intent.created_at))
    )
      throw Error('Custody integrity mismatch.');
    const events = this.db
      .prepare(
        'select sequence,stage,kind,evidence,recorded_at from events where request_id=? order by sequence',
      )
      .all(id)
      .map((r) => ({
        ...r,
        evidence: JSON.parse(r.evidence as string),
      })) as unknown as CustodyEvent[];
    if (!initializing || events.length) this.validateEvents(value, events);
    return { intent, value, events };
  }
  private complete(id: string) {
    const value = this.read(id)!;
    const last = value.events.at(-1);
    return (
      !!last &&
      ['acknowledged', 'reconciled'].includes(last.kind) &&
      last.evidence !== null &&
      !(last.evidence as { status?: string }).status?.includes(
        'undetermined',
      ) &&
      (value.intent.purpose !== 'repair' || last.stage === 'prepare')
    );
  }
  retain(value: CustodyCommand, capability: string) {
    const i = custodyIdentity(value);
    if (!uuidPattern.test(capability))
      throw Error('Exact test capability required.');
    return this.transaction(() => {
      for (const row of this.db.prepare('select request_id from intents').all())
        this.read(row.request_id as string);
      const old = this.read(i.id);
      if (old) {
        if (
          old.intent.capability_id !== capability ||
          old.intent.fingerprint !== fingerprint(value)
        )
          throw Error('Original intent/identity cannot be replaced.');
        return { id: i.id, existing: true };
      }
      if (
        Number(this.db.prepare('select count(*) n from intents').get()!.n) >=
        1000
      )
        throw Error('Custody capacity exceeded; no transmission.');
      const others = this.db
        .prepare('select request_id from intents where source_key=?')
        .all(i.sourceKey);
      if (others.some((r) => !this.complete(r.request_id as string)))
        throw Error('UNKNOWN source hold; no replacement intent.');
      this.db
        .prepare('insert into intents values(?,?,?,?,?,?,?,?)')
        .run(
          i.id,
          capability,
          i.sourceKey,
          value.kind,
          canonical(value),
          fingerprint(value),
          i.expectedRevision,
          new Date().toISOString(),
        );
      this.append(
        i.id,
        value.kind === 'repair' ? 'reserve' : 'command',
        'retained',
        { expected_revision: i.expectedRevision },
      );
      return { id: i.id, existing: false };
    });
  }
  transmitting(id: string, stage: CustodyEvent['stage']) {
    this.transaction(() => {
      const retained = this.read(id);
      if (!retained)
        throw Error('Durable intent required before transmission.');
      if (
        retained.events.some(
          (e) => e.stage === stage && e.kind === 'transmitting',
        )
      )
        throw Error('Claimed transmission never retries.');
      if (
        stage === 'prepare' &&
        !retained.events.some(
          (e) => e.stage === 'reserve' && e.kind === 'acknowledged',
        )
      )
        throw Error('Durable reservation acknowledgment required.');
      this.append(id, stage, 'transmitting', null);
    });
  }
  acknowledge(id: string, stage: CustodyEvent['stage'], result: unknown) {
    this.transaction(() => {
      const retained = this.read(id);
      if (
        !retained?.events.some(
          (e) => e.stage === stage && e.kind === 'transmitting',
        )
      )
        throw Error('Exact transmission required.');
      if (
        retained.events.some(
          (e) => e.stage === stage && e.kind === 'acknowledged',
        )
      )
        throw Error('Acknowledgment already retained.');
      this.append(id, stage, 'acknowledged', result);
    });
  }
  uncertain(id: string, stage: CustodyEvent['stage']) {
    this.transaction(() =>
      this.append(id, stage, 'uncertain', { status: 'undetermined' }),
    );
  }
  reconcile(
    id: string,
    stage: CustodyEvent['stage'],
    result: { status: string },
  ) {
    if (result.status !== 'committed') return;
    this.transaction(() => {
      if (!this.read(id)) throw Error('Original custody required.');
      this.append(id, stage, 'reconciled', result);
    });
  }
  close() {
    this.db.close();
  }
}
