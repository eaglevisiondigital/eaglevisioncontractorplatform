import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { openModule, prepareMaintenance } from './helpers/contractor-workspace';
const companies = ['sample-property', 'sample-construction', 'sample-roofing'];
const modules = [
  'Overview',
  'Customers',
  'Intake',
  'Property Operations',
  'Supplier Comparison',
  'Client Project View',
  'Team',
  'Estimates',
  'Catalog',
  'Jobs',
  'Workforce',
  'Documents',
  'Company Settings',
];
async function audit(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function pixels(
  page: Page,
  target: Locator,
  path: string,
  alignOrigin = false,
) {
  await mkdir('artifacts/property', { recursive: true });
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  // Different local headers place identical cards at different document origins.
  // Chromium's retina rounded-border rasterization varies there. Align origin only
  // for isolated card comparisons; retain native DPR, geometry and exact equality.
  const padding = await page.evaluate(() => document.body.style.paddingTop);
  if (alignOrigin)
    await target.evaluate((element) => {
      const top = element.getBoundingClientRect().top + scrollY;
      document.body.style.paddingTop = 4096 - top + 'px';
    });
  try {
    return await target.screenshot({
      path: `artifacts/property/contractor-phase-b-${path}.png`,
      animations: 'disabled',
    });
  } finally {
    if (alignOrigin)
      await page.evaluate((value) => {
        document.body.style.paddingTop = value;
        scrollTo(0, 0);
      }, padding);
  }
}
async function cardGeometry(page: Page) {
  return page.locator('.maintenance-grid').evaluate((grid) => {
    const rect = grid.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      gap: getComputedStyle(grid).gap,
      cards: [...grid.children].map((e) => {
        const r = e.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          left: r.left - rect.left,
          top: r.top - rect.top,
        };
      }),
    };
  });
}
function spa(page: Page, path: string) {
  return page.evaluate((path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
test('approved cards match reference pixels and preserve complete module navigation across three companies', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url());
  });
  await page.goto('/preview');
  for (const org of companies) {
    await page
      .getByRole('combobox', { name: /^Company Context$/i })
      .selectOption(org);
    await openModule(page, 'Property Operations');
    await expect(page.locator('[data-integrated="true"]')).toBeVisible();
    await expect(page.locator('.maintenance-card')).toHaveCount(0);
    await prepareMaintenance(page);
    const geometry = await cardGeometry(page);
    const cards = await pixels(
      page,
      page.locator('.maintenance-grid'),
      `${info.project.name}-${org}-promoted-cards`,
      true,
    );
    await audit(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `artifacts/property/contractor-phase-b-${info.project.name}-${org}-workspace.png`,
      fullPage: true,
    });
    for (const name of ['Contracts', 'Invoices', 'Payments'])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(
        0,
      );
    for (const name of modules) {
      await openModule(page, name);
      if (name === 'Property Operations')
        await expect(page.locator('[data-integrated="true"]')).toBeVisible();
      else
        await expect(
          page
            .getByRole('navigation', { name: 'Workspace', exact: true })
            .getByRole('button', { name: new RegExp('^' + name + '$', 'i') }),
        ).toBeVisible();
      await audit(page);
      await openModule(page, 'Property Operations');
    }
    await spa(page, '/preview/contractor-design');
    await page
      .getByRole('combobox', { name: 'Company Context', exact: true })
      .selectOption(org);
    await expect(page.locator('.maintenance-card')).toHaveCount(3);
    const reference = await pixels(
      page,
      page.locator('.maintenance-grid'),
      `${info.project.name}-${org}-reference-cards`,
      true,
    );
    expect(await cardGeometry(page)).toEqual(geometry);
    expect(cards.equals(reference)).toBe(true);
    await spa(page, '/preview');
    await expect(page.locator('[data-integrated="true"]')).toBeVisible();
    await expect(page.locator('.maintenance-card')).toHaveCount(3);
  }
  expect(outside).toEqual([]);
});
test('promoted property operations share CRM data and retain customer/connected/control-plane isolation', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto('/preview/property-portal');
  await expect(page.locator('.concept-metrics')).toBeVisible();
  const before = await pixels(
    page,
    page.locator('.concept-body'),
    `${info.project.name}-portal-before`,
  );
  await spa(page, '/preview');
  await openModule(page, 'Customers');
  await page.getByRole('button', { name: 'New customer', exact: true }).click();
  await page
    .getByLabel('Customer name', { exact: true })
    .fill('Phase B McDonald Synthetic');
  await page
    .getByRole('button', { name: 'Create customer', exact: true })
    .click();
  await page.getByLabel('Search customers').fill('Phase B McDonald Synthetic');
  await page
    .getByRole('button')
    .filter({ hasText: 'Phase B McDonald Synthetic' })
    .click();
  await page.getByText('Add service location', { exact: true }).click();
  for (const [label, value] of Object.entries({
    'Street address': '42 Shared CRM Lane',
    City: 'Example City',
    'State / region': 'IL',
    'Postal code': '00000',
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  await expect(
    page.getByText('42 Shared CRM Lane', { exact: true }),
  ).toBeVisible();
  await openModule(page, 'Property Operations');
  await page.getByRole('button', { name: 'Inspections', exact: true }).click();
  await page
    .getByText('Create Property Inspection Plan', { exact: true })
    .click();
  await expect(
    page.getByRole('combobox', {
      name: 'CRM Customer / Property / Job',
      exact: true,
    }),
  ).toContainText('Phase B McDonald Synthetic · 42 Shared CRM Lane');
  await page
    .getByRole('combobox', { name: 'Company Context', exact: true })
    .selectOption('sample-construction');
  await expect(
    page.getByRole('button', { name: 'Maintenance & Follow-Up', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Inspections', exact: true }).click();
  await page
    .getByText('Create Property Inspection Plan', { exact: true })
    .click();
  await expect(
    page.getByRole('combobox', {
      name: 'CRM Customer / Property / Job',
      exact: true,
    }),
  ).not.toContainText('42 Shared CRM Lane');
  await spa(page, '/preview/property-portal');
  await expect(page.locator('.concept-metrics')).toBeVisible();
  const after = await pixels(
    page,
    page.locator('.concept-body'),
    `${info.project.name}-portal-after`,
  );
  expect(after.equals(before)).toBe(true);
  await page.goto('/portal/property');
  await expect(page.locator('.backoffice-concept')).toHaveCount(0);
  await page.goto('/preview/super-admin');
  await expect(page.locator('.backoffice-concept')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'A platform built to grow.' }),
  ).toBeVisible();
  await page.goto('/app');
  await expect(page.locator('.backoffice-concept')).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Workspace', exact: true }),
  ).toHaveCount(0);
});
