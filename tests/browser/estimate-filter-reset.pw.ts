import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
let script = '',
  css = '';
test.beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/estimate-list-navigation.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'EstimateNavigationTest',
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw Error('Fixture bundle unavailable');
  script = result.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = result.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
});
async function open(page: Page) {
  await page.route('https://estimate-filter-reset.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Estimate navigation</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-filter-reset.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.estimate-list-row')).toHaveCount(10);
}
const search = (page: Page) =>
  page.getByLabel('Search estimates', { exact: true });
const status = (page: Page) =>
  page.getByRole('combobox', { name: 'Estimate status', exact: true });
const clear = (page: Page) =>
  page.getByRole('button', { name: 'Clear estimate filters', exact: true });
const counts = (page: Page) =>
  page.evaluate(() => window.estimateNavigation.counts());
const assertNoDispatch = async (page: Page) =>
  expect(await counts(page)).toEqual({ reads: 0, writes: 0 });

test('empty filtered list resets text and status with one explicit keyboard action', async ({
  page,
}, info) => {
  await open(page);
  await search(page).fill('No saved project has this name');
  await status(page).selectOption('draft');
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  await expect(
    page.getByText('No loaded estimates match these filters.', { exact: true }),
  ).toBeVisible();
  await assertNoDispatch(page);
  await expect(clear(page)).toBeVisible();
  await clear(page).focus();
  await expect(clear(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(search(page)).toHaveValue('');
  await expect(status(page)).toHaveValue('all');
  await expect(page.locator('.estimate-list-row')).toHaveCount(10);
  await expect(page.getByRole('status').last()).toContainText(
    '12 matching loaded estimates · page 1 of 2',
  );
  await expect(clear(page)).toBeDisabled();
  await assertNoDispatch(page);
  await page.screenshot({
    path: info.outputPath('saved-estimates-filters-cleared.png'),
    fullPage: true,
  });
});

test('page-only reset returns to the first saved page without an estimate read or write', async ({
  page,
}) => {
  await open(page);
  await expect(clear(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  await expect(page.getByRole('status').last()).toContainText('page 2 of 2');
  await clear(page).click();
  await expect(
    page.getByRole('button', { name: 'Previous', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.estimate-list-row').first()).toContainText(
    'B0 Navigation estimate 00',
  );
  await expect(page.locator('.estimate-list-row')).toHaveCount(10);
  await assertNoDispatch(page);
});

test('clearing list filters preserves explicit new-draft customer choice without creation', async ({
  page,
}) => {
  await open(page);
  const customer = page.getByRole('combobox', {
    name: 'Customer for new estimate',
    exact: true,
  });
  const id = await customer.locator('option').nth(1).getAttribute('value');
  expect(id).toBeTruthy();
  await customer.selectOption(id!);
  await search(page).fill('missing');
  await status(page).selectOption('archived');
  await clear(page).click();
  await expect(customer).toHaveValue(id!);
  await expect(
    page.getByRole('button', { name: 'New estimate', exact: true }),
  ).toBeEnabled();
  await assertNoDispatch(page);
});

test('saved estimate remains available through original guarded open after reset', async ({
  page,
}) => {
  await open(page);
  await search(page).fill('missing');
  await clear(page).click();
  const row = page
    .locator('.estimate-list-row')
    .filter({ hasText: 'B0 Navigation estimate 03' });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', {
      name: 'B0 Navigation estimate 03',
      exact: true,
    }),
  ).toBeFocused();
  expect(await counts(page)).toEqual({ reads: 1, writes: 0 });
  await page
    .getByRole('button', { name: 'All estimates', exact: true })
    .click();
  await expect(row).toBeFocused();
  await expect(search(page)).toHaveValue('');
  await expect(status(page)).toHaveValue('all');
  expect(await counts(page)).toEqual({ reads: 1, writes: 0 });
});

test('current company reset displays only that company saved records', async ({
  page,
}) => {
  await open(page);
  await search(page).fill('B0');
  await status(page).selectOption('issued');
  await page.evaluate(() => window.estimateNavigation.company(1));
  await expect(page.getByTestId('company')).not.toHaveText(
    'Straight Edge Property Services',
  );
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  await expect(clear(page)).toBeEnabled();
  await clear(page).click();
  await expect(page.locator('.estimate-list-row').first()).toContainText(
    'B1 Navigation estimate 00',
  );
  await expect(
    page.locator('.estimate-list-row').filter({ hasText: 'B0 Navigation' }),
  ).toHaveCount(0);
  await assertNoDispatch(page);
});

test('filter reset cannot revive a denied resource and remains accessible on responsive profiles', async ({
  page,
}, info) => {
  await open(page);
  await search(page).fill('missing');
  await page.evaluate(() => window.estimateNavigation.deny());
  await page
    .getByRole('button', { name: 'Refresh estimates', exact: true })
    .click();
  await expect(
    page.getByText(
      'This estimate is unavailable or has changed. Refresh estimates before opening it.',
      { exact: true },
    ),
  ).toBeVisible();
  await clear(page).click();
  await expect(search(page)).toHaveValue('');
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'New estimate', exact: true }),
  ).toBeDisabled();
  await assertNoDispatch(page);
  expect(
    (await new AxeBuilder({ page }).include('.p3-workspace').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('denied-estimate-list-remains-blocked.png'),
    fullPage: true,
  });
});
