import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import { readIntelligenceWorkflowAttempt } from '../../lib/workflows/intelligence-workflow';
import { capacityDay } from '../../domain/field/crew-capacity';
import {
  readDailyOperations,
  inspectDailyOperations,
  filterDailyOperations,
  openDailyOperationsSource,
  type DailyOperationsFilter,
  type DailyOperationsReview,
} from '../../lib/workflows/daily-operations';
import './daily-operations.css';

export function DailyOperations({
  sources,
  enabled = false,
}: {
  sources: LocalJourney;
  enabled?: boolean;
}) {
  let fingerprint = 'OFF';
  if (enabled && sources.gate.enabled && sources.gate.confirmed)
    try {
      fingerprint = JSON.stringify({
        source: sources.estimates.readSyntheticPrototypeSources(sources.target),
        property: sources.property.read(sources.target.organization_id),
        release: sources.release.read('staff'),
        intelligence: readIntelligenceWorkflowAttempt(
          sources.estimates,
          sources.target,
          sources.gate,
        ),
      });
    } catch {
      fingerprint = 'UNAVAILABLE';
    }
  const signature = JSON.stringify([
    sources.target,
    sources.gate.enabled,
    sources.gate.confirmed,
    fingerprint,
  ]);
  const [binding, bind] = useState({
    sources,
    signature,
    enabled,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.signature !== signature ||
    binding.enabled !== enabled
  ) {
    bind({ sources, signature, enabled, generation: binding.generation + 1 });
    return null;
  }
  return enabled && sources.gate.enabled && sources.gate.confirmed ? (
    <DailyReview key={binding.generation} sources={sources} />
  ) : (
    <section
      className="daily-operations"
      aria-label="Daily operating priorities"
    >
      <h2>Daily operating priorities</h2>
      <p>
        Daily review is off. Explicit local synthetic source confirmation is
        required.
      </p>
    </section>
  );
}
function DailyReview({ sources }: { sources: LocalJourney }) {
  const id = useId();
  const [day, setDay] = useState(sources.day),
    [timezone, setTimezone] = useState(sources.timezone),
    [confirmed, setConfirmed] = useState(false),
    [revision, setRevision] = useState(1);
  const [review, setReview] = useState<DailyOperationsReview | null>(null),
    [filter, setFilter] = useState<DailyOperationsFilter>({
      area: 'all',
      level: 'all',
      query: '',
    });
  const [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openDailyOperationsSource>
    > | null>(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false);
  const generation = useRef(0),
    gate = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (gate.current) gate.current.confirmed = false;
    },
    [sources],
  );
  useEffect(() => {
    if (detail) sourceHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    if (gate.current) gate.current.confirmed = false;
    if (busy) {
      setHeld(true);
      setBusy(false);
      setError(
        'Outcome UNKNOWN after withdrawal. No automatic replay or replacement.',
      );
    } else setError('');
    setReview(null);
    setDetail(null);
    setConfirmed(false);
    setStatus('');
    setRevision((n) => n + 1);
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || busy || held || !sources.gate.confirmed) return;
    try {
      capacityDay(day, timezone);
    } catch {
      setError('Choose a valid calendar day and explicit IANA timezone.');
      return;
    }
    const token = ++generation.current,
      admission = { enabled: true, confirmed: true };
    gate.current = admission;
    setBusy(true);
    setReview(null);
    setDetail(null);
    setStatus('');
    setError('');
    try {
      const result = await readDailyOperations(
        sources,
        { review_on: day, timezone, input_revision: revision },
        admission,
      );
      if (
        generation.current === token &&
        admission.confirmed &&
        sources.gate.confirmed
      )
        setReview(result);
    } catch {
      if (generation.current === token) {
        setHeld(true);
        setError(
          'Daily review outcome UNKNOWN. No replay or replacement is prepared.',
        );
      }
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  async function inspect() {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    const result = await inspectDailyOperations(review);
    if (generation.current === token && sources.gate.confirmed) {
      setStatus(
        `${result.status} · exact read-only inspection; no replacement.`,
      );
      if (result.status !== 'CURRENT_LOCAL_SOURCE') {
        setReview(null);
        setDetail(null);
        setHeld(true);
      }
      setBusy(false);
    }
  }
  async function open(cardId: string) {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    setDetail(null);
    setError('');
    try {
      const result = await openDailyOperationsSource(review, cardId);
      if (generation.current === token && sources.gate.confirmed)
        setDetail(result);
    } catch {
      if (generation.current === token) {
        setHeld(true);
        setReview(null);
        setError(
          'Exact source is UNKNOWN or changed. No substitute source is opened.',
        );
      }
    } finally {
      if (generation.current === token) setBusy(false);
    }
  }
  let results: ReturnType<typeof filterDailyOperations> | null = null;
  if (review)
    try {
      results = filterDailyOperations(review, filter);
    } catch {
      /* Withhold all old cards on current-source denial. */
    }
  return (
    <section
      className="daily-operations"
      aria-label="Daily operating priorities"
    >
      <div className="daily-operations-heading">
        <p className="daily-operations-eyebrow">
          Existing evidence · staff review order
        </p>
        <h2>Daily operating priorities</h2>
        <p>
          Connect the exact selected job’s costs, Field evidence, issued scope
          and published documentation. This is a review queue, not urgent
          dispatch or financial authority.
        </p>
      </div>
      <form onSubmit={prepare} aria-label="Daily review context">
        <fieldset className="daily-operations-card" disabled={busy || held}>
          <legend>Human-selected day context</legend>
          <div className="daily-operations-grid">
            <div>
              <label htmlFor={`${id}-day`}>Field activity day</label>
              <input
                id={`${id}-day`}
                type="date"
                required
                value={day}
                onChange={(e) => {
                  invalidate();
                  setDay(e.target.value);
                }}
              />
            </div>
            <div>
              <label htmlFor={`${id}-zone`}>IANA timezone</label>
              <input
                id={`${id}-zone`}
                required
                maxLength={100}
                value={timezone}
                onChange={(e) => {
                  invalidate();
                  setTimezone(e.target.value);
                }}
              />
            </div>
          </div>
          <p>
            The day filters recorded Field activity. Finance, scope and
            available published reports remain review context for this selected
            job, without inferred deadlines or complete history.
          </p>
        </fieldset>
        <label className="daily-operations-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I confirm this exact local job and day context for read-only staff
          review.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          Review daily priorities
        </button>
      </form>
      {busy && (
        <p role="status">
          Checking exact current Finance, Field and published source evidence…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!review && !busy && !error && (
        <p>
          No daily review prepared. Select the day context and explicitly
          confirm.
        </p>
      )}
      {review && !results && (
        <p role="alert">
          Current source is unavailable or changed. Previous cards and details
          are withheld.
        </p>
      )}
      {review && results && !busy && (
        <>
          <div className="daily-operations-card">
            <h3>{review.context.job_title}</h3>
            <p>
              {review.context.customer} · {review.context.property}
            </p>
            <p>
              Finance coverage: {review.finance.coverage}. Invoice readiness:{' '}
              {review.finance.invoice_readiness}. Actual availability and
              capacity UNKNOWN; physical completion UNVERIFIED.
            </p>
            <details>
              <summary>Exact source &amp; ordering explanation</summary>
              <p>
                Job: <code>{review.target.job_id}</code> / revision{' '}
                {review.context.job_revision}
              </p>
              <p>
                Customer: <code>{review.target.customer_id}</code> · property:{' '}
                <code>{review.target.location_id}</code>
              </p>
              <p>
                Issued version: <code>{review.target.version_id}</code> /{' '}
                {review.context.issued_version.version_number}
              </p>
              <p>{review.order_meaning}</p>
              <p>{review.date_meaning}</p>
              <p>
                Available selected-job sources only, not a complete company
                dashboard or inspection history.
              </p>
            </details>
          </div>
          <fieldset className="daily-operations-card">
            <legend>Filter available review evidence</legend>
            <div className="daily-operations-filters">
              <div>
                <label htmlFor={`${id}-area`}>Review area</label>
                <select
                  id={`${id}-area`}
                  value={filter.area}
                  onChange={(e) => {
                    setDetail(null);
                    setFilter((old) => ({
                      ...old,
                      area: e.target.value as DailyOperationsFilter['area'],
                    }));
                  }}
                >
                  <option value="all">All areas</option>
                  <option value="finance">Finance</option>
                  <option value="field">Field</option>
                  <option value="scope">Issued scope</option>
                  <option value="documentation">Published documentation</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-level`}>Review type</label>
                <select
                  id={`${id}-level`}
                  value={filter.level}
                  onChange={(e) => {
                    setDetail(null);
                    setFilter((old) => ({
                      ...old,
                      level: e.target.value as DailyOperationsFilter['level'],
                    }));
                  }}
                >
                  <option value="all">All review types</option>
                  <option value="evidence">Evidence needed</option>
                  <option value="review">Source review</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-query`}>Search available cards</label>
                <input
                  id={`${id}-query`}
                  value={filter.query}
                  maxLength={200}
                  onChange={(e) => {
                    setDetail(null);
                    setFilter((old) => ({ ...old, query: e.target.value }));
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDetail(null);
                setFilter({ area: 'all', level: 'all', query: '' });
              }}
            >
              Clear priority filters
            </button>
            <p role="status">
              {results.matching} matching of {results.available} available cards
              for this exact job.
            </p>
          </fieldset>
          {results.matching === 0 && (
            <div className="daily-operations-card">
              <h3>No matching available evidence</h3>
              <p>
                Try another review area, type or search. A missing card does not
                prove no visit, repaired work, complete cost coverage or absent
                history.
              </p>
            </div>
          )}
          <ol className="daily-operations-cards">
            {results.cards.map((card, index) => (
              <li key={card.id} className="daily-operations-card">
                <p className="daily-operations-eyebrow">
                  Review {index + 1} · {card.area} ·{' '}
                  {card.level === 'evidence'
                    ? 'Evidence needed'
                    : 'Source review'}
                </p>
                <h3>{card.observation}</h3>
                <p>{card.suggested_review}</p>
                {card.recorded_day && (
                  <p>
                    Recorded source day: {card.recorded_day}. This date is not
                    an inferred deadline.
                  </p>
                )}
                <p>
                  <code>{card.source.id}</code>
                  {card.source.version !== null &&
                    ` · published/issued version ${card.source.version}`}
                  {card.source.revision !== null &&
                    ` · revision ${card.source.revision}`}
                </p>
                <div className="daily-operations-actions">
                  <button
                    type="button"
                    onClick={() => open(card.id)}
                    disabled={busy}
                  >
                    Inspect exact {card.source.kind} source
                  </button>
                  <a href={`#${card.destination}`}>
                    Open existing {card.area} workflow
                  </a>
                </div>
              </li>
            ))}
          </ol>
          {detail && (
            <section
              className="daily-operations-card"
              aria-label="Daily priority exact source"
            >
              <h3 ref={sourceHeading} tabIndex={-1}>
                Exact retained source evidence
              </h3>
              <p>
                Source belongs to the same customer, property, issued version
                and job. Navigation only; no action or substitute version.
              </p>
              <pre tabIndex={0} aria-label="Exact priority evidence">
                {JSON.stringify(detail.detail, null, 2)}
              </pre>
            </section>
          )}
          <section
            className="daily-operations-card"
            aria-label="Existing Copilot review context"
          >
            <h3>Existing explainable review</h3>
            <p>
              Captured existing Copilot metadata:{' '}
              {review.existing_intelligence.status}.{' '}
              {review.existing_intelligence.meaning}
            </p>
            <a href="#journey-intelligence">
              Open existing Copilot, literal transcript &amp; trade review
            </a>
            <p>
              No fresh AI generation, microphone, provider or automatic action
              runs here.
            </p>
            <button type="button" onClick={inspect} disabled={busy}>
              Inspect exact daily review
            </button>
            <details>
              <summary>Review integrity &amp; custody</summary>
              <p>
                SHA-256: <code>{review.sha256}</code>
              </p>
              <p>
                Immutable same-tab evidence only; no refresh or process-crash
                durability. UNKNOWN never replays an action.
              </p>
            </details>
          </section>
        </>
      )}
    </section>
  );
}
