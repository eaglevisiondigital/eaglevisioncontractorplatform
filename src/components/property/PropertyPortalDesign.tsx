import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { sampleCompanies, type CompanyProfile } from '../../domain/platform';
import { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import { PropertyRepository } from '../../lib/property';
import { Operations } from '../../lib/operations';
import { useResource } from '../forms-state';
import { PlatformBrand } from '../PlatformBrand';
import { PropertyReportHistory } from './PropertyReportHistory';
import { PropertyAttentionCenter } from './PropertyAttentionCenter';
import { InspectionComparison } from './InspectionComparison';
import { CustomerEstimateReview } from './CustomerEstimateReview';
import './property-portal-design.css';

type View = 'overview' | 'reports' | 'attention' | 'compare' | 'estimates';
const navigation: { id: View; name: string; icon: IconName }[] = [
  { id: 'overview', name: 'Property overview', icon: 'home' },
  { id: 'reports', name: 'Property reports', icon: 'report' },
  { id: 'attention', name: 'Attention center', icon: 'attention' },
  { id: 'compare', name: 'Compare inspections', icon: 'compare' },
  { id: 'estimates', name: 'Estimates & repairs', icon: 'scope' },
];
type IconName =
  'home' | 'report' | 'attention' | 'compare' | 'scope' | 'arrow' | 'calendar';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
    report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
    attention: 'm12 3 10 18H2zM12 9v5M12 17v1',
    compare: 'M3 5h7v14H3zM14 5h7v14h-7M10 12h4',
    scope: 'M5 5h14v16H5zM9 3h6v4H9zM9 12h6M9 16h6',
    arrow: 'M4 12h15m-6-6 6 6-6 6',
    calendar: 'M4 5h16v16H4zM8 3v5M16 3v5M4 10h16M8 14h2M14 14h2',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function ArchitectureArt() {
  return (
    <svg
      className="concept-architecture"
      viewBox="0 0 420 280"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="concept-grid"
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <path d="M28 0H0v28" stroke="currentColor" strokeOpacity=".09" />
        </pattern>
      </defs>
      <rect width="420" height="280" fill="url(#concept-grid)" />
      <g stroke="currentColor" strokeWidth="1.2">
        <path d="M30 228h360M80 228V121l112-74 116 74v107M58 129 192 39l140 90M194 47v181M80 121h228M102 143h61v55h-61zM216 144h63v84M215 128h64M121 143v55M102 171h61M274 188h1M319 159h50v69M330 159v-29h26v29M40 228v-61M28 185l12-22 12 22M28 197l12-22 12 22" />
        <circle cx="344" cy="65" r="18" strokeOpacity=".4" />
        <path
          d="M57 251h280M80 245v12M308 245v12M192 24v-9"
          strokeOpacity=".4"
        />
      </g>
    </svg>
  );
}
/** Approved synthetic portal and retained Phase A comparison share one presentation.
 * Never mounted on a connected customer route. */
export function PropertyPortalDesign({
  approved = false,
}: {
  approved?: boolean;
}) {
  const [org, setOrg] = useState(sampleCompanies[0].id);
  const company = sampleCompanies.find((c) => c.id === org)!;
  return (
    <main
      className={
        'portal-concept' + (approved ? ' portal-concept--approved' : '')
      }
      style={
        {
          '--company-color': company.primary_color,
          '--company-accent': company.accent_color,
        } as CSSProperties
      }
    >
      <a className="concept-skip" href="#concept-content">
        Skip to property content
      </a>
      <div className="concept-disclosure">
        <span>
          {approved ? 'SYNTHETIC CUSTOMER PORTAL' : 'DESIGN CONCEPT · PHASE A'}
        </span>
        <span>
          Synthetic property data. No real login, work authorization or
          financial activity.
        </span>
      </div>
      <header className="concept-header">
        <div className="concept-contractor">
          <span className="concept-kicker">YOUR CONTRACTOR</span>
          <strong>{company.name}</strong>
        </div>
        <div className="concept-header-context">
          <span className="concept-context-mark" aria-hidden="true">
            <Icon name="home" />
          </span>
          <div>
            <span>Customer property portal</span>
            <small>Your property, clearly documented.</small>
          </div>
        </div>
      </header>
      <ConceptExperience key={org} company={company} onCompany={setOrg} />
      <footer className="concept-footer">
        <div>
          <PlatformBrand transparent={approved} />
          <span>Property clarity, powered by Propel.</span>
        </div>
        <a
          href={
            approved
              ? '/preview/property-portal-design'
              : '/preview/property-portal'
          }
        >
          {approved
            ? 'View Phase A design concept'
            : 'View existing functional preview'}{' '}
          <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}
function ConceptExperience({
  company,
  onCompany,
}: {
  company: CompanyProfile;
  onCompany(id: string): void;
}) {
  // Separate instance prevents concept preparation changing the existing preview's in-memory records.
  const [model] = useState(
    () =>
      new CustomerPortalPreviewModel(
        company,
        new PropertyRepository(new Operations(true)),
      ),
  );
  const resource = useResource(
    useCallback(async () => {
      await model.login();
      await model.prepareHistory();
      await model.prepare();
      model.prepareAttentionExamples();
      model.prepareComparisonExamples();
      return model.read();
    }, [model]),
  );
  useEffect(() => () => model.logout(), [model]);
  const [, render] = useState(0);
  const [view, setView] = useState<View>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [pair, setPair] = useState<[string, string]>(['', '']);
  const data =
    resource.data && !resource.loading && !resource.error && !error
      ? model.read()
      : null;
  function navigate(next: View) {
    setView(next);
    setReportId(null);
    setVersionId(null);
    setMessage('');
  }
  async function run(work: () => Promise<unknown> | unknown, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await work();
      render((n) => n + 1);
      setMessage(success);
    } catch {
      setError(
        'The synthetic example could not be prepared. Reload the preview status before continuing.',
      );
    } finally {
      setBusy(false);
    }
  }
  function openReport(id: string | null) {
    setReportId(id);
    setView('reports');
    setMessage('Exact published source inspection selected.');
  }
  function openReview(id: string) {
    setVersionId(id);
    setView('estimates');
    setMessage('Exact linked issued repair version selected.');
  }
  const title = navigation.find((v) => v.id === view)!.name;
  const activity = data
    ? [...data.history].sort((a, b) =>
        b.snapshot.visited_on.localeCompare(a.snapshot.visited_on),
      )
    : [];
  const attention = data ? model.attention() : null;
  const comparisonExamples =
    data?.history.filter((r) =>
      r.snapshot.summary.startsWith('Synthetic comparison check-in'),
    ) ?? [];
  function compareSources(first: string, second: string) {
    setPair([first, second]);
    setView('compare');
    setMessage(
      'Exact source reports selected. Choose Compare selected inspections to view their evidence.',
    );
  }
  const controls = (
    <details className="concept-developer">
      <summary>
        <span aria-hidden="true">⌘</span> Development-only preview controls{' '}
        <small>Synthetic examples & states</small>
      </summary>
      <div className="concept-developer-body">
        <label>
          Sample contractor
          <select
            value={company.id}
            onChange={(e) => onCompany(e.target.value)}
          >
            {sampleCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          This isolated concept starts with published synthetic examples loaded.
          These controls never grant connected customer access. Preferences last
          only for this page session.
        </p>
        {data && (
          <div className="concept-control-actions">
            <button
              disabled={
                busy || data.history.length > 0 || !data.exampleAvailable
              }
              onClick={() =>
                void run(
                  () => model.prepareHistory(),
                  'Synthetic inspection history prepared.',
                )
              }
            >
              Load synthetic inspection history
            </button>
            <button
              disabled={
                busy ||
                data.reviews.length > 0 ||
                !data.history.length ||
                !data.exampleAvailable
              }
              onClick={() =>
                void run(
                  () => model.prepare(),
                  'Synthetic review example prepared.',
                )
              }
            >
              Prepare synthetic review example
            </button>
            <button
              disabled={busy || !data.exampleAvailable || !data.history.length}
              onClick={() =>
                void run(() => {
                  model.prepareAttentionExamples();
                  navigate('attention');
                }, 'Synthetic attention evidence prepared.')
              }
            >
              Load synthetic attention examples
            </button>
            <button
              disabled={busy || !data.exampleAvailable || !data.history.length}
              onClick={() =>
                void run(() => {
                  model.prepareComparisonExamples();
                  const rows = model
                    .read()
                    .history.filter((r) =>
                      r.snapshot.summary.startsWith(
                        'Synthetic comparison check-in',
                      ),
                    );
                  compareSources(rows[0].id, rows[1].id);
                }, 'Synthetic comparison examples selected.')
              }
            >
              Load synthetic comparison examples
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                setError(
                  'Unable to load your property reports. This is a simulated error.',
                )
              }
            >
              Simulate loading error
            </button>
          </div>
        )}
      </div>
    </details>
  );
  if (resource.loading)
    return (
      <div className="concept-body" id="concept-content" tabIndex={-1}>
        <section
          className="concept-state"
          aria-label="Loading property concept"
        >
          <Icon name="home" />
          <p className="concept-kicker">PROPERTY JOURNAL</p>
          <h1>A clearer view is on its way.</h1>
          <p role="status">
            Loading your contractor and synthetic property records…
          </p>
          <div className="concept-skeleton" aria-hidden="true" />
        </section>
      </div>
    );
  if (!data)
    return (
      <div className="concept-body" id="concept-content" tabIndex={-1}>
        <section
          className="concept-state concept-error"
          aria-label="Property portal unavailable"
        >
          <Icon name="report" />
          <p className="concept-kicker">PROPERTY INFORMATION</p>
          <h1>We couldn’t open your property journal.</h1>
          <p role="alert">
            {error ||
              'Property reports are unavailable. No property information is displayed.'}
          </p>
          <p>
            Your records are not displayed while this preview is unavailable.
          </p>
          <button
            onClick={() => {
              setError('');
              navigate('overview');
              setPair(['', '']);
              resource.reload();
            }}
          >
            Reload preview status <Icon name="arrow" />
          </button>
        </section>
        {controls}
      </div>
    );
  return (
    <div className="concept-body" id="concept-content" tabIndex={-1}>
      <div className="concept-property-bar">
        <p>
          <Icon name="home" />
          <span>YOUR PROPERTY JOURNAL</span>
        </p>
        <label>
          Your property
          <select
            disabled={busy}
            value={data.context.location_id}
            onChange={(e) => {
              model.selectProperty(e.target.value);
              navigate('overview');
              setPair(['', '']);
              render((n) => n + 1);
            }}
          >
            {model.properties().map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="concept-navigation" aria-label="Customer property views">
        {navigation.map((n) => (
          <button
            key={n.id}
            aria-pressed={view === n.id}
            onClick={() => navigate(n.id)}
          >
            <Icon name={n.icon} />
            {n.name}
            {view === n.id && (
              <span className="concept-nav-dot" aria-hidden="true" />
            )}
          </button>
        ))}
      </nav>
      {view === 'overview' ? (
        <>
          <section className="concept-hero" aria-label="Property overview">
            <div className="concept-hero-copy">
              <p className="concept-kicker">WELCOME TO YOUR PROPERTY JOURNAL</p>
              <h1>
                Your property.
                <br />
                <em>Clearly in view.</em>
              </h1>
              <p className="concept-hero-description">
                The details that matter, thoughtfully documented.
                <br className="concept-desktop-break" /> Explore your
                inspections, observations and proposed work.
              </p>
              <div className="concept-property-name">
                <Icon name="home" />
                <div>
                  <span>SELECTED PROPERTY</span>
                  <h2>{data.context.property_label}</h2>
                </div>
              </div>
              <button onClick={() => navigate('reports')}>
                Explore property reports <Icon name="arrow" />
              </button>
            </div>
            <div className="concept-hero-art">
              <ArchitectureArt />
              <div className="concept-art-caption">
                <span>THE PROPERTY JOURNAL</span>
                <small>Observations. Context. Clarity.</small>
              </div>
            </div>
          </section>
          <div
            className="concept-metrics"
            role="group"
            aria-label="Property summary"
          >
            <button onClick={() => navigate('reports')}>
              <span className="concept-metric-icon">
                <Icon name="report" />
              </span>
              <span>
                Published check-ins
                <strong>
                  {data.history.length.toString().padStart(2, '0')}
                </strong>
                <small>
                  Reviewed inspection reports <span aria-hidden="true">↗</span>
                </small>
              </span>
            </button>
            <button onClick={() => navigate('attention')}>
              <span className="concept-metric-icon">
                <Icon name="attention" />
              </span>
              <span>
                Documented concerns
                <strong>
                  {attention!.items.length.toString().padStart(2, '0')}
                </strong>
                <small>
                  Available published evidence <span aria-hidden="true">↗</span>
                </small>
              </span>
            </button>
            <button onClick={() => navigate('estimates')}>
              <span className="concept-metric-icon">
                <Icon name="scope" />
              </span>
              <span>
                Shared repair scopes
                <strong>
                  {data.reviews
                    .filter((r) => r.source_report_id)
                    .length.toString()
                    .padStart(2, '0')}
                </strong>
                <small>
                  Proposed work for your review{' '}
                  <span aria-hidden="true">↗</span>
                </small>
              </span>
            </button>
          </div>
          <div className="concept-overview-grid">
            <section
              className="concept-activity"
              aria-label="Recent inspection activity"
            >
              <div className="concept-section-heading">
                <div>
                  <p className="concept-kicker">YOUR PROPERTY, DOCUMENTED</p>
                  <h2>Recent check-ins</h2>
                </div>
                <button
                  className="concept-text-button"
                  onClick={() => navigate('reports')}
                >
                  All reports <Icon name="arrow" />
                </button>
              </div>
              {activity.length ? (
                <ol>
                  {activity.slice(0, 3).map((r) => (
                    <li key={r.id}>
                      <div className="concept-date">
                        <span>
                          {new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            timeZone: 'UTC',
                          })
                            .format(
                              new Date(r.snapshot.visited_on + 'T00:00:00Z'),
                            )
                            .toUpperCase()}
                        </span>
                        <strong>{r.snapshot.visited_on.slice(8)}</strong>
                      </div>
                      <div>
                        <span className="concept-kicker">
                          {data.cadences[r.id] === 'once'
                            ? 'PROPERTY'
                            : data.cadences[r.id]?.toUpperCase()}{' '}
                          CHECK-IN · {r.snapshot.visited_on.slice(0, 4)}
                        </span>
                        <h3>{r.snapshot.summary}</h3>
                        <p>
                          {r.snapshot.findings.length} published findings ·
                          Version {r.version}
                        </p>
                      </div>
                      <button
                        className="concept-icon-button"
                        aria-label={
                          'View published report ' +
                          r.snapshot.visited_on +
                          ' version ' +
                          r.version
                        }
                        onClick={() => openReport(r.id)}
                      >
                        <Icon name="arrow" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="concept-empty">
                  <Icon name="calendar" />
                  <h3>Your journal starts here.</h3>
                  <p>
                    No published inspections are available for this property
                    yet. Reports will appear here when shared by your
                    contractor.
                  </p>
                </div>
              )}
            </section>
            <section
              className="concept-next"
              aria-label="Property attention overview"
            >
              <span className="concept-metric-icon">
                <Icon name="attention" />
              </span>
              <p className="concept-kicker">A MORE INFORMED PERSPECTIVE</p>
              <h2>
                The observations
                <br />
                behind the overview.
              </h2>
              <p>
                {attention!.items.length
                  ? `${attention!.items.filter((i) => i.recurring).length} possible recurring concerns in the available history. Review their exact sources and what remains uncertain.`
                  : 'No published concerns are available to summarize for this property.'}
              </p>
              <button onClick={() => navigate('attention')}>
                Open Attention Center <Icon name="arrow" />
              </button>
              <p className="concept-evidence-note">
                Inspection evidence does not establish current condition or
                prove a repair was completed.
              </p>
            </section>
          </div>
        </>
      ) : (
        <div className="concept-view">
          <div className="concept-view-heading">
            <p className="concept-kicker">{data.context.property_label}</p>
            <h1>{title}</h1>
            <p>
              Published evidence. Exact sources. A more complete perspective.
            </p>
          </div>
          {view === 'reports' ? (
            <>
              {reportId && (
                <button className="secondary" onClick={() => setReportId(null)}>
                  Show all inspection reports
                </button>
              )}
              <PropertyReportHistory
                key={data.context.location_id + (reportId ?? '')}
                reports={data.history}
                cadences={data.cadences}
                focusedReportId={reportId}
                relatedReviews={data.reviews}
                onReview={openReview}
                onCompare={(id) => compareSources(id, '')}
              />
              <p className="concept-evidence-note">
                Findings document observed conditions. Recommendations do not
                authorize repair work. Photos and media remain unavailable.
              </p>
            </>
          ) : view === 'attention' ? (
            <PropertyAttentionCenter
              key={data.context.location_id}
              attention={attention!}
              onReport={openReport}
              onReview={openReview}
              onCompare={compareSources}
            />
          ) : view === 'compare' ? (
            <InspectionComparison
              key={data.context.location_id + pair.join(':')}
              reports={data.history}
              initialIds={
                pair[0]
                  ? pair
                  : comparisonExamples.length === 2
                    ? [comparisonExamples[0].id, comparisonExamples[1].id]
                    : ['', '']
              }
              compare={(first, second) => {
                setMessage('');
                return model.compareReports(first, second);
              }}
              onReport={openReport}
              onReview={openReview}
            />
          ) : (
            <>
              {versionId && (
                <button
                  className="secondary"
                  onClick={() => setVersionId(null)}
                >
                  Show all issued estimates
                </button>
              )}
              <CustomerEstimateReview
                key={data.context.location_id}
                data={{
                  ...data,
                  reviews: versionId
                    ? data.reviews.filter((r) => r.version_id === versionId)
                    : data.reviews,
                }}
                busy={busy}
                onRespond={(version, choice, consent) =>
                  run(
                    () => model.respond(version, choice, consent),
                    'Synthetic preference recorded for this exact issued version. No work or financial activity authorized.',
                  )
                }
                onViewReports={openReport}
              />
            </>
          )}
        </div>
      )}
      {busy && (
        <p className="concept-feedback" role="status">
          Preparing synthetic records…
        </p>
      )}
      {message && !busy && (
        <p className="concept-feedback" role="status">
          {message}
        </p>
      )}
      {controls}
    </div>
  );
}
