import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sampleCompanies } from '../../src/domain/platform';
for (const company of sampleCompanies) {
  test(`${company.id} customer-safe timeline, exact source, empty/error/context and accessibility`, async ({
    page,
  }, testInfo) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname !== '127.0.0.1')
        external.push(request.url());
    });
    await page.goto('/tests/browser/fixtures/passport-timeline.html');
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(company.id);
    await page
      .getByRole('button', {
        name: 'Prepare existing synthetic evidence',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Property Passport', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Load property timeline', exact: true })
      .click();
    await expect(
      page.getByRole('list', { name: 'Property evidence timeline' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'After-stage property documentation',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Show evidence', exact: true })
      .selectOption('inspection-documentation');
    const first = page.getByRole('button', { name: /^Open report / }).first();
    const label = await first.getAttribute('aria-label');
    expect(label).toMatch(/published version \d+/);
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', {
        name: 'Exact published report',
        exact: true,
      }),
    ).toBeFocused();
    const detail = page.getByRole('region', { name: 'Exact source evidence' });
    await expect(detail).toContainText(
      'Physical repair completion, warranty and customer approval remain UNVERIFIED.',
    );
    const parts = label!.match(/^Open report (.+) published version (\d+)$/)!;
    await expect(detail).toContainText(
      `Report ${parts[1]} · published version ${parts[2]}`,
    );
    await expect(detail).toContainText('Property');
    await expect(page.locator('body')).not.toContainText('PRIVATE');
    await expect(page.locator('body')).not.toContainText('supplier costing');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByText('Local synthetic test controls', { exact: true })
      .click();
    await page.screenshot({
      path: `artifacts/property/passport-timeline-${testInfo.project.name}-${company.id}-report.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Close source detail', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Show evidence', exact: true })
      .selectOption('issued-job-scope');
    await page.getByRole('button', { name: /^Open job / }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Exact issued job scope',
        exact: true,
      }),
    ).toBeFocused();
    await expect(detail).toContainText('Issued version');
    await expect(detail).not.toContainText('$');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `artifacts/property/passport-timeline-${testInfo.project.name}-${company.id}-job.png`,
      fullPage: true,
    });
    // Navigate the exact immutable job/report relationships in both directions.
    const related = detail
      .getByRole('button', { name: /^Open report / })
      .first();
    const relatedId = await related.getAttribute('data-report-id');
    const relatedVersion = await related.getAttribute('data-report-version');
    await related.click();
    await expect(
      page.getByRole('heading', {
        name: 'Exact published report',
        exact: true,
      }),
    ).toBeFocused();
    await expect(detail).toContainText(
      `Report ${relatedId} · published version ${relatedVersion}`,
    );
    await detail.getByRole('button', { name: /^Open job / }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Exact issued job scope',
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByText('Local synthetic test controls', { exact: true })
      .click();
    const properties = page.getByLabel('Property', { exact: true });
    // Same exported component, no parent key: model-object replacement must reset.
    await page
      .getByRole('button', {
        name: 'Replace synthetic source model',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Replace synthetic source model',
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByRole('list', { name: 'Property evidence timeline' }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Load property timeline', exact: true })
      .click();
    await expect(
      page.getByRole('list', { name: 'Property evidence timeline' }),
    ).toBeVisible();
    const freshOptions = await properties
      .locator('option')
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      );
    // Pause the real job reader's result, switch this same model, then release it.
    await page
      .getByRole('button', { name: 'Pause next source read', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Load property timeline', exact: true })
      .click();
    await expect(
      page.getByText('Source read paused', { exact: true }),
    ).toBeVisible();
    await properties.selectOption(freshOptions[1]);
    await page
      .getByRole('button', { name: 'Release source read', exact: true })
      .click();
    await expect(
      page.getByText('Source read paused', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Property evidence timeline' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('region', { name: 'Exact source evidence' }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Load property timeline', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'No available evidence in this view',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      '0 available evidence items',
    );
    await page
      .getByRole('button', { name: 'End synthetic session', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Load property timeline', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'unavailable or changed',
    );
    await expect(
      page.getByRole('list', { name: 'Property evidence timeline' }),
    ).toHaveCount(0);
    expect(external).toEqual([]);
  });
}
test('component is default OFF with no evidence controls', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/passport-timeline-off.html');
  await expect(
    page.getByRole('heading', { name: 'Property Passport preview is off' }),
  ).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
});
