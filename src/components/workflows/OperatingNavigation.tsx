import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { capacityDay } from '../../domain/field/crew-capacity';
import { prototypeFields } from '../../lib/program/prototype-source';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { actionReviewBands } from '../../lib/workflows/daily-action-center';
import type { VerifiedSuggestionsInput } from '../../lib/workflows/verified-operating-suggestions';
import {
  operatingNavigationEnabled,
  readOperatingNavigation,
  filterOperatingNavigation,
  inspectOperatingNavigationSource,
  navigateOperatingSuggestion,
  inspectOperatingNavigation,
  assertOperatingNavigationCurrent,
  type OperatingJobSection,
  type OperatingNavigationReview,
  type OperatingNavigationDetail,
  type OperatingNavigationFilter,
} from '../../lib/workflows/operating-navigation';
import './operating-navigation.css';

export function OperatingNavigation({
  sources,
  enabled = false,
  onSelectJob,
}: {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  let available = false,
    handles: unknown[] = [];
  if (operatingNavigationEnabled(enabled))
    try {
      const capture = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      });
      const root = prototypeFields(sources, [
        'company',
        'operations',
        'estimates',
        'property',
        'entries',
        'gate',
      ]);
      handles = [
        ...Object.values(root),
        ...capture.entries.flatMap((e) => [
          e,
          e.target,
          e.release,
          e.customerModel,
        ]),
      ];
      capture.check();
      available = true;
    } catch {
      available = false;
    }
  const [binding, setBinding] = useState({
    sources,
    enabled,
    available,
    handles,
    generation: 0,
  });
  if (
    binding.sources !== sources ||
    binding.enabled !== enabled ||
    binding.available !== available ||
    binding.handles.length !== handles.length ||
    binding.handles.some((h, i) => h !== handles[i])
  ) {
    setBinding({
      sources,
      enabled,
      available,
      handles,
      generation: binding.generation + 1,
    });
    return null;
  }
  if (!available)
    return (
      <section
        className="operating-navigation"
        aria-label="Daily operating navigation"
      >
        <h2>Daily operating navigation</h2>
        <p>
          {enabled
            ? 'Current exact sources are unavailable. Prior suggestions and navigation are withheld.'
            : 'Daily operating navigation is off. Confirm the local company source first.'}
        </p>
      </section>
    );
  return (
    <NavigationDesk
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  );
}
const clear: OperatingNavigationFilter = {
  query: '',
  section: 'all',
  job_id: null,
  band: 'all',
};
const labels: Record<OperatingJobSection, string> = {
  sales: 'Issued scope',
  field: 'Field source review',
  finance: 'Financial requirements',
  completion: 'Published documentation',
  maintenance: 'Maintenance review',
  daily: 'Daily review',
};
const bands = {
  EVIDENCE_GAP: 'Evidence gaps',
  EARLIER_CONTEXT: 'Earlier recorded context',
  REVIEW_DAY_CONTEXT: 'Review-day context',
  LATER_CONTEXT: 'Later recorded context',
  UNDATED_CONTEXT: 'Undated context',
};
function NavigationDesk({
  sources,
  onSelectJob,
}: {
  sources: OperatingSources;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    generation = useRef(0),
    admission = useRef({ enabled: true, confirmed: false });
  const [day, setDay] = useState(sources.entries[0].day),
    [timezone, setTimezone] = useState(sources.entries[0].timezone),
    [ordering, setOrdering] =
      useState<VerifiedSuggestionsInput['ordering']>('EVIDENCE_FIRST'),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [held, setHeld] = useState(false),
    [review, setReview] = useState<OperatingNavigationReview | null>(null),
    [detail, setDetail] = useState<OperatingNavigationDetail | null>(null),
    [filter, setFilter] = useState(clear),
    [limit, setLimit] = useState(8),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  useEffect(() => {
    const epoch = generation,
      gateRef = admission;
    return () => {
      epoch.current++;
      gateRef.current.confirmed = false;
    };
  }, [sources]);
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  let current = false;
  if (review && confirmed)
    try {
      assertOperatingNavigationCurrent(review);
      if (detail) assertOperatingNavigationCurrent(detail);
      current = true;
    } catch {
      current = false;
    }
  let filtered: ReturnType<typeof filterOperatingNavigation> | null = null;
  if (review && current)
    try {
      filtered = filterOperatingNavigation(review, filter);
    } catch {
      current = false;
    }
  function withdraw(value: boolean) {
    generation.current++;
    admission.current.confirmed = false;
    setConfirmed(value);
    setDetail(null);
    setStatus('');
    if (busy) {
      setBusy(false);
      setError(
        'Read outcome UNKNOWN after withdrawal. The original finite source review remains held; no replay or replacement.',
      );
    }
  }
  async function load(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || busy || held) return;
    try {
      capacityDay(day, timezone);
    } catch {
      setError('Choose a valid day and explicit IANA timezone.');
      return;
    }
    const token = ++generation.current,
      gate = { enabled: true, confirmed: true };
    admission.current = gate;
    setHeld(true);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const next = await readOperatingNavigation(
        sources,
        { review_on: day, timezone, ordering, input_revision: token },
        gate,
      );
      if (token !== generation.current || !gate.confirmed) return;
      assertOperatingNavigationCurrent(next);
      setReview(next);
      setStatus(
        'Existing suggestions and exact local destinations reviewed. Facts, ranking and blocked action authority are unchanged.',
      );
    } catch {
      if (token === generation.current)
        setError(
          'Suggestion review outcome UNKNOWN. The original source review remains held. Only exact retained read-only reconciliation is available; no retry or replacement.',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function inspect(key: string) {
    if (!review || !current || busy) return;
    const token = ++generation.current;
    setBusy(true);
    setDetail(null);
    setError('');
    setStatus('');
    try {
      const next = await inspectOperatingNavigationSource(review, key);
      if (token !== generation.current) return;
      assertOperatingNavigationCurrent(next);
      setDetail(next);
    } catch {
      if (token === generation.current)
        setError(
          'Exact source inspection UNKNOWN. Navigation withheld; no replacement source is selected.',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function navigate() {
    if (!detail || !current || !onSelectJob || busy) return;
    const result = navigateOperatingSuggestion(detail, onSelectJob);
    setStatus(
      result.status === 'LOCAL_REVIEW_NAVIGATION_REQUESTED'
        ? 'Exact existing local task review requested. No business action was executed.'
        : 'UNKNOWN — the exact source is unavailable. Task navigation withheld.',
    );
  }
  async function reconcile() {
    if (!review || busy) return;
    const token = ++generation.current;
    setBusy(true);
    const result = await inspectOperatingNavigation(review);
    if (token !== generation.current) return;
    setStatus(
      result.status === 'CURRENT_READ_ONLY_NAVIGATION'
        ? 'Exact retained suggestion review is current — local review only.'
        : 'UNKNOWN — this retained review cannot be replayed or replaced.',
    );
    setBusy(false);
  }
  function changeFilter(next: OperatingNavigationFilter) {
    setFilter(next);
    setLimit(8);
  }
  return (
    <section
      className="operating-navigation"
      aria-label="Daily operating navigation"
    >
      <div className="navigation-intro">
        <p className="navigation-eyebrow">
          Intelligence · {sources.company.name}
        </p>
        <h2>Daily operating navigation</h2>
        <p>
          Inspect a suggestion’s exact recorded source, then open the
          corresponding existing job review. Suggestions are manual review
          recommendations; all business actions remain blocked.
        </p>
      </div>
      <form onSubmit={(e) => void load(e)}>
        <fieldset disabled={busy || held}>
          <legend>Choose the finite daily source review</legend>
          <div className="navigation-filters">
            <label htmlFor={`${id}-day`}>
              Review day
              <input
                id={`${id}-day`}
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label htmlFor={`${id}-zone`}>
              Review timezone
              <input
                id={`${id}-zone`}
                value={timezone}
                maxLength={100}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </label>
            <label htmlFor={`${id}-order`}>
              Review ordering
              <select
                id={`${id}-order`}
                value={ordering}
                onChange={(e) =>
                  setOrdering(
                    e.target.value as VerifiedSuggestionsInput['ordering'],
                  )
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
        <label className="navigation-confirm" htmlFor={`${id}-confirm`}>
          <input
            id={`${id}-confirm`}
            type="checkbox"
            checked={confirmed}
            onChange={(e) => withdraw(e.target.checked)}
          />
          I confirm the exact current company sources and selected daily review
          criteria.
        </label>
        <button type="submit" disabled={!confirmed || busy || held}>
          Review daily operating suggestions
        </button>
        <p className="navigation-muted">
          Choose criteria before reviewing. The existing workflow permits one
          finite source-set read per repository; changing criteria, switching
          panels or losing acknowledgment cannot create a replacement.
        </p>
      </form>
      {busy && <p role="status">Checking exact current source evidence…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {review && !current && !busy && (
        <p role="alert">
          UNKNOWN — saved sources, current access or confirmation changed.
          Previous suggestions and task navigation are withheld; no replay or
          replacement.
        </p>
      )}
      {review && (
        <button type="button" disabled={busy} onClick={() => void reconcile()}>
          Reconcile exact navigation review
        </button>
      )}
      {review && current && filtered && (
        <>
          <div className="navigation-filters">
            <label htmlFor={`${id}-search`}>
              Search daily task reviews
              <input
                id={`${id}-search`}
                value={filter.query}
                maxLength={200}
                onChange={(e) =>
                  changeFilter({ ...filter, query: e.target.value })
                }
              />
            </label>
            <label htmlFor={`${id}-category`}>
              Existing task category
              <select
                id={`${id}-category`}
                value={filter.section}
                onChange={(e) =>
                  changeFilter({
                    ...filter,
                    section: e.target
                      .value as OperatingNavigationFilter['section'],
                  })
                }
              >
                <option value="all">All exact source categories</option>
                {(['sales', 'field', 'finance', 'completion'] as const).map(
                  (section) => (
                    <option key={section} value={section}>
                      {labels[section]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label htmlFor={`${id}-job`}>
              Exact task job
              <select
                id={`${id}-job`}
                value={filter.job_id ?? ''}
                onChange={(e) =>
                  changeFilter({ ...filter, job_id: e.target.value || null })
                }
              >
                <option value="">All admitted jobs</option>
                {review.jobs.map((j) => (
                  <option key={j.target.job_id} value={j.target.job_id!}>
                    {j.context.job_title} · {j.target.job_id}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-band`}>
              Recorded-day context
              <select
                id={`${id}-band`}
                value={filter.band}
                onChange={(e) =>
                  changeFilter({
                    ...filter,
                    band: e.target.value as OperatingNavigationFilter['band'],
                  })
                }
              >
                <option value="all">All review contexts</option>
                {actionReviewBands.map((band) => (
                  <option key={band} value={band}>
                    {bands[band]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="navigation-actions">
            <button type="button" onClick={() => changeFilter(clear)}>
              Reset task filters
            </button>
          </div>
          <p role="status">
            {filtered.matching} matching of {filtered.available} suggestions ·{' '}
            {filtered.exact_targets} exact local review targets ·{' '}
            {filtered.unknown_targets} UNKNOWN targets.
          </p>
          <p className="navigation-muted">
            {review.selected_criteria.meaning} {review.limits}
          </p>
          <div className="navigation-layout">
            <div className="navigation-card">
              <h3>Source-verified daily suggestions</h3>
              {!filtered.tasks.length && (
                <p>No admitted suggestions match these filters.</p>
              )}
              <ol className="navigation-queue">
                {filtered.tasks.slice(0, limit).map((task) => (
                  <li key={task.key}>
                    <p className="navigation-status">
                      Original rank {task.rank} ·{' '}
                      {task.navigation.section
                        ? labels[task.navigation.section]
                        : 'UNKNOWN task target'}
                    </p>
                    <h4>{task.context.job}</h4>
                    <p>
                      {task.context.customer} · {task.context.property}
                    </p>
                    <p>
                      <strong>Recorded fact:</strong> {task.recorded_fact}
                    </p>
                    <p>
                      <strong>Recommended manual review:</strong>{' '}
                      {task.suggested_human_review}
                    </p>
                    <p>
                      {bands[task.review_band]} · source day{' '}
                      {task.recorded_day ?? 'UNKNOWN'} · recorded-state check{' '}
                      {task.verification.status}
                    </p>
                    <p className="navigation-identity">
                      {task.source.kind} {task.source.id} · job {task.job_id}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Inspect suggested task source: ${task.source.kind} for ${task.context.job} ${task.job_id}`}
                      onClick={() => void inspect(task.key)}
                    >
                      Inspect suggested task source
                    </button>
                  </li>
                ))}
              </ol>
              {filtered.tasks.length > limit && (
                <button type="button" onClick={() => setLimit((n) => n + 8)}>
                  Show more task reviews
                </button>
              )}
            </div>
            <div className="navigation-card">
              {!detail ? (
                <p>
                  Inspect an exact source first. A suggestion alone cannot
                  navigate to a task review or grant an action.
                </p>
              ) : (
                <>
                  <h3 ref={heading} tabIndex={-1}>
                    Exact suggested task source
                  </h3>
                  <p>
                    {detail.task.context.job} · {detail.task.context.customer} ·{' '}
                    {detail.task.context.property}
                  </p>
                  <dl>
                    <dt>Original source kind / ID</dt>
                    <dd>
                      {detail.source.kind} / {detail.source.id}
                    </dd>
                    <dt>Source version / revision</dt>
                    <dd>
                      {detail.source.version ?? 'Not versioned'} /{' '}
                      {detail.source.revision ?? 'Not revisioned'}
                    </dd>
                    <dt>Exact job / saved revision</dt>
                    <dd>
                      {detail.target.job_id} / {detail.task.source.job_revision}
                    </dd>
                    <dt>Original estimate / issued version</dt>
                    <dd>
                      {detail.target.estimate_id} / {detail.target.version_id}
                    </dd>
                    <dt>Related exact source IDs</dt>
                    <dd>
                      {detail.source.related_ids.join(', ') || 'None recorded'}
                    </dd>
                    <dt>Source inspection hash</dt>
                    <dd>{detail.source_sha256}</dd>
                  </dl>
                  <p>
                    <strong>Recorded fact:</strong> {detail.task.recorded_fact}
                  </p>
                  <p>
                    <strong>Recommended manual review:</strong>{' '}
                    {detail.task.suggested_human_review}
                  </p>
                  <h4>Existing local destination</h4>
                  <p>
                    {detail.task.navigation.label} ·{' '}
                    {detail.task.navigation.status}
                  </p>
                  <p>{detail.task.navigation.meaning}</p>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !onSelectJob ||
                      detail.task.navigation.status !==
                        'EXACT_LOCAL_REVIEW_TARGET'
                    }
                    onClick={navigate}
                  >
                    Open existing task review
                  </button>
                  <p>
                    The selected job and task section are presentation only.
                    Opening documentation never verifies physical completion;
                    opening Finance never issues or pays an invoice.
                  </p>
                  <h4>Canonical recorded-state facts</h4>
                  <dl>
                    {detail.task.verification.facts.map((fact) => (
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
                    {detail.task.verification.gaps.map((gap) => (
                      <li key={gap.code}>
                        <strong>
                          {gap.code} · {gap.status}
                        </strong>
                        <p>{gap.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <details>
                    <summary>Original inspected source evidence</summary>
                    <div
                      className="navigation-source"
                      role="region"
                      tabIndex={0}
                      aria-label={`Original inspected task source ${detail.source.id}`}
                    >
                      <pre>
                        {JSON.stringify(detail.original_detail, null, 2)}
                      </pre>
                    </div>
                  </details>
                </>
              )}
            </div>
          </div>
        </>
      )}
      <p className="navigation-muted">
        Local synthetic staff review only. No AI/provider request, message,
        dispatch, mutation, hosted or financial action. Release 1.0 NOT READY /
        NOT AUTHORIZED.
      </p>
    </section>
  );
}
