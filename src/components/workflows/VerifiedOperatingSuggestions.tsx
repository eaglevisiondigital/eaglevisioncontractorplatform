import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { detached } from '../../domain/jobs/margin-analysis';
import { capacityDay } from '../../domain/field/crew-capacity';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { readIntelligenceWorkflowAttempt } from '../../lib/workflows/intelligence-workflow';
import {
  readVerifiedOperatingSuggestions,
  filterVerifiedOperatingSuggestions,
  openVerifiedSuggestionSource,
  openVerifiedSuggestionJob,
  inspectVerifiedOperatingSuggestions,
  type VerifiedSuggestionsInput,
  type VerifiedSuggestionsFilter,
  type VerifiedOperatingSuggestionsReview,
  verifiedSuggestionsEnabled,
  assertVerifiedSuggestionsCurrent,
  suggestionSourceKinds,
} from '../../lib/workflows/verified-operating-suggestions';
import { actionReviewBands } from '../../lib/workflows/daily-action-center';
import './verified-operating-suggestions.css';

/** Preserve the visible phrase in the accessible name for voice navigation. */
export function VerifiedSuggestionSourceButton({
  kind,
  job,
  disabled,
  onOpen,
}: {
  kind: string;
  job: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      aria-label={`Open exact source: ${kind} for ${job}`}
    >
      Open exact source
    </button>
  );
}

