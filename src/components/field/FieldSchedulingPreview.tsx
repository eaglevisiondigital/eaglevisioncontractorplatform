import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { sampleCompanies, type CompanyProfile } from '../../domain/platform';
import { Operations } from '../../lib/operations';
import {
  propertyRepository,
  type PropertyRepository,
} from '../../lib/property';
import { prepareMaintenanceExamples } from '../../lib/maintenance-examples';
import {
  blankFieldFilters,
  filterFieldSchedule,
  openFieldOrigin,
  openFieldSource,
  readFieldSchedule,
  type FieldVisitRow,
} from '../../lib/field-scheduling';
import { useResource } from '../forms-state';
import { PlatformBrand } from '../PlatformBrand';
import { maintenanceScheduleHandoffEnabled } from '../../lib/maintenance-schedule-handoff';
import { fieldWorkOrdersEnabled } from '../../lib/field-work-orders';
const FieldWorkOrdersPreview = lazy(() =>
  import('./FieldWorkOrdersPreview').then((m) => ({
    default: m.FieldWorkOrdersPreview,
  })),
);
const MaintenanceScheduleHandoffPreview = lazy(() =>
  import('./MaintenanceScheduleHandoffPreview').then((m) => ({
    default: m.MaintenanceScheduleHandoffPreview,
  })),
);
import './field-scheduling.css';

