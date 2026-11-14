import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { commercialCustomerBridgeFixture } from '../fixtures/commercial-customer-bridge';
let script: string, styles: string, privateDigest: string;
const requests = new WeakMap<Page, string[]>();
test.beforeAll(async () => {
  const f = commercialCustomerBridgeFixture();
  privateDigest = f.mapping.sourceHash;
  expect(JSON.stringify(f.viewer)).not.toContain('sourceHash');
  expect(JSON.stringify(f.viewer)).not.toContain(privateDigest);
  const resultValue = await f.load(f.viewer, new AbortController().signal);
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: {
      'import.meta.env': '{}',
      'process.env.NODE_ENV': '"production"',
      __COMMERCIAL_RESULT__: JSON.stringify(resultValue),
      __COMMERCIAL_VIEWER__: JSON.stringify(f.viewer),
    },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/commercial-customer-bridge.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'CommercialCustomerFixture',
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
    if (!r.url().startsWith('http://127.0.0.1:4219/')) outside.push(r.url());
  });
  await page.route('**/__commercial_customer_fixture__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional commercial issued receipt</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/__commercial_customer_fixture__');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
  expect(script).not.toContain(privateDigest);
  expect(script).not.toContain('controlled_test_signature');
});
test('actual bridge safe result loads/reopens original issuance receipt with keyboard/Axe and held payment controls', async ({
  page,
}, info) => {
  const receipt = page.getByRole('region', {
    name: 'Commercial issued receipt',
  });
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await receipt
    .getByRole('button', { name: 'Reopen exact issued invoice' })
    .click();
  await expect(receipt.getByRole('status')).toHaveText(
    'Issued invoice · payment UNKNOWN',
  );
  const detail = receipt
    .locator('summary')
    .filter({ hasText: 'Original issuance receipt' });
  await detail.focus();
  await page.keyboard.press('Enter');
  await expect(
    receipt.getByText('Issuance receipt · not payment receipt', {
      exact: true,
    }),
  ).toBeVisible();
  const text = await receipt.innerText();
  expect(text).toContain('Absence of a payment record never means unpaid');
  expect(text).not.toMatch(
    /PRIVATE|actorId|requestHash|sourceHash|sessionId|bearer/,
  );
  for (const name of [
    'Create payment link · unavailable',
    'Send invoice · unavailable',
    'Resend invoice · unavailable',
  ])
    await expect(
      receipt.getByRole('button', { name, exact: true }),
    ).toBeDisabled();
  await expect(receipt.locator('a')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await receipt.screenshot({
    path: info.outputPath('commercial-issued-receipt.png'),
  });
  await page
    .getByRole('button', { name: 'Withdraw source', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await expect(receipt.locator('details')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toHaveText(
    'Issued invoice · payment UNKNOWN',
  );
  expect(requests.get(page)).toEqual([]);
});
test('pending, cancelled local read, revocation, mixed invoice and changed context never retain a receipt', async ({
  page,
}) => {
  const receipt = page.getByRole('region', {
    name: 'Commercial issued receipt',
  });
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Pending source read', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toContainText('Reading');
  await expect(receipt.locator('details')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Change customer context', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await page
    .getByRole('button', {
      name: 'Restore original customer context',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', {
      name: 'Resolve pending original response',
      exact: true,
    })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await expect(receipt.locator('details')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toHaveText(
    'Issued invoice · payment UNKNOWN',
  );
  await page
    .getByRole('button', { name: 'Pending source read', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cancel local read', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Revoke local session', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await expect(receipt.locator('details')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Return mixed invoice', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Change customer context', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await expect(receipt.locator('details')).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Restore original customer context',
      exact: true,
    })
    .click();
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await expect(receipt.locator('details')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toHaveText(
    'Issued invoice · payment UNKNOWN',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(requests.get(page)).toEqual([]);
});
test('safe reader lease expiry automatically removes original issuance receipt', async ({
  page,
}) => {
  const receipt = page.getByRole('region', {
    name: 'Commercial issued receipt',
  });
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(receipt.getByRole('status')).toHaveText(
    'Issued invoice · payment UNKNOWN',
  );
  await page.clock.fastForward(30_001);
  await expect(receipt.getByRole('status')).toContainText('UNKNOWN');
  await expect(receipt.locator('details')).toHaveCount(0);
  expect(requests.get(page)).toEqual([]);
});
