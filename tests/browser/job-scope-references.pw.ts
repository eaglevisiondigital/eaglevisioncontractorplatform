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
          new URL('./fixtures/job-scope-references.tsx', import.meta.url),
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
  await page.route('https://job-scope-references.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Original scope fixture</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://job-scope-references.test/fixture');
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

test('source and line identifiers stay collapsed until explicitly requested by keyboard', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  const ids = await page.evaluate(() =>
    window.jobScopeReferences.identifiers(),
  );
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toBeHidden();
  await expect(
    reference(page).getByText(ids.firstLine, { exact: true }),
  ).toBeHidden();
  const before = await page.evaluate(() => window.jobScopeReferences.counts());
  const source = reference(page).getByText('Source references', {
    exact: true,
  });
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toBeVisible();
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toContainText(ids.job);
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toContainText(ids.version);
  const row = reference(page).locator('tbody tr').first();
  await row.getByText('Line reference', { exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(row.getByText(ids.firstLine, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.jobScopeReferences.counts())).toEqual(
    before,
  );
});

test('reference disclosures have readable labels and touch targets without exposing identifiers in the closed row name', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  const ids = await page.evaluate(() =>
    window.jobScopeReferences.identifiers(),
  );
  const source = reference(page).getByText('Source references', {
    exact: true,
  });
  const row = reference(page).locator('tbody tr').first();
  const line = row.getByText('Line reference', { exact: true });
  for (const control of [source, line]) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await expect(line).toHaveAccessibleName(
    'Line reference for North [West] panel 1',
  );
  await expect(row.getByRole('rowheader')).not.toHaveAccessibleName(
    new RegExp(ids.firstLine),
  );
  await line.click();
  await expect(row.getByText(ids.firstLine, { exact: true })).toBeVisible();
  await line.focus();
  await page.keyboard.press('Enter');
  await expect(row.getByText(ids.firstLine, { exact: true })).toBeHidden();
  await expect(line).toBeFocused();
});

test('closed references and filtered rows retain the complete exact downloadable source identity', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  const ids = await page.evaluate(() =>
    window.jobScopeReferences.identifiers(),
  );
  await page.evaluate(() => window.jobScopeReferences.unknown());
  await page
    .getByRole('searchbox', { name: 'Find original scope lines', exact: true })
    .fill('[west]');
  await page
    .getByRole('combobox', { name: 'Original scope kind', exact: true })
    .selectOption('labor');
  await expect(reference(page).locator('tbody tr')).toHaveCount(2);
  const event = page.waitForEvent('download');
  await download(page).click();
  const file = await event;
  const value = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(value.job_id).toBe(ids.job);
  expect(value.issued_version_id).toBe(ids.version);
  expect(value.observed_job_revision).toBe(ids.revision);
  expect(value.lines).toHaveLength(18);
  expect(value.lines[0].id).toBe(ids.firstLine);
  for (const line of value.lines)
    expect(Object.keys(line).sort()).toEqual([
      'description',
      'id',
      'kind',
      'quantity_milli',
      'unit',
    ]);
  expect(JSON.stringify(value)).not.toMatch(
    /PRIVATE|internal_note|unit_cost_minor|unit_price_minor|authorization_reference/,
  );
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toBeHidden();
  await expect(
    reference(page).getByText(ids.firstLine, { exact: true }),
  ).toBeHidden();
  expect(await page.evaluate(() => window.jobScopeReferences.held())).toBe(
    true,
  );
  expect(
    (await page.evaluate(() => window.jobScopeReferences.counts())).writes,
  ).toBe(0);
});

