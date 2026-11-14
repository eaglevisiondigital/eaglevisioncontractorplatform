import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CustomerPaymentView } from '../../../src/components/invoices/CustomerPaymentView';
import {
  readCustomerPayment,
  type CustomerPaymentRead,
} from '../../../src/components/invoices/customer-payment-contract';
import { customerPaymentFixture } from '../../fixtures/customer-payment';
import '../../../src/styles.css';

async function start() {
  const fixtures = await Promise.all(
    Array.from({ length: 4 }, () => customerPaymentFixture()),
  );
  await fixtures[1].capture(10_000);
  await fixtures[2].capture(31_900);
  await fixtures[3].capture(31_900);
  await fixtures[3].refund(2500);
  const snapshots = await Promise.all(
    fixtures.map((f) => readCustomerPayment(f.source)),
  );
  function Fixture() {
    const [index, setIndex] = useState(0);
    const [read, setRead] = useState<CustomerPaymentRead>({
      status: 'ready',
      snapshot: snapshots[0],
    });
    const show = (i: number) => {
      setIndex(i);
      setRead({ status: 'ready', snapshot: snapshots[i] });
    };
    return (
      <main>
        <h1>Fictional payment presentation fixture</h1>
        <nav aria-label="Local fixture states">
          {['Unpaid', 'Partially paid', 'Paid', 'Refund adjusted'].map(
            (label, i) => (
              <button key={label} onClick={() => show(i)}>
                Show {label}
              </button>
            ),
          )}
          <button onClick={() => setRead({ status: 'loading' })}>
            Pending evidence
          </button>
          <button onClick={() => setRead({ status: 'unknown' })}>
            Unknown evidence
          </button>
          <button
            onClick={() => {
              fixtures[index].setAccess({ active: false });
              setRead({ status: 'ready', snapshot: snapshots[index] });
            }}
          >
            Revoke local session
          </button>
          <button
            onClick={() => {
              fixtures[index].setAccess({ expiresAt: Date.now() - 1 });
              setRead({ status: 'ready', snapshot: snapshots[index] });
            }}
          >
            Expire local session
          </button>
        </nav>
        <CustomerPaymentView read={read} />
      </main>
    );
  }
  createRoot(document.getElementById('root')!).render(<Fixture />);
}
void start();
