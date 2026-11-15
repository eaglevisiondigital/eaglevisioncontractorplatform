export interface PaymentPublicationTarget {
  organizationId: string;
  customerId: string;
  locationId: string;
  invoiceId: string;
  publicationId: string;
}
export interface CustomerPaymentReceipt extends PaymentPublicationTarget {
  schema: 'customer-original-payment-receipt-v1';
  mode: 'sandbox-proposal';
  receiptReference: string;
  issuanceReceiptReference: string;
  kind: 'capture' | 'refund';
  amountMinor: number;
  invoiceAmountMinor: number;
  currency: 'USD';
  attemptedAt: string;
  observedAt: number;
  expiresAt: number;
  balance: 'NOT_ESTABLISHED';
  settlement: 'UNVERIFIED';
  delivery: 'DISABLED';
  financialEffect: false;
  holdRelease: false;
}
const fields = [
  'organizationId',
  'customerId',
  'locationId',
  'invoiceId',
  'publicationId',
] as const;
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function own(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw Error('Current payment receipt unavailable');
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).length !== keys.length ||
    keys.some((k) => !d[k] || !('value' in d[k]))
  )
    throw Error('Current payment receipt unavailable');
  return Object.fromEntries(keys.map((k) => [k, d[k].value])) as Record<
    string,
    unknown
  >;
}
export function paymentPublicationTarget(
  value: unknown,
): Readonly<PaymentPublicationTarget> {
  const r = own(value, fields);
  for (const k of fields) {
    if (typeof r[k] !== 'string' || !uuid.test(r[k]))
      throw Error('Exact commercial target required');
    r[k] = r[k].toLowerCase();
  }
  return Object.freeze(r) as unknown as Readonly<PaymentPublicationTarget>;
}
/** Minimal customer projection, never an invoice/ledger/balance/settlement engine. */
export function customerPaymentReceipt(
  value: unknown,
  target: PaymentPublicationTarget,
  now = Date.now(),
): Readonly<CustomerPaymentReceipt> {
  const expected = paymentPublicationTarget(target),
    r = own(value, [
      'schema',
      'mode',
      ...fields,
      'receiptReference',
      'issuanceReceiptReference',
      'kind',
      'amountMinor',
      'invoiceAmountMinor',
      'currency',
      'attemptedAt',
      'observedAt',
      'expiresAt',
      'balance',
      'settlement',
      'delivery',
      'financialEffect',
      'holdRelease',
    ]);
  const actual = paymentPublicationTarget(
    Object.fromEntries(fields.map((k) => [k, r[k]])),
  );
  if (
    fields.some((k) => actual[k] !== expected[k]) ||
    r.schema !== 'customer-original-payment-receipt-v1' ||
    r.mode !== 'sandbox-proposal' ||
    !['receiptReference', 'issuanceReceiptReference'].every(
      (k) => typeof r[k] === 'string' && uuid.test(r[k]),
    ) ||
    typeof r.kind !== 'string' ||
    !['capture', 'refund'].includes(r.kind) ||
    !['amountMinor', 'invoiceAmountMinor'].every(
      (k) =>
        Number.isSafeInteger(r[k]) &&
        Number(r[k]) > 0 &&
        Number(r[k]) <= 9_000_000_000_000,
    ) ||
    r.currency !== 'USD' ||
    typeof r.attemptedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(r.attemptedAt) ||
    !Number.isFinite(Date.parse(r.attemptedAt)) ||
    Date.parse(r.attemptedAt) > now ||
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(r.observedAt) ||
    !Number.isSafeInteger(r.expiresAt) ||
    Number(r.observedAt) > now ||
    Number(r.expiresAt) <= now ||
    Number(r.expiresAt) > Number(r.observedAt) + 30000 ||
    r.balance !== 'NOT_ESTABLISHED' ||
    r.settlement !== 'UNVERIFIED' ||
    r.delivery !== 'DISABLED' ||
    r.financialEffect !== false ||
    r.holdRelease !== false
  )
    throw Error('Current payment receipt unavailable');
  return Object.freeze({
    ...r,
    ...actual,
    receiptReference: String(r.receiptReference).toLowerCase(),
    issuanceReceiptReference: String(r.issuanceReceiptReference).toLowerCase(),
  }) as unknown as Readonly<CustomerPaymentReceipt>;
}
