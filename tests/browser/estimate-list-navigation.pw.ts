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
  await page.route('https://estimate-navigation.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Estimate navigation</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-navigation.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.estimate-list-row')).toHaveCount(10);
}
const row = (page: Page, name = 'B0 Navigation estimate 00') =>
  page.getByRole('button', { name: new RegExp(name) });
const unavailable =
  'This estimate is unavailable or has changed. Refresh estimates before opening it.';
async function refresh(page: Page) {
  await page
    .getByRole('button', { name: 'Refresh estimates', exact: true })
    .click();
}
test('keyboard review returns to the same filtered page and restores its row focus', async ({
  page,
}, info) => {
  await open(page);
  await page.getByLabel('Search estimates', { exact: true }).fill('Navigation');
  await page
    .getByRole('combobox', { name: 'Estimate status', exact: true })
    .selectOption('issued');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('page 2 of 2');
  const button = row(page, 'B0 Navigation estimate 10');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', {
      name: 'B0 Navigation estimate 10',
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'All estimates', exact: true })
    .click();
  await expect(button).toBeFocused();
  await expect(
    page.getByLabel('Search estimates', { exact: true }),
  ).toHaveValue('Navigation');
  await expect(
    page.getByRole('combobox', { name: 'Estimate status', exact: true }),
  ).toHaveValue('issued');
  await expect(page.getByRole('status').last()).toContainText('page 2 of 2');
  expect(await page.evaluate(() => window.estimateNavigation.counts())).toEqual(
    { reads: 1, writes: 0 },
  );
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
    path: info.outputPath('filtered-estimates.png'),
    fullPage: true,
  });
});
test('permission denial and post-read module withdrawal withhold rows until a fresh authorized load', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.estimateNavigation.deny());
  await row(page).click();
  await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  await page.getByLabel('Search estimates', { exact: true }).fill('Navigation');
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.estimateNavigation.counts())).reads,
  ).toBe(0);
  await page.evaluate(() => window.estimateNavigation.reset());
  await refresh(page);
  await expect(row(page)).toBeVisible();
  await page.evaluate(() => window.estimateNavigation.holdRead());
  await row(page).click();
  await expect
    .poll(() => page.evaluate(() => window.estimateNavigation.counts().reads))
    .toBe(1);
  await page.evaluate(() => {
    window.estimateNavigation.disable();
    window.estimateNavigation.release();
  });
  await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  await expect(page.locator('.estimate-editor')).toHaveCount(0);
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.estimateNavigation.counts())).writes,
  ).toBe(0);
  const initialProject = await page.evaluate(() => {
    window.estimateNavigation.reset();
    return window.estimateNavigation.initial();
  });
  await expect(
    page.getByRole('heading', { name: initialProject, exact: true }),
  ).toBeVisible();
});
test('wrong source bundles and foreign or duplicate loaded rows never open or leak errors', async ({
  page,
}) => {
  await open(page);
  for (const kind of [
    'foreign',
    'estimate',
    'version',
    'customer',
    'stale',
    'error',
  ]) {
    await page.evaluate(
      (value) => window.estimateNavigation.corruptBundle(value),
      kind,
    );
    await row(page).click();
    await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
    await expect(page.locator('.estimate-editor')).toHaveCount(0);
    await expect(
      page.getByText('PRIVATE_READ_ERROR', { exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => window.estimateNavigation.reset());
    await refresh(page);
    await expect(row(page)).toBeVisible();
  }
  for (const kind of ['foreign', 'duplicate']) {
    await page.evaluate(
      (value) => window.estimateNavigation.corruptList(value),
      kind,
    );
    await refresh(page);
    await expect(page.locator('.estimate-list-row')).toHaveCount(0);
    await expect(
      page.getByText('PRIVATE_FOREIGN_NAME', { exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => window.estimateNavigation.reset());
    await refresh(page);
    await expect(row(page)).toBeVisible();
  }
  expect(
    (await page.evaluate(() => window.estimateNavigation.counts())).writes,
  ).toBe(0);
});
test('delayed opening cannot override a changed filter, company or same-company repository', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.estimateNavigation.holdRead());
  await row(page).click();
  await expect
    .poll(() => page.evaluate(() => window.estimateNavigation.counts().reads))
    .toBe(1);
  await page.getByLabel('Search estimates', { exact: true }).fill('no match');
  await page.evaluate(() => window.estimateNavigation.release());
  await expect(
    page.getByText('No loaded estimates match these filters.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.estimate-editor')).toHaveCount(0);
  await page.getByLabel('Search estimates', { exact: true }).fill('');
  await page.evaluate(() => window.estimateNavigation.holdRead());
  await row(page).click();
  await expect
    .poll(() => page.evaluate(() => window.estimateNavigation.counts().reads))
    .toBe(2);
  await page.evaluate(() => window.estimateNavigation.company(1));
  await expect(row(page, 'B1 Navigation estimate 00')).toBeVisible();
  await row(page, 'B1 Navigation estimate 00').click();
  await expect(
    page.getByRole('heading', {
      name: 'B1 Navigation estimate 00',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.estimateNavigation.release());
  await expect(
    page.getByRole('heading', {
      name: 'B1 Navigation estimate 00',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'All estimates', exact: true })
    .click();
  await expect(row(page, 'B1 Navigation estimate 00')).toBeVisible();
  await page.evaluate(() => window.estimateNavigation.holdRead());
  await row(page, 'B1 Navigation estimate 00').click();
  await expect
    .poll(() => page.evaluate(() => window.estimateNavigation.counts().reads))
    .toBe(4);
  await page.evaluate(() => window.estimateNavigation.replaceRepo());
  await expect(row(page, 'B1 Navigation estimate 00')).toBeVisible();
  await row(page, 'B1 Navigation estimate 00').click();
  await expect(
    page.getByRole('heading', {
      name: 'B1 Navigation estimate 00',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.estimateNavigation.release());
  await expect(
    page.getByRole('heading', {
      name: 'B1 Navigation estimate 00',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => window.estimateNavigation.counts())).writes,
  ).toBe(0);
});
test('last authority wait rechecks loaded identity and return clamps a shrunken list', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.estimateNavigation.holdAuthority());
  await row(page).dblclick();
  await expect
    .poll(() => page.evaluate(() => window.estimateNavigation.counts().reads))
    .toBe(1);
  await page.evaluate(() => {
    window.estimateNavigation.mutateLoaded();
    window.estimateNavigation.release();
  });
  await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  await expect(page.locator('.estimate-editor')).toHaveCount(0);
  await refresh(page);
  await expect(row(page)).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await row(page, 'B0 Navigation estimate 10').click();
  await expect(
    page.getByRole('heading', {
      name: 'B0 Navigation estimate 10',
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.estimateNavigation.shrink());
  await page
    .getByRole('button', { name: 'All estimates', exact: true })
    .click();
  await expect(
    page.getByLabel('Search estimates', { exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('status').last()).toContainText('page 1 of 1');
  await expect(page.locator('.estimate-list-row')).toHaveCount(1);
  expect(
    (await page.evaluate(() => window.estimateNavigation.counts())).writes,
  ).toBe(0);
});
test('actual App retains the estimate search and returns keyboard focus without visual overflow', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4357/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  const first = page.locator('.estimate-list-row').first();
  await expect(first).toBeVisible();
  const project = (await first.locator('strong').first().innerText()).trim();
  await page.getByLabel('Search estimates', { exact: true }).fill(project);
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: project, exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath('actual-estimate-editor.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'All estimates', exact: true })
    .click();
  await expect(first).toBeFocused();
  await expect(
    page.getByLabel('Search estimates', { exact: true }),
  ).toHaveValue(project);
  expect(
    (await new AxeBuilder({ page }).include('.estimate-list').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('actual-estimate-list.png'),
    fullPage: true,
  });
});
