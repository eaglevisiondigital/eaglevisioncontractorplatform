import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('missed-clock correction retains exact target and current management authority', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:4206/preview-workforce-authority-test.html',
  );
  await page
    .getByRole('button', { name: 'Prepare fixture missed clock', exact: true })
    .click();
  await expect(
    page.getByText('Fixture original clock prepared', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page.getByText('Resolve missed clock-out', { exact: true }).click();
  await page
    .getByLabel('Corrected clock-out timestamp with offset')
    .fill(new Date(Date.now() - 1000).toISOString());
  await page
    .getByLabel('Clock correction reason and supervisor evidence')
    .fill('Supervisor reviewed the original fictional clock');
  await page
    .getByRole('button', { name: 'Replace fixture open clock', exact: true })
    .click();
  await expect(
    page.getByText('Fixture clock replaced without refreshing review', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Approve clock correction', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Payroll source changed' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Inspect fixture correction evidence',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Correction calls: 0; open clocks: 1', { exact: true }),
  ).toBeVisible();

  // Refresh requires a new explicit review of the actual replacement, never stale approval.
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(
    page
      .locator('.time-record strong')
      .filter({ hasText: 'Fixture replacement clock' }),
  ).toBeVisible();
  await page.getByText('Resolve missed clock-out', { exact: true }).click();
  await page
    .getByLabel('Corrected clock-out timestamp with offset')
    .fill(new Date(Date.now() - 1000).toISOString());
  await page
    .getByLabel('Clock correction reason and supervisor evidence')
    .fill('Supervisor separately reviewed replacement clock');
  await page
    .getByRole('button', { name: 'Revoke fixture payroll access', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Approve clock correction', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Payroll access unavailable' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Inspect fixture correction evidence',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Correction calls: 0; open clocks: 1', { exact: true }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('current exact missed-clock review closes and reopens the original saved entry once', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:4206/preview-workforce-authority-test.html',
  );
  await page
    .getByRole('button', { name: 'Prepare fixture missed clock', exact: true })
    .click();
  await expect(
    page.getByText('Fixture original clock prepared', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page.getByText('Resolve missed clock-out', { exact: true }).click();
  await page
    .getByLabel('Corrected clock-out timestamp with offset')
    .fill(new Date(Date.now() - 1000).toISOString());
  await page
    .getByLabel('Clock correction reason and supervisor evidence')
    .fill('Supervisor verified this exact original fictional segment');
  await page
    .getByRole('button', { name: 'Approve clock correction', exact: true })
    .click();
  await expect(
    page.getByText('Resolve missed clock-out', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Inspect fixture correction evidence',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Correction calls: 1; open clocks: 0', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(
    page.getByText('Resolve missed clock-out', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Inspect fixture correction evidence',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Correction calls: 1; open clocks: 0', { exact: true }),
  ).toBeVisible();
});
