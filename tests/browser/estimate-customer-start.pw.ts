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
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL('./fixtures/estimate-customer-start.tsx', import.meta.url),
        ),
        formats: ['iife'],
        name: 'EstimateNavigationTest',
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw Error('Fixture bundle unavailable');
  script = result.output
    .filter((x) => x.type === 'chunk')
    .map((x) => x.code)
    .join('\n');
  css = result.output
    .filter((x) => x.type === 'asset' && x.fileName.endsWith('.css'))
    .map((x) => (x.type === 'asset' ? String(x.source) : ''))
    .join('\n');
});
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
});
async function open(page: Page) {
  await page.route('https://estimate-customer-start.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Estimate navigation</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-customer-start.test/fixture');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.locator('.estimate-list-row').first()).toBeVisible();
}
const newDraft = (page: Page) =>
  page.getByRole('button', { name: 'New estimate', exact: true });
const customer = (page: Page) =>
  page.getByRole('combobox', {
    name: 'Customer for new estimate',
    exact: true,
  });
test('a new estimate requires an explicit customer instead of defaulting to the first loaded record', async ({
  page,
}) => {
  await open(page);
  await expect(newDraft(page)).toBeDisabled();
  const ids = await page.evaluate(() => window.estimateCustomerStart.ids());
  const before = await page.evaluate(() =>
    window.estimateCustomerStart.counts(),
  );
  await customer(page).selectOption(ids.chosen);
  expect(
    await page.evaluate(() => window.estimateCustomerStart.counts()),
  ).toEqual(before);
  await newDraft(page).click();
  await expect(
    page.getByRole('textbox', { name: 'Project name', exact: true }),
  ).toBeEditable();
  const outcomes = await page.evaluate(() =>
    window.estimateCustomerStart.created(),
  );
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0].payloadCustomer).toBe(ids.chosen);
  expect(outcomes[0].snapshotCustomer).toBe(ids.chosen);
  expect(outcomes[0].payloadCustomer).not.toBe(ids.first);
  expect(
    (await page.evaluate(() => window.estimateCustomerStart.counts())).creates,
  ).toBe(1);
  expect(
    (await page.evaluate(() => window.estimateCustomerStart.counts()))
      .otherWrites,
  ).toBe(0);
});

test('blank and template drafts retain the explicit customer and click-bound inputs across preflight waits', async ({
  page,
}) => {
  for (const kind of ['blank', 'template']) {
    await open(page);
    const ids = await page.evaluate(() => window.estimateCustomerStart.ids());
    const template = page.getByRole('combobox', {
      name: 'Create from company template',
      exact: true,
    });
    await expect(template).toBeDisabled();
    await customer(page).selectOption(ids.chosen);
    await page.evaluate(() => {
      window.estimateCustomerStart.prepareInputs();
      window.estimateCustomerStart.hold();
    });
    if (kind === 'template') await template.selectOption(ids.template);
    else await newDraft(page).click();
    await expect
      .poll(() => page.evaluate(() => window.estimateCustomerStart.waiting()))
      .toBe(true);
    await page.evaluate(() => window.estimateCustomerStart.mutateInputs());
    await page.evaluate(() => window.estimateCustomerStart.release());
    await expect(
      page.getByRole('textbox', { name: 'Project name', exact: true }),
    ).toBeEditable();
    const outcomes = await page.evaluate(() =>
      window.estimateCustomerStart.created(),
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].payloadCustomer).toBe(ids.chosen);
    expect(outcomes[0].snapshotCustomer).toBe(ids.chosen);
    expect(outcomes[0].currency).toBe('USD');
    expect(outcomes[0].terms).toBe(
      kind === 'template' ? 'CLICK TEMPLATE TERMS' : 'CLICK DEFAULT TERMS',
    );
    expect(outcomes[0].markup).toBe(kind === 'template' ? 2345 : 1234);
    if (kind === 'template')
      expect(outcomes[0].project).toBe('CLICK TEMPLATE PROJECT');
    expect(
      (await page.evaluate(() => window.estimateCustomerStart.counts()))
        .otherWrites,
    ).toBe(0);
  }
});

