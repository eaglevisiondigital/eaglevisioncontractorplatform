import { useState, type CSSProperties } from 'react';
import { CustomerPortalPreviewModel } from '../../lib/customer-preview';
import { sampleCompanies } from '../../domain/platform';
import { PropertyReportHistory } from './PropertyReportHistory';
import { PlatformBrand } from '../PlatformBrand';
import { compareCustomerVersions } from '../../domain/customer/review';
import { formatMinor } from '../../domain/estimating/calculation';

/** Explicit local laboratory. Never imported by connected portal/login routes. */
export function CustomerPortalPreview() {
  const [index, setIndex] = useState(0),
    [models] = useState(() =>
      sampleCompanies.map((c) => new CustomerPortalPreviewModel(c)),
    );
  const model = models[index];
  const [signed, setSigned] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [tab, setTab] = useState('reports'),
    [consent, setConsent] = useState(false),
    [revision, setRevision] = useState(0);
  const company = sampleCompanies[index],
    data = signed ? model.read() : null;
  async function task(work: () => Promise<unknown>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setRevision((x) => x + 1);
    } catch {
      setMessage(
        'Customer access unavailable. Review the preview session and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  function clear(state = 'Signed out.') {
    model.logout();
    setSigned(false);
    setMessage(state);
    setConsent(false);
    setTab('reports');
  }
  return (
    <main
      className="property-portal-preview customer-portal"
      style={{ '--company-color': company.primary_color } as CSSProperties}
    >
      <PlatformBrand />
      <p className="notice">
        SYNTHETIC CUSTOMER LOGIN & REVIEW · No hosted authentication, customer
        authorization or financial activity.
      </p>
      <details className="preview-controls">
        <summary>Local review controls</summary>
        <label>
          Synthetic example
          <select
            disabled={busy}
            value={index}
            onChange={(e) => {
              clear('');
              const i = Number(e.target.value);
              setIndex(i);
            }}
          >
            {sampleCompanies.map((c, i) => (
              <option key={c.id} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          This selects a test fixture only. Connected company access must come
          from verified server discovery.
        </p>
        <button
          disabled={!signed || busy}
          onClick={() =>
            clear('Session expired. Sign in again to review your property.')
          }
        >
          Simulate session expiry
        </button>
        <button
          disabled={!signed || busy}
          onClick={() => clear('Customer access unavailable.')}
        >
          Simulate revoked access
        </button>
        <button
          disabled={!signed || busy}
          onClick={() =>
            clear('Unable to load your portal. Please try again later.')
          }
        >
          Simulate loading error
        </button>
      </details>
      <h1>
        {signed
          ? 'Your property, in focus.'
          : 'Welcome to your customer portal'}
      </h1>
      {!signed ? (
        <section aria-label="Customer login preparation">
          <p>
            Review inspection reports and proposed work from your contractor.
          </p>
          <p>
            Use the synthetic account below. Do not enter a real email, password
            or verification code.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                await model.login();
                setSigned(true);
              });
            }}
          >
            <label>
              Account
              <input value="preview@example.test" readOnly autoComplete="off" />
            </label>
            <label>
              Password
              <input
                type="password"
                placeholder="Real sign-in remains disabled"
                disabled
                autoComplete="off"
              />
            </label>
            <button disabled={busy} type="submit">
              Enter synthetic customer preview
            </button>
          </form>
          <p>No public signup, account lookup or invitations are available.</p>
        </section>
      ) : (
        <>
          <header className="customer-portal-heading">
            <div>
              <strong>{company.name}</strong>
              <h2>{data!.context.property_label}</h2>
            </div>
            <button className="secondary" onClick={() => clear()}>
              Sign out of preview
            </button>
          </header>
          <nav className="p3-tabs" aria-label="Customer property views">
            <button
              className={tab === 'reports' ? 'active' : ''}
              onClick={() => setTab('reports')}
            >
              Property reports
            </button>
            <button
              className={tab === 'estimates' ? 'active' : ''}
              onClick={() => setTab('estimates')}
            >
              Estimates & repairs
            </button>
          </nav>
          <button
            disabled={busy || data!.reviews.length > 0}
            onClick={() => void task(() => model.prepare())}
          >
            Prepare synthetic review example
          </button>
          {tab === 'reports' ? (
            <>
              <PropertyReportHistory
                key={`${index}-${revision}`}
                reports={data!.reports.map((r) => ({
                  id: r.id,
                  version: r.version,
                  published_at: r.published_at,
                  snapshot: {
                    summary: r.summary,
                    visited_on: r.visited_on,
                    phase: r.phase,
                    findings: r.findings,
                    checklist: r.checklist,
                    media: [] as never[],
                  },
                }))}
              />
              <button className="secondary" onClick={() => setTab('estimates')}>
                Review related repair estimates
              </button>
            </>
          ) : (
            <section aria-label="Customer estimate review">
              <h2>Proposed work & issued estimates</h2>
              <p>
                Review each immutable version. Synthetic response examples
                cannot authorize work, invoices, agreements or payments.
              </p>
              {!data!.reviews.length && (
                <p>No authorized estimate is available for this property.</p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Confirm this is a synthetic review only
              </label>
              {data!.reviews.map((r) => {
                const response = data!.responses.find(
                  (x) => x.version_id === r.version_id,
                )?.decision;
                return (
                  <article className="finding-card" key={r.version_id}>
                    <span className="badge">
                      Issued estimate · Version {r.version_number}
                    </span>
                    <h3>{r.scope.name}</h3>
                    <p>
                      {r.source_report_id
                        ? 'Repair scope linked to a published inspection finding.'
                        : 'Original issued project scope.'}
                    </p>
                    <p>
                      Review status:{' '}
                      {response === 'accepted'
                        ? 'Approved · synthetic preference'
                        : response === 'declined'
                          ? 'Declined · synthetic preference'
                          : r.review_state === 'expired'
                            ? 'Expired'
                            : 'Awaiting your review'}
                    </p>
                    <p>{r.scope.description}</p>
                    <dl>
                      {r.scope.lines.map((l) => (
                        <div className="customer-scope-line" key={l.id}>
                          <dt>
                            {l.description}
                            <small>
                              {l.quantity_milli / 1000}{' '}
                              {l.unit.replaceAll('_', ' ')}
                            </small>
                          </dt>
                          <dd>
                            {formatMinor(l.amount_minor, r.scope.currency)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      Discount{' '}
                      {formatMinor(r.scope.discount_minor, r.scope.currency)} ·
                      Tax {formatMinor(r.scope.tax_minor, r.scope.currency)}
                    </p>
                    <strong>
                      Total {formatMinor(r.scope.total_minor, r.scope.currency)}
                    </strong>
                    <details>
                      <summary>Customer notes & terms</summary>
                      <p>{r.scope.notes}</p>
                      <p>{r.scope.terms}</p>
                    </details>
                    <div className="p3-actions">
                      <button
                        disabled={
                          busy ||
                          !consent ||
                          !!response ||
                          r.review_state === 'expired'
                        }
                        onClick={() =>
                          void task(() =>
                            model.respond(r.version_id, 'accepted', consent),
                          )
                        }
                      >
                        Preview approve version {r.version_number}
                      </button>
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          !consent ||
                          !!response ||
                          r.review_state === 'expired'
                        }
                        onClick={() =>
                          void task(() =>
                            model.respond(r.version_id, 'declined', consent),
                          )
                        }
                      >
                        Preview decline version {r.version_number}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setTab('reports')}
                      >
                        View inspection reports
                      </button>
                    </div>
                  </article>
                );
              })}
              {data!.reviews.length === 2 && (
                <section aria-label="Immutable estimate comparison">
                  <h3>What changed between versions?</h3>
                  {compareCustomerVersions(
                    data!.reviews[0],
                    data!.reviews[1],
                  ).map((x) => (
                    <p key={x.id}>
                      {x.after?.description ?? x.before?.description}:{' '}
                      {x.before
                        ? formatMinor(
                            x.before.amount_minor,
                            data!.reviews[0].scope.currency,
                          )
                        : 'Not included'}{' '}
                      →{' '}
                      {x.after
                        ? formatMinor(
                            x.after.amount_minor,
                            data!.reviews[1].scope.currency,
                          )
                        : 'Removed'}
                    </p>
                  ))}
                </section>
              )}
            </section>
          )}
        </>
      )}
      {busy && (
        <p role="status">
          Verifying customer access and loading reviewed records…
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <p>
        <a href="/preview/property-portal">Report-only preview</a> ·{' '}
        <a href="/preview">Sample contractor workspace</a>
      </p>
    </main>
  );
}
