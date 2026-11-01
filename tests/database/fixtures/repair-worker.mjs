// Fault-injection/restart reader ONLY, same disposable harness restrictions as 2A.
import { Client } from 'pg';
const {
  EV_TEST_PG_SOCKET: socket,
  REPAIR_DATABASE: database,
  REPAIR_COMMAND: command,
  REPAIR_CLAIMS: claims,
  REPAIR_MODE: mode,
} = process.env;
const ci = process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true';
if (
  (!ci &&
    (!socket ||
      !/^\/(private\/)?tmp\/propel-maintenance-pg-[a-zA-Z0-9]+$/.test(
        socket,
      ))) ||
  !/^ev_test_[a-f0-9]{32}$/.test(database ?? '') ||
  ![
    'reserve_open',
    'claim_exit',
    'finish_exit',
    'finish_open',
    'review_exit',
    'review_open',
    'read',
  ].includes(mode)
)
  throw Error('Disposable repair probe only.');
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
await db.query("select set_config('request.jwt.claims',$1,false)", [claims]);
await db.query('begin');
if (mode === 'read') {
  const receipt = (
    await db.query('select maintenance_2b_test.reconcile($1::jsonb) v', [
      command,
    ])
  ).rows[0].v;
  const state =
    receipt.status === 'committed'
      ? (
          await db.query(
            'select maintenance_2b_test.readiness_context($1::jsonb) v',
            [command],
          )
        ).rows[0].v
      : null;
  await db.query('commit');
  await db.end();
  process.stdout.write(JSON.stringify({ receipt, state }));
} else {
  const fn =
    mode === 'reserve_open'
      ? 'reserve'
      : mode === 'claim_exit'
        ? 'claim'
        : 'finish';
  if (mode.startsWith('review_')) {
    const expected = (
      await db.query(
        'select maintenance_2b_test.readiness_context($1::jsonb) v',
        [command],
      )
    ).rows[0].v;
    await db.query('select maintenance_2b_test.append_review($1,$2,$3)', [
      JSON.parse(command),
      expected,
      JSON.parse(process.env.REPAIR_REVIEW),
    ]);
  } else
    await db.query(`select maintenance_2b_test.${fn}($1::jsonb)`, [command]);
  if (mode.endsWith('_open')) {
    process.stdout.write('UNCOMMITTED');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  } else await db.query('commit');
  // Deliberately lose the response after a durable commit. No replay in this process.
  process.exit(0);
}
