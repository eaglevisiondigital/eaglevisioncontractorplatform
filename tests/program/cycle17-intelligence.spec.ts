import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture, measure } from './cycle17-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies)
  test(`source verified owner next review / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Verified Copilot handoff');
    const r = page.getByRole('region', {
      name: 'Owner action desk',
      exact: true,
    });
    await r
      .getByLabel(
        'I confirm the current company, review day and saved operating sources.',
        { exact: true },
      )
      .check();
    await r
      .getByRole('button', { name: 'Read owner action desk', exact: true })
      .click();
    const query = r.getByRole('textbox', {
      name: 'Search owner priorities',
      exact: true,
    });
    await query.fill('no-such-priority');
    await expect(r).toContainText('No available source matches');
    await query.fill('');
    await audit(page, r);
    const clicks = await measure(page, async () => {
      await r
        .getByRole('button', { name: /^Review next action: owner task / })
        .first()
        .click();
    });
    const detail = r.getByRole('region', {
      name: 'Inspected owner next review',
      exact: true,
    });
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole('heading', {
        name: 'Why this review appears here',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      detail.getByRole('navigation', {
        name: 'Retained owner task breadcrumbs',
        exact: true,
      }),
    ).toBeVisible();
    const expiry = await detail
      .locator('dd')
      .filter({ hasText: /T.*Z/ })
      .last()
      .innerText();
    await audit(page, r);
    await capture(
      page,
      r,
      'owner-action-desk',
      company.slug,
      info.project.name,
    );
    await detail
      .getByRole('button', { name: 'Return to owner action desk', exact: true })
      .click();
    await expect(query).toHaveValue('');
    await r
      .getByRole('button', { name: /^Review next action: owner task / })
      .first()
      .click();
    await expect(detail).toContainText(expiry);
    writeFileSync(
      `artifacts/cycle17/owner-efficiency-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        trusted_clicks_to_inspect_original_source_and_destination: clicks,
        job_reselections: 0,
        unchanged_original_deadline: expiry,
        scope:
          'One existing owner task inspection, excluding source environment/confirmation. Suggestions never actions.',
      }) + '\n',
    );
    await page
      .getByText('Disposable development controls', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(sampleCompanies.find((c) => c.id !== company.id)!.id);
    await expect(r).toHaveCount(0);
  });
