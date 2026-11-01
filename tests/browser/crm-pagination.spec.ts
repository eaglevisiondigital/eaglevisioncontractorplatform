import { test, expect } from '@playwright/test';
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
          new URL('./fixtures/crm-pagination-harness.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'CrmPaginationTest',
      },
    },
  });
  const output = Array.isArray(bundled) ? bundled[0] : bundled;
  if (!('output' in output))
    throw Error('Actual estimate test bundle unavailable');
  script = output.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = output.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
async function open(page: import('@playwright/test').Page) {
  await page.route('**/__crm_pagination_test__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>CRM pagination test</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('/__crm_pagination_test__');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeEnabled();
}
test('all contractors page/search/select exact CRM customer and property, save safe preview and keep locked layout accessible', async ({
  page,
}, info) => {
  await open(page);
  for (const [index, org] of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ].entries()) {
    await page.getByLabel('Fixture contractor').selectOption(String(index));
    const customer = page.getByRole('combobox', {
        name: 'Estimate customer',
        exact: true,
      }),
      location = page.getByRole('combobox', {
        name: 'Job location',
        exact: true,
      });
    await expect(customer).toBeEnabled();
    await expect(customer.locator('option:checked')).toHaveText(
      'Jordan Example',
    );
    await expect(location.locator('option:checked')).toContainText(
      `${org} Property 12`,
    );
    await page.screenshot({
      path: `artifacts/phase3/${info.project.name}-crm-pagination-${org}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Next customers', exact: true })
      .click();
    await expect(
      page.getByText('Customers: 11–13 of 13 matching records', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(customer.locator('option:checked')).toHaveText(
      'Jordan Example',
    );
    await page
      .getByRole('button', { name: 'Next locations', exact: true })
      .click();
    await expect(
      page.getByText('Locations: 11–13 of 13 matching records', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(location.locator('option:checked')).toContainText(
      `${org} Property 12`,
    );
    await page
      .getByLabel('Find job location', { exact: true })
      .fill('Property 00');
    await expect(
      page.getByText('Locations: 1–1 of 1 matching records', { exact: true }),
    ).toBeVisible();
    const option = location
      .locator('option')
      .filter({ hasText: `${org} Property 00` });
    await location.selectOption((await option.getAttribute('value'))!);
    await expect(location.locator('option:checked')).toContainText(
      'Property 00',
    );
    await page
      .getByRole('button', { name: 'Save estimate draft', exact: true })
      .click();
    await expect(
      page.getByText('Saved revision 2', { exact: false }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Customer preview', exact: true })
      .click();
    const preview = page.getByRole('region', {
      name: 'Customer-facing estimate preview',
    });
    await expect(preview).toContainText(`${org} Property 00`);
    await expect(preview).not.toContainText('Internal unit cost');
    await page
      .getByRole('button', { name: 'Estimate builder', exact: true })
      .click();
    await page
      .getByLabel('Find estimate customer', { exact: true })
      .fill('customer 00');
    await expect(
      page.getByText('Customers: 1–1 of 1 matching records', { exact: true }),
    ).toBeVisible();
    const chosenCustomer = customer
      .locator('option')
      .filter({ hasText: `${org} customer 00` });
    await customer.selectOption((await chosenCustomer.getAttribute('value'))!);
    await expect(customer.locator('option:checked')).toHaveText(
      `${org} customer 00`,
    );
    await expect(location).toHaveValue('');
    await expect(
      page.getByLabel('Find job location', { exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Previous locations', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('No locations match this search', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Find estimate customer', { exact: true })
      .fill('No such customer');
    await expect(
      page.getByText('No customers match this search', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Reset customer search', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByText('Customers: 1–10 of 13 matching records', { exact: true }),
    ).toBeVisible();
    await expect(customer.locator('option:checked')).toHaveText(
      `${org} customer 00`,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations.map((v) => v.id),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test('drops delayed former-contractor results and recovers explicitly from CRM reader errors', async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole('button', { name: 'Hold CRM response', exact: true })
    .click();
  await page
    .getByLabel('Find estimate customer', { exact: true })
    .fill('delay');
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Fixture contractor').selectOption('1');
  await expect(
    page
      .getByRole('combobox', { name: 'Job location', exact: true })
      .locator('option:checked'),
  ).toContainText('sample-construction Property 12');
  await page
    .getByRole('button', { name: 'Release CRM response', exact: true })
    .click();
  await expect(
    page
      .getByRole('combobox', { name: 'Job location', exact: true })
      .locator('option:checked'),
  ).toContainText('sample-construction Property 12');
  await expect(
    page.getByLabel('Find estimate customer', { exact: true }),
  ).toHaveValue('');
  await page
    .getByRole('button', { name: 'Fail next CRM read', exact: true })
    .click();
  await page
    .getByLabel('Find estimate customer', { exact: true })
    .fill('trigger failure');
  await expect(
    page.getByText('Synthetic CRM reader unavailable', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Restore CRM reads', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Reload CRM selection', exact: true })
    .click();
  await expect(
    page.getByText('No customers match this search', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeEnabled();
});

test('a late former query cannot replace a newer search or its exact selected customer', async ({
  page,
}) => {
  await open(page);
  const search = page.getByLabel('Find estimate customer', { exact: true }),
    customer = page.getByRole('combobox', {
      name: 'Estimate customer',
      exact: true,
    });
  await page
    .getByRole('button', { name: 'Hold CRM response', exact: true })
    .click();
  await search.fill('delay');
  await expect(customer).toBeDisabled();
  await search.fill('customer 11');
  await expect(
    page.getByText('Customers: 1–1 of 1 matching records', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Release CRM response', exact: true })
    .click();
  await expect(search).toHaveValue('customer 11');
  await expect(customer.locator('option:checked')).toHaveText('Jordan Example');
  await expect(customer.locator('option')).toHaveCount(2);
  await expect(customer).toContainText('sample-property customer 11');
  await expect(
    page.getByText('No customers match this search', { exact: true }),
  ).not.toBeVisible();
});
