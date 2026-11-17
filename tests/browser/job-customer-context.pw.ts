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
          new URL('./fixtures/job-customer-context.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'JobContactTest',
      },
    },
  });
  const output = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in output)) throw Error('Fixture bundle unavailable');
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
  await page.route('https://job-contact.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Job contact fixture</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://job-contact.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.getByText('Job customer & property', { exact: true }).click();
  await expect(load(page)).toBeVisible();
}
const view = (page: Page) =>
  page.getByRole('region', {
    name: 'Job customer and property context',
    exact: true,
  });
const load = (page: Page) =>
  page.getByRole('button', { name: 'Load customer & property', exact: true });
const refresh = (page: Page) =>
  page.getByRole('button', {
    name: 'Refresh customer & property',
    exact: true,
  });
const unavailable =
  'Customer and property context is unavailable or no longer matches this job. Refresh the job before a new read.';

test('explicit keyboard read pins the original issued source and exposes only CRM contact and property', async ({
  page,
}, info) => {
  await open(page);
  expect(await page.evaluate(() => window.jobCustomerContext.counts())).toEqual(
    { jobs: 0, sources: [], writes: 0, held: false, waiting: '' },
  );
  await load(page).focus();
  await page.keyboard.press('Enter');
  await expect(view(page)).toBeVisible();
  await expect(view(page).getByRole('heading')).toBeFocused();
  await expect(view(page)).toContainText('100 Synthetic Prototype Lane');
  await expect(view(page)).toContainText('Recorded contact preference');
  await expect(view(page)).not.toContainText('PRIVATE');
  await expect(view(page)).not.toContainText('unit_cost_minor');
  expect(await view(page).getByRole('link').count()).toBe(0);
  const counts = await page.evaluate(() => window.jobCustomerContext.counts());
  expect(counts.jobs).toBe(2);
  expect(counts.writes).toBe(0);
  expect(counts.sources).toHaveLength(1);
  const versions = await page.evaluate(() =>
    window.jobCustomerContext.versions(),
  );
  expect(versions.current).not.toBe(versions.original);
  expect(counts.sources).toEqual([versions.original]);
  await expect(view(page)).toContainText(counts.sources[0]);
  await view(page).screenshot({
    path: info.outputPath('synthetic-job-property-context.png'),
  });
  await page
    .getByRole('button', { name: 'Clear contact view', exact: true })
    .click();
  await expect(view(page)).toHaveCount(0);
  await expect(load(page)).toBeFocused();
});

test('post-read CRM, estimates and module withdrawal hides prior contact and keeps errors generic', async ({
  page,
}) => {
  for (const kind of ['crm', 'estimates', 'crm-module', 'estimates-module']) {
    await open(page);
    await load(page).click();
    await expect(view(page)).toBeVisible();
    await page.evaluate(() => window.jobCustomerContext.hold('customer'));
    await refresh(page).click();
    await expect(view(page)).toHaveCount(0);
    await expect(load(page)).toBeDisabled();
    await page.evaluate((value) => window.jobCustomerContext.deny(value), kind);
    await page.evaluate(() => window.jobCustomerContext.release());
    await expect(page.getByRole('status')).toHaveText(unavailable);
    await expect(view(page)).toHaveCount(0);
  }
  await open(page);
  await page.evaluate(() => window.jobCustomerContext.corrupt('private-error'));
  await load(page).click();
  await expect(page.getByRole('status')).toHaveText(unavailable);
  await expect(
    page.getByText('PRIVATE synthetic diagnostic must not appear', {
      exact: true,
    }),
  ).toHaveCount(0);
});

test('foreign, duplicate, changed baseline and wrong exact CRM/source identities deny the whole view', async ({
  page,
}) => {
  for (const kind of [
    'job-tenant',
    'job-duplicate',
    'baseline',
    'source-tenant',
    'source-status',
    'source-version',
    'source-customer',
    'source-baseline',
    'customer-tenant',
    'customer-id',
    'customer-name',
    'property-tenant',
    'property-customer',
    'property-id',
    'module-tenant',
  ]) {
    await open(page);
    await page.evaluate(
      (value) => window.jobCustomerContext.corrupt(value),
      kind,
    );
    await load(page).click();
    await expect(page.getByRole('status'), kind).toHaveText(unavailable);
    await expect(view(page), kind).toHaveCount(0);
    expect(
      (await page.evaluate(() => window.jobCustomerContext.counts())).writes,
    ).toBe(0);
  }
  await open(page);
  await page.evaluate(() => window.jobCustomerContext.corrupt('no-property'));
  await load(page).click();
  await expect(view(page)).toContainText(
    'No property was linked to the original estimate.',
  );
  await expect(view(page)).not.toContainText('100 Synthetic Prototype Lane');
});

