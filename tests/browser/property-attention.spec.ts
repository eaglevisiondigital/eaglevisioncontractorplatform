import { contractor, developerControls } from './helpers/property-portal';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('attention evidence remains conservative and navigates exact published reports and issued scopes', async ({
  page,
}, info) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url());
  });
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Attention center', exact: true })
    .click();
  const center = page.getByRole('region', {
    name: 'Property attention center',
    exact: true,
  });
  await developerControls(page);
  await page
    .getByRole('button', { name: 'Load synthetic attention examples' })
    .click();
  await expect(
    center.getByRole('group', { name: 'Attention summary' }),
  ).toContainText('3 possible recurring concerns');
  await expect(center.locator('article')).toHaveCount(11);
  const filter = center.getByRole('combobox', { name: 'Attention view' });
  await filter.selectOption('new');
  await expect(center.locator('article')).toHaveCount(1);
  await expect(center).toContainText('Comparison drain');
  await filter.selectOption('changed');
  await expect(center.locator('article')).toHaveCount(2);
  await expect(center).toContainText('East window seal');
  await expect(center).toContainText('reported severity changed');
  await expect(center).toContainText('not independently confirmed');
  const changes = center.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Damage · East window seal',
      exact: true,
    }),
  });
  await changes
    .getByText('Source inspection evidence (2)', { exact: true })
    .click();
  await expect(changes).toContainText('Reported severity: moderate');
  await expect(changes).toContainText('Reported severity: urgent');
  const source = changes.getByRole('button', {
    name: 'View source report · 2026-11-23 · v1',
    exact: true,
  });
  const sourceId = await source.getAttribute('data-report-id');
  await source.click();
  const history = page.getByRole('region', {
    name: 'Published inspection history',
  });
  await expect(history.locator('article')).toHaveCount(1);
  await expect(history).toContainText(
    'Synthetic attention check-in · 2026-11-23',
  );
  await expect(history.locator('article')).toHaveAttribute(
    'data-report-id',
    sourceId!,
  );
  await page
    .getByRole('button', { name: 'Attention center', exact: true })
    .click();
  await center
    .getByRole('combobox', { name: 'Attention view' })
    .selectOption('maintenance');
  await expect(center.locator('article')).toHaveCount(2);
  await expect(center).toContainText('Schedule routine drain clearing.');
  await center
    .getByRole('combobox', { name: 'Attention view' })
    .selectOption('estimates');
  await expect(center.locator('article')).toHaveCount(1);
  await center
    .getByRole('button', {
      name: 'Review linked issued scope · Version 2',
      exact: true,
    })
    .click();
  const review = page.getByRole('region', { name: 'Customer estimate review' });
  await expect(review.locator('article')).toHaveCount(1);
  await expect(review).toContainText('Version 2');
  await page
    .getByRole('button', { name: 'Attention center', exact: true })
    .click();
  await center
    .getByRole('combobox', { name: 'Attention view' })
    .selectOption('all');
  const omitted = center.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Damage · West path',
      exact: true,
    }),
  });
  await expect(omitted).toContainText('absence is not evidence of repair');
  await expect(omitted).toContainText('Repair status: Undetermined');
  const lookalikes = center
    .locator('article')
    .filter({ hasText: 'Similar wording appears under different finding IDs' });
  await expect(lookalikes).toHaveCount(3);
  for (const word of [
    'INTERNAL',
    'payroll',
    'margin',
    'unit_cost_minor',
    'internal_notes',
  ])
    await expect(center).not.toContainText(word);
  await expect(
    center.getByRole('button', {
      name: /approve|decline|pay|resolve|complete/i,
    }),
  ).toHaveCount(0);
  if ((await page.locator('.concept-developer').getAttribute('open')) !== null)
    await page.locator('.concept-developer summary').click();

  await center
    .getByRole('combobox', { name: 'Attention view' })
    .selectOption('changed');
  await center
    .locator('article')
    .filter({
      has: page.getByRole('heading', {
        name: 'Damage · East window seal',
        exact: true,
      }),
    })
    .getByText('Source inspection evidence (2)', { exact: true })
    .click();
  await mkdir('artifacts/property', { recursive: true });
  await page.screenshot({
    path: `artifacts/property/${info.project.name}-property-attention.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(outside).toEqual([]);
});

test('attention property/contractor changes and errors clear former evidence, with no connected fallback', async ({
  page,
}) => {
  await page.goto('/preview/property-portal');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await contractor(page, org);
    await developerControls(page);
    await page
      .getByRole('button', { name: 'Load synthetic attention examples' })
      .click();
    const center = page.getByRole('region', {
      name: 'Property attention center',
      exact: true,
    });
    await expect(center.locator('article')).toHaveCount(11);
    await page
      .getByRole('combobox', { name: 'Your property', exact: true })
      .selectOption({ label: '200 Synthetic Garden Lane' });
    await page
      .getByRole('button', { name: 'Attention center', exact: true })
      .click();
    await expect(center).toContainText('No published inspections');
    await expect(center.locator('article')).toHaveCount(0);
    await developerControls(page);
    await page.getByRole('button', { name: 'Simulate loading error' }).click();
    await expect(page.getByRole('alert')).toContainText('simulated error');
    await expect(center).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload preview status' }).click();
    await page
      .getByRole('button', { name: 'Attention center', exact: true })
      .click();
    await expect(center.locator('article')).toHaveCount(11);
  }
  await page.goto('/portal/property?organization_id=forged&customer_id=forged');
  await expect(
    page.getByRole('region', {
      name: 'Property attention center',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
});
