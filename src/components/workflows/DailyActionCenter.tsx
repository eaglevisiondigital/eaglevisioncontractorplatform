import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { capacityDay } from '../../domain/field/crew-capacity';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { readIntelligenceWorkflowAttempt } from '../../lib/workflows/intelligence-workflow';
import {
  actionReviewBands,
  readDailyActionCenter,
  filterDailyActionCenter,
  openDailyActionSource,
  openDailyActionJob,
  inspectDailyActionCenter,
  type DailyActionCenterInput,
  type DailyActionCenterFilter,
  type DailyActionCenterReview,
} from '../../lib/workflows/daily-action-center';
import './daily-action-center.css';

/** Preserve the visible phrase in the accessible name for voice navigation. */
export function DailyActionSourceButton({
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

export function DailyActionCenter({
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
  if (enabled)
    try {
      const capture = captureOperatingSources(sources, sources.gate);
      signature = JSON.stringify({
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
      });
      check = capture.check;
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
  return enabled && signature !== 'UNAVAILABLE' ? (
    <ActionForm
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="daily-action" aria-label="Daily action center">
      <h2>Daily action center</h2>
      <p>
        {enabled
          ? 'Current exact source evidence is unavailable. Prior action reviews are withheld.'
          : 'Daily action center is off. Confirm the local company source first.'}
      </p>
    </section>
  );
}
const clear: DailyActionCenterFilter = {
  area: 'all',
  level: 'all',
  job_id: null,
  query: '',
  band: 'all',
};
const bandLabel = {
  EVIDENCE_GAP: 'Verify missing evidence',
  EARLIER_CONTEXT: 'Earlier recorded context',
  REVIEW_DAY_CONTEXT: 'Review-day recorded context',
  LATER_CONTEXT: 'Later recorded context',
  UNDATED_CONTEXT: 'Undated context',
};
function ActionForm({
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
      useState<DailyActionCenterInput['ordering']>('EVIDENCE_FIRST'),
    [confirmed, setConfirmed] = useState(false),
    [revision, setRevision] = useState(1),
    [review, setReview] = useState<DailyActionCenterReview | null>(null),
    [filter, setFilter] = useState(clear),
    [limit, setLimit] = useState(8),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof openDailyActionSource>
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
      const next = await readDailyActionCenter(
        sources,
        { review_on: day, timezone, input_revision: revision, ordering },
        gate,
      );
      if (token !== generation.current || !gate.confirmed) return;
      if (
        (await inspectDailyActionCenter(next)).status !== 'CURRENT_LOCAL_SOURCE'
      )
        throw Error('UNKNOWN');
      if (token !== generation.current || !gate.confirmed) return;
      filterDailyActionCenter(next, clear);
      setReview(next);
      setFilter(clear);
      setLimit(8);
      setStatus(
        'Daily action review prepared from exact sources. No AI action, schedule, message or financial operation executed.',
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
  function update(next: DailyActionCenterFilter) {
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
      const next = await openDailyActionSource(review, key);
      if (token !== generation.current || !admission.current?.confirmed) return;
      openDailyActionJob(review, next.target.job_id!);
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
      const next = openDailyActionJob(review, detail.target.job_id!);
      onSelectJob?.(next.target.job_id!);
      openDailyActionJob(review, detail.target.job_id!);
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
    const result = await inspectDailyActionCenter(review);
    if (token !== generation.current) return;
    if (result.status === 'CURRENT_LOCAL_SOURCE')
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
  let matches: ReturnType<typeof filterDailyActionCenter> | null = null;
  try {
    if (review) matches = filterDailyActionCenter(review, filter);
  } catch {
    /* Withhold stale source during render. */
  }
  return (
    <section className="daily-action" aria-label="Daily action center">
      <header>
        <p className="daily-action-eyebrow">
          Business Copilot · read-only operating desk
        </p>
        <h2>Daily action center</h2>
        <p>
          See what needs human review, why it appears and the exact source
          behind it. Review order is separate from operational urgency.
        </p>
      </header>
      <form
        aria-label="Daily action review context"
        onSubmit={(e) => void prepare(e)}
      >
        <div className="daily-action-context">
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
                  e.target.value as DailyActionCenterInput['ordering'],
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
        <label className="daily-action-check">
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
          {busy ? 'Checking exact sources…' : 'Prepare daily action review'}
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
        <div className="daily-action-results">
          <div className="daily-action-metrics">
            <div>
              <span>Selected jobs</span>
              <strong>{review.coverage.selected_jobs}</strong>
              <small>Available exact records only</small>
            </div>
            <div>
              <span>Evidence-gap reviews</span>
              <strong>{review.counts.evidence}</strong>
              <small>Unknown does not mean resolved</small>
            </div>
            <div>
              <span>Recorded-context reviews</span>
              <strong>{review.counts.review}</strong>
              <small>Not dispatch or physical completion</small>
            </div>
          </div>
          <p className="daily-action-note">{review.limits}</p>
          <p className="daily-action-note">
            Selected criterion:{' '}
            {review.selected_criteria.ordering === 'EVIDENCE_FIRST'
              ? 'Evidence gaps first'
              : 'Recorded source day first'}
            . A date before the review day never proves a missed appointment or
            overdue obligation.
          </p>
          <div
            className="daily-action-filters"
            aria-label="Daily action evidence filters"
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
                    area: e.target.value as DailyActionCenterFilter['area'],
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
                    band: e.target.value as DailyActionCenterFilter['band'],
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
                    level: e.target.value as DailyActionCenterFilter['level'],
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
            <button type="button" onClick={() => update(clear)}>
              Reset action filters
            </button>
          </div>
          <p role="status">
            {matches.matching} matching review items of {matches.available}{' '}
            available.
          </p>
          {!matches.matching && (
            <div className="daily-action-card">
              <h3>No matching available review items</h3>
              <p>
                Adjust filters. This does not prove complete history, resolved
                concerns or no work remaining.
              </p>
            </div>
          )}
          <ol className="daily-action-list">
            {matches.cards.slice(0, limit).map((c) => (
              <li key={c.key} className="daily-action-card">
                <p className="daily-action-eyebrow">
                  Review #{c.rank} · {c.area}
                </p>
                <div className="daily-action-tags">
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
                <p className="daily-action-note">
                  Exact source {c.source.id}
                  {c.source.version === null
                    ? ''
                    : ` · published version ${c.source.version}`}
                </p>
                <DailyActionSourceButton
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
              className="daily-action-card"
              aria-label="Exact daily action source"
            >
              <h3 ref={heading} tabIndex={-1}>
                Exact source review
              </h3>
              <p>
                {detail.card.context.job} · {detail.card.context.customer} ·{' '}
                {detail.card.context.property}
              </p>
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
                className="daily-action-source"
                role="region"
                aria-label="Original source evidence"
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
            Reconcile exact daily review
          </button>
        </div>
      )}
    </section>
  );
}
