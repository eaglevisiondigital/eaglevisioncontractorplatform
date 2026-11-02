import type { EstimateVersion } from './types';
export function customerPreview(version: EstimateVersion) {
  const p = version.payload,
    c = version.calculation,
    company = version.company_snapshot,
    customer = version.customer_snapshot,
    location = version.location_snapshot;
  return {
    // Reconstruct nested selling fields as well as line fields. Caller-owned
    // source snapshots must not mutate an already published offer, and future
    // staff-only snapshot fields must not silently become customer-visible.
    company: {
      name: company.name,
      primary_color: company.primary_color,
      accent_color: company.accent_color,
      business_address: company.business_address,
      contact_email: company.contact_email,
      contact_phone: company.contact_phone,
      website: company.website,
      logo_document_id: company.logo_document_id,
    },
    customer: {
      id: customer.id,
      display_name: customer.display_name,
      email: customer.email,
      phone: customer.phone,
    },
    location: location
      ? {
          id: location.id,
          address_line1: location.address_line1,
          city: location.city,
          region: location.region,
          postal_code: location.postal_code,
          country_code: location.country_code,
        }
      : null,
    project: {
      name: p.project.name,
      type: p.project.type,
      description: p.project.description,
      start_on: p.project.start_on,
      end_on: p.project.end_on,
    },
    currency: p.currency,
    expires_on: p.expires_on,
    notes: p.customer_notes,
    terms: p.terms,
    lines: p.lines
      .filter((l) => c.lines.find((x) => x.id === l.id)?.included)
      .map((l) => ({
        description: l.description,
        quantity_milli: l.quantity_milli,
        unit: l.unit,
        amount_minor: c.lines.find((x) => x.id === l.id)!.subtotal_minor,
      })),
    subtotal_minor: c.subtotal_minor,
    discount_minor: c.discount_minor,
    tax_minor: c.tax_minor,
    total_minor: c.total_minor,
    schedule: c.payment_schedule.map((s) => ({
      label: s.label,
      amount_minor: s.amount_minor,
      due_on: s.due_on,
    })),
    attachments: version.attachment_snapshots
      .filter((a) => a.customer_visible)
      .map((a) => ({
        display_name: a.display_name,
        content_type: a.content_type,
      })),
  };
}
