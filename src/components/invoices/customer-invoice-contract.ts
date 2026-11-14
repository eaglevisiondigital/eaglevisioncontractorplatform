import { presentIssuedInvoice } from '../../../proposals/commercial-invoice-issuance/presentation';
import {
  parseCustomerReview,
  type CustomerContext,
} from '../../domain/customer/review';

export type InvoiceIdentity = Parameters<typeof presentIssuedInvoice>[1];
export interface InvoiceViewer {
  invoice: InvoiceIdentity;
  companyName: string;
  customerName: string;
  propertyLabel: string;
  primaryColor: string;
}
/** Future server reader contract, NOT an implemented API or Auth capability.
 * The server must authenticate current customer access, read the exact original
 * issued receipt, and project the SAME hash-bound immutable estimate source with
 * customerPreview/projectIssuedReview before returning this allowlist. A matching
 * caller-supplied hash or viewer does not prove any of those obligations.
 */
export interface CustomerInvoiceReader {
  read(viewer: InvoiceViewer, signal: AbortSignal): Promise<unknown>;
}
export type InvoiceReadState =
  | { status: 'ready'; value: unknown }
  | { status: 'loading' | 'unknown' | 'denied' };

// Accept JSON own-data only, without invoking getters/toJSON or retaining private
// caller objects. This is validation, not a second invoice or calculation engine.
function jsonCopy(
  value: unknown,
  active = new Set<object>(),
  depth = 0,
): unknown {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value))
    return value;
  if (!value || typeof value !== 'object' || depth > 20 || active.has(value))
    throw Error('Invoice data unavailable');
  if (
    !Array.isArray(value) &&
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw Error('Invoice data unavailable');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  active.add(value);
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (typeof key !== 'string' || !('value' in descriptors[key]))
      throw Error('Invoice data unavailable');
    Object.defineProperty(output, key, {
      value: jsonCopy(descriptors[key].value, active, depth + 1),
      enumerable: true,
    });
  }
  active.delete(value);
  if (Array.isArray(value)) {
    if (
      value.length > 500 ||
      Object.keys(output).length !== value.length ||
      !Object.keys(output).every((k, i) => k === String(i))
    )
      throw Error('Invoice data unavailable');
    return Object.values(output);
  }
  return output;
}
function fields(value: unknown, names: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== names.length ||
    !names.every((n) => Object.hasOwn(value, n))
  )
    throw Error('Invoice data unavailable');
  return value as Record<string, unknown>;
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 250)
    throw Error('Invoice data unavailable');
  return value;
}
/** Pure detached source-bound content. Only fictional-local mode is currently
 * admitted. No customer route, mapping, SQL reader, financial receipt or link.
 */
export function customerInvoiceSnapshot(value: unknown, viewer: InvoiceViewer) {
  const expected = jsonCopy(viewer) as InvoiceViewer;
  const input = fields(jsonCopy(value), [
    'mode',
    'invoice',
    'companyName',
    'customerName',
    'propertyLabel',
    'primaryColor',
    'source',
  ]);
  if (
    input.mode !== 'fictional-local' ||
    input.companyName !== text(expected.companyName) ||
    input.customerName !== text(expected.customerName) ||
    input.propertyLabel !== text(expected.propertyLabel) ||
    input.primaryColor !== expected.primaryColor ||
    !/^#[a-f0-9]{6}$/i.test(expected.primaryColor)
  )
    throw Error('Exact invoice viewer unavailable');
  const invoice = presentIssuedInvoice(input.invoice, expected.invoice);
  let scope = null;
  if (input.source !== null) {
    const source = fields(input.source, ['sourceHash', 'review']);
    if (
      source.sourceHash !== expected.invoice.sourceHash ||
      !expected.invoice.locationId
    )
      throw Error('Exact issued line source unavailable');
    const context: CustomerContext = {
      organization_id: invoice.organizationId,
      customer_id: invoice.customerId,
      location_id: expected.invoice.locationId,
      company_name: expected.companyName,
      primary_color: expected.primaryColor,
      property_label: expected.propertyLabel,
      reports: false,
      version_ids: [invoice.sourceVersionId],
    };
    const review = parseCustomerReview(
      source.review,
      context,
      invoice.sourceVersionId,
    );
    if (
      review.scope.currency !== invoice.currency ||
      review.scope.total_minor !== invoice.amountMinor
    )
      throw Error('Invoice and issued line totals conflict');
    // Reconstruct only the canonical selling fields needed here. Notes/terms and
    // the source receipt never become a customer payment/delivery confirmation.
    scope = Object.freeze({
      lines: Object.freeze(
        review.scope.lines.map((l) => Object.freeze({ ...l })),
      ),
      subtotalMinor: review.scope.subtotal_minor,
      discountMinor: review.scope.discount_minor,
      taxMinor: review.scope.tax_minor,
      totalMinor: review.scope.total_minor,
    });
  }
  return Object.freeze({
    ...invoice,
    companyName: expected.companyName,
    customerName: expected.customerName,
    propertyLabel: expected.propertyLabel,
    primaryColor: expected.primaryColor,
    scope,
    mode: 'fictional-local' as const,
  });
}
export type CustomerInvoiceSnapshot = ReturnType<
  typeof customerInvoiceSnapshot
>;

/** Requirements for future operations; these are not commands or callbacks. */
export const invoiceActionBoundaries = Object.freeze(
  [
    {
      id: 'delivery',
      label: 'Send invoice',
      reason:
        'A customer access grant, consent, sender and delivery receipt are required.',
    },
    {
      id: 'resend',
      label: 'Resend invoice',
      reason:
        'The original delivery receipt and a separately authorized resend are required.',
    },
    {
      id: 'cancel',
      label: 'Cancel invoice',
      reason:
        'Cancellation requires a reviewed writer; the issued snapshot must be retained.',
    },
    {
      id: 'correction',
      label: 'Correct invoice',
      reason:
        'Correction requires a new authorized immutable version; this invoice cannot be edited.',
    },
  ].map((row) => Object.freeze({ ...row, execution: 'disabled' as const })),
);
