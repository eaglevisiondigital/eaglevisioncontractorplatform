import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  readTaskRevisionConsistency,
  inspectTaskRevisionConsistency,
  selectTaskRevisionLineage,
  taskRevisionDestination,
  type TaskRevisionSnapshot,
} from '../../lib/workflows/task-revision-consistency';
import { TaskCustodyReview } from './TaskCustodyReview';
import './task-revision-consistency.css';
type Props = SavedRevisionPanelProps & { onSourcesSaved?: () => void };
export function TaskRevisionConsistency(props: Props) {
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
      className="task-revision-consistency"
      aria-label="Task revision consistency"
    >
      <Graph
        key={context.epoch}
        {...props}
        selectedJobId={props.selectedJobId}
      />
      <TaskCustodyReview {...props} />
    </section>
  );
}
function Graph({
  sources,
  selectedJobId,
  onContinue,
}: Props & { selectedJobId: string }) {
  const [snapshot, setSnapshot] = useState<TaskRevisionSnapshot>(),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Choose an exact recorded entry after reading its correction graph. No newest-record substitution.',
    ),
    life = useRef({ alive: true, pending: false }),
    gate = useRef({ enabled: true, confirmed: true });
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
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
    try {
      const next = await readTaskRevisionConsistency(
        sources,
        selectedJobId,
        gate.current,
      );
      if (life.current.alive) {
        setSnapshot(next);
        setMessage(
          'Current graph read. Select an exact entry; recorded successors do not prove physical completion or payroll authority.',
        );
      }
    } catch {
      if (life.current.alive)
        setMessage(
          'STALE / UNAVAILABLE — exact current work-order, task or staff evidence could not be verified. No replay.',
        );
    } finally {
      life.current.pending = false;
      if (life.current.alive) setBusy(false);
    }
  }
  let data: ReturnType<typeof inspectTaskRevisionConsistency> | undefined,
    lineage: ReturnType<typeof selectTaskRevisionLineage> | undefined;
  if (snapshot)
    try {
      data = inspectTaskRevisionConsistency(snapshot);
      if (selected) lineage = selectTaskRevisionLineage(snapshot, selected);
    } catch {
      if (!data) lineage = undefined;
    }
  async function open() {
    if (!snapshot || !selected || !onContinue) return;
    try {
      const target = taskRevisionDestination(snapshot, selected);
      await onContinue(target.job_id, target.step);
    } catch {
      setMessage(
        'Exact field source handoff denied. Read current evidence; no source substituted.',
      );
    }
  }
  return (
    <div className="task-revision-panel">
      <h3>Task revision graph</h3>
      <p>
        Read-only internal consistency review. Original correction controls and
        command custody remain authoritative.
      </p>
      <button type="button" disabled={busy} onClick={() => void read()}>
        Read task revision graph
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {snapshot && !data && (
        <p role="alert">STALE — graph withheld until a current read.</p>
      )}
      {data && (
        <>
          <dl>
            <dt>Exact work order / saved job revision</dt>
            <dd>
              {data.work_order.source.job_id} /{' '}
              {data.work_order.source.job_revision}
            </dd>
            <dt>Issued estimate version</dt>
            <dd>{data.work_order.source.issued_version_id}</dd>
            <dt>Graph / original receipt</dt>
            <dd>
              {data.graph.consistency} / {data.receipt_consistency} ·{' '}
              {data.receipt.state} · {data.receipt.observed}
            </dd>
            <dt>Original source → result</dt>
            <dd>
              {data.receipt.source_id ?? 'UNAVAILABLE'} →{' '}
              {data.receipt.result_id ?? 'UNAVAILABLE'}
            </dd>
          </dl>
          <label>
            Exact recorded task
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose an exact entry ID</option>
              {data.graph.nodes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.task} · {r.id}
                </option>
              ))}
            </select>
          </label>
          {selected && !lineage && (
            <p role="alert">
              Selected ID is unavailable. Choose explicitly; no fallback.
            </p>
          )}
          {lineage && (
            <section aria-label="Selected task lineage">
              <h4>Selected task lineage</h4>
              <p>
                {lineage.selected_id} · {lineage.receipt_link}; no automatic
                winning record.
              </p>
              <ol>
                {lineage.nodes.map((r) => (
                  <li key={r.id}>
                    <strong>{r.task}</strong>
                    <p>
                      Entry {r.id} · corrects {r.predecessor_id ?? 'none'} ·
                      successors {r.successor_ids.join(', ') || 'none observed'}
                    </p>
                    <p>
                      {r.review_state} · {r.linkage}
                    </p>
                  </li>
                ))}
              </ol>
              {lineage.issues.length ? (
                <ul aria-label="Task graph conflicts">
                  {lineage.issues.map((i, n) => (
                    <li key={n}>
                      {i.code} · {i.entry_id} · {i.related_ids.join(', ')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No conflict observed in the available exact links. Complete
                  history is not asserted.
                </p>
              )}
              {onContinue && (
                <button type="button" onClick={() => void open()}>
                  Open exact task field review
                </button>
              )}
            </section>
          )}
          <details>
            <summary>Current saved visit and plan revisions</summary>
            <ul>
              {data.work_order.visits.map((v) => (
                <li key={v.id}>
                  {v.id} / revision {v.revision} · {v.status} · {v.phase}
                </li>
              ))}
            </ul>
            <ul>
              {data.work_order.plans.map((p) => (
                <li key={p.id}>
                  Plan {p.id} / revision {p.revision}
                </li>
              ))}
            </ul>
          </details>
          <p>
            UNKNOWN remains held. No graph selection repairs an acknowledgment,
            dispatches work or authorizes payroll.
          </p>
        </>
      )}
    </div>
  );
}
