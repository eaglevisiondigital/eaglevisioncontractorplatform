import {
  CustomerBrokerAuth,
  brokerActor,
  type BrokerActor,
} from '../customer/broker-auth';
import type { GatewaySql } from '../payments/postgres-store';
import type { CommercialDraft, DraftWrite } from './commercial-draft-client';

/** UNAPPLIED source proposal. No connection factory, credentials or route.
 * The reviewed server must exclusively own this dedicated connection. Native
 * fixtures/GUCs are NOT genuine Auth or independent operational custody.
 */
export interface InvoiceConnectionScope {
  database: string;
  pid: number;
  backend_start: string;
  login: string;
  current_role: string;
}
export interface OriginalDraftAttempt extends DraftWrite {
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly requestHash: string;
}
const authenticate = CustomerBrokerAuth.prototype.verify;
const active = new WeakSet<GatewaySql>();
const issued = new WeakSet<object>();
const inspect = `select current_database() database,pg_backend_pid() pid,
 backend_start::text,session_user::text login,current_user::text current_role,
 current_setting('request.jwt.claims',true) claims
 from pg_stat_activity where pid=pg_backend_pid()`;
const requestHash = `select encode(sha256(convert_to(jsonb_build_array(
 $1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid,$6::uuid,$7::uuid,
 $8::text,$9::text,$10::uuid)::text,'UTF8')),'hex') request_hash`;
const deny = () => Error('Current authenticated invoice connection required');
const sameActor = (a: BrokerActor, b: BrokerActor) =>
  a.user_id === b.user_id &&
  a.session_id === b.session_id &&
  a.aal === 'aal2' &&
  b.aal === 'aal2' &&
  a.expires_at === b.expires_at;

export interface CommercialCallerContext {
  query: GatewaySql['query'];
  bind: (
    organizationId: string,
    write: DraftWrite,
  ) => Promise<OriginalDraftAttempt>;
  sameCaller: (attempt: OriginalDraftAttempt) => boolean;
  owns: (draft: CommercialDraft) => boolean;
  matches: (draft: CommercialDraft, attempt: OriginalDraftAttempt) => boolean;
}

