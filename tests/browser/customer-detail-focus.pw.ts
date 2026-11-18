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
        name: 'CustomerDetailFocusFixture',
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
async function open(page: Page, scenario = 'ready') {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
  await page.route('http://127.0.0.1:4393/customer-focus*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Customer detail focus review</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:4393/customer-focus?scenario=' + scenario);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: code });
}
const row = (page: Page, slug = 'straight-edge') =>
  page
    .locator('.record-list > button.record-button')
    .filter({ hasText: `jordan+${slug}@example.test` });
const savedHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Customer details', exact: true });
const close = (page: Page) =>
  page.getByRole('button', { name: 'Close details', exact: true });
const newTrigger = (page: Page) =>
  page.getByRole('button', { name: 'New customer', exact: true });
const search = (page: Page) =>
  page.getByRole('searchbox', { name: 'Search customers', exact: true });
const name = (page: Page) =>
  page.getByRole('textbox', { name: 'Customer name', exact: true });
const counts = (page: Page) =>
  page.evaluate(() => window.customerDirectoryRead.counts());
async function saved(page: Page, slug = 'straight-edge') {
  await expect(row(page, slug)).toBeVisible();
  await row(page, slug).focus();
  await expect(row(page, slug)).toBeFocused();
  await row(page, slug).press('Enter');
  await expect(savedHeading(page)).toBeFocused();
}
test('saved customer keyboard open and explicit close preserve the visible row focus', async ({
  page,
}) => {
  await open(page);
  await expect(row(page)).toBeVisible();
  await row(page).evaluate((el) =>
    el.addEventListener(
      'keydown',
      (e) =>
        el.setAttribute(
          'data-open-key',
          `${(e as KeyboardEvent).key}:${e.isTrusted}`,
        ),
      { once: true },
    ),
  );
  await saved(page);
  expect(await row(page).getAttribute('data-open-key')).toBe('Enter:true');
  await expect(savedHeading(page)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Tab');
  await expect(close(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page)).toBeFocused();
  await expect(savedHeading(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 1,
    access: 1,
    modules: 1,
    writes: 0,
  });
});
test('new customer mount and close return focus without submitting a command', async ({
  page,
}) => {
  await open(page);
  await expect(row(page)).toBeVisible();
  await newTrigger(page).focus();
  await newTrigger(page).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'New customer', exact: true }),
  ).toBeFocused();
  await expect(name(page)).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Create customer', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(close(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(newTrigger(page)).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'New customer', exact: true }),
  ).toHaveCount(0);
  expect((await counts(page)).writes).toBe(0);
});
test('closing a saved detail whose row is filtered out focuses the current search', async ({
  page,
}) => {
  await open(page);
  await saved(page);
  await search(page).fill('no matching focus record');
  await expect(
    page.getByText('No customers match this view.', { exact: true }),
  ).toBeVisible();
  await expect(row(page)).toHaveCount(0);
  await close(page).press('Enter');
  await expect(search(page)).toBeFocused();
  await expect(search(page)).toHaveValue('no matching focus record');
  await expect(savedHeading(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 2,
    access: 1,
    modules: 1,
    writes: 0,
  });
});
test('directory read reload does not steal dirty detail focus or reset local fields', async ({
  page,
}) => {
  await open(page);
  await saved(page);
  await name(page).fill('Unsaved local customer field');
  await page.evaluate(() => window.customerDirectoryRead.failNext());
  await search(page).fill('jordan');
  await expect(page.getByRole('alert')).toHaveText(
    'Customer directory read temporarily unavailable.',
  );
  await page.evaluate(() => window.customerDirectoryRead.holdNext());
  await page
    .getByRole('button', { name: 'Reload customer directory', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.customerDirectoryRead.waiting()))
    .toBe(true);
  await name(page).focus();
  await expect(name(page)).toBeFocused();
  await page.evaluate(() => window.customerDirectoryRead.release());
  await expect(row(page)).toBeVisible();
  await expect(name(page)).toBeFocused();
  await expect(name(page)).toHaveValue('Unsaved local customer field');
  await expect(savedHeading(page)).not.toBeFocused();
  expect(await counts(page)).toEqual({
    reads: 3,
    access: 1,
    modules: 1,
    writes: 0,
  });
});
test('actual company-keyed unmount cannot return focus to detached old-company nodes', async ({
  page,
}) => {
  await open(page);
  await saved(page);
  const oldHeading = await savedHeading(page).elementHandle();
  await page.evaluate(() => window.customerDirectoryRead.company(1));
  await expect(row(page, 'cunningham')).toBeVisible();
  expect(await oldHeading!.evaluate((el) => el.isConnected)).toBe(false);
  await expect(savedHeading(page)).toHaveCount(0);
  await expect(row(page)).toHaveCount(0);
  await saved(page, 'cunningham');
  await expect(
    page.getByRole('textbox', { name: 'Email', exact: true }),
  ).toHaveValue('jordan+cunningham@example.test');
  await close(page).press('Enter');
  await expect(row(page, 'cunningham')).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Cunningham Construction',
  );
  expect(await counts(page)).toEqual({
    reads: 2,
    access: 2,
    modules: 2,
    writes: 0,
  });
});
test('inline detail focus remains accessible and contained on responsive profiles', async ({
  page,
}, testInfo) => {
  await open(page);
  await saved(page);
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
    path: testInfo.outputPath('customer-detail-focused.png'),
    fullPage: true,
  });
  await close(page).press('Enter');
  await expect(row(page)).toBeFocused();
  expect((await counts(page)).writes).toBe(0);
});
