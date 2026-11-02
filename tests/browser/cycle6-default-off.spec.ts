import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('production build cannot admit the local journey', async ({ page }) => {
  await page.goto('/preview/contractor-journey');
  await expect(
    page.getByRole('heading', { name: 'Contractor journey preview is off' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Prepare local synthetic journey' }),
  ).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
