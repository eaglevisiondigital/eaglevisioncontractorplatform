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
          new URL('./fixtures/estimate-crm-refresh.tsx', import.meta.url),
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
  await page.route('https://estimate-crm-refresh.test/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!DOCTYPE html><html lang="en"><head><title>Fictional CRM details</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('https://estimate-crm-refresh.test/fixture');
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
const refresh = (p: Page) =>
  p.getByRole('button', { name: 'Refresh CRM records', exact: true });

test('refresh reads the selected contact and address without changing selection or unsaved work', async ({
  page,
}) => {
  await open(page);
  await summary(page).click();
  await page
    .getByRole('textbox', { name: 'Unsaved project note' })
    .fill('Keep this draft');
  const before = await page.evaluate(() => ({
    counts: window.estimateCrmRefresh.counts(),
    queries: window.estimateCrmRefresh.queries(),
    ids: window.estimateCrmRefresh.identities(),
  }));
  await page.evaluate(() => window.estimateCrmRefresh.update());
  await expect(refresh(page)).toBeEnabled();
  await refresh(page).click();
  await expect(details(page)).toContainText('refreshed1@example.test');
  await expect(details(page)).toContainText('Updated suite 1');
  const after = await page.evaluate(() => ({
    counts: window.estimateCrmRefresh.counts(),
    queries: window.estimateCrmRefresh.queries(),
    ids: window.estimateCrmRefresh.identities(),
  }));
  // The four original picker expressions retain two nested customer-ownership
  // lookups inside Operations' location readers. Compare the entire transcript.
  expect(before.queries.map((entry) => JSON.parse(entry)[0])).toEqual([
    'customer-page',
    'selected-customer',
    'location-page',
    'selected-customer',
    'selected-location',
    'selected-customer',
  ]);
  expect(after.queries.slice(before.queries.length)).toEqual(before.queries);
  expect(after.counts.reads - before.counts.reads).toBe(6);
  expect(after.counts.writes).toBe(0);
  expect(after.counts.selections).toBe(0);
  expect(after.ids).toEqual(before.ids);
  await expect(
    page.getByRole('textbox', { name: 'Unsaved project note' }),
  ).toHaveValue('Keep this draft');
  await page.evaluate(() => window.estimateCrmRefresh.disable());
  await expect(refresh(page)).toBeDisabled();
  expect(
    (await page.evaluate(() => window.estimateCrmRefresh.counts())).reads,
  ).toBe(after.counts.reads);
});

test('refresh hides old data synchronously and ignores repeat clicks while the exact read is pending', async ({
  page,
}) => {
  await open(page);
  await summary(page).click();
  const before = await page.evaluate(() => window.estimateCrmRefresh.counts());
  await page.evaluate(() => {
    window.estimateCrmRefresh.update();
    window.estimateCrmRefresh.hold();
  });
  const snapshot = await page.evaluate(() =>
    window.estimateCrmRefresh.refreshSnapshot(),
  );
  expect(snapshot.disabled).toBe(true);
  expect(snapshot.detailsPresent).toBe(false);
  expect(snapshot.oldOptions.join(' ')).not.toContain('Taylor Example');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.estimateCrmRefresh.counts())).waiting,
    )
    .toBe(true);
  await expect(refresh(page)).toBeDisabled();
  await refresh(page).dispatchEvent('click');
  expect(
    (await page.evaluate(() => window.estimateCrmRefresh.counts())).reads -
      before.reads,
  ).toBe(6);
  await page.evaluate(() => window.estimateCrmRefresh.release());
  await expect(details(page)).toContainText('refreshed1@example.test');
});

test('a failed or foreign refresh withholds the whole view and the original error reload recovers it', async ({
  page,
}) => {
  for (const kind of [
    'failure',
    'customer-tenant',
    'mixed',
    'property-customer',
  ]) {
    await open(page);
    await summary(page).click();
    if (kind === 'mixed') {
      await page
        .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
        .fill('Taylor');
      await expect(refresh(page)).toBeEnabled();
    }
    if (kind === 'failure')
      await page.evaluate(() => window.estimateCrmRefresh.fail());
    else await page.evaluate((k) => window.estimateCrmRefresh.corrupt(k), kind);
    await refresh(page).click();
    await expect(
      page.getByRole('button', { name: 'Reload CRM selection', exact: true }),
    ).toBeVisible();
    await expect(details(page)).toHaveCount(0);
    await expect(refresh(page)).toBeDisabled();
    await expect(
      page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
    ).toBeDisabled();
    expect(await page.locator('body').innerText()).not.toContain(
      'PRIVATE transport/account',
    );
    await page.evaluate(() => window.estimateCrmRefresh.recover());
    await page
      .getByRole('button', { name: 'Reload CRM selection', exact: true })
      .click();
    await expect(details(page)).toContainText('taylor.first@example.test');
    expect(
      (await page.evaluate(() => window.estimateCrmRefresh.counts())).writes,
    ).toBe(0);
  }
});

