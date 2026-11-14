import { createRoot } from 'react-dom/client';
import { useReducer } from 'react';
import { CommercialCustomerReceipt } from '../../../src/components/invoices/CommercialCustomerReceipt';
import {
  CommercialCustomerReadController,
  type CommercialCustomerResponse,
} from '../../../src/components/invoices/commercial-customer-read';
import type { CommercialCustomerTarget } from '../../../src/components/invoices/commercial-customer-read';
import '../../../src/styles.css';
declare const __COMMERCIAL_RESULT__: CommercialCustomerResponse;
declare const __COMMERCIAL_VIEWER__: CommercialCustomerTarget;
// Both constants are injected by the Node test's actual proposed bridge, using
// controlled Auth/source ports. No raw staff receipt or bearer enters this page.
const result = __COMMERCIAL_RESULT__,
  viewer = __COMMERCIAL_VIEWER__;
const originalCustomerId = viewer.invoice.customerId;
let resolvePending: ((value: unknown) => void) | undefined;
let mode: 'ready' | 'denied' | 'pending' | 'mixed' = 'ready';
const controller = new CommercialCustomerReadController(
  () => viewer,
  async () => {
    if (mode === 'denied') throw Error('Fixture current access/source denied');
    if (mode === 'pending')
      return new Promise((resolve) => {
        resolvePending = resolve;
      });
    if (mode === 'mixed')
      return {
        ...result,
        invoice: { ...result.invoice, invoiceId: crypto.randomUUID() },
      };
    return result;
  },
  true,
);
function Fixture() {
  const [, refresh] = useReducer((n) => n + 1, 0);
  return (
    <main>
      <h1>Fictional commercial customer read fixture</h1>
      <nav aria-label="Local read controls">
        <button
          onClick={() => {
            mode = 'denied';
            void controller.open();
          }}
        >
          Withdraw source
        </button>
        <button
          onClick={() => {
            mode = 'ready';
            void controller.open();
          }}
        >
          Read original source
        </button>
        <button
          onClick={() => {
            mode = 'pending';
            void controller.open();
          }}
        >
          Pending source read
        </button>
        <button
          onClick={() => {
            mode = 'ready';
            controller.invalidate();
          }}
        >
          Cancel local read
        </button>
        <button onClick={() => resolvePending?.(result)}>
          Resolve pending original response
        </button>
        <button
          onClick={() => {
            mode = 'denied';
            controller.invalidate();
          }}
        >
          Revoke local session
        </button>
        <button
          onClick={() => {
            mode = 'mixed';
            void controller.open();
          }}
        >
          Return mixed invoice
        </button>
        <button
          onClick={() => {
            viewer.invoice.customerId = crypto.randomUUID();
            refresh();
          }}
        >
          Change customer context
        </button>
        <button
          onClick={() => {
            viewer.invoice.customerId = originalCustomerId;
            refresh();
          }}
        >
          Restore original customer context
        </button>
      </nav>
      <CommercialCustomerReceipt controller={controller} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
