import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('company shell switches independent company context and modules', async ({
  page,
}) => {
  await page.goto('/preview');
  await expect(
    page.getByRole('heading', { name: 'A clear view of what’s next.' }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Company context' })
    .selectOption('sample-construction');
  await expect(
    page.locator('#main').getByText('Cunningham Construction', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Payments' }).click();
  await expect(
    page.getByRole('heading', { name: 'Payments', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Merchant onboarding, tokens and reconciliation · Phase 5'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('platform, public intake and portal remain separate', async ({ page }) => {
  await page.goto('/preview/super-admin');
  await expect(
    page.getByRole('heading', { name: 'A platform built to grow.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Roofing Company · Example', level: 2 }),
  ).toBeVisible();
  await page.goto('/intake');
  await expect(
    page.getByText(
      'Use the company-specific intake link provided by your contractor. The customer portal remains reserved for a later phase.',
    ),
  ).toBeVisible();
  await page.goto('/portal');
  await expect(
    page.getByRole('heading', { name: 'Your project, connected.' }),
  ).toBeVisible();
  await page.goto('/super-admin');
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(
    0,
  );
});
test('sample shell passes automated WCAG A/AA checks', async ({ page }) => {
  await page.goto('/preview');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
