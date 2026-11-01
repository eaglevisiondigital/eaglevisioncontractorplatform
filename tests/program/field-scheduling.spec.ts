import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
test('actual existing sources, filters and follow-up draft across three companies', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4186/')) external.push(r.url());
  });
  await page.goto('/preview/field-scheduling');
  await expect(
    page.getByRole('heading', { name: 'Inspection schedule', exact: true }),
  ).toBeVisible();
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(page.locator('.field-visit')).toHaveCount(1);
    expect(
      await page.evaluate(() => {
        const header = document
          .querySelector('.field-header')!
          .getBoundingClientRect();
        const company = document
          .querySelector('.field-header select')!
          .getBoundingClientRect();
        const main = document
          .querySelector('#field-main')!
          .getBoundingClientRect();
        return company.bottom <= header.bottom && header.bottom <= main.top;
      }),
    ).toBe(true);
    await page
      .getByText('Development-only examples & states', { exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Prepare synthetic follow-up example',
        exact: true,
      })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    await expect(
      page.getByRole('button', {
        name: 'Synthetic examples prepared',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('combobox', { name: 'Follow-up responsibility', exact: true })
      .selectOption(org + '-field');
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await expect(page.locator('.field-visit')).toContainText(
      'Draft inspection',
    );
    await page
      .getByRole('button', { name: /Open originating finding/ })
      .click();
    await expect(page.locator('.field-source')).toBeFocused();
    const source = page.locator('.field-source');
    await expect(source).toContainText('Originating finding ID');
    await expect(source).toContainText('Observation:');
    await expect(source).toContainText('Recommendation:');
    await expect(source).toContainText('v1');
    await expect(source).toContainText('Published source visit ID');
    await expect(source).not.toContainText('INTERNAL');
    await expect(page.locator('body')).not.toContainText('PRIVATE staff');
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/field-schedule-${info.project.name}-${org}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Close source detail' }).click();
    await page.getByLabel('From date', { exact: true }).fill('2026-11-20');
    await page.getByLabel('Through date', { exact: true }).fill('2026-11-20');
    await page
      .getByRole('combobox', { name: 'Recorded visit status' })
      .selectOption('draft');
    await expect(page.locator('.field-count')).toHaveText(
      '1 of 5 available visit records',
    );
    await page.getByLabel('From date', { exact: true }).fill('2026-12-01');
    await expect(page.getByRole('alert')).toHaveText(
      'Start date must be on or before end date.',
    );
    await expect(page.locator('.field-visit')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Reset filters', exact: true })
      .click();
    await page.getByLabel('Through date', { exact: true }).fill('2026-01-01');
    await expect(
      page.getByRole('heading', { name: 'No visits match these filters' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Clear through date' }).click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    const property = page.getByRole('combobox', {
      name: 'Property',
      exact: true,
    });
    const options = await property.locator('option').all();
    expect(options.length).toBe(3);
    await property.selectOption((await options[2].getAttribute('value')) || '');
    await expect(page.locator('.field-visit')).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Reset filters', exact: true })
      .click();
    await page.getByRole('button', { name: 'Simulate schedule error' }).click();
    await expect(
      page.getByRole('heading', { name: 'Schedule unavailable' }),
    ).toBeVisible();
    await expect(page.locator('.field-visit')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload schedule' }).click();
    await expect(page.locator('.field-visit')).toHaveCount(5);
    await page
      .getByRole('button', { name: 'Inspect exact visit' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact inspection visit' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close source detail' }).click();
    await page
      .getByRole('button', { name: 'Open report v1', exact: true })
      .first()
      .click();
    await expect(page.locator('.field-source')).toContainText(
      'Report ID / published version',
    );
    await page.getByRole('button', { name: 'Close source detail' }).click();
  }
  expect(external).toEqual([]);
});
test('production build cannot enable the isolated prototype and existing preview remains intact', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4187/preview/field-scheduling');
  await expect(
    page.getByRole('heading', { name: 'Field scheduling preview is disabled' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Prepare synthetic follow-up example' }),
  ).toHaveCount(0);
  await page.goto('/preview/property-portal');
  await expect(page.locator('.portal-concept')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Inspection schedule', exact: true }),
  ).toHaveCount(0);
});
