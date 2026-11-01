// Disposable native PostgreSQL test worker. No environment credentials or arbitrary SQL.
import { Client } from 'pg';
import { createInterface } from 'node:readline';
let client;
const lines = createInterface({ input: process.stdin });
let chain = Promise.resolve();
lines.on('line', (line) => {
  chain = chain
    .then(async () => {
      const m = JSON.parse(line);
      let value;
      if (m.action === 'open') {
        if (
          !/^ev_test_[a-f0-9]{32}$/.test(m.config.database) ||
          !(
            m.config.host.startsWith('/private/tmp/propel-customer-pg-') ||
            m.config.host.startsWith('/tmp/propel-customer-pg-') ||
            m.config.host === '127.0.0.1'
          )
        )
          throw Error('Disposable connection required');
        client = new Client(m.config);
        await client.connect();
        await client.query('begin');
        await client.query("set local statement_timeout='5s'");
        value = (
          await client.query(
            "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
          )
        ).rows[0].v;
      } else if (m.action === 'execute')
        value = (
          await client.query(
            'select private.customer_record_review_request($1,$2) v',
            [m.principal, m.body],
          )
        ).rows[0].v;
      else if (m.action === 'commit-loss') {
        await client.query('commit');
        process.kill(process.pid, 'SIGKILL');
        return;
      } else if (m.action === 'rollback') {
        await client.query('rollback');
        value = null;
      } else if (m.action === 'close') {
        await client.end();
        value = null;
      } else throw Error('Unknown test phase');
      process.stdout.write(JSON.stringify({ value }) + '\n');
    })
    .catch(() =>
      process.stdout.write(
        JSON.stringify({ error: 'test operation unavailable' }) + '\n',
      ),
    );
});
