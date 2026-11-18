// Fictional canonical issued evidence supplied by the existing Node bridge fixture.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CommercialCustomerReceipt } from '../../../src/components/invoices/CommercialCustomerReceipt';
import {
  CommercialCustomerReadController,
  type CommercialCustomerResponse,
  type CommercialCustomerTarget,
} from '../../../src/components/invoices/commercial-customer-read';
import '../../../src/styles.css';

type Mode = 'ready' | 'pending' | 'denied' | 'wrong' | 'expired' | 'short';
declare global {
  interface Window {
    issuedAmountSeed: {
      viewer: CommercialCustomerTarget;
      result: CommercialCustomerResponse;
    };
    issuedAmountReview: {
      reads(): number;
      mode(value: Mode): void;
      waiting(): boolean;
      release(): void;
      withdraw(): void;
      restore(): void;
    };
  }
}

const seed = window.issuedAmountSeed;
const viewer = structuredClone(seed.viewer);
const originalCustomer = viewer.invoice.customerId;
let mode: Mode = 'ready',
  reads = 0,
  waiting = false;
let release = () => {};
const controller = new CommercialCustomerReadController(
  () => viewer,
  async () => {
    reads++;
    const value = structuredClone(seed.result);
    if (mode === 'denied') throw Error('Fictional source is unavailable.');
    if (mode === 'wrong') value.invoice.invoiceId = crypto.randomUUID();
    if (mode === 'expired') value.expiresAt = Date.now() - 1;
    // Only the fictional ticket lifetime is shortened. Invoice facts and the
    // original production/controller/receipt deadlines are never changed.
    if (mode === 'short')
      value.expiresAt = Math.min(value.expiresAt, Date.now() + 600);
    value.link.expiresAt = value.expiresAt;
    if (mode === 'pending') {
      waiting = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      waiting = false;
    }
    return value;
  },
  new URL(location.href).searchParams.get('scenario') !== 'disabled',
);
const root = createRoot(document.getElementById('root')!);
function render() {
  root.render(
    <main>
      <h1>Fictional issued invoice amount review</h1>
      <CommercialCustomerReceipt controller={controller} />
    </main>,
  );
}
window.issuedAmountReview = {
  reads: () => reads,
  mode: (value) => {
    mode = value;
  },
  waiting: () => waiting,
  release: () => release(),
  withdraw: () => {
    viewer.invoice.customerId = crypto.randomUUID();
    flushSync(render);
  },
  restore: () => {
    viewer.invoice.customerId = originalCustomer;
    flushSync(render);
  },
};
render();
