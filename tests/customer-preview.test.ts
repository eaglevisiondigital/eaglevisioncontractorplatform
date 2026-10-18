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
