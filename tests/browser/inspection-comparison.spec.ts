import { contractor, developerControls } from './helpers/property-portal';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('published comparison shows exact two-sided evidence, ambiguity and accessible responsive layout', async ({
  page,
}, info) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url());
  });
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Compare inspections', exact: true })
    .click();
  const view = page.getByRole('region', {
    name: 'Published inspection comparison',
    exact: true,
  });
  await expect(view).toContainText('Choose two exact published reports');
  await developerControls(page);
  await page
    .getByRole('button', { name: 'Load synthetic comparison examples' })
    .click();
  await view
    .getByRole('button', { name: 'Compare selected inspections' })
    .click();
  const early = view.getByRole('region', {
    name: 'Earlier inspection',
    exact: true,
  });
  const late = view.getByRole('region', {
    name: 'Later inspection',
    exact: true,
  });
  await expect(early).toContainText('2026-12-07');
  await expect(late).toContainText('2026-12-14');
  await expect(early).toContainText('Exact published version: 1');
  const checklist = view.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Drain access checked',
      exact: true,
    }),
  });
  await expect(checklist).toContainText('Reported checklist result differs');
  await expect(checklist).toContainText('Published checklist position 2');
  await expect(checklist).toContainText('IDs are unavailable');
  await expect(
    checklist.getByRole('group', {
      name: 'Earlier inspection checklist evidence',
    }),
  ).toContainText('Reported not completed');
  await expect(
    checklist.getByRole('group', {
      name: 'Later inspection checklist evidence',
    }),
  ).toContainText('Reported completed');
  const matched = view.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Damage · Comparison window seal',
      exact: true,
    }),
  });
  await expect(matched).toContainText('Reported on both');
  await expect(matched).toContainText('not independently confirmed');
  await expect(
    matched.getByRole('list', { name: 'Reported differences' }),
  ).toContainText('Reported severity: differs');
  await expect(
    matched.getByRole('list', { name: 'Reported differences' }),
  ).toContainText('Observation wording: differs');
  await expect(
    matched.getByRole('list', { name: 'Reported differences' }),
  ).toContainText('Recommendation wording: differs');
  await expect(
    view.locator('article').filter({
      has: page.getByRole('heading', {
        name: 'Maintenance · Comparison drain',
        exact: true,
      }),
    }),
  ).toHaveCount(2);
  const missing = view.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Damage · Comparison side path',
      exact: true,
    }),
  });
  await expect(missing).toContainText('Absence is not evidence of repair');
  await expect(missing).toContainText('Repair status: Undetermined');
  for (const word of [
    'INTERNAL',
    'unit_cost',
    'payroll',
    'margin',
    'internal_notes',
  ])
    await expect(view).not.toContainText(word);
  await expect(
    view.getByRole('button', { name: /approve|decline|pay|resolve|complete/i }),
  ).toHaveCount(0);
  if ((await page.locator('.concept-developer').getAttribute('open')) !== null)
    await page.locator('.concept-developer summary').click();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir('artifacts/property', { recursive: true });
  await page.screenshot({
    path: `artifacts/property/${info.project.name}-inspection-comparison.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await view.locator('.comparison-heading').screenshot({
    path: `artifacts/property/${info.project.name}-inspection-pair.png`,
  });
  await matched.screenshot({
    path: `artifacts/property/${info.project.name}-inspection-finding.png`,
  });
  const link = matched
    .getByRole('button', { name: 'View finding source · v1', exact: true })
    .first();
  const id = await link.getAttribute('data-report-id'),
    version = await link.getAttribute('data-report-version');
  await link.click();
  const history = page.getByRole('region', {
    name: 'Published inspection history',
  });
  await expect(history.locator('article')).toHaveCount(1);
  await expect(history.locator('article')).toHaveAttribute(
    'data-report-id',
    id!,
  );
  await expect(history.locator('article')).toHaveAttribute(
    'data-report-version',
    version!,
  );
  await expect(history).toContainText(
    'Synthetic comparison check-in · 2026-12-07',
  );
  expect(outside).toEqual([]);
});

test('history and attention launch comparison; exact issued scope and source report navigation remain bound', async ({
  page,
}) => {
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Property reports', exact: true })
    .click();
  const history = page.getByRole('region', {
    name: 'Published inspection history',
  });
  const first = history
    .locator('article')
    .filter({ hasText: 'Weekly property check · 2026-10-16' });
  const id = await first.getAttribute('data-report-id');
  await first.getByRole('button', { name: 'Compare this inspection' }).click();
  const view = page.getByRole('region', {
    name: 'Published inspection comparison',
    exact: true,
  });
  await expect(
    view.getByRole('combobox', { name: 'First published inspection' }),
  ).toHaveValue(id!);
  const select = view.getByRole('combobox', {
    name: 'Second published inspection',
  });
  const other = await select
    .locator('option')
    .filter({ hasText: '2026-10-23' })
    .getAttribute('value');
  await select.selectOption(other!);
  await view
    .getByRole('button', { name: 'Compare selected inspections' })
    .click();
  await expect(view.locator('.comparison-finding')).toHaveCount(2);
  await expect(view).toContainText(
    'Similar wording appears under different finding IDs',
  );
  const scope = view.getByRole('button', {
    name: 'Review exact linked repair scope · Version 2',
  });
  const version = await scope.getAttribute('data-version-id');
  await scope.click();
  const review = page.getByRole('region', { name: 'Customer estimate review' });
  await expect(review.locator('article')).toHaveCount(1);
  await expect(review.locator('article')).toHaveAttribute(
    'data-version-id',
    version!,
  );
  await review.getByRole('button', { name: 'View inspection reports' }).click();
  await expect(history.locator('article')).toHaveAttribute(
    'data-report-id',
    id!,
  );
  await developerControls(page);
  await page
    .getByRole('button', { name: 'Load synthetic attention examples' })
    .click();
  const attention = page.getByRole('region', {
    name: 'Property attention center',
    exact: true,
  });
  const change = attention.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Damage · East window seal',
      exact: true,
    }),
  });
  await change
    .getByRole('button', { name: 'Compare source inspections' })
    .click();
  await view
    .getByRole('button', { name: 'Compare selected inspections' })
    .click();
  await expect(view).toContainText('2026-11-23');
  await expect(view).toContainText('2026-11-30');
  await expect(view).toContainText('Newly observed in this selection');
});

test('invalid pair, selection changes, errors and contractor/property switches never retain stale comparison', async ({
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
      .getByRole('button', { name: 'Load synthetic comparison examples' })
      .click();
    const view = page.getByRole('region', {
      name: 'Published inspection comparison',
      exact: true,
    });
    await view
      .getByRole('button', { name: 'Compare selected inspections' })
      .click();
    await expect(view.locator('.comparison-finding')).toHaveCount(4);
    const first = view.getByRole('combobox', {
        name: 'First published inspection',
      }),
      second = view.getByRole('combobox', {
        name: 'Second published inspection',
      });
    await second.selectOption(await first.inputValue());
    await expect(view.locator('.comparison-finding')).toHaveCount(0);
    await view
      .getByRole('button', { name: 'Compare selected inspections' })
      .click();
    await expect(view.getByRole('alert')).toContainText(
      'two distinct published reports',
    );
    await expect(view.locator('.comparison-finding')).toHaveCount(0);
    await developerControls(page);
    await page.getByRole('button', { name: 'Simulate loading error' }).click();
    await expect(view).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload preview status' }).click();
    await page
      .getByRole('combobox', { name: 'Your property', exact: true })
      .selectOption({ label: '200 Synthetic Garden Lane' });
    await page
      .getByRole('button', { name: 'Compare inspections', exact: true })
      .click();
    await expect(view).toContainText('At least two published reports');
    await expect(view.locator('.comparison-finding')).toHaveCount(0);
  }
  await page.goto('/portal/property?report_id=forged&version=9');
  await expect(
    page.getByRole('region', {
      name: 'Published inspection comparison',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
});
