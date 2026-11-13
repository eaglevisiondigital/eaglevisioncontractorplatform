import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const confirm =
  'I reviewed the current saved location and these address changes';
const editor = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Service location editing' });
async function open(page: import('@playwright/test').Page) {
  await page.goto('http://127.0.0.1:4206/preview-location-source-test.html');
  await expect(
    editor(page).getByRole('textbox', { name: 'Street address', exact: true }),
  ).toHaveValue('10 Original');
}
test('stale address save denies; source refresh preserves unfinished edits and explicit reviewed save reopens exact location', async ({
  page,
}) => {
  await open(page);
  const e = editor(page);
  await e
    .getByRole('textbox', { name: 'City', exact: true })
    .fill('Unfinished reviewed city');
  await e.getByLabel(confirm).check();
  await page
    .getByRole('button', {
      name: 'Append fictional newer address',
      exact: true,
    })
    .click();
  await e.getByRole('button', { name: 'Update location', exact: true }).click();
  await expect(e.getByRole('status')).toContainText('Saved location changed');
  await e
    .getByRole('button', { name: 'Refresh saved location', exact: true })
    .click();
  await expect(e.getByText('Saved source:', { exact: false })).toContainText(
    '20 Newer',
  );
  await expect(
    e.getByRole('textbox', { name: 'City', exact: true }),
  ).toHaveValue('Unfinished reviewed city');
  await expect(e.getByLabel(confirm)).not.toBeChecked();
  await e
    .getByRole('textbox', { name: 'Street address', exact: true })
    .fill('20 Newer');
  await e.getByLabel(confirm).check();
  await e.getByRole('button', { name: 'Update location', exact: true }).click();
  await expect(
    page.getByText('Saved existing location', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reopen editor', exact: true })
    .click();
  await expect(
    e.getByRole('textbox', { name: 'City', exact: true }),
  ).toHaveValue('Unfinished reviewed city');
  await expect(
    e.getByRole('textbox', { name: 'Street address', exact: true }),
  ).toHaveValue('20 Newer');
  await expect(page.getByLabel('Writer count')).toHaveText('1');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('closing during source wait cancels the original update; revoked CRM cannot record it', async ({
  page,
}) => {
  await open(page);
  const e = editor(page);
  await e
    .getByRole('textbox', { name: 'City', exact: true })
    .fill('Pending source city');
  await e.getByLabel(confirm).check();
  await page
    .getByRole('button', {
      name: 'Pause next fixture location read',
      exact: true,
    })
    .click();
  await e.getByRole('button', { name: 'Update location', exact: true }).click();
  await expect(
    e.getByRole('button', { name: 'Working…', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      await page
        .getByRole('button', {
          name: 'Inspect fixture location pause',
          exact: true,
        })
        .click();
      return page.getByLabel('Location pause').textContent();
    })
    .toBe('paused');
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page
    .getByRole('button', { name: 'Release fixture location read', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Reopen editor', exact: true })
    .click();
  await expect(
    e.getByRole('textbox', { name: 'City', exact: true }),
  ).toHaveValue('Fictional City');
  await page
    .getByRole('button', { name: 'Revoke fictional CRM access', exact: true })
    .click();
  await e.getByLabel(confirm).check();
  await e.getByRole('button', { name: 'Update location', exact: true }).click();
  await expect(e.getByRole('status')).toContainText('Current CRM');
  await page
    .getByRole('button', { name: 'Inspect writer count', exact: true })
    .click();
  await expect(page.getByLabel('Writer count')).toHaveText('0');
});
test('lost save acknowledgment remains UNKNOWN after editor reopen and refreshed source', async ({
  page,
}) => {
  await open(page);
  const e = editor(page);
  await e
    .getByRole('textbox', { name: 'City', exact: true })
    .fill('Committed unknown city');
  await e.getByLabel(confirm).check();
  await page
    .getByRole('button', {
      name: 'Lose next fixture save acknowledgment',
      exact: true,
    })
    .click();
  await e.getByRole('button', { name: 'Update location', exact: true }).click();
  await expect(e.getByRole('status')).toContainText('outcome UNKNOWN');
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page
    .getByRole('button', { name: 'Reopen editor', exact: true })
    .click();
  await expect(
    e.getByRole('textbox', { name: 'City', exact: true }),
  ).toHaveValue('Committed unknown city');
  await e.getByLabel(confirm).check();
  await e.getByRole('button', { name: 'Update location', exact: true }).click();
  await expect(e.getByRole('status')).toContainText('outcome UNKNOWN');
  await page
    .getByRole('button', { name: 'Inspect writer count', exact: true })
    .click();
  await expect(page.getByLabel('Writer count')).toHaveText('1');
});
