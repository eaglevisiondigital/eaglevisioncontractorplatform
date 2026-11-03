import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle16-browser-helpers';
for (const company of sampleCompanies)
  test(`owner source briefing / ${company.slug}`, async ({ page }, info) => {
    await start(page, company);
    await nav(page, 'Verified Copilot handoff');
    const r = page.getByRole('region', {
      name: 'Owner briefing guide',
      exact: true,
    });
    await expect(
      r.getByRole('button', {
        name: 'Read owner briefing sources',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel('I confirm the current company, review day and sources.', {
        exact: true,
      })
      .check();
    await r
      .getByRole('button', { name: 'Read owner briefing sources', exact: true })
      .click();
    await expect(
      r.getByRole('textbox', {
        name: 'Search owner briefing evidence',
        exact: true,
      }),
    ).toBeVisible();
    await r
      .getByRole('textbox', {
        name: 'Search owner briefing evidence',
        exact: true,
      })
      .fill('absent-owner-task');
    await expect(r).toContainText('0 matching');
    await r
      .getByRole('textbox', {
        name: 'Search owner briefing evidence',
        exact: true,
      })
      .fill('');
    await r
      .getByRole('button', { name: /^Inspect owner task source:/ })
      .first()
      .click();
    await r
      .getByRole('button', {
        name: 'Inspect original workflow destination',
        exact: true,
      })
      .click();
    await audit(page, r);
    await capture(
      page,
      r,
      'owner-briefing-source',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', { name: 'Return to owner briefing', exact: true })
      .click();
    await r
      .getByRole('button', { name: 'Resume selected task review', exact: true })
      .click();
    await expect(
      r.getByRole('button', {
        name: 'Open original workflow review',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, r);
  });
