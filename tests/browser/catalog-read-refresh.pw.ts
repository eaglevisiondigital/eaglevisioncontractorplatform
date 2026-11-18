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
          new URL('./fixtures/catalog-read-refresh.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'CatalogReadRefreshTest',
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
  await page.route('https://catalog-read-refresh.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Estimate navigation</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://catalog-read-refresh.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.catalog-row').first()).toBeVisible();
}
const reload = (page: Page) =>
  page.getByRole('button', { name: 'Reload catalog', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(() => window.catalogReadReview.snapshot());
const search = (page: Page) =>
  page.getByRole('searchbox', {
    name: 'Search loaded catalog items',
    exact: true,
  });
const readOnce = { catalog: 1, taxes: 1, defaults: 1, templates: 1 };
const readTwice = { catalog: 2, taxes: 2, defaults: 2, templates: 2 };

test('explicit catalog reload rereads all four existing sources without a writer', async ({
  page,
}, info) => {
  await open(page);
  const before = await snapshot(page);
  expect(before.facts.length).toBeGreaterThan(0);
  expect(before.reads[0]).toEqual(readOnce);
  expect(before.writes).toBe(0);
  await expect(reload(page)).toBeVisible();
  await reload(page).click();
  await expect(reload(page)).toBeEnabled();
  await expect
    .poll(async () => (await snapshot(page)).reads[0])
    .toEqual(readTwice);
  await expect(page.locator('.catalog-row')).toHaveCount(before.facts.length);
  expect((await snapshot(page)).writes).toBe(0);
  await page.screenshot({
    path: info.outputPath('catalog-explicit-read-reloaded.png'),
    fullPage: true,
  });
});

test('held reload preserves filters while disabling reads and avoiding false empty results', async ({
  page,
}, info) => {
  await open(page);
  const { facts } = await snapshot(page);
  await search(page).fill(facts[0].name);
  await page
    .getByRole('combobox', { name: 'Filter catalog type', exact: true })
    .selectOption(facts[0].kind);
  await page
    .getByRole('combobox', { name: 'Filter catalog status', exact: true })
    .selectOption('active');
  await page.evaluate(() => window.catalogReadReview.hold());
  await reload(page).click();
  await expect.poll(async () => (await snapshot(page)).waiting).toBe(true);
  await expect(reload(page)).toBeDisabled();
  await expect(page.locator('.catalog-row')).toHaveCount(0);
  await expect(
    page.getByText('No catalog items available in this view.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('No loaded catalog items match these filters.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(search(page)).toHaveValue(facts[0].name);
  await page.screenshot({
    path: info.outputPath('catalog-held-read-loading.png'),
    fullPage: true,
  });
  await page.evaluate(() => window.catalogReadReview.release());
  await expect(reload(page)).toBeEnabled();
  await expect(
    page.locator('.catalog-row').filter({ hasText: facts[0].name }),
  ).toBeVisible();
  await expect(search(page)).toHaveValue(facts[0].name);
  await expect(
    page.getByRole('combobox', { name: 'Filter catalog type', exact: true }),
  ).toHaveValue(facts[0].kind);
  expect((await snapshot(page)).reads[0]).toEqual(readTwice);
  expect((await snapshot(page)).writes).toBe(0);
});

test('backend read denial needs a new explicit user reload after recovery', async ({
  page,
}, info) => {
  await open(page);
  await page.evaluate(() => window.catalogReadReview.deny(true));
  await reload(page).click();
  await expect(
    page.getByText('Catalog read unavailable in this fixture.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.catalog-row')).toHaveCount(0);
  await expect(
    page.getByText('No catalog items available in this view.', { exact: true }),
  ).toHaveCount(0);
  expect((await snapshot(page)).reads[0]).toEqual({
    catalog: 2,
    taxes: 1,
    defaults: 1,
    templates: 1,
  });
  await page.screenshot({
    path: info.outputPath('catalog-denied-read.png'),
    fullPage: true,
  });
  await page.evaluate(() => window.catalogReadReview.deny(false));
  expect((await snapshot(page)).reads[0].catalog).toBe(2);
  await expect(page.locator('.catalog-row')).toHaveCount(0);
  await reload(page).click();
  await expect(page.locator('.catalog-row').first()).toBeVisible();
  expect((await snapshot(page)).reads[0]).toEqual({
    catalog: 3,
    taxes: 2,
    defaults: 2,
    templates: 2,
  });
  expect((await snapshot(page)).writes).toBe(0);
});

test('existing and new unsaved editors disable reload until explicit cancel', async ({
  page,
}) => {
  await open(page);
  await page.locator('.catalog-row').first().click();
  const field = page.getByRole('textbox', {
    name: 'Catalog name',
    exact: true,
  });
  await field.fill('Unsaved local text');
  await expect(reload(page)).toBeDisabled();
  await search(page).fill('missing filter only');
  await expect(field).toHaveValue('Unsaved local text');
  await expect(reload(page)).toBeDisabled();
  expect((await snapshot(page)).reads[0]).toEqual(readOnce);
  expect((await snapshot(page)).writes).toBe(0);
  await page
    .getByRole('button', { name: 'Cancel catalog edit', exact: true })
    .click();
  await expect(reload(page)).toBeEnabled();
  await page
    .getByRole('button', { name: 'New catalog item', exact: true })
    .click();
  await expect(reload(page)).toBeDisabled();
  await page
    .getByRole('button', { name: 'Cancel catalog edit', exact: true })
    .click();
  await reload(page).click();
  await expect
    .poll(async () => (await snapshot(page)).reads[0])
    .toEqual(readTwice);
  await expect(search(page)).toHaveValue('missing filter only');
  expect((await snapshot(page)).writes).toBe(0);
});

test('App-keyed company change fences a held old catalog result without claiming read cancellation', async ({
  page,
}) => {
  await open(page);
  const old = await snapshot(page);
  await page.evaluate(() => window.catalogReadReview.hold());
  await reload(page).click();
  await expect.poll(async () => (await snapshot(page)).waiting).toBe(true);
  await page.evaluate(() => window.catalogReadReview.company(1));
  await expect(page.locator('.catalog-row').first()).toBeVisible();
  const next = await snapshot(page);
  expect(next.company).not.toBe(old.company);
  await expect(page.locator('.catalog-row')).toHaveCount(next.facts.length);
  for (const item of next.facts)
    await expect(
      page.locator('.catalog-row').filter({ hasText: item.name }),
    ).toBeVisible();
  await page.evaluate(() => window.catalogReadReview.release());
  await expect.poll(async () => (await snapshot(page)).completed[0]).toBe(2);
  await expect(page.locator('.catalog-row')).toHaveCount(next.facts.length);
  for (const item of next.facts)
    await expect(
      page.locator('.catalog-row').filter({ hasText: item.name }),
    ).toBeVisible();
  expect((await snapshot(page)).reads[1]).toEqual(readOnce);
  expect((await snapshot(page)).writes).toBe(0);
});

test('trusted keyboard reload is accessible and contains the responsive catalog', async ({
  page,
}) => {
  await open(page);
  await reload(page).focus();
  await expect(reload(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await snapshot(page)).reads[0])
    .toEqual(readTwice);
  expect(
    (await new AxeBuilder({ page }).include('.p3-workspace').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await snapshot(page)).writes).toBe(0);
});
