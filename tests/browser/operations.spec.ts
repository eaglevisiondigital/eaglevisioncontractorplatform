import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('synthetic customer submits branded intake; correct company reviews and assigns it', async ({
  page,
}) => {
  await page.goto('/preview/intake/straight-edge');
  await expect(
    page.getByText('Straight Edge Property Services', { exact: true }),
  ).toBeVisible();
  for (const [label, value] of Object.entries({
    'Your name': 'Morgan Synthetic',
    'Email address': 'morgan@example.test',
    'Phone number': '555-0133',
    'Job street address': '10 Example Street',
    City: 'Example City',
    'State / region': 'IL',
    'Postal code': '00000',
    'Tell us about your project':
      'Synthetic request: repair a test fence at the example property.',
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByLabel('I permit email contact about this request', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Send estimate request' }).click();
  await expect(
    page.getByRole('heading', { name: 'Request received' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Review in contractor workspace' })
    .click();
  const request = page
    .locator('.request-card')
    .filter({ hasText: 'Synthetic request: repair a test fence' });
  await expect(request).toBeVisible();
  await request
    .getByLabel('Assign to employee')
    .selectOption('sample-property-estimator');
  await request.getByLabel('Update request status').selectOption('reviewing');
  await request.getByRole('button', { name: 'Save assignment' }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Company context' })
    .selectOption('sample-construction');
  await expect(
    page.getByText(
      'Synthetic request: repair a test fence at the example property.',
      { exact: true },
    ),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('CRM creates and filters customers, identifies duplicates and records locations/consent/notes', async ({
  page,
}) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'New customer' }).click();
  await page
    .getByLabel('Customer name', { exact: true })
    .fill('Alex Synthetic');
  await page.getByLabel('Email', { exact: true }).fill('alex@example.test');
  await page.getByLabel('Phone', { exact: true }).fill('555-0144');
  await page
    .locator('.detail-panel')
    .getByRole('combobox', { name: 'Customer type', exact: true })
    .selectOption('commercial');
  await page
    .getByRole('button', { name: 'Create customer', exact: true })
    .click();
  await page.getByLabel('Search customers').fill('Alex Synthetic');
  await page.getByRole('button').filter({ hasText: 'Alex Synthetic' }).click();
  await page.getByText('Add service location', { exact: true }).click();
  for (const [label, value] of Object.entries({
    'Street address': '20 Test Avenue',
    City: 'Example City',
    'State / region': 'IL',
    'Postal code': '00000',
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  await expect(page.getByText('20 Test Avenue', { exact: true })).toBeVisible();
  await page
    .getByLabel('Internal customer note')
    .fill('Synthetic note: confirmed scope review.');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(
    page.getByText('Synthetic note: confirmed scope review.', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Customer permits email contact', { exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Record consent', exact: true })
    .click();
  await expect(
    page.getByText('Email permitted · SMS not permitted', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'New customer' }).click();
  await page
    .getByLabel('Customer name', { exact: true })
    .fill('Potential duplicate');
  await page.getByLabel('Email', { exact: true }).fill('alex@example.test');
  await page.getByRole('button', { name: 'Check duplicates' }).click();
  await expect(
    page.getByText('Possible duplicates in this company', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Company context' })
    .selectOption('sample-construction');
  await expect(page.getByText('Alex Synthetic', { exact: true })).toHaveCount(
    0,
  );
});
test('company settings save independent branding and employee invitation/revocation stays in-app', async ({
  page,
}) => {
  await page.goto('/preview');
  await page
    .getByRole('button', { name: 'Company settings', exact: true })
    .click();
  await page
    .getByLabel('Company name', { exact: true })
    .fill('Straight Edge · Test Brand');
  await page.getByLabel('Primary brand color', { exact: true }).fill('#185c49');
  await page.getByRole('button', { name: 'Save company settings' }).click();
  await expect(
    page
      .locator('.page-heading')
      .getByText('Straight Edge · Test Brand', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByLabel('Employee email').fill('employee@example.test');
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await expect(
    page.getByText('Invitation created. No message was sent.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Private invitation link')).toHaveValue(
    /\/preview\/join#token=/,
  );
  await page
    .getByRole('button', { name: 'Revoke invitation', exact: true })
    .click();
  await expect(
    page.getByText(
      /staff · estimator · Revoked|staff · office manager · Revoked|staff · estimator · Revoked/,
    ),
  ).toBeVisible();
});
test('control plane provisions and configures a company with aggregate metrics', async ({
  page,
}) => {
  await page.goto('/preview/super-admin');
  await page.getByLabel('New company name').fill('Synthetic Fourth Company');
  await page.getByLabel('Unique public company slug').fill('synthetic-fourth');
  await page
    .getByLabel('Verified owner account UUID', { exact: true })
    .fill('70000000-0000-4000-8000-000000000001');
  await page
    .getByRole('button', { name: 'Provision company', exact: true })
    .click();
  await expect(
    page.getByText('Organization provisioned in onboarding status.', {
      exact: true,
    }),
  ).toBeVisible();
  const control = page
    .locator('.company-control')
    .filter({ hasText: 'Synthetic Fourth Company' });
  await control.getByLabel('Organization status').selectOption('active');
  await control
    .getByLabel('Subscription configuration')
    .selectOption('standard');
  await control
    .getByRole('button', { name: 'Apply organization configuration' })
    .click();
  await expect(
    control.getByText('Changes saved', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(
    page.getByText('organization.configured', { exact: true }),
  ).toBeVisible();
});
test('operational and public surfaces pass automated accessibility and responsive overflow checks', async ({
  page,
}, info) => {
  for (const route of [
    '/preview',
    '/preview/intake/straight-edge',
    '/preview/super-admin',
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Loading workspace records…')).toHaveCount(0);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'New customer' }).click();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: `test-results/phase2-${info.project.name}.png`,
    fullPage: true,
  });
});
