import { expect, it } from 'vitest';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { sampleCompanies } from '../src/domain/platform';
import { PropertyRepository } from '../src/lib/property';
import { Operations } from '../src/lib/operations';
it.each([0, 1, 2])(
  'customer preview %i reuses original sources and records only synthetic preferences without financial side effects',
  async (index) => {
    const repo = new PropertyRepository(new Operations(true)),
      company = sampleCompanies[index],
      m = new CustomerPortalPreviewModel(company, repo);
    expect(() => m.read()).toThrow();
    await m.login();
    const before = repo.read(company.id).bundle.version;
    expect(m.read().reviews).toEqual([]);
    await m.prepare();
    const data = m.read();
    expect(data.reviews).toHaveLength(2);
    expect(data.reviews[1].source_report_id).toBe(data.reports[0].id);
    expect(data.reviews[1].scope.lines.at(-1)!.amount_minor).toBe(12500);
    await expect(
      m.respond(data.reviews[0].version_id, 'accepted'),
    ).rejects.toThrow();
    await m.respond(data.reviews[0].version_id, 'accepted', true);
    await m.respond(data.reviews[1].version_id, 'declined', true);
    expect(m.read().responses.map((x) => x.decision)).toEqual([
      'accepted',
      'declined',
    ]);
    const financial = repo.portal(company.id, data.context.customer_id);
    expect(financial.invoices).toEqual([]);
    expect(financial.contracts).toEqual([]);
    expect(
      (await repo.estimates.get(company.id, before.estimate_id, before.id))
        .version,
    ).toEqual(before);
    expect(repo.read(company.id).bundle.version).toEqual(before);
    for (const key of [
      'unit_cost_minor',
      'markup',
      'internal_notes',
      'supplier',
      'payroll',
    ])
      expect(JSON.stringify(m.read().reviews)).not.toContain(key);
    await expect(m.respond(crypto.randomUUID(), 'accepted')).rejects.toThrow();
    m.logout();
    expect(() => m.read()).toThrow();
  },
);
it('preview sign-out invalidates even a pending local login and never creates a connected session', async () => {
  const m = new CustomerPortalPreviewModel(
    sampleCompanies[0],
    new PropertyRepository(new Operations(true)),
  );
  const pending = m.login();
  m.logout();
  await expect(pending).rejects.toThrow('session');
  expect(() => m.read()).toThrow();
});
it('preview rejects any connected repository instead of substituting synthetic access', () => {
  expect(
    () =>
      new CustomerPortalPreviewModel(
        sampleCompanies[0],
        new PropertyRepository(new Operations(false)),
      ),
  ).toThrow('Synthetic');
});

it.each([0, 1, 2])(
  'property journey %i preserves exact customer/property sources and independent preferences',
  async (index) => {
    const repo = new PropertyRepository(new Operations(true));
    const model = new CustomerPortalPreviewModel(sampleCompanies[index], repo);
    await model.login();
    const original = model.read();
    const baseline = repo.read(sampleCompanies[index].id).bundle.version;
    await model.prepareHistory();
    await model.prepareHistory();
    expect(model.read().history).toHaveLength(3);
    expect(Object.values(model.read().cadences).sort()).toEqual([
      'monthly',
      'weekly',
      'weekly',
    ]);
    await model.prepare();
    const prepared = model.read();
    expect(prepared.reviews[1].source_report_id).toBe(prepared.history[0].id);
    expect(prepared.reviews[1].finding_id).toBe(
      prepared.history[0].snapshot.findings[0].id,
    );
    expect(
      prepared.history.every((r) => r.snapshot.findings.length === 1),
    ).toBe(true);
    expect(JSON.stringify(prepared.history)).not.toMatch(
      /INTERNAL|unit_cost_minor|payroll|internal_notes|margin|customer_visible/,
    );
    const properties = model.properties();
    expect(properties).toHaveLength(2);
    const other = properties.find(
      (p) => p.id !== original.context.location_id,
    )!;
    model.selectProperty(other.id);
    expect(model.read().history).toEqual([]);
    expect(model.read().reviews).toEqual([]);
    expect(model.read().responses).toEqual([]);
    await expect(
      model.respond(prepared.reviews[0].version_id, 'accepted', true),
    ).rejects.toThrow();
    await expect(model.prepare()).rejects.toThrow();
    expect(() => model.selectProperty(crypto.randomUUID())).toThrow();
    model.selectProperty(original.context.location_id);
    const attempts = await Promise.allSettled([
      model.respond(prepared.reviews[1].version_id, 'accepted', true),
      model.respond(prepared.reviews[1].version_id, 'declined', true),
    ]);
    expect(attempts.map((x) => x.status)).toEqual(['fulfilled', 'rejected']);
    expect(model.read().responses[1].decision).toBe('accepted');
    expect(repo.read(sampleCompanies[index].id).bundle.version).toEqual(
      baseline,
    );
    expect(
      repo.portal(sampleCompanies[index].id, original.context.customer_id)
        .invoices,
    ).toEqual([]);
    model.logout();
    expect(() => model.properties()).toThrow();
    expect(() => model.selectProperty(other.id)).toThrow();
  },
);

it('customer property discovery excludes a different customer in the same contractor and every foreign contractor', async () => {
  const operations = new Operations(true),
    repo = new PropertyRepository(operations);
  const models = sampleCompanies.map(
    (c) => new CustomerPortalPreviewModel(c, repo),
  );
  for (const m of models) {
    await m.login();
    await m.prepareHistory();
  }
  const first = models[0],
    bound = first.read().context;
  const customer = await operations.saveCustomer(sampleCompanies[0].id, {
    display_name: 'Another synthetic customer',
    email: '',
    phone: '',
    customer_type: 'residential',
    preferred_contact: 'email',
  });
  await operations.saveLocation(sampleCompanies[0].id, customer!.id, {
    address_line1: 'Foreign customer property',
    address_line2: '',
    city: 'Example City',
    region: 'FL',
    postal_code: '00000',
    country_code: 'US',
  });
  const location = (
    await operations.listLocations(sampleCompanies[0].id, customer!.id)
  )[0];
  await repo.refreshContexts(sampleCompanies[0].id);
  expect(first.properties().map((p) => p.id)).not.toContain(location.id);
  expect(() => first.selectProperty(location.id)).toThrow();
  expect(() => first.selectProperty(models[1].properties()[0].id)).toThrow();
  expect(first.read().context.customer_id).toBe(bound.customer_id);
});
