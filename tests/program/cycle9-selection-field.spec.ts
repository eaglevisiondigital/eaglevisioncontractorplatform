import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle9-browser-helpers';
for (const company of sampleCompanies)
  test(`multi-job selection and weekly scheduling / ${company.slug}`, async ({
    page,
  }, info) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (
        !r.url().startsWith('http://127.0.0.1:4219') &&
        !r.url().startsWith('data:')
      )
        external.push(r.url());
    });
    await start(page, company);
    const selection = page.getByRole('region', {
      name: 'Operating source selection',
      exact: true,
    });
    await selection
      .getByRole('button', { name: 'Search operating sources', exact: true })
      .click();
    await expect(selection).toContainText('4 matching of 4 available');
    await expect(selection.locator('article')).toHaveCount(2);
    const job1 = await selection
      .locator('article')
      .first()
      .locator('dd')
      .last()
      .innerText();
    await selection
      .getByRole('button', { name: 'Next operating page' })
      .click();
    const job2 = await selection
      .locator('article')
      .first()
      .locator('dd')
      .last()
      .innerText();
    expect(job1).not.toBe(job2);
    await page.locator('.operating-center').screenshot({
      path: `artifacts/cycle9/selection-${info.project.name}-${company.slug}.png`,
    });
    await selection
      .getByRole('button', { name: 'Open this source-bound job' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await expect(page.locator('.oc-identities')).toContainText(job2);
    await expect(page.locator('.oc-identities')).toContainText(company.id);
    await page.locator('.oc-panel').screenshot({
      path: `artifacts/cycle9/selected-${info.project.name}-${company.slug}.png`,
    });
    await nav(page, 'Sources');
    await selection
      .getByLabel('Search customer, lead, property or estimate')
      .fill('no source matches this literal');
    await selection
      .getByRole('button', { name: 'Search operating sources' })
      .click();
    await expect(selection).toContainText('0 matching of 4 available');
    await nav(page, 'Weekly schedule');
    const field = page.getByRole('region', {
      name: 'Multi-job weekly scheduling',
      exact: true,
    });
    await field
      .getByLabel(
        'I confirm this is an unsaved, source-bound scheduling review.',
      )
      .check();
    await field
      .getByRole('button', { name: 'Review multi-job week', exact: true })
      .click();
    await expect(
      field.getByRole('heading', {
        name: 'Seven-day evidence · 4 of 4 admitted jobs',
      }),
    ).toBeFocused();
    await expect(field.locator('.ps-day')).toHaveCount(7);
    await expect(field.locator('.ps-jobs>article')).toHaveCount(4);
    await expect(field).toContainText('availability UNKNOWN');
    await field.screenshot({
      path: `artifacts/cycle9/field-${info.project.name}-${company.slug}.png`,
    });
    await field
      .getByRole('button', { name: 'Review event source' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await nav(page, 'Weekly schedule');
    await field
      .getByLabel(
        'I confirm this is an unsaved, source-bound scheduling review.',
      )
      .check();
    await field
      .getByRole('button', { name: 'Review multi-job week', exact: true })
      .click();
    await field
      .getByRole('combobox', { name: 'Job filter', exact: true })
      .selectOption({ index: 1 });
    await field
      .getByLabel(
        'I confirm this is an unsaved, source-bound scheduling review.',
      )
      .check();
    await field
      .getByRole('button', { name: 'Review multi-job week', exact: true })
      .click();
    await expect(field.locator('.ps-jobs>article')).toHaveCount(1);
    await expect(field).toContainText('1 of 4 admitted jobs');
    await audit(page, field);
    expect(external).toEqual([]);
  });
test('contractor switch withholds sources and returns exact retained environment', async ({
  page,
}) => {
  await start(page, sampleCompanies[0]);
  const selection = page.getByRole('region', {
    name: 'Operating source selection',
    exact: true,
  });
  await selection
    .getByRole('button', { name: 'Search operating sources' })
    .click();
  const before = await selection
    .locator('article')
    .first()
    .locator('dd')
    .last()
    .innerText();
  await page
    .getByText('Disposable development controls', { exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(sampleCompanies[1].id);
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', {
      name: 'Operating source selection',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Contractor', exact: true })
    .selectOption(sampleCompanies[0].id);
  await page
    .getByLabel(
      'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
    )
    .check();
  await expect(
    page.getByRole('button', {
      name: 'Prepare multi-job local environment',
      includeHidden: true,
    }),
  ).toBeDisabled();
  await selection
    .getByRole('button', { name: 'Search operating sources' })
    .click();
  await expect(
    selection.locator('article').first().locator('dd').last(),
  ).toHaveText(before);
});
