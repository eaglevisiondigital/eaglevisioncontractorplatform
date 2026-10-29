import {
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { CompanyProfile } from '../../domain/platform';
import { PlatformBrand } from '../PlatformBrand';
import { BackOfficeText } from './back-office-copy';
import { BackOfficeConcept } from './back-office-presentation';
import './contractor-back-office-design.css';

/** Approved local presentation only. Navigation and data stay with the caller. */
export function ContractorBackOfficeLayout({
  company,
  companies,
  onCompanyChange,
  navigation,
  children,
  integrated = false,
}: {
  company: CompanyProfile;
  companies: CompanyProfile[];
  onCompanyChange(id: string): void;
  navigation?: ReactNode;
  children: ReactNode;
  integrated?: boolean;
}) {
  return (
    <BackOfficeConcept.Provider value={true}>
      <div
        className="backoffice-concept"
        data-integrated={integrated ? 'true' : undefined}
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
              value={company.id}
              onChange={(e) => onCompanyChange(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="concept-rail-label">
            <BackOfficeText text="OPERATIONS DESK" />
          </div>
          {navigation ? (
            <ModuleMenu>{navigation}</ModuleMenu>
          ) : (
            <>
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
            </>
          )}
          <div className="concept-rail-bottom">
            <a href={integrated ? '/preview/contractor-design' : '/preview'}>
              {integrated
                ? 'Approved Design Reference ↗'
                : 'Open Local Back Office ↗'}
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
                {integrated ? 'Local Phase B' : 'Approved Phase A Reference'}
              </span>
            </div>
            <p className="concept-review-notice">
              {integrated
                ? 'Approved local contractor presentation.'
                : 'Isolated approved reference with a separate sample session.'}{' '}
              Session-only synthetic data; no dispatch, issuance or customer
              authority. Release 1.0 not authorized.
            </p>
            {children}
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

function subscribeCompact(change: () => void) {
  const media = window.matchMedia('(max-width: 760px)');
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}
function ModuleMenu({ children }: { children: ReactNode }) {
  const compact = useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia('(max-width: 760px)').matches,
    () => false,
  );
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="concept-module-menu">
      {compact && (
        <button
          className="secondary"
          aria-expanded={expanded}
          aria-controls="contractor-module-navigation"
          onClick={() => setExpanded(!expanded)}
        >
          Workspace Navigation
        </button>
      )}
      <div
        id="contractor-module-navigation"
        hidden={compact && !expanded}
        onClick={(event) => {
          if (
            compact &&
            event.target instanceof Element &&
            event.target.closest('button')
          )
            setExpanded(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
