import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
async function screenshot(
  page: import('@playwright/test').Page,
  name: string,
  project: string,
) {
  const path = join(process.cwd(), 'artifacts', 'phase3');
  await mkdir(path, { recursive: true });
  await page.screenshot({
    path: join(path, `${project}-${name}.png`),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test('three company estimate builders preserve branding, alternatives and private customer previews', async ({
  page,
}, info) => {
  await page.goto('/preview');
  for (const [org, name, project] of [
    [
      'sample-property',
      'Straight Edge Property Services',
      'Cedar boundary fence',
    ],
    [
      'sample-construction',
      'Cunningham Construction',
      'Kitchen & living renovation',
    ],
    [
      'sample-roofing',
      'Roofing company example',
      'Architectural roof replacement',
    ],
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    await page.getByRole('button', { name: 'Estimates', exact: true }).click();
    await page.getByRole('button').filter({ hasText: project }).click();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(
      project,
    );
    await screenshot(page, `${org}-builder`, info.project.name);
    await page
      .getByRole('button', { name: 'Customer preview', exact: true })
      .click();
    const preview = page.getByRole('region', {
      name: 'Customer-facing estimate preview',
    });
    await expect(preview).toBeVisible();
    await expect(preview).not.toContainText('Internal unit cost');
    await expect(preview).not.toContainText('markup');
    await expect(preview).not.toContainText('SECRET');
    await screenshot(page, `${org}-preview`, info.project.name);
    if (org === 'sample-roofing') {
      await expect(preview).toContainText('Better shingle system');
      await expect(preview).not.toContainText('Good shingle system');
    }
    void name;
  }
});
test('reviewed multi-supplier package adds to draft with private costs and safe preview', async ({
  page,
}, info) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await page
    .getByRole('button')
    .filter({ hasText: 'Cedar boundary fence' })
    .click();
  await page
    .getByRole('button', { name: 'Smart material import', exact: true })
    .click();
  await expect(
    page.getByText('Live extraction unverified · ingestion unavailable', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Load synthetic multi-supplier example' })
    .click();
  await expect(
    page.getByText('Example Hardware', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel('Customer materials presentation')
    .selectOption('package');
  await page
    .getByLabel('Included materials description')
    .fill('Fence panels, exterior fasteners and project hardware');
  for (const box of await page
    .getByLabel(
      'I checked this row against the source and resolved or accepted its warnings.',
    )
    .all())
    await box.check();
  await page
    .getByLabel(
      'I explicitly approve the selected materials, quantities, costs and pricing for this draft.',
    )
    .check();
  await screenshot(page, 'material-import-review', info.project.name);
  await page
    .getByRole('button', { name: 'Approve and add to estimate draft' })
    .click();
  await expect(page.getByLabel('Scope item 4', { exact: true })).toHaveValue(
    'Fence panels, exterior fasteners and project hardware',
  );
  await page
    .getByRole('button', { name: 'Customer preview', exact: true })
    .click();
  const preview = page.getByRole('region', {
    name: 'Customer-facing estimate preview',
  });
  await expect(preview).toContainText(
    'Fence panels, exterior fasteners and project hardware',
  );
  await expect(preview).not.toContainText('Example Building Supply');
  await expect(preview).not.toContainText('906.00');
});
test('job dashboard reviews expenses, protects billing and updates projections', async ({
  page,
}, info) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Job financial dashboard' }),
  ).toBeVisible();
  await expect(
    page.getByText('Projected contribution · incomplete costs'),
  ).toBeVisible();
  await screenshot(page, 'job-financial-dashboard', info.project.name);
  await page
    .getByText('Record expense, commitment or credit', { exact: true })
    .click();
  for (const [label, value] of Object.entries({
    'Purchase link key': 'PO-TEST-002',
    'Supplier / payee': 'Synthetic Hardware',
    'Unique supplier document reference': 'INV-TEST-002',
    'Expense description': 'Unplanned exterior hardware',
    'Expense amount (USD minor units)': '12345',
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Submit for expense review' }).click();
  await expect(
    page.getByText('Unplanned exterior hardware', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Approve expense', exact: true })
    .click();
  await expect(
    page.getByText('0 expenses await review.', { exact: false }),
  ).toBeVisible();
  await page
    .getByText('Add internal scope or propose a billable addition', {
      exact: true,
    })
    .click();
  await page.getByLabel('Change description').fill('Additional gate');
  await page.getByLabel('Change status').selectOption('proposed');
  await page
    .getByLabel(
      'Proposed selling amount (USD minor units; internal must be zero)',
    )
    .fill('50000');
  await page.getByLabel('Expected change cost (USD minor units)').fill('30000');
  await page.getByRole('button', { name: 'Save change proposal' }).click();
  await expect(
    page.getByRole('button', { name: 'Approve authorized change order' }),
  ).toBeDisabled();
  await page
    .getByLabel('Authorization reference for Additional gate')
    .fill('SYNTHETIC approved exact scope reference');
  await page
    .getByLabel(
      'I verified the required customer authorization for this exact scope and price.',
    )
    .check();
  await page
    .getByRole('button', { name: 'Approve authorized change order' })
    .click();
  await expect(
    page.getByText(
      'Authorization reference: SYNTHETIC approved exact scope reference',
    ),
  ).toBeVisible();
});
test('workforce clock, timesheets and locked payroll preparation integrate job labor once', async ({
  page,
}, info) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Workforce', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workforce & labor' }),
  ).toBeVisible();
  await screenshot(page, 'time-clock', info.project.name);
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Working', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1100);
  await page
    .getByRole('button', { name: 'Switch to selected job / task' })
    .click();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Clock out', exact: true }).click();
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submit time' })).toHaveCount(
    2,
  );
  await screenshot(page, 'timesheets', info.project.name);
  await page
    .getByRole('button', { name: 'Payroll preparation', exact: true })
    .click();
  await page.getByRole('button', { name: 'Prepare earnings preview' }).click();
  await expect(page.getByText('42.50', { exact: true })).toHaveCount(0);
  await expect(page.getByText('2.50', { exact: true }).first()).toBeVisible();
  await screenshot(page, 'payroll-preparation', info.project.name);
  await page
    .getByLabel(
      'I reviewed all time, effective rates and deduction inputs. Lock this preparation period and post its approved labor costs once.',
    )
    .check();
  await page
    .getByRole('button', { name: 'Lock payroll preparation period' })
    .click();
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(page.getByText('42.50', { exact: true }).first()).toBeVisible();
  await screenshot(page, 'job-labor-report', info.project.name);
});
test('new operational screens have no serious accessibility failures or horizontal overflow', async ({
  page,
}) => {
  await page.goto('/preview');
  for (const section of ['Estimates', 'Catalog', 'Jobs', 'Workforce']) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name:
          section === 'Estimates'
            ? 'Estimates built around your work'
            : section === 'Catalog'
              ? 'Catalog & estimating policies'
              : section === 'Jobs'
                ? 'Job financial dashboard'
                : 'Workforce & labor',
      }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) =>
        ['critical', 'serious'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test('draft saves, internal issue, revision history and job baselines remain separate', async ({
  page,
}) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Estimates', exact: true }).click();
  await page.getByRole('button', { name: 'New estimate', exact: true }).click();
  await page
    .getByLabel('Project name', { exact: true })
    .fill('Synthetic garage project');
  await page
    .getByRole('combobox', { name: 'Tax policy', exact: true })
    .selectOption({ label: 'Synthetic zero-tax review · 0% · reviewed' });
  await page
    .getByRole('button', { name: 'Save estimate draft', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Issue internal snapshot' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Issue internal snapshot' }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Approve job baseline' }).click();
  await page.getByRole('button', { name: 'Create draft revision' }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Version history' }).click();
  await expect(
    page.getByRole('button').filter({ hasText: 'Version 1 · issued' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(page.getByLabel('Financial job')).toContainText(
    'Synthetic garage project',
  );
});
