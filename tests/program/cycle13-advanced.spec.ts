import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit } from './cycle13-browser-helpers';
for (const company of sampleCompanies)
  test(`advanced exact references retain original controls / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Advanced review desk');
    const r = page.getByRole('region', {
      name: 'Advanced review desk',
      exact: true,
    });
    await expect(
      r
        .getByRole('combobox', { name: 'Advanced review mode', exact: true })
        .locator('option'),
    ).toHaveCount(7);
    await r
      .getByRole('button', { name: 'Explore advanced sources', exact: true })
      .click();
    await expect(r).toContainText('4 matching source records');
    await r
      .getByLabel('Search advanced sources', { exact: true })
      .fill('unmatched-exact-literal');
    await r
      .getByRole('button', { name: 'Explore advanced sources', exact: true })
      .click();
    await expect(r).toContainText('No matching available advanced sources');
    await r.getByLabel('Search advanced sources', { exact: true }).fill('');
    await r
      .getByRole('button', { name: 'Explore advanced sources', exact: true })
      .click();
    await r
      .getByRole('button', { name: /^Inspect advanced source / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Exact advanced source:/ }),
    ).toBeFocused();
    await r
      .getByRole('button', { name: /^Inspect recorded reference / })
      .first()
      .click();
    await expect(
      r.getByRole('heading', { name: /^Exact recorded reference:/ }),
    ).toBeFocused();
    await expect(r).toContainText('Voice recognition is NONE');
    await audit(page, r);
    await r.screenshot({
      path: `artifacts/cycle13/advanced-${info.project.name}-${company.slug}.png`,
    });
    await r
      .getByRole('button', { name: 'Open original C12 control', exact: true })
      .click();
    await expect(
      r.getByRole('region', {
        name: 'Original advanced proposal review',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      r.getByRole('heading', {
        name: 'Original proposal review controls',
        exact: true,
      }),
    ).toBeFocused();
    await audit(page, r);
  });
