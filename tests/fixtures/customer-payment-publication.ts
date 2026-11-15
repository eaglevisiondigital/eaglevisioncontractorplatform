import type {
  CustomerPaymentReceipt,
  PaymentPublicationTarget,
} from '../../proposals/customer-payment-publication/contract';
export function customerPaymentPublicationFixture() {
  const target: PaymentPublicationTarget = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    customerId: '22222222-2222-4222-8222-222222222222',
    locationId: '33333333-3333-4333-8333-333333333333',
    invoiceId: '44444444-4444-4444-8444-444444444444',
    publicationId: '55555555-5555-4555-8555-555555555555',
  };
  const value: CustomerPaymentReceipt = {
    schema: 'customer-original-payment-receipt-v1',
    mode: 'sandbox-proposal',
    ...target,
    receiptReference: '66666666-6666-4666-8666-666666666666',
    issuanceReceiptReference: '77777777-7777-4777-8777-777777777777',
    kind: 'capture',
    amountMinor: 4000,
    invoiceAmountMinor: 10000,
    currency: 'USD',
    attemptedAt: '2026-01-01T00:00:00.000Z',
    observedAt: Date.now(),
    expiresAt: Date.now() + 30000,
    balance: 'NOT_ESTABLISHED',
    settlement: 'UNVERIFIED',
    delivery: 'DISABLED',
    financialEffect: false,
    holdRelease: false,
  };
  return { target, value };
}
