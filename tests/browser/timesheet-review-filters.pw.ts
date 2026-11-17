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
          new URL('./fixtures/timesheet-review-filters.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'TimeFilterTest',
      },
    },
  });
  const out = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in out)) throw Error('Fixture bundle unavailable');
  script = out.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = out.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1'
      ? r.continue()
      : r.abort(),
  );
});
async function open(page: Page) {
  await page.route('https://timesheet-filter.test/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Fictional time review</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://timesheet-filter.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
}
const job = (p: Page) =>
  p.getByRole('combobox', { name: 'Filter timesheet job', exact: true });
const review = (p: Page) =>
  p.getByRole('combobox', {
    name: 'Filter timesheet review state',
    exact: true,
  });
const rows = (p: Page) => p.locator('.timesheet-list .time-record:visible');
const count = (p: Page) =>
  p.getByRole('status').filter({ hasText: /loaded time entries/ });
test('job and review filters narrow existing entries without reading or writing', async ({
  page,
}) => {
  await open(page);
  await expect(job(page)).toBeVisible();
  await expect(count(page)).toHaveText('Showing 7 of 7 loaded time entries.');
  const ids = await page.evaluate(() => window.timesheetFilters.jobs());
  await job(page).selectOption('job:' + ids[0]);
  await expect(rows(page)).toHaveCount(3);
  await review(page).selectOption('submitted');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Submitted fence');
  expect(await page.evaluate(() => window.timesheetFilters.counts())).toEqual({
    reads: 1,
    writes: 0,
    waiting: false,
  });
});

test('review precedence, overhead, unmapped jobs and empty/reset states stay truthful', async ({
  page,
}) => {
  await open(page);
  for (const [state, size] of [
    ['draft', 2],
    ['submitted', 2],
    ['approved', 1],
    ['rejected', 1],
    ['locked', 1],
  ] as const) {
    await review(page).selectOption(state);
    await expect(rows(page)).toHaveCount(size);
  }
  await review(page).selectOption('all');
  await job(page).selectOption('overhead');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Rejected office');
  await job(page).selectOption('unmapped');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Unmapped old job');
  const ids = await page.evaluate(() => window.timesheetFilters.jobs());
  await job(page).selectOption('job:' + ids[0]);
  await review(page).selectOption('approved');
  await expect(rows(page)).toHaveCount(0);
  await expect(count(page)).toHaveText('Showing 0 of 7 loaded time entries.');
  await expect(
    page.getByText('No loaded time entries match these filters.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear timesheet filters', exact: true })
    .click();
  await expect(rows(page)).toHaveCount(7);
  await job(page).selectOption('overhead');
  await review(page).selectOption('rejected');
  const worker = page.getByRole('combobox', {
    name: 'Filter timesheet worker',
    exact: true,
  });
  const selected = await worker.locator('option').nth(2).getAttribute('value');
  await worker.selectOption(selected!);
  await expect(job(page)).toHaveValue('all');
  await expect(review(page)).toHaveValue('all');
  await expect(rows(page)).toHaveCount(4);
  expect(
    (await page.evaluate(() => window.timesheetFilters.counts())).writes,
  ).toBe(0);
});

test('pending refresh withholds rows and counts, resets generation filters, and retains manual input', async ({
  page,
}) => {
  await open(page);
  const openRow = page
    .locator('.timesheet-list .time-record')
    .filter({ hasText: 'Open fence' });
  await openRow.getByText('Resolve missed clock-out', { exact: true }).click();
  const correction = openRow.getByRole('textbox', {
    name: 'Corrected clock-out timestamp with offset',
    exact: true,
  });
  await correction.fill('2026-11-01T10:00:00-06:00');
  await job(page).selectOption('overhead');
  await expect(openRow).toBeHidden();
  await job(page).selectOption('all');
  await expect(correction).toHaveValue('2026-11-01T10:00:00-06:00');
  await review(page).selectOption('approved');
  await expect(openRow).toHaveCount(1);
  await expect(openRow).toBeHidden();
  expect(await openRow.evaluate((el) => getComputedStyle(el).display)).toBe(
    'none',
  );
  await expect(
    page.getByRole('textbox', {
      name: 'Corrected clock-out timestamp with offset',
      exact: true,
    }),
  ).toHaveCount(0);
  await review(page).selectOption('all');
  await expect(correction).toHaveValue('2026-11-01T10:00:00-06:00');
  // Existing worker filtering still unmounts excluded rows; only new filters retain them.
  const workerFilter = page.getByRole('combobox', {
    name: 'Filter timesheet worker',
    exact: true,
  });
  await workerFilter.selectOption(
    (await workerFilter.locator('option').nth(1).getAttribute('value'))!,
  );
  await expect(openRow).toHaveCount(0);
  await workerFilter.selectOption('all');
  await expect(openRow.locator('input[name="ended_at"]')).toHaveValue('');

  await page
    .getByText('Add manual time or audited correction', { exact: true })
    .click();
  const draft = page.getByRole('textbox', { name: 'Time task', exact: true });
  await draft.fill('Retain unsaved task');
  await job(page).selectOption('overhead');
  await review(page).selectOption('rejected');
  await page.evaluate(() => window.timesheetFilters.hold());
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.timesheetFilters.counts())).waiting,
    )
    .toBe(true);
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('.timesheet-list .time-record')).toHaveCount(0);
  await expect(count(page)).toHaveCount(0);
  await expect(job(page)).toBeDisabled();
  await expect(review(page)).toBeDisabled();
  await expect(job(page).locator('option')).toHaveCount(3);
  await expect(draft).toHaveValue('Retain unsaved task');
  await page.evaluate(() => window.timesheetFilters.release());
  await expect(rows(page)).toHaveCount(7);
  await expect(job(page)).toHaveValue('all');
  await expect(review(page)).toHaveValue('all');
  await expect(draft).toHaveValue('Retain unsaved task');
  expect(
    (await page.evaluate(() => window.timesheetFilters.counts())).writes,
  ).toBe(0);
});

