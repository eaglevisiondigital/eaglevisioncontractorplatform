import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle16-browser-helpers';
for (const company of sampleCompanies)
  test(`daily field guide / ${company.slug}`, async ({ page }, info) => {
    await start(page, company);
    await nav(page, 'Schedule and work orders');
    const r = page.getByRole('region', {
      name: 'Daily field guide',
      exact: true,
    });
    await r
      .getByRole('combobox', { name: 'Daily guide job', exact: true })
      .selectOption({ index: 1 });
    await expect(
      r.getByRole('button', {
        name: 'Inspect daily field sources',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel('I confirm this is a read-only daily field source review.', {
        exact: true,
      })
      .check();
    await r
      .getByRole('button', { name: 'Inspect daily field sources', exact: true })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Recorded daily work-order evidence',
        exact: true,
      }),
    ).toBeFocused();
    for (const label of [
      'Review issued work scope',
      'Review technician evidence',
      'Review daily visit evidence',
      'Review published source reports',
    ])
      await r.getByRole('button', { name: label, exact: true }).click();
    const report = r
      .getByRole('button', { name: /^Open daily source report / })
      .first();
    if (await report.count()) await report.click();
    await audit(page, r);
    await capture(
      page,
      r,
      'field-daily-evidence',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Open original field task controls',
        exact: true,
      })
      .click();
    const original = r.getByRole('region', {
      name: 'Field task continuity',
      exact: true,
    });
    await expect(original).toBeVisible();
    await r
      .getByRole('button', { name: 'Return to daily field guide', exact: true })
      .click();
    await expect(original).toBeHidden();
    await r
      .getByRole('button', {
        name: 'Resume original field task controls',
        exact: true,
      })
      .click();
    await expect(original).toBeVisible();
    await audit(page, r);
  });
