import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture, measure } from './cycle17-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies)
  test(`retained field workspace / ${company.slug}`, async ({ page }, info) => {
    await start(page, company);
    await nav(page, 'Schedule and work orders');
    const r = page.getByRole('region', {
      name: 'Field workspace',
      exact: true,
    });
    await r
      .getByRole('combobox', { name: 'Field workspace job', exact: true })
      .selectOption({ index: 1 });
    await expect(
      r.getByRole('button', {
        name: 'Open retained field workspace',
        exact: true,
      }),
    ).toBeDisabled();
    await r
      .getByLabel('I confirm this is a local field source review.', {
        exact: true,
      })
      .check();
    await r
      .getByRole('button', {
        name: 'Open retained field workspace',
        exact: true,
      })
      .click();
    const original = r.getByRole('region', {
      name: 'Field task continuity',
      exact: true,
    });
    await expect(original).toBeVisible();
    await expect(
      r.getByRole('heading', {
        name: 'Retained work-order controls',
        exact: true,
      }),
    ).toBeFocused();
    const marker = await original.evaluate((e) => {
      e.setAttribute('data-c17-retained', 'same-original-instance');
      return e.getAttribute('data-c17-retained');
    });
    const selection = original.getByRole('combobox').first();
    const selected = await selection.inputValue();
    const required = original.getByRole('checkbox').first();
    await required.check();
    const clicks = await measure(page, async () => {
      await r
        .getByRole('button', { name: 'Field source evidence', exact: true })
        .click();
      await expect(original).toBeHidden();
      await expect(
        r.getByRole('navigation', {
          name: 'Exact field record context',
          exact: true,
        }),
      ).toContainText(company.id);
      await r
        .getByRole('button', {
          name: 'Return to retained work-order controls',
          exact: true,
        })
        .first()
        .click();
    });
    await expect(original).toBeVisible();
    await expect(required).toBeChecked();
    expect(await selection.inputValue()).toBe(selected);
    await expect(original).toHaveAttribute('data-c17-retained', marker!);
    await r
      .getByRole('button', { name: 'Field source evidence', exact: true })
      .click();
    const report = r
      .getByRole('button', { name: /^Inspect field report / })
      .first();
    await expect(report).toBeVisible();
    await report.click();
    await expect(
      r.locator('[aria-label="Exact field published report"]'),
    ).toContainText('Physical completion UNVERIFIED');
    await audit(page, r);
    await capture(
      page,
      r,
      'current-operating-panels',
      company.slug,
      info.project.name,
    );
    await r
      .getByRole('button', { name: 'Operational readiness gaps', exact: true })
      .click();
    await expect(r).toContainText('operational ready: false');
    await audit(page, r);
    writeFileSync(
      `artifacts/cycle17/field-efficiency-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        trusted_navigation_clicks: clicks,
        job_reselections_after_source_read: 0,
        original_controls_additional_open_clicks: 0,
        retained_original_node: true,
        boundary:
          'Source evidence and return only; excludes environment preparation, initial job choice and required confirmation. No operational or durability acceptance.',
      }) + '\n',
    );
  });
