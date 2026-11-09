import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { readOfflineCrewContext } from './offline-crew-context';
export function OfflineCrewContext({ sources }: { sources: LocalJourney }) {
  const signature = JSON.stringify(sources.target);
  const [binding, bind] = useState({ sources, signature, generation: 0 });
  if (binding.sources !== sources || binding.signature !== signature) {
    bind({ sources, signature, generation: binding.generation + 1 });
    return null;
  }
  return <Review key={binding.generation} sources={sources} />;
}
function Review({ sources }: { sources: LocalJourney }) {
  const [note, setNote] = useState(''),
    [view, setView] =
      useState<Awaited<ReturnType<typeof readOfflineCrewContext>>>(),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState(false),
    [shown, show] = useState(false);
  const life = useRef(true),
    hold = useRef(false);
  useEffect(() => {
    life.current = true;
    return () => {
      life.current = false;
    };
  }, []);
  let current = view;
  try {
    current?.check();
  } catch {
    current = undefined;
  }
  async function read() {
    if (hold.current) return;
    hold.current = true;
    setAttempted(true);
    setBusy(true);
    try {
      const result = await readOfflineCrewContext(sources);
      result.check();
      if (life.current) {
        setView(result);
        show(true);
      }
    } catch {
      if (life.current) setError(true);
    } finally {
      if (life.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Offline crew work-order context">
      <h3>Offline preparation · exact assigned work</h3>
      <label>
        Unsaved offline observations
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p>
        These observations exist only in this open tab. Not saved, sent or
        acknowledged; reload loses them. Server acknowledgment and
        synchronization outcome UNKNOWN.
      </p>
      <button disabled={busy || attempted} onClick={() => void read()}>
        Review exact offline work-order context
      </button>
      {(error || (view && !current)) && (
        <p role="alert">
          UNKNOWN — original source changed or authorization was withdrawn.
          Notes remain unsaved; no replay, replacement or conflict resolution is
          permitted.
        </p>
      )}
      {current && (
        <>
          <p>
            Job {current.reference.job_id} · issued version{' '}
            {current.reference.issued_version_id} · saved revision{' '}
            {current.reference.saved_lock_revision}
          </p>
          <p>
            Visit {current.work.reference.visit_id} · plan{' '}
            {current.work.reference.plan_id} · crew context {sources.worker_id}
          </p>
          <p>
            Pending or conflicting server commands: UNKNOWN; this read creates
            none. Recorded visit status: {current.work.row.status}. A recorded
            visit does not prove completed work.
          </p>
          <ul>
            {current.source.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <button
            aria-expanded={shown}
            onClick={() => {
              try {
                current.check();
                show(!shown);
              } catch {
                setError(true);
              }
            }}
          >
            {shown
              ? 'Hide recorded work order'
              : 'Return to exact recorded work order'}
          </button>
          <div hidden={!shown}>
            <h4>Original issued work-order scope</h4>
            <ul>
              {current.issued.snapshot.estimate.lines
                .filter((l) => l.included)
                .map((l) => (
                  <li key={l.id}>
                    {l.description} · recorded scope {l.quantity_milli / 1000}{' '}
                    {l.unit}
                  </li>
                ))}
            </ul>
            <button
              onClick={() => {
                try {
                  current.check();
                  document.getElementById('journey-field')?.focus();
                } catch {
                  setError(true);
                }
              }}
            >
              Return to existing crew workspace
            </button>
          </div>
          <p>
            Original retained source review only. No offline request was
            admitted or retried; no durable ACK, delivery, dispatch or recovery
            acceptance is implied.
          </p>
        </>
      )}
    </section>
  );
}
