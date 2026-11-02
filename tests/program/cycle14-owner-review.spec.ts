import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('two-scope actual-pixel owner gallery stays readable and non-authorizing', async ({
  page,
}) => {
  await page.goto(
    pathToFileURL(resolve('artifacts/cycle14/owner-visual-review.html')).href,
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Propel · focused visual review',
  );
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
  await expect(page.locator('img')).toHaveCount(36);
  await expect(page.locator('body')).toContainText('MISSING');
  await expect(page.locator('body')).toContainText('NOT owner approved');
  await expect(page.locator('body')).toContainText('three approvals');
  await expect(page.locator('script,form')).toHaveCount(0);
  await page.locator('section').first().locator('summary').first().click();
  await page.locator('section').nth(1).locator('summary').first().click();
  for (const image of await page.locator('img:visible').all())
    expect(
      await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.locator('body')).toContainText(
    'Release1.0 NOT READY / NOT AUTHORIZED',
  );
});
