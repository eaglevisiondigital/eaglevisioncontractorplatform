import { Operations } from '../../src/lib/operations';
import { Phase3Repository } from '../../src/lib/phase3';
import { sampleCompanies } from '../../src/domain/platform';
import {
  blankEstimate,
  blankLine,
} from '../../src/domain/estimating/calculation';
import { ReleasePreview } from '../../src/domain/release/preview';
import type { Decision } from '../../src/domain/release/types';
import type { SalesHandoffTarget } from '../../src/lib/sales-approval-handoff';

/** Explicit test composition of actual engines, not product state or a new decision ledger. */
export async function salesHandoffFixture(
  index = 0,
  choice: Decision['decision'] | null = 'accepted',
) {
  const company = sampleCompanies[index],
    operations = new Operations(true),
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  const customer = (await operations.listCustomers(company.id)).rows[0];
  await operations.saveLocation(company.id, customer.id, {
    address_line1: '200 Synthetic Avenue — exact property',
    address_line2: null,
    city: 'Example',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
  });
  const location = (
    await operations.listLocations(company.id, customer.id)
  ).find((l) => l.address_line1 === '200 Synthetic Avenue — exact property')!;
  const input = blankEstimate(customer.id);
  input.location_id = location.id;
  input.project.name = 'Reviewed entryway work';
  input.project.description = 'Preserve the exact issued entryway scope.';
  input.expires_on = '2030-01-01';
  input.terms =
    'Estimate proposal terms only. Contract terms require a separate review.';
  input.customer_notes =
    '<img src=x onerror=alert(1)> Customer-visible estimate note';
  input.internal_notes = 'PRIVATE estimating detail';
  input.tax_policy_id = (await repo.taxes(company.id))[0].id;
  input.lines = [
    {
      ...blankLine(),
      description: 'Entryway scope',
      quantity_milli: 2000,
      unit_price_minor: 15000,
      unit_cost_minor: 5000,
      internal_note: 'PRIVATE supplier cost',
    },
  ];
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
      note: 'PRIVATE response note is not needed for this view',
      consent: true,
    });
  const receipt = release.read('staff').release_decisions[0];
  const target: SalesHandoffTarget = {
    organization_id: company.id,
    actor_id: company.id + '-estimator',
    estimate_id: issued.estimate.id,
    version_id: issued.version.id,
    customer_id: customer.id,
    location_id: location.id,
    offer_id: offer.id,
    receipt_id: receipt?.id ?? null,
  };
  return {
    company,
    operations,
    repo,
    customer,
    location,
    issued,
    release,
    offer,
    receipt,
    target,
  };
}
