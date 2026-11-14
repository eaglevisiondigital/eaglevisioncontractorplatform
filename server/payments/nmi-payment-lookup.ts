import type { SandboxCredentials, SandboxMerchant } from './sandbox';
import { minorDecimal } from './sandbox';
import type { StatementRow } from './reconciliation';
import { decodePaymentResponse } from './response-json';
import {
  boundedBytes,
  exactKeys,
  referencePattern,
  sha256,
  uuid,
} from '../providers/safety';

export type NmiLookupCredential = Extract<
  SandboxCredentials,
  { apiKey: string }
> & {
  organizationId: string;
  merchantConfigId: string;
  provider: 'nmi';
  mode: 'sandbox';
  processorId: string;
};
export interface NmiReportedAction {
  readonly id: string;
  readonly type: string;
  readonly amount: string;
  readonly success: boolean;
  readonly response: '1' | '2' | '3';
}
export interface NmiPaymentLookup {
  readonly expectation: Readonly<StatementRow>;
  readonly processorId: string;
  readonly reportedStatus: string | null;
  readonly reportedResponse: '1' | '2' | '3' | null;
  readonly orderReference: string | null;
  readonly actions: readonly NmiReportedAction[];
  readonly bodyDigest: string;
  readonly settlement: 'UNVERIFIED';
  readonly merchantIdentity: 'CONFIGURATION_BOUND_NOT_PROVIDER_ATTESTED';
  readonly financialEffect: false;
}
const denied = () =>
  Error('NMI payment lookup unavailable; no financial conclusion');
function beforeAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(denied());
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) {
          if (value instanceof Response)
            void value.body?.cancel().catch(() => undefined);
          reject(denied());
        } else resolve(value);
      },
      () => {
        signal.removeEventListener('abort', abort);
        reject(denied());
      },
    );
  });
}
const reference = (v: unknown): v is string =>
  typeof v === 'string' && v !== '0' && referencePattern.test(v);
const responseCode = (v: unknown): v is '1' | '2' | '3' =>
  v === '1' || v === '2' || v === '3';
const row = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Unwired read-only sandbox preparation. An explicit transport is mandatory;
 * no default fetch, credential reader, SQL port, observer, receipt or retry exists.
 * Provider status/action strings have no settlement or UNKNOWN-resolution authority.
 */
