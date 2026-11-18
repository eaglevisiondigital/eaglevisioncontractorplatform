import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
let code = '',
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
          new URL('./fixtures/customer-directory-read.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'CustomerDirectoryReadFixture',
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result))
    throw Error('Existing-engine workspace fixture bundle required');
  code = result.output
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
  css = result.output
    .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
    .map((item) => (item.type === 'asset' ? String(item.source) : ''))
    .join('\n');
});
async function open(page: Page, scenario = 'error') {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
  await page.route('http://127.0.0.1:4384/customers*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Customer-directory read review</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:4384/customers?scenario=' + scenario);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: code });
}
const reload = (page: Page) =>
  page.getByRole('button', { name: 'Reload customer directory', exact: true });
const empty = (page: Page) =>
  page.getByText('No customers match this view.', { exact: true });
const records = (page: Page) =>
  page.locator('.record-list > button.record-button');
const currentRow = (page: Page, slug = 'straight-edge') =>
  records(page).filter({ hasText: `jordan+${slug}@example.test` });
const counts = (page: Page) =>
  page.evaluate(() => window.customerDirectoryRead.counts());
const search = (page: Page) =>
  page.getByRole('searchbox', { name: 'Search customers', exact: true });
const kind = (page: Page) =>
  page.getByRole('combobox', { name: 'Customer type', exact: true });
