import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
let script = '',
  css = '';
test.beforeAll(async () => {
  const bundled = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/job-finder.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'JobFinderTest',
      },
    },
  });
  const result = Array.isArray(bundled) ? bundled[0] : bundled;
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
  await page.route('https://job-finder.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Job finder fixture</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://job-finder.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.getByText('Find a job', { exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Loaded job finder' }),
  ).toBeVisible();
}
const search = (page: Page) =>
  page.getByLabel('Search loaded jobs by name or ID');
const first = (page: Page) =>
  page.getByRole('button', {
    name: 'Open job Case-sensitive [Scope] job (synthetic-job-0-00)',
    exact: true,
  });
const unavailable =
  'This job is unavailable or has changed. Refresh job costs before opening it.';

test('literal search, independent pages and shrink preserve exact selection with no writes', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('status').first()).toContainText(
    '12 matching of 12 loaded jobs',
  );
  await expect(page.getByRole('listitem')).toHaveCount(5);
  await page.getByRole('button', { name: 'Next jobs', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Page 2 of 3');
  await search(page).fill('[SCOPE]');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('selected-job')).toHaveText(
    'synthetic-job-0-00',
  );
  await search(page).fill('synthetic-job-0-11');
  await page
    .getByRole('button', {
      name: 'Open job Job 11 (synthetic-job-0-11)',
      exact: true,
    })
    .click();
  await expect(page.getByTestId('selected-job')).toHaveText(
    'synthetic-job-0-11',
  );
  expect(await page.evaluate(() => window.jobFinder.counts())).toEqual({
    reads: 1,
    selections: 1,
    writes: 0,
  });
  await page.getByRole('button', { name: 'Clear job search' }).click();
  await page.getByRole('button', { name: 'Next jobs', exact: true }).click();
  await page.getByRole('button', { name: 'Next jobs', exact: true }).click();
  await page.evaluate(() => window.jobFinder.shrink());
  await expect(page.getByRole('status').first()).toContainText('Page 1 of 1');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('selected-job')).toHaveText(
    'synthetic-job-0-11',
  );
});

test('pre-read denial and post-read module withdrawal do not navigate', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.jobFinder.deny());
  await first(page).click();
  await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Matching loaded jobs' }),
  ).toHaveCount(0);
  await search(page).fill('Job');
  await expect(
    page.getByRole('list', { name: 'Matching loaded jobs' }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.jobFinder.counts())).toEqual({
    reads: 0,
    selections: 0,
    writes: 0,
  });
  await open(page);
  await page.evaluate(() => window.jobFinder.holdRead());
  await first(page).click();
  await expect
    .poll(() => page.evaluate(() => window.jobFinder.counts().reads))
    .toBe(1);
  await page.evaluate(() => {
    window.jobFinder.disable();
    window.jobFinder.release();
  });
  await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.jobFinder.counts())).toEqual({
    reads: 1,
    selections: 0,
    writes: 0,
  });
});

test('foreign, duplicate, missing, changed and unavailable fresh evidence deny without private errors', async ({
  page,
}) => {
  for (const value of ['foreign', 'duplicate', 'missing', 'changed', 'error']) {
    await open(page);
    await page.evaluate((v) => window.jobFinder.corrupt(v), value);
    await first(page).click();
    await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Matching loaded jobs' }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.jobFinder.counts())).toEqual({
      reads: 1,
      selections: 0,
      writes: 0,
    });
    await expect(
      page.getByText('PRIVATE_RAW_ERROR', { exact: true }),
    ).toHaveCount(0);
  }
});

test('final authority wait source changes and detached old company reads cannot navigate', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.jobFinder.holdAuthority());
  await first(page).click();
  await expect
    .poll(() => page.evaluate(() => window.jobFinder.counts().reads))
    .toBe(1);
  await page.evaluate(() => {
    window.jobFinder.mutateLoaded();
    window.jobFinder.release();
  });
  await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.jobFinder.counts().selections)).toBe(
    0,
  );
  await open(page);
  await page.evaluate(() => window.jobFinder.holdRead());
  await first(page).click();
  await expect
    .poll(() => page.evaluate(() => window.jobFinder.counts().reads))
    .toBe(1);
  await page.evaluate(() => window.jobFinder.company(1));
  await expect(page.getByTestId('selected-job')).toHaveText(
    'synthetic-job-1-00',
  );
  await page
    .getByRole('button', {
      name: 'Open job Case-sensitive [Scope] job (synthetic-job-1-00)',
      exact: true,
    })
    .click();
  await page.evaluate(() => window.jobFinder.release());
  await expect(
    page.getByText('Job selected. Review its details below.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.jobFinder.counts())).toEqual({
    reads: 2,
    selections: 1,
    writes: 0,
  });
  await expect(page.getByTestId('selected-job')).toHaveText(
    'synthetic-job-1-00',
  );
});

test('duplicate clicks open once and literal unmatched input remains text', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.jobFinder.holdRead());
  await first(page).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect
    .poll(() => page.evaluate(() => window.jobFinder.counts().reads))
    .toBe(1);
  await page.evaluate(() => window.jobFinder.release());
  await expect(
    page.getByText('Job selected. Review its details below.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.jobFinder.counts())).toEqual({
    reads: 1,
    selections: 1,
    writes: 0,
  });
  await search(page).fill('<img onerror=alert(1)>');
  await expect(
    page.getByText('No loaded jobs match this search.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
});

test('actual Jobs preserves the entered forecast while filtering and supports keyboard and responsive use', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4353/preview');
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await page
    .getByText('Update remaining costs & warning thresholds', { exact: true })
    .click();
  await page.getByLabel('Remaining materials', { exact: true }).fill('123.45');
  await page.getByText('Find a job', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await search(page).fill('no-matching-job');
  await expect(
    page.getByText('No loaded jobs match this search.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Remaining materials', { exact: true }),
  ).toHaveValue('123.45');
  await page.getByRole('button', { name: 'Clear job search' }).click();
  const button = page
    .getByRole('region', { name: 'Loaded job finder' })
    .getByRole('button', { name: /^Open job / })
    .first();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Job selected. Review its details below.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Remaining materials', { exact: true }),
  ).toHaveValue('123.45');
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Loaded job finder"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('actual-job-finder.png'),
    fullPage: true,
  });
  expect(
    (await readFile(info.outputPath('actual-job-finder.png'))).length,
  ).toBeGreaterThan(1000);
});
