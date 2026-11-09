import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { emptyHistoryFilters } from '../../domain/property/history-search';
import { readStormPropertyHistory } from './storm-property-history';
type Props = {
  sources: LocalJourney;
  onPassport(id: string, version: number): void;
};
export function StormPropertyHistory({ sources, onPassport }: Props) {
  const signature = JSON.stringify(sources.target);
  const [binding, bind] = useState({ sources, signature, generation: 0 });
  if (binding.sources !== sources || binding.signature !== signature) {
    bind({ sources, signature, generation: binding.generation + 1 });
    return null;
  }
  return (
    <Review
      key={binding.generation}
      sources={sources}
      onPassport={onPassport}
    />
  );
}
function Review({ sources, onPassport }: Props) {
  const [view, setView] =
      useState<Awaited<ReturnType<typeof readStormPropertyHistory>>>(),
    [note, setNote] = useState(''),
    [query, setQuery] = useState(''),
    [selected, select] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const life = useRef(true);
  useEffect(() => {
    life.current = true;
    return () => {
      life.current = false;
    };
  }, []);
  let current = view,
    history;
  try {
    history = current?.search({ ...emptyHistoryFilters, query });
  } catch {
    current = undefined;
  }
  const matches = history?.reports.filter(
    (r) => JSON.stringify([r.id, r.version]) === selected,
  );
  const report = matches?.length === 1 ? matches[0] : undefined;
  async function read() {
    if (busy || view) return;
    setBusy(true);
    try {
      const value = await readStormPropertyHistory(sources);
      value.check();
      if (life.current) setView(value);
    } catch {
      if (life.current) setError(true);
    } finally {
      if (life.current) setBusy(false);
    }
  }
  function navigate(id: string) {
    try {
      if (!current || !report) throw Error();
      current.check();
      if (id === 'journey-customer') onPassport(report.id, report.version);
      current.check();
      document.getElementById(id)?.focus();
    } catch {
      setError(true);
    }
  }
  return (
    <section aria-label="Storm observations and property history">
      <h3>Storm Mode · reported conditions and inspection evidence</h3>
      <label>
        Unfinished storm review notes
        <textarea
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p>
        Unsaved reported-condition notes; reporter identity and
        customer-reported damage are UNVERIFIED. No storm incident, date or
        cause is established by this text.
      </p>
      <label>
        Search available inspection evidence
        <input
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button disabled={busy || !!view} onClick={() => void read()}>
        Review exact storm property history
      </button>
      {(error || (view && !current)) && (
        <p role="alert">
          UNKNOWN — source or authorization changed. Previous evidence is
          withheld; notes remain unsaved.
        </p>
      )}
      {current && history && (
        <>
          <p>
            Exact property {current.boundary.location_id} · customer{' '}
            {current.boundary.customer_id} · job {current.work.scope.jobId}
          </p>
          <p>
            {history.reports.length} matching / {history.available} available
            published versions. Complete damage assessment UNKNOWN; history
            availability does not prove complete history.
          </p>
          <label>
            Published inspection version
            <select value={selected} onChange={(e) => select(e.target.value)}>
              <option value="">Choose exact published evidence</option>
              {history.reports.map((r) => (
                <option
                  key={JSON.stringify([r.id, r.version])}
                  value={JSON.stringify([r.id, r.version])}
                >
                  {r.snapshot.visited_on} · {r.id} · version {r.version}
                </option>
              ))}
            </select>
          </label>
          {!history.reports.length && (
            <p>
              Matching published evidence UNKNOWN. No replacement property or
              report is selected.
            </p>
          )}
          {report && (
            <>
              <h4>Documented inspection findings</h4>
              <p>{report.snapshot.summary}</p>
              <ul>
                {report.snapshot.findings.map((f, i) => (
                  <li key={i}>
                    {f.description} · recorded location {f.location}. Suggested
                    follow-up: {f.recommendation}. Storm attribution UNKNOWN;
                    verified repair completion UNVERIFIED.
                  </li>
                ))}
              </ul>
              <button onClick={() => navigate('journey-customer')}>
                Open exact property Passport review
              </button>
              <button onClick={() => navigate('journey-field')}>
                Open exact job and Field review
              </button>
            </>
          )}
          <ul>
            {current.requirements.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <p>
            Evidence review only. No repair authorization, insurance submission,
            new job, dispatch or customer notification.
          </p>
        </>
      )}
    </section>
  );
}
