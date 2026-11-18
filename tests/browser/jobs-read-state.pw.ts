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
          new URL('./fixtures/jobs-read-state.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'JobsReadStateFixture',
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
  await page.route('http://127.0.0.1:4382/jobs*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Jobs read review</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:4382/jobs?scenario=' + scenario);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: code });
}
const emptyMessage = (page: Page) =>
  page.getByText(
    'No jobs yet. Internally issue an estimate, then explicitly approve its job baseline. This does not represent customer acceptance.',
    { exact: true },
  );
const refresh = (page: Page) =>
  page.getByRole('button', { name: 'Refresh job costs', exact: true });
const selected = (page: Page) =>
  page.getByRole('combobox', { name: 'Financial job', exact: true });
const counts = (page: Page) =>
  page.evaluate(() => window.jobsReadState.counts());
async function readError(page: Page) {
  await expect(page.getByRole('alert')).toHaveText(
    'Job records temporarily unavailable.',
  );
  await expect(emptyMessage(page)).toHaveCount(0);
  await expect(selected(page)).toHaveCount(0);
}
async function ready(page: Page) {
  await expect(selected(page)).toBeEnabled();
  await expect(emptyMessage(page)).toHaveCount(0);
}
test('read failure does not claim there are no jobs and explicit refresh recovers', async ({
  page,
}) => {
  await open(page);
  await readError(page);
  expect(await counts(page)).toEqual({
    reads: 1,
    initialization: 1,
    writes: 1,
  });
  await refresh(page).click();
  await ready(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 2,
    initialization: 1,
    writes: 1,
  });
});
test('pending job read does not claim an empty list', async ({ page }) => {
  await open(page, 'loading');
  await expect
    .poll(() => page.evaluate(() => window.jobsReadState.waiting()))
    .toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Job financial dashboard' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'Loading workspace records…',
  );
  await expect(emptyMessage(page)).toHaveCount(0);
  await expect(selected(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 1,
    initialization: 1,
    writes: 1,
  });
  await page.evaluate(() => window.jobsReadState.release());
  await ready(page);
  expect(await counts(page)).toEqual({
    reads: 1,
    initialization: 1,
    writes: 1,
  });
});
test('successful empty read preserves the original baseline guidance without automatic reads', async ({
  page,
}) => {
  await open(page, 'empty');
  await expect(emptyMessage(page)).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(selected(page)).toHaveCount(0);
  const stable = await counts(page);
  expect(stable).toEqual({ reads: 1, initialization: 1, writes: 1 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await counts(page)).toEqual(stable);
  await refresh(page).click();
  await expect.poll(async () => (await counts(page)).reads).toBe(2);
  await expect(emptyMessage(page)).toBeVisible();
  expect(await counts(page)).toEqual({
    reads: 2,
    initialization: 1,
    writes: 1,
  });
});
test('a failed refresh removes loaded job details without declaring no jobs', async ({
  page,
}) => {
  await open(page, 'ready');
  await ready(page);
  const original = await selected(page).inputValue();
  await page.evaluate(() => window.jobsReadState.failNext());
  await refresh(page).click();
  await readError(page);
  expect(await counts(page)).toEqual({
    reads: 2,
    initialization: 1,
    writes: 1,
  });
  await refresh(page).click();
  await ready(page);
  await expect(selected(page)).toHaveValue(original);
  expect(await counts(page)).toEqual({
    reads: 3,
    initialization: 1,
    writes: 1,
  });
});
test('actual workspace company boundary masks a late old-company job read', async ({
  page,
}) => {
  await open(page, 'loading');
  await expect
    .poll(() => page.evaluate(() => window.jobsReadState.waiting()))
    .toBe(true);
  const old = await page.evaluate(() => window.jobsReadState.loaded()[0]);
  await page.evaluate(() => window.jobsReadState.company(1));
  await ready(page);
  const current = await page.evaluate(() =>
    window.jobsReadState
      .loaded()
      .find((row) => row.organization === 'sample-construction')!,
  );
  await expect(selected(page)).toHaveValue(current.ids[0]);
  await page.evaluate(() => window.jobsReadState.release());
  await expect
    .poll(() => page.evaluate(() => window.jobsReadState.completed()))
    .toContain('sample-property');
  await expect(selected(page)).toHaveValue(current.ids[0]);
  expect(await selected(page).inputValue()).not.toBe(old.ids[0]);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Cunningham Construction',
  );
  await expect(emptyMessage(page)).toHaveCount(0);
  expect(await counts(page)).toEqual({
    reads: 2,
    initialization: 2,
    writes: 2,
  });
});
test('successful empty state retains named keyboard refresh and responsive accessibility', async ({
  page,
}, testInfo) => {
  await open(page, 'empty');
  await expect(emptyMessage(page)).toBeVisible();
  await refresh(page).focus();
  await expect(refresh(page)).toBeFocused();
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
    path: testInfo.outputPath('jobs-successful-empty.png'),
    fullPage: true,
  });
  await refresh(page).press('Enter');
  await expect.poll(async () => (await counts(page)).reads).toBe(2);
  await expect(emptyMessage(page)).toBeVisible();
  expect(await counts(page)).toEqual({
    reads: 2,
    initialization: 1,
    writes: 1,
  });
});
