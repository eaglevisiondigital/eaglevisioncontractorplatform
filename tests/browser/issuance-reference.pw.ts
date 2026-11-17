import { test, expect, type Page, type Download } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { commercialCustomerBridgeFixture } from '../fixtures/commercial-customer-bridge';
type Fixture = ReturnType<typeof commercialCustomerBridgeFixture>;
let fixtures: Fixture[],
  requests = 0,
  downloads = 0;
let malformed = '',
  hold = false,
  release = () => {};
async function open(page: Page) {
  fixtures = [
    commercialCustomerBridgeFixture(),
    commercialCustomerBridgeFixture(),
  ];
  requests = 0;
  downloads = 0;
  malformed = '';
  hold = false;
  const bundled = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: {
      'import.meta.env': '{}',
      'process.env.NODE_ENV': '"production"',
      __PUBLIC_VIEWERS__: JSON.stringify(fixtures.map((f) => f.viewer)),
    },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/issuance-reference.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'IssuanceReferenceTest',
      },
    },
  });
  const result = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in result)) throw Error('Bundle unavailable');
  const script = result.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  const css = result.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
  await page.route('**/*', (route) => route.abort());
  await page.route('https://issuance-reference.test/fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Issued reference fixture</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.route('https://issuance-reference.test/read', async (route) => {
    requests++;
    const { index } = route.request().postDataJSON() as { index: number };
    expect(Object.keys(route.request().postDataJSON())).toEqual(['index']);
    if (hold) {
      hold = false;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    try {
      const f = fixtures[index],
        value = await f.load(f.viewer, new AbortController().signal);
      const response =
        malformed === 'mixed'
          ? {
              ...value,
              invoice: { ...value.invoice, invoiceId: crypto.randomUUID() },
            }
          : malformed === 'private'
            ? { ...value, sourceHash: f.mapping.sourceHash }
            : malformed === 'paid'
              ? {
                  ...value,
                  payment: {
                    status: 'paid',
                    balanceMinor: 0,
                    receipt: { id: 'invented' },
                  },
                }
              : value;
      await route.fulfill({ json: response });
    } catch {
      await route.fulfill({
        status: 403,
        json: { error: 'PRIVATE_SERVER_DETAIL' },
      });
    }
  });
  page.removeAllListeners('download');
  page.on('download', () => downloads++);
  await page.goto('https://issuance-reference.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(
    page.getByRole('heading', {
      name: 'Commercial invoice read · fictional test only',
    }),
  ).toBeVisible();
}
const reopen = (page: Page) =>
  page.getByRole('button', {
    name: 'Reopen exact issued invoice',
    exact: true,
  });
const download = (page: Page) =>
  page.getByRole('button', {
    name: 'Download original issuance reference',
    exact: true,
  });
async function json(d: Download) {
  expect(d.suggestedFilename()).toBe('original-issuance-reference.json');
  const path = await d.path();
  if (!path) throw Error('Download missing');
  return JSON.parse(await readFile(path, 'utf8'));
}

test('shows original amount and downloads an allowlisted issuance reference only after a fresh actual bridge read', async ({
  page,
}) => {
  await open(page);
  await reopen(page).click();
  const first = await fixtures[0].load(
    fixtures[0].viewer,
    new AbortController().signal,
  );
  await expect(
    page.getByText(first.invoice.number, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Original issued amount:/)).toBeVisible();
  const before = { ...fixtures[0].calls };
  const next = page.waitForEvent('download');
  await download(page).click();
  const value = await json(await next);
  expect(requests).toBe(2);
  expect(fixtures[0].calls.source - before.source).toBe(2);
  expect(Object.keys(value).sort()).toEqual(
    [
      'schema',
      'mode',
      'receiptKind',
      'invoiceId',
      'number',
      'title',
      'currency',
      'amountMinor',
      'issuedAt',
      'revision',
      'sourceVersionId',
      'issuanceReceiptId',
      'observedAt',
      'expiresAt',
      'paymentStatus',
    ].sort(),
  );
  expect(value).toMatchObject({
    schema: 'commercial-issuance-reference-v1',
    mode: 'fictional-local',
    receiptKind: 'issuance-not-payment',
    invoiceId: first.invoice.invoiceId,
    number: first.invoice.number,
    title: first.invoice.title,
    amountMinor: first.invoice.amountMinor,
    issuanceReceiptId: first.invoice.issuanceReceiptId,
    paymentStatus: 'UNKNOWN',
  });
  expect(JSON.stringify(value)).not.toMatch(
    /sourceHash|actorId|requestHash|sessionId|bearer|customerId|organizationId|balanceMinor/,
  );
  expect(await page.content()).not.toContain(fixtures[0].mapping.sourceHash);
});

