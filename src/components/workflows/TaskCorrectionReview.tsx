import { useLayoutEffect, useRef, useState } from 'react';
import { FieldSavedRevisions } from './FieldSavedRevisions';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  readTaskCorrectionReview,
  assertTaskCorrectionDisplayCurrent,
  parseTaskCorrectionInput,
  saveTaskCorrectionReview,
  reconcileTaskCorrectionReview,
  selectTaskCorrectionSource,
  type TaskCorrectionReview as Review,
} from '../../lib/workflows/task-correction-review';
import './task-correction-review.css';

export type TaskCorrectionReviewProps = SavedRevisionPanelProps & {
  onSourcesSaved?: () => void;
};
export function TaskCorrectionReview(props: TaskCorrectionReviewProps) {
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
  return (
    <section
      className="task-correction-review"
      aria-label="Task correction review"
    >
      {allowed && props.selectedJobId && (
        <CorrectionForm
          key={context.epoch}
          {...props}
          selectedJobId={props.selectedJobId}
        />
      )}
      <details>
        <summary>Saved field source review</summary>
        <FieldSavedRevisions {...props} />
      </details>
    </section>
  );
}
function CorrectionForm({
  sources,
  selectedJobId,
  onSourcesSaved,
}: TaskCorrectionReviewProps & { selectedJobId: string }) {
  const [review, setReview] = useState<Review>(),
    [task, setTask] = useState(''),
    [started, setStarted] = useState(''),
    [ended, setEnded] = useState(''),
    [billable, setBillable] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Load the exact approved, closed original task before preparing an append-only correction.',
    );
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    g.confirmed = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      g.confirmed = false;
      l.alive = false;
      l.serial++;
    };
  }, []);
  async function load() {
    const l = life.current;
    if (l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setConfirmed(false);
    setMessage(
      'Loading the exact current task and native locked-period status…',
    );
    try {
      const next = await readTaskCorrectionReview(
        sources,
        selectedJobId,
        gate.current,
      );
      if (!l.alive || token !== l.serial) return;
      setReview(next);
      setTask(next.source.task);
      setStarted(next.source.started_at);
      setEnded(next.source.ended_at);
      setBillable(next.source.billable);
      setMessage(
        next.source.can_edit
          ? 'Original source loaded. Review the exact task and time changes, then explicitly confirm.'
          : 'Original correction is held, locked or already used. No save is available.',
      );
      heading.current?.focus();
    } catch {
      if (l.alive && token === l.serial)
        setMessage(
          'UNKNOWN — no eligible exact source is available. Record and review time through the existing workflow first. No replacement or retry is authorized.',
        );
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  const input = review
    ? {
        source_entry_id: review.source.source_entry_id,
        task,
        started_at: started,
        ended_at: ended,
        billable,
      }
    : undefined;
  let current = false,
    valid = false;
  if (review)
    try {
      current = assertTaskCorrectionDisplayCurrent(review).can_edit;
      parseTaskCorrectionInput(
        input,
        review.source,
        review.view.identity.job_id,
      );
      valid = true;
    } catch {
      /* Stale content and invalid edits never enable an original command. */
    }
  async function select(sourceEntryId: string) {
    const l = life.current;
    if (!review || l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setConfirmed(false);
    setMessage('Loading only the exact requested original entry…');
    try {
      const next = await selectTaskCorrectionSource(review, sourceEntryId);
      if (!l.alive || token !== l.serial) return;
      setReview(next);
      setTask(next.source.task);
      setStarted(next.source.started_at);
      setEnded(next.source.ended_at);
      setBillable(next.source.billable);
      setMessage(
        'Exact requested original entry loaded. Review and confirm its correction explicitly.',
      );
    } catch {
      if (l.alive && token === l.serial) {
        setReview(undefined);
        setMessage(
          'UNKNOWN — exact requested task source unavailable. No other entry was substituted.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  async function save() {
    const l = life.current;
    if (!review || !input || !confirmed || !current || !valid || l.pending)
      return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setMessage(
      'Reviewing current source guards for one exact synthetic correction…',
    );
    try {
      const result = await saveTaskCorrectionReview(review, input, true);
      if (result.status !== 'SYNTHETIC_SOURCE_SAVED')
        throw Error('Exact known source save acknowledgment required');
      if (l.alive && token === l.serial) {
        setConfirmed(false);
        setMessage(
          'SYNTHETIC_SOURCE_SAVED — a correction links the exact original entry; original history remains immutable. No physical completion or financial execution.',
        );
        try {
          onSourcesSaved?.();
        } catch {
          /* Presentation refresh never replays the command. */
        }
      }
    } catch {
      if (l.alive && token === l.serial) {
        setConfirmed(false);
        setMessage(
          'UNKNOWN — a stale, denied or uncertain result must use exact read-only reconciliation. No retry or new entry ID.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  async function reconcile() {
    const l = life.current;
    if (!review || l.pending) return;
    l.pending = true;
    const token = ++l.serial;
    setBusy(true);
    setMessage(
      'Reading the exact original correction acknowledgment without replay…',
    );
    try {
      const result = await reconcileTaskCorrectionReview(review);
      if (l.alive && token === l.serial)
        setMessage(
          `${result.state} — ${result.observed}. Exact read-only correction evidence only. The original hold is retained; no retry is enabled.`,
        );
    } catch {
      if (l.alive && token === l.serial)
        setMessage(
          'UNKNOWN — exact correction acknowledgment cannot be proven. No retry, replacement or replay.',
        );
    } finally {
      l.pending = false;
      if (l.alive && token === l.serial) setBusy(false);
    }
  }
  return (
    <section
      className="task-correction-form"
      aria-label="Append exact task correction"
      aria-busy={busy}
    >
      <h3 ref={heading} tabIndex={-1}>
        Append exact task correction
      </h3>
      <p>
        Changes append through the existing time engine and exact{' '}
        <code>corrects_id</code>. Explicit confirmation includes internal
        synthetic submission and review approval. It never overwrites the
        original task, dispatches a technician or executes payroll.
      </p>
      <button
        type="button"
        disabled={busy || Boolean(review)}
        onClick={() => void load()}
      >
        Load current approved task
      </button>
      <p role="status">{message}</p>
      {review && current && (
        <p>
          Customer <code>{review.view.identity.customer_id}</code> · property{' '}
          <code>{review.view.identity.location_id}</code> · job{' '}
          <code>{review.view.identity.job_id}</code> · source entry{' '}
          <code>{review.source.source_entry_id}</code>
        </p>
      )}
      {review && !current && (
        <p role="alert">
          Source changed, eligibility is unavailable or original command is
          held. Editable evidence is withheld.
        </p>
      )}
      {review && current && (
        <>
          <label>
            Exact eligible original entry
            <select
              value={review.source.source_entry_id}
              disabled={busy}
              onChange={(e) => void select(e.target.value)}
            >
              {review.source.eligible_entries.map((entry) => (
                <option
                  key={entry.source_entry_id}
                  value={entry.source_entry_id}
                >
                  {entry.task} · {entry.started_at} · {entry.source_entry_id}
                </option>
              ))}
            </select>
          </label>
          <dl>
            <dt>Original task</dt>
            <dd>{review.source.task}</dd>
            <dt>Original time with explicit offset</dt>
            <dd>
              {review.source.started_at} → {review.source.ended_at}
            </dd>
          </dl>
          <label>
            Corrected task description
            <textarea
              maxLength={2000}
              value={task}
              disabled={busy}
              onChange={(e) => {
                setTask(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <div className="task-correction-times">
            <label>
              Corrected start (ISO with timezone)
              <input
                type="text"
                value={started}
                disabled={busy}
                onChange={(e) => {
                  setStarted(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <label>
              Corrected end (ISO with timezone)
              <input
                type="text"
                value={ended}
                disabled={busy}
                onChange={(e) => {
                  setEnded(e.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
          </div>
          <label className="task-correction-check">
            <input
              type="checkbox"
              checked={billable}
              disabled={busy}
              onChange={(e) => {
                setBillable(e.target.checked);
                setConfirmed(false);
              }}
            />
            Recorded billable time classification only; no invoice or charge
          </label>
          {!valid && (
            <p role="alert">
              Use a nonempty task and explicit offset timestamps with a positive
              interval of at most 18 hours. Native overlap and locked-period
              rules still apply.
            </p>
          )}
          <label className="task-correction-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this exact original task and confirm the local
            append-only correction, internal synthetic submission and review
            approval.
          </label>
          <button
            type="button"
            disabled={busy || !confirmed || !valid}
            onClick={() => void save()}
          >
            Save exact task correction
          </button>
        </>
      )}
      {review && (
        <button type="button" disabled={busy} onClick={() => void reconcile()}>
          Reconcile exact task correction
        </button>
      )}
    </section>
  );
}
