import {
  blankEstimate,
  blankLine,
  calculateEstimate,
} from '../../src/domain/estimating/calculation';
import type { EstimateVersion } from '../../src/domain/estimating/types';
import {
  projectIssuedReview,
  type CustomerContext,
} from '../../src/domain/customer/review';
import { customerPreview } from '../../src/domain/estimating/customer-preview';
import { sampleCompanies } from '../../src/domain/platform';
import type { InvoiceViewer } from '../../src/components/invoices/customer-invoice-contract';

/** Fictional local evidence only. The digest is a fixture token, not a SQL/Auth
 * attestation. Selling lines/totals come from the actual canonical engines. */
export function fictionalCustomerInvoice(index = 0) {
  const company = sampleCompanies[index];
  const id = (n: number) =>
    `10000000-0000-4000-8000-${String(index * 100 + n).padStart(12, '0')}`;
  const payload = blankEstimate(id(2));
  payload.location_id = id(3);
  payload.tax_policy_id = id(9);
  payload.expires_on = '2099-12-31';
  payload.project.name = 'Fictional property repair';
  payload.internal_notes = 'PRIVATE SOURCE NOTE';
  payload.lines = [
    {
      ...blankLine('service'),
      description: 'Fictional repair work',
      quantity_milli: 2000,
      unit: 'each',
      unit_price_minor: 12500,
      unit_cost_minor: 8000,
      taxable: true,
    },
    {
      ...blankLine('service'),
      description: 'Fictional cleanup',
      quantity_milli: 1000,
      unit: 'each',
      unit_price_minor: 5000,
      unit_cost_minor: 1000,
      taxable: true,
    },
  ];
  payload.discount = { kind: 'fixed', value: 1000 };
  const version: EstimateVersion = {
    id: id(4),
    organization_id: id(1),
    estimate_id: id(5),
    version_number: 2,
    lock_revision: 3,
    status: 'issued',
    payload,
    calculation: calculateEstimate(payload, 1000),
    company_snapshot: {
      name: company.name,
      primary_color: company.primary_color,
      accent_color: company.accent_color,
      business_address: 'Fictional office',
      contact_email: 'fixture@example.test',
      contact_phone: '',
      website: '',
      logo_document_id: null,
    },
    customer_snapshot: {
      id: id(2),
      display_name: 'Fictional property owner',
      email: null,
      phone: null,
    },
    location_snapshot: {
      id: id(3),
      address_line1: '10 Fictional Lane',
      city: 'Fixture',
      region: 'ZZ',
      postal_code: '00000',
      country_code: 'US',
    },
    tax_policy_snapshot: {
      id: id(9),
      organization_id: id(1),
      name: 'Fictional tax fixture',
      reference: 'TEST ONLY',
      jurisdiction: 'Fictional',
      contract_type: 'Fixture',
      rate_bps: 1000,
      status: 'reviewed',
      active: true,
      policy_version: 1,
    },
    attachment_snapshots: [],
    supersedes_version_id: null,
    created_at: '2026-11-14T12:00:00Z',
    issued_at: '2026-11-14T12:00:00Z',
  };
  const preview = customerPreview(version);
  const context: CustomerContext = {
    organization_id: id(1),
    customer_id: id(2),
    location_id: id(3),
    company_name: preview.company.name,
    primary_color: preview.company.primary_color,
    property_label: '10 Fictional Lane · Fixture, ZZ',
    reports: false,
    version_ids: [id(4)],
  };
  const viewer: InvoiceViewer = {
    invoice: {
      organizationId: id(1),
      invoiceId: id(6),
      customerId: id(2),
      locationId: id(3),
      sourceVersionId: id(4),
      sourceHash: 'a'.repeat(64),
      revision: 2,
    },
    companyName: context.company_name,
    customerName: preview.customer.display_name,
    propertyLabel: context.property_label,
    primaryColor: context.primary_color,
  };
  const invoice = {
    ...viewer.invoice,
    state: 'issued',
    paymentState: 'unverified',
    number: 'INV-' + id(6).replaceAll('-', ''),
    title: 'Fictional repair invoice',
    currency: 'USD',
    amountMinor: version.calculation.total_minor,
    issuedAt: '2026-11-14T12:00:00.000000Z',
    receipt: { commandId: id(7), actorId: id(8), requestHash: 'b'.repeat(64) },
  };
  return {
    viewer,
    version,
    value: {
      mode: 'fictional-local',
      invoice,
      companyName: viewer.companyName,
      customerName: viewer.customerName,
      propertyLabel: viewer.propertyLabel,
      primaryColor: viewer.primaryColor,
      source: {
        sourceHash: viewer.invoice.sourceHash,
        review: projectIssuedReview(version, context),
      },
    },
  };
}
