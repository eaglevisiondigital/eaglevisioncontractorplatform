import { isProxy } from 'node:util/types';
import type { GatewaySql } from '../../server/payments/postgres-store';
import type { SandboxMerchant } from '../../server/payments/sandbox';
import { digestPattern, uuid } from '../../server/providers/safety';
export interface OriginalInvoicePayment {
  organizationId: string;
  merchantConfigId: string;
  provider: SandboxMerchant['provider'];
  mode: 'sandbox';
  invoiceId: string;
  customerId: string;
  sourceVersionId: string;
  sourceHash: string;
  revision: number;
  issueCommandId: string;
  attemptKey: string;
  authorizationId: string;
  requestDigest: string;
  kind: 'capture' | 'refund';
  captureKey: string | null;
}
const identityKeys = [
  'organizationId',
  'merchantConfigId',
  'provider',
  'mode',
  'invoiceId',
  'customerId',
  'sourceVersionId',
  'sourceHash',
  'revision',
  'issueCommandId',
  'attemptKey',
  'authorizationId',
  'requestDigest',
  'kind',
  'captureKey',
] as const;
const uuidKeys = [
  'organizationId',
  'merchantConfigId',
  'invoiceId',
  'customerId',
  'sourceVersionId',
  'issueCommandId',
  'attemptKey',
  'authorizationId',
] as const;
const denied = () => Error('Exact invoice payment evidence unavailable');
function own(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw denied();
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).length !== keys.length ||
    keys.some((k) => !d[k] || !('value' in d[k]))
  )
    throw denied();
  return Object.fromEntries(keys.map((k) => [k, d[k].value])) as Record<
    string,
    unknown
  >;
}
function identity(value: unknown): Readonly<OriginalInvoicePayment> {
  const r = own(value, identityKeys);
  if (
    !uuidKeys.every((k) => typeof r[k] === 'string' && uuid.test(r[k])) ||
    !['sourceHash', 'requestDigest'].every(
      (k) => typeof r[k] === 'string' && digestPattern.test(r[k]),
    ) ||
    !Number.isSafeInteger(r.revision) ||
    Number(r.revision) < 1 ||
    Number(r.revision) > 2147483647 ||
    typeof r.provider !== 'string' ||
    !['nmi', 'authorize_net'].includes(r.provider) ||
    r.mode !== 'sandbox' ||
    typeof r.kind !== 'string' ||
    !['capture', 'refund'].includes(r.kind) ||
    (r.kind === 'capture'
      ? r.captureKey !== null
      : typeof r.captureKey !== 'string' || !uuid.test(r.captureKey))
  )
    throw denied();
  for (const k of uuidKeys) r[k] = String(r[k]).toLowerCase();
  if (typeof r.captureKey === 'string')
    r.captureKey = r.captureKey.toLowerCase();
  return Object.freeze(r) as unknown as Readonly<OriginalInvoicePayment>;
}
const boundaries = Object.freeze({
  financialEffect: false as const,
  holdRelease: false as const,
  balance: 'NOT_ESTABLISHED' as const,
  settlement: 'UNVERIFIED' as const,
  customerDelivery: 'BLOCKED' as const,
  cancellation: 'UNVERIFIED' as const,
  dispute: 'UNVERIFIED' as const,
});
const UNKNOWN = Object.freeze({ outcome: 'UNKNOWN' as const, ...boundaries });
const statement =
  'select private.commercial_invoice_payment_receipt($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::integer,$9::uuid,$10::uuid,$11::uuid,$12::text,$13::text,$14::uuid) receipt';
/** Uninstalled private read only. No customer Auth, endpoint, link, mutation or pool.
 * A deadline suppresses late data; it does not cancel/discard a database connection.
 */
