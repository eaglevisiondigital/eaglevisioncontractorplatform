import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle16-browser-helpers';
for (const company of sampleCompanies)
  test(`retention source review / ${company.slug}`, async ({ page }, info) => {
    await start(page, company);
    await nav(page, 'Maintenance planning continuity');
    const r = page.getByRole('region', {
      name: 'Retention review guide',
      exact: true,
    });
    await r
      .getByRole('combobox', { name: 'Retention guide job', exact: true })
      .selectOption({ index: 1 });
    await r
      .getByLabel(
        'I confirm this is a retention source review, with no permission to send.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Inspect retention planning sources',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Captured maintenance and renewal queue',
        exact: true,
      }),
    ).toBeFocused();
    await r
      .getByRole('textbox', {
        name: 'Search captured retention evidence',
        exact: true,
      })
      .fill('absent-retention-record');
    await expect(r).toContainText('0 matching');
    await r
      .getByRole('button', {
        name: 'Reset captured retention filters',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', { name: /^Inspect retention occurrence / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Exact retention occurrence review',
        exact: true,
      }),
    ).toBeFocused();
    await audit(page, r);
    await capture(
      page,
      r,
      'retention-source-review',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', { name: 'Return to retention queue', exact: true })
      .click();
    await r
      .getByRole('button', {
        name: 'Resume retained retention occurrence',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Open original retention planning controls',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('region', { name: 'Maintenance review path', exact: true }),
    ).toBeVisible();
    await audit(page, r);
  });