test('empty duplicate foreign and stale customer choices never dispatch a draft or expose reader diagnostics', async ({
  page,
}) => {
  for (const kind of ['empty', 'duplicate', 'foreign', 'malformed', 'sparse']) {
    await open(page);
    await page.evaluate((k) => window.estimateCustomerStart.corrupt(k), kind);
    await page
      .getByRole('button', { name: 'Refresh estimates', exact: true })
      .click();
    await expect(customer(page)).toBeDisabled();
    if (kind === 'empty') {
      await expect(page.locator('.estimate-list-row').first()).toBeVisible();
      await expect(
        page.getByRole('textbox', { name: 'Search estimates', exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByText(
          'This estimate is unavailable or has changed. Refresh estimates before opening it.',
          { exact: true },
        ),
      ).toHaveCount(0);
    }
    await expect(customer(page).locator('option')).toHaveCount(1);
    await expect(newDraft(page)).toBeDisabled();
    await expect(
      page.getByRole('combobox', {
        name: 'Create from company template',
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      (await page.evaluate(() => window.estimateCustomerStart.counts()))
        .creates,
    ).toBe(0);
  }
  for (const kind of ['missing', 'foreign', 'wrong', 'changed', 'malformed']) {
    await open(page);
    const ids = await page.evaluate(() => window.estimateCustomerStart.ids());
    await customer(page).selectOption(ids.chosen);
    await page.evaluate((k) => window.estimateCustomerStart.lookup(k), kind);
    await newDraft(page).click();
    await expect(page.getByRole('status').last()).toContainText(
      'Customer selection is unavailable or has changed.',
    );
    await expect(customer(page)).toHaveValue('');
    await expect(newDraft(page)).toBeDisabled();
    expect(
      (await page.evaluate(() => window.estimateCustomerStart.counts()))
        .creates,
    ).toBe(0);
    expect(await page.locator('body').innerText()).not.toContain(
      'PRIVATE removed-customer',
    );
  }
});

test('company repo data reload and removal invalidate a captured customer before a held preflight can create', async ({
  page,
}) => {
  for (const kind of ['company', 'repo', 'reload', 'remove']) {
    await open(page);
    const ids = await page.evaluate(() => window.estimateCustomerStart.ids());
    await customer(page).selectOption(ids.chosen);
    await page.evaluate(() => window.estimateCustomerStart.hold());
    await newDraft(page).click();
    await expect
      .poll(() => page.evaluate(() => window.estimateCustomerStart.waiting()))
      .toBe(true);
    if (kind === 'company')
      await page.evaluate(() => window.estimateCustomerStart.company(1));
    if (kind === 'repo')
      await page.evaluate(() => window.estimateCustomerStart.replaceRepo());
    if (kind === 'remove')
      await page.evaluate(() => window.estimateCustomerStart.removeLoaded());
    if (kind === 'reload')
      await page.evaluate(() => window.estimateCustomerStart.sameIdReload());
    await page.evaluate(() => window.estimateCustomerStart.release());
    await expect(page.getByRole('status').last()).toContainText(
      'Customer selection is unavailable or has changed.',
    );
    await expect(customer(page)).toHaveValue('');
    await expect(newDraft(page)).toBeDisabled();
    expect(
      (await page.evaluate(() => window.estimateCustomerStart.counts()))
        .creates,
    ).toBe(0);
  }
});

test('current permission withdrawal denies preflight while an already dispatched immutable draft remains the original outcome', async ({
  page,
}) => {
  for (const kind of ['deny', 'disable']) {
    await open(page);
    const ids = await page.evaluate(() => window.estimateCustomerStart.ids());
    await customer(page).selectOption(ids.chosen);
    await page.evaluate(() => window.estimateCustomerStart.hold());
    await newDraft(page).click();
    await expect
      .poll(() => page.evaluate(() => window.estimateCustomerStart.waiting()))
      .toBe(true);
    if (kind === 'deny')
      await page.evaluate(() => window.estimateCustomerStart.deny());
    else await page.evaluate(() => window.estimateCustomerStart.disable());
    await page.evaluate(() => window.estimateCustomerStart.release());
    await expect(page.getByRole('status').last()).toContainText(
      'Customer selection is unavailable or has changed.',
    );
    expect(
      (await page.evaluate(() => window.estimateCustomerStart.counts()))
        .creates,
    ).toBe(0);
  }
  await open(page);
  const ids = await page.evaluate(() => window.estimateCustomerStart.ids());
  await customer(page).selectOption(ids.chosen);
  await page.evaluate(() => window.estimateCustomerStart.holdCreate());
  await newDraft(page).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.estimateCustomerStart.waitingCreate()),
    )
    .toBe(true);
  await page.evaluate(() => window.estimateCustomerStart.sameIdReload());
  await expect(customer(page)).toHaveValue('');
  await page.evaluate(() => window.estimateCustomerStart.release());
  await expect(
    page.getByRole('textbox', { name: 'Project name', exact: true }),
  ).toBeEditable();
  const outcomes = await page.evaluate(() =>
    window.estimateCustomerStart.created(),
  );
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0].payloadCustomer).toBe(ids.chosen);
  expect(outcomes[0].snapshotCustomer).toBe(ids.chosen);
  expect(
    (await page.evaluate(() => window.estimateCustomerStart.counts())).creates,
  ).toBe(1);
});

test('actual Estimates chooses its existing customer by keyboard before creating and retaining a private draft', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4377/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await expect(customer(page)).toBeEnabled();
  await expect(customer(page)).toHaveValue('');
  await expect(newDraft(page)).toBeDisabled();
  const id = await customer(page)
    .locator('option')
    .nth(1)
    .getAttribute('value');
  expect(id).toBeTruthy();
  await customer(page).focus();
  await customer(page).selectOption(id!);
  const axe = await new AxeBuilder({ page })
    .include('[aria-label="New estimate customer selection"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('actual-estimate-customer-choice.png'),
    fullPage: true,
  });
  await newDraft(page).focus();
  await page.keyboard.press('Enter');
  const project = page.getByRole('textbox', {
    name: 'Project name',
    exact: true,
  });
  await expect(project).toBeEditable();
  await expect(page.locator('h2[tabindex="-1"]')).toBeFocused();
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toHaveValue(id!);
  await project.fill('Keep this explicitly selected-customer draft');
  await expect(project).toHaveValue(
    'Keep this explicitly selected-customer draft',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('actual-selected-customer-private-draft.png'),
    fullPage: true,
  });
});
