import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
let script = '',
  css = '';
test.beforeAll(async () => {
  const b = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/estimate-crm-details.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'CrmDetailTest',
      },
    },
  });
  const out = Array.isArray(b) ? b[0] : b;
  if (!('output' in out)) throw Error('Fixture unavailable');
  script = out.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = out.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1'
      ? r.continue()
      : r.abort(),
  );
});
async function open(page: Page) {
  await page.route('https://estimate-crm.test/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Fictional CRM details</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-crm.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeEnabled();
}
const summary = (p: Page) =>
  p.getByText('Selected customer & property', { exact: true });
const details = (p: Page) =>
  p.getByRole('region', { name: 'Selected CRM details', exact: true });
test('selected contact and full postal details disambiguate the current business selection', async ({
  page,
}, info) => {
  await open(page);
  await expect(summary(page)).toBeVisible();
  await summary(page).click();
  await expect(details(page)).toContainText('taylor.first@example.test');
  await expect(details(page)).toContainText('555-0111');
  await expect(details(page)).toContainText('Suite B');
  await expect(details(page)).toContainText('Example City, TX 00001');
  const ids = await page.evaluate(() => window.estimateCrmDetails.identities());
  const text = await details(page).innerText();
  expect(text).not.toContain(ids.customer);
  expect(text).not.toContain(ids.property);
  await details(page).screenshot({
    path: info.outputPath('fictional-selected-contact-property.png'),
  });
  await page.evaluate(() => window.estimateCrmDetails.corrupt('incomplete'));
  await page
    .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
    .fill('Taylor');
  await expect(details(page)).toContainText('Street address not recorded');
  await expect(details(page)).toContainText(
    'City, region and postal code not recorded',
  );
  await expect(details(page)).toContainText('Country not recorded');
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeEnabled();
  expect(
    (await page.evaluate(() => window.estimateCrmDetails.counts())).writes,
  ).toBe(0);
});

test('replacing Operations with identical target IDs withholds old choices in the same commit before effects', async ({
  page,
}) => {
  await open(page);
  const snapshot = await page.evaluate(() =>
    window.estimateCrmDetails.replacePending(),
  );
  expect(snapshot.customerDisabled).toBe(true);
  expect(snapshot.customerOptions.join(' ')).not.toContain('Taylor Example');
  expect(snapshot.propertyOptions.join(' ')).not.toContain(
    '100 Fictional Review Lane',
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.estimateCrmDetails.counts())).waiting,
    )
    .toBe(true);
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => window.estimateCrmDetails.release());
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeEnabled();
});

test('existing search, paging, exact selection callbacks and disabled drafts retain their behavior', async ({
  page,
}) => {
  await open(page);
  await summary(page).click();
  const before = (await page.evaluate(() => window.estimateCrmDetails.counts()))
    .reads;
  await summary(page).click();
  await summary(page).click();
  expect(
    (await page.evaluate(() => window.estimateCrmDetails.counts())).reads,
  ).toBe(before);
  await page
    .getByRole('textbox', { name: 'Unsaved project note', exact: true })
    .fill('Retain unrelated draft');
  await page
    .getByRole('button', { name: 'Next customers', exact: true })
    .click();
  await expect(details(page)).toContainText('taylor.first@example.test');
  await page
    .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
    .fill('no-match');
  await expect(details(page)).toContainText('taylor.first@example.test');
  await expect(
    page
      .getByRole('combobox', { name: 'Estimate customer', exact: true })
      .locator('option'),
  ).toHaveCount(1);
  await page
    .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
    .fill('Taylor');
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toBeEnabled();
  const ids = await page.evaluate(() => window.estimateCrmDetails.identities());
  await page
    .getByRole('combobox', { name: 'Estimate customer', exact: true })
    .selectOption(ids.otherCustomer);
  await expect(details(page)).toContainText('taylor.second@example.test');
  await expect(details(page)).toContainText('No property selected.');
  const property = page.getByRole('combobox', {
    name: 'Job location',
    exact: true,
  });
  await expect(property.locator('option')).toHaveCount(2);
  await property.selectOption(
    (await property.locator('option').nth(1).getAttribute('value'))!,
  );
  await expect(details(page)).toContainText('Suite C');
  await expect(details(page)).toContainText('Other City, TX 00002');
  await expect(
    page.getByRole('textbox', { name: 'Unsaved project note', exact: true }),
  ).toHaveValue('Retain unrelated draft');
  expect(
    (await page.evaluate(() => window.estimateCrmDetails.counts())).selections,
  ).toBe(2);
  await page.evaluate(() => window.estimateCrmDetails.disable());
  await expect(property).toBeDisabled();
  await expect(details(page)).toContainText('taylor.second@example.test');
  expect(
    (await page.evaluate(() => window.estimateCrmDetails.counts())).writes,
  ).toBe(0);
});

