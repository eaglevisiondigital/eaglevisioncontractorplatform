import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { tradeEditions } from '../../lib/program/trade-editions';
import { readNetworkJobReview } from './network-job-review';
export function NetworkJobReview({ sources }: { sources: LocalJourney }) {
  const signature = JSON.stringify(sources.target);
  const [binding, bind] = useState({ sources, signature, generation: 0 });
  if (binding.sources !== sources || binding.signature !== signature) {
    bind({ sources, signature, generation: binding.generation + 1 });
    return null;
  }
  return <Review key={binding.generation} sources={sources} />;
}
function Review({ sources }: { sources: LocalJourney }) {
  const [view, setView] =
      useState<Awaited<ReturnType<typeof readNetworkJobReview>>>(),
    [query, setQuery] = useState(''),
    [note, setNote] = useState(''),
    [selected, select] = useState(''),
    [trade, setTrade] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [attempted, setAttempted] = useState(false);
  const live = useRef(true),
    hold = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  let current = view;
  try {
    current?.check();
  } catch {
    current = undefined;
  }
  const profile = current?.profiles.find((p) => p.id === selected);
  async function read() {
    if (busy || hold.current) return;
    hold.current = true;
    setAttempted(true);
    setBusy(true);
    try {
      const result = await readNetworkJobReview(sources);
      result.check();
      if (live.current) setView(result);
    } catch {
      if (live.current) setError(true);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  function navigate() {
    try {
      if (!current) throw Error();
      current.check();
      document.getElementById('journey-field')?.focus();
    } catch {
      setError(true);
    }
  }
  return (
    <section aria-label="Network and exact subcontractor requirements">
      <h3>Contractor Network · existing job and contractor references</h3>
      <p>
        Network partner discovery NOT PERFORMED. Existing internal contractor
        profiles are references only, not discovered or approved partners.
        Capabilities, licensing, insurance, independent qualifications and
        actual availability UNKNOWN.
      </p>
      <label>
        Partner review trade context
        <select value={trade} onChange={(e) => setTrade(e.target.value)}>
          <option value="">Trade suitability UNKNOWN</option>
          {tradeEditions.map((t) => (
            <option key={t} value={t}>
              {t.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <p>
        Trade is an unsaved human review context; it does not establish a
        recorded partner capability or match.
      </p>
      <label>
        Filter existing contractor references
        <input
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        Unfinished partner review notes
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button disabled={busy || attempted} onClick={() => void read()}>
        Review exact job and contractor references
      </button>
      {(error || (view && !current)) && (
        <p role="alert">
          UNKNOWN — source, profile or authorization changed; private review
          withheld. Notes remain unsaved.
        </p>
      )}
      {current && (
        <>
          <p>
            Exact job {sources.target.job_id} · customer{' '}
            {sources.target.customer_id} · issued version{' '}
            {sources.target.version_id}
          </p>
          <h4>Documented labor/service requirements</h4>
          <ul>
            {current.requirements.map((l) => (
              <li key={l.id}>
                {l.description} · scope {l.id} · recorded estimate quantity{' '}
                {l.quantity_milli / 1000} {l.unit}
              </li>
            ))}
          </ul>
          {!current.requirements.length && (
            <p>
              Documented subcontractor scope UNKNOWN; no included labor/service
              lines.
            </p>
          )}
          {!current.profiles.length && (
            <p>
              No recorded contractor profiles. Partner capability comparison
              UNKNOWN; no synthetic partner or match is invented.
            </p>
          )}
          <label>
            Existing internal contractor reference
            <select value={selected} onChange={(e) => select(e.target.value)}>
              <option value="">Choose an exact recorded reference</option>
              {current.profiles
                .filter((p) =>
                  p.display_name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} · {p.id}
                  </option>
                ))}
            </select>
          </label>
          {profile && (
            <>
              <h4>Recorded profile · not a verified partner</h4>
              <p>
                {profile.display_name} · exact profile {profile.id} · tenant{' '}
                {profile.organization_id} · classification {profile.worker_type}{' '}
                · recorded active {String(profile.active)}
              </p>
              <p>
                Recorded capabilities: UNKNOWN (not in this source contract).
                Licensing / insurance / suitability / availability / approval:
                UNKNOWN. No relationship to this job is inferred.
              </p>
            </>
          )}
          <button onClick={navigate}>Open exact job and crew review</button>
          <p>
            Internal review only; no invitation, assignment, contract, dispatch,
            payment or external sharing.
          </p>
        </>
      )}
    </section>
  );
}
