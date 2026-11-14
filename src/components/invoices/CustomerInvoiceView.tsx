import type { CSSProperties } from 'react';
import { PlatformBrand } from '../PlatformBrand';
import { formatMinor } from '../../domain/estimating/calculation';
import {
  customerInvoiceSnapshot,
  invoiceActionBoundaries,
  type InvoiceReadState,
  type InvoiceViewer,
  type CustomerInvoiceSnapshot,
} from './customer-invoice-contract';
import './customer-invoice.css';

function download(snapshot: CustomerInvoiceSnapshot) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${snapshot.number}-fictional-snapshot.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
/** Unmounted content candidate. No fetch, writer, sending or payment callback. */
export function CustomerInvoiceView({
  viewer,
  read,
}: {
  viewer: InvoiceViewer;
  read: InvoiceReadState;
}) {
  let invoice: CustomerInvoiceSnapshot | undefined;
  if (read.status === 'ready') {
    try {
      invoice = customerInvoiceSnapshot(read.value, viewer);
    } catch {
      /* Fail closed and hide prior content. */
    }
  }
  if (!invoice)
    return (
      <section className="customer-invoice" aria-label="Customer invoice">
        <h2>Invoice unavailable</h2>
        <p role="status">
          {read.status === 'loading'
            ? 'Loading the exact invoice source…'
            : 'The exact invoice source or current access is unavailable · UNKNOWN. No invoice or payment confirmation is displayed.'}
        </p>
      </section>
    );
  const money = (n: number) => formatMinor(n, invoice.currency);
  return (
    <article
      className="customer-invoice"
      aria-label="Customer invoice"
      style={{ '--invoice-color': invoice.primaryColor } as CSSProperties}
    >
      <header className="customer-invoice-header">
        <PlatformBrand transparent href="#customer-invoice-heading" />
        <p className="customer-invoice-lab">
          Fictional nonproduction invoice · source review only
        </p>
        <h2 id="customer-invoice-heading" tabIndex={-1}>
          Invoice from {invoice.companyName}
        </h2>
        <p className="customer-invoice-number">{invoice.number}</p>
      </header>
      <div className="customer-invoice-summary">
        <div>
          <h3>Prepared for</h3>
          <p>{invoice.customerName}</p>
          <p>{invoice.propertyLabel}</p>
        </div>
        <div>
          <h3>Issued invoice</h3>
          <p>{invoice.title}</p>
          <p>
            Issued{' '}
            <time dateTime={invoice.issuedAt}>
              {new Intl.DateTimeFormat('en-US', {
                dateStyle: 'long',
                timeZone: 'UTC',
              }).format(new Date(invoice.issuedAt))}{' '}
              · UTC
            </time>
          </p>
          <p>Immutable revision {invoice.revision}</p>
        </div>
      </div>
      <section aria-label="Invoice line items">
        <h3>Line items</h3>
        {invoice.scope ? (
          <>
            <div
              className="customer-invoice-table"
              role="region"
              aria-label="Scrollable invoice line items"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Description</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.scope.lines.map((line) => (
                    <tr key={line.id}>
                      <th scope="row">{line.description}</th>
                      <td>
                        {(line.quantity_milli / 1000).toLocaleString('en-US')}{' '}
                        {line.unit}
                      </td>
                      <td>{money(line.amount_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="customer-invoice-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(invoice.scope.subtotalMinor)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>{money(invoice.scope.discountMinor)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{money(invoice.scope.taxMinor)}</dd>
              </div>
              <div>
                <dt>Invoice total</dt>
                <dd>{money(invoice.amountMinor)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <p role="status">
              Exact issued line source not supplied · UNKNOWN. Line items,
              subtotal, discount and tax are not inferred from the invoice
              title.
            </p>
            <p>
              Recorded invoice total:{' '}
              <strong>{money(invoice.amountMinor)}</strong>
            </p>
          </>
        )}
      </section>
      <section
        className="customer-invoice-payment"
        aria-label="Payment and receipts"
      >
        <h3>Payment status · unverified</h3>
        <p>
          No paid amount, remaining balance, settlement or customer payment
          receipt has been verified. An issuance receipt is not proof of
          payment.
        </p>
        <button disabled>Pay invoice · unavailable</button>
        <button disabled>Payment receipt · unavailable</button>
        <p>
          Payment links and customer payment receipts require separate
          authorization and financial evidence.
        </p>
      </section>
      <button disabled={!invoice.scope} onClick={() => download(invoice)}>
        Download invoice snapshot
      </button>
      <p>
        A detached fictional content copy only; it does not grant access,
        authorize payment or prove delivery.
      </p>
      <details>
        <summary>Exact invoice source and issuance receipt</summary>
        <dl>
          <dt>Invoice</dt>
          <dd>{invoice.invoiceId}</dd>
          <dt>Issued estimate version</dt>
          <dd>{invoice.sourceVersionId}</dd>
          <dt>Issuance receipt</dt>
          <dd>{invoice.issuanceReceiptId}</dd>
        </dl>
      </details>
      <details>
        <summary>Delivery, resend, cancellation and correction</summary>
        <p>
          These actions are not connected. Refreshing this view does not send,
          replay or replace an invoice.
        </p>
        {invoiceActionBoundaries.map((action) => (
          <div key={action.id} className="customer-invoice-action">
            <button disabled>{action.label}</button>
            <p>{action.reason}</p>
          </div>
        ))}
      </details>
    </article>
  );
}
