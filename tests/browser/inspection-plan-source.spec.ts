import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function open(page: import('@playwright/test').Page) {
  await page.goto(
    'http://127.0.0.1:4206/tests/browser/fixtures/inspection-plan-source.html',
  );
  await page
    .getByText('Create property inspection plan', { exact: true })
    .click();
  await page
    .getByLabel('New survey name', { exact: true })
    .fill('Exact fictional source survey');
}
test('creates and reopens only the exact issued property/job plan, preserving entered name after denial', async ({
  page,
}) => {
  await open(page);
  const wrong = await page.getByTestId('wrong-context').textContent(),
    valid = await page.getByTestId('valid-context').textContent();
  await page
    .getByRole('combobox', {
      name: 'CRM customer / property / job',
      exact: true,
    })
    .selectOption(wrong!);
  await page
    .getByRole('button', { name: 'Create inspection plan', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'relationship UNKNOWN' }),
  ).toBeVisible();
  await expect(page.getByLabel('New survey name', { exact: true })).toHaveValue(
    'Exact fictional source survey',
  );
  await page
    .getByRole('button', { name: 'Inspect fixture plan evidence', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Plan writes: 0;' }),
  ).toBeVisible();
  await page
    .getByRole('combobox', {
      name: 'CRM customer / property / job',
      exact: true,
    })
    .selectOption(valid!);
  await page
    .getByRole('button', { name: 'Create inspection plan', exact: true })
    .click();
  await expect(page.getByLabel('Inspection plan', { exact: true })).toHaveValue(
    'Exact fictional source survey',
  );
  await page
    .getByRole('button', { name: 'Inspect fixture plan evidence', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Plan writes: 1; exact target: true' }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('current planning revocation cannot create a plan from retained property/job selection', async ({
  page,
}) => {
  await open(page);
  const valid = await page.getByTestId('valid-context').textContent();
  await page
    .getByRole('combobox', {
      name: 'CRM customer / property / job',
      exact: true,
    })
    .selectOption(valid!);
  await page
    .getByRole('button', {
      name: 'Revoke fixture planning access',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Create inspection plan', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Current contractor planning access required' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Inspect fixture plan evidence', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Plan writes: 0;' }),
  ).toBeVisible();
});
