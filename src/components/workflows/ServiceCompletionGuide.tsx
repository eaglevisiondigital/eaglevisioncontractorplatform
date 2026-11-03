import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import type { OperatingJobSection } from '../../lib/workflows/operating-navigation';
import {
  serviceCompletionGuideEnabled,
  readServiceCompletionGuide,
  assertServiceCompletionGuideCurrent,
  selectServiceCompletionContext,
  filterServiceCompletionRequests,
  emptyServiceCompletionFilters,
  openServiceCompletionContext,
  assertServiceCompletionContextCurrent,
  openServiceCompletionReport,
  assertServiceCompletionEvidenceCurrent,
  openServiceCompletionFinding,
  returnServiceCompletionSelection,
  selectServiceCompletionJob,
  completionReviewChecks,
  type ServiceCompletionGuideView,
  type ServiceCompletionContext,
  type ServiceCompletionEvidence,
  type ServiceCompletionFilters,
} from '../../lib/workflows/service-completion-guide';
import type { ServiceReviewContext } from '../../lib/workflows/service-review-path';
import './service-completion-guide.css';
export interface ServiceCompletionGuideProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string, section?: OperatingJobSection) => void;
}
export function ServiceCompletionGuide({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: ServiceCompletionGuideProps) {
  const allowed = serviceCompletionGuideEnabled(enabled);
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
    <Guide
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="service-completion-guide"
      aria-label="Service completion guide"
    >
      <h2>Service completion guide</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current authorized sources are unavailable. Previous evidence is withheld.'
          : 'Service completion guide is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Guide({
  sources,
  selectedJobId,
  onSelectJob,
}: ServiceCompletionGuideProps) {
  const [view, setView] = useState<ServiceCompletionGuideView>(),
    [filters, setFilters] = useState<ServiceCompletionFilters>({
      ...emptyServiceCompletionFilters,
    }),
    [selection, setSelection] = useState<{
      request_id: string;
      job_id: string;
    }>(),
    [confirmed, setConfirmed] = useState(false),
    [path, setPath] = useState<ServiceCompletionContext>(),
    [evidence, setEvidence] = useState<ServiceCompletionEvidence>(),
    [finding, setFinding] =
      useState<Awaited<ReturnType<typeof openServiceCompletionFinding>>>(),
    [atRequests, setAtRequests] = useState(true),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [held, setHeld] = useState(false);
  const life = useRef({ active: true, sequence: 0, pending: false }),
    gate = useRef({ enabled: true, confirmed: true }),
    input = useRef<ServiceReviewContext | undefined>(undefined),
    requestHeading = useRef<HTMLHeadingElement>(null),
    contextHeading = useRef<HTMLHeadingElement>(null),
    reportHeading = useRef<HTMLHeadingElement>(null),
    findingHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    const id = ++l.sequence;
    void readServiceCompletionGuide(sources, g)
      .then((value) => {
        assertServiceCompletionGuideCurrent(value);
        const selected = selectServiceCompletionContext(value, selectedJobId);
        if (l.active && l.sequence === id) {
          setView(value);
          setSelection(selected ?? undefined);
          setBusy(false);
        }
      })
      .catch(() => {
        if (l.active && l.sequence === id) {
          setHeld(true);
          setError(
            'UNKNOWN — exact selected job or current service source is unavailable. No fallback.',
          );
          setBusy(false);
        }
      });
    return () => {
      l.active = false;
      l.sequence++;
      g.enabled = false;
    };
  }, [sources, selectedJobId]);
  useEffect(() => {
    if (atRequests) requestHeading.current?.focus();
    else if (finding) findingHeading.current?.focus();
    else if (evidence) reportHeading.current?.focus();
    else contextHeading.current?.focus();
  }, [atRequests, path, evidence, finding]);
  function fail() {
    setHeld(true);
    setError(
      'UNKNOWN — exact source, staff context or access changed. Retained evidence is read only; no reset, replay or replacement.',
    );
  }
  async function task<T>(read: () => Promise<T>, apply: (value: T) => void) {
    const l = life.current;
    if (l.pending || held) return;
    l.pending = true;
    setBusy(true);
    setError('');
    const id = ++l.sequence;
    try {
      const value = await read();
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
  function change(jobId: string) {
    if (!view || busy) return;
    try {
      const selected = selectServiceCompletionContext(view, jobId);
      if (input.current) input.current.staff_context_confirmed = false;
      life.current.sequence++;
      setSelection(selected ?? undefined);
      setConfirmed(false);
      setPath(undefined);
      setEvidence(undefined);
      setFinding(undefined);
      setError('');
    } catch {
      fail();
    }
  }
  function open() {
    if (!view || !selection || !confirmed || busy) return;
    const original = { ...selection, staff_context_confirmed: true };
    input.current = original;
    void task(
      () => openServiceCompletionContext(view, original),
      (value) => {
        assertServiceCompletionContextCurrent(value);
        setPath(value);
        setAtRequests(false);
      },
    );
  }
  function back() {
    if (!path || !view || !selection || busy) return;
    try {
      const saved = returnServiceCompletionSelection(path);
      if (
        saved.view !== view ||
        saved.selection.request_id !== selection.request_id ||
        saved.selection.job_id !== selection.job_id
      )
        throw Error('Return identity changed');
      setAtRequests(true);
    } catch {
      fail();
    }
  }
  function resume() {
    if (!path || busy) return;
    try {
      assertServiceCompletionContextCurrent(path);
      if (evidence) assertServiceCompletionEvidenceCurrent(evidence);
      setAtRequests(false);
    } catch {
      fail();
    }
  }
  let current = !held;
  try {
    if (view) assertServiceCompletionGuideCurrent(view);
    if (path) assertServiceCompletionContextCurrent(path);
    if (evidence) assertServiceCompletionEvidenceCurrent(evidence);
  } catch {
    current = false;
  }
  let rows: ReturnType<typeof filterServiceCompletionRequests> = [];
  try {
    if (current && view) rows = filterServiceCompletionRequests(view, filters);
  } catch {
    current = false;
  }
  const group =
      current && view
        ? view.requests.find((r) => r.request.id === selection?.request_id)
        : undefined,
    safe = current ? path?.customer_safe : undefined,
    visibleSelection = rows.some((r) => r.job.job_id === selection?.job_id);
  function filter(key: keyof ServiceCompletionFilters, value: string) {
    setFilters((old) => ({ ...old, [key]: value }));
  }
  return (
    <section
      className="service-completion-guide"
      aria-label="Service completion guide"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Service completion guide</h2>
          <p>
            Review an actual request, exact published evidence and missing
            completion proof. Local read only.
          </p>
        </div>
        <span>Documentation review · no physical PASS</span>
      </header>
      {busy && <p role="status">Loading exact service completion evidence…</p>}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — current source or access changed. Previous evidence is withheld.'}
        </p>
      )}
      {current && view && (
        <>
          <p>
            {view.available_requests} available requests ·{' '}
            {view.available_job_contexts} admitted job contexts. Available
            sources are not complete history.
          </p>
          {atRequests && (
            <>
              <h3 ref={requestHeading} tabIndex={-1}>
                Service requests and next review
              </h3>
              <div className="service-completion-guide-filters">
                <label>
                  Search service requests
                  <input
                    value={filters.query}
                    maxLength={100}
                    disabled={busy}
                    onChange={(e) => filter('query', e.target.value)}
                  />
                </label>
                <label>
                  Service customer
                  <select
                    value={filters.customer_id}
                    disabled={busy}
                    onChange={(e) => filter('customer_id', e.target.value)}
                  >
                    <option value="">All available customers</option>
                    {[
                      ...new Map(
                        view.requests.map((r) => [r.customer_id, r]),
                      ).values(),
                    ].map((r) => (
                      <option key={r.customer_id} value={r.customer_id}>
                        {r.customer_label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Service property
                  <select
                    value={filters.location_id}
                    disabled={busy}
                    onChange={(e) => filter('location_id', e.target.value)}
                  >
                    <option value="">All available properties</option>
                    {[
                      ...new Map(
                        view.requests.map((r) => [r.location_id, r]),
                      ).values(),
                    ].map((r) => (
                      <option key={r.location_id} value={r.location_id}>
                        {r.property_label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Request state
                  <select
                    value={filters.request_state}
                    disabled={busy}
                    onChange={(e) => filter('request_state', e.target.value)}
                  >
                    <option value="">All recorded states</option>
                    {[
                      ...new Set(view.requests.map((r) => r.request.status)),
                    ].map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p role="status">{rows.length} matching request/job contexts.</p>
              {rows.length ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    open();
                  }}
                >
                  <label>
                    Service request and review job
                    <select
                      value={visibleSelection ? selection?.job_id : ''}
                      disabled={busy}
                      onChange={(e) => change(e.target.value)}
                    >
                      <option value="" disabled>
                        Select an exact request/job context
                      </option>
                      {rows.map((row) => (
                        <option key={row.job.job_id} value={row.job.job_id}>
                          {row.request.summary} · {row.job.name} ·{' '}
                          {row.job.job_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  {visibleSelection && group && (
                    <p>
                      {group.customer_label} · {group.property_label} · request{' '}
                      {group.request.id} · recorded state {group.request.status}
                    </p>
                  )}
                  <p>
                    Request-to-job relationship UNKNOWN: the source has no
                    recorded request/job foreign key. Choose an authorized staff
                    review context explicitly.
                  </p>
                  <label className="service-completion-guide-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy || !visibleSelection}
                      onChange={(e) => {
                        if (input.current)
                          input.current.staff_context_confirmed =
                            e.target.checked;
                        setConfirmed(e.target.checked);
                        if (!e.target.checked) {
                          setPath(undefined);
                          setEvidence(undefined);
                          setFinding(undefined);
                        }
                      }}
                    />
                    I confirm this exact job as staff-selected review context.
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !confirmed || !visibleSelection}
                  >
                    Open service completion context
                  </button>
                </form>
              ) : (
                <p>
                  No matching accessible request contexts. Adjust the literal
                  filters; no broader source is substituted.
                </p>
              )}
              {path && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={resume}
                >
                  Resume retained completion review
                </button>
              )}
            </>
          )}
          {!atRequests && path && safe && (
            <>
              <nav aria-label="Service completion review path">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={back}
                >
                  Return to service requests
                </button>
                <span>
                  Request {path.request.id} › job {path.context.job_id} ›
                  property {safe.property.location_id}
                </span>
              </nav>
              <h3 ref={contextHeading} tabIndex={-1}>
                {safe.scope.name} · exact service context
              </h3>
              <p>
                {path.customer_label} · {safe.property.label} ·{' '}
                {path.request.summary}
              </p>
              <dl>
                <dt>Request-to-job relationship</dt>
                <dd>
                  UNKNOWN absent recorded FK; explicitly confirmed
                  staff-selected context.
                </dd>
                <dt>Exact job / immutable issued version</dt>
                <dd>
                  {safe.scope.job_id} / {safe.scope.issued_version_id} · version{' '}
                  {safe.scope.issued_version_number}
                </dd>
                <dt>Exact customer / property</dt>
                <dd>
                  {safe.property.customer_id} / {safe.property.location_id}
                </dd>
              </dl>
              <h4>Completion requirements (UNKNOWN)</h4>
              <p>
                Next review: inspect original documentation, then review each
                missing proof. This guide cannot record physical verification,
                acceptance or warranty.
              </p>
              <ul>
                {safe.required_proof.map((proof) => (
                  <li key={proof.kind}>
                    <strong>
                      {proof.kind.replaceAll('_', ' ')} — {proof.status}
                    </strong>
                    <p>{proof.required}</p>
                    <p>Evidence: {proof.evidence.replaceAll('_', ' ')}</p>
                  </li>
                ))}
              </ul>
              <h4>Safe Passport published documentation</h4>
              <p>
                {safe.documentation.length} available report versions ·{' '}
                {safe.timeline.snapshot.events.length} available timeline
                events. History completeness UNKNOWN.
              </p>
              <details>
                <summary>Safe Passport timeline sources</summary>
                <p>
                  Original recorded dates retain their meanings; same-day events
                  do not prove an order of work or completion.
                </p>
                <ul>
                  {safe.timeline.snapshot.events.map((event) => (
                    <li key={event.source_sha256}>
                      {event.date} · {event.date_meaning.replaceAll('-', ' ')} ·{' '}
                      {event.kind === 'inspection-documentation' ? (
                        <>
                          published report {event.report.reference.report_id}{' '}
                          version {event.report.reference.published_version};
                          recorded report/job link {event.job_link_status};
                          physical completion UNVERIFIED
                        </>
                      ) : (
                        <>
                          issued scope {event.job.issued_source.scope.name} ·
                          job {event.job.reference.job_id} · version{' '}
                          {event.job.reference.issued_version_number}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
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
                    onClick={() => {
                      setFinding(undefined);
                      setEvidence(undefined);
                      void task(
                        () =>
                          openServiceCompletionReport(
                            path,
                            doc.report.reference,
                          ),
                        (value) => {
                          assertServiceCompletionEvidenceCurrent(value);
                          setEvidence(value);
                        },
                      );
                    }}
                  >
                    Review exact published report{' '}
                    {doc.report.reference.report_id} version{' '}
                    {doc.report.reference.published_version}
                  </button>
                </article>
              ))}
              {evidence && (
                <article>
                  <h4 ref={reportHeading} tabIndex={-1}>
                    Exact report and completion review ·{' '}
                    {evidence.report.reference.report_id} version{' '}
                    {evidence.report.reference.published_version}
                  </h4>
                  <p>
                    Recorded visit {evidence.report.visited_on} · published{' '}
                    {evidence.report.published_at} · {evidence.report.phase}{' '}
                    phase
                  </p>
                  <p>{evidence.report.summary}</p>
                  <h5>Recorded checklist</h5>
                  {evidence.report.checklist.length ? (
                    <ul>
                      {evidence.report.checklist.map((item) => (
                        <li key={item.reference.source_index}>
                          {item.label}: recorded{' '}
                          {item.recorded_completed ? 'checked' : 'unchecked'};
                          not physical verification.
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No checklist evidence recorded.</p>
                  )}
                  <h5>Observations and separate recommendations</h5>
                  {evidence.report.observations.length ? (
                    evidence.report.observations.map((item) => (
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
                          onClick={() =>
                            void task(
                              () =>
                                openServiceCompletionFinding(
                                  path,
                                  item.reference,
                                ),
                              (value) => {
                                assertServiceCompletionContextCurrent(path);
                                setFinding(value);
                              },
                            )
                          }
                        >
                          Inspect exact service finding{' '}
                          {item.reference.finding_id}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>
                      No findings recorded. Absence does not verify repair or
                      completion.
                    </p>
                  )}
                  {evidence.completion ? (
                    <>
                      <h5>Exact issued scope documentation comparison</h5>
                      <ul>
                        {evidence.completion.job.lines.map((line) => (
                          <li key={line.id}>
                            {line.description} · {line.quantity_milli / 1000}{' '}
                            {line.unit} · documentation match NOT ESTABLISHED
                          </li>
                        ))}
                      </ul>
                      <p>
                        Physical completion:{' '}
                        {evidence.completion.interpretation.physical_completion}{' '}
                        · customer acceptance:{' '}
                        {evidence.completion.interpretation.customer_acceptance}{' '}
                        · warranty:{' '}
                        {evidence.completion.interpretation.warranty}.
                      </p>
                    </>
                  ) : (
                    <p>
                      Completion comparison UNKNOWN: no exact recorded
                      report-to-selected-job link. Separate property
                      documentation only.
                    </p>
                  )}
                  <details>
                    <summary>Original documentation review criteria</summary>
                    <ul>
                      {Object.values(completionReviewChecks).map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                    <p>
                      Criteria are guidance only. No confirmation, attestation
                      or preparation is recorded here.
                    </p>
                  </details>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      try {
                        assertServiceCompletionEvidenceCurrent(evidence);
                        setEvidence(undefined);
                        setFinding(undefined);
                        requestAnimationFrame(() =>
                          contextHeading.current?.focus(),
                        );
                      } catch {
                        fail();
                      }
                    }}
                  >
                    Return to published report selection
                  </button>
                  {onSelectJob && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        try {
                          assertServiceCompletionEvidenceCurrent(evidence);
                          onSelectJob(
                            selectServiceCompletionJob(path),
                            'completion',
                          );
                        } catch {
                          fail();
                        }
                      }}
                    >
                      Open same service job {safe.scope.name}
                    </button>
                  )}
                </article>
              )}
              {finding && (
                <article>
                  <h4 ref={findingHeading} tabIndex={-1}>
                    Exact service finding {finding.finding.reference.finding_id}
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
              <aside>
                Checkmarks, after-phase reports, photos and absent findings
                never verify physical completion, customer acceptance or
                warranty.
              </aside>
            </>
          )}
        </>
      )}
      <footer>
        Existing request, issued scope, published report and safe Passport
        sources only. No request/job link, completion approval, business store,
        customer route, writer, dispatch, message or financial effect.
      </footer>
    </section>
  );
}
