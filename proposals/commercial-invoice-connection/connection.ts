import { types } from 'node:util';
import {
  CustomerBrokerAuth,
  brokerActor,
  type BrokerActor,
} from '../../server/customer/broker-auth';
import {
  CommercialCallerConnection,
  runWithCommercialCaller,
  type InvoiceConnectionScope,
} from '../../server/invoices/commercial-caller-connection';
import {
  CommercialDraftClient,
  type DraftWrite,
  type CommercialDraft,
} from '../../server/invoices/commercial-draft-client';
import type { GatewaySql } from '../../server/payments/postgres-store';
import { presentIssuedInvoice } from '../commercial-invoice-issuance/presentation';
import { assertConnectionSources } from './source';

const verify = CustomerBrokerAuth.prototype.verify;
const draftCreate = CommercialDraftClient.prototype.create,
  draftSave = CommercialDraftClient.prototype.save,
  draftRead = CommercialDraftClient.prototype.read;
const leased = new WeakSet<GatewaySql>();
let cleanupUnknown = false;
const physical = new Map<string, object>();
const commands = new Set<string>();
const draftOwners = new Map<string, object>();
interface DraftHold {
  owner: object;
  write: Readonly<DraftWrite>;
  actor: BrokerActor;
  hash?: string;
}
const uncertainDraftSources = new Map<string, DraftHold>();
const id = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const unavailable = () => Error('Disposable invoice connection unavailable');
const checkSource = () => {
  if (cleanupUnknown) throw unavailable();
  assertConnectionSources();
};
function snapshot(value: unknown, required: string[], optional: string[] = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw unavailable();
  const d = Object.getOwnPropertyDescriptors(value),
    allowed = new Set([...required, ...optional]);
  if (
    required.some((k) => !d[k]) ||
    Reflect.ownKeys(d).some(
      (k) => typeof k !== 'string' || !allowed.has(k) || !('value' in d[k]),
    )
  )
    throw unavailable();
  return Object.freeze(
    Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.value])),
  );
}

const unknown = () =>
  Error('Invoice issuance UNKNOWN; original receipt read only; no replay');
const scopeQuery = `select current_database() database,pg_backend_pid() pid,
 backend_start::text,session_user::text login,current_user::text current_role
 from pg_stat_activity where pid=pg_backend_pid()`;
const roleQuery = `select r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
 (select count(*)::integer from pg_auth_members m where m.member=r.oid) memberships,
 (pg_has_role(session_user,$1,'MEMBER') and pg_has_role(session_user,$1,'USAGE')) permitted,r.rolinherit login_inherit,current_user::text current_name,
 x.rolname::text runtime_name,x.rolsuper runtime_super,x.rolbypassrls runtime_bypass,
 x.rolcreatedb runtime_createdb,x.rolcreaterole runtime_createrole,x.rolreplication runtime_replication,x.rolcanlogin runtime_login,
 (select count(*)::integer from pg_auth_members m where m.member=x.oid) runtime_memberships
 from pg_roles r join pg_roles x on x.rolname=$1 where r.rolname=session_user`;
const dangerous = [
  'rolsuper',
  'rolbypassrls',
  'rolcreatedb',
  'rolcreaterole',
  'rolreplication',
  'runtime_super',
  'runtime_bypass',
  'runtime_createdb',
  'runtime_createrole',
  'runtime_replication',
  'runtime_login',
];

export interface IssuanceTarget {
  organizationId: string;
  invoiceId: string;
  customerId: string;
  locationId: string | null;
  sourceVersionId: string;
  revision: number;
  sourceHash: string;
}
interface Hold {
  target: string;
  command: string;
  actor: BrokerActor;
  hash?: string;
  resolved: boolean;
}
// Process-local admission metadata only, NOT durable custody or a business ledger.
// A new connection cannot silently replace an ambiguous original attempt.
const holds = new Map<string, Hold>();
const actorEqual = (a: BrokerActor, b: BrokerActor) =>
  a.user_id === b.user_id &&
  a.session_id === b.session_id &&
  a.aal === 'aal2' &&
  b.aal === 'aal2' &&
  a.expires_at === b.expires_at;
