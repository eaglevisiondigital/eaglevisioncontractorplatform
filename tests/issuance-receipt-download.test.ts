import { afterEach, expect, it, vi } from 'vitest';
import { CommercialCustomerReadController } from '../src/components/invoices/commercial-customer-read';
import { downloadIssuanceReceipt } from '../src/components/invoices/issuance-receipt-download';
import { commercialCustomerBridgeFixture } from './fixtures/commercial-customer-bridge';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 1));
async function fixture() {
  const f = commercialCustomerBridgeFixture();
  const controller = new CommercialCustomerReadController(
    () => f.viewer,
    f.load,
    true,
  );
  await controller.open();
  return { ...f, controller };
}
it('requires an existing ready exact read and defaults disabled without invoking any output', async () => {
  const output = vi.fn(),
    f = commercialCustomerBridgeFixture();
  const disabled = new CommercialCustomerReadController(() => f.viewer, f.load);
  await expect(downloadIssuanceReceipt(disabled, output)).rejects.toThrow();
  expect(disabled.getSnapshot().status).toBe('disabled');
  expect(f.calls.source).toBe(0);
  expect(output).not.toHaveBeenCalled();
});
it('fresh actual bridge reread exports only original issuance-reference facts with UNKNOWN financial and disabled operations', async () => {
  const f = await fixture(),
    output = vi.fn();
  await nextTick();
  const artifact = await downloadIssuanceReceipt(f.controller, output);
  expect(f.calls).toEqual({ auth: 12, session: 12, mapping: 6, source: 4 });
  expect(output).toHaveBeenCalledExactlyOnceWith(artifact);
  expect(artifact.filename).toBe(
    `issuance-receipt-${f.viewer.invoice.invoiceId}.json`,
  );
  const body = JSON.parse(artifact.content);
  expect(body.purpose).toBe('ISSUANCE_RECEIPT_REFERENCE_ONLY');
  expect(body.issuance.receiptId).toBe(f.value.invoice.receipt.commandId);
  expect(body.payment).toEqual({
    status: 'UNKNOWN',
    balanceMinor: null,
    receipt: null,
  });
  expect(body.link).toEqual({ status: 'DISABLED', href: null });
  for (const k of ['delivery', 'resend', 'correction', 'cancellation'])
    expect(body[k]).toBe('DISABLED');
  expect(artifact.content).not.toMatch(
    /sourceHash|actorId|requestHash|sessionId|bearer|PRIVATE|unit_cost|amountMinor|scope|lineItems|customerName/,
  );
  expect(artifact.content).not.toContain(f.mapping.sourceHash);
  expect(Object.isFrozen(artifact)).toBe(true);
  f.controller.close();
});
it('each subsequent explicit copy requires a new trusted read rather than replaying retained bytes', async () => {
  const f = await fixture(),
    output = vi.fn();
  await nextTick();
  await downloadIssuanceReceipt(f.controller, output);
  await nextTick();
  await downloadIssuanceReceipt(f.controller, output);
  expect(output).toHaveBeenCalledTimes(2);
  expect(f.calls.source).toBe(6);
  f.controller.close();
});
it('revoked Auth during reread makes no copy and hides the previous source', async () => {
  const f = await fixture(),
    output = vi.fn();
  f.setAuth(false);
  await expect(downloadIssuanceReceipt(f.controller, output)).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot().status).toBe('unknown');
  f.controller.close();
});
it.each([
  'invoiceId',
  'customerId',
  'organizationId',
  'sourceVersionId',
  'locationId',
  'revision',
] as const)(
  'changed public context %s denies copy without fallback',
  async (key) => {
    const f = await fixture(),
      output = vi.fn();
    Object.assign(f.viewer.invoice, {
      [key]: key === 'revision' ? 99 : crypto.randomUUID(),
    });
    await expect(
      downloadIssuanceReceipt(f.controller, output),
    ).rejects.toThrow();
    expect(output).not.toHaveBeenCalled();
    f.controller.close();
  },
);
it('a valid substituted issuance receipt cannot replace the originally displayed receipt', async () => {
  const f = await fixture(),
    output = vi.fn();
  f.setValue({
    ...f.value,
    invoice: {
      ...f.value.invoice,
      receipt: { ...f.value.invoice.receipt, commandId: crypto.randomUUID() },
    },
  });
  await expect(downloadIssuanceReceipt(f.controller, output)).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
  f.controller.close();
});
it('a valid title/header substitution is denied even when original IDs still match', async () => {
  const f = await fixture(),
    output = vi.fn();
  f.setValue({
    ...f.value,
    invoice: { ...f.value.invoice, title: 'Substituted invoice' },
  });
  await expect(downloadIssuanceReceipt(f.controller, output)).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
  f.controller.close();
});
it('an unexpired cached response is insufficient for a new export read', async () => {
  vi.useFakeTimers();
  const f = commercialCustomerBridgeFixture(),
    cached = await f.load(f.viewer, new AbortController().signal);
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    async () => cached,
    true,
  );
  await c.open();
  await vi.advanceTimersByTimeAsync(1);
  const output = vi.fn();
  await expect(downloadIssuanceReceipt(c, output)).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
  c.close();
});
it('expired displayed lease causes no reread or output', async () => {
  vi.useFakeTimers();
  const f = await fixture(),
    output = vi.fn(),
    reads = f.calls.source;
  await vi.advanceTimersByTimeAsync(30_001);
  await expect(downloadIssuanceReceipt(f.controller, output)).rejects.toThrow();
  expect(f.calls.source).toBe(reads);
  expect(output).not.toHaveBeenCalled();
  f.controller.close();
});
it('ambiguous/stalled reread is bounded and cannot emit a late copy', async () => {
  vi.useFakeTimers();
  const f = await fixture(),
    output = vi.fn();
  let finish!: (value: unknown) => void;
  const original = f.port.readIssued;
  f.port.readIssued = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = downloadIssuanceReceipt(f.controller, output);
  const denied = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(5000);
  await denied;
  if (finish) finish(f.value);
  await vi.advanceTimersByTimeAsync(1);
  expect(output).not.toHaveBeenCalled();
  f.port.readIssued = original;
  f.controller.close();
});
it('one pending copy cannot be replaced by a duplicate copy action', async () => {
  const f = await fixture(),
    output = vi.fn();
  let finish!: (value: unknown) => void;
  const original = f.port.readIssued;
  f.port.readIssued = (...args) =>
    f.calls.source === 2
      ? new Promise((resolve) => {
          finish = resolve;
          f.calls.source++;
        })
      : original(...args);
  const first = downloadIssuanceReceipt(f.controller, output);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await expect(downloadIssuanceReceipt(f.controller, output)).rejects.toThrow();
  finish(f.value);
  await first;
  expect(output).toHaveBeenCalledTimes(1);
  f.controller.close();
});
it('action cancellation before or during reread suppresses output without invalidating the shared controller', async () => {
  const f = await fixture(),
    output = vi.fn(),
    cancel = new AbortController();
  cancel.abort();
  await expect(
    downloadIssuanceReceipt(f.controller, output, cancel.signal),
  ).rejects.toThrow();
  expect(f.controller.getSnapshot().status).toBe('ready');
  const active = new AbortController();
  let finish!: (value: unknown) => void;
  const original = f.port.readIssued;
  f.port.readIssued = (...args) =>
    f.calls.source === 2
      ? new Promise((resolve) => {
          finish = resolve;
          f.calls.source++;
        })
      : original(...args);
  const pending = downloadIssuanceReceipt(f.controller, output, active.signal);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  active.abort();
  finish(f.value);
  await expect(pending).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
  expect(f.controller.getSnapshot().status).toBe('ready');
  f.controller.close();
});
it('output uncertainty returns a fixed failure and requires a new exact read', async () => {
  const f = await fixture();
  await expect(
    downloadIssuanceReceipt(f.controller, () => {
      throw Error('SENSITIVE_CALLBACK_DETAIL');
    }),
  ).rejects.toThrow(
    'Current issuance-receipt copy unavailable; reopen exact source',
  );
  expect(f.controller.getSnapshot().status).toBe('unknown');
  f.controller.close();
});
it('same-instant cached lease cannot qualify as a fresh copy read', async () => {
  vi.useFakeTimers();
  const f = commercialCustomerBridgeFixture(),
    cached = await f.load(f.viewer, new AbortController().signal);
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    async () => cached,
    true,
  );
  await c.open();
  const output = vi.fn();
  await expect(downloadIssuanceReceipt(c, output)).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
  c.close();
});
it('a competing reader cannot lend its ready result to an interrupted copy action', async () => {
  const f = commercialCustomerBridgeFixture();
  let finish!: (value: unknown) => void;
  let held = false;
  const c = new CommercialCustomerReadController(
    () => f.viewer,
    (input, abort) =>
      held
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : f.load(input, abort),
    true,
  );
  await c.open();
  await nextTick();
  const output = vi.fn();
  held = true;
  const pending = downloadIssuanceReceipt(c, output);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  held = false;
  await c.open();
  finish(await f.load(f.viewer, new AbortController().signal));
  await expect(pending).rejects.toThrow();
  expect(output).not.toHaveBeenCalled();
  expect(c.getSnapshot().status).toBe('ready');
  c.close();
});
