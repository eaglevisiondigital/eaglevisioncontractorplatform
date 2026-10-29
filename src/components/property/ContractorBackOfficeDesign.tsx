import { BackOfficeText } from './back-office-copy';
import { useState, useCallback } from 'react';
import { sampleCompanies } from '../../domain/platform';
import { Operations } from '../../lib/operations';
import { propertyRepository } from '../../lib/property';
import { prepareMaintenanceExamples } from '../../lib/maintenance-examples';
import { useResource } from '../forms-state';
import { PropertyWorkspace } from './PropertyWorkspace';
import { ContractorBackOfficeLayout } from './ContractorBackOfficeLayout';

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
    <ContractorBackOfficeLayout
      company={company}
      companies={sampleCompanies}
      onCompanyChange={setCompanyId}
    >
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
            attempted. Reload this disposable concept to start a new session.
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
    </ContractorBackOfficeLayout>
  );
}
