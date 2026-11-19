import { test, expect, type Page, type Locator } from '@playwright/test';
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
          new URL('./fixtures/estimate-preview-integrity.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'EstimatePreviewIntegrity',
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result))
    throw Error('Existing-engine browser bundle required');
  script = result.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = result.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
const snapshot = (page: Page) =>
  page.evaluate(() => window.estimatePreviewIntegrity.snapshot());
async function open(page: Page, mode: string) {
  await page.route('**/*', (route) => route.abort());
  await page.route('https://estimate-preview.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Estimate preview</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-preview.test/fixture?mode=' + mode);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  const initial = await snapshot(page);
  await page
    .locator('.estimate-list-row')
    .filter({ hasText: initial.number })
    .click();
  await expect(page.locator('.estimate-editor')).toBeVisible();
  return initial;
}
async function amounts(preview: Locator, values: string[]) {
  const cells = preview.locator('.preview-total > dd');
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(0)).toHaveText(values[0]);
  await expect(cells.nth(1)).toHaveText('−' + values[1].replace(/^-/, ''));
  await expect(cells.nth(2)).toHaveText(values[2]);
  await expect(cells.nth(3)).toHaveText(values[3]);
  const geometry = await preview.evaluate((element) => {
    const header = element.querySelector('header');
    if (!header || !header.nextElementSibling)
      throw Error('Preview header and following content required');
    const frame = header.getBoundingClientRect();
    const children = Array.from(header.children).map((child) =>
      child.getBoundingClientRect(),
    );
    const next = header.nextElementSibling.getBoundingClientRect();
    return {
      childrenContained: children.every(
        (child) =>
          child.top >= frame.top - 1 && child.bottom <= frame.bottom + 1,
      ),
      followingContentClear: children.every(
        (child) => next.top >= child.bottom - 1,
      ),
      noHorizontalOverflow: element.scrollWidth <= element.clientWidth + 1,
      headerHeight: frame.height,
      childBottoms: children.map((child) => child.bottom - frame.top),
      nextTop: next.top - frame.top,
    };
  });
  await test.info().attach('preview-header-geometry', {
    body: JSON.stringify(geometry),
    contentType: 'application/json',
  });
  expect(geometry).toMatchObject({
    childrenContained: true,
    followingContentClear: true,
    noHorizontalOverflow: true,
  });
}
test('invalid working quantity withholds saved financial totals and can be corrected without writing', async ({
  page,
}, info) => {
  const initial = await open(page, 'draft');
  await page.getByLabel('Quantity 1', { exact: true }).fill('0');
  await expect(
    page.getByRole('button', { name: 'Save estimate draft', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Customer preview', exact: true })
    .click();
  await expect(
    page.getByRole('region', {
      name: 'Estimate preview unavailable',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', {
      name: 'Customer-facing estimate preview',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Review estimate inputs');
  expect(await snapshot(page)).toEqual(initial);
  await page.screenshot({
    path: info.outputPath('invalid-preview-withheld.png'),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole('button', { name: 'Review estimate inputs', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Estimate builder', exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel('Quantity 1', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(
    initial.saved.project,
  );
  await page
    .getByLabel('Quantity 1', { exact: true })
    .fill(String(initial.quantity));
  await expect(
    page.getByRole('button', { name: 'Save estimate draft', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Customer preview', exact: true })
    .click();
  const preview = page.getByRole('region', {
    name: 'Customer-facing estimate preview',
    exact: true,
  });
  await amounts(preview, initial.capturedAmounts);
  await expect(preview).not.toContainText('PRIVATE');
  expect(await snapshot(page)).toEqual(initial);
  await page.screenshot({
    path: info.outputPath('valid-preview-restored.png'),
    fullPage: true,
  });
});
test('issued preview retains captured amounts and tax label after the current policy changes', async ({
  page,
}, info) => {
  const initial = await open(page, 'issued-tax-changed');
  expect(initial.currentTaxRate).not.toBe(initial.capturedTaxRate);
  expect(initial.workingAmounts[2]).not.toBe(initial.capturedAmounts[2]);
  await expect(
    page
      .getByRole('combobox', { name: 'Tax policy', exact: true })
      .locator('option:checked'),
  ).toHaveText(initial.capturedTaxLabel);
  await expect(page.getByLabel('Project name', { exact: true })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Customer preview', exact: true })
    .click();
  const preview = page.getByRole('region', {
    name: 'Customer-facing estimate preview',
    exact: true,
  });
  await amounts(preview, initial.capturedAmounts);
  await expect(preview).not.toContainText('PRIVATE');
  expect(await snapshot(page)).toEqual(initial);
  await page.screenshot({
    path: info.outputPath('issued-captured-preview.png'),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('issued preview retains the saved policy and amounts when current policy is absent', async ({
  page,
}) => {
  const initial = await open(page, 'issued-tax-missing');
  expect(initial.currentTaxPresent).toBe(false);
  expect(initial.workingAmounts[2]).not.toBe(initial.capturedAmounts[2]);
  await expect(
    page
      .getByRole('combobox', { name: 'Tax policy', exact: true })
      .locator('option:checked'),
  ).toHaveText(initial.capturedTaxLabel);
  await page
    .getByRole('button', { name: 'Customer preview', exact: true })
    .click();
  await amounts(
    page.getByRole('region', {
      name: 'Customer-facing estimate preview',
      exact: true,
    }),
    initial.capturedAmounts,
  );
  expect(await snapshot(page)).toEqual(initial);
});
test('editable draft preview continues using the current policy without changing saved totals', async ({
  page,
}) => {
  const initial = await open(page, 'draft-tax-changed');
  expect(initial.workingAmounts[2]).not.toBe(initial.capturedAmounts[2]);
  await page
    .getByRole('button', { name: 'Customer preview', exact: true })
    .click();
  await amounts(
    page.getByRole('region', {
      name: 'Customer-facing estimate preview',
      exact: true,
    }),
    initial.workingAmounts,
  );
  expect(await snapshot(page)).toEqual(initial);
});
test('archived draft preview uses its immutable saved calculation and tax policy', async ({
  page,
}) => {
  const initial = await open(page, 'archived-tax-changed');
  await expect(page.getByLabel('Project name', { exact: true })).toBeDisabled();
  await expect(
    page
      .getByRole('combobox', { name: 'Tax policy', exact: true })
      .locator('option:checked'),
  ).toHaveText(initial.capturedTaxLabel);
  await page
    .getByRole('button', { name: 'Customer preview', exact: true })
    .click();
  await amounts(
    page.getByRole('region', {
      name: 'Customer-facing estimate preview',
      exact: true,
    }),
    initial.capturedAmounts,
  );
  expect(await snapshot(page)).toEqual(initial);
});
