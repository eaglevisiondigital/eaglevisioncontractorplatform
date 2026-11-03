import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle14-browser-helpers';
for (const company of sampleCompanies)
  test(`retained navigation and withdrawn company context / ${company.slug}`, async ({
    page,
  }) => {
    await start(page, company);
    for (const [name, count] of [
      ['Operating center sections', 8],
      ['Daily workflow reviews', 6],
      ['Cycle 11 workflow labs', 7],
      ['Cycle 12 workflow reviews', 6],
      ['Cycle 13 operating desks', 6],
      ['Cycle 14 source continuity', 6],
    ] as const)
      await expect(
        page.locator(`nav[aria-label="${name}"] button`),
      ).toHaveCount(count);
    await nav(page, 'Service source continuity');
    const r = page.getByRole('region', {
      name: 'Service source continuity',
      exact: true,
    });
    await r
      .getByRole('button', {
        name: 'Inspect selected service source',
        exact: true,
      })
      .click();
    const job = await r
      .getByRole('combobox', { name: 'Continuity source job', exact: true })
      .inputValue();
    await expect(r).toContainText(job);
    await audit(page, r);
    const controls = page.locator('.oc-development').first();
    await controls.locator('summary').click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(
        sampleCompanies[(sampleCompanies.indexOf(company) + 1) % 3].id,
      );
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', {
        name: 'Service source continuity',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(job);
    await expect(
      page.getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
  });
