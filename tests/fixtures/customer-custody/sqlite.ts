import { DatabaseSync } from 'node:sqlite';
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  lstatSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import type {
  Item,
  OfflineCustodyPort,
  ReadPlan,
  WritePlan,
} from '../../../server/customer/custody-lab/protocol';

/** Narrow disposable interpreter, NOT DynamoDB Local or proof of AWS service behavior. */
function key(item: Item) {
  if (!item.pk || !('S' in item.pk) || Object.keys(item.pk).join() !== 'S')
    throw Error('Exact marker key required');
  return item.pk.S;
}
function row(db: DatabaseSync, item: Item): Item | null {
  const id = key(item);
  const result = db
    .prepare(
      id.startsWith('fence#')
        ? 'select value from fences where id=?'
        : id.startsWith('hold#')
          ? 'select value from holds where id=?'
          : 'select value from markers where id=?',
    )
    .get(id);
  return result ? (JSON.parse(String(result.value)) as Item) : null;
}
function equality(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
/** Exported only so worker-thread tests execute the SAME transaction implementation. */
export function runFixtureWrite(db: DatabaseSync, plan: WritePlan) {
  if (
    Object.keys(plan).join() !== 'TransactItems' ||
    ![3, 4, 5, 6].includes(plan.TransactItems.length)
  )
    throw Error('Unsupported disposable plan');
  db.exec('begin immediate');
  try {
    const used = new Set<string>();
    for (const action of plan.TransactItems) {
      if (Object.keys(action).length !== 1) throw Error('One action per item');
      if ('ConditionCheck' in action) {
        const c = action.ConditionCheck;
        if (c.TableName !== 'propel_disposable_custody')
          throw Error('Disposable table only');
        const id = key(c.Key);
        if (used.has(id)) throw Error('Duplicate item action');
        used.add(id);
        const actual = row(db, c.Key);
        if (!actual) throw Error('Condition failed');
        const clauses = c.ConditionExpression.split(' AND ');
        if (
          clauses.some((part) => {
            const match = /^(#k\d+) = (:v\d+)$/.exec(part);
            if (!match) throw Error('Unsupported disposable expression');
            const name = c.ExpressionAttributeNames[match[1]],
              value = c.ExpressionAttributeValues?.[match[2]];
            if (!name || value === undefined)
              throw Error('Unbound disposable expression');
            return !equality(actual[name], value);
          })
        )
          throw Error('Condition failed');
      } else if ('Put' in action) {
        const p = action.Put,
          id = key(p.Item);
        if (
          p.TableName !== 'propel_disposable_custody' ||
          p.ConditionExpression !== 'attribute_not_exists(#pk)' ||
          JSON.stringify(p.ExpressionAttributeNames) !== '{"#pk":"pk"}' ||
          p.ExpressionAttributeValues !== undefined
        )
          throw Error('Conditional marker put only');
        if (used.has(id)) throw Error('Duplicate item action');
        used.add(id);
        // Native PRIMARY KEY is the conditional one-use arbiter across connections.
        db.prepare(
          id.startsWith('hold#')
            ? 'insert into holds(id,value) values(?,?)'
            : 'insert into markers(id,value) values(?,?)',
        ).run(id, JSON.stringify(p.Item));
      } else throw Error('No update/delete/replay operation');
    }
    db.exec('commit');
  } catch (e) {
    db.exec('rollback');
    throw e;
  }
}
const schema = [
  'create table fixture_identity(id text primary key)',
  'create table fences(id text primary key,value text not null)',
  'create table holds(id text primary key,value text not null)',
  'create table markers(id text primary key,value text not null)',
  ...['holds', 'markers'].flatMap((table) =>
    ['update', 'delete'].map(
      (action) =>
        `create trigger ${table}_no_${action} before ${action} on ${table} begin select raise(abort,'append-only spent metadata');end`,
    ),
  ),
];
export interface FixtureDescriptor {
  path: string;
  identity: string;
  inode: number;
  device: number;
}
function verifyFile(d: FixtureDescriptor) {
  const file = lstatSync(d.path),
    dir = lstatSync(dirname(d.path));
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.nlink !== 1 ||
    file.ino !== d.inode ||
    file.dev !== d.device ||
    file.uid !== process.getuid?.() ||
    (file.mode & 0o777) !== 0o600 ||
    !dir.isDirectory() ||
    (dir.mode & 0o777) !== 0o700 ||
    dir.uid !== process.getuid?.() ||
    basename(d.path) !== 'disposable.sqlite' ||
    !basename(dirname(d.path)).startsWith('propel-external-custody-') ||
    realpathSync(d.path) !== d.path
  )
    throw Error('Original private disposable custody required');
}
function verifyStore(db: DatabaseSync, d: FixtureDescriptor) {
  verifyFile(d);
  const ids = db.prepare('select id from fixture_identity').all();
  const actual = db
    .prepare(
      "select lower(sql) sql from sqlite_schema where name not like 'sqlite_%' order by name",
    )
    .all()
    .map((r) => r.sql)
    .sort();
  if (
    ids.length !== 1 ||
    ids[0].id !== d.identity ||
    JSON.stringify(actual) !==
      JSON.stringify(schema.map((s) => s.toLowerCase()).sort()) ||
    db.prepare('pragma synchronous').get()?.synchronous !== 2 ||
    db.prepare('pragma journal_mode').get()?.journal_mode !== 'wal'
  )
    throw Error('Missing or contradictory original custody schema/identity');
}
function connectionPort(
  db: DatabaseSync,
  d: FixtureDescriptor,
): OfflineCustodyPort {
  return {
    async hold(plan) {
      verifyStore(db, d);
      if (
        plan.TransactItems.length !== 3 ||
        !('Put' in plan.TransactItems[1]) ||
        !('Put' in plan.TransactItems[2]) ||
        !key(plan.TransactItems[1].Put.Item).startsWith('hold#claim#') ||
        !key(plan.TransactItems[2].Put.Item).startsWith('hold#source#')
      )
        throw Error('Exact pre-dispatch hold plan required');
      runFixtureWrite(db, plan);
    },
    async write(plan) {
      verifyStore(db, d);
      const last = plan.TransactItems.slice(-2);
      if (
        ![5, 6].includes(plan.TransactItems.length) ||
        last.some((v) => !('ConditionCheck' in v)) ||
        !('ConditionCheck' in last[0]) ||
        !('ConditionCheck' in last[1]) ||
        !key(last[0].ConditionCheck.Key).startsWith('hold#claim#') ||
        !key(last[1].ConditionCheck.Key).startsWith('hold#source#')
      )
        throw Error('Durable original hold conditions required');
      runFixtureWrite(db, plan);
    },
    async read(plan: ReadPlan) {
      if (plan.TransactItems.length !== 6)
        throw Error('Exact atomic snapshot required');
      db.exec('begin');
      try {
        verifyStore(db, d);
        const rows = plan.TransactItems.map(({ Get: g }) => {
          if (g.TableName !== 'propel_disposable_custody')
            throw Error('Disposable table only');
          return row(db, g.Key);
        });
        db.exec('commit');
        return rows;
      } catch (e) {
        db.exec('rollback');
        throw e;
      }
    },
  };
}
/** Opens ONLY a previously provisioned disposable fixture. Never create/reseed missing custody. */
export function openCustodyFixturePort(d: FixtureDescriptor) {
  verifyFile(d);
  const db = new DatabaseSync(d.path);
  try {
    db.exec('pragma synchronous=FULL; pragma busy_timeout=5000');
    verifyStore(db, d);
    return { port: connectionPort(db, d), close: () => db.close() };
  } catch (e) {
    db.close();
    throw e;
  }
}
export function createCustodyFixture() {
  const directory = mkdtempSync(
    join(realpathSync(tmpdir()), 'propel-external-custody-'),
  );
  chmodSync(directory, 0o700);
  const path = join(directory, 'disposable.sqlite'),
    db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec(
    'pragma journal_mode=WAL; pragma synchronous=FULL; pragma busy_timeout=5000',
  );
  for (const statement of schema) db.exec(statement);
  const identity = randomUUID();
  db.prepare('insert into fixture_identity(id) values(?)').run(identity);
  const file = lstatSync(path),
    descriptor: FixtureDescriptor = {
      path,
      identity,
      inode: file.ino,
      device: file.dev,
    };
  const connections = [db];
  let available = true;
  const port = (connection: DatabaseSync): OfflineCustodyPort => {
    const bound = connectionPort(connection, descriptor);
    return {
      async hold(plan) {
        if (!available) throw Error('Custody unavailable');
        await bound.hold(plan);
      },
      async write(plan) {
        if (!available) throw Error('Custody unavailable');
        await bound.write(plan);
      },
      async read(plan: ReadPlan) {
        if (!available) throw Error('Custody unavailable');
        return bound.read(plan);
      },
    };
  };
  return {
    path,
    descriptor,
    db,
    port: port(db),
    unavailable() {
      available = false;
    },
    reopen() {
      verifyFile(descriptor);
      const connection = new DatabaseSync(path);
      connection.exec('pragma synchronous=FULL; pragma busy_timeout=5000');
      verifyStore(connection, descriptor);
      connections.push(connection);
      return port(connection);
    },
    // Fixture-only fence authority, explicitly NOT an operational registrar or IAM role.
    fence(item: Item) {
      const id = key(item);
      if (!id.startsWith('fence#')) throw Error('No spent-marker reset');
      // Separate authority fixture. Spent-marker triggers are NEVER disabled.
      db.exec('begin immediate');
      try {
        const before = row(db, item);
        if (before) {
          const n = (v: Item, field: string) =>
            Number((v[field] as { N: string }).N);
          if (
            n(item, 'epoch') < n(before, 'epoch') ||
            n(item, 'revision') <= n(before, 'revision')
          )
            throw Error('Fence cannot roll back');
        }
        db.prepare(
          'insert into fences(id,value) values(?,?) on conflict(id) do update set value=excluded.value',
        ).run(id, JSON.stringify(item));
        db.exec('commit');
      } catch (e) {
        db.exec('rollback');
        throw e;
      }
    },
    close() {
      for (const c of connections) c.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
