import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    ![3, 4].includes(plan.TransactItems.length)
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
        db.prepare('insert into markers(id,value) values(?,?)').run(
          id,
          JSON.stringify(p.Item),
        );
      } else throw Error('No update/delete/replay operation');
    }
    db.exec('commit');
  } catch (e) {
    db.exec('rollback');
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
  db.exec(`pragma journal_mode=WAL; pragma synchronous=FULL; pragma busy_timeout=5000;
    create table fences(id text primary key,value text not null);
    create table markers(id text primary key,value text not null);
    create trigger markers_no_update before update on markers begin select raise(abort,'append-only spent metadata');end;
    create trigger markers_no_delete before delete on markers begin select raise(abort,'append-only spent metadata');end;`);
  const connections = [db];
  let available = true;
  const port = (connection: DatabaseSync): OfflineCustodyPort => ({
    async write(plan) {
      if (!available) throw Error('Custody unavailable');
      runFixtureWrite(connection, plan);
    },
    async read(plan: ReadPlan) {
      if (!available) throw Error('Custody unavailable');
      if (plan.TransactItems.length !== 4)
        throw Error('Exact atomic snapshot required');
      connection.exec('begin');
      try {
        const rows = plan.TransactItems.map(({ Get: g }) => {
          if (g.TableName !== 'propel_disposable_custody')
            throw Error('Disposable table only');
          return row(connection, g.Key);
        });
        connection.exec('commit');
        return rows;
      } catch (e) {
        connection.exec('rollback');
        throw e;
      }
    },
  });
  return {
    path,
    db,
    port: port(db),
    unavailable() {
      available = false;
    },
    reopen() {
      const connection = new DatabaseSync(path);
      connection.exec('pragma synchronous=FULL; pragma busy_timeout=5000');
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
