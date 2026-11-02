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
  readServiceSourceContinuity,
  assertServiceSourceContinuityCurrentNow,
  openServiceSourceReport,
  openServiceSourceFinding,
  selectServiceSourceJob,
  type ServiceSourceInput,
  type ServiceSourceRead,
} from '../../lib/workflows/service-source-continuity';
import './service-source-continuity.css';
export interface ServiceSourceContinuityProps {
  sources: OperatingSources;
  enabled?: boolean;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
}
export function ServiceSourceContinuity({
  sources,
  enabled = false,
  selectedJobId,
  onSelectJob,
}: ServiceSourceContinuityProps) {
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
      /* Denied sources remain withheld. */
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
    <Continuity
      key={bound.generation}
      sources={sources}
      selectedJobId={selectedJobId}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="service-source-continuity"
      aria-label="Service source continuity"
    >
      <h2>Service source continuity</h2>
      <p>
        {allowed
          ? 'UNKNOWN — current authorized sources are unavailable. Previous evidence is withheld.'
          : 'Service source continuity is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Continuity({
  sources,
  selectedJobId,
  onSelectJob,
}: ServiceSourceContinuityProps) {
  const [job, setJob] = useState(
      selectedJobId ?? sources.entries[0].target.job_id!,
    ),
    [read, setRead] = useState<ServiceSourceRead>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof openServiceSourceReport>>>(),
    [finding, setFinding] =
      useState<Awaited<ReturnType<typeof openServiceSourceFinding>>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [held, setHeld] = useState(false);
  const gate = useRef({ enabled: true, confirmed: true }),
    active = useRef(true),
    sequence = useRef({ value: 0 }),
    pending = useRef(false),
    original = useRef<ServiceSourceInput | undefined>(undefined),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    reportHeading = useRef<HTMLHeadingElement>(null),
    findingHeading = useRef<HTMLHeadingElement>(null),
    selectionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const g = gate.current,
      s = sequence.current;
    active.current = true;
    g.enabled = true;
    return () => {
      active.current = false;
      g.enabled = false;
      s.value++;
    };
  }, []);
  useEffect(() => {
    if (finding) findingHeading.current?.focus();
    else if (report) reportHeading.current?.focus();
    else if (read) sourceHeading.current?.focus();
  }, [read, report, finding]);
  function change(value: string) {
    if (original.current) original.current.job_id = '\u0000withdrawn';
    sequence.current.value++;
    setJob(value);
    setRead(undefined);
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
        setReport(undefined);
        setFinding(undefined);
        setError(
          'UNKNOWN — the exact source or current access changed, or the read acknowledgment is unavailable. No replacement or replay.',
        );
      }
    } finally {
      if (active.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function load() {
    if (pending.current || held) return;
    const input = { job_id: job };
    original.current = input;
    setRead(undefined);
    setReport(undefined);
    setFinding(undefined);
    void task(
      () => readServiceSourceContinuity(sources, input, gate.current),
      (value) => {
        assertServiceSourceContinuityCurrentNow(value);
        setRead(value);
      },
    );
  }
  function inspect(reference: PassportReportReference) {
    if (!read) return;
    setReport(undefined);
    setFinding(undefined);
    void task(
      () => openServiceSourceReport(read, reference),
      (value) => {
        assertServiceSourceContinuityCurrentNow(read);
        setReport(value);
      },
    );
  }
  function inspectFinding(reference: PassportFindingReference) {
    if (!read) return;
    setFinding(undefined);
    void task(
      () => openServiceSourceFinding(read, reference),
      (value) => {
        assertServiceSourceContinuityCurrentNow(read);
        setFinding(value);
      },
    );
  }
  function navigate() {
    if (!read || !report || busy) return;
    try {
      onSelectJob?.(selectServiceSourceJob(read));
    } catch {
      setHeld(true);
      setError('UNKNOWN — exact existing job navigation is unavailable.');
    }
  }
  let current = !held;
  try {
    if (read) assertServiceSourceContinuityCurrentNow(read);
  } catch {
    current = false;
  }
  const safe = current ? read?.customer_safe : undefined;
  return (
    <section
      className="service-source-continuity"
      aria-label="Service source continuity"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Service source continuity</h2>
          <p>
            Continue from the selected job and actual request directly into its
            property’s exact published reports and Passport evidence.
          </p>
        </div>
        <span className="service-source-continuity-pill">
          Local read-only evidence
        </span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label>
          Continuity source job
          <select
            value={job}
            disabled={busy || held}
            onChange={(e) => change(e.target.value)}
          >
            {sources.entries.map((entry) => (
              <option key={entry.target.job_id} value={entry.target.job_id!}>
                Job {entry.target.job_id} · property {entry.target.location_id}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || held}>
          Inspect selected service source
        </button>
      </form>
      {busy && (
        <p role="status">
          Loading the exact request, issued job and original published sources…
        </p>
      )}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — source evidence or current access changed. Previous content is withheld.'}
        </p>
      )}
      {!read && !busy && !error && (
        <p>
          Inspect the selected job to see its available original report
          versions.
        </p>
      )}
      {read && safe && (
        <>
          <h3 ref={sourceHeading} tabIndex={-1}>
            Original service source: {safe.scope.name}
          </h3>
          <p>
            {read.customer_label} · {safe.property.label}
          </p>
          <dl>
            <dt>Actual request / recorded state</dt>
            <dd>
              {read.staff_request.id} / {read.staff_request.status}
            </dd>
            <dt>Request summary</dt>
            <dd>{read.staff_request.summary}</dd>
            <dt>Request to issued scope</dt>
            <dd>
              Staff-selected source relationship; a recorded request-to-estimate
              link and genuine acceptance are UNKNOWN.
            </dd>
            <dt>Exact customer / property / job</dt>
            <dd>
              {safe.property.customer_id} / {safe.property.location_id} /{' '}
              {safe.scope.job_id}
            </dd>
            <dt>Immutable issued version</dt>
            <dd>
              {safe.scope.issued_version_id} · version{' '}
              {safe.scope.issued_version_number}
            </dd>
          </dl>
          <p>{safe.scope.description}</p>
          <section
            aria-label={`Property Passport published report selection ${safe.property.location_id}`}
          >
            <h4 ref={selectionHeading} tabIndex={-1}>
              Property Passport · available published report versions
            </h4>
            <p>
              {safe.documentation.length} available original report versions.
              History coverage is UNKNOWN. Distinct jobs at one property retain
              distinct issued sources.
            </p>
            {safe.documentation.length === 0 ? (
              <p>No accessible published documentation is available.</p>
            ) : (
              safe.documentation.map((item) => (
                <article
                  key={`${item.report.reference.report_id}:${item.report.reference.published_version}`}
                >
                  <h5>
                    Report {item.report.reference.report_id} · version{' '}
                    {item.report.reference.published_version}
                  </h5>
                  <p>{item.report.summary}</p>
                  <p>
                    Recorded visit {item.report.visited_on} · published{' '}
                    {item.report.published_at} · {item.report.phase} phase
                  </p>
                  <p>
                    {item.selected_job_association === 'EXACT_RECORDED_JOB_LINK'
                      ? 'Exact recorded link to the selected job.'
                      : 'Selected-job association UNKNOWN; this remains separate property documentation.'}
                  </p>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => inspect(item.report.reference)}
                  >
                    Open exact published report{' '}
                    {item.report.reference.report_id} version{' '}
                    {item.report.reference.published_version}
                  </button>
                </article>
              ))
            )}
          </section>
          {report && (
            <article>
              <h4 ref={reportHeading} tabIndex={-1}>
                Exact published report {report.reference.report_id} version{' '}
                {report.reference.published_version}
              </h4>
              <p>
                Original property {report.reference.location_id} · recorded
                visit {report.visited_on} · published {report.published_at}
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
                      . This does not verify physical completion.
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No checklist evidence recorded.</p>
              )}
              <h5>Original published findings</h5>
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
                      className="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => inspectFinding(item.reference)}
                    >
                      Inspect exact published finding{' '}
                      {item.reference.finding_id}
                    </button>
                  </div>
                ))
              ) : (
                <p>
                  No findings recorded. Absence of findings is not repair or
                  completion evidence.
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
                    selectionHeading.current?.focus(),
                  );
                }}
              >
                Back to published report selection
              </button>
            </article>
          )}
          {finding && (
            <article>
              <h4 ref={findingHeading} tabIndex={-1}>
                Exact original finding {finding.finding.reference.finding_id}
              </h4>
              <p>
                Report {finding.report_reference.report_id} · version{' '}
                {finding.report_reference.published_version} · source position{' '}
                {finding.finding.reference.source_index + 1}
              </p>
              <p>{finding.finding.observation}</p>
              <p>Recommendation: {finding.finding.recommendation}</p>
            </article>
          )}
          {report && onSelectJob && (
            <button type="button" disabled={busy} onClick={navigate}>
              Open continuity existing job {safe.scope.name}
            </button>
          )}
          <aside className="service-source-continuity-notice">
            Physical completion, customer acceptance and warranty eligibility
            remain UNKNOWN. Original after-phase records, checkmarks, photos and
            absent findings do not verify work or approval. Passport
            documentation remains available evidence only.
          </aside>
        </>
      )}
      <footer>
        Existing customer-safe published projections only. No new
        customer/request/history store, completion attestation, message,
        dispatch, financial action, genuine Auth, durable custody or hosted
        capability.
      </footer>
    </section>
  );
}
