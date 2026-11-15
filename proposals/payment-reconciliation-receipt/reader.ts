import { isProxy } from 'node:util/types';
import type { GatewaySql } from '../../server/payments/postgres-store';
import type { SandboxMerchant } from '../../server/payments/sandbox';
import { digestPattern, uuid } from '../../server/providers/safety';

export interface OriginalReconciliation {
  organizationId: string;
  merchantConfigId: string;
  provider: SandboxMerchant['provider'];
  mode: 'sandbox';
  reportId: string;
  evidenceDigest: string;
  snapshotDigest: string;
}
export interface ReconciliationSummary {
  missing: number;
  unexpected: number;
  conflicts: number;
  unresolved: number;
  expectedNetMinor: string;
  reportedNetMinor: string;
  balanced: boolean;
}
const unavailable = () => Error('Exact reconciliation receipt unavailable');
const UNKNOWN = Object.freeze({
  outcome: 'UNKNOWN' as const,
  financialEffect: false as const,
  settlement: 'UNVERIFIED' as const,
  holdRelease: false as const,
  currentLedgerMatch: 'NOT_ASSERTED' as const,
});
function own(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((k) => !descriptors[k] || !('value' in descriptors[k]))
  )
    throw unavailable();
  return Object.fromEntries(
    keys.map((k) => [k, descriptors[k].value]),
  ) as Record<string, unknown>;
}
const identityKeys = [
  'organizationId',
  'merchantConfigId',
  'provider',
  'mode',
  'reportId',
  'evidenceDigest',
  'snapshotDigest',
] as const;
function identity(input: unknown): Readonly<OriginalReconciliation> {
  const row = own(input, identityKeys);
  if (
    !['organizationId', 'merchantConfigId', 'reportId'].every(
      (k) => typeof row[k] === 'string' && uuid.test(row[k]),
    ) ||
    !['evidenceDigest', 'snapshotDigest'].every(
      (k) => typeof row[k] === 'string' && digestPattern.test(row[k]),
    ) ||
    typeof row.provider !== 'string' ||
    !['nmi', 'authorize_net'].includes(row.provider) ||
    row.mode !== 'sandbox'
  )
    throw unavailable();
  return Object.freeze({
    ...row,
    organizationId: String(row.organizationId).toLowerCase(),
    merchantConfigId: String(row.merchantConfigId).toLowerCase(),
    reportId: String(row.reportId).toLowerCase(),
  }) as unknown as Readonly<OriginalReconciliation>;
}
function summary(input: unknown): Readonly<ReconciliationSummary> {
  const r = own(input, [
    'missing',
    'unexpected',
    'conflicts',
    'unresolved',
    'expectedNetMinor',
    'reportedNetMinor',
    'balanced',
  ]);
  for (const k of ['missing', 'unexpected', 'conflicts', 'unresolved'])
    if (!Number.isSafeInteger(r[k]) || Number(r[k]) < 0 || Number(r[k]) > 1000)
      throw unavailable();
  for (const k of ['expectedNetMinor', 'reportedNetMinor']) {
    if (
      typeof r[k] !== 'string' ||
      !/^-?(0|[1-9][0-9]{0,15})$/.test(r[k]) ||
      r[k] === '-0'
    )
      throw unavailable();
    const n = BigInt(r[k]);
    if (n > 9000000000000000n || n < -9000000000000000n) throw unavailable();
  }
  if (
    typeof r.balanced !== 'boolean' ||
    r.balanced !==
      (r.missing === 0 &&
        r.unexpected === 0 &&
        r.conflicts === 0 &&
        r.unresolved === 0)
  )
    throw unavailable();
  return Object.freeze(r) as unknown as Readonly<ReconciliationSummary>;
}
const statement =
  'select private.sandbox_reconciliation_receipt($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::text) receipt';

/** UNAPPLIED offline reader proposal. Exactly the retained report identity, never
 * a writer, replay, latest lookup, customer balance, settlement or hold release.
 * Backend current-workload checks remain mandatory; this class supplies no Auth,
 * credentials, connection factory, route or installation authority.
 */