export function FieldSchedulingPreview() {
  const [operations] = useState(() => new Operations(true));
  const [companyId, setCompanyId] = useState(sampleCompanies[0].id);
  const company = sampleCompanies.find((c) => c.id === companyId)!;
  return (
    <div
      className="field-schedule"
      style={
        {
          '--field-brand': company.primary_color,
          '--field-accent': company.accent_color,
        } as CSSProperties
      }
    >
      <a className="skip" href="#field-main">
        Skip to inspection schedule
      </a>
      <header className="field-header">
        <div>
          <span className="field-eyebrow">
            CONTRACTOR OPERATIONS / FIELD PREVIEW
          </span>
          <strong>{company.name}</strong>
        </div>
        <label>
          Company context
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {sampleCompanies.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main id="field-main">
        <div className="field-heading">
          <div>
            <span className="field-eyebrow">THE PROPERTY DAY, IN VIEW</span>
            <h1>Inspection schedule</h1>
            <p>Existing visits. Exact source evidence. Clear follow-through.</p>
          </div>
          <span className="field-badge">Isolated local prototype</span>
        </div>
        <p className="field-boundary">
          Synthetic session only · read-only schedule. A dated draft is not
          dispatch, work authorization or verified repair completion. Available
          records do not prove complete history.
        </p>
        <Schedule
          key={company.id}
          company={company}
          repo={propertyRepository(operations)}
        />
        {fieldWorkOrdersEnabled({
          development: import.meta.env.DEV,
          flag: import.meta.env.VITE_FIELD_WORK_ORDERS_PREVIEW,
          hostname: window.location.hostname,
          protocol: window.location.protocol,
        }) && (
          <Suspense fallback={<p role="status">Loading local work orders…</p>}>
            <FieldWorkOrdersPreview
              key={company.id}
              company={company}
              repo={propertyRepository(operations)}
            />
          </Suspense>
        )}
        {maintenanceScheduleHandoffEnabled({
          development: import.meta.env.DEV,
          flag: import.meta.env.VITE_MAINTENANCE_SCHEDULE_HANDOFF_PREVIEW,
          hostname: window.location.hostname,
          protocol: window.location.protocol,
        }) && (
          <Suspense
            fallback={
              <p role="status">Loading isolated maintenance handoff…</p>
            }
          >
            <MaintenanceScheduleHandoffPreview
              key={company.id}
              company={company}
              repo={propertyRepository(operations)}
            />
          </Suspense>
        )}
      </main>
      <footer>
        <PlatformBrand href="/preview" transparent />
        <a href="/preview">Open existing local back office ↗</a>
        <span>Release 1.0 · NOT READY / NOT AUTHORIZED</span>
      </footer>
    </div>
  );
}
function Schedule({
  company,
  repo,
}: {
  company: CompanyProfile;
  repo: PropertyRepository;
}) {
  const actor = company.id + '-owner';
  const resource = useResource(
    useCallback(async () => {
      await repo.initialize(company);
      await repo.refreshContexts(company.id);
      return readFieldSchedule(repo, company.id, actor);
    }, [repo, company, actor]),
  );
  const [filters, setFilters] = useState({ ...blankFieldFilters });
  const [selected, setSelected] = useState<
    (ReturnType<typeof openFieldSource> & { finding_id?: string }) | null
  >(null);
  const [message, setMessage] = useState('');
  const [simulatedError, setSimulatedError] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const exampleAttempted = useRef(false);
  const [attempted, setAttempted] = useState(false);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) detail.current?.focus();
  }, [selected]);
  let rows: FieldVisitRow[] = [],
    filterError = '';
  try {
    rows = resource.data
      ? filterFieldSchedule(resource.data.rows, filters)
      : [];
  } catch (e) {
    filterError = e instanceof Error ? e.message : 'Invalid schedule filters.';
  }
  const available =
    !resource.loading && !resource.error && !simulatedError && !!resource.data;
  const update = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setSelected(null);
    setMessage('');
  };
  const reload = () => {
    setSimulatedError(false);
    setSelected(null);
    setMessage('');
    resource.reload();
  };
  const open = (run: () => NonNullable<typeof selected>) => {
    try {
      setSelected(run());
      setMessage('');
    } catch (e) {
      setSelected(null);
      setMessage(e instanceof Error ? e.message : 'Source unavailable.');
    }
  };
  async function examples() {
    if (exampleAttempted.current) return;
    exampleAttempted.current = true;
    setAttempted(true);
    setPreparing(true);
    setSelected(null);
    setMessage('');
    try {
      await prepareMaintenanceExamples(repo, company.id, actor);
      const current = repo.maintenance(company.id, actor),
        item = current.items[0];
      const member = current.members.find(
        (m) => m.user_id === company.id + '-field',
      );
      if (!item || !member)
        throw Error('Existing source and active staff required.');
      const record = await repo.saveMaintenance(
        company.id,
        actor,
        item.source,
        item.record.revision,
        {
          priority: 'normal',
          assignee_id: member.user_id,
          follow_up_on: '2026-11-20',
          review: 'pending',
          note: '',
        },
      );
      const plan = repo
        .read(company.id)
        .plans.find((p) => p.id === item.plan_id);
      if (!plan) throw Error('Exact source plan unavailable.');
      await repo.scheduleMaintenance(
        company.id,
        actor,
        item.source,
        record.revision,
        { id: plan.id, revision: plan.revision },
        '2026-11-20',
      );
      setPrepared(true);
      resource.reload();
      setMessage(
        'Synthetic follow-up draft prepared through existing maintenance and inspection workflows. No dispatch or publication.',
      );
    } catch (e) {
      setMessage(
        (e instanceof Error
          ? e.message
          : 'Example preparation outcome unknown.') +
          ' No automatic retry. Inspect retained records.',
      );
      resource.reload();
    } finally {
      setPreparing(false);
    }
  }
  const properties = [
    ...new Map(
      (resource.data?.rows ?? []).map((r) => [
        r.source.location_id,
        r.property_label,
      ]),
    ).entries(),
  ];
  return (
    <>
      <div className="field-toolbar">
        <div>
          <h2>Visit timeline</h2>
          <p>
            Dates are recorded property dates; each plan’s timezone is shown.
          </p>
        </div>
        <button
          className="secondary"
          onClick={reload}
          disabled={resource.loading || preparing}
        >
          Reload schedule
        </button>
      </div>
      {resource.loading ? (
        <p role="status" className="field-state">
          Loading current local inspection records…
        </p>
      ) : !available ? (
        <div role="alert" className="field-state">
          <h3>Schedule unavailable</h3>
          <p>
            Records and source actions are hidden until a successful reload. No
            automatic retry or dispatch.
          </p>
        </div>
      ) : (
        <>
          <section
            className="field-filters"
            aria-label="Inspection schedule filters"
          >
            <label>
              From date
              <input
                type="date"
                value={filters.from}
                onChange={(e) => update('from', e.target.value)}
              />
            </label>
            <label>
              Through date
              <input
                type="date"
                value={filters.to}
                onChange={(e) => update('to', e.target.value)}
              />
            </label>
            <label>
              Property
              <select
                value={filters.property}
                onChange={(e) => update('property', e.target.value)}
              >
                <option value="">All properties</option>
                {properties.map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Follow-up responsibility
              <select
                value={filters.responsibility}
                onChange={(e) => update('responsibility', e.target.value)}
              >
                <option value="">All responsibility</option>
                <option value="unassigned">Unassigned</option>
                {resource.data!.members.map((m) => (
                  <option value={m.user_id} key={m.user_id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Recorded visit status
              <select
                value={filters.status}
                onChange={(e) => update('status', e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="published">Published</option>
              </select>
            </label>
            <button
              className="secondary"
              onClick={() => {
                setFilters({ ...blankFieldFilters });
                setSelected(null);
              }}
            >
              Reset filters
            </button>
          </section>
          <p className="field-filter-note">
            Responsibility reflects an exact maintenance follow-up record, not
            crew assignment or a workforce access grant.
          </p>
          {Object.entries(filters).some(([, value]) => value) && (
            <div className="field-active" aria-label="Active schedule filters">
              {Object.entries(filters)
                .filter(([, value]) => value)
                .map(([key]) => (
                  <button
                    className="secondary"
                    key={key}
                    onClick={() => update(key as keyof typeof filters, '')}
                  >
                    Clear{' '}
                    {
                      {
                        from: 'from date',
                        to: 'through date',
                        property: 'property',
                        responsibility: 'responsibility',
                        status: 'visit status',
                      }[key]
                    }
                  </button>
                ))}
            </div>
          )}
          {filterError ? (
            <p role="alert" className="field-state">
              {filterError}
            </p>
          ) : (
            <>
              <p role="status" className="field-count">
                {rows.length} of {resource.data!.rows.length} available visit
                records
              </p>
              {!rows.length ? (
                <div className="field-state">
                  <h3>No visits match these filters</h3>
                  <p>
                    Reset a filter to inspect other available records. No
                    missing visit or finding establishes repair completion.
                  </p>
                </div>
              ) : (
                <ol
                  className="field-timeline"
                  aria-label="Inspection visit timeline"
                >
                  {rows.map((row) => (
                    <li key={row.source.visit_id} className="field-visit">
                      <div className="field-date">
                        <time dateTime={row.date}>{row.date}</time>
                        <span>{row.timezone}</span>
                      </div>
                      <div className="field-visit-body">
                        <div className="field-card-top">
                          <span
                            className={
                              'field-status field-status-' + row.status
                            }
                          >
                            {row.status === 'draft'
                              ? 'Draft inspection'
                              : row.status === 'submitted'
                                ? 'Submitted inspection'
                                : 'Published evidence'}
                          </span>
                          <span>
                            {row.cadence} · {row.phase}
                          </span>
                        </div>
                        <h3>{row.property_label}</h3>
                        <p className="field-customer">
                          {row.customer_name} · {row.plan_name}
                        </p>
                        <p>{row.summary}</p>
                        <div className="field-meta">
                          <span>
                            <b>Follow-up responsibility</b>
                            {row.responsibility_uncertain
                              ? 'Unavailable — current staff relationship unverified'
                              : row.responsibility.length
                                ? row.responsibility
                                    .map((m) => m.label)
                                    .join(', ')
                                : 'Unassigned'}
                          </span>
                          <span>
                            <b>Evidence</b>
                            {row.reports.length
                              ? row.reports.length +
                                ' published report version(s)'
                              : 'No published report for this visit'}
                          </span>
                        </div>
                        <div className="field-card-actions">
                          <button
                            onClick={() =>
                              open(() =>
                                openFieldSource(
                                  repo,
                                  company.id,
                                  actor,
                                  row.source,
                                ),
                              )
                            }
                          >
                            Inspect exact visit
                          </button>
                          {row.reports.map((r) => (
                            <button
                              className="secondary"
                              key={r.id}
                              onClick={() =>
                                open(() =>
                                  openFieldSource(
                                    repo,
                                    company.id,
                                    actor,
                                    row.source,
                                    r,
                                  ),
                                )
                              }
                            >
                              Open report v{r.version}
                            </button>
                          ))}
                          {row.follow_up_sources.map((s) => (
                            <button
                              className="secondary"
                              key={s.report_id + s.finding_id}
                              onClick={() =>
                                open(() =>
                                  openFieldOrigin(
                                    repo,
                                    company.id,
                                    actor,
                                    row.source,
                                    s,
                                  ),
                                )
                              }
                            >
                              Open originating finding · v{s.report_version}
                            </button>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {selected && (
            <section
              className="field-source"
              ref={detail}
              tabIndex={-1}
              aria-labelledby="field-source-heading"
            >
              <div className="field-toolbar">
                <h2 id="field-source-heading">
                  {selected.published
                    ? 'Exact published source'
                    : 'Exact inspection visit'}
                </h2>
                <button className="secondary" onClick={() => setSelected(null)}>
                  Close source detail
                </button>
              </div>
              <p>
                {selected.row.customer_name} · {selected.row.property_label}
              </p>
              <dl>
                <dt>Selected visit ID / revision</dt>
                <dd>
                  {selected.row.source.visit_id} /{' '}
                  {selected.row.source.visit_revision}
                </dd>
                <dt>Selected plan ID / revision</dt>
                <dd>
                  {selected.row.source.plan_id} /{' '}
                  {selected.row.source.plan_revision}
                </dd>
                <dt>Customer / property</dt>
                <dd>
                  {selected.row.source.customer_id} /{' '}
                  {selected.row.source.location_id}
                </dd>
              </dl>
              {selected.published ? (
                <>
                  <dl>
                    <dt>Report ID / published version</dt>
                    <dd>
                      {selected.published.id} / v{selected.published.version}
                    </dd>
                    <dt>Published source visit ID</dt>
                    <dd>{selected.published.visit_id}</dd>
                    <dt>Inspection date</dt>
                    <dd>{selected.published.visited_on}</dd>
                    {selected.finding_id && (
                      <>
                        <dt>Originating finding ID</dt>
                        <dd>{selected.finding_id}</dd>
                      </>
                    )}
                  </dl>
                  <h3>Published observation</h3>
                  <p>{selected.published.summary}</p>
                  {selected.published.findings.map((f) => (
                    <div className="field-finding" key={f.id}>
                      <h4>
                        {f.category} · {f.location} · {f.severity}
                      </h4>
                      <p>
                        <b>Observation:</b> {f.description}
                      </p>
                      <p>
                        <b>Recommendation:</b> {f.recommendation}
                      </p>
                    </div>
                  ))}
                  <p>
                    Immutable published evidence; later absence does not
                    establish repair.
                  </p>
                </>
              ) : (
                <>
                  <p>{selected.row.summary}</p>
                  <p>
                    Current recorded status: {selected.row.status}. This is not
                    a repair-completion or dispatch record.
                  </p>
                </>
              )}
            </section>
          )}
        </>
      )}
      {message && (
        <p role="status" className="field-state">
          {message}
        </p>
      )}
      <details className="field-development">
        <summary>Development-only examples & states</summary>
        <p>
          Explicitly prepare existing synthetic maintenance reports plus one
          assigned follow-up draft. No new scheduling store or actual
          assignment/dispatch. One preparation attempt per company and session.
        </p>
        <div>
          <button
            onClick={() => void examples()}
            disabled={!available || attempted || preparing}
          >
            {preparing
              ? 'Preparing examples…'
              : prepared
                ? 'Synthetic examples prepared'
                : 'Prepare synthetic follow-up example'}
          </button>
          <button
            className="secondary"
            onClick={() => {
              setSimulatedError(true);
              setSelected(null);
            }}
            disabled={!available || preparing}
          >
            Simulate schedule error
          </button>
        </div>
      </details>
    </>
  );
}
