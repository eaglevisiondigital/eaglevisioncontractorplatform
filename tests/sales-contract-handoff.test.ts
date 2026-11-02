import { expect, it } from 'vitest';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { sampleCompanies } from '../src/domain/platform';
import { blankEstimate, blankLine } from '../src/domain/estimating/calculation';
import { customerPreview } from '../src/domain/estimating/customer-preview';
import { projectIssuedReview } from '../src/domain/customer/review';
import { documentHash, ReleasePreview } from '../src/domain/release/preview';

async function leadToIssued(index: number) {
  const company = sampleCompanies[index],
    operations = new Operations(true),
    estimates = new Phase3Repository(operations);
  await estimates.initialize(company);
  await operations.sampleSubmit(company.slug, {
    name: 'Casey Synthetic Lead',
    email: 'casey@example.test',
    phone: '555-0188',
    address: '200 Synthetic Avenue',
    city: 'Example',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
    property_type: 'residential',
    service_category: 'Repairs',
    description: 'Review the synthetic entryway maintenance scope.',
    preferred_appointment: 'Weekday mornings',
    contact_preference: 'email',
    email_consent: true,
    sms_consent: false,
    consent_version: 'contact-v1',
  });
  const lead = (await operations.listIntake(company.id)).rows[0],
    customer = (await operations.listCustomers(company.id)).rows.find(
      (c) => c.id === lead.customer_id,
    )!,
    location = (await operations.listLocations(company.id, customer.id))[0],
    input = blankEstimate(customer.id);
  input.location_id = location.id;
  input.project.name = 'Synthetic entryway maintenance';
  input.project.description = lead.summary;
  input.expires_on = '2030-01-01';
  input.tax_policy_id = (await estimates.taxes(company.id))[0].id;
  input.lines = [
    {
      ...blankLine(),
      description: 'Reviewed entryway scope',
      quantity_milli: 2000,
      unit_price_minor: 15000,
      unit_cost_minor: 5000,
      internal_note: 'PRIVATE supplier reference',
    },
  ];
  input.internal_notes = 'PRIVATE estimating notes';
  const draft = await estimates.create(company, input),
    issued = await estimates.issue(company.id, draft);
  return { company, operations, estimates, lead, customer, location, issued };
}

it.each([0, 1, 2])(
  'retains exact CRM and issued scope in an internal contract after source/editor changes for company %i',
  async (index) => {
    const { company, operations, estimates, lead, customer, location, issued } =
      await leadToIssued(index);
    const original = structuredClone(issued.version),
      preview = new ReleasePreview(company.id, issued.version);
    expect(lead.customer_id).toBe(customer.id);
    expect(lead.service_location_id).toBe(location.id);
    await preview.command('staff', 'publish_offer', {
      version_id: issued.version.id,
    });
    const offer = preview.read('staff').release_offers[0];
    expect(offer.version_id).toBe(original.id);
    expect(offer.customer_id).toBe(customer.id);
    expect(offer.snapshot.project.description).toBe(lead.summary);

    // A caller-held source object and later CRM/draft edits must not rewrite a
    // previously published selling scope before the contract is prepared.
    issued.version.company_snapshot.name = 'Changed caller-owned company';
    issued.version.customer_snapshot.display_name =
      'Changed caller-owned customer';
    issued.version.payload.project.name = 'Changed caller-owned project';
    await operations.saveCustomer(
      company.id,
      {
        ...customer,
        display_name: 'Later CRM name',
      },
      customer.id,
    );
    const revision = await estimates.revise(company.id, {
      ...issued,
      version: original,
    });
    const revisedInput = structuredClone(revision.version.payload);
    revisedInput.project.description = 'Later private draft scope';
    revisedInput.lines[0].unit_price_minor = 19000;
    await estimates.save(company.id, revision, revisedInput);
    await preview.command('customer', 'decide_offer', {
      offer_id: offer.id,
      decision: 'accepted',
      note: 'Synthetic internal preference only',
      consent: true,
    });
    await preview.command('staff', 'create_contract', {
      offer_id: offer.id,
      terms: 'Synthetic internal terms. No legal execution is authorized.',
      legal_reference: 'Synthetic legal review only',
    });
    const state = preview.read('staff'),
      contract = state.release_contracts[0];
    expect(contract.offer_id).toBe(offer.id);
    expect(contract.document.scope).toEqual(offer.snapshot);
    expect(contract.document.scope.company.name).toBe(company.name);
    expect(contract.document.scope.customer.id).toBe(customer.id);
    expect(contract.document.scope.customer.display_name).toBe(
      customer.display_name,
    );
    expect(contract.document.scope.project.name).toBe(
      original.payload.project.name,
    );
    expect(contract.document_hash).toBe(await documentHash(contract.document));
    expect(
      (await estimates.get(company.id, original.estimate_id, original.id))
        .version,
    ).toEqual(original);
    expect(
      state.release_messages.every((m) => m.channel === 'internal_sink'),
    ).toBe(true);
    expect(state.release_signatures).toEqual([]);
    expect(state.release_invoices).toEqual([]);
    expect(state.release_authorizations).toEqual([]);
    expect(state.release_payment_events).toEqual([]);
    expect(JSON.stringify(state)).not.toMatch(
      /PRIVATE|unit_cost_minor|internal_notes|profit_margin/,
    );
  },
);

it('allowlists nested selling-scope fields and keeps property snapshots detached', async () => {
  const { issued, location } = await leadToIssued(0),
    version = issued.version;
  version.location_snapshot = {
    id: location.id,
    address_line1: location.address_line1,
    city: location.city,
    region: location.region,
    postal_code: location.postal_code,
    country_code: location.country_code,
  };
  for (const nested of [
    version.company_snapshot,
    version.customer_snapshot,
    version.location_snapshot,
    version.payload.project,
  ])
    Object.assign(nested, {
      private_note: 'PRIVATE unexpected snapshot field',
    });
  const source = structuredClone(version),
    safe = customerPreview(version);
  expect(JSON.stringify(safe)).not.toContain('PRIVATE');
  expect(JSON.stringify(safe)).not.toContain('private_note');
  safe.company.name = 'Consumer edit';
  safe.customer.display_name = 'Consumer edit';
  safe.location!.address_line1 = 'Consumer edit';
  safe.project.description = 'Consumer edit';
  expect(version).toEqual(source);
});

it('keeps issued-only tenant/customer/property/version authorization before safe source handoff', async () => {
  const { company, estimates, customer, location, issued } =
      await leadToIssued(0),
    context = {
      organization_id: company.id,
      company_name: company.name,
      primary_color: company.primary_color,
      customer_id: customer.id,
      location_id: location.id,
      property_label: location.address_line1,
      reports: true,
      version_ids: [issued.version.id],
    };
  expect(projectIssuedReview(issued.version, context).version_id).toBe(
    issued.version.id,
  );
  for (const patch of [
    { organization_id: sampleCompanies[1].id },
    { customer_id: crypto.randomUUID() },
    { location_id: crypto.randomUUID() },
    { version_ids: [crypto.randomUUID()] },
  ])
    expect(() =>
      projectIssuedReview(issued.version, { ...context, ...patch }),
    ).toThrow();
  const revision = await estimates.revise(company.id, issued);
  expect(() =>
    projectIssuedReview(revision.version, {
      ...context,
      version_ids: [revision.version.id],
    }),
  ).toThrow();
  const preview = new ReleasePreview(company.id, revision.version);
  await expect(
    preview.command('staff', 'publish_offer', {
      version_id: revision.version.id,
    }),
  ).rejects.toThrow('issued');
});
