import { test, expect } from '@playwright/test';
test('production does not expose the unified scorecard or owner-role review', async ({
  page,
}) => {
  await page.goto('/preview/operating-center');
  await expect(
    page.getByRole('region', {
      name: 'Pilot acceptance scorecard',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', {
      name: 'Unified V1 acceptance dashboard',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'Evidence category', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('D1 operational roles and separate owner decisions', {
      exact: true,
    }),
  ).toHaveCount(0);
});
