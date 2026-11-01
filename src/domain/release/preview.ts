// Explicit synthetic-only repository. Never used as a connected-data fallback.
import type { EstimateVersion } from '../estimating/types';
import { customerPreview } from '../estimating/customer-preview';
import {
  emptyWorkspace,
  invoiceBalance,
  type ReleaseAction,
  type ReleaseInput,
  type ReleaseActor,
  type ReleaseWorkspace,
  type LedgerEntry,
} from './types';
const id = () => crypto.randomUUID();
const number = (v: unknown, min = 1, max = 9_000_000_000_000) => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw new Error('Check amount');
  return v;
};
const text = (v: unknown, min = 1, max = 20000) => {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max)
    throw new Error('Check text');
  return v;
};
export async function documentHash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export class ReleasePreview {
  private data: ReleaseWorkspace = emptyWorkspace();
  constructor(
    readonly organizationId: string,
    readonly version: EstimateVersion,
  ) {}
  read(actor: ReleaseActor): ReleaseWorkspace {
    return structuredClone({
      ...this.data,
      actor,
      ...(actor === 'customer' ? { email_profile: undefined } : {}),
    });
  }
  private pending: Promise<unknown> = Promise.resolve();
  command(actor: ReleaseActor, action: ReleaseAction, p: ReleaseInput) {
    const result = this.pending.then(() => this.apply(actor, action, p));
    this.pending = result.catch(() => {});
    return result;
  }
  private async apply(
    actor: ReleaseActor,
    action: ReleaseAction,
    p: ReleaseInput,
  ) {
    const fields: Record<ReleaseAction, string[]> = {
      publish_offer: ['version_id'],
      decide_offer: ['offer_id', 'decision', 'note', 'consent'],
      create_contract: ['offer_id', 'terms', 'legal_reference'],
      sign_contract: ['contract_id', 'typed_name', 'document_hash', 'consent'],
      create_invoice: ['contract_id'],
      authorize_payment: ['invoice_id', 'amount_minor', 'consent'],
      synthetic_capture: [
        'invoice_id',
        'authorization_id',
        'amount_minor',
        'idempotency_key',
        'adjusts_event_id',
      ],
      synthetic_refund: [
        'invoice_id',
        'authorization_id',
        'amount_minor',
        'idempotency_key',
        'adjusts_event_id',
      ],
      configure_email: ['sender_name', 'sender_email', 'domain'],
      link_customer: ['customer_id', 'user_id', 'active'],
    };
    if (
      !fields[action] ||
      Object.keys(p).some((k) => !fields[action].includes(k)) ||
      this.version.organization_id !== this.organizationId
    )
      throw new Error('Unexpected command fields or company');
    const data = structuredClone(this.data),
      now = new Date().toISOString(),
      customer_id = this.version.payload.customer_id;
    const row = () => ({
      id: id(),
      organization_id: this.organizationId,
      customer_id,
      created_at: now,
    });
    const requireStaff = () => {
      if (actor !== 'staff') throw new Error('Staff review required');
    };
    const requireCustomer = () => {
      if (actor !== 'customer') throw new Error('Customer identity required');
    };
    const find = <T extends { id: string }>(rows: T[], key: unknown) => {
      const value = rows.find((v) => v.id === key);
      if (!value) throw new Error('Record unavailable');
      return value;
    };
    if (action === 'publish_offer') {
      requireStaff();
      if (
        p.version_id !== this.version.id ||
        this.version.status !== 'issued' ||
        data.release_offers.some((o) => o.version_id === p.version_id)
      )
        throw new Error('Current issued version required');
      const offer = {
        ...row(),
        version_id: this.version.id,
        snapshot: {
          ...customerPreview(this.version),
          internal_test: true as const,
        },
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      data.release_offers.push(offer);
      data.release_messages.push({
        ...row(),
        offer_id: offer.id,
        channel: 'internal_sink',
        subject: `Internal estimate preview · ${offer.snapshot.company.name}`,
        body: 'Synthetic internal sink only. No email was sent.',
      });
    } else if (action === 'decide_offer') {
      requireCustomer();
      const offer = find(data.release_offers, p.offer_id);
      if (
        p.consent !== true ||
        Date.parse(offer.expires_at) <= Date.now() ||
        data.release_decisions.some((d) => d.offer_id === offer.id)
      )
        throw new Error('Review and explicit consent required');
      if (
        !['accepted', 'declined', 'changes_requested'].includes(
          String(p.decision),
        )
      )
        throw new Error('Choose a decision');
      data.release_decisions.push({
        ...row(),
        offer_id: offer.id,
        decision: p.decision as 'accepted' | 'declined' | 'changes_requested',
        note: text(p.note, 0, 2000),
        consent_version: 'internal-test-v1',
      });
    } else if (action === 'create_contract') {
      requireStaff();
      const offer = find(data.release_offers, p.offer_id);
      if (
        !data.release_decisions.some(
          (d) => d.offer_id === offer.id && d.decision === 'accepted',
        ) ||
        data.release_contracts.some((k) => k.offer_id === offer.id)
      )
        throw new Error(
          'Accepted estimate without an existing contract required',
        );
      const terms = text(p.terms, 20),
        legal_reference = text(p.legal_reference, 8, 1000),
        document = {
          internal_test: true as const,
          scope: offer.snapshot,
          terms,
          legal_reference,
        };
      data.release_contracts.push({
        ...row(),
        offer_id: offer.id,
        terms,
        legal_reference,
        document,
        document_hash: await documentHash(document),
      });
    } else if (action === 'sign_contract') {
      requireCustomer();
      const contract = find(data.release_contracts, p.contract_id);
      if (
        p.consent !== true ||
        p.document_hash !== contract.document_hash ||
        data.release_signatures.some((s) => s.contract_id === contract.id)
      )
        throw new Error('Exact unsigned document and consent required');
      data.release_signatures.push({
        ...row(),
        contract_id: contract.id,
        typed_name: text(p.typed_name, 2, 160),
        document_hash: contract.document_hash,
        consent_version: 'internal-test-v1',
        signed_at: now,
      });
    } else if (action === 'create_invoice') {
      requireStaff();
      const contract = find(data.release_contracts, p.contract_id);
      if (
        !data.release_signatures.some((s) => s.contract_id === contract.id) ||
        data.release_invoices.some((i) => i.contract_id === contract.id)
      )
        throw new Error('Signed contract without an existing invoice required');
      const scope = contract.document.scope,
        invoice = {
          ...row(),
          contract_id: contract.id,
          invoice_number: `TEST-INV-${String(data.release_invoices.length + 1).padStart(6, '0')}`,
          currency: scope.currency,
          total_minor: number(scope.total_minor),
          snapshot: scope,
        };
      data.release_invoices.push(invoice);
      const ledger = (
        credit_account: LedgerEntry['credit_account'],
        amount_minor: number,
      ) =>
        data.release_ledger_entries.push({
          ...row(),
          invoice_id: invoice.id,
          event_id: null,
          currency: invoice.currency,
          debit_account: 'receivable',
          credit_account,
          amount_minor,
        });
      if (invoice.total_minor - scope.tax_minor > 0)
        ledger('sales', invoice.total_minor - scope.tax_minor);
      if (scope.tax_minor > 0) ledger('tax_payable', scope.tax_minor);
    } else if (action === 'authorize_payment') {
      requireCustomer();
      const invoice = find(data.release_invoices, p.invoice_id);
      if (p.consent !== true)
        throw new Error('Explicit authorization required');
      data.release_authorizations.push({
        ...row(),
        invoice_id: invoice.id,
        amount_minor: number(
          p.amount_minor,
          1,
          invoiceBalance(invoice, data.release_payment_events),
        ),
        currency: invoice.currency,
        scope: 'one-time-synthetic-payment',
        expires_at: new Date(Date.now() + 1800000).toISOString(),
      });
    } else if (
      action === 'synthetic_capture' ||
      action === 'synthetic_refund'
    ) {
      requireStaff();
      const invoice = find(data.release_invoices, p.invoice_id),
        authorization = find(data.release_authorizations, p.authorization_id),
        amount = number(p.amount_minor),
        key = text(p.idempotency_key),
        adjusts = p.adjusts_event_id === null ? null : text(p.adjusts_event_id);
      if (
        authorization.invoice_id !== invoice.id ||
        authorization.currency !== invoice.currency
      )
        throw new Error('Authorization mismatch');
      const previous = data.release_payment_events.find(
        (e) => e.idempotency_key === key,
      );
      if (previous) {
        if (
          previous.invoice_id !== invoice.id ||
          previous.authorization_id !== authorization.id ||
          previous.kind !== action ||
          previous.amount_minor !== amount ||
          previous.adjusts_event_id !== adjusts
        )
          throw new Error('Idempotency conflict');
        return;
      }
      if (action === 'synthetic_capture') {
        if (
          adjusts !== null ||
          Date.parse(authorization.expires_at) <= Date.now() ||
          authorization.amount_minor !== amount ||
          data.release_payment_events.some(
            (e) =>
              e.authorization_id === authorization.id &&
              e.kind === 'synthetic_capture',
          ) ||
          amount > invoiceBalance(invoice, data.release_payment_events)
        )
          throw new Error('Authorization expired, consumed or exceeds balance');
      } else {
        const capture = find(data.release_payment_events, adjusts),
          refunded = data.release_payment_events
            .filter((e) => e.adjusts_event_id === capture.id)
            .reduce((n, e) => n + e.amount_minor, 0);
        if (
          capture.invoice_id !== invoice.id ||
          capture.authorization_id !== authorization.id ||
          capture.kind !== 'synthetic_capture' ||
          amount > capture.amount_minor - refunded
        )
          throw new Error('Refund exceeds matching capture');
      }
      const event = {
        ...row(),
        invoice_id: invoice.id,
        authorization_id: authorization.id,
        amount_minor: amount,
        currency: invoice.currency,
        kind: action,
        adjusts_event_id: adjusts,
        idempotency_key: key,
        provider: 'synthetic' as const,
      };
      data.release_payment_events.push(event);
      data.release_ledger_entries.push({
        ...row(),
        invoice_id: invoice.id,
        event_id: event.id,
        currency: invoice.currency,
        debit_account:
          action === 'synthetic_capture' ? 'sandbox_clearing' : 'receivable',
        credit_account:
          action === 'synthetic_capture' ? 'receivable' : 'sandbox_clearing',
        amount_minor: amount,
      });
    } else if (action === 'configure_email') {
      requireStaff();
      const sender_email = text(p.sender_email, 3, 254).toLowerCase(),
        domain = text(p.domain, 3, 253).toLowerCase();
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender_email) ||
        sender_email.split('@')[1] !== domain
      )
        throw new Error('Sender domain mismatch');
      data.email_profile = {
        sender_name: text(p.sender_name, 1, 160),
        sender_email,
        domain,
        status: 'unverified',
      };
    } else throw new Error('Unsupported preview action');
    this.data = data;
  }
}
