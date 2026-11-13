import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const review =
  'I reviewed the current stored consent and these explicit customer choices';
async function open(page: import('@playwright/test').Page) {
  await page.goto('http://127.0.0.1:4206/preview-contact-consent-test.html');
  await expect(
    page.getByText('Stored source:', { exact: false }),
  ).toBeVisible();
}
test('stale opt-out cannot be restored silently; explicit refresh preserves unfinished choices and saves exact revised choices', async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel('Customer permits SMS contact', { exact: true })
    .check();
  await page.getByLabel(review).check();
  await page
    .getByRole('button', {
      name: 'Append fictional email opt-out',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Record consent', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Contact consent recording' })
      .getByRole('status'),
  ).toContainText('Stored consent changed');
  await page
    .getByRole('button', { name: 'Refresh consent evidence', exact: true })
    .click();
  await expect(
    page.getByText('Stored source:', { exact: false }),
  ).toContainText('email not allowed');
  await expect(
    page.getByLabel('Customer permits email contact', { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel('Customer permits SMS contact', { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel(review)).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Record consent', exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel('Customer permits email contact', { exact: true })
    .uncheck();
  await page.getByLabel(review).check();
  await page
    .getByRole('button', { name: 'Record consent', exact: true })
    .click();
  await expect(
    page.getByText('Stored source:', { exact: false }),
  ).toContainText('email not allowed · SMS allowed');
  await page
    .getByRole('button', { name: 'Close or reopen editor', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Close or reopen editor', exact: true })
    .click();
  await expect(
    page.getByLabel('Customer permits email contact', { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel('Customer permits SMS contact', { exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel('Writer count')).toHaveText('1');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('revoked CRM authority denies recording and preserves choices', async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel('Customer permits SMS contact', { exact: true })
    .check();
  await page.getByLabel(review).check();
  await page
    .getByRole('button', { name: 'Revoke fictional CRM access', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Record consent', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Contact consent recording' })
      .getByRole('status'),
  ).toContainText('Current CRM');
  await page
    .getByRole('button', { name: 'Inspect writer count', exact: true })
    .click();
  await expect(page.getByLabel('Writer count')).toHaveText('0');
  await expect(
    page.getByLabel('Customer permits SMS contact', { exact: true }),
  ).toBeChecked();
});
test('uncertain acknowledgment holds recording across refresh and editor reopening', async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel('Customer permits SMS contact', { exact: true })
    .check();
  await page.getByLabel(review).check();
  await page
    .getByRole('button', {
      name: 'Lose next fixture acknowledgment',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Record consent', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Contact consent recording' })
      .getByRole('status'),
  ).toContainText('outcome UNKNOWN');
  await page
    .getByRole('button', { name: 'Close or reopen editor', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Close or reopen editor', exact: true })
    .click();
  await expect(
    page.getByLabel('Customer permits SMS contact', { exact: true }),
  ).toBeChecked();
  await page.getByLabel(review).check();
  await page
    .getByRole('button', { name: 'Record consent', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Contact consent recording' })
      .getByRole('status'),
  ).toContainText('outcome UNKNOWN');
  await page
    .getByRole('button', { name: 'Inspect writer count', exact: true })
    .click();
  await expect(page.getByLabel('Writer count')).toHaveText('1');
});
