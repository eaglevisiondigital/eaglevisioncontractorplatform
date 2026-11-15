import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { customerPaymentPublicationFixture } from '../fixtures/customer-payment-publication';
import { customerPaymentPublicationReader } from '../../proposals/customer-payment-publication/reader';
import type { PaymentPublicationTarget } from '../../proposals/customer-payment-publication/contract';
import type { GatewaySql } from '../../server/payments/postgres-store';
let script: string;
const states = new WeakMap<
  Page,
  {
    revoked: boolean;
    kind: 'capture' | 'refund';
    calls: number;
    cached: unknown | null;
    cache: boolean;
    wait: Promise<void> | null;
    release: (() => void) | null;
  }
>();
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': '"production"',
      __PAYMENT_TARGET__: JSON.stringify(
        customerPaymentPublicationFixture().target,
      ),
    },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL(
            './fixtures/customer-payment-publication.tsx',
            import.meta.url,
          ),
        ),
        formats: ['iife'],
        name: 'CustomerPaymentPublicationFixture',
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!('output' in bundle)) throw Error('Fixture unavailable');
  script = bundle.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
});
test.beforeEach(async ({ page }) => {
  const f = customerPaymentPublicationFixture(),
    state = {
      revoked: false,
      kind: 'capture' as 'capture' | 'refund',
      calls: 0,
      cached: null as unknown | null,
      cache: false,
      wait: null as Promise<void> | null,
      release: null as (() => void) | null,
    };
  states.set(page, state);
  await page.exposeFunction(
    '__payment_read__',
    async (target: PaymentPublicationTarget) => {
      state.calls++;
      const read = customerPaymentPublicationReader(
        {
          query: async <T extends Record<string, unknown>>() => {
            if (state.wait) await state.wait;
            if (state.revoked) throw Error('FICTIONAL CURRENT GRANT REVOKED');
            const receipt =
              state.cache && state.cached
                ? state.cached
                : {
                    ...f.value,
                    kind: state.kind,
                    observedAt: Date.now(),
                    expiresAt: Date.now() + 30000,
                  };
            state.cached = receipt;
            return { rows: [{ receipt }] as unknown as T[] };
          },
        } as GatewaySql,
        { enabled: true, mode: 'disposable-proposal' },
      );
      return read(target, new AbortController().signal);
    },
  );
  await page.clock.install();
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional receipt publication</title></head><body><div id="root"></div></body></html>',
  );
  await page.addScriptTag({ content: script });
});
test('defaultOFF then explicit keyboard reopen displays only original record with clear financial limits', async ({
  page,
}, info) => {
  const button = page.getByRole('button', { name: 'Reopen original receipt' });
  await expect(button).toBeDisabled();
  expect(states.get(page)!.calls).toBe(0);
  await page.evaluate(() => window.__payment_control__('enable'));
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Recorded capture', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('$40.00', { exact: true })).toBeVisible();
  await expect(page.getByText('$100.00', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/does not establish the current balance/),
  ).toBeVisible();
  await expect(page.locator('a')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('original-payment-receipt.png'),
    fullPage: true,
  });
});
test('current grant revocation clears prior content while rereading and never restores the old amount', async ({
  page,
}) => {
  await page.evaluate(() => window.__payment_control__('enable'));
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await expect(page.getByText('$40.00', { exact: true })).toBeVisible();
  const state = states.get(page)!;
  state.revoked = true;
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Current authorization is required',
  );
  await expect(page.getByText('$40.00', { exact: true })).toHaveCount(0);
});
test('context replacement and unmount suppress late old receipt without a delivery or payment action', async ({
  page,
}) => {
  await page.evaluate(() => window.__payment_control__('enable'));
  const state = states.get(page)!;
  state.wait = new Promise((r) => {
    state.release = r;
  });
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Checking current access',
  );
  await page.evaluate(() => {
    window.__payment_control__('different');
    window.__payment_control__('original');
  });
  state.release!();
  state.wait = null;
  await expect(page.getByText('$40.00', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await expect(page.getByText('$40.00', { exact: true })).toBeVisible();
  state.wait = new Promise((r) => {
    state.release = r;
  });
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await page.evaluate(() => window.__payment_control__('unmount'));
  state.release!();
  state.wait = null;
  await expect(
    page.getByRole('heading', { name: 'Recorded capture' }),
  ).toHaveCount(0);
});
test('refund is distinct and cached or expired evidence cannot extend customer visibility', async ({
  page,
}) => {
  const state = states.get(page)!;
  state.kind = 'refund';
  await page.evaluate(() => window.__payment_control__('enable'));
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recorded refund' }),
  ).toBeVisible();
  state.cache = true;
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Current authorization is required',
  );
  await expect(
    page.getByRole('heading', { name: 'Recorded refund' }),
  ).toHaveCount(0);
  state.cache = false;
  await page.getByRole('button', { name: 'Reopen original receipt' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recorded refund' }),
  ).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.getByRole('status')).toContainText('expired');
  await expect(
    page.getByRole('heading', { name: 'Recorded refund' }),
  ).toHaveCount(0);
});
