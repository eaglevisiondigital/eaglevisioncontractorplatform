import {
  contractor,
  developerControls,
  confirmPreference,
} from './helpers/property-portal';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { sampleCompanies } from '../../src/domain/platform';

for (const company of sampleCompanies)
  test(`issued source documentation preserves unfinished review / ${company.slug}`, async ({
    page,
  }, info) => {
    await page.goto('/preview/property-portal');
    await contractor(page, company.id);
    await page
      .getByRole('button', { name: 'Property reports', exact: true })
      .click();
    const history = page.getByRole('region', {
      name: 'Published inspection history',
    });
    const report = history.locator('article').filter({
      has: page.getByRole('button', {
        name: 'Review related repair scope',
        exact: true,
      }),
    });
    const reportId = await report.getAttribute('data-report-id');
    const reportVersion = await report.getAttribute('data-report-version');
    await report
      .getByRole('button', { name: 'Review related repair scope', exact: true })
      .click();
    const review = page.getByRole('region', {
      name: 'Customer estimate review',
      exact: true,
    });
    await expect(review.locator(':scope > article')).toHaveCount(1);
    const estimate = review.locator(':scope > article');
    const issuedId = await estimate.getAttribute('data-version-id');
    await estimate
      .getByRole('button', { name: 'Request changes version 2', exact: true })
      .click();
    const form = estimate.getByRole('form', {
      name: 'Request changes version 2',
      exact: true,
    });
    const note = form.getByRole('textbox', { name: 'Requested changes' });
    const text =
      'Please review the seal dimensions against the original inspection.';
    await note.fill(text);
    const confirmation = form.getByRole('checkbox', {
      name: 'Confirm this is a synthetic review only',
      exact: true,
    });
    await confirmation.check();
    const disclosure = estimate.getByText(
      'Inspect published source documentation',
      { exact: true },
    );
    await disclosure.focus();
    await page.keyboard.press('Enter');
    const source = estimate.getByRole('region', {
      name: 'Issued estimate published source',
      exact: true,
    });
    const sourceReport = source.locator('article');
    await expect(sourceReport).toHaveAttribute('data-report-id', reportId!);
    await expect(sourceReport).toHaveAttribute(
      'data-report-version',
      reportVersion!,
    );
    await expect(source).toContainText(company.name);
    await expect(source).toContainText(
      'neither proves customer approval, completed repairs or an invoice',
    );
    await expect(estimate).toHaveAttribute('data-version-id', issuedId!);
    await expect(note).toHaveValue(text);
    await expect(confirmation).toBeChecked();
    await expect(review).toContainText('Review status: Awaiting your review');
    await expect(
      review.getByText(
        'Synthetic preference recorded for this exact issued version.',
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(source).not.toContainText(
      /INTERNAL|unit_cost_minor|payroll|markup|internal_notes/,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await estimate.screenshot({
      path: `artifacts/property/issued-source-${info.project.name}-${company.slug}.png`,
    });
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(source).toHaveCount(0);
    await expect(note).toHaveValue(text);
    await expect(confirmation).toBeChecked();
    await form
      .getByRole('button', { name: 'Cancel preference', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Show all issued estimates', exact: true })
      .click();
    const original = review.locator(':scope > article').filter({
      has: page.getByText('Issued estimate · Version 1', { exact: true }),
    });
    await original
      .getByText('Inspect published source documentation', { exact: true })
      .click();
    const missing = original.getByRole('region', {
      name: 'Issued estimate published source',
      exact: true,
    });
    await expect(missing).toContainText('UNKNOWN');
    await expect(missing.locator('article')).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'Your property', exact: true })
      .selectOption({ label: '200 Synthetic Garden Lane' });
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    await expect(review).toContainText(
      'No authorized estimate is available for this property.',
    );
    await expect(
      page.getByRole('region', {
        name: 'Issued estimate published source',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('textbox', { name: 'Requested changes' }),
    ).toHaveCount(0);
  });

test('property journey joins check-in history, exact repair scope and review-only preferences', async ({
  page,
}, info) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
  });
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Property reports', exact: true })
    .click();
  const history = page.getByRole('region', {
    name: 'Published inspection history',
  });
  await expect(history.locator('article')).toHaveCount(7);
  await page.getByText('Filter inspection evidence', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Check-in frequency' })
    .selectOption('weekly');
  await expect(history.locator('article')).toHaveCount(2);
  await page
    .getByRole('combobox', { name: 'Service month' })
    .selectOption('2026-11');
  await expect(
    history.getByText('No published reports for this selection.'),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Check-in frequency' })
    .selectOption('monthly');
  await expect(history.locator('article')).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Service month' })
    .selectOption('all');
  await page
    .getByRole('combobox', { name: 'Check-in frequency' })
    .selectOption('all');
  await history
    .getByRole('button', { name: 'Review related repair scope' })
    .click();
  const review = page.getByRole('region', { name: 'Customer estimate review' });
  await expect(review.locator('article')).toHaveCount(1);
  await expect(review).toContainText('Version 2');
  await expect(
    review.getByRole('button', {
      name: 'Preview approve version 2',
      exact: true,
    }),
  ).toBeEnabled();
  await review
    .getByRole('button', { name: 'Preview approve version 2', exact: true })
    .click();
  await confirmPreference(page);
  await expect(review).toContainText('Approved · synthetic preference');
  await expect(
    review.getByRole('button', {
      name: 'Preview decline version 2',
      exact: true,
    }),
  ).toBeDisabled();
  await review.getByRole('button', { name: 'View inspection reports' }).click();
  await expect(history.locator('article')).toHaveCount(1);
  await expect(history).toContainText('Weekly property check · 2026-10-16');
  await page
    .getByRole('button', { name: 'Show all inspection reports' })
    .click();
  await expect(history.locator('article')).toHaveCount(7);
  const properties = page.getByRole('combobox', {
    name: 'Your property',
    exact: true,
  });
  const home = await properties.inputValue();
  await properties.selectOption({ label: '200 Synthetic Garden Lane' });
  await expect(history.locator('article')).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: 'Property summary' }),
  ).toContainText('00');
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await expect(review).toContainText(
    'No authorized estimate is available for this property.',
  );
  await expect(
    review.getByRole('button', { name: /approve|decline/ }),
  ).toHaveCount(0);
  await properties.selectOption(home);
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await expect(review).toContainText('Approved · synthetic preference');
  await review
    .getByRole('button', { name: 'Preview decline version 1', exact: true })
    .click();
  await confirmPreference(page);
  await expect(review).toContainText('Declined · synthetic preference');
  for (const word of [
    'INTERNAL',
    'unit_cost_minor',
    'payroll',
    'markup',
    'margin',
  ])
    await expect(review).not.toContainText(word);
  await expect(
    page.getByRole('button', {
      name: /pay now|sign contract|issue invoice|upload/i,
    }),
  ).toHaveCount(0);

  if ((await page.locator('.concept-developer').getAttribute('open')) !== null)
    await page.locator('.concept-developer summary').click();
  await mkdir('artifacts/property', { recursive: true });
  await page.screenshot({
    path: `artifacts/property/${info.project.name}-property-journey.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});

test('error recovery clears views and contractor changes cannot retain another property or preference', async ({
  page,
}) => {
  await page.goto('/preview/property-portal');
  for (const [org, name] of [
    ['sample-property', 'Straight Edge Property Services'],
    ['sample-construction', 'Cunningham Construction'],
    ['sample-roofing', 'Roofing Company · Example'],
  ]) {
    await contractor(page, org);
    await expect(page.locator('.concept-contractor')).toContainText(name);
    await page
      .getByRole('button', { name: 'Property reports', exact: true })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Published inspection history' })
        .locator('article'),
    ).toHaveCount(7);
    await developerControls(page);
    await page.getByRole('button', { name: 'Simulate loading error' }).click();
    await expect(page.getByRole('alert')).toContainText('simulated error');
    await expect(
      page.getByRole('region', { name: 'Published inspection history' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Your properties' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload preview status' }).click();
    await page
      .getByRole('button', { name: 'Property reports', exact: true })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Published inspection history' })
        .locator('article'),
    ).toHaveCount(7);
  }
  await page.goto('/portal/property?organization_id=forged&customer_id=forged');
  await expect(
    page.getByRole('region', { name: 'Your properties' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('The customer portal is reserved', { exact: false }),
  ).toBeVisible();
});
