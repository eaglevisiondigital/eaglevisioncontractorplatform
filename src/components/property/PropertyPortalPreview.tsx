import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { sampleCompanies, type CompanyProfile } from '../../domain/platform';
import { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import { PropertyReportHistory } from './PropertyReportHistory';
import { CustomerEstimateReview } from './CustomerEstimateReview';
import { PropertyAttentionCenter } from './PropertyAttentionCenter';
import { useResource } from '../forms-state';
import { PlatformBrand } from '../PlatformBrand';

/** Explicit synthetic customer experience. Connected routes never mount this component. */
export function PropertyPortalPreview() {
  const [org, setOrg] = useState(sampleCompanies[0].id);
  const company = sampleCompanies.find((c) => c.id === org)!;
  return (
    <main
      className="property-portal-preview customer-portal"
      style={{ '--company-color': company.primary_color } as CSSProperties}
    >
      <p className="notice">
        SYNTHETIC CUSTOMER REPORT PREVIEW · Sample properties and review
        preferences only. No real login or financial activity.
      </p>
      <details className="preview-controls" open>
        <summary>Local preview controls</summary>
        <label>
          Sample contractor
          <select value={org} onChange={(e) => setOrg(e.target.value)}>
            {sampleCompanies.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Choose a synthetic contractor example. This selector never grants
          connected access.
        </p>
      </details>
      <header className="customer-portal-heading contractor-heading">
        <div>
          <p className="eyebrow">Your contractor</p>
          <strong>{company.name}</strong>
          <p>Property care, clearly documented.</p>
        </div>
      </header>
      <h1>Your property reports</h1>
      <PropertyExperience key={org} company={company} />
      <footer className="portal-footer">
        <PlatformBrand />
        <p>Powered by Propel Contractor Suite by Eagle Vision</p>
        <a href="/preview">Return to sample workspace</a>
      </footer>
    </main>
  );
}
function PropertyExperience({ company }: { company: CompanyProfile }) {
  const [model] = useState(() => new CustomerPortalPreviewModel(company));
  const resource = useResource(
    useCallback(async () => {
      await model.login();
      return model.read();
    }, [model]),
  );
  useEffect(() => () => model.logout(), [model]);
  const [, render] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'reports' | 'estimates' | 'attention'>(
    'reports',
  );
  const [reportId, setReportId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const data =
    resource.data && !resource.loading && !resource.error && !unavailable
      ? model.read()
      : null;
  async function run(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await work();
      render((n) => n + 1);
      setMessage(success);
    } catch {
      setUnavailable(true);
      setMessage(
        'The preview could not complete this operation. Read the current status before attempting another change.',
      );
    } finally {
      setBusy(false);
    }
  }
  function clearSelection() {
    setTab('reports');
    setReportId(null);
    setVersionId(null);
    setMessage('');
  }
  if (resource.loading)
    return <p role="status">Loading your contractor and properties…</p>;
  if (!data)
    return (
      <section aria-label="Property portal unavailable">
        <h2>Your property information is unavailable</h2>
        <p role="alert">
          {message ||
            'We could not load your property reports. No property information is displayed.'}
        </p>
        <button
          onClick={() => {
            setUnavailable(false);
            clearSelection();
            resource.reload();
          }}
        >
          Reload preview status
        </button>
      </section>
    );
  const properties = model.properties();
  const activeReviews = versionId
    ? data.reviews.filter((r) => r.version_id === versionId)
    : data.reviews;
  return (
    <>
      <section aria-label="Your properties" className="portal-properties">
        <h2>Properties with {company.name}</h2>
        <p>Only properties associated with this sample customer are shown.</p>
        <label>
          Your property
          <select
            disabled={busy}
            value={data.context.location_id}
            onChange={(e) => {
              model.selectProperty(e.target.value);
              clearSelection();
              render((n) => n + 1);
            }}
          >
            {properties.map((p) => (
              <option value={p.id} key={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <h3>{data.context.property_label}</h3>
        <div
          className="portal-summary"
          role="group"
          aria-label="Property summary"
        >
          <p>
            <strong>{data.history.length}</strong> published check-ins
          </p>
          <p>
            <strong>
              {data.reviews.filter((r) => r.source_report_id).length}
            </strong>{' '}
            shared repair scopes
          </p>
          <p>
            <strong>{data.responses.filter((r) => r.decision).length}</strong>{' '}
            preview preferences recorded
          </p>
        </div>
      </section>
      <details className="preview-controls" open>
        <summary>Demonstrate preview states</summary>
        <p>
          Examples use existing synthetic CRM, inspection and estimate sources.
          Preferences last for this page session only.
        </p>
        <button
          disabled={busy || data.history.length > 0 || !data.exampleAvailable}
          onClick={() =>
            void run(
              () => model.prepareHistory(),
              'Synthetic weekly and monthly history prepared',
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
              'Issued scope and repair review prepared',
            )
          }
        >
          Prepare synthetic review example
        </button>
        <button
          disabled={busy || !data.exampleAvailable || !data.history.length}
          onClick={() =>
            void run(async () => {
              model.prepareAttentionExamples();
              setTab('attention');
            }, 'Synthetic attention evidence prepared from published inspections.')
          }
        >
          Load synthetic attention examples
        </button>
        <button
          disabled={busy}
          className="secondary"
          onClick={() => {
            setUnavailable(true);
            setMessage(
              'Unable to load your property reports. This is a simulated error.',
            );
          }}
        >
          Simulate loading error
        </button>
      </details>
      <nav className="p3-tabs" aria-label="Customer property views">
        <button
          aria-pressed={tab === 'attention'}
          className={tab === 'attention' ? 'active' : 'secondary'}
          onClick={() => {
            setTab('attention');
            setMessage('');
          }}
        >
          Attention center
        </button>
        <button
          aria-pressed={tab === 'reports'}
          className={tab === 'reports' ? 'active' : 'secondary'}
          onClick={() => {
            setTab('reports');
            setReportId(null);
          }}
        >
          Property reports
        </button>
        <button
          aria-pressed={tab === 'estimates'}
          className={tab === 'estimates' ? 'active' : 'secondary'}
          onClick={() => {
            setTab('estimates');
            setVersionId(null);
          }}
        >
          Estimates & repairs
        </button>
      </nav>
      {tab === 'attention' ? (
        <PropertyAttentionCenter
          key={data.context.location_id}
          attention={model.attention()}
          onReport={(id) => {
            setReportId(id);
            setTab('reports');
            setMessage('Exact source inspection selected.');
          }}
          onReview={(id) => {
            setVersionId(id);
            setTab('estimates');
            setMessage('Linked issued repair scope selected.');
          }}
        />
      ) : tab === 'reports' ? (
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
            onReview={(id) => {
              setVersionId(id);
              setTab('estimates');
              setMessage('Related repair scope selected.');
            }}
          />
          <p className="muted">
            Findings document observed conditions. A recommendation does not
            authorize repair work. Photos and media are not available in this
            preview.
          </p>
        </>
      ) : (
        <>
          {versionId && (
            <button className="secondary" onClick={() => setVersionId(null)}>
              Show all issued estimates
            </button>
          )}
          <CustomerEstimateReview
            key={data.context.location_id}
            data={{ ...data, reviews: activeReviews }}
            busy={busy}
            onRespond={(version, choice, consent) =>
              run(
                () => model.respond(version, choice, consent),
                'Synthetic preference recorded for this exact issued version. No work or financial activity was authorized.',
              )
            }
            onViewReports={(id) => {
              setReportId(id);
              setTab('reports');
              setMessage('Source inspection report selected.');
            }}
          />
        </>
      )}
      {busy && <p role="status">Preparing synthetic records…</p>}
      {message && !busy && <p role="status">{message}</p>}
    </>
  );
}
