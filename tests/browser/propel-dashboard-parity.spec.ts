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
          new URL(
            './fixtures/propel-dashboard-parity-harness.tsx',
            import.meta.url,
          ),
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
async function open(page: Page) {
  await page.route('https://dashboard.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Dashboard test</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://dashboard.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.getByText('12 new requests await review.')).toBeVisible();
}
test('reads all new-request pages, labels source scope and preserves readonly navigation', async ({
  page,
}) => {
  await open(page);
  const inbox = page.getByRole('article', { name: 'New lead inbox' });
  await expect(inbox.locator('.request-card')).toHaveCount(10);
  await expect(inbox.getByText('12 records · Page 1 of 2')).toBeVisible();
  await expect(
    inbox.getByText('New intake requests only.', { exact: false }),
  ).toBeVisible();
  await inbox.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(inbox.getByText('12 records · Page 2 of 2')).toBeVisible();
  await expect(inbox.locator('.request-card')).toHaveCount(2);
  await expect(
    inbox.getByRole('button', { name: 'Next', exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => window.dashboardParity.calls()))
    .toEqual([
      { org: 'sample-property', status: 'new', page: 0 },
      { org: 'sample-property', status: 'new', page: 1 },
    ]);
  await inbox.getByRole('button', { name: 'Review intake' }).click();
  expect(await page.evaluate(() => window.dashboardParity.opened())).toBe(1);
  await inbox.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(inbox.locator('.request-card')).toHaveCount(10);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('tenant and model switches reset paging and withhold late old source without a parent key', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.dashboardParity.hold());
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Loading workspace records…',
  );
  await expect(page.locator('.request-card')).toHaveCount(0);
  await page.evaluate(() =>
    window.dashboardParity.select('sample-construction'),
  );
  await expect(
    page.getByText('sample-construction model 1 lead 11', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('12 records · Page 1 of 2')).toBeVisible();
  await page.evaluate(() => window.dashboardParity.release());
  await expect(
    page.getByText('sample-property model 1 lead 0', { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dashboardParity.hold());
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.request-card')).toHaveCount(0);
  await page.evaluate(() => window.dashboardParity.replace());
  await expect(
    page.getByText('sample-construction model 2 lead 11', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('12 records · Page 1 of 2')).toBeVisible();
  await page.evaluate(() => window.dashboardParity.release());
  await expect(
    page.getByText('sample-construction model 1 lead 0', { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dashboardParity.select('sample-property'));
  await expect(
    page.getByText('sample-property model 2 lead 11', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('12 records · Page 1 of 2')).toBeVisible();
});
test('access and module denial stop intake reads and hide navigation', async ({
  page,
}) => {
  await open(page);
  const initial = await page.evaluate(
    () => window.dashboardParity.calls().length,
  );
  await page.evaluate(() => {
    window.dashboardParity.deny();
    window.dashboardParity.select('sample-construction');
  });
  await expect(
    page.getByText('Your company role does not grant access to intake.'),
  ).toBeVisible();
  expect(await page.evaluate(() => window.dashboardParity.calls().length)).toBe(
    initial,
  );
  await expect(page.getByRole('button', { name: 'Review intake' })).toHaveCount(
    0,
  );
  await expect(page.locator('.request-card')).toHaveCount(0);
  await open(page);
  const before = await page.evaluate(
    () => window.dashboardParity.calls().length,
  );
  await page.evaluate(() => {
    window.dashboardParity.disable();
    window.dashboardParity.select('sample-construction');
  });
  await expect(
    page.getByText('Intake is disabled for the selected organization.'),
  ).toBeVisible();
  expect(await page.evaluate(() => window.dashboardParity.calls().length)).toBe(
    before,
  );
});
test('post-read revocation, error and empty results never retain old rows or invented totals', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.dashboardParity.hold());
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.request-card')).toHaveCount(0);
  await page.evaluate(() => {
    window.dashboardParity.deny();
    window.dashboardParity.release();
  });
  await expect(
    page.getByText('Your company role does not grant access to intake.'),
  ).toBeVisible();
  await expect(page.locator('.request-card')).toHaveCount(0);
  await open(page);
  await page.evaluate(() => {
    window.dashboardParity.fail();
    window.dashboardParity.select('sample-construction');
  });
  await expect(page.getByRole('alert')).toHaveText(
    'Synthetic dashboard reader unavailable',
  );
  await expect(page.locator('.request-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review intake' })).toHaveCount(
    0,
  );
  await open(page);
  await page.evaluate(() => {
    window.dashboardParity.empty();
    window.dashboardParity.select('sample-construction');
  });
  await expect(page.getByText('No new requests in this view.')).toBeVisible();
  await expect(page.getByText('0 new requests await review.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next', exact: true }),
  ).toBeDisabled();
});
test('@shrink withdrawn last page requires explicit fresh first-page review', async ({
  page,
}) => {
  async function shrink() {
    await open(page);
    await page.evaluate(() => window.dashboardParity.hold());
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.dashboardParity.calls().length))
      .toBe(2);
    await page.evaluate(() => {
      window.dashboardParity.empty();
      window.dashboardParity.release();
    });
    await expect(page.getByText('0 new requests await review.')).toBeVisible();
    await expect(
      page.getByText(
        'This page is no longer available. Return to the first page to review current requests.',
      ),
    ).toBeVisible();
    await expect(page.locator('.request-card')).toHaveCount(0);
    await expect(page.getByText('0 records · Page 2 of 1')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Previous', exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => window.dashboardParity.calls().length),
    ).toBe(2);
  }
  await shrink();
  await page
    .getByRole('button', { name: 'Return to first page', exact: true })
    .click();
  await expect(page.getByText('0 records · Page 1 of 1')).toBeVisible();
  expect(
    await page.evaluate(() => window.dashboardParity.calls().at(-1)),
  ).toEqual({ org: 'sample-property', status: 'new', page: 0 });
  await expect(
    page.getByRole('button', { name: 'Previous', exact: true }),
  ).toBeDisabled();
  await shrink();
  await page.evaluate(() => window.dashboardParity.deny());
  await page
    .getByRole('button', { name: 'Return to first page', exact: true })
    .click();
  await expect(
    page.getByText('Your company role does not grant access to intake.'),
  ).toBeVisible();
  expect(await page.evaluate(() => window.dashboardParity.calls().length)).toBe(
    2,
  );
  await expect(
    page.getByRole('button', { name: 'Review intake', exact: true }),
  ).toHaveCount(0);
});
