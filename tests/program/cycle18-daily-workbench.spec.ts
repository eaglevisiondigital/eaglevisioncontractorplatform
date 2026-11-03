import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, capture, measure } from './cycle18-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies) {
  test(`one selected job through daily reviews and next job / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Daily contractor workflow');
    const r = page.getByRole('region', {
      name: 'Daily contractor workbench',
      exact: true,
    });
    await expect(
      r.getByRole('region', { name: 'Daily priority actions', exact: true }),
    ).toBeVisible();
    const priorities = r.getByRole('region', {
      name: 'Daily priority actions',
      exact: true,
    });
    await priorities
      .getByRole('button', {
        name: 'Review daily priority sources',
        exact: true,
      })
      .click();
    await expect(priorities).toContainText('available source cards');
    const search = r.getByRole('region', {
      name: 'Shared record search',
      exact: true,
    });
    await search
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    await expect(search).toContainText('4 matching of 4');
    const article = search.locator('article').first();
    const ids = await article.locator('span').allTextContents();
    const job = ids[0],
      version = ids[1];
    await article
      .getByRole('button', { name: /^Open exact record in / })
      .click();
    await expect(r.locator('.daily-workbench-context')).toContainText(job);
    await expect(r.locator('.daily-workbench-context')).toContainText(version);
    const context = await r.locator('.daily-workbench-context').innerText();
    const field = r.getByRole('region', { name: 'Field agenda', exact: true });
    await expect(field).toBeVisible();
    for (const button of await r
      .getByRole('navigation', { name: 'Daily review steps', exact: true })
      .getByRole('button')
      .all())
      expect((await button.boundingBox())!.height).toBeLessThanOrEqual(100);
    await field
      .getByLabel('I confirm this is a local recorded field agenda review.', {
        exact: true,
      })
      .check();
    await field
      .getByRole('button', { name: 'Load recorded field agenda', exact: true })
      .click();
    await expect(
      field.getByRole('region', { name: 'Field workspace', exact: true }),
    ).toBeVisible();
    await field.evaluate((e) =>
      e.setAttribute('data-c18-retained', 'field-once'),
    );
    await field
      .getByRole('button', { name: 'Recorded agenda', exact: true })
      .click();
    await field
      .getByLabel('Search recorded field jobs', { exact: true })
      .fill('no-result-source');
    await expect(field).toContainText('No available jobs match');
    await field
      .getByLabel('Search recorded field jobs', { exact: true })
      .fill('');
    await field
      .getByRole('button', { name: 'Retained job controls', exact: true })
      .click();
    await audit(page, field);
    await capture(page, r, 'daily-field', company.slug, info.project.name);
    await field
      .getByRole('button', {
        name: 'Continue exact job to cost review',
        exact: true,
      })
      .click();
    const finance = r.getByRole('region', {
      name: 'Cost and invoice review',
      exact: true,
    });
    await expect(finance).toBeVisible();
    await finance
      .getByLabel(
        'I confirm the current company and saved cost/invoice sources.',
        { exact: true },
      )
      .check();
    await finance
      .getByRole('button', {
        name: 'Read cost and invoice sources',
        exact: true,
      })
      .click();
    await expect(
      finance.getByRole('navigation', {
        name: 'Cost and invoice breadcrumbs',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      finance.getByText(new RegExp('Job ' + job + ' · saved revision')),
    ).toContainText(version);
    await finance.evaluate((e) =>
      e.setAttribute('data-c18-retained', 'finance-once'),
    );
    const source = finance
      .getByRole('button', { name: /^Inspect exact source:/ })
      .first();
    await source.click();
    await expect(
      finance.getByRole('region', {
        name: 'Inspected cost and invoice source',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, finance);
    await capture(page, r, 'daily-cost', company.slug, info.project.name);
    await finance
      .getByRole('button', { name: 'Continue to invoice review', exact: true })
      .click();
    await expect(
      r
        .getByRole('navigation', { name: 'Daily review steps', exact: true })
        .getByRole('button', { name: /^Invoice preparation review/ }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(finance).toHaveAttribute('data-c18-retained', 'finance-once');
    await expect(
      finance.getByRole('region', {
        name: 'Original invoice requirements',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, finance);
    await capture(page, r, 'daily-invoice', company.slug, info.project.name);
    await finance
      .getByRole('button', {
        name: 'Continue to customer service review',
        exact: true,
      })
      .click();
    const customer = r.getByRole('region', {
      name: 'Service update review',
      exact: true,
    });
    await expect(customer).toBeVisible();
    expect(
      await customer
        .getByRole('combobox', { name: 'Service summary job', exact: true })
        .inputValue(),
    ).toBe(job);
    await customer
      .getByLabel('I confirm this staff-selected summary context.', {
        exact: true,
      })
      .check();
    await customer
      .getByRole('button', { name: 'Review service summary', exact: true })
      .click();
    await expect(customer).toContainText('UNKNOWN');
    await customer
      .getByRole('button', { name: /^Inspect service report / })
      .first()
      .click();
    await expect(
      customer.getByRole('article', {
        name: 'Exact published service report',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, customer);
    await capture(page, r, 'daily-service', company.slug, info.project.name);
    await customer
      .getByRole('button', {
        name: 'Continue to maintenance review',
        exact: true,
      })
      .click();
    const maintenance = r.getByRole('region', {
      name: 'Maintenance agenda',
      exact: true,
    });
    await expect(maintenance).toBeVisible();
    await maintenance
      .getByLabel(
        'I confirm this is local maintenance planning with no permission to send.',
        { exact: true },
      )
      .check();
    await maintenance
      .getByRole('button', {
        name: 'Load upcoming maintenance agenda',
        exact: true,
      })
      .click();
    await expect(maintenance).toContainText('UNVERIFIED');
    await audit(page, maintenance);
    await capture(
      page,
      r,
      'daily-maintenance',
      company.slug,
      info.project.name,
    );
    const steps = r.getByRole('navigation', {
      name: 'Daily review steps',
      exact: true,
    });
    const navigationClicks = await measure(page, async () => {
      await steps.getByRole('button', { name: /^Work orders/ }).click();
      await expect(field).toHaveAttribute('data-c18-retained', 'field-once');
      await steps
        .getByRole('button', { name: /^Advanced task review/ })
        .click();
    });
    const advanced = r.getByRole('region', {
      name: 'Advanced task actions',
      exact: true,
    });
    await expect(advanced).toBeVisible();
    await advanced
      .getByRole('button', { name: 'Open advanced task controls', exact: true })
      .click();
    await expect(
      advanced.getByRole('region', { name: 'Add-on task desk', exact: true }),
    ).toBeVisible();
    await audit(page, advanced);
    await capture(page, r, 'daily-advanced', company.slug, info.project.name);
    await steps.getByRole('button', { name: /^Today’s priorities/ }).click();
    await capture(page, r, 'daily-priorities', company.slug, info.project.name);
    expect(await r.locator('.daily-workbench-context').innerText()).toBe(
      context,
    );
    await r
      .getByRole('button', {
        name: 'Continue to next prepared job',
        exact: true,
      })
      .click();
    await expect(r.locator('.daily-workbench-context')).not.toContainText(job);
    await expect(r.locator('.daily-workbench-context')).toContainText(
      'Issued source',
    );
    await expect(r).toContainText('Next exact prepared job selected');
    expect(navigationClicks).toBe(2);
    writeFileSync(
      `artifacts/cycle18/efficiency-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        trusted_navigation_clicks: navigationClicks,
        initial_exact_job_selections: 1,
        subsequent_job_reselections: 0,
        next_job_clicks: 1,
        retained_field_node: true,
        retained_finance_node: true,
        scope:
          'Local review navigation only; confirmations retained; no timed productivity or business completion claim.',
      }) + '\n',
    );
    await audit(page, r);
  });
}
