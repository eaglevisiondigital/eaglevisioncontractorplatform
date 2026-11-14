import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { CustomerInvoiceView } from '../../../src/components/invoices/CustomerInvoiceView';
import type { InvoiceReadState } from '../../../src/components/invoices/customer-invoice-contract';
import { fictionalCustomerInvoice } from '../../fixtures/customer-issued-invoice';
import '../../../src/styles.css';
const fixtures = [0, 1, 2].map(fictionalCustomerInvoice);
function Fixture() {
  const [index, setIndex] = useState(0),
    [read, setRead] = useState<InvoiceReadState>({
      status: 'ready',
      value: fixtures[0].value,
    });
  return (
    <main>
      <h1>Customer invoice · fictional local fixture</h1>
      <nav aria-label="Fictional source controls">
        <button onClick={() => setIndex((index + 1) % fixtures.length)}>
          Select next fictional contractor
        </button>
        <button
          onClick={() =>
            setRead({ status: 'ready', value: fixtures[index].value })
          }
        >
          Load selected source
        </button>
        <button onClick={() => setRead({ status: 'loading' })}>
          Simulate pending read
        </button>
        <button onClick={() => setRead({ status: 'unknown' })}>
          Simulate unknown read
        </button>
        <button
          onClick={() =>
            setRead({
              status: 'ready',
              value: { ...fixtures[index].value, source: null },
            })
          }
        >
          Omit exact line source
        </button>
        <button
          onClick={() => {
            setIndex(0);
            setRead({ status: 'ready', value: fixtures[0].value });
          }}
        >
          Reopen original snapshot
        </button>
      </nav>
      <CustomerInvoiceView viewer={fixtures[index].viewer} read={read} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
