import { ReleasePreview } from '../../src/domain/release/preview';
import { sampleCompanies } from '../../src/domain/platform';
import type { CustomerPaymentAccess } from '../../src/components/invoices/customer-payment-contract';
import { fictionalCustomerInvoice } from './customer-issued-invoice';

/** Actual existing engine, fictional identities only. Writers remain test-only. */
export async function customerPaymentFixture() {
  const { version } = fictionalCustomerInvoice();
  version.organization_id = sampleCompanies[0].id;
  version.tax_policy_snapshot!.organization_id = sampleCompanies[0].id;
  const release = new ReleasePreview(version.organization_id, version);
  await release.command('staff', 'publish_offer', { version_id: version.id });
  const offer = release.read('staff').release_offers[0];
  await release.command('customer', 'decide_offer', {
    offer_id: offer.id,
    decision: 'accepted',
    note: 'Fictional local test only',
    consent: true,
  });
  await release.command('staff', 'create_contract', {
    offer_id: offer.id,
    terms: 'Fictional local test terms only.',
    legal_reference: 'Fictional reference only',
  });
  const contract = release.read('staff').release_contracts[0];
  await release.command('customer', 'sign_contract', {
    contract_id: contract.id,
    document_hash: contract.document_hash,
    typed_name: 'Fictional Owner',
    consent: true,
  });
  await release.command('staff', 'create_invoice', {
    contract_id: contract.id,
  });
  const invoice = release.read('staff').release_invoices[0];
  let access: CustomerPaymentAccess = {
    mode: 'fictional-local',
    organizationId: version.organization_id,
    customerId: version.customer_snapshot.id,
    propertyId: version.location_snapshot!.id,
    sourceVersionId: version.id,
    invoiceId: invoice.id,
    sessionId: 'fictional-local-session',
    active: true,
    expiresAt: Date.now() + 120_000,
  };
  const source = { release, current: () => ({ ...access }) };
  const capture = async (amount: number) => {
    await release.command('customer', 'authorize_payment', {
      invoice_id: invoice.id,
      amount_minor: amount,
      consent: true,
    });
    const auth = release.read('staff').release_authorizations.at(-1)!;
    await release.command('staff', 'synthetic_capture', {
      invoice_id: invoice.id,
      authorization_id: auth.id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: null,
    });
  };
  const refund = async (amount: number) => {
    const event = release
      .read('staff')
      .release_payment_events.find((e) => e.kind === 'synthetic_capture')!;
    await release.command('staff', 'synthetic_refund', {
      invoice_id: invoice.id,
      authorization_id: event.authorization_id,
      amount_minor: amount,
      idempotency_key: crypto.randomUUID(),
      adjusts_event_id: event.id,
    });
  };
  return {
    source,
    invoice,
    capture,
    refund,
    setAccess: (update: Partial<CustomerPaymentAccess>) => {
      access = { ...access, ...update };
    },
  };
}