async function failed(page: Page) {
  await open(page);
  await expect(page.getByRole('alert')).toHaveText(
    'Customer directory read temporarily unavailable.',
  );
  await expect(empty(page)).toHaveCount(0);
  await expect(
    page.getByText('0 records · Page 1 of 1', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.pagination')).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 1,
    access: 1,
    modules: 1,
    writes: 0,
  });
}
test('named keyboard reload waits for a new read then opens the existing saved customer', async ({
  page,
}, testInfo) => {
  await failed(page);
  await reload(page).focus();
  await expect(reload(page)).toBeFocused();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('customer-directory-read-error.png'),
    fullPage: true,
  });
  await page.evaluate(() => window.customerDirectoryRead.holdNext());
  const button = await reload(page).elementHandle();
  await button!.evaluate((el) => {
    el.addEventListener('keydown', (e) =>
      el.setAttribute('data-key', `${(e as KeyboardEvent).key}:${e.isTrusted}`),
    );
    el.addEventListener(
      'click',
      (e) => el.setAttribute('data-trusted-click', String(e.isTrusted)),
      { once: true },
    );
  });
  await reload(page).press('Enter');
  expect(await button!.getAttribute('data-key')).toBe('Enter:true');
  expect(await button!.getAttribute('data-trusted-click')).toBe('true');
  await expect
    .poll(() => page.evaluate(() => window.customerDirectoryRead.waiting()))
    .toBe(true);
  await expect(page.getByRole('status')).toHaveText(
    'Loading workspace records…',
  );
  await expect(reload(page)).toHaveCount(0);
  await expect(empty(page)).toHaveCount(0);
  await expect(
    page.getByText('0 records · Page 1 of 1', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.pagination')).toHaveCount(0);
  await expect(records(page)).toHaveCount(0);
  await page.evaluate(() => window.customerDirectoryRead.release());
  await expect(currentRow(page)).toBeVisible();
  expect(await counts(page)).toEqual({
    reads: 2,
    access: 1,
    modules: 1,
    writes: 0,
  });
  await currentRow(page).click();
  await expect(
    page.getByRole('heading', { name: 'Customer details', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Customer name', exact: true }),
  ).toHaveValue('Jordan Example');
  expect((await counts(page)).writes).toBe(0);
});
test('explicit retry preserves the current search, customer type and page query', async ({
  page,
}) => {
  await open(page, 'ready');
  await expect(currentRow(page)).toBeVisible();
  await search(page).fill('jordan');
  await expect.poll(async () => (await counts(page)).reads).toBe(2);
  await expect(currentRow(page)).toBeVisible();
  await kind(page).selectOption('residential');
  await expect.poll(async () => (await counts(page)).reads).toBe(3);
  await expect(currentRow(page)).toBeVisible();
  await page.evaluate(() => window.customerDirectoryRead.failNext());
  await search(page).fill('Jordan');
  await expect(page.getByRole('alert')).toHaveText(
    'Customer directory read temporarily unavailable.',
  );
  await expect(empty(page)).toHaveCount(0);
  await expect(
    page.getByText('0 records · Page 1 of 1', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.pagination')).toHaveCount(0);
  const before = await counts(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await counts(page)).toEqual(before);
  await reload(page).click();
  await expect(currentRow(page)).toBeVisible();
  await expect(search(page)).toHaveValue('Jordan');
  await expect(kind(page)).toHaveValue('residential');
  expect(
    await page.evaluate(() => window.customerDirectoryRead.queries().at(-1)),
  ).toEqual({
    organization: 'sample-property',
    query: 'Jordan',
    kind: 'residential',
    page: 0,
  });
  expect(await counts(page)).toEqual({
    reads: 5,
    access: 1,
    modules: 1,
    writes: 0,
  });
});
test('an actual successful unmatched search retains the empty state without a retry prompt', async ({
  page,
}) => {
  await open(page, 'ready');
  await expect(currentRow(page)).toBeVisible();
  await search(page).fill('no matching zebra customer');
  await expect(empty(page)).toBeVisible();
  await expect(
    page.getByText('0 records · Page 1 of 1', { exact: true }),
  ).toBeVisible();
  await expect(records(page)).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(reload(page)).toHaveCount(0);
  const stable = await counts(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await counts(page)).toEqual(stable);
  expect(stable).toEqual({ reads: 2, access: 1, modules: 1, writes: 0 });
});
test('a filter change during retry cannot display the earlier unfiltered result', async ({
  page,
}) => {
  await failed(page);
  await page.evaluate(() => window.customerDirectoryRead.holdNext());
  await reload(page).click();
  await expect
    .poll(() => page.evaluate(() => window.customerDirectoryRead.waiting()))
    .toBe(true);
  await search(page).fill('no matching zebra customer');
  await expect(empty(page)).toBeVisible();
  await page.evaluate(() => window.customerDirectoryRead.release());
  await expect
    .poll(() =>
      page.evaluate(() => window.customerDirectoryRead.completed().length),
    )
    .toBe(2);
  await expect(search(page)).toHaveValue('no matching zebra customer');
  await expect(empty(page)).toBeVisible();
  await expect(
    page.getByText('0 records · Page 1 of 1', { exact: true }),
  ).toBeVisible();
  await expect(records(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 3,
    access: 1,
    modules: 1,
    writes: 0,
  });
});
test('actual company-keyed parent prevents a late old-company directory from returning', async ({
  page,
}) => {
  await failed(page);
  await page.evaluate(() => window.customerDirectoryRead.holdNext());
  await reload(page).click();
  await expect
    .poll(() => page.evaluate(() => window.customerDirectoryRead.waiting()))
    .toBe(true);
  await page.evaluate(() => window.customerDirectoryRead.company(1));
  await expect(currentRow(page, 'cunningham')).toBeVisible();
  await page.evaluate(() => window.customerDirectoryRead.release());
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.customerDirectoryRead
          .completed()
          .some((q) => q.organization === 'sample-property'),
      ),
    )
    .toBe(true);
  await expect(currentRow(page, 'cunningham')).toBeVisible();
  await expect(currentRow(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Cunningham Construction',
  );
  expect(await counts(page)).toEqual({
    reads: 3,
    access: 2,
    modules: 2,
    writes: 0,
  });
});
test('existing parent role/module gates and backend read denial remain closed', async ({
  page,
}) => {
  await open(page, 'role');
  await expect(
    page.getByRole('heading', { name: 'Access restricted', exact: true }),
  ).toBeVisible();
  await expect(reload(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 0,
    access: 1,
    modules: 1,
    writes: 0,
  });
  await open(page, 'module');
  await expect(
    page.getByRole('heading', { name: 'Module unavailable', exact: true }),
  ).toBeVisible();
  await expect(reload(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 0,
    access: 1,
    modules: 1,
    writes: 0,
  });
  await open(page, 'denied');
  await expect(page.getByRole('alert')).toHaveText(
    'Customer directory access unavailable.',
  );
  await expect(empty(page)).toHaveCount(0);
  await expect(
    page.getByText('0 records · Page 1 of 1', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.pagination')).toHaveCount(0);
  await reload(page).click();
  await expect.poll(async () => (await counts(page)).reads).toBe(2);
  await expect(page.getByRole('alert')).toHaveText(
    'Customer directory access unavailable.',
  );
  await expect(empty(page)).toHaveCount(0);
  await expect(
    page.getByText('0 records · Page 1 of 1', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.pagination')).toHaveCount(0);
  await expect(records(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 2,
    access: 1,
    modules: 1,
    writes: 0,
  });
});