export class NmiSandboxPaymentReader {
  readonly #merchant: Readonly<SandboxMerchant>;
  readonly #credential: Readonly<NmiLookupCredential>;
  readonly #transport: typeof fetch;
  constructor(
    merchant: SandboxMerchant,
    credential: NmiLookupCredential,
    transport: typeof fetch,
  ) {
    exactKeys(merchant, [
      'organizationId',
      'merchantConfigId',
      'provider',
      'mode',
      'approvalReference',
      'approvedUntil',
    ]);
    exactKeys(credential, [
      'organizationId',
      'merchantConfigId',
      'provider',
      'mode',
      'apiKey',
      'processorId',
    ]);
    this.#merchant = Object.freeze({ ...merchant });
    this.#credential = Object.freeze({ ...credential });
    this.#transport = transport;
    const m = this.#merchant,
      c = this.#credential;
    if (
      typeof transport !== 'function' ||
      m.provider !== 'nmi' ||
      m.mode !== 'sandbox' ||
      !uuid.test(m.organizationId) ||
      !uuid.test(m.merchantConfigId) ||
      typeof m.approvalReference !== 'string' ||
      m.approvalReference.trim().length < 8 ||
      c.organizationId !== m.organizationId ||
      c.merchantConfigId !== m.merchantConfigId ||
      c.provider !== 'nmi' ||
      c.mode !== 'sandbox' ||
      !reference(c.processorId) ||
      typeof c.apiKey !== 'string' ||
      !c.apiKey.trim() ||
      c.apiKey.length > 4096 ||
      /[\r\n]/.test(c.apiKey)
    )
      throw denied();
    this.#current();
  }
  #current() {
    if (
      !Number.isFinite(Date.parse(this.#merchant.approvedUntil)) ||
      Date.parse(this.#merchant.approvedUntil) <= Date.now()
    )
      throw denied();
  }
  async read(
    input: StatementRow,
    cancellation?: AbortSignal,
  ): Promise<NmiPaymentLookup> {
    try {
      const expected = Object.freeze({ ...input });
      exactKeys(expected, [
        'organizationId',
        'merchantConfigId',
        'provider',
        'mode',
        'transactionId',
        'kind',
        'amountMinor',
        'currency',
      ]);
      const m = this.#merchant,
        c = this.#credential;
      if (
        expected.organizationId !== m.organizationId ||
        expected.merchantConfigId !== m.merchantConfigId ||
        expected.provider !== 'nmi' ||
        expected.mode !== 'sandbox' ||
        expected.currency !== 'USD' ||
        !reference(expected.transactionId) ||
        !['capture', 'refund'].includes(expected.kind)
      )
        throw denied();
      const amount = minorDecimal(expected.amountMinor);
      this.#current();
      const deadline = Date.now() + 30000;
      const timeout = AbortSignal.timeout(30000);
      const signal = cancellation
        ? AbortSignal.any([timeout, cancellation])
        : timeout;
      const current = () => {
        this.#current();
        if (signal.aborted || Date.now() >= deadline) throw denied();
      };
      current();
      const result = await beforeAbort(
        this.#transport(
          'https://sandbox.nmi.com/api/v5/payments/' +
            encodeURIComponent(expected.transactionId),
          {
            method: 'GET',
            redirect: 'error',
            cache: 'no-store',
            signal,
            headers: { Accept: 'application/json', Authorization: c.apiKey },
          },
        ),
        signal,
      );
      try {
        current();
        if (result.redirected) throw denied();
      } catch {
        void result.body?.cancel().catch(() => undefined);
        throw denied();
      }
      // Abort the stream itself so a stalled body cannot retain a reader after
      // the caller/deadline stops waiting. Keep the canonical byte/status bound.
      const body = result.body?.pipeThrough(new TransformStream(), { signal });
      const bytes = await beforeAbort(
        boundedBytes(
          new Response(body, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
          }),
          65536,
        ),
        signal,
      );
      current();
      const data = decodePaymentResponse(bytes);
      if (
        data.object !== 'transaction' ||
        data.id !== expected.transactionId ||
        data.amount !== amount ||
        data.currency !== 'USD' ||
        data.processor_id !== c.processorId
      )
        throw denied();
      if (
        data.status !== undefined &&
        (typeof data.status !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(data.status))
      )
        throw denied();
      if (data.response !== undefined && !responseCode(data.response))
        throw denied();
      let orderReference: string | null = null;
      if (data.order_details !== undefined) {
        if (!row(data.order_details)) throw denied();
        if (data.order_details.order_id !== undefined) {
          if (!reference(data.order_details.order_id)) throw denied();
          orderReference = data.order_details.order_id;
        }
      }
      if (
        data.actions !== undefined &&
        (!Array.isArray(data.actions) || data.actions.length > 100)
      )
        throw denied();
      const ids = new Set<string>();
      const actions: readonly NmiReportedAction[] = Object.freeze(
        ((data.actions ?? []) as unknown[]).map((action) => {
          if (
            !row(action) ||
            !reference(action.id) ||
            ids.has(action.id) ||
            typeof action.type !== 'string' ||
            !/^[a-z_]{1,32}$/.test(action.type) ||
            typeof action.amount !== 'string' ||
            !/^(0|[1-9]\d{0,10})\.\d{2}$/.test(action.amount) ||
            typeof action.success !== 'boolean' ||
            !responseCode(action.response)
          )
            throw denied();
          ids.add(action.id);
          return Object.freeze({
            id: action.id,
            type: action.type,
            amount: action.amount,
            success: action.success,
            response: action.response,
          });
        }),
      );
      current();
      return Object.freeze({
        expectation: expected,
        processorId: c.processorId,
        reportedStatus:
          data.status === undefined ? null : (data.status as string),
        reportedResponse:
          data.response === undefined
            ? null
            : (data.response as '1' | '2' | '3'),
        orderReference,
        actions,
        bodyDigest: sha256(bytes),
        settlement: 'UNVERIFIED',
        merchantIdentity: 'CONFIGURATION_BOUND_NOT_PROVIDER_ATTESTED',
        financialEffect: false,
      });
    } catch {
      throw denied();
    }
  }
}
