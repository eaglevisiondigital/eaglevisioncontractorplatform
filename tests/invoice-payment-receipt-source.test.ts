import { readFileSync, lstatSync } from 'node:fs';
import { expect, it } from 'vitest';
import { captureInvoicePaymentReceiptProposal } from '../proposals/invoice-payment-receipt/qualification';
it('captures the unchanged parent schema and new read-only proposal without installation or replay authority', async () => {
  const p = await captureInvoicePaymentReceiptProposal();
  expect(p.classification).toBe('UNAPPLIED_INVOICE_PAYMENT_RECEIPT_ONLY');
  expect(p.installationAuthorized).toBe(false);
  expect(p.financialExecutionAuthorized).toBe(false);
  expect(p.migrations).toHaveLength(14);
  expect(Object.isFrozen(p)).toBe(true);
  expect(p.capacitySql).toContain('commercial_payment_capture_guard');
  expect(p.receiptSql).not.toContain('create table');
});
it.each([
  'server/providers/safety.ts',
  'proposals/commercial-payment-capacity/qualification.ts',
  'proposals/invoice-payment-receipt/reader.ts',
  'proposals/invoice-payment-receipt/receipt.proposed.sql',
])('denies unknown %s before accepting executable source', async (target) => {
  const read = ((path: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(path);
    return String(path) === target
      ? Buffer.concat([b, Buffer.from('\nUNREVIEWED')])
      : b;
  }) as typeof readFileSync;
  await expect(
    captureInvoicePaymentReceiptProposal({ read }),
  ).rejects.toThrow();
});
it.each(['symlink', 'mode'] as const)(
  'rejects %s substitution of the parent qualifier before import',
  async (kind) => {
    const stat = ((path: Parameters<typeof lstatSync>[0]) => {
      const s = lstatSync(path);
      return String(path) ===
        'proposals/commercial-payment-capacity/qualification.ts'
        ? new Proxy(s, {
            get(target, k) {
              if (k === 'isSymbolicLink' && kind === 'symlink')
                return () => true;
              if (k === 'mode' && kind === 'mode') return 0o755;
              return Reflect.get(target, k);
            },
          })
        : s;
    }) as typeof lstatSync;
    await expect(
      captureInvoicePaymentReceiptProposal({ stat }),
    ).rejects.toThrow();
  },
);
it('source withdrawal across the verified import await denies before SQL can be used', async () => {
  let reads = 0;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    const b = readFileSync(p);
    return String(p) ===
      'proposals/invoice-payment-receipt/receipt.proposed.sql' && ++reads > 1
      ? Buffer.concat([b, Buffer.from('\nWITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  await expect(
    captureInvoicePaymentReceiptProposal({ read }),
  ).rejects.toThrow();
});
it('the final parent read cannot withdraw the new reader source before returning its qualification', async () => {
  let changed = false;
  const read = ((p: Parameters<typeof readFileSync>[0]) => {
    if (String(p) === 'tests/database/bootstrap.sql') changed = true;
    const b = readFileSync(p);
    return changed &&
      String(p) === 'proposals/invoice-payment-receipt/reader.ts'
      ? Buffer.concat([b, Buffer.from('\nWITHDRAWN')])
      : b;
  }) as typeof readFileSync;
  await expect(
    captureInvoicePaymentReceiptProposal({ read }),
  ).rejects.toThrow();
  expect(changed).toBe(true);
});
