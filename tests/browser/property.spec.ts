import { contractor } from './helpers/property-portal';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
test.setTimeout(60000);
async function shot(
  page: import('@playwright/test').Page,
  name: string,
  project: string,
) {
  await mkdir('artifacts/property', { recursive: true });
  await page.screenshot({
    path: `artifacts/property/${project}-${name}.png`,
    fullPage: true,
    animations: 'disabled',
    timeout: 15000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test('three contractor inspection workspaces retain separate plans, immutable reports and private findings', async ({
  page,
}, info) => {
  await page.goto('/preview');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await page
      .getByRole('button', { name: 'Property operations', exact: true })
      .click();
    await expect(page.getByLabel('Internal inspection notes')).toContainText(
      'INTERNAL',
    );
    const checks = page.locator('.inspection-editor .property-check input');
    await checks.first().check();
    await page
      .getByRole('button', { name: 'Save visit draft', exact: true })
      .click();
    await expect(
      page.getByText('draft · revision 2', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Submit inspection for review' })
      .click();
    await page
      .getByRole('button', { name: 'Approve & publish report' })
      .click();
    await expect(
      page.getByText('1 immutable published report version(s).', {
        exact: false,
      }),
    ).toBeVisible();
    await shot(page, `${org}-inspections`, info.project.name);
    await page
      .getByRole('button', { name: 'Client project view', exact: true })
      .click();
    const client = page.getByRole('region', { name: 'Client property report' });
    await expect(client).toContainText('Published report v1');
    await expect(client).not.toContainText('INTERNAL');
    await expect(client).not.toContainText('margin');
    await page
      .getByRole('button', {
        name: 'Load synthetic approved financial example',
      })
      .click();
    await expect(client).toContainText('synthetic internal example');
    await expect(client).not.toContainText('unit_cost_minor');
    await expect(client).not.toContainText('markup');
    await shot(page, `${org}-client`, info.project.name);
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
test('supplier comparisons retain provenance, include acquisition fees and only revise drafts', async ({
  page,
}, info) => {
  await page.goto('/preview');
  await page
    .getByRole('button', { name: 'Supplier comparison', exact: true })
    .click();
  for (let i = 0; i < 4; i++)
    await page
      .getByRole('button', { name: 'Add synthetic quote example' })
      .click();
  await expect(
    page.getByRole('button', { name: 'Add supplier quote', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('region', { name: 'Supplier acquisition comparison' }),
  ).toContainText('Best reviewed mixed basket:');
  await page
    .getByRole('button', { name: 'Retain reviewed quote snapshot' })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Quote snapshot retained locally' }),
  ).toBeVisible();
  await shot(page, 'supplier-comparison', info.project.name);
  await page
    .getByRole('button', {
      name: 'Copy reviewed goods costs to estimate draft',
    })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'original issued scope unchanged' }),
  ).toBeVisible();
});
test('media never uploads and unbilled reviews cannot issue or charge a customer invoice', async ({
  page,
}, info) => {
  await page.goto('/preview');
  await page
    .getByRole('button', { name: 'Property operations', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Media & galleries', exact: true })
    .click();
  await expect(
    page.getByLabel('Capture or choose files · unavailable'),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Upload to quarantine · disabled' }),
  ).toBeDisabled();
  await shot(page, 'media-galleries', info.project.name);
  await page
    .getByRole('button', { name: 'Unbilled materials', exact: true })
    .click();
  await page
    .getByLabel('Material billing classification')
    .selectOption('proposed');
  await page
    .getByLabel('Scope review rationale')
    .fill(
      'Synthetic scope review confirms these additional materials need customer approval.',
    );
  await page
    .getByRole('combobox', { name: 'Supplemental pricing', exact: true })
    .selectOption('percent');
  await page.getByLabel('Markup percentage · not gross margin').fill('15');
  await page.getByRole('button', { name: 'Record contractor review' }).click();
  await expect(
    page.getByRole('region', { name: 'Unbilled material review' }),
  ).toContainText('awaiting customer authorization');
  await shot(page, 'unbilled-review', info.project.name);
  await page
    .getByRole('button', { name: 'Client project view', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Client property report' }),
  ).not.toContainText('Additional materials subject');
});
test('CRM-bound inspection plans and scheduled visits remain editable after saving', async ({
  page,
}) => {
  await page.goto('/preview');
  await page
    .getByRole('button', { name: 'Property operations', exact: true })
    .click();
  await page
    .getByText('Create property inspection plan', { exact: true })
    .click();
  await page.getByLabel('New survey name').fill('Synthetic weekly inspection');
  await page
    .getByRole('button', { name: 'Create inspection plan', exact: true })
    .click();
  await expect(page.getByLabel('Inspection plan', { exact: true })).toHaveValue(
    'Synthetic weekly inspection',
  );
  await page
    .getByRole('combobox', { name: 'Visit frequency', exact: true })
    .selectOption('weekly');
  await page
    .getByRole('button', { name: 'Save inspection plan', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Visit project stage', exact: true })
    .selectOption('after');
  await page.getByLabel('Next visit date').fill('2026-11-18');
  await page
    .getByRole('button', { name: 'Schedule visit', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Visit · 2026-11-18' }),
  ).toBeVisible();
  await page
    .getByLabel('Client report summary')
    .fill('Synthetic weekly follow-up');
  await page
    .getByRole('button', { name: 'Save visit draft', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Visit · 2026-11-18' }),
  ).toBeVisible();
  await expect(page.getByLabel('Client report summary')).toHaveValue(
    'Synthetic weekly follow-up',
  );
});
test('report-only customer preview shows recurring history without private findings or financial authority', async ({
  page,
}, info) => {
  await page.goto('/preview/property-portal');
  await expect(
    page.getByText('SYNTHETIC CUSTOMER PORTAL', { exact: false }),
  ).toBeVisible();
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await contractor(page, org);
    await page
      .getByRole('button', { name: 'Property reports', exact: true })
      .click();
    const history = page.getByRole('region', {
      name: 'Published inspection history',
    });
    await expect(history).toContainText('Weekly property check');
    await expect(history).toContainText('Monthly property check');
    await expect(history.locator('article')).toHaveCount(7);
    await page
      .getByRole('combobox', { name: 'Service month' })
      .selectOption('2026-11');
    await expect(history.locator('article')).toHaveCount(3);
    await expect(history).not.toContainText('Weekly property check');
    await history
      .getByText('Inspection checklist', { exact: true })
      .first()
      .click();
    await expect(history).toContainText(
      'Completed: Exterior condition and safety',
    );
    await page
      .getByRole('combobox', { name: 'Service month' })
      .selectOption('all');
    for (const word of [
      'INTERNAL',
      'margin',
      'payroll',
      'unit_cost_minor',
      'markup',
      'supplemental',
    ])
      await expect(history).not.toContainText(word);
    await expect(
      page.getByRole('button', { name: /approve|decline|pay|sign|upload/i }),
    ).toHaveCount(0);
  }
  await shot(page, 'customer-report-only', info.project.name);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('connected customer property route stays closed and never falls back to synthetic reports', async ({
  page,
}) => {
  await page.goto('/portal/property');
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Published inspection history' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Load synthetic inspection history' }),
  ).toHaveCount(0);
});
