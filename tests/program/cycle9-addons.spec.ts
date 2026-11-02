import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle9-browser-helpers';
for (const company of sampleCompanies)
  test(`source-bound advanced review tools / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Advanced reviews');
    const tools = page.getByRole('region', {
      name: 'Source-bound advanced feature reviews',
      exact: true,
    });
    for (const kind of [
      'offline',
      'voice',
      'receptionist',
      'storm_network',
      'accounting',
      'procurement',
    ]) {
      await tools
        .getByRole('combobox', { name: 'Review tool', exact: true })
        .selectOption(kind);
      await tools
        .getByLabel('Literal synthetic review input')
        .fill(
          '2 each Exterior assessment; stop contact; maintenance review only',
        );
      await tools
        .getByLabel('Explicit human review priority')
        .selectOption('high');
      await tools
        .getByLabel(
          'I confirm this exact local addon review; no execution or customer communication is authorized.',
        )
        .check();
      await tools
        .getByRole('button', { name: 'Prepare selected addon review' })
        .click();
      await expect(
        tools.getByRole('heading', {
          name: 'Immutable staff review · execution blocked',
        }),
      ).toBeVisible();
      await tools
        .getByText('Inspect exact source-bound evidence', { exact: true })
        .click();
      await expect(tools.locator('pre')).toBeVisible();
      await expect(tools).not.toContainText('recorded_by');
      await tools
        .getByRole('button', { name: 'Reconcile this exact addon review' })
        .click();
      await expect(tools).toContainText('CURRENT_LOCAL_REVIEW_ONLY');
    }
    await audit(page, tools);
    await tools.screenshot({
      path: `artifacts/cycle9/addons-${info.project.name}-${company.slug}.png`,
    });
  });
