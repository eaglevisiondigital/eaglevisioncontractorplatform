import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { productBrand } from '../../src/domain/brand';

test('approved Propel asset and product identity cover platform surfaces while tenant brands stay independent', async ({
  page,
  request,
}, info) => {
  const logo = await request.get(productBrand.logo);
  expect(logo.ok()).toBe(true);
  expect(
    createHash('sha256')
      .update(await logo.body())
      .digest('hex'),
  ).toBe('b77d8e9e9db486c32ea24031033e4bec758342a4a3418fb438cfad23e0629bb0');
  await mkdir('artifacts/branding', { recursive: true });
  for (const route of [
    '/',
    '/super-admin',
    '/intake',
    '/portal',
    '/join',
    '/preview',
    '/preview/super-admin',
    '/preview/release',
    '/internal-release',
    '/portal/internal',
  ]) {
    await page.goto(route);
    await expect(page).toHaveTitle(productBrand.name);
    const image = page.getByRole('img', {
      name: productBrand.name,
      exact: true,
    });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', productBrand.logo);
    await expect(image).toHaveJSProperty('naturalWidth', 2172);
    await expect(page.locator('body')).not.toContainText(
      /\bEV\b|Eagle Vision Contractor Platform|EAGLE VISION \/|Eagle Vision control plane/i,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (['/', '/join', '/preview', '/preview/release'].includes(route)) {
      const name =
        route === '/' ? 'login' : route.split('/').filter(Boolean).join('-');
      await page.screenshot({
        path: `artifacts/branding/${info.project.name}-${name}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto('/preview');
  for (const [id, color] of [
    ['sample-property', '#247364'],
    ['sample-construction', '#a85a32'],
    ['sample-roofing', '#355ea0'],
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context', exact: true })
      .selectOption(id);
    const actual = await page
      .locator('.workspace')
      .evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue('--company-color'),
      );
    expect(actual).toBe(color);
  }
  await page.goto('/join');
  await expect(
    page.getByRole('region', { name: 'Multi-factor verification' }),
  ).toContainText(`${productBrand.shortName} · Account security`);
});
