import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture, measure } from './cycle16-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies)
  test(`shared exact record search / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Schedule and work orders');
    const r = page.getByRole('region', {
      name: 'Shared record search',
      exact: true,
    });
    await r
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    await r
      .getByRole('textbox', {
        name: 'Search available customer, property, job or estimate',
        exact: true,
      })
      .fill('no-record-is-present');
    await r
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    await expect(r).toContainText('0 matching');
    await r
      .getByRole('button', { name: 'Clear shared search', exact: true })
      .click();
    await r
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    await expect(r).toContainText('4 matching');
    await r
      .getByRole('button', { name: 'Next shared page', exact: true })
      .click();
    await expect(r).toContainText('page 2');
    await r
      .getByRole('combobox', {
        name: 'Original review destination',
        exact: true,
      })
      .selectOption('finance');
    await audit(page, r);
    await capture(
      page,
      r,
      'shared-record-search',
      company.slug,
      info.project.name,
    );
    const exactJob = (await r.locator('article').first().innerText()).match(
      /Exact job (\S+)/,
    )![1];
    const clicks = await measure(page, async () => {
      await r
        .getByRole('button', {
          name: 'Open exact record in Financial review',
          exact: true,
        })
        .first()
        .click();
    });
    await nav(page, 'Financial source continuity');
    const finance = page.getByRole('region', {
      name: 'Daily financial guide',
      exact: true,
    });
    await finance
      .getByLabel(
        'I confirm the current company and saved financial sources.',
        { exact: true },
      )
      .check();
    await finance
      .getByRole('button', {
        name: 'Read daily financial sources',
        exact: true,
      })
      .click();
    await expect(
      finance.getByRole('combobox', {
        name: 'Exact financial job',
        exact: true,
      }),
    ).toHaveValue(exactJob);
    await expect(
      finance.getByRole('combobox', {
        name: 'Exact financial job',
        exact: true,
      }),
    ).toBeDisabled();
    writeFileSync(
      `artifacts/cycle16/search-clicks-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        clicks,
        includes:
          'exact source revalidation and original job/section navigation; excludes query, destination choice and environment setup',
        authority: false,
      }) + '\n',
    );
    await page
      .getByText('Disposable development controls', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(sampleCompanies.find((c) => c.id !== company.id)!.id);
    await expect(
      page.getByRole('region', { name: 'Shared operating environment' }),
    ).toHaveCount(0);
    await expect(finance).toHaveCount(0);
  });