export class ProposedReconciliationReceiptReader {
  readonly #merchant: Readonly<SandboxMerchant>;
  readonly #query: GatewaySql['query'];
  constructor(
    connection: GatewaySql,
    merchant: SandboxMerchant,
    options: { testOnly: true },
  ) {
    if (
      own(options, ['testOnly']).testOnly !== true ||
      isProxy(connection) ||
      !connection ||
      typeof connection !== 'object'
    )
      throw unavailable();
    const query = Object.getOwnPropertyDescriptor(connection, 'query');
    if (!query || !('value' in query) || typeof query.value !== 'function')
      throw unavailable();
    this.#query = query.value.bind(connection) as GatewaySql['query'];
    const m = own(merchant, [
      'organizationId',
      'merchantConfigId',
      'provider',
      'mode',
      'approvalReference',
      'approvedUntil',
    ]);
    if (
      !['organizationId', 'merchantConfigId'].every(
        (k) => typeof m[k] === 'string' && uuid.test(m[k]),
      ) ||
      typeof m.provider !== 'string' ||
      !['nmi', 'authorize_net'].includes(m.provider) ||
      m.mode !== 'sandbox' ||
      typeof m.approvalReference !== 'string' ||
      m.approvalReference.trim().length < 8 ||
      typeof m.approvedUntil !== 'string' ||
      !Number.isFinite(Date.parse(m.approvedUntil)) ||
      Date.parse(m.approvedUntil) <= Date.now()
    )
      throw unavailable();
    this.#merchant = Object.freeze({
      ...m,
      organizationId: String(m.organizationId).toLowerCase(),
      merchantConfigId: String(m.merchantConfigId).toLowerCase(),
    }) as unknown as Readonly<SandboxMerchant>;
  }
  async read(original: OriginalReconciliation, cancellation?: AbortSignal) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    try {
      const id = identity(original),
        m = this.#merchant,
        deadline = Date.now() + 5000;
      const current = () => {
        if (
          cancellation?.aborted ||
          Date.now() >= deadline ||
          Date.parse(m.approvedUntil) <= Date.now()
        )
          throw unavailable();
      };
      current();
      if (
        id.organizationId !== m.organizationId ||
        id.merchantConfigId !== m.merchantConfigId ||
        id.provider !== m.provider
      )
        throw unavailable();
      const params = [
        id.organizationId,
        id.merchantConfigId,
        id.provider,
        id.reportId,
        id.evidenceDigest,
        id.snapshotDigest,
      ];
      const response = await new Promise<unknown>((resolve, reject) => {
        cancel = () => reject(unavailable());
        timer = setTimeout(
          cancel,
          Math.min(5000, Date.parse(m.approvedUntil) - Date.now()),
        );
        cancellation?.addEventListener('abort', cancel, { once: true });
        if (cancellation?.aborted) {
          cancel();
          return;
        }
        Promise.resolve(this.#query(statement, params)).then(resolve, () =>
          reject(unavailable()),
        );
      });
      current();
      const envelope = own(response, ['rows']);
      const rows = envelope.rows;
      if (!Array.isArray(rows) || isProxy(rows) || rows.length !== 1)
        throw unavailable();
      const item = Object.getOwnPropertyDescriptor(rows, '0');
      if (!item || !('value' in item)) throw unavailable();
      const value = own(item.value, ['receipt']).receipt;
      if (!value || typeof value !== 'object' || isProxy(value))
        throw unavailable();
      const outcome = Object.getOwnPropertyDescriptor(value, 'outcome');
      if (!outcome || !('value' in outcome)) throw unavailable();
      if (outcome.value === 'UNKNOWN') {
        own(value, ['outcome']);
        return UNKNOWN;
      }
      const receipt = own(value, [
        'outcome',
        ...identityKeys,
        'currency',
        'recordedAt',
        'report',
      ]);
      if (receipt.outcome !== 'RECORDED' || receipt.currency !== 'USD')
        throw unavailable();
      const observed = identity(
        Object.fromEntries(identityKeys.map((k) => [k, receipt[k]])),
      );
      if (
        identityKeys.some((k) => observed[k] !== id[k]) ||
        typeof receipt.recordedAt !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(
          receipt.recordedAt,
        ) ||
        !Number.isFinite(Date.parse(receipt.recordedAt)) ||
        Date.parse(receipt.recordedAt) > Date.now()
      )
        throw unavailable();
      const report = summary(receipt.report);
      current();
      return Object.freeze({
        outcome: 'RECORDED' as const,
        receipt: Object.freeze({
          ...id,
          currency: 'USD' as const,
          recordedAt: receipt.recordedAt,
          report,
        }),
        financialEffect: false as const,
        settlement: 'UNVERIFIED' as const,
        holdRelease: false as const,
        currentLedgerMatch: 'NOT_ASSERTED' as const,
      });
    } catch {
      return UNKNOWN;
    } finally {
      if (timer) clearTimeout(timer);
      if (cancel) cancellation?.removeEventListener('abort', cancel);
    }
  }
}
