import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { CompletionReview } from './CompletionReview';
import {
  servicePassportPathEnabled,
  readServicePassportPath,
  assertServicePassportSelectionCurrent,
  selectServicePassportContext,
  filterServicePassportPaths,
  openServicePassportContext,
  assertServicePassportContextCurrent,
  openServicePassportDocumentation,
  openServicePassportFinding,
  servicePassportBreadcrumbs,
  openServicePassportOriginalReview,
  returnServicePassportSelection,
  navigateServicePassportJob,
  type ServicePassportSelection,
  type ServicePassportContext,
  type ServicePassportReport,
  type ServicePassportFinding,
  type ServicePassportCallback,
  type ServicePassportLiveCallback,
} from '../../lib/workflows/service-passport-path';
import type { ServiceReviewContext } from '../../lib/workflows/service-review-path';
import './service-passport-path.css';
export interface ServicePassportPathProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: ServicePassportCallback;
}
type Pane =
  'request' | 'property' | 'job' | 'report' | 'finding' | 'passport' | 'review';
export function ServicePassportPath({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: ServicePassportPathProps) {
  const allowed = servicePassportPathEnabled(enabled),
    live = useRef<ServicePassportLiveCallback>({
      current: onSelectJob,
      generation: 0,
    });
  useLayoutEffect(() => {
    const slot = live.current;
    slot.current = onSelectJob;
    slot.generation++;
    return () => {
      slot.current = undefined;
      slot.generation++;
    };
  }, [onSelectJob]);
  const [bound, setBound] = useState({
    sources,
    selectedJobId,
    allowed,
    generation: 0,
  });
  if (
    bound.sources !== sources ||
    bound.selectedJobId !== selectedJobId ||
    bound.allowed !== allowed
  ) {
    setBound({
      sources,
      selectedJobId,
      allowed,
      generation: bound.generation + 1,
    });
    return null;
  }
  let admitted = allowed;
  if (allowed)
    try {
      captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      }).check();
    } catch {
      admitted = false;
    }
  return admitted ? (
    <Path
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      live={live}
      hasNavigation={typeof onSelectJob === 'function'}
    />
  ) : (
    <section
      className="service-passport-path"
      aria-label="Service Passport path"
    >
      <h2>Service Passport path</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current sources are unavailable. Retained evidence is withheld.'
          : 'Service Passport path is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Path({
  sources,
  selectedJobId,
  live,
  hasNavigation,
}: Omit<ServicePassportPathProps, 'enabled' | 'onSelectJob'> & {
  live: { current: ServicePassportLiveCallback };
  hasNavigation: boolean;
}) {
  const [view, setView] = useState<ServicePassportSelection>(),
    [job, setJob] = useState(''),
    [query, setQuery] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [path, setPath] = useState<ServicePassportContext>(),
    [report, setReport] = useState<ServicePassportReport>(),
    [finding, setFinding] = useState<ServicePassportFinding>(),
    [controls, setControls] =
      useState<ReturnType<typeof openServicePassportOriginalReview>>(),
    [pane, setPane] = useState<Pane>('request'),
    [busy, setBusy] = useState(true),
    [held, setHeld] = useState(false),
    [error, setError] = useState(''),
    [navigationError, setNavigationError] = useState('');
  const life = useRef({ active: true, pending: false, sequence: 0 }),
    gate = useRef({ enabled: true, confirmed: true }),
    input = useRef<ServiceReviewContext | undefined>(undefined),
    heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      l.sequence++;
      g.enabled = false;
    };
  }, []);
  useEffect(() => {
    const l = life.current,
      id = ++l.sequence;
    void readServicePassportPath(sources, gate.current)
      .then((value) => {
        assertServicePassportSelectionCurrent(value);
        const selected = selectServicePassportContext(value, selectedJobId);
        if (l.active && id === l.sequence) {
          setView(value);
          setJob(selected?.job_id ?? '');
          setBusy(false);
        }
      })
      .catch(() => {
        if (l.active && id === l.sequence) {
          setHeld(true);
          setError(
            'UNKNOWN — exact selected job or service evidence unavailable. No fallback.',
          );
          setBusy(false);
        }
      });
    return () => {
      l.sequence++;
    };
  }, [sources, selectedJobId]);
  useEffect(() => {
    if (pane === 'review') reviewHeading.current?.focus();
    else heading.current?.focus();
  }, [pane, path, report, finding]);
  function fail() {
    setHeld(true);
    setError(
      'UNKNOWN — exact source, staff context or access changed. No replacement or replay; original holds remain intact.',
    );
  }
  async function read<T>(run: () => Promise<T>, apply: (value: T) => void) {
    const l = life.current;
    if (l.pending || held) return;
    l.pending = true;
    setBusy(true);
    setError('');
    const id = ++l.sequence;
    try {
      const value = await run();
      if (l.active && id === l.sequence) apply(value);
    } catch {
      if (l.active && id === l.sequence) fail();
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  function open() {
    if (!view || !confirmed || busy || path) return;
    try {
      const selected = selectServicePassportContext(view, job);
      if (!selected) return;
      const original = { ...selected, staff_context_confirmed: true };
      input.current = original;
      void read(
        () => openServicePassportContext(view, original),
        (value) => {
          assertServicePassportContextCurrent(value);
          setPath(value);
          setPane('job');
        },
      );
    } catch {
      fail();
    }
  }
  function go(next: Pane) {
    if (!path || busy) return;
    try {
      assertServicePassportContextCurrent(path);
      servicePassportBreadcrumbs(path, report, finding);
      if (next === 'request') {
        const saved = returnServicePassportSelection(path);
        if (saved.view !== view || saved.selection.job_id !== job)
          throw Error('Return context changed');
      }
      setPane(next);
    } catch {
      fail();
    }
  }
  function document(
    reference: Parameters<typeof openServicePassportDocumentation>[1],
  ) {
    if (!path) return;
    setFinding(undefined);
    void read(
      () => openServicePassportDocumentation(path, reference),
      (value) => {
        assertServicePassportContextCurrent(path);
        setReport(value);
        setPane('report');
      },
    );
  }
  function originalReview() {
    if (!path || !report || busy) return;
    try {
      const props = openServicePassportOriginalReview(path, report);
      if (controls && props !== controls)
        throw Error('Original control identity changed');
      setControls(props);
      setPane('review');
    } catch {
      setNavigationError(
        'Original completion review unavailable for this exact documentation; request/job and property-only links remain UNKNOWN.',
      );
    }
  }
  async function navigate() {
    const l = life.current,
      slot = live.current,
      callback = slot.current;
    if (!path || !report || !callback || busy || l.pending) return;
    l.pending = true;
    setBusy(true);
    setNavigationError('');
    const id = ++l.sequence;
    try {
      await navigateServicePassportJob(path, report, callback, slot);
    } catch {
      if (l.active && id === l.sequence)
        setNavigationError(
          'Navigation withdrawn or current evidence unavailable. No obsolete or replacement callback ran.',
        );
    } finally {
      if (l.active) {
        l.pending = false;
        setBusy(false);
      }
    }
  }
  let current = !held,
    rows: ReturnType<typeof filterServicePassportPaths> = [],
    crumbs: ReturnType<typeof servicePassportBreadcrumbs> = [],
    canReview = false;
  try {
    if (view) {
      assertServicePassportSelectionCurrent(view);
      rows = filterServicePassportPaths(view, {
        query,
        customer_id: '',
        location_id: '',
        request_state: '',
      });
    }
    if (path) {
      assertServicePassportContextCurrent(path);
      crumbs = servicePassportBreadcrumbs(path, report, finding);
      if (report)
        try {
          openServicePassportOriginalReview(path, report);
          canReview = true;
        } catch {
          /* Property-only evidence has no direct completion control. */
        }
    }
  } catch {
    current = false;
  }
  const safe = current ? path?.customer_safe : undefined;
  return (
    <section
      className="service-passport-path"
      aria-label="Service Passport path"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Service Passport path</h2>
          <p>
            Retain one actual request, staff-selected job, exact published
            evidence and original review.
          </p>
        </div>
        <span>Local source navigation · no physical PASS</span>
      </header>
      {busy && <p role="status">Loading exact service Passport source…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — retained source or access changed. Previous evidence is withheld.'}
        </p>
      )}
      {navigationError && <p role="alert">{navigationError}</p>}
      {current && (
        <>
          <div className="service-passport-path-ui">
            {path && (
              <nav aria-label="Service Passport breadcrumbs">
                {crumbs.map((crumb) => (
                  <button
                    type="button"
                    className="secondary"
                    key={crumb.kind}
                    aria-current={pane === crumb.kind ? 'step' : undefined}
                    disabled={busy}
                    onClick={() => go(crumb.kind)}
                  >
                    {crumb.label}
                  </button>
                ))}
                {controls && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    aria-current={pane === 'review' ? 'step' : undefined}
                    onClick={() => go('review')}
                  >
                    Original review {controls.sources.report_id} version{' '}
                    {controls.sources.published_version}
                  </button>
                )}
              </nav>
            )}
            {pane !== 'review' && (
              <h3 ref={heading} tabIndex={-1}>
                {pane === 'request'
                  ? 'Service request and job selection'
                  : pane === 'report' && report
                    ? `Published report ${report.reference.report_id} version ${report.reference.published_version}`
                    : pane === 'finding' && finding
                      ? `Exact finding ${finding.finding.reference.finding_id}`
                      : pane === 'passport'
                        ? 'Safe Passport evidence'
                        : pane === 'property'
                          ? 'Exact service property'
                          : 'Retained service job'}
              </h3>
            )}
            {pane === 'request' && view && (
              <>
                <p>
                  {view.available_requests} available requests ·{' '}
                  {view.available_job_contexts} admitted job contexts. Coverage
                  is available sources, not complete history.
                </p>
                {!path ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      open();
                    }}
                  >
                    <label>
                      Search service sources
                      <input
                        value={query}
                        maxLength={100}
                        disabled={busy}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    {rows.length ? (
                      <>
                        <label>
                          Service request and job
                          <select
                            value={
                              rows.some((row) => row.job.job_id === job)
                                ? job
                                : ''
                            }
                            disabled={busy}
                            onChange={(e) => {
                              setJob(e.target.value);
                              setConfirmed(false);
                            }}
                          >
                            <option value="" disabled>
                              Select an exact request/job context
                            </option>
                            {rows.map((row) => (
                              <option
                                key={row.job.job_id}
                                value={row.job.job_id}
                              >
                                {row.request.summary} · {row.job.name} ·{' '}
                                {row.job.job_id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="service-passport-path-check">
                          <input
                            type="checkbox"
                            checked={confirmed}
                            disabled={busy}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />
                          I confirm this staff-selected service context.
                        </label>
                        <button
                          type="submit"
                          disabled={
                            busy ||
                            !confirmed ||
                            !rows.some((row) => row.job.job_id === job)
                          }
                        >
                          Open retained service path
                        </button>
                      </>
                    ) : (
                      <p>
                        No matching accessible service sources. No broader
                        source is substituted.
                      </p>
                    )}
                  </form>
                ) : (
                  <>
                    <p>
                      Request {path.request.id} · job {path.context.job_id}{' '}
                      remains retained. Its staff context cannot be silently
                      rebound.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => go('job')}
                    >
                      Resume retained service path
                    </button>
                  </>
                )}
              </>
            )}
            {path && safe && pane !== 'request' && pane !== 'review' && (
              <>
                <p>
                  {path.customer_label} · {safe.property.label} ·{' '}
                  {safe.scope.name}
                </p>
                <p>
                  Request-to-job relationship UNKNOWN: no recorded FK exists.
                  This is separately confirmed staff-selected context.
                </p>
                {(pane === 'job' || pane === 'property') && (
                  <>
                    <dl>
                      <dt>Actual request / state</dt>
                      <dd>
                        {path.request.id} / {path.request.status}
                      </dd>
                      <dt>Exact customer / property</dt>
                      <dd>
                        {safe.property.customer_id} /{' '}
                        {safe.property.location_id}
                      </dd>
                      <dt>Exact job / immutable issued version</dt>
                      <dd>
                        {safe.scope.job_id} / {safe.scope.issued_version_id} ·
                        version {safe.scope.issued_version_number}
                      </dd>
                    </dl>
                    <p>{safe.scope.description}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => go('passport')}
                    >
                      Open retained Passport
                    </button>
                  </>
                )}
                {(pane === 'passport' ||
                  pane === 'job' ||
                  pane === 'property') && (
                  <>
                    <h4>Available published documentation</h4>
                    <p>
                      {safe.documentation.length} available report versions;
                      history completeness UNKNOWN.
                    </p>
                    {safe.documentation.map((doc) => (
                      <article
                        key={`${doc.report.reference.report_id}:${doc.report.reference.published_version}`}
                      >
                        <p>{doc.report.summary}</p>
                        <p>
                          {doc.selected_job_association ===
                          'EXACT_RECORDED_JOB_LINK'
                            ? 'Exact recorded report/job link.'
                            : 'Selected-job association UNKNOWN; separate property documentation.'}
                        </p>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => document(doc.report.reference)}
                        >
                          Open published report {doc.report.reference.report_id}{' '}
                          version {doc.report.reference.published_version}
                        </button>
                      </article>
                    ))}
                    {pane === 'passport' && (
                      <details>
                        <summary>Original Passport timeline sources</summary>
                        <ul>
                          {safe.timeline.snapshot.events.map((event) => (
                            <li key={event.source_sha256}>
                              {event.date} ·{' '}
                              {event.date_meaning.replaceAll('-', ' ')} ·{' '}
                              {event.kind === 'inspection-documentation'
                                ? `report ${event.report.reference.report_id} version ${event.report.reference.published_version}`
                                : `issued job ${event.job.reference.job_id} version ${event.job.reference.issued_version_number}`}
                            </li>
                          ))}
                        </ul>
                        <p>
                          Recorded date ordering never proves physical
                          completion or same-day sequence.
                        </p>
                      </details>
                    )}
                  </>
                )}
                {pane === 'report' && report && (
                  <>
                    <p>
                      Recorded visit {report.visited_on} · published{' '}
                      {report.published_at} · {report.phase} phase
                    </p>
                    <p>{report.summary}</p>
                    <h4>Recorded checklist</h4>
                    <ul>
                      {report.checklist.map((item) => (
                        <li key={item.reference.source_index}>
                          {item.label}: recorded{' '}
                          {item.recorded_completed ? 'checked' : 'unchecked'};
                          not physical verification.
                        </li>
                      ))}
                    </ul>
                    <h4>Published observations and separate recommendations</h4>
                    {report.observations.length ? (
                      report.observations.map((item) => (
                        <article
                          key={`${item.reference.finding_id}:${item.reference.source_index}`}
                        >
                          <p>
                            {item.category} · {item.location} · {item.severity}
                          </p>
                          <p>Observation: {item.observation}</p>
                          <p>Recommendation: {item.recommendation}</p>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void read(
                                () =>
                                  openServicePassportFinding(
                                    path,
                                    item.reference,
                                  ),
                                (value) => {
                                  setFinding(value);
                                  setPane('finding');
                                },
                              )
                            }
                          >
                            Inspect published finding{' '}
                            {item.reference.finding_id}
                          </button>
                        </article>
                      ))
                    ) : (
                      <p>
                        No findings recorded. Absence never proves repair or
                        completion.
                      </p>
                    )}
                    {canReview ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={originalReview}
                      >
                        Open original completion review
                      </button>
                    ) : (
                      <p>
                        Original completion review unavailable: selected-job
                        association UNKNOWN or report differs from its exact
                        original source.
                      </p>
                    )}
                    {hasNavigation && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void navigate()}
                      >
                        Open same service job {safe.scope.name}
                      </button>
                    )}
                  </>
                )}
                {pane === 'finding' && finding && (
                  <>
                    <p>
                      Report {finding.report_reference.report_id} · version{' '}
                      {finding.report_reference.published_version} · source
                      position {finding.finding.reference.source_index + 1}
                    </p>
                    <p>{finding.finding.observation}</p>
                    <p>Recommendation: {finding.finding.recommendation}</p>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => go('report')}
                    >
                      Return to retained report
                    </button>
                  </>
                )}
                <aside>
                  Physical completion, customer acceptance and warranty remain
                  UNKNOWN/UNVERIFIED. Documentation, after phase and checkmarks
                  never provide those proofs.
                </aside>
              </>
            )}
          </div>
          {path && controls && (
            <div
              hidden={pane !== 'review'}
              aria-label="Retained original completion review"
            >
              <div className="service-passport-path-ui">
                <h3 ref={reviewHeading} tabIndex={-1}>
                  Original completion review · report{' '}
                  {controls.sources.report_id} version{' '}
                  {controls.sources.published_version}
                </h3>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => go(report ? 'report' : 'passport')}
                >
                  Return to retained report
                </button>
              </div>
              <CompletionReview sources={controls.sources} enabled />
            </div>
          )}
        </>
      )}
      <footer>
        Existing safe sources and original controls only. No new request/job
        link, completion approval, business store, customer route, writer,
        message, dispatch or financial authority. Local breadcrumbs retain
        references, not durable custody.
      </footer>
    </section>
  );
}
