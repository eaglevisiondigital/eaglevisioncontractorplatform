// Explicit controlled reader fixture, not a product route or Auth capability.
import { createRoot } from 'react-dom/client';
import { CommercialCustomerReceipt } from '../../../src/components/invoices/CommercialCustomerReceipt';
import {
  CommercialCustomerReadController,
  type CommercialCustomerTarget,
} from '../../../src/components/invoices/commercial-customer-read';
import '../../../src/styles.css';
declare const __PUBLIC_VIEWERS__: CommercialCustomerTarget[];
declare global {
  interface Window {
    issuanceReference: {
      replace: () => void;
      disable: () => void;
      invalidate: () => void;
      changeCustomer: () => void;
    };
  }
}
const viewers = __PUBLIC_VIEWERS__;
const make = (index: number, enabled = true) =>
  new CommercialCustomerReadController(
    () => viewers[index],
    async (_, signal) => {
      const response = await fetch('https://issuance-reference.test/read', {
        method: 'POST',
        signal,
        body: JSON.stringify({ index }),
      });
      if (!response.ok) throw Error('Read unavailable');
      return response.json();
    },
    enabled,
  );
let index = 0,
  controller = make(0);
const root = createRoot(document.getElementById('root')!);
function render() {
  root.render(
    <main>
      <h1>Controlled issuance reference viewer</h1>
      <CommercialCustomerReceipt controller={controller} />
    </main>,
  );
}
window.issuanceReference = {
  replace: () => {
    index = 1;
    controller = make(1);
    render();
  },
  disable: () => {
    controller = make(index, false);
    render();
  },
  invalidate: () => controller.invalidate(),
  changeCustomer: () => {
    viewers[index].invoice.customerId = crypto.randomUUID();
    render();
  },
};
render();
