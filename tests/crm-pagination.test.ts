import { expect, it } from 'vitest';
import { Operations } from '../src/lib/operations';
import { Phase3Repository } from '../src/lib/phase3';
import { sampleCompanies } from '../src/domain/platform';
import { blankEstimate, blankLine } from '../src/domain/estimating/calculation';
import { PropertyRepository } from '../src/lib/property';
import { CustomerChangeWorkspace } from '../src/lib/customer-change-workspace';

it.each([0, 1, 2])(
  'creates a draft for a CRM customer beyond the first ten in company %i',
  async (index) => {
    const company = sampleCompanies[index],
      operations = new Operations(true),
      repository = new Phase3Repository(operations);
    await repository.initialize(company);
    const target = (await operations.listCustomers(company.id)).rows[0];
    for (let i = 0; i < 12; i++)
      await operations.saveCustomer(company.id, {
        display_name: `Later customer ${i}`,
        email: null,
        phone: null,
        customer_type: 'residential',
        preferred_contact: 'email',
      });
    expect(
      (await operations.listCustomers(company.id)).rows.some(
        (c) => c.id === target.id,
      ),
    ).toBe(false);
    const payload = blankEstimate(target.id);
    payload.lines = [
      {
        ...blankLine(),
        description: 'Synthetic scope',
        unit_price_minor: 1000,
      },
    ];
    const draft = await repository.create(company, payload);
    expect(draft.version.customer_snapshot.id).toBe(target.id);
  },
);

it.each([0, 1, 2])(
  'pages and searches existing properties without losing exact customer/tenant identity in company %i',
  async (index) => {
    const company = sampleCompanies[index],
      operations = new Operations(true),
      repository = new Phase3Repository(operations);
    await repository.initialize(company);
    const customer = (await operations.listCustomers(company.id)).rows[0];
    for (let i = 0; i < 13; i++)
      await operations.saveLocation(company.id, customer.id, {
        address_line1: `Property ${String(i).padStart(2, '0')}`,
        address_line2: null,
        city: 'Example',
        region: 'IL',
        postal_code: '00000',
        country_code: 'US',
      });
    const first = await operations.listLocationPage(company.id, customer.id),
      later = await operations.listLocationPage(company.id, customer.id, '', 1);
    expect(first.count).toBe(13);
    expect(first.rows).toHaveLength(10);
    expect(later.rows).toHaveLength(3);
    expect(new Set([...first.rows, ...later.rows].map((l) => l.id)).size).toBe(
      13,
    );
    expect(
      (
        await operations.listLocationPage(
          company.id,
          customer.id,
          'Property 12',
        )
      ).rows.map((l) => l.id),
    ).toEqual([later.rows[2].id]);
    expect(
      (await operations.listLocationPage(company.id, customer.id, 'missing'))
        .count,
    ).toBe(0);
    const payload = blankEstimate(customer.id);
    payload.location_id = later.rows[2].id;
    const draft = await repository.create(company, payload);
    expect(draft.version.location_snapshot?.id).toBe(later.rows[2].id);
    const safe = (
      await import('../src/domain/estimating/customer-preview')
    ).customerPreview(draft.version);
    expect(safe.location?.address_line1).toBe('Property 12');
    expect(JSON.stringify(safe)).not.toMatch(
      /organization_id|customer_id|unit_cost_minor|internal_notes/,
    );
  },
);

