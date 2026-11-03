import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle17-browser-helpers';
for (const company of sampleCompanies)
  test(`retained financial case / ${company.slug}`, async ({ page }, info) => {
    await start(page, company);
    await nav(page, 'Financial source continuity');
    const r = page.getByRole('region', {
      name: 'Finance case desk',
      exact: true,
    });
    await r
      .getByLabel(
        'I confirm the current company and saved financial sources.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', { name: 'Read finance case desk', exact: true })
      .click();
    await r
      .getByRole('button', { name: /^Review job case for / })
      .first()
      .click();
    await expect(
      r.getByRole('navigation', {
        name: 'Retained financial breadcrumbs',
        exact: true,
      }),
    ).toBeVisible();
    const source = r
      .getByRole('button', { name: /^Inspect exact source: financial / })
      .first();
    await expect(source).toBeVisible();
    await source.click();
    await expect(
      r.getByRole('region', { name: 'Exact financial evidence', exact: true }),
    ).toBeVisible();
    await audit(page, r);
    await capture(
      page,
      r,
      'finance-case-desk',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Open original finance controls',
        exact: true,
      })
      .click();
    const original = r.getByRole('region', {
      name: 'Financial exception review path',
      exact: true,
    });
    await expect(original).toBeVisible();
    await original.evaluate((e) =>
      e.setAttribute('data-c17-retained', 'finance-original'),
    );
    await r
      .getByRole('button', { name: 'Return to finance case desk', exact: true })
      .click();
    await expect(original).toBeHidden();
    await r
      .getByRole('button', {
        name: 'Open original finance controls',
        exact: true,
      })
      .click();
    await expect(original).toHaveAttribute(
      'data-c17-retained',
      'finance-original',
    );
    await expect(original).toBeVisible();
    await audit(page, r);
  });
