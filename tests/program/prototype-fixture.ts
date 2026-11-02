import { Operations } from '../../src/lib/operations';
import { Phase3Repository } from '../../src/lib/phase3';
import {
  sampleCompanies,
  type CompanyProfile,
} from '../../src/domain/platform';
import { industryEstimate } from '../../src/domain/estimating/fixtures';
import type { PrototypeTarget } from '../../src/lib/program/prototype-source';
/** Explicit disposable existing-engine fixture; no app route or connected factory. */
export async function prototypeFixture(
  company: CompanyProfile = sampleCompanies[0],
  job = false,
) {
  const ops = new Operations(true);
  const repo = new Phase3Repository(ops);
  await repo.initialize(company);
  const customer = (await ops.listCustomers(company.id, '', '', 0)).rows[0];
  await ops.saveLocation(company.id, customer.id, {
    address_line1: '100 Synthetic Prototype Lane',
    address_line2: '',
    city: 'Example',
    region: 'TX',
    postal_code: '00000',
    country_code: 'US',
  });
  const location = (await ops.listLocations(company.id, customer.id))[0];
  const input = industryEstimate(company, customer.id);
  input.location_id = location.id;
  input.expires_on = '2099-12-31';
  input.tax_policy_id = (await repo.taxes(company.id))[0].id;
  input.internal_notes = 'PRIVATE staff supplier payroll contact';
  input.lines[0].internal_note = 'PRIVATE unit margin';
  let bundle = await repo.create(company, input);
  let jobId: string | null = null;
  if (job) {
    bundle = await repo.issue(company.id, bundle);
    jobId = await repo.approveJob(company.id, bundle);
  }
  const target: PrototypeTarget = {
    organization_id: company.id,
    actor_id: `${company.id}-owner`,
    customer_id: customer.id,
    location_id: location.id,
    estimate_id: bundle.estimate.id,
    version_id: bundle.version.id,
    job_id: jobId,
  };
  return {
    company,
    ops,
    repo,
    bundle,
    target,
    gate: { enabled: true, confirmed: true },
  };
}
