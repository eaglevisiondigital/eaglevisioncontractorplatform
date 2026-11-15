import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import {
  loadNumberDecoder,
  type NumberExpected,
  type NumberPresenter,
} from './fixtures/number-decoder-proposal';
let present: NumberPresenter;
beforeAll(async () => {
  present = (await loadNumberDecoder()).present;
});
function fixture(yearly = true) {
  const expected: NumberExpected = {
    organizationId: randomUUID(),
    invoiceId: randomUUID(),
    customerId: randomUUID(),
    locationId: randomUUID(),
    sourceVersionId: randomUUID(),
    revision: 2,
    sourceHash: 'a'.repeat(64),
  };
  const receipt = {
    commandId: randomUUID(),
    actorId: randomUUID(),
    requestHash: 'b'.repeat(64),
  };
  const packet = {
    state: 'issued',
    paymentState: 'unverified',
    ...expected,
    number: yearly
      ? 'INV-2026-000001'
      : 'INV-' + expected.invoiceId.replaceAll('-', ''),
    title: 'Fixture <text only>',
    currency: 'USD',
    amountMinor: 1234,
    issuedAt: '2026-12-31T23:59:59Z',
    receipt,
  };
  return {
    packet,
    expected,
    anchor: {
      ...expected,
      issuedNumber: packet.number,
      issuanceReceiptId: receipt.commandId,
    },
  };
}
it('retains original exact UUID behavior for every existing unanchored caller', () => {
  const f = fixture(false);
  expect(present(f.packet, f.expected).number).toBe(f.packet.number);
});
it('projects an explicitly anchored original yearly receipt without adding Auth/payment or public link authority', () => {
  const f = fixture();
  const v = present(f.packet, f.anchor);
  expect(v.number).toBe('INV-2026-000001');
  expect(v.issuanceReceiptId).toBe(f.packet.receipt.commandId);
  expect(v.paymentLink).toBeNull();
  expect(v.paymentState).toBe('unverified');
  expect(JSON.stringify(v)).not.toContain(f.expected.sourceHash);
  expect(Object.isFrozen(v)).toBe(true);
});
it('accepts an explicitly anchored legacy UUID receipt without renumbering it', () => {
  const f = fixture(false);
  expect(present(f.packet, f.anchor).number).toBe(f.packet.number);
});
it('denies a yearly display with no independently supplied original receipt/number anchor', () => {
  const f = fixture();
  expect(() => present(f.packet, f.expected)).toThrow();
});
it.each(['issuedNumber', 'issuanceReceiptId'] as const)(
  'denies incomplete %s anchor',
  (key) => {
    const f = fixture();
    const a = { ...f.anchor };
    delete a[key];
    expect(() => present(f.packet, a)).toThrow();
  },
);
it('a later-year read never authorizes a different number or different original command', () => {
  const f = fixture();
  expect(() =>
    present({ ...f.packet, number: 'INV-2027-000001' }, f.anchor),
  ).toThrow();
  expect(() =>
    present(
      {
        ...f.packet,
        receipt: { ...f.packet.receipt, commandId: randomUUID() },
      },
      f.anchor,
    ),
  ).toThrow();
});
it.each([
  'INV-0000-000001',
  'INV-2026-000000',
  'INV-2026-1000000',
  'INV-20266-000001',
  'INV-26-000001',
  'INV-2026-00001',
  'inv-2026-000001',
  ' INV-2026-000001',
  'INV-2026-000001 ',
  '<script>',
  'FICTA-00000001',
])('rejects unsupported or invalid anchored format %s', (number) => {
  const f = fixture();
  expect(() =>
    present({ ...f.packet, number }, { ...f.anchor, issuedNumber: number }),
  ).toThrow();
});
it.each(['INV-0001-000001', 'INV-9999-999999'])(
  'represents bounded canonical year/ordinal %s only with exact anchor',
  (number) => {
    const f = fixture();
    expect(
      present({ ...f.packet, number }, { ...f.anchor, issuedNumber: number })
        .number,
    ).toBe(number);
  },
);
it.each([
  'organizationId',
  'invoiceId',
  'customerId',
  'locationId',
  'sourceVersionId',
  'sourceHash',
  'revision',
] as const)('the same public number does not substitute trusted %s', (key) => {
  const f = fixture();
  const changed =
    key === 'revision'
      ? 3
      : key === 'sourceHash'
        ? 'c'.repeat(64)
        : randomUUID();
  expect(() => present({ ...f.packet, [key]: changed }, f.anchor)).toThrow();
});
it('independent contractors may use the same public display without sharing identity or receipts', () => {
  const a = fixture(),
    b = fixture();
  expect(present(a.packet, a.anchor).number).toBe(
    present(b.packet, b.anchor).number,
  );
  expect(() => present(a.packet, b.anchor)).toThrow();
});
it.each(['pending', 'unknown', 'paid', 'settled'])(
  'does not convert %s into an issuance presentation or payment claim',
  (paymentState) => {
    const f = fixture();
    expect(() => present({ ...f.packet, paymentState }, f.anchor)).toThrow();
  },
);
it('rejects private payload additions and keeps title content as plain text', () => {
  const f = fixture();
  expect(() => present({ ...f.packet, internalCost: 10 }, f.anchor)).toThrow();
  expect(present(f.packet, f.anchor).title).toBe('Fixture <text only>');
});
it('requires new anchors to be own primitive data without evaluating coercion or getters', () => {
  const f = fixture();
  let hooks = 0;
  const object = {
    toString() {
      hooks++;
      return f.packet.number;
    },
  };
  expect(() =>
    present(f.packet, {
      ...f.anchor,
      issuedNumber: object as unknown as string,
    }),
  ).toThrow();
  const getter = {
    ...f.expected,
    issuanceReceiptId: f.anchor.issuanceReceiptId,
  };
  Object.defineProperty(getter, 'issuedNumber', {
    get() {
      hooks++;
      return f.packet.number;
    },
  });
  expect(() => present(f.packet, getter)).toThrow();
  const inherited = Object.assign(
    Object.create({
      issuedNumber: f.packet.number,
      issuanceReceiptId: f.packet.receipt.commandId,
    }),
    f.expected,
  ) as NumberExpected;
  expect(() => present(f.packet, inherited)).toThrow();
  expect(hooks).toBe(0);
});
it('legacy explicit anchors cannot rebind another invoice UUID number', () => {
  const f = fixture(false),
    number = 'INV-' + randomUUID().replaceAll('-', '');
  expect(() =>
    present({ ...f.packet, number }, { ...f.anchor, issuedNumber: number }),
  ).toThrow();
});
