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
          new URL('./fixtures/estimate-create-pending.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'EstimateCreatePendingTest',
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw Error('Fixture bundle required');
  script = result.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = result.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
async function open(page: Page) {
  await page.route('**/*', (route) => route.abort());
  await page.route('https://estimate-create.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Estimate creation</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-create.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.estimate-list-row')).toHaveCount(2);
  const choice = page.getByRole('combobox', {
    name: 'Customer for new estimate',
    exact: true,
  });
  await expect(choice).toBeEnabled();
  const value = await choice.locator('option').nth(1).getAttribute('value');
  if (!value) throw Error('Actual fixture customer required');
  await choice.selectOption(value);
  return { choice, value };
}
const refresh = (page: Page) =>
  page.getByRole('button', { name: 'Refresh estimates', exact: true });
const create = (page: Page) =>
  page.getByRole('button', { name: 'New estimate', exact: true });
const snapshot = (page: Page) =>
  page.evaluate(() => window.estimateCreateReview.snapshot());
async function pending(page: Page) {
  await create(page).click();
  await expect.poll(async () => (await snapshot(page)).waiting).toBe(true);
}
test('refresh cannot withdraw the selected source while draft creation is pending', async ({
  page,
}, info) => {
  const { choice, value } = await open(page);
  const initial = await snapshot(page);
  await pending(page);
  await expect(refresh(page)).toBeDisabled();
  await expect(choice).toBeDisabled();
  await expect(choice).toHaveValue(value);
  await expect(create(page)).toBeDisabled();
  await expect(
    page.getByRole('combobox', { name: 'Create from company template' }),
  ).toBeDisabled();
  for (const row of await page.locator('.estimate-list-row').all())
    await expect(row).toBeDisabled();
  await expect(page.locator('.p3-workspace')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(
    page.getByRole('status').filter({ hasText: /^Creating estimate…$/ }),
  ).toBeVisible();
  const held = await snapshot(page);
  expect(held).toMatchObject({
    calls: 1,
    otherWrites: 0,
    waiting: true,
    listReads: initial.listReads,
    created: null,
  });
  expect(
    await page.evaluate(() => window.estimateCreateReview.saved()),
  ).toHaveLength(2);
  await expect(page.locator('.p3-totals')).toContainText('Disabled');
  await page.screenshot({
    path: info.outputPath('creating-estimate.png'),
    fullPage: true,
  });
  await info.attach('pending-existing-engine-observation', {
    body: JSON.stringify(held),
    contentType: 'application/json',
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => window.estimateCreateReview.release());
  await expect
    .poll(async () => (await snapshot(page)).created?.customer)
    .toBe(value);
  await expect(page.getByLabel('Project name', { exact: true })).toBeVisible();
  const result = await snapshot(page);
  expect(result).toMatchObject({
    calls: 1,
    otherWrites: 0,
    waiting: false,
    created: { customer: value, status: 'draft' },
  });
  const saved = await page.evaluate(() => window.estimateCreateReview.saved());
  expect(saved).toHaveLength(3);
  expect(saved.filter((row) => row.id === result.created?.id)).toEqual([
    result.created,
  ]);
  await page.screenshot({
    path: info.outputPath('created-estimate-editor.png'),
    fullPage: true,
  });
});
test('a rejected creation clears busy state without claiming success or dispatching again', async ({
  page,
}, info) => {
  const { choice, value } = await open(page);
  await pending(page);
  await page.evaluate(() => window.estimateCreateReview.release(true));
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /^Fixture draft creation declined$/ }),
  ).toBeVisible();
  await expect(page.locator('.p3-workspace')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByText('Creating estimate…', { exact: true }),
  ).toHaveCount(0);
  await expect(refresh(page)).toBeEnabled();
  await expect(choice).toBeEnabled();
  await expect(choice).toHaveValue(value);
  await expect(page.getByLabel('Project name', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => window.estimateCreateReview.saved()),
  ).toHaveLength(2);
  expect(await snapshot(page)).toMatchObject({
    calls: 1,
    otherWrites: 0,
    waiting: false,
    created: null,
  });
  await page.screenshot({
    path: info.outputPath('declined-estimate-create.png'),
    fullPage: true,
  });
  await refresh(page).click();
  await expect(refresh(page)).toBeEnabled();
  await expect(choice).toHaveValue('');
  expect(await snapshot(page)).toMatchObject({
    calls: 1,
    otherWrites: 0,
    created: null,
  });
});
