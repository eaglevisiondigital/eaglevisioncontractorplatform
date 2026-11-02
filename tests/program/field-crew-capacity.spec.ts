import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('explicit proposed windows, exact crew/source review and unknown evidence across three brands', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4212/'))
      external.push(request.url());
  });
  await page.goto('/preview/field-scheduling');
  const panel = page.locator('.field-work-orders'),
    capacity = page.locator('.crew-capacity');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(
      capacity.getByRole('heading', { name: 'Crew-day capacity & overlaps' }),
    ).toBeVisible();
    await expect(capacity).toContainText(
      'Actual working availability is UNKNOWN',
    );
    const prepare = capacity.getByRole('button', {
      name: 'Review crew-day capacity',
    });
    await expect(prepare).toBeDisabled();
    await capacity
      .getByRole('checkbox', { name: /I reviewed the exact sources/ })
      .check();
    await prepare.click();
    const result = capacity.locator('.capacity-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('TIME UNKNOWN');
    await expect(result).toContainText('0 timed overlap(s)');
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
    await panel.getByRole('button', { name: 'Reload field records' }).click();
    await capacity
      .getByLabel('Planning crew member')
      .selectOption({ label: 'Sam · field employee' });
    const source = capacity.getByLabel('Exact proposed source');
    await source.selectOption({ index: 1 });
    await capacity
      .getByRole('button', { name: 'Add proposed window', exact: true })
      .click();
    await source.selectOption({ index: 2 });
    await capacity
      .getByLabel('Window start', { exact: true })
      .fill('2026-10-16T10:00');
    await capacity
      .getByLabel('Window end', { exact: true })
      .fill('2026-10-16T12:00');
    await capacity
      .getByRole('button', { name: 'Add proposed window', exact: true })
      .click();
    await capacity
      .getByLabel('Proposed hours start', { exact: true })
      .fill('2026-10-16T08:00');
    await capacity
      .getByLabel('Proposed hours end', { exact: true })
      .fill('2026-10-16T10:00');
    await capacity
      .getByRole('button', { name: 'Add proposed hours', exact: true })
      .click();
    await expect(prepare).toBeDisabled();
    await capacity
      .getByRole('checkbox', { name: /I reviewed the exact sources/ })
      .check();
    await prepare.focus();
    await page.keyboard.press('Enter');
    await expect(result).toBeFocused();
    await expect(result).toContainText('Visit / work windows overlap');
    await expect(result).toContainText('60 min');
    await expect(result).toContainText('180 min');
    await expect(result).toContainText('OUTSIDE PROPOSED HOURS');
    await expect(result).toContainText('HUMAN PROPOSED WINDOW');
    await expect(result).toContainText(org);
    await expect(result).not.toContainText('PRIVATE');
    await capacity
      .getByRole('button', { name: 'Inspect capacity source 2' })
      .click();
    await expect(panel.locator('.wo-detail')).toBeFocused();
    await expect(panel.locator('.wo-detail')).toContainText(
      'Exact linked inspection sources',
    );
    expect(
      (await new AxeBuilder({ page }).include('.crew-capacity').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await capacity.screenshot({
      path: `artifacts/property/crew-capacity-${info.project.name}-${org}.png`,
    });
    await capacity
      .getByRole('button', { name: 'Remove window 1', exact: true })
      .click();
    await expect(result).toHaveCount(0);
    await expect(prepare).toBeDisabled();
    await capacity.getByRole('button', { name: 'Clear all proposals' }).click();
    await expect(capacity).toContainText('0 proposed window(s)');
    await capacity.getByLabel('Planning timezone').fill('Invalid/Zone');
    await capacity
      .getByRole('checkbox', { name: /I reviewed the exact sources/ })
      .check();
    await prepare.click();
    await expect(capacity.getByRole('alert')).toBeVisible();
    await expect(result).toHaveCount(0);
    await capacity.getByLabel('Planning timezone').fill('America/Chicago');
    await capacity.getByLabel('Capacity day').fill('2026-12-31');
    await capacity
      .getByRole('checkbox', { name: /I reviewed the exact sources/ })
      .check();
    await prepare.click();
    await expect(result).toContainText('No accessible linked visits');
    await panel.getByLabel('Sample staff view').selectOption(org + '-field');
    await expect(capacity).toContainText(
      'Office proposal controls are unavailable',
    );
    await expect(
      capacity.getByRole('button', { name: 'Review crew-day capacity' }),
    ).toHaveCount(0);
    await panel.getByLabel('Sample staff view').selectOption(org + '-owner');
    await expect(capacity).toContainText('0 proposed window(s)');
  }
  expect(external).toEqual([]);
});

test('new capacity mount and styles remain default OFF despite URL text', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:4213/preview/field-scheduling?VITE_FIELD_CREW_CAPACITY_PREVIEW=true',
  );
  await expect(
    page.getByRole('heading', { name: 'Work orders & crew day', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.crew-capacity')).toHaveCount(0);
  expect(
    await page.locator('style[data-vite-dev-id$="crew-capacity.css"]').count(),
  ).toBe(0);
});
