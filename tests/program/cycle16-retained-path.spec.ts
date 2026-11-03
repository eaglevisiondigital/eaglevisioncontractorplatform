import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle16-browser-helpers';
for (const company of sampleCompanies)
  test(`original review choices and environment retained / ${company.slug}`, async ({
    page,
  }) => {
    await start(page, company);
    await nav(page, 'Schedule and work orders');
    await expect(
      page.getByRole('region', { name: 'Daily field guide', exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Use daily workflow guides', { exact: true })
      .uncheck();
    await expect(
      page.getByRole('region', { name: 'Daily field guide', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', {
        name: 'Schedule and work-order continuity',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Shared operating environment' }),
    ).toContainText('4 admitted jobs');
    await page.getByLabel('Use guided task paths', { exact: true }).check();
    const original = page.getByRole('region', {
      name: 'Field task continuity',
      exact: true,
    });
    await expect(original).toBeVisible();
    await page.getByLabel('Use daily workflow guides', { exact: true }).check();
    await expect(original).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Daily field guide', exact: true }),
    ).toBeVisible();
    await audit(
      page,
      page.getByRole('region', { name: 'Daily field guide', exact: true }),
    );
  });
