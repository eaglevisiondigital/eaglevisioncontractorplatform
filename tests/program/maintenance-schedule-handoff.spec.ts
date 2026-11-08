import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
test('all brands explicitly review exact source then prepare/reconcile one existing inspection draft', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4193/')) outside.push(r.url());
  });
  await page.goto('/preview/field-scheduling');
  const panel = page.getByRole('region', {
    name: 'Maintenance → inspection draft',
    exact: true,
  });
  await expect(panel).toBeVisible();
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await expect(
      panel.getByRole('heading', { name: 'No published findings available' }),
    ).toBeVisible();
    await panel
      .getByText('Development-only handoff examples', { exact: true })
      .click();
    await panel
      .getByRole('button', {
        name: 'Prepare synthetic source reports',
        exact: true,
      })
      .click();
    await expect(panel.locator('.handoff-sources li')).toHaveCount(3);
    await panel
      .getByRole('button', { name: 'Review exact finding', exact: true })
      .first()
      .click();
    await expect(
      panel.getByRole('heading', {
        name: 'Exact finding & proposed follow-up',
      }),
    ).toBeVisible();
    await expect(panel).toContainText('Report / published version');
    await panel
      .getByRole('button', { name: 'Review current scheduling evidence' })
      .click();
    await expect(panel.locator('.handoff-review')).toBeFocused();
    await expect(
      panel.getByRole('button', { name: 'Confirm & prepare inspection draft' }),
    ).toBeDisabled();
    await panel
      .getByLabel('Proposed inspection date', { exact: true })
      .fill('2026-11-28');
    await expect(
      panel.getByRole('heading', { name: 'Current source & draft review' }),
    ).toHaveCount(0);
    await panel
      .getByLabel('Proposed inspection date', { exact: true })
      .fill('2026-11-27');
    await panel
      .getByRole('button', { name: 'Review current scheduling evidence' })
      .click();
    await expect(panel).toContainText('Original source visit / revision');
    await expect(panel).toContainText('Original source plan / revision');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await mkdir('artifacts/property', { recursive: true });
    await panel.screenshot({
      path: `artifacts/property/maintenance-handoff-review-${info.project.name}-${org}.png`,
    });
    const confirm = panel.getByRole('checkbox', {
      name: /I reviewed this exact source/,
    });
    await confirm.focus();
    await page.keyboard.press('Space');
    await panel
      .getByRole('button', { name: 'Confirm & prepare inspection draft' })
      .click();
    await expect(
      panel.getByRole('heading', { name: 'Exact follow-up draft verified' }),
    ).toBeVisible();
    await expect(panel.locator('.handoff-result').first()).toBeFocused();
    await expect(
      panel.getByRole('button', { name: 'Confirm & prepare inspection draft' }),
    ).toHaveCount(0);
    await expect(panel).toContainText(
      'No dispatch, publication, repair or financial authorization occurred.',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: `artifacts/property/maintenance-handoff-prepared-${info.project.name}-${org}.png`,
    });
    await panel
      .getByRole('button', { name: 'Inspect exact prepared source & draft' })
      .click();
    await expect(
      panel.getByRole('heading', {
        name: 'Existing source & inspection draft',
      }),
    ).toBeVisible();
    await expect(panel).not.toContainText('INTERNAL');
    await panel
      .getByRole('button', { name: 'Reconcile exact target · read only' })
      .click();
    await expect(
      panel.getByRole('heading', { name: 'Exact follow-up draft verified' }),
    ).toBeVisible();
    await panel
      .getByRole('button', {
        name: 'Reload current maintenance sources',
        exact: true,
      })
      .click();
    await panel
      .getByRole('button', { name: 'Review exact finding', exact: true })
      .first()
      .click();
    await expect(
      panel.getByRole('button', {
        name: 'Inspect exact existing draft',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Review current scheduling evidence' }),
    ).toHaveCount(0);
    await panel
      .getByRole('button', { name: 'Review exact finding', exact: true })
      .nth(1)
      .click();
    await panel
      .getByRole('checkbox', {
        name: 'Simulate lost local acknowledgement display',
        exact: true,
      })
      .check();
    await panel
      .getByLabel('Proposed inspection date', { exact: true })
      .fill('2026-11-28');
    await panel
      .getByRole('button', { name: 'Review current scheduling evidence' })
      .click();
    await panel
      .getByRole('checkbox', { name: /I reviewed this exact source/ })
      .check();
    await panel
      .getByRole('button', { name: 'Confirm & prepare inspection draft' })
      .click();
    await expect(
      panel.getByRole('heading', { name: 'Scheduling outcome UNKNOWN' }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Review current scheduling evidence' }),
    ).toHaveCount(0);
    await expect(panel).toContainText(
      'No retry, replacement, new date or revised-plan attempt is permitted.',
    );
    await expect(panel.locator('.handoff-result').first()).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: `artifacts/property/maintenance-handoff-unknown-${info.project.name}-${org}.png`,
    });
    await panel
      .getByRole('button', { name: 'Reconcile exact target · read only' })
      .click();
    await expect(
      panel.getByRole('heading', { name: 'Exact follow-up draft verified' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Reload schedule', exact: true })
      .click();
    await expect(page.locator('.field-visit')).toHaveCount(6);
  }
  expect(outside).toEqual([]);
});
test('independent handoff flag remains OFF on an otherwise enabled field preview', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:4194/preview/field-scheduling?VITE_MAINTENANCE_SCHEDULE_HANDOFF_PREVIEW=true',
  );
  await expect(
    page.getByRole('heading', { name: 'Inspection schedule', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Maintenance → inspection draft',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Confirm & prepare inspection draft' }),
  ).toHaveCount(0);
});

