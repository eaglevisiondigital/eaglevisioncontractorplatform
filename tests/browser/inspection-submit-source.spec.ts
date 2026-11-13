import { test, expect } from '@playwright/test';
import { openModule } from './helpers/contractor-workspace';
import AxeBuilder from '@axe-core/playwright';

test('unsaved inspection content cannot be silently submitted in place of the displayed draft', async ({
  page,
}) => {
  await page.goto('/preview');
  await openModule(page, 'Property operations');
  await page.getByRole('button', { name: 'Inspections', exact: true }).click();
  await page
    .getByLabel(/Client report summary/i)
    .fill('Unfinished fictional corrected summary');
  await page
    .getByRole('button', { name: /Submit inspection for review/i })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Save the displayed visit changes' }),
  ).toBeVisible();
  await expect(page.getByLabel(/Client report summary/i)).toHaveValue(
    'Unfinished fictional corrected summary',
  );
  await expect(
    page.getByRole('button', { name: /Submit inspection for review/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Approve & publish report/i }),
  ).toHaveCount(0);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('explicit save reopens and publishes the exact edited summary and privacy choice', async ({
  page,
}) => {
  await page.goto('/preview');
  await openModule(page, 'Property operations');
  await page.getByRole('button', { name: 'Inspections', exact: true }).click();
  await page
    .getByLabel(/Client report summary/i)
    .fill('Explicit saved fictional report scope');
  await page
    .locator('.inspection-editor .property-check input')
    .first()
    .check();
  const withheld = await page.getByLabel(/Finding 1 description/i).inputValue();
  await page.getByLabel(/Include finding 1 in client report/i).uncheck();
  await page
    .getByRole('button', { name: /^Save visit draft$/i, exact: true })
    .click();
  await expect(
    page.getByText(/^draft · revision 2$/i, { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/Client report summary/i)).toHaveValue(
    'Explicit saved fictional report scope',
  );
  await page
    .getByRole('button', { name: /Submit inspection for review/i })
    .click();
  await page.getByRole('button', { name: /Approve & publish report/i }).click();
  await expect(
    page.getByText(/1 immutable published report version/i),
  ).toBeVisible();
  await openModule(page, 'Client project view');
  const report = page.getByRole('region', { name: 'Client property report' });
  await expect(report).toContainText('Explicit saved fictional report scope');
  await expect(report).not.toContainText(withheld);
});
