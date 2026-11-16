import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const previewNames = [
  'Overview',
  'Customers',
  'Intake',
  'Property operations',
  'Supplier comparison',
  'Client project view',
  'Team',
  'Estimates',
  'Catalog',
  'Jobs',
  'Workforce',
  'Documents',
  'Company settings',
];
const platformNames = [
  'Organizations',
  'Access & security',
  'Module readiness',
  'Activity',
];
const exact = (value: string) =>
  new RegExp('^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
const normalize = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();
async function isolate(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw Error('Explicit loopback baseURL required');
  const origin = new URL(baseURL);
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname);
  const errors: string[] = [],
    external: { url: string; type: string }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin.origin) await route.continue();
    else {
      external.push({ url: url.href, type: route.request().resourceType() });
      await route.abort();
    }
  });
  return { errors, external };
}
async function assertIcons(page: Page, names: string[]) {
  const nav = page.getByRole('navigation', { name: 'Workspace', exact: true });
  const menu = page.getByRole('button', { name: /^Workspace Navigation$/i });
  await expect
    .poll(async () => (await nav.isVisible()) || (await menu.isVisible()))
    .toBe(true);
  if (!(await nav.isVisible())) {
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(nav).toBeVisible();
  const buttons = nav.getByRole('button');
  await expect(buttons).toHaveCount(names.length);
  expect((await buttons.allTextContents()).map(normalize)).toEqual(
    names.map(normalize),
  );
  for (const name of names) {
    const button = nav.getByRole('button', { name: exact(name) });
    const svg = button.locator('svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
    await expect(svg).toHaveAttribute('focusable', 'false');
    await expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(await svg.locator('path').count()).toBeGreaterThan(0);
    const box = await svg.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  }
  return nav;
}
async function accessibleNav(page: Page) {
  const result = await new AxeBuilder({ page })
    .include('nav[aria-label="Workspace"]')
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test('all thirteen existing preview destinations have icons without enabling financial modules', async ({
  page,
  baseURL,
}, info) => {
  const observed = await isolate(page, baseURL);
  await page.goto('/preview');
  let nav = await assertIcons(page, previewNames);
  await expect(
    nav.getByRole('button', { name: exact('Overview') }),
  ).toHaveAttribute('aria-current', 'page');
  for (const name of previewNames) {
    await nav.getByRole('button', { name: exact(name) }).click();
    nav = await assertIcons(page, previewNames);
    await expect(
      nav.getByRole('button', { name: exact(name) }),
    ).toHaveAttribute('aria-current', 'page');
  }
  for (const name of ['Contracts', 'Invoices', 'Payments'])
    await expect(nav.getByRole('button', { name: exact(name) })).toHaveCount(0);
  const jobs = nav.getByRole('button', { name: exact('Jobs') });
  await jobs.focus();
  await page.keyboard.press('Enter');
  await expect(jobs).toHaveAttribute('aria-current', 'page');
  await expect(jobs).toBeFocused();
  await page.keyboard.press('Tab');
  const workforce = nav.getByRole('button', { name: exact('Workforce') });
  await expect(workforce).toBeFocused();
  await page.keyboard.press('Space');
  await expect(workforce).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: exact('Overview') }).click();
  await accessibleNav(page);
  await page.screenshot({
    path: info.outputPath('preview-navigation.png'),
    fullPage: true,
  });
  expect(observed.errors).toEqual([]);
  expect(
    observed.external.filter((r) =>
      ['fetch', 'xhr', 'websocket'].includes(r.type),
    ),
  ).toEqual([]);
  await info.attach('blocked-external-requests', {
    body: JSON.stringify(observed.external),
    contentType: 'application/json',
  });
});
test('all four platform destinations retain icons and matching active-page keyboard semantics', async ({
  page,
  baseURL,
}, info) => {
  const observed = await isolate(page, baseURL);
  await page.goto('/preview/super-admin');
  const nav = await assertIcons(page, platformNames);
  const organizations = nav.getByRole('button', {
    name: exact('Organizations'),
  });
  await expect(organizations).toHaveClass(/active/);
  await expect(organizations).toHaveAttribute('aria-current', 'page');
  for (const name of platformNames) {
    await nav.getByRole('button', { name: exact(name) }).click();
    await expect(
      nav.getByRole('button', { name: exact(name) }),
    ).toHaveAttribute('aria-current', 'page');
    await assertIcons(page, platformNames);
  }
  await organizations.focus();
  await page.keyboard.press('Space');
  await expect(organizations).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Tab');
  const access = nav.getByRole('button', { name: exact('Access & security') });
  await expect(access).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(access).toHaveAttribute('aria-current', 'page');
  await accessibleNav(page);
  await page.screenshot({
    path: info.outputPath('platform-navigation.png'),
    fullPage: true,
  });
  expect(observed.errors).toEqual([]);
  expect(
    observed.external.filter((r) =>
      ['fetch', 'xhr', 'websocket'].includes(r.type),
    ),
  ).toEqual([]);
  await info.attach('blocked-external-requests', {
    body: JSON.stringify(observed.external),
    contentType: 'application/json',
  });
});
