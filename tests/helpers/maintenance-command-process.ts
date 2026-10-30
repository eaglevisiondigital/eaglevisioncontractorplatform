/** Runnable local-only stdio service, compiled by the native harness. No HTTP listener. */
import { Client, types } from 'pg';
import { once } from 'node:events';
import { parseCommandJSON } from './strict-command-json';
import { ServerClaimChannel } from './server-claim-channel';
import {
  CommandCustody,
  custodyIdentity,
  fingerprint,
  type CustodyCommand,
} from '../../server/property/command-custody';
import { NativeMaintenanceFixture } from './maintenance-native-store';
import { NativeRepairService } from './repair-native-service';
import type { TestDatabase } from '../database/engine';
types.setTypeParser(20, (value) =>
  Number.isSafeInteger(Number(value)) ? Number(value) : value,
);
const {
  EV_TEST_PG_SOCKET: socket,
  MAINT_SERVICE_DATABASE: database,
  MAINT_SERVICE_ROLE: role,
  MAINT_SERVICE_CAPABILITY: capability,
  MAINT_SERVICE_CUSTODY: root,
  MAINT_SERVICE_FAULT: fault,
} = process.env;
const ci = process.env.CI === 'true' && process.env.EV_TEST_PG_CI === 'true';
if (
  (!socket && !ci) ||
  (!!socket &&
    !/^\/(private\/)?tmp\/propel-maintenance-pg-[a-zA-Z0-9]+$/.test(socket)) ||
  !/^ev_test_[a-f0-9]{32}$/.test(database ?? '') ||
  !/^maintenance_2c_user_[a-f0-9]{32}$/.test(role ?? '') ||
  !capability ||
  !root
)
  throw Error('Disposable local service configuration required.');
const deadlines = {
  options:
    '-c lock_timeout=3000 -c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000',
  connectionTimeoutMillis: 5000,
};
const client = new Client(
  socket
    ? { ...deadlines, host: socket, port: 55477, user: role, database }
    : {
        ...deadlines,
        host: '127.0.0.1',
        port: 5432,
        user: role,
        password: process.env.MAINT_SERVICE_PASSWORD,
        database,
      },
);
const serverOwned = process.env.MAINT_SERVICE_AUTHORITY === '2e';
if (process.env.MAINT_SERVICE_AUTHORITY && !serverOwned)
  throw Error('Unsupported local authority mode.');
const claimChannel = serverOwned ? new ServerClaimChannel() : null;
const gatewaySQL = serverOwned
  ? 'select maintenance_2e_test.command($1::uuid,$2::text,$3::jsonb) value'
  : 'select maintenance_2c_test.command($1::uuid,$2::text,$3::jsonb) value';
const journal = new CommandCustody(root);
let inTransaction = false;
await client.connect();
const identity = (
  await client.query('select session_user name,current_database() database')
).rows[0];
if (identity.name !== role || identity.database !== database)
  throw Error('Exact unprivileged connection required.');
const privileges = (
  await client.query(
    "select rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,exists(select 1 from pg_auth_members where member=r.oid) membership,has_table_privilege(r.oid,'public.estimates','INSERT,UPDATE,DELETE') app_dml from pg_roles r where rolname=session_user",
  )
).rows[0];
if (!privileges || Object.values(privileges).some(Boolean))
  throw Error('Restricted noninheriting local identity required.');
const emit = async (value: unknown) => {
  // One response at a time; a stopped reader cannot build an unbounded output queue.
  if (!process.stdout.write(JSON.stringify(value) + '\n'))
    await once(process.stdout, 'drain');
};
async function boundary(name: string) {
  if (fault === name) {
    await emit({ status: 'boundary', boundary: name });
    await new Promise<void>(() => {});
  }
}
/** Only these existing helper queries can cross the capability gateway. No arbitrary SQL API. */
const adapter: TestDatabase = {
  async exec(sql) {
    if (!['begin', 'commit', 'rollback'].includes(sql))
      throw Error('Transaction control only.');
    const r = await client.query(sql);
    inTransaction = sql === 'begin';
    return r;
  },
  async query<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) {
    if (
      sql ===
      "select current_database() name,current_setting('server_version_num')::integer version"
    )
      return { rows: (await client.query(sql)).rows as T[] };
    const match =
      /^select maintenance_2[ab]_test\.([a-z_]+)\([^)]*\) (?:value|v)$/.exec(
        sql,
      );
    if (!match) throw Error('Unlisted local command transport denied.');
    const step = match[1];
    const args = params.map((value, i) =>
      step === 'save_draft' && i === 1
        ? value
        : typeof value === 'string'
          ? JSON.parse(value)
          : value,
    );
    const mutation = [
      'execute',
      'reserve',
      'claim',
      'finish',
      'review_intent',
      'append_review',
    ].includes(step);
    const auto = serverOwned && !inTransaction;
    if (auto) await client.query('begin');
    try {
      if (serverOwned && mutation) {
        const tx = (
          await client.query(
            'select pg_backend_pid() pid,backend_start::text,txid_current()::text transaction_id from pg_stat_activity where pid=pg_backend_pid()',
          )
        ).rows[0];
        await claimChannel!.request({ capability, step, args, tx });
        await boundary('after_server_claim');
      }
      const r = await client.query(gatewaySQL, [
        capability,
        step,
        JSON.stringify(args),
      ]);
      if (mutation) await boundary('during_mutation');
      if (auto) await client.query('commit');
      // Existing explicit transaction/process-fault hooks remain below.
      // Actual database transaction is open here. SIGKILL causes native PostgreSQL rollback.
      if (step === 'finish') await boundary('during_creation');
      if (step === 'append_review') await boundary('during_readiness');
      return { rows: r.rows as T[] };
    } catch (error) {
      if (auto) await client.query('rollback');
      throw error;
    }
  },
  async close() {
    await client.end();
  },
};
const maintenance = new NativeMaintenanceFixture(adapter),
  repair = new NativeRepairService(adapter);
