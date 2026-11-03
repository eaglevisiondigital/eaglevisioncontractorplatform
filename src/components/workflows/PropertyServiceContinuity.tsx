import { useLayoutEffect, useRef, useState } from 'react';
import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import {
  propertyServiceContinuityEnabled,
  readPropertyServiceContinuity,
  refreshPropertyServiceContinuity,
  assertPropertyServiceContinuity,
  handoffPropertyServiceJob,
  type PropertyServiceJobCallback,
  readPropertyServiceVersionStatus,
  type PropertyServiceContinuityView,
} from '../../lib/workflows/property-service-continuity';
import { PublishedServiceNavigator } from './PublishedServiceNavigator';
import { SharedRecordSearch } from './SharedRecordSearch';
import './property-service-continuity.css';
export function PropertyServiceContinuity(props: SavedRevisionPanelProps) {
  if (!propertyServiceContinuityEnabled(props.enabled))
    return (
      <section
        className="property-service-continuity"
        aria-label="Property service continuity"
      >
        <p role="status">Property service continuity is OFF.</p>
      </section>
    );
  return <BoundContinuity {...props} />;
}
function BoundContinuity(props: SavedRevisionPanelProps) {
  const [context, setContext] = useState({
    sources: props.sources,
    job: props.selectedJobId,
    generation: 0,
  });
  if (
    context.sources !== props.sources ||
    context.job !== props.selectedJobId
  ) {
    setContext({
      sources: props.sources,
      job: props.selectedJobId,
      generation: context.generation + 1,
    });
    return null;
  }
  return <Session key={context.generation} {...props} />;
}
function Session({
  sources,
  selectedJobId,
  onSelectJob,
  onContinue,
}: SavedRevisionPanelProps) {
  const [job, setJob] = useState(selectedJobId ?? ''),
    [view, setView] = useState<PropertyServiceContinuityView>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const gate = useRef({ enabled: true, confirmed: true }),
    life = useRef({ alive: true, pending: false, serial: 0 }),
    heading = useRef<HTMLHeadingElement>(null),
    navigation = useRef<PropertyServiceJobCallback>({
      current: onSelectJob,
      generation: 0,
    });
  useLayoutEffect(() => {
    const n = navigation.current;
    n.current = onSelectJob;
    n.generation++;
    return () => {
      n.current = undefined;
      n.generation++;
    };
  }, [onSelectJob]);
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
    if (view) assertPropertyServiceContinuity(view);
  } catch {
    current = false;
  }
  async function read(refresh: boolean) {
    const l = life.current;
    if (l.pending || !current || !job) return;
    l.pending = true;
    const serial = ++l.serial;
    setBusy(true);
    setError('');
    try {
      const next =
        refresh && view
          ? await refreshPropertyServiceContinuity(view)
          : await readPropertyServiceContinuity(sources, job, gate.current);
      assertPropertyServiceContinuity(next);
      if (l.alive && serial === l.serial) {
        setView(next);
        heading.current?.focus();
      }
    } catch {
      if (l.alive && serial === l.serial)
        setError(
          'UNKNOWN — current exact property, published source or staff access is unavailable. No replacement or completion is inferred.',
        );
    } finally {
      l.pending = false;
      if (l.alive && serial === l.serial) setBusy(false);
    }
  }
  return (
    <section
      className="property-service-continuity"
      aria-label="Property service continuity"
      aria-busy={busy}
    >
      <header>
        <p className="psc-eyebrow">ONE PROPERTY · EXACT PUBLISHED SOURCES</p>
        <h2 ref={heading} tabIndex={-1}>
          Property service continuity
        </h2>
        <p>
          Keep issued jobs and published documentation together. Internal
          corrections do not publish a customer update.
        </p>
      </header>
      {(error || !current) && (
        <p role="alert">
          {error ||
            'UNKNOWN — source access changed; retained evidence is withheld.'}
        </p>
      )}
      {current && (
        <>
          {!job && (
            <SharedRecordSearch
              sources={sources}
              enabled
              onSelectJob={(id) => setJob(id)}
            />
          )}
          <button
            type="button"
            disabled={busy || !job}
            onClick={() => void read(false)}
          >
            Read same-property service continuity
          </button>
          <p role="status">
            {busy
              ? 'Reading exact published property sources…'
              : view
                ? `${view.jobs.length} authorized same-property job sources. Complete history UNKNOWN.`
                : 'Select a job, then read its exact property sources.'}
          </p>
          {view && (
            <>
              <dl className="psc-context">
                <div>
                  <dt>Property</dt>
                  <dd>{view.property_label}</dd>
                </div>
                <div>
                  <dt>Customer / property IDs</dt>
                  <dd>
                    {view.customer_id} / {view.location_id}
                  </dd>
                </div>
                <div>
                  <dt>Retained job</dt>
                  <dd>{view.selected_job_id}</dd>
                </div>
              </dl>
              <button
                type="button"
                disabled={busy}
                onClick={() => void read(true)}
              >
                Refresh available published property sources
              </button>
              <div className="psc-jobs">
                {view.jobs.map((row) => {
                  const version = readPropertyServiceVersionStatus(
                    view,
                    row.context.job_id,
                  );
                  return (
                    <article
                      key={row.context.job_id}
                      aria-label={`Published job source ${row.context.job_id}`}
                    >
                      <h3>{row.history.scope.name}</h3>
                      <p>Exact job {row.context.job_id}</p>
                      <p>Issued version {row.context.issued_version_id}</p>
                      <dl>
                        <dt>Retained published source</dt>
                        <dd>
                          {version.selected_report_id} / version{' '}
                          {version.selected_published_version}
                        </dd>
                        <dt>
                          Available sibling versions at last explicit read
                        </dt>
                        <dd>
                          {version.available_sibling_versions.join(', ')} ·{' '}
                          {version.status}
                        </dd>
                      </dl>
                      <p>
                        Published versions: {row.history.reports.length}.
                        Physical completion, customer acceptance and warranty
                        UNVERIFIED.
                      </p>
                      {row.context.job_id !== view.selected_job_id && (
                        <button
                          type="button"
                          disabled={busy || !onSelectJob}
                          onClick={() => {
                            try {
                              if (!onSelectJob) return;
                              handoffPropertyServiceJob(
                                view,
                                row.context.job_id,
                                onSelectJob,
                                navigation.current,
                              );
                            } catch {
                              gate.current.enabled = false;
                              setError(
                                'UNKNOWN — exact property job handoff withheld.',
                              );
                            }
                          }}
                        >
                          Retain this exact property job
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              {!onSelectJob && view.jobs.length > 1 && (
                <p>
                  Use the existing workbench record search to retain another
                  property job across all review tabs.
                </p>
              )}
              <p>
                Request-to-job relationship remains {view.request_job_link}.
                Missing history or a later report does not establish repair or
                acceptance.
              </p>
            </>
          )}
          <PublishedServiceNavigator
            sources={sources}
            enabled
            selectedJobId={job || undefined}
            onContinue={onContinue}
          />
        </>
      )}
    </section>
  );
}
