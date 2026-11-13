import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('exact saved-plan dates propose an unoccupied gap; explicit Schedule saves and reopens only the selected plan', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4206/preview-inspection-date-test.html');
  const date = page.getByLabel('Next visit date', { exact: true });
  await expect(date).toHaveValue('2026-10-23');
  await page
    .getByRole('button', { name: 'Schedule visit', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Visit · 2026-10-23', exact: true }),
  ).toBeVisible();
  await expect(date).toHaveValue('2026-11-06');
  await page
    .getByRole('button', {
      name: 'Close or reopen fixture workspace',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', {
      name: 'Close or reopen fixture workspace',
      exact: true,
    })
    .click();
  await expect(date).toHaveValue('2026-11-06');
  await page
    .getByRole('button', {
      name: 'Inspect exact first plan dates',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Exact first plan dates')).toHaveText(
    '2026-10-16,2026-10-30,2026-10-23',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('staff-entered dates survive saved-plan selection and explicit reset uses only the selected saved plan', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4206/preview-inspection-date-test.html');
  const date = page.getByLabel('Next visit date', { exact: true });
  await expect(date).toHaveValue('2026-10-23');
  await date.fill('2026-12-20');
  await page
    .getByRole('combobox', { name: 'Active inspection plan', exact: true })
    .selectOption((await page.getByTestId('second-plan').textContent())!);
  await expect(date).toHaveValue('2026-12-20');
  await page
    .getByRole('button', { name: 'Use saved plan date proposal', exact: true })
    .click();
  await expect(date).toHaveValue('2026-10-11');
  await page
    .getByRole('combobox', { name: 'Visit frequency', exact: true })
    .selectOption('monthly');
  await expect(date).toHaveValue('2026-10-11');
  await page
    .getByRole('button', { name: 'Save inspection plan', exact: true })
    .click();
  await expect(date).toHaveValue('2026-11-01');
});

test('contradictory exact-plan history stays UNKNOWN with no fallback or automatic scheduling', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:4206/preview-inspection-date-test.html?history=unknown',
  );
  const date = page.getByLabel('Next visit date', { exact: true });
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Saved-plan date proposal unavailable · UNKNOWN' }),
  ).toBeVisible();
  await expect(date).toHaveValue('');
  await expect(
    page.getByRole('button', {
      name: 'Use saved plan date proposal',
      exact: true,
    }),
  ).toBeDisabled();
  await date.fill('2026-12-20');
  await expect(date).toHaveValue('2026-12-20');
  await page
    .getByRole('button', {
      name: 'Inspect exact first plan dates',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Exact first plan dates')).toHaveText(
    '2026-10-16,2026-10-30',
  );
});
