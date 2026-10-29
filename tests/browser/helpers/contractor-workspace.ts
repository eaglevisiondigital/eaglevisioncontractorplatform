import { expect, type Page } from '@playwright/test';

/** Complete original module navigation, including the compact premium rail. */
export async function openModule(page: Page, name: string) {
  const label = new RegExp(
    '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
    'i',
  );
  const target = page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: label });
  if (!(await target.isVisible())) {
    const menu = page.getByRole('button', {
      name: 'Workspace Navigation',
      exact: true,
    });
    if (await menu.isVisible()) await menu.click();
  }
  await target.click();
}
export async function prepareMaintenance(page: Page) {
  const center = page.getByRole('region', {
    name: 'Maintenance & follow-up center',
    exact: true,
  });
  const panel = center.locator('.maintenance-demo');
  if ((await panel.getAttribute('open')) === null)
    await panel.locator('summary').click();
  await panel
    .getByRole('button', {
      name: 'Prepare Synthetic Maintenance Examples',
      exact: true,
    })
    .click();
  await expect(center.locator('.maintenance-card')).toHaveCount(3);
  return center;
}
export async function showQueue(page: Page) {
  const back = page.getByRole('button', {
    name: '← Back to Work Queue',
    exact: true,
  });
  if (await back.isVisible()) await back.click();
  const filters = page.locator('.concept-filter-disclosure');
  if (
    (await filters.isVisible()) &&
    (await filters.getAttribute('open')) === null
  )
    await filters.locator('summary').click();
}
