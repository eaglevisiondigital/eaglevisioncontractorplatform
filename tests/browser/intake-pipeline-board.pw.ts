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

async function board(page: Page) {
  await open(page);
  await page
    .getByRole('button', { name: 'Pipeline board', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Intake pipeline board', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.request-card')).toHaveCount(13);
}
const column = (page: Page, stage: string) =>
  page.getByRole('article', { name: `${stage} intake stage`, exact: true });

test('board uses the four canonical stage pages and independent pagination without commands', async ({
  page,
}) => {
  await board(page);
  for (const stage of ['new', 'reviewing', 'qualified', 'closed']) {
    const panel = column(page, stage);
    await expect(
      panel.getByRole('heading', {
        name: stage[0].toUpperCase() + stage.slice(1),
        exact: true,
      }),
    ).toBeVisible();
    await expect(panel.locator('.request-card')).toHaveCount(
      stage === 'new' ? 10 : 1,
    );
    await expect(
      panel
        .getByText('Requests in selected stage', { exact: true })
        .locator('..')
        .locator('dd'),
    ).toHaveText(stage === 'new' ? '22' : '1');
  }
  await column(page, 'new')
    .getByRole('button', { name: 'Next', exact: true })
    .click();
  await expect(
    column(page, 'new').getByText('22 records · Page 2 of 3', { exact: true }),
  ).toBeVisible();
  for (const stage of ['reviewing', 'qualified', 'closed'])
    await expect(
      column(page, stage).getByText('1 records · Page 1 of 1', { exact: true }),
    ).toBeVisible();
  await column(page, 'qualified')
    .getByRole('button', { name: 'Review intake', exact: true })
    .click();
  expect(await page.evaluate(() => window.dashboardPipeline.opened())).toBe(1);
  expect(await page.evaluate(() => window.dashboardPipeline.writes())).toBe(0);
});

test('current access or module withdrawal in one stage hides the entire board', async ({
  page,
}) => {
  for (const withdrawal of ['deny', 'disable'] as const) {
    await board(page);
    await page.evaluate(() => window.dashboardPipeline.hold());
    await column(page, 'new')
      .getByRole('button', { name: 'Refresh intake view', exact: true })
      .click();
    await expect(column(page, 'new').locator('.request-card')).toHaveCount(0);
    await page.evaluate((kind) => window.dashboardPipeline[kind](), withdrawal);
    await page.evaluate(() => window.dashboardPipeline.release());
    await expect(page.locator('.request-card')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Review intake', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Requests in selected stage', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        withdrawal === 'deny'
          ? 'Your company role does not grant access to intake.'
          : 'Intake is disabled for the selected organization.',
        { exact: true },
      ),
    ).toBeVisible();
    expect(await page.evaluate(() => window.dashboardPipeline.writes())).toBe(
      0,
    );
  }
});

test('foreign, wrong-stage, duplicate and unsafe-count results never enter a board column', async ({
  page,
}) => {
  for (const mode of ['tenant', 'stage', 'duplicate', 'count'] as const) {
    await board(page);
    await page.evaluate((kind) => window.dashboardPipeline.corrupt(kind), mode);
    const panel = column(page, 'new');
    await panel
      .getByRole('button', { name: 'Refresh intake view', exact: true })
      .click();
    await expect(panel.getByRole('alert')).toHaveText(
      'Intake results do not match the current company and stage.',
    );
    await expect(panel.locator('.request-card')).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Review intake', exact: true }),
    ).toHaveCount(0);
    await expect(column(page, 'closed').locator('.request-card')).toHaveCount(
      1,
    );
  }
});

test('company and repository replacement drop old board data and detached results', async ({
  page,
}) => {
  await board(page);
  await page.evaluate(() => window.dashboardPipeline.hold());
  await column(page, 'new')
    .getByRole('button', { name: 'Refresh intake view', exact: true })
    .click();
  await expect(column(page, 'new').locator('.request-card')).toHaveCount(0);
  await page.evaluate(() =>
    window.dashboardPipeline.select('sample-construction'),
  );
  await expect(
    page.getByRole('region', { name: 'Intake pipeline board', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.request-card').first()).toContainText(
    'sample-construction model 1',
  );
  await page.evaluate(() => window.dashboardPipeline.release());
  await expect(page.locator('.request-card').first()).toContainText(
    'sample-construction model 1',
  );
  await page
    .getByRole('button', { name: 'Pipeline board', exact: true })
    .click();
  await expect(page.locator('.request-card')).toHaveCount(13);
  await page.evaluate(() => window.dashboardPipeline.replace());
  await expect(
    page.getByRole('region', { name: 'Intake pipeline board', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.request-card').first()).toContainText(
    'sample-construction model 2',
  );
});

test('refresh all and queue switching discard detached results and retain honest empty/errors', async ({
  page,
}) => {
  await board(page);
  await page.evaluate(() => window.dashboardPipeline.hold());
  await column(page, 'new')
    .getByRole('button', { name: 'Refresh intake view', exact: true })
    .click();
  await expect(column(page, 'new').locator('.request-card')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Request queue', exact: true })
    .click();
  await expect(page.locator('.request-card')).toHaveCount(10);
  await page.evaluate(() => window.dashboardPipeline.release());
  await expect(
    page.getByRole('region', { name: 'Intake pipeline board', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Pipeline board', exact: true })
    .click();
  await expect(page.locator('.request-card')).toHaveCount(13);
  await page.evaluate(() => window.dashboardPipeline.empty());
  await page
    .getByRole('button', { name: 'Refresh pipeline board', exact: true })
    .click();
  await expect(page.locator('.request-card')).toHaveCount(0);
  for (const stage of ['new', 'reviewing', 'qualified', 'closed'])
    await expect(
      column(page, stage)
        .getByText('Requests in selected stage', { exact: true })
        .locator('..')
        .locator('dd'),
    ).toHaveText('0');
  await page.evaluate(() => window.dashboardPipeline.fail());
  await page
    .getByRole('button', { name: 'Refresh pipeline board', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  await expect(
    page.getByRole('button', { name: 'Review intake', exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.dashboardPipeline.writes())).toBe(0);
});

test('actual App board is keyboard accessible, responsive and keeps nonfinancial status honest', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4341/preview');
  const toggle = page.getByRole('button', {
    name: 'Pipeline board',
    exact: true,
  });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  for (const stage of ['new', 'reviewing', 'qualified', 'closed'])
    await expect(column(page, stage)).toBeVisible();
  await expect(
    column(page, 'new').getByText('1 new requests await review.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    column(page, 'qualified').getByText(
      'Qualified is an internal intake status, not customer acceptance or payment.',
      { exact: false },
    ),
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
    path: info.outputPath('actual-intake-pipeline-board.png'),
    fullPage: true,
  });
});
