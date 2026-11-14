import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { commercialCustomerBridgeFixture } from '../fixtures/commercial-customer-bridge';
let script: string, styles: string;
const fixtures = new WeakMap<
  Page,
  ReturnType<typeof commercialCustomerBridgeFixture>
>();
const requests = new WeakMap<Page, string[]>();
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: {
      'import.meta.env': '{}',
      'process.env.NODE_ENV': '"production"',
      __RECEIPT_TARGET__: JSON.stringify(
        commercialCustomerBridgeFixture().viewer,
      ),
    },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/issuance-receipt-download.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'IssuanceReceiptFixture',
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
  const f = commercialCustomerBridgeFixture();
  fixtures.set(page, f);
  await page.route('**/__issuance_read_fixture__?*', async (route) => {
    try {
      const target = JSON.parse(
        new URL(route.request().url()).searchParams.get('target')!,
      );
      const value = await f.load(target, new AbortController().signal);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    } catch {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"status":"UNKNOWN"}',
      });
    }
  });
  await page.clock.install();
  const outside: string[] = [];
  requests.set(page, outside);
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4220/')) outside.push(r.url());
  });
  await page.route('**/__issuance_receipt_fixture__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional issuance receipt copy</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/__issuance_receipt_fixture__');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
  expect(script).not.toContain(f.mapping.sourceHash);
  expect(script).not.toContain('controlled_test_signature');
});
test('keyboard native copy uses fresh existing bridge Auth reads and saves only issuance-reference JSON', async ({
  page,
}, info) => {
  const f = fixtures.get(page)!;
  const button = page.getByRole('button', {
    name: 'Download issuance-receipt reference',
    exact: true,
  });
  await expect(button).toBeEnabled();
  const before = { ...f.calls };
  const downloaded = page.waitForEvent('download');
  await button.focus();
  await page.keyboard.press('Enter');
  const file = await downloaded;
  const { readFile } = await import('node:fs/promises');
  const content = await readFile((await file.path())!, 'utf8');
  const value = JSON.parse(content);
  expect(f.calls.auth - before.auth).toBe(6);
  expect(f.calls.mapping - before.mapping).toBe(3);
  expect(f.calls.source - before.source).toBe(2);
  expect(file.suggestedFilename()).toBe(
    `issuance-receipt-${f.viewer.invoice.invoiceId}.json`,
  );
  expect(value.purpose).toBe('ISSUANCE_RECEIPT_REFERENCE_ONLY');
  expect(value.payment.status).toBe('UNKNOWN');
  expect(value.link.href).toBeNull();
  expect(value.authority).toContain('Not a full invoice');
  expect(value.issuance.receiptId).toBe(f.value.invoice.receipt.commandId);
  expect(content).not.toMatch(
    /sourceHash|requestHash|actorId|sessionId|bearer|PRIVATE|unit_cost|amountMinor|lineItems/,
  );
  expect(content).not.toContain(f.mapping.sourceHash);
  await expect(
    page.getByRole('status').filter({ hasText: 'copy requested' }),
  ).toContainText('not an invoice, payment receipt or delivery proof');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('issuance-reference-copy.png'),
    fullPage: true,
  });
  expect(requests.get(page)).toEqual([]);
});
test('substitution, ambiguous result, revoked controlled Auth and expired source cause no local copy', async ({
  page,
}) => {
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  const f = fixtures.get(page)!;
  const button = page.getByRole('button', {
    name: 'Download issuance-receipt reference',
    exact: true,
  });
  await expect(button).toBeEnabled();
  await page
    .getByRole('button', { name: 'Hold next read', exact: true })
    .click();
  await button.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Rechecking current access' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Issued invoice · payment UNKNOWN' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Release original read', exact: true })
    .click();
  await expect(button).toBeEnabled();
  await page.waitForTimeout(50);
  expect(downloads).toEqual([]);
  await page
    .getByRole('button', { name: 'Substitute next receipt', exact: true })
    .click();
  await button.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'No safe issuance-receipt copy' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(button).toBeEnabled();
  await page
    .getByRole('button', { name: 'Ambiguous next read', exact: true })
    .click();
  await button.click();
  await expect(button).toBeDisabled();
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(button).toBeEnabled();
  f.setAuth(false);
  await button.click();
  await expect(button).toBeDisabled();
  f.setAuth(true);
  await page
    .getByRole('button', { name: 'Read original source', exact: true })
    .click();
  await expect(button).toBeEnabled();
  await page.clock.fastForward(30_001);
  await expect(button).toBeDisabled();
  expect(downloads).toEqual([]);
  expect(requests.get(page)).toEqual([]);
});
for (const leave of ['Unmount download action', 'Switch receipt controller'])
  test(`pending copy cannot outlive ${leave}`, async ({ page }) => {
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    const button = page.getByRole('button', {
      name: 'Download issuance-receipt reference',
      exact: true,
    });
    await expect(button).toBeEnabled();
    await page
      .getByRole('button', { name: 'Hold next read', exact: true })
      .click();
    await button.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Rechecking current access' }),
    ).toBeVisible();
    await page.getByRole('button', { name: leave, exact: true }).click();
    await page
      .getByRole('button', { name: 'Release original read', exact: true })
      .click();
    if (leave === 'Unmount download action')
      await page
        .getByRole('button', { name: 'Remount download action', exact: true })
        .click();
    await expect(button).toBeEnabled();
    await page.waitForTimeout(50);
    expect(downloads).toEqual([]);
    await expect(
      page.getByRole('status').filter({ hasText: 'copy requested' }),
    ).toHaveCount(0);
    // The new mounted scope remains usable after the old read finishes.
    const download = page.waitForEvent('download');
    await button.click();
    await download;
    expect(downloads).toHaveLength(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(requests.get(page)).toEqual([]);
  });
