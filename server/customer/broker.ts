import { reviewCustomerBrokerOwnership } from './broker-ownership';
import {
  CustomerBrokerAuth,
  brokerActor,
  type BrokerIdentity,
} from './broker-auth';
import {
  assertDisposableCustomerConnections,
  runCustomerRequestTransaction,
  type CustomerSqlConnection,
} from './request-gateway';
import {
  customerRequestBody,
  customerRequestReference,
  customerRequestStatus,
  staffRequestQueue,
} from '../../src/lib/customer-requests';
import { reportUuid } from '../../src/domain/property/report-page';

export interface BrokerIntent {
  organization_id: string;
  publication_id: string;
  choice: 'approve_review' | 'decline_review' | 'request_changes_review';
  note: string;
  acknowledgment: 'review-only-v2';
  confirmed: true;
}
export function brokerIntent(v: unknown): BrokerIntent {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('Exact review intent required');
  const p = structuredClone(v) as Record<string, unknown>;
  if (
    Object.keys(p).sort().join(',') !==
      'acknowledgment,choice,confirmed,note,organization_id,publication_id' ||
    !reportUuid(p.organization_id) ||
    !reportUuid(p.publication_id) ||
    p.confirmed !== true ||
    p.acknowledgment !== 'review-only-v2' ||
    !['approve_review', 'decline_review', 'request_changes_review'].includes(
      String(p.choice),
    ) ||
    typeof p.note !== 'string'
  )
    throw Error('Exact review intent required');
  const note = p.note.trim();
  if (
    p.choice === 'request_changes_review'
      ? !note || Array.from(note).length > 2000
      : note !== ''
  )
    throw Error('Customer explanation invalid');
  if (note.includes('\0') || /[\uD800-\uDFFF]/u.test(note))
    throw Error('Customer explanation invalid');
  return {
    ...p,
    note,
    organization_id: String(p.organization_id).toLowerCase(),
    publication_id: String(p.publication_id).toLowerCase(),
  } as unknown as BrokerIntent;
}
export interface BrokerConnection extends CustomerSqlConnection {
  destroy(): Promise<void>;
}
type Ports = {
  registrar: BrokerConnection;
  issuer: BrokerConnection;
  executor: BrokerConnection;
  reader: BrokerConnection;
};
type Session = {
  database: string;
  pid: number;
  backend_start: string;
  login: string;
  current_role: string;
};
const inspect =
  'select current_database() database,pg_backend_pid() pid,backend_start::text,session_user::text login,current_user::text current_role from pg_stat_activity where pid=pg_backend_pid()';
