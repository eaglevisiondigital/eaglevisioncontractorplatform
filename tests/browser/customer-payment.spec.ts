import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
let script: string, styles: string;
const requests = new WeakMap<Page, string[]>();
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/customer-payment.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'CustomerPaymentFixture',
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!('output' in bundle)) throw Error('Fixture unavailable');
  script = bundle.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  styles = bundle.output
    .flatMap((x) =>
      x.type === 'asset' && x.fileName.endsWith('.css')
        ? [String(x.source)]
        : [],
    )
    .join('\n');
});
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  const outside: string[] = [];
  requests.set(page, outside);
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4218/')) outside.push(r.url());
  });
  await page.route('**/__customer_payment_fixture__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional payment record</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/__customer_payment_fixture__');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
});
test('canonical payment states, refund receipts, keyboard disclosure and non-navigable links remain isolated', async ({
  page,
}, info) => {
  const panel = page.getByRole('region', { name: 'Customer payment record' });
  await expect(
    panel.getByRole('heading', { name: 'Unpaid · synthetic invoice only' }),
  ).toBeVisible();
  await expect(panel).toContainText('Commercial invoice payment bridge: HELD');
  await page
    .getByRole('button', { name: 'Show Partially paid', exact: true })
    .click();
  await expect(
    panel.getByRole('heading', {
      name: 'Partially paid · synthetic invoice only',
    }),
  ).toBeVisible();
  await expect(panel).toContainText('$219.00');
  const receipts = panel
    .locator('summary')
    .filter({ hasText: 'View canonical synthetic payment receipts' });
  await receipts.focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('heading', { name: 'Synthetic capture receipt' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show Paid', exact: true }).click();
  await expect(
    panel.getByRole('heading', {
      name: 'Paid · synthetic invoice only',
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel).toContainText('$0.00');
  await page
    .getByRole('button', { name: 'Show Refund adjusted', exact: true })
    .click();
  await expect(panel).toContainText('$25.00');
  if (
    !(await receipts.evaluate(
      (e) => (e.parentElement as HTMLDetailsElement).open,
    ))
  )
    await receipts.click();
  await expect(
    panel.getByRole('heading', { name: 'Synthetic refund receipt' }),
  ).toBeVisible();
  await expect(panel).toContainText('Adjusts original capture');
  const link = panel
    .locator('summary')
    .filter({ hasText: 'Payment link contract and exact source' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('button', { name: 'Open payment link · unavailable' }),
  ).toBeDisabled();
  await expect(panel.locator('a')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await panel.locator('.customer-payment-totals dd').evaluateAll((cells) =>
      cells.every((cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        return range.getClientRects().length === 1;
      }),
    ),
  ).toBe(true);
  await panel.screenshot({ path: info.outputPath('refund-receipts.png') });
  expect(requests.get(page)).toEqual([]);
});
test('pending, UNKNOWN, revoked and expired sessions remove prior amounts and receipts', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: 'Customer payment record' });
  await page.getByRole('button', { name: 'Show Paid', exact: true }).click();
  await expect(
    panel.getByRole('heading', {
      name: 'Paid · synthetic invoice only',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pending evidence' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Reading exact payment',
  );
  await expect(panel).not.toContainText('$');
  await page.getByRole('button', { name: 'Unknown evidence' }).click();
  await expect(panel.getByRole('status')).toContainText('UNKNOWN');
  await page.getByRole('button', { name: 'Show Paid', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke local session' }).click();
  await expect(panel.getByRole('status')).toContainText('UNKNOWN');
  await expect(panel).not.toContainText('$');
  await expect(panel.locator('details')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Show Partially paid', exact: true })
    .click();
  await page.getByRole('button', { name: 'Expire local session' }).click();
  await expect(panel.getByRole('status')).toContainText('UNKNOWN');
  await expect(panel).not.toContainText('$');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(requests.get(page)).toEqual([]);
});

test('local deadline automatically removes prior financial content without an action or network request', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: 'Customer payment record' });
  await expect(
    panel.getByRole('heading', { name: 'Unpaid · synthetic invoice only' }),
  ).toBeVisible();
  await page.clock.fastForward(120_001);
  await expect(
    panel.getByRole('heading', { name: 'Payment evidence unavailable' }),
  ).toBeVisible();
  await expect(panel).not.toContainText('$');
  await expect(panel.locator('details')).toHaveCount(0);
  expect(requests.get(page)).toEqual([]);
});