it('denies foreign/missing customer/property and inactive CRM context without creating a draft', async () => {
  const operations = new Operations(true),
    repo = new Phase3Repository(operations),
    [company, foreign] = sampleCompanies;
  await repo.initialize(company);
  await repo.initialize(foreign);
  const customer = (await operations.listCustomers(company.id)).rows[0],
    other = (await operations.listCustomers(foreign.id)).rows[0];
  await operations.saveLocation(foreign.id, other.id, {
    address_line1: 'Foreign',
    address_line2: null,
    city: 'Example',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
  });
  const property = (await operations.listLocations(foreign.id, other.id))[0],
    before = await repo.list(company.id);
  await expect(operations.getCustomer(company.id, other.id)).rejects.toThrow();
  await expect(
    operations.getLocation(company.id, customer.id, property.id),
  ).rejects.toThrow();
  for (const patch of [
    { customer_id: other.id },
    { customer_id: crypto.randomUUID() },
    { location_id: property.id },
    { location_id: crypto.randomUUID() },
  ]) {
    await expect(
      repo.create(company, { ...blankEstimate(customer.id), ...patch }),
    ).rejects.toThrow();
  }
  const another = await operations.saveCustomer(company.id, {
    display_name: 'Another',
    email: null,
    phone: null,
    customer_type: 'residential',
    preferred_contact: 'email',
  });
  await operations.saveLocation(company.id, another.id, {
    address_line1: 'Wrong customer',
    address_line2: null,
    city: 'Example',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
  });
  const wrong = (await operations.listLocations(company.id, another.id))[0];
  await expect(
    repo.create(company, {
      ...blankEstimate(customer.id),
      location_id: wrong.id,
    }),
  ).rejects.toThrow();
  await operations.configure(company.id, 'suspended', 'example', {});
  await expect(
    operations.getCustomer(company.id, customer.id),
  ).rejects.toThrow();
  await expect(
    repo.create(company, blankEstimate(customer.id)),
  ).rejects.toThrow();
  expect(await repo.list(company.id)).toEqual(before);
});

it.each([-1, 0.5, NaN, Infinity, 100001])(
  'rejects invalid CRM page %s',
  async (page) => {
    const operations = new Operations(true),
      customer = (await operations.listCustomers(sampleCompanies[0].id))
        .rows[0];
    await expect(
      operations.listCustomers(sampleCompanies[0].id, '', '', page),
    ).rejects.toThrow();
    await expect(
      operations.listLocationPage(sampleCompanies[0].id, customer.id, '', page),
    ).rejects.toThrow();
  },
);

it('refreshes saved CRM snapshots without changing issued originals, and preserves CAS across delayed CRM reads', async () => {
  const operations = new Operations(true),
    company = sampleCompanies[0],
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  const customer = (await operations.listCustomers(company.id)).rows[0],
    payload = blankEstimate(customer.id);
  payload.tax_policy_id = (await repo.taxes(company.id))[0].id;
  payload.expires_on = '2030-01-01';
  const draft = await repo.create(company, payload),
    issued = await repo.issue(company.id, draft),
    original = structuredClone(issued.version);
  const revision = await repo.revise(company.id, issued);
  const another = await operations.saveCustomer(company.id, {
    display_name: 'Changed customer',
    email: null,
    phone: null,
    customer_type: 'commercial',
    preferred_contact: 'email',
  });
  const saved = await repo.save(company.id, revision, {
    ...revision.version.payload,
    customer_id: another.id,
  });
  expect(saved.version.customer_snapshot.id).toBe(another.id);
  expect(saved.estimate.customer_id).toBe(another.id);
  expect(
    (await repo.get(company.id, issued.estimate.id, issued.version.id)).version,
  ).toEqual(original);
  const baseRead = operations.estimateCrm.bind(operations);
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  let started!: () => void;
  const entered = new Promise<void>((r) => {
    started = r;
  });
  operations.estimateCrm = async (...args) => {
    const value = await baseRead(...args);
    started();
    await wait;
    return value;
  };
  const pending = repo.save(company.id, saved, saved.version.payload);
  await entered;
  operations.estimateCrm = baseRead;
  const winner = await repo.save(company.id, saved, {
    ...saved.version.payload,
    customer_notes: 'Independent current save',
  });
  release();
  await expect(pending).rejects.toThrow('reload');
  expect((await repo.get(company.id, winner.estimate.id)).version).toEqual(
    winner.version,
  );
});

it('rechecks suspended context after delayed CRM read and snapshots input before awaiting', async () => {
  const operations = new Operations(true),
    company = sampleCompanies[0],
    repo = new Phase3Repository(operations);
  await repo.initialize(company);
  const customer = (await operations.listCustomers(company.id)).rows[0],
    payload = blankEstimate(customer.id),
    before = await repo.list(company.id);
  const baseRead = operations.estimateCrm.bind(operations);
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  let started!: () => void;
  const entered = new Promise<void>((r) => {
    started = r;
  });
  operations.estimateCrm = async (...args) => {
    const result = await baseRead(...args);
    started();
    await wait;
    return result;
  };
  const pending = repo.create(company, payload);
  await entered;
  payload.customer_id = crypto.randomUUID();
  await operations.configure(company.id, 'suspended', 'example', {});
  release();
  await expect(pending).rejects.toThrow();
  expect(await repo.list(company.id)).toEqual(before);
});

