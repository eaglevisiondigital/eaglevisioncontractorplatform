import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { commercialCustomerBridgeFixture } from '../fixtures/commercial-customer-bridge';
import type {} from './fixtures/commercial-issued-amount';

let javascript = '',
  css = '';
test.beforeAll(async () => {
  const built = await build({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    configFile: false,
    cacheDir: fileURLToPath(
      new URL(
        '../../../private-state/commercial583-next/vite-cache',
        import.meta.url,
      ),
    ),
    logLevel: 'silent',
    plugins: [react()],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/commercial-issued-amount.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'FictionalIssuedAmount',
      },
    },
  });
  const result = Array.isArray(built) ? built[0] : built;
  if (!('output' in result))
    throw Error('Fictional fixture bundle unavailable');
  javascript = result.output
    .filter((v) => v.type === 'chunk')
    .map((v) => v.code)
    .join('\n');
  css = result.output
    .filter((v) => v.type === 'asset' && v.fileName.endsWith('.css'))
    .map((v) => (v.type === 'asset' ? String(v.source) : ''))
    .join('\n');
});
const amount = (page: Page) =>
  page
    .locator('.commercial-customer-receipt p')
    .filter({ hasText: /^Issued invoice amount:/ });
const reopen = (page: Page) =>
  page.getByRole('button', {
    name: 'Reopen exact issued invoice',
    exact: true,
  });
const reads = (page: Page) =>
  page.evaluate(() => window.issuedAmountReview.reads());
async function open(page: Page, scenario = '') {
  const fixture = commercialCustomerBridgeFixture();
  const result = await fixture.load(
    fixture.viewer,
    new AbortController().signal,
  );
  // These are existing canonical engine facts, not invented totals or a balance.
  expect(result.invoice.amountMinor).toBe(
    fixture.version.calculation.total_minor,
  );
  expect(result.invoice.amountMinor).toBe(31900);
  expect(result.invoice.currency).toBe('USD');
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === 'http://127.0.0.1:4394' &&
      url.pathname === '/issued-amount'
    )
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional issued invoice amount</title></head><body><div id="root"></div></body></html>',
      });
    return route.abort();
  });
  await page.goto('http://127.0.0.1:4394/issued-amount?scenario=' + scenario);
  await page.evaluate(
    (seed) => {
      window.issuedAmountSeed = seed;
    },
    { viewer: fixture.viewer, result },
  );
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await expect(
    page.getByRole('heading', {
      name: 'Fictional issued invoice amount review',
    }),
  ).toBeVisible();
}
async function read(page: Page) {
  await reopen(page).click();
  await expect(page.getByRole('status')).toHaveText(
    'Issued invoice · payment UNKNOWN',
  );
  await expect(amount(page)).toHaveText('Issued invoice amount: $319.00');
}
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test('exact issued amount uses canonical currency and keyboard read without payment authority', async ({
  page,
}, info) => {
  await open(page);
  await expect(amount(page)).toHaveCount(0);
  expect(await reads(page)).toBe(0);
  await reopen(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText(
    'Issued invoice · payment UNKNOWN',
  );
  await expect(amount(page)).toHaveText('Issued invoice amount: $319.00');
  expect(await reads(page)).toBe(1);
  for (const name of [
    'Create payment link · unavailable',
    'Send invoice · unavailable',
    'Resend invoice · unavailable',
  ])
    await expect(
      page.getByRole('button', { name, exact: true }),
    ).toBeDisabled();
  await expect(page.getByRole('link')).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('issued-amount-ready.png'),
    fullPage: true,
  });
});
test('pending explicit reread withholds the prior amount until the current read completes', async ({
  page,
}) => {
  await open(page);
  await read(page);
  await page.evaluate(() => window.issuedAmountReview.mode('pending'));
  await reopen(page).click();
  await expect
    .poll(() => page.evaluate(() => window.issuedAmountReview.waiting()))
    .toBe(true);
  await expect(amount(page)).toHaveCount(0);
  await expect(reopen(page)).toBeDisabled();
  await page.evaluate(() => window.issuedAmountReview.release());
  await expect(amount(page)).toHaveText('Issued invoice amount: $319.00');
  expect(await reads(page)).toBe(2);
});
test('source denial removes the amount and never turns UNKNOWN into a payment fact', async ({
  page,
}) => {
  await open(page);
  await read(page);
  await page.evaluate(() => window.issuedAmountReview.mode('denied'));
  await reopen(page).click();
  await expect(page.getByRole('status')).toContainText('UNKNOWN');
  await expect(amount(page)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Create payment link · unavailable' }),
  ).toHaveCount(0);
  expect(await reads(page)).toBe(2);
});
test('customer withdrawal suppresses a late response and restoration requires an explicit fresh read', async ({
  page,
}) => {
  await open(page);
  await read(page);
  await page.evaluate(() => window.issuedAmountReview.mode('pending'));
  await reopen(page).click();
  await expect
    .poll(() => page.evaluate(() => window.issuedAmountReview.waiting()))
    .toBe(true);
  await page.evaluate(() => window.issuedAmountReview.withdraw());
  await expect(amount(page)).toHaveCount(0);
  await page.evaluate(() => window.issuedAmountReview.release());
  await page.evaluate(() => window.issuedAmountReview.restore());
  await expect(amount(page)).toHaveCount(0);
  await page.evaluate(() => window.issuedAmountReview.mode('ready'));
  await read(page);
  expect(await reads(page)).toBe(3);
});
test('real fictional ticket expiry withdraws the displayed amount without changing original deadlines', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => window.issuedAmountReview.mode('short'));
  await read(page);
  await expect(amount(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('UNKNOWN');
  expect(await reads(page)).toBe(1);
});
test('disabled, expired and wrong-source responses never disclose an issued amount', async ({
  page,
}) => {
  await open(page, 'disabled');
  await expect(reopen(page)).toBeDisabled();
  await expect(amount(page)).toHaveCount(0);
  expect(await reads(page)).toBe(0);
  await open(page);
  for (const mode of ['expired', 'wrong'] as const) {
    await page.evaluate((value) => window.issuedAmountReview.mode(value), mode);
    await reopen(page).click();
    await expect(page.getByRole('status')).toContainText('UNKNOWN');
    await expect(amount(page)).toHaveCount(0);
  }
  expect(await reads(page)).toBe(2);
});
