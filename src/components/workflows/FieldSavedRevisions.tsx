import { useEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  assertSavedRevisionAccess,
  assertSavedRevisionCurrent,
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  adoptSavedRevision,
  type SavedRevisionSelection,
} from '../../lib/workflows/saved-revision-runtime';
import {
  readFieldSavedRevision,
  compareFieldSavedRevisions,
  type FieldSavedEvidence,
  type FieldSavedSnapshot,
} from '../../lib/workflows/field-saved-revisions';
import { SharedRecordSearch } from './SharedRecordSearch';
import './field-saved-revisions.css';

export function FieldSavedRevisions(props: SavedRevisionPanelProps) {
  let admitted = false;
  if (
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    })
  ) {
    try {
      const capture = captureOperatingSources(props.sources, {
        enabled: true,
        confirmed: true,
      });
      admitted =
        props.selectedJobId === undefined ||
        capture.entries.some((e) => e.target.job_id === props.selectedJobId);
      capture.check();
    } catch {
      /* Withhold foreign, revoked or stale source sets. */
    }
  }
  const [context, setContext] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    admitted,
    epoch: 0,
  });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId ||
    context.admitted !== admitted
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      admitted,
      epoch: context.epoch + 1,
    });
    return null;
  }
  if (!admitted)
    return (
      <section
        className="field-saved-revisions"
        aria-label="Saved field revisions"
      >
        <h2>Saved field revisions</h2>
        <p role="status">
          Saved field review is off or exact current source access is
          unavailable.
        </p>
      </section>
    );
  if (!props.selectedJobId)
    return (
      <section
        className="field-saved-revisions"
        aria-label="Saved field revisions"
      >
        <h2>Saved field revisions</h2>
        <p>Select an exact authorized job using shared record search.</p>
        <SharedRecordSearch {...props} />
      </section>
    );
  return (
    <Review
      key={context.epoch}
      {...props}
      selectedJobId={props.selectedJobId}
    />
  );
}
function Review({
  sources,
  selectedJobId,
}: SavedRevisionPanelProps & { selectedJobId: string }) {
  const [snapshot, setSnapshot] = useState<FieldSavedSnapshot>(),
    [selection, setSelection] =
      useState<SavedRevisionSelection<FieldSavedEvidence>>(),
    [comparison, setComparison] =
      useState<ReturnType<typeof compareFieldSavedRevisions>>(),
    [confirmed, setConfirmed] = useState(false),
    [worker, setWorker] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Read the current saved work order and technician task evidence. No business records are changed.',
    );
  const gate = useRef({ enabled: true, confirmed: true }),
    live = useRef(true),
    pending = useRef(false),
    serial = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const g = gate.current,
      epoch = serial;
    live.current = true;
    g.enabled = true;
    g.confirmed = true;
    return () => {
      live.current = false;
      g.enabled = false;
      g.confirmed = false;
      epoch.current++;
    };
  }, []);
  let accessible = true,
    stale = false;
  if (snapshot)
    try {
      assertSavedRevisionAccess(snapshot);
    } catch {
      accessible = false;
    }
  if (snapshot && accessible)
    try {
      assertSavedRevisionCurrent(snapshot);
    } catch {
      stale = true;
    }
  async function read(updates: boolean) {
    if (pending.current || !accessible) return;
    pending.current = true;
    const token = ++serial.current;
    setBusy(true);
    setConfirmed(false);
    setComparison(undefined);
    try {
      if (updates && snapshot) assertSavedRevisionAccess(snapshot);
      const next = await readFieldSavedRevision(
        sources,
        selectedJobId,
        gate.current,
      );
      if (!live.current || token !== serial.current) return;
      assertSavedRevisionCurrent(next);
      if (updates && snapshot) {
        setComparison(compareFieldSavedRevisions(snapshot, next));
        setMessage(
          'Inspect exact saved differences. Adoption changes this review selection only.',
        );
      } else {
        setSelection(createSavedRevisionSelection(next));
        setSnapshot(next);
        setMessage(
          'Saved field evidence captured. Later updates require an explicit read and confirmation.',
        );
      }
      heading.current?.focus();
    } catch {
      if (live.current && token === serial.current)
        setMessage(
          'UNKNOWN — exact saved field evidence could not be verified. No action was replayed and no source was adopted.',
        );
    } finally {
      pending.current = false;
      if (live.current && token === serial.current) setBusy(false);
    }
  }
  function adopt() {
    if (!selection || !comparison || pending.current || !confirmed) return;
    try {
      const selected = readSavedRevisionSelection(selection);
      const next = adoptSavedRevision(
        selection,
        comparison.comparison,
        selected.generation,
        confirmed,
      );
      setSnapshot(next.snapshot as FieldSavedSnapshot);
      setComparison(undefined);
      setConfirmed(false);
      setMessage(
        'Confirmed saved field revision adopted for local review only. Original snapshot evidence remains unchanged.',
      );
      heading.current?.focus();
    } catch {
      setConfirmed(false);
      setMessage(
        'UNKNOWN — duplicate, stale or revoked selection. No saved revision was adopted.',
      );
    }
  }
  const evidence = snapshot?.evidence,
    tasks = evidence?.tasks.filter((t) => !worker || t.worker_id === worker);
  return (
    <section
      className="field-saved-revisions"
      aria-label="Saved field revisions"
      aria-busy={busy}
    >
      <h2 tabIndex={-1} ref={heading}>
        Saved field revisions
      </h2>
      <p>
        Local saved-source review · no task, time, dispatch or physical
        completion authority.
      </p>
      <p role="status">
        {!accessible
          ? 'Current source access unavailable. Historical details withheld.'
          : message}
      </p>
      {accessible && (
        <>
          <button
            type="button"
            disabled={busy || !!snapshot}
            onClick={() => void read(false)}
          >
            Read current saved field evidence
          </button>
          {snapshot && (
            <>
              <p>
                <strong>{evidence!.title}</strong> · {evidence!.customer.label}{' '}
                · {evidence!.property?.label}
              </p>
              <p className="field-saved-revisions-source">
                Job {snapshot.identity.job_id} · issued version{' '}
                {evidence!.source.issued_version_number} · recorded job revision{' '}
                {evidence!.source.job_revision}
              </p>
              <p>
                {stale
                  ? 'Saved source changed. This snapshot is historical until a new read is confirmed.'
                  : 'Current saved snapshot verified.'}{' '}
                Checklist completion records do not verify physical completion.
              </p>
              <label>
                Recorded technician
                <select
                  value={worker}
                  onChange={(e) => setWorker(e.target.value)}
                >
                  <option value="">All recorded technicians</option>
                  {evidence!.crew.map((w) => (
                    <option key={w.worker_id} value={w.worker_id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              <h3>Recorded visits and checklist revisions</h3>
              <div className="field-saved-revisions-grid">
                {evidence!.visits.map((v) => (
                  <article key={v.id}>
                    <strong>
                      {v.visited_on} · {v.status} · revision {v.revision}
                    </strong>
                    <p>{v.summary}</p>
                    <code>{v.id}</code>
                    <ul>
                      {v.checklist.map((c) => (
                        <li key={c.id}>
                          {c.label}:{' '}
                          {c.completed
                            ? 'recorded checked'
                            : 'recorded unchecked'}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
              <h3>Saved technician task evidence</h3>
              {tasks?.length ? (
                <ul>
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <strong>{t.task}</strong> · {t.kind} · {t.started_at} →{' '}
                      {t.ended_at ?? 'open'} · {t.review}
                      <br />
                      <code>{t.id}</code>
                      {t.corrects_id && (
                        <p>
                          Exact correction of <code>{t.corrects_id}</code>; no
                          inferred task match.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No recorded task entries in this available source view.</p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void read(true)}
              >
                Read saved field updates
              </button>
              {comparison && (
                <section aria-label="Field saved revision comparison">
                  <h3>Before and current saved evidence</h3>
                  <p>
                    {comparison.comparison.changed
                      ? 'Observed saved differences'
                      : 'No observed saved differences'}{' '}
                    · job revision {comparison.differences.job_revision.before}{' '}
                    → {comparison.differences.job_revision.current}
                  </p>
                  {(['visits', 'plans', 'tasks'] as const).map((kind) => (
                    <div key={kind}>
                      <h4>{kind}</h4>
                      {comparison.differences[kind].map((d) => (
                        <article key={d.id}>
                          <strong>{d.state}</strong> <code>{d.id}</code>
                          <div className="field-saved-revisions-grid">
                            <details>
                              <summary>Before recorded evidence</summary>
                              <pre>{JSON.stringify(d.before, null, 2)}</pre>
                            </details>
                            <details>
                              <summary>Current recorded evidence</summary>
                              <pre>{JSON.stringify(d.current, null, 2)}</pre>
                            </details>
                          </div>
                        </article>
                      ))}
                    </div>
                  ))}
                  <p>
                    Missing evidence never means repaired, completed, paid or
                    approved.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{' '}
                    I reviewed these exact saved revisions and confirm local
                    review adoption.
                  </label>
                  <button
                    type="button"
                    disabled={!confirmed || busy}
                    onClick={adopt}
                  >
                    Adopt saved field revision for review
                  </button>
                </section>
              )}
              <details>
                <summary>Snapshot identity and integrity</summary>
                <p className="field-saved-revisions-source">
                  SHA-256 {snapshot.sha256}
                </p>
                <p>
                  Exact entry/correction links only; no separate technician-task
                  revision engine. Same-tab review, not durable custody.
                </p>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
