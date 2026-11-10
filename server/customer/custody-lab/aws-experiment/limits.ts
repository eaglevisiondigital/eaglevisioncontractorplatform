import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync, chmodSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS } from './package';

/** Private disposable accounting metadata only. Not independent custody or an AWS spending cap. */
export class ExperimentLimits {
  private readonly db: DatabaseSync;
  readonly path: string;
  constructor(
    directory: string,
    spec: string,
    private readonly start: number,
    private readonly end: number,
    private readonly now: () => number,
    create = false,
  ) {
    const dir = lstatSync(directory);
    if (
      realpathSync(directory) !== directory ||
      !dir.isDirectory() ||
      dir.uid !== process.getuid?.() ||
      (dir.mode & 0o777) !== 0o700 ||
      !/^[a-f0-9]{64}$/.test(spec) ||
      end <= start ||
      end - start > LIMITS.windowMs
    )
      throw Error('Original private experiment journal required');
    this.path = join(directory, 'aws-experiment-counters.sqlite');
    if (create === existsSync(this.path))
      throw Error('No journal recreation or overwrite');
    if (!create) {
      const f = lstatSync(this.path);
      if (
        !f.isFile() ||
        f.isSymbolicLink() ||
        f.nlink !== 1 ||
        f.uid !== process.getuid?.() ||
        (f.mode & 0o777) !== 0o600
      )
        throw Error('Private journal required');
    }
    this.db = new DatabaseSync(this.path);
    chmodSync(this.path, 0o600);
    this.db.exec(
      'pragma journal_mode=WAL;pragma synchronous=FULL;pragma busy_timeout=5000',
    );
    if (create) {
      this.db
        .exec(`create table limits(spec text primary key,start integer,end integer,wall integer,blocked integer,cleanupblocked integer,dynamodb integer,s3 integer,dbytes integer,sbytes integer);
        create table calls(id integer primary key,phase text,mutation integer,state text,request_hash text,service text,bytes integer,intent_hash text,dispatched integer default 0,settled integer default 0);
        create table workers(id text primary key,active integer);
        create unique index no_mutation_replay on calls(intent_hash) where mutation=1 and dispatched=1;`);
      this.db
        .prepare('insert into limits values(?,?,?,?,0,0,0,0,0,0)')
        .run(spec, start, end, start);
    }
    const columns = this.db
      .prepare('pragma table_info(calls)')
      .all()
      .map((c) => String(c.name))
      .sort()
      .join();
    if (
      columns !==
      'bytes,dispatched,id,intent_hash,mutation,phase,request_hash,service,settled,state'
    ) {
      this.db.close();
      throw Error(
        'Exact SDK journal schema required; never migrate or recreate',
      );
    }
    if (
      !this.db
        .prepare('pragma index_list(calls)')
        .all()
        .some(
          (i) =>
            i.name === 'no_mutation_replay' &&
            i.unique === 1 &&
            i.partial === 1,
        )
    ) {
      this.db.close();
      throw Error('Original mutation marker index required');
    }
    const marker = this.db
      .prepare(
        "select sql from sqlite_master where type='index' and name='no_mutation_replay'",
      )
      .get();
    if (
      !/^create unique index no_mutation_replay on calls\(intent_hash\) where mutation=1 and dispatched=1$/i.test(
        String(marker?.sql),
      )
    ) {
      this.db.close();
      throw Error('Exact permanent mutation marker required');
    }
    const row = this.state();
    if (row.spec !== spec || row.start !== start || row.end !== end) {
      this.db.close();
      throw Error('Journal binding mismatch');
    }
    if (
      this.db
        .prepare("select count(*) n from calls where state='pending'")
        .get()?.n
    )
      this.db.exec(
        "update limits set blocked=1,cleanupblocked=case when exists(select 1 from calls where state='pending' and phase='cleanup') then 1 else cleanupblocked end",
      );
  }
  state() {
    const row = this.db.prepare('select * from limits').all();
    if (row.length !== 1) throw Error('Journal unavailable');
    return row[0];
  }
  quarantine(phase = 'runner') {
    this.db
      .prepare(
        "update limits set blocked=1,cleanupblocked=case when ?='cleanup' then 1 else cleanupblocked end",
      )
      .run(phase);
  }
  worker(id: string) {
    if (!/^[a-z0-9-]{1,50}$/.test(id)) throw Error('Exact worker required');
    this.db.exec('begin immediate');
    try {
      if (
        Number(
          this.db.prepare('select count(*) n from workers where active=1').get()
            ?.n,
        ) >= LIMITS.workers
      )
        throw Error('Worker limit');
      const prior = this.db
        .prepare('select active from workers where id=?')
        .get(id);
      if (prior?.active === 1) throw Error('Worker already active');
      if (prior)
        this.db.prepare('update workers set active=1 where id=?').run(id);
      else this.db.prepare('insert into workers values(?,1)').run(id);
      this.db.exec('commit');
    } catch (e) {
      this.db.exec('rollback');
      throw e;
    }
    let released = false;
    return () => {
      if (released) throw Error('Worker lease already released');
      released = true;
      if (
        this.db
          .prepare('update workers set active=0 where id=? and active=1')
          .run(id).changes !== 1
      )
        throw Error('Original worker lease required');
    };
  }
  reserve(
    service: 'dynamodb' | 's3',
    bytes: number,
    mutation: boolean,
    phase: 'runner' | 'reviewer' | 'cleanup',
    requestHash = '',
  ) {
    if (
      !['dynamodb', 's3'].includes(service) ||
      !['runner', 'reviewer', 'cleanup'].includes(phase) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      bytes > LIMITS.responseBytes
    )
      throw Error('Byte limit');
    this.db.exec('begin immediate');
    try {
      const row = this.state(),
        time = this.now(),
        deadline =
          phase === 'runner' ? this.end : this.start + 48 * 60 * 60 * 1000;
      const budget = Number(row[service]),
        total = Number(row[service === 's3' ? 'sbytes' : 'dbytes']);
      if (
        !Number.isSafeInteger(time) ||
        time < Number(row.wall) ||
        time < this.start ||
        time >= deadline ||
        (phase === 'cleanup' && time < this.end) ||
        budget >= LIMITS[service] ||
        total + bytes > LIMITS.bytes ||
        (mutation && phase === 'runner' && row.blocked !== 0) ||
        (mutation && phase === 'cleanup' && row.cleanupblocked !== 0)
      ) {
        this.db.exec('update limits set blocked=1');
        this.db.exec('commit');
        throw Error('Experiment limit or quarantine');
      }
      this.db
        .prepare(
          service === 's3'
            ? 'update limits set wall=?,s3=s3+1,sbytes=sbytes+?'
            : 'update limits set wall=?,dynamodb=dynamodb+1,dbytes=dbytes+?',
        )
        .run(time, bytes);
      const result = this.db
        .prepare(
          "insert into calls(phase,mutation,state,request_hash,service,bytes) values(?,?,'pending',?,?,?)",
        )
        .run(phase, mutation ? 1 : 0, requestHash, service, bytes);
      this.db.exec('commit');
      return Number(result.lastInsertRowid);
    } catch (e) {
      if (this.db.isTransaction) this.db.exec('rollback');
      throw e;
    }
  }
  /** One wire attempt per previously reserved exact request. Shared by every SDK role. */
  dispatch(
    id: number,
    requestHash: string,
    expected: {
      phase: string;
      mutation: boolean;
      service: string;
      bytes: number;
      intentHash?: string;
    },
  ) {
    this.db.exec('begin immediate');
    try {
      const call = this.db.prepare('select * from calls where id=?').get(id);
      const row = this.state(),
        time = this.now();
      if (
        !call ||
        call.state !== 'pending' ||
        call.dispatched !== 0 ||
        !/^[a-f0-9]{64}$/.test(requestHash) ||
        call.request_hash !== requestHash ||
        call.phase !== expected.phase ||
        call.mutation !== (expected.mutation ? 1 : 0) ||
        call.service !== expected.service ||
        call.bytes !== expected.bytes ||
        (expected.mutation &&
          !/^[a-f0-9]{64}$/.test(expected.intentHash || '')) ||
        time < Number(row.wall) ||
        time < this.start ||
        time >=
          (call.phase === 'runner'
            ? this.end
            : this.start + 48 * 60 * 60 * 1000) ||
        (call.mutation === 1 &&
          (call.phase === 'cleanup' ? row.cleanupblocked : row.blocked) !==
            0) ||
        Number(
          this.db
            .prepare(
              'select count(*) n from calls where dispatched=1 and settled=0',
            )
            .get()?.n,
        ) >= LIMITS.workers
      )
        throw Error('Original live request ticket required');
      this.db
        .prepare('update calls set dispatched=1,intent_hash=? where id=?')
        .run(expected.mutation ? expected.intentHash! : null, id);
      this.db.exec('commit');
      return {
        phase: String(call.phase),
        deadline:
          call.phase === 'runner' ? this.end : this.start + 48 * 60 * 60 * 1000,
      };
    } catch (e) {
      this.db.exec('rollback');
      throw e;
    }
  }
  assertDispatchedLive(id: number, requestHash: string) {
    const call = this.db.prepare('select * from calls where id=?').get(id),
      row = this.state(),
      time = this.now();
    if (
      !call ||
      call.state !== 'pending' ||
      call.dispatched !== 1 ||
      call.settled !== 0 ||
      call.request_hash !== requestHash ||
      time < Number(row.wall) ||
      time < this.start ||
      time >=
        (call.phase === 'runner'
          ? this.end
          : this.start + 48 * 60 * 60 * 1000) ||
      (call.mutation === 1 &&
        (call.phase === 'cleanup' ? row.cleanupblocked : row.blocked) !== 0)
    )
      throw Error('Current original wire ticket required');
  }
  settleTransport(id: number) {
    if (
      this.db
        .prepare(
          'update calls set settled=1 where id=? and dispatched=1 and settled=0',
        )
        .run(id).changes !== 1
    )
      throw Error('Original wire settlement required');
  }
  finish(id: number, known: boolean) {
    let late: boolean;
    this.db.exec('begin immediate');
    try {
      const call = this.db.prepare('select * from calls where id=?').get(id),
        row = this.state(),
        time = this.now();
      late =
        known &&
        (!call ||
          time < Number(row.wall) ||
          time < this.start ||
          time >=
            (call.phase === 'runner'
              ? this.end
              : this.start + 48 * 60 * 60 * 1000) ||
          (call.mutation === 1 &&
            (call.phase === 'cleanup' ? row.cleanupblocked : row.blocked) !==
              0));
      known = known && !late;
      const changed = this.db
        .prepare("update calls set state=? where id=? and state='pending'")
        .run(known ? 'observed' : 'UNKNOWN', id);
      if (changed.changes !== 1) throw Error('Original call required');
      if (!known)
        this.db.exec(
          "update limits set blocked=1,cleanupblocked=case when exists(select 1 from calls where state='UNKNOWN' and phase='cleanup') then 1 else cleanupblocked end",
        );
      this.db.exec('commit');
    } catch (e) {
      this.db.exec('rollback');
      throw e;
    }
    if (late) throw Error('Late acknowledgment UNKNOWN');
  }
  close() {
    this.db.close();
  }
}
