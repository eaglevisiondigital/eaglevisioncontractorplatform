import { createHash } from 'node:crypto';
export type SandboxProvider = 'authorize_net' | 'nmi';
export interface SandboxMerchant {
  organizationId: string;
  merchantConfigId: string;
  provider: SandboxProvider;
  mode: 'sandbox';
  approvalReference: string;
  approvedUntil: string;
}
export interface SandboxIntent {
  organizationId: string;
  merchantConfigId: string;
  invoiceId: string;
  authorizationId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: 'USD';
  expiresAt: string;
}
export type GatewayToken =
  | {
      provider: 'authorize_net';
      descriptor: 'COMMON.ACCEPT.INAPP.PAYMENT';
      value: string;
    }
  | { provider: 'nmi'; value: string };
export interface SandboxResult {
  status: 'succeeded' | 'declined' | 'unknown';
  provider: SandboxProvider;
  transactionId: string | null;
  amountMinor: number;
  currency: 'USD';
  mode: 'sandbox';
}
// Trusted control-store implementation must atomically validate immutable authorization,
// merchant/tenant binding and reserve once. Unknown outcomes cannot be automatically retried.
export interface SandboxIntentStore {
  reserve(
    merchant: SandboxMerchant,
    intent: SandboxIntent,
    digest: string,
  ): Promise<
    | { status: 'reserved' }
    | { status: 'existing'; result: SandboxResult }
    | { status: 'unknown' }
  >;
  finish(
    merchant: SandboxMerchant,
    intent: SandboxIntent,
    result: SandboxResult,
  ): Promise<void>;
}
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function minorDecimal(n: number) {
  if (!Number.isSafeInteger(n) || n < 1 || n > 9_000_000_000_000)
    throw new Error('Invalid minor amount');
  const value = BigInt(n);
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
async function boundedJson(r: Response) {
  if (!r.ok || !r.body) throw new Error('Gateway outcome unknown');
  const reader = r.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        throw new Error('Gateway outcome unknown');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(
    Buffer.concat(chunks)
      .toString('utf8')
      .replace(/^\uFEFF/, ''),
  ) as Record<string, unknown>;
}
export type SandboxCredentials =
  { apiLoginId: string; transactionKey: string } | { apiKey: string };
export class SandboxGateway {
  private readonly merchant: SandboxMerchant;
  private readonly credentials: SandboxCredentials;
  constructor(
    merchant: SandboxMerchant,
    credentials: SandboxCredentials,
    private store: SandboxIntentStore,
    private transport: typeof fetch = fetch,
  ) {
    if (
      merchant.mode !== 'sandbox' ||
      !['authorize_net', 'nmi'].includes(merchant.provider) ||
      !uuid.test(merchant.organizationId) ||
      !uuid.test(merchant.merchantConfigId) ||
      merchant.approvalReference.trim().length < 8 ||
      !Number.isFinite(Date.parse(merchant.approvedUntil)) ||
      Date.parse(merchant.approvedUntil) <= Date.now()
    )
      throw new Error('Approved sandbox merchant configuration required');
    if (
      merchant.provider === 'authorize_net'
        ? !('apiLoginId' in credentials) ||
          !credentials.apiLoginId ||
          !credentials.transactionKey
        : !('apiKey' in credentials) || !credentials.apiKey
    )
      throw new Error('Sandbox credentials unavailable');
    // Configuration is request authority, not a mutable caller-owned reference.
    this.merchant = Object.freeze({ ...merchant });
    this.credentials = Object.freeze({ ...credentials });
  }
  async capture(
    input: SandboxIntent,
    inputToken: GatewayToken,
  ): Promise<SandboxResult> {
    // Snapshot before the first await. A reservation must bind exactly the values
    // validated, hashed and ultimately sent, regardless of later caller changes.
    const intent = Object.freeze({ ...input });
    const token = Object.freeze({ ...inputToken });
    if (
      Object.keys(intent).some(
        (k) =>
          ![
            'organizationId',
            'merchantConfigId',
            'invoiceId',
            'authorizationId',
            'idempotencyKey',
            'amountMinor',
            'currency',
            'expiresAt',
          ].includes(k),
      )
    )
      throw new Error('Unexpected payment fields');
    const m = this.merchant,
      decimal = minorDecimal(intent.amountMinor);
    if (
      intent.organizationId !== m.organizationId ||
      intent.merchantConfigId !== m.merchantConfigId ||
      intent.currency !== 'USD' ||
      token.provider !== m.provider ||
      !uuid.test(intent.invoiceId) ||
      !uuid.test(intent.authorizationId) ||
      !uuid.test(intent.idempotencyKey) ||
      !Number.isFinite(Date.parse(intent.expiresAt)) ||
      Date.parse(intent.expiresAt) <= Date.now() ||
      Date.parse(m.approvedUntil) <= Date.now()
    )
      throw new Error('Sandbox authorization mismatch or expiry');
    if (
      !token.value ||
      token.value.length > 4096 ||
      /^[0-9 -]{12,25}$/.test(token.value) ||
      Object.keys(token).some(
        (k) => !['provider', 'descriptor', 'value'].includes(k),
      ) ||
      (token.provider === 'authorize_net' &&
        token.descriptor !== 'COMMON.ACCEPT.INAPP.PAYMENT')
    )
      throw new Error('Gateway token required; raw card fields are prohibited');
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          organizationId: intent.organizationId,
          merchantConfigId: intent.merchantConfigId,
          invoiceId: intent.invoiceId,
          authorizationId: intent.authorizationId,
          idempotencyKey: intent.idempotencyKey,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          expiresAt: intent.expiresAt,
          provider: token.provider,
          tokenDigest: createHash('sha256').update(token.value).digest('hex'),
        }),
      )
      .digest('hex');
    const reserved = await this.store.reserve(m, intent, digest);
    if (reserved.status === 'existing') {
      if (
        reserved.result.mode !== 'sandbox' ||
        reserved.result.provider !== m.provider ||
        reserved.result.amountMinor !== intent.amountMinor ||
        reserved.result.currency !== intent.currency
      )
        throw new Error('Stored payment scope mismatch');
      if (
        !['succeeded', 'declined', 'unknown'].includes(
          reserved.result.status,
        ) ||
        (reserved.result.status === 'succeeded' &&
          (typeof reserved.result.transactionId !== 'string' ||
            reserved.result.transactionId === '0' ||
            !/^[a-zA-Z0-9_-]{1,100}$/.test(reserved.result.transactionId))) ||
        (reserved.result.status !== 'succeeded' &&
          reserved.result.transactionId !== null)
      )
        throw new Error('Invalid stored result');
      return {
        status: reserved.result.status,
        provider: m.provider,
        transactionId: reserved.result.transactionId,
        amountMinor: intent.amountMinor,
        currency: 'USD',
        mode: 'sandbox',
      };
    }
    if (reserved.status === 'unknown')
      throw new Error('Previous outcome requires reconciliation; do not retry');
    if (reserved.status !== 'reserved')
      throw new Error('Invalid payment reservation; do not execute');
    let result: SandboxResult = {
      status: 'unknown',
      provider: m.provider,
      transactionId: null,
      amountMinor: intent.amountMinor,
      currency: 'USD',
      mode: 'sandbox',
    };
    try {
      // Waiting on the durable store must not extend an authorization or approval.
      if (
        Date.parse(intent.expiresAt) <= Date.now() ||
        Date.parse(m.approvedUntil) <= Date.now()
      )
        throw new Error('Sandbox authority expired during reservation');
      let url: string,
        body: string,
        headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
      if (m.provider === 'authorize_net') {
        const c = this.credentials as {
          apiLoginId: string;
          transactionKey: string;
        };
        url = 'https://apitest.authorize.net/xml/v1/request.api';
        body = JSON.stringify({
          createTransactionRequest: {
            merchantAuthentication: {
              name: c.apiLoginId,
              transactionKey: c.transactionKey,
            },
            refId: intent.idempotencyKey.replaceAll('-', '').slice(0, 20),
            transactionRequest: {
              transactionType: 'authCaptureTransaction',
              amount: decimal,
              currencyCode: 'USD',
              payment: {
                opaqueData: {
                  dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
                  dataValue: token.value,
                },
              },
              order: {
                invoiceNumber: intent.invoiceId
                  .replaceAll('-', '')
                  .slice(0, 20),
              },
            },
          },
        });
      } else {
        url = 'https://sandbox.nmi.com/api/v5/payments/sale';
        headers = {
          ...headers,
          Authorization: (this.credentials as { apiKey: string }).apiKey,
        };
        // Emit a validated decimal JSON number directly: never binary-float price arithmetic.
        body = JSON.stringify({
          amount: 0,
          currency: 'USD',
          payment_details: { payment_token: token.value },
          order_id: intent.idempotencyKey,
        }).replace('"amount":0', `"amount":${decimal}`);
      }
      const r = await this.transport(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers,
        body,
      });
      const data = await boundedJson(r);
      if (m.provider === 'authorize_net') {
        const t = data.transactionResponse as
          { responseCode?: string; transId?: string } | undefined;
        if (
          t?.responseCode === '1' &&
          (data.messages as { resultCode?: string } | undefined)?.resultCode ===
            'Ok' &&
          t.transId !== '0' &&
          typeof t.transId === 'string' &&
          /^[a-zA-Z0-9_-]{1,100}$/.test(t.transId)
        )
          result = { ...result, status: 'succeeded', transactionId: t.transId };
        else if (t?.responseCode === '2')
          result = { ...result, status: 'declined' };
      } else {
        if (
          data.response === '1' &&
          typeof data.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,100}$/.test(data.id) &&
          data.currency === 'USD' &&
          data.amount === decimal
        )
          result = { ...result, status: 'succeeded', transactionId: data.id };
        else if (data.response === '2')
          result = { ...result, status: 'declined' };
      }
    } catch {
      /* Transport failure can occur after a charge; persist UNKNOWN, never fake decline/success. */
    }
    Object.freeze(result);
    await this.store.finish(m, intent, result);
    return result;
  }
}
