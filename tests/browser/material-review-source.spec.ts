import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function open(page: import('@playwright/test').Page) {
  await page.goto(
    'http://127.0.0.1:4206/tests/browser/fixtures/material-review-source.html',
  );
  await page
    .getByRole('combobox', {
      name: 'Material billing classification',
      exact: true,
    })
    .selectOption('proposed');
  await page
    .getByRole('textbox', { name: 'Scope review rationale', exact: true })
    .fill('Original unfinished review rationale retained');
}
test('stale credit review is denied then explicit source refresh retains work and saves only revised proposal', async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole('button', { name: 'Apply fixture approved credit', exact: true })
    .click();
  await expect(
    page.getByText('Fixture credit approved', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Record contractor review', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Purchase cost or review source changed' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Scope review rationale', exact: true }),
  ).toHaveValue('Original unfinished review rationale retained');
  await page
    .getByRole('button', {
      name: 'Inspect fixture review evidence',
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Review writes: 0; decisions: 0;' }),
  ).toBeVisible();
  const selected = await page
    .getByRole('combobox', {
      name: 'Purchased material to review',
      exact: true,
    })
    .inputValue();
  await page
    .getByRole('button', { name: 'Hide fixture selected expense', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Refresh purchase evidence', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', {
      name: 'Purchased material to review',
      exact: true,
    }),
  ).toHaveValue(selected);
  await expect(
    page.getByText(/Selected purchase unavailable · UNKNOWN\./),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record contractor review', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Restore fixture selected expense',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Refresh purchase evidence', exact: true })
    .click();
  await expect(
    page
      .locator('.job-metrics > div')
      .filter({ hasText: 'After linked approved credits' })
      .locator('strong'),
  ).toHaveText('$1,240.00');
  await expect(
    page.getByRole('textbox', { name: 'Scope review rationale', exact: true }),
  ).toHaveValue('Original unfinished review rationale retained');
  await page
    .getByRole('button', { name: 'Record contractor review', exact: true })
    .click();
  await expect(
    page.getByText('Review 1 · proposed', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Inspect fixture review evidence',
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Review writes: 1; decisions: 1; selling: 124000' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record contractor review', exact: true }),
  ).toBeDisabled();
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
test('revoked review access preserves original rationale and cannot record a material proposal', async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole('button', { name: 'Revoke fixture review access', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Record contractor review', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Current contractor material-review access required',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Scope review rationale', exact: true }),
  ).toHaveValue('Original unfinished review rationale retained');
  await page
    .getByRole('button', {
      name: 'Inspect fixture review evidence',
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Review writes: 0; decisions: 0;' }),
  ).toBeVisible();
});
