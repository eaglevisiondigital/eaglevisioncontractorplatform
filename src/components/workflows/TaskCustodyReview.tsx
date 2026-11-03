import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { TaskCorrectionReview } from './TaskCorrectionReview';
import {
  readTaskCustodyReview,
  inspectTaskCustodyReview,
  taskCustodyDestination,
  type TaskCustodySnapshot,
} from '../../lib/workflows/task-custody-review';
import './task-custody-review.css';

type Props = SavedRevisionPanelProps & { onSourcesSaved?: () => void };
export function TaskCustodyReview(props: Props) {
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
  if (!allowed || !props.selectedJobId) return null;
  return (
    <section
      className="task-custody-review"
      aria-label="Task custody and correction comparison"
    >
      <Custody
        key={context.epoch}
        {...props}
        selectedJobId={props.selectedJobId}
      />
      <details>
        <summary>Original task correction controls</summary>
        <TaskCorrectionReview {...props} />
      </details>
    </section>
  );
}
function Custody({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [snapshot, setSnapshot] = useState<TaskCustodySnapshot>(),
    [message, setMessage] = useState(
      'Read the original correction receipt and canonical task records. Missing evidence never proves failed or completed work.',
    ),
    [busy, setBusy] = useState(false);
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false });
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    l.alive = true;
    g.enabled = true;
    return () => {
      l.alive = false;
      g.enabled = false;
    };
  }, []);
  async function read() {
    if (life.current.pending) return;
    life.current.pending = true;
    setBusy(true);
    setSnapshot(undefined);
    setMessage('Reading exact correction custody and canonical task evidence…');
    try {
      const next = await readTaskCustodyReview(
        sources,
        selectedJobId,
        gate.current,
      );
      if (life.current.alive) {
        setSnapshot(next);
        setMessage(
          'Read-only comparison captured. UNKNOWN remains held even when a record is observed.',
        );
      }
    } catch {
      if (life.current.alive)
        setMessage(
          'STALE / UNAVAILABLE — current source or staff access could not be verified. No record substituted and no command retried.',
        );
    } finally {
      life.current.pending = false;
      if (life.current.alive) setBusy(false);
    }
  }
  let data: ReturnType<typeof inspectTaskCustodyReview> | undefined;
  if (snapshot)
    try {
      data = inspectTaskCustodyReview(snapshot);
    } catch {
      /* Withhold stale evidence. */
    }
  async function continueReview() {
    if (!snapshot || !onContinue) return;
    try {
      const target = taskCustodyDestination(snapshot);
      await onContinue(target.job_id, target.step);
    } catch {
      setMessage('Exact field handoff unavailable. No action was executed.');
    }
  }
  return (
    <div className="task-custody-card">
      <h3>Original task → recorded correction</h3>
      <p>
        Internal synthetic review only. A corrected time record is not physical
        completion, dispatch or payroll execution.
      </p>
      <button type="button" disabled={busy} onClick={() => void read()}>
        Read exact task custody
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {snapshot && !data && (
        <p role="alert">
          STALE — captured task evidence is withheld. Read current evidence; no
          replay is available.
        </p>
      )}
      {data && (
        <>
          <dl>
            <dt>Custody state</dt>
            <dd>{data.status}</dd>
            <dt>Original receipt source</dt>
            <dd>
              {data.receipt.source_id ??
                'UNAVAILABLE — no original attempt recorded'}
            </dd>
            <dt>Recorded result ID</dt>
            <dd>{data.receipt.result_id ?? 'UNAVAILABLE'}</dd>
            <dt>Exact reconciliation</dt>
            <dd>
              {data.receipt.observed} · {data.receipt.state} · replay{' '}
              {data.replay}
            </dd>
            <dt>Job / property</dt>
            <dd>
              {snapshot!.identity.job_id} / {snapshot!.identity.location_id}
            </dd>
          </dl>
          <div className="task-custody-columns">
            {[
              ['Original immutable entry', data.original],
              ['Recorded correction entry', data.recorded],
            ].map(([label, value]) => {
              const row = typeof value === 'object' ? value : null;
              return (
                <article key={String(label)} aria-label={String(label)}>
                  <h4>{String(label)}</h4>
                  {row ? (
                    <dl>
                      <dt>Entry ID / corrects ID</dt>
                      <dd>
                        {row.id} / {row.corrects_id ?? 'Original entry'}
                      </dd>
                      <dt>Task</dt>
                      <dd>{row.task}</dd>
                      <dt>Recorded time</dt>
                      <dd>
                        {row.started_at} → {row.ended_at ?? 'Open; unavailable'}
                      </dd>
                      <dt>Submitted / internal review</dt>
                      <dd>
                        {String(row.submitted)} / {row.review ?? 'UNAVAILABLE'}
                      </dd>
                    </dl>
                  ) : (
                    <p>
                      UNAVAILABLE — exact source evidence missing. No
                      alternative task selected.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <ul aria-label="Exact task field differences">
            {data.differences.map((d) => (
              <li key={d.field}>
                <strong>
                  {d.field}: {d.comparison}
                </strong>{' '}
                — {String(d.original ?? 'UNAVAILABLE')} →{' '}
                {String(d.recorded ?? 'UNAVAILABLE')}
              </li>
            ))}
          </ul>
          <details>
            <summary>
              Available exact-job task identities ({data.available_tasks.length}
              )
            </summary>
            <ul>
              {data.available_tasks.map((r) => (
                <li key={r.id}>
                  {r.id} · {r.task} · corrects {r.corrects_id ?? 'none'}
                </li>
              ))}
            </ul>
            <p>
              Available assigned-worker records only; historical completeness is
              not asserted.
            </p>
          </details>
          {onContinue && (
            <button type="button" onClick={() => void continueReview()}>
              Continue exact field review
            </button>
          )}
        </>
      )}
    </div>
  );
}
