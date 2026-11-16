import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
});

test('hint descriptions bind each original control to its own form', async ({
  page,
}) => {
  await page.goto('/preview-form-accessibility-test.html');
  for (const name of ['First form', 'Second form']) {
    const form = page.getByRole('region', { name, exact: true });
    for (const [label, description] of [
      ['Name', 'Use fictional text only.'],
      ['Notes', 'These notes are not saved.'],
      ['Required choice', 'Choose a fictional option.'],
      ['Fictional confirmation', 'This is not customer consent.'],
    ]) {
      const control = form.getByLabel(label, { exact: false });
      await expect(control).toHaveAccessibleDescription(description);
      const hint = await control.getAttribute('aria-describedby');
      expect(hint).toBeTruthy();
      expect(
        await control.evaluate((element, id) => {
          const description = document.getElementById(id!);
          return description?.closest('form') === element.closest('form');
        }, hint),
      ).toBe(true);
    }
    await expect(form.getByLabel('Optional choice')).not.toHaveAttribute(
      'required',
    );
    await expect(form.getByLabel('Optional choice')).not.toHaveAttribute(
      'aria-describedby',
    );
  }
  const ids = await page
    .locator('[id]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('required select blocks callbacks while optional select and payloads stay unchanged', async ({
  page,
}) => {
  await page.goto('/preview-form-accessibility-test.html');
  const form = page.getByRole('region', { name: 'First form', exact: true });
  const required = form.getByLabel('Required choice');
  await expect(required).toHaveAttribute('required');
  await form.getByRole('button', { name: 'Inspect fictional values' }).click();
  await expect(page.getByLabel('Fixture callback')).toHaveText(
    'No callback invoked.',
  );
  await expect(required).toBeFocused();
  await form.getByLabel('Name', { exact: false }).fill('Fictional person');
  await form.getByLabel('Notes', { exact: false }).fill('Unsaved review');
  await required.selectOption('review');
  await form.getByLabel('Fictional confirmation').check();
  for (const [button, intent] of [
    ['Inspect fictional values', 'save'],
    ['Inspect secondary intent', 'secondary'],
  ]) {
    await form.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByLabel('Fixture callback')).toHaveText(
      JSON.stringify({
        values: {
          name: 'Fictional person',
          notes: 'Unsaved review',
          choice: 'review',
          optional: '',
          confirmed: true,
        },
        intent,
      }),
    );
  }
});

test('existing company settings expose safe hints without saving', async ({
  page,
}) => {
  await page.goto('/preview');
  await page
    .getByRole('button', { name: 'Company settings', exact: true })
    .click();
  await expect(
    page.getByLabel('License information', { exact: false }),
  ).toHaveAccessibleDescription(
    'Non-secret license number, jurisdiction and expiration.',
  );
  await expect(
    page.getByLabel('Publish branded intake profile', { exact: false }),
  ).toHaveAccessibleDescription(
    'Submission also requires server CAPTCHA and gateway configuration.',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
