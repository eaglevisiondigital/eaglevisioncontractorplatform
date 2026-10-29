import { BackOfficeText } from './back-office-copy';
import { useState, useCallback, type CSSProperties } from 'react';
import { sampleCompanies } from '../../domain/platform';
import { Operations } from '../../lib/operations';
import { propertyRepository } from '../../lib/property';
import { prepareMaintenanceExamples } from '../../lib/maintenance-examples';
import { useResource } from '../forms-state';
import { PlatformBrand } from '../PlatformBrand';
import { PropertyWorkspace } from './PropertyWorkspace';
import { BackOfficeConcept } from './back-office-presentation';
import './contractor-back-office-design.css';

export function ContractorBackOfficeDesign() {
  // Separate instances of the existing repositories, never connected or shared
  // with the original /preview workspace. Switching brands retains their own state.
  const [operations] = useState(() => new Operations(true));
  const [companyId, setCompanyId] = useState(sampleCompanies[0].id);
  const company = sampleCompanies.find((c) => c.id === companyId)!;
  const resource = useResource(
    useCallback(async () => {
      const repo = propertyRepository(operations);
      await repo.initialize(company);
      await prepareMaintenanceExamples(repo, company.id, company.id + '-owner');
      return company.id;
    }, [operations, company]),
  );
  const ready =
    !resource.loading && !resource.error && resource.data === company.id;
  return (
    <BackOfficeConcept.Provider value={true}>
      <div
        className="backoffice-concept"
        style={
          {
            '--company-color': company.primary_color,
            '--company-accent': company.accent_color,
          } as CSSProperties
        }
      >
        <a className="skip" href="#contractor-concept-main">
          <BackOfficeText text="Skip to workspace" />
        </a>
        <aside
          className="concept-rail"
          aria-label="Contractor workspace context"
        >
          <span className="concept-wordmark">YOUR BUSINESS. IN VIEW.</span>
          <strong className="concept-company-name">{company.name}</strong>
          <label className="concept-company-control">
            <BackOfficeText text="Company context" />
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {sampleCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="concept-rail-label">
            <BackOfficeText text="OPERATIONS DESK" />
          </div>
          <a
            className="concept-current-area"
            href="#contractor-concept-main"
            aria-current="page"
          >
            <span aria-hidden="true">▦</span>
            <BackOfficeText text=" Property operations" />
          </a>
          <p className="concept-rail-copy">
            Published evidence.
            <br />
            Deliberate follow-through.
          </p>
          <div className="concept-rail-bottom">
            <a href="/preview">
              <BackOfficeText text="Compare current back office ↗" />
            </a>
            <a href="/preview/property-portal">
              <BackOfficeText text="Approved customer portal ↗" />
            </a>
            <PlatformBrand href="/preview" transparent />
            <small>Propel Contractor Suite by Eagle Vision</small>
          </div>
        </aside>
        <div className="concept-canvas">
          <header className="concept-topbar">
            <span>
              <BackOfficeText text="CONTRACTOR WORKSPACE " />
              <span aria-hidden="true">/</span>
              <BackOfficeText text=" PROPERTY CARE" />
            </span>
            <span className="concept-local-badge">
              <BackOfficeText text="Synthetic · local only" />
            </span>
          </header>
          <main id="contractor-concept-main">
            <div className="concept-page-heading">
              <div>
                <span className="eyebrow">
                  <BackOfficeText text="A CLEAR VIEW OF WHAT NEEDS ATTENTION" />
                </span>
                <h1>Care for every property.</h1>
                <p>
                  From a published finding to a carefully reviewed next step.
                </p>
              </div>
              <span className="concept-phase-label">
                <BackOfficeText text="PHASE A · VISUAL REVIEW" />
              </span>
            </div>
            <p className="concept-review-notice">
              Isolated design concept · current workspace unchanged.
              Session-only examples; no dispatch, issuance or customer
              authority. Release 1.0 not authorized.
            </p>
            {resource.loading ? (
              <p role="status" className="concept-state">
                Preparing isolated synthetic property evidence…
              </p>
            ) : !ready ? (
              <div className="concept-state" role="alert">
                <h2>
                  <BackOfficeText text="Property desk unavailable" />
                </h2>
                <p>
                  Example preparation did not complete. No automatic retry is
                  attempted. Reload this disposable concept to start a new
                  session.
                </p>
              </div>
            ) : (
              <PropertyWorkspace
                key={company.id}
                company={company}
                operations={operations}
                section="Property operations"
              />
            )}
          </main>
          <footer className="concept-footer">
            <BackOfficeText text="PRIVATE CONTRACTOR WORKSPACE" />{' '}
            <span>
              Evidence informs review. Review does not authorize work.
            </span>
          </footer>
        </div>
      </div>
    </BackOfficeConcept.Provider>
  );
}
