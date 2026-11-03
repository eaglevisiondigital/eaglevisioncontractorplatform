import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { capacityDay } from '../../domain/field/crew-capacity';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import {
  assertOperatingNavigationCurrent,
  filterOperatingNavigation,
  type OperatingNavigationReview,
  type OperatingNavigationFilter,
  type OperatingJobSection,
} from '../../lib/workflows/operating-navigation';
import {
  explainableTaskLinksEnabled,
  readExplainableTaskLinks,
  openExplainableTaskLink,
  assertExplainableTaskLinkCurrent,
  inspectExplainableDestination,
  assertExplainableDestinationCurrent,
  returnExplainableTaskLink,
  navigateExplainableTaskLink,
  type ExplainableTaskLink,
  type ExplainableTaskDestination,
} from '../../lib/workflows/explainable-task-links';
import './explainable-task-links.css';

export function ExplainableTaskLinks({
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
  if (explainableTaskLinksEnabled(enabled))
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
    <TaskLinks
      key={binding.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="explainable-task-links"
      aria-label="Explainable daily task links"
    >
      <h2>Explainable daily task links</h2>
      <p>
        {enabled
          ? 'Exact company/job source unavailable. Previous explanations are withheld.'
          : 'Explainable daily task links are off. Confirm local sources first.'}
      </p>
    </section>
  );
}
function TaskLinks({
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
    heading = useRef<HTMLHeadingElement>(null);
  const [confirmed, confirm] = useState(false),
    [day, setDay] = useState(sources.entries[0].day),
    [timezone, setTimezone] = useState(sources.entries[0].timezone),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [review, setReview] = useState<OperatingNavigationReview | null>(null),
    [filter, setFilter] = useState<OperatingNavigationFilter>({
      query: '',
      section: 'all',
      job_id: selectedJobId ?? null,
      band: 'all',
    }),
    [link, setLink] = useState<ExplainableTaskLink | null>(null),
    [destination, setDestination] = useState<ExplainableTaskDestination | null>(
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
  useEffect(() => {
    if (link) heading.current?.focus();
  }, [link, destination]);
  let reviewCurrent = false,
    current = false;
  if (review && confirmed)
    try {
      assertOperatingNavigationCurrent(review);
      reviewCurrent = true;
    } catch {
      reviewCurrent = false;
    }
  if (link && reviewCurrent)
    try {
      assertExplainableTaskLinkCurrent(link, selectedJobId);
      if (destination)
        assertExplainableDestinationCurrent(destination, selectedJobId);
      current = true;
    } catch {
      current = false;
    }
  let filtered: ReturnType<typeof filterOperatingNavigation> | null = null;
  if (review && reviewCurrent)
    try {
      filtered = filterOperatingNavigation(review, {
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
      const next = await readExplainableTaskLinks(
        sources,
        {
          review_on: day,
          timezone,
          ordering: 'EVIDENCE_FIRST',
          input_revision: token,
        },
        admission,
      );
      if (token !== epoch.current || !admission.confirmed) return;
      assertOperatingNavigationCurrent(next);
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
    const token = ++epoch.current;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = await openExplainableTaskLink(review, key, selectedJobId);
      if (token !== epoch.current || !gate.current.confirmed) return;
      assertExplainableTaskLinkCurrent(next, selectedJobId);
      setLink(next);
      setDestination(null);
    } catch {
      if (token === epoch.current)
        setError(
          'Exact explanation UNKNOWN, stale or already inspected. Original source hold and expiry cannot be renewed.',
        );
    } finally {
      if (token === epoch.current) setBusy(false);
    }
  }
  return (
    <section
      className="explainable-task-links"
      aria-label="Explainable daily task links"
    >
      <p className="explanation-eyebrow">
        Intelligence · {sources.company.name}
      </p>
      <h2>Explainable daily task links</h2>
      <p>
        Follow one source-based recommendation through its missing evidence and
        original local review destination. The original ordering and blocked
        action authority remain unchanged.
      </p>
      <form onSubmit={(event) => void read(event)}>
        <fieldset disabled={busy || held}>
          <legend>Original daily source review</legend>
          <div className="explanation-controls">
            <label htmlFor={`${id}-day`}>
              Review day
              <input
                id={`${id}-day`}
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
            </label>
            <label htmlFor={`${id}-zone`}>
              Review timezone
              <input
                id={`${id}-zone`}
                value={timezone}
                maxLength={100}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <label className="explanation-confirm" htmlFor={`${id}-confirm`}>
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
          I confirm the current local company, sources and review day.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          Read explainable task sources
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
      {reviewCurrent && !link && (
        <>
          <div className="explanation-controls">
            <label htmlFor={`${id}-search`}>
              Search recorded task evidence
              <input
                id={`${id}-search`}
                value={filter.query}
                maxLength={200}
                onChange={(event) =>
                  setFilter({ ...filter, query: event.target.value })
                }
              />
            </label>
            <label htmlFor={`${id}-section`}>
              Original review section
              <select
                id={`${id}-section`}
                value={filter.section}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    section: event.target
                      .value as OperatingNavigationFilter['section'],
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
          <ul className="explanation-list">
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
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Explain selected suggestion: ${task.source.kind} for ${task.job_id}`}
                  onClick={() => void explain(task.key)}
                >
                  Explain selected suggestion
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {link && (
        <div className="explanation-card">
          <h3 ref={heading} tabIndex={-1}>
            {destination
              ? 'Original task review destination'
              : 'Selected suggestion explanation'}
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
                          inspectExplainableDestination(link, selectedJobId),
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
                    Inspect original review destination
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
                  <div className="explanation-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const result = returnExplainableTaskLink(
                          link,
                          selectedJobId,
                        );
                        if (result.status === 'UNKNOWN')
                          setError(
                            'Exact suggestion return UNKNOWN; no replacement or renewed window.',
                          );
                        else {
                          setDestination(null);
                          setStatus(
                            'Returned to the same selected suggestion and original deadline.',
                          );
                        }
                      }}
                    >
                      Return to selected suggestion
                    </button>
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
                          const result = navigateExplainableTaskLink(
                            destination,
                            onSelectJob,
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
                      Open original task review
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      <p className="explanation-muted">
        Same-tab synthetic staff review only. Recommendations never execute
        actions. No AI/provider, message, dispatch or financial/hosted write.
        Release1.0 NOT READY / NOT AUTHORIZED.
      </p>
    </section>
  );
}