test('line references stay paired with exact rows while existing scope filters and reset remain read only', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  const before = await page.evaluate(() => window.jobScopeReferences.counts());
  const ids = await page.evaluate(() =>
    window.jobScopeReferences.identifiers(),
  );
  await reference(page).getByText('Source references', { exact: true }).click();
  await reference(page)
    .locator('tbody tr')
    .first()
    .getByText('Line reference', { exact: true })
    .click();
  const search = page.getByRole('searchbox', {
    name: 'Find original scope lines',
    exact: true,
  });
  await search.fill('[west]');
  await page
    .getByRole('combobox', { name: 'Original scope kind', exact: true })
    .selectOption('labor');
  await expect(reference(page).locator('tbody tr')).toHaveCount(2);
  await expect(
    reference(page).getByText(ids.firstLine, { exact: true }),
  ).toHaveCount(0);
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reset scope filters', exact: true })
    .click();
  await expect(search).toBeFocused();
  await expect(reference(page).locator('tbody tr')).toHaveCount(18);
  await expect(
    reference(page).getByText(ids.firstLine, { exact: true }),
  ).toBeHidden();
  expect(await page.evaluate(() => window.jobScopeReferences.counts())).toEqual(
    before,
  );
});

test('a new read or withdrawn source context unmounts old metadata and starts with closed references', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  const old = await page.evaluate(() =>
    window.jobScopeReferences.identifiers(),
  );
  await reference(page).getByText('Source references', { exact: true }).click();
  await reference(page)
    .locator('tbody tr')
    .first()
    .getByText('Line reference', { exact: true })
    .click();
  await page.evaluate(() => window.jobScopeReferences.hold());
  await load(page).click();
  await expect
    .poll(() => page.evaluate(() => window.jobScopeReferences.waiting()))
    .toBe(true);
  await expect(reference(page)).toHaveCount(0);
  expect(await page.locator('body').textContent()).not.toContain(old.job);
  await page.evaluate(() => window.jobScopeReferences.release());
  await expect(reference(page)).toBeVisible();
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toBeHidden();
  await expect(
    reference(page).getByText(old.firstLine, { exact: true }),
  ).toBeHidden();
  await reference(page).getByText('Source references', { exact: true }).click();
  const snapshot = await page.evaluate(() =>
    window.jobScopeReferences.selectSnapshot(1),
  );
  expect(snapshot.privateViewPresent).toBe(false);
  expect(await page.locator('body').textContent()).not.toContain(old.job);
  await load(page).click();
  await expect(
    reference(page).getByText(/Original issued version/),
  ).toBeHidden();
  await page.evaluate(() => window.jobScopeReferences.deny());
  await load(page).click();
  await expect(page.getByRole('status')).toHaveText(unavailable);
  await expect(reference(page)).toHaveCount(0);
});

test('actual Jobs keeps business scope readable and reference disclosures accessible without losing a forecast', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4375/preview');
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await page
    .getByText('Update remaining costs & warning thresholds', { exact: true })
    .click();
  const forecast = page.getByLabel('Remaining materials', { exact: true });
  await forecast.fill('123.45');
  await page.getByText('Original job scope', { exact: true }).click();
  await load(page).click();
  const metadata = reference(page).getByText(/Original issued version/);
  await expect(metadata).toBeHidden();
  const source = reference(page).getByText('Source references', {
    exact: true,
  });
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(metadata).toBeVisible();
  const firstRow = reference(page).locator('tbody tr').first();
  const line = firstRow.getByText('Line reference', { exact: true });
  await line.focus();
  await page.keyboard.press('Enter');
  await expect(firstRow.locator('small')).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Original job scope reference"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await reference(page).screenshot({
    path: info.outputPath('actual-open-scope-references.png'),
  });
  await line.focus();
  await page.keyboard.press('Enter');
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(metadata).toBeHidden();
  await expect(firstRow.locator('small')).toBeHidden();
  await expect(forecast).toHaveValue('123.45');
  await reference(page).screenshot({
    path: info.outputPath('actual-collapsed-scope-references.png'),
  });
  await page.screenshot({
    path: info.outputPath('actual-jobs-readable-scope.png'),
    fullPage: true,
  });
});
