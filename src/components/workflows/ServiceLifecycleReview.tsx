import { useEffect, useRef, useState } from 'react';
import type { PassportReportReference } from '../../domain/property/passport';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  assertServiceLifecycleCurrentNow,
  assertServiceLifecycleDetailCurrentNow,
  readServiceLifecycleReview,
  openServiceLifecycleJob,
  openServiceLifecycleReport,
  selectServiceLifecycleJob,
  type ServiceLifecycleInput,
  type ServiceLifecycleView,
  type ServiceLifecycleDetail,
} from '../../lib/workflows/service-lifecycle-review';
import './service-lifecycle-review.css';

export interface ServiceLifecycleReviewProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function ServiceLifecycleReview({
  sources,
  enabled = false,
  onSelectJob,
}: ServiceLifecycleReviewProps) {
  // Environment admission precedes every source read, including denied-source rendering.
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
      /* Withhold all source content. */
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
    <Lifecycle
      key={binding.generation}
      sources={sources}
      onSelectJob={onSelectJob}
    />
  ) : (
    <section
      className="service-lifecycle-review"
      aria-label="Service lifecycle review"
    >
      <h2>Service lifecycle review</h2>
      <p>
        {admitted
          ? 'UNKNOWN — current authorized sources are unavailable. Previous evidence is withheld.'
          : 'Service lifecycle review is off. Explicit development HTTP loopback admission is required.'}
      </p>
    </section>
  );
}
function Lifecycle({ sources, onSelectJob }: ServiceLifecycleReviewProps) {
  const [query, setQuery] = useState(''),
    [location, setLocation] = useState(''),
    [job, setJob] = useState(''),
    [view, setView] = useState<ServiceLifecycleView>(),
    [detail, setDetail] = useState<ServiceLifecycleDetail>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof openServiceLifecycleReport>>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [properties, setProperties] = useState<
      ServiceLifecycleView['property_options']
    >([]),
    [jobs, setJobs] = useState<ServiceLifecycleView['job_options']>([]);
  const lifecycle = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    original = useRef<ServiceLifecycleInput | undefined>(undefined),
    operation = useRef(0),
    pending = useRef(false),
    detailHeading = useRef<HTMLHeadingElement>(null),
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
    else if (detail) detailHeading.current?.focus();
  }, [detail, report]);
  function clearDetail() {
    setDetail(undefined);
    setReport(undefined);
  }
  function invalidate() {
    if (original.current) original.current.query = '\u0000invalidated';
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
        setView(undefined);
        clearDetail();
        setError(
          'UNKNOWN — exact request, receipt, issued job or published source changed or access was denied. No replacement or replay.',
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
    original.current = selected;
    void task(
      () => readServiceLifecycleReview(sources, selected, gate.current),
      (v) => {
        assertServiceLifecycleCurrentNow(v);
        setView(v);
        setProperties(v.property_options);
        setJobs(v.job_options);
      },
    );
  }
  function open(jobId: string) {
    if (!view || pending.current) return;
    clearDetail();
    void task(
      () => openServiceLifecycleJob(view, jobId),
      (v) => {
        assertServiceLifecycleDetailCurrentNow(v);
        setDetail(v);
      },
    );
  }
  function inspect(reference: PassportReportReference) {
    if (!detail || pending.current) return;
    setReport(undefined);
    void task(
      () => openServiceLifecycleReport(detail, reference),
      (v) => {
        assertServiceLifecycleDetailCurrentNow(detail);
        setReport(v);
      },
    );
  }
  function navigate() {
    if (!detail || pending.current) return;
    try {
      onSelectJob?.(selectServiceLifecycleJob(detail));
    } catch {
      setView(undefined);
      clearDetail();
      setError('UNKNOWN — current exact job navigation is unavailable.');
    }
  }
  let current = true;
  try {
    if (view) assertServiceLifecycleCurrentNow(view);
    if (detail) assertServiceLifecycleDetailCurrentNow(detail);
  } catch {
    current = false;
  }
  const safe = current ? detail?.customer_safe : undefined,
    staff = current ? detail?.staff : undefined;
  return (
    <section
      className="service-lifecycle-review"
      aria-label="Service lifecycle review"
    >
      <header>
        <div>
          <span className="service-lifecycle-review-eyebrow">
            Service evidence · requirements
          </span>
          <h2>Service lifecycle review</h2>
          <p>
            Follow an actual request and selected issued job through recorded
            visits, published documentation and Property Passport.
          </p>
        </div>
        <span className="service-lifecycle-review-pill">
          Read only · no operational pass
        </span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label>
          Search lifecycle sources
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
          Lifecycle property
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
          Lifecycle issued job
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
          Review lifecycle sources
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
          Clear lifecycle filters
        </button>
      </form>
      {busy && (
        <p role="status">Checking exact sources and current staff access…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {!current && (
        <p role="alert">
          UNKNOWN — retained lifecycle sources are stale or denied. Previous
          evidence is withheld; no replay or replacement.
        </p>
      )}
      {current && view && (
        <>
          <p role="status">
            {view.matching_jobs} matching of {view.available_jobs} available job
            handles · {view.available_properties} properties ·{' '}
            {view.available_reports} accessible published report versions.
          </p>
          <p className="service-lifecycle-review-muted">
            Prepared authorized handles only. History completeness is UNKNOWN.
          </p>
          {!view.staff_paths.length && (
            <article>
              <h3>No matching accessible lifecycle sources</h3>
              <p>
                Clear a filter or search exact recorded request, receipt, job,
                issued version or report text.
              </p>
            </article>
          )}
          {!detail && (
            <div className="service-lifecycle-review-grid">
              {view.staff_paths.map((p) => (
                <article key={p.job_id}>
                  <span className="service-lifecycle-review-pill">
                    Recorded request: {p.request.status}
                  </span>
                  <h3>{p.scope_name}</h3>
                  <p>
                    {p.customer_label} · {p.property_label}
                  </p>
                  <p>{p.request.summary}</p>
                  <dl>
                    <dt>Original request</dt>
                    <dd>{p.request.id}</dd>
                    <dt>Exact issued job</dt>
                    <dd>{p.job_id}</dd>
                    <dt>Issued source</dt>
                    <dd>
                      {p.estimate_number} · version {p.issued_version_number} ·{' '}
                      {p.issued_version_id}
                    </dd>
                    <dt>Published documentation coverage</dt>
                    <dd>
                      {p.linked_reports.length} exact recorded job links ·{' '}
                      {p.property_report_count} available property reports
                    </dd>
                  </dl>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Review lifecycle requirements · ${p.scope_name} · ${p.job_id}`}
                    onClick={() => open(p.job_id)}
                  >
                    Review lifecycle requirements
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {current && detail && safe && staff && (
        <>
          <nav aria-label="Service lifecycle source trail">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={clearDetail}
            >
              Service records
            </button>
            <span>
              → Exact issued job → Recorded visits → Property Passport →
              Verification requirements
            </span>
          </nav>
          <section
            className="service-lifecycle-review-staff"
            aria-label="Staff lifecycle provenance"
          >
            <h3 ref={detailHeading} tabIndex={-1}>
              Exact service lifecycle requirements
            </h3>
            <p>
              {staff.provenance.customer_label} ·{' '}
              {staff.provenance.property_label}
            </p>
            <h4>Staff provenance · actual source references</h4>
            <dl>
              <dt>Original request / current recorded status</dt>
              <dd>
                {staff.provenance.request.id} ·{' '}
                {staff.workflow_facts.request_status}
              </dd>
              <dt>Exact job / issued estimate version</dt>
              <dd>
                {staff.provenance.job_id} · {staff.provenance.estimate_id} ·{' '}
                {staff.provenance.issued_version_id}
              </dd>
              <dt>Original LOCAL-TEST receipt / decision</dt>
              <dd>
                {staff.provenance.receipt.id} ·{' '}
                {staff.provenance.receipt.decision}
              </dd>
              <dt>Original offer</dt>
              <dd>{staff.provenance.offer_id}</dd>
            </dl>
            <p className="service-lifecycle-review-notice">
              Request-to-scope association is explicitly staff-selected; no
              recorded request/estimate foreign key is claimed. LOCAL-TEST
              preference is not genuine customer approval. Contract execution
              remains BLOCKED.
            </p>
            <h4>Recorded workflow facts</h4>
            <p>
              Issued source status: {staff.workflow_facts.estimate_status}. Job
              exists against that issued baseline. A job completion workflow
              status is not recorded: UNKNOWN.
            </p>
            <dl>
              <dt>Exact plan / revision</dt>
              <dd>
                {staff.workflow_facts.plan.id} · revision{' '}
                {staff.workflow_facts.plan.revision} ·{' '}
                {staff.workflow_facts.plan.cadence} ·{' '}
                {staff.workflow_facts.plan.timezone}
              </dd>
              <dt>Recorded scheduled-visit date / workflow status</dt>
              <dd>
                {staff.workflow_facts.scheduled_visit.id} ·{' '}
                {staff.workflow_facts.scheduled_visit.date} ·{' '}
                {staff.workflow_facts.scheduled_visit.status} · revision{' '}
                {staff.workflow_facts.scheduled_visit.revision}
              </dd>
              <dt>Recorded published-visit date / workflow status</dt>
              <dd>
                {staff.workflow_facts.published_visit.id} ·{' '}
                {staff.workflow_facts.published_visit.date} ·{' '}
                {staff.workflow_facts.published_visit.status} · phase{' '}
                {staff.workflow_facts.published_visit.phase}
              </dd>
            </dl>
            <p>
              Date-only records do not establish timed availability, dispatch or
              physical attendance. Availability is UNKNOWN.
            </p>
            <h4>Staff suggestions · no action authority</h4>
            <ul>
              {staff.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={busy || !onSelectJob}
              onClick={navigate}
            >
              Display existing exact job workflow
            </button>
          </section>
          <section
            className="service-lifecycle-review-safe"
            aria-label={`Customer-safe lifecycle requirements · ${safe.property.location_id}`}
          >
            <h3>Customer-safe requirements · {safe.contractor.name}</h3>
            <p>
              {safe.property.label} · {safe.property.location_id}
            </p>
            <h4>Exact issued scope</h4>
            <p>
              {safe.scope.name} · version {safe.scope.issued_version_number}
            </p>
            <p>{safe.scope.description}</p>
            <p>
              Job {safe.scope.job_id} · issued source{' '}
              {safe.scope.issued_version_id} · source hash{' '}
              {safe.scope.issued_source_sha256}
            </p>
            {safe.scope.lines.map((l) => (
              <p key={l.id}>
                {l.description} · {l.quantity_milli / 1000} {l.unit} · source
                line {l.id} · verified completion match: UNKNOWN
              </p>
            ))}
            <h4>Required verification evidence</h4>
            <div className="service-lifecycle-review-grid">
              {safe.required_proof.map((p) => (
                <article key={p.kind}>
                  <h4>{p.kind.replaceAll('_', ' ')}</h4>
                  <p>
                    <strong>UNKNOWN</strong> · evidence unavailable in existing
                    sources.
                  </p>
                  <p>{p.required}</p>
                </article>
              ))}
            </div>
            <p className="service-lifecycle-review-notice">
              {safe.interpretation} No physical completion, customer acceptance
              or warranty is verified.
            </p>
            <h4>Property Passport · exact published documentation</h4>
            <p>
              {safe.passport.jobs.length} distinct issued jobs ·{' '}
              {safe.documentation.length} available report versions. Property
              documentation is not silently assigned to this job.
            </p>
            {!safe.documentation.length && (
              <p>
                No accessible published documentation is available. Verification
                remains UNKNOWN.
              </p>
            )}
            {safe.documentation.map((r) => (
              <article
                key={`${r.report.reference.report_id}:${r.report.reference.published_version}`}
              >
                <h4>{r.report.summary}</h4>
                <p>
                  Report {r.report.reference.report_id} · published version{' '}
                  {r.report.reference.published_version} · visited{' '}
                  {r.report.visited_on} · published {r.report.published_at}
                </p>
                <p>
                  Selected-job association:{' '}
                  {r.selected_job_association === 'EXACT_RECORDED_JOB_LINK'
                    ? 'exact recorded job link'
                    : 'UNKNOWN — property documentation only; no exact selected-job link'}
                  .
                </p>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  aria-label={`Inspect exact published report · ${r.report.reference.report_id} · version ${r.report.reference.published_version}`}
                  onClick={() => inspect(r.report.reference)}
                >
                  Inspect exact published report
                </button>
              </article>
            ))}
          </section>
        </>
      )}
      {current && detail && report && (
        <section
          className="service-lifecycle-review-safe"
          aria-label="Exact lifecycle published evidence"
        >
          <h3 tabIndex={-1} ref={reportHeading}>
            Exact published lifecycle evidence
          </h3>
          <p>
            Report {report.reference.report_id} · published version{' '}
            {report.reference.published_version} · property{' '}
            {report.reference.location_id}
          </p>
          <p>
            Recorded visit date {report.visited_on} · phase {report.phase}
          </p>
          <p>{report.summary}</p>
          <h4>Recorded checklist observations</h4>
          {!report.checklist.length && (
            <p>No recorded checklist evidence. Coverage remains UNKNOWN.</p>
          )}
          {report.checklist.map((c) => (
            <p key={c.reference.source_index}>
              {c.label}: recorded{' '}
              {c.recorded_completed ? 'checked' : 'unchecked'} · source position{' '}
              {c.reference.source_index}. Physical completion is UNKNOWN.
            </p>
          ))}
          <h4>Published observations and recommendations</h4>
          {!report.observations.length && (
            <p>
              No published observations in this version. Absence does not prove
              repair or completion.
            </p>
          )}
          {report.observations.map((o) => (
            <article key={o.reference.source_index}>
              <p>
                Finding {o.reference.finding_id} · {o.location} · {o.severity} ·
                source position {o.reference.source_index}
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
        Read-only local requirements. No new lifecycle record, customer packet,
        verified physical completion, customer acceptance, warranty, dispatch,
        communication or financial action. Same-tab source evidence is not
        genuine authentication or durable custody. Release 1.0 NOT READY / NOT
        AUTHORIZED.
      </footer>
    </section>
  );
}
