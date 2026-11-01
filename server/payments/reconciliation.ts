import { referencePattern, uuid } from '../providers/safety';
import type { SandboxMerchant } from './sandbox';
export interface StatementRow {
  organizationId: string;
  merchantConfigId: string;
  provider: SandboxMerchant['provider'];
  mode: 'sandbox';
  transactionId: string;
  kind: 'capture' | 'refund';
  amountMinor: number;
  currency: 'USD';
}
export function reconcileStatement(
  merchant: SandboxMerchant,
  expected: readonly StatementRow[],
  reported: readonly StatementRow[],
) {
  if (
    merchant.mode !== 'sandbox' ||
    !uuid.test(merchant.organizationId) ||
    !uuid.test(merchant.merchantConfigId)
  )
    throw new Error('Invalid reconciliation scope');
  function index(rows: readonly StatementRow[]) {
    const map = new Map<string, StatementRow>();
    for (const r of rows) {
      if (
        r.organizationId !== merchant.organizationId ||
        r.merchantConfigId !== merchant.merchantConfigId ||
        r.provider !== merchant.provider ||
        r.mode !== 'sandbox' ||
        r.currency !== 'USD' ||
        !referencePattern.test(r.transactionId) ||
        r.transactionId === '0' ||
        !['capture', 'refund'].includes(r.kind) ||
        !Number.isSafeInteger(r.amountMinor) ||
        r.amountMinor <= 0
      )
        throw new Error('Invalid reconciliation row');
      if (map.has(r.transactionId))
        throw new Error('Duplicate statement transaction');
      map.set(r.transactionId, { ...r });
    }
    return map;
  }
  const local = index(expected),
    provider = index(reported),
    missing: string[] = [],
    unexpected: string[] = [],
    conflicts: string[] = [];
  for (const [id, row] of local) {
    const actual = provider.get(id);
    if (!actual) missing.push(id);
    else if (row.kind !== actual.kind || row.amountMinor !== actual.amountMinor)
      conflicts.push(id);
  }
  for (const id of provider.keys()) if (!local.has(id)) unexpected.push(id);
  const total = (rows: readonly StatementRow[]) =>
    rows
      .reduce(
        (n, r) => n + BigInt(r.amountMinor) * (r.kind === 'refund' ? -1n : 1n),
        0n,
      )
      .toString();
  return Object.freeze({
    balanced: !missing.length && !unexpected.length && !conflicts.length,
    missing,
    unexpected,
    conflicts,
    expectedNetMinor: total(expected),
    reportedNetMinor: total(reported),
  });
}
