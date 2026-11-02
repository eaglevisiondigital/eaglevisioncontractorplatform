import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle12-browser-helpers';
test('company switch withdraws exact sources and preserves all navigation groups', async ({
  page,
}, info) => {
  for (const [index, company] of sampleCompanies.entries()) {
    await start(page, company);
    for (const name of [
      'Operating center sections',
      'Daily workflow reviews',
      'Cycle 11 workflow labs',
    ])
      await expect(
        page.getByRole('navigation', { name, exact: true }),
      ).toBeVisible();
    const group = page.getByRole('navigation', {
      name: 'Cycle 12 workflow reviews',
      exact: true,
    });
    await expect(group).toBeHidden();
    const toggle = page.getByText('Cycle 12 workflow reviews', { exact: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(group).toBeVisible();
    await nav(page, 'Service lifecycle');
    const region = page.getByRole('region', {
      name: 'Service lifecycle review',
      exact: true,
    });
    await region
      .getByRole('button', { name: 'Review lifecycle sources', exact: true })
      .click();
    const target = region
      .getByRole('button', { name: /^Review lifecycle requirements ·/ })
      .first();
    const sourceIdentity = await target.getAttribute('aria-label');
    expect(sourceIdentity).toBeTruthy();
    await target.click();
    await expect(
      region.getByRole('heading', {
        name: 'Exact service lifecycle requirements',
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByText('Disposable development controls', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(sampleCompanies[(index + 1) % sampleCompanies.length].id);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(region).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: 'Prepare multi-job local environment',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByLabel(
        'I confirm this disposable multi-job simulation; no dispatch, contract, invoice, payment or message is authorized.',
      ),
    ).not.toBeChecked();
    await expect(
      page.getByRole('heading', {
        name: sampleCompanies[(index + 1) % sampleCompanies.length].name,
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, page.locator('.operating-center'));
    await page.screenshot({
      path: `artifacts/cycle12/withdrawal-${info.project.name}-${company.slug}.png`,
    });
  }
});
