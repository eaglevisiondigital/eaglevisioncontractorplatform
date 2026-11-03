import { test, expect } from '@playwright/test';
import { sampleCompanies } from '../../src/domain/platform';
import { start, nav, audit, measure } from './cycle17-browser-helpers';
import { writeFileSync } from 'node:fs';
for (const company of sampleCompanies)
  test(`single exact selection across daily modules / ${company.slug}`, async ({
    page,
  }, info) => {
    await start(page, company);
    await nav(page, 'Schedule and work orders');
    const search = page.getByRole('region', {
      name: 'Shared record search',
      exact: true,
    });
    await search
      .getByRole('button', { name: 'Find another record', exact: true })
      .click();
    await search
      .getByRole('button', { name: 'Search shared records', exact: true })
      .click();
    await expect(search).toContainText('4 matching');
    const text = await search.locator('article').first().innerText();
    const job = text.match(/Exact job (\S+)/)![1];
    await search
      .getByRole('combobox', {
        name: 'Original review destination',
        exact: true,
      })
      .selectOption('finance');
    const clicks = await measure(page, async () => {
      await search
        .getByRole('button', {
          name: 'Open exact record in Financial review',
          exact: true,
        })
        .first()
        .click();
    });
    await nav(page, 'Financial source continuity');
    const finance = page.getByRole('region', {
      name: 'Finance case desk',
      exact: true,
    });
    await finance
      .getByLabel(
        'I confirm the current company and saved financial sources.',
        { exact: true },
      )
      .check();
    await finance
      .getByRole('button', { name: 'Read finance case desk', exact: true })
      .click();
    await expect(
      finance.getByRole('heading', { name: /^Retained financial case / }),
    ).toBeVisible();
    await expect(finance).toContainText(`Exact job ${job}`);
    await audit(page, finance);
    await nav(page, 'Service source continuity');
    const service = page.getByRole('region', {
      name: 'Service Passport path',
      exact: true,
    });
    await expect(
      service.getByRole('combobox', {
        name: 'Service request and job',
        exact: true,
      }),
    ).toHaveValue(job);
    await service
      .getByLabel('I confirm this staff-selected service context.', {
        exact: true,
      })
      .check();
    await service
      .getByRole('button', { name: 'Open retained service path', exact: true })
      .click();
    await expect(service).toContainText(job);
    await expect(service).toContainText('Request-to-job relationship UNKNOWN');
    await audit(page, service);
    await nav(page, 'Maintenance planning continuity');
    const maintenance = page.getByRole('region', {
      name: 'Retained maintenance desk',
      exact: true,
    });
    await expect(
      maintenance.getByRole('combobox', {
        name: 'Maintenance desk job',
        exact: true,
      }),
    ).toHaveValue(job);
    await nav(page, 'Source-bound advanced workflows');
    const advanced = page.getByRole('region', {
      name: 'Add-on task desk',
      exact: true,
    });
    await expect(
      advanced.getByRole('combobox', { name: 'Task desk job', exact: true }),
    ).toHaveValue(job);
    await advanced
      .getByRole('button', { name: 'Open retained add-on review', exact: true })
      .click();
    await expect(
      advanced.getByRole('navigation', {
        name: 'Add-on task breadcrumbs',
        exact: true,
      }),
    ).toBeVisible();
    await audit(page, advanced);
    writeFileSync(
      `artifacts/cycle17/cross-module-efficiency-${info.project.name}-${company.slug}.json`,
      JSON.stringify({
        trusted_clicks_opening_exact_search_result: clicks,
        receiving_job_reselection_actions: 0,
        verified_receivers: ['finance', 'service', 'maintenance', 'advanced'],
        job_id: job,
        scope:
          'Exact source-selected context, retaining required independent human confirmations. No new source relationship, contract, dispatch, invoice, payment, consent or delivery inferred.',
      }) + '\n',
    );
    await page
      .getByText('Disposable development controls', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Contractor', exact: true })
      .selectOption(sampleCompanies.find((c) => c.id !== company.id)!.id);
    await expect(
      page.getByRole('region', {
        name: 'Shared operating environment',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(advanced).toHaveCount(0);
  });
