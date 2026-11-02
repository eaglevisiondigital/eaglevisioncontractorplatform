import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle10-browser-helpers';
for (const company of sampleCompanies) {
  test(`crew plan comparison, proposal controls and source / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Crew plan comparison');
    const r = page.getByRole('region', {
      name: 'Weekly crew plan comparison',
      exact: true,
    });
    const confirmation = r.getByLabel(
      'I confirm these are two unsaved human proposals for read-only comparison.',
    );
    await confirmation.check();
    await r
      .getByRole('button', { name: 'Compare weekly crew plans', exact: true })
      .click();
    await expect(
      r.getByRole('heading', { name: 'Recorded week and plan comparison' }),
    ).toBeFocused();
    await expect(r).toContainText('4 of 4 admitted jobs');
    await r
      .getByText('Build separate plan A and plan B proposals', { exact: true })
      .click();
    await expect(
      r.getByRole('combobox', { name: 'Assigned technician', exact: true }),
    ).toBeVisible();
    await r
      .getByRole('button', {
        name: 'Add unsaved proposal to plan A',
        exact: true,
      })
      .click();
    await r
      .getByRole('combobox', { name: 'Proposal plan', exact: true })
      .selectOption('B');
    await r.getByLabel('Proposed start', { exact: true }).fill('10:00');
    await r.getByLabel('Proposed end', { exact: true }).fill('12:00');
    await r
      .getByRole('button', {
        name: 'Add unsaved proposal to plan B',
        exact: true,
      })
      .click();
    await confirmation.check();
    await r
      .getByRole('button', { name: 'Compare weekly crew plans', exact: true })
      .click();
    await expect(r).toContainText('Neither proposal was applied');
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle10/crew-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', {
        name: 'Open exact crew-plan job source',
        exact: true,
      })
      .first()
      .click();
    await expect(
      r.getByRole('region', { name: 'Exact crew-plan source', exact: true }),
    ).toBeVisible();
    await audit(page, r);
    await r
      .getByRole('button', {
        name: 'Display existing job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await expect(page.locator('.oc-identities')).toContainText(company.id);
  });
  test(`financial exceptions, filters and exact source / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Financial exceptions');
    const r = page.getByRole('region', {
      name: 'Financial exception queue',
      exact: true,
    });
    await expect(
      r.getByRole('combobox', { name: 'Forecast basis', exact: true }),
    ).toHaveValue('SAVED_FORECASTS');
    await r.getByLabel(/I confirm the remaining forecast excludes/).check();
    await r.getByLabel(/I confirm these exact jobs and source values/).check();
    await r
      .getByRole('button', { name: 'Review financial exceptions', exact: true })
      .click();
    await expect(r).toContainText('8 matching review items of 8');
    await r
      .getByRole('combobox', { name: 'Review type', exact: true })
      .selectOption('coverage');
    await expect(r).toContainText('4 matching review items of 8');
    await r
      .getByLabel('Search allowed review evidence')
      .fill('nonexistent literal evidence');
    await expect(
      r.getByRole('heading', { name: 'No matching review items' }),
    ).toBeVisible();
    await r.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle10/finance-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', { name: 'Open exact job review', exact: true })
      .first()
      .click();
    await expect(
      r.getByRole('region', {
        name: 'Exact financial exception source',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, r);
    await r
      .getByRole('button', {
        name: 'Display existing job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await expect(page.locator('.oc-identities')).toContainText(company.id);
  });
  test(`service requests, preparation and safe report / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Service request desk');
    const r = page.getByRole('region', {
      name: 'Service request desk',
      exact: true,
    });
    await r
      .getByRole('button', {
        name: 'Review existing service requests',
        exact: true,
      })
      .click();
    await expect(r).toContainText(
      '3 matching of 3 available prepared requests',
    );
    await r
      .getByRole('button', { name: 'Next request page', exact: true })
      .click();
    await expect(r).toContainText('page 2 of 2');
    await r
      .getByRole('button', { name: 'Previous request page', exact: true })
      .click();
    await r
      .getByRole('button', {
        name: 'Review exact request and issued scope',
        exact: true,
      })
      .first()
      .click();
    const staff = r.getByRole('region', {
      name: 'Staff service request review',
      exact: true,
    });
    for (const check of await staff.getByRole('checkbox').all())
      if (await check.isEnabled()) await check.check();
    await r
      .getByRole('button', {
        name: 'Prepare staff service review snapshot',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('region', {
        name: 'Staff-only service review snapshot',
        exact: true,
      }),
    ).toContainText('CURRENT_REVIEW_ONLY');
    await r
      .getByRole('button', {
        name: 'Open exact customer-safe report',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact customer-safe service report',
        exact: true,
      }),
    ).toBeFocused();
    const safe = r.getByRole('region', {
      name: 'Customer-safe service documentation',
      exact: true,
    });
    await expect(safe).not.toContainText(
      /unit_cost|margin|recorded_by|payroll|supplier/i,
    );
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle10/service-${info.project.name}-${company.slug}.png`,
    });
    await audit(page, r);
    await r
      .getByRole('button', {
        name: 'Display existing job workflow',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
  });
}
