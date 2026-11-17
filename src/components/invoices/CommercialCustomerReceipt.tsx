import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { CommercialCustomerReadController } from './commercial-customer-read';
import { formatMinor } from '../../domain/estimating/calculation';
import './customer-invoice.css';
import './commercial-customer-receipt.css';

/** Complementary issued-read/receipt view. Original invoice/lines/download are
 * unchanged. No staff receipt fields are synthesized for renderer compatibility. */
export function CommercialCustomerReceipt({
  controller,
}: {
  controller: CommercialCustomerReadController;
}) {
  const live = useRef<CommercialCustomerReadController | undefined>(undefined);
  const pending = useRef<CommercialCustomerReadController | undefined>(
    undefined,
  );
  const [downloading, setDownloading] =
    useState<CommercialCustomerReadController>();
  const [referenceStatus, setReferenceStatus] = useState<{
    controller: CommercialCustomerReadController;
    text: string;
  }>();
  useLayoutEffect(() => {
    live.current = controller;
    return () => {
      if (live.current === controller) live.current = undefined;
    };
  }, [controller]);
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
  async function downloadReference() {
    if (pending.current === controller) return;
    pending.current = controller;
    setDownloading(controller);
    setReferenceStatus(undefined);
    try {
      // A download requires a new read through the existing server-authorized
      // reader. A previously visible issuance record is not current authority.
      await controller.open();
      const current = controller.getSnapshot();
      if (live.current !== controller) return;
      if (current.status !== 'ready') throw Error('Unavailable');
      const invoice = current.value.invoice;
      const reference = {
        schema: 'commercial-issuance-reference-v1',
        mode: current.value.mode,
        receiptKind: 'issuance-not-payment',
        invoiceId: invoice.invoiceId,
        number: invoice.number,
        title: invoice.title,
        currency: invoice.currency,
        amountMinor: invoice.amountMinor,
        issuedAt: invoice.issuedAt,
        revision: invoice.revision,
        sourceVersionId: invoice.sourceVersionId,
        issuanceReceiptId: invoice.issuanceReceiptId,
        observedAt: current.value.observedAt,
        expiresAt: current.value.expiresAt,
        paymentStatus: 'UNKNOWN',
      };
      if (live.current !== controller || controller.getSnapshot() !== current)
        return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(reference, null, 2) + '\n'], {
          type: 'application/json',
        }),
      );
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'original-issuance-reference.json';
        if (live.current !== controller || controller.getSnapshot() !== current)
          return;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (live.current === controller)
        setReferenceStatus({
          controller,
          text: 'Original issuance reference downloaded. Payment remains UNKNOWN.',
        });
    } catch {
      if (live.current === controller)
        setReferenceStatus({
          controller,
          text: 'Issuance reference unavailable. Reopen the exact issued invoice to review current access.',
        });
    } finally {
      if (pending.current === controller) pending.current = undefined;
      if (live.current === controller)
        setDownloading((value) => (value === controller ? undefined : value));
    }
  }
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
      <button
        onClick={() => void downloadReference()}
        disabled={
          state.status === 'disabled' ||
          state.status === 'loading' ||
          downloading === controller
        }
      >
        Download original issuance reference
      </button>
      {referenceStatus?.controller === controller && (
        <p role="status">{referenceStatus.text}</p>
      )}
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
          <p>
            Original issued amount:{' '}
            {formatMinor(
              state.value.invoice.amountMinor,
              state.value.invoice.currency,
            )}
          </p>
          <p>
            Issued{' '}
            <time dateTime={state.value.invoice.issuedAt}>
              {state.value.invoice.issuedAt}
            </time>
            . This is not a paid balance or payment receipt.
          </p>
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
