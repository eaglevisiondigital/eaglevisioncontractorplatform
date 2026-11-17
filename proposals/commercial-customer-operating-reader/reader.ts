import { readFileSync } from 'node:fs';
import { isProxy } from 'node:util/types';
import {
  CustomerBrokerAuth,
  type BrokerActor,
} from '../../server/customer/broker-auth';
import {
  runWithCommercialCaller,
  CommercialCallerConnection,
  type InvoiceConnectionScope,
} from '../../server/invoices/commercial-caller-connection';
import type { GatewaySql } from '../../server/payments/postgres-store';
import {
  commercialCustomerReadProposal,
  type CommercialCustomerReaderPort,
} from '../commercial-customer-bridge/reader';
import { customerPreview } from '../../src/domain/estimating/customer-preview';
import { projectIssuedReview } from '../../src/domain/customer/review';
import type { EstimateVersion } from '../../src/domain/estimating/types';
import type { CommercialCustomerTarget } from '../../src/components/invoices/commercial-customer-read';
import { readerScope, renderReaderSQL, type ReaderScope } from './binding';
import { operatingReaderCatalog } from './catalog';
import { assertOperatingSources } from './source';
const retired = new WeakSet<GatewaySql>();
const activeRead = new WeakSet<GatewaySql>();
const signalAborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  'aborted',
)!.get!;
const eventAdd = EventTarget.prototype.addEventListener;
const eventRemove = EventTarget.prototype.removeEventListener;
const inspectSQL = `select current_database() database,pg_backend_pid() pid,
 backend_start::text,session_user::text login,current_user::text current_role,
 current_setting('request.jwt.claims',true) claims
 from pg_stat_activity where pid=pg_backend_pid()`;

const deny = () =>
  Error('Commercial customer operating read unavailable · UNKNOWN');
function copy(
  v: unknown,
  seen = new Set<object>(),
  depth = 0,
  budget = { nodes: 0, bytes: 0 },
): unknown {
  if (++budget.nodes > 20000) throw deny();
  if (typeof v === 'string') {
    budget.bytes += v.length;
    if (budget.bytes > 1048576) throw deny();
  }

  if (
    v === null ||
    typeof v === 'string' ||
    typeof v === 'boolean' ||
    (typeof v === 'number' && Number.isFinite(v))
  )
    return v;
  if (!v || typeof v !== 'object' || isProxy(v) || depth > 20 || seen.has(v))
    throw deny();
  if (
    !Array.isArray(v) &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(v))
  )
    throw deny();
  seen.add(v);
  const out: Record<string, unknown> = {};
  for (const k of Reflect.ownKeys(v)) {
    if (Array.isArray(v) && k === 'length') continue;
    if (typeof k !== 'string') throw deny();
    const d = Object.getOwnPropertyDescriptor(v, k)!;
    if (!('value' in d)) throw deny();
    Object.defineProperty(out, k, {
      enumerable: true,
      value: copy(d.value, seen, depth + 1, budget),
    });
  }
  seen.delete(v);
  if (!Array.isArray(v)) return out;
  if (
    v.length > 500 ||
    Object.keys(out).length !== v.length ||
    Object.keys(out).some((k, i) => k !== String(i))
  )
    throw deny();
  return Object.values(out);
}
const record = (v: unknown) => {
  const c = copy(v);
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw deny();
  return c as Record<string, unknown>;
};
function one(v: unknown, key: string) {
  const r = record(v);
  if (
    Object.keys(r).join() !== 'rows' ||
    !Array.isArray(r.rows) ||
    r.rows.length !== 1
  )
    throw deny();
  const row = record(r.rows[0]);
  if (Object.keys(row).join() !== key) throw deny();
  return copy(row[key]);
}
const names = [
  'commercial_customer_invoice_authorize',
  'commercial_customer_invoice_read_issued',
] as const;
function profile(
  v: unknown,
  b: Readonly<ReaderScope>,
  hashes: Record<string, string>,
) {
  const p = record(v);
  if (
    p.login !== b.login ||
    p.currentRole !== b.login ||
    p.canLogin !== true ||
    p.memberships !== 0 ||
    p.isolation !== 'read committed' ||
    p.schemaUsage !== true ||
    p.portalOwnerACL !== true ||
    p.portalPolicy !== true ||
    p.portalRls !== true ||
    [
      'superuser',
      'bypassRls',
      'createDb',
      'createRole',
      'replication',
      'schemaFallback',
      'schemaCreate',
      'rawAccess',
      'otherDefiner',
    ].some((k) => p[k] !== false) ||
    !Array.isArray(p.functions) ||
    p.functions.length !== 2
  )
    throw deny();
  p.functions.forEach((x, i) => {
    const f = record(x);
    if (
      f.name !== names[i] ||
      f.owner !== b.owner ||
      f.ownerLogin !== false ||
      f.ownerSuper !== false ||
      f.ownerBypass !== false ||
      f.definer !== true ||
      f.volatility !== 'v' ||
      f.language !== 'plpgsql' ||
      f.args !== 0 ||
      f.result !== 'jsonb' ||
      JSON.stringify(f.config) !== JSON.stringify(['search_path=""']) ||
      f.bodyHash !== hashes[names[i]] ||
      f.directExecute !== true ||
      f.publicExecute !== false ||
      f.grantOption !== false
    )
      throw deny();
  });
  return JSON.stringify(p);
}
function mapping(
  v: unknown,
  b: Readonly<ReaderScope>,
  a: Readonly<BrokerActor>,
) {
  const m = record(v);
  const values = {
    userId: b.userId,
    sessionId: b.sessionId,
    organizationId: b.organizationId,
    customerId: b.customerId,
    locationId: b.locationId,
    invoiceId: b.invoiceId,
    sourceVersionId: b.sourceVersionId,
    sourceHash: b.sourceHash,
    revision: b.revision,
    mappingRevision: b.reviewId,
    issuanceReceiptId: b.issuanceReceiptId,
  };
  if (
    Object.keys(m).length !== Object.keys(values).length + 4 ||
    m.mode !== 'fictional-local' ||
    m.active !== true ||
    Object.entries(values).some(([k, x]) => m[k] !== x) ||
    a.user_id !== b.userId ||
    a.session_id !== b.sessionId ||
    a.aal !== 'aal2' ||
    !Number.isSafeInteger(m.expiresAt) ||
    Number(m.expiresAt) <= Date.now() ||
    Number(m.expiresAt) > b.expiresAt ||
    Number(m.expiresAt) > a.expires_at * 1000 ||
    typeof m.issuedNumber !== 'string'
  )
    throw deny();
  return m;
}
/** Server-only source candidate. No connection/Auth/role/route factory. The fixed
 * SQL scope + dedicated EXECUTE is authority; caller config is expected data only.
 * Existing bridge remains fictional-local/default-OFF pending separate admission.
 */
