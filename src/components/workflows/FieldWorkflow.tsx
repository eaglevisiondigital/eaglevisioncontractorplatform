import { useEffect, useRef, useState } from 'react';
import type { PropertyRepository } from '../../lib/property';
import type { PrototypeTarget } from '../../lib/program/prototype-source';
import {
  fieldWorkflowEnabled,
  readFieldWorkflow,
  openFieldWorkflowReport,
  verifyFieldWorkflow,
  type FieldWorkflowView,
  type FieldWorkflowHandoff,
  type FieldReportReference,
} from '../../lib/workflows/field-workflow';
import './field-workflow.css';

export interface FieldWorkflowProps {
  repo: PropertyRepository;
  target: PrototypeTarget;
  day: string;
  timezone: string;
  enabled?: boolean;
  onReport?: (target: FieldWorkflowHandoff) => void;
  onProofOfWork?: (target: FieldWorkflowHandoff) => void;
}
export function FieldWorkflow(props: FieldWorkflowProps) {
  const key = JSON.stringify([
    props.target,
    props.day,
    props.timezone,
    props.enabled,
  ]);
  const [binding, setBinding] = useState({
    repo: props.repo,
    key,
    generation: 0,
  });
  if (binding.repo !== props.repo || binding.key !== key) {
    setBinding({ repo: props.repo, key, generation: binding.generation + 1 });
    return null;
  }
  const enabled =
    typeof window !== 'undefined' &&
    fieldWorkflowEnabled({
      development: import.meta.env.DEV,
      flag: props.enabled === true ? 'true' : undefined,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
    });
  return enabled ? (
    <FieldReview key={binding.generation} {...props} />
  ) : (
    <section className="field-workflow">
      <h2>Field workflow is off</h2>
      <p>No field access or dispatch is enabled.</p>
    </section>
  );
}
function FieldReview({
  repo,
  target,
  day,
  timezone,
  onReport,
  onProofOfWork,
}: FieldWorkflowProps) {
  const [confirmed, setConfirmed] = useState(false),
    [view, setView] = useState<FieldWorkflowView | null>(null);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof openFieldWorkflowReport>
  > | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [status, setStatus] = useState('');
  const live = useRef(true),
    pending = useRef(false),
    epoch = useRef(0),
    gate = useRef({ enabled: true, confirmed: false }),
    heading = useRef<HTMLElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      gate.current.confirmed = false;
    };
  }, []);
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  const invalidate = (value: boolean) => {
    epoch.current++;
    gate.current.confirmed = value;
    setConfirmed(value);
    setView(null);
    setDetail(null);
    setMessage('');
    setStatus('');
  };
  async function load() {
    if (!confirmed || pending.current) return;
    const token = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setView(null);
    setDetail(null);
    setMessage('');
    setStatus('');
    const admission = { enabled: true, confirmed: true };
    gate.current = admission;
    try {
      const result = await readFieldWorkflow(
        repo,
        target,
        { day, timezone },
        admission,
      );
      if (live.current && token === epoch.current) {
        setView(result);
        setStatus('Current available job evidence loaded.');
      }
    } catch {
      if (live.current && token === epoch.current)
        setMessage(
          'Exact job evidence is unavailable or changed. Review the current source and load again.',
        );
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function inspect(
    reference: FieldReportReference,
    destination: 'report' | 'proof',
  ) {
    if (!view || pending.current) return;
    const token = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setMessage('');
    setDetail(null);
    try {
      const source = await openFieldWorkflowReport(view, reference);
      if (live.current && token === epoch.current) {
        setDetail(source);
        if (destination === 'proof') onProofOfWork?.(source.handoff);
        else onReport?.(source.handoff);
      }
    } catch {
      if (live.current && token === epoch.current) {
        setView(null);
        setMessage(
          'Report evidence is UNKNOWN or stale. Reload the exact job sources.',
        );
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function verify() {
    if (!view || pending.current) return;
    const token = ++epoch.current;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = await verifyFieldWorkflow(view);
      if (live.current && token === epoch.current) {
        if (result.status === 'CURRENT')
          setStatus('The exact job and report evidence is still current.');
        else {
          setView(null);
          setDetail(null);
          setMessage(
            'Current evidence cannot be verified. No scheduling, publication or replay was performed.',
          );
        }
      }
    } finally {
      pending.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <section className="field-workflow" aria-labelledby="field-workflow-title">
      <div className="fw-heading">
        <div>
          <p className="fw-eyebrow">JOB / CREW / PUBLISHED EVIDENCE</p>
          <h2 id="field-workflow-title">Field operations</h2>
          <p>
            Follow the job through its crew, recorded day and original published
            reports.
          </p>
        </div>
        <span className="fw-badge">Local staff review</span>
      </div>
      <p className="fw-boundary">
        Recorded visits and assignments do not establish availability, dispatch
        or physical completion.
      </p>
      <div className="fw-controls">
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => invalidate(event.target.checked)}
          />{' '}
          I confirm this local job evidence review.
        </label>
        <button disabled={!confirmed || busy} onClick={() => void load()}>
          {busy ? 'Reviewing…' : 'Load current job evidence'}
        </button>
      </div>
      {busy && (
        <p role="status">Checking the exact current job and report sources…</p>
      )}
      {message && (
        <p role="alert" className="fw-state">
          {message}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!view && !busy && !message && (
        <p className="fw-state">
          Load the selected job to inspect its available evidence. No action
          runs automatically.
        </p>
      )}
      {view && (
        <>
          <div className="fw-grid">
            <article className="fw-card">
              <p className="fw-eyebrow">SELECTED JOB</p>
              <h3>{view.job.title}</h3>
              <p>{view.job.customer_label}</p>
              <p>{view.job.property_label}</p>
              <p>
                Issued version {view.source.issued_version_number} · job
                revision {view.source.job_revision}
              </p>
              <details>
                <summary>Exact job source</summary>
                <p>Job {view.source.job_id}</p>
                <p>Estimate {view.source.estimate_id}</p>
                <p>Issued version {view.source.issued_version_id}</p>
                <p>Property {view.source.location_id}</p>
              </details>
              <h4>Issued scope</h4>
              {view.job.scope.map((line) => (
                <p key={line.id}>
                  {line.description} · {line.quantity_milli / 1000} {line.unit}
                </p>
              ))}
            </article>
            <article className="fw-card">
              <p className="fw-eyebrow">CREW / RECORDED DAY</p>
              <h3>{view.day.day}</h3>
              <p>
                {view.day.timezone} · {view.day.civil_day_minutes} minute civil
                day
              </p>
              <p>
                Actual availability: UNKNOWN · proposed working hours not
                supplied.
              </p>
              {!view.job.crew.length && (
                <p className="fw-state">
                  No current crew relationship is available. Capacity remains
                  UNKNOWN.
                </p>
              )}
              {view.day.crew.map((worker) => (
                <div className="fw-worker" key={worker.worker_id}>
                  <h4>{worker.label}</h4>
                  {!worker.events.length && (
                    <p>
                      No recorded event for this job on the selected day.
                      Availability remains UNKNOWN.
                    </p>
                  )}
                  {worker.events.map((event, index) => (
                    <p key={`${event.visit_id ?? event.recorded_id}:${index}`}>
                      {event.kind === 'DATE_ONLY_VISIT'
                        ? `${event.date} · ${event.description} · time UNKNOWN`
                        : `${event.start} → ${event.end ?? 'end UNKNOWN'} · ${event.description}`}
                    </p>
                  ))}
                </div>
              ))}
            </article>
          </div>
          <section aria-labelledby="fw-reports-title">
            <h3 id="fw-reports-title">Published inspection reports</h3>
            <p>
              Only reports with an exact existing visit, property and job
              association appear here.
            </p>
            {!view.published_reports.length && (
              <p className="fw-state">
                No published report is linked to this job. Draft visits are not
                published evidence.
              </p>
            )}
            <div className="fw-reports">
              {view.published_reports.map((report) => (
                <article
                  className="fw-card"
                  key={`${report.report_id}:${report.published_version}`}
                >
                  <h4>{report.snapshot.summary}</h4>
                  <p>
                    {report.snapshot.visited_on} · recorded{' '}
                    {report.snapshot.phase} phase
                  </p>
                  <p>
                    Report {report.report_id} · published version{' '}
                    {report.published_version}
                  </p>
                  <div className="fw-actions">
                    <button
                      disabled={busy}
                      onClick={() => void inspect(report, 'report')}
                    >
                      Open original report v{report.published_version}
                    </button>
                    {onProofOfWork && (
                      <button
                        disabled={busy}
                        onClick={() => void inspect(report, 'proof')}
                      >
                        Review Proof of Work
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
          <button disabled={busy} onClick={() => void verify()}>
            Verify current job evidence
          </button>
        </>
      )}
      {detail && (
        <section
          className="fw-detail"
          ref={heading}
          tabIndex={-1}
          aria-labelledby="fw-report-detail"
        >
          <h3 id="fw-report-detail">Original published report</h3>
          <p>
            Report {detail.report.report_id} · published version{' '}
            {detail.report.published_version}
          </p>
          <p>{detail.report.snapshot.summary}</p>
          <h4>Factual observations</h4>
          {!detail.report.snapshot.findings.length && (
            <p>No customer-visible findings were recorded.</p>
          )}
          {detail.report.snapshot.findings.map((finding) => (
            <article key={finding.id}>
              <h5>
                {finding.category} · {finding.location} · reported{' '}
                {finding.severity}
              </h5>
              <p>{finding.description}</p>
              <p>
                <strong>Maintenance recommendation:</strong>{' '}
                {finding.recommendation}
              </p>
              <p>Finding {finding.id}</p>
            </article>
          ))}
          <h4>Recorded checklist</h4>
          {detail.report.snapshot.checklist.map((item, index) => (
            <p key={index}>
              {item.label}:{' '}
              {item.completed ? 'Recorded checked' : 'Recorded unchecked'}
            </p>
          ))}
          <p>
            Documentation only. Physical completion, customer acceptance and
            warranty are unverified.
          </p>
        </section>
      )}
    </section>
  );
}
