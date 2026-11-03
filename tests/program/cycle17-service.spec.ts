import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle17-browser-helpers';
for (const company of sampleCompanies)
  test(`service through exact Passport documentation / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Service source continuity');
    const r = page.getByRole('region', {
      name: 'Service Passport path',
      exact: true,
    });
    const choose = r.getByRole('combobox', {
      name: 'Service request and job',
      exact: true,
    });
    await expect(choose).toBeVisible();
    await choose.selectOption({ index: 1 });
    await r
      .getByLabel('I confirm this staff-selected service context.', {
        exact: true,
      })
      .check();
    await r
      .getByRole('button', { name: 'Open retained service path', exact: true })
      .click();
    await expect(
      r.getByRole('navigation', {
        name: 'Service Passport breadcrumbs',
        exact: true,
      }),
    ).toBeVisible();
    await expect(r).toContainText('Request-to-job relationship UNKNOWN');
    await r
      .getByRole('button', { name: 'Open retained Passport', exact: true })
      .click();
    await expect(
      r.getByRole('heading', { name: 'Safe Passport evidence', exact: true }),
    ).toBeFocused();
    // Exact own-job report is the only one whose original completion review is eligible.
    const exactArticle = r
      .locator('article')
      .filter({ hasText: 'Exact recorded report/job link.' })
      .first();
    await exactArticle
      .getByRole('button', { name: /^Open published report / })
      .click();
    await expect(
      r.getByRole('button', {
        name: 'Open original completion review',
        exact: true,
      }),
    ).toBeEnabled();
    await audit(page, r);
    await capture(
      page,
      r,
      'service-passport-path',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Open original completion review',
        exact: true,
      })
      .click();
    const original = r.locator(
      '[aria-label="Retained original completion review"]',
    );
    await expect(original).toBeVisible();
    await original.evaluate((e) =>
      e.setAttribute('data-c17-retained', 'exact-completion-original'),
    );
    await r
      .getByRole('button', { name: 'Return to retained report', exact: true })
      .last()
      .click();
    await expect(original).toBeHidden();
    await r
      .getByRole('button', {
        name: 'Open original completion review',
        exact: true,
      })
      .click();
    await expect(original).toHaveAttribute(
      'data-c17-retained',
      'exact-completion-original',
    );
    await audit(page, r);
  });
