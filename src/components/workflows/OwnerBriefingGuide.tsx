import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { capacityDay } from '../../domain/field/crew-capacity';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import {
  assertOwnerBriefingGuideCurrent,
  filterOwnerBriefingGuide,
  type OwnerBriefingReview,
  type OwnerBriefingFilter,
  ownerBriefingGuideEnabled,
  readOwnerBriefingGuide,
  openOwnerBriefingTask,
  assertOwnerBriefingTaskCurrent,
  inspectOwnerBriefingDestination,
  assertOwnerBriefingDestinationCurrent,
  returnOwnerBriefingTask,
  navigateOwnerBriefingTask,
  type OwnerBriefingTask,
  type OwnerBriefingDestination,
} from '../../lib/workflows/owner-briefing-guide';
import './owner-briefing-guide.css';

export function OwnerBriefingGuide({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  let available = false,
    handles: unknown[] = [];
  if (ownerBriefingGuideEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      if (
        selectedJobId !== undefined &&
        (typeof selectedJobId !== 'string' ||
          !capture.entries.some(
            (entry) => entry.target.job_id === selectedJobId,
          ))
      )
        throw Error('Unadmitted selected job hint');
      handles = [
        ...Object.values(
          prototypeFields(sources, [
            'company',
            'operations',
            'estimates',
            'property',
            'entries',
            'gate',
          ]),
        ),
        ...capture.entries.flatMap((entry) => [
          entry,
          entry.target,
          entry.release,
        ]),
      ];
      capture.check();
      available = true;
    } catch {
      available = false;
    }
  const [binding, bind] = useState({
    sources,
    enabled,
    selectedJobId,
    available,
    handles,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.selectedJobId !== selectedJobId ||
    binding.available !== available ||
    binding.handles.length !== handles.length ||
    binding.handles.some((value, i) => value !== handles[i])
  ) {
    bind({
      sources,
      enabled,
      selectedJobId,
      available,
      handles,
      generation: binding.generation + 1,
    });
    return null;
  }
  return available ? (
    <Briefing
      key={binding.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="owner-briefing-guide" aria-label="Owner briefing guide">
      <h2>Owner briefing guide</h2>
      <p>
        {enabled
          ? 'Exact company/job source unavailable. Previous explanations are withheld.'
          : 'Owner briefing guide is off. Confirm local sources first.'}
      </p>
    </section>
  );
}
function Briefing({
  sources,
  selectedJobId,
  onSelectJob,
}: {
  sources: OperatingSources;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  const id = useId(),
    epoch = useRef(0),
    gate = useRef({ enabled: true, confirmed: false }),
    heading = useRef<HTMLHeadingElement>(null),
    briefHeading = useRef<HTMLHeadingElement>(null),
    latestCallback = useRef<typeof onSelectJob>(undefined);
  const [confirmed, confirm] = useState(false),
    [day, setDay] = useState(sources.entries[0].day),
    [timezone, setTimezone] = useState(sources.entries[0].timezone),
    [ordering, setOrdering] = useState<'EVIDENCE_FIRST' | 'RECORDED_DAY_FIRST'>(
      'EVIDENCE_FIRST',
    ),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [review, setReview] = useState<OwnerBriefingReview | null>(null),
    [filter, setFilter] = useState<OwnerBriefingFilter>({
      query: '',
      section: 'all',
      job_id: selectedJobId ?? null,
      band: 'all',
    }),
    [link, setLink] = useState<OwnerBriefingTask | null>(null),
    [showReview, setShowReview] = useState(false),
    [destination, setDestination] = useState<OwnerBriefingDestination | null>(
      null,
    ),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const generation = epoch,
      admission = gate;
    return () => {
      generation.current++;
      admission.current.confirmed = false;
    };
  }, [sources]);
  useLayoutEffect(() => {
    latestCallback.current = onSelectJob;
    return () => {
      latestCallback.current = undefined;
    };
  }, [onSelectJob]);
  useEffect(() => {
    if (link) (showReview ? heading : briefHeading).current?.focus();
  }, [link, destination, showReview]);
  let reviewCurrent = false,
    current = false;
  if (review && confirmed)
    try {
      assertOwnerBriefingGuideCurrent(review);
      reviewCurrent = true;
    } catch {
      reviewCurrent = false;
    }
  if (link && reviewCurrent)
    try {
      assertOwnerBriefingTaskCurrent(link, selectedJobId);
      if (destination)
        assertOwnerBriefingDestinationCurrent(destination, selectedJobId);
      current = true;
    } catch {
      current = false;
    }
  let filtered: ReturnType<typeof filterOwnerBriefingGuide> | null = null;
  if (review && reviewCurrent)
    try {
      filtered = filterOwnerBriefingGuide(review, {
        ...filter,
        job_id: selectedJobId ?? filter.job_id,
      });
    } catch {
      filtered = null;
    }
  async function read(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || held || busy) return;
    try {
      capacityDay(day, timezone);
    } catch {
      setError('Choose a valid day and IANA timezone.');
      return;
    }
    const token = ++epoch.current,
      admission = { enabled: true, confirmed: true };
    gate.current.confirmed = false;
    gate.current = admission;
    setHeld(true);
    setBusy(true);
    setError('');
    try {
      const next = await readOwnerBriefingGuide(
        sources,
        {
          review_on: day,
          timezone,
          ordering,
          input_revision: token,
        },
        admission,
      );
      if (token !== epoch.current || !admission.confirmed) return;
      assertOwnerBriefingGuideCurrent(next);
      setReview(next);
      setStatus(
        'Original suggestions read. Select one to inspect its source and explanation.',
      );
    } catch {
      if (token === epoch.current)
        setError(
          'Source read UNKNOWN. Original finite hold remains; no replacement or replay.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  async function explain(key: string) {
    if (!review || !reviewCurrent || busy) return;
    if (link?.anchor.key === key) {
      try {
        assertOwnerBriefingTaskCurrent(link, selectedJobId);
        setShowReview(true);
      } catch {
        setError(
          'Retained task UNKNOWN or expired. No new inspection or renewed deadline.',
        );
      }
      return;
    }
    const token = ++epoch.current;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = await openOwnerBriefingTask(review, key, selectedJobId);
      if (token !== epoch.current || !gate.current.confirmed) return;
      assertOwnerBriefingTaskCurrent(next, selectedJobId);
      setLink(next);
      setDestination(null);
      setShowReview(true);
    } catch {
      if (token === epoch.current)
        setError(
          'Exact explanation UNKNOWN, stale or already inspected. Original source hold and expiry cannot be renewed.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  function back() {
    if (!link) return;
    const result = returnOwnerBriefingTask(link, selectedJobId);
    if (result.status === 'UNKNOWN')
      setError(
        'Exact briefing return UNKNOWN; no replay, replacement or renewed window.',
      );
    else {
      setShowReview(false);
      setStatus(
        'Returned to the same briefing and filters. Resume retains this original task and deadline.',
      );
    }
  }
  return (
    <section className="owner-briefing-guide" aria-label="Owner briefing guide">
      <p className="briefing-eyebrow">Intelligence · {sources.company.name}</p>
      <h2>Owner briefing guide</h2>
      <p>
        Review the original source-ranked owner suggestions, recorded facts and
        missing evidence. Choose recorded-day context and exact job/source
        filters, then inspect before opening the original local workflow.
        Suggestions never authorize actions or establish operational urgency.
      </p>
      <form onSubmit={(event) => void read(event)}>
        <fieldset disabled={busy || held}>
          <legend>Original daily source review</legend>
          <div className="briefing-controls">
            <label htmlFor={`${id}-day`}>
              Briefing review day
              <input
                id={`${id}-day`}
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
            </label>
            <label htmlFor={`${id}-zone`}>
              Briefing timezone
              <input
                id={`${id}-zone`}
                value={timezone}
                maxLength={100}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </label>
            <label htmlFor={`${id}-ordering`}>
              Original review ordering
              <select
                id={`${id}-ordering`}
                value={ordering}
                onChange={(event) =>
                  setOrdering(event.target.value as typeof ordering)
                }
              >
                <option value="EVIDENCE_FIRST">Evidence gaps first</option>
                <option value="RECORDED_DAY_FIRST">
                  Recorded source day first
                </option>
              </select>
            </label>
          </div>
        </fieldset>
        <label className="briefing-confirm" htmlFor={`${id}-confirm`}>
          <input
            id={`${id}-confirm`}
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              epoch.current++;
              gate.current.confirmed = false;
              confirm(event.target.checked);
              setBusy(false);
            }}
          />
          I confirm the current company, review day and sources.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          Read owner briefing sources
        </button>
      </form>
      {busy && <p role="status">Checking original exact task source…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {review && !reviewCurrent && (
        <p role="alert">
          UNKNOWN — current source or access changed. Prior explanations and
          navigation are withheld.
        </p>
      )}
      {review && reviewCurrent && (
        <p>
          Original review day: {review.review_on} · {review.timezone}. Recorded
          dates are context, not deadlines or available working hours. Ranking
          and source coverage remain those of the original review.
        </p>
      )}
      {link && !showReview && (
        <div className="briefing-retained">
          <h3 ref={briefHeading} tabIndex={-1}>
            Retained owner task review
          </h3>
          <p>
            Selected task: {link.anchor.key} · exact job {link.anchor.job_id}
          </p>
          <p>
            Original inspected / expires: {link.inspected_at} /{' '}
            {link.expires_at}
          </p>
          {!current && (
            <p role="alert">
              UNKNOWN — the retained task is stale or expired. No renewed
              inspection or navigation.
            </p>
          )}
          <button
            type="button"
            disabled={!current || busy}
            onClick={() => void explain(link.anchor.key)}
          >
            Resume selected task review
          </button>
        </div>
      )}
      {reviewCurrent && !showReview && (
        <>
          <div className="briefing-controls">
            <label htmlFor={`${id}-search`}>
              Search owner briefing evidence
              <input
                id={`${id}-search`}
                value={filter.query}
                maxLength={200}
                onChange={(event) =>
                  setFilter({ ...filter, query: event.target.value })
                }
              />
            </label>
            <label htmlFor={`${id}-band`}>
              Recorded review context
              <select
                id={`${id}-band`}
                value={filter.band}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    band: event.target.value as OwnerBriefingFilter['band'],
                  })
                }
              >
                <option value="all">All recorded contexts</option>
                <option value="EVIDENCE_GAP">Evidence gaps</option>
                <option value="EARLIER_CONTEXT">
                  Recorded before review day
                </option>
                <option value="REVIEW_DAY_CONTEXT">
                  Recorded on review day
                </option>
                <option value="LATER_CONTEXT">Recorded after review day</option>
                <option value="UNDATED_CONTEXT">No recorded source day</option>
              </select>
            </label>
            <label htmlFor={`${id}-job`}>
              Exact briefing job
              <select
                id={`${id}-job`}
                disabled={selectedJobId !== undefined}
                value={selectedJobId ?? filter.job_id ?? ''}
                onChange={(event) =>
                  setFilter({ ...filter, job_id: event.target.value || null })
                }
              >
                {selectedJobId === undefined && (
                  <option value="">All admitted jobs</option>
                )}
                {review?.jobs.map((job) => (
                  <option key={job.target.job_id} value={job.target.job_id!}>
                    {job.context.job_title} · {job.target.job_id}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-section`}>
              Original workflow section
              <select
                id={`${id}-section`}
                value={filter.section}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    section: event.target
                      .value as OwnerBriefingFilter['section'],
                  })
                }
              >
                <option value="all">All original source sections</option>
                <option value="sales">Issued scope</option>
                <option value="field">Recorded field context</option>
                <option value="finance">Financial requirements</option>
                <option value="completion">Published documentation</option>
              </select>
            </label>
          </div>
          <p role="status">
            {filtered
              ? `${filtered.matching} matching of ${filtered.available} original suggestions`
              : 'Exact source filter UNKNOWN; no alternate selected.'}
          </p>
          {filtered?.matching === 0 && (
            <p>No recorded suggestion matches these source filters.</p>
          )}
          <ul className="briefing-list">
            {filtered?.tasks.map((task) => (
              <li key={task.key}>
                <strong>
                  Original rank {task.rank} · {task.context.job}
                </strong>
                <p>Recorded fact: {task.recorded_fact}</p>
                <p>Recommended manual review: {task.suggested_human_review}</p>
                <p>
                  Source: {task.source.kind} · {task.source.id}
                </p>
                <p>
                  Recorded workflow status: {task.verification.status}. Review
                  context: {task.review_band}. Original destination:{' '}
                  {task.navigation.label}.
                </p>
                <details>
                  <summary>Original reasons and missing evidence</summary>
                  <ul>
                    {task.order_reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  <ul>
                    {task.missing_evidence.map((gap) => (
                      <li key={gap.code}>
                        <strong>
                          {gap.code} · {gap.status}
                        </strong>
                        <p>{gap.detail}</p>
                      </li>
                    ))}
                  </ul>
                </details>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Inspect owner task source: ${task.source.kind} for ${task.job_id}`}
                  onClick={() => void explain(task.key)}
                >
                  Inspect owner task source
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {link && showReview && (
        <div className="briefing-card">
          <h3 ref={heading} tabIndex={-1}>
            {destination
              ? 'Original task review destination'
              : 'Inspected owner task source'}
          </h3>
          <dl>
            <dt>Selected suggestion / job</dt>
            <dd>
              {link.anchor.key} / {link.anchor.job_id}
            </dd>
            <dt>Source kind / immutable ID</dt>
            <dd>
              {link.anchor.source_kind} / {link.anchor.source_id}
            </dd>
            <dt>Recorded source version / revision</dt>
            <dd>
              {link.anchor.source_version ?? 'Not versioned'} /{' '}
              {link.anchor.source_revision ?? 'Not revisioned'}
            </dd>
            <dt>Original inspected / expires</dt>
            <dd>
              {link.inspected_at} / {link.expires_at}
            </dd>
          </dl>
          <p>
            Original five-minute local review window. Return and stage changes
            retain this deadline. Currentness is checked on render and
            interaction; this window grants no business authority or durable
            custody.
          </p>
          {!current ? (
            <p role="alert">
              UNKNOWN — expired, withdrawn or stale. Selected identity is
              retained as read-only reference; facts and navigation are
              withheld.
            </p>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={back}>
                Return to owner briefing
              </button>
              <dl>
                <dt>Issued version</dt>
                <dd>{link.anchor.issued_version_id}</dd>
                <dt>Exact source SHA-256</dt>
                <dd>{link.anchor.source_sha256}</dd>
                <dt>Review day / timezone</dt>
                <dd>
                  {link.anchor.review_on} / {link.anchor.timezone}
                </dd>
              </dl>
              {!destination ? (
                <>
                  <h4>Why this suggestion exists</h4>
                  <p>{link.recorded_fact}</p>
                  <p>
                    Recommended manual review: {link.recommended_manual_review}
                  </p>
                  <h4>Original rank {link.original_rank} explanation</h4>
                  <ul>
                    {[...link.why_this_order, ...link.order_reasons].map(
                      (reason, i) => (
                        <li key={i}>{reason}</li>
                      ),
                    )}
                  </ul>
                  <h4>Missing source evidence</h4>
                  <ul>
                    {link.missing_evidence.map((item) => (
                      <li key={item.code}>
                        <strong>
                          {item.code} · {item.status}
                        </strong>
                        <p>{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      try {
                        setDestination(
                          inspectOwnerBriefingDestination(link, selectedJobId),
                        );
                        setStatus(
                          'Original review destination inspected; the same suggestion and deadline are retained.',
                        );
                      } catch {
                        setError(
                          'Exact destination UNKNOWN. No alternate review is selected.',
                        );
                      }
                    }}
                  >
                    Inspect original workflow destination
                  </button>
                </>
              ) : (
                <>
                  <h4>{destination.destination.label}</h4>
                  <p>{destination.destination.meaning}</p>
                  <p>
                    Existing section:{' '}
                    {destination.destination.section ?? 'UNKNOWN'}
                  </p>
                  <h4>Exact recorded workflow checks</h4>
                  <ul>
                    {destination.required_checks.map((check) => (
                      <li key={check.code}>
                        <strong>
                          {check.code} · {check.status}
                        </strong>
                        <p>{check.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <h4>Recorded facts</h4>
                  <dl>
                    {destination.facts.map((fact) => (
                      <div key={fact.code}>
                        <dt>
                          {fact.label} · {fact.status}
                        </dt>
                        <dd>{fact.value ?? 'UNKNOWN'}</dd>
                      </div>
                    ))}
                  </dl>
                  <h4>Missing evidence and blocked actions</h4>
                  <ul>
                    {destination.gaps.map((gap) => (
                      <li key={gap.code}>
                        <strong>
                          {gap.code} · {gap.status}
                        </strong>
                        <p>{gap.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="briefing-actions">
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !onSelectJob ||
                        destination.destination.status !==
                          'EXACT_LOCAL_REVIEW_TARGET'
                      }
                      onClick={() => {
                        if (onSelectJob) {
                          const expected = onSelectJob;
                          const result = navigateOwnerBriefingTask(
                            destination,
                            (jobId, section) => {
                              if (latestCallback.current !== expected)
                                throw Error(
                                  'Current owner briefing callback changed',
                                );
                              expected(jobId, section);
                            },
                            selectedJobId,
                          );
                          setStatus(
                            result.status === 'UNKNOWN'
                              ? 'UNKNOWN — original task review withheld.'
                              : 'Original task review requested. Host navigation may close this local return path.',
                          );
                        }
                      }}
                    >
                      Open original workflow review
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      <p className="briefing-muted">
        Same-tab synthetic staff review only. Recommendations never execute
        actions. No AI/provider, message, dispatch or financial/hosted write.
        Release1.0 NOT READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
