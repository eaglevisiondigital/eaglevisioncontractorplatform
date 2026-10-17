import { useCallback } from 'react';
import { phase3Repository } from '../../lib/phase3';
import type { Operations } from '../../lib/operations';
import type { CompanyProfile } from '../../domain/platform';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';
import { Estimates } from './Estimates';
import { Catalog } from './Catalog';
import { Jobs } from './Jobs';
import { Workforce } from './Workforce';
export function Phase3Workspace({
  operations,
  company,
  section,
}: {
  operations: Operations;
  company: CompanyProfile;
  section: string;
}) {
  const repo = phase3Repository(operations);
  const ready = useResource(
    useCallback(async () => {
      const access = await operations.companyAccess(company.id);
      const modules = await operations.listModules(company.id);
      if (!modules.some((m) => m.module === 'estimates' && m.enabled))
        throw new Error('Estimating operations are disabled for this company.');
      await repo.initialize(company);
      return { access, repo, companyId: company.id };
    }, [operations, repo, company]),
  );
  if (
    ready.loading ||
    ready.error ||
    !ready.data ||
    ready.data.repo !== repo ||
    ready.data.companyId !== company.id
  )
    return (
      <article>
        <ResourceStatus {...ready} />
      </article>
    );
  const access = ready.data.access;
  if (section === 'Workforce')
    return <Workforce repo={repo} org={company.id} />;
  if (section === 'Jobs')
    return (
      <Jobs
        repo={repo}
        operations={operations}
        company={company}
        canManage={access.estimates}
        admin={access.settings}
      />
    );
  if (!access.estimates)
    return (
      <article>
        <h2>Access restricted</h2>
        <p>Your role does not grant estimating access.</p>
      </article>
    );
  return section === 'Catalog' ? (
    <Catalog repo={repo} org={company.id} admin={access.settings} />
  ) : (
    <Estimates repo={repo} company={company} canIssue={access.settings} />
  );
}
