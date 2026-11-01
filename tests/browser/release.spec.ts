import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
test('three contractors complete internal approval, signature, invoicing, deposit and refund', async ({
  page,
}, testInfo) => {
  await page.goto('/preview/release');
  await expect(
    page.getByRole('heading', { name: 'Customer workflow laboratory' }),
  ).toBeVisible();
  for (const [id, name] of [
    ['sample-property', 'Straight Edge Property Services'],
    ['sample-construction', 'Cunningham Construction'],
    ['sample-roofing', 'Roofing Company · Example'],
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context', exact: true })
      .selectOption(id);
    await page.getByLabel('Synthetic actor').selectOption('staff');
    await expect(
      page.getByRole('button', { name: 'Publish to internal portal and sink' }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Publish to internal portal and sink' })
      .click();
    await expect(
      page.getByRole('heading', { name, exact: true }).first(),
    ).toBeVisible();
    await page.getByLabel('Synthetic actor').selectOption('customer');
    await expect(
      page.getByRole('combobox', { name: 'Estimate decision', exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(
        'I understand this records a synthetic internal test decision',
      )
      .check();
    await page.getByRole('button', { name: 'Record test decision' }).click();
    await expect(
      page.getByText('Offer expires', { exact: false }),
    ).toContainText('accepted');
    await page.getByLabel('Synthetic actor').selectOption('staff');
    await page
      .getByRole('button', { name: 'Create immutable test contract' })
      .click();
    await expect(
      page.getByText('Document SHA-256:', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Synthetic actor').selectOption('customer');
    await page
      .getByLabel('Typed signature name')
      .fill('Synthetic Internal Customer');
    await page
      .getByLabel(
        'I reviewed this exact contract and consent to a synthetic electronic test signature',
      )
      .check();
    await page
      .getByRole('button', { name: 'Sign internal test contract' })
      .click();
    await expect(
      page.getByText('Test signature:', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Synthetic actor').selectOption('staff');
    await page
      .getByRole('button', { name: 'Create invoice from signed test contract' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'TEST-INV-000001' }),
    ).toBeVisible();
    await expect(
      page.getByText('Ledger reconciled · tax is separate from sales'),
    ).toBeVisible();
    await page.getByLabel('Synthetic actor').selectOption('customer');
    await page
      .getByLabel(
        'Authorize this one-time synthetic test amount only; no real charge',
      )
      .check();
    await page
      .getByRole('button', { name: 'Authorize synthetic payment' })
      .click();
    await page.getByLabel('Synthetic actor').selectOption('staff');
    await page
      .getByRole('button', { name: 'Record synthetic capture' })
      .click();
    await expect(
      page.getByText('synthetic capture ·', { exact: false }),
    ).toBeVisible();
    await mkdir('artifacts/release', { recursive: true });
    await page.screenshot({
      path: `artifacts/release/${testInfo.project.name}-${id}-workflow.png`,
      fullPage: true,
    });
    if (id === 'sample-property') {
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations.map((v) => v.id)).toEqual([]);
    }
    await page.locator('.release-invoice-section').screenshot({
      path: `artifacts/release/${testInfo.project.name}-${id}-invoice.png`,
    });
    await page.emulateMedia({ media: 'print' });
    await expect(
      page.getByRole('heading', { name: 'Customer workflow laboratory' }),
    ).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'TEST-INV-000001' }),
    ).toBeVisible();
    await expect(page.getByLabel('Synthetic actor')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await page
      .getByRole('button', { name: 'Record full synthetic refund' })
      .click();
    await expect(
      page.getByText('synthetic refund ·', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('Ledger reconciled · tax is separate from sales'),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('internal workflow is accessible and live features stay hidden in the ordinary workspace', async ({
  page,
}) => {
  await page.goto('/preview/release');
  await expect(page.getByLabel('Synthetic actor')).toBeVisible();
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    report.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.goto('/preview');
  for (const name of ['Contracts', 'Invoices', 'Payments'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(
      0,
    );
  await page.goto('/portal/internal');
  await expect(page.getByLabel('Synthetic actor')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Approved internal sign-in' }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
});
