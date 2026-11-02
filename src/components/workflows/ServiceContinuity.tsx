import { useEffect, useRef, useState } from 'react';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  assertServiceContinuityCurrentNow,
  assertServiceContinuityDetailCurrentNow,
  readServiceContinuity,
  openServiceContinuityJob,
  openServiceContinuityReport,
  selectServiceContinuityJob,
  type ServiceContinuityInput,
  type ServiceContinuityView,
  type ServiceContinuityDetail,
} from '../../lib/workflows/service-continuity';
import type { PassportReportReference } from '../../domain/property/passport';
import './service-continuity.css';
export interface ServiceContinuityProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function ServiceContinuity({
  sources,
  enabled = false,
  onSelectJob,
}: ServiceContinuityProps) {
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
      /* No presentation reads from denied sources. */
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
    <Continuity
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section className="service-continuity" aria-label="Service continuity">
      <h2>Service continuity</h2>
      <p>
        {admitted
          ? 'Current authorized service sources are unavailable. Previous evidence is withheld.'
          : 'Service continuity is off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
function Continuity({ sources, onSelectJob }: ServiceContinuityProps) {
  const [query, setQuery] = useState(''),
    [location, setLocation] = useState(''),
    [job, setJob] = useState(''),
    [view, setView] = useState<ServiceContinuityView>(),
    [detail, setDetail] = useState<ServiceContinuityDetail>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof openServiceContinuityReport>>>(),
    [passport, setPassport] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [properties, setProperties] = useState<
      ServiceContinuityView['property_options']
    >([]),
    [jobs, setJobs] = useState<ServiceContinuityView['job_options']>([]);
  const lifecycle = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    input = useRef<ServiceContinuityInput | undefined>(undefined),
    operation = useRef(0),
    pending = useRef(false),
    detailHeading = useRef<HTMLHeadingElement>(null),
    passportHeading = useRef<HTMLHeadingElement>(null),
    reportHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const l = lifecycle.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      g.enabled = false;
    };
  }, []);
  useEffect(() => {
    if (report) reportHeading.current?.focus();
    else if (passport) passportHeading.current?.focus();
    else if (detail) detailHeading.current?.focus();
  }, [detail, passport, report]);
  function clearDetail() {
    setDetail(undefined);
    setReport(undefined);
    setPassport(false);
  }
  function invalidate() {
    if (input.current) input.current.query = '\u0000invalidated';
    operation.current++;
    setView(undefined);
    clearDetail();
    setError(undefined);
  }
  async function task<T>(read: () => Promise<T>, apply: (value: T) => void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    const id = ++operation.current;
    try {
      const value = await read();
      if (lifecycle.current.active && id === operation.current) apply(value);
    } catch {
      if (lifecycle.current.active && id === operation.current) {
        clearDetail();
        setView(undefined);
        setError(
          'UNKNOWN — exact request, job or published source changed or access was denied. No replacement source was selected.',
        );
      }
    } finally {
      if (lifecycle.current.active) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function load() {
    if (pending.current) return;
    clearDetail();
    setView(undefined);
    const selected = { query, location_id: location, job_id: job };
    input.current = selected;
    void task(
      () => readServiceContinuity(sources, selected, gate.current),
      (value) => {
        assertServiceContinuityCurrentNow(value);
        setView(value);
        setProperties(value.property_options);
        setJobs(value.job_options);
      },
    );
  }
  function open(jobId: string) {
    if (!view || pending.current) return;
    clearDetail();
    void task(
      () => openServiceContinuityJob(view, jobId),
      (value) => {
        assertServiceContinuityDetailCurrentNow(value);
        setDetail(value);
      },
    );
  }
  function source(reference: PassportReportReference) {
    if (!detail || pending.current) return;
    setReport(undefined);
    void task(
      () => openServiceContinuityReport(detail, reference),
      (value) => {
        assertServiceContinuityDetailCurrentNow(detail);
        setReport(value);
      },
    );
  }
  function navigate() {
    if (!detail || pending.current) return;
    try {
      onSelectJob?.(selectServiceContinuityJob(detail));
    } catch {
      clearDetail();
      setView(undefined);
      setError('UNKNOWN — exact current job navigation is unavailable.');
    }
  }
  let current = true;
  try {
    if (view) assertServiceContinuityCurrentNow(view);
    if (detail) assertServiceContinuityDetailCurrentNow(detail);
  } catch {
    current = false;
  }
  return (
    <section className="service-continuity" aria-label="Service continuity">
      <header>
        <div>
          <span className="eyebrow">
            Customer and property · evidence continuity
          </span>
          <h2>Service continuity</h2>
          <p>
            Follow one recorded request through its selected issued job,
            published documentation and Property Passport.
          </p>
        </div>
        <span className="service-continuity-pill">Local review only</span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label>
          Search service continuity
          <input
            value={query}
            maxLength={100}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setQuery(e.target.value);
            }}
          />
        </label>
        <label>
          Service property
          <select
            value={location}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setLocation(e.target.value);
              setJob('');
            }}
          >
            <option value="">All available properties</option>
            {properties.map((p) => (
              <option key={p.location_id} value={p.location_id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Issued job
          <select
            value={job}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setJob(e.target.value);
            }}
          >
            <option value="">All available jobs</option>
            {jobs
              .filter((j) => !location || j.location_id === location)
              .map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {j.label} · version {j.issued_version_number} ·{' '}
                  {j.job_id.slice(-8)}
                </option>
              ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          Review service continuity
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            invalidate();
            setQuery('');
            setLocation('');
            setJob('');
          }}
        >
          Clear service filters
        </button>
      </form>
      {busy && (
        <p role="status">Checking current access and exact service evidence…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {!current && (
        <p role="alert">
          UNKNOWN — current source evidence is unavailable. Previous service
          details are withheld.
        </p>
      )}
      {current && view && (
        <>
          <p role="status">
            {view.matching_jobs} matching of {view.available_jobs} available job
            handles · {view.available_properties} properties ·{' '}
            {view.available_reports} accessible published report versions.
          </p>
          <p className="service-continuity-muted">
            Prepared authorized handles only. History completeness remains
            UNKNOWN.
          </p>
          {!view.paths.length && (
            <div className="service-continuity-empty">
              <h3>No matching accessible service records</h3>
              <p>
                Clear a filter or search exact recorded request, property, job,
                estimate, receipt or report text.
              </p>
            </div>
          )}
          {!detail && (
            <div className="service-continuity-grid">
              {view.paths.map((path) => (
                <article key={path.job_id}>
                  <span className="service-continuity-pill">
                    {path.request.status}
                  </span>
                  <h3>{path.scope_name}</h3>
                  <p>
                    {path.customer_label} · {path.property_label}
                  </p>
                  <p>{path.request.summary}</p>
                  <dl>
                    <dt>Original request</dt>
                    <dd>{path.request.id}</dd>
                    <dt>Issued source</dt>
                    <dd>
                      {path.estimate_number} · version{' '}
                      {path.issued_version_number}
                    </dd>
                    <dt>Exact job</dt>
                    <dd>{path.job_id}</dd>
                    <dt>Available documented links</dt>
                    <dd>
                      {path.linked_reports.length} exact recorded job links ·{' '}
                      {path.property_report_count} property reports
                    </dd>
                  </dl>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => open(path.job_id)}
                  >
                    Follow exact service job
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {current && detail && (
        <>
          <nav aria-label="Service continuity trail">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={clearDetail}
            >
              Service records
            </button>
            <span aria-hidden="true">→</span>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-current={!passport ? 'step' : undefined}
              onClick={() => {
                setPassport(false);
                setReport(undefined);
              }}
            >
              Issued job and request
            </button>
            <span aria-hidden="true">→</span>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              aria-current={passport ? 'step' : undefined}
              onClick={() => {
                setPassport(true);
                setReport(undefined);
              }}
            >
              Property Passport
            </button>
          </nav>
          {!passport && (
            <section
              className="service-continuity-detail"
              aria-label="Exact service continuity detail"
            >
              <h3 tabIndex={-1} ref={detailHeading}>
                Exact service request and issued job
              </h3>
              <p>
                {detail.staff.customer_label} · {detail.staff.property_label}
              </p>
              <p>{detail.staff.request.summary}</p>
              <dl>
                <dt>Original request</dt>
                <dd>{detail.staff.request.id}</dd>
                <dt>Selected job</dt>
                <dd>{detail.staff.job_id}</dd>
                <dt>Issued estimate / version</dt>
                <dd>
                  {detail.staff.estimate_number} · version{' '}
                  {detail.staff.issued_version_number} ·{' '}
                  {detail.staff.issued_version_id}
                </dd>
                <dt>Original LOCAL-TEST receipt</dt>
                <dd>
                  {detail.staff.receipt.id} · {detail.staff.receipt.decision}
                </dd>
                <dt>Original offer</dt>
                <dd>{detail.staff.offer_id}</dd>
              </dl>
              <p className="service-continuity-notice">
                Request-to-estimate association is explicitly staff-selected; no
                recorded request/estimate foreign key is claimed. LOCAL-TEST
                preference is not genuine customer approval. Contract execution
                is BLOCKED.
              </p>
              <button type="button" disabled={busy} onClick={navigate}>
                Display existing exact job workflow
              </button>
              <div className="service-continuity-safe">
                <h4>Customer-safe documented review</h4>
                <p>
                  {detail.customer_safe.selected_documentation.job.description}
                </p>
                <p>
                  {detail.customer_safe.selected_documentation.report.summary}
                </p>
                <p>
                  Report{' '}
                  {
                    detail.customer_safe.selected_documentation.report.reference
                      .report_id
                  }{' '}
                  · published version{' '}
                  {
                    detail.customer_safe.selected_documentation.report.reference
                      .published_version
                  }
                </p>
                <p>
                  No scope-line-to-finding match or verified physical completion
                  is inferred.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    source(
                      detail.customer_safe.selected_documentation.report
                        .reference,
                    )
                  }
                >
                  Open exact selected documentation
                </button>
              </div>
            </section>
          )}
          {passport && (
            <section
              className="service-continuity-safe"
              aria-label="Customer-safe property Passport continuity"
            >
              <h3 tabIndex={-1} ref={passportHeading}>
                Property Passport · available service history
              </h3>
              <p>
                {detail.customer_safe.property_passport.contractor.name} ·{' '}
                {detail.customer_safe.property_passport.property_label}
              </p>
              <p>
                {detail.customer_safe.property_passport.jobs.length} distinct
                issued jobs ·{' '}
                {detail.customer_safe.property_passport.reports.length}{' '}
                accessible report versions.
              </p>
              <h4>Issued job history</h4>
              {detail.customer_safe.property_passport.jobs.map((item) => (
                <article key={item.job_id}>
                  <h4>{item.name}</h4>
                  <p>{item.description}</p>
                  <p>
                    Job {item.job_id} · issued version{' '}
                    {item.issued_version_number} · {item.issued_version_id}
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      busy ||
                      !view?.paths.some((path) => path.job_id === item.job_id)
                    }
                    onClick={() => open(item.job_id)}
                  >
                    Review this exact issued job
                  </button>
                </article>
              ))}
              <h4>Published property documentation</h4>
              {!detail.customer_safe.property_passport.reports.length && (
                <p>
                  No accessible published documentation is available. Coverage
                  is UNKNOWN.
                </p>
              )}
              {detail.customer_safe.property_passport.reports.map((item) => (
                <article
                  key={`${item.report.reference.report_id}:${item.report.reference.published_version}`}
                >
                  <p>
                    {item.report.visited_on} · recorded phase{' '}
                    {item.report.phase}
                  </p>
                  <p>{item.report.summary}</p>
                  <p>
                    Report {item.report.reference.report_id} · published version{' '}
                    {item.report.reference.published_version}
                  </p>
                  <p>
                    {item.association === 'EXACT_RECORDED_LINK'
                      ? `Exact recorded job: ${item.linked_job_ids[0]}`
                      : 'Job association UNKNOWN; property documentation only.'}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => source(item.report.reference)}
                  >
                    Open report {item.report.reference.report_id} version{' '}
                    {item.report.reference.published_version}
                  </button>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {current && detail && report && (
        <section
          className="service-continuity-safe"
          aria-label="Exact service continuity report"
        >
          <h3 tabIndex={-1} ref={reportHeading}>
            Exact published service evidence
          </h3>
          <p>
            Report {report.reference.report_id} · published version{' '}
            {report.reference.published_version}
          </p>
          <p>
            {report.visited_on} · {report.summary}
          </p>
          {report.checklist.map((c) => (
            <p key={c.reference.source_index}>
              <strong>{c.label}:</strong> recorded{' '}
              {c.recorded_completed ? 'checked' : 'unchecked'}; no physical
              completion inferred.
            </p>
          ))}
          {report.observations.map((o) => (
            <article key={o.reference.source_index}>
              <p>
                Finding {o.reference.finding_id} · {o.location} · {o.severity}
              </p>
              <p>
                <strong>Observation:</strong> {o.observation}
              </p>
              <p>
                <strong>Recommendation:</strong> {o.recommendation}
              </p>
            </article>
          ))}
        </section>
      )}
      <footer>
        Published documentation is not verified physical completion, customer
        acceptance or warranty. Available history may be incomplete. No customer
        delivery, communication, dispatch, contract or financial action.
        Same-tab local evidence is not durable custody or genuine
        authentication.
      </footer>
    </section>
  );
}
