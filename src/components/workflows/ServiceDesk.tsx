import { useEffect, useRef, useState } from 'react';
import { formatMinor } from '../../domain/estimating/calculation';
import {
  contractPreparationChecks,
  type ContractPreparationCheck,
} from '../../lib/sales-contract-preparation';
import type { SalesDeskConfirmation } from '../../lib/workflows/sales-desk';
import {
  captureOperatingSources,
  type OperatingSources,
} from '../../lib/workflows/operating-center-runtime';
import { journeyEnabled } from '../../lib/workflows/journey-runtime';
import {
  assertServiceDeskCurrentNow,
  assertServiceDeskDetailCurrentNow,
  inspectServiceDeskPreparation,
  openServiceDeskJob,
  openServiceDeskReport,
  prepareServiceDeskReview,
  readServiceDesk,
  type ServiceDeskDetail,
  type ServiceDeskInput,
  type ServiceDeskView,
} from '../../lib/workflows/service-desk';
import './service-desk.css';
export interface ServiceDeskProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function ServiceDesk({
  sources,
  enabled = false,
  onSelectJob,
}: ServiceDeskProps) {
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
      /* Withhold unavailable sources before reading presentation fields. */
    }
  const [binding, bind] = useState({ sources, admitted, check, generation: 0 });
  let changed = false;
  try {
    binding.check?.();
  } catch {
    changed = true;
  }
  if (
    binding.sources !== sources ||
    binding.admitted !== admitted ||
    changed ||
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
    <section className="service-desk" aria-label="Service request desk">
      <h2>Existing service requests</h2>
      <p>
        {admitted
          ? 'Current authorized sources are unavailable. Previous service evidence is withheld.'
          : 'Service request review is off. Explicit local source confirmation is required.'}
      </p>
    </section>
  );
}
function Desk({ sources, onSelectJob }: ServiceDeskProps) {
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [options, setOptions] = useState<string[]>([]),
    [view, setView] = useState<ServiceDeskView>(),
    [detail, setDetail] = useState<ServiceDeskDetail>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof openServiceDeskReport>>>(),
    [packet, setPacket] =
      useState<Awaited<ReturnType<typeof prepareServiceDeskReview>>>(),
    [checks, setChecks] = useState<
      Partial<Record<ContractPreparationCheck, boolean>>
    >({}),
    [association, setAssociation] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState<string>(),
    [verification, setVerification] = useState<string>();
  const life = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    pending = useRef<ServiceDeskInput | undefined>(undefined),
    review = useRef<SalesDeskConfirmation | undefined>(undefined),
    attempt = useRef(false),
    sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      g.enabled = false;
      if (review.current) review.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (report) sourceHeading.current?.focus();
  }, [report]);
  function clearReview() {
    if (review.current) review.current.confirmed = false;
    setDetail(undefined);
    setReport(undefined);
    setPacket(undefined);
    setChecks({});
    setAssociation(false);
    setConfirmed(false);
    setVerification(undefined);
    setAttempted(false);
    attempt.current = false;
  }
  function invalidate() {
    if (pending.current) pending.current.query = '\u0000invalidated';
    clearReview();
    setView(undefined);
    setError(undefined);
  }
  async function load(page = 0) {
    if (busy) return;
    setBusy(true);
    setView(undefined);
    clearReview();
    setError(undefined);
    const input = { query, status, page };
    pending.current = input;
    try {
      const value = await readServiceDesk(sources, input, gate.current);
      if (!life.current.active || pending.current !== input) return;
      assertServiceDeskCurrentNow(value);
      setView(value);
      setOptions([...value.status_options]);
    } catch {
      if (life.current.active)
        setError(
          'UNKNOWN — exact service-request sources changed or access was denied. No other request or estimate was substituted.',
        );
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function open(jobId: string) {
    if (!view || busy) return;
    setBusy(true);
    clearReview();
    setError(undefined);
    try {
      const value = await openServiceDeskJob(view, jobId);
      if (!life.current.active) return;
      assertServiceDeskDetailCurrentNow(value);
      setDetail(value);
      const held = value.staff.preparation === 'READ_ONLY_PREVIOUS_ATTEMPT';
      attempt.current = held;
      setAttempted(held);
    } catch {
      if (life.current.active)
        setError(
          'UNKNOWN — exact visible request, issued scope or published evidence is unavailable.',
        );
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  const all = (
    Object.keys(contractPreparationChecks) as ContractPreparationCheck[]
  ).every((k) => checks[k] === true);
  function withdraw() {
    if (review.current) review.current.confirmed = false;
    setConfirmed(false);
  }
  async function prepare() {
    if (
      !detail ||
      busy ||
      attempt.current ||
      !all ||
      !association ||
      !confirmed
    )
      return;
    attempt.current = true;
    setAttempted(true);
    setBusy(true);
    setError(undefined);
    const input: SalesDeskConfirmation = {
      confirmed: true,
      association_confirmed: true,
      checks: { scope: true, preference: true, terms: true, boundaries: true },
    };
    review.current = input;
    try {
      const value = await prepareServiceDeskReview(detail, input);
      if (!life.current.active) return;
      assertServiceDeskDetailCurrentNow(detail);
      setPacket(value);
      setVerification('CURRENT_REVIEW_ONLY');
      setConfirmed(false);
    } catch {
      if (life.current.active) {
        setError(
          'UNKNOWN — preparation is held. Exact read-only evidence remains available; no retry, replacement, contract or delivery is permitted.',
        );
        setConfirmed(false);
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function source() {
    if (!detail || busy) return;
    setBusy(true);
    setReport(undefined);
    try {
      const value = await openServiceDeskReport(detail);
      if (!life.current.active) return;
      assertServiceDeskDetailCurrentNow(detail);
      setReport(value);
    } catch {
      if (life.current.active) {
        setDetail(undefined);
        setError(
          'UNKNOWN — the exact published report/version is unavailable; no latest report was chosen.',
        );
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function inspect() {
    if (!packet || busy) return;
    setBusy(true);
    try {
      const value = await inspectServiceDeskPreparation(packet);
      if (!life.current.active) return;
      if (value.status === 'CURRENT_REVIEW_ONLY') {
        if (!detail) throw Error('Original detail unavailable');
        assertServiceDeskDetailCurrentNow(detail);
      }
      setVerification(value.status);
      if (value.status === 'UNKNOWN') {
        setDetail(undefined);
        setReport(undefined);
      }
    } catch {
      if (life.current.active) {
        setVerification('UNKNOWN');
        setDetail(undefined);
        setReport(undefined);
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  function navigate() {
    if (!detail || busy) return;
    try {
      assertServiceDeskDetailCurrentNow(detail);
      onSelectJob?.(detail.customer_safe.job.reference.job_id);
    } catch {
      setDetail(undefined);
      setError('UNKNOWN — current exact job navigation is unavailable.');
    }
  }
  return (
    <section className="service-desk" aria-label="Service request desk">
      <div className="service-desk-heading">
        <span className="eyebrow">Sales and service · source-bound review</span>
        <h2>Existing service requests</h2>
        <p>
          Review recorded requests and their explicitly selected issued job
          scopes. Staff preparation remains separate from customer-safe
          documentation.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Search existing service requests
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
          Recorded request status
          <select
            value={status}
            disabled={busy}
            onChange={(e) => {
              invalidate();
              setStatus(e.target.value);
            }}
          >
            <option value="">All recorded statuses</option>
            {options.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          Review existing service requests
        </button>
      </form>
      {busy && (
        <p role="status">
          Checking original request, issued source and current access…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <p role="status">
            {view.matching_requests} matching of {view.available_requests}{' '}
            available prepared requests · {view.matching_job_handles} matching
            of {view.available_job_handles} job handles · page {view.page + 1}{' '}
            of {Math.max(1, Math.ceil(view.matching_requests / 2))}.
          </p>
          {!view.requests.length && (
            <p>
              No matching prepared requests on this page. Clear filters to
              review available sources.
            </p>
          )}
          <div className="service-desk-grid">
            {view.requests.map((group) => (
              <article className="service-desk-card" key={group.request.id}>
                <h3>{group.customer_label}</h3>
                <p>{group.property_label}</p>
                <p>{group.request.summary}</p>
                <dl>
                  <dt>Original request</dt>
                  <dd>{group.request.id}</dd>
                  <dt>Recorded status / category</dt>
                  <dd>
                    {group.request.status} / {group.request.category}
                  </dd>
                  <dt>Requested appointment text</dt>
                  <dd>{group.request.preferred_appointment}</dd>
                  <dt>Updated</dt>
                  <dd>{group.request.updated_at}</dd>
                </dl>
                <p>
                  {group.total_job_handles} actual prepared job handle(s);
                  association is staff-selected, not a recorded estimate lead
                  link.
                </p>
                {group.jobs.map((job) => (
                  <div className="service-desk-job" key={job.job_id}>
                    <p>
                      {job.estimate_number} · issued version{' '}
                      {job.issued_version_number}
                    </p>
                    <p>
                      Receipt {job.receipt.id} · LOCAL-TEST{' '}
                      {job.receipt.decision}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void open(job.job_id)}
                    >
                      Review exact request and issued scope
                    </button>
                  </div>
                ))}
              </article>
            ))}
          </div>
          <div className="service-desk-pages">
            <button
              type="button"
              disabled={busy || view.page === 0}
              onClick={() => void load(view.page - 1)}
            >
              Previous request page
            </button>
            <button
              type="button"
              disabled={busy || (view.page + 1) * 2 >= view.matching_requests}
              onClick={() => void load(view.page + 1)}
            >
              Next request page
            </button>
          </div>
        </>
      )}
      {detail && (
        <>
          <section
            className="service-desk-staff"
            aria-label="Staff service request review"
          >
            <h3>Staff review · exact request and issued source</h3>
            <p>{detail.staff.request.summary}</p>
            <dl>
              <dt>Original request</dt>
              <dd>{detail.staff.request.id}</dd>
              <dt>Issued estimate/version</dt>
              <dd>
                {detail.staff.source.estimate_number} /{' '}
                {detail.staff.source.version_number} ·{' '}
                {detail.staff.source.version_id}
              </dd>
              <dt>Original LOCAL-TEST receipt</dt>
              <dd>{detail.staff.receipt.id}</dd>
              <dt>Canonical quoted total</dt>
              <dd>
                {formatMinor(
                  detail.staff.source.scope.total_minor,
                  detail.staff.source.scope.currency,
                )}
              </dd>
              <dt>Recorded visit / revision</dt>
              <dd>
                {detail.staff.appointment.visit_id} /{' '}
                {detail.staff.appointment.visit_revision}
              </dd>
              <dt>Preparation state</dt>
              <dd>
                {attempted
                  ? 'READ ONLY — prior/current attempt retained'
                  : detail.staff.preparation}
              </dd>
            </dl>
            <p>
              Contract execution BLOCKED. Genuine customer approval, signing,
              delivery and operational custody remain UNVERIFIED.
            </p>
            <fieldset disabled={busy || attempted}>
              <legend>Explicit staff preparation review</legend>
              <label>
                <input
                  type="checkbox"
                  checked={association}
                  onChange={(e) => {
                    withdraw();
                    setAssociation(e.target.checked);
                  }}
                />
                I explicitly selected this original request, customer/property
                and exact issued scope.
              </label>
              {(
                Object.entries(contractPreparationChecks) as [
                  ContractPreparationCheck,
                  string,
                ][]
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={checks[key] === true}
                    onChange={(e) => {
                      withdraw();
                      setChecks({ ...checks, [key]: e.target.checked });
                    }}
                  />
                  {label}
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!all || !association}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Prepare this exact staff-only service review snapshot.
              </label>
            </fieldset>
            <button
              type="button"
              disabled={busy || attempted || !all || !association || !confirmed}
              onClick={() => void prepare()}
            >
              Prepare staff service review snapshot
            </button>
            <button
              type="button"
              className="service-desk-secondary"
              disabled={busy}
              onClick={navigate}
            >
              Display existing job workflow
            </button>
          </section>
          <section
            className="service-desk-safe"
            aria-label="Customer-safe service documentation"
          >
            <h3>Customer-safe documentation · separately projected</h3>
            <p>
              {detail.customer_safe.contractor.name} ·{' '}
              {detail.customer_safe.property.label}
            </p>
            <p>{detail.customer_safe.job.description}</p>
            <p>{detail.customer_safe.report.summary}</p>
            <p>
              Report {detail.customer_safe.report.reference.report_id} ·
              published version{' '}
              {detail.customer_safe.report.reference.published_version}
            </p>
            <p>
              Physical completion, customer acceptance and warranty: UNVERIFIED.
              History coverage: UNKNOWN.
            </p>
            <button type="button" disabled={busy} onClick={() => void source()}>
              Open exact customer-safe report
            </button>
          </section>
        </>
      )}
      {report && (
        <section
          className="service-desk-safe"
          aria-label="Exact customer-safe service report"
        >
          <h3 tabIndex={-1} ref={sourceHeading}>
            Exact customer-safe service report
          </h3>
          <p>
            Report {report.reference.report_id} · published version{' '}
            {report.reference.published_version}
          </p>
          <p>{report.summary}</p>
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
      {packet && (
        <section
          className="service-desk-staff"
          aria-label="Staff-only service review snapshot"
        >
          <h3>Staff-only service review snapshot</h3>
          <p role="status">
            {verification} · Contract execution BLOCKED · NOT SENT
          </p>
          {verification !== 'UNKNOWN' && (
            <dl>
              <dt>Original request</dt>
              <dd>{packet.review.lead.id}</dd>
              <dt>Exact issued version</dt>
              <dd>{packet.review.source.version_id}</dd>
              <dt>Immutable snapshot SHA-256</dt>
              <dd>{packet.integrity.sha256}</dd>
            </dl>
          )}
          <button type="button" disabled={busy} onClick={() => void inspect()}>
            Inspect exact staff service snapshot
          </button>
        </section>
      )}
      <p className="service-desk-boundary">
        Prepared accessible handles only; no complete CRM coverage, genuine
        approval, contract execution, customer response, delivery, dispatch or
        financial action. Same-tab local evidence is not durable authentication.
      </p>
    </section>
  );
}
