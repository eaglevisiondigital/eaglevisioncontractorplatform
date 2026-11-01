import type { EstimateVersion } from './types';
export function customerPreview(version: EstimateVersion) {
  const p = version.payload,
    c = version.calculation;
  return {
    company: version.company_snapshot,
    customer: version.customer_snapshot,
    location: version.location_snapshot,
    project: p.project,
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
