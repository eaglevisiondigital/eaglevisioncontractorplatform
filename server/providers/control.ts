import type { GatewaySql } from '../payments/postgres-store';
import { exactKeys, uuid } from './safety';

export type ProviderService = 'payment' | 'email' | 'agreement';
/** Direct dedicated workload connection only. No PostgREST, service key or
 * request-scoped owner connection. SQL independently checks session_user and lease.
 * This class cannot create a lease, login, authorization or execute arbitrary SQL. */
export class ProviderControl {
  private readonly organizationId: string;
  private readonly scopeId: string;
  constructor(
    private readonly connection: GatewaySql,
    scope: {
      organizationId: string;
      scopeId: string;
      service: ProviderService;
    },
  ) {
    exactKeys(scope, ['organizationId', 'scopeId', 'service']);
    if (
      ![scope.organizationId, scope.scopeId].every((v) => uuid.test(v)) ||
      !['payment', 'email', 'agreement'].includes(scope.service)
    )
      throw new Error('Invalid provider scope');
    this.organizationId = scope.organizationId;
    this.scopeId = scope.scopeId;
    this.service = scope.service;
  }
  readonly service: ProviderService;
  async command(action: string, input: Record<string, unknown>) {
    const allowed =
      this.service === 'payment'
        ? [
            'reserve',
            'finish',
            'webhook',
            'observe',
            'transactions',
            'reconcile',
          ]
        : this.service === 'email'
          ? ['domain', 'prepare', 'event']
          : ['load', 'checkpoint', 'complete', 'event'];
    if (!allowed.includes(action)) throw new Error('Provider command denied');
    const sql =
      this.service === 'payment'
        ? 'select private.sandbox_gateway_control($1::uuid,$2::uuid,$3::text,$4::jsonb) result'
        : this.service === 'email'
          ? 'select private.provider_email_control($1::uuid,$2::uuid,$3::text,$4::jsonb) result'
          : 'select private.provider_agreement_control($1::uuid,$2::uuid,$3::text,$4::jsonb) result';
    const data = JSON.stringify(input);
    if (Buffer.byteLength(data) > 16384)
      throw new Error('Provider command too large');
    const rows = (
      await this.connection.query<{ result: Record<string, unknown> }>(sql, [
        this.organizationId,
        this.scopeId,
        action,
        data,
      ])
    ).rows;
    if (
      rows.length !== 1 ||
      !rows[0].result ||
      typeof rows[0].result !== 'object'
    )
      throw new Error('Missing durable acknowledgment');
    return rows[0].result;
  }
  assertScope(
    organizationId: string,
    scopeId: string,
    service: ProviderService,
  ) {
    if (
      organizationId !== this.organizationId ||
      scopeId !== this.scopeId ||
      service !== this.service
    )
      throw new Error('Provider scope denied');
  }
}