test('refresh preserves customer and location searches and the selected customer on a later page', async ({
  page,
}) => {
  await open(page);
  await summary(page).click();
  await page
    .getByRole('searchbox', { name: 'Find estimate customer', exact: true })
    .fill('Other');
  await page
    .getByRole('button', { name: 'Next customers', exact: true })
    .click();
  await page
    .getByRole('searchbox', { name: 'Find job location', exact: true })
    .fill('Fictional');
  await expect(refresh(page)).toBeEnabled();
  const before = await page.evaluate(() => ({
    queries: window.estimateCrmRefresh.queries().slice(-4),
    ids: window.estimateCrmRefresh.identities(),
  }));
  await refresh(page).click();
  await expect(refresh(page)).toBeEnabled();
  expect(
    await page.evaluate(() => window.estimateCrmRefresh.queries().slice(-4)),
  ).toEqual(before.queries);
  expect(
    await page.evaluate(() => window.estimateCrmRefresh.identities()),
  ).toEqual(before.ids);
  await expect(
    page.getByRole('searchbox', {
      name: 'Find estimate customer',
      exact: true,
    }),
  ).toHaveValue('Other');
  await expect(
    page.getByRole('searchbox', { name: 'Find job location', exact: true }),
  ).toHaveValue('Fictional');
  await expect(
    page.getByRole('button', { name: 'Previous customers', exact: true }),
  ).toBeEnabled();
  expect(
    (await page.evaluate(() => window.estimateCrmRefresh.counts())).selections,
  ).toBe(0);
});

test('a late refresh cannot replace a new company or Operations context', async ({
  page,
}) => {
  for (const kind of ['company', 'operations']) {
    await open(page);
    await summary(page).click();
    await page.evaluate(() => window.estimateCrmRefresh.hold());
    await refresh(page).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.estimateCrmRefresh.counts()))
            .waiting,
      )
      .toBe(true);
    if (kind === 'company')
      await page.evaluate(() => window.estimateCrmRefresh.select(1));
    else await page.evaluate(() => window.estimateCrmRefresh.replace());
    const expected =
      kind === 'company'
        ? 'taylor.first.other-company@example.test'
        : 'replacement-context@example.test';
    await expect(details(page)).toContainText(expected);
    const fresh = await details(page).innerText();
    await page.evaluate(() => window.estimateCrmRefresh.release());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(details(page)).toHaveText(fresh, { useInnerText: true });
    expect(
      (await page.evaluate(() => window.estimateCrmRefresh.counts())).writes,
    ).toBe(0);
  }
});

test('actual Estimates refresh works by keyboard and preserves its unsaved draft accessibly', async ({
  page,
}, info) => {
  await page.goto('http://127.0.0.1:4371/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await page.locator('.estimate-list-row').first().click();
  const project = page.getByRole('textbox', {
    name: 'Project name',
    exact: true,
  });
  await expect(project).toBeEditable();
  await project.fill('Keep this original draft');
  await summary(page).click();
  await expect(details(page)).toBeVisible();
  const oldSelection = await page
    .getByRole('combobox', { name: 'Estimate customer', exact: true })
    .inputValue();
  await refresh(page).focus();
  await page.keyboard.press('Enter');
  await expect(refresh(page)).toBeEnabled();
  await expect(details(page)).toBeVisible();
  await expect(project).toHaveValue('Keep this original draft');
  await expect(
    page.getByRole('combobox', { name: 'Estimate customer', exact: true }),
  ).toHaveValue(oldSelection);
  await expect(refresh(page)).toBeFocused();
  const clearance = await refresh(page).evaluate((button) => {
    const style = getComputedStyle(button);
    const label = button.parentElement!.querySelector('.p3-field > span')!;
    return {
      outlineBottom:
        button.getBoundingClientRect().bottom +
        parseFloat(style.outlineWidth) +
        parseFloat(style.outlineOffset),
      labelTop: label.getBoundingClientRect().top,
    };
  });
  expect(clearance.labelTop).toBeGreaterThanOrEqual(clearance.outlineBottom);
  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Estimate CRM selection"]')
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
  await page
    .locator('[aria-label="Estimate CRM selection"]')
    .screenshot({ path: info.outputPath('actual-crm-refresh-picker.png') });
  await page.screenshot({
    path: info.outputPath('actual-crm-refresh-editor.png'),
    fullPage: true,
  });
});
