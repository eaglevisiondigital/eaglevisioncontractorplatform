import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, measure, audit, capture } from './cycle17-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies)
  test(`measured original field control access / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company, 'guides');
    await nav(page, 'Schedule and work orders');
    const prior = page.getByRole('region', {
      name: 'Daily field guide',
      exact: true,
    });
    await prior
      .getByRole('combobox', { name: 'Daily guide job', exact: true })
      .selectOption({ index: 1 });
    await prior
      .getByLabel('I confirm this is a read-only daily field source review.', {
        exact: true,
      })
      .check();
    await prior
      .getByRole('button', { name: 'Inspect daily field sources', exact: true })
      .click();
    await capture(
      page,
      prior,
      'reference-operating-panels',
      company.slug,
      info.project.name,
    );
    const oldControls = prior.getByRole('region', {
      name: 'Field task continuity',
      exact: true,
    });
    await expect(oldControls).toHaveCount(0);
    const baseline = await measure(page, async () => {
      await prior
        .getByRole('button', {
          name: 'Open original field task controls',
          exact: true,
        })
        .click();
      await expect(oldControls).toBeVisible();
    });
    await page
      .getByLabel('Use retained daily workspaces', { exact: true })
      .check();
    const current = page.getByRole('region', {
      name: 'Field workspace',
      exact: true,
    });
    await current
      .getByRole('combobox', { name: 'Field workspace job', exact: true })
      .selectOption({ index: 1 });
    await current
      .getByLabel('I confirm this is a local field source review.', {
        exact: true,
      })
      .check();
    await current
      .getByRole('button', {
        name: 'Open retained field workspace',
        exact: true,
      })
      .click();
    const actual = await measure(page, async () => {
      await expect(
        current.getByRole('region', {
          name: 'Field task continuity',
          exact: true,
        }),
      ).toBeVisible();
    });
    expect(baseline).toBe(1);
    expect(actual).toBe(0);
    await audit(page, current);
    writeFileSync(
      `artifacts/cycle17/field-access-comparison-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        source: 'ACTUAL_BROWSER_TRUSTED_CLICKS',
        baseline_after_source_read: baseline,
        current_after_source_read: actual,
        scope:
          'Additional clicks to expose original task controls after loading the exact source. Excludes equal setup, job selection and required confirmations. No total-workflow efficiency or operational claim.',
      }) + '\n',
    );
  });
