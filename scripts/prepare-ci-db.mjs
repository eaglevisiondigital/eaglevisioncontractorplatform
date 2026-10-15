import { Client } from 'pg';
if (process.env.CI !== 'true' || process.env.EV_TEST_PG_CI !== 'true')
  throw new Error('This prepares only the disposable CI PostgreSQL container');
const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'ev_test',
  password: 'synthetic-ci-only',
  database: 'postgres',
});
await client.connect();
try {
  await client.query(
    'create role anon nologin; create role authenticated nologin;',
  );
} finally {
  await client.end();
}
