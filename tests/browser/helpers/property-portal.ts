import type { Page } from '@playwright/test';
export async function developerControls(page: Page) {
  const panel = page.locator('.concept-developer');
  if ((await panel.getAttribute('open')) === null)
    await panel.locator('summary').click();
}
export async function contractor(page: Page, id: string) {
  await developerControls(page);
  await page
    .getByRole('combobox', { name: 'Sample contractor' })
    .selectOption(id);
  await page.getByRole('region', { name: 'Property overview' }).waitFor();
}
export async function confirmPreference(page: Page) {
  await page
    .getByRole('checkbox', { name: 'Confirm this is a synthetic review only' })
    .check();
  await page
    .getByRole('button', { name: 'Review preference', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Record synthetic preference', exact: true })
    .click();
}
