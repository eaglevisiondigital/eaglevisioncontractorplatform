import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle13-browser-helpers';
for (const company of sampleCompanies)
  test(`actual service and Passport source continuity / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Service and Passport');
    const r = page.getByRole('region', {
      name: 'Service and Passport desk',
      exact: true,
    });
    await r
      .getByRole('button', { name: 'Explore service evidence', exact: true })
      .click();
    await expect(
      r.getByRole('heading', { name: 'Service selection', exact: true }),
    ).toBeVisible();
    await expect(r).toContainText('4 matching jobs');
    await r
      .getByLabel('Search service evidence', { exact: true })
      .fill('absent-literal-source');
    await r
      .getByRole('button', { name: 'Explore service evidence', exact: true })
      .click();
    await expect(r).toContainText('No matching available service sources');
    await r.getByLabel('Search service evidence', { exact: true }).fill('');
    await r
      .getByRole('button', { name: 'Explore service evidence', exact: true })
      .click();
    await r
      .getByRole('button', { name: /^Open service source / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Service source:/ }),
    ).toBeFocused();
    await r
      .getByRole('button', { name: /^Inspect report / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Published report / }),
    ).toBeFocused();
    await r
      .getByRole('button', { name: /^Inspect finding / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Exact published finding / }),
    ).toBeFocused();
    await expect(r).toContainText('Physical completion remains UNKNOWN');
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle13/customer-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', { name: 'Back to service selection', exact: true })
      .click();
    await expect(
      r.getByRole('heading', { name: 'Service selection', exact: true }),
    ).toBeFocused();
    await expect(r).toContainText('3 sources inspected in this tab');
    await r
      .getByRole('button', { name: /^Open service source / })
      .first()
      .click();
    await r
      .getByRole('button', { name: /^Inspect report / })
      .first()
      .click();
    await r.getByRole('button', { name: /^Open existing job / }).click();
    await expect(
      page.getByRole('heading', { name: 'Exact selected job', exact: true }),
    ).toBeFocused();
    await audit(
      page,
      page.getByRole('region', { name: 'Current operating desk', exact: true }),
    );
  });
