import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';

test('contractor switching withholds every operating desk and retains the original attempt', async ({
  page,
}) => {
  await page.goto('/preview/contractor-journey');
  const company = page.getByRole('combobox', {
    name: 'Contractor',
    exact: true,
  });
  const confirmation = page.getByLabel(
    'I confirm this disposable local simulation; no contract, dispatch, invoice or message is authorized.',
  );
  const prepare = page.getByRole('button', {
    name: 'Prepare local synthetic journey',
    exact: true,
  });
  const context = page.getByRole('region', {
    name: 'Exact shared journey context',
  });
  await confirmation.check();
  await prepare.click();
  await expect(context).toBeVisible();
  const original = await context.innerText();
  await company.selectOption(sampleCompanies[1].id);
  await expect(context).toHaveCount(0);
  for (const name of [
    'Weekly crew scheduling review',
    'Finance operating review',
    'Booking and scope review',
    'Customer completion evidence review',
    'Maintenance and renewal planning',
    'Daily operating priorities',
  ]) {
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(
      0,
    );
  }
  await company.selectOption(sampleCompanies[0].id);
  await expect(context).toHaveCount(0);
  await confirmation.check();
  await expect(context).toBeVisible();
  expect(await context.innerText()).toBe(original);
  await expect(prepare).toBeDisabled();
});
