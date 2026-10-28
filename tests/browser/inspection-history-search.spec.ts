import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { contractor, developerControls } from './helpers/property-portal';

test('combined evidence filters, clear/reset, exact source and comparison keep property context', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
  });
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Property reports', exact: true })
    .click();
  const history = page.getByRole('region', {
    name: 'Published inspection history',
  });
  const search = page.getByRole('search', {
    name: 'Search published inspection history',
  });
  await expect(history.locator('article')).toHaveCount(7);
  await expect(search).toContainText(
    'Missing or access-limited reports may exist',
  );
  await search.getByText('Filter inspection evidence', { exact: true }).click();
  await search
    .getByLabel('Inspection date from', { exact: true })
    .fill('2026-12-07');
  await search
    .getByLabel('Inspection date to', { exact: true })
    .fill('2026-12-14');
  await search
    .getByRole('combobox', { name: 'Concern category', exact: true })
    .selectOption('Damage');
  await search
    .getByRole('combobox', { name: 'Reported location', exact: true })
    .selectOption('Comparison window seal');
  await search
    .getByRole('searchbox', { name: 'Search published reports', exact: true })
    .fill('seal');
  await expect(history.locator('article')).toHaveCount(2);
  await expect(history.getByRole('status')).toContainText(
    '2 published reports shown of 7 available',
  );
  await search
    .getByRole('combobox', { name: 'Reported severity', exact: true })
    .selectOption('urgent');
  await expect(history.locator('article')).toHaveCount(1);
  const card = history.locator('article');
  const id = await card.getAttribute('data-report-id');
  const version = await card.getAttribute('data-report-version');
  await card
    .getByRole('button', { name: 'Open exact published report', exact: false })
    .click();
  await expect(history.locator('article')).toHaveAttribute(
    'data-report-id',
    id!,
  );
  await expect(history.locator('article')).toHaveAttribute(
    'data-report-version',
    version!,
  );
  await expect(search).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Show all inspection reports' })
    .click();
  await expect(
    search.getByRole('searchbox', {
      name: 'Search published reports',
      exact: true,
    }),
  ).toHaveValue('seal');
  await expect(history.locator('article')).toHaveCount(1);
  await history
    .getByRole('button', { name: 'Compare this inspection' })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'First published inspection' }),
  ).toHaveValue(id!);
  await page
    .getByRole('button', { name: 'Property reports', exact: true })
    .click();
  await expect(history.locator('article')).toHaveCount(1);
  await search
    .getByRole('button', { name: /^Clear Reported severity:/ })
    .click();
  await expect(history.locator('article')).toHaveCount(2);
  await history
    .getByRole('button', {
      name: 'Open property Attention Center',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', {
      name: 'Property attention center',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Property reports', exact: true })
    .click();
  await search.getByRole('button', { name: 'Reset history search' }).click();
  await expect(history.locator('article')).toHaveCount(7);
  await search.getByText('Filter inspection evidence', { exact: true }).click();
  await search
    .getByRole('searchbox', { name: 'Search recommendations', exact: true })
    .fill('assessment');
  await search
    .getByLabel('Inspection date from', { exact: true })
    .fill('2026-12-07');
  await expect(history.locator('article')).toHaveCount(2);
  await mkdir('artifacts/property', { recursive: true });
  await page.screenshot({
    path: `artifacts/property/${info.project.name}-history-search.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});

test('invalid dates, empty text results, keyboard reset and property/contractor/error changes clear stale searches', async ({
  page,
}) => {
  await page.goto('/preview/property-portal');
  const reports = () =>
    page.getByRole('button', { name: 'Property reports', exact: true }).click();
  await reports();
  const search = page.getByRole('search');
  const history = page.getByRole('region', {
    name: 'Published inspection history',
  });
  await search.getByText('Filter inspection evidence', { exact: true }).click();
  await search
    .getByLabel('Inspection date from', { exact: true })
    .fill('2026-12-14');
  await search
    .getByLabel('Inspection date to', { exact: true })
    .fill('2026-10-01');
  await expect(search.getByRole('alert')).toContainText(
    'Start date must be on or before end date',
  );
  await expect(history.locator('article')).toHaveCount(0);
  await search
    .getByRole('button', { name: /^Clear Inspection date to:/ })
    .click();
  await expect(search.getByRole('alert')).toHaveCount(0);
  await search.getByRole('button', { name: 'Reset history search' }).click();
  const query = search.getByRole('searchbox', {
    name: 'Search published reports',
    exact: true,
  });
  for (const text of [
    'private',
    'payroll',
    'unit_cost_minor',
    '<script>',
    'not a published observation',
  ]) {
    await query.fill(text);
    await expect(history.locator('article')).toHaveCount(0);
  }
  await expect(history).toContainText(
    'No published reports for this selection.',
  );
  const reset = search.getByRole('button', { name: 'Reset history search' });
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(history.locator('article')).toHaveCount(7);
  await query.fill('seal');
  const property = page.getByRole('combobox', {
    name: 'Your property',
    exact: true,
  });
  const original = await property.inputValue();
  await property.selectOption({ label: '200 Synthetic Garden Lane' });
  await reports();
  await expect(query).toHaveValue('');
  await expect(history.locator('article')).toHaveCount(0);
  await expect(history.getByRole('status')).toContainText(
    '0 published reports shown of 0 available',
  );
  await property.selectOption(original);
  await reports();
  await expect(history.locator('article')).toHaveCount(7);
  for (const org of [
    'sample-construction',
    'sample-roofing',
    'sample-property',
  ]) {
    await query.fill('seal');
    await contractor(page, org);
    await reports();
    await expect(query).toHaveValue('');
    await expect(history.locator('article')).toHaveCount(7);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await query.fill('seal');
  await developerControls(page);
  await page.getByRole('button', { name: 'Simulate loading error' }).click();
  await expect(search).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload preview status' }).click();
  await reports();
  await expect(query).toHaveValue('');
});
