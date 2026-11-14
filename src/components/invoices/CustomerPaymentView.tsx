import { useEffect, useReducer } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import {
  inspectCustomerPayment,
  type CustomerPaymentRead,
  type CustomerPaymentSnapshot,
} from './customer-payment-contract';
import './customer-payment.css';

/** Reusable unmounted renderer; its only receipt is a canonical synthetic event.
 * Commercial invoice billing, genuine Auth and actual payment links remain held. */
export function CustomerPaymentView({ read }: { read: CustomerPaymentRead }) {
  const [, refresh] = useReducer((n) => n + 1, 0);
  let payment: CustomerPaymentSnapshot | undefined;
  if (read.status === 'ready') {
    try {
      payment = inspectCustomerPayment(read.snapshot);
    } catch {
      /* UNKNOWN */
    }
  }
  useEffect(() => {
    if (!payment) return;
    const timer = setTimeout(
      refresh,
      Math.max(0, payment.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [payment]);
  if (!payment)
    return (
      <section
        className="customer-payment"
        aria-label="Customer payment record"
      >
        <h2>Payment evidence unavailable</h2>
        <p role="status">
          {read.status === 'loading'
            ? 'Reading exact payment evidence…'
            : 'UNKNOWN · Current access or complete canonical payment evidence is unavailable. No balance or payment receipt is displayed.'}
        </p>
      </section>
    );
  const money = (n: number) => formatMinor(n, payment.currency);
  const status =
    payment.status === 'PARTIALLY_PAID'
      ? 'Partially paid'
      : payment.status === 'PAID'
        ? 'Paid'
        : 'Unpaid';
  return (
    <section className="customer-payment" aria-label="Customer payment record">
      <h2>{status} · synthetic invoice only</h2>
      <p>
        {payment.companyName} · {payment.invoiceNumber}
      </p>
      <p>
        Source: canonical release-preview invoice. Commercial invoice payment
        bridge: HELD.
      </p>
      <p>
        This fictional record is not bank settlement or proof of a real customer
        payment.
      </p>
      <dl className="customer-payment-totals">
        <div>
          <dt>Invoice total</dt>
          <dd>{money(payment.totalMinor)}</dd>
        </div>
        <div>
          <dt>Recorded captures</dt>
          <dd>{money(payment.capturedMinor)}</dd>
        </div>
        <div>
          <dt>Recorded refunds</dt>
          <dd>{money(payment.refundedMinor)}</dd>
        </div>
        <div>
          <dt>Remaining synthetic balance</dt>
          <dd>{money(payment.balanceMinor)}</dd>
        </div>
      </dl>
      <details onToggle={refresh}>
        <summary>
          View canonical synthetic payment receipts ({payment.receipts.length})
        </summary>
        {!payment.receipts.length && (
          <p>
            No capture or refund receipts are recorded in this complete source.
          </p>
        )}
        {payment.receipts.map((receipt) => (
          <div key={receipt.eventId} className="customer-payment-receipt">
            <h3>
              {receipt.kind === 'synthetic_capture'
                ? 'Synthetic capture receipt'
                : 'Synthetic refund receipt'}
            </h3>
            <p>
              {money(receipt.amountMinor)} ·{' '}
              <time dateTime={receipt.createdAt}>{receipt.createdAt}</time>
            </p>
            <dl>
              <dt>Original event</dt>
              <dd>{receipt.eventId}</dd>
              {receipt.adjustsEventId && (
                <>
                  <dt>Adjusts original capture</dt>
                  <dd>{receipt.adjustsEventId}</dd>
                </>
              )}
            </dl>
            <p>Canonical synthetic event only · settlement unverified.</p>
          </div>
        ))}
      </details>
      <details onToggle={refresh}>
        <summary>Payment link contract and exact source</summary>
        <p>
          Synthetic non-navigable link · no URL, token or provider request
          exists. Expires{' '}
          <time dateTime={new Date(payment.link.expiresAt).toISOString()}>
            {new Date(payment.link.expiresAt).toISOString()}
          </time>
          .
        </p>
        <button disabled>Open payment link · unavailable</button>
        <p>
          A future link requires current customer access, an accepted commercial
          billing bridge, exact merchant/amount/currency, expiry/revocation and
          provider authority. Delivery and resend remain disabled.
        </p>
        <dl>
          <dt>Canonical test invoice</dt>
          <dd>{payment.invoiceId}</dd>
          <dt>Issued source version</dt>
          <dd>{payment.sourceVersionId}</dd>
          <dt>Evidence observed</dt>
          <dd>{payment.asOf}</dd>
        </dl>
      </details>
    </section>
  );
}