async function pinned(connection: BrokerConnection) {
  const expected = (await connection.query<Session>(inspect)).rows[0];
  if (!expected || expected.login !== expected.current_role)
    throw Error('Dedicated LOGIN required');
  const check = async () => {
    const v = (await connection.query<Session>(inspect)).rows[0];
    if (!v || JSON.stringify(v) !== JSON.stringify(expected))
      throw Error('Session pooling or role drift rejected');
  };
  const port: CustomerSqlConnection = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) {
      await check();
      const r = await connection.query<T>(sql, params);
      await check();
      return r;
    },
  };
  return { expected, port };
}
/** Real injected SQL composition. No URL/pool/credential loader or hosted permit. */
export class CustomerBrokerDatabase {
  private used = false;
  private reading = false;
  private closed = false;
  private constructor(
    private readonly ports: Ports,
    private readonly bound: {
      [K in keyof Ports]: Awaited<ReturnType<typeof pinned>>;
    },
  ) {}
  static async disposable(ports: Ports) {
    try {
      await assertDisposableCustomerConnections(ports.issuer, ports.executor);
      const bound = {
        registrar: await pinned(ports.registrar),
        issuer: await pinned(ports.issuer),
        executor: await pinned(ports.executor),
        reader: await pinned(ports.reader),
      };
      if (
        bound.registrar.expected.login !== 'customer4b_registrar' ||
        bound.reader.expected.login !== 'customer4b_reader' ||
        new Set(Object.values(bound).map((x) => x.expected.pid)).size !== 4 ||
        new Set(Object.values(bound).map((x) => x.expected.database)).size !== 1
      )
        throw Error('Separate restricted broker leases required');
      // SQL independently validates role flags, memberships, ownership and raw grants.
      for (const [kind, lease] of [
        ['issuer', bound.issuer],
        ['executor', bound.executor],
      ] as const) {
        const r = await bound.registrar.port.query<{ ok: boolean }>(
          'select private.customer_broker_role_review($1,$2) ok',
          [lease.expected.login, kind],
        );
        if (r.rows[0]?.ok !== true)
          throw Error('Restricted runtime privilege review failed');
      }
      await reviewCustomerBrokerOwnership(bound.registrar.port);
      return new CustomerBrokerDatabase(ports, bound);
    } catch {
      await Promise.allSettled(Object.values(ports).map((p) => p.destroy()));
      throw Error('Restricted broker construction unavailable');
    }
  }
  async dispatch(
    identity: BrokerIdentity,
    intent: BrokerIntent,
    reverify: () => Promise<BrokerIdentity>,
  ) {
    if (this.used || this.closed)
      throw Error('Existing broker attempt; reconcile only');
    this.used = true;
    try {
      await reviewCustomerBrokerOwnership(this.bound.registrar.port);
      return await runCustomerRequestTransaction(
        this.bound.issuer.port,
        this.bound.executor.port,
        async (tx) => {
          const c = this.bound.registrar.port;
          await c.query('begin');
          await c.query("set local statement_timeout='5s'");
          const result = (
            await c.query<{ v: { principal: string; body: unknown } }>(
              'select private.customer_broker_admit($1,$2,$3,$4,$5) v',
              [
                brokerActor(identity),
                intent,
                this.bound.issuer.expected.login,
                this.bound.executor.expected.login,
                tx,
              ],
            )
          ).rows[0].v;
          await c.query('commit'); // Durable hold BEFORE the existing 4B claim/writer.
          const current = brokerActor(await reverify());
          if (JSON.stringify(current) !== JSON.stringify(brokerActor(identity)))
            throw Error('Identity changed');
          if (!reportUuid(result.principal))
            throw Error('Exact server principal required');
          return {
            principal: result.principal,
            body: customerRequestBody(result.body),
          };
        },
      );
    } catch {
      await this.ports.registrar.query('rollback').catch(() => {});
      throw Error(
        'Broker outcome UNKNOWN; exact read-only reconciliation only',
      );
    } finally {
      // One-use roles/sessions must never return to a transaction pool.
      await Promise.allSettled([
        this.ports.registrar.destroy(),
        this.ports.issuer.destroy(),
        this.ports.executor.destroy(),
      ]);
    }
  }
  private async read<T>(
    query: string,
    params: unknown[],
    parse: (v: unknown) => T,
  ) {
    if (this.reading || this.closed)
      throw Error('Dedicated reader unavailable');
    this.reading = true;
    const c = this.bound.reader.port;
    try {
      await reviewCustomerBrokerOwnership(c);
      await c.query('begin');
      await c.query("set local statement_timeout='5s'");
      const v = parse((await c.query<{ v: unknown }>(query, params)).rows[0].v);
      await c.query('commit');
      return v;
    } catch {
      await this.ports.reader.query('rollback').catch(() => {});
      throw Error('Authorized exact read unavailable; UNKNOWN');
    } finally {
      this.reading = false;
    }
  }
  receipt(identity: BrokerIdentity, organization: string, publication: string) {
    if (!reportUuid(organization) || !reportUuid(publication))
      throw Error('Exact source required');
    return this.read(
      'select private.customer_broker_receipt($1,$2,$3) v',
      [brokerActor(identity), organization, publication],
      (value) => {
        const ref = customerRequestReference(
          (value as { reference?: unknown })?.reference,
        );
        if (
          ref.user_id !== brokerActor(identity).user_id ||
          ref.organization_id !== organization ||
          ref.publication_id !== publication
        )
          throw Error('Exact own receipt required');
        return customerRequestStatus(value, ref);
      },
    );
  }
  queue(identity: BrokerIdentity, organization: string) {
    return this.read(
      'select private.customer_broker_staff_read($1,$2) v',
      [brokerActor(identity), organization],
      (value) => staffRequestQueue(value, organization),
    );
  }
  async close() {
    this.closed = true;
    await Promise.allSettled(Object.values(this.ports).map((p) => p.destroy()));
  }
}
/** Default off. Explicit disposable composition is not connected activation. */
export class CustomerRequestBroker {
  private held = false;
  constructor(
    private readonly auth: CustomerBrokerAuth,
    private readonly database?: CustomerBrokerDatabase,
  ) {}
  async submit(bearer: string, value: unknown) {
    if (!this.database || this.held)
      throw Error('Broker disabled or held; reconcile only');
    this.held = true;
    const intent = brokerIntent(value),
      identity = await this.auth.verify(bearer);
    try {
      const result = await this.database.dispatch(identity, intent, () =>
        this.auth.verify(bearer),
      );
      const after = brokerActor(await this.auth.verify(bearer));
      if (JSON.stringify(after) !== JSON.stringify(brokerActor(identity)))
        throw Error('Session changed');
      return result;
    } catch {
      throw Error('Broker outcome UNKNOWN; never retry');
    }
  }
  async reconcile(bearer: string, organization: string, publication: string) {
    if (!this.database) throw Error('Broker disabled');
    const identity = await this.auth.verify(bearer);
    const r = await this.database.receipt(identity, organization, publication);
    if (
      JSON.stringify(brokerActor(identity)) !==
      JSON.stringify(brokerActor(await this.auth.verify(bearer)))
    )
      throw Error('Session changed');
    return r;
  }
  async staffQueue(bearer: string, organization: string) {
    if (!this.database) throw Error('Broker disabled');
    const identity = await this.auth.verify(bearer);
    const r = await this.database.queue(identity, organization);
    if (
      JSON.stringify(brokerActor(identity)) !==
      JSON.stringify(brokerActor(await this.auth.verify(bearer)))
    )
      throw Error('Session changed');
    return r;
  }
  async close() {
    this.held = true;
    await this.database?.close();
  }
}
