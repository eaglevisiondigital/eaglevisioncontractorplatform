import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
test('offline owner gallery preserves18 exact comparison pairs and pending approvals', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('file:') && !r.url().startsWith('data:'))
      external.push(r.url());
  });
  await page.goto(
    pathToFileURL(resolve('artifacts/cycle17/owner-visual-review.html')).href,
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Cycle 17 · two visual scopes for owner review',
  );
  await expect(page.locator('section')).toHaveCount(18);
  await expect(page.locator('img')).toHaveCount(36);
  await expect(page.locator('main')).toContainText('MISSING');
  await expect(page.locator('main')).toContainText('PENDING');
  await expect(page.locator('img').first()).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  );
  await expect(page.locator('script,form,iframe')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const columns = await page
    .locator('.pair')
    .first()
    .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(info.project.name === 'mobile' ? 1 : 2);
  expect(external).toEqual([]);
  await page.screenshot({
    path: `artifacts/cycle17/owner-gallery-${info.project.name}.png`,
  });
});
