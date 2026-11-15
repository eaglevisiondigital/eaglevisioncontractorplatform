import { types } from 'node:util';
import {
  commercialCustomerReadProposal,
  type CommercialCustomerReaderPort,
} from '../commercial-customer-bridge/reader';
import type { CommercialCustomerTarget } from '../../src/components/invoices/commercial-customer-read';
import { CustomerBrokerAuth } from '../../server/customer/broker-auth';
import type { GatewaySql } from '../../server/payments/postgres-store';
import {
  validateSandboxIntent,
  type SandboxIntent,
  type SandboxMerchant,
} from '../../server/payments/sandbox';
import {
  digestPattern,
  referencePattern,
  uuid,
} from '../../server/providers/safety';
import { CUSTOMER_CAPTURE_LIFECYCLE_QUERY } from './query';
const unavailable = () =>
  Error(
    'Customer payment link unavailable · UNKNOWN; exact original read only',
  );
function data(value: unknown, depth = 0, budget = { count: 0 }): unknown {
  if (types.isProxy(value)) throw unavailable();
  if (
    ++budget.count > 512 ||
    depth > 12 ||
    (typeof value === 'string' && value.length > 4096) ||
    (Array.isArray(value) && value.length > 4)
  )
    throw unavailable();
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    depth > 12 ||
    ![Object.prototype, null, Array.prototype].includes(
      Object.getPrototypeOf(value),
    )
  )
    throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value),
    result: Record<string, unknown> = Object.create(null);
  if (Reflect.ownKeys(descriptors).length > 48) throw unavailable();
  for (const k of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && k === 'length') continue;
    if (typeof k !== 'string' || !('value' in descriptors[k]))
      throw unavailable();
    result[k] = data(descriptors[k].value, depth + 1, budget);
  }
  if (Array.isArray(value)) {
    if (
      Object.keys(result).length !== value.length ||
      !Array.from({ length: value.length }, (_, i) =>
        Object.hasOwn(result, String(i)),
      ).every(Boolean)
    )
      throw unavailable();
    return Array.from({ length: value.length }, (_, i) => result[String(i)]);
  }
  return result;
}
function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const v = data(value);
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw unavailable();
  return v as Record<string, unknown>;
}
const idsame = (a: unknown, b: string) =>
  typeof a === 'string' && uuid.test(a) && a.toLowerCase() === b.toLowerCase();