export async function readOriginalInvoicePayment(
  connection: GatewaySql,
  merchant: SandboxMerchant,
  original: OriginalInvoicePayment,
  options: { testOnly: true; signal: AbortSignal | null },
) {
  let timer: ReturnType<typeof setTimeout> | undefined,
    cancel: (() => void) | undefined,
    signal: AbortSignal | null = null;
  try {
    const opt = own(options, ['testOnly', 'signal']);
    if (
      opt.testOnly !== true ||
      (opt.signal !== null && !(opt.signal instanceof AbortSignal)) ||
      !connection ||
      typeof connection !== 'object' ||
      isProxy(connection)
    )
      throw denied();
    signal = opt.signal as AbortSignal | null;
    const descriptor = Object.getOwnPropertyDescriptor(connection, 'query');
    if (
      !descriptor ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'function'
    )
      throw denied();
    const query = descriptor.value.bind(connection) as GatewaySql['query'];
    const m = own(merchant, [
      'organizationId',
      'merchantConfigId',
      'provider',
      'mode',
      'approvalReference',
      'approvedUntil',
    ]);
    const id = identity(original),
      expiry =
        typeof m.approvedUntil === 'string' ? Date.parse(m.approvedUntil) : NaN,
      deadline = Date.now() + 5000;
    if (
      typeof m.organizationId !== 'string' ||
      typeof m.merchantConfigId !== 'string' ||
      typeof m.approvalReference !== 'string' ||
      m.approvalReference.trim().length < 8 ||
      m.mode !== 'sandbox' ||
      !Number.isFinite(expiry) ||
      id.organizationId !== m.organizationId.toLowerCase() ||
      id.merchantConfigId !== m.merchantConfigId.toLowerCase() ||
      typeof m.provider !== 'string' ||
      id.provider !== m.provider
    )
      throw denied();
    const current = () => {
      if (signal?.aborted || Date.now() >= deadline || Date.now() >= expiry)
        throw denied();
    };
    current();
    const params = [
      id.organizationId,
      id.merchantConfigId,
      id.provider,
      id.invoiceId,
      id.customerId,
      id.sourceVersionId,
      id.sourceHash,
      id.revision,
      id.issueCommandId,
      id.attemptKey,
      id.authorizationId,
      id.requestDigest,
      id.kind,
      id.captureKey,
    ];
    const response = await new Promise<unknown>((resolve, reject) => {
      cancel = () => reject(denied());
      timer = setTimeout(cancel, Math.min(5000, expiry - Date.now()));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      Promise.resolve(query(statement, params)).then(resolve, () =>
        reject(denied()),
      );
    });
    current();
    const rows = own(response, ['rows']).rows;
    if (!Array.isArray(rows) || isProxy(rows) || rows.length !== 1)
      throw denied();
    const entry = Object.getOwnPropertyDescriptor(rows, '0');
    if (!entry || !('value' in entry)) throw denied();
    const value = own(entry.value, ['receipt']).receipt;
    if (!value || typeof value !== 'object' || isProxy(value)) throw denied();
    const outcome = Object.getOwnPropertyDescriptor(value, 'outcome');
    if (!outcome || !('value' in outcome)) throw denied();
    if (outcome.value === 'UNKNOWN') {
      own(value, ['outcome']);
      return UNKNOWN;
    }
    const r = own(value, [
      'outcome',
      ...identityKeys,
      'status',
      'amountMinor',
      'currency',
      'attemptedAt',
    ]);
    const observed = identity(
      Object.fromEntries(identityKeys.map((k) => [k, r[k]])),
    );
    if (
      r.outcome !== 'LINKED' ||
      identityKeys.some((k) => observed[k] !== id[k]) ||
      typeof r.status !== 'string' ||
      !['pending', 'unknown', 'succeeded', 'declined'].includes(r.status) ||
      !Number.isSafeInteger(r.amountMinor) ||
      Number(r.amountMinor) < 1 ||
      Number(r.amountMinor) > 9_000_000_000_000 ||
      r.currency !== 'USD' ||
      typeof r.attemptedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(r.attemptedAt) ||
      !Number.isFinite(Date.parse(r.attemptedAt)) ||
      Date.parse(r.attemptedAt) > Date.now()
    )
      throw denied();
    current();
    return Object.freeze({
      outcome: 'LINKED' as const,
      receipt: Object.freeze({
        ...id,
        status: r.status as 'pending' | 'unknown' | 'succeeded' | 'declined',
        amountMinor: Number(r.amountMinor),
        currency: 'USD' as const,
        attemptedAt: r.attemptedAt,
      }),
      paymentReceipt:
        r.status === 'succeeded'
          ? ('RECORDED_GATEWAY_OUTCOME' as const)
          : r.status === 'declined'
            ? ('DECLINED_GATEWAY_OUTCOME' as const)
            : ('UNRESOLVED' as const),
      ...boundaries,
    });
  } catch {
    return UNKNOWN;
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel) signal?.removeEventListener('abort', cancel);
  }
}
