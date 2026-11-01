import { expect, it } from 'vitest';
import { CustomerPortalPreviewModel } from '../src/lib/customer-preview';
import { PropertyRepository } from '../src/lib/property';
import { Operations } from '../src/lib/operations';
import { sampleCompanies } from '../src/domain/platform';
it.each(sampleCompanies)(
  'comparison reuses $name sources, preserves reports and financial gates, resets property scope',
  async (company) => {
    const repo = new PropertyRepository(new Operations(true)),
      model = new CustomerPortalPreviewModel(company, repo);
    await model.login();
    await model.prepareHistory();
    await model.prepare();
    model.prepareAttentionExamples();
    const before = model.read(),
      baseline = repo.read(company.id).bundle.version;
    model.prepareComparisonExamples();
    const data = model.read();
    const pair = data.reports.slice(-2);
    const result = model.compareReports(pair[1], pair[0]);
    expect(result.checklist.filter((c) => c.result_differs)).toHaveLength(1);
    expect(result.findings.filter((c) => c.presence === 'both')).toHaveLength(
      1,
    );
    expect(
      result.findings.filter((c) => c.location === 'Comparison drain'),
    ).toHaveLength(2);
    expect(data.reports.slice(0, 5)).toEqual(before.reports);
    model.prepareComparisonExamples();
    expect(model.read()).toEqual(data);
    expect(repo.read(company.id).bundle.version).toEqual(baseline);
    expect(repo.portal(company.id, data.context.customer_id).invoices).toEqual(
      [],
    );
    expect(JSON.stringify(result)).not.toMatch(
      /INTERNAL|unit_cost|payroll|internal_notes/,
    );
    const old = before.reports[0],
      other = before.reports[1];
    expect(
      model
        .compareReports(old, other)
        .findings.some((f) => f.repair_scopes.length === 1),
    ).toBe(true);
    model.selectProperty(
      model.properties().find((p) => p.id !== data.context.location_id)!.id,
    );
    expect(() => model.compareReports(pair[0], pair[1])).toThrow();
    expect(() => model.prepareComparisonExamples()).toThrow();
    model.logout();
    expect(() => model.compareReports(pair[0], pair[1])).toThrow();
  },
);
