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
          new URL('./fixtures/estimate-read-state.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'EstimateReadStateTest',
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
  await page.route('https://estimate-read-state.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Estimate navigation</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-read-state.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
}
const refresh = (page: Page) =>
  page.getByRole('button', { name: 'Refresh estimates', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(() => window.estimateReadReview.snapshot());
const search = (page: Page) =>
  page.getByLabel('Search estimates', { exact: true });
const filter = (page: Page) =>
  page.getByRole('combobox', { name: 'Estimate status', exact: true });
const noMatch = (page: Page) =>
  page.getByText('No loaded estimates match these filters.', { exact: true });
const unavailable =
  'This estimate is unavailable or has changed. Refresh estimates before opening it.';
const initial = {
  list: 1,
  templates: 1,
  defaults: 1,
  catalog: 1,
  taxes: 1,
  customers: 1,
  get: 0,
};
const second = {
  list: 2,
  templates: 2,
  defaults: 2,
  catalog: 2,
  taxes: 2,
  customers: 2,
  get: 0,
};

test('held filtered refresh suppresses the old no-match message', async ({
  page,
}, info) => {
  await open(page);
  expect((await snapshot(page)).reads[0]).toEqual(initial);
  await search(page).fill('No saved record has this name');
  await filter(page).selectOption('issued');
  await expect(noMatch(page)).toBeVisible();
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  expect((await snapshot(page)).writes).toBe(0);
  await page.evaluate(() => window.estimateReadReview.hold());
  await refresh(page).click();
  await expect.poll(async () => (await snapshot(page)).waiting).toBe(true);
  await expect(refresh(page)).toBeDisabled();
  expect((await snapshot(page)).writes).toBe(0);
  await info.attach('held-read-observation', {
    body: JSON.stringify({
      snapshot: await snapshot(page),
      noMatchVisible: await noMatch(page).isVisible(),
      cards: await page.locator('.p3-totals').innerText(),
      rows: await page.locator('.estimate-list-row').count(),
    }),
    contentType: 'application/json',
  });
  await expect(noMatch(page)).toHaveCount(0);
  await expect(page.locator('.p3-workspace')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(search(page)).toHaveValue('No saved record has this name');
  await expect(filter(page)).toHaveValue('issued');
  await page.screenshot({
    path: info.outputPath('filtered-estimate-loading-without-false-empty.png'),
    fullPage: true,
  });
  await page.evaluate(() => window.estimateReadReview.release());
  await expect(refresh(page)).toBeEnabled();
  await expect(noMatch(page)).toBeVisible();
  await expect(page.getByRole('status').last()).toContainText('page 1 of 1');
  await expect(search(page)).toHaveValue('No saved record has this name');
  await expect(filter(page)).toHaveValue('issued');
  expect((await snapshot(page)).reads[0]).toEqual(second);
  expect((await snapshot(page)).writes).toBe(0);
});

test('held populated refresh hides old rows and numeric count cards until success', async ({
  page,
}, info) => {
  await open(page);
  await expect(page.locator('.p3-totals strong').nth(0)).toHaveText('1');
  await expect(page.locator('.p3-totals strong').nth(1)).toHaveText('1');
  await page.evaluate(() => window.estimateReadReview.hold());
  await refresh(page).click();
  await expect.poll(async () => (await snapshot(page)).waiting).toBe(true);
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  await expect(page.locator('.p3-totals strong').nth(0)).toHaveText('—');
  await expect(page.locator('.p3-totals strong').nth(1)).toHaveText('—');
  await expect(noMatch(page)).toHaveCount(0);
  await expect(page.getByRole('status').last()).not.toContainText(
    'matching loaded estimates',
  );
  await page.screenshot({
    path: info.outputPath('populated-estimate-refresh-pending.png'),
    fullPage: true,
  });
  await page.evaluate(() => window.estimateReadReview.release());
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  await expect(page.locator('.p3-totals strong').nth(0)).toHaveText('1');
  await expect(page.locator('.p3-totals strong').nth(1)).toHaveText('1');
  expect((await snapshot(page)).reads[0]).toEqual(second);
  expect((await snapshot(page)).writes).toBe(0);
});

test('backend denial is sanitized and recovery requires another explicit refresh', async ({
  page,
}, info) => {
  await open(page);
  await page.evaluate(() => window.estimateReadReview.deny(true));
  await refresh(page).click();
  await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  await expect(noMatch(page)).toHaveCount(0);
  await expect(page.locator('.p3-totals strong').nth(0)).toHaveText('—');
  await expect(page.locator('.p3-workspace')).not.toContainText(
    'PRIVATE_BACKEND_READ_FAILURE',
  );
  expect((await snapshot(page)).reads[0]).toEqual({ ...initial, list: 2 });
  await page.screenshot({
    path: info.outputPath('estimate-read-denied.png'),
    fullPage: true,
  });
  await page.evaluate(() => window.estimateReadReview.deny(false));
  expect((await snapshot(page)).reads[0].list).toBe(2);
  await expect(page.locator('.estimate-list-row')).toHaveCount(0);
  await refresh(page).click();
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  expect((await snapshot(page)).reads[0]).toEqual({ ...second, list: 3 });
  expect((await snapshot(page)).writes).toBe(0);
});

test('App-keyed company change ignores a late old-company rejection without cancelling its read', async ({
  page,
}) => {
  await open(page);
  const old = await snapshot(page);
  await page.evaluate(() => window.estimateReadReview.hold());
  await refresh(page).click();
  await expect.poll(async () => (await snapshot(page)).waiting).toBe(true);
  await page.evaluate(() => {
    window.estimateReadReview.company(1);
    window.estimateReadReview.deny(true, 0);
  });
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  const next = await snapshot(page);
  expect(next.company).not.toBe(old.company);
  await expect(page.locator('.estimate-list-row')).toContainText(
    next.facts.map((v) => v.name),
  );
  await page.evaluate(() => window.estimateReadReview.release());
  await expect.poll(async () => (await snapshot(page)).rejected[0]).toBe(1);
  await expect(page.getByText(unavailable, { exact: true })).toHaveCount(0);
  await expect(page.locator('.estimate-list-row')).toContainText(
    next.facts.map((v) => v.name),
  );
  expect((await snapshot(page)).reads[1]).toEqual(initial);
  expect((await snapshot(page)).writes).toBe(0);
});

test('successful refresh retains original guarded saved-estimate opening', async ({
  page,
}) => {
  await open(page);
  await refresh(page).click();
  await expect
    .poll(async () => (await snapshot(page)).reads[0])
    .toEqual(second);
  const facts = (await snapshot(page)).facts;
  const target = facts.find((v) => v.status === 'issued')!;
  const row = page.locator('.estimate-list-row').filter({ hasText: 'issued' });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: target.name, exact: true }),
  ).toBeFocused();
  expect((await snapshot(page)).reads[0].get).toBe(1);
  expect((await snapshot(page)).writes).toBe(0);
});

test('trusted keyboard refresh stays accessible and responsive', async ({
  page,
}, info) => {
  await open(page);
  await refresh(page).focus();
  await expect(refresh(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await snapshot(page)).reads[0])
    .toEqual(second);
  await expect(page.locator('.p3-workspace')).toHaveAttribute(
    'aria-busy',
    'false',
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
  expect((await snapshot(page)).writes).toBe(0);
  await page.screenshot({
    path: info.outputPath('current-estimate-read-ready.png'),
    fullPage: true,
  });
});
