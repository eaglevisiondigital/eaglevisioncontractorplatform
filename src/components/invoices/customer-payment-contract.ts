import { ReleasePreview, documentHash } from '../../domain/release/preview';
import { customerPreview } from '../../domain/estimating/customer-preview';
import { projectSyntheticFinancialExport } from '../../domain/finance/export';

export interface CustomerPaymentAccess {
  mode: 'fictional-local';
  organizationId: string;
  customerId: string;
  propertyId: string | null;
  sourceVersionId: string;
  invoiceId: string;
  sessionId: string;
  active: boolean;
  expiresAt: number;
}
export interface CustomerPaymentSource {
  release: ReleasePreview;
  current: () => CustomerPaymentAccess;
  now?: () => number;
}
const denied = () =>
  Error('Exact current payment evidence unavailable · UNKNOWN');
const records = new WeakMap<object, () => void>();
function frozen<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
/** Local canonical-engine reader only. No commercial billing FK bridge, provider
 * response, browser URL, genuine Auth proof or network implementation is accepted.
 * A future server reader must enforce current customer authority independently.
 */
export async function readCustomerPayment(source: CustomerPaymentSource) {
  if (!(source.release instanceof ReleasePreview)) throw denied();
  const now = source.now ?? Date.now;
  const access = structuredClone(source.current());
  const identity = JSON.stringify(access);
  let latest = now(),
    invalid = false;
  if (
    access.mode !== 'fictional-local' ||
    access.active !== true ||
    typeof access.sessionId !== 'string' ||
    !access.sessionId.trim() ||
    !Number.isSafeInteger(latest) ||
    !Number.isSafeInteger(access.expiresAt) ||
    access.expiresAt <= latest ||
    access.expiresAt - latest > 300_000
  )
    throw denied();
  const version = source.release.version;
  const workspace = source.release.read('customer');
  const sourceIdentity = JSON.stringify([version, workspace]);
  const check = () => {
    if (invalid) throw denied();
    try {
      const time = now();
      if (
        !Number.isSafeInteger(time) ||
        time < latest ||
        time >= access.expiresAt ||
        JSON.stringify(source.current()) !== identity ||
        JSON.stringify([
          source.release.version,
          source.release.read('customer'),
        ]) !== sourceIdentity
      )
        throw denied();
      latest = time;
    } catch {
      invalid = true;
      throw denied();
    }
  };
  check();
  if (
    !workspace.internal_test ||
    source.release.organizationId !== access.organizationId ||
    version.organization_id !== access.organizationId ||
    version.id !== access.sourceVersionId ||
    version.status !== 'issued' ||
    version.customer_snapshot.id !== access.customerId ||
    (version.location_snapshot?.id ?? null) !== access.propertyId
  )
    throw denied();
  const invoice = workspace.release_invoices.find(
    (i) => i.id === access.invoiceId,
  );
  const contract = workspace.release_contracts.find(
    (c) => c.id === invoice?.contract_id,
  );
  const offer = workspace.release_offers.find(
    (o) => o.id === contract?.offer_id,
  );
  const scope = { ...customerPreview(version), internal_test: true as const };
  if (
    !invoice ||
    !contract ||
    !offer ||
    offer.version_id !== version.id ||
    [invoice, contract, offer].some(
      (row) =>
        row.organization_id !== access.organizationId ||
        row.customer_id !== access.customerId,
    ) ||
    JSON.stringify(invoice.snapshot) !== JSON.stringify(scope) ||
    JSON.stringify(offer.snapshot) !== JSON.stringify(scope) ||
    JSON.stringify(contract.document.scope) !== JSON.stringify(scope) ||
    (await documentHash(contract.document)) !== contract.document_hash
  )
    throw denied();
  check();
  const events = workspace.release_payment_events.filter(
    (e) => e.invoice_id === invoice.id,
  );
  const ledgerEntries = workspace.release_ledger_entries.filter(
    (e) => e.invoice_id === invoice.id,
  );
  for (const event of events) {
    const auth = workspace.release_authorizations.find(
      (a) => a.id === event.authorization_id,
    );
    if (
      !auth ||
      auth.organization_id !== access.organizationId ||
      auth.customer_id !== access.customerId ||
      auth.invoice_id !== invoice.id ||
      auth.currency !== invoice.currency ||
      auth.scope !== 'one-time-synthetic-payment' ||
      (event.kind === 'synthetic_capture' &&
        (auth.amount_minor !== event.amount_minor ||
          auth.created_at > event.created_at ||
          auth.expires_at <= event.created_at))
    )
      throw denied();
  }
  const asOf = new Date(latest).toISOString();
  const { packet } = await projectSyntheticFinancialExport(
    {
      syntheticFixture: true,
      scope: {
        organizationId: access.organizationId,
        customerId: access.customerId,
        propertyId: access.propertyId,
        invoiceId: invoice.id,
        currency: invoice.currency,
        asOf,
      },
      source: {
        kind: 'release-preview',
        reference: `customer-payment:${invoice.id}`,
        observedAt: asOf,
        coverage: 'complete',
        outcome: 'known',
        contractId: contract.id,
        eventIds: events.map((e) => e.id),
        ledgerEntryIds: ledgerEntries.map((e) => e.id),
      },
      invoice,
      events,
      ledgerEntries,
    },
    { enabled: true },
  );
  check();
  if (packet.status !== 'RECONCILED_SYNTHETIC_ONLY' || !packet.summary)
    throw denied();
  const balance = Number(packet.summary.balance_minor);
  const result = frozen({
    mode: 'fictional-local' as const,
    sourceCategory: 'canonical-release-preview' as const,
    commercialBridge: 'HELD' as const,
    organizationId: access.organizationId,
    customerId: access.customerId,
    propertyId: access.propertyId,
    sourceVersionId: version.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    companyName: scope.company.name,
    currency: invoice.currency,
    asOf,
    expiresAt: access.expiresAt,
    status:
      balance === 0
        ? ('PAID' as const)
        : balance === invoice.total_minor
          ? ('UNPAID' as const)
          : ('PARTIALLY_PAID' as const),
    totalMinor: invoice.total_minor,
    balanceMinor: balance,
    capturedMinor: Number(packet.summary.captured_minor),
    refundedMinor: Number(packet.summary.refunded_minor),
    receipts: events.map((e) => ({
      eventId: e.id,
      kind: e.kind,
      amountMinor: e.amount_minor,
      createdAt: e.created_at,
      adjustsEventId: e.adjusts_event_id,
    })),
    link: {
      kind: 'synthetic-non-navigable' as const,
      href: null,
      expiresAt: access.expiresAt,
      execution: 'disabled' as const,
    },
    settlement: 'UNVERIFIED' as const,
  });
  records.set(result, check);
  return result;
}
export type CustomerPaymentSnapshot = Awaited<
  ReturnType<typeof readCustomerPayment>
>;
/** Recheck after waits and at every render/disclosure. Invalidity is sticky
 * for this exact snapshot; only a fresh explicit read may observe a later source. */
export function inspectCustomerPayment(snapshot: CustomerPaymentSnapshot) {
  const check = records.get(snapshot);
  if (!check) throw denied();
  check();
  return snapshot;
}
export type CustomerPaymentRead =
  | { status: 'ready'; snapshot: CustomerPaymentSnapshot }
  | { status: 'loading' | 'unknown' | 'denied' };
