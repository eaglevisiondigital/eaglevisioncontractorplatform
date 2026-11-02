import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import {
  createPropertyPassportTimeline,
  readPropertyPassportTimelineEvidence,
  type PassportTimelineEvent,
  type PropertyPassportTimeline,
} from '../../domain/property/passport-timeline';
import { PlatformBrand } from '../PlatformBrand';
import './property-passport-timeline.css';

/** The model has no observable subscription. A parent rerender is required after
 * its synchronous selection/session change; the fixture does so without remounting
 * this exported component. State never survives a changed source object/context. */
export function PropertyPassportTimelinePreview({
  model,
  enabled = false,
}: {
  model: CustomerPortalPreviewModel;
  enabled?: boolean;
}) {
  const [binding, setBinding] = useState({ model, generation: 0 });
  if (binding.model !== model) {
    setBinding({ model, generation: binding.generation + 1 });
    return null;
  }
  if (!enabled)
    return (
      <PassportTimelineView key="disabled" model={model} enabled={false} />
    );
  let context = 'unavailable';
  try {
    const c = model.read().context;
    if (
      ![
        c.organization_id,
        c.customer_id,
        c.location_id,
        c.property_label,
      ].every((v) => typeof v === 'string') ||
      c.reports !== true ||
      !Array.isArray(c.version_ids) ||
      c.version_ids.length > 500 ||
      !c.version_ids.every((v) => typeof v === 'string')
    )
      throw Error('Current customer context unavailable');
    context = JSON.stringify([
      c.organization_id,
      c.customer_id,
      c.location_id,
      c.property_label,
      c.reports,
      ...c.version_ids,
    ]);
  } catch {
    /* No retained customer state survives a missing current context. */
  }
  return (
    <PassportTimelineView
      key={`${binding.generation}:${enabled}:${context}`}
      model={model}
      enabled={enabled}
    />
  );
}
function PassportTimelineView({
  model,
  enabled,
}: {
  model: CustomerPortalPreviewModel;
  enabled: boolean;
}) {
  const [view, setView] = useState<PropertyPassportTimeline | null>(null);
  const [detail, setDetail] = useState<PassportTimelineEvent | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  async function load() {
    const attempt = ++generation.current;
    setView(null);
    setDetail(null);
    setState('loading');
    setMessage('');
    try {
      const c = model.read().context;
      const next = await createPropertyPassportTimeline(model, c, { enabled });
      if (attempt !== generation.current) return;
      setView(next);
      setState('ready');
    } catch {
      if (attempt !== generation.current) return;
      setState('error');
      setMessage(
        'Property evidence is unavailable or changed. Select the correct property and reload.',
      );
    }
  }
  async function open(event: PassportTimelineEvent) {
    const attempt = ++generation.current;
    setDetail(null);
    setMessage('Reading exact source…');
    const result = await readPropertyPassportTimelineEvidence(
      model,
      {
        kind: event.kind,
        source: event.reference,
        source_sha256: event.source_sha256,
      },
      { enabled },
    );
    if (attempt !== generation.current) return;
    if (result.status === 'AVAILABLE') {
      setDetail(result.evidence);
      setMessage('');
    } else {
      setView(null);
      setState('error');
      setMessage(
        'Exact source unavailable — UNKNOWN. Reload current authorized evidence; no source was substituted.',
      );
    }
  }
  if (!enabled)
    return (
      <section className="passport-timeline">
        <h1>Property Passport preview is off</h1>
        <p>No customer access is enabled.</p>
      </section>
    );
  const snapshot = view?.snapshot;
  const events =
    snapshot?.events.filter(
      (event) => filter === 'all' || event.kind === filter,
    ) ?? [];
  return (
    <main
      className="passport-timeline"
      style={
        { '--passport-color': model.company.primary_color } as CSSProperties
      }
    >
      <header className="passport-timeline__header">
        <p className="passport-timeline__eyebrow">{model.company.name}</p>
        <h1>Property Passport</h1>
        <p>
          A clear record of your property’s available reports and issued job
          scope.
        </p>
        <span className="passport-timeline__badge">
          Synthetic local preview
        </span>
      </header>
      <section
        className="passport-timeline__overview"
        aria-label="Property evidence overview"
      >
        <div>
          <p className="passport-timeline__eyebrow">Your property</p>
          <h2>
            {snapshot?.property_label ?? 'Select and load property evidence'}
          </h2>
          <p>Available evidence only. Historical coverage is unknown.</p>
        </div>
        <button onClick={() => void load()} disabled={state === 'loading'}>
          {state === 'loading' ? 'Loading evidence…' : 'Load property timeline'}
        </button>
      </section>
      <p className="passport-timeline__notice">
        Recorded dates have different meanings. Inspection visit dates have no
        time or timezone; issued scope uses its recorded UTC date. Same-day
        order is not determined.
      </p>
      {message && (
        <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>
      )}
      {state === 'loading' && (
        <p role="status">Loading currently authorized property evidence…</p>
      )}
      {snapshot && (
        <>
          <div className="passport-timeline__toolbar">
            <label>
              Show evidence
              <select
                aria-label="Show evidence"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setDetail(null);
                  generation.current++;
                }}
              >
                <option value="all">All available evidence</option>
                <option value="inspection-documentation">
                  Inspection documentation
                </option>
                <option value="issued-job-scope">Issued job scope</option>
              </select>
            </label>
            <p role="status">
              {events.length} available evidence{' '}
              {events.length === 1 ? 'item' : 'items'}
            </p>
          </div>
          {!events.length && (
            <section className="passport-timeline__empty">
              <h2>No available evidence in this view</h2>
              <p>
                Missing or access-limited reports do not establish that no work
                or concern exists.
              </p>
            </section>
          )}
          <ol
            className="passport-timeline__list"
            aria-label="Property evidence timeline"
          >
            {events.map((event) => (
              <li
                key={`${event.kind}-${event.source_sha256}`}
                className="passport-timeline__card"
              >
                <div className="passport-timeline__date">
                  <time dateTime={event.date}>{event.date}</time>
                  <span>
                    {event.kind === 'inspection-documentation'
                      ? 'Recorded visit date'
                      : 'Issued scope · UTC date'}
                  </span>
                </div>
                <div className="passport-timeline__body">
                  <span className="passport-timeline__badge">
                    {event.kind === 'inspection-documentation'
                      ? 'Inspection documentation'
                      : 'Issued job scope'}
                  </span>
                  {event.kind === 'inspection-documentation' ? (
                    <>
                      <h2>{event.report.summary}</h2>
                      <p>
                        Report {event.reference.report_id} · published version{' '}
                        {event.reference.published_version}
                      </p>
                      <p>
                        Published{' '}
                        <time dateTime={event.published_at}>
                          {event.published_at}
                        </time>
                      </p>
                      <p>
                        {event.completion_documentation.after_phase_recorded
                          ? 'After-phase documentation recorded'
                          : `Recorded phase: ${event.report.phase}`}{' '}
                        ·{' '}
                        {
                          event.completion_documentation
                            .checklist_items_recorded_completed
                        }{' '}
                        of{' '}
                        {
                          event.completion_documentation
                            .checklist_items_recorded
                        }{' '}
                        checklist items recorded checked
                      </p>
                      <p>
                        Related job:{' '}
                        {event.job_link_status === 'EXACT'
                          ? event.linked_jobs[0].job_id
                          : 'UNKNOWN — no single exact link established'}
                      </p>
                    </>
                  ) : (
                    <>
                      <h2>{event.job.issued_source.scope.name}</h2>
                      <p>{event.job.issued_source.scope.description}</p>
                      <p>Job {event.reference.job_id}</p>
                      <p>
                        Estimate {event.reference.estimate_id} · issued version{' '}
                        {event.reference.issued_version_number}
                      </p>
                      <p>Version ID {event.reference.issued_version_id}</p>
                    </>
                  )}
                  <button
                    onClick={() => void open(event)}
                    aria-label={
                      event.kind === 'inspection-documentation'
                        ? `Open report ${event.reference.report_id} published version ${event.reference.published_version}`
                        : `Open job ${event.reference.job_id} issued version ${event.reference.issued_version_number}`
                    }
                  >
                    {event.kind === 'inspection-documentation'
                      ? 'Open report'
                      : 'Open job'}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {detail && (
        <section
          className="passport-timeline__detail"
          aria-label="Exact source evidence"
        >
          <h2 tabIndex={-1} ref={heading}>
            Exact{' '}
            {detail.kind === 'inspection-documentation'
              ? 'published report'
              : 'issued job scope'}
          </h2>
          {detail.kind === 'inspection-documentation' ? (
            <>
              <p>
                Report {detail.reference.report_id} · published version{' '}
                {detail.reference.published_version}
              </p>
              <p>Property {detail.reference.location_id}</p>
              <p>{detail.report.summary}</p>
              <h3>Factual observations</h3>
              {!detail.report.observations.length && (
                <p>No observations documented in this report.</p>
              )}
              {detail.report.observations.map((item) => (
                <article key={item.reference.source_index}>
                  <h4>
                    {item.category} · {item.location} · reported {item.severity}
                  </h4>
                  <p>
                    Finding {item.reference.finding_id} · source position{' '}
                    {item.reference.source_index + 1}
                  </p>
                  <p>{item.observation}</p>
                  <h5>Maintenance recommendation</h5>
                  <p>{item.recommendation}</p>
                </article>
              ))}
              <h3>Related issued job scope</h3>
              {detail.job_link_status !== 'EXACT' && (
                <p>UNKNOWN — no single exact job association established.</p>
              )}
              {detail.job_link_status === 'EXACT' &&
                detail.linked_jobs.map((link) => {
                  const target = snapshot?.events.find(
                    (e) =>
                      e.kind === 'issued-job-scope' &&
                      e.reference.job_id === link.job_id &&
                      e.reference.issued_version_id === link.issued_version_id,
                  );
                  return target ? (
                    <button
                      key={link.job_id}
                      onClick={() => void open(target)}
                      aria-label={`Open job ${link.job_id} issued version ${link.issued_version_number}`}
                    >
                      Open job
                    </button>
                  ) : null;
                })}
              <h3>Recorded checklist</h3>
              {!detail.report.checklist.length && (
                <p>No checklist items documented.</p>
              )}
              {detail.report.checklist.map((item) => (
                <p key={item.reference.source_index}>
                  {item.label}:{' '}
                  {item.recorded_completed
                    ? 'Recorded checked'
                    : 'Recorded unchecked'}{' '}
                  · source position {item.reference.source_index + 1}
                </p>
              ))}
            </>
          ) : (
            <>
              <p>
                Job {detail.reference.job_id} · estimate{' '}
                {detail.reference.estimate_id}
              </p>
              <p>
                Issued version {detail.reference.issued_version_number} ·{' '}
                {detail.reference.issued_version_id}
              </p>
              <p>Property {detail.reference.location_id}</p>
              <h3>{detail.job.issued_source.scope.name}</h3>
              <p>{detail.job.issued_source.scope.description}</p>
              {detail.job.issued_source.scope.lines.map((line) => (
                <p key={line.id}>
                  {line.description} · {line.quantity_milli / 1000} {line.unit}{' '}
                  · line {line.id}
                </p>
              ))}
              <p>
                Available linked reports:{' '}
                {detail.job.documentation.reports.length}. Other report
                relationships remain unknown.
              </p>
              <div
                className="passport-timeline__related"
                aria-label="Exact related report sources"
              >
                {detail.job.documentation.reports.map((link) => {
                  const target = snapshot?.events.find(
                    (e) =>
                      e.kind === 'inspection-documentation' &&
                      e.reference.report_id === link.reference.report_id &&
                      e.reference.published_version ===
                        link.reference.published_version,
                  );
                  return target ? (
                    <button
                      key={`${link.reference.report_id}:${link.reference.published_version}`}
                      onClick={() => void open(target)}
                      aria-label={`Open report · ${target.date} · v${link.reference.published_version} — report ${link.reference.report_id} published version ${link.reference.published_version}`}
                      data-report-id={link.reference.report_id}
                      data-report-version={link.reference.published_version}
                    >
                      Open report · {target.date} · v
                      {link.reference.published_version}
                    </button>
                  ) : null;
                })}
              </div>
            </>
          )}
          <p className="passport-timeline__notice">
            Documentation is a record of reported information. Physical repair
            completion, warranty and customer approval remain UNVERIFIED.
          </p>
          <p className="passport-timeline__digest">
            Source SHA-256 {detail.source_sha256}
          </p>
          <button onClick={() => setDetail(null)}>Close source detail</button>
        </section>
      )}
      <footer>
        <p>
          Documentation does not authorize repairs, contracts, invoices or
          payments.
        </p>
        <PlatformBrand transparent href="#" />
        {view && (
          <details>
            <summary>Evidence integrity</summary>
            <p className="passport-timeline__digest">
              Timeline SHA-256 {view.integrity.sha256}
            </p>
            <p>
              In-memory read snapshot; no durable archive or operational
              customer access.
            </p>
          </details>
        )}
      </footer>
    </main>
  );
}
