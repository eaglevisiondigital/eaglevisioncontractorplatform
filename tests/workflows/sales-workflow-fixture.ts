import { Operations } from '../../src/lib/operations';
import { Phase3Repository } from '../../src/lib/phase3';
import { sampleCompanies } from '../../src/domain/platform';
import { industryEstimate } from '../../src/domain/estimating/fixtures';
import { ReleasePreview } from '../../src/domain/release/preview';
import type { Decision } from '../../src/domain/release/types';
import type { SalesWorkflowTarget } from '../../src/lib/workflows/sales-workflow';
/** Actual existing synthetic intake, CRM, versioning and preference engines. */
export async function salesWorkflowFixture(
  index = 0,
  choice: Decision['decision'] | null = 'accepted',
) {
  const company = sampleCompanies[index],
    operations = new Operations(true),
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  await operations.sampleSubmit(company.slug, {
    name: 'Workflow Example',
    email: 'workflow@example.test',
    phone: '555-0199',
    address: '600 Exact Source Avenue',
    city: 'Example',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
    property_type: 'residential',
    service_category: 'Existing-property repair',
    description: 'Document and review the exact entryway work requested.',
    preferred_appointment: 'Staff review required',
    contact_preference: 'email',
    email_consent: true,
    sms_consent: false,
    consent_version: 'contact-v1',
  });
  const lead = (await operations.listIntake(company.id)).rows[0];
  if (!lead.service_location_id || !lead.customer_id)
    throw Error('Actual lead property required');
  const customer = await operations.getCustomer(company.id, lead.customer_id);
  const input = industryEstimate(company, customer.id);
  input.location_id = lead.service_location_id;
  input.expires_on = '2099-12-31';
  input.tax_policy_id = (await repo.taxes(company.id))[0].id;
  input.internal_notes = 'PRIVATE workforce supplier payroll margin';
  input.lines[0].internal_note = 'PRIVATE unit costs';
  const issued = await repo.issue(
    company.id,
    await repo.create(company, input),
  );
  const release = new ReleasePreview(company.id, issued.version);
  await release.command('staff', 'publish_offer', {
    version_id: issued.version.id,
  });
  const offer = release.read('staff').release_offers[0];
  if (choice)
    await release.command('customer', 'decide_offer', {
      offer_id: offer.id,
      decision: choice,
      note: 'PRIVATE original response',
      consent: true,
    });
  const receipt = release.read('staff').release_decisions[0];
  const target: SalesWorkflowTarget = {
    organization_id: company.id,
    actor_id: company.id + '-owner',
    customer_id: customer.id,
    location_id: lead.service_location_id,
    estimate_id: issued.estimate.id,
    version_id: issued.version.id,
    offer_id: offer.id,
    receipt_id: receipt?.id ?? null,
    intake_request_id: lead.id,
  };
  return {
    company,
    operations,
    repo,
    lead,
    customer,
    issued,
    release,
    target,
    gate: { enabled: true, confirmed: true },
  };
}
