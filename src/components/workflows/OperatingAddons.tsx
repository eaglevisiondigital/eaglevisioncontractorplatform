import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  operatingAddonKinds,
  prepareOperatingAddon,
  reconcileOperatingAddon,
  type OperatingAddonReview,
  type OperatingAddonInput,
} from '../../lib/workflows/operating-addons';
import './operating-addons.css';
export function OperatingAddons({
  sources,
  enabled = false,
}: {
  sources: OperatingSources;
  enabled?: boolean;
}) {
  let signature = 'OFF',
    check: (() => void) | null = null;
  if (enabled)
    try {
      const c = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      signature = JSON.stringify(c.entries.map((e) => e.target));
      check = c.check;
    } catch {
      signature = 'UNAVAILABLE';
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    signature,
    check,
    generation: 0,
  });
  let changed = false;
  try {
    binding.check?.();
  } catch {
    changed = true;
  }
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.signature !== signature ||
    changed
  ) {
    bind({
      sources,
      enabled,
      signature,
      check,
      generation: binding.generation + 1,
    });
    return null;
  }
  return enabled && signature !== 'UNAVAILABLE' ? (
    <AddonForm key={binding.generation} sources={sources} enabled />
  ) : (
    <section
      className="operating-addons"
      aria-label="Source-bound advanced feature reviews"
    >
      <h2>Advanced source review is off or unavailable</h2>
      <p>Prior source evidence is withheld.</p>
      <button disabled>Prepare selected addon review</button>
    </section>
  );
}
function AddonForm({
  sources,
  enabled,
}: {
  sources: OperatingSources;
  enabled: boolean;
}) {
  const [job, setJob] = useState(sources.entries[0]?.target.job_id ?? ''),
    [kind, setKind] = useState<OperatingAddonInput['kind']>('offline'),
    [note, setNote] = useState(''),
    [date, setDate] = useState('2026-12-28'),
    [priority, setPriority] =
      useState<OperatingAddonInput['manual_priority']>('normal'),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [view, setView] = useState<OperatingAddonReview | null>(null),
    [status, setStatus] = useState('');
  const generation = useRef(0),
    live = useRef<{ enabled: boolean; confirmed: boolean } | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (live.current) live.current.confirmed = false;
    },
    [sources],
  );
  function invalidate() {
    generation.current++;
    if (live.current) live.current.confirmed = false;
    setConfirmed(false);
    setBusy(false);
    setView(null);
    setStatus('');
    setError('');
  }
  async function prepare() {
    if (!enabled || !confirmed || busy) return;
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    live.current = gate;
    setBusy(true);
    setView(null);
    setError('');
    try {
      const result = await prepareOperatingAddon(
        sources,
        { job_id: job, kind, note, review_on: date, manual_priority: priority },
        gate,
      );
      if (token === generation.current && gate.confirmed) setView(result);
    } catch {
      if (token === generation.current)
        setError(
          'Source unavailable or outcome UNKNOWN. This job/addon attempt cannot be replayed or replaced in this session.',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  return (
    <section
      className="operating-addons"
      aria-label="Source-bound advanced feature reviews"
    >
      <header>
        <h2>Advanced tools · exact-source staff review</h2>
        <p>
          Existing addon engines, one selected canonical job. No offline
          persistence, microphone, model, phone provider, external accounting,
          partner discovery or sending.
        </p>
      </header>
      <label>
        Addon job
        <select
          value={job}
          onChange={(e) => {
            invalidate();
            setBusy(false);
            setJob(e.target.value);
          }}
        >
          {sources.entries.map((e, i) => (
            <option key={e.target.job_id} value={e.target.job_id ?? ''}>
              Job {i + 1} · {e.target.job_id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Review tool
        <select
          value={kind}
          onChange={(e) => {
            invalidate();
            setBusy(false);
            setKind(e.target.value as OperatingAddonInput['kind']);
          }}
        >
          {operatingAddonKinds.map((k) => (
            <option key={k} value={k}>
              {k.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Review date
        <input
          type="date"
          value={date}
          onChange={(e) => {
            invalidate();
            setDate(e.target.value);
          }}
        />
      </label>
      <label>
        Explicit human review priority
        <select
          value={priority}
          onChange={(e) => {
            invalidate();
            setPriority(
              e.target.value as OperatingAddonInput['manual_priority'],
            );
          }}
        >
          {['low', 'normal', 'high', 'urgent'].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Literal synthetic review input
        <textarea
          value={note}
          maxLength={2000}
          onChange={(e) => {
            invalidate();
            setBusy(false);
            setNote(e.target.value);
          }}
        />
      </label>
      <label className="oa-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            if (!e.target.checked) invalidate();
            setConfirmed(e.target.checked);
          }}
        />
        I confirm this exact local addon review; no execution or customer
        communication is authorized.
      </label>
      <button
        disabled={!enabled || !confirmed || !note.trim() || busy}
        onClick={() => void prepare()}
      >
        Prepare selected addon review
      </button>
      {busy && <p role="status">Reviewing exact existing sources…</p>}
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <h3>Immutable staff review · execution blocked</h3>
          <p>
            Kind: {view.snapshot.kind} · Job: {view.snapshot.target.job_id}
          </p>
          <p>Integrity: {view.sha256}</p>
          <details>
            <summary>Inspect exact source-bound evidence</summary>
            <pre>{JSON.stringify(view.snapshot.evidence, null, 2)}</pre>
          </details>
          <button
            onClick={() => {
              const token = generation.current;
              void reconcileOperatingAddon(view).then((value) => {
                if (token === generation.current) setStatus(value);
              });
            }}
          >
            Reconcile this exact addon review
          </button>
          <p role="status">{status}</p>
        </>
      )}
    </section>
  );
}
