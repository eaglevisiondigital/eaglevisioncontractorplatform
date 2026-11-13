import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function open(page: import('@playwright/test').Page) {
  await page.goto(
    'http://127.0.0.1:4206/preview-workforce-authority-test.html',
  );
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page
    .getByText('Add manual time or audited correction', { exact: true })
    .click();
  const original = (await page.getByTestId('time-original-id').textContent())!,
    worker = (await page.getByTestId('time-worker-id').textContent())!,
    target = (await page.getByTestId('time-target').textContent())!,
    start = (await page.getByTestId('time-start').textContent())!;
  const form = page.locator('form').filter({
    has: page.getByRole('textbox', { name: 'Time task', exact: true }),
  });
  await form
    .getByRole('combobox', { name: 'Time job or overhead', exact: true })
    .selectOption(target);
  await form
    .getByRole('textbox', { name: 'Time task', exact: true })
    .fill('Fictional reviewed correction source');
  await form
    .getByRole('textbox', { name: 'Start timestamp with offset', exact: true })
    .fill(start);
  await form
    .getByRole('textbox', { name: 'End timestamp with offset', exact: true })
    .fill(new Date(Date.parse(start) + 3600000).toISOString());
  await form
    .getByRole('textbox', {
      name: 'Approved time ID being corrected (optional)',
      exact: true,
    })
    .fill(original);
  return { form, original, worker, target };
}
test('cross-worker and changed selectors cannot dispatch; exact same-worker correction saves and reopens', async ({
  page,
}) => {
  const s = await open(page);
  await s.form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'same worker required' }),
  ).toBeVisible();
  await expect(
    s.form.getByRole('textbox', { name: 'Time task', exact: true }),
  ).toHaveValue('Fictional reviewed correction source');
  await s.form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption(s.worker);
  await page
    .getByRole('button', {
      name: 'Pause next fixture workforce source read',
      exact: true,
    })
    .click();
  await s.form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect fixture source pause', exact: true })
    .click();
  await expect(
    page.getByText('Fixture workforce source paused', { exact: true }),
  ).toBeVisible();
  await s.form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption({ index: 0 });
  await s.form
    .getByRole('combobox', { name: 'Time job or overhead', exact: true })
    .selectOption('overhead:Administration');
  await page
    .getByRole('button', {
      name: 'Release fixture workforce source read',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Timesheet context changed' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Inspect fixture manual-time writes',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Manual time writes: 0', { exact: true }),
  ).toBeVisible();
  await s.form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption(s.worker);
  await s.form
    .getByRole('combobox', { name: 'Time job or overhead', exact: true })
    .selectOption(s.target);
  await s.form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Inspect fixture manual-time writes',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Manual time writes: 1', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Start your next activity',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(
    page
      .locator('.time-record')
      .filter({ hasText: 'Fictional reviewed correction source' }),
  ).toContainText('Draft time');
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('lost correction acknowledgment cannot replay after refresh or remount', async ({
  page,
}) => {
  let s = await open(page);
  await s.form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption(s.worker);
  await page
    .getByRole('button', {
      name: 'Lose next fixture manual-time acknowledgment',
      exact: true,
    })
    .click();
  await s.form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Time correction outcome UNKNOWN' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Start your next activity',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page
    .getByText('Add manual time or audited correction', { exact: true })
    .click();
  s = {
    ...s,
    form: page.locator('form').filter({
      has: page.getByRole('textbox', { name: 'Time task', exact: true }),
    }),
  };
  await s.form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption(s.worker);
  await s.form
    .getByRole('combobox', { name: 'Time job or overhead', exact: true })
    .selectOption(s.target);
  await s.form
    .getByRole('textbox', { name: 'Time task', exact: true })
    .fill('Replacement must not dispatch');
  const start = (await page.getByTestId('time-start').textContent())!;
  await s.form
    .getByRole('textbox', { name: 'Start timestamp with offset', exact: true })
    .fill(start);
  await s.form
    .getByRole('textbox', { name: 'End timestamp with offset', exact: true })
    .fill(new Date(Date.parse(start) + 3600000).toISOString());
  await s.form
    .getByRole('textbox', {
      name: 'Approved time ID being corrected (optional)',
      exact: true,
    })
    .fill(s.original);
  await s.form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Time correction outcome UNKNOWN' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Inspect fixture manual-time writes',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Manual time writes: 1', { exact: true }),
  ).toBeVisible();
});
test('company switch while source authorization awaits cancels the original time writer', async ({
  page,
}) => {
  const s = await open(page);
  await s.form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption(s.worker);
  await page
    .getByRole('button', {
      name: 'Pause next fixture workforce source read',
      exact: true,
    })
    .click();
  await s.form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect fixture source pause', exact: true })
    .click();
  await expect(
    page.getByText('Fixture workforce source paused', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Switch fixture company', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Release fixture workforce source read',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Workforce & labor', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Inspect fixture manual-time writes',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Manual time writes: 0', { exact: true }),
  ).toBeVisible();
});
test('approving a recorded uncertain correction cannot bypass its UNKNOWN ancestor with a new target ID', async ({
  page,
}) => {
  const s = await open(page);
  await s.form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption(s.worker);
  await page
    .getByRole('button', {
      name: 'Lose next fixture manual-time acknowledgment',
      exact: true,
    })
    .click();
  await s.form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Time correction outcome UNKNOWN' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Refresh timesheets', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Start your next activity',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  const row = page
    .locator('.time-record')
    .filter({ hasText: 'Fictional reviewed correction source' });
  await row.getByRole('button', { name: 'Submit time', exact: true }).click();
  await row.getByRole('button', { name: 'Approve time', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Start your next activity',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  const child = (await row.locator('small').textContent())!
    .replace('Record ID:', '')
    .trim();
  await expect(row).toContainText('approved');
  await page
    .getByText('Add manual time or audited correction', { exact: true })
    .click();
  const form = page
    .locator('form')
    .filter({
      has: page.getByRole('textbox', { name: 'Time task', exact: true }),
    });
  await form
    .getByRole('combobox', { name: 'Timesheet worker', exact: true })
    .selectOption(s.worker);
  await form
    .getByRole('combobox', { name: 'Time job or overhead', exact: true })
    .selectOption(s.target);
  await form
    .getByRole('textbox', { name: 'Time task', exact: true })
    .fill('Descendant must not dispatch');
  const start = (await page.getByTestId('time-start').textContent())!;
  await form
    .getByRole('textbox', { name: 'Start timestamp with offset', exact: true })
    .fill(start);
  await form
    .getByRole('textbox', { name: 'End timestamp with offset', exact: true })
    .fill(new Date(Date.parse(start) + 3600000).toISOString());
  await form
    .getByRole('textbox', {
      name: 'Approved time ID being corrected (optional)',
      exact: true,
    })
    .fill(child);
  await form
    .getByRole('button', { name: 'Save manual time draft', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Time correction ancestor outcome UNKNOWN' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Inspect fixture manual-time writes',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Manual time writes: 1', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.time-record')
      .filter({ hasText: 'Descendant must not dispatch' }),
  ).toHaveCount(0);
});
