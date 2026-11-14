import {
  CommercialCustomerReadController,
  type CommercialCustomerResponse,
} from './commercial-customer-read';

export interface IssuanceReceiptDownload {
  filename: string;
  mediaType: 'application/json';
  content: string;
  invoiceId: string;
  issuanceReceiptId: string;
  observedAt: number;
}
const pending = new WeakSet<CommercialCustomerReadController>();
const unavailable = () =>
  Error('Current issuance-receipt copy unavailable; reopen exact source');
function browserDownload(file: IssuanceReceiptDownload) {
  const url = URL.createObjectURL(
    new Blob([file.content], { type: file.mediaType }),
  );
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
function original(value: CommercialCustomerResponse) {
  // Compare the whole validated immutable header/receipt, not only the filename.
  return JSON.stringify(value.invoice);
}
/** Local file copy only. A fresh existing bridge read precedes serialization;
 * neither a retained lease nor download success authenticates a customer/payment.
 * The output port is synchronous and has no URL/recipient/business-writer input.
 */
export async function downloadIssuanceReceipt(
  controller: CommercialCustomerReadController,
  output: (file: IssuanceReceiptDownload) => void = browserDownload,
  lifetime?: AbortSignal,
): Promise<IssuanceReceiptDownload> {
  if (lifetime?.aborted || pending.has(controller)) throw unavailable();
  pending.add(controller);
  let unsubscribe: (() => void) | undefined;
  let loadingCount = 0,
    interrupted = false;
  try {
    const displayed = controller.getSnapshot();
    if (displayed.status !== 'ready') throw unavailable();
    const anchor = original(displayed.value);
    const startedAt = Date.now();
    unsubscribe = controller.subscribe(() => {
      const state = controller.getSnapshot();
      if (state.status === 'loading') {
        loadingCount++;
        if (loadingCount > 1) interrupted = true;
      } else if (state.status !== 'ready') interrupted = true;
    });
    await controller.open();
    if (lifetime?.aborted) throw unavailable();
    const refreshed = controller.getSnapshot();
    if (
      interrupted ||
      loadingCount !== 1 ||
      refreshed.status !== 'ready' ||
      refreshed.value.observedAt < startedAt ||
      refreshed.value.observedAt <= displayed.value.observedAt ||
      original(refreshed.value) !== anchor
    )
      throw unavailable();
    const value = refreshed.value,
      invoice = value.invoice;
    const body = {
      format: 'propel-issuance-receipt-reference-v1',
      mode: 'fictional-local',
      purpose: 'ISSUANCE_RECEIPT_REFERENCE_ONLY',
      authority:
        'Not a full invoice, payment receipt, delivery proof or access grant',
      invoice: {
        organizationId: invoice.organizationId,
        customerId: invoice.customerId,
        locationId: invoice.locationId,
        invoiceId: invoice.invoiceId,
        sourceVersionId: invoice.sourceVersionId,
        revision: invoice.revision,
        number: invoice.number,
      },
      issuance: {
        receiptId: invoice.issuanceReceiptId,
        issuedAt: invoice.issuedAt,
      },
      payment: { status: 'UNKNOWN', balanceMinor: null, receipt: null },
      link: { status: 'DISABLED', href: null },
      delivery: 'DISABLED',
      resend: 'DISABLED',
      correction: 'DISABLED',
      cancellation: 'DISABLED',
      read: { observedAt: value.observedAt, expiresAt: value.expiresAt },
    };
    const artifact = Object.freeze({
      filename: `issuance-receipt-${invoice.invoiceId}.json`,
      mediaType: 'application/json' as const,
      content: JSON.stringify(body, null, 2) + '\n',
      invoiceId: invoice.invoiceId,
      issuanceReceiptId: invoice.issuanceReceiptId,
      observedAt: value.observedAt,
    });
    // Recheck the exact current response after asynchronous reread and serialization.
    const current = controller.getSnapshot();
    if (
      interrupted ||
      current.status !== 'ready' ||
      current.value !== value ||
      original(current.value) !== anchor ||
      Date.now() >= value.expiresAt
    )
      throw unavailable();
    if (lifetime?.aborted) throw unavailable();
    output(artifact);
    return artifact;
  } catch {
    // Leaving this action does not revoke another consumer's shared reader.
    if (!lifetime?.aborted && !interrupted) controller.invalidate();
    throw unavailable();
  } finally {
    unsubscribe?.();
    pending.delete(controller);
  }
}
