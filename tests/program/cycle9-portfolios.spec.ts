import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle9-browser-helpers';
for (const company of sampleCompanies)
  test(`financial, service, maintenance and briefing portfolios / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Financial review');
    const finance = page.getByRole('region', {
      name: 'Portfolio finance review',
      exact: true,
    });
    await expect(finance.locator('fieldset')).toHaveCount(4);
    await finance.getByRole('checkbox').nth(0).check();
    await finance.getByRole('checkbox').nth(1).check();
    await finance
      .getByRole('button', { name: 'Review portfolio finances', exact: true })
      .click();
    await expect(finance).toContainText('UNKNOWN');
    await expect(
      finance.getByRole('button', { name: /^Open exact job \d+$/ }),
    ).toHaveCount(4);
    await audit(page, finance);
    await finance.screenshot({
      path: `artifacts/cycle9/finance-${info.project.name}-${company.slug}.png`,
    });
    await nav(page, 'Property history');
    const service = page.getByRole('region', {
      name: 'Property portfolio service history',
      exact: true,
    });
    await service
      .getByRole('button', { name: 'Review property service portfolio' })
      .click();
    await expect(service).toContainText('3 displayed properties');
    await expect(service).toContainText('4 unique published reports');
    await expect(
      service.getByRole('button', { name: 'Open exact service report' }),
    ).toHaveCount(4);
    await service
      .getByRole('button', { name: 'Open exact service report' })
      .first()
      .click();
    await expect(
      service.getByRole('heading', { name: 'Exact portfolio service report' }),
    ).toBeFocused();
    await expect(service).not.toContainText('PRIVATE');
    await audit(page, service);
    await service.screenshot({
      path: `artifacts/cycle9/service-${info.project.name}-${company.slug}.png`,
    });
    await nav(page, 'Maintenance');
    const growth = page.getByRole('region', {
      name: 'Multi-job maintenance and renewal',
      exact: true,
    });
    await growth
      .getByLabel('I confirm this is a staff planning review only.')
      .check();
    await growth
      .getByRole('button', { name: 'Review upcoming maintenance' })
      .click();
    await expect(growth).toContainText('4 of 4 admitted jobs');
    await growth
      .getByRole('button', { name: 'Inspect consent gates' })
      .first()
      .click();
    await growth
      .getByLabel(
        'Inspect blocked requirements only; do not contact this customer.',
      )
      .check();
    await growth
      .getByRole('button', { name: 'Review send requirements' })
      .click();
    await expect(growth).toContainText(
      'Current consent UNKNOWN · send BLOCKED',
    );
    await audit(page, growth);
    await growth.screenshot({
      path: `artifacts/cycle9/growth-${info.project.name}-${company.slug}.png`,
    });
    await nav(page, 'Daily briefing');
    const briefing = page.getByRole('region', {
      name: 'Business operating briefing',
      exact: true,
    });
    await briefing
      .getByLabel(
        'I confirm this exact selected-job set and day for staff review only.',
      )
      .check();
    await briefing
      .getByRole('button', { name: 'Prepare business briefing' })
      .click();
    await expect(briefing.locator('.briefing-cards>li').first()).toBeVisible();
    await briefing
      .getByLabel('Search available evidence', { exact: true })
      .fill('no evidence matches this literal');
    await expect(
      briefing.getByRole('heading', { name: 'No matching review items' }),
    ).toBeVisible();
    await briefing
      .getByLabel('Search available evidence', { exact: true })
      .fill('');
    await audit(page, briefing);
    await briefing.screenshot({
      path: `artifacts/cycle9/briefing-${info.project.name}-${company.slug}.png`,
    });
    await briefing
      .getByRole('button', { name: /^Open exact .* evidence$/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await expect(page.locator('.oc-identities')).toContainText(company.id);
  });
