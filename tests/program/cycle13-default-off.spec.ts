import { test, expect } from '@playwright/test';
test('production operating center remains closed', async ({ page }) => {
  await page.goto('/preview/operating-center');
  await expect(
    page.getByRole('heading', { name: 'Operating center preview is off' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Prepare multi-job local environment' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Shared operating environment' }),
  ).toHaveCount(0);
});
