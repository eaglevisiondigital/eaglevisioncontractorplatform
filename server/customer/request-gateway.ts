import {
  customerRequestBody,
  customerRequestReference,
  customerRequestStatus,
  type CustomerRequestBody,
  type CustomerRequestCommandPort,
} from '../../src/lib/customer-requests';
export interface CustomerSqlConnection {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface CustomerConsumerTransaction {
  pid: number;
  backend_start: string;
  transaction_id: string;
}
export async function assertDisposableCustomerConnections(
  issuer: CustomerSqlConnection,
  executor: CustomerSqlConnection,
) {
  const inspect =
    "select current_database() database,pg_backend_pid() pid,current_setting('server_version_num')::int version";
  const a = (
    await issuer.query<{ database: string; pid: number; version: number }>(
      inspect,
    )
  ).rows[0];
  const b = (
    await executor.query<{ database: string; pid: number; version: number }>(
      inspect,
    )
  ).rows[0];
  if (
    !a ||
    !b ||
    a.database !== b.database ||
    !/^ev_test_[a-f0-9]{32}$/.test(a.database) ||
    Math.floor(a.version / 10000) !== 17 ||
    Math.floor(b.version / 10000) !== 17 ||
    a.pid === b.pid
  )
    throw Error('Separate disposable native PG17 connections required');
}
/** Shared existing 4B state machine. No live adapter or operational target permit. */
export async function runCustomerRequestTransaction(
  issuer: CustomerSqlConnection,
  executor: CustomerSqlConnection,
  prepare: (
    tx: CustomerConsumerTransaction,
  ) => Promise<{ principal: string; body: CustomerRequestBody }>,
) {
  await assertDisposableCustomerConnections(issuer, executor);
  try {
    await executor.query('begin');
    await executor.query("set local statement_timeout='5s'");
    const tx = (
      await executor.query<{ v: CustomerConsumerTransaction }>(
        "select jsonb_build_object('pid',pg_backend_pid(),'backend_start',backend_start,'transaction_id',txid_current()::text) v from pg_stat_activity where pid=pg_backend_pid()",
      )
    ).rows[0].v;
    // Broker admission can commit here independently, before the existing claim.
    const prepared = await prepare(tx),
      body = customerRequestBody(prepared.body);
    await issuer.query('begin');
    await issuer.query("set local statement_timeout='5s'");
    const ref = customerRequestReference(
      (
        await issuer.query<{ v: unknown }>(
          'select private.customer_request_claim($1,$2,$3) v',
          [prepared.principal, body, tx],
        )
      ).rows[0].v,
    );
    await issuer.query('commit');
    const result = customerRequestStatus(
      (
        await executor.query<{ v: unknown }>(
          'select private.customer_record_review_request($1,$2) v',
          [prepared.principal, body],
        )
      ).rows[0].v,
      ref,
    );
    await executor.query('commit');
    return result;
  } catch {
    await Promise.allSettled([
      issuer.query('rollback'),
      executor.query('rollback'),
    ]);
    throw Error('Customer request outcome UNKNOWN; never replay');
  }
}
/** Original disposable-only API and permanent per-instance hold are preserved. */
export async function disposableCustomerRequestGateway(
  issuer: CustomerSqlConnection,
  executor: CustomerSqlConnection,
  principal: string,
): Promise<CustomerRequestCommandPort> {
  await assertDisposableCustomerConnections(issuer, executor);
  let held = false;
  return {
    mode: 'disposable-local',
    async submit(value: CustomerRequestBody) {
      if (held) throw Error('Existing gateway attempt; reconcile only');
      held = true;
      const body = customerRequestBody(value);
      return runCustomerRequestTransaction(issuer, executor, async () => ({
        principal,
        body,
      }));
    },
  };
}
