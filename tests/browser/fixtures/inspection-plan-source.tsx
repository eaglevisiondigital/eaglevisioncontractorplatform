import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { Operations } from '../../../src/lib/operations';
import { propertyRepository } from '../../../src/lib/property';
import { sampleCompanies } from '../../../src/domain/platform';
import { industryEstimate } from '../../../src/domain/estimating/fixtures';
import { PropertyWorkspace } from '../../../src/components/property/PropertyWorkspace';
import '../../../src/styles.css';

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
)
  void (async () => {
    const company = sampleCompanies[0],
      operations = new Operations(true),
      repo = propertyRepository(operations);
    await repo.initialize(company);
    const first = repo.read(company.id).contexts[0];
    await operations.saveLocation(company.id, first.customer_id, {
      address_line1: '200 Fictional Second Property',
      address_line2: '',
      city: 'Example',
      region: 'TX',
      postal_code: '00000',
      country_code: 'US',
    });
    const input = industryEstimate(company, first.customer_id);
    input.location_id = first.location_id;
    input.expires_on = '2099-12-31';
    input.tax_policy_id = (await repo.estimates.taxes(company.id))[0].id;
    const issued = await repo.estimates.issue(
        company.id,
        await repo.estimates.create(company, input),
      ),
      jobId = await repo.estimates.approveJob(company.id, issued);
    await repo.refreshContexts(company.id);
    const contexts = repo.read(company.id).contexts,
      valid = contexts.findIndex(
        (c) => c.job_id === jobId && c.location_id === first.location_id,
      ),
      wrong = contexts.findIndex(
        (c) => c.job_id === jobId && c.location_id !== first.location_id,
      );
    const original = repo.createPlan.bind(repo),
      originalAccess = operations.companyAccess.bind(operations);
    let writes = 0,
      revoked = false;
    repo.createPlan = (...args) => {
      writes++;
      return original(...args);
    };
    operations.companyAccess = async (...args) => ({
      ...(await originalAccess(...args)),
      ...(revoked ? { crm: false, estimates: false } : {}),
    });
    function Harness() {
      const [evidence, setEvidence] = useState('No fixture evidence inspected');
      return (
        <main>
          <h1>Inspection plan source regression fixture</h1>
          <p>
            Fictional local records only. No dispatch, hosted authorization or
            operational plan.
          </p>
          <output data-testid="valid-context">{valid}</output>
          <output data-testid="wrong-context">{wrong}</output>
          <button
            onClick={() => {
              revoked = true;
              setEvidence('Fixture planning authority revoked');
            }}
          >
            Revoke fixture planning access
          </button>
          <button
            onClick={() => {
              const plan = repo.read(company.id).plans.at(-1)!;
              setEvidence(
                `Plan writes: ${writes}; exact target: ${plan.customer_id === first.customer_id && plan.location_id === first.location_id && plan.job_id === jobId}`,
              );
            }}
          >
            Inspect fixture plan evidence
          </button>
          <p role="status">{evidence}</p>
          <PropertyWorkspace
            operations={operations}
            company={company}
            section="Property operations"
          />
        </main>
      );
    }
    createRoot(document.getElementById('root')!).render(<Harness />);
  })();
