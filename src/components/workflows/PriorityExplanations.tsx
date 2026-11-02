import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { capacityDay } from '../../domain/field/crew-capacity';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { readIntelligenceWorkflowAttempt } from '../../lib/workflows/intelligence-workflow';
import {
  readPriorityExplanations,
  filterPriorityExplanations,
  openPriorityExplanation,
  openPriorityExplanationJob,
  inspectPriorityExplanations,
  type PriorityExplanationsReview,
  type PriorityExplanationsFilter,
} from '../../lib/workflows/priority-explanations';
import './priority-explanations.css';

export function PriorityExplanations({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}) {
  let signature = 'OFF',
    sourceCheck: (() => void) | null = null;
  if (enabled)
    try {
      const capture = captureOperatingSources(sources, sources.gate);
      signature = JSON.stringify({
        targets: capture.entries.map((entry) => ({
          target: entry.target,
          source: sources.estimates.readSyntheticPrototypeSources(entry.target),
          release: entry.release.read('staff'),
          intelligence: readIntelligenceWorkflowAttempt(
            sources.estimates,
            entry.target,
            sources.gate,
          ),
        })),
        members: sources.operations.syntheticMemberships(
          capture.organization_id,
        ),
        property: sources.property.read(capture.organization_id),
      });
      sourceCheck = capture.check;
    } catch {
      signature = 'UNAVAILABLE';
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    signature,
    sourceCheck,
    generation: 0,
  });
  let changed = false;
  try {
    binding.sourceCheck?.();
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
      sourceCheck,
      generation: binding.generation + 1,
    });
    return null;
  }
  return enabled && signature !== 'OFF' && signature !== 'UNAVAILABLE' ? (
    <ExplanationForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="priority-explanations"
      aria-label="Explainable operating priorities"
    >
      <h2>Explainable operating priorities</h2>
      <p>
        {enabled
          ? 'Exact current source evidence is unavailable. Prior explanations are withheld.'
          : 'Priority explanations are off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
const clear: PriorityExplanationsFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
};
function ExplanationForm({
  sources,
  onSelectJob,
}: {
  sources: OperatingSources;
  onSelectJob?: (jobId: string) => void;
}) {
  const id = useId(),
    [day, setDay] = useState(sources.entries[0].day),
    [timezone, setTimezone] = useState(sources.entries[0].timezone),
    [confirmed, setConfirmed] = useState(false),
    [revision, setRevision] = useState(1),
    [review, setReview] = useState<PriorityExplanationsReview | null>(null),
    [filter, setFilter] = useState(clear),
    [limit, setLimit] = useState(8),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openPriorityExplanation>
    > | null>(null),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const generation = useRef(0),
    admission = useRef<{ enabled: boolean; confirmed: boolean } | null>(null),
    detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (admission.current) admission.current.confirmed = false;
    },
    [sources],
  );
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  function invalidate() {
    generation.current++;
    if (admission.current) admission.current.confirmed = false;
    if (busy) {
      setBusy(false);
      setHeld(true);
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
    if (!confirmed || held || busy) return;
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
    setStatus('');
    setReview(null);
    setDetail(null);
    try {
      const result = await readPriorityExplanations(
        sources,
        { review_on: day, timezone, input_revision: revision },
        gate,
      );
      if (token !== generation.current || !gate.confirmed) return;
      if (
        (await inspectPriorityExplanations(result)).status !==
        'CURRENT_LOCAL_SOURCE'
      )
        throw Error('UNKNOWN');
      if (token !== generation.current || !gate.confirmed) return;
      filterPriorityExplanations(result, clear);
      setReview(result);
      setFilter(clear);
      setLimit(8);
      setStatus(
        'Exact review explanations prepared. No AI generation or business action executed.',
      );
    } catch {
      if (token === generation.current) {
        setHeld(true);
        setError(
          'Explanation outcome UNKNOWN. Original evidence is withheld; no replacement review.',
        );
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  const update = (next: PriorityExplanationsFilter) => {
    generation.current++;
    setBusy(false);
    setFilter(next);
    setLimit(8);
    setDetail(null);
    setStatus('');
  };
  async function open(key: string) {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    setDetail(null);
    setError('');
    try {
      const next = await openPriorityExplanation(review, key);
      if (token !== generation.current || !admission.current?.confirmed) return;
      openPriorityExplanationJob(review, next.target.job_id!);
      setDetail(next);
      setStatus('Exact unchanged source opened. Navigation only.');
    } catch {
      if (token === generation.current) {
        setReview(null);
        setHeld(true);
        setError('UNKNOWN — source navigation could not be verified.');
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function displayJob() {
    if (!review || !detail) return;
    try {
      const current = openPriorityExplanationJob(review, detail.target.job_id!);
      onSelectJob?.(current.target.job_id!);
      openPriorityExplanationJob(review, detail.target.job_id!);
    } catch {
      setReview(null);
      setDetail(null);
      setHeld(true);
      setError('UNKNOWN — existing job navigation source changed.');
    }
  }
  async function reconcile() {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    try {
      if (
        (await inspectPriorityExplanations(review)).status !==
        'CURRENT_LOCAL_SOURCE'
      )
        throw Error('UNKNOWN');
      if (token !== generation.current) return;
      filterPriorityExplanations(review, filter);
      setStatus(
        'Exact retained explanations remain current. Nothing was replayed.',
      );
    } catch {
      if (token === generation.current) {
        setReview(null);
        setDetail(null);
        setHeld(true);
        setError('UNKNOWN — original source or current access changed.');
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  let matches: ReturnType<typeof filterPriorityExplanations> | null = null;
  try {
    if (review) matches = filterPriorityExplanations(review, filter);
  } catch {
    /* Withhold stale/foreign/revoked evidence immediately during render. */
  }
  return (
    <section
      className="priority-explanations"
      aria-label="Explainable operating priorities"
    >
      <header>
        <div>
          <p className="priority-explanations-eyebrow">
            Review focus · evidence first
          </p>
          <h2>Why this needs review</h2>
          <p>
            Understand the source facts, human review suggestions and evidence
            gaps behind the existing daily order. No urgency, future outcome or
            completed work is inferred.
          </p>
        </div>
      </header>
      <form aria-label="Priority explanation review context" onSubmit={prepare}>
        <div className="priority-context-grid">
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
          <label htmlFor={`${id}-timezone`}>
            IANA timezone
            <input
              id={`${id}-timezone`}
              value={timezone}
              disabled={held}
              onChange={(e) => {
                invalidate();
                setTimezone(e.target.value);
              }}
            />
          </label>
        </div>
        <label className="priority-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I confirm this exact selected-job set and day for source-based human
          review only.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          {busy
            ? 'Checking exact evidence…'
            : 'Explain daily review priorities'}
        </button>
      </form>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && !matches && (
        <p role="alert">
          UNKNOWN — previous explanations are withheld after source or access
          changes.
        </p>
      )}
      {review && matches && (
        <div className="priority-explanations-result">
          <div className="priority-metrics">
            <div>
              <span>Selected jobs</span>
              <strong>{review.coverage.selected_jobs}</strong>
              <small>Available exact sources only</small>
            </div>
            <div>
              <span>Evidence-gap reviews</span>
              <strong>{review.counts.evidence}</strong>
              <small>Missing evidence is not physical severity</small>
            </div>
            <div>
              <span>Recorded-evidence reviews</span>
              <strong>{review.counts.review}</strong>
              <small>Not completion or approval</small>
            </div>
          </div>
          <p className="priority-note">
            {review.date_meaning} {review.order_meaning}
          </p>
          <div
            className="priority-filters"
            aria-label="Priority evidence filters"
          >
            <label htmlFor={`${id}-query`}>
              Search source facts and recommendations
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
                    area: e.target.value as PriorityExplanationsFilter['area'],
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
            <label htmlFor={`${id}-level`}>
              Evidence type
              <select
                id={`${id}-level`}
                value={filter.level}
                onChange={(e) =>
                  update({
                    ...filter,
                    level: e.target
                      .value as PriorityExplanationsFilter['level'],
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
                {review.jobs.map((job, index) => (
                  <option key={job.target.job_id} value={job.target.job_id!}>
                    {index + 1}. {job.context.customer} · {job.context.property}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => update(clear)}>
              Clear filters
            </button>
          </div>
          <p role="status">
            {matches.matching} matching explanations of {matches.available}{' '}
            available. Original review positions are preserved when filtering.
          </p>
          {!matches.matching && (
            <div className="priority-empty">
              <h3>No matching explanations</h3>
              <p>
                Change the filters or literal query. No match does not mean that
                an issue was repaired or that all history is available.
              </p>
            </div>
          )}
          <ol className="priority-explanation-list">
            {matches.explanations.slice(0, limit).map((row) => (
              <li key={row.key}>
                <article>
                  <div className="priority-badges">
                    <span>Review order {row.rank}</span>
                    <span>
                      {row.level === 'evidence'
                        ? 'Evidence gap'
                        : 'Recorded evidence'}
                    </span>
                    <span>{row.area}</span>
                  </div>
                  <h3>
                    {row.context.customer} · {row.context.property}
                  </h3>
                  <p className="priority-job">{row.context.job}</p>
                  <div className="priority-fact-grid">
                    <div>
                      <h4>Recorded source fact</h4>
                      <p>{row.recorded_fact}</p>
                    </div>
                    <div>
                      <h4>Suggested human review</h4>
                      <p>{row.suggested_human_review}</p>
                    </div>
                  </div>
                  <details>
                    <summary>Why this appears in this order</summary>
                    <ul>
                      {row.why_this_order.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                  <details>
                    <summary>
                      What remains unknown or unverified (
                      {row.missing_evidence.length})
                    </summary>
                    <ul>
                      {row.missing_evidence.map((missing) => (
                        <li key={missing.code}>
                          <strong>
                            {missing.code}: {missing.status}
                          </strong>{' '}
                          — {missing.detail}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <p className="priority-note">
                    Source: {row.source.kind} · {row.source.id}
                    {row.source.version !== null
                      ? ` · published version ${row.source.version}`
                      : ''}
                    . Exact saved job revision {row.source.job_revision}.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void open(row.key)}
                  >
                    Open exact source and explanation
                  </button>
                </article>
              </li>
            ))}
          </ol>
          {limit < matches.matching && (
            <button type="button" onClick={() => setLimit((n) => n + 8)}>
              Show more explanations ({matches.matching - limit} remaining)
            </button>
          )}
          {detail && (
            <section
              className="priority-source-detail"
              aria-label="Exact priority explanation source"
            >
              <h3 ref={detailHeading} tabIndex={-1}>
                Original source for review order {detail.explanation.rank}
              </h3>
              <p>{detail.explanation.recorded_fact}</p>
              <p>{detail.explanation.suggested_human_review}</p>
              <dl>
                <div>
                  <dt>Exact job / property</dt>
                  <dd>
                    {detail.target.job_id} / {detail.target.location_id}
                  </dd>
                </div>
                <div>
                  <dt>Original issued estimate / version</dt>
                  <dd>
                    {detail.target.estimate_id} / {detail.target.version_id} ·
                    version{' '}
                    {detail.explanation.source.issued_version.version_number}
                  </dd>
                </div>
                <div>
                  <dt>Exact source</dt>
                  <dd>
                    {detail.source.kind} / {detail.source.id}
                    {detail.source.version !== null
                      ? ` / published version ${detail.source.version}`
                      : ''}
                  </dd>
                </div>
              </dl>
              <h4>Evidence limits</h4>
              <ul>
                {detail.explanation.missing_evidence.map((missing) => (
                  <li key={missing.code}>
                    <strong>{missing.status}</strong> — {missing.detail}
                  </li>
                ))}
              </ul>
              <details>
                <summary>Inspect unchanged safe source detail</summary>
                <div
                  className="priority-source-scroll"
                  role="region"
                  tabIndex={0}
                  aria-label="Unchanged authorized priority source evidence"
                >
                  <pre>{JSON.stringify(detail.detail, null, 2)}</pre>
                </div>
              </details>
              <p className="priority-note">
                Source SHA256: {detail.explanation.source.source_sha256}. Child
                review SHA256: {detail.explanation.source.child_review_sha256}.
              </p>
              <button
                type="button"
                onClick={displayJob}
                disabled={!onSelectJob}
              >
                Display existing job workflow
              </button>
              <button type="button" onClick={() => setDetail(null)}>
                Close source detail
              </button>
            </section>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void reconcile()}
          >
            Check exact retained explanations
          </button>
          <p className="priority-note">
            No AI generation, autonomous action, dispatch, financial/provider
            operation, microphone or customer communication. Same-tab evidence
            only. Integrity: {review.sha256}
          </p>
        </div>
      )}
    </section>
  );
}
