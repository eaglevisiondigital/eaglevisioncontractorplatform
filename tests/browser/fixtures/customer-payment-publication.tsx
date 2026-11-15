import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CustomerPaymentReceipt } from '../../../proposals/customer-payment-publication/CustomerPaymentReceipt';
import type { PaymentPublicationTarget } from '../../../proposals/customer-payment-publication/contract';
declare const __PAYMENT_TARGET__: PaymentPublicationTarget;
declare global {
  interface Window {
    __payment_read__: (target: PaymentPublicationTarget) => Promise<unknown>;
    __payment_control__: (command: string) => void;
  }
}
const load = (target: PaymentPublicationTarget) =>
  window.__payment_read__(target);
const root = createRoot(document.getElementById('root')!);
function Fixture() {
  const [enabled, setEnabled] = useState(false),
    [target, setTarget] = useState(__PAYMENT_TARGET__);
  window.__payment_control__ = (command) =>
    flushSync(() => {
      if (command === 'enable') setEnabled(true);
      if (command === 'disable') setEnabled(false);
      if (command === 'different')
        setTarget({
          ...__PAYMENT_TARGET__,
          invoiceId: '88888888-8888-4888-8888-888888888888',
        });
      if (command === 'original') setTarget({ ...__PAYMENT_TARGET__ });
      if (command === 'unmount') root.unmount();
    });
  return (
    <main>
      <h1>Fictional receipt review</h1>
      <CustomerPaymentReceipt enabled={enabled} target={target} load={load} />
    </main>
  );
}
root.render(<Fixture />);
