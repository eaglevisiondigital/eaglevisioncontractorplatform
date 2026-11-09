import { useEffect, useRef, useState } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import type { TradeEditionReview } from '../../lib/program/trade-editions';
import { readTradeJobContinuity } from './trade-job-continuity';
type Props = {
  sources: LocalJourney;
  trade: TradeEditionReview | null;
  admitted(): boolean;
};
export function TradeJobContinuity(props: Props) {
  const signature = JSON.stringify(props.sources.target);
  const [binding, bind] = useState({
    sources: props.sources,
    signature,
    generation: 0,
  });
  if (binding.sources !== props.sources || binding.signature !== signature) {
    bind({
      sources: props.sources,
      signature,
      generation: binding.generation + 1,
    });
    return null;
  }
  return <Review key={binding.generation} {...props} />;
}
function Review({ sources, trade, admitted }: Props) {
  const [note, setNote] = useState(''),
    [query, setQuery] = useState(''),
    [view, setView] =
      useState<Awaited<ReturnType<typeof readTradeJobContinuity>>>(),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState(false);
  const live = useRef(true),
    hold = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  let current = view?.trade === trade ? view : undefined;
  try {
    current?.check();
  } catch {
    current = undefined;
  }
  async function read() {
    if (!trade || busy || hold.current) return;
    hold.current = true;
    setAttempted(true);
    setBusy(true);
    try {
      const value = await readTradeJobContinuity(sources, trade, admitted);
      value.check();
      if (live.current) setView(value);
    } catch {
      if (live.current) setError(true);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function navigate(id: string) {
    if (!current || busy) return;
    const original = current;
    setBusy(true);
    try {
      await original.inspect();
      if (!live.current) throw Error();
      original.check();
      document.getElementById(id)?.focus();
    } catch {
      if (live.current) setError(true);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Trade checklist and exact job scope">
      <h3>Trade checklist → issued scope → Field review</h3>
      <label>
        Unfinished trade review notes
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label>
        Filter recorded trade scope
        <input
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {!trade && (
        <p>
          Prepare the existing explicit trade review above first. Notes and
          filters remain unsaved; no replacement review is prepared here.
        </p>
      )}
      <button
        disabled={!trade || busy || attempted}
        onClick={() => void read()}
      >
        Open retained trade checklist beside job scope
      </button>
      {(error || (view && !current)) && (
        <p role="alert">
          UNKNOWN — retained trade, source or authorization changed. No
          preparation replay or replacement is permitted.
        </p>
      )}
      {current && (
        <>
          <p>
            Human-selected edition: {current.trade.snapshot.edition}. Company
            industry is unchanged; this is not evidence of the job's trade
            classification or a partner qualification.
          </p>
          <p>
            Exact job {current.work.scope.jobId} · estimate{' '}
            {current.work.scope.estimateId} · issued version{' '}
            {current.work.scope.issuedVersionId}
          </p>
          <h4>Documented issued requirements</h4>
          <ul>
            {current.trade.snapshot.scope
              .filter(
                (l) =>
                  sources.issued.version.calculation.lines.find(
                    (c) => c.id === l.id,
                  )?.included &&
                  l.description.toLowerCase().includes(query.toLowerCase()),
              )
              .map((l) => (
                <li key={l.id}>
                  {l.description} · recorded scope quantity{' '}
                  {l.quantity_milli / 1000} {l.unit} · line {l.id}
                </li>
              ))}
          </ul>
          <h4>Suggested trade review checks · NOT REVIEWED</h4>
          <ul>
            {current.trade.snapshot.checklist.map((c) => (
              <li key={c.section}>
                {c.prompt} · {c.status}
              </li>
            ))}
          </ul>
          <p>
            Independent measurements, licensing, permits, inspections, code
            compliance and verified completion remain UNKNOWN/UNVERIFIED.
            Recorded estimate quantities are not verified site measurements.
            Suggested checks do not authorize work.
          </p>
          <button
            disabled={busy}
            onClick={() => void navigate('journey-sales')}
          >
            Open exact estimating and job-planning review
          </button>
          <button
            disabled={busy}
            onClick={() => void navigate('journey-field')}
          >
            Open exact trade job in Field
          </button>
        </>
      )}
    </section>
  );
}