export function operatingCustomerInvoiceRead(
  auth: CustomerBrokerAuth,
  bearer: string,
  connection: GatewaySql,
  backend: InvoiceConnectionScope,
  input: ReaderScope,
  options: { enabled: boolean; mode: 'disposable-proposal' } = {
    enabled: false,
    mode: 'disposable-proposal',
  },
) {
  const b = readerScope(input);
  const folder = 'proposals/commercial-customer-operating-reader/';
  assertOperatingSources();
  const hashes = renderReaderSQL(
    readFileSync(folder + 'read.proposed.sql.in', 'utf8'),
    readFileSync(folder + 'runtime-grants.sql.in', 'utf8'),
    b,
  ).bodyHashes;
  if (isProxy(connection)) throw deny();
  const qd = Object.getOwnPropertyDescriptor(connection, 'query');
  if (
    !qd ||
    !('value' in qd) ||
    typeof qd.value !== 'function' ||
    isProxy(qd.value)
  )
    throw deny();
  const rawQuery = qd.value.bind(connection) as GatewaySql['query'];
  let wireGate: (() => void) | undefined;
  let dispatched = false;
  const allowed = new Set([
    inspectSQL,
    operatingReaderCatalog,
    'select private.commercial_customer_invoice_authorize() result',
    'select private.commercial_customer_invoice_read_issued() result',
  ]);
  const guarded: GatewaySql = {
    async query<T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) {
      if (!wireGate || !allowed.has(text) || (params && params.length))
        throw deny();
      wireGate();
      if (retired.has(connection)) throw deny();
      dispatched = true;
      const value = await rawQuery<T>(text, params);
      wireGate();
      if (retired.has(connection)) throw deny();
      return value;
    },
  };
  const caller = new CommercialCallerConnection(guarded, auth, bearer, backend);
  const configured = record(options);
  const enabled =
    configured.enabled === true &&
    configured.mode === 'disposable-proposal' &&
    Object.keys(configured).length === 2;
  const port: CommercialCustomerReaderPort = {
    kind: 'unwired-test-port',
    authorize: (a, t, s) => run(a, t, s, false),
    readIssued: (a, t, s) => run(a, t, s, true),
  };
  async function run(
    actor: Readonly<BrokerActor>,
    target: CommercialCustomerTarget['invoice'],
    signal: AbortSignal,
    issued: boolean,
  ) {
    const a = record(actor) as unknown as BrokerActor,
      t = record(target),
      start = Date.now(),
      deadline = Math.min(start + 4500, b.expiresAt, a.expires_at * 1000);
    let last = start,
      began = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      onAbort: (() => void) | undefined;
    const gate = () => {
      if (
        !enabled ||
        retired.has(connection) ||
        isProxy(connection) ||
        signal.aborted ||
        Date.now() < last ||
        Date.now() >= deadline ||
        JSON.stringify(record(target)) !== JSON.stringify(t)
      )
        throw deny();
      last = Date.now();
      assertOperatingSources();
    };
    try {
      gate();
      if (
        Object.entries({
          organizationId: b.organizationId,
          customerId: b.customerId,
          locationId: b.locationId,
          invoiceId: b.invoiceId,
          sourceVersionId: b.sourceVersionId,
          revision: b.revision,
        }).some(([k, v]) => t[k] !== v) ||
        Object.keys(t).length !== 6
      )
        throw deny();
      began = true;
      wireGate = gate;
      const work = runWithCommercialCaller(caller, guarded, async (c) => {
        const query = async (text: string) => {
          gate();
          const out = await c.query(text);
          gate();
          return out;
        };
        const inspect = async () =>
          profile(
            one(await query(operatingReaderCatalog), 'profile'),
            b,
            hashes,
          );
        const authorize = async () =>
          mapping(
            one(
              await query(
                'select private.commercial_customer_invoice_authorize() result',
              ),
              'result',
            ),
            b,
            a,
          );
        const before = await inspect(),
          first = await authorize();
        let packet: Record<string, unknown> | undefined;
        if (issued) {
          packet = record(
            one(
              await query(
                'select private.commercial_customer_invoice_read_issued() result',
              ),
              'result',
            ),
          );
          if (
            Object.keys(packet).sort().join() !== 'invoice,mapping,version' ||
            JSON.stringify(mapping(packet.mapping, b, a)) !==
              JSON.stringify(first)
          )
            throw deny();
        }
        if (
          JSON.stringify(await authorize()) !== JSON.stringify(first) ||
          (await inspect()) !== before ||
          JSON.stringify(await authorize()) !== JSON.stringify(first)
        )
          throw deny();
        gate();
        if (!issued) return first;
        const version = packet!.version as EstimateVersion,
          preview = customerPreview(version);
        const property = preview.location;
        if (!property) throw deny();
        const label = [
          property.address_line1,
          property.city,
          property.region + ' ' + property.postal_code,
        ].join(', ');
        return {
          mode: 'fictional-local',
          invoice: packet!.invoice,
          companyName: preview.company.name,
          customerName: preview.customer.display_name,
          primaryColor: preview.company.primary_color,
          propertyLabel: label,
          source: {
            sourceHash: first.sourceHash,
            review: projectIssuedReview(version, {
              organization_id: b.organizationId,
              customer_id: b.customerId,
              location_id: b.locationId,
              company_name: preview.company.name,
              primary_color: preview.company.primary_color,
              property_label: label,
              reports: false,
              version_ids: [b.sourceVersionId],
            }),
          },
        };
      });
      const value = await new Promise<unknown>((resolve, reject) => {
        onAbort = () => reject(deny());
        timer = setTimeout(onAbort, Math.max(1, deadline - Date.now()));
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
          return;
        }
        work.then(resolve, () => reject(deny()));
      });
      gate();
      return value;
    } catch {
      if (began) retired.add(connection);
      throw deny();
    } finally {
      wireGate = undefined;
      if (timer) clearTimeout(timer);
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  }
  // This is the sole exported read surface. Raw version/hash/staff receipt remain
  // inside the trusted server and existing canonical customer projection only.
  const read = commercialCustomerReadProposal(auth, bearer, port, {
    enabled,
    mode: 'fictional-local',
  });
  return async (target: CommercialCustomerTarget, signal: AbortSignal) => {
    if (isProxy(signal)) throw deny();
    let cancel: (() => void) | undefined;
    let reserved = false;
    const local = new AbortController();
    try {
      if (
        signalAborted.call(signal) ||
        activeRead.has(connection) ||
        retired.has(connection)
      ) {
        if (activeRead.has(connection)) retired.add(connection);
        throw deny();
      }
      activeRead.add(connection);
      reserved = true;
      dispatched = false;
      cancel = () => local.abort();
      Reflect.apply(eventAdd, signal, ['abort', cancel, { once: true }]);
      if (signalAborted.call(signal)) local.abort();
      const result = await read(target, local.signal);
      if (signalAborted.call(signal) || retired.has(connection)) throw deny();
      assertOperatingSources();
      return result;
    } catch {
      if (dispatched) retired.add(connection);
      throw deny();
    } finally {
      local.abort();
      if (cancel) Reflect.apply(eventRemove, signal, ['abort', cancel]);
      if (reserved) activeRead.delete(connection);
    }
  };
}
