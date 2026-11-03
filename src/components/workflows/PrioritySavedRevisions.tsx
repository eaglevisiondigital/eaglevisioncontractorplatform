import { useId, useLayoutEffect, useRef, useState } from 'react';
import { captureOperatingSources } from '../../lib/workflows/operating-center-runtime';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  createSavedRevisionSelection,
  readSavedRevisionSelection,
  assertSavedRevisionAccess,
  type SavedRevisionSelection,
} from '../../lib/workflows/saved-revision-runtime';
import {
  prioritySavedRevisionsEnabled,
  readPrioritySavedRevision,
  comparePrioritySavedRevisions,
  filterPrioritySavedRevisions,
  adoptPrioritySavedRevision,
  type PrioritySavedRevision,
  type PrioritySavedComparison,
  type PrioritySavedEvidence,
} from '../../lib/workflows/priority-saved-revisions';
import { SharedRecordSearch } from './SharedRecordSearch';
import './priority-saved-revisions.css';
export function PrioritySavedRevisions(props: SavedRevisionPanelProps) {
  let available = false;
  if (prioritySavedRevisionsEnabled(props.enabled))
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
      /* Exact denied hints never fall back. */
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
        className="priority-saved-revisions"
        aria-label="Saved priority revisions"
      >
        <p>Saved priority review is OFF or this exact source is unavailable.</p>
      </section>
    );
  return <PrioritySavedSession key={context.generation} {...props} />;
}
function PrioritySavedSession({
  sources,
  enabled,
  selectedJobId,
}: SavedRevisionPanelProps) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [snapshot, setSnapshot] = useState<PrioritySavedRevision>(),
    [selection, setSelection] =
      useState<SavedRevisionSelection<PrioritySavedEvidence>>(),
    [comparison, setComparison] = useState<PrioritySavedComparison>(),
    [generation, setGeneration] = useState(0),
    [confirmed, setConfirmed] = useState(false),
    [query, setQuery] = useState(''),
    [area, setArea] = useState('all'),
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
      !prioritySavedRevisionsEnabled(enabled)
    )
      throw Error('Saved priority read context changed');
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
      const current = await readPrioritySavedRevision(sources, job, {
        enabled: true,
        confirmed: true,
      });
      live(token);
      if (snapshot) {
        setComparison(comparePrioritySavedRevisions(snapshot, current));
        setMessage(
          'Inspect the original source differences, then explicitly confirm adoption.',
        );
      } else {
        setSelection(createSavedRevisionSelection(current));
        setSnapshot(current);
        setGeneration(0);
        setMessage(
          'Saved original priorities retained. Suggestions remain separate from action authority.',
        );
      }
      heading.current?.focus();
    } catch {
      if (alive.current && token === sequence.current)
        setError(
          'Exact saved priorities could not be read. No replacement, recommendation action or model call was performed.',
        );
    } finally {
      pending.current = false;
      if (alive.current && token === sequence.current) setBusy(false);
    }
  }
  function adopt() {
    if (pending.current || !selection || !comparison) return;
    try {
      const r = adoptPrioritySavedRevision(
        selection,
        comparison,
        generation,
        confirmed,
      );
      setSnapshot(r.snapshot);
      setGeneration(r.generation);
      setComparison(undefined);
      setConfirmed(false);
      setError('');
      setMessage(
        'Reviewed saved priorities adopted for presentation only. Original action holds remain unchanged.',
      );
      heading.current?.focus();
    } catch {
      setError(
        'This comparison is stale, already used, denied or not confirmed. No action was performed.',
      );
    }
  }
  let rows: ReturnType<typeof filterPrioritySavedRevisions> | undefined,
    access = true;
  try {
    if (snapshot) assertSavedRevisionAccess(snapshot);
    if (selection) readSavedRevisionSelection(selection);
    if (comparison)
      rows = filterPrioritySavedRevisions(comparison, {
        query,
        area,
        changed_only: changedOnly,
      });
  } catch {
    access = false;
  }
  const evidence = access ? snapshot?.evidence : undefined;
  return (
    <section
      className="priority-saved-revisions"
      aria-label="Saved priority revisions"
    >
      <header>
        <p className="priority-saved-revisions-eyebrow">
          Daily owner briefing · Saved evidence review
        </p>
        <h2 ref={heading} tabIndex={-1}>
          Saved priority revisions
        </h2>
        <p>
          Review what changed in the exact saved operating evidence. The
          original priority engine supplies every rank and recommendation.
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
        disabled={busy || !job || !access}
        onClick={() => void read()}
      >
        {snapshot
          ? 'Read saved priority updates'
          : 'Read saved priority revision'}
      </button>
      <p role="status">
        {busy ? 'Reading exact saved priority evidence…' : message}
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
          <dl className="priority-saved-revisions-context">
            <div>
              <dt>Customer and property</dt>
              <dd>
                {evidence.cards[0]?.context.customer} ·{' '}
                {evidence.cards[0]?.context.property}
              </dd>
            </div>
            <div>
              <dt>Job / saved revision</dt>
              <dd>
                {evidence.cards[0]?.context.job} · revision{' '}
                {evidence.job_revision}
              </dd>
            </div>
            <div>
              <dt>Selected review day</dt>
              <dd>
                {evidence.review_on} · {evidence.timezone}; source context only
              </dd>
            </div>
            <div>
              <dt>Saved evidence SHA-256</dt>
              <dd>{snapshot!.sha256}</dd>
            </div>
          </dl>
          <h3>Retained original recommendations</h3>
          <p>
            {evidence.cards.length} available exact source cards. Model:{' '}
            {evidence.model}; no autonomous action.
          </p>
          <details>
            <summary>Inspect retained priority sources</summary>
            <ol>
              {evidence.cards.map((card) => (
                <li key={card.key}>
                  <strong>
                    Original rank {card.rank} · {card.source.kind}
                  </strong>
                  <p>{card.recorded_fact}</p>
                  <p>Suggested human review: {card.suggested_human_review}</p>
                  <p>
                    Exact source {card.source.id} · version{' '}
                    {card.source.version ?? 'not recorded'} · revision{' '}
                    {card.source.revision ?? 'not recorded'}
                  </p>
                </li>
              ))}
            </ol>
          </details>
          {comparison && rows && (
            <section aria-label="Saved priority differences">
              <h3>Current saved recommendations · review before using</h3>
              <p>
                Current job revision{' '}
                {comparison.comparison.current.evidence.job_revision} · SHA-256{' '}
                {comparison.comparison.current.sha256}
              </p>
              <div className="priority-saved-revisions-filters">
                <label htmlFor={`${id}-query`}>
                  Search saved priority differences
                  <input
                    id={`${id}-query`}
                    maxLength={200}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label htmlFor={`${id}-area`}>
                  Original priority area
                  <select
                    id={`${id}-area`}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  >
                    <option value="all">All areas</option>
                    <option value="finance">Finance</option>
                    <option value="field">Field</option>
                    <option value="documentation">Documentation</option>
                    <option value="scope">Scope</option>
                  </select>
                </label>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={changedOnly}
                  onChange={(e) => setChangedOnly(e.target.checked)}
                />
                Only changed priority rows
              </label>
              <p>
                {rows.matching} matching rows / {rows.available} available exact
                source rows. Missing rows do not prove resolution or completion.
              </p>
              {!rows.matching && (
                <p>No saved priority differences match these filters.</p>
              )}
              <ul>
                {rows.rows.map((row) => {
                  const card = row.current ?? row.before!;
                  return (
                    <li key={row.identity}>
                      <h4>
                        {row.status.replaceAll('_', ' ')} · {card.source.kind}
                      </h4>
                      <p>
                        Exact source {card.source.id} · {card.key}
                      </p>
                      <div className="priority-saved-revisions-columns">
                        {(['before', 'current'] as const).map((side) => (
                          <section key={side}>
                            <h5>
                              {side === 'before'
                                ? 'Before'
                                : 'Current available read'}
                            </h5>
                            {row[side] ? (
                              <>
                                <p>
                                  Original engine rank {row[side]!.rank} ·{' '}
                                  {row[side]!.review_band}
                                </p>
                                <p>Recorded fact: {row[side]!.recorded_fact}</p>
                                <p>
                                  Suggested human review:{' '}
                                  {row[side]!.suggested_human_review}
                                </p>
                                <p>
                                  Version{' '}
                                  {row[side]!.source.version ?? 'not recorded'}{' '}
                                  · revision{' '}
                                  {row[side]!.source.revision ?? 'not recorded'}
                                </p>
                                <details>
                                  <summary>
                                    Inspect exact priority source
                                  </summary>
                                  <p>
                                    Source SHA-256{' '}
                                    {row[side]!.source.source_sha256}
                                  </p>
                                  <p>Card SHA-256 {row[side]!.sha256}</p>
                                  <ul>
                                    {row[side]!.order_reasons.map((reason) => (
                                      <li key={reason}>{reason}</li>
                                    ))}
                                  </ul>
                                </details>
                              </>
                            ) : (
                              <p>
                                Not present in this available read; no physical
                                or financial conclusion.
                              </p>
                            )}
                          </section>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I reviewed this exact saved priority revision
              </label>
              <button
                type="button"
                disabled={!confirmed || busy}
                onClick={adopt}
              >
                Use reviewed priority revision
              </button>
            </section>
          )}
        </>
      )}
      <p className="priority-saved-revisions-limit">
        Local immutable read evidence only; no refresh/crash durability.
        Adoption never dispatches, generates AI output, sends messages, clears
        UNKNOWN or invokes a workflow action.
      </p>
    </section>
  );
}