export interface DisposableInvoicePorts {
  auth: CustomerBrokerAuth;
  bearer: string;
  acquire(): Promise<{ sql: GatewaySql; destroy(): Promise<void> }>;
}
export interface DisposableInvoiceBinding {
  organizationId: string;
  workload: 'draft' | 'issue';
  target?: IssuanceTarget;
  numbering:
    | 'NOT_ACCEPTED'
    | 'FICTIONAL_FULL_UUID_ONLY'
    | 'FICTIONAL_APPROVED_YEAR_ONLY';
}
/** No credentials, pg connector, role switch, grants, operational target or route.
 * Only explicit disposable ev_test databases and dedicated fixture LOGINs qualify.
 * The acquire implementation is a trusted TEST seam, never a hosted adapter.
 */
export async function prepareDisposableInvoiceConnection(
  ports: DisposableInvoicePorts,
  binding: DisposableInvoiceBinding,
  enabled = false,
) {
  if (enabled !== true) return null;
  if (cleanupUnknown) throw unavailable();
  binding = snapshot(
    binding,
    ['organizationId', 'workload', 'numbering'],
    ['target'],
  ) as unknown as DisposableInvoiceBinding;
  checkSource();
  const organizationId = binding.organizationId,
    workload = binding.workload,
    numbering = binding.numbering;
  if (
    typeof organizationId !== 'string' ||
    !id.test(organizationId) ||
    !['draft', 'issue'].includes(workload)
  )
    throw unavailable();
  const target = binding.target
    ? (snapshot(binding.target, [
        'organizationId',
        'invoiceId',
        'customerId',
        'locationId',
        'sourceVersionId',
        'revision',
        'sourceHash',
      ]) as unknown as IssuanceTarget)
    : undefined;
  if (
    ![
      'NOT_ACCEPTED',
      'FICTIONAL_FULL_UUID_ONLY',
      'FICTIONAL_APPROVED_YEAR_ONLY',
    ].includes(numbering) ||
    (workload === 'draft' && target !== undefined)
  )
    throw unavailable();
  if (
    workload === 'issue' &&
    (!target ||
      target.organizationId !== organizationId ||
      ![target.invoiceId, target.customerId, target.sourceVersionId].every(
        (v) => typeof v === 'string' && id.test(v),
      ) ||
      (target.locationId !== null &&
        (typeof target.locationId !== 'string' ||
          !id.test(target.locationId))) ||
      !Number.isSafeInteger(target.revision) ||
      target.revision < 1 ||
      typeof target.sourceHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(target.sourceHash))
  )
    throw unavailable();
  const role =
    workload === 'draft'
      ? 'propel_invoice_connection_test_draft_runtime'
      : 'propel_invoice_connection_test_issue_runtime';
  const login =
    workload === 'draft'
      ? 'propel_invoice_connection_test_draft_login'
      : 'propel_invoice_connection_test_issue_login';
  const auth = ports.auth,
    bearer = ports.bearer;
  if (
    !(auth instanceof CustomerBrokerAuth) ||
    typeof bearer !== 'string' ||
    !bearer
  )
    throw unavailable();
  const actor = brokerActor(await verify.call(auth, bearer));
  checkSource();
  if (actor.aal !== 'aal2') throw unavailable();
  const acquire = ports.acquire;
  if (typeof acquire !== 'function') throw unavailable();
  const lease = await acquire.call(ports);
  if (
    !lease ||
    typeof lease.sql?.query !== 'function' ||
    typeof lease.destroy !== 'function'
  )
    throw unavailable();
  const originalSql = lease.sql,
    destroy = lease.destroy.bind(lease);
  const originalQuery = originalSql.query.bind(originalSql);
  let owned = false,
    closed = false,
    busy = false;
  const ownerToken = {};
  let physicalKey: string | undefined,
    aliased = false;
  try {
    checkSource();
    if (leased.has(originalSql)) throw unavailable();
    leased.add(originalSql);
    owned = true;
    const scopeResult =
      await originalQuery<Record<string, unknown>>(scopeQuery);
    checkSource();
    if (scopeResult.rows.length !== 1) throw unavailable();
    const scope = scopeResult.rows[0];
    if (
      typeof scope.database !== 'string' ||
      !/^ev_test_[a-f0-9]{32}$/.test(scope.database) ||
      !Number.isSafeInteger(scope.pid) ||
      Number(scope.pid) <= 0 ||
      typeof scope.backend_start !== 'string' ||
      !scope.backend_start
    )
      throw unavailable();
    physicalKey = JSON.stringify([
      scope.database,
      scope.pid,
      scope.backend_start,
    ]);
    if (physical.has(physicalKey)) {
      aliased = true;
      throw unavailable();
    }
    physical.set(physicalKey, ownerToken);
    if (scope.login !== login || scope.current_role !== login)
      throw unavailable();
    const roleResult = await originalQuery<Record<string, unknown>>(roleQuery, [
      role,
    ]);
    checkSource();
    const r = roleResult.rows[0];
    if (
      roleResult.rows.length !== 1 ||
      !r ||
      dangerous.some((k) => r[k] !== false) ||
      r.memberships !== 1 ||
      r.permitted !== true ||
      r.runtime_name !== role ||
      r.runtime_memberships !== 0 ||
      r.login_inherit !== true ||
      r.current_name !== login
    )
      throw unavailable();
    const fresh = brokerActor(await verify.call(auth, bearer));
    checkSource();
    if (!actorEqual(actor, fresh)) throw unavailable();
    // Trusted verified claims only; no browser actor assertions or arbitrary SET ROLE.
    await originalQuery(
      `select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims',$1,false)`,
      [
        JSON.stringify({
          sub: actor.user_id,
          session_id: actor.session_id,
          aal: 'aal2',
          exp: actor.expires_at,
        }),
      ],
    );
    checkSource();
    if (!actorEqual(actor, brokerActor(await verify.call(auth, bearer))))
      throw unavailable();
    const roleCurrent = async () => {
      const result = await originalQuery<Record<string, unknown>>(roleQuery, [
        role,
      ]);
      checkSource();
      const row = result.rows[0];
      if (
        closed ||
        result.rows.length !== 1 ||
        !row ||
        dangerous.some((k) => row[k] !== false) ||
        row.memberships !== 1 ||
        row.permitted !== true ||
        row.runtime_name !== role ||
        row.runtime_memberships !== 0 ||
        row.login_inherit !== true ||
        row.current_name !== login
      )
        throw unavailable();
    };
    const sql: GatewaySql = {
      async query<T extends Record<string, unknown>>(
        text: string,
        parameters?: unknown[],
      ) {
        if (closed) throw unavailable();
        checkSource();
        await roleCurrent();
        const create = text.startsWith(
            'select private.commercial_invoice_draft_create(',
          ),
          save = text.startsWith(
            'select private.commercial_invoice_draft_save(',
          );
        if (create || save) {
          if (
            workload !== 'draft' ||
            !parameters ||
            parameters[0] !== organizationId
          )
            throw unknown();
          const held = uncertainDraftSources.get(
            organizationId + '/' + parameters[create ? 5 : 6],
          );
          if (
            !held ||
            held.owner !== ownerToken ||
            !held.hash ||
            !actorEqual(held.actor, actor)
          )
            throw unknown();
          const w = held.write,
            expected = create
              ? [
                  organizationId,
                  w.invoiceId,
                  w.commandId,
                  w.customerId,
                  w.locationId,
                  w.sourceVersionId,
                  w.title,
                  w.memo,
                ]
              : [
                  organizationId,
                  w.invoiceId,
                  w.commandId,
                  w.expectedRevision,
                  w.customerId,
                  w.locationId,
                  w.sourceVersionId,
                  w.title,
                  w.memo,
                ];
          if (JSON.stringify(parameters) !== JSON.stringify(expected))
            throw unknown();
        }
        const result = await originalQuery<T>(text, parameters);
        await roleCurrent();
        checkSource();
        if (closed) throw unavailable();
        // Capture only the original caller module's exact bound request hash.
        if (
          workload === 'draft' &&
          parameters?.length === 10 &&
          text.includes('$10::uuid')
        ) {
          const held = uncertainDraftSources.get(
            organizationId + '/' + parameters[6],
          );
          if (held?.owner === ownerToken) {
            const w = held.write,
              expected = [
                organizationId,
                w.invoiceId,
                w.commandId,
                w.expectedRevision,
                w.customerId,
                w.locationId,
                w.sourceVersionId,
                w.title,
                w.memo,
                actor.user_id,
              ];
            const hash = result.rows[0]?.request_hash;
            if (
              JSON.stringify(parameters) !== JSON.stringify(expected) ||
              result.rows.length !== 1 ||
              typeof hash !== 'string' ||
              !/^[a-f0-9]{64}$/.test(hash)
            )
              throw unknown();
            held.hash = hash;
          }
        }
        return result;
      },
    };
    const caller = new CommercialCallerConnection(
      sql,
      auth,
      bearer,
      scope as unknown as InvoiceConnectionScope,
    );
    const client = new CommercialDraftClient(sql, organizationId, caller);
    const check = () => {
      if (closed) throw unavailable();
      checkSource();
    };
    const run = async <T>(action: () => Promise<T>) => {
      check();
      if (busy) throw unavailable();
      busy = true;
      try {
        const result = await action();
        check();
        return result;
      } finally {
        busy = false;
      }
    };
    const close = async () => {
      if (closed) return;
      closed = true;
      try {
        await destroy();
      } catch {
        cleanupUnknown = true;
        throw unavailable();
      }
      if (physicalKey && physical.get(physicalKey) === ownerToken)
        physical.delete(physicalKey);
      leased.delete(originalSql);
    };
    const finishDraft = (
      value: CommercialDraft,
      command: string | null,
      required: boolean,
    ) => {
      check();
      const k = organizationId + '/' + value.sourceVersionId,
        held = uncertainDraftSources.get(k),
        w = held?.write;
      const matched =
        !!held &&
        held.owner === ownerToken &&
        actorEqual(held.actor, actor) &&
        typeof held.hash === 'string' &&
        !!w &&
        command === w.commandId &&
        value.sourceCurrent === true &&
        value.organizationId === organizationId &&
        value.invoiceId === w.invoiceId &&
        value.customerId === w.customerId &&
        value.locationId === w.locationId &&
        value.sourceVersionId === w.sourceVersionId &&
        value.revision === w.expectedRevision + 1 &&
        value.title === w.title &&
        value.memo === w.memo &&
        value.receipt.commandId === w.commandId &&
        value.receipt.actorId === actor.user_id &&
        value.receipt.requestHash === held.hash;
      if (matched) uncertainDraftSources.delete(k);
      else if (required) throw unknown();
      return value;
    };
    const writeDraft = (input: DraftWrite, create: boolean) => {
      const w = snapshot(input, [
        'invoiceId',
        'customerId',
        'locationId',
        'sourceVersionId',
        'commandId',
        'expectedRevision',
        'title',
        'memo',
      ]) as unknown as DraftWrite;
      if (
        ![w.invoiceId, w.customerId, w.sourceVersionId, w.commandId].every(
          (v) => typeof v === 'string' && id.test(v),
        ) ||
        (w.locationId !== null &&
          (typeof w.locationId !== 'string' || !id.test(w.locationId))) ||
        !Number.isSafeInteger(w.expectedRevision) ||
        (create ? w.expectedRevision !== 0 : w.expectedRevision < 1) ||
        typeof w.title !== 'string' ||
        !w.title.trim() ||
        w.title.length > 200 ||
        typeof w.memo !== 'string' ||
        w.memo.length > 2000
      )
        return Promise.reject(unknown());
      const k = organizationId + '/' + w.sourceVersionId,
        ck = organizationId + '/' + w.commandId;
      if (
        uncertainDraftSources.has(k) ||
        (draftOwners.has(k) && draftOwners.get(k) !== ownerToken) ||
        commands.has(ck)
      )
        return Promise.reject(unknown());
      check();
      draftOwners.set(k, ownerToken);
      commands.add(ck);
      uncertainDraftSources.set(k, {
        owner: ownerToken,
        write: w,
        actor: Object.freeze({ ...actor }),
      });
      return run(async () =>
        finishDraft(
          await (create ? draftCreate : draftSave).call(client, w),
          w.commandId,
          true,
        ),
      );
    };
    const drafts =
      workload === 'draft'
        ? Object.freeze({
            create: async (input: DraftWrite) => writeDraft(input, true),
            save: async (input: DraftWrite) => writeDraft(input, false),
            read: (...args: Parameters<CommercialDraftClient['read']>) =>
              run(async () =>
                finishDraft(
                  await draftRead.apply(client, args),
                  args[1] ?? null,
                  false,
                ),
              ),
          })
        : undefined;
    const key = organizationId + '/' + target?.invoiceId,
      targetKey = JSON.stringify(target);
    const hashSql = `select encode(sha256(convert_to(jsonb_build_array('issue-v1',$1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid,$6::uuid,$7::uuid,$8::text,$9::uuid)::text,'UTF8')),'hex') request_hash`;
    const parameters = (command: string) => [
      organizationId,
      target!.invoiceId,
      command,
      target!.revision,
      target!.customerId,
      target!.locationId,
      target!.sourceVersionId,
      target!.sourceHash,
    ];
    // Test-only read-back over the ORIGINAL command. The packet being decoded
    // and any public display string cannot supply their own expected anchors.
    const issuedRecord = (
      value: unknown,
    ): Readonly<
      Record<string, unknown> & { receipt: Readonly<Record<string, unknown>> }
    > => {
      if (types.isProxy(value)) throw unknown();
      const packet = snapshot(value, [
        'state',
        'paymentState',
        'invoiceId',
        'organizationId',
        'customerId',
        'locationId',
        'sourceVersionId',
        'sourceHash',
        'revision',
        'number',
        'title',
        'currency',
        'amountMinor',
        'issuedAt',
        'receipt',
      ]);
      if (types.isProxy(packet.receipt)) throw unknown();
      return Object.freeze({
        ...packet,
        receipt: snapshot(packet.receipt, [
          'commandId',
          'actorId',
          'requestHash',
        ]),
      });
    };
    const resolveOriginal = async (
      context: { query: GatewaySql['query'] },
      value: unknown,
      command: string,
      hash: string,
      newlyIssued = false,
    ) => {
      const packet = issuedRecord(value);
      const result = await context.query<{ result: unknown }>(
        'select private.commercial_invoice_issued_read($1::uuid,$2::uuid,$3::uuid) result',
        [organizationId, target!.invoiceId, command],
      );
      check();
      if (result.rows.length !== 1) throw unknown();
      const original = issuedRecord(result.rows[0].result);
      for (const evidence of [packet, original]) {
        if (
          evidence.receipt.commandId !== command ||
          evidence.receipt.actorId !== actor.user_id ||
          evidence.receipt.requestHash !== hash
        )
          throw unknown();
      }
      const number = original.number;
      const legacy = 'INV-' + target!.invoiceId.replaceAll('-', '');
      if (numbering === 'FICTIONAL_FULL_UUID_ONLY' && number !== legacy)
        throw unknown();
      if (
        newlyIssued &&
        numbering === 'FICTIONAL_APPROVED_YEAR_ONLY' &&
        (typeof number !== 'string' || !/^INV-\d{4}-\d{6}$/.test(number))
      )
        throw unknown();
      const expected = {
        ...target!,
        issuedNumber: number as string,
        issuanceReceiptId: command,
      };
      const first = presentIssuedInvoice(original, expected);
      const safe = presentIssuedInvoice(packet, expected);
      if (JSON.stringify(first) !== JSON.stringify(safe)) throw unknown();
      return safe;
    };
    const issuer =
      workload === 'issue'
        ? Object.freeze({
            async issue(command: string) {
              check();
              if (
                ![
                  'FICTIONAL_FULL_UUID_ONLY',
                  'FICTIONAL_APPROVED_YEAR_ONLY',
                ].includes(numbering) ||
                typeof command !== 'string' ||
                !id.test(command) ||
                holds.has(key) ||
                commands.has(organizationId + '/' + command) ||
                uncertainDraftSources.has(
                  organizationId + '/' + target!.sourceVersionId,
                )
              )
                return Promise.reject(unknown());
              const held: Hold = {
                target: targetKey,
                command,
                actor: Object.freeze({ ...actor }),
                resolved: false,
              };
              holds.set(key, held);
              commands.add(organizationId + '/' + command);
              return run(async () => {
                try {
                  return await runWithCommercialCaller(
                    caller,
                    sql,
                    async (context) => {
                      const hash = await context.query<{
                        request_hash: string;
                      }>(hashSql, [...parameters(command), actor.user_id]);
                      if (
                        hash.rows.length !== 1 ||
                        !/^[a-f0-9]{64}$/.test(hash.rows[0].request_hash)
                      )
                        throw unknown();
                      held.hash = hash.rows[0].request_hash;
                      const result = await context.query<{ result: unknown }>(
                        'select private.commercial_invoice_issue($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid,$6::uuid,$7::uuid,$8::text) result',
                        parameters(command),
                      );
                      if (result.rows.length !== 1) throw unknown();
                      return resolveOriginal(
                        context,
                        result.rows[0].result,
                        command,
                        held.hash,
                        true,
                      );
                    },
                  );
                } catch {
                  throw unknown();
                }
              }).then((value) => {
                held.resolved = true;
                return value;
              });
            },
            readOriginal(command: string) {
              return run(async () => {
                if (typeof command !== 'string' || !id.test(command))
                  throw unknown();
                try {
                  return await runWithCommercialCaller(
                    caller,
                    sql,
                    async (context) => {
                      const hash = await context.query<{
                        request_hash: string;
                      }>(hashSql, [...parameters(command), actor.user_id]);
                      if (
                        hash.rows.length !== 1 ||
                        !/^[a-f0-9]{64}$/.test(hash.rows[0].request_hash)
                      )
                        throw unknown();
                      const result = await context.query<{ result: unknown }>(
                        'select private.commercial_invoice_issued_read($1::uuid,$2::uuid,$3::uuid) result',
                        [organizationId, target!.invoiceId, command],
                      );
                      if (result.rows.length !== 1) throw unknown();
                      return resolveOriginal(
                        context,
                        result.rows[0].result,
                        command,
                        hash.rows[0].request_hash,
                      );
                    },
                  );
                } catch {
                  throw unknown();
                }
              });
            },
            reconcile() {
              return run(async () => {
                const held = holds.get(key);
                if (
                  !held ||
                  held.target !== targetKey ||
                  !held.hash ||
                  !actorEqual(held.actor, actor)
                )
                  throw unknown();
                try {
                  const value = await runWithCommercialCaller(
                    caller,
                    sql,
                    async (context) => {
                      const result = await context.query<{ result: unknown }>(
                        'select private.commercial_invoice_issued_read($1::uuid,$2::uuid,$3::uuid) result',
                        [organizationId, target!.invoiceId, held.command],
                      );
                      if (result.rows.length !== 1) throw unknown();
                      return resolveOriginal(
                        context,
                        result.rows[0].result,
                        held.command,
                        held.hash!,
                      );
                    },
                  );
                  held.resolved = true;
                  return value;
                } catch {
                  throw unknown();
                }
              });
            },
            // Historical local attempt metadata, not a current Auth/receipt proof.
            status: () => {
              const held = holds.get(key);
              return !closed &&
                !cleanupUnknown &&
                held?.resolved &&
                held.target === targetKey &&
                actorEqual(held.actor, actor) &&
                actor.expires_at * 1000 > Date.now()
                ? 'CONFIRMED_ISSUANCE_ONLY'
                : 'UNKNOWN';
            },
          })
        : undefined;
    return Object.freeze({
      classification: 'DISPOSABLE_TEST_ONLY' as const,
      operationalReady: false as const,
      drafts,
      issuer,
      close,
    });
  } catch {
    if (owned) {
      if (!aliased) {
        try {
          await destroy();
        } catch {
          cleanupUnknown = true;
          throw unavailable();
        }
      }
      if (physicalKey && physical.get(physicalKey) === ownerToken)
        physical.delete(physicalKey);
      leased.delete(originalSql);
    }
    throw unavailable();
  }
}