export function VerifiedOperatingSuggestions({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}) {
  let signature = 'OFF',
    check: (() => void) | null = null;
  if (verifiedSuggestionsEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      signature = JSON.stringify(
        detached({
          targets: capture.entries.map((e) => ({
            target: e.target,
            source: sources.estimates.readSyntheticPrototypeSources(e.target),
            release: e.release.read('staff'),
            intelligence: readIntelligenceWorkflowAttempt(
              sources.estimates,
              e.target,
              sources.gate,
            ),
          })),
          members: sources.operations.syntheticMemberships(
            capture.organization_id,
          ),
          property: sources.property.read(capture.organization_id),
        }),
      );
      capture.check();
      check = () => {
        if (!verifiedSuggestionsEnabled(enabled))
          throw Error('Local review is off');
        capture.check();
      };
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
    changed ||
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.signature !== signature
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
  return verifiedSuggestionsEnabled(enabled) && signature !== 'UNAVAILABLE' ? (
    <SuggestionsForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="verified-suggestions"
      aria-label="Source-checked operating suggestions"
    >
      <h2>Source-checked operating suggestions</h2>
      <p>
        {enabled
          ? 'Current exact source evidence is unavailable. Prior action reviews are withheld.'
          : 'Source-checked operating suggestions is off. Confirm the local company source first.'}
      </p>
    </section>
  );
}
const clear: VerifiedSuggestionsFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
  band: 'all',
  source_kind: 'all',
  verification: 'all',
};
const bandLabel = {
  EVIDENCE_GAP: 'Verify missing evidence',
  EARLIER_CONTEXT: 'Earlier recorded context',
  REVIEW_DAY_CONTEXT: 'Review-day recorded context',
  LATER_CONTEXT: 'Later recorded context',
  UNDATED_CONTEXT: 'Undated context',
};
function SuggestionsForm({
  sources,
  onSelectJob,
}: {
  sources: OperatingSources;
  onSelectJob?: (jobId: string) => void;
}) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    generation = useRef(0),
    admission = useRef<{ enabled: boolean; confirmed: boolean } | null>(null);
  const [day, setDay] = useState(sources.entries[0].day),
    [timezone, setTimezone] = useState(sources.entries[0].timezone),
    [ordering, setOrdering] =
      useState<VerifiedSuggestionsInput['ordering']>('EVIDENCE_FIRST'),
    [confirmed, setConfirmed] = useState(false),
    [revision, setRevision] = useState(1),
    [review, setReview] = useState<VerifiedOperatingSuggestionsReview | null>(
      null,
    ),
    [filter, setFilter] = useState(clear),
    [limit, setLimit] = useState(8),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openVerifiedSuggestionSource>
    > | null>(null),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  useEffect(
    () => () => {
      generation.current++;
      if (admission.current) admission.current.confirmed = false;
    },
    [sources],
  );
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    if (admission.current) admission.current.confirmed = false;
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
    setRevision((r) => r + 1);
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || busy || held) return;
    try {
      capacityDay(day, timezone);
    } catch {
      setError('Choose a valid civil day and explicit IANA timezone.');
      return;
    }
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    admission.current = gate;
    setBusy(true);
    setError('');
    setReview(null);
    setDetail(null);
    setStatus('');
    try {
      const next = await readVerifiedOperatingSuggestions(
        sources,
        { review_on: day, timezone, input_revision: revision, ordering },
        gate,
      );
      if (token !== generation.current || !gate.confirmed) return;
      if (
        (await inspectVerifiedOperatingSuggestions(next)).status !==
        'CURRENT_READ_ONLY_SUGGESTIONS'
      )
        throw Error('UNKNOWN');
      if (token !== generation.current || !gate.confirmed) return;
      filterVerifiedOperatingSuggestions(next, clear);
      setReview(next);
      setHeld(true);
      setFilter(clear);
      setLimit(8);
      setStatus(
        'Source-checked suggestions retained. State matching never grants action authority.',
      );
    } catch {
      if (token === generation.current) {
        setHeld(true);
        setError(
          'UNKNOWN — original evidence is withheld. No automatic replacement review.',
        );
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function update(next: VerifiedSuggestionsFilter) {
    generation.current++;
    setBusy(false);
    setFilter(next);
    setLimit(8);
    setDetail(null);
    setStatus('');
  }
  async function open(key: string) {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    setDetail(null);
    setError('');
    try {
      const next = await openVerifiedSuggestionSource(review, key);
      if (token !== generation.current || !admission.current?.confirmed) return;
      assertVerifiedSuggestionsCurrent(next);
      setDetail(next);
      setStatus('Exact original source opened. Navigation only.');
    } catch {
      if (token === generation.current) {
        setHeld(true);
        setReview(null);
        setError('UNKNOWN — the exact source can no longer be verified.');
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function navigate() {
    if (!review || !detail) return;
    try {
      const next = openVerifiedSuggestionJob(detail);
      onSelectJob?.(next.target.job_id!);
      openVerifiedSuggestionJob(detail);
    } catch {
      setHeld(true);
      setReview(null);
      setDetail(null);
      setError('UNKNOWN — exact job navigation is unavailable.');
    }
  }
  async function reconcile() {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    const result = await inspectVerifiedOperatingSuggestions(review);
    if (token !== generation.current) return;
    if (result.status === 'CURRENT_READ_ONLY_SUGGESTIONS')
      setStatus(
        'Exact retained daily review remains current. Nothing was replayed.',
      );
    else {
      setHeld(true);
      setReview(null);
      setDetail(null);
      setError(
        'UNKNOWN — original source or access changed. No replacement is inferred.',
      );
    }
    setBusy(false);
  }
  let matches: ReturnType<typeof filterVerifiedOperatingSuggestions> | null =
    null;
  try {
    if (review) {
      matches = filterVerifiedOperatingSuggestions(review, filter);
      if (detail) assertVerifiedSuggestionsCurrent(detail);
    }
  } catch {
    matches = null; // Withhold every prior detail after any failed render fence.
  }
  return (
    <section
      className="verified-suggestions"
      aria-label="Source-checked operating suggestions"
    >
      <header>
        <p className="verified-suggestions-eyebrow">
          Business Copilot · source-checked staff review
        </p>
        <h2>Source-checked operating suggestions</h2>
        <p>
          Check each existing suggestion against exact recorded source and
          workflow state. Facts, staff criteria, manual next review and blocked
          authority remain separate.
        </p>
      </header>
      <form
        aria-label="Suggestion source review context"
        onSubmit={(e) => void prepare(e)}
      >
        <div className="verified-suggestions-context">
          <label htmlFor={`${id}-day`}>
            Review day
            <input
              id={`${id}-day`}
              type="date"
              value={day}
              disabled={held}
              onChange={(e) => {
                invalidate();
                setDay(e.target.value);
              }}
            />
          </label>
          <label htmlFor={`${id}-zone`}>
            IANA timezone
            <input
              id={`${id}-zone`}
              value={timezone}
              disabled={held}
              onChange={(e) => {
                invalidate();
                setTimezone(e.target.value);
              }}
            />
          </label>
          <label htmlFor={`${id}-order`}>
            Staff-selected review order
            <select
              id={`${id}-order`}
              value={ordering}
              disabled={held}
              onChange={(e) => {
                invalidate();
                setOrdering(
                  e.target.value as VerifiedSuggestionsInput['ordering'],
                );
              }}
            >
              <option value="EVIDENCE_FIRST">Evidence gaps first</option>
              <option value="RECORDED_DAY_FIRST">
                Recorded source day first
              </option>
            </select>
          </label>
        </div>
        <label className="verified-suggestions-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I confirm this exact company, selected-job set and review criteria for
          human review only.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          {busy
            ? 'Checking exact sources…'
            : 'Review source-checked suggestions'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {busy && <p role="status">Checking current evidence…</p>}
      {review && !matches && (
        <p role="alert">
          UNKNOWN — prior source details are withheld after source or access
          changes.
        </p>
      )}
      {review && matches && (
        <div className="verified-suggestions-results">
          <div className="verified-suggestions-metrics">
            <div>
              <span>Selected jobs</span>
              <strong>{review.coverage.selected_jobs}</strong>
              <small>Available exact records only</small>
            </div>
            <div>
              <span>UNKNOWN state checks</span>
              <strong>{review.verification_counts.unknown}</strong>
              <small>Unknown does not mean resolved</small>
            </div>
            <div>
              <span>Recorded-state matches</span>
              <strong>
                {review.verification_counts.matched_recorded_state}
              </strong>
              <small>Not dispatch or physical completion</small>
            </div>
          </div>
          <p className="verified-suggestions-note">{review.limits}</p>
          <p className="verified-suggestions-note">
            Selected criterion:{' '}
            {review.selected_criteria.ordering === 'EVIDENCE_FIRST'
              ? 'Evidence gaps first'
              : 'Recorded source day first'}
            . A date before the review day never proves a missed appointment or
            overdue obligation.
          </p>
          <div
            className="verified-suggestions-filters"
            aria-label="Suggestion source and state filters"
          >
            <label htmlFor={`${id}-query`}>
              Search facts and review suggestions
              <input
                id={`${id}-query`}
                type="search"
                value={filter.query}
                maxLength={200}
                onChange={(e) => update({ ...filter, query: e.target.value })}
              />
            </label>
            <label htmlFor={`${id}-area`}>
              Area
              <select
                id={`${id}-area`}
                value={filter.area}
                onChange={(e) =>
                  update({
                    ...filter,
                    area: e.target.value as VerifiedSuggestionsFilter['area'],
                  })
                }
              >
                <option value="all">All areas</option>
                <option value="finance">Finance</option>
                <option value="field">Field operations</option>
                <option value="documentation">Published documentation</option>
                <option value="scope">Issued scope</option>
              </select>
            </label>
            <label htmlFor={`${id}-band`}>
              Review band
              <select
                id={`${id}-band`}
                value={filter.band}
                onChange={(e) =>
                  update({
                    ...filter,
                    band: e.target.value as VerifiedSuggestionsFilter['band'],
                  })
                }
              >
                <option value="all">All review bands</option>
                {actionReviewBands.map((b) => (
                  <option key={b} value={b}>
                    {bandLabel[b]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-level`}>
              Evidence type
              <select
                id={`${id}-level`}
                value={filter.level}
                onChange={(e) =>
                  update({
                    ...filter,
                    level: e.target.value as VerifiedSuggestionsFilter['level'],
                  })
                }
              >
                <option value="all">All evidence types</option>
                <option value="evidence">Evidence gap</option>
                <option value="review">Recorded evidence</option>
              </select>
            </label>
            <label htmlFor={`${id}-job`}>
              Exact job
              <select
                id={`${id}-job`}
                value={filter.job_id ?? ''}
                onChange={(e) =>
                  update({ ...filter, job_id: e.target.value || null })
                }
              >
                <option value="">All selected jobs</option>
                {review.jobs.map((j) => (
                  <option key={j.target.job_id} value={j.target.job_id!}>
                    {j.context.job_title} · {j.context.customer}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-source-kind`}>
              Source kind
              <select
                id={`${id}-source-kind`}
                value={filter.source_kind}
                onChange={(e) =>
                  update({
                    ...filter,
                    source_kind: e.target
                      .value as VerifiedSuggestionsFilter['source_kind'],
                  })
                }
              >
                <option value="all">All source kinds</option>
                {suggestionSourceKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-verification`}>
              Recorded-state check
              <select
                id={`${id}-verification`}
                value={filter.verification}
                onChange={(e) =>
                  update({
                    ...filter,
                    verification: e.target
                      .value as VerifiedSuggestionsFilter['verification'],
                  })
                }
              >
                <option value="all">All state checks</option>
                <option value="MATCHED_RECORDED_STATE">
                  Recorded state matched
                </option>
                <option value="UNKNOWN">UNKNOWN state</option>
              </select>
            </label>
            <button type="button" onClick={() => update(clear)}>
              Reset suggestion filters
            </button>
          </div>
          <p role="status">
            {matches.matching} matching review items of {matches.available}{' '}
            available. {matches.matched_recorded_state} recorded-state matches;{' '}
            {matches.unknown} UNKNOWN state checks.
          </p>
          {!matches.matching && (
            <div className="verified-suggestions-card">
              <h3>No matching available review items</h3>
              <p>
                Adjust filters. This does not prove complete history, resolved
                concerns or no work remaining.
              </p>
            </div>
          )}
          <ol className="verified-suggestions-list">
            {matches.cards.slice(0, limit).map((c) => (
              <li key={c.key} className="verified-suggestions-card">
                <p className="verified-suggestions-eyebrow">
                  Review #{c.rank} · {c.area}
                </p>
                <div className="verified-suggestions-tags">
                  <span>{bandLabel[c.review_band]}</span>
                  <span>
                    {c.evidence_status === 'UNKNOWN_EVIDENCE_REMAINS'
                      ? 'UNKNOWN evidence remains'
                      : 'Separate authority unverified'}
                  </span>
                </div>
                <h3>{c.context.job}</h3>
                <p>
                  {c.context.customer} · {c.context.property}
                </p>
                <h4>Recorded fact</h4>
                <p>{c.recorded_fact}</p>
                <p>
                  Recorded source day:{' '}
                  {c.recorded_day ?? 'UNKNOWN — no recorded day'} · Source:{' '}
                  {c.source.kind}
                </p>
                <SuggestionState verification={c.verification} />
                <h4>Suggested human review</h4>
                <p>{c.suggested_human_review}</p>
                <details>
                  <summary>Why this review order?</summary>
                  <ul>
                    {c.order_reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <h4>Missing evidence</h4>
                  <ul>
                    {c.missing_evidence.map((e) => (
                      <li key={e.code}>
                        <strong>{e.status}</strong> · {e.detail}
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="verified-suggestions-note">
                  Exact source {c.source.id}
                  {c.source.version === null
                    ? ''
                    : ` · published version ${c.source.version}`}
                </p>
                <VerifiedSuggestionSourceButton
                  kind={c.source.kind}
                  job={c.context.job}
                  disabled={busy}
                  onOpen={() => void open(c.key)}
                />
              </li>
            ))}
          </ol>
          {matches.matching > limit && (
            <button type="button" onClick={() => setLimit((n) => n + 8)}>
              Show more review items
            </button>
          )}
          {detail && (
            <article
              className="verified-suggestions-card"
              aria-label="Inspected suggestion source detail"
            >
              <h3 ref={heading} tabIndex={-1}>
                Inspected suggestion source
              </h3>
              <p>
                {detail.card.context.job} · {detail.card.context.customer} ·{' '}
                {detail.card.context.property}
              </p>
              <SuggestionState verification={detail.card.verification} />
              <dl>
                <dt>Source type and identifier</dt>
                <dd>
                  {detail.source.kind} / {detail.source.id}
                </dd>
                <dt>Published version / source revision</dt>
                <dd>
                  {detail.source.version ?? 'Not applicable'} /{' '}
                  {detail.source.revision ?? 'Not applicable'}
                </dd>
                <dt>Exact job / issued version</dt>
                <dd>
                  {detail.target.job_id} / {detail.target.version_id}
                </dd>
                <dt>Source hash</dt>
                <dd>{detail.card.source.source_sha256}</dd>
              </dl>
              <div
                className="verified-suggestions-source"
                role="region"
                aria-label="Original suggestion source evidence"
                tabIndex={0}
              >
                <pre>{JSON.stringify(detail.detail, null, 2)}</pre>
              </div>
              <p>
                Recorded documentation is not verified repair, customer
                acceptance, available capacity or payment authority.
              </p>
              <button type="button" onClick={navigate}>
                Open exact source job
              </button>
            </article>
          )}
          <details>
            <summary>Review integrity and limits</summary>
            <dl>
              <dt>Review integrity</dt>
              <dd>{review.sha256}</dd>
              <dt>Responsible synthetic reviewer</dt>
              <dd>{review.actor_id}</dd>
              <dt>Custody</dt>
              <dd>
                Session only; no refresh or crash durability. No AI model or
                autonomous actions.
              </dd>
            </dl>
          </details>
          <button
            type="button"
            disabled={busy}
            onClick={() => void reconcile()}
          >
            Reconcile exact suggestion review
          </button>
        </div>
      )}
    </section>
  );
}

function SuggestionState({
  verification,
}: {
  verification: VerifiedOperatingSuggestionsReview['cards'][number]['verification'];
}) {
  return (
    <div className="verified-suggestions-state">
      <h4>Recorded source and workflow checks</h4>
      <p>
        <strong>
          {verification.status === 'MATCHED_RECORDED_STATE'
            ? 'Recorded state matched'
            : 'UNKNOWN recorded state'}
        </strong>{' '}
        · Action authority BLOCKED
      </p>
      <p>{verification.meaning}</p>
      <dl>
        {verification.facts.map((f) => (
          <div key={f.code}>
            <dt>{f.label}</dt>
            <dd>
              {f.value ?? 'UNKNOWN'} · {f.status}
            </dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Required checks and missing authority</summary>
        <ul>
          {verification.required_checks.map((check) => (
            <li key={check.code}>
              <strong>{check.status}</strong> · {check.detail}
            </li>
          ))}
        </ul>
      </details>
      <p>Manual next review: {verification.manual_next_review}</p>
    </div>
  );
}