it('bounds search text, clones exact reads and honors disabled CRM without inventing property-active flags', async () => {
  const operations = new Operations(true),
    company = sampleCompanies[0],
    customer = (await operations.listCustomers(company.id)).rows[0];
  await expect(
    operations.listCustomers(company.id, 'x'.repeat(101)),
  ).rejects.toThrow();
  await expect(
    operations.listLocationPage(company.id, customer.id, 'x'.repeat(101)),
  ).rejects.toThrow();
  const copy = await operations.getCustomer(company.id, customer.id);
  copy.display_name = 'Caller mutation';
  expect(
    (await operations.getCustomer(company.id, customer.id)).display_name,
  ).toBe(customer.display_name);
  await operations.configure(company.id, 'active', 'example', { crm: false });
  await expect(
    operations.getCustomer(company.id, customer.id),
  ).rejects.toThrow();
  await expect(
    operations.listLocationPage(company.id, customer.id),
  ).rejects.toThrow();
});

it('rechecks current estimating membership after the new CRM await without saving a customer-origin draft', async () => {
  const operations = new Operations(true),
    property = new PropertyRepository(operations),
    workspace = new CustomerChangeWorkspace(property),
    company = sampleCompanies[0],
    org = company.id,
    actor = `${org}-field`,
    model = workspace.customer(company);
  await model.login();
  await model.prepareHistory();
  await model.prepare();
  const receipt = await model.respond(
    model.read().reviews[1].version_id,
    'changes_requested',
    true,
    'Review the actual issued scope',
  );
  await operations.manageMember(org, actor, true, 'staff', 'estimator');
  const review = await workspace.review(org, actor, receipt.id),
    draft = await workspace.prepare(review, true),
    before = await property.estimates.get(org, draft.estimate.id),
    baseRead = operations.estimateCrm.bind(operations);
  let release!: () => void, started!: () => void;
  const wait = new Promise<void>((resolve) => {
      release = resolve;
    }),
    entered = new Promise<void>((resolve) => {
      started = resolve;
    });
  operations.estimateCrm = async (...args) => {
    const value = await baseRead(...args);
    started();
    await wait;
    return value;
  };
  const pending = property.estimates.save(org, draft, {
    ...draft.version.payload,
    customer_notes: 'Must not commit after membership revocation',
  });
  await entered;
  await operations.manageMember(org, actor, false, 'staff', 'estimator');
  release();
  await expect(pending).rejects.toThrow('staff');
  expect(await property.estimates.get(org, draft.estimate.id)).toEqual(before);
  expect(
    (await property.estimates.history(org, draft.estimate.id)).length,
  ).toBe(3);
});

it('rejects wrong customer/property and tenant on save without replacing current saved snapshots', async () => {
  const operations = new Operations(true),
    repo = new Phase3Repository(operations),
    [company, foreign] = sampleCompanies;
  await repo.initialize(company);
  await repo.initialize(foreign);
  const customer = (await operations.listCustomers(company.id)).rows[0],
    other = (await operations.listCustomers(foreign.id)).rows[0],
    draft = await repo.create(company, blankEstimate(customer.id));
  await operations.saveLocation(foreign.id, other.id, {
    address_line1: 'Foreign source property',
    address_line2: null,
    city: 'Example',
    region: 'IL',
    postal_code: '00000',
    country_code: 'US',
  });
  const location = (await operations.listLocationPage(foreign.id, other.id))
    .rows[0];
  for (const patch of [
    { customer_id: other.id },
    { customer_id: crypto.randomUUID() },
    { location_id: location.id },
    { location_id: crypto.randomUUID() },
  ])
    await expect(
      repo.save(company.id, draft, {
        ...draft.version.payload,
        ...patch,
      }),
    ).rejects.toThrow();
  await expect(
    repo.save(foreign.id, draft, draft.version.payload),
  ).rejects.toThrow();
  expect(await repo.get(company.id, draft.estimate.id)).toEqual(draft);
});
