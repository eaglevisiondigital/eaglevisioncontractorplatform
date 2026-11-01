import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('current crew, exact work orders and daily sources across all three companies', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4203/'))
      external.push(request.url());
  });
  await page.goto('/preview/field-scheduling');
  const panel = page.locator('.field-work-orders');
  await expect(
    panel.getByRole('heading', { name: 'Work orders & crew day' }),
  ).toBeVisible();
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(panel.locator('.wo-jobs .wo-list > li')).toHaveCount(1);
    await expect(panel).toContainText('UNKNOWN · no retained property ID');
    await panel.getByLabel('Sample staff view').selectOption(org + '-field');
    await expect(panel).toContainText('No work orders match the current crew');
    await expect(panel.locator('.wo-jobs .wo-list > li')).toHaveCount(0);
    await panel.getByLabel('Sample staff view').selectOption(org + '-owner');
    const open = panel.getByRole('button', { name: /^Open work order/ });
    await expect(open).toHaveCount(1);
    await open.focus();
    await page.keyboard.press('Enter');
    const detail = panel.locator('.wo-detail');
    await expect(detail).toBeFocused();
    await expect(detail).toContainText(org);
    await expect(detail).toContainText('Exact linked inspection sources');
    await expect(detail).toContainText(
      'UNKNOWN · issued source has no property association',
    );
    await expect(detail).not.toContainText('INTERNAL');
    await panel.getByLabel('Worker for this job').selectOption(org + '-field');
    await panel
      .getByRole('button', { name: 'Review exact crew relationship' })
      .click();
    await expect(panel.locator('.wo-review')).toBeFocused();
    const confirm = panel.getByRole('button', {
      name: 'Confirm local crew relationship',
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await panel
      .getByRole('checkbox', { name: /I reviewed this exact job/ })
      .check();
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(
      panel.getByRole('heading', { name: 'Local crew relationship retained' }),
    ).toBeVisible();
    await expect(panel.locator('.wo-result')).toBeFocused();
    await panel
      .getByRole('button', { name: 'Inspect exact assignment read-only' })
      .click();
    await expect(panel).toContainText('Local crew relationship retained');
    await panel.getByRole('button', { name: 'Reload field records' }).click();
    await expect(panel.locator('.wo-jobs .wo-list > li')).toContainText(
      'Sam · field employee',
    );
    await panel.getByLabel('Sample staff view').selectOption(org + '-field');
    await expect(panel.locator('.wo-jobs .wo-list > li')).toHaveCount(1);
    await expect(
      panel.getByRole('button', { name: 'Review exact crew relationship' }),
    ).toHaveCount(0);
    await expect(panel.locator('.wo-day .wo-list > li')).toHaveCount(1);
    await panel
      .getByRole('button', { name: /^Inspect work-order source/ })
      .click();
    await expect(detail).toBeFocused();
    await expect(detail).toContainText('Current crew relationship');
    await expect(detail).toContainText('KNOWN · Sam · field employee');
    const accessibility = await new AxeBuilder({ page })
      .include('.field-work-orders')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/field-work-orders-${info.project.name}-${org}.png`,
      fullPage: true,
    });
    await panel.getByLabel('Property day').fill('2026-10-05');
    await expect(detail).toHaveCount(0);
    await expect(panel.locator('.wo-day')).toContainText(
      'No exact linked inspection visits',
    );
    await expect(panel.locator('.wo-day .wo-list > li')).toHaveCount(1);
    await panel
      .getByRole('button', { name: /^Inspect recorded-time source/ })
      .click();
    await expect(detail).toContainText('Exact recorded-time source IDs');
    await panel.getByLabel('Property day').fill('2026-10-16');
    await panel
      .getByRole('combobox', { name: 'Inspection property', exact: true })
      .selectOption({ index: 1 });
    await expect(panel.locator('.wo-day .wo-list > li')).toHaveCount(1);
    await panel.getByLabel('Property day').fill('2026-12-31');
    await expect(panel.locator('.wo-day')).toContainText(
      'Future work schedule remains UNKNOWN',
    );
    await panel.getByLabel('Property day').fill('');
    await expect(panel.getByRole('alert')).toHaveText(
      'Choose a valid calendar date.',
    );
    await panel
      .getByText('Work-order development states', { exact: true })
      .click();
    await panel
      .getByRole('button', { name: 'Simulate field read error' })
      .click();
    await expect(
      panel.getByRole('heading', { name: 'Field records unavailable' }),
    ).toBeVisible();
    await expect(panel.locator('.wo-jobs')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Reload field records' }).click();
    await expect(panel.locator('.wo-jobs .wo-list > li')).toHaveCount(1);
  }
  expect(external).toEqual([]);
});

test('new work-order panel and CSS remain OFF when its flag is absent despite query text', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:4204/preview/field-scheduling?VITE_FIELD_WORK_ORDERS_PREVIEW=true',
  );
  await expect(
    page.getByRole('heading', { name: 'Inspection schedule', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.field-work-orders')).toHaveCount(0);
  expect(
    await page
      .locator('style[data-vite-dev-id$="field-work-orders.css"]')
      .count(),
  ).toBe(0);
});
