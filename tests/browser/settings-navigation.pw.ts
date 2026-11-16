import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';

async function openSettings(page: Page) {
  await page.goto('/preview');
  const menu = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('button', { name: 'Company settings', exact: true })
    .click();
  await expect(page.getByLabel('Company name', { exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
});

test('actual settings finder is literal and preserves unsaved form values', async ({
  page,
}, info) => {
  await openSettings(page);
  const name = page.getByLabel('Company name', { exact: true });
  const original = await name.inputValue();
  await name.fill(original + ' unsaved qualification');
  const search = page.getByRole('searchbox', {
    name: 'Search setting names',
    exact: true,
  });
  await search.fill('  BUSINESS EMAIL  ');
  await expect(
    page.getByText('1 matching setting.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Go to Business email', exact: true })
    .click();
  await expect(
    page.getByLabel('Business email', { exact: true }),
  ).toBeFocused();
  await expect(name).toHaveValue(original + ' unsaved qualification');
  await search.fill('.*');
  await expect(
    page.getByText('No setting names match this search.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Clear setting search', exact: true })
    .click();
  await expect(search).toHaveValue('');
  await expect(name).toHaveValue(original + ' unsaved qualification');
  await page.screenshot({
    path: info.outputPath('actual-settings-finder.png'),
    fullPage: true,
  });
});

test('section navigation is keyboard accessible and does not submit the form', async ({
  page,
}, info) => {
  await page.goto('/preview-settings-navigation-test.html');
  await expect(page.getByLabel('Company name', { exact: true })).toBeVisible();
  for (const [section, label] of [
    ['Business profile', 'Company name'],
    ['Branding', 'Primary brand color'],
    ['Estimate defaults', 'Estimate number prefix'],
    ['Intake settings', 'Publish branded intake profile'],
  ]) {
    const button = page.getByRole('button', { name: section, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(
      label === 'Publish branded intake profile'
        ? page.getByRole('checkbox', {
            name: 'Publish branded intake profile Submission also requires server CAPTCHA and gateway configuration.',
            exact: true,
          })
        : page.getByLabel(label, { exact: true }),
    ).toBeFocused();
  }
  const search = page.getByRole('searchbox', {
    name: 'Search setting names',
    exact: true,
  });
  await search.fill('logo');
  await page
    .getByRole('button', { name: 'Go to Approved company logo', exact: true })
    .click();
  await expect(
    page.getByRole('combobox', {
      name: 'Approved company logo Only scanned company images can be selected. Uploads remain disabled.',
      exact: true,
    }),
  ).toBeFocused();
  await search.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('button', { name: 'Read fixture write count', exact: true })
    .click();
  await expect(page.getByLabel('Fixture write count')).toHaveText('0');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('settings-finder.png'),
    fullPage: true,
  });
});

test('company switches discard presentation search and never carry another company draft', async ({
  page,
}) => {
  await openSettings(page);
  for (const org of [
    'sample-construction',
    'sample-roofing',
    'sample-property',
  ]) {
    const company = page.getByLabel('Company name', { exact: true });
    await company.fill('Unsaved other-company draft');
    await page
      .getByRole('searchbox', { name: 'Search setting names', exact: true })
      .fill('email');
    await page
      .getByRole('combobox', { name: 'Company context', exact: true })
      .selectOption(org);
    await expect(
      page.getByRole('searchbox', {
        name: 'Search setting names',
        exact: true,
      }),
    ).toHaveValue('');
    await expect(company).not.toHaveValue('Unsaved other-company draft');
    await expect(company).toHaveValue(
      sampleCompanies.find((item) => item.id === org)!.name,
    );
  }
});

for (const mode of ['error', 'empty', 'loading']) {
  test(`settings ${mode} state has no finder or editable form; read-only reload recovers where available`, async ({
    page,
  }) => {
    await page.goto(`/preview-settings-navigation-test.html?mode=${mode}`);
    await expect(
      page.getByRole('searchbox', {
        name: 'Search setting names',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Company name', { exact: true })).toHaveCount(
      0,
    );
    if (mode === 'loading') {
      await expect(
        page.getByText('Loading workspace records…', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: 'Reload company settings',
          exact: true,
        }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByText(
          mode === 'error'
            ? 'Synthetic unavailable settings'
            : 'No company settings are available.',
          { exact: true },
        ),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Reload company settings', exact: true })
        .click();
      await expect(
        page.getByLabel('Company name', { exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole('button', { name: 'Read fixture write count', exact: true })
      .click();
    await expect(page.getByLabel('Fixture write count')).toHaveText('0');
  });
}
