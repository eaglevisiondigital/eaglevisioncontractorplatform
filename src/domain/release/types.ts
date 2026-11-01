import type { customerPreview } from '../estimating/customer-preview';
export type SellingScope = ReturnType<typeof customerPreview> & {
  internal_test?: true;
};
export type ReleaseActor = 'staff' | 'customer';
interface Row {
  id: string;
  organization_id: string;
  customer_id: string;
  created_at: string;
}
export interface Offer extends Row {
  version_id: string;
  snapshot: SellingScope;
  expires_at: string;
}
export interface Decision extends Row {
  offer_id: string;
  decision: 'accepted' | 'declined' | 'changes_requested';
  note: string;
  consent_version: string;
  actor_id?: string;
}
export interface Contract extends Row {
  offer_id: string;
  terms: string;
  legal_reference: string;
  document_hash: string;
  document: {
    internal_test: true;
    scope: SellingScope;
    terms: string;
    legal_reference: string;
  };
}
export interface Signature extends Row {
  contract_id: string;
  typed_name: string;
  document_hash: string;
  consent_version: string;
  signed_at: string;
}
export interface Invoice extends Row {
  contract_id: string;
  invoice_number: string;
  currency: string;
  total_minor: number;
  snapshot: SellingScope;
}
export interface Authorization extends Row {
  invoice_id: string;
  amount_minor: number;
  currency: string;
  scope: 'one-time-synthetic-payment';
  expires_at: string;
}
export interface PaymentEvent extends Row {
  invoice_id: string;
  authorization_id: string;
  amount_minor: number;
  currency: string;
  kind: 'synthetic_capture' | 'synthetic_refund';
  adjusts_event_id: string | null;
  idempotency_key: string;
  provider: 'synthetic';
}
export interface LedgerEntry extends Row {
  invoice_id: string;
  event_id: string | null;
  currency: string;
  debit_account: 'receivable' | 'sandbox_clearing';
  credit_account: 'receivable' | 'sales' | 'tax_payable' | 'sandbox_clearing';
  amount_minor: number;
}
export interface SinkMessage extends Row {
  offer_id: string;
  channel: 'internal_sink';
  subject: string;
  body: string;
}
export interface EmailProfile {
  sender_name: string;
  sender_email: string;
  domain: string;
  status: 'unverified' | 'verified';
  verification_reference?: string | null;
}
export interface ReleaseWorkspace {
  internal_test: true;
  actor: ReleaseActor;
  release_offers: Offer[];
  release_decisions: Decision[];
  release_contracts: Contract[];
  release_signatures: Signature[];
  release_invoices: Invoice[];
  release_authorizations: Authorization[];
  release_payment_events: PaymentEvent[];
  release_ledger_entries: LedgerEntry[];
  release_messages: SinkMessage[];
  email_profile?: EmailProfile | null;
}
export interface ReleaseContext {
  id: string;
  name: string;
  actor: ReleaseActor;
}
export type ReleaseInput = Record<string, unknown>;
export const actions = [
  'publish_offer',
  'decide_offer',
  'create_contract',
  'sign_contract',
  'create_invoice',
  'authorize_payment',
  'synthetic_capture',
  'synthetic_refund',
  'configure_email',
  'link_customer',
] as const;
export type ReleaseAction = (typeof actions)[number];
export function emptyWorkspace(
  actor: ReleaseActor = 'staff',
): ReleaseWorkspace {
  return {
    internal_test: true,
    actor,
    release_offers: [],
    release_decisions: [],
    release_contracts: [],
    release_signatures: [],
    release_invoices: [],
    release_authorizations: [],
    release_payment_events: [],
    release_ledger_entries: [],
    release_messages: [],
  };
}
export function invoiceBalance(
  invoice: Invoice,
  events: readonly PaymentEvent[],
) {
  let balance = BigInt(invoice.total_minor);
  for (const event of events.filter((e) => e.invoice_id === invoice.id)) {
    if (
      event.organization_id !== invoice.organization_id ||
      event.customer_id !== invoice.customer_id ||
      event.currency !== invoice.currency ||
      !Number.isSafeInteger(event.amount_minor) ||
      event.amount_minor <= 0
    )
      throw new Error('Invalid invoice event');
    balance +=
      BigInt(event.amount_minor) *
      (event.kind === 'synthetic_capture' ? -1n : 1n);
  }
  if (balance < 0n || balance > BigInt(invoice.total_minor))
    throw new Error('Invoice reconciliation failed');
  return Number(balance);
}
export function verifyLedger(
  invoice: Invoice,
  entries: readonly LedgerEntry[],
  events: readonly PaymentEvent[],
) {
  const rows = entries.filter((e) => e.invoice_id === invoice.id);
  let receivable = 0n;
  for (const e of rows) {
    if (
      e.organization_id !== invoice.organization_id ||
      e.currency !== invoice.currency ||
      e.customer_id !== invoice.customer_id ||
      !Number.isSafeInteger(e.amount_minor) ||
      e.amount_minor <= 0
    )
      throw new Error('Invalid ledger entry');
    if (e.debit_account === 'receivable') receivable += BigInt(e.amount_minor);
    if (e.credit_account === 'receivable') receivable -= BigInt(e.amount_minor);
  }
  if (receivable !== BigInt(invoiceBalance(invoice, events)))
    throw new Error('Ledger does not reconcile');
  return Number(receivable);
}
