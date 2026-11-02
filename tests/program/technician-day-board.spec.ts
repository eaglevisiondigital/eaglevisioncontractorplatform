import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
test('actual all-company technician lanes, exact source navigation and confirmed capacity proposals', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4216/')) external.push(r.url());
  });
  await page.goto('/preview/field-scheduling');
  const board = page.locator('.technician-day-board'),
    panel = page.locator('.field-work-orders');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page.getByLabel('Company context').selectOption(org);
    await expect(
      board.getByRole('heading', { name: 'Technician day board', exact: true }),
    ).toBeVisible();
    await board
      .getByRole('button', { name: 'Review technician day', exact: true })
      .click();
    await expect(board.locator('.tdb-result')).toBeFocused();
    await expect(board).toContainText('This does not prove availability');
    await panel.getByRole('button', { name: /^Open work order/ }).click();
    await panel.getByLabel('Worker for this job').selectOption(org + '-field');
    await panel
      .getByRole('button', { name: 'Review exact crew relationship' })
      .click();
    await panel
      .getByRole('checkbox', { name: /I reviewed this exact job/ })
      .check();
    await panel
      .getByRole('button', {
        name: 'Confirm local crew relationship',
        exact: true,
      })
      .click();
    await expect(panel).toContainText('Local crew relationship retained');
    await panel
      .getByRole('button', { name: 'Reload field records', exact: true })
      .click();
    await board
      .getByRole('combobox', { name: 'Board technician', exact: true })
      .selectOption({ label: 'Sam · field employee' });
    await board
      .locator('summary')
      .filter({ hasText: 'Review optional human proposals' })
      .click();
    const source = board.getByRole('combobox', {
      name: 'Board proposal source',
      exact: true,
    });
    await source.selectOption({ index: 1 });
    await board
      .getByRole('button', { name: 'Add board window', exact: true })
      .click();
    await source.selectOption({ index: 2 });
    await board
      .getByLabel('Board window start', { exact: true })
      .fill('2026-10-16T10:00');
    await board
      .getByLabel('Board window end', { exact: true })
      .fill('2026-10-16T12:00');
    await board
      .getByRole('button', { name: 'Add board window', exact: true })
      .click();
    await board
      .getByLabel('Board hours end', { exact: true })
      .fill('2026-10-16T10:00');
    await board
      .getByRole('button', { name: 'Add board proposed hours', exact: true })
      .click();
    const review = board.getByRole('button', {
      name: 'Review technician day',
      exact: true,
    });
    await expect(review).toBeDisabled();
    await board
      .getByRole('checkbox', { name: /I confirm these exact temporary/ })
      .check();
    await review.focus();
    await page.keyboard.press('Enter');
    const result = board.locator('.tdb-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('180 min');
    await expect(result).toContainText('120 min');
    await expect(result).toContainText('Visit / work overlap · 60 min');
    await expect(result).toContainText('Date-only visit · TIME UNKNOWN');
    await expect(result).toContainText('Human-proposed window');
    await expect(result).toContainText(org);
    await result
      .getByRole('button', { name: /^Open board source/ })
      .last()
      .click();
    await expect(panel.locator('.wo-detail')).toBeFocused();
    await expect(panel.locator('.wo-detail')).toContainText(
      'Exact linked inspection sources',
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.technician-day-board')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await board.screenshot({
      path: `artifacts/property/technician-day-board-${info.project.name}-${org}.png`,
    });
    await board
      .getByRole('button', { name: 'Clear board proposals', exact: true })
      .click();
    await expect(result).toHaveCount(0);
    await board
      .getByLabel('Board timezone', { exact: true })
      .fill('Invalid/Zone');
    await review.click();
    await expect(board.getByRole('alert')).toBeVisible();
    await expect(result).toHaveCount(0);
    await board
      .getByLabel('Board timezone', { exact: true })
      .fill('America/Chicago');
    await board.getByLabel('Board day', { exact: true }).fill('2026-12-31');
    await review.click();
    await expect(result).toContainText('This does not prove availability');
    await panel
      .getByRole('combobox', { name: 'Sample staff view', exact: true })
      .selectOption(org + '-field');
    await expect(board.locator('.tdb-proposals')).toHaveCount(0);
    await expect(board.locator('.tdb-result')).toHaveCount(0);
    await board
      .getByRole('button', { name: 'Review technician day', exact: true })
      .click();
    await expect(result).toContainText('Sam · field employee');
    await expect(result).not.toContainText('Alex · owner');
  }
  expect(external).toEqual([]);
});
test('actual component context replacement and late source read reset without parent key', async ({
  page,
}) => {
  await page.goto('/tests/browser/fixtures/technician-day-board.html');
  const board = page.locator('.technician-day-board');
  await board
    .getByRole('button', { name: 'Review technician day', exact: true })
    .click();
  await expect(board.locator('.tdb-result')).toContainText('sample-property');
  await page
    .getByRole('button', { name: 'Pause next actual source read', exact: true })
    .click();
  await board
    .getByRole('button', { name: 'Review technician day', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Real reader paused' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Replace actual company model without key',
      exact: true,
    })
    .click();
  await expect(board.locator('.tdb-result')).toHaveCount(0);
  await expect(board).not.toContainText('sample-property');
  await page
    .getByRole('button', { name: 'Release actual read', exact: true })
    .click();
  await expect(board.locator('.tdb-result')).toHaveCount(0);
  await board
    .getByRole('button', { name: 'Review technician day', exact: true })
    .click();
  await expect(board.locator('.tdb-result')).toContainText(
    'sample-construction',
  );
  await page
    .getByRole('button', { name: 'Change parent day without key', exact: true })
    .click();
  await expect(board.locator('.tdb-result')).toHaveCount(0);
  await expect(board.getByLabel('Board day', { exact: true })).toHaveValue(
    '2026-12-31',
  );
  await page
    .getByRole('button', { name: 'Read actual technician model', exact: true })
    .click();
  await expect(board.locator('.tdb-result')).toHaveCount(0);
  await expect(board.locator('.tdb-proposals')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('new route mount and scoped style are default OFF despite URL flag text', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:4217/preview/field-scheduling?VITE_TECHNICIAN_DAY_BOARD_PREVIEW=true',
  );
  await expect(
    page.getByRole('heading', { name: 'Work orders & crew day', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.technician-day-board')).toHaveCount(0);
  expect(
    await page
      .locator('style[data-vite-dev-id$="technician-day-board.css"]')
      .count(),
  ).toBe(0);
});
