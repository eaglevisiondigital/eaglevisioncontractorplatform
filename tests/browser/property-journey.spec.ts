import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('property journey joins check-in history, exact repair scope and review-only preferences', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
  });
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Load synthetic inspection history' })
    .click();
  const history = page.getByRole('region', {
    name: 'Published inspection history',
  });
  await expect(history.locator('article')).toHaveCount(3);
  await page
    .getByRole('combobox', { name: 'Check-in frequency' })
    .selectOption('weekly');
  await expect(history.locator('article')).toHaveCount(2);
  await page
    .getByRole('combobox', { name: 'Service month' })
    .selectOption('2026-11');
  await expect(
    history.getByText('No published reports for this selection.'),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Check-in frequency' })
    .selectOption('monthly');
  await expect(history.locator('article')).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Service month' })
    .selectOption('all');
  await page
    .getByRole('combobox', { name: 'Check-in frequency' })
    .selectOption('all');
  await page
    .getByRole('button', { name: 'Prepare synthetic review example' })
    .click();
  await history
    .getByRole('button', { name: 'Review related repair scope' })
    .click();
  const review = page.getByRole('region', { name: 'Customer estimate review' });
  await expect(review.locator('article')).toHaveCount(1);
  await expect(review).toContainText('Version 2');
  await expect(
    review.getByRole('button', {
      name: 'Preview approve version 2',
      exact: true,
    }),
  ).toBeDisabled();
  await review.getByRole('checkbox').check();
  await review
    .getByRole('button', { name: 'Preview approve version 2', exact: true })
    .click();
  await expect(review).toContainText('Approved · synthetic preference');
  await expect(
    review.getByRole('button', {
      name: 'Preview decline version 2',
      exact: true,
    }),
  ).toBeDisabled();
  await review.getByRole('button', { name: 'View inspection reports' }).click();
  await expect(history.locator('article')).toHaveCount(1);
  await expect(history).toContainText('Weekly property check · 2026-10-16');
  await page
    .getByRole('button', { name: 'Show all inspection reports' })
    .click();
  await expect(history.locator('article')).toHaveCount(3);
  const properties = page.getByRole('combobox', {
    name: 'Your property',
    exact: true,
  });
  const home = await properties.inputValue();
  await properties.selectOption({ label: '200 Synthetic Garden Lane' });
  await expect(history.locator('article')).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: 'Property summary' }),
  ).toContainText('0 published check-ins');
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await expect(review).toContainText(
    'No authorized estimate is available for this property.',
  );
  await expect(
    review.getByRole('button', { name: /approve|decline/ }),
  ).toHaveCount(0);
  await properties.selectOption(home);
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await expect(review).toContainText('Approved · synthetic preference');
  await review.getByRole('checkbox').check();
  await review
    .getByRole('button', { name: 'Preview decline version 1', exact: true })
    .click();
  await expect(review).toContainText('Declined · synthetic preference');
  for (const word of [
    'INTERNAL',
    'unit_cost_minor',
    'payroll',
    'markup',
    'margin',
  ])
    await expect(review).not.toContainText(word);
  await expect(
    page.getByRole('button', {
      name: /pay now|sign contract|issue invoice|upload/i,
    }),
  ).toHaveCount(0);
  await page.getByText('Demonstrate preview states', { exact: true }).click();
  await page.getByText('Local preview controls', { exact: true }).click();
  await mkdir('artifacts/property', { recursive: true });
  await page.screenshot({
    path: `artifacts/property/${info.project.name}-property-journey.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});

test('error recovery clears views and contractor changes cannot retain another property or preference', async ({
  page,
}) => {
  await page.goto('/preview/property-portal');
  for (const [org, name] of [
    ['sample-property', 'Straight Edge Property Services'],
    ['sample-construction', 'Cunningham Construction'],
    ['sample-roofing', 'Roofing Company · Example'],
  ]) {
    await page
      .getByRole('combobox', { name: 'Sample contractor' })
      .selectOption(org);
    await expect(page.locator('.contractor-heading')).toContainText(name);
    await expect(
      page
        .getByRole('region', { name: 'Published inspection history' })
        .locator('article'),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Load synthetic inspection history' })
      .click();
    await page.getByRole('button', { name: 'Simulate loading error' }).click();
    await expect(page.getByRole('alert')).toContainText('simulated error');
    await expect(
      page.getByRole('region', { name: 'Published inspection history' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Your properties' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload preview status' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Published inspection history' })
        .locator('article'),
    ).toHaveCount(3);
  }
  await page.goto('/portal/property?organization_id=forged&customer_id=forged');
  await expect(
    page.getByRole('region', { name: 'Your properties' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
});
