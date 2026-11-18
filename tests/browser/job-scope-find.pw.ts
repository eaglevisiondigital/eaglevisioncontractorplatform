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
          new URL('./fixtures/job-scope-find.tsx', import.meta.url),
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
  await page.route('https://job-scope-find.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Original scope fixture</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://job-scope-find.test/fixture');
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

test('finds literal original scope descriptions and intersects an exact kind without new reads', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  await expect(reference(page)).toBeVisible();
  const search = page.getByRole('searchbox', {
    name: 'Find original scope lines',
    exact: true,
  });
  await expect(search).toBeVisible();
  const before = await page.evaluate(() => window.jobScopeFind.counts());
  await search.fill('  [west]  ');
  await expect(reference(page).locator('tbody tr')).toHaveCount(9);
  await page
    .getByRole('combobox', { name: 'Original scope kind', exact: true })
    .selectOption('labor');
  await expect(reference(page).locator('tbody tr')).toHaveCount(2);
  await expect(reference(page)).toContainText(
    '2 of 18 original scope lines shown',
  );
  expect(await page.evaluate(() => window.jobScopeFind.counts())).toEqual(
    before,
  );
});

test('literal nonmatches report zero and keyboard reset restores the full loaded scope', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  const search = page.getByRole('searchbox', {
    name: 'Find original scope lines',
    exact: true,
  });
  await expect(search).toBeVisible();
  const before = await page.evaluate(() => window.jobScopeFind.counts());
  await search.fill('.*');
  await expect(reference(page)).toContainText(
    '0 of 18 original scope lines shown',
  );
  await expect(reference(page)).toContainText(
    'No original scope lines match these filters.',
  );
  await expect(reference(page).locator('tbody tr')).toHaveCount(0);
  const kind = page.getByRole('combobox', {
    name: 'Original scope kind',
    exact: true,
  });
  expect(
    await kind
      .locator('option')
      .evaluateAll((options) => options.map((o) => o.getAttribute('value'))),
  ).toEqual(['all', 'material', 'product', 'labor', 'service', 'allowance']);
  await kind.selectOption('allowance');
  const reset = page.getByRole('button', {
    name: 'Reset scope filters',
    exact: true,
  });
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(kind).toHaveValue('all');
  await expect(reference(page).locator('tbody tr')).toHaveCount(18);
  expect(await page.evaluate(() => window.jobScopeFind.counts())).toEqual(
    before,
  );
});

test('filtering never narrows the original JSON download or releases an UNKNOWN forecast hold', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  await page.evaluate(() => window.jobScopeFind.unknown());
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
  expect(file.suggestedFilename()).toBe('original-job-scope.json');
  const value = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(value.lines).toHaveLength(18);
  expect(
    new Set(value.lines.map((line: { kind: string }) => line.kind)).size,
  ).toBe(5);
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
    page.getByRole('searchbox', {
      name: 'Find original scope lines',
      exact: true,
    }),
  ).toHaveValue('');
  await expect(reference(page).locator('tbody tr')).toHaveCount(18);
  expect(await page.evaluate(() => window.jobScopeFind.held())).toBe(true);
  expect((await page.evaluate(() => window.jobScopeFind.counts())).writes).toBe(
    0,
  );
});

test('a fresh read resets filters and a denied refresh unmounts all private scope and filters', async ({
  page,
}) => {
  await open(page);
  await load(page).click();
  await page
    .getByRole('searchbox', { name: 'Find original scope lines', exact: true })
    .fill('[west]');
  await page.evaluate(() => window.jobScopeFind.hold());
  await load(page).click();
  await expect
    .poll(() => page.evaluate(() => window.jobScopeFind.waiting()))
    .toBe(true);
  await expect(reference(page)).toHaveCount(0);
  await expect(
    page.getByRole('searchbox', {
      name: 'Find original scope lines',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.evaluate(() => window.jobScopeFind.release());
  await expect(reference(page).locator('tbody tr')).toHaveCount(18);
  await expect(
    page.getByRole('searchbox', {
      name: 'Find original scope lines',
      exact: true,
    }),
  ).toHaveValue('');
  await page
    .getByRole('searchbox', { name: 'Find original scope lines', exact: true })
    .fill('[west]');
  await page.evaluate(() => window.jobScopeFind.deny());
  await load(page).click();
  await expect(page.getByRole('status')).toHaveText(unavailable);
  await expect(reference(page)).toHaveCount(0);
  await expect(
    page.getByRole('searchbox', {
      name: 'Find original scope lines',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain(
    'North [West] panel',
  );
});

test('company repo and Operations replacement cannot retain old filters or accept a late old read', async ({
  page,
}) => {
  for (const context of ['company', 'repo', 'operations']) {
    await open(page);
    await load(page).click();
    await page
      .getByRole('searchbox', {
        name: 'Find original scope lines',
        exact: true,
      })
      .fill('[west]');
    if (context === 'company') {
      await page.evaluate(() => window.jobScopeFind.hold());
      await load(page).click();
      await expect
        .poll(() => page.evaluate(() => window.jobScopeFind.waiting()))
        .toBe(true);
      const snapshot = await page.evaluate(() =>
        window.jobScopeFind.selectSnapshot(1),
      );
      expect(snapshot).toEqual({
        privateViewPresent: false,
        searchPresent: false,
      });
    } else await page.evaluate((k) => window.jobScopeFind.replace(k), context);
    await expect(reference(page)).toHaveCount(0);
    await load(page).click();
    const search = page.getByRole('searchbox', {
      name: 'Find original scope lines',
      exact: true,
    });
    await expect(search).toHaveValue('');
    await expect(reference(page).locator('tbody tr')).toHaveCount(18);
    await search.fill('South');
    await expect(reference(page).locator('tbody tr')).toHaveCount(9);
    if (context === 'company') {
      await page.evaluate(() => window.jobScopeFind.release());
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(search).toHaveValue('South');
      await expect(reference(page).locator('tbody tr')).toHaveCount(9);
    }
    expect(
      (await page.evaluate(() => window.jobScopeFind.counts())).writes,
    ).toBe(0);
  }
});

test('actual Jobs finds original scope by keyboard without changing the unsaved forecast', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4373/preview');
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await page
    .getByText('Update remaining costs & warning thresholds', { exact: true })
    .click();
  const materials = page.getByLabel('Remaining materials', { exact: true });
  await materials.fill('123.45');
  const selected = await page
    .getByRole('combobox', { name: 'Financial job', exact: true })
    .inputValue();
  await page.getByText('Original job scope', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await load(page).click();
  const search = page.getByRole('searchbox', {
    name: 'Find original scope lines',
    exact: true,
  });
  await search.fill('No such scope [literal]');
  await expect(reference(page).locator('tbody tr')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Reset scope filters', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await expect(reference(page).locator('tbody tr').first()).toBeVisible();
  await expect(materials).toHaveValue('123.45');
  await expect(
    page.getByRole('combobox', { name: 'Financial job', exact: true }),
  ).toHaveValue(selected);
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
    path: info.outputPath('actual-original-scope-find.png'),
  });
  await page.screenshot({
    path: info.outputPath('actual-jobs-scope-find.png'),
    fullPage: true,
  });
});
