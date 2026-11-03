import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  assertOperatingSelectionCurrentNow,
  readOperatingSelection,
  revalidateOperatingSelection,
  type OperatingSelectionInput,
  type OperatingSelectionView,
} from '../../lib/workflows/operating-selection';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import './daily-guide-search.css';

export interface SharedRecordSearchProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}
const destinations: readonly [OperatingJobSection, string][] = [
  ['field', 'Field review'],
  ['finance', 'Financial review'],
  ['completion', 'Completion review'],
  ['maintenance', 'Maintenance review'],
  ['daily', 'Daily review'],
  ['sales', 'Sales review'],
];
export function SharedRecordSearch(props: SharedRecordSearchProps) {
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
      const c = captureOperatingSources(props.sources, {
        enabled: true,
        confirmed: true,
      });
      c.check();
      admitted =
        props.selectedJobId === undefined ||
        c.entries.some((e) => e.target.job_id === props.selectedJobId);
    } catch {
      /* Withhold unadmitted sources before reading any presentation fields. */
    }
  }
  const [context, setContext] = useState({
    sources: props.sources,
    selectedJobId: props.selectedJobId,
    admitted,
    generation: 0,
  });
  if (
    context.sources !== props.sources ||
    context.selectedJobId !== props.selectedJobId ||
    context.admitted !== admitted
  ) {
    setContext({
      sources: props.sources,
      selectedJobId: props.selectedJobId,
      admitted,
      generation: context.generation + 1,
    });
    return null;
  }
  return admitted ? (
    <Search key={context.generation} {...props} />
  ) : (
    <p role="status">
      Shared record search is off or current source access is UNKNOWN.
    </p>
  );
}
function Search({
  sources,
  selectedJobId,
  onSelectJob,
}: SharedRecordSearchProps) {
  const [expanded, setExpanded] = useState(false),
    [query, setQuery] = useState(''),
    [section, setSection] = useState<OperatingJobSection>('field'),
    [view, setView] = useState<OperatingSelectionView>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const live = useRef(true),
    serial = useRef(0),
    pending = useRef<OperatingSelectionInput | undefined>(undefined);
  const gate = useRef({ enabled: true, confirmed: true });
  const navigation = useRef({ callback: onSelectJob, epoch: 0 });
  useLayoutEffect(() => {
    const state = navigation.current;
    state.epoch++;
    state.callback = onSelectJob;
    return () => {
      state.epoch++;
      state.callback = undefined;
    };
  }, [onSelectJob]);
  const [bound] = useState(() =>
    captureOperatingSources(sources, { enabled: true, confirmed: true }),
  );
  useEffect(() => {
    const g = gate.current;
    live.current = true;
    g.enabled = true;
    return () => {
      live.current = false;
      g.enabled = false;
    };
  }, []);
  let current = true;
  try {
    bound.check();
    if (view) assertOperatingSelectionCurrentNow(view);
  } catch {
    current = false;
  }
  function invalidate(next: string) {
    if (pending.current) pending.current.query = '\u0000withdrawn query';
    serial.current++;
    setQuery(next);
    setView(undefined);
    setBusy(false);
    setError('');
  }
  async function search(page = 0) {
    if (!current || busy) return;
    const input = { query, page, page_size: 2 },
      token = ++serial.current;
    pending.current = input;
    setBusy(true);
    setView(undefined);
    setError('');
    try {
      const result = await readOperatingSelection(sources, input, gate.current);
      bound.check();
      assertOperatingSelectionCurrentNow(result);
      if (live.current && token === serial.current) setView(result);
    } catch {
      if (live.current && token === serial.current)
        setError(
          'UNKNOWN — exact source search is unavailable. No substitute record or action.',
        );
    } finally {
      if (live.current && token === serial.current) setBusy(false);
    }
  }
  async function open(jobId: string) {
    if (!view || !current || busy || !onSelectJob) return;
    const token = ++serial.current,
      destination = section,
      navigate = navigation.current.callback,
      navEpoch = navigation.current.epoch;
    if (!navigate || navigate !== onSelectJob) return;
    setBusy(true);
    setError('');
    try {
      const exact = await revalidateOperatingSelection(sources, view, jobId);
      bound.check();
      assertOperatingSelectionCurrentNow(view);
      if (!live.current || token !== serial.current) return;
      if (
        navigation.current.callback !== navigate ||
        navigation.current.epoch !== navEpoch
      ) {
        setError(
          'UNKNOWN — navigation context changed. No navigation occurred.',
        );
        return;
      }
      if (destinations.some(([key]) => key === destination))
        navigate(exact.job_id, destination);
    } catch {
      if (live.current && token === serial.current) {
        setView(undefined);
        setError(
          'UNKNOWN — exact record changed. No replacement or navigation.',
        );
      }
    } finally {
      if (live.current && token === serial.current) setBusy(false);
    }
  }
  return (
    <section className="daily-guide-search" aria-label="Shared record search">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Find another record
      </button>
      {current && selectedJobId && (
        <p>
          Retained exact job: <span>{selectedJobId}</span>. Each guide
          independently verifies this context.
        </p>
      )}
      {!current && (
        <p role="alert">
          UNKNOWN — source or staff access changed. Previous search and
          navigation are withheld.
        </p>
      )}
      {expanded && current && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <label>
              Search available customer, property, job or estimate
              <input
                value={query}
                maxLength={100}
                onChange={(e) => invalidate(e.target.value)}
              />
            </label>
            <label>
              Original review destination
              <select
                value={section}
                disabled={busy}
                onChange={(e) =>
                  setSection(e.target.value as OperatingJobSection)
                }
              >
                {destinations.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>
              Search shared records
            </button>
          </form>
          {busy && (
            <p role="status">Checking existing authorized source records…</p>
          )}
          {error && <p role="alert">{error}</p>}
          {view && (
            <>
              <p role="status">
                {view.matching} matching of {view.available} available prepared
                sources · page {view.page + 1}. Available sources are not
                complete company history.
              </p>
              {!view.rows.length && (
                <p>
                  No matching available records. Clear the literal search or
                  return to an earlier page.
                </p>
              )}
              <div className="daily-guide-results">
                {view.rows.map((row) => (
                  <article key={row.job_id}>
                    <h3>{row.customer_label}</h3>
                    <p>{row.property_label}</p>
                    <strong>{row.job_label}</strong>
                    <p>
                      Issued estimate {row.estimate_number} · version{' '}
                      {row.issued_version_number}
                    </p>
                    <p>
                      Exact job <span>{row.job_id}</span> · issued source{' '}
                      <span>{row.issued_version_id}</span>
                    </p>
                    <button
                      type="button"
                      disabled={busy || !onSelectJob}
                      onClick={() => void open(row.job_id)}
                    >
                      Open exact record in{' '}
                      {destinations.find(([key]) => key === section)![1]}
                    </button>
                  </article>
                ))}
              </div>
              <div className="daily-guide-actions">
                <button
                  type="button"
                  disabled={busy || view.page === 0}
                  onClick={() => void search(view.page - 1)}
                >
                  Previous shared page
                </button>
                <button
                  type="button"
                  disabled={
                    busy || (view.page + 1) * view.page_size >= view.matching
                  }
                  onClick={() => void search(view.page + 1)}
                >
                  Next shared page
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => invalidate('')}
                >
                  Clear shared search
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
