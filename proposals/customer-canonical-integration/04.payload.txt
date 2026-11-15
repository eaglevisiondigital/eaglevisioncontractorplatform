import { useEffect, useSyncExternalStore } from 'react';
import { CommercialCustomerReadController } from './commercial-customer-read';
import './customer-invoice.css';
import './commercial-customer-receipt.css';

/** Complementary issued-read/receipt view. Original invoice/lines/download are
 * unchanged. No staff receipt fields are synthesized for renderer compatibility. */
export function CommercialCustomerReceipt({
  controller,
}: {
  controller: CommercialCustomerReadController;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const expires = state.status === 'ready' ? state.value.expiresAt : undefined;
  useEffect(() => {
    if (!expires) return;
    const timer = setTimeout(
      controller.invalidate,
      Math.max(0, expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expires, controller]);
  return (
    <section
      className="customer-invoice commercial-customer-receipt"
      aria-label="Commercial issued receipt"
    >
      <h2>Commercial invoice read · fictional test only</h2>
      <button
        onClick={() => void controller.open()}
        disabled={state.status === 'disabled' || state.status === 'loading'}
      >
        Reopen exact issued invoice
      </button>
      {state.status !== 'ready' ? (
        <p role="status">
          {state.status === 'loading'
            ? 'Reading the exact issued record…'
            : state.status === 'disabled'
              ? 'Customer reader is disabled.'
              : 'UNKNOWN · Current customer access or original invoice evidence is unavailable. No prior receipt is displayed.'}
        </p>
      ) : (
        <>
          <p role="status">Issued invoice · payment UNKNOWN</p>
          <p>{state.value.invoice.number}</p>
          <p>{state.value.invoice.title}</p>
          <details>
            <summary>Original issuance receipt</summary>
            <dl>
              <dt>Issuance receipt · not payment receipt</dt>
              <dd>{state.value.invoice.issuanceReceiptId}</dd>
              <dt>Exact issued version</dt>
              <dd>{state.value.invoice.sourceVersionId}</dd>
              <dt>Immutable revision</dt>
              <dd>{state.value.invoice.revision}</dd>
            </dl>
            <p>
              Read as of{' '}
              <time dateTime={new Date(state.value.observedAt).toISOString()}>
                {new Date(state.value.observedAt).toISOString()}
              </time>
              . Expires {new Date(state.value.expiresAt).toISOString()}.
            </p>
          </details>
          <p>
            No commercial payment, balance, refund, cancellation or dispute fact
            is verified. Absence of a payment record never means unpaid.
          </p>
          <button disabled>Create payment link · unavailable</button>
          <button disabled>Send invoice · unavailable</button>
          <button disabled>Resend invoice · unavailable</button>
          <p>
            Link creation, expiry/revocation and delivery/resend require
            separately authorized customer, merchant, provider and consent
            bindings. No URL or token is created.
          </p>
        </>
      )}
    </section>
  );
}
