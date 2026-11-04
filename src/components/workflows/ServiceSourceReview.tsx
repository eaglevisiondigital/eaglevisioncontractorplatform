import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  serviceSourceReviewEnabled,
  readServiceSourceReview,
  assertServiceSourceReview,
  readServiceSourceLineage,
  inspectServiceSourceReport,
  reconcileServiceSourceReview,
  type ServiceSourceRead,
} from '../../lib/workflows/service-source-review';
import { PropertyServiceContinuity } from './PropertyServiceContinuity';
import './service-source-review.css';

export function ServiceSourceReview(props: SavedRevisionPanelProps) {
  if (!serviceSourceReviewEnabled(props.enabled))
    return (
      <section
        className="service-source-review"
        aria-label="Service source review"
      >
        <p role="status">Service source review is OFF.</p>
      </section>
    );
  return <BoundSourceReview {...props} />;
}
function BoundSourceReview(props: SavedRevisionPanelProps) {
  const [bound, bind] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    generation: 0,
  });
  if (bound.sources !== props.sources || bound.job !== props.selectedJobId) {
    bind({
      sources: props.sources,
      job: props.selectedJobId,
      generation: bound.generation + 1,
    });
    return null;
  }
  return <SourceSession key={bound.generation} {...props} />;
}
function SourceSession(props: SavedRevisionPanelProps) {
  const [view, setView] = useState<ServiceSourceRead>(),
    [report, setReport] =
      useState<Awaited<ReturnType<typeof inspectServiceSourceReport>>>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(
      'Select an exact job in the existing workbench.',
    );
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const g = gate.current,
      l = life.current;
    g.enabled = true;
    l.alive = true;
    return () => {
      g.enabled = false;
      l.alive = false;
      l.serial++;
    };
  }, []);
  let current = true;
  try {
    if (view) assertServiceSourceReview(view);
  } catch {
    current = false;
  }
  const lineage = view && current ? readServiceSourceLineage(view) : undefined;
  async function read(
    reference?: Parameters<typeof inspectServiceSourceReport>[1],
  ) {
    const l = life.current;
    if (l.pending || !current || error || !props.selectedJobId) return;
    l.pending = true;
    const serial = ++l.serial;
    setBusy(true);
    try {
      if (reference && view) {
        const detail = await inspectServiceSourceReport(view, reference);
        if (l.alive && serial === l.serial) {
          setReport(detail);
          setStatus(
            'Exact source and original completion requirements inspected.',
          );
          heading.current?.focus();
        }
      } else {
        const next = await readServiceSourceReview(
          props.sources,
          { job_id: props.selectedJobId, staff_context_confirmed: true },
          gate.current,
        );
        assertServiceSourceReview(next);
        if (l.alive && serial === l.serial) {
          setView(next);
          setReport(undefined);
          setStatus(
            'Exact source context loaded; request-to-job FK remains UNKNOWN.',
          );
          heading.current?.focus();
        }
      }
    } catch {
      if (l.alive && serial === l.serial) {
        gate.current.enabled = false;
        setError(
          'UNKNOWN — exact service source is unavailable or changed. No replay, replacement, published update or completion is inferred.',
        );
      }
    } finally {
      l.pending = false;
      if (l.alive && serial === l.serial) setBusy(false);
    }
  }
  return (
    <section
      className="service-source-review"
      aria-label="Service source review"
      aria-busy={busy}
    >
      <header>
        <p>EXACT REQUEST · ISSUED SCOPE · PUBLISHED LINEAGE</p>
        <h2 ref={heading} tabIndex={-1}>
          Service source review
        </h2>
        <p>
          Distinguish recorded source links from staff-selected context.
          Documentation never establishes physical completion or customer
          acceptance.
        </p>
      </header>
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — current source access changed. Retained source review is withheld.'}
        </p>
      )}
      <p role="status">
        {busy ? 'Reading original authorized service sources…' : status}
      </p>
      {current && !error && (
        <div className="ssr-review">
          <button
            type="button"
            disabled={busy || !props.selectedJobId}
            onClick={() => void read()}
          >
            Review exact request and report sources
          </button>
          {view && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setStatus(
                  `Exact read-only source reconciliation: ${reconcileServiceSourceReview(view).status}. No replay or replacement.`,
                )
              }
            >
              Reconcile retained service sources read only
            </button>
          )}
          {lineage && (
            <>
              <dl className="ssr-context">
                <div>
                  <dt>Customer / property</dt>
                  <dd>
                    {lineage.customer_label} · {lineage.property.label}
                  </dd>
                </div>
                <div>
                  <dt>Exact company / customer / property IDs</dt>
                  <dd>
                    {lineage.property.organization_id} /{' '}
                    {lineage.property.customer_id} /{' '}
                    {lineage.property.location_id}
                  </dd>
                </div>
                <div>
                  <dt>Retained job</dt>
                  <dd>{lineage.scope.job_id}</dd>
                </div>
              </dl>
              <ol
                className="ssr-edges"
                aria-label="Service source relationships"
              >
                <li>
                  <h3>Original service request</h3>
                  <p>{lineage.request.summary}</p>
                  <p>
                    {lineage.request.id} · recorded status{' '}
                    {lineage.request.status}
                  </p>
                  <strong>Request → job: UNKNOWN — no recorded FK</strong>
                  <p>
                    {lineage.request_context}. A shared property, matching text
                    or date does not establish an originating job.
                  </p>
                </li>
                <li>
                  <h3>Exact issued job scope</h3>
                  <p>{lineage.scope.name}</p>
                  <p>
                    {lineage.scope.job_id} → estimate{' '}
                    {lineage.scope.estimate_id} → issued version{' '}
                    {lineage.scope.issued_version_id} /{' '}
                    {lineage.scope.issued_version_number}
                  </p>
                  <strong>{lineage.issued_job_link}</strong>
                </li>
              </ol>
              <div className="ssr-reports">
                {lineage.reports.map((row) => (
                  <article
                    key={`${row.reference.report_id}/${row.reference.published_version}`}
                    aria-label={`Service report lineage ${row.reference.report_id} version ${row.reference.published_version}`}
                  >
                    <h3>Published version {row.reference.published_version}</h3>
                    <p>{row.summary}</p>
                    <dl>
                      <dt>Exact report → visit → plan → job</dt>
                      <dd>
                        {row.reference.report_id} → {row.visit_id} →{' '}
                        {row.plan_id} → {row.job_id}
                      </dd>
                      <dt>Recorded link</dt>
                      <dd>{row.relationship}</dd>
                      <dt>
                        Available sibling versions at the last explicit read
                      </dt>
                      <dd>
                        {row.version.available_sibling_versions.join(', ')} ·{' '}
                        {row.version.status}
                      </dd>
                      <dt>Original source SHA-256</dt>
                      <dd>{row.sha256}</dd>
                    </dl>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void read(row.reference)}
                    >
                      Inspect source chain: report {row.reference.report_id}{' '}
                      version {row.reference.published_version}
                    </button>
                  </article>
                ))}
              </div>
              <section aria-label="Existing completion verification requirements">
                <h3>Completion evidence still required</h3>
                <ul>
                  {lineage.required_proof.map((requirement) => (
                    <li key={requirement.kind}>
                      <strong>
                        {requirement.kind} · {requirement.status}
                      </strong>
                      <p>{requirement.required}</p>
                    </li>
                  ))}
                </ul>
                <p>
                  Complete history UNKNOWN. Staff corrections, after-phase
                  reports and recorded checkmarks do not satisfy these
                  requirements.
                </p>
              </section>
            </>
          )}
          {report && (
            <section
              className="ssr-inspection"
              aria-label="Inspected service source chain"
            >
              <h3>Exact published source inspected</h3>
              <p>
                {report.report.reference.report_id} / published version{' '}
                {report.report.reference.published_version}
              </p>
              <p>{report.report.summary}</p>
              <p>
                {report.selected_job_association} · {report.completion_status}
              </p>
              <dl>
                <dt>Original issued scope</dt>
                <dd>{report.completion?.job.reference.issued_version_id}</dd>
                <dt>Scope-line documentation matching</dt>
                <dd>{report.completion?.coverage.line_to_finding_links}</dd>
                <dt>Media</dt>
                <dd>{report.completion?.coverage.media}</dd>
                <dt>Physical completion / customer acceptance</dt>
                <dd>
                  {report.completion?.interpretation.physical_completion} /{' '}
                  {report.completion?.interpretation.customer_acceptance}
                </dd>
              </dl>
            </section>
          )}
        </div>
      )}
      <details className="ssr-original">
        <summary>Original published service and same-property controls</summary>
        <PropertyServiceContinuity {...props} />
      </details>
    </section>
  );
}
