import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CommercialCustomerReadController } from './commercial-customer-read';
import {
  downloadIssuanceReceipt,
  type IssuanceReceiptDownload,
} from './issuance-receipt-download';
type Operation = {
  controller: CommercialCustomerReadController;
  signal: AbortSignal;
} & (
  | { status: 'pending' | 'failed' }
  | { status: 'requested'; result: IssuanceReceiptDownload }
);
/** One unmounted native action for the existing receipt component; no new panel. */
export function IssuanceReceiptDownloadAction({
  controller,
}: {
  controller: CommercialCustomerReadController;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const lifetime = useRef<
    | { controller: CommercialCustomerReadController; abort: AbortController }
    | undefined
  >(undefined);
  const [operation, setOperation] = useState<Operation>();
  useLayoutEffect(() => {
    const scope = { controller, abort: new AbortController() };
    lifetime.current = scope;
    return () => {
      scope.abort.abort();
      if (lifetime.current === scope) lifetime.current = undefined;
    };
  }, [controller]);
  const relevant =
    operation?.controller === controller && !operation.signal.aborted
      ? operation
      : undefined;
  const busy = relevant?.status === 'pending';
  const download = async () => {
    const scope = lifetime.current;
    if (
      busy ||
      !scope ||
      scope.controller !== controller ||
      scope.abort.signal.aborted
    )
      return;
    const identity = { controller, signal: scope.abort.signal };
    setOperation({ ...identity, status: 'pending' });
    try {
      const result = await downloadIssuanceReceipt(
        controller,
        undefined,
        scope.abort.signal,
      );
      if (lifetime.current === scope && !scope.abort.signal.aborted)
        setOperation({ ...identity, status: 'requested', result });
    } catch {
      if (lifetime.current === scope && !scope.abort.signal.aborted)
        setOperation({ ...identity, status: 'failed' });
    }
  };
  const result = relevant?.status === 'requested' ? relevant.result : undefined;
  const currentResult =
    result &&
    state.status === 'ready' &&
    result.invoiceId === state.value.invoice.invoiceId &&
    result.issuanceReceiptId === state.value.invoice.issuanceReceiptId &&
    result.observedAt === state.value.observedAt;
  return (
    <div>
      <button
        disabled={state.status !== 'ready' || busy}
        onClick={() => void download()}
      >
        Download issuance-receipt reference
      </button>
      <p role="status">
        {busy
          ? 'Rechecking current access and original issuance receipt…'
          : relevant?.status === 'failed'
            ? 'No safe issuance-receipt copy was confirmed. Reopen the exact source before trying again.'
            : currentResult
              ? 'Issuance-receipt copy requested. Saving is controlled by your browser; this is not an invoice, payment receipt or delivery proof.'
              : 'A fresh current read is required for each local issuance-receipt copy.'}
      </p>
    </div>
  );
}
