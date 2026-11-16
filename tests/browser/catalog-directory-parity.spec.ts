import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openCatalog(page: import('@playwright/test').Page) {
  await page.goto('/preview');
  const menu = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  const catalog = page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Catalog & estimating policies',
      exact: true,
    }),
  });
  await expect(catalog.locator('.catalog-row').first()).toBeVisible();
  return catalog;
}

test('catalog search is literal, uses loaded records and clears an empty result', async ({
  page,
}, info) => {
  const catalog = await openCatalog(page);
  const rows = catalog.locator('.catalog-row');
  const total = await rows.count();
  const name = await rows.first().locator('strong').innerText();
  const search = catalog.getByLabel('Search loaded catalog items', {
    exact: true,
  });
  await search.fill(`  ${name.toUpperCase()}  `);
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('strong')).toHaveText(name);
  await search.fill('.*');
  await expect(rows).toHaveCount(0);
  await expect(
    catalog.getByText('No loaded catalog items match these filters.', {
      exact: true,
    }),
  ).toBeVisible();
  await catalog
    .getByRole('button', { name: 'Clear catalog filters', exact: true })
    .click();
  await expect(search).toHaveValue('');
  await expect(rows).toHaveCount(total);
  await expect(
    catalog.getByText(`${total} of ${total} loaded catalog items shown.`, {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('catalog-directory.png'),
    fullPage: true,
  });
});

test('type and status filters intersect without changing the selected source item', async ({
  page,
}) => {
  const catalog = await openCatalog(page);
  await catalog
    .getByRole('combobox', { name: 'Filter catalog type', exact: true })
    .selectOption('labor');
  await expect(catalog.locator('.catalog-row').first()).toBeVisible();
  await catalog.locator('.catalog-row').first().click();
  await expect(
    catalog.getByRole('combobox', { name: 'Catalog type', exact: true }),
  ).toHaveValue('labor');
  await catalog
    .getByRole('combobox', { name: 'Filter catalog status', exact: true })
    .selectOption('archived');
  await expect(catalog.locator('.catalog-row')).toHaveCount(0);
  await expect(
    catalog.getByRole('combobox', { name: 'Catalog type', exact: true }),
  ).toHaveValue('labor');
  await catalog
    .getByRole('button', { name: 'Cancel catalog edit', exact: true })
    .click();
  await catalog
    .getByRole('button', { name: 'Clear catalog filters', exact: true })
    .click();
  await expect(catalog.locator('.catalog-row').first()).toBeVisible();
});

test('filtering preserves unsaved editor input and explicit cancel leaves the original item intact', async ({
  page,
}) => {
  const catalog = await openCatalog(page);
  const row = catalog.locator('.catalog-row').first();
  const original = await row.locator('strong').innerText();
  await row.click();
  await catalog
    .getByLabel('Catalog name', { exact: true })
    .fill('Unsaved local catalog edit');
  await catalog
    .getByLabel('Search loaded catalog items', { exact: true })
    .fill('no matching loaded row');
  await expect(catalog.locator('.catalog-row')).toHaveCount(0);
  await expect(catalog.getByLabel('Catalog name', { exact: true })).toHaveValue(
    'Unsaved local catalog edit',
  );
  await catalog
    .getByRole('button', { name: 'Cancel catalog edit', exact: true })
    .click();
  await expect(catalog.getByLabel('Catalog name', { exact: true })).toHaveCount(
    0,
  );
  await catalog
    .getByRole('button', { name: 'Clear catalog filters', exact: true })
    .click();
  await catalog.locator('.catalog-row').first().click();
  await expect(catalog.getByLabel('Catalog name', { exact: true })).toHaveValue(
    original,
  );
});

test('existing synthetic save and reopening retain the original catalog values', async ({
  page,
}) => {
  const catalog = await openCatalog(page);
  await catalog
    .getByRole('button', { name: 'New catalog item', exact: true })
    .click();
  await catalog
    .getByLabel('Catalog name', { exact: true })
    .fill('Synthetic directory qualification item');
  await catalog
    .getByRole('combobox', { name: 'Catalog type', exact: true })
    .selectOption('service');
  await catalog
    .getByLabel('Private unit cost (USD minor units)', { exact: true })
    .fill('1234');
  await catalog
    .getByRole('button', { name: 'Save catalog item', exact: true })
    .click();
  await expect(catalog.getByLabel('Catalog name', { exact: true })).toHaveCount(
    0,
  );
  await catalog
    .getByLabel('Search loaded catalog items', { exact: true })
    .fill('Synthetic directory qualification item');
  await expect(catalog.locator('.catalog-row')).toHaveCount(1);
  await catalog.locator('.catalog-row').click();
  await expect(catalog.getByLabel('Catalog name', { exact: true })).toHaveValue(
    'Synthetic directory qualification item',
  );
  await expect(
    catalog.getByRole('combobox', { name: 'Catalog type', exact: true }),
  ).toHaveValue('service');
  await expect(
    catalog.getByLabel('Private unit cost (USD minor units)', { exact: true }),
  ).toHaveValue('1234');
});

test('company changes reset presentation filters and directory controls remain accessible', async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  const catalog = await openCatalog(page);
  for (const org of [
    'sample-construction',
    'sample-roofing',
    'sample-property',
  ]) {
    await catalog
      .getByLabel('Search loaded catalog items', { exact: true })
      .fill('no matching loaded row');
    await catalog
      .getByRole('combobox', { name: 'Filter catalog type', exact: true })
      .selectOption('service');
    await page
      .getByRole('combobox', { name: 'Company context', exact: true })
      .selectOption(org);
    await expect(
      catalog.getByLabel('Search loaded catalog items', { exact: true }),
    ).toHaveValue('');
    await expect(
      catalog.getByRole('combobox', {
        name: 'Filter catalog type',
        exact: true,
      }),
    ).toHaveValue('all');
    await expect(catalog.locator('.catalog-row').first()).toBeVisible();
  }
  await catalog
    .getByLabel('Search loaded catalog items', { exact: true })
    .focus();
  await page.keyboard.type('.*');
  await page.keyboard.press('Tab');
  await expect(
    catalog.getByRole('combobox', { name: 'Filter catalog type', exact: true }),
  ).toBeFocused();
  const results = await new AxeBuilder({ page }).include('article').analyze();
  expect(
    results.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