const minor = (v: unknown) => {
  if (
    typeof v !== 'string' ||
    !/^[1-9][0-9]{0,15}$/.test(v) ||
    BigInt(v) > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw unavailable();
  return BigInt(v);
};
export interface CustomerCaptureLinkScope {
  merchant: SandboxMerchant;
  intent: SandboxIntent;
  requestDigest: string;
}
export interface HeldCustomerPaymentLink {
  schema: 'customer-capture-link-lifecycle-v1';
  mode: 'disposable-proposal';
  invoiceId: string;
  issuanceReceiptId: string;
  observedAt: number;
  reason:
    | 'NO_ATTEMPT'
    | 'ORIGINAL_PENDING'
    | 'ORIGINAL_UNKNOWN'
    | 'ORIGINAL_RECORDED'
    | 'ORIGINAL_DECLINED'
    | 'AUTHORITY_REVOKED'
    | 'AUTHORITY_EXPIRED';
  link: { status: 'DISABLED'; href: null; token: null };
  executionAuthorized: false;
  payment: 'UNKNOWN';
  balanceMinor: null;
  settlement: 'UNVERIFIED';
  replay: 'PROHIBITED';
}
/** Server-only existing-contract composition. Customer access is NOT payment
 * authority. The fixed SELECT observes existing rows only; no URL, token, vault,
 * gateway, financial command, retry/replacement or financial capability exists.
 * Existing operating customer/financial readers and grants remain unimplemented. */
export function customerCaptureLinkLifecycle(
  auth: CustomerBrokerAuth,
  bearer: string,
  port: CommercialCustomerReaderPort,
  connection: GatewaySql,
  input: CustomerCaptureLinkScope,
  options?: { enabled: boolean; mode: 'disposable-proposal' },
): (
  target: CommercialCustomerTarget,
  signal: AbortSignal,
) => Promise<HeldCustomerPaymentLink> {
  if (!options?.enabled || options.mode !== 'disposable-proposal')
    return async (): Promise<HeldCustomerPaymentLink> => {
      throw unavailable();
    };
  const raw = record(input, ['merchant', 'intent', 'requestDigest']);
  const merchant = Object.freeze(
    record(raw.merchant, [
      'organizationId',
      'merchantConfigId',
      'provider',
      'mode',
      'approvalReference',
      'approvedUntil',
    ]),
  ) as unknown as Readonly<SandboxMerchant>;
  const intent = Object.freeze(
    record(raw.intent, [
      'organizationId',
      'merchantConfigId',
      'invoiceId',
      'authorizationId',
      'idempotencyKey',
      'amountMinor',
      'currency',
      'expiresAt',
    ]),
  ) as unknown as Readonly<SandboxIntent>;
  const digest = raw.requestDigest;
  if (
    typeof digest !== 'string' ||
    !digestPattern.test(digest) ||
    merchant.mode !== 'sandbox' ||
    !['nmi', 'authorize_net'].includes(merchant.provider) ||
    ![
      merchant.organizationId,
      merchant.merchantConfigId,
      intent.invoiceId,
      intent.authorizationId,
      intent.idempotencyKey,
    ].every((v) => typeof v === 'string' && uuid.test(v))
  )
    throw unavailable();
  if (
    !connection ||
    typeof connection !== 'object' ||
    types.isProxy(connection)
  )
    throw unavailable();
  const descriptor = Object.getOwnPropertyDescriptor(connection, 'query');
  if (
    !descriptor ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'function'
  )
    throw unavailable();
  if (types.isProxy(descriptor.value)) throw unavailable();
  const query = descriptor.value.bind(connection) as GatewaySql['query'];
  if (
    ![
      merchant.approvalReference,
      merchant.approvedUntil,
      intent.expiresAt,
    ].every((v) => typeof v === 'string') ||
    !merchant.approvalReference
  )
    throw unavailable();
  const customerRead = commercialCustomerReadProposal(auth, bearer, port, {
    enabled: true,
    mode: 'fictional-local',
  });
  return async (
    target: CommercialCustomerTarget,
    signal: AbortSignal,
  ): Promise<HeldCustomerPaymentLink> => {
    if (types.isProxy(signal) || !(signal instanceof AbortSignal))
      throw unavailable();
    const local = new AbortController(),
      abort = () => local.abort();
    signal.addEventListener('abort', abort);
    if (signal.aborted) local.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (local.signal.aborted) throw unavailable();
      validateSandboxIntent(merchant, intent);
    };
    const work = async () => {
      check();
      const before = await customerRead(target, local.signal);
      check();
      const header = before.invoice;
      if (
        !idsame(header.organizationId, intent.organizationId) ||
        !idsame(header.invoiceId, intent.invoiceId)
      )
        throw unavailable();
      const args = [
        intent.organizationId,
        intent.invoiceId,
        intent.authorizationId,
        intent.merchantConfigId,
        header.customerId,
        header.sourceVersionId,
        header.revision,
        header.issuanceReceiptId,
        digest,
        intent.amountMinor,
      ];
      const observe = async () => {
        check();
        const envelope = record(
          await query(CUSTOMER_CAPTURE_LIFECYCLE_QUERY, [...args]),
          ['rows'],
        );
        check();
        if (!Array.isArray(envelope.rows) || envelope.rows.length !== 1)
          throw unavailable();
        const wrapper = record(envelope.rows[0], ['result']);
        const row = record(wrapper.result, [
          'organizationId',
          'invoiceId',
          'customerId',
          'sourceVersionId',
          'sourceHash',
          'revision',
          'issuanceReceiptId',
          'invoiceAmountMinor',
          'authorizationId',
          'merchantConfigId',
          'provider',
          'authorityKind',
          'amountMinor',
          'currency',
          'requestDigest',
          'authorityRevoked',
          'authorityExpired',
          'merchantApproved',
          'uncertainInvoice',
          'attempt',
        ]);
        for (const [k, expected] of Object.entries({
          organizationId: intent.organizationId,
          invoiceId: intent.invoiceId,
          customerId: header.customerId,
          sourceVersionId: header.sourceVersionId,
          issuanceReceiptId: header.issuanceReceiptId,
          authorizationId: intent.authorizationId,
          merchantConfigId: intent.merchantConfigId,
        }))
          if (!idsame(row[k], expected)) throw unavailable();
        if (
          typeof row.sourceHash !== 'string' ||
          !digestPattern.test(row.sourceHash) ||
          row.revision !== header.revision ||
          row.provider !== merchant.provider ||
          row.authorityKind !== 'capture' ||
          row.currency !== 'USD' ||
          row.requestDigest !== digest ||
          minor(row.amountMinor) !== BigInt(intent.amountMinor) ||
          minor(row.invoiceAmountMinor) !== BigInt(header.amountMinor) ||
          BigInt(intent.amountMinor) > minor(row.invoiceAmountMinor) ||
          row.merchantApproved !== true ||
          !['authorityRevoked', 'authorityExpired', 'uncertainInvoice'].every(
            (k) => typeof row[k] === 'boolean',
          )
        )
          throw unavailable();
        if (row.attempt !== null) {
          const a = record(row.attempt, [
            'key',
            'authorizationId',
            'merchantConfigId',
            'invoiceId',
            'kind',
            'amountMinor',
            'requestDigest',
            'status',
            'result',
          ]);
          for (const [k, expected] of Object.entries({
            key: intent.idempotencyKey,
            authorizationId: intent.authorizationId,
            merchantConfigId: intent.merchantConfigId,
            invoiceId: intent.invoiceId,
          }))
            if (!idsame(a[k], expected)) throw unavailable();
          if (
            a.kind !== 'capture' ||
            a.requestDigest !== digest ||
            minor(a.amountMinor) !== BigInt(intent.amountMinor) ||
            typeof a.status !== 'string' ||
            !['pending', 'unknown', 'succeeded', 'declined'].includes(a.status)
          )
            throw unavailable();
          if (a.status === 'pending') {
            if (a.result !== null) throw unavailable();
          } else {
            const result = record(a.result, [
              'status',
              'provider',
              'transactionId',
              'amountMinor',
              'currency',
              'mode',
            ]);
            if (
              result.status !== a.status ||
              result.provider !== merchant.provider ||
              result.amountMinor !== intent.amountMinor ||
              result.currency !== 'USD' ||
              result.mode !== 'sandbox' ||
              (result.status === 'succeeded'
                ? typeof result.transactionId !== 'string' ||
                  !referencePattern.test(result.transactionId) ||
                  result.transactionId === '0'
                : result.transactionId !== null)
            )
              throw unavailable();
          }
        }
        return row;
      };
      const first = await observe();
      check();
      const middle = await customerRead(target, local.signal);
      check();
      if (JSON.stringify(header) !== JSON.stringify(middle.invoice))
        throw unavailable();
      const second = await observe();
      check();
      if (JSON.stringify(first) !== JSON.stringify(second)) throw unavailable();
      const final = await customerRead(target, local.signal);
      check();
      if (JSON.stringify(header) !== JSON.stringify(final.invoice))
        throw unavailable();
      const attempt = first.attempt as Record<string, unknown> | null;
      const reason: HeldCustomerPaymentLink['reason'] = first.authorityRevoked
        ? 'AUTHORITY_REVOKED'
        : first.authorityExpired
          ? 'AUTHORITY_EXPIRED'
          : first.uncertainInvoice
            ? attempt?.status === 'pending'
              ? 'ORIGINAL_PENDING'
              : 'ORIGINAL_UNKNOWN'
            : !attempt
              ? 'NO_ATTEMPT'
              : attempt.status === 'succeeded'
                ? 'ORIGINAL_RECORDED'
                : attempt.status === 'declined'
                  ? 'ORIGINAL_DECLINED'
                  : attempt.status === 'pending'
                    ? 'ORIGINAL_PENDING'
                    : 'ORIGINAL_UNKNOWN';
      return Object.freeze({
        schema: 'customer-capture-link-lifecycle-v1',
        mode: 'disposable-proposal',
        invoiceId: header.invoiceId,
        issuanceReceiptId: header.issuanceReceiptId,
        observedAt: Date.now(),
        reason,
        link: Object.freeze({ status: 'DISABLED', href: null, token: null }),
        executionAuthorized: false,
        payment: 'UNKNOWN',
        balanceMinor: null,
        settlement: 'UNVERIFIED',
        replay: 'PROHIBITED',
      });
    };
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          local.abort();
          reject(unavailable());
        }, 5000);
      });
      return await Promise.race([work(), timeout]);
    } catch {
      throw unavailable();
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      local.abort();
    }
  };
}