test('revoked current Auth hides the prior receipt and cannot download cached content', async ({
  page,
}) => {
  await open(page);
  await reopen(page).click();
  await expect(
    page.getByText(fixtures[0].value.invoice.number, { exact: true }),
  ).toBeVisible();
  fixtures[0].setAuth(false);
  await download(page).click();
  await expect(page.getByText(/Issuance reference unavailable/)).toBeVisible();
  await expect(
    page.getByText(fixtures[0].value.invoice.number, { exact: true }),
  ).toHaveCount(0);
  expect(downloads).toBe(0);
  expect(requests).toBe(2);
  expect(fixtures[0].calls.source).toBe(2);
  await expect(
    page.getByText('PRIVATE_SERVER_DETAIL', { exact: true }),
  ).toHaveCount(0);
});

test('rejects mixed, expanded private and paid claims instead of exporting them', async ({
  page,
}) => {
  for (const variant of ['mixed', 'private', 'paid']) {
    await open(page);
    malformed = variant;
    await download(page).click();
    await expect(
      page.getByText(/Issuance reference unavailable/),
    ).toBeVisible();
    expect(downloads).toBe(0);
    await expect(
      page.getByText(fixtures[0].value.invoice.number, { exact: true }),
    ).toHaveCount(0);
    expect(await page.content()).not.toContain(fixtures[0].mapping.sourceHash);
  }
});

test('detached old controller cannot export after a new controller reads and downloads', async ({
  page,
}) => {
  await open(page);
  hold = true;
  await download(page).click();
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => window.issuanceReference.replace());
  const next = page.waitForEvent('download');
  await download(page).click();
  const value = await json(await next);
  expect(value.invoiceId).toBe(fixtures[1].viewer.invoice.invoiceId);
  release();
  await expect.poll(() => fixtures[0].calls.source).toBe(2);
  await expect(
    page.getByText(
      'Original issuance reference downloaded. Payment remains UNKNOWN.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(downloads).toBe(1);
});

test('duplicate pending clicks make one read; disabled and expired views cannot export old evidence', async ({
  page,
}) => {
  await open(page);
  hold = true;
  await download(page).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => requests).toBe(1);
  const next = page.waitForEvent('download');
  release();
  await next;
  expect(downloads).toBe(1);
  await page.evaluate(() => window.issuanceReference.disable());
  await expect(download(page)).toBeDisabled();
  await expect(reopen(page)).toBeDisabled();
  expect(requests).toBe(1);
  await open(page);
  // Install the controlled clock before the renderer creates its expiry timer.
  await page.clock.install();
  await reopen(page).click();
  await expect(
    page.getByText(fixtures[0].value.invoice.number, { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(30_001);
  await expect(
    page.getByText(fixtures[0].value.invoice.number, { exact: true }),
  ).toHaveCount(0);
  // An expired view cannot supply the download when the new authorized read
  // is denied. The server clock is deliberately independent of the browser.
  fixtures[0].setAuth(false);
  await download(page).click();
  await expect(page.getByText(/Issuance reference unavailable/)).toBeVisible();
  expect(downloads).toBe(0);
});

test('keyboard download preserves payment UNKNOWN and disabled operational actions without overflow', async ({
  page,
}, info) => {
  await open(page);
  await download(page).focus();
  const next = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  await next;
  await expect(
    page.getByText('Issued invoice · payment UNKNOWN', { exact: true }),
  ).toBeVisible();
  for (const name of [
    'Create payment link · unavailable',
    'Send invoice · unavailable',
    'Resend invoice · unavailable',
  ])
    await expect(
      page.getByRole('button', { name, exact: true }),
    ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Commercial issued receipt"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('commercial-issuance-reference.png'),
    fullPage: true,
  });
});
