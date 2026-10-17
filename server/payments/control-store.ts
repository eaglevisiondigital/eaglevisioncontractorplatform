import type { StatementRow } from './reconciliation';
import { ProviderControl } from '../providers/control';
import { digestPattern, referencePattern, uuid } from '../providers/safety';
import type {
  SandboxIntent,
  SandboxIntentStore,
  SandboxMerchant,
  SandboxResult,
} from './sandbox';
import type { SandboxRefund, SandboxRefundStore } from './refunds';

export interface GatewayObservation {
  observationId: string;
  key: string;
  transactionId: string;
  kind: 'capture' | 'refund';
  amountMinor: number;
  currency: 'USD';
  state: 'settled' | 'pending' | 'declined' | 'not_found';
  digest: string;
  observedAt: string;
}
/** Restricted SQL boundary for the formal pending migration. The original direct
 * SQL store remains a disposable-test reference, not an application connection. */
export class RestrictedSandboxStore
  implements SandboxIntentStore, SandboxRefundStore
{
  constructor(private readonly control: ProviderControl) {
    if (control.service !== 'payment')
      throw new Error('Payment workload required');
  }
  private scope(m: SandboxMerchant, i?: SandboxIntent) {
    this.control.assertScope(m.organizationId, m.merchantConfigId, 'payment');
    if (
      m.mode !== 'sandbox' ||
      (i &&
        (i.organizationId !== m.organizationId ||
          i.merchantConfigId !== m.merchantConfigId))
    )
      throw new Error('Sandbox scope required');
  }
  private async reserveKind(
    m: SandboxMerchant,
    i: SandboxIntent | SandboxRefund,
    digest: string,
    kind: 'capture' | 'refund',
  ) {
    this.scope(m, i);
    if (
      !digestPattern.test(digest) ||
      Date.parse(m.approvedUntil) <= Date.now() ||
      !Number.isFinite(Date.parse(m.approvedUntil))
    )
      throw new Error('Current approval/digest required');
    const refund = i as SandboxRefund;
    const result = await this.control.command('reserve', {
      provider: m.provider,
      key: i.idempotencyKey,
      authorizationId: i.authorizationId,
      invoiceId: i.invoiceId,
      kind,
      amountMinor: i.amountMinor,
      digest,
      expiresAt: i.expiresAt,
      ...(kind === 'refund'
        ? {
            captureKey: refund.captureKey,
            transactionId: refund.providerTransactionId,
          }
        : {}),
    });
    if (result.status === 'reserved' || result.status === 'unknown')
      return { status: result.status as 'reserved' | 'unknown' };
    if (result.status === 'existing' && result.result)
      return {
        status: 'existing' as const,
        result: result.result as SandboxResult,
      };
    throw new Error('Invalid reservation acknowledgment');
  }
  reserve(m: SandboxMerchant, i: SandboxIntent, d: string) {
    return this.reserveKind(m, i, d, 'capture');
  }
  reserveRefund(m: SandboxMerchant, i: SandboxRefund, d: string) {
    return this.reserveKind(m, i, d, 'refund');
  }
  private async finishKind(
    m: SandboxMerchant,
    i: SandboxIntent,
    result: SandboxResult,
    kind: 'capture' | 'refund',
  ) {
    this.scope(m, i);
    if (
      result.provider !== m.provider ||
      result.mode !== 'sandbox' ||
      result.amountMinor !== i.amountMinor ||
      result.currency !== 'USD'
    )
      throw new Error('Outcome scope denied');
    await this.control.command('finish', {
      provider: m.provider,
      key: i.idempotencyKey,
      authorizationId: i.authorizationId,
      invoiceId: i.invoiceId,
      kind,
      result,
    });
  }
  finish(m: SandboxMerchant, i: SandboxIntent, r: SandboxResult) {
    return this.finishKind(m, i, r, 'capture');
  }
  finishRefund(m: SandboxMerchant, i: SandboxRefund, r: SandboxResult) {
    return this.finishKind(m, i, r, 'refund');
  }
  async recordWebhook(
    m: SandboxMerchant,
    eventId: string,
    digest: string,
  ): Promise<'recorded' | 'duplicate'> {
    this.scope(m);
    if (!referencePattern.test(eventId) || !digestPattern.test(digest))
      throw new Error('Invalid webhook');
    const r = await this.control.command('webhook', {
      eventId,
      digest,
      provider: m.provider,
    });
    if (r.status !== 'recorded' && r.status !== 'duplicate')
      throw new Error('Webhook not durable');
    return r.status;
  }
  async recordObservation(m: SandboxMerchant, observation: GatewayObservation) {
    this.scope(m);
    if (
      ![observation.key, observation.observationId].every((v) =>
        uuid.test(v),
      ) ||
      !referencePattern.test(observation.transactionId) ||
      !digestPattern.test(observation.digest)
    )
      throw new Error('Invalid provider observation');
    return this.control.command('observe', {
      ...observation,
      provider: m.provider,
    });
  }
  async transactions(m: SandboxMerchant) {
    this.scope(m);
    return this.control.command('transactions', { provider: m.provider });
  }
  async reconcile(
    m: SandboxMerchant,
    input: {
      reportId: string;
      digest: string;
      snapshot: string;
      rows: readonly StatementRow[];
    },
  ) {
    this.scope(m);
    if (
      !uuid.test(input.reportId) ||
      !digestPattern.test(input.digest) ||
      !digestPattern.test(input.snapshot)
    )
      throw new Error('Invalid reconciliation identity');
    const rows = input.rows.map((r) => {
      if (
        r.organizationId !== m.organizationId ||
        r.merchantConfigId !== m.merchantConfigId ||
        r.provider !== m.provider ||
        r.mode !== 'sandbox'
      )
        throw new Error('Statement tenant denied');
      return {
        transactionId: r.transactionId,
        kind: r.kind,
        amountMinor: r.amountMinor,
        currency: r.currency,
      };
    });
    return this.control.command('reconcile', {
      ...input,
      rows,
      provider: m.provider,
    });
  }
}