for (const org of [
  'sample-property',
  'sample-construction',
  'sample-roofing',
]) {
  test(`selected maintenance plan history preserves ${org} date and filters`, async ({
    page,
  }) => {
    await page.goto('/preview/field-scheduling');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    const panel = page.getByRole('region', {
      name: 'Maintenance → inspection draft',
      exact: true,
    });
    await expect(
      panel.getByRole('heading', { name: 'No published findings available' }),
    ).toBeVisible();
    await panel
      .getByText('Development-only handoff examples', { exact: true })
      .click();
    await panel
      .getByRole('button', {
        name: 'Prepare synthetic source reports',
        exact: true,
      })
      .click();
    await expect(panel.locator('.handoff-sources li')).toHaveCount(3);
    await panel
      .getByRole('button', { name: 'Review exact finding', exact: true })
      .first()
      .click();
    const plan = panel.getByRole('combobox', {
        name: 'Same-property inspection plan',
        exact: true,
      }),
      date = panel.getByLabel('Proposed inspection date', { exact: true });
    const recurring = await plan.inputValue();
    await date.fill('2026-11-29');
    await panel
      .getByText('Review selected plan history', { exact: true })
      .click();
    const history = panel.getByRole('region', {
      name: 'Selected maintenance plan history',
      exact: true,
    });
    await expect(history).toBeVisible();
    await expect(history).toContainText('monthly');
    await expect(history).toContainText(
      '1 selected-plan visit(s); 0 selected-plan report version(s)',
    );
    await expect(history).toContainText(
      'Enrollment and purpose-specific consent: UNKNOWN',
    );
    await expect(history).toContainText('completion remain UNKNOWN');
    await expect(history.locator('[data-report-id]')).toHaveCount(2);
    await expect(history).not.toContainText('2026-11-07');
    await expect(history).not.toContainText('INTERNAL');
    const scope = history.getByRole('combobox', {
        name: 'Maintenance history scope',
        exact: true,
      }),
      month = history.getByRole('combobox', {
        name: 'Service month',
        exact: true,
      });
    await month.selectOption('2026-11');
    await scope.selectOption('plan');
    await expect(history.locator('[data-report-id]')).toHaveCount(0);
    await expect(history).toContainText('Published evidence UNKNOWN');
    await scope.selectOption('property');
    await expect(history.locator('[data-report-id]')).toHaveCount(2);
    await expect(month).toHaveValue('2026-11');
    await panel
      .getByText('Review selected plan history', { exact: true })
      .click();
    await expect(history).not.toBeVisible();
    await panel
      .getByText('Review selected plan history', { exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(history).toBeVisible();
    await expect(month).toHaveValue('2026-11');
    await date.fill('2026-11-30');
    await expect(month).toHaveValue('2026-11');
    await expect(scope).toHaveValue('property');
    await expect(plan).toHaveValue(recurring);
    const publishedPlan = (await plan
      .getByRole('option', { name: /^Synthetic maintenance evidence/ })
      .getAttribute('value'))!;
    await plan.selectOption(publishedPlan);
    await panel
      .getByText('Review selected plan history', { exact: true })
      .click();
    await history
      .getByRole('combobox', { name: 'Maintenance history scope', exact: true })
      .selectOption('plan');
    await expect(history.locator('[data-report-id]')).toHaveCount(2);
    await expect(history).toContainText(publishedPlan);
    await expect(date).toHaveValue('2026-11-30');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(panel.locator('.handoff-review')).toHaveCount(0);
    await expect(panel.locator('.handoff-result')).toHaveCount(0);
    await plan.selectOption(recurring);
    await panel
      .getByText('Review selected plan history', { exact: true })
      .click();
    await history
      .getByRole('combobox', { name: 'Maintenance history scope', exact: true })
      .selectOption('plan');
    await expect(history.locator('[data-report-id]')).toHaveCount(0);
    await expect(date).toHaveValue('2026-11-30');
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(
        org === 'sample-property' ? 'sample-construction' : 'sample-property',
      );
    await expect(history).toHaveCount(0);
  });
}