export class CommercialCallerConnection {
  readonly #expected: Readonly<InvoiceConnectionScope>;
  #actor?: Readonly<BrokerActor>;
  readonly #connection: GatewaySql;
  readonly #auth: CustomerBrokerAuth;
  readonly #bearer: string;
  constructor(
    connection: GatewaySql,
    auth: CustomerBrokerAuth,
    bearer: string,
    expected: InvoiceConnectionScope,
  ) {
    this.#connection = connection;
    this.#auth = auth;
    this.#bearer = bearer;
    const keys = [
      'database',
      'pid',
      'backend_start',
      'login',
      'current_role',
    ] as const;
    if (
      !expected ||
      typeof expected !== 'object' ||
      Array.isArray(expected) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(expected))
    )
      throw deny();
    const descriptors = Object.getOwnPropertyDescriptors(expected);
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some((key) => !descriptors[key] || !('value' in descriptors[key]))
    )
      throw deny();
    const scope = Object.fromEntries(
      keys.map((key) => [key, descriptors[key].value]),
    ) as unknown as InvoiceConnectionScope;
    this.#expected = Object.freeze(scope);
    if (
      !bearer ||
      typeof bearer !== 'string' ||
      !Number.isSafeInteger(scope.pid) ||
      scope.pid <= 0 ||
      ![
        scope.database,
        scope.backend_start,
        scope.login,
        scope.current_role,
      ].every((s) => typeof s === 'string' && s.length > 0)
    )
      throw deny();
    issued.add(this);
  }

  async #current(original?: BrokerActor): Promise<BrokerActor> {
    // Reuse the existing opaque Auth proof; deserialized actor IDs cannot mint it.
    const proof = await authenticate.call(this.#auth, this.#bearer);
    const actor = brokerActor(proof);
    if (
      actor.aal !== 'aal2' ||
      (original && !sameActor(actor, original)) ||
      (this.#actor && !sameActor(actor, this.#actor))
    )
      throw deny();
    const result =
      await this.#connection.query<Record<string, unknown>>(inspect);
    if (result.rows.length !== 1) throw deny();
    const row = result.rows[0];
    for (const key of Object.keys(
      this.#expected,
    ) as (keyof InvoiceConnectionScope)[])
      if (row[key] !== this.#expected[key]) throw deny();
    const claims: unknown =
      typeof row.claims === 'string' ? JSON.parse(row.claims) : null;
    if (!claims || typeof claims !== 'object' || Array.isArray(claims))
      throw deny();
    const c = claims as Record<string, unknown>;
    // Consistency on the authenticated server's connection, NOT authentication by GUC.
    if (
      c.sub !== actor.user_id ||
      c.session_id !== actor.session_id ||
      c.aal !== 'aal2' ||
      c.exp !== actor.expires_at
    )
      throw deny();
    brokerActor(proof); // Proof/expiry must remain current after the SQL await.
    const fresh = brokerActor(
      await authenticate.call(this.#auth, this.#bearer),
    );
    if (!sameActor(actor, fresh)) throw deny();
    this.#actor ??= Object.freeze({ ...actor });
    return actor;
  }
  async run<T>(
    sql: GatewaySql,
    action: (context: CommercialCallerContext) => Promise<T>,
  ): Promise<T> {
    if (sql !== this.#connection || active.has(sql)) throw deny();
    active.add(sql);
    try {
      const actor = await this.#current();
      const query: GatewaySql['query'] = async <
        R extends Record<string, unknown>,
      >(
        text: string,
        parameters?: unknown[],
      ) => {
        await this.#current(actor);
        const result = await sql.query<R>(text, parameters);
        await this.#current(actor);
        return result;
      };
      const sameCaller = (attempt: OriginalDraftAttempt) =>
        attempt.actorId === actor.user_id &&
        attempt.sessionId === actor.session_id;
      const result = await action({
        query,
        sameCaller,
        owns: (draft) => draft.receipt.actorId === actor.user_id,
        async bind(organizationId, write) {
          const v = Object.freeze({ ...write });
          const r = await query<{ request_hash: string }>(requestHash, [
            organizationId,
            v.invoiceId,
            v.commandId,
            v.expectedRevision,
            v.customerId,
            v.locationId,
            v.sourceVersionId,
            v.title,
            v.memo,
            actor.user_id,
          ]);
          const hash = r.rows[0]?.request_hash;
          if (
            r.rows.length !== 1 ||
            typeof hash !== 'string' ||
            !/^[a-f0-9]{64}$/.test(hash)
          )
            throw deny();
          return Object.freeze({
            ...v,
            organizationId,
            actorId: actor.user_id,
            sessionId: actor.session_id,
            requestHash: hash,
          });
        },
        matches(draft, attempt) {
          return (
            sameCaller(attempt) &&
            draft.sourceCurrent &&
            draft.organizationId === attempt.organizationId &&
            draft.invoiceId === attempt.invoiceId &&
            draft.customerId === attempt.customerId &&
            draft.locationId === attempt.locationId &&
            draft.sourceVersionId === attempt.sourceVersionId &&
            draft.receipt.commandId === attempt.commandId &&
            draft.receipt.actorId === attempt.actorId &&
            draft.receipt.requestHash === attempt.requestHash &&
            draft.revision === attempt.expectedRevision + 1 &&
            draft.title === attempt.title &&
            draft.memo === attempt.memo
          );
        },
      });
      await this.#current(actor);
      return result;
    } catch {
      throw deny();
    } finally {
      active.delete(sql);
    }
  }
}

// Only objects minted by this module may carry the connection contract. Capture
// the reviewed method so a caller-supplied shape/override cannot forge its proof.
const originalRun = CommercialCallerConnection.prototype.run;
export function runWithCommercialCaller<T>(
  caller: CommercialCallerConnection | undefined,
  sql: GatewaySql,
  action: (context: CommercialCallerContext) => Promise<T>,
): Promise<T> {
  if (!caller || !issued.has(caller)) throw deny();
  return Reflect.apply(originalRun, caller, [sql, action]) as Promise<T>;
}
