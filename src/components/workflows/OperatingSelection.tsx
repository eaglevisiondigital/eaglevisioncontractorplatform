import { useEffect, useRef, useState } from 'react';
import type { OperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  assertOperatingSelectionCurrentNow,
  readOperatingSelection,
  revalidateOperatingSelection,
  type OperatingSelectionInput,
  type OperatingSelectionView,
} from '../../lib/workflows/operating-selection';
import './operating-selection.css';
export interface OperatingSelectionProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function OperatingSelection(props: OperatingSelectionProps) {
  const signature = JSON.stringify({
    targets: props.sources.entries.map((e) => e.target),
    enabled: props.enabled,
  });
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
  return props.enabled === true ? (
    <Selection key={binding.generation} {...props} />
  ) : null;
}
function Selection({ sources, onSelectJob }: OperatingSelectionProps) {
  const [query, setQuery] = useState(''),
    [view, setView] = useState<OperatingSelectionView>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [selected, setSelected] = useState<string>();
  const life = useRef({ active: true }),
    pending = useRef<OperatingSelectionInput | undefined>(undefined),
    gate = useRef({ enabled: true, confirmed: true });
  useEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      g.enabled = false;
    };
  }, []);
  function invalidate() {
    if (pending.current) pending.current.query = '\u0000invalidated';
    pending.current = undefined;
    setView(undefined);
    setSelected(undefined);
    setError(undefined);
    setBusy(false);
  }
  async function search(page = 0) {
    setBusy(true);
    setView(undefined);
    setError(undefined);
    setSelected(undefined);
    const input = { query, page, page_size: 2 };
    pending.current = input;
    try {
      const value = await readOperatingSelection(sources, input, gate.current);
      if (!life.current.active || pending.current !== input) return;
      assertOperatingSelectionCurrentNow(value);
      setView(value);
    } catch {
      if (life.current.active && pending.current === input)
        setError(
          'UNKNOWN — source access or selection changed. No replacement customer, estimate or job was selected.',
        );
    } finally {
      if (life.current.active && pending.current === input) setBusy(false);
    }
  }
  async function open(jobId: string) {
    if (!view || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const exact = await revalidateOperatingSelection(sources, view, jobId);
      if (!life.current.active) return;
      assertOperatingSelectionCurrentNow(view);
      setSelected(exact.job_id);
      onSelectJob?.(exact.job_id);
    } catch {
      if (life.current.active) {
        setView(undefined);
        setError(
          'UNKNOWN — exact visible source is no longer current. No other source was opened.',
        );
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  return (
    <section
      className="operating-selection"
      aria-label="Operating source selection"
    >
      <div>
        <span className="eyebrow">Sales · exact source selection</span>
        <h2>Find a customer and issued scope</h2>
        <p>
          Search prepared customer, lead, property and job records before
          opening the exact existing workflow.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          Search customer, lead, property or estimate
          <input
            value={query}
            maxLength={100}
            onChange={(e) => {
              invalidate();
              setQuery(e.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={busy}>
          Search operating sources
        </button>
      </form>
      {busy && <p role="status">Checking current source records…</p>}
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <p role="status">
            {view.matching} matching of {view.available} available prepared job
            sources · page {view.page + 1} of{' '}
            {Math.max(1, Math.ceil(view.matching / view.page_size))}.
          </p>
          {!view.rows.length && (
            <p>
              No matching sources on this page. Clear the search or return to an
              earlier page.
            </p>
          )}
          <div className="operating-selection-grid">
            {view.rows.map((row) => (
              <article key={row.job_id}>
                <h3>{row.customer_label}</h3>
                <p>{row.property_label}</p>
                <h4>{row.job_label}</h4>
                <p>{row.scope_summary}</p>
                <dl>
                  <dt>Issued estimate / version</dt>
                  <dd>
                    {row.estimate_number} / {row.issued_version_number} ·{' '}
                    {row.issued_version_id}
                  </dd>
                  <dt>Original request</dt>
                  <dd>{row.lead.id}</dd>
                  <dt>LOCAL-TEST receipt</dt>
                  <dd>{row.receipt.id}</dd>
                  <dt>Exact job</dt>
                  <dd>{row.job_id}</dd>
                </dl>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void open(row.job_id)}
                >
                  Open this source-bound job
                </button>
              </article>
            ))}
          </div>
          <div
            className="operating-selection-pages"
            aria-label="Operating source pages"
          >
            <button
              type="button"
              disabled={busy || view.page === 0}
              onClick={() => void search(view.page - 1)}
            >
              Previous operating page
            </button>
            <button
              type="button"
              disabled={
                busy || (view.page + 1) * view.page_size >= view.matching
              }
              onClick={() => void search(view.page + 1)}
            >
              Next operating page
            </button>
          </div>
        </>
      )}
      {selected && (
        <p role="status">
          Exact job selected: {selected}. Navigation grants no contract or
          financial authority.
        </p>
      )}
      <p className="operating-selection-boundary">
        Available prepared records only; full CRM history remains UNKNOWN. Lead
        association is an explicit staff selection, not a recorded estimate lead
        link. No contract, payment, dispatch or communication action.
      </p>
    </section>
  );
}