test('foreign or mixed selected/page responses and private failures deny the whole presentation', async ({
  page,
}) => {
  for (const kind of [
    'customer-tenant',
    'customer-id',
    'page-tenant',
    'page-duplicate',
    'location-page',
    'property-tenant',
    'property-customer',
    'property-id',
    'count',
    'mixed',
  ]) {
    await open(page);
    await summary(page).click();
    await page.evaluate(
      (value) => window.estimateCrmDetails.corrupt(value),
      kind,
    );
    await page
      .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
      .fill(kind === 'mixed' ? 'Taylor' : 'Other');
    await expect(
      page.getByRole('button', { name: 'Reload CRM selection', exact: true }),
    ).toBeVisible();
    await expect(details(page)).toHaveCount(0);
    await expect(
      page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('taylor.first@example.test', { exact: true }),
    ).toHaveCount(0);
  }
  await open(page);
  await summary(page).click();
  await page.evaluate(() => window.estimateCrmDetails.fail());
  await page
    .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
    .fill('Taylor');
  await expect(
    page.getByRole('button', { name: 'Reload CRM selection', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'PRIVATE transport/account diagnostic must not be rendered',
      { exact: true },
    ),
  ).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.estimateCrmDetails.counts())).writes,
  ).toBe(0);
});

test('late company, target and Operations reads cannot replace the fresh business contact', async ({
  page,
}) => {
  for (const kind of ['company', 'target', 'operations']) {
    await open(page);
    await summary(page).click();
    await page.evaluate(() => window.estimateCrmDetails.hold());
    await page
      .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
      .fill('Taylor');
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.estimateCrmDetails.counts()))
            .waiting,
      )
      .toBe(true);
    await expect(details(page)).toHaveCount(0);
    if (kind === 'company')
      await page.evaluate(() => window.estimateCrmDetails.select(1));
    else if (kind === 'target')
      await page.evaluate(() => window.estimateCrmDetails.target('other'));
    else await page.evaluate(() => window.estimateCrmDetails.replace());
    const expected =
      kind === 'company'
        ? 'taylor.first.other-company@example.test'
        : kind === 'target'
          ? 'taylor.second@example.test'
          : 'replacement-context@example.test';
    await expect(details(page)).toContainText(expected);
    const fresh = await details(page).innerText();
    await page.evaluate(() => window.estimateCrmDetails.release());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(details(page)).toHaveText(fresh, { useInnerText: true });
    expect(
      (await page.evaluate(() => window.estimateCrmDetails.counts())).writes,
    ).toBe(0);
  }
});

test('actual Estimates preserves unsaved scope while reviewing selected CRM details by keyboard', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4367/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await page.locator('.estimate-list-row').first().click();
  const project = page.getByRole('textbox', {
    name: 'Project name',
    exact: true,
  });
  await expect(project).toBeEditable();
  await project.fill('Keep this unsaved scope');
  await summary(page).focus();
  await page.keyboard.press('Enter');
  await expect(details(page)).toBeVisible();
  await expect(details(page)).toContainText('No property selected.');
  await page
    .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
    .fill('no-match');
  await expect(details(page)).toBeVisible();
  await expect(project).toHaveValue('Keep this unsaved scope');
  const result = await new AxeBuilder({ page })
    .include('[aria-label="Estimate CRM selection"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await details(page).screenshot({
    path: info.outputPath('actual-estimate-selected-crm.png'),
  });
  await page.screenshot({
    path: info.outputPath('actual-estimate-crm-editor.png'),
    fullPage: true,
  });
});
