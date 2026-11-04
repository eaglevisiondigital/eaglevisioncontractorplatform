import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  readTaskReceiptReconciliation,
  inspectTaskReceiptReconciliation,
  type TaskReceiptReconciliation,
} from '../../lib/workflows/task-receipt-reconciliation';
import './task-receipt-actions.css';

export type TaskReceiptActionsProps = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void;
};
export function TaskReceiptActions(props: TaskReceiptActionsProps) {
  const allowed =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  const [context, setContext] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    allowed,
    epoch: 0,
  });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId ||
    context.allowed !== allowed
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      allowed,
      epoch: context.epoch + 1,
    });
    return null;
  }
  return allowed && props.selectedJobId ? (
    <ReceiptAction
      key={context.epoch}
      {...props}
      selectedJobId={props.selectedJobId}
    />
  ) : null;
}
function ReceiptAction({
  sources,
  selectedJobId,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const [review, setReview] = useState<TaskReceiptReconciliation>(),
    [message, setMessage] = useState(
      'Read the original correction receipt and its exact native stages. This never retries or clears UNKNOWN.',
    ),
    [busy, setBusy] = useState(false),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    gate = useRef({ enabled: true, confirmed: true });
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
    l.alive = true;
    g.enabled = true;
    g.confirmed = true;
    return () => {
      l.alive = false;
      l.serial++;
      g.enabled = false;
      g.confirmed = false;
    };
  }, [sources]);
  async function reconcile() {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    const serial = ++l.serial;
    setBusy(true);
    setReview(undefined);
    try {
      const next = await readTaskReceiptReconciliation(
        sources,
        selectedJobId,
        gate.current,
      );
      inspectTaskReceiptReconciliation(next);
      if (l.alive && l.serial === serial) {
        setReview(next);
        setMessage(
          'Exact receipt observation complete; original custody is unchanged.',
        );
      }
    } catch {
      if (l.alive && l.serial === serial)
        setMessage(
          'Receipt unavailable or source changed. UNKNOWN stays held; no replay.',
        );
    } finally {
      l.pending = false;
      if (l.alive && l.serial === serial) setBusy(false);
    }
  }
  let data: ReturnType<typeof inspectTaskReceiptReconciliation> | undefined;
  try {
    if (review) data = inspectTaskReceiptReconciliation(review);
  } catch {
    data = undefined;
  }
  return (
    <section
      className="task-receipt-actions"
      aria-label="Original task receipt actions"
    >
      <h3>Original correction receipt</h3>
      <p>
        Exact native evidence only. Approved task time is not posted labor or
        physical completion.
      </p>
      <button type="button" disabled={busy} onClick={() => void reconcile()}>
        Reconcile original task receipt
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {data && (
        <div aria-label="Exact task receipt result">
          <p>
            <strong>{data.classification}</strong> · Custody: {data.state} ·
            Stage: {data.native_stage}
          </p>
          <dl>
            <dt>Original issued version</dt>
            <dd>{data.identity.version_id}</dd>
            <dt>Original task</dt>
            <dd>{data.source_id ?? 'No original correction claim'}</dd>
            <dt>Acknowledged result</dt>
            <dd>
              {data.result_id ?? 'No acknowledged result ID; never inferred'}
            </dd>
            <dt>Confirmed proposed task</dt>
            <dd>{data.expected?.task ?? 'No original confirmed input'}</dd>
            <dt>Observed saved task</dt>
            <dd>{data.observed_result?.task ?? 'Unavailable; not inferred'}</dd>
            <dt>Exact source rows</dt>
            <dd>{data.counts.source_rows}</dd>
            <dt>Acknowledged result rows</dt>
            <dd>{data.counts.result_rows}</dd>
            <dt>Recorded successors</dt>
            <dd>{data.counts.successor_rows}</dd>
            <dt>Expected matching result rows</dt>
            <dd>{data.counts.expected_match_rows}</dd>
            <dt>Original source reviews</dt>
            <dd>{data.counts.source_reviews}</dd>
            <dt>Result review rows</dt>
            <dd>{data.counts.result_reviews}</dd>
            <dt>Approved result reviews</dt>
            <dd>{data.counts.approved_reviews}</dd>
          </dl>
          {data.conflicts.length > 0 && (
            <ul>
              {data.conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <p>
            Replay: FORBIDDEN. Read-only reconciliation never releases a held
            command.
          </p>
        </div>
      )}
    </section>
  );
}