async function reconcile(value: CustodyCommand) {
  const { id } = custodyIdentity(value),
    retained = journal.read(id);
  if (
    !retained ||
    retained.intent.capability_id !== capability ||
    fingerprint(retained.value) !== fingerprint(value)
  )
    throw Error('Original bound custody required.');
  let result: { status: string; [key: string]: unknown };
  let stage: 'command' | 'prepare' = 'command';
  if (value.kind === 'maintenance')
    result = await maintenance.reconcile(
      retained.value.command as typeof value.command,
    );
  else if (value.kind === 'repair') {
    stage = 'prepare';
    result = await repair.reconcile(
      retained.value.command as typeof value.command,
    );
  } else {
    result = await repair.reconcileReadiness(
      retained.value.command as typeof value.command,
    );
    if (result.status === 'committed') {
      const current = await repair.readiness(value.command.reservation);
      result = {
        ...result,
        current_review: {
          confirmed: current.confirmed,
          ready: current.ready,
          sequence: current.sequence,
        },
      };
    }
  }
  journal.reconcile(id, stage, result);
  return result;
}
async function execute(value: CustodyCommand) {
  await boundary('before_intent');
  // Read-only exact capability binding cannot manufacture a source/request hold.
  await client.query(gatewaySQL, [
    capability,
    'validate',
    JSON.stringify([value.command]),
  ]);
  const retained = journal.retain(value, capability!);
  // Restart/repeated execution can only reconcile; no automatic queue draining or resend.
  if (retained.existing) return reconcile(value);
  await boundary('after_intent');
  const id = retained.id;
  let stage: 'command' | 'reserve' | 'prepare' =
    value.kind === 'repair' ? 'reserve' : 'command';
  try {
    journal.transmitting(id, stage);
    let result: unknown;
    if (value.kind === 'maintenance')
      result = await maintenance.execute(value.command);
    else if (value.kind === 'readiness')
      result = await repair.appendReadiness(value.command);
    else {
      result = await repair.reserve(value.command);
      await boundary('after_reservation_commit');
      journal.acknowledge(id, 'reserve', result);
      await boundary('after_reserve');
      stage = 'prepare';
      journal.transmitting(id, stage);
      result = await repair.prepareOnce(value.command);
      await boundary('after_creation_commit');
    }
    await boundary('after_transmit');
    journal.acknowledge(id, stage, result);
    return { status: 'committed', receipt: result };
  } catch {
    // No exception details/private payload in logs. Failed local uncertainty recording
    // cannot erase the already committed transmitting event.
    try {
      journal.uncertain(id, stage);
    } catch {
      /* Remain transmitting/UNKNOWN. */
    }
    return { status: 'undetermined' };
  }
}
async function* messages() {
  let pending = Buffer.alloc(0),
    discard = false;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    for (let i = 0; i <= bytes.length; i++) {
      if (i !== bytes.length && bytes[i] !== 10) continue;
      const part = bytes.subarray(start, i);
      if (!discard) {
        if (pending.length + part.length > 2097152) {
          discard = true;
          pending = Buffer.alloc(0);
        } else pending = Buffer.concat([pending, part]);
      }
      if (i < bytes.length) {
        yield discard ? null : pending;
        pending = Buffer.alloc(0);
        discard = false;
      }
      start = i + 1;
    }
  }
  if (discard || pending.length) yield null; // Truncated input is never a command.
}
await emit({ status: 'ready' });
try {
  for await (const text of messages()) {
    if (text === null) {
      await emit({ status: 'rejected' });
      continue;
    }
    try {
      const request = parseCommandJSON(text) as {
        operation: string;
        command: CustodyCommand;
      };
      if (
        !request ||
        Object.keys(request).sort().join(',') !== 'command,operation' ||
        !['execute', 'reconcile'].includes(request.operation)
      )
        throw Error('Exact service protocol required.');
      custodyIdentity(request.command);
      const result =
        request.operation === 'execute'
          ? await execute(request.command)
          : await reconcile(request.command);
      await emit(result);
    } catch {
      await emit({ status: 'rejected' });
    }
  }
} finally {
  claimChannel?.close();
  journal.close();
  await client.end();
}
