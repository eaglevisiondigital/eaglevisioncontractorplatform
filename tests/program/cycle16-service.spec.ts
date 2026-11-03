import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle16-browser-helpers';
for (const company of sampleCompanies)
  test(`service completion review / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Service source continuity');
    const r = page.getByRole('region', {
      name: 'Service completion guide',
      exact: true,
    });
    await expect(
      r.getByRole('combobox', {
        name: 'Service request and review job',
        exact: true,
      }),
    ).toBeVisible();
    await r
      .getByRole('textbox', { name: 'Search service requests', exact: true })
      .fill('absent-service-record');
    await expect(r).toContainText('0 matching');
    await r
      .getByRole('textbox', { name: 'Search service requests', exact: true })
      .fill('');
    await r
      .getByRole('combobox', {
        name: 'Service request and review job',
        exact: true,
      })
      .selectOption({ index: 1 });
    await r
      .getByLabel(
        'I confirm this exact job as staff-selected review context.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', {
        name: 'Open service completion context',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Completion requirements (UNKNOWN)',
        exact: true,
      }),
    ).toBeVisible();
    await r
      .getByRole('button', { name: /^Review exact published report / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Exact report and completion review/ }),
    ).toBeFocused();
    const finding = r
      .getByRole('button', { name: /^Inspect exact service finding / })
      .first();
    if (await finding.count()) await finding.click();
    await audit(page, r);
    await capture(
      page,
      r,
      'service-completion-evidence',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', { name: 'Return to service requests', exact: true })
      .click();
    await r
      .getByRole('button', {
        name: 'Resume retained completion review',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Completion requirements (UNKNOWN)',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, r);
  });
