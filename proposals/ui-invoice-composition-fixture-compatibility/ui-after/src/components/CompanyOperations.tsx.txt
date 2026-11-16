import { useCallback, useState } from 'react';
import type { Operations } from '../lib/operations';
import type { CompanyProfile } from '../domain/platform';
import { Customers } from './Customers';
import { CompanySettings } from './CompanySettings';
import { Team } from './Team';
import { IntakeQueue } from './IntakeQueue';
import { Pagination, ResourceStatus } from './forms';
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
  const [selection, setSelection] = useState({ repo, org, page: 0 });
  const sameContext = selection.repo === repo && selection.org === org;
  const page = sameContext ? selection.page : 0;
  if (!sameContext) setSelection({ repo, org, page: 0 });
  const leads = useResource(
    useCallback(async () => {
      const identity = { repo, org, page };
      try {
        const available = async () => {
          const [access, modules] = await Promise.all([
            repo.companyAccess(org),
            repo.listModules(org),
          ]);
          if (!access.intake_read) return 'restricted' as const;
          if (!modules.some((m) => m.module === 'intake' && m.enabled))
            return 'unavailable' as const;
          return 'allowed' as const;
        };
        const access = await available();
        if (access !== 'allowed') return { ...identity, state: access };
        const result = await repo.listIntake(org, 'new', page);
        const currentAccess = await available();
        if (currentAccess !== 'allowed')
          return { ...identity, state: currentAccess };
        return { ...identity, state: 'ready' as const, result };
      } catch (error) {
        return {
          ...identity,
          state: 'error' as const,
          message: error instanceof Error ? error.message : 'Unable to load',
        };
      }
    }, [repo, org, page]),
  );
  const current =
    !leads.loading &&
    leads.data?.repo === repo &&
    leads.data.org === org &&
    leads.data.page === page
      ? leads.data
      : undefined;
  return (
    <article className="lead-dashboard" aria-label="New lead inbox">
      <div className="section-title">
        <div>
          <span className="eyebrow">NEW LEADS</span>
          <h2>Your request review queue</h2>
        </div>
        {current?.state === 'ready' && (
          <button onClick={onOpen}>Review intake</button>
        )}
      </div>
      <ResourceStatus
        loading={!current && !leads.error}
        error={current?.state === 'error' ? current.message : leads.error}
      />
      {current?.state === 'restricted' && (
        <p>Your company role does not grant access to intake.</p>
      )}
      {current?.state === 'unavailable' && (
        <p>Intake is disabled for the selected organization.</p>
      )}
      {current?.state === 'ready' && (
        <>
          <p role="status">{current.result.count} new requests await review.</p>
          <p className="muted">
            New intake requests only. This count does not represent all leads,
            customers, jobs or revenue.
          </p>
          {page > 0 && page * 10 >= current.result.count ? (
            <>
              <p>
                This page is no longer available. Return to the first page to
                review current requests.
              </p>
              <button onClick={() => setSelection({ repo, org, page: 0 })}>
                Return to first page
              </button>
            </>
          ) : (
            <>
              <div className="record-list">
                {current.result.rows.map((r) => (
                  <section className="request-card" key={r.id}>
                    <div className="section-title">
                      <span className="tag">
                        {r.status} · {r.source}
                      </span>
                      <small>
                        Submitted{' '}
                        <time dateTime={r.created_at}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </time>
                      </small>
                    </div>
                    <h3>{r.service_category}</h3>
                    <p>{r.summary}</p>
                  </section>
                ))}
              </div>
              {!current.result.rows.length && (
                <p>No new requests in this view.</p>
              )}
              <Pagination
                page={page}
                count={current.result.count}
                onChange={(next) => setSelection({ repo, org, page: next })}
              />
            </>
          )}
        </>
      )}
      <p className="muted">
        In-app notifications only. External messaging is disabled.
      </p>
    </article>
  );
}
