import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
test('customer login preview, property discovery and issued repair review remain isolated and synthetic', async ({
  page,
}, info) => {
  await page.goto('/preview/customer-portal');
  await expect(
    page.getByText('SYNTHETIC CUSTOMER LOGIN & REVIEW', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('region', { name: 'Customer estimate review' }),
  ).toHaveCount(0);
  await page.getByText('Local review controls', { exact: true }).click();
  for (let index = 0; index < 3; index++) {
    await page
      .getByRole('combobox', { name: 'Synthetic example' })
      .selectOption(String(index));
    await page
      .getByRole('button', { name: 'Enter synthetic customer preview' })
      .click();
    await expect(
      page.getByText('No published reports for this selection.'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    await expect(
      page.getByText('No authorized estimate is available for this property.'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Prepare synthetic review example' })
      .click();
    const review = page.getByRole('region', {
      name: 'Customer estimate review',
    });
    await expect(
      review.getByText('Original issued project scope.'),
    ).toBeVisible();
    await expect(
      review.getByText(
        'Repair scope linked to a published inspection finding.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Immutable estimate comparison' }),
    ).toContainText('Not included');
    await expect(
      page.getByRole('button', {
        name: 'Preview approve version 1',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('checkbox', {
        name: 'Confirm this is a synthetic review only',
      })
      .check();
    await page
      .getByRole('button', { name: 'Preview approve version 1', exact: true })
      .click();
    await expect(review).toContainText('Approved · synthetic preference');
    await page
      .getByRole('button', { name: 'Preview decline version 2', exact: true })
      .click();
    await expect(review).toContainText('Declined · synthetic preference');
    for (const word of [
      'unit_cost_minor',
      'markup',
      'INTERNAL',
      'margin',
      'payroll',
    ])
      await expect(review).not.toContainText(word);
    await expect(
      page.getByRole('button', {
        name: /pay now|issue invoice|sign contract|upload/i,
      }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'View inspection reports' })
      .first()
      .click();
    await expect(
      page.getByRole('region', { name: 'Published inspection history' }),
    ).toContainText('Published report v1');
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    if (index === 2) {
      await page.getByText('Local review controls', { exact: true }).click();
      await mkdir('artifacts/property', { recursive: true });
      await page.screenshot({
        path: `artifacts/property/${info.project.name}-customer-estimate-review.png`,
        fullPage: true,
        animations: 'disabled',
      });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByRole('button', { name: 'Sign out of preview' }).click();
    await expect(
      page.getByRole('region', { name: 'Customer estimate review' }),
    ).toHaveCount(0);
  }
});
test('expired, revoked and error states clear customer data; connected routes never use preview login', async ({
  page,
}) => {
  await page.goto('/preview/customer-portal');
  await page.getByText('Local review controls', { exact: true }).click();
  for (const [control, text] of [
    ['Simulate session expiry', 'Session expired.'],
    ['Simulate revoked access', 'Customer access unavailable.'],
    ['Simulate loading error', 'Unable to load your portal.'],
  ]) {
    await page
      .getByRole('button', { name: 'Enter synthetic customer preview' })
      .click();
    await page.getByRole('button', { name: control, exact: true }).click();
    await expect(page.getByRole('status')).toContainText(text);
    await expect(
      page.getByRole('region', { name: 'Customer estimate review' }),
    ).toHaveCount(0);
  }
  await page.goto('/portal/customer?organization_id=forged&customer_id=forged');
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Enter synthetic customer preview' }),
  ).toHaveCount(0);
});
