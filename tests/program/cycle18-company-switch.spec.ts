import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle18-browser-helpers';
for (const [index, company] of sampleCompanies.entries())
  test(`company switch withdraws selected job and retained reviews / ${company.slug}`, async ({
    page,
  }) => {
    await start(page, company);
    await nav(page, 'Daily contractor workflow');
    const r = page.getByRole('region', {
      name: 'Daily contractor workbench',
      exact: true,
    });
    const search = r.getByRole('region', {
      name: 'Shared record search',
      exact: true,
    });
    await search
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    const article = search.locator('article').first(),
      oldJob = await article.locator('span').first().innerText();
    await article
      .getByRole('button', { name: /^Open exact record in / })
      .click();
    await expect(r.locator('.daily-workbench-context')).toContainText(oldJob);
    await page
      .getByText('Disposable development controls', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(sampleCompanies[(index + 1) % 3].id);
    await expect(r).toHaveCount(0);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel(
        'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
        { exact: true },
      )
      .check();
    await page
      .getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toContainText('4 admitted jobs');
    await nav(page, 'Daily contractor workflow');
    await expect(r.locator('.daily-workbench-context')).toHaveCount(0);
    await expect(r).not.toContainText(oldJob);
    await audit(page, r);
  });
