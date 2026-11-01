import { useCallback } from 'react';
import type { Operations } from '../lib/operations';
import type { CompanyProfile } from '../domain/platform';
import { Customers } from './Customers';
import { CompanySettings } from './CompanySettings';
import { Team } from './Team';
import { IntakeQueue } from './IntakeQueue';
import { ResourceStatus } from './forms';
import { useResource } from './forms-state';
export function CompanyOperations({
  repo,
  company,
  section,
  onSaved,
  onCustomers,
  onIntake,
}: {
  repo: Operations;
  company: CompanyProfile;
  section: string;
  onSaved: () => void;
  onCustomers: () => void;
  onIntake: () => void;
}) {
  const modules = useResource(
    useCallback(() => repo.listModules(company.id), [repo, company.id]),
  );
  const access = useResource(
    useCallback(() => repo.companyAccess(company.id), [repo, company.id]),
  );
  const module = {
    Customers: 'crm',
    Intake: 'intake',
    Team: 'team',
    'Company settings': 'settings',
  }[section];
  if (access.loading || access.error)
    return (
      <article>
        <ResourceStatus {...access} />
      </article>
    );
  const capability = {
    Customers: access.data?.crm,
    Intake: access.data?.intake_read,
    Team: access.data?.team,
    'Company settings': access.data?.settings,
  }[section];
  if (!capability)
    return (
      <article>
        <h2>Access restricted</h2>
        <p>Your company role does not grant access to this module.</p>
      </article>
    );
  if (modules.loading || modules.error)
    return (
      <article>
        <ResourceStatus {...modules} />
      </article>
    );
  if (!modules.data?.some((m) => m.module === module && m.enabled))
    return (
      <article>
        <h2>Module unavailable</h2>
        <p>
          This module is disabled for the selected organization. Ask Eagle
          Vision to review the company configuration.
        </p>
      </article>
    );
  return section === 'Customers' ? (
    <Customers repo={repo} org={company.id} />
  ) : section === 'Intake' ? (
    <IntakeQueue
      repo={repo}
      org={company.id}
      canManage={access.data?.intake_manage ?? false}
      onReviewCustomer={access.data?.crm ? onCustomers : undefined}
      onTest={access.data?.intake_manage ? onIntake : undefined}
    />
  ) : section === 'Team' ? (
    <Team repo={repo} org={company.id} />
  ) : (
    <CompanySettings repo={repo} company={company} onSaved={onSaved} />
  );
}
export function NewLeadDashboard({
  repo,
  org,
  onOpen,
}: {
  repo: Operations;
  org: string;
  onOpen: () => void;
}) {
  const leads = useResource(
    useCallback(() => repo.listIntake(org, 'new'), [repo, org]),
  );
  return (
    <article className="lead-dashboard">
      <div className="section-title">
        <div>
          <span className="eyebrow">NEW LEADS</span>
          <h2>Your request review queue</h2>
        </div>
        <button onClick={onOpen}>Review intake</button>
      </div>
      <ResourceStatus {...leads} />
      {leads.data && (
        <>
          <p>{leads.data.count} new requests await review.</p>
          <div className="record-list">
            {leads.data.rows.slice(0, 3).map((r) => (
              <div key={r.id}>
                <strong>{r.service_category}</strong>
                <p>{r.summary}</p>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="muted">
        In-app notifications only. External messaging is disabled.
      </p>
    </article>
  );
}