test('old company and repository responses cannot restore filters or cross-context counts', async ({
  page,
}) => {
  for (const kind of ['company', 'repo']) {
    await open(page);
    await job(page).selectOption('overhead');
    await page.evaluate(() => window.timesheetFilters.hold());
    await page
      .getByRole('button', { name: 'Refresh timesheets', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.timesheetFilters.counts())).waiting,
      )
      .toBe(true);
    if (kind === 'company')
      await page.evaluate(() => window.timesheetFilters.select(1));
    else await page.evaluate(() => window.timesheetFilters.replaceRepo());
    await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
    await expect(count(page)).toHaveText('Showing 7 of 7 loaded time entries.');
    await expect(job(page)).toHaveValue('all');
    const current = await rows(page).allTextContents();
    await page.evaluate(() => window.timesheetFilters.release());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await rows(page).allTextContents()).toEqual(current);
    await expect(job(page)).toHaveValue('all');
    expect(
      (await page.evaluate(() => window.timesheetFilters.counts())).writes,
    ).toBe(0);
  }
});

test('limited source projections, unavailable reads and empty data never invent hidden payroll or time records', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.timesheetFilters.mode('limited'));
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Workers & rates', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(count(page)).toHaveText('Showing 4 of 4 loaded time entries.');
  await expect(
    page
      .locator('.timesheet-list .time-record')
      .filter({ hasText: 'Rejected office' }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('combobox', { name: 'Filter timesheet worker', exact: true })
      .locator('option'),
  ).toHaveCount(2);
  await expect(
    page.getByText('PRIVATE rate review must stay hidden from timesheets', {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Payroll preparation', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.timesheetFilters.mode('error'));
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await expect(
    page.getByText('Timesheet source unavailable', { exact: true }),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(count(page)).toHaveCount(0);
  await page.evaluate(() => window.timesheetFilters.mode('empty'));
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(count(page)).toHaveText('Showing 0 of 0 loaded time entries.');
  await expect(rows(page)).toHaveCount(0);
});

test('actual Workforce filters retain clock and manual drafts with keyboard and responsive accessibility', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4363/preview');
  await page.getByRole('button', { name: 'Workforce', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Clock task', exact: true })
    .fill('Keep clock task');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page
    .getByText('Add manual time or audited correction', { exact: true })
    .click();
  const draft = page.getByRole('textbox', { name: 'Time task', exact: true });
  await draft.fill('Keep manual draft');
  await job(page).focus();
  await expect(job(page)).toBeFocused();
  await job(page).selectOption('overhead');
  await expect(job(page)).toHaveValue('overhead');
  await expect(draft).toHaveValue('Keep manual draft');
  const clear = page.getByRole('button', {
    name: 'Clear timesheet filters',
    exact: true,
  });
  await clear.focus();
  await expect(clear).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(job(page)).toHaveValue('all');
  await expect(draft).toHaveValue('Keep manual draft');
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
    path: info.outputPath('actual-timesheet-review.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Time clock', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Clock task', exact: true }),
  ).toHaveValue('Keep clock task');
});
