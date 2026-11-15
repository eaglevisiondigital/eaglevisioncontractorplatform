import { useLayoutEffect, useRef, useState } from 'react';
import {
  customerPaymentReceipt,
  paymentPublicationTarget,
  type CustomerPaymentReceipt as Receipt,
  type PaymentPublicationTarget,
} from './contract';
export function CustomerPaymentReceipt({
  enabled = false,
  target,
  load,
}: {
  enabled?: boolean;
  target: PaymentPublicationTarget;
  load: (
    target: PaymentPublicationTarget,
    signal: AbortSignal,
  ) => Promise<unknown>;
}) {
  const [state, setState] = useState<{
    key: string;
    receipt: Readonly<Receipt> | null;
    message: string;
  }>({ key: '', receipt: null, message: 'Receipt unavailable' });
  const live = useRef<{
    key: string;
    active: boolean;
    operation: AbortController | null;
    lastObserved: number;
  }>({ key: '', active: false, operation: null, lastObserved: -Infinity });
  let key = '';
  try {
    key = JSON.stringify(paymentPublicationTarget(target));
  } catch {
    /* Invalid presentation context stays hidden. */
  }
  useLayoutEffect(() => {
    const scope = {
      key,
      active: true,
      operation: null as AbortController | null,
      lastObserved: -Infinity,
    };
    live.current = scope;
    setState({ key, receipt: null, message: 'Receipt unavailable' });
    return () => {
      scope.active = false;
      scope.operation?.abort();
    };
  }, [key, enabled, load]);
  const receipt =
    enabled &&
    key &&
    state.key === key &&
    state.receipt &&
    state.receipt.expiresAt > Date.now()
      ? state.receipt
      : null;
  useLayoutEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(
      () =>
        setState((s) => ({
          ...s,
          receipt: null,
          message: 'Receipt expired. Reopen to verify current access.',
        })),
      Math.max(0, receipt.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [receipt]);
  const reopen = async () => {
    const scope = live.current;
    if (!enabled || !key || !scope.active || scope.operation) return;
    const controller = new AbortController();
    scope.operation = controller;
    const started = Date.now();
    const timer = setTimeout(() => {
      if (scope.active && scope === live.current) {
        controller.abort();
        if (scope.operation === controller) scope.operation = null;
        setState({
          key,
          receipt: null,
          message: 'Receipt unavailable. Current authorization is required.',
        });
      }
    }, 5000);
    setState({ key, receipt: null, message: 'Checking current access…' });
    try {
      const value = await load(
        paymentPublicationTarget(target),
        controller.signal,
      );
      if (
        !scope.active ||
        controller.signal.aborted ||
        scope !== live.current ||
        scope.key !== key
      )
        return;
      const decoded = customerPaymentReceipt(value, target);
      if (
        decoded.observedAt < started ||
        decoded.observedAt <= scope.lastObserved
      )
        throw Error('Fresh original receipt read required');
      scope.lastObserved = decoded.observedAt;
      setState({
        key,
        receipt: decoded,
        message:
          'Original record reopened. Balance and settlement are not established.',
      });
    } catch {
      if (scope.active && scope === live.current && !controller.signal.aborted)
        setState({
          key,
          receipt: null,
          message: 'Receipt unavailable. Current authorization is required.',
        });
    } finally {
      clearTimeout(timer);
      if (scope.operation === controller) scope.operation = null;
    }
  };
  const money = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  return (
    <section
      aria-label="Original payment receipt"
      style={{
        maxWidth: '40rem',
        margin: '1rem auto',
        padding: '1rem',
        fontFamily: 'system-ui',
        lineHeight: 1.6,
        overflowWrap: 'anywhere',
        color: '#142333',
        background: '#fff',
        border: '1px solid #627588',
        borderRadius: '0.5rem',
      }}
    >
      <h2>Original payment receipt</h2>
      <p>Sandbox payment record</p>
      <button
        type="button"
        disabled={
          !enabled || !key || state.message === 'Checking current access…'
        }
        onClick={() => void reopen()}
        style={{ minHeight: 44, padding: '0.5rem 1rem' }}
      >
        Reopen original receipt
      </button>
      <p role="status">
        {enabled && key
          ? state.key === key
            ? state.message
            : 'Receipt unavailable'
          : 'Receipt unavailable'}
      </p>
      {receipt && (
        <div>
          <h3>
            {receipt.kind === 'capture'
              ? 'Recorded capture'
              : 'Recorded refund'}
          </h3>
          <dl>
            <dt>Recorded amount</dt>
            <dd>{money(receipt.amountMinor)}</dd>
            <dt>Original invoice amount</dt>
            <dd>{money(receipt.invoiceAmountMinor)}</dd>
            <dt>Invoice reference</dt>
            <dd>{receipt.invoiceId}</dd>
            <dt>Original payment record</dt>
            <dd>{receipt.receiptReference}</dd>
            <dt>Invoice issuance reference</dt>
            <dd>{receipt.issuanceReceiptReference}</dd>
            <dt>Attempt recorded</dt>
            <dd>{receipt.attemptedAt}</dd>
          </dl>
          <p>
            This records one original gateway result. It does not establish the
            current balance, settlement, cancellation or dispute status.
          </p>
        </div>
      )}
    </section>
  );
}
