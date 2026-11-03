import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle16-browser-helpers';
for (const company of sampleCompanies)
  test(`advanced source readiness / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Source-bound advanced workflows');
    const r = page.getByRole('region', {
      name: 'Add-on readiness guide',
      exact: true,
    });
    await r
      .getByRole('combobox', { name: 'Add-on source job', exact: true })
      .selectOption({ index: 1 });
    const modes = await r
      .getByRole('combobox', { name: 'Add-on source mode', exact: true })
      .locator('option')
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      );
    expect(modes).toHaveLength(7);
    const mode =
      modes[
        (sampleCompanies.indexOf(company) * 3 +
          ['desktop', 'tablet', 'mobile'].indexOf(info.project.name)) %
          modes.length
      ];
    await r
      .getByRole('combobox', { name: 'Add-on source mode', exact: true })
      .selectOption(mode);
    await r
      .getByRole('button', {
        name: 'Inspect add-on readiness source',
        exact: true,
      })
      .click();
    await expect(
      r.getByRole('textbox', {
        name: 'Search add-on requirements',
        exact: true,
      }),
    ).toBeVisible();
    const reference = r
      .getByRole('button', { name: /^Inspect exact add-on reference / })
      .first();
    if (await reference.count()) await reference.click();
    const original = r.getByRole('region', {
      name: 'Pinned advanced workflow',
      exact: true,
    });
    const label = `Retained-${mode}-${company.slug}`;
    await original
      .getByLabel('Bound review label', { exact: true })
      .fill(label);
    await original
      .getByLabel(
        'I reviewed this exact pinned source and set its fixed local review expiry.',
        { exact: true },
      )
      .check();
    await original
      .getByRole('button', { name: 'Review pinned source', exact: true })
      .click();
    await expect(
      original.getByRole('heading', {
        name: 'Original pinned-source comparison',
        exact: true,
      }),
    ).toBeFocused();
    await audit(page, r);
    await capture(
      page,
      r,
      'addon-readiness-source',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', {
        name: 'Return to add-on source context',
        exact: true,
      })
      .click();
    await r
      .getByRole('button', {
        name: 'Resume retained original add-on review',
        exact: true,
      })
      .click();
    await expect(
      original.getByLabel('Bound review label', { exact: true }),
    ).toHaveValue(label);
    await original
      .getByLabel(
        'I confirm this exact original comparison for the selected local control.',
        { exact: true },
      )
      .check();
    await original
      .getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      })
      .click();
    await expect(
      original.getByRole('heading', {
        name: 'Original pinned handoff evidence',
        exact: true,
      }),
    ).toBeFocused();
    await expect(original).toContainText('operational ready: false');
    await expect(
      original.getByRole('button', {
        name: 'Prepare original pinned handoff',
        exact: true,
      }),
    ).toBeDisabled();
    await audit(page, r);
  });
