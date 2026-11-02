import { useEffect, useRef, useState } from 'react';
import type { OperatingSources } from '../../lib/workflows/operating-center-runtime';
import {
  assertPortfolioServiceCurrentNow,
  openPortfolioServiceSource,
  readPortfolioService,
  selectPortfolioServiceJob,
  type PortfolioServiceView,
} from '../../lib/workflows/portfolio-service';
import './portfolio-service.css';
export interface PortfolioServiceProps {
  sources: OperatingSources;
  enabled?: boolean;
  onSelectJob?: (jobId: string) => void;
}
export function PortfolioService(props: PortfolioServiceProps) {
  const signature = JSON.stringify({
    targets: props.sources.entries.map((e) => e.target),
    enabled: props.enabled,
  });
  const models = props.sources.entries.map((e) => e.customerModel);
  const [binding, bind] = useState({
    models,
    sources: props.sources,
    signature,
    generation: 0,
  });
  if (
    binding.sources !== props.sources ||
    binding.signature !== signature ||
    binding.models.length !== models.length ||
    binding.models.some((m, i) => m !== models[i])
  ) {
    bind({
      models,
      sources: props.sources,
      signature,
      generation: binding.generation + 1,
    });
    return null;
  }
  return props.enabled === true ? (
    <Portfolio key={binding.generation} {...props} />
  ) : null;
}
function Portfolio({ sources, onSelectJob }: PortfolioServiceProps) {
  const [view, setView] = useState<PortfolioServiceView>(),
    [detail, setDetail] =
      useState<Awaited<ReturnType<typeof openPortfolioServiceSource>>>(),
    [filter, setFilter] = useState(''),
    [options, setOptions] = useState<{ id: string; label: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [selected, setSelected] = useState<string>();
  const life = useRef({ active: true }),
    gate = useRef({ enabled: true, confirmed: true }),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const l = life.current,
      g = gate.current;
    l.active = true;
    g.enabled = true;
    return () => {
      l.active = false;
      g.enabled = false;
    };
  }, []);
  useEffect(() => {
    if (detail) heading.current?.focus();
  }, [detail]);
  async function load(locationId = filter) {
    if (busy) return;
    setBusy(true);
    setView(undefined);
    setDetail(undefined);
    setError(undefined);
    setSelected(undefined);
    try {
      const value = await readPortfolioService(
        sources,
        { location_id: locationId },
        gate.current,
      );
      if (!life.current.active) return;
      assertPortfolioServiceCurrentNow(value);
      setView(value);
      if (!locationId)
        setOptions(
          value.properties.map((g) => ({
            id: g.location_id,
            label: g.property_label,
          })),
        );
    } catch {
      if (life.current.active)
        setError(
          'UNKNOWN — exact authorized property, job or report evidence changed. No replacement history was selected.',
        );
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function open(
    reference: NonNullable<
      PortfolioServiceView['properties'][number]['reports'][number]
    >['report']['reference'],
  ) {
    if (!view || busy) return;
    setBusy(true);
    setDetail(undefined);
    setError(undefined);
    try {
      const value = await openPortfolioServiceSource(view, reference);
      if (!life.current.active) return;
      assertPortfolioServiceCurrentNow(view);
      setDetail(value);
    } catch {
      if (life.current.active) {
        setView(undefined);
        setError(
          'UNKNOWN — this exact published report/version is unavailable. No other report was opened.',
        );
      }
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  function select(jobId: string) {
    if (!view || busy) return;
    try {
      const exact = selectPortfolioServiceJob(view, jobId);
      assertPortfolioServiceCurrentNow(view);
      setSelected(exact);
      onSelectJob?.(exact);
    } catch {
      setView(undefined);
      setError('UNKNOWN — the exact job documentation source changed.');
    }
  }
  return (
    <section
      className="portfolio-service"
      aria-label="Property portfolio service history"
    >
      <div>
        <span className="eyebrow">
          Customer experience · property portfolio
        </span>
        <h2>Property Passport across your service history</h2>
        <p>
          Exact properties, issued job scopes and published documentation.
          History coverage is UNKNOWN; documentation does not verify completed
          work.
        </p>
      </div>
      <div className="portfolio-service-controls">
        <label>
          Property history filter
          <select
            value={filter}
            disabled={busy}
            onChange={(e) => {
              setFilter(e.target.value);
              setView(undefined);
              setDetail(undefined);
              setSelected(undefined);
              setError(undefined);
            }}
          >
            <option value="">All available properties</option>
            {options.map((p) => (
              <option value={p.id} key={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => void load()}>
          Review property service portfolio
        </button>
      </div>
      {busy && (
        <p role="status">Reading authorized property and published evidence…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <p role="status">
            {view.properties.length} displayed properties ·{' '}
            {view.available_properties} available · {view.available_jobs}{' '}
            prepared jobs · {view.available_reports} unique published reports.
          </p>
          {!view.properties.length && (
            <p>No available property matches this exact filter.</p>
          )}
          {view.properties.map((property) => (
            <section
              className="portfolio-service-property"
              key={property.location_id}
              aria-label={`Service history for ${property.property_label}`}
            >
              <h3>{property.property_label}</h3>
              <p>{property.contractor.name}</p>
              <details>
                <summary>Exact customer and property references</summary>
                <p>
                  Customer {property.customer_id} · Property{' '}
                  {property.location_id}
                </p>
              </details>
              <div className="portfolio-service-grid">
                <section
                  aria-label={`Issued job documentation for ${property.property_label} · property ${property.location_id}`}
                >
                  <h4>Issued job scopes</h4>
                  {property.jobs.map((job) => (
                    <article key={job.job_id}>
                      <h5>{job.name}</h5>
                      <p>{job.description}</p>
                      <p>Job {job.job_id}</p>
                      <p>
                        Issued version {job.issued_version_number} ·{' '}
                        {job.issued_version_id}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => select(job.job_id)}
                      >
                        Open existing job documentation
                      </button>
                    </article>
                  ))}
                </section>
                <section
                  aria-label={`Published service report history for ${property.property_label} · property ${property.location_id}`}
                >
                  <h4>Published reports · counted once per exact version</h4>
                  {property.reports.map((item) => (
                    <article
                      key={`${item.report.reference.report_id}:${item.report.reference.published_version}`}
                    >
                      <h5>
                        {item.report.visited_on} · {item.report.phase}{' '}
                        documentation
                      </h5>
                      <p>{item.report.summary}</p>
                      <p>
                        Report {item.report.reference.report_id} · published
                        version {item.report.reference.published_version}
                      </p>
                      <p>
                        {item.association === 'EXACT_RECORDED_LINK'
                          ? 'Exact recorded job association'
                          : 'Job association UNKNOWN'}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void open(item.report.reference)}
                      >
                        Open exact service report
                      </button>
                    </article>
                  ))}
                </section>
              </div>
            </section>
          ))}
        </>
      )}
      {detail && (
        <section
          className="portfolio-service-detail"
          aria-label="Exact portfolio service report"
        >
          <h3 ref={heading} tabIndex={-1}>
            Exact portfolio service report
          </h3>
          <p>
            Report {detail.reference.report_id} · published version{' '}
            {detail.reference.published_version}
          </p>
          <p>{detail.summary}</p>
          <h4>Recorded checklist</h4>
          <ul>
            {detail.checklist.map((c) => (
              <li key={c.reference.source_index}>
                {c.label} ·{' '}
                {c.recorded_completed
                  ? 'Recorded checked'
                  : 'Recorded unchecked'}{' '}
                · source position {c.reference.source_index + 1}
              </li>
            ))}
          </ul>
          {detail.observations.map((o) => (
            <article key={o.reference.source_index}>
              <p>
                Finding {o.reference.finding_id} · {o.severity} · {o.location}
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
      {selected && (
        <p role="status">
          Existing documentation workflow selected for exact job {selected}.
        </p>
      )}
      <p className="portfolio-service-boundary">
        Customer-safe documentation only. Physical completion, customer
        acceptance and warranty remain UNVERIFIED. No media, customer response,
        download, delivery, contract or financial action.
      </p>
    </section>
  );
}
