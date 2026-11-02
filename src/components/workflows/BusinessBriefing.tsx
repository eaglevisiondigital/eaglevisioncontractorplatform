import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { readIntelligenceWorkflowAttempt } from '../../lib/workflows/intelligence-workflow';
import { capacityDay } from '../../domain/field/crew-capacity';
import {
  readBusinessBriefing,
  filterBusinessBriefing,
  inspectBusinessBriefing,
  openBusinessBriefingJob,
  openBusinessBriefingSource,
  type BusinessBriefingReview,
  type BusinessBriefingFilter,
} from '../../lib/workflows/business-briefing';
import './business-briefing.css';

export function BusinessBriefing({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}) {
  let signature = 'OFF';
  if (enabled)
    try {
      const captured = captureOperatingSources(sources, sources.gate);
      signature = JSON.stringify({
        jobs: captured.entries.map((e) => ({
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
          captured.organization_id,
        ),
        property: sources.property.read(captured.organization_id),
      });
    } catch {
      signature = 'UNAVAILABLE';
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    signature,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.signature !== signature
  ) {
    bind({ sources, enabled, signature, generation: binding.generation + 1 });
    return null;
  }
  return enabled && signature !== 'OFF' && signature !== 'UNAVAILABLE' ? (
    <BriefingForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="business-briefing"
      aria-label="Business operating briefing"
    >
      <h2>Business operating briefing</h2>
      <p>
        {enabled
          ? 'Exact current operating sources are unavailable. Prior evidence is withheld.'
          : 'Business briefing is off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
const clear: BusinessBriefingFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
};
function BriefingForm({
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
    [revision, setRevision] = useState(1);
  const [review, setReview] = useState<BusinessBriefingReview | null>(null),
    [filter, setFilter] = useState(clear),
    [limit, setLimit] = useState(8),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openBusinessBriefingSource>
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
      setHeld(true);
      setBusy(false);
      setError('Outcome UNKNOWN after withdrawal. No replay or replacement.');
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
    setReview(null);
    setDetail(null);
    setError('');
    setStatus('');
    try {
      const result = await readBusinessBriefing(
        sources,
        { review_on: day, timezone, input_revision: revision },
        gate,
      );
      if (token !== generation.current || !gate.confirmed) return;
      if (
        (await inspectBusinessBriefing(result)).status !==
        'CURRENT_LOCAL_SOURCE'
      )
        throw Error('Unknown source');
      if (token !== generation.current || !gate.confirmed) return;
      filterBusinessBriefing(result, clear); // Final synchronous original-source/current-member fence.
      setReview(result);
      setFilter(clear);
      setLimit(8);
      setStatus(
        'Current local briefing prepared. No action, message or AI generation executed.',
      );
    } catch {
      if (token === generation.current) {
        setHeld(true);
        setError(
          'Briefing outcome UNKNOWN. Evidence is withheld; no automatic replay or replacement.',
        );
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function updateFilter(next: BusinessBriefingFilter) {
    generation.current++;
    setBusy(false); // Cancel presentation of an older in-flight source selection.
    setFilter(next);
    setLimit(8);
    setDetail(null);
    setStatus('');
  }
  function selectJob(jobId: string) {
    if (!review) return;
    try {
      openBusinessBriefingJob(review, jobId);
      onSelectJob?.(jobId);
      openBusinessBriefingJob(review, jobId);
      setStatus('Exact recorded job selected. Navigation only.');
    } catch {
      setReview(null);
      setDetail(null);
      setHeld(true);
      setError('UNKNOWN — exact job source changed or access was withdrawn.');
    }
  }
  async function open(key: string) {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    setDetail(null);
    setError('');
    try {
      const source = await openBusinessBriefingSource(review, key);
      if (token !== generation.current || !admission.current?.confirmed) return;
      openBusinessBriefingJob(review, source.target.job_id!);
      onSelectJob?.(source.target.job_id!);
      openBusinessBriefingJob(review, source.target.job_id!);
      setDetail(source);
      setStatus(
        'Exact original source opened. Published evidence is unchanged.',
      );
    } catch {
      if (token === generation.current) {
        setReview(null);
        setHeld(true);
        setError('UNKNOWN — exact source navigation could not be verified.');
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function reconcile() {
    if (!review || busy) return;
    const token = generation.current;
    setBusy(true);
    try {
      const result = await inspectBusinessBriefing(review);
      if (token !== generation.current) return;
      if (result.status !== 'CURRENT_LOCAL_SOURCE') throw Error('UNKNOWN');
      filterBusinessBriefing(review, filter);
      setStatus('Exact retained briefing is current. No action was replayed.');
    } catch {
      if (token === generation.current) {
        setReview(null);
        setDetail(null);
        setHeld(true);
        setError('UNKNOWN — original evidence is unavailable; no replacement.');
      }
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  let matches: ReturnType<typeof filterBusinessBriefing> | null = null;
  try {
    if (review) matches = filterBusinessBriefing(review, filter);
  } catch {
    /* Withhold stale or revoked evidence immediately during rendering. */
  }
  return (
    <section
      className="business-briefing"
      aria-label="Business operating briefing"
    >
      <div className="business-briefing-heading">
        <p className="business-briefing-eyebrow">
          Daily focus · exact selected jobs
        </p>
        <h2>Business briefing</h2>
        <p>
          One readable review queue across {sources.entries.length} jobs.
          Source-backed suggestions stay separate from dispatch, financial
          actions and customer communication.
        </p>
      </div>
      <form aria-label="Business briefing context" onSubmit={prepare}>
        <div className="business-briefing-context">
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
        <label className="briefing-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={held}
            onChange={(e) => {
              invalidate();
              setConfirmed(e.target.checked);
            }}
          />
          I confirm this exact selected-job set and day for staff review only.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          {busy ? 'Reading original sources…' : 'Prepare business briefing'}
        </button>
      </form>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {review && !matches && (
        <p role="alert">
          UNKNOWN — current source access changed. Previous cards are withheld.
        </p>
      )}
      {review && matches && (
        <div className="business-briefing-result">
          <div className="briefing-metrics">
            <div>
              <span>Selected jobs</span>
              <strong>{review.coverage.selected_jobs}</strong>
              <small>Available exact sources only</small>
            </div>
            <div>
              <span>Evidence-gap reviews</span>
              <strong>
                {review.cards.filter((c) => c.level === 'evidence').length}
              </strong>
              <small>Review priority, not severity or urgency</small>
            </div>
            <div>
              <span>Financial coverage</span>
              <strong>
                {
                  review.jobs.filter((j) => j.finance.coverage !== 'UNKNOWN')
                    .length
                }
                /{review.jobs.length}
              </strong>
              <small>Missing coverage remains UNKNOWN</small>
            </div>
          </div>
          <p className="briefing-note">
            {review.date_meaning} {review.order_meaning}
          </p>
          <div
            className="briefing-filters"
            aria-label="Briefing evidence filters"
          >
            <label htmlFor={`${id}-query`}>
              Search available evidence
              <input
                id={`${id}-query`}
                type="search"
                value={filter.query}
                maxLength={200}
                onChange={(e) =>
                  updateFilter({ ...filter, query: e.target.value })
                }
              />
            </label>
            <label htmlFor={`${id}-job`}>
              Job
              <select
                id={`${id}-job`}
                value={filter.job_id ?? ''}
                onChange={(e) =>
                  updateFilter({ ...filter, job_id: e.target.value || null })
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
            <label htmlFor={`${id}-area`}>
              Review area
              <select
                id={`${id}-area`}
                value={filter.area}
                onChange={(e) =>
                  updateFilter({
                    ...filter,
                    area: e.target.value as BusinessBriefingFilter['area'],
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
              Review type
              <select
                id={`${id}-level`}
                value={filter.level}
                onChange={(e) =>
                  updateFilter({
                    ...filter,
                    level: e.target.value as BusinessBriefingFilter['level'],
                  })
                }
              >
                <option value="all">All review types</option>
                <option value="evidence">Evidence gap</option>
                <option value="review">Recorded evidence</option>
              </select>
            </label>
            <button type="button" onClick={() => updateFilter(clear)}>
              Clear filters
            </button>
          </div>
          <p role="status">
            {matches.matching} matching review items of {matches.available}{' '}
            available. This does not imply complete company history.
          </p>
          {!matches.matching && (
            <div className="briefing-empty">
              <h3>No matching review items</h3>
              <p>
                Try another area, exact job or literal search. Missing records
                do not prove that work was completed.
              </p>
            </div>
          )}
          <ol className="briefing-cards">
            {matches.cards.slice(0, limit).map((card) => (
              <li key={card.key}>
                <article>
                  <div className="briefing-card-labels">
                    <span>
                      {card.level === 'evidence'
                        ? 'Evidence gap'
                        : 'Recorded evidence'}
                    </span>
                    <span>{card.area}</span>
                    <span>{card.recorded_day ?? 'No recorded day'}</span>
                  </div>
                  <h3>{card.observation}</h3>
                  <p className="briefing-job-context">
                    {card.customer_label} · {card.property_label}
                  </p>
                  <p>{card.job_label}</p>
                  <p>{card.suggested_review}</p>
                  <p className="briefing-note">
                    Source: {card.source.kind} · {card.source.id}
                    {card.source.version !== null
                      ? ` · published version ${card.source.version}`
                      : ''}
                    {card.source.revision !== null
                      ? ` · saved revision ${card.source.revision}`
                      : ''}
                  </p>
                  <div className="briefing-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void open(card.key)}
                    >
                      Open exact {card.source.kind} evidence
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => selectJob(card.job_id)}
                    >
                      Select this exact job
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ol>
          {limit < matches.matching && (
            <button type="button" onClick={() => setLimit((n) => n + 8)}>
              Show more review items ({matches.matching - limit} remaining)
            </button>
          )}
          {detail && (
            <section
              className="briefing-source"
              aria-label="Exact briefing source"
            >
              <h3 ref={detailHeading} tabIndex={-1}>
                Original source evidence
              </h3>
              <p>{detail.observation}</p>
              <p>{detail.suggested_review}</p>
              <dl>
                <div>
                  <dt>Exact job</dt>
                  <dd>{detail.target.job_id}</dd>
                </div>
                <div>
                  <dt>Property</dt>
                  <dd>{detail.target.location_id}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {detail.source.kind} · {detail.source.id}
                    {detail.source.version !== null
                      ? ` · version ${detail.source.version}`
                      : ''}
                  </dd>
                </div>
              </dl>
              <details>
                <summary>Inspect unchanged safe source detail</summary>
                <pre>{JSON.stringify(detail.detail, null, 2)}</pre>
              </details>
              <button type="button" onClick={() => setDetail(null)}>
                Close source detail
              </button>
            </section>
          )}
          <details>
            <summary>Existing Copilot / Voice / trade review status</summary>
            <p>{review.addons.meaning}</p>
            <ul>
              {review.jobs.map((job) => (
                <li key={job.target.job_id}>
                  {job.context.customer} · {job.context.property}:{' '}
                  {job.existing_intelligence.status} /{' '}
                  {job.existing_intelligence.phase}.{' '}
                  <button
                    type="button"
                    onClick={() => selectJob(job.target.job_id!)}
                  >
                    Select source job for existing review
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <button
            type="button"
            disabled={busy}
            onClick={() => void reconcile()}
          >
            Check exact retained briefing
          </button>
          <p className="briefing-note">
            Staff-only session evidence. No AI generation, assignment, schedule,
            physical completion, invoice, provider or communication action.
            Integrity: {review.sha256}
          </p>
        </div>
      )}
    </section>
  );
}
