import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const openTeam = async (page: import('@playwright/test').Page) => {
  await page.goto('/preview');
  const menu = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  return page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'People and permissions',
      exact: true,
    }),
  });
};

test('directory searches actual account/role text literally and resets an empty result', async ({
  page,
}, info) => {
  const directory = await openTeam(page);
  await page.screenshot({
    path: info.outputPath('team-directory-before-search.png'),
    fullPage: true,
  });
  await expect(
    directory.getByText('3 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
  const search = directory.getByLabel('Search people', { exact: true });
  await search.fill('  FIELD STAFF  ');
  await expect(directory.locator('.record-list > section')).toHaveCount(1);
  await expect(
    directory.getByText('Account sample-property-field', { exact: true }),
  ).toBeVisible();
  await search.fill('sample-property-estimator');
  await expect(directory.locator('.record-list > section')).toHaveCount(1);
  await expect(
    directory.getByText('Account sample-property-estimator', { exact: true }),
  ).toBeVisible();
  await search.fill('.*');
  await expect(
    directory.getByText('No people match these filters.', { exact: true }),
  ).toBeVisible();
  await expect(directory.locator('.record-list > section')).toHaveCount(0);
  await directory
    .getByRole('button', { name: 'Clear people filters', exact: true })
    .click();
  await expect(search).toHaveValue('');
  await expect(
    directory.getByText('3 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
});

test('access role and membership status filters intersect without changing source records', async ({
  page,
}) => {
  const directory = await openTeam(page);
  await directory.getByLabel('Filter access role').selectOption('staff');
  await expect(
    directory.getByText('2 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
  await expect(directory.locator('.record-list > section')).toHaveCount(2);
  await directory
    .getByLabel('Filter membership status')
    .selectOption('revoked');
  await expect(
    directory.getByText('0 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
  await expect(
    directory.getByText('No people match these filters.', { exact: true }),
  ).toBeVisible();
  await directory
    .getByRole('button', { name: 'Clear people filters', exact: true })
    .click();
  await directory.getByLabel('Filter access role').selectOption('owner');
  await expect(directory.locator('.record-list > section')).toHaveCount(1);
  await expect(
    directory.getByText('Owner grants require the Propel control plane.', {
      exact: true,
    }),
  ).toBeVisible();
  await directory.getByLabel('Filter membership status').selectOption('active');
  await expect(
    directory.getByText('1 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
  await directory
    .getByRole('button', { name: 'Clear people filters', exact: true })
    .click();
  await expect(directory.locator('.record-list > section')).toHaveCount(3);
});

test('company context remount clears filters and retains exact tenant records', async ({
  page,
}) => {
  const directory = await openTeam(page);
  await directory
    .getByLabel('Search people', { exact: true })
    .fill('sample-property-field');
  await expect(directory.locator('.record-list > section')).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Company context' })
    .selectOption('sample-construction');
  await expect(
    directory.getByLabel('Search people', { exact: true }),
  ).toHaveValue('');
  await expect(
    directory.getByText('3 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
  await expect(
    directory.getByText('Account sample-construction-field', { exact: true }),
  ).toBeVisible();
  await expect(
    directory.getByText('Account sample-property-field', { exact: true }),
  ).toHaveCount(0);
  await directory
    .getByLabel('Search people', { exact: true })
    .fill('sample-property');
  await expect(
    directory.getByText('No people match these filters.', { exact: true }),
  ).toBeVisible();
});

test('directory controls work with keyboard, remain accessible and fit the viewport', async ({
  page,
}, info) => {
  const writes: string[] = [];
  const external: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  const directory = await openTeam(page);
  const search = directory.getByLabel('Search people', { exact: true });
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.type('estimator');
  await expect(
    directory.getByText('1 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
  await directory
    .getByRole('button', { name: 'Clear people filters', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    directory.getByText('3 of 3 loaded people shown.', { exact: true }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
  await page.screenshot({
    path: info.outputPath('team-directory-after.png'),
    fullPage: true,
  });
});
