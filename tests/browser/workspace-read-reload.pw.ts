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
          new URL('./fixtures/workspace-read-reload.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'WorkspaceReadReloadFixture',
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
async function open(page: Page, scenario = 'transient') {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
  await page.route('http://127.0.0.1:4380/workspace*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Workspace read review</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://127.0.0.1:4380/workspace?scenario=' + scenario);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: code });
}
const retry = (page: Page) =>
  page.getByRole('button', {
    name: 'Reload estimating workspace',
    exact: true,
  });
const counts = (page: Page) =>
  page.evaluate(() => window.workspaceReadReload.counts());
const choice = (page: Page) =>
  page
    .getByRole('region', { name: 'New estimate customer selection' })
    .getByRole('combobox');
async function failed(page: Page) {
  await open(page);
  await expect(page.getByRole('alert')).toHaveText(
    'Workspace access read temporarily unavailable.',
  );
  expect(await counts(page)).toEqual({
    access: 1,
    modules: 0,
    initialize: 0,
    customerReads: 0,
    writes: 0,
  });
}
async function ready(page: Page) {
  await expect(choice(page)).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'New estimate', exact: true }),
  ).toBeDisabled();
}
test('explicit reload waits for a fresh read before exposing the workspace', async ({
  page,
}) => {
  await failed(page);
  await page.evaluate(() => window.workspaceReadReload.hold());
  await retry(page).click();
  await expect
    .poll(() => page.evaluate(() => window.workspaceReadReload.waiting()))
    .toBe(true);
  await expect(page.getByRole('status')).toHaveText(
    'Loading workspace records…',
  );
  await expect(retry(page)).toHaveCount(0);
  await expect(choice(page)).toHaveCount(0);
  expect((await counts(page)).writes).toBe(0);
  await page.evaluate(() => window.workspaceReadReload.release());
  await ready(page);
  expect((await counts(page)).access).toBe(4); // Workspace retry plus original Estimates pre/post access checks.
  expect((await counts(page)).initialize).toBe(1);
  expect((await counts(page)).writes).toBe(1); // Original sample initialize creates one example.
});
test('explicit reload preserves current access and module denials', async ({
  page,
}) => {
  await failed(page);
  await page.evaluate(() => window.workspaceReadReload.deny());
  await retry(page).click();
  await expect(
    page.getByRole('heading', { name: 'Access restricted' }),
  ).toBeVisible();
  await expect(choice(page)).toHaveCount(0);
  expect((await counts(page)).writes).toBe(1); // Existing sample initialization, no UI draft.
  await failed(page);
  await page.evaluate(() => window.workspaceReadReload.disable());
  await retry(page).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Estimating operations are disabled for this company.',
  );
  await expect(choice(page)).toHaveCount(0);
  expect((await counts(page)).initialize).toBe(0);
  expect((await counts(page)).writes).toBe(0);
});
test('sample initialization rejection stays retained across explicit reloads', async ({
  page,
}) => {
  await open(page, 'seed');
  for (let attempt = 1; attempt <= 3; attempt++) {
    await expect
      .poll(async () => (await counts(page)).initialize)
      .toBe(attempt);
    await expect(page.getByRole('alert')).toHaveText(
      'Synthetic sample source initialization unavailable.',
    );
    expect(await counts(page)).toEqual({
      access: attempt,
      modules: attempt,
      initialize: attempt,
      customerReads: 1,
      writes: 0,
    });
    await expect(choice(page)).toHaveCount(0);
    if (attempt < 3) await retry(page).click();
  }
});
test('late access completion cannot replace the current company workspace', async ({
  page,
}) => {
  await failed(page);
  await page.evaluate(() => window.workspaceReadReload.hold());
  await retry(page).click();
  await expect
    .poll(() => page.evaluate(() => window.workspaceReadReload.waiting()))
    .toBe(true);
  await page.evaluate(() => window.workspaceReadReload.company(1));
  await ready(page);
  await expect(
    choice(page)
      .locator('option')
      .filter({ hasText: 'jordan+cunningham@example.test' }),
  ).toHaveCount(1);
  await expect(
    choice(page)
      .locator('option')
      .filter({ hasText: 'jordan+straight-edge@example.test' }),
  ).toHaveCount(0);
  await page.evaluate(() => window.workspaceReadReload.release());
  await expect
    .poll(() => page.evaluate(() => window.workspaceReadReload.initialized()))
    .toContain('sample-property');
  await expect(
    choice(page)
      .locator('option')
      .filter({ hasText: 'jordan+cunningham@example.test' }),
  ).toHaveCount(1);
  await expect(
    choice(page)
      .locator('option')
      .filter({ hasText: 'jordan+straight-edge@example.test' }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Cunningham Construction',
  );
  expect((await counts(page)).writes).toBe(2); // Each original company seed initializes once.
});
test('ready workspace performs no automatic reload and keeps explicit customer choice', async ({
  page,
}) => {
  await open(page, 'ready');
  await ready(page);
  await expect(choice(page)).toHaveValue('');
  await expect(retry(page)).toHaveCount(0);
  const settled = await counts(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await counts(page)).toEqual(settled);
  expect(settled.access).toBe(3); // Workspace loader plus original Estimates pre/post access checks.
  expect(settled.initialize).toBe(1);
  expect(settled.writes).toBe(1); // Original fictional seed only.
});
test('error reload supports a named keyboard button without responsive overflow', async ({
  page,
}, testInfo) => {
  await failed(page);
  await retry(page).focus();
  await expect(retry(page)).toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('workspace-error-reload.png'),
    fullPage: true,
  });
  await retry(page).press('Enter');
  await ready(page);
  expect((await counts(page)).writes).toBe(1); // Original fictional seed only.
});
