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
    define: {
      'import.meta.env': '{"DEV":true,"VITE_SALES_HANDOFF_TEST":"true"}',
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.DEV': 'true',
      'import.meta.env.VITE_SALES_HANDOFF_TEST': '"true"',
    },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/sales-handoff-harness.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'SalesContractPreparationTest',
      },
    },
  });
  const out = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in out)) throw Error('Missing actual bundle');
  script = out.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = out.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
async function open(page: Page) {
  await page.route('**/__contract_preparation_test__', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Contract preparation review test</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/__contract_preparation_test__');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
}
async function retain(page: Page, index = 0) {
  await page.getByLabel('Fixture contractor').selectOption(String(index));
  await page
    .getByRole('button', { name: 'Prepare local test evidence', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Reload exact evidence', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('checkbox', {
      name: /I reviewed the exact issued scope and accepted test receipt/,
    })
    .check();
  await page
    .getByRole('button', {
      name: 'Retain review-only scope reference',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', { name: 'Retained scope reference', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', {
      name: 'Contract preparation review',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByText('Controlled evidence fault controls', { exact: true })
    .click();
  await page
    .getByLabel('Enable preparation checklist', { exact: true })
    .check();
}
async function confirm(page: Page) {
  const region = page.getByRole('region', {
    name: 'Contract preparation review',
    exact: true,
  });
  const button = region.getByRole('button', {
    name: 'Prepare staff contract review',
    exact: true,
  });
  await expect(button).toBeDisabled();
  for (const box of await region.getByRole('checkbox').all()) {
    await box.focus();
    await page.keyboard.press('Space');
  }
  await expect(button).toBeEnabled();
  return { region, button };
}
test('three brands explicitly prepare canonical immutable source snapshots with keyboard, privacy, axe and responsive evidence', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:') &&
      !r.url().startsWith('data:')
    )
      external.push(r.url());
  });
  await open(page);
  for (const [index, org] of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ].entries()) {
    await retain(page, index);
    const { region, button } = await confirm(page);
    await button.focus();
    await page.keyboard.press('Enter');
    const packet = region.getByRole('region', {
      name: 'Prepared contract review snapshot',
      exact: true,
    });
    await expect(packet).toBeVisible();
    await expect(packet).toContainText('Contract execution: BLOCKED');
    await expect(button).toBeDisabled();
    await packet
      .getByRole('button', {
        name: 'Verify exact preparation sources',
        exact: true,
      })
      .click();
    await expect(packet).toContainText(
      'Exact preparation and original source are current.',
    );
    await packet
      .getByText('Reviewed scope, terms and dates', { exact: true })
      .click();
    await expect(packet).toContainText('Estimate proposal terms only.');
    expect(await packet.innerText()).not.toMatch(
      /PRIVATE|unit_cost_minor|internal_notes|profit_margin|payroll/,
    );
    await expect(
      region.getByRole('button', {
        name: /sign|send|deliver|create contract|approve|pay/i,
      }),
    ).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await region.screenshot({
      path: `artifacts/phase3/${info.project.name}-contract-preparation-${org}.png`,
    });
    await packet.screenshot({
      path: `artifacts/phase3/${info.project.name}-contract-preparation-snapshot-${org}.png`,
    });
  }
  expect(external).toEqual([]);
});
test('preserves stale snapshots and UNKNOWN exact reconciliation without allowing another preparation', async ({
  page,
}) => {
  await open(page);
  await retain(page);
  const { region, button } = await confirm(page);
  await button.click();
  const packet = region.getByRole('region', {
    name: 'Prepared contract review snapshot',
    exact: true,
  });
  await expect(packet).toBeVisible();
  const facts = await packet.locator('dl').innerText();
  await page
    .getByRole('button', { name: 'Prepare newer private draft', exact: true })
    .click();
  await packet
    .getByRole('button', { name: 'Verify exact preparation sources' })
    .click();
  await expect(packet).toContainText(
    'STALE — retained preparation is unchanged',
  );
  expect(await packet.locator('dl').innerText()).toBe(facts);
  await expect(button).toBeDisabled();
  await page
    .getByRole('button', { name: 'Fail source reads', exact: true })
    .click();
  await packet
    .getByRole('button', { name: 'Verify exact preparation sources' })
    .click();
  await expect(packet).toContainText('UNKNOWN — exact preparation');
  await expect(packet.locator('dl')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Restore source reads', exact: true })
    .click();
  await packet
    .getByRole('button', { name: 'Verify exact preparation sources' })
    .click();
  await expect(packet).toContainText(
    'STALE — retained preparation is unchanged',
  );
  expect(await packet.locator('dl').innerText()).toBe(facts);
  await expect(button).toBeDisabled();
});
test('denies revoked staff and holds failed preparations without retry', async ({
  page,
}) => {
  await open(page);
  await retain(page);
  const { region, button } = await confirm(page);
  await page
    .getByRole('button', { name: 'Revoke reviewer', exact: true })
    .click();
  await button.click();
  await expect(region.getByRole('alert')).toContainText(
    'UNKNOWN — preparation denied',
  );
  await expect(button).toBeDisabled();
  await expect(
    region.getByRole('region', { name: 'Prepared contract review snapshot' }),
  ).toHaveCount(0);
  await expect(region.getByRole('checkbox').first()).toBeDisabled();
});
test('default-off and late held reads cannot restore a previous contractor or checklist', async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole('region', { name: 'Estimate to contract handoff' }),
  ).toHaveCount(0);
  await retain(page);
  const { button } = await confirm(page);
  await page
    .getByRole('button', { name: 'Hold source reads', exact: true })
    .click();
  await button.click();
  await expect(
    page.getByRole('button', {
      name: 'Checking original sources…',
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel('Fixture contractor').selectOption('1');
  await expect(
    page.getByRole('region', { name: 'Contract preparation review' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Release prior held response', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Prepared contract review snapshot' }),
  ).toHaveCount(0);
  await retain(page, 1);
  const region = page.getByRole('region', {
    name: 'Contract preparation review',
    exact: true,
  });
  for (const box of await region.getByRole('checkbox').all())
    await expect(box).not.toBeChecked();
  await expect(
    region.getByRole('button', {
      name: 'Prepare staff contract review',
      exact: true,
    }),
  ).toBeDisabled();
});
