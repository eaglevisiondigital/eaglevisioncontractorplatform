import { useId, useLayoutEffect, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  assertSavedRevisionAccess,
} from '../../lib/workflows/saved-revision-runtime';
import {
  readCostSavedRevision,
  compareCostSavedRevisions,
  filterCostSavedRevisions,
  adoptCostSavedRevision,
  costSavedRevisionsEnabled,
  type CostSavedRevision,
  type CostSavedComparison,
  type CostSavedEvidence,
} from '../../lib/workflows/cost-saved-revisions';
import type { SavedRevisionSelection } from '../../lib/workflows/saved-revision-runtime';
import { SharedRecordSearch } from './SharedRecordSearch';
import './cost-saved-revisions.css';

export function CostSavedRevisions(props: SavedRevisionPanelProps) {
  let available = false;
  if (costSavedRevisionsEnabled(props.enabled))
    try {
      const capture = captureOperatingSources(props.sources, {
        enabled: true,
        confirmed: true,
      });
      capture.check();
      available =
        props.selectedJobId === undefined ||
        capture.entries.some((e) => e.target.job_id === props.selectedJobId);
    } catch {
      /* No fallback for denied or foreign hints. */
    }
  const [context, setContext] = useState({
    sources: props.sources,
    enabled: props.enabled,
    job: props.selectedJobId,
    available,
    generation: 0,
  });
  if (
    context.sources !== props.sources ||
    context.enabled !== props.enabled ||
    context.job !== props.selectedJobId ||
    context.available !== available
  ) {
    setContext({
      sources: props.sources,
      enabled: props.enabled,
      job: props.selectedJobId,
      available,
      generation: context.generation + 1,
    });
    return null;
  }
  if (!available)
    return (
      <section
        className="cost-saved-revisions"
        aria-label="Saved cost revisions"
      >
        <p>Saved cost review is OFF or this exact source is unavailable.</p>
      </section>
    );
  return <CostSavedSession key={context.generation} {...props} />;
}
function CostSavedSession({
  sources,
  enabled,
  selectedJobId,
}: SavedRevisionPanelProps) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [snapshot, setSnapshot] = useState<CostSavedRevision>(),
    [selection, setSelection] =
      useState<SavedRevisionSelection<CostSavedEvidence>>(),
    [comparison, setComparison] = useState<CostSavedComparison>(),
    [generation, setGeneration] = useState(0),
    [confirmed, setConfirmed] = useState(false),
    [query, setQuery] = useState(''),
    [changedOnly, setChangedOnly] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('Read this exact saved source to begin.'),
    [error, setError] = useState('');
  const alive = useRef(true),
    pending = useRef(false),
    sequence = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    id = useId();
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function live(token: number) {
    if (
      !alive.current ||
      token !== sequence.current ||
      !costSavedRevisionsEnabled(enabled)
    )
      throw Error('Saved cost read context changed');
  }
  async function read() {
    if (pending.current || !job) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setConfirmed(false);
    setComparison(undefined);
    const token = ++sequence.current;
    try {
      if (snapshot) assertSavedRevisionAccess(snapshot);
      const current = await readCostSavedRevision(sources, job, {
        enabled: true,
        confirmed: true,
      });
      live(token);
      if (snapshot) {
        setComparison(compareCostSavedRevisions(snapshot, current));
        setMessage(
          'Compare the exact saved updates, then explicitly confirm adoption.',
        );
      } else {
        setSelection(createSavedRevisionSelection(current));
        setSnapshot(current);
        setGeneration(0);
        setMessage(
          'Original saved cost revision retained. No time, material, invoice or ledger was posted.',
        );
      }
      heading.current?.focus();
    } catch {
      if (alive.current && token === sequence.current)
        setError(
          'Exact saved cost evidence could not be read. No replacement or action was performed.',
        );
    } finally {
      pending.current = false;
      if (alive.current && token === sequence.current) setBusy(false);
    }
  }
  function adopt() {
    if (pending.current || !selection || !comparison) return;
    try {
      const result = adoptCostSavedRevision(
        selection,
        comparison,
        generation,
        confirmed,
      );
      setSnapshot(result.snapshot);
      setGeneration(result.generation);
      setComparison(undefined);
      setConfirmed(false);
      setError('');
      setMessage(
        'Reviewed saved revision adopted for this presentation only. Original held actions remain unchanged.',
      );
      heading.current?.focus();
    } catch {
      setError(
        'This comparison is stale, already used, denied or not confirmed. Read exact saved updates; no action was performed.',
      );
    }
  }
  let rows: ReturnType<typeof filterCostSavedRevisions> | undefined,
    access = true;
  try {
    if (snapshot) assertSavedRevisionAccess(snapshot);
    if (selection) readSavedRevisionSelection(selection);
    if (comparison)
      rows = filterCostSavedRevisions(comparison, {
        query,
        changed_only: changedOnly,
      });
  } catch {
    access = false;
  }
  const evidence = access ? snapshot?.evidence : undefined;
  const money = (value: number | undefined | null) =>
    value === null || value === undefined
      ? 'UNKNOWN'
      : formatMinor(value, evidence?.currency ?? 'USD');
  return (
    <section className="cost-saved-revisions" aria-label="Saved cost revisions">
      <header>
        <p className="cost-saved-revisions-eyebrow">
          Saved financial evidence · Staff review only
        </p>
        <h2 ref={heading} tabIndex={-1}>
          Saved cost revisions
        </h2>
        <p>
          Read saved costs and invoice requirements without posting time,
          materials or money. Missing costs remain UNKNOWN.
        </p>
      </header>
      {!selectedJobId && !snapshot && (
        <SharedRecordSearch
          sources={sources}
          enabled={enabled}
          onSelectJob={(id) => {
            if (pending.current) return;
            setJob(id);
            setError('');
          }}
        />
      )}
      <p>
        Exact selected job:{' '}
        {job || 'Choose an authorized job in shared record search.'}
      </p>
      <button
        type="button"
        onClick={() => void read()}
        disabled={busy || !job || !access}
      >
        {snapshot ? 'Read saved cost updates' : 'Read saved cost revision'}
      </button>
      <p role="status">
        {busy ? 'Reading exact saved cost evidence…' : message}
      </p>
      {(error || !access) && (
        <p role="alert">
          {!access
            ? 'Saved source access changed. Retained private evidence is withheld; no old action is revived.'
            : error}
        </p>
      )}
      {evidence && (
        <>
          <dl className="cost-saved-revisions-context">
            <div>
              <dt>Customer and property</dt>
              <dd>
                {evidence.customer_name} · {evidence.property_label}
              </dd>
            </div>
            <div>
              <dt>Job / saved revision</dt>
              <dd>
                {evidence.job_name} · revision {evidence.job_revision}
              </dd>
            </div>
            <div>
              <dt>Immutable issued version</dt>
              <dd>
                {evidence.issued.version_id} · version{' '}
                {evidence.issued.version_number}
              </dd>
            </div>
            <div>
              <dt>Saved evidence SHA-256</dt>
              <dd>{snapshot!.sha256}</dd>
            </div>
          </dl>
          <div className="cost-saved-revisions-columns">
            <section>
              <h3>Retained saved cost evidence</h3>
              <dl>
                <dt>Recorded costs</dt>
                <dd>{money(evidence.facts.costs?.recordedMinor)}</dd>
                <dt>Cost to complete</dt>
                <dd>{money(evidence.facts.costs?.costToCompleteMinor)}</dd>
                <dt>Projected contribution</dt>
                <dd>
                  {money(evidence.facts.margin?.projectedContributionMinor)}
                </dd>
                <dt>Canonical coverage</dt>
                <dd>{evidence.facts.cost_coverage}</dd>
                <dt>Invoice requirements</dt>
                <dd>{evidence.invoice.overall} · no issuance authority</dd>
                <dt>Locked labor source periods</dt>
                <dd>
                  {evidence.locked_periods.length}; approved unposted time is
                  not locked labor cost.
                </dd>
              </dl>
            </section>
            {comparison && rows && (
              <section>
                <h3>Current saved source · review before using</h3>
                <p>
                  Revision {comparison.comparison.current.evidence.job_revision}
                </p>
                <dl>
                  <dt>Recorded costs</dt>
                  <dd>
                    {money(
                      comparison.comparison.current.evidence.facts.costs
                        ?.recordedMinor,
                    )}
                  </dd>
                  <dt>Cost to complete</dt>
                  <dd>
                    {money(
                      comparison.comparison.current.evidence.facts.costs
                        ?.costToCompleteMinor,
                    )}
                  </dd>
                  <dt>Canonical comparison</dt>
                  <dd>{comparison.canonical.status}</dd>
                  <dt>Saved evidence SHA-256</dt>
                  <dd>{comparison.comparison.current.sha256}</dd>
                </dl>
              </section>
            )}
          </div>
          {comparison && rows && (
            <section aria-label="Saved cost differences">
              <h3>Exact source differences</h3>
              <label htmlFor={`${id}-query`}>
                Search saved cost differences
              </label>
              <input
                id={`${id}-query`}
                value={query}
                maxLength={200}
                onChange={(e) => setQuery(e.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={changedOnly}
                  onChange={(e) => setChangedOnly(e.target.checked)}
                />
                Only changed source rows
              </label>
              <p>
                {rows.matching} matching rows / {rows.available} available
                source rows. Absence does not prove paid or completed work.
              </p>
              {!rows.matching && (
                <p>No saved source differences match these filters.</p>
              )}
              <ul>
                {rows.rows.map((row) => (
                  <li key={`${row.kind}:${row.id}`}>
                    <h4>
                      {row.kind} · {row.id}
                    </h4>
                    <p>{row.status.replaceAll('_', ' ')}</p>
                    <details>
                      <summary>Inspect exact saved cost source</summary>
                      <div className="cost-saved-revisions-columns">
                        <section>
                          <h5>Before</h5>
                          <pre>{JSON.stringify(row.before, null, 2)}</pre>
                        </section>
                        <section>
                          <h5>Current available read</h5>
                          <pre>{JSON.stringify(row.current, null, 2)}</pre>
                        </section>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I reviewed this exact saved cost revision
              </label>
              <button
                type="button"
                disabled={!confirmed || busy}
                onClick={adopt}
              >
                Use reviewed cost revision
              </button>
            </section>
          )}
        </>
      )}
      <p className="cost-saved-revisions-limit">
        Local immutable read evidence only; no refresh/crash durability.
        Adoption never issues an invoice, posts a cost, clears UNKNOWN or
        invokes a workflow action.
      </p>
    </section>
  );
}
