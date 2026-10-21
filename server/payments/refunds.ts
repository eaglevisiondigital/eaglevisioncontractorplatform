import type {
  SandboxMerchant,
  SandboxIntent,
  SandboxResult,
  SandboxCredentials,
} from './sandbox';
import { minorDecimal } from './sandbox';
import {
  boundedBytes,
  exactKeys,
  referencePattern,
  sha256,
  uuid,
} from '../providers/safety';

export interface SandboxRefund extends SandboxIntent {
  captureKey: string;
  providerTransactionId: string;
  customerProfileId?: string;
  paymentProfileId?: string;
}
export interface SandboxRefundStore {
  // Must atomically lock settled capture, reserve remaining refundable amount and
  // validate a SEPARATE refund authorization. Pending/UNKNOWN consume capacity.
  reserveRefund(
    merchant: SandboxMerchant,
    intent: SandboxRefund,
    digest: string,
  ): Promise<
    | { status: 'reserved' }
    | { status: 'existing'; result: SandboxResult }
    | { status: 'unknown' }
  >;
  finishRefund(
    merchant: SandboxMerchant,
    intent: SandboxRefund,
    result: SandboxResult,
  ): Promise<void>;
}
export class SandboxRefundGateway {
  private readonly merchant: SandboxMerchant;
  private readonly credentials: SandboxCredentials;
  constructor(
    merchant: SandboxMerchant,
    credentials: SandboxCredentials,
    private readonly store: SandboxRefundStore,
    private readonly transport: typeof fetch,
  ) {
    if (
      merchant.mode !== 'sandbox' ||
      !uuid.test(merchant.organizationId) ||
      !uuid.test(merchant.merchantConfigId) ||
      !['authorize_net', 'nmi'].includes(merchant.provider) ||
      !merchant.approvalReference ||
      !(Date.parse(merchant.approvedUntil) > Date.now())
    )
      throw new Error('Approved sandbox merchant required');
    if (
      merchant.provider === 'authorize_net'
        ? !('apiLoginId' in credentials) ||
          !credentials.apiLoginId ||
          !credentials.transactionKey
        : !('apiKey' in credentials) || !credentials.apiKey
    )
      throw new Error('Sandbox credentials unavailable');
    this.merchant = Object.freeze({ ...merchant });
    this.credentials = Object.freeze({ ...credentials });
  }
  async refund(input: SandboxRefund): Promise<SandboxResult> {
    const i = Object.freeze({ ...input }),
      m = this.merchant;
    exactKeys(i, [
      'organizationId',
      'merchantConfigId',
      'invoiceId',
      'authorizationId',
      'idempotencyKey',
      'amountMinor',
      'currency',
      'expiresAt',
      'captureKey',
      'providerTransactionId',
      'customerProfileId',
      'paymentProfileId',
    ]);
    const amount = minorDecimal(i.amountMinor);
    if (
      i.organizationId !== m.organizationId ||
      i.merchantConfigId !== m.merchantConfigId ||
      i.currency !== 'USD' ||
      ![i.invoiceId, i.authorizationId, i.idempotencyKey, i.captureKey].every(
        (v) => uuid.test(v),
      ) ||
      !referencePattern.test(i.providerTransactionId) ||
      i.providerTransactionId === '0' ||
      !(Date.parse(i.expiresAt) > Date.now()) ||
      !(Date.parse(m.approvedUntil) > Date.now())
    )
      throw new Error('Refund scope or authority mismatch');
    if (
      m.provider === 'authorize_net'
        ? ![i.customerProfileId, i.paymentProfileId].every(
            (v) => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v),
          )
        : i.customerProfileId !== undefined || i.paymentProfileId !== undefined
    )
      throw new Error('Provider-bound profile references required');
    const digest = sha256(
      JSON.stringify([
        m.provider,
        i.organizationId,
        i.merchantConfigId,
        i.invoiceId,
        i.authorizationId,
        i.idempotencyKey,
        i.captureKey,
        i.providerTransactionId,
        i.amountMinor,
        i.currency,
        i.expiresAt,
        i.customerProfileId ?? null,
        i.paymentProfileId ?? null,
      ]),
    );
    const reserved = await this.store.reserveRefund(m, i, digest);
    if (reserved.status === 'existing') {
      const r = reserved.result;
      if (
        r.provider !== m.provider ||
        r.mode !== 'sandbox' ||
        r.amountMinor !== i.amountMinor ||
        r.currency !== 'USD' ||
        !['succeeded', 'declined', 'unknown'].includes(r.status) ||
        (r.status === 'succeeded'
          ? typeof r.transactionId !== 'string' ||
            !referencePattern.test(r.transactionId) ||
            r.transactionId === '0'
          : r.transactionId !== null)
      )
        throw new Error('Invalid stored refund');
      return Object.freeze({
        status: r.status,
        provider: m.provider,
        mode: 'sandbox',
        transactionId: r.transactionId,
        amountMinor: i.amountMinor,
        currency: 'USD',
      });
    }
    if (reserved.status !== 'reserved')
      throw new Error('Refund requires reconciliation; do not retry');
    let result: SandboxResult = {
      status: 'unknown',
      provider: m.provider,
      mode: 'sandbox',
      transactionId: null,
      amountMinor: i.amountMinor,
      currency: 'USD',
    };
    try {
      if (
        !(Date.parse(i.expiresAt) > Date.now()) ||
        !(Date.parse(m.approvedUntil) > Date.now())
      )
        throw new Error('Expired');
      const authorize = m.provider === 'authorize_net';
      const c = this.credentials as {
        apiLoginId: string;
        transactionKey: string;
        apiKey: string;
      };
      const body = authorize
        ? JSON.stringify({
            createTransactionRequest: {
              merchantAuthentication: {
                name: c.apiLoginId,
                transactionKey: c.transactionKey,
              },
              refId: i.idempotencyKey.replaceAll('-', '').slice(0, 20),
              transactionRequest: {
                transactionType: 'refundTransaction',
                amount,
                currencyCode: 'USD',
                refTransId: i.providerTransactionId,
                profile: {
                  customerProfileId: i.customerProfileId,
                  paymentProfile: { paymentProfileId: i.paymentProfileId },
                },
              },
            },
          })
        : JSON.stringify({ amount: 0, payment: 'creditcard' }).replace(
            '"amount":0',
            `"amount":${amount}`,
          );
      const response = await this.transport(
        authorize
          ? 'https://apitest.authorize.net/xml/v1/request.api'
          : `https://sandbox.nmi.com/api/v5/payments/${encodeURIComponent(i.providerTransactionId)}/refund`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            'Content-Type': 'application/json',
            ...(!authorize ? { Authorization: c.apiKey } : {}),
          },
          body,
        },
      );
      const data = JSON.parse(
        (await boundedBytes(response, 65536))
          .toString('utf8')
          .replace(/^\uFEFF/, ''),
      );
      const transaction = authorize ? data.transactionResponse : data;
      const code = authorize ? transaction?.responseCode : data.response;
      const id = authorize ? transaction?.transId : data.id;
      if (
        code === '1' &&
        typeof id === 'string' &&
        referencePattern.test(id) &&
        id !== '0' &&
        (authorize
          ? data.messages?.resultCode === 'Ok'
          : data.currency === 'USD' && data.amount === amount)
      )
        result = { ...result, status: 'succeeded', transactionId: id };
      else if (code === '2') result = { ...result, status: 'declined' };
    } catch {
      /* An uncertain refund holds capacity until independent reconciliation. */
    }
    Object.freeze(result);
    await this.store.finishRefund(m, i, result);
    return result;
  }
}
