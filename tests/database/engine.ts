import { PGlite } from '@electric-sql/pglite';
import { Client, types } from 'pg';
types.setTypeParser(20, (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : value;
});
import { randomUUID } from 'node:crypto';
export interface TestDatabase {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
  fork?(): Promise<TestDatabase>;
}
export function createTestDatabase(): TestDatabase {
  const socket = process.env.EV_TEST_PG_SOCKET;
  if (
    !socket &&
    !(process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true')
  )
    return new PGlite();
  if (socket && !/^\/(private\/)?tmp\/[a-zA-Z0-9_/-]+$/.test(socket))
    throw new Error(
      'Native database tests require a local temporary Unix socket',
    );
  const database = `ev_test_${randomUUID().replaceAll('-', '')}`;
  const config = socket
    ? { host: socket, port: 55477, user: 'ev_test' }
    : {
        host: '127.0.0.1',
        port: 5432,
        user: 'ev_test',
        password: 'synthetic-ci-only',
      };
  const admin = new Client({ ...config, database: 'postgres' });
  const session = new Client({ ...config, database });
  const ready = (async () => {
    await admin.connect();
    await admin.query(`create database "${database}"`);
    await session.connect();
  })();
  return {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) {
      await ready;
      const result = await session.query<T>(sql, params);
      return { rows: result.rows };
    },
    async exec(sql: string) {
      await ready;
      return session.query(sql);
    },
    async fork() {
      await ready;
      const peer = new Client({ ...config, database });
      await peer.connect();
      return {
        async query<T extends Record<string, unknown>>(
          sql: string,
          params?: unknown[],
        ) {
          const r = await peer.query<T>(sql, params);
          return { rows: r.rows };
        },
        async exec(sql: string) {
          return peer.query(sql);
        },
        async close() {
          await peer.end();
        },
      };
    },
    async close() {
      await ready;
      await session.end();
      await admin.query(`drop database "${database}"`);
      await admin.end();
    },
  };
}
