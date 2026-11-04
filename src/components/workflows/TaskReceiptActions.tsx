import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  readTaskReceiptReconciliation,
  inspectTaskReceiptReconciliation,
  assertTaskReceiptObservationAccess,
  type TaskReceiptReconciliation,
  readTaskReceiptContinuity,
  rereadTaskReceiptContinuity,
  inspectTaskReceiptContinuity,
  inspectTaskReceiptTask,
  verifyTaskReceiptCorrectionSource,
  taskReceiptControlsDestination,
  type TaskReceiptContinuity,
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
  onContinue,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const [continuity, setContinuity] = useState<TaskReceiptContinuity>(),
    [selectedTask, setSelectedTask] = useState(''),
    [verification, setVerification] = useState(
      'Not verified; original source must be checked.',
    ),
    [review, setReview] = useState<TaskReceiptReconciliation>(),
    [message, setMessage] = useState(
      'Read the original correction receipt and its exact native stages. This never retries or clears UNKNOWN.',
    ),
    [busy, setBusy] = useState(false),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    gate = useRef({ enabled: true, confirmed: true }),
    section = useRef<HTMLElement>(null),
    liveContinue = useRef(onContinue);
  useLayoutEffect(() => {
    liveContinue.current = onContinue;
    return () => {
      liveContinue.current = undefined;
    };
  }, [onContinue]);
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
  async function taskAction(action: 'read' | 'verify' | 'open') {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    setBusy(true);
    try {
      if (action === 'read') {
        setContinuity(undefined);
        setVerification(
          'Reading current exact task sources; previous verification is cleared.',
        );
        const next = continuity
          ? await rereadTaskReceiptContinuity(
              continuity,
              sources,
              selectedJobId,
              gate.current,
            )
          : await readTaskReceiptContinuity(
              sources,
              selectedJobId,
              gate.current,
            );
        inspectTaskReceiptContinuity(next);
        if (l.alive) {
          setContinuity(next);
          setVerification(
            selectedTask
              ? inspectTaskReceiptContinuity(next).graph.graph.nodes.some(
                  (row) => row.id === selectedTask,
                )
                ? 'Exact selected task retained. Verify its current native source explicitly; original custody is unchanged.'
                : 'Selected exact task is unavailable. No fallback or newest task was selected.'
              : 'Choose an exact task; no newest-task substitution.',
          );
        }
      } else if (continuity) {
        if (action === 'verify') {
          const result = await verifyTaskReceiptCorrectionSource(
            continuity,
            selectedTask,
          );
          if (l.alive)
            setVerification(
              result.can_edit
                ? 'Original source eligible now; the original form must recheck before saving.'
                : 'Original source held: ' +
                    result.blocked_reason +
                    '. No replay.',
            );
        } else {
          const target = await taskReceiptControlsDestination(
            continuity,
            selectedTask,
          );
          if (!l.alive || !onContinue || liveContinue.current !== onContinue)
            throw Error('Original field continuation unavailable');
          inspectTaskReceiptTask(continuity, selectedTask);
          await onContinue(target.job_id, target.step);
          inspectTaskReceiptTask(continuity, selectedTask);
          if (!l.alive || liveContinue.current !== onContinue)
            throw Error('Original field continuation changed');
          const original =
            section.current?.parentElement?.querySelector<HTMLElement>(
              '[aria-label="Task custody and correction comparison"] > details',
            );
          if (original instanceof HTMLDetailsElement) {
            original.open = true;
            original.querySelector<HTMLElement>('summary')?.focus();
          }
          if (l.alive)
            setVerification(
              'Original field controls retained for task ' +
                target.source_entry_id +
                '. Select this exact ID in the original form; nothing was saved.',
            );
        }
      }
    } catch {
      if (l.alive)
        setVerification(
          'Source stale, unavailable, or held. No write, fallback or replay. Read current task sources explicitly.',
        );
    } finally {
      l.pending = false;
      if (l.alive) setBusy(false);
    }
  }
  let tasks: ReturnType<typeof inspectTaskReceiptContinuity> | undefined,
    selected: ReturnType<typeof inspectTaskReceiptTask> | undefined;
  try {
    if (continuity) tasks = inspectTaskReceiptContinuity(continuity);
  } catch {
    tasks = undefined;
  }
  try {
    if (tasks && continuity && selectedTask)
      selected = inspectTaskReceiptTask(continuity, selectedTask);
  } catch {
    // A valid current picker stays available; its missing exact selection never
    // becomes another task or enables the original correction controls.
    selected = undefined;
  }
  let data: ReturnType<typeof inspectTaskReceiptReconciliation> | undefined;
  try {
    if (review) data = inspectTaskReceiptReconciliation(review);
  } catch {
    data = undefined;
  }
  let observationAccess = true;
  try {
    if (continuity) assertTaskReceiptObservationAccess(continuity.receipt);
    if (review) assertTaskReceiptObservationAccess(review);
  } catch {
    observationAccess = false;
  }
  return (
    <section
      ref={section}
      className="task-receipt-actions"
      aria-label="Original task receipt actions"
    >
      <h3>Original correction receipt</h3>
      <p>
        Exact native evidence only. Approved task time is not posted labor or
        physical completion.
      </p>
      <button
        type="button"
        disabled={busy || !observationAccess}
        onClick={() => void reconcile()}
      >
        Reconcile original task receipt
      </button>
      <p role="status" aria-live="polite">
        {observationAccess
          ? message
          : 'Access unavailable. Retained private receipt detail is withheld; original custody and UNKNOWN remain unchanged.'}
      </p>
      <div
        className="task-receipt-actions__continuity"
        aria-label="Native technician task continuity"
      >
        <h4>Recorded technician task</h4>
        <button
          type="button"
          disabled={busy || !observationAccess}
          onClick={() => void taskAction('read')}
        >
          Read current task continuity
        </button>
        {tasks && (
          <label>
            Exact recorded task
            <select
              value={selectedTask}
              disabled={busy}
              onChange={(event) => {
                setSelectedTask(event.target.value);
                setVerification(
                  'Selected task changed; verify the original source explicitly.',
                );
              }}
            >
              <option value="">Choose exact task</option>
              {selectedTask &&
                !tasks.graph.graph.nodes.some(
                  (row) => row.id === selectedTask,
                ) && (
                  <option value={selectedTask} disabled>
                    Unavailable exact task · {selectedTask}
                  </option>
                )}
              {tasks.graph.graph.nodes.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.task} · {task.id}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && (
          <>
            <dl>
              <dt>Selected native entry</dt>
              <dd>{selected.task.id}</dd>
              <dt>Assigned technician</dt>
              <dd>
                {selected.assigned_worker.label} ·{' '}
                {selected.assigned_worker.worker_id}
              </dd>
              <dt>Recorded state</dt>
              <dd>{selected.task.review_state}</dd>
              <dt>Receipt relationship</dt>
              <dd>{selected.receipt_role}</dd>
              <dt>Original custody</dt>
              <dd>{selected.custody}</dd>
              <dt>Correction requirement</dt>
              <dd>{selected.correction_requirement}</dd>
              <dt>Durable receipt</dt>
              <dd>{selected.durable_receipt}</dd>
            </dl>
            <div className="task-receipt-actions__buttons">
              <button
                type="button"
                disabled={busy}
                onClick={() => void taskAction('verify')}
              >
                Verify original task source
              </button>
              {onContinue && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    selected.correction_requirement !== 'VERIFY_ORIGINAL_SOURCE'
                  }
                  onClick={() => void taskAction('open')}
                >
                  Open original task correction controls
                </button>
              )}
            </div>
            {selected.correction_requirement !== 'VERIFY_ORIGINAL_SOURCE' && (
              <p>
                Original controls unavailable for this exact task:{' '}
                {selected.correction_requirement}. Read-only verification and
                receipt reconciliation remain available; no replay is allowed.
              </p>
            )}
          </>
        )}
        <p role="status" aria-live="polite">
          {!observationAccess
            ? 'Access unavailable. Private task context is withheld; UNKNOWN never permits replay.'
            : continuity && !tasks
              ? 'Current task sources changed. Previous verification is withheld; explicitly reread the exact source. Original custody is unchanged.'
              : selectedTask && tasks && !selected
                ? 'Selected exact task is unavailable. No fallback was selected; choose another displayed ID explicitly.'
                : verification}
        </p>
        <p>
          Exact IDs remain selected. Technician availability is UNKNOWN;
          physical completion is UNVERIFIED. This review never records time or
          restores state.
        </p>
      </div>
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
