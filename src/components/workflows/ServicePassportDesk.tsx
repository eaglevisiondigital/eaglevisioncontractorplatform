import { useEffect, useRef, useState } from 'react';
import type {
  PassportFindingReference,
  PassportReportReference,
} from '../../domain/property/passport';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  assertServicePassportCurrentNow,
  assertServicePassportDetailCurrentNow,
  readServicePassportDesk,
  openServicePassportJob,
  openServicePassportReport,
  openServicePassportFinding,
  selectServicePassportJob,
  inspectServicePassportDesk,
  type ServicePassportInput,
  type ServicePassportView,
  type ServicePassportDetail,
} from '../../lib/workflows/service-passport-desk';
import './service-passport-desk.css';

export interface ServicePassportDeskProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function ServicePassportDesk({
  sources,
  enabled = false,
  onSelectJob,
}: ServicePassportDeskProps) {
  const admitted =
    typeof window !== 'undefined' &&
    journeyEnabled({
      development: import.meta.env.DEV,
      flag: enabled ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  let check: (() => void) | null = null;
  if (admitted)
    try {
      check = captureOperatingSources(sources, {
        enabled: true,
        confirmed: true,
      }).check;
    } catch {
      /* Denied sources stay unreadable. */
    }
  const [binding, bind] = useState({ sources, admitted, check, generation: 0 });
  let stale = false;
  try {
    binding.check?.();
  } catch {
    stale = true;
  }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    stale ||
    Boolean(binding.check) !== Boolean(check)
  ) {
    bind({ sources, admitted, check, generation: binding.generation + 1 });
    return null;
  }
  return admitted && check ? (
    <Desk
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="service-passport-desk"
      aria-label="Service and Passport desk"
    >
      <h2>Service and Passport desk</h2>
      <p>
        {admitted
          ? 'UNKNOWN — current authorized sources are unavailable. Previous evidence is withheld.'
          : 'Service and Passport desk is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
const emptyFilters = (): ServicePassportInput => ({
  query: '',
  customer_id: '',
  location_id: '',
  job_id: '',
  state: '',
});
function Desk({ sources, onSelectJob }: ServicePassportDeskProps) {
  const [filters, setFilters] = useState(emptyFilters),
    [view, setView] = useState<ServicePassportView>(),
    [options, setOptions] = useState<ServicePassportView>(),
    [detail, setDetail] = useState<ServicePassportDetail>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof openServicePassportReport>>>(),
    [finding, setFinding] =
      useState<Awaited<ReturnType<typeof openServicePassportFinding>>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [held, setHeld] = useState(false);
  const active = useRef(true),
    gate = useRef({ enabled: true, confirmed: true }),
    original = useRef<ServicePassportInput | undefined>(undefined),
    operation = useRef(0),
    pending = useRef(false),
    selectionHeading = useRef<HTMLHeadingElement>(null),
    sourceHeading = useRef<HTMLHeadingElement>(null),
    reportHeading = useRef<HTMLHeadingElement>(null),
    findingHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const admission = gate.current;
    active.current = true;
    admission.enabled = true;
    return () => {
      active.current = false;
      admission.enabled = false;
    };
  }, []);
  useEffect(() => {
    if (finding) findingHeading.current?.focus();
    else if (report) reportHeading.current?.focus();
    else if (detail) sourceHeading.current?.focus();
  }, [detail, report, finding]);
  function change(next: ServicePassportInput) {
    if (original.current) original.current.query = '\u0000selection changed';
    operation.current++;
    setFilters(next);
    setView(undefined);
    setDetail(undefined);
    setReport(undefined);
    setFinding(undefined);
    setError('');
  }
  async function task<T>(read: () => Promise<T>, apply: (value: T) => void) {
    if (pending.current || held) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const id = ++operation.current;
    try {
      const value = await read();
      if (active.current && operation.current === id) apply(value);
    } catch {
      if (active.current && operation.current === id) {
        setHeld(true);
        setDetail(undefined);
        setReport(undefined);
        setFinding(undefined);
        setError(
          'UNKNOWN — the exact source or access changed, or the read outcome is unavailable. Retained evidence is read only; no replay or replacement.',
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
    const selected = { ...filters };
    original.current = selected;
    setView(undefined);
    setDetail(undefined);
    setReport(undefined);
    setFinding(undefined);
    void task(
      () => readServicePassportDesk(sources, selected, gate.current),
      (v) => {
        assertServicePassportCurrentNow(v);
        setView(v);
        setOptions(v);
      },
    );
  }
  function open(jobId: string) {
    if (!view) return;
    setDetail(undefined);
    setReport(undefined);
    setFinding(undefined);
    void task(
      () => openServicePassportJob(view, jobId),
      (d) => {
        assertServicePassportDetailCurrentNow(d);
        setDetail(d);
      },
    );
  }
  function inspect(reference: PassportReportReference) {
    if (!detail) return;
    setReport(undefined);
    setFinding(undefined);
    void task(
      () => openServicePassportReport(detail, reference),
      (r) => {
        assertServicePassportDetailCurrentNow(detail);
        setReport(r);
      },
    );
  }
  function inspectFinding(reference: PassportFindingReference) {
    if (!detail) return;
    setFinding(undefined);
    void task(
      () => openServicePassportFinding(detail, reference),
      (f) => {
        assertServicePassportDetailCurrentNow(detail);
        setFinding(f);
      },
    );
  }
  function navigate() {
    if (!detail || !report || busy || held) return;
    try {
      const jobId = selectServicePassportJob(detail);
      onSelectJob?.(jobId);
    } catch {
      setHeld(true);
      setError('UNKNOWN — exact existing job navigation is unavailable.');
    }
  }
  let current = !held;
  try {
    if (view) assertServicePassportCurrentNow(view);
    if (detail) assertServicePassportDetailCurrentNow(detail);
  } catch {
    current = false;
  }
  const safe = current ? detail?.customer_safe : undefined,
    staff = current ? detail?.staff : undefined,
    progress = view && current ? inspectServicePassportDesk(view) : undefined;
  return (
    <section
      className="service-passport-desk"
      aria-label="Service and Passport desk"
      aria-busy={busy}
    >
      <header>
        <div>
          <span className="service-passport-desk-eyebrow">
            Customer service · Property Passport
          </span>
          <h2>Service and Passport desk</h2>
          <p>
            Find an existing request, inspect its selected issued job and follow
            exact published documentation into the property’s Passport.
          </p>
        </div>
        <span className="service-passport-desk-pill">
          Local preview · read only
        </span>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <label>
          Search service evidence
          <input
            value={filters.query}
            maxLength={100}
            onChange={(e) => change({ ...filters, query: e.target.value })}
          />
        </label>
        <label>
          Customer
          <select
            value={filters.customer_id}
            onChange={(e) =>
              change({
                ...filters,
                customer_id: e.target.value,
                location_id: '',
                job_id: '',
              })
            }
          >
            <option value="">All available customers</option>
            {options?.customer_options.map((p) => (
              <option key={p.customer_id} value={p.customer_id}>
                {p.label} · {p.customer_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Property
          <select
            value={filters.location_id}
            onChange={(e) =>
              change({ ...filters, location_id: e.target.value, job_id: '' })
            }
          >
            <option value="">All available properties</option>
            {options?.property_options
              .filter(
                (p) =>
                  !filters.customer_id || p.customer_id === filters.customer_id,
              )
              .map((p) => (
                <option key={p.location_id} value={p.location_id}>
                  {p.label} · {p.location_id}
                </option>
              ))}
          </select>
        </label>
        <label>
          Job
          <select
            value={filters.job_id}
            onChange={(e) => change({ ...filters, job_id: e.target.value })}
          >
            <option value="">All available jobs</option>
            {options?.job_options
              .filter(
                (p) =>
                  (!filters.customer_id ||
                    p.customer_id === filters.customer_id) &&
                  (!filters.location_id ||
                    p.location_id === filters.location_id),
              )
              .map((p) => (
                <option key={p.job_id} value={p.job_id}>
                  {p.label} · version {p.issued_version_number} · {p.job_id}
                </option>
              ))}
          </select>
        </label>
        <label>
          Request state
          <select
            value={filters.state}
            onChange={(e) => change({ ...filters, state: e.target.value })}
          >
            <option value="">All recorded states</option>
            {options?.state_options.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || held}>
          Explore service evidence
        </button>
      </form>
      {busy && (
        <p role="status">Loading exact service and published sources…</p>
      )}
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — retained evidence is stale or access was denied. Previous source content is withheld.'}
        </p>
      )}
      {!view && !busy && !error && (
        <p role="status">
          Choose filters, then explore available service evidence.
        </p>
      )}
      {view && current && (
        <>
          <p className="service-passport-desk-coverage" role="status">
            {view.matching_jobs} matching jobs across {view.matching_requests}{' '}
            requests. Available: {view.available_requests} requests,{' '}
            {view.available_jobs} jobs, {view.available_properties} properties
            and {view.available_reports} published report versions. Available
            sources are not complete history.
          </p>
          <p className="service-passport-desk-muted">
            {progress?.inspected_sources ?? 0} sources inspected in this tab.
            Reading records does not verify work, customer acceptance or
            warranty.
          </p>
          {!detail && (
            <>
              <h3 ref={selectionHeading} tabIndex={-1}>
                Service selection
              </h3>
              {view.staff_paths.length === 0 ? (
                <p>
                  No matching available service sources. Adjust the literal
                  search or filters.
                </p>
              ) : (
                <div
                  className="service-passport-desk-table"
                  role="region"
                  aria-label="Available service source table"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Request and state</th>
                        <th scope="col">Customer and property</th>
                        <th scope="col">Issued job and documentation</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.staff_paths.map((p) => (
                        <tr key={p.job_id}>
                          <td>
                            <strong>{p.request.summary}</strong>
                            <p>
                              {p.request.status} · {p.request.id}
                            </p>
                          </td>
                          <td>
                            {p.customer_label}
                            <p>{p.property_label}</p>
                            <p>{p.location_id}</p>
                          </td>
                          <td>
                            <strong>{p.scope_name}</strong>
                            <p>
                              Issued version {p.issued_version_number} ·{' '}
                              {p.job_id}
                            </p>
                            <p>
                              {p.linked_reports.length} exact recorded
                              job-linked reports; {p.property_report_count}{' '}
                              property report versions available.
                            </p>
                          </td>
                          <td>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => open(p.job_id)}
                              aria-label={`Open service source ${p.scope_name} ${p.job_id}`}
                            >
                              Open service source
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {safe && staff && (
            <>
              <nav aria-label="Service source path">
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDetail(undefined);
                    setReport(undefined);
                    setFinding(undefined);
                    requestAnimationFrame(() =>
                      selectionHeading.current?.focus(),
                    );
                  }}
                >
                  Back to service selection
                </button>
                <span>
                  {staff.customer_label} › {safe.property.label} ›{' '}
                  {safe.scope.name}
                </span>
              </nav>
              <h3 ref={sourceHeading} tabIndex={-1}>
                Service source: {safe.scope.name}
              </h3>
              <div className="service-passport-desk-grid">
                <article>
                  <h4>Original service request</h4>
                  <p>{staff.request.summary}</p>
                  <dl>
                    <dt>Recorded request state</dt>
                    <dd>{staff.request.status}</dd>
                    <dt>Exact request</dt>
                    <dd>{staff.request.id}</dd>
                    <dt>Customer / property</dt>
                    <dd>
                      {safe.property.customer_id} / {safe.property.location_id}
                    </dd>
                    <dt>Request to issued scope</dt>
                    <dd>
                      Explicit staff selection. A recorded request-to-estimate
                      link is UNKNOWN.
                    </dd>
                    <dt>Original local test preference receipt</dt>
                    <dd>
                      {staff.receipt.id} · {staff.receipt.decision}. Genuine
                      customer approval is unverified.
                    </dd>
                  </dl>
                </article>
                <article>
                  <h4>Immutable issued scope</h4>
                  <p>{safe.scope.description}</p>
                  <dl>
                    <dt>Existing job</dt>
                    <dd>{safe.scope.job_id}</dd>
                    <dt>Estimate / issued version</dt>
                    <dd>
                      {safe.scope.estimate_id} / {safe.scope.issued_version_id}{' '}
                      · version {safe.scope.issued_version_number}
                    </dd>
                    <dt>Issued source SHA-256</dt>
                    <dd>{safe.scope.issued_source_sha256}</dd>
                  </dl>
                  <ul>
                    {safe.scope.lines.map((line) => (
                      <li key={line.id}>
                        {line.description} · {line.quantity_milli / 1000}{' '}
                        {line.unit}. Completion match UNKNOWN.
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
              <section
                className="service-passport-desk-passport"
                aria-label={`Property Passport timeline ${safe.property.location_id}`}
              >
                <h4>Property Passport timeline</h4>
                <p>
                  Existing published documentation and issued scopes. Recorded
                  visit dates and issue dates have different meanings; same
                  dates do not establish sequence or recurrence. Job links
                  require exact recorded evidence.
                </p>
                <ol>
                  {safe.timeline.snapshot.events.map((event) => (
                    <li key={`${event.kind}:${event.source_sha256}`}>
                      <strong>
                        {event.kind === 'inspection-documentation'
                          ? 'Published inspection documentation'
                          : 'Issued job scope'}
                      </strong>
                      <p>
                        {event.date} · {event.date_meaning}
                      </p>
                      {event.kind === 'inspection-documentation' ? (
                        <>
                          <p>{event.report.summary}</p>
                          <p>
                            Report {event.reference.report_id} · version{' '}
                            {event.reference.published_version}
                          </p>
                          <p>
                            {event.job_link_status === 'EXACT' &&
                            event.linked_jobs.length === 1 &&
                            event.linked_jobs[0].job_id === safe.scope.job_id
                              ? 'Exact recorded link to this job.'
                              : 'Association to this selected job UNKNOWN; property documentation stays separate.'}
                          </p>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => inspect(event.report.reference)}
                            aria-label={`Inspect report ${event.report.reference.report_id} version ${event.report.reference.published_version}`}
                          >
                            Inspect report {event.report.reference.report_id}{' '}
                            version {event.report.reference.published_version}
                          </button>
                        </>
                      ) : (
                        <p>
                          {event.job.issued_source.scope.name} · job{' '}
                          {event.job.reference.job_id} · issued version{' '}
                          {event.job.reference.issued_version_id}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
              {report && (
                <article className="service-passport-desk-report">
                  <h4 ref={reportHeading} tabIndex={-1}>
                    Published report {report.reference.report_id} · version{' '}
                    {report.reference.published_version}
                  </h4>
                  <p>
                    Property {report.reference.location_id} · recorded visit{' '}
                    {report.visited_on} · published {report.published_at} ·{' '}
                    {report.phase} phase
                  </p>
                  <p>{report.summary}</p>
                  <h5>Recorded checklist evidence</h5>
                  {report.checklist.length ? (
                    <ul>
                      {report.checklist.map((c) => (
                        <li key={c.reference.source_index}>
                          {c.label}:{' '}
                          {c.recorded_completed
                            ? 'recorded checked'
                            : 'recorded unchecked'}
                          . This does not verify physical completion.
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No checklist evidence recorded in this report.</p>
                  )}
                  <h5>Published findings</h5>
                  {report.observations.length ? (
                    report.observations.map((o) => (
                      <div
                        key={`${o.reference.finding_id}:${o.reference.source_index}`}
                      >
                        <p>
                          {o.category} · {o.location} · {o.severity}
                        </p>
                        <p>Observation: {o.observation}</p>
                        <p>Recommendation: {o.recommendation}</p>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => inspectFinding(o.reference)}
                        >
                          Inspect finding {o.reference.finding_id}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>
                      No findings recorded. Absence of findings does not
                      establish repair or completion.
                    </p>
                  )}
                </article>
              )}
              {finding && (
                <article>
                  <h4 ref={findingHeading} tabIndex={-1}>
                    Exact published finding{' '}
                    {finding.finding.reference.finding_id}
                  </h4>
                  <p>
                    Report {finding.report_reference.report_id} · version{' '}
                    {finding.report_reference.published_version} · source
                    position {finding.finding.reference.source_index + 1}
                  </p>
                  <p>{finding.finding.observation}</p>
                  <p>Recommendation: {finding.finding.recommendation}</p>
                  <p>
                    Published observation only. Physical completion remains
                    UNKNOWN.
                  </p>
                </article>
              )}
              {report && onSelectJob && (
                <button
                  type="button"
                  disabled={busy || held}
                  onClick={navigate}
                >
                  Open existing job {safe.scope.name}
                </button>
              )}
              <aside className="service-passport-desk-notice">
                <strong>Required verification is missing</strong>
                <p>
                  Physical completion, customer acceptance and warranty
                  eligibility remain UNKNOWN. After-phase documentation, photos,
                  recorded checkmarks and absent findings do not supply
                  verification.
                </p>
                <details>
                  <summary>Inspect evidence requirements</summary>
                  <ul>
                    {safe.required_proof.map((p) => (
                      <li key={p.kind}>
                        {p.kind}: UNKNOWN — {p.required}
                      </li>
                    ))}
                  </ul>
                </details>
              </aside>
            </>
          )}
        </>
      )}
      <footer>
        Customer-safe documentation excludes staff notes, internal costs,
        supplier, workforce and rate details. Staff request and local test
        receipt references stay in the separate source review. Same-tab
        inspection metadata is not genuine Auth, durable custody, approval,
        dispatch or financial authority. No messages or actions are executed.
      </footer>
    </section>
  );
}
