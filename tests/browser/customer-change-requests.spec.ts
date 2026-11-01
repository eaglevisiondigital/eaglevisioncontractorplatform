import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { contractor } from './helpers/property-portal';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

test('exact-version customer change requests preserve brands, evidence, text safety and accessible responsive confirmation', async ({
  page,
}, info) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) outside.push(r.url());
  });
  await page.goto('/preview/property-portal');
  for (const [i, company] of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ].entries()) {
    await contractor(page, company);
    await page
      .getByRole('button', { name: 'Estimates & repairs', exact: true })
      .click();
    const review = page.getByRole('region', {
      name: 'Customer estimate review',
    });
    const card = review.locator('article').nth(1);
    const version = await card.getAttribute('data-version-id');
    const before = await card.locator('.customer-scope-line').allTextContents();
    const open = card.getByRole('button', {
      name: 'Request changes version 2',
    });
    await open.focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('form', { name: 'Request changes version 2' });
    await expect(form.getByRole('heading')).toBeFocused();
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Review preference' }).click();
    await expect(form.getByRole('alert')).toContainText('1–2,000');
    const note = `Please review the gate scope for company ${i + 1}.\nKeep the original fence.${i === 2 ? " <img src=x onerror=alert('unsafe')>" : ' Please confirm the proposed gate width before revising the scope.'}`;
    await form
      .getByRole('textbox', { name: 'Requested changes' })
      .fill('  ' + note + '  ');
    await expect(form.getByRole('textbox')).toHaveAttribute(
      'maxlength',
      '2000',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/change-request-${info.project.name}-${company}-form.png`,
      fullPage: true,
    });
    await form.screenshot({
      path: `artifacts/property/change-request-${info.project.name}-${company}-form-detail.png`,
    });
    await form.getByRole('button', { name: 'Review preference' }).click();
    await expect(form.getByRole('heading')).toHaveText(
      'Confirm your synthetic preference',
    );
    await expect(form.getByRole('heading')).toBeFocused();
    await form.getByText('Exact estimate and version identity').click();
    await expect(form).toContainText(version!);
    await expect(card).toContainText('Awaiting your review');
    await expect(form.locator('img')).toHaveCount(0);
    await form
      .getByRole('button', { name: 'Record synthetic change request' })
      .click();
    const recorded = page.getByRole('region', {
      name: 'Recorded preference version 2',
    });
    await expect(recorded).toContainText(note);
    expect(
      await recorded.locator('.customer-preference-note').textContent(),
    ).toBe(note);
    await expect(recorded).toContainText('Receipt');
    await expect(card).toContainText(
      'Changes requested · synthetic preference',
    );
    await expect(open).toBeDisabled();
    await expect(review.locator('article').first()).toContainText(
      'Awaiting your review',
    );
    expect(
      await card.locator('.customer-scope-line').allTextContents(),
    ).toEqual(before);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `artifacts/property/change-request-${info.project.name}-${company}-recorded.png`,
      fullPage: true,
    });
    await recorded.screenshot({
      path: `artifacts/property/change-request-${info.project.name}-${company}-recorded-detail.png`,
    });
    for (const word of [
      'INTERNAL',
      'unit_cost_minor',
      'payroll',
      'markup_bps',
      'readinessHistory',
    ])
      await expect(review).not.toContainText(word);
    await expect(
      page.getByRole('button', {
        name: /pay now|issue invoice|sign contract|dispatch/i,
      }),
    ).toHaveCount(0);
    await card.getByRole('button', { name: 'View inspection reports' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Published inspection history' })
        .locator('article'),
    ).toHaveCount(1);
  }
  expect(outside).toEqual([]);
});

test('acknowledgment and offer expiry fail closed in the visible review', async ({
  page,
}) => {
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await page.getByRole('button', { name: 'Request changes version 2' }).click();
  await page.getByRole('textbox').fill('x'.repeat(2001));
  expect((await page.getByRole('textbox').inputValue()).length).toBe(2000);
  await page.getByRole('button', { name: 'Review preference' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Confirm this is a synthetic review only',
  );
  await page.getByRole('button', { name: 'Cancel preference' }).click();
  await expect(
    page.getByRole('button', { name: 'Request changes version 2' }),
  ).toBeFocused();
  await page.clock.install({ time: new Date(Date.now() + 25 * 3600000) });
  await page
    .getByRole('button', { name: 'Property overview', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Request changes version 2' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('region', { name: 'Customer estimate review' }),
  ).toContainText('Expired');
});

test('unsaved version, property and contractor switches clear the note and acknowledgment', async ({
  page,
}) => {
  await page.goto('/preview/property-portal');
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await page.getByRole('button', { name: 'Request changes version 1' }).click();
  await page.getByRole('textbox').fill('Unsaved first version');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request changes version 2' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  const property = page.getByRole('combobox', {
    name: 'Your property',
    exact: true,
  });
  const original = await property.inputValue();
  await page.getByRole('textbox').fill('Unsaved property');
  await property.selectOption({ label: '200 Synthetic Garden Lane' });
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await expect(
    page.getByText('No authorized estimate is available for this property.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await property.selectOption(original);
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await page.getByRole('button', { name: 'Request changes version 2' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.getByRole('textbox').fill('Unsaved company');
  await contractor(page, 'sample-roofing');
  await page
    .getByRole('button', { name: 'Estimates & repairs', exact: true })
    .click();
  await page.getByRole('button', { name: 'Request changes version 2' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

for (const change of ['property', 'contractor', 'version'])
  test(`delayed real-component response cannot display success after ${change} switch`, async ({
    page,
  }) => {
    const bundled = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [react()],
      define: {
        'import.meta.env': '{}',
        'process.env.NODE_ENV': '"production"',
      },
      build: {
        write: false,
        lib: {
          entry: fileURLToPath(
            new URL('./fixtures/customer-review-harness.tsx', import.meta.url),
          ),
          formats: ['iife'],
          name: 'CustomerReviewTest',
        },
      },
    });
    const output = Array.isArray(bundled) ? bundled[0] : bundled;
    if (!('output' in output)) throw Error('Browser test bundle unavailable');
    const chunk = output.output.find((item) => item.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk')
      throw Error('Browser test script unavailable');
    // Test-intercepted document only; never register a product route or Auth boundary.
    await page.route('**/__customer_review_timing_test__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body><div id="root"></div></body></html>',
      }),
    );
    await page.goto('/__customer_review_timing_test__');
    await page.addScriptTag({ content: chunk.code });
    await page
      .getByRole('button', { name: 'Request changes version 2' })
      .click();
    await page.getByRole('textbox').fill('Only the original second version');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Review preference' }).click();
    await page
      .getByRole('button', { name: 'Record synthetic change request' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Record synthetic change request' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Request changes version 1' }),
    ).toBeDisabled();
    await page
      .getByRole('button', {
        name:
          change === 'property'
            ? 'Switch property'
            : change === 'contractor'
              ? 'Switch contractor'
              : 'Show version 1 only',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Release response' }).click();
    await expect(
      page.getByText('Only the original second version', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Recorded preference version 2' }),
    ).toHaveCount(0);
    if (change !== 'contractor') {
      await page
        .getByRole('button', {
          name:
            change === 'property'
              ? 'Return original property'
              : 'Show all versions',
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('region', { name: 'Recorded preference version 2' }),
      ).toContainText('Only the original second version');
    }
  });
