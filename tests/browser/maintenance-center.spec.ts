import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
async function openCenter(page: Page) {
  await page
    .getByRole('button', { name: 'Property operations', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Maintenance & Follow-Up Center',
      exact: true,
    }),
  ).toBeVisible();
  return page.getByRole('region', {
    name: 'Maintenance & follow-up center',
    exact: true,
  });
}
async function examples(page: Page) {
  const center = await openCenter(page);
  await expect(center.locator('.maintenance-card')).toHaveCount(0);
  await center
    .getByText('Development-only maintenance examples & states', {
      exact: true,
    })
    .click();
  await center
    .getByRole('button', {
      name: 'Prepare synthetic maintenance examples',
      exact: true,
    })
    .click();
  await expect(center.locator('.maintenance-card')).toHaveCount(3);
  return center;
}
test('all companies manually triage, schedule one draft and open exact immutable sources with private coordination', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
  });
  await page.goto('/preview');
  for (const org of [
    'sample-property',
    'sample-construction',
    'sample-roofing',
  ]) {
    await page
      .getByRole('combobox', { name: 'Company context' })
      .selectOption(org);
    const center = await examples(page);
    const card = center.locator('.maintenance-card').first();
    const report = await card.getAttribute('data-report-id'),
      version = await card.getAttribute('data-report-version');
    await card
      .getByRole('button', {
        name: 'Open exact source inspection',
        exact: true,
      })
      .click();
    const source = page.locator(`details[data-report-id="${report}"]`);
    await expect(source).toHaveAttribute('open', '');
    await expect(source).toHaveAttribute('data-report-version', version!);
    await expect(source).toContainText('Published evidence is immutable.');
    await page
      .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
      .click();
    await center
      .locator('.maintenance-card')
      .first()
      .getByRole('button', { name: 'Review finding', exact: true })
      .click();
    const review = center.getByRole('region', {
      name: 'Maintenance review',
      exact: true,
    });
    await review
      .getByRole('combobox', { name: 'Manual priority', exact: true })
      .selectOption('urgent');
    await review
      .getByRole('combobox', { name: 'Responsible staff', exact: true })
      .selectOption(org + '-field');
    await review
      .getByLabel('Internal follow-up date', { exact: true })
      .fill('2026-11-20');
    await review
      .getByLabel('Append internal follow-up note', { exact: true })
      .fill('PRIVATE TRIAGE: verify crew availability before proposing work.');
    await review
      .getByRole('button', { name: 'Save internal review', exact: true })
      .click();
    await expect(review).toHaveCount(1);
    await expect(review).toContainText('Triage revision 1');
    await review
      .getByText('Internal follow-up notes (1)', { exact: true })
      .click();
    await expect(review).toContainText('PRIVATE TRIAGE');
    await review
      .getByRole('button', {
        name: 'Prepare follow-up inspection draft',
        exact: true,
      })
      .click();
    await expect(review).toContainText('Triage revision 2');
    await expect(
      review.getByRole('button', {
        name: 'Prepare follow-up inspection draft',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(center.locator('.maintenance-card').first()).toContainText(
      'scheduled · priority urgent',
    );
    await center
      .getByRole('combobox', { name: 'Queue priority', exact: true })
      .selectOption('urgent');
    await center
      .getByRole('combobox', { name: 'Queue responsibility', exact: true })
      .selectOption(org + '-field');
    await center
      .getByLabel('Follow-up date from', { exact: true })
      .fill('2026-11-20');
    await center
      .getByLabel('Follow-up date to', { exact: true })
      .fill('2026-11-20');
    await center
      .getByRole('combobox', { name: 'Queue review status', exact: true })
      .selectOption('scheduled');
    await expect(center.locator('.maintenance-card')).toHaveCount(1);
    await center
      .getByRole('button', { name: 'Reset maintenance filters', exact: true })
      .click();
    await expect(center.locator('.maintenance-card')).toHaveCount(3);
    await center
      .locator('.maintenance-card')
      .first()
      .getByRole('button', { name: 'Review finding', exact: true })
      .click();
    await review
      .getByRole('button', {
        name: 'Open prepared inspection draft',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Visit · 2026-11-20', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Client report summary', exact: true }),
    ).toHaveValue('Scheduled property inspection');
    await page
      .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
      .click();
    await center
      .locator('.maintenance-card')
      .first()
      .getByRole('button', { name: 'Review finding', exact: true })
      .click();
    await review
      .getByRole('combobox', { name: 'Staff review decision', exact: true })
      .selectOption('reviewed');
    await review
      .getByRole('button', { name: 'Save internal review', exact: true })
      .click();
    await expect(center.locator('.maintenance-card').first()).toContainText(
      'reviewed · priority urgent',
    );
    await expect(center).toContainText('Repair status undetermined');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir('artifacts/property', { recursive: true });
    await page.screenshot({
      path: `artifacts/property/maintenance-${info.project.name}-${org}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Client project view', exact: true })
      .click();
    const customer = page.getByRole('region', {
      name: 'Client property report',
    });
    await expect(customer).toContainText('Synthetic maintenance inspection');
    for (const text of [
      'PRIVATE TRIAGE',
      'Responsible staff',
      'Save internal review',
      'supplier margin',
      'payroll',
    ])
      await expect(customer).not.toContainText(text);
  }
  expect(external).toEqual([]);
});

test('property filters, empty/error states and exact linked existing job/issued estimate navigation remain bounded', async ({
  page,
}) => {
  await page.goto('/preview');
  const center = await examples(page);
  await page.getByRole('button', { name: 'Inspections', exact: true }).click();
  await expect(
    page.getByText('3 immutable published report version(s).', {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Maintenance & follow-up', exact: true })
    .click();
  await center
    .getByRole('combobox', { name: 'Maintenance property', exact: true })
    .selectOption({ label: '200 Synthetic Maintenance Court' });
  await expect(center.locator('.maintenance-card')).toHaveCount(1);
  await expect(center.locator('.maintenance-card')).toContainText(
    'Garden gate',
  );
  await center
    .getByRole('combobox', { name: 'Queue priority', exact: true })
    .selectOption('urgent');
  await expect(center).toContainText(
    'No maintenance findings match these filters.',
  );
  await center
    .getByRole('button', { name: 'Reset maintenance filters', exact: true })
    .click();
  await center
    .getByLabel('Follow-up date from', { exact: true })
    .fill('2026-12-01');
  await center
    .getByLabel('Follow-up date to', { exact: true })
    .fill('2026-11-01');
  await expect(center.getByRole('alert')).toContainText(
    'start date must be on or before end date',
  );
  await expect(center.locator('.maintenance-card')).toHaveCount(0);
  await center
    .getByRole('button', { name: 'Reset maintenance filters', exact: true })
    .click();
  await center
    .locator('.maintenance-card')
    .first()
    .getByRole('button', { name: 'Review finding', exact: true })
    .click();
  const review = center.getByRole('region', {
    name: 'Maintenance review',
    exact: true,
  });
  await review
    .getByRole('button', { name: 'Open linked job workflow', exact: true })
    .click();
  const workflow = page.getByRole('region', {
    name: 'Linked contractor workflow',
  });
  await expect(workflow).toContainText('Job financial dashboard');
  await expect(
    workflow.getByRole('combobox', { name: 'Financial job' }),
  ).toBeVisible();
  await workflow
    .getByRole('button', { name: 'Back to maintenance queue' })
    .click();
  await review
    .getByRole('button', {
      name: 'Open job’s issued baseline estimate',
      exact: true,
    })
    .click();
  await expect(workflow).toContainText('issued');
  await expect(workflow).toContainText(
    'not a finding-specific repair estimate',
  );
  await workflow
    .getByRole('button', { name: 'Back to maintenance queue' })
    .click();
  await center
    .getByText('Development-only maintenance examples & states', {
      exact: true,
    })
    .click();
  await center
    .getByRole('button', {
      name: 'Prepare synthetic maintenance examples',
      exact: true,
    })
    .click();
  await expect(center.locator('.maintenance-card')).toHaveCount(3);
  await center
    .getByRole('button', { name: 'Simulate maintenance error', exact: true })
    .click();
  await expect(center.getByRole('alert')).toContainText('simulated error');
  await expect(center.locator('.maintenance-card')).toHaveCount(0);
  await center
    .getByRole('button', { name: 'Reload maintenance queue', exact: true })
    .click();
  await expect(center.locator('.maintenance-card')).toHaveCount(3);
  const reset = center.getByRole('button', {
    name: 'Reset maintenance filters',
    exact: true,
  });
  await reset.focus();
  await page.keyboard.press('Enter');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/portal/property');
  await expect(
    page.getByRole('region', {
      name: 'Maintenance & follow-up center',
      exact: true,
    }),
  ).toHaveCount(0);
});
