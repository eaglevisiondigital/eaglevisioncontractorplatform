import type { DraftIdentity } from '../../server/invoices/commercial-draft-client';

type Expected = DraftIdentity & {
  organizationId: string;
  revision: number;
  sourceHash: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
/** Pure content projection only. Expected IDs are NOT Auth. No token, link,
 * customer endpoint, delivery permission or payment authority is created.
 * Render title/number as text (never HTML). A draft/paid claim is rejected.
 */
export function presentIssuedInvoice(value: unknown, expected: Expected) {
  if (
    ![
      expected.organizationId,
      expected.invoiceId,
      expected.customerId,
      expected.sourceVersionId,
    ].every((id) => uuid.test(id)) ||
    (expected.locationId !== null && !uuid.test(expected.locationId)) ||
    !Number.isSafeInteger(expected.revision) ||
    expected.revision < 1 ||
    !digest.test(expected.sourceHash)
  )
    throw Error('Exact expected invoice identity required');
  if (
    !record(value) ||
    !exact(value, [
      'state',
      'paymentState',
      'invoiceId',
      'organizationId',
      'customerId',
      'locationId',
      'sourceVersionId',
      'sourceHash',
      'revision',
      'number',
      'title',
      'currency',
      'amountMinor',
      'issuedAt',
      'receipt',
    ]) ||
    value.state !== 'issued' ||
    value.paymentState !== 'unverified' ||
    value.invoiceId !== expected.invoiceId ||
    value.organizationId !== expected.organizationId ||
    value.customerId !== expected.customerId ||
    value.locationId !== expected.locationId ||
    value.sourceVersionId !== expected.sourceVersionId ||
    value.sourceHash !== expected.sourceHash ||
    value.revision !== expected.revision ||
    value.number !== 'INV-' + expected.invoiceId.replaceAll('-', '') ||
    value.currency !== 'USD' ||
    !Number.isSafeInteger(value.amountMinor) ||
    (value.amountMinor as number) < 1 ||
    (value.amountMinor as number) > 9_000_000_000_000 ||
    typeof value.title !== 'string' ||
    value.title.trim().length < 1 ||
    value.title.length > 200 ||
    typeof value.issuedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
      value.issuedAt,
    ) ||
    !Number.isFinite(Date.parse(value.issuedAt)) ||
    !record(value.receipt) ||
    !exact(value.receipt, ['commandId', 'actorId', 'requestHash']) ||
    typeof value.receipt.commandId !== 'string' ||
    !uuid.test(value.receipt.commandId) ||
    typeof value.receipt.actorId !== 'string' ||
    !uuid.test(value.receipt.actorId) ||
    typeof value.receipt.requestHash !== 'string' ||
    !digest.test(value.receipt.requestHash)
  )
    throw Error('Issued invoice evidence unavailable');
  return Object.freeze({
    invoiceId: expected.invoiceId,
    organizationId: expected.organizationId,
    customerId: expected.customerId,
    locationId: expected.locationId,
    sourceVersionId: expected.sourceVersionId,
    revision: expected.revision,
    state: 'issued' as const,
    number: value.number,
    title: value.title,
    currency: 'USD' as const,
    amountMinor: value.amountMinor as number,
    issuedAt: value.issuedAt,
    issuanceReceiptId: value.receipt.commandId,
    paymentState: 'unverified' as const,
    paymentLink: null,
  });
}
