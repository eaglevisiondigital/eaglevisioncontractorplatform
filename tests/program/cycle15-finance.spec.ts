import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle15-browser-helpers';
for (const company of sampleCompanies)
  test(`financial exception exact evidence and return / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Financial source continuity');
    const r = page.getByRole('region', {
      name: 'Financial exception review path',
      exact: true,
    });
    await expect(
      r.getByRole('button', {
        name: 'Read financial exception sources',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel('I confirm this company’s current local financial sources.', {
        exact: true,
      })
      .check();
    await r
      .getByRole('button', {
        name: 'Read financial exception sources',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', { name: /^Open financial exception:/ })
      .first()
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Selected financial exception',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText('Missing costs remain UNKNOWN, never zero');
    await expect(r).toContainText('grants no permission to issue');
    const ids = await r.locator('dl').first().textContent();
    const source = r.getByRole('combobox', {
      name: 'Exact linked financial source',
      exact: true,
    });
    await source.selectOption({ index: 1 });
    const selected = await source.inputValue();
    await r
      .getByRole('button', {
        name: 'Inspect linked financial source',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Inspected financial evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(r).toContainText(selected.slice(selected.indexOf(':') + 1));
    await audit(page, r);
    await capture(page, r, 'financial-source', company.slug, info.project.name);
    await r
      .getByRole('button', {
        name: 'Return to selected financial case',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('heading', {
        name: 'Selected financial exception',
        exact: true,
      }),
    ).toBeFocused();
    await expect(source).toHaveValue(selected);
    await expect(r.locator('dl').first()).toHaveText(ids!);
    await r
      .getByLabel('I confirm this company’s current local financial sources.', {
        exact: true,
      })
      .uncheck();
    await expect(
      r.getByRole('heading', {
        name: 'Selected financial exception',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(r).toContainText('UNKNOWN');
    await audit(page, r);
  });
