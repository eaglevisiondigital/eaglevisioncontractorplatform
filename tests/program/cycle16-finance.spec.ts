import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle16-browser-helpers';
for (const company of sampleCompanies)
  test(`daily financial review / ${company.slug}`, async ({ page }, info) => {
    await start(page, company);
    await nav(page, 'Financial source continuity');
    const r = page.getByRole('region', {
      name: 'Daily financial guide',
      exact: true,
    });
    await expect(
      r.getByRole('button', {
        name: 'Read daily financial sources',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel(
        'I confirm the current company and saved financial sources.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Read daily financial sources',
        exact: true,
      })
      .click();
    await expect(r).toContainText('4 matching');
    await r
      .getByRole('textbox', {
        name: 'Search daily financial evidence',
        exact: true,
      })
      .fill('absent-financial-record');
    await expect(r).toContainText('0 matching');
    await r
      .getByRole('textbox', {
        name: 'Search daily financial evidence',
        exact: true,
      })
      .fill('');
    await r
      .getByRole('button', { name: /^Inspect next financial review:/ })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Selected daily financial review',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('Invoice requirements');
    await audit(page, r);
    await capture(
      page,
      r,
      'finance-daily-review',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Open original financial source path',
        exact: true,
      })
      .click();
    const original = r.getByRole('region', {
      name: 'Financial exception review path',
      exact: true,
    });
    await expect(original).toBeVisible();
    await r
      .getByRole('button', {
        name: 'Return to daily financial guide',
        exact: true,
      })
      .click();
    await expect(original).toBeHidden();
    await r
      .getByRole('button', {
        name: 'Open original financial source path',
        exact: true,
      })
      .click();
    await expect(original).toBeVisible();
    await audit(page, r);
  });
