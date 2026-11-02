import { sampleCompanies } from '../platform';
import { uuidPattern } from '../intake';
import {
  verifyLedger,
  type Invoice,
  type LedgerEntry,
  type PaymentEvent,
} from '../release/types';

export interface SyntheticFinancialExportInput {
  syntheticFixture: true;
  scope: {
    organizationId: string;
    customerId: string;
    propertyId: string | null;
    invoiceId: string;
    currency: string;
    asOf: string;
  };
  source: {
    kind: 'release-preview';
    reference: string;
    observedAt: string;
    coverage: 'complete' | 'partial' | 'unknown';
    outcome: 'known' | 'unknown';
    contractId: string;
    eventIds: readonly string[];
    ledgerEntryIds: readonly string[];
  };
  invoice: Invoice | null;
  events: readonly PaymentEvent[];
  ledgerEntries: readonly LedgerEntry[];
}
export type FinancialExportStatus =
  'RECONCILED_SYNTHETIC_ONLY' | 'INCOMPLETE' | 'UNKNOWN' | 'UNRECONCILED';

const denied = () => new Error('Invalid synthetic financial export evidence');
function object(value: unknown, keys?: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw denied();
  const record = value as Record<string, unknown>;
  if (keys && Object.keys(record).some((key) => !keys.includes(key)))
    throw denied();
  // Reject executable accessors. Never stringify an input record or private scope.
  if (
    Object.values(Object.getOwnPropertyDescriptors(record)).some(
      (descriptor) => !('value' in descriptor),
    )
  )
    throw denied();
  return record;
}
function text(value: unknown, limit = 120) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value) ||
    new TextDecoder().decode(new TextEncoder().encode(value)) !== value
  )
    throw denied();
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw denied();
  return value as T;
}
function id(value: unknown) {
  const result = text(value);
  if (!uuidPattern.test(result)) throw denied();
  return result;
}
function timestamp(value: unknown) {
  const result = text(value, 24);
  const time = Date.parse(result);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== result)
    throw denied();
  return result;
}
function minor(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 9e12)
    throw denied();
  return value as number;
}
function rows(value: unknown) {
  if (!Array.isArray(value) || value.length > 1000) throw denied();
  return value as unknown[];
}
function ids(value: unknown) {
  const result = rows(value).map(id).sort();
  if (new Set(result).size !== result.length) throw denied();
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
function freeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function csvCell(value: string) {
  const safe = /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Offline fixture projector only. No App import, database, token, provider or writer. */
export async function projectSyntheticFinancialExport(
  input: unknown,
  options: { enabled: boolean } = { enabled: false },
) {
  const option = object(options, ['enabled']);
  if (option.enabled !== true)
    throw new Error('Synthetic financial export is disabled');
  const request = object(input, [
    'syntheticFixture',
    'scope',
    'source',
    'invoice',
    'events',
    'ledgerEntries',
  ]);
  const rawScope = object(request.scope, [
    'organizationId',
    'customerId',
    'propertyId',
    'invoiceId',
    'currency',
    'asOf',
  ]);
  const scope = {
    organizationId: text(rawScope.organizationId),
    customerId: id(rawScope.customerId),
    propertyId: rawScope.propertyId === null ? null : id(rawScope.propertyId),
    invoiceId: id(rawScope.invoiceId),
    currency: text(rawScope.currency, 3),
    asOf: timestamp(rawScope.asOf),
  };
  if (
    request.syntheticFixture !== true ||
    !sampleCompanies.some((company) => company.id === scope.organizationId) ||
    !/^[A-Z]{3}$/.test(scope.currency)
  )
    throw denied();
  const rawSource = object(request.source, [
    'kind',
    'reference',
    'observedAt',
    'coverage',
    'outcome',
    'contractId',
    'eventIds',
    'ledgerEntryIds',
  ]);
  if (rawSource.kind !== 'release-preview') throw denied();
  const source = {
    kind: 'release-preview' as const,
    reference: text(rawSource.reference),
    observedAt: timestamp(rawSource.observedAt),
    coverage: choice(rawSource.coverage, [
      'complete',
      'partial',
      'unknown',
    ] as const),
    outcome: choice(rawSource.outcome, ['known', 'unknown'] as const),
    contractId: id(rawSource.contractId),
    eventIds: ids(rawSource.eventIds),
    ledgerEntryIds: ids(rawSource.ledgerEntryIds),
  };
  if (source.observedAt < scope.asOf) throw denied();
  const boundRow = (value: unknown) => {
    const row = object(value);
    if (
      row.organization_id !== scope.organizationId ||
      row.customer_id !== scope.customerId ||
      row.currency !== scope.currency ||
      row.invoice_id !== scope.invoiceId
    )
      throw denied();
    const amount = minor(row.amount_minor);
    const created = timestamp(row.created_at);
    if (amount <= 0 || created > scope.asOf) throw denied();
    return {
      id: id(row.id),
      organization_id: scope.organizationId,
      customer_id: scope.customerId,
      invoice_id: scope.invoiceId,
      currency: scope.currency,
      created_at: created,
      amount_minor: amount,
    };
  };
  const events: PaymentEvent[] = rows(request.events)
    .map((value) => {
      const raw = object(value);
      if (raw.provider !== 'synthetic') throw denied();
      return {
        ...boundRow(raw),
        authorization_id: id(raw.authorization_id),
        idempotency_key: id(raw.idempotency_key),
        kind: choice(raw.kind, [
          'synthetic_capture',
          'synthetic_refund',
        ] as const),
        provider: 'synthetic' as const,
        adjusts_event_id:
          raw.adjusts_event_id === null ? null : id(raw.adjusts_event_id),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ledger: LedgerEntry[] = rows(request.ledgerEntries)
    .map((value) => {
      const raw = object(value);
      return {
        ...boundRow(raw),
        event_id: raw.event_id === null ? null : id(raw.event_id),
        debit_account: choice(raw.debit_account, [
          'receivable',
          'sandbox_clearing',
        ] as const),
        credit_account: choice(raw.credit_account, [
          'receivable',
          'sales',
          'tax_payable',
          'sandbox_clearing',
        ] as const),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const records of [events, ledger])
    if (new Set(records.map((row) => row.id)).size !== records.length)
      throw denied();
  if (
    new Set(events.map((event) => event.idempotency_key)).size !== events.length
  )
    throw denied();

  let invoice: Invoice | null = null;
  let invoiceProjection: {
    id: string;
    contract_id: string;
    invoice_number: string;
    created_at: string;
    total_minor: string;
    tax_minor: string;
    sales_minor: string;
  } | null = null;
  if (request.invoice !== null) {
    const raw = object(request.invoice);
    const snapshot = object(raw.snapshot);
    const customer = object(snapshot.customer);
    const locationId =
      snapshot.location === null ? null : id(object(snapshot.location).id);
    const subtotal = minor(snapshot.subtotal_minor),
      discount = minor(snapshot.discount_minor),
      tax = minor(snapshot.tax_minor),
      total = minor(raw.total_minor);
    const created = timestamp(raw.created_at);
    if (
      raw.id !== scope.invoiceId ||
      raw.contract_id !== source.contractId ||
      raw.organization_id !== scope.organizationId ||
      raw.customer_id !== scope.customerId ||
      raw.currency !== scope.currency ||
      snapshot.currency !== scope.currency ||
      customer.id !== scope.customerId ||
      snapshot.internal_test !== true ||
      locationId !== scope.propertyId ||
      snapshot.total_minor !== total ||
      discount > subtotal ||
      BigInt(subtotal) - BigInt(discount) + BigInt(tax) !== BigInt(total) ||
      created > scope.asOf
    )
      throw denied();
    // Reconstruct fields consumed by the existing verifier; no private fields are serialized.
    invoice = {
      id: scope.invoiceId,
      organization_id: scope.organizationId,
      customer_id: scope.customerId,
      contract_id: source.contractId,
      currency: scope.currency,
      total_minor: total,
      created_at: created,
      invoice_number: text(raw.invoice_number),
      snapshot: snapshot as unknown as Invoice['snapshot'],
    };
    invoiceProjection = {
      id: invoice.id,
      contract_id: invoice.contract_id,
      invoice_number: invoice.invoice_number,
      created_at: created,
      total_minor: String(total),
      tax_minor: String(tax),
      sales_minor: String(total - tax),
    };
  }
  const reasons: string[] = [];
  const actualIds = [events.map((row) => row.id), ledger.map((row) => row.id)];
  const expectedIds = [source.eventIds, source.ledgerEntryIds];
  let conflict = false;
  let missingRecords = false;
  for (let index = 0; index < 2; index++) {
    if (expectedIds[index].some((value) => !actualIds[index].includes(value))) {
      missingRecords = true;
      reasons.push('SOURCE_RECORDS_MISSING');
    }
    if (actualIds[index].some((value) => !expectedIds[index].includes(value)))
      conflict = true;
  }
  let balance: number | null = null;
  if (!invoice) reasons.push('INVOICE_UNAVAILABLE');
  else if (!missingRecords && source.coverage === 'complete') {
    try {
      balance = verifyLedger(invoice, ledger, events);
      const captures = new Map(
        events
          .filter((event) => event.kind === 'synthetic_capture')
          .map((event) => [event.id, event]),
      );
      const consumedAuthorizations = new Set<string>();
      for (const event of events) {
        if (event.created_at < invoice.created_at) throw denied();
        if (event.kind === 'synthetic_capture') {
          if (
            event.adjusts_event_id !== null ||
            consumedAuthorizations.has(event.authorization_id)
          )
            throw denied();
          consumedAuthorizations.add(event.authorization_id);
        } else {
          const capture = captures.get(event.adjusts_event_id ?? '');
          if (
            !capture ||
            event.authorization_id !== capture.authorization_id ||
            event.created_at < capture.created_at
          )
            throw denied();
          const refunds = events
            .filter(
              (row) =>
                row.kind === 'synthetic_refund' &&
                row.adjusts_event_id === capture.id,
            )
            .reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
          if (refunds > BigInt(capture.amount_minor)) throw denied();
        }
      }
      const posting = (account: LedgerEntry['credit_account']) =>
        ledger
          .filter(
            (row) => row.event_id === null && row.credit_account === account,
          )
          .reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
      if (
        posting('tax_payable') !== BigInt(invoiceProjection!.tax_minor) ||
        posting('sales') !== BigInt(invoiceProjection!.sales_minor)
      )
        throw denied();
      for (const row of ledger) {
        const event = events.find((value) => value.id === row.event_id);
        if (
          row.created_at < invoice.created_at ||
          (event && row.created_at < event.created_at)
        )
          throw denied();
      }
    } catch {
      conflict = true;
    }
  }
  if (conflict) reasons.push('EVIDENCE_CONFLICT');
  if (source.outcome === 'unknown') reasons.push('UNRESOLVED_OUTCOME');
  if (source.coverage === 'unknown') reasons.push('COVERAGE_UNKNOWN');
  if (source.coverage === 'partial') reasons.push('PARTIAL_COVERAGE');
  const uniqueReasons = [...new Set(reasons)].sort();
  const unknown = uniqueReasons.some((reason) =>
    [
      'SOURCE_RECORDS_MISSING',
      'INVOICE_UNAVAILABLE',
      'UNRESOLVED_OUTCOME',
      'COVERAGE_UNKNOWN',
    ].includes(reason),
  );
  const status: FinancialExportStatus = conflict
    ? 'UNRECONCILED'
    : unknown
      ? 'UNKNOWN'
      : source.coverage === 'partial'
        ? 'INCOMPLETE'
        : 'RECONCILED_SYNTHETIC_ONLY';
  const summary =
    status === 'RECONCILED_SYNTHETIC_ONLY' &&
    invoiceProjection &&
    balance !== null
      ? {
          invoice_total_minor: invoiceProjection.total_minor,
          sales_minor: invoiceProjection.sales_minor,
          tax_minor: invoiceProjection.tax_minor,
          captured_minor: events
            .filter((event) => event.kind === 'synthetic_capture')
            .reduce((sum, event) => sum + BigInt(event.amount_minor), 0n)
            .toString(),
          refunded_minor: events
            .filter((event) => event.kind === 'synthetic_refund')
            .reduce((sum, event) => sum + BigInt(event.amount_minor), 0n)
            .toString(),
          balance_minor: String(balance),
        }
      : null;
  const safeEvents = events.map((event) => ({
    id: event.id,
    authorization_id: event.authorization_id,
    idempotency_key: event.idempotency_key,
    kind: event.kind,
    adjusts_event_id: event.adjusts_event_id,
    created_at: event.created_at,
    amount_minor: String(event.amount_minor),
  }));
  const safeLedger = ledger.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    debit_account: row.debit_account,
    credit_account: row.credit_account,
    created_at: row.created_at,
    amount_minor: String(row.amount_minor),
  }));
  // All source fields have been copied before the first await. Hashes bind only safe facts.
  const safeSource = {
    scope,
    source,
    invoice: invoiceProjection,
    events: safeEvents,
    ledgerEntries: safeLedger,
  };
  const sourceSha256 = await digest(canonical(safeSource));
  const content = {
    format: 'propel-synthetic-finance-export-v1' as const,
    label: 'Synthetic Financial Reconciliation — Offline Reference Only',
    authority:
      'No bank settlement, issued debt, payment, tax, legal or accountant approval',
    moneyEncoding: 'integer-minor-decimal-string' as const,
    ...safeSource,
    status,
    reasons: uniqueReasons,
    summary,
  };
  const contentSha256 = await digest(canonical(content));
  const packet = {
    ...content,
    id: `finance-export-${contentSha256}`,
    integrity: { algorithm: 'SHA-256' as const, sourceSha256, contentSha256 },
  };
  const canonicalJson = canonical(packet);
  const columns = [
    'row_type',
    'record_id',
    'source_event_id',
    'adjusts_event_id',
    'organization_id',
    'customer_id',
    'property_id',
    'invoice_id',
    'currency',
    'as_of',
    'created_at',
    'amount_minor',
    'debit_account',
    'credit_account',
    'label',
    'status',
    'coverage',
    'source_sha256',
    'content_sha256',
  ];
  const csvRow = (
    kind: string,
    recordId: string,
    created: string,
    amount: string,
    label = '',
    eventId = '',
    adjusts = '',
    debit = '',
    credit = '',
  ) => [
    kind,
    recordId,
    eventId,
    adjusts,
    scope.organizationId,
    scope.customerId,
    scope.propertyId ?? '',
    scope.invoiceId,
    scope.currency,
    scope.asOf,
    created,
    amount,
    debit,
    credit,
    label,
    status,
    source.coverage,
    sourceSha256,
    contentSha256,
  ];
  const csvRows = [
    columns,
    csvRow('metadata', packet.id, source.observedAt, '', source.reference),
    ...(invoiceProjection
      ? [
          csvRow(
            'invoice',
            invoiceProjection.id,
            invoiceProjection.created_at,
            invoiceProjection.total_minor,
            invoiceProjection.invoice_number,
          ),
        ]
      : []),
    ...safeEvents.map((event) =>
      csvRow(
        event.kind,
        event.id,
        event.created_at,
        event.amount_minor,
        '',
        event.id,
        event.adjusts_event_id ?? '',
      ),
    ),
    ...safeLedger.map((row) =>
      csvRow(
        'ledger',
        row.id,
        row.created_at,
        row.amount_minor,
        '',
        row.event_id ?? '',
        '',
        row.debit_account,
        row.credit_account,
      ),
    ),
    ...(summary
      ? Object.entries(summary).map(([key, value]) =>
          csvRow('summary', key, scope.asOf, value),
        )
      : []),
  ];
  const csv =
    csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return freeze({
    packet,
    canonicalJson,
    csv,
    integrity: {
      ...packet.integrity,
      jsonSha256: await digest(canonicalJson),
      csvSha256: await digest(csv),
    },
  });
}
