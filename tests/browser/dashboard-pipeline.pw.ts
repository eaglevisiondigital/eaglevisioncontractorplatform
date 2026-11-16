import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
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
          new URL('./fixtures/dashboard-pipeline-harness.tsx', import.meta.url),
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
  await page.route('https://dashboard-pipeline.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Dashboard test</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://dashboard-pipeline.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.getByText('22 new requests await review.')).toBeVisible();
}
test('stage selection uses canonical status pages and truthful counts without writes', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('22 records · Page 2 of 3')).toBeVisible();
  const stage = page.getByRole('combobox', {
    name: 'Intake stage',
    exact: true,
  });
  for (const value of ['reviewing', 'qualified', 'closed']) {
    await stage.selectOption(value);
    await expect(
      page.getByText(`1 ${value} requests in this stage.`, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.request-card')).toHaveCount(1);
    await expect(
      page.getByText('1 records · Page 1 of 1', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText('Requests in selected stage', { exact: true })
        .locator('..')
        .locator('dd'),
    ).toHaveText('1');
  }
  await stage.selectOption('new');
  await expect(page.locator('.request-card')).toHaveCount(10);
  await expect(
    page
      .getByText('Requests on this page', { exact: true })
      .locator('..')
      .locator('dd'),
  ).toHaveText('10');
  expect(await page.evaluate(() => window.dashboardPipeline.writes())).toBe(0);
  expect(
    (await page.evaluate(() => window.dashboardPipeline.calls())).map(
      ({ status, page }) => ({ status, page }),
    ),
  ).toEqual([
    { status: 'new', page: 0 },
    { status: 'new', page: 1 },
    { status: 'reviewing', page: 0 },
    { status: 'qualified', page: 0 },
    { status: 'closed', page: 0 },
    { status: 'new', page: 0 },
  ]);
});

test('late stage and same-page refresh results cannot restore an old view', async ({
  page,
}) => {
  await open(page);
  const refresh = page.getByRole('button', {
    name: 'Refresh intake view',
    exact: true,
  });
  await page.evaluate(() => window.dashboardPipeline.hold());
  await refresh.click();
  await expect(page.locator('.request-card')).toHaveCount(0);
  await expect(
    page.getByText('Requests in selected stage', { exact: true }),
  ).toHaveCount(0);
  await expect(refresh).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Intake stage', exact: true })
    .selectOption('closed');
  await expect(
    page.getByText('1 closed requests in this stage.', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dashboardPipeline.release());
  await expect(
    page.getByText('22 new requests await review.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.request-card')).toHaveCount(1);
  expect(await page.evaluate(() => window.dashboardPipeline.writes())).toBe(0);
});

test('post-await revocation and module withdrawal hide all rows and counts', async ({
  page,
}) => {
  for (const withdraw of ['deny', 'disable'] as const) {
    await open(page);
    await page.evaluate(() => window.dashboardPipeline.hold());
    await page
      .getByRole('button', { name: 'Refresh intake view', exact: true })
      .click();
    await expect(page.locator('.request-card')).toHaveCount(0);
    await page.evaluate((kind) => window.dashboardPipeline[kind](), withdraw);
    await page.evaluate(() => window.dashboardPipeline.release());
    await expect(
      page.getByText(
        withdraw === 'deny'
          ? 'Your company role does not grant access to intake.'
          : 'Intake is disabled for the selected organization.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Requests in selected stage', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Review intake', exact: true }),
    ).toHaveCount(0);
  }
});

test('foreign, wrong-stage, duplicate and invalid-count results fail closed', async ({
  page,
}) => {
  await open(page);
  for (const mode of ['tenant', 'stage', 'duplicate', 'count'] as const) {
    await page.evaluate(
      (value) => window.dashboardPipeline.corrupt(value),
      mode,
    );
    await page
      .getByRole('button', { name: 'Refresh intake view', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveText(
      'Intake results do not match the current company and stage.',
    );
    await expect(page.locator('.request-card')).toHaveCount(0);
    await expect(
      page.getByText('Requests in selected stage', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Review intake', exact: true }),
    ).toHaveCount(0);
  }
  await page.evaluate(() => window.dashboardPipeline.corrupt('none'));
  await page
    .getByRole('button', { name: 'Refresh intake view', exact: true })
    .click();
  await expect(
    page.getByText('22 new requests await review.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.dashboardPipeline.writes())).toBe(0);
});

test('company and repository changes reset the stage while preserving the source boundary', async ({
  page,
}) => {
  await open(page);
  const stage = page.getByRole('combobox', {
    name: 'Intake stage',
    exact: true,
  });
  await stage.selectOption('qualified');
  await expect(
    page.getByText('1 qualified requests in this stage.', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dashboardPipeline.select('sample-construction'),
  );
  await expect(stage).toHaveValue('new');
  await expect(
    page.getByText('22 new requests await review.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.request-card').first()).toContainText(
    'sample-construction model 1',
  );
  await stage.selectOption('closed');
  await expect(
    page.getByText('1 closed requests in this stage.', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dashboardPipeline.replace());
  await expect(stage).toHaveValue('new');
  await expect(page.locator('.request-card').first()).toContainText(
    'sample-construction model 2',
  );
});

test('shrinking counts and failed refresh retain honest empty and unavailable views', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByText('22 records · Page 2 of 3', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dashboardPipeline.empty());
  await page
    .getByRole('button', { name: 'Refresh intake view', exact: true })
    .click();
  await expect(
    page.getByText('This page is no longer available.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.request-card')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Return to first page', exact: true })
    .click();
  await expect(
    page.getByText('No new requests in this view.', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dashboardPipeline.fail());
  await page
    .getByRole('button', { name: 'Refresh intake view', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Synthetic dashboard reader unavailable',
  );
  await expect(
    page.getByText('Requests in selected stage', { exact: true }),
  ).toHaveCount(0);
});

test('actual Overview stage controls are keyboard-accessible, responsive and nonfinancial', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4341/preview');
  const stage = page.getByRole('combobox', {
    name: 'Intake stage',
    exact: true,
  });
  await expect(stage).toHaveValue('new');
  await stage.focus();
  await page.keyboard.press('c');
  await page.keyboard.press('Enter');
  await expect(stage).toHaveValue('closed');
  await expect(
    page.getByText('No requests in this stage.', { exact: true }),
  ).toBeVisible();
  await stage.selectOption('new');
  await expect(
    page.getByText('1 new requests await review.', { exact: true }),
  ).toBeVisible();
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
    path: info.outputPath('actual-dashboard-pipeline.png'),
    fullPage: true,
  });
});
