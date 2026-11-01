import type {
  SandboxIntent,
  SandboxIntentStore,
  SandboxMerchant,
  SandboxResult,
} from './sandbox';
import type { SandboxRefund, SandboxRefundStore } from './refunds';
import {
  digestPattern,
  exactKeys,
  referencePattern,
  uuid,
} from '../providers/safety';

export interface GatewaySql {
  query<T extends Record<string, unknown>>(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: T[] }>;
}
// A dedicated connection per transaction, never interleave begin/commit on a shared client.
export interface GatewayDatabase {
  transaction<T>(operation: (sql: GatewaySql) => Promise<T>): Promise<T>;
}
type Attempt = Record<string, unknown> & {
  request_digest: string;
  status: string;
  result: SandboxResult | null;
  amount_minor: number | string;
  invoice_id: string;
  merchant_id: string;
  kind: string;
  authorization_id: string;
};
export class PostgresSandboxIntentStore
  implements SandboxIntentStore, SandboxRefundStore
{
  constructor(
    private readonly database: GatewayDatabase,
    private readonly organizationId: string,
    private readonly merchantConfigId: string,
  ) {
    if (!uuid.test(organizationId) || !uuid.test(merchantConfigId))
      throw new Error('Invalid control scope');
  }
  private scope(m: SandboxMerchant, i: SandboxIntent) {
    if (
      m.mode !== 'sandbox' ||
      m.organizationId !== this.organizationId ||
      m.merchantConfigId !== this.merchantConfigId ||
      i.organizationId !== this.organizationId ||
      i.merchantConfigId !== this.merchantConfigId
    )
      throw new Error('Gateway control scope denied');
  }
  private async lock(sql: GatewaySql, m: SandboxMerchant) {
    const r = await sql.query(
      "select id from private.merchant_configurations where organization_id=$1 and id=$2 and environment='sandbox' and status='approved' and provider=$3 for update",
      [this.organizationId, this.merchantConfigId, m.provider],
    );
    if (r.rows.length !== 1)
      throw new Error('Current sandbox merchant approval required');
  }
  private async reserveOperation(
    m: SandboxMerchant,
    input: SandboxIntent | SandboxRefund,
    digest: string,
    kind: 'capture' | 'refund',
  ) {
    const i = Object.freeze({ ...input });
    m = Object.freeze({ ...m });
    this.scope(m, i);
    if (
      !digestPattern.test(digest) ||
      !Number.isSafeInteger(i.amountMinor) ||
      i.amountMinor < 1 ||
      i.amountMinor > 9_000_000_000_000 ||
      i.currency !== 'USD' ||
      ![i.invoiceId, i.authorizationId, i.idempotencyKey].every((v) =>
        uuid.test(v),
      ) ||
      !(Date.parse(i.expiresAt) > Date.now()) ||
      !(Date.parse(m.approvedUntil) > Date.now())
    )
      throw new Error('Invalid intent reservation');
    return this.database.transaction(async (sql) => {
      await this.lock(sql, m);
      // This table is intentionally not populated by internal laboratory consent.
      const authority = await sql.query(
        'select id,customer_id from private.sandbox_gateway_authorizations where organization_id=$1 and id=$2 and merchant_id=$3 and invoice_id=$4 and provider=$5 and kind=$6 and amount_minor=$7 and currency=$8 and request_digest=$9 and revoked_at is null and expires_at>clock_timestamp() for update',
        [
          this.organizationId,
          i.authorizationId,
          this.merchantConfigId,
          i.invoiceId,
          m.provider,
          kind,
          i.amountMinor,
          i.currency,
          digest,
        ],
      );
      if (authority.rows.length !== 1)
        throw new Error('Independent provider authorization required');
      const existing = await sql.query<Attempt>(
        'select * from private.sandbox_gateway_attempts where organization_id=$1 and idempotency_key=$2',
        [this.organizationId, i.idempotencyKey],
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (
          row.request_digest !== digest ||
          row.authorization_id !== i.authorizationId ||
          row.merchant_id !== this.merchantConfigId ||
          row.kind !== kind
        )
          throw new Error('Idempotency conflict');
        return row.status === 'pending' || row.status === 'unknown'
          ? { status: 'unknown' as const }
          : { status: 'existing' as const, result: row.result! };
      }
      let capture: string | null = null;
      if (kind === 'refund') {
        const refund = i as SandboxRefund;
        capture = refund.captureKey;
        const original = (
          await sql.query<Attempt>(
            "select a.* from private.sandbox_gateway_attempts a join private.sandbox_gateway_settlements s on s.organization_id=a.organization_id and s.capture_key=a.idempotency_key join private.sandbox_gateway_authorizations auth on auth.organization_id=a.organization_id and auth.id=a.authorization_id where a.organization_id=$1 and a.idempotency_key=$2 and a.merchant_id=$3 and a.invoice_id=$4 and a.kind='capture' and a.status='succeeded' and auth.customer_id=$5 for update of a",
            [
              this.organizationId,
              capture,
              this.merchantConfigId,
              i.invoiceId,
              authority.rows[0].customer_id,
            ],
          )
        ).rows[0];
        if (
          !original ||
          original.result?.transactionId !== refund.providerTransactionId
        )
          throw new Error('Settled matching capture required');
        const used = (
          await sql.query<{ amount: string }>(
            "select coalesce(sum(amount_minor),0)::text amount from private.sandbox_gateway_attempts where organization_id=$1 and capture_key=$2 and status<>'declined'",
            [this.organizationId, capture],
          )
        ).rows[0].amount;
        if (
          BigInt(used) + BigInt(i.amountMinor) >
          BigInt(original.amount_minor)
        )
          throw new Error('Refund exceeds unreserved capture');
      }
      await sql.query(
        'insert into private.sandbox_gateway_attempts(organization_id,idempotency_key,authorization_id,merchant_id,invoice_id,kind,capture_key,amount_minor,request_digest) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          this.organizationId,
          i.idempotencyKey,
          i.authorizationId,
          this.merchantConfigId,
          i.invoiceId,
          kind,
          capture,
          i.amountMinor,
          digest,
        ],
      );
      return { status: 'reserved' as const };
    });
  }
  reserve(m: SandboxMerchant, i: SandboxIntent, d: string) {
    return this.reserveOperation(m, i, d, 'capture');
  }
  reserveRefund(m: SandboxMerchant, i: SandboxRefund, d: string) {
    return this.reserveOperation(m, i, d, 'refund');
  }
  async recordWebhook(
    input: SandboxMerchant,
    eventId: string,
    digest: string,
  ): Promise<'recorded' | 'duplicate'> {
    const m = Object.freeze({ ...input });
    if (
      m.mode !== 'sandbox' ||
      m.organizationId !== this.organizationId ||
      m.merchantConfigId !== this.merchantConfigId ||
      !referencePattern.test(eventId) ||
      !digestPattern.test(digest)
    )
      throw new Error('Invalid webhook scope');
    return this.database.transaction(async (sql) => {
      await this.lock(sql, m);
      const old = await sql.query<{ body_digest: string }>(
        'select body_digest from private.sandbox_gateway_inbox where organization_id=$1 and merchant_id=$2 and event_id=$3',
        [this.organizationId, this.merchantConfigId, eventId],
      );
      if (old.rows.length) {
        if (old.rows[0].body_digest !== digest)
          throw new Error('Conflicting webhook replay');
        return 'duplicate';
      }
      await sql.query(
        'insert into private.sandbox_gateway_inbox(organization_id,merchant_id,event_id,body_digest) values($1,$2,$3,$4)',
        [this.organizationId, this.merchantConfigId, eventId, digest],
      );
      return 'recorded';
    });
  }
  private async finishOperation(
    m: SandboxMerchant,
    input: SandboxIntent,
    r: SandboxResult,
    kind: 'capture' | 'refund',
  ) {
    const i = Object.freeze({ ...input }),
      result = Object.freeze({ ...r });
    m = Object.freeze({ ...m });
    this.scope(m, i);
    exactKeys(result, [
      'status',
      'provider',
      'transactionId',
      'amountMinor',
      'currency',
      'mode',
    ]);
    if (
      result.provider !== m.provider ||
      result.mode !== 'sandbox' ||
      result.currency !== 'USD' ||
      result.amountMinor !== i.amountMinor ||
      !['succeeded', 'declined', 'unknown'].includes(result.status) ||
      (result.status === 'succeeded'
        ? typeof result.transactionId !== 'string' ||
          !referencePattern.test(result.transactionId) ||
          result.transactionId === '0'
        : result.transactionId !== null)
    )
      throw new Error('Invalid gateway result');
    await this.database.transaction(async (sql) => {
      // Persist uncertain outcomes even if authorization was revoked after submission.
      const row = (
        await sql.query<Attempt>(
          'select * from private.sandbox_gateway_attempts where organization_id=$1 and idempotency_key=$2 and merchant_id=$3 for update',
          [this.organizationId, i.idempotencyKey, this.merchantConfigId],
        )
      ).rows[0];
      if (
        !row ||
        row.kind !== kind ||
        row.invoice_id !== i.invoiceId ||
        row.authorization_id !== i.authorizationId ||
        BigInt(row.amount_minor) !== BigInt(i.amountMinor)
      )
        throw new Error('Unreserved result');
      if (row.status !== 'pending') {
        // JSONB ordering differs from JavaScript; compare explicit fields below.
        if (
          row.result &&
          Object.keys(result).every(
            (k) =>
              row.result![k as keyof SandboxResult] ===
              result[k as keyof SandboxResult],
          )
        )
          return;
        throw new Error(
          'Immutable gateway outcome; append reconciliation evidence',
        );
      }
      await sql.query(
        'update private.sandbox_gateway_attempts set status=$3,result=$4::jsonb where organization_id=$1 and idempotency_key=$2',
        [
          this.organizationId,
          i.idempotencyKey,
          result.status,
          JSON.stringify(result),
        ],
      );
    });
  }
  finish(m: SandboxMerchant, i: SandboxIntent, r: SandboxResult) {
    return this.finishOperation(m, i, r, 'capture');
  }
  finishRefund(m: SandboxMerchant, i: SandboxRefund, r: SandboxResult) {
    return this.finishOperation(m, i, r, 'refund');
  }
}