test('detached company or repository reads cannot display or replace the current context', async ({
  page,
}) => {
  for (const kind of ['company', 'repo', 'operations']) {
    await open(page);
    await page.evaluate(() => window.jobCustomerContext.hold('jobs'));
    await load(page).click();
    await expect(load(page)).toBeDisabled();
    if (kind === 'company')
      await page.evaluate(() => window.jobCustomerContext.select(1));
    else
      await page.evaluate(
        (value) => window.jobCustomerContext.replace(value),
        kind,
      );
    await expect(load(page)).toBeEnabled();
    await load(page).click();
    await expect(view(page)).toBeVisible();
    const fresh = await view(page).innerText();
    if (kind === 'company')
      await page.evaluate(() => window.jobCustomerContext.deny('previous'));
    await page.evaluate(() => window.jobCustomerContext.release());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(view(page)).toHaveText(fresh, { useInnerText: true });
    expect(
      (await page.evaluate(() => window.jobCustomerContext.counts())).writes,
    ).toBe(0);
  }
});

test('final authority wait rechecks mutable sources and read-only refresh never clears UNKNOWN or duplicates a command', async ({
  page,
}) => {
  for (const kind of ['customer', 'source', 'job']) {
    await open(page);
    await page.evaluate(() => window.jobCustomerContext.hold('authority'));
    await load(page).click();
    await expect(load(page)).toBeDisabled();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.jobCustomerContext.counts()))
            .waiting,
      )
      .toBe('authority');
    await page.evaluate(
      (value) => window.jobCustomerContext.mutate(value),
      kind,
    );
    await page.evaluate(() => window.jobCustomerContext.release());
    await expect(page.getByRole('status')).toHaveText(unavailable);
    await expect(view(page)).toHaveCount(0);
  }
  for (const kind of ['persisted-job-missing', 'persisted-job-baseline']) {
    await open(page);
    await page.evaluate(() => window.jobCustomerContext.hold('customer'));
    await load(page).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.jobCustomerContext.counts()))
            .waiting,
      )
      .toBe('customer');
    await page.evaluate(
      (value) => window.jobCustomerContext.corrupt(value),
      kind,
    );
    await page.evaluate(() => window.jobCustomerContext.release());
    await expect(page.getByRole('status')).toHaveText(unavailable);
    await expect(view(page)).toHaveCount(0);
  }
  await open(page);
  await page.evaluate(() => {
    window.jobCustomerContext.unknown();
    window.jobCustomerContext.hold('jobs');
  });
  await load(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(load(page)).toBeDisabled();
  expect(
    (await page.evaluate(() => window.jobCustomerContext.counts())).jobs,
  ).toBe(1);
  await page.evaluate(() => window.jobCustomerContext.release());
  await expect(view(page)).toBeVisible();
  expect(
    (await page.evaluate(() => window.jobCustomerContext.counts())).held,
  ).toBe(true);
  expect(
    (await page.evaluate(() => window.jobCustomerContext.counts())).writes,
  ).toBe(0);
});

test('actual Jobs contact review preserves entered forecast, keyboard focus and responsive accessibility', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4359/preview');
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await page
    .getByText('Update remaining costs & warning thresholds', { exact: true })
    .click();
  const materials = page.getByLabel('Remaining materials', { exact: true });
  await materials.fill('123.45');
  await page.getByText('Job customer & property', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await load(page).focus();
  await page.keyboard.press('Enter');
  await expect(view(page)).toBeVisible();
  await expect(view(page).getByRole('heading')).toBeFocused();
  await expect(view(page)).toContainText(
    'No property was linked to the original estimate.',
  );
  await expect(materials).toHaveValue('123.45');
  await refresh(page).click();
  await expect(view(page)).toBeVisible();
  await expect(materials).toHaveValue('123.45');
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
  await view(page).screenshot({
    path: info.outputPath('actual-job-contact-panel.png'),
  });
  await page.screenshot({
    path: info.outputPath('actual-job-customer-context.png'),
    fullPage: true,
  });
});
