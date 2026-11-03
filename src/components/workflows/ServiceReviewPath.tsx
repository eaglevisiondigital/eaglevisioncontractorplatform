import { useEffect, useRef, useState } from 'react';
import type {
  PassportReportReference,
  PassportFindingReference,
} from '../../domain/property/passport';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  readServiceReviewRequests,
  selectServiceReviewContext,
  assertServiceReviewRequestsCurrent,
  openServiceReviewPath,
  assertServiceReviewPathCurrent,
  openServiceReviewReport,
  openServiceReviewFinding,
  returnServiceReviewRequest,
  selectServiceReviewJob,
  type ServiceReviewRequests,
  type ServiceReviewPathRead,
  type ServiceReviewContext,
} from '../../lib/workflows/service-review-path';
import './service-review-path.css';
export interface ServiceReviewPathProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export function ServiceReviewPath({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: ServiceReviewPathProps) {
  const allowed =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | null = null;
  if (allowed)
    try {
      check = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      }).check;
    } catch {
      /* Withhold denied content. */
    }
  const [bound, setBound] = useState({
    sources,
    selectedJobId,
    allowed,
    check,
    generation: 0,
  });
  let stale = false;
  try {
    bound.check?.();
  } catch {
    stale = true;
  }
  if (
    bound.sources !== sources ||
    bound.selectedJobId !== selectedJobId ||
    bound.allowed !== allowed ||
    stale ||
    Boolean(bound.check) !== Boolean(check)
  ) {
    setBound({
      sources,
      selectedJobId,
      allowed,
      check,
      generation: bound.generation + 1,
    });
    return null;
  }
  return allowed && check ? (
    <Review
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="service-review-path" aria-label="Service review path">
      <h2>Service review path</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current authorized sources are unavailable. Previous evidence is withheld.'
          : 'Service review path is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Review({
  sources,
  selectedJobId,
  onSelectJob,
}: ServiceReviewPathProps) {
  const [view, setView] = useState<ServiceReviewRequests>(),
    [request, setRequest] = useState(''),
    [job, setJob] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [path, setPath] = useState<ServiceReviewPathRead>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof openServiceReviewReport>>>(),
    [finding, setFinding] =
      useState<Awaited<ReturnType<typeof openServiceReviewFinding>>>(),
    [atRequest, setAtRequest] = useState(true),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [held, setHeld] = useState(false);
  const gate = useRef({ enabled: true, confirmed: true }),
    active = useRef(true),
    sequence = useRef({ value: 0 }),
    pending = useRef(false),
    original = useRef<ServiceReviewContext | undefined>(undefined),
    requestHeading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    reportHeading = useRef<HTMLHeadingElement>(null),
    findingHeading = useRef<HTMLHeadingElement>(null),
    reportsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const g = gate.current,
      s = sequence.current;
    active.current = true;
    g.enabled = true;
    const id = ++s.value;
    void readServiceReviewRequests(sources, g)
      .then((value) => {
        assertServiceReviewRequestsCurrent(value);
        const selected = selectServiceReviewContext(value, selectedJobId);
        if (active.current && id === s.value) {
          setView(value);
          setRequest(selected?.request_id ?? '');
          setJob(selected?.job_id ?? '');
          setBusy(false);
        }
      })
      .catch(() => {
        if (active.current && id === s.value) {
          setHeld(true);
          setError(
            'UNKNOWN — selected job or current request evidence is unavailable. No fallback.',
          );
          setBusy(false);
        }
      });
    return () => {
      active.current = false;
      g.enabled = false;
      s.value++;
    };
  }, [sources, selectedJobId]);
  useEffect(() => {
    if (atRequest) requestHeading.current?.focus();
    else if (finding) findingHeading.current?.focus();
    else if (report) reportHeading.current?.focus();
    else if (path) sourceHeading.current?.focus();
  }, [atRequest, path, report, finding]);
  function change(requestId: string, jobId: string) {
    if (original.current) original.current.staff_context_confirmed = false;
    sequence.current.value++;
    setRequest(requestId);
    setJob(jobId);
    setConfirmed(false);
    setPath(undefined);
    setReport(undefined);
    setFinding(undefined);
    setError('');
  }
  async function task<T>(run: () => Promise<T>, apply: (value: T) => void) {
    if (pending.current || held) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const id = ++sequence.current.value;
    try {
      const value = await run();
      if (active.current && id === sequence.current.value) apply(value);
    } catch {
      if (active.current && id === sequence.current.value) {
        setHeld(true);
        setError(
          'UNKNOWN — exact request, staff context, report or access changed. Retained evidence is read only; no replacement or replay.',
        );
      }
    } finally {
      if (active.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function open() {
    if (!view || !confirmed || busy) return;
    const input = {
      request_id: request,
      job_id: job,
      staff_context_confirmed: confirmed,
    };
    original.current = input;
    void task(
      () => openServiceReviewPath(view, input),
      (value) => {
        assertServiceReviewPathCurrent(value);
        setPath(value);
        setAtRequest(false);
      },
    );
  }
  function inspect(reference: PassportReportReference) {
    if (!path) return;
    setReport(undefined);
    setFinding(undefined);
    void task(
      () => openServiceReviewReport(path, reference),
      (value) => {
        assertServiceReviewPathCurrent(path);
        setReport(value);
      },
    );
  }
  function inspectFinding(reference: PassportFindingReference) {
    if (!path) return;
    setFinding(undefined);
    void task(
      () => openServiceReviewFinding(path, reference),
      (value) => {
        assertServiceReviewPathCurrent(path);
        setFinding(value);
      },
    );
  }
  function back() {
    if (!path || busy) return;
    try {
      const retained = returnServiceReviewRequest(path);
      if (
        retained.view !== view ||
        retained.selection.request_id !== request ||
        retained.selection.job_id !== job
      )
        throw Error('Return context changed');
      setAtRequest(true);
    } catch {
      setHeld(true);
      setError('UNKNOWN — the exact retained return context is unavailable.');
    }
  }
  function resume() {
    if (!path || busy) return;
    try {
      assertServiceReviewPathCurrent(path);
      setAtRequest(false);
    } catch {
      setHeld(true);
      setError('UNKNOWN — retained evidence cannot be resumed.');
    }
  }
  function navigate() {
    if (!path || !report || busy) return;
    try {
      onSelectJob?.(selectServiceReviewJob(path));
    } catch {
      setHeld(true);
      setError('UNKNOWN — exact existing job navigation is unavailable.');
    }
  }
  let current = !held;
  try {
    if (view) assertServiceReviewRequestsCurrent(view);
    if (path) assertServiceReviewPathCurrent(path);
  } catch {
    current = false;
  }
  const group = current
      ? view?.requests.find((r) => r.request.id === request)
      : undefined,
    safe = current ? path?.customer_safe : undefined;
  return (
    <section
      className="service-review-path"
      aria-label="Service review path"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Service review path</h2>
          <p>
            Follow an actual request, its explicit job review context and exact
            published Passport evidence, then return to the same request.
          </p>
        </div>
        <span className="service-review-path-pill">Local read only</span>
      </header>
      {busy && <p role="status">Loading exact service evidence…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — source or access changed. Previous evidence is withheld.'}
        </p>
      )}
      {current && view && (
        <>
          <p>
            {view.available_requests} available requests ·{' '}
            {view.available_job_contexts} admitted job contexts. Available
            sources are not complete history.
          </p>
          {atRequest && (
            <>
              <h3 ref={requestHeading} tabIndex={-1}>
                Service request selection
              </h3>
              {view.requests.length === 0 ? (
                <p>No accessible request contexts are available.</p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    open();
                  }}
                >
                  <label>
                    Service request
                    <select
                      value={request}
                      disabled={busy}
                      onChange={(event) => {
                        const next = view.requests.find(
                          (r) => r.request.id === event.target.value,
                        );
                        change(event.target.value, next?.jobs[0]?.job_id ?? '');
                      }}
                    >
                      {view.requests.map((r) => (
                        <option value={r.request.id} key={r.request.id}>
                          {r.request.summary} · {r.request.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Service review job
                    <select
                      value={job}
                      disabled={busy}
                      onChange={(event) => change(request, event.target.value)}
                    >
                      {group?.jobs.map((j) => (
                        <option value={j.job_id} key={j.job_id}>
                          {j.name} · issued version {j.issued_version_number} ·{' '}
                          {j.job_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    Request-to-job relationship UNKNOWN: the current source
                    contract has no recorded request/estimate/job foreign key.
                    These are admitted staff-selected contexts, not recorded
                    request links.
                  </p>
                  <label className="service-review-path-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(event) => {
                        if (path) change(request, job);
                        setConfirmed(event.target.checked);
                        if (original.current)
                          original.current.staff_context_confirmed =
                            event.target.checked;
                      }}
                    />
                    I confirm this exact job as staff-selected review context.
                  </label>
                  <button type="submit" disabled={busy || !confirmed}>
                    Open service review path
                  </button>
                  {path && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={resume}
                    >
                      Resume retained service evidence
                    </button>
                  )}
                </form>
              )}
            </>
          )}
          {!atRequest && path && safe && (
            <>
              <nav aria-label="Service request evidence path">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={back}
                >
                  Return to service request
                </button>
                <span>
                  Request {path.request.id} › job {path.context.job_id} ›
                  property {safe.property.location_id}
                </span>
              </nav>
              <h3 ref={sourceHeading} tabIndex={-1}>
                {safe.scope.name} · exact service evidence
              </h3>
              <p>
                {path.request.summary} · recorded request state{' '}
                {path.request.status}
              </p>
              <p>
                {path.customer_label} · {safe.property.label}
              </p>
              <dl>
                <dt>Request-to-job relationship</dt>
                <dd>
                  UNKNOWN absent recorded FK. Explicitly confirmed
                  staff-selected context.
                </dd>
                <dt>Recorded job / issued baseline</dt>
                <dd>
                  {safe.scope.job_id} / {safe.scope.issued_version_id} · version{' '}
                  {safe.scope.issued_version_number}
                </dd>
                <dt>Exact customer / property</dt>
                <dd>
                  {safe.property.customer_id} / {safe.property.location_id}
                </dd>
              </dl>
              <h4 ref={reportsHeading} tabIndex={-1}>
                Safe Property Passport documentation
              </h4>
              <p>
                {safe.documentation.length} available published report versions.
                History completeness and physical completion remain UNKNOWN.
              </p>
              {safe.documentation.map((doc) => (
                <article
                  key={`${doc.report.reference.report_id}:${doc.report.reference.published_version}`}
                >
                  <h5>
                    Report {doc.report.reference.report_id} · version{' '}
                    {doc.report.reference.published_version}
                  </h5>
                  <p>{doc.report.summary}</p>
                  <p>
                    {doc.selected_job_association === 'EXACT_RECORDED_JOB_LINK'
                      ? 'Exact recorded report-to-job link.'
                      : 'Selected-job association UNKNOWN; separate property documentation.'}
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => inspect(doc.report.reference)}
                  >
                    Open original published report{' '}
                    {doc.report.reference.report_id} version{' '}
                    {doc.report.reference.published_version}
                  </button>
                </article>
              ))}
              {report && (
                <article>
                  <h4 ref={reportHeading} tabIndex={-1}>
                    Original published report {report.reference.report_id}{' '}
                    version {report.reference.published_version}
                  </h4>
                  <p>
                    Property {report.reference.location_id} · recorded visit{' '}
                    {report.visited_on} · published {report.published_at} ·{' '}
                    {report.phase} phase
                  </p>
                  <p>{report.summary}</p>
                  <h5>Recorded checklist</h5>
                  {report.checklist.length ? (
                    <ul>
                      {report.checklist.map((item) => (
                        <li key={item.reference.source_index}>
                          {item.label}:{' '}
                          {item.recorded_completed
                            ? 'recorded checked'
                            : 'recorded unchecked'}
                          ; not physical verification.
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No checklist evidence recorded.</p>
                  )}
                  <h5>Published observations and recommendations</h5>
                  {report.observations.length ? (
                    report.observations.map((item) => (
                      <div
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
                          onClick={() => inspectFinding(item.reference)}
                        >
                          Inspect original finding {item.reference.finding_id}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>
                      No findings recorded; absence is not repair or completion
                      evidence.
                    </p>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setReport(undefined);
                      setFinding(undefined);
                      requestAnimationFrame(() =>
                        reportsHeading.current?.focus(),
                      );
                    }}
                  >
                    Return to report selection
                  </button>
                </article>
              )}
              {finding && (
                <article>
                  <h4 ref={findingHeading} tabIndex={-1}>
                    Original exact finding{' '}
                    {finding.finding.reference.finding_id}
                  </h4>
                  <p>
                    Report {finding.report_reference.report_id} · version{' '}
                    {finding.report_reference.published_version} · source
                    position {finding.finding.reference.source_index + 1}
                  </p>
                  <p>{finding.finding.observation}</p>
                  <p>Recommendation: {finding.finding.recommendation}</p>
                </article>
              )}
              {report && onSelectJob && (
                <button type="button" disabled={busy} onClick={navigate}>
                  Open same service job {safe.scope.name}
                </button>
              )}
              <aside className="service-review-path-notice">
                Documentation never verifies physical completion, customer
                acceptance or warranty. Checkmarks, after-phase records, photos
                and absent findings do not supply those proofs.
              </aside>
            </>
          )}
        </>
      )}
      <footer>
        Existing safe issued/report/Passport readers only. No request/job
        relationship is created, no physical PASS, no business store, message,
        dispatch, financial action or hosted authority.
      </footer>
    </section>
  );
}
