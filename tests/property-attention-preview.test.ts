import { expect, it } from 'vitest';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { PropertyRepository } from '../src/lib/property';
import { Operations } from '../src/lib/operations';
import { sampleCompanies } from '../src/domain/platform';
it.each(sampleCompanies)(
  'attention preview reuses and preserves $name published sources and immutable baseline',
  async (company) => {
    const repo = new PropertyRepository(new Operations(true));
    const model = new CustomerPortalPreviewModel(company, repo);
    expect(() => model.attention()).toThrow();
    await model.login();
    expect(model.attention().items).toEqual([]);
    await model.prepareHistory();
    await model.prepare();
    const before = model.read();
    const baseline = repo.read(company.id).bundle.version;
    model.prepareAttentionExamples();
    const current = model.attention();
    expect(model.read().reports).toHaveLength(5);
    expect(model.read().reports.slice(0, 3)).toEqual(before.reports);
    expect(current.items.filter((i) => i.recurring)).toHaveLength(2);
    expect(current.items.filter((i) => i.newly_reported)).toHaveLength(1);
    expect(current.items.filter((i) => i.changes.length)).toHaveLength(1);
    expect(current.items.filter((i) => i.repair_scopes.length)).toHaveLength(1);
    expect(current.items.every((i) => i.repair_status === 'undetermined')).toBe(
      true,
    );
    expect(
      current.items
        .find((i) => i.location === 'West path')
        ?.uncertainties.join(' '),
    ).toContain('absence is not evidence of repair');
    model.prepareAttentionExamples();
    expect(model.attention()).toEqual(current);
    expect(repo.read(company.id).bundle.version).toEqual(baseline);
    expect(
      repo.portal(company.id, before.context.customer_id).invoices,
    ).toEqual([]);
    expect(JSON.stringify(current)).not.toMatch(
      /INTERNAL|payroll|margin|unit_cost_minor|internal_notes/,
    );
    const second = model
      .properties()
      .find((p) => p.id !== before.context.location_id)!;
    model.selectProperty(second.id);
    expect(model.attention().items).toEqual([]);
    expect(() => model.prepareAttentionExamples()).toThrow();
    model.logout();
    expect(() => model.attention()).toThrow();
  },
);
