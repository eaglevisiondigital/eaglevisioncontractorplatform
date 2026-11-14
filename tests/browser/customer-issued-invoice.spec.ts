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
          new URL('./fixtures/customer-issued-invoice.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'CustomerInvoiceFixture',
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
  const outside: string[] = [];
  requests.set(page, outside);
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4217/')) outside.push(r.url());
  });
  await page.route('**/__customer_invoice_fixture__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional customer invoice</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/__customer_invoice_fixture__');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
});
test('canonical lines/totals, immutable export and all three source brands remain usable without payment/delivery', async ({
  page,
}, info) => {
  const outside = requests.get(page)!;
  const invoice = page.getByRole('article', { name: 'Customer invoice' });
  for (const brand of [
    'Straight Edge Property Services',
    'Cunningham Construction',
    'Roofing Company · Example',
  ]) {
    await expect(
      invoice.getByRole('heading', {
        name: `Invoice from ${brand}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(invoice.getByRole('row')).toHaveCount(3);
    await expect(invoice).toContainText('Invoice total');
    await expect(invoice).toContainText('$319.00');
    await expect(
      invoice.getByRole('button', {
        name: 'Pay invoice · unavailable',
        exact: true,
      }),
    ).toBeDisabled();
    await invoice
      .getByText('Delivery, resend, cancellation and correction', {
        exact: true,
      })
      .click();
    for (const name of [
      'Send invoice',
      'Resend invoice',
      'Cancel invoice',
      'Correct invoice',
    ])
      await expect(
        invoice.getByRole('button', { name, exact: true }),
      ).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await invoice
        .locator('tbody td:last-child, .customer-invoice-totals dd')
        .evaluateAll((cells) =>
          cells.every((cell) => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            return range.getClientRects().length === 1;
          }),
        ),
    ).toBe(true);
    await invoice.screenshot({
      path: info.outputPath(`${brand.split(' ')[0]}-invoice.png`),
    });
    if (brand !== 'Roofing Company · Example') {
      await page
        .getByRole('button', { name: 'Select next fictional contractor' })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Invoice unavailable' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Load selected source' }).click();
    }
  }
  const event = page.waitForEvent('download');
  await invoice
    .getByRole('button', { name: 'Download invoice snapshot' })
    .click();
  const download = await event;
  const path = await download.path();
  expect(path).not.toBeNull();
  const { readFile } = await import('node:fs/promises');
  const snapshot = JSON.parse(await readFile(path!, 'utf8'));
  expect(snapshot.scope.lines).toHaveLength(2);
  expect(snapshot.paymentLink).toBeNull();
  expect(snapshot.paymentState).toBe('unverified');
  expect(JSON.stringify(snapshot)).not.toMatch(
    /PRIVATE|memo|actorId|requestHash|unit_cost/,
  );
  expect(outside).toEqual([]);
});
test('pending/unknown/context changes hide old content; missing source stays unresolved and keyboard details reopen exact evidence', async ({
  page,
}) => {
  const invoice = page.getByRole('article', { name: 'Customer invoice' });
  const source = invoice.getByText(
    'Exact invoice source and issuance receipt',
    { exact: true },
  );
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(
    invoice.getByText('Issued estimate version', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Omit exact line source' }).click();
  await expect(invoice.getByRole('row')).toHaveCount(0);
  await expect(invoice).toContainText('UNKNOWN');
  await expect(
    invoice.getByRole('button', { name: 'Download invoice snapshot' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Simulate pending read' }).click();
  await expect(
    page.getByRole('article', { name: 'Customer invoice' }),
  ).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(
    'Loading the exact invoice',
  );
  await page.getByRole('button', { name: 'Simulate unknown read' }).click();
  await expect(page.getByRole('status')).toContainText('UNKNOWN');
  await page.getByRole('button', { name: 'Reopen original snapshot' }).click();
  await expect(invoice.getByRole('row')).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(requests.get(page)).toEqual([]);
});
