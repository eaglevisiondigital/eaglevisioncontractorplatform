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
          new URL('./fixtures/job-original-scope.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'DashboardParityTest',
      },
    },
  });
  const output = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in output)) throw Error('Dashboard test bundle unavailable');
  script = output.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = output.output
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
  await page.route('https://job-scope.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Original scope fixture</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://job-scope.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.getByText('Original job scope', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Load original scope', exact: true }),
  ).toBeVisible();
}
const reference = (page: Page) =>
  page.getByRole('region', {
    name: 'Original job scope reference',
    exact: true,
  });
const load = (page: Page) =>
  page.getByRole('button', { name: 'Load original scope', exact: true });
const download = (page: Page) =>
  page.getByRole('button', {
    name: 'Download original scope reference',
    exact: true,
  });
const unavailable =
  'Original job scope is unavailable or no longer matches this job. Refresh job costs before trying a new read.';

test('loads and downloads the exact original scope with an allowlisted projection and no commands', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  await expect(reference(page)).toBeVisible();
  await expect(reference(page).locator('tbody tr').first()).toBeVisible();
  const event = page.waitForEvent('download');
  await download(page).click();
  const file = await event;
  expect(file.suggestedFilename()).toBe('original-job-scope.json');
  const value = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(Object.keys(value).sort()).toEqual(
    [
      'kind',
      'organization_id',
      'job_id',
      'job_name',
      'issued_version_id',
      'observed_job_revision',
      'lines',
    ].sort(),
  );
  expect(value.kind).toBe('internal_original_job_scope_v1');
  for (const line of value.lines) {
    expect(
      await reference(page)
        .getByText(line.description, { exact: true })
        .innerText(),
    ).toBe(line.description);
    expect(
      await reference(page).getByText(line.id, { exact: true }).innerText(),
    ).toBe(line.id);
  }
  expect(value.lines.length).toBeGreaterThan(0);
  for (const line of value.lines)
    expect(Object.keys(line).sort()).toEqual(
      ['id', 'kind', 'description', 'quantity_milli', 'unit'].sort(),
    );
  expect(JSON.stringify(value)).not.toMatch(
    /internal_note|unit_cost_minor|unit_price_minor|markup_bps|revenue_minor|authorization_reference/,
  );
  expect(await page.evaluate(() => window.jobOriginalScope.counts())).toEqual({
    reads: 2,
    writes: 0,
  });
});

test('post-read permission or module withdrawal withholds the view and download', async ({
  page,
}) => {
  for (const kind of ['deny', 'disable'] as const) {
    await open(page);
    await load(page).click();
    await expect(reference(page)).toBeVisible();
    await page.evaluate(() => window.jobOriginalScope.hold());
    const downloads: string[] = [];
    const onDownload = () => downloads.push('unexpected');
    page.on('download', onDownload);
    await download(page).click();
    await expect(reference(page)).toHaveCount(0);
    await expect(download(page)).toBeDisabled();
    await page.evaluate((value) => window.jobOriginalScope[value](), kind);
    await page.evaluate(() => window.jobOriginalScope.release());
    await expect(page.getByRole('status')).toHaveText(unavailable);
    await expect(reference(page)).toHaveCount(0);
    expect(downloads).toEqual([]);
    page.off('download', onDownload);
    expect(
      (await page.evaluate(() => window.jobOriginalScope.counts())).writes,
    ).toBe(0);
  }
});

test('foreign, duplicate, replaced baseline and malformed scope results deny instead of salvaging rows', async ({
  page,
}) => {
  for (const kind of ['tenant', 'duplicate', 'baseline', 'quantity']) {
    await open(page);
    await page.evaluate(
      (value) => window.jobOriginalScope.corrupt(value),
      kind,
    );
    await load(page).click();
    await expect(page.getByRole('status')).toHaveText(unavailable);
    await expect(reference(page)).toHaveCount(0);
  }
  await open(page);
  await page.evaluate(() => window.jobOriginalScope.fail());
  await load(page).click();
  await expect(page.getByRole('status')).toHaveText(unavailable);
  await expect(
    page.getByText('Synthetic private error must not be displayed', {
      exact: true,
    }),
  ).toHaveCount(0);
});

test('old reads and denied old authority cannot download or invalidate a new company scope', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.jobOriginalScope.hold());
  const downloaded: unknown[] = [];
  const event = (d: unknown) => downloaded.push(d);
  page.on('download', event);
  await download(page).click();
  await expect(download(page)).toBeDisabled();
  await page.evaluate(() => window.jobOriginalScope.select(1));
  await expect(download(page)).toBeEnabled();
  await load(page).click();
  await expect(reference(page)).toBeVisible();
  const fresh = await reference(page).innerText();
  await page.evaluate(() => window.jobOriginalScope.denyPrevious());
  await page.evaluate(() => window.jobOriginalScope.release());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(reference(page)).toHaveText(fresh, { useInnerText: true });
  expect(downloaded).toEqual([]);
  page.off('download', event);
  expect(
    (await page.evaluate(() => window.jobOriginalScope.counts())).writes,
  ).toBe(0);
});

test('read-only scope does not release an existing UNKNOWN forecast hold and duplicate clicks make one read', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.jobOriginalScope.unknown());
  await page.evaluate(() => window.jobOriginalScope.hold());
  await load(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(load(page)).toBeDisabled();
  expect(
    (await page.evaluate(() => window.jobOriginalScope.counts())).reads,
  ).toBe(1);
  await page.evaluate(() => window.jobOriginalScope.release());
  await expect(reference(page)).toBeVisible();
  expect(await page.evaluate(() => window.jobOriginalScope.held())).toBe(true);
  expect(
    (await page.evaluate(() => window.jobOriginalScope.counts())).writes,
  ).toBe(0);
});

test('actual Jobs exposes its original scope without losing an entered forecast and remains responsive', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4351/preview');
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  const scope = page.getByText('Original job scope', { exact: true });
  await scope.focus();
  await page.keyboard.press('Enter');
  await load(page).click();
  await expect(reference(page)).toBeVisible();
  await page
    .getByText('Update remaining costs & warning thresholds', { exact: true })
    .click();
  const material = page.getByLabel('Remaining materials', { exact: true });
  await material.fill('123.45');
  await scope.click();
  await scope.click();
  await expect(material).toHaveValue('123.45');
  await expect(reference(page)).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('actual-job-original-scope.png'),
    fullPage: true,
  });
});
