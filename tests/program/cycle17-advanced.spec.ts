import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture } from './cycle17-browser-helpers';
for (const company of sampleCompanies)
  test(`retained advanced mode and original controls / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company, 'guides');
    await nav(page, 'Source-bound advanced workflows');
    const prior = page.getByRole('region', {
      name: 'Add-on readiness guide',
      exact: true,
    });
    await prior
      .getByRole('combobox', { name: 'Add-on source job', exact: true })
      .selectOption({ index: 1 });
    const modes = await prior
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
    await prior
      .getByRole('combobox', { name: 'Add-on source mode', exact: true })
      .selectOption(mode);
    await prior
      .getByRole('button', {
        name: 'Inspect add-on readiness source',
        exact: true,
      })
      .click();
    await expect(
      prior.getByRole('region', {
        name: 'Pinned advanced workflow',
        exact: true,
      }),
    ).toBeVisible();
    await capture(
      page,
      prior,
      'reference-advanced-panels',
      company.slug,
      info.project.name,
    );
    await page
      .getByLabel('Use retained daily workspaces', { exact: true })
      .check();
    const r = page.getByRole('region', {
      name: 'Add-on task desk',
      exact: true,
    });
    await r
      .getByRole('combobox', { name: 'Task desk job', exact: true })
      .selectOption({ index: 1 });
    await r
      .getByRole('combobox', { name: 'Task desk mode', exact: true })
      .selectOption(mode);
    await r
      .getByRole('button', { name: 'Open retained add-on review', exact: true })
      .click();
    const original = r.getByRole('region', {
      name: 'Pinned advanced workflow',
      exact: true,
    });
    await expect(original).toBeVisible();
    const label = `C17-${mode}-${company.slug}`;
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
    await original.evaluate((e) =>
      e.setAttribute('data-c17-retained', 'advanced-original'),
    );
    await r
      .getByRole('navigation', { name: 'Add-on task breadcrumbs', exact: true })
      .getByRole('button', { name: 'Exact sources', exact: true })
      .click();
    await expect(original).toBeHidden();
    await audit(page, r);
    await capture(
      page,
      r,
      'current-advanced-panels',
      company.slug,
      info.project.name,
    );
    const refs = r.getByRole('button', { name: /^Inspect task source / });
    if (await refs.count()) {
      await refs.first().click();
      await r
        .getByRole('button', {
          name: 'Return to original add-on review',
          exact: true,
        })
        .last()
        .click();
    } else
      await r
        .getByRole('button', {
          name: 'Return to original add-on review',
          exact: true,
        })
        .last()
        .click();
    await expect(original).toBeVisible();
    await expect(original).toHaveAttribute(
      'data-c17-retained',
      'advanced-original',
    );
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
