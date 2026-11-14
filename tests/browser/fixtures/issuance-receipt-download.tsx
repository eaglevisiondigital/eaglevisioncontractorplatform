import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useState } from 'react';
import { CommercialCustomerReceipt } from '../../../src/components/invoices/CommercialCustomerReceipt';
import {
  CommercialCustomerReadController,
  type CommercialCustomerTarget,
} from '../../../src/components/invoices/commercial-customer-read';
import { IssuanceReceiptDownloadAction } from '../../../src/components/invoices/IssuanceReceiptDownloadAction';
import '../../../src/styles.css';
declare const __RECEIPT_TARGET__: CommercialCustomerTarget;
const target = __RECEIPT_TARGET__;
let mode: 'normal' | 'hold' | 'substitute' | 'ambiguous' = 'normal';
let finish: (() => void) | undefined;
async function read(input: CommercialCustomerTarget, signal: AbortSignal) {
  if (mode === 'hold')
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  if (mode === 'ambiguous') throw Error('Fictional ambiguous read');
  // Playwright intercepts this test-only URL and invokes the existing Node bridge
  // with controlled Auth/mapping ports. No product route or endpoint exists.
  const response = await fetch(
    '/__issuance_read_fixture__?target=' +
      encodeURIComponent(JSON.stringify(input)),
    { signal },
  );
  if (!response.ok) throw Error('Controlled reader unavailable');
  const value = await response.json();
  return mode === 'substitute'
    ? {
        ...value,
        invoice: { ...value.invoice, issuanceReceiptId: crypto.randomUUID() },
      }
    : value;
}
const controllers = [
  new CommercialCustomerReadController(() => target, read, true),
  new CommercialCustomerReadController(() => target, read, true),
];
async function start() {
  await Promise.all(controllers.map((c) => c.open()));
  function Fixture() {
    const [index, setIndex] = useState(0),
      [mounted, setMounted] = useState(true);
    const controller = controllers[index];
    return (
      <main>
        <h1>Fictional local issuance-reference copy</h1>
        <nav aria-label="Local fixture controls">
          <button
            onClick={() => {
              mode = 'hold';
            }}
          >
            Hold next read
          </button>
          <button
            onClick={() => {
              mode = 'normal';
              finish?.();
            }}
          >
            Release original read
          </button>
          <button
            onClick={() => {
              mode = 'normal';
              void controller.open();
            }}
          >
            Read original source
          </button>
          <button
            onClick={() => {
              mode = 'substitute';
            }}
          >
            Substitute next receipt
          </button>
          <button
            onClick={() => {
              mode = 'ambiguous';
            }}
          >
            Ambiguous next read
          </button>
          <button onClick={() => flushSync(() => setMounted(false))}>
            Unmount download action
          </button>
          <button onClick={() => flushSync(() => setMounted(true))}>
            Remount download action
          </button>
          <button
            onClick={() =>
              flushSync(() => setIndex((index + 1) % controllers.length))
            }
          >
            Switch receipt controller
          </button>
        </nav>
        <CommercialCustomerReceipt controller={controller} />
        {mounted && <IssuanceReceiptDownloadAction controller={controller} />}
      </main>
    );
  }
  createRoot(document.getElementById('root')!).render(<Fixture />);
}
void start();
