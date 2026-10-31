// Child-process fault/restart probe. Disposable Unix-socket PostgreSQL ONLY.
import { Client } from 'pg';
const {
  EV_TEST_PG_SOCKET: socket,
  MAINT_TEST_DATABASE: database,
  MAINT_TEST_COMMAND: text,
  MAINT_TEST_CLAIMS: claims,
  MAINT_TEST_MODE: mode,
} = process.env;
const ci = process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true';
if (
  (!ci &&
    (!socket ||
      !/^\/(private\/)?tmp\/propel-maintenance-pg-[a-zA-Z0-9]+$/.test(
        socket,
      ))) ||
  !/^ev_test_[a-f0-9]{32}$/.test(database ?? '') ||
  !['commit_exit', 'uncommitted', 'read'].includes(mode)
)
  throw Error(
    'Only the dedicated disposable maintenance cluster is permitted.',
  );
const db = new Client(
  socket
    ? { host: socket, port: 55477, user: 'ev_test', database }
    : {
        host: '127.0.0.1',
        port: 5432,
        user: 'ev_test',
        password: 'synthetic-ci-only',
        database,
      },
);
await db.connect();
await db.query('begin');
await db.query("select set_config('request.jwt.claims',$1,true)", [claims]);
await db.query('set local role authenticated');
if (mode === 'read') {
  const receipt = (
    await db.query('select maintenance_2a_test.reconcile($1::jsonb) v', [text])
  ).rows[0].v;
  const item = (
    await db.query('select maintenance_2a_test.read_item($1::jsonb) v', [
      JSON.stringify(JSON.parse(text).source),
    ])
  ).rows[0].v;
  const archive = process.env.MAINT_TEST_ARCHIVE
    ? (
        await db.query(
          'select maintenance_2a_test.read_archive($1::jsonb,$2::uuid) v',
          [
            JSON.stringify(JSON.parse(text).source),
            process.env.MAINT_TEST_ARCHIVE,
          ],
        )
      ).rows[0].v
    : null;
  await db.query('commit');
  await db.end();
  process.stdout.write(JSON.stringify({ receipt, item, archive }));
} else {
  await db.query('select maintenance_2a_test.execute($1::jsonb)', [text]);
  if (mode === 'uncommitted') {
    process.stdout.write('UNCOMMITTED');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } else await db.query('commit');
  // Exit without handing a command receipt to the caller. Reconciliation is a separate read.
  process.exit(0);
}
