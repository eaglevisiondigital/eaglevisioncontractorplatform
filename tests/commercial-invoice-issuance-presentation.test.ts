import { expect, it } from 'vitest';
import { presentIssuedInvoice } from '../proposals/commercial-invoice-issuance/presentation';
const expected = {
  organizationId: '11111111-1111-1111-1111-111111111111',
  invoiceId: '22222222-2222-2222-2222-222222222222',
  customerId: '33333333-3333-3333-3333-333333333333',
  locationId: null,
  sourceVersionId: '44444444-4444-4444-4444-444444444444',
  revision: 2,
  sourceHash: 'a'.repeat(64),
};
function evidence() {
  return {
    ...expected,
    state: 'issued',
    paymentState: 'unverified',
    number: 'INV-' + expected.invoiceId.replaceAll('-', ''),
    title: '<script>literal untrusted title</script>',
    currency: 'USD',
    amountMinor: 1100,
    issuedAt: '2026-11-14T12:00:00+00:00',
    receipt: {
      commandId: '55555555-5555-5555-5555-555555555555',
      actorId: '66666666-6666-6666-6666-666666666666',
      requestHash: 'b'.repeat(64),
    },
  };
}
it.each(['draft', 'paid', 'sent', 'void'])(
  'rejects %s as issued evidence',
  (state) => {
    expect(() =>
      presentIssuedInvoice({ ...evidence(), state }, expected),
    ).toThrow();
  },
);
it.each([
  'organizationId',
  'invoiceId',
  'customerId',
  'sourceVersionId',
  'sourceHash',
  'revision',
])('rejects mismatched %s', (key) => {
  expect(() =>
    presentIssuedInvoice(
      { ...evidence(), [key]: key === 'revision' ? 3 : 'wrong' },
      expected,
    ),
  ).toThrow();
});
it.each([
  { memo: 'PRIVATE' },
  { paymentLink: 'https://example.invalid' },
  { amountMinor: -1 },
  { amountMinor: 1.1 },
  { amountMinor: 1e16 },
  { currency: 'EUR' },
  { paymentState: 'paid' },
  { issuedAt: 'invalid' },
  { receipt: { commandId: 'invalid' } },
  { number: 'DRAFT-1' },
])('rejects malformed or expanded presentation %j', (patch) => {
  expect(() =>
    presentIssuedInvoice({ ...evidence(), ...patch }, expected),
  ).toThrow();
});
it('projects immutable allowlisted content without exposing staff evidence or enabling payment', () => {
  const input = evidence();
  const result = presentIssuedInvoice(input, expected);
  input.title = 'changed';
  expect(result.title).toBe('<script>literal untrusted title</script>');
  expect(Object.isFrozen(result)).toBe(true);
  expect(result.paymentLink).toBeNull();
  expect(JSON.stringify(result)).not.toMatch(
    /actorId|requestHash|sourceHash|memo|PRIVATE/,
  );
  expect(result.issuanceReceiptId).toBe(input.receipt.commandId);
});
